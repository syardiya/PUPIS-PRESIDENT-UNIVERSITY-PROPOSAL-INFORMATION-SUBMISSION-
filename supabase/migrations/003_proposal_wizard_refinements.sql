-- ============================================================================
-- PUPIS (President University Proposal Information Submission)
-- Migration: 003_proposal_wizard_refinements.sql
-- Scope: Phase 4 Proposal Wizard Draft Fields, RAB Items, Signer Role Titles,
--        Supporting Attachments Table, & Private `proposal-attachments` Bucket
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. PROPOSAL CODE SEQUENCE & WIZARD COLUMNS ON `public.proposals`
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.proposal_code_seq START WITH 100;

ALTER TABLE public.proposals
  ALTER COLUMN status SET DEFAULT 'draft',
  ALTER COLUMN title SET DEFAULT '',
  ALTER COLUMN organization_name SET DEFAULT '',
  ALTER COLUMN person_in_charge SET DEFAULT '',
  ALTER COLUMN venue SET DEFAULT '',
  ALTER COLUMN event_date SET DEFAULT CURRENT_DATE;

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS activity_type TEXT,
  ADD COLUMN IF NOT EXISTS event_end_date DATE,
  ADD COLUMN IF NOT EXISTS background TEXT,
  ADD COLUMN IF NOT EXISTS objectives TEXT,
  ADD COLUMN IF NOT EXISTS target_audience TEXT,
  ADD COLUMN IF NOT EXISTS budget_items JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'proposals_event_end_date_check'
  ) THEN
    ALTER TABLE public.proposals
      ADD CONSTRAINT proposals_event_end_date_check
      CHECK (event_end_date IS NULL OR event_end_date >= event_date);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'proposals_budget_items_array_check'
  ) THEN
    ALTER TABLE public.proposals
      ADD CONSTRAINT proposals_budget_items_array_check
      CHECK (jsonb_typeof(budget_items) = 'array');
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. SIGNER ROLE TITLE ON `public.proposal_signers` & DRAFT CC CLEANUP POLICY
-- ----------------------------------------------------------------------------
ALTER TABLE public.proposal_signers
  ADD COLUMN IF NOT EXISTS role_title TEXT NOT NULL DEFAULT 'Institutional Approver';

-- Helper: checks whether the proposal is owned by `p_user_id` AND currently editable
CREATE OR REPLACE FUNCTION public.is_proposal_editable_by_submitter(
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
        AND p.status IN ('draft', 'needs_revision')
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.is_proposal_editable_by_submitter(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_proposal_editable_by_submitter(UUID, UUID) TO authenticated, service_role;

-- Allow submitters to remove CC recipients ONLY while editing a draft/revision
-- (CC stakeholders themselves remain strictly read-only).
GRANT DELETE ON public.proposal_cc TO authenticated;

DROP POLICY IF EXISTS proposal_cc_delete_submitter_editable_or_admin ON public.proposal_cc;
CREATE POLICY proposal_cc_delete_submitter_editable_or_admin
  ON public.proposal_cc
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.is_proposal_editable_by_submitter(proposal_id, auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 3. SUPPORTING ATTACHMENTS TABLE (`public.proposal_attachments`) & RLS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proposal_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  attachment_kind TEXT NOT NULL DEFAULT 'supporting',
  version_number INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT proposal_attachments_file_size_check CHECK (
    file_size > 0 AND file_size <= 10485760
  ),
  CONSTRAINT proposal_attachments_kind_check CHECK (
    attachment_kind IN ('primary_proposal_pdf', 'supporting')
  ),
  CONSTRAINT proposal_attachments_version_check CHECK (version_number >= 1)
);

CREATE INDEX IF NOT EXISTS idx_proposal_attachments_proposal_id
  ON public.proposal_attachments(proposal_id, created_at ASC);

ALTER TABLE public.proposal_attachments ENABLE ROW LEVEL SECURITY;
REVOKE UPDATE ON public.proposal_attachments FROM anon, authenticated;

DROP POLICY IF EXISTS proposal_attachments_select_authorized ON public.proposal_attachments;
CREATE POLICY proposal_attachments_select_authorized
  ON public.proposal_attachments
  FOR SELECT
  TO authenticated
  USING (public.can_view_proposal(proposal_id, auth.uid()));

DROP POLICY IF EXISTS proposal_attachments_insert_submitter_editable ON public.proposal_attachments;
CREATE POLICY proposal_attachments_insert_submitter_editable
  ON public.proposal_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      public.is_admin(auth.uid())
      OR public.is_proposal_editable_by_submitter(proposal_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS proposal_attachments_delete_submitter_editable ON public.proposal_attachments;
CREATE POLICY proposal_attachments_delete_submitter_editable
  ON public.proposal_attachments
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.is_proposal_editable_by_submitter(proposal_id, auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 4. PRIVATE BUCKET `proposal-attachments` & STORAGE RLS POLICIES
-- ----------------------------------------------------------------------------
-- Path convention: "<user_id>/<proposal_id>/<timestamp>-<sanitized_filename>"

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'proposal-attachments',
  'proposal-attachments',
  false,
  10485760, -- 10 MB max per supporting attachment
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS storage_proposal_attachments_select ON storage.objects;
CREATE POLICY storage_proposal_attachments_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'proposal-attachments'
    AND public.can_view_proposal(
      public.try_parse_uuid((storage.foldername(name))[2]),
      auth.uid()
    )
  );

DROP POLICY IF EXISTS storage_proposal_attachments_insert ON storage.objects;
CREATE POLICY storage_proposal_attachments_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'proposal-attachments'
    AND public.try_parse_uuid((storage.foldername(name))[1]) = auth.uid()
    AND (
      public.is_admin(auth.uid())
      OR public.is_proposal_editable_by_submitter(
        public.try_parse_uuid((storage.foldername(name))[2]),
        auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS storage_proposal_attachments_delete ON storage.objects;
CREATE POLICY storage_proposal_attachments_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'proposal-attachments'
    AND (
      public.is_admin(auth.uid())
      OR (
        public.try_parse_uuid((storage.foldername(name))[1]) = auth.uid()
        AND public.is_proposal_editable_by_submitter(
          public.try_parse_uuid((storage.foldername(name))[2]),
          auth.uid()
        )
      )
    )
  );

COMMIT;
