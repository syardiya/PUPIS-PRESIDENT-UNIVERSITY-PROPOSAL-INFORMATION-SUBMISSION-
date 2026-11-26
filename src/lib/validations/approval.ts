import { z } from "zod";

function stripControlChars(input: string): string {
  return input.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

export const MIN_DECISION_NOTE_LENGTH = 10;
export const MAX_DECISION_NOTE_LENGTH = 2000;

export const approvalActionEnum = z.enum([
  "approve",
  "request_revision",
  "reject",
]);

export type ApprovalActionType = z.infer<typeof approvalActionEnum>;

/**
 * Strict incoming request schema for `POST /api/proposals/[id]/decision`.
 * - Requires non-empty reviewer notes (10..2000 chars) on `request_revision` and `reject`.
 * - Allows optional reviewer notes (up to 2000 chars) on `approve`.
 */
export const approvalDecisionBodySchema = z
  .object({
    action: approvalActionEnum,
    notes: z
      .string()
      .transform((val) => stripControlChars(val).trim())
      .pipe(
        z
          .string()
          .max(
            MAX_DECISION_NOTE_LENGTH,
            `Reviewer notes cannot exceed ${MAX_DECISION_NOTE_LENGTH} characters.`
          )
      )
      .optional(),
    signature_type: z.enum(["drawn", "stamp"]).default("drawn"),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.action === "request_revision" || data.action === "reject") {
      const len = data.notes?.trim().length ?? 0;
      if (len < MIN_DECISION_NOTE_LENGTH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["notes"],
          message:
            data.action === "request_revision"
              ? `Revision instructions are required (minimum ${MIN_DECISION_NOTE_LENGTH} characters) so the submitter knows what to update.`
              : `A clear rejection reason is required (minimum ${MIN_DECISION_NOTE_LENGTH} characters).`,
        });
      }
    }
  });

export type ApprovalDecisionBodyInput = z.infer<
  typeof approvalDecisionBodySchema
>;

/**
 * Server-side eligibility & turn-order validation schema verifying:
 * 1. Proposal is actively in `'pending_ttd'` review state.
 * 2. Caller is an assigned signer on the proposal.
 * 3. Caller's step has `'pending'` status and is the lowest pending `step_order`.
 * 4. When `action === 'approve'`, caller has a saved digital signature in `public.users.signature_url`.
 */
export const signerTurnEligibilitySchema = z
  .object({
    action: approvalActionEnum,
    proposal_status: z.string(),
    is_assigned_signer: z.boolean(),
    signer_status: z.string().nullable(),
    is_lowest_pending_step: z.boolean(),
    has_saved_signature: z.boolean(),
  })
  .strict()
  .superRefine((ctxData, ctx) => {
    if (ctxData.proposal_status !== "pending_ttd") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["proposal_status"],
        message: `This proposal is currently in '${ctxData.proposal_status}' status and is not awaiting TTD decisions.`,
      });
      return;
    }

    if (!ctxData.is_assigned_signer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["is_assigned_signer"],
        message: "You are not an assigned TTD approver on this proposal.",
      });
      return;
    }

    if (ctxData.signer_status !== "pending") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["signer_status"],
        message: `Your approval step is already marked '${ctxData.signer_status}' and cannot be modified.`,
      });
      return;
    }

    if (!ctxData.is_lowest_pending_step) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["is_lowest_pending_step"],
        message:
          "Sequential TTD order enforced: an earlier approver step is still pending.",
      });
      return;
    }

    if (ctxData.action === "approve" && !ctxData.has_saved_signature) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["has_saved_signature"],
        message:
          "You must configure a saved Digital Signature (TTD) on your Profile page before approving and stamping a proposal.",
      });
    }
  });

export const approvalQueueFilterSchema = z
  .enum(["all", "action_required", "upcoming", "completed"])
  .default("action_required");

export type ApprovalQueueFilter = z.infer<typeof approvalQueueFilterSchema>;
