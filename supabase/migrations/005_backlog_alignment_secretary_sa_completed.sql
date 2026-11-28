-- ============================================================================
-- PUPIS (President University Proposal Information Submission)
-- Migration: 005_backlog_alignment_secretary_sa_completed.sql
-- Scope: Update Backlog Alignment (Tahap 1 — Schema, Constraints, & RLS)
--   * PBI-05: Faculty Secretary functional identification & intake/clarification/forward fields
--             (preserving canonical `users.role` IN ('student', 'staff', 'admin') & blocking direct approve/reject)
--   * PBI-10: Expanded immutable `revision_logs` action_type check & workflow actor insert RLS
--   * PBI-11: `can_view_proposal` & RLS read access for Student Affairs Staff/Admin Monitoring
--   * PBI-12: `completed` proposal status & Student Affairs Final Signature metadata + storage view RLS
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. FUNCTIONAL SUB-ROLE ON `public.users` (PRESERVING `role` CONTRACT)
-- ----------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS functional_role TEXT;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_functional_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_functional_role_check CHECK (
    functional_role IS NULL OR functional_role IN (
      'faculty_secretary',
      'kaprodi',
      'faculty_advisor',
      'student_affairs',
      'organization_rep'
    )
  );

CREATE INDEX IF NOT EXISTS idx_users_functional_role
  ON public.users(functional_role)
  WHERE functional_role IS NOT NULL;

-- Backfill obvious institutional sub-roles safely when `functional_role` is NULL
-- without touching `public.users.role`.
UPDATE public.users
SET functional_role = CASE
  WHEN role = 'staff' AND (
    email ILIKE '%secretary%'
    OR COALESCE(organization_unit, '') ILIKE '%secretary%'
    OR COALESCE(organization_unit, '') ILIKE '%sekretaris%'
  ) THEN 'faculty_secretary'
  WHEN role = 'staff' AND (
    email ILIKE '%student.affairs%'
    OR email ILIKE '%kemahasiswaan%'
    OR COALESCE(organization_unit, '') ILIKE '%student affairs%'
    OR COALESCE(organization_unit, '') ILIKE '%kemahasiswaan%'
  ) THEN 'student_affairs'
  WHEN role = 'staff' AND (
    email ILIKE '%kaprodi%'
    OR email ILIKE '%head.%'
    OR COALESCE(organization_unit, '') ILIKE '%kaprodi%'
    OR COALESCE(organization_unit, '') ILIKE '%head of study program%'
  ) THEN 'kaprodi'
  WHEN role = 'staff' AND (
    email ILIKE '%advisor%'
    OR COALESCE(organization_unit, '') ILIKE '%advisor%'
  ) THEN 'faculty_advisor'
  ELSE functional_role
END
WHERE functional_role IS NULL;

-- ----------------------------------------------------------------------------
-- 2. PROPOSALS COLUMNS & CONSTRAINTS FOR PBI-05, PBI-07, PBI-11, & PBI-12
-- ----------------------------------------------------------------------------
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS secretary_review_status TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS secretary_reviewed_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS secretary_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS secretary_review_note TEXT,
  ADD COLUMN IF NOT EXISTS final_signed_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS final_signature_type TEXT,
  ADD COLUMN IF NOT EXISTS final_signature_path TEXT,
  ADD COLUMN IF NOT EXISTS final_verification_code TEXT,
  ADD COLUMN IF NOT EXISTS final_signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS final_signature_note TEXT;

-- Backfill `submitted_at` on existing non-draft proposals from `proposal_versions`
UPDATE public.proposals p
SET submitted_at = COALESCE(
  (
    SELECT MAX(pv.submitted_at)
    FROM public.proposal_versions pv
    WHERE pv.proposal_id = p.id
  ),
  p.created_at
)
WHERE p.status <> 'draft'
  AND p.submitted_at IS NULL;

-- Expand `proposals_status_check` to include `'completed'` (PBI-12)
ALTER TABLE public.proposals
  DROP CONSTRAINT IF EXISTS proposals_status_check;

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_status_check CHECK (
    status IN (
      'draft',
      'pending_ttd',
      'needs_revision',
      'approved',
      'rejected',
      'completed'
    )
  );

ALTER TABLE public.proposals
  DROP CONSTRAINT IF EXISTS proposals_secretary_review_status_check;

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_secretary_review_status_check CHECK (
    secretary_review_status IN (
      'not_started',
      'pending_review',
      'clarification_needed',
      'forwarded'
    )
  );

ALTER TABLE public.proposals
  DROP CONSTRAINT IF EXISTS proposals_final_signature_type_check;

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_final_signature_type_check CHECK (
    final_signature_type IS NULL OR final_signature_type IN ('drawn', 'stamp')
  );

