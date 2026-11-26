-- ============================================================================
-- PUPIS (President University Proposal Information Submission)
-- Migration: 001_initial_pupis_schema.sql
-- Scope: Phase 1 Canonical Database Schema, Triggers, Strict RLS & Storage
-- Aligned with: ERD Week 12 & Product Backlog Sprint 1–2
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONS & UTILITY FUNCTIONS
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Safe UUID parser for Storage folder segment extraction (returns NULL if invalid)
CREATE OR REPLACE FUNCTION public.try_parse_uuid(p_value TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    RETURN NULL;
  END IF;
  RETURN p_value::UUID;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1. CORE TABLES (7 CANONICAL TABLES)
-- ----------------------------------------------------------------------------

-- 1.1 users
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  organization_unit TEXT,
  role TEXT NOT NULL DEFAULT 'student',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT users_email_campus_domain_check CHECK (
    email ~* '^[A-Za-z0-9._%+-]+@(student\.)?president\.ac\.id$'
  ),
  CONSTRAINT users_role_check CHECK (
    role IN ('student', 'staff', 'admin')
  )
);

-- 1.2 proposals
CREATE TABLE IF NOT EXISTS public.proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_code TEXT NOT NULL UNIQUE,
  submitter_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  organization_name TEXT NOT NULL,
  person_in_charge TEXT NOT NULL,
  event_date DATE NOT NULL,
  venue TEXT NOT NULL,
  total_budget NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'pending_ttd',
  current_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT proposals_total_budget_check CHECK (total_budget >= 0),
  CONSTRAINT proposals_status_check CHECK (
    status IN ('draft', 'pending_ttd', 'needs_revision', 'approved', 'rejected')
  ),
  CONSTRAINT proposals_current_version_check CHECK (current_version >= 1)
);

-- 1.3 proposal_versions (child of proposals -> ON DELETE CASCADE)
CREATE TABLE IF NOT EXISTS public.proposal_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  budget_breakdown TEXT NOT NULL,
  executive_summary TEXT NOT NULL,
  pdf_storage_path TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT proposal_versions_version_number_check CHECK (version_number >= 1),
  CONSTRAINT proposal_versions_proposal_version_unique UNIQUE (proposal_id, version_number)
);

-- 1.4 proposal_signers (child of proposals -> ON DELETE CASCADE; approver -> ON DELETE RESTRICT)
CREATE TABLE IF NOT EXISTS public.proposal_signers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  approver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  step_order INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  signature_type TEXT,
  signature_storage_path TEXT,
  signed_on_version INT,
  signed_at TIMESTAMPTZ,

  CONSTRAINT proposal_signers_step_order_check CHECK (step_order >= 1),
  CONSTRAINT proposal_signers_status_check CHECK (
    status IN ('pending', 'signed', 'rejected', 'revision_requested')
  ),
  CONSTRAINT proposal_signers_signature_type_check CHECK (
    signature_type IS NULL OR signature_type IN ('drawn', 'stamp')
  ),
  CONSTRAINT proposal_signers_signed_on_version_check CHECK (
    signed_on_version IS NULL OR signed_on_version >= 1
  ),
  CONSTRAINT proposal_signers_proposal_step_unique UNIQUE (proposal_id, step_order)
);

-- 1.5 proposal_cc (child of proposals -> ON DELETE CASCADE; stakeholder -> ON DELETE RESTRICT)
CREATE TABLE IF NOT EXISTS public.proposal_cc (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  stakeholder_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT proposal_cc_proposal_stakeholder_unique UNIQUE (proposal_id, stakeholder_id)
);

-- 1.6 revision_logs (child of proposals -> ON DELETE CASCADE; actor -> ON DELETE RESTRICT)
CREATE TABLE IF NOT EXISTS public.revision_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  from_version INT,
  to_version INT NOT NULL,
  action_type TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT revision_logs_from_version_check CHECK (
    from_version IS NULL OR from_version >= 1
  ),
  CONSTRAINT revision_logs_to_version_check CHECK (to_version >= 1),
  CONSTRAINT revision_logs_action_type_check CHECK (
    action_type IN ('submitted', 'signed', 'rejected', 'revision_requested', 'resubmitted')
  )
);

