-- ============================================================================
-- PUPIS (President University Proposal Information Submission)
-- Migration: 002_user_profile_signature.sql
-- Scope: Phase 3 User Profile Default Signature Path & Safe Storage Cleanup RLS
-- ============================================================================

BEGIN;

-- Store the user's active signature object path in private `user-signatures` bucket
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS signature_url TEXT;

-- Allow users to delete their own previous profile signature object ONLY when it is
-- NOT referenced by any historical signed proposal in `public.proposal_signers`.
DROP POLICY IF EXISTS storage_user_signatures_delete ON storage.objects;
CREATE POLICY storage_user_signatures_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'user-signatures'
    AND (
      public.is_admin(auth.uid())
      OR (
        public.try_parse_uuid((storage.foldername(name))[1]) = auth.uid()
        AND NOT EXISTS (
          SELECT 1
          FROM public.proposal_signers ps
          WHERE ps.signature_storage_path = storage.objects.name
        )
      )
    )
  );

COMMIT;