ALTER TABLE public.proposals
  DROP CONSTRAINT IF EXISTS proposals_completed_requires_final_signature_check;

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_completed_requires_final_signature_check CHECK (
    status <> 'completed'
    OR (final_signed_by IS NOT NULL AND final_signed_at IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_proposals_secretary_review_status
  ON public.proposals(secretary_review_status)
  WHERE status <> 'draft';

CREATE INDEX IF NOT EXISTS idx_proposals_final_signed_by
  ON public.proposals(final_signed_by)
  WHERE final_signed_by IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. IMMUTABLE AUDIT TRAIL (`public.revision_logs`) EXPANSION FOR PBI-10
-- ----------------------------------------------------------------------------
ALTER TABLE public.revision_logs
  DROP CONSTRAINT IF EXISTS revision_logs_action_type_check;

ALTER TABLE public.revision_logs
  ADD CONSTRAINT revision_logs_action_type_check CHECK (
    action_type IN (
      'submitted',
      'signed',
      'rejected',
      'revision_requested',
      'resubmitted',
      'clarification_requested',
      'forwarded',
      'completed'
    )
  );

-- Reinforce append-only immutability: keep REVOKE UPDATE/DELETE and block authenticated DELETE via trigger
REVOKE UPDATE, DELETE ON public.revision_logs FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.prevent_revision_logs_delete_authenticated()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'authenticated' THEN
    RAISE EXCEPTION 'revision_logs is an immutable append-only audit trail and cannot be deleted by users.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_revision_logs_no_delete ON public.revision_logs;
CREATE TRIGGER trg_revision_logs_no_delete
  BEFORE DELETE ON public.revision_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_revision_logs_delete_authenticated();

-- ----------------------------------------------------------------------------
-- 4. SECURITY DEFINER ROLE & ACCESS HELPERS (PBI-05, PBI-11, PBI-12)
-- ----------------------------------------------------------------------------

-- Identifies Faculty Secretary (`role = 'staff'` + `functional_role = 'faculty_secretary'`).
-- Faculty Secretaries can inspect incoming submitted proposals, request clarification,
-- and forward to Kaprodi, but CANNOT directly approve or reject proposals.
CREATE OR REPLACE FUNCTION public.is_faculty_secretary(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = p_user_id
        AND u.role = 'staff'
        AND (
          u.functional_role = 'faculty_secretary'
          OR (
            u.functional_role IS NULL
            AND (
              COALESCE(u.organization_unit, '') ILIKE '%secretary%'
              OR COALESCE(u.organization_unit, '') ILIKE '%sekretaris%'
            )
          )
        )
    )
  END;
$$;

-- Identifies Student Affairs Staff or Admin authorized for centralized monitoring (PBI-11)
-- and Student Affairs Final Signature (PBI-12).
CREATE OR REPLACE FUNCTION public.is_student_affairs(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = p_user_id
        AND (
          u.role = 'admin'
          OR (
            u.role = 'staff'
            AND (
              u.functional_role = 'student_affairs'
              OR (
                u.functional_role IS NULL
                AND (
                  COALESCE(u.organization_unit, '') ILIKE '%student affairs%'
                  OR COALESCE(u.organization_unit, '') ILIKE '%kemahasiswaan%'
                  OR u.email ILIKE '%student.affairs%'
                  OR u.email ILIKE '%kemahasiswaan%'
                )
              )
            )
          )
        )
    )
  END;
$$;

-- Updated `can_view_proposal`:
--   * Preserves private `draft` visibility strictly for `submitter_id` and `admin`.
--   * Grants read visibility on non-draft (`status <> 'draft'`) proposals to
--     Student Affairs Staff/Admin (PBI-11/PBI-12) and Faculty Secretary (PBI-05),
--     in addition to assigned `proposal_signers` and `proposal_cc`.
CREATE OR REPLACE FUNCTION public.can_view_proposal(
  p_proposal_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_proposal_id IS NULL OR p_user_id IS NULL THEN false
    ELSE (
      public.is_admin(p_user_id)
      OR EXISTS (
        SELECT 1
        FROM public.proposals p
        WHERE p.id = p_proposal_id
          AND p.submitter_id = p_user_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.proposal_signers ps
        WHERE ps.proposal_id = p_proposal_id
          AND ps.approver_id = p_user_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.proposal_cc pc
        WHERE pc.proposal_id = p_proposal_id
          AND pc.stakeholder_id = p_user_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.proposals p
        WHERE p.id = p_proposal_id
          AND p.status <> 'draft'
          AND (
            public.is_student_affairs(p_user_id)
            OR public.is_faculty_secretary(p_user_id)
          )
      )
    )
  END;
$$;

-- Updated `can_view_signature_object`: also permits authorized proposal viewers to inspect
-- the Student Affairs Final Signature (`proposals.final_signature_path`) on Completed proposals.
CREATE OR REPLACE FUNCTION public.can_view_signature_object(
  p_object_name TEXT,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_object_name IS NULL OR p_user_id IS NULL THEN false
    ELSE (
      public.is_admin(p_user_id)
      OR EXISTS (
        SELECT 1
        FROM public.proposal_signers ps
        WHERE ps.signature_storage_path = p_object_name
          AND public.can_view_proposal(ps.proposal_id, p_user_id)
      )
      OR EXISTS (
        SELECT 1
        FROM public.proposals p
        WHERE p.final_signature_path = p_object_name
          AND public.can_view_proposal(p.id, p_user_id)
      )
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.is_faculty_secretary(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_student_affairs(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_faculty_secretary(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_student_affairs(UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. UPDATED RLS POLICIES (`users`, `proposals`, `proposal_signers`, `revision_logs`, `notifications`)
-- ----------------------------------------------------------------------------

-- 5.1 Prevent self-escalation of both `role` and `functional_role` on `public.users`
DROP POLICY IF EXISTS users_update_self_or_admin ON public.users;
CREATE POLICY users_update_self_or_admin
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (
    public.is_admin(auth.uid())
    OR (
      id = auth.uid()
      AND role = (SELECT u.role FROM public.users u WHERE u.id = auth.uid())
      AND functional_role IS NOT DISTINCT FROM (
        SELECT u.functional_role FROM public.users u WHERE u.id = auth.uid()
      )
    )
  );

-- 5.2 `public.proposals` UPDATE policy:
--   * Submitter: edit/submit own `draft` or `needs_revision`
--   * Active Signer (excluding Faculty Secretary): transition `pending_ttd` -> `pending_ttd` | `needs_revision` | `approved` | `rejected`
--   * Faculty Secretary (PBI-05): can update secretary review/clarification/forward state on `pending_ttd` / `needs_revision`,
--     strictly CANNOT set status to `approved`, `rejected`, or `completed`
--   * Student Affairs (PBI-12): can finalize `approved` proposals -> `completed`
DROP POLICY IF EXISTS proposals_update_submitter_signer_or_admin ON public.proposals;
CREATE POLICY proposals_update_submitter_signer_or_admin
  ON public.proposals
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR (submitter_id = auth.uid() AND status IN ('draft', 'needs_revision'))
    OR (
      public.is_proposal_signer(id, auth.uid())
      AND NOT public.is_faculty_secretary(auth.uid())
      AND status = 'pending_ttd'
    )
    OR (
      public.is_faculty_secretary(auth.uid())
      AND status IN ('pending_ttd', 'needs_revision')
    )
    OR (
      public.is_student_affairs(auth.uid())
      AND status = 'approved'
    )
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR (
      submitter_id = auth.uid()
      AND status IN ('draft', 'pending_ttd', 'needs_revision')
    )
    OR (
      public.is_proposal_signer(id, auth.uid())
      AND NOT public.is_faculty_secretary(auth.uid())
      AND status IN ('pending_ttd', 'needs_revision', 'approved', 'rejected')
    )
    OR (
      public.is_faculty_secretary(auth.uid())
      AND status IN ('pending_ttd', 'needs_revision')
    )
    OR (
      public.is_student_affairs(auth.uid())
      AND status IN ('approved', 'completed')
    )
  );

-- 5.3 `public.proposal_signers` UPDATE policy:
--   * Explicitly block `is_faculty_secretary` from marking any signer row `'signed'` or `'rejected'` (PBI-05)
DROP POLICY IF EXISTS proposal_signers_update_approver_submitter_or_admin ON public.proposal_signers;
CREATE POLICY proposal_signers_update_approver_submitter_or_admin
  ON public.proposal_signers
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR (
      public.is_active_turn_signer(proposal_id, step_order, auth.uid())
      AND NOT public.is_faculty_secretary(auth.uid())
    )
    OR (
      public.is_proposal_editable_by_submitter(proposal_id, auth.uid())
      AND status <> 'signed'
    )
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR (
      approver_id = auth.uid()
      AND NOT public.is_faculty_secretary(auth.uid())
      AND status IN ('signed', 'revision_requested', 'rejected')
    )
    OR (
      public.is_proposal_editable_by_submitter(proposal_id, auth.uid())
      AND status = 'pending'
    )
  );

-- 5.4 `public.revision_logs` INSERT policy (append-only; allows Faculty Secretary & Student Affairs actors)
DROP POLICY IF EXISTS revision_logs_insert_actor_only ON public.revision_logs;
CREATE POLICY revision_logs_insert_actor_only
  ON public.revision_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND (
      public.is_proposal_submitter(proposal_id, auth.uid())
      OR public.is_proposal_signer(proposal_id, auth.uid())
      OR public.is_faculty_secretary(auth.uid())
      OR public.is_student_affairs(auth.uid())
      OR public.is_admin(auth.uid())
    )
  );

-- 5.5 `public.notifications` INSERT policy (allows Faculty Secretary & Student Affairs workflow notifications)
DROP POLICY IF EXISTS notifications_insert_workflow_actors ON public.notifications;
CREATE POLICY notifications_insert_workflow_actors
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid())
    OR (
      proposal_id IS NOT NULL
      AND (
        public.is_proposal_submitter(proposal_id, auth.uid())
        OR public.is_proposal_signer(proposal_id, auth.uid())
        OR public.is_faculty_secretary(auth.uid())
        OR public.is_student_affairs(auth.uid())
      )
    )
  );

COMMIT;