-- 1.7 notifications (exception: user_id -> ON DELETE CASCADE; proposal_id -> ON DELETE CASCADE)
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  proposal_id UUID REFERENCES public.proposals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2. INDEXES FOR QUERY & RLS PERFORMANCE
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON public.users(lower(email));

CREATE INDEX IF NOT EXISTS idx_proposals_submitter_id ON public.proposals(submitter_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON public.proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_event_date ON public.proposals(event_date);
CREATE INDEX IF NOT EXISTS idx_proposals_created_at ON public.proposals(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proposal_versions_proposal_id
  ON public.proposal_versions(proposal_id);

CREATE INDEX IF NOT EXISTS idx_proposal_signers_proposal_id
  ON public.proposal_signers(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_signers_approver_id
  ON public.proposal_signers(approver_id);
CREATE INDEX IF NOT EXISTS idx_proposal_signers_proposal_status
  ON public.proposal_signers(proposal_id, status);
CREATE INDEX IF NOT EXISTS idx_proposal_signers_signature_path
  ON public.proposal_signers(signature_storage_path)
  WHERE signature_storage_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_proposal_cc_proposal_id
  ON public.proposal_cc(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_cc_stakeholder_id
  ON public.proposal_cc(stakeholder_id);

CREATE INDEX IF NOT EXISTS idx_revision_logs_proposal_created_at
  ON public.revision_logs(proposal_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_revision_logs_actor_id
  ON public.revision_logs(actor_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_proposal_id
  ON public.notifications(proposal_id);

-- ----------------------------------------------------------------------------
-- 3. TRIGGERS (AUTO UPDATED_AT, AUTH.USERS SYNC, & FIELD INTEGRITY)
-- ----------------------------------------------------------------------------

-- 3.1 Automatic updated_at maintenance on public.proposals
CREATE OR REPLACE FUNCTION public.handle_proposals_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proposals_updated_at ON public.proposals;
CREATE TRIGGER trg_proposals_updated_at
  BEFORE UPDATE ON public.proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_proposals_updated_at();

-- 3.2 Synchronize new auth.users into public.users & reject non-campus emails
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_full_name TEXT;
  v_org_unit TEXT;
  v_role TEXT;
BEGIN
  v_email := lower(btrim(COALESCE(NEW.email, '')));

  IF v_email = '' OR v_email !~* '^[A-Za-z0-9._%+-]+@(student\.)?president\.ac\.id$' THEN
    RAISE EXCEPTION
      'Access denied: PUPIS only accepts @student.president.ac.id or @president.ac.id accounts (received: %)',
      COALESCE(NEW.email, 'NULL');
  END IF;

  -- Derive institutional default role strictly from verified campus email domain
  IF v_email LIKE '%@student.president.ac.id' THEN
    v_role := 'student';
  ELSE
    v_role := 'staff';
  END IF;

  v_full_name := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'name'), ''),
    initcap(replace(split_part(v_email, '@', 1), '.', ' '))
  );

  v_org_unit := NULLIF(btrim(NEW.raw_user_meta_data ->> 'organization_unit'), '');

  INSERT INTO public.users (id, email, full_name, organization_unit, role)
  VALUES (NEW.id, v_email, v_full_name, v_org_unit, v_role)
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    organization_unit = COALESCE(EXCLUDED.organization_unit, public.users.organization_unit);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- 3.3 Enforce that authenticated users can only mutate is_read on notifications
CREATE OR REPLACE FUNCTION public.enforce_notification_is_read_only_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'authenticated' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.proposal_id IS DISTINCT FROM OLD.proposal_id
      OR NEW.title IS DISTINCT FROM OLD.title
      OR NEW.message IS DISTINCT FROM OLD.message
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Only the is_read status of a notification may be updated.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_is_read_only_update ON public.notifications;
CREATE TRIGGER trg_notifications_is_read_only_update
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_notification_is_read_only_update();

-- ----------------------------------------------------------------------------
-- 4. SECURITY DEFINER ACCESS HELPERS (PREVENT RLS CROSS-TABLE RECURSION)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = p_user_id
      AND u.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_proposal_submitter(
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
    ELSE EXISTS (
      SELECT 1
      FROM public.proposals p
      WHERE p.id = p_proposal_id
        AND p.submitter_id = p_user_id
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_proposal_signer(
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
    ELSE EXISTS (
      SELECT 1
      FROM public.proposal_signers ps
      WHERE ps.proposal_id = p_proposal_id
        AND ps.approver_id = p_user_id
    )
  END;
$$;

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
    )
  END;
$$;

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
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.is_admin(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_proposal_submitter(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_proposal_signer(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_proposal(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_signature_object(TEXT, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_proposal_submitter(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_proposal_signer(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_proposal(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_signature_object(TEXT, UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. STRICT ROW LEVEL SECURITY (RLS) ON ALL 7 TABLES
-- ----------------------------------------------------------------------------

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_signers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_cc ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revision_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Enforce append-only / column-level privileges at SQL grant layer as well
REVOKE UPDATE, DELETE ON public.revision_logs FROM anon, authenticated;
REVOKE UPDATE, DELETE ON public.proposal_cc FROM anon, authenticated;
REVOKE DELETE ON public.notifications FROM anon, authenticated;

-- 5.1 users policies
DROP POLICY IF EXISTS users_select_authenticated ON public.users;
CREATE POLICY users_select_authenticated
  ON public.users
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

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
    )
  );

-- 5.2 proposals policies
DROP POLICY IF EXISTS proposals_select_authorized ON public.proposals;
CREATE POLICY proposals_select_authorized
  ON public.proposals
  FOR SELECT
  TO authenticated
  USING (public.can_view_proposal(id, auth.uid()));

DROP POLICY IF EXISTS proposals_insert_submitter_or_admin ON public.proposals;
CREATE POLICY proposals_insert_submitter_or_admin
  ON public.proposals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    submitter_id = auth.uid()
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS proposals_update_submitter_signer_or_admin ON public.proposals;
CREATE POLICY proposals_update_submitter_signer_or_admin
  ON public.proposals
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR (submitter_id = auth.uid() AND status IN ('draft', 'needs_revision'))
    OR (public.is_proposal_signer(id, auth.uid()) AND status = 'pending_ttd')
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR (submitter_id = auth.uid() AND status IN ('draft', 'pending_ttd', 'needs_revision'))
    OR (public.is_proposal_signer(id, auth.uid()) AND status IN ('pending_ttd', 'needs_revision', 'approved', 'rejected'))
  );

DROP POLICY IF EXISTS proposals_delete_draft_or_admin ON public.proposals;
CREATE POLICY proposals_delete_draft_or_admin
  ON public.proposals
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR (submitter_id = auth.uid() AND status = 'draft')
  );

-- 5.3 proposal_versions policies (read by authorized parties; created by submitter/admin)
DROP POLICY IF EXISTS proposal_versions_select_authorized ON public.proposal_versions;
CREATE POLICY proposal_versions_select_authorized
  ON public.proposal_versions
  FOR SELECT
  TO authenticated
  USING (public.can_view_proposal(proposal_id, auth.uid()));

DROP POLICY IF EXISTS proposal_versions_insert_submitter_or_admin ON public.proposal_versions;
CREATE POLICY proposal_versions_insert_submitter_or_admin
  ON public.proposal_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_proposal_submitter(proposal_id, auth.uid())
    OR public.is_admin(auth.uid())
  );

-- 5.4 proposal_signers policies
DROP POLICY IF EXISTS proposal_signers_select_authorized ON public.proposal_signers;
CREATE POLICY proposal_signers_select_authorized
  ON public.proposal_signers
  FOR SELECT
  TO authenticated
  USING (public.can_view_proposal(proposal_id, auth.uid()));

DROP POLICY IF EXISTS proposal_signers_insert_submitter_or_admin ON public.proposal_signers;
CREATE POLICY proposal_signers_insert_submitter_or_admin
  ON public.proposal_signers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_proposal_submitter(proposal_id, auth.uid())
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS proposal_signers_update_approver_submitter_or_admin ON public.proposal_signers;
CREATE POLICY proposal_signers_update_approver_submitter_or_admin
  ON public.proposal_signers
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR approver_id = auth.uid()
    OR (public.is_proposal_submitter(proposal_id, auth.uid()) AND status <> 'signed')
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR approver_id = auth.uid()
    OR (public.is_proposal_submitter(proposal_id, auth.uid()) AND status = 'pending')
  );

DROP POLICY IF EXISTS proposal_signers_delete_draft_or_admin ON public.proposal_signers;
CREATE POLICY proposal_signers_delete_draft_or_admin
  ON public.proposal_signers
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR (
      public.is_proposal_submitter(proposal_id, auth.uid())
      AND status <> 'signed'
    )
  );

-- 5.5 proposal_cc policies (strictly read-only for CC stakeholders; no UPDATE/DELETE policies)
DROP POLICY IF EXISTS proposal_cc_select_authorized ON public.proposal_cc;
CREATE POLICY proposal_cc_select_authorized
  ON public.proposal_cc
  FOR SELECT
  TO authenticated
  USING (public.can_view_proposal(proposal_id, auth.uid()));

DROP POLICY IF EXISTS proposal_cc_insert_submitter_or_admin ON public.proposal_cc;
CREATE POLICY proposal_cc_insert_submitter_or_admin
  ON public.proposal_cc
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_proposal_submitter(proposal_id, auth.uid())
    OR public.is_admin(auth.uid())
  );

-- 5.6 revision_logs policies (strictly append-only: SELECT + INSERT only, NO UPDATE/DELETE)
DROP POLICY IF EXISTS revision_logs_select_authorized ON public.revision_logs;
CREATE POLICY revision_logs_select_authorized
  ON public.revision_logs
  FOR SELECT
  TO authenticated
  USING (public.can_view_proposal(proposal_id, auth.uid()));

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
      OR public.is_admin(auth.uid())
    )
  );

-- 5.7 notifications policies (owner-only read & is_read update)
DROP POLICY IF EXISTS notifications_select_owner ON public.notifications;
CREATE POLICY notifications_select_owner
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_update_owner_is_read ON public.notifications;
CREATE POLICY notifications_update_owner_is_read
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

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
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 6. PRIVATE STORAGE BUCKETS & STORAGE RLS POLICIES
-- ----------------------------------------------------------------------------
-- Path conventions:
--   proposal-documents: "<proposal_id>/v<version_number>_<filename>.pdf"
--   user-signatures:    "<approver_user_id>/<proposal_id_or_sig_id>.png"

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'proposal-documents',
  'proposal-documents',
  false,
  10485760, -- 10 MB max per proposal PDF
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-signatures',
  'user-signatures',
  false,
  2097152, -- 2 MB max per signature image
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 6.1 Storage RLS for 'proposal-documents'
DROP POLICY IF EXISTS storage_proposal_docs_select ON storage.objects;
CREATE POLICY storage_proposal_docs_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'proposal-documents'
    AND public.can_view_proposal(
      public.try_parse_uuid((storage.foldername(name))[1]),
      auth.uid()
    )
  );

DROP POLICY IF EXISTS storage_proposal_docs_insert ON storage.objects;
CREATE POLICY storage_proposal_docs_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'proposal-documents'
    AND (
      public.is_proposal_submitter(
        public.try_parse_uuid((storage.foldername(name))[1]),
        auth.uid()
      )
      OR public.is_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS storage_proposal_docs_delete ON storage.objects;
CREATE POLICY storage_proposal_docs_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'proposal-documents'
    AND public.is_admin(auth.uid())
  );

-- 6.2 Storage RLS for 'user-signatures'
DROP POLICY IF EXISTS storage_user_signatures_select ON storage.objects;
CREATE POLICY storage_user_signatures_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'user-signatures'
    AND (
      public.try_parse_uuid((storage.foldername(name))[1]) = auth.uid()
      OR public.can_view_signature_object(name, auth.uid())
    )
  );

DROP POLICY IF EXISTS storage_user_signatures_insert ON storage.objects;
CREATE POLICY storage_user_signatures_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'user-signatures'
    AND (
      public.try_parse_uuid((storage.foldername(name))[1]) = auth.uid()
      OR public.is_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS storage_user_signatures_delete ON storage.objects;
CREATE POLICY storage_user_signatures_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'user-signatures'
    AND public.is_admin(auth.uid())
  );

COMMIT;
