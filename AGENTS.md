<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project Context: PUPIS (President University Proposal Information Submission)

You are acting as a Senior Full-Stack & Security Engineer building the backend and integration layer for **PUPIS** using **Next.js (App Router + TypeScript)**, **Zod**, and **Supabase (PostgreSQL, Auth, Private Storage)**.

### Canonical Database Schema (Week 12 ERD + Sprint 2 Backlog Alignment)
Strictly preserve the table names, column names, and cascade rules from `PUPIS_Database_Design_Report.docx` (Week 12), extended only with Sprint 2 Backlog requirements:
1. `users`: `id` (UUID PK linked to `auth.users`), `email` (`@student.president.ac.id` or `@president.ac.id`), `full_name`, `organization_unit`, `role` (`student` | `staff` | `admin`), `created_at`.
2. `proposals`: `id` (UUID PK), `proposal_code` (UNIQUE, e.g. `PU-PROP-2026-001`), `submitter_id` (FK `users.id` ON DELETE RESTRICT), `title`, `organization_name`, `person_in_charge`, `event_date`, `venue`, `total_budget` (`NUMERIC(15,2) >= 0`), `status` (`draft` | `pending_ttd` | `needs_revision` | `approved` | `rejected`), `current_version` (INT DEFAULT 1), `created_at`, `updated_at`.
3. `proposal_versions`: `id` (UUID PK), `proposal_id` (FK `proposals.id` ON DELETE CASCADE), `version_number` (INT >= 1), `budget_breakdown` (TEXT), `executive_summary` (TEXT), `pdf_storage_path` (VARCHAR 255), `submitted_at`.
4. `proposal_signers`: `id` (UUID PK), `proposal_id` (FK `proposals.id` ON DELETE CASCADE), `approver_id` (FK `users.id` ON DELETE RESTRICT), `step_order` (INT >= 1), `status` (`pending` | `signed` | `rejected` | `revision_requested`), `signature_type` (`drawn` | `stamp`), `signature_storage_path`, `signed_on_version`, `signed_at`.
5. `proposal_cc`: `id` (UUID PK), `proposal_id` (FK `proposals.id` ON DELETE CASCADE), `stakeholder_id` (FK `users.id` ON DELETE RESTRICT), `added_at`.
6. `revision_logs`: `id` (UUID PK), `proposal_id` (FK `proposals.id` ON DELETE CASCADE), `actor_id` (FK `users.id` ON DELETE RESTRICT), `from_version`, `to_version`, `action_type` (`submitted` | `signed` | `rejected` | `revision_requested` | `resubmitted`), `note`, `created_at` (append-only immutable audit trail).
7. `notifications` *(Sprint 2 Backlog PBI-08)*: `id` (UUID PK), `user_id` (FK `users.id` ON DELETE CASCADE), `proposal_id` (FK `proposals.id` ON DELETE CASCADE), `title`, `message`, `is_read` (BOOLEAN DEFAULT false), `created_at`.

### Core Business Logic & Backlog Rules (PBI-01 to PBI-10)
- **Draft & Submission (`PBI-02`, `PBI-03`):** Submitters can save proposals as `draft` and edit them before formally submitting (`pending_ttd`). Submissions capture event details, `person_in_charge`, `total_budget`, `budget_breakdown`, `executive_summary`, private PDF upload, ordered TTD approvers (`step_order: 1, 2, 3...`), and read-only CC observers (`stakeholder_id`).
- **Sequential Digital TTD, Reject & Non-Destructive Revisions (`PBI-04` to `PBI-07`):**
  - Only the active approver at the lowest pending `step_order` can act when proposal status is `pending_ttd`.
  - Approvers can **Approve & Sign** (supporting both canvas `drawn` PNG and official `stamp` PNG, recording `signed_on_version`), **Reject** (terminal state `rejected`, mandatory `note`), or **Request Revision** (`needs_revision`, mandatory `note`).
  - On resubmission (`v1 -> v2`), increment `current_version`, insert a new row in `proposal_versions`, preserve prior valid signatures via `signed_on_version`, and route back to the approver who requested changes.
- **In-App Notifications & Immutable Audit Trail (`PBI-08`, `PBI-09`):** Every workflow state transition must insert relevant records into `notifications` and append an immutable entry in `revision_logs` (no UPDATE/DELETE).

### Mandatory Security Standards (Zero Trust & OWASP)
- Resolve user identity strictly from server-side Supabase Auth sessions; never trust `user_id` or `role` sent from client payloads.
- Enforce anti-IDOR authorization checks inside every API Route Handler **and** PostgreSQL Row Level Security (RLS) across all 7 tables and 2 private storage buckets (`proposal-documents`, `user-signatures`).
- Validate all inputs with strict Zod schemas (`.strict()`), validate PDF (max 10MB) and PNG (max 2MB) uploads on the server with safe filenames, never expose `SUPABASE_SERVICE_ROLE_KEY` to client bundles (`NEXT_PUBLIC_*`), and serve private files strictly via short-lived Signed URLs.

### Engineering & Delivery Workflow
- Implement changes incrementally per phase; never bundle unrelated changes into one massive edit.
- Before concluding any phase, verify that `npm run lint` and `npm run build` pass with zero errors.