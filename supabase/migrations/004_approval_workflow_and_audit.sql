-- ============================================================================
-- PUPIS (President University Proposal Information Submission)
-- Migration: 004_approval_workflow_and_audit.sql
-- Scope: Phase 5 Sequential Approval Turn Guard, Signer Stamping Metadata,
--        Audit Step Metadata, & Immutable Revision Logs Enforcement
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. SIGNER DECISION METADATA ON `public.proposal_signers`
-- ----------------------------------------------------------------------------
ALTER TABLE public.proposal_signers
  ADD COLUMN IF NOT EXISTS decision_note TEXT,
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_code TEXT;

CREATE INDEX IF NOT EXISTS idx_proposal_signers_approver_status
  ON public.proposal_signers(approver_id, status, step_order);

-- ----------------------------------------------------------------------------
-- 2. STEP METADATA & ENGINE-LEVEL IMMUTABILITY ON `public.revision_logs`
-- ----------------------------------------------------------------------------
ALTER TABLE public.revision_logs
  ADD COLUMN IF NOT EXISTS step_order INT,
  ADD COLUMN IF NOT EXISTS role_title TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'revision_logs_step_order_check'
  ) THEN
    ALTER TABLE public.revision_logs
      ADD CONSTRAINT revision_logs_step_order_check
      CHECK (step_order IS NULL OR step_order >= 1);
  END IF;
END $$;

-- Prevent any direct UPDATE on `public.revision_logs` (append-only audit trail)
CREATE OR REPLACE FUNCTION public.prevent_revision_logs_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'revision_logs is an immutable append-only audit trail and cannot be updated.';
END;
$$;

DROP TRIGGER IF EXISTS trg_revision_logs_no_update ON public.revision_logs;
CREATE TRIGGER trg_revision_logs_no_update
  BEFORE UPDATE ON public.revision_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_revision_logs_update();

-- ----------------------------------------------------------------------------
-- 3. SEQUENTIAL ACTIVE TURN HELPER & STRICT SIGNER UPDATE RLS
-- ----------------------------------------------------------------------------
-- Verifies that `p_user_id` is the assigned approver for `p_signer_row_id` AND
-- that `p_step_order` is the lowest pending step on an active `pending_ttd` proposal.
CREATE OR REPLACE FUNCTION public.is_active_turn_signer(
  p_proposal_id UUID,
  p_step_order INT,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_proposal_id IS NULL OR p_step_order IS NULL OR p_user_id IS NULL THEN false
    ELSE (
      EXISTS (
        SELECT 1
        FROM public.proposals p
        WHERE p.id = p_proposal_id
          AND p.status = 'pending_ttd'
      )
      AND p_step_order = (
        SELECT MIN(ps.step_order)
        FROM public.proposal_signers ps
        WHERE ps.proposal_id = p_proposal_id
          AND ps.status = 'pending'
      )
      AND EXISTS (
        SELECT 1
        FROM public.proposal_signers ps
        WHERE ps.proposal_id = p_proposal_id
          AND ps.step_order = p_step_order
          AND ps.approver_id = p_user_id
          AND ps.status = 'pending'
      )
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.is_active_turn_signer(UUID, INT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_turn_signer(UUID, INT, UUID) TO authenticated, service_role;

-- Tighten `proposal_signers` UPDATE policy so approvers can only mutate their row
-- when it is actively their sequential turn (while submitters can still reset
-- non-signed rows when resubmitting a draft/revision).
DROP POLICY IF EXISTS proposal_signers_update_approver_submitter_or_admin ON public.proposal_signers;
CREATE POLICY proposal_signers_update_approver_submitter_or_admin
  ON public.proposal_signers
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.is_active_turn_signer(proposal_id, step_order, auth.uid())
    OR (
      public.is_proposal_editable_by_submitter(proposal_id, auth.uid())
      AND status <> 'signed'
    )
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR (
      approver_id = auth.uid()
      AND status IN ('signed', 'revision_requested', 'rejected')
    )
    OR (
      public.is_proposal_editable_by_submitter(proposal_id, auth.uid())
      AND status = 'pending'
    )
  );

COMMIT;
