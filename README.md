# PUPIS — President University Proposal Information Submission

Production web platform for **President University** student organizations, faculty advisors, and Student Affairs to draft, review, digitally sign (Sequential Digital TTD), revise (`v1 -> v2`), and archive activity proposals with end-to-end Row Level Security (RLS) and immutable audit logging.

## Tech Stack
- **Framework**: Next.js 16 App Router (`cacheComponents: true`, `proxy.ts`, React 19, TypeScript strict mode)
- **Styling & Print**: Tailwind CSS v4 + native `@media print` A4 Proposal & TTD Verification Sheet
- **Validation**: Zod v4 (`.strict()` server-side input validation)
- **Backend & Security**: Supabase Auth (`@student.president.ac.id` & `@president.ac.id` domain whitelist), PostgreSQL + RLS, Private Supabase Storage (`proposal-documents`, `proposal-attachments`, `user-signatures`) served via short-lived Signed URLs

---

## Local Development

1. Install dependencies (Node.js 22 LTS recommended, see `.nvmrc`):
   ```bash
   npm ci
   ```
2. Apply Supabase SQL migrations in order inside the Supabase SQL Editor (or via Supabase CLI):
   1. `supabase/migrations/001_initial_pupis_schema.sql`
   2. `supabase/migrations/002_user_profile_signature.sql`
   3. `supabase/migrations/003_proposal_wizard_refinements.sql`
   4. `supabase/migrations/004_approval_workflow_and_audit.sql`
3. Configure `.env.local` (see `.env.example` / environment variable table below) and start the dev server:
   ```bash
   npm run dev
   ```

---

## Deploying on Render (Node Web Service) + Supabase Checklist

### 1. Render Web Service Settings
- **Service Type**: Web Service (Node)
- **Node Version**: Node `22` (detected automatically from `.nvmrc` / `package.json` `engines`)
- **Build Command**:
  ```bash
  npm ci && npm run build
  ```
- **Start Command**:
  ```bash
  npm run start
  ```
  *(Render automatically injects `PORT`; `next start` binds to `0.0.0.0:$PORT` natively. If deploying via `Dockerfile` instead, `NEXT_OUTPUT_STANDALONE=true` is enabled automatically inside the image builder.)*

### 2. Required Render Environment Variables
Configure these in **Render Dashboard → Service → Environment**:

| Variable | Visibility | Example / Value |
| :--- | :--- | :--- |
| `NODE_ENV` | Server | `production` |
| `NEXT_PUBLIC_SUPABASE_URL` | Public (Build + Runtime) | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (Build + Runtime) | `<supabase-anon-public-key>` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret (Server-Only)** | `<supabase-service-role-secret-key>` *(Never prefix with `NEXT_PUBLIC_`)* |
| `NEXT_PUBLIC_APP_URL` | Public (Build + Runtime) | `https://<your-service>.onrender.com` *(or custom domain)* |
| `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS` | Public (Build + Runtime) | `student.president.ac.id,president.ac.id` |

> **Note**: Because `NEXT_PUBLIC_*` variables are inlined during `next build`, trigger a **Clear build cache & deploy** on Render if you change any `NEXT_PUBLIC_*` value later.

### 3. Supabase Auth URL & Redirect Configuration
In **Supabase Dashboard → Authentication → URL Configuration**:
1. **Site URL**:
   - Set to `https://<your-service>.onrender.com` (or your custom published domain, e.g. `https://pupis.president.ac.id`).
2. **Redirect URLs** (Allowlist):
   - `https://<your-service>.onrender.com/auth/callback`
   - `https://<your-custom-domain>/auth/callback` *(if using a custom domain on Render)*
   - `http://localhost:3000/auth/callback` *(for local development)*
3. **Google OAuth Provider** *(if enabled in Supabase Auth → Providers → Google)*:
   - Ensure Google Cloud Console Authorized Redirect URI points to `https://<project-ref>.supabase.co/auth/v1/callback`.
