import { z } from "zod";
import { isAllowedInstitutionalEmail } from "../auth/domain";

// ============================================================================
// CONSTANTS
// ============================================================================

export const MAX_PROPOSAL_PDF_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_SIGNATURE_PNG_BYTES = 2 * 1024 * 1024; // 2 MB

export const PROPOSAL_PDF_MIME_TYPE = "application/pdf" as const;
export const SIGNATURE_PNG_MIME_TYPE = "image/png" as const;

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PDF_MAGIC_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d] as const; // "%PDF-"
const PNG_MAGIC_HEADER = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
] as const;

// ============================================================================
// SHARED PRIMITIVE SCHEMAS
// ============================================================================

export const uuidSchema = z
  .string()
  .trim()
  .regex(UUID_REGEX, "Invalid UUID format.");

export const institutionalEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine(isAllowedInstitutionalEmail, {
    message:
      "Email must belong to an allowed President University domain (@student.president.ac.id or @president.ac.id).",
  });

export const isoCalendarDateSchema = z
  .string()
  .trim()
  .regex(ISO_DATE_REGEX, "Event date must use YYYY-MM-DD format.")
  .refine(
    (val) => {
      const [yearStr, monthStr, dayStr] = val.split("-");
      const year = Number(yearStr);
      const month = Number(monthStr);
      const day = Number(dayStr);
      const parsed = new Date(Date.UTC(year, month - 1, day));
      return (
        parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day
      );
    },
    { message: "Event date is not a valid calendar date." }
  );

/**
 * Matches `NUMERIC(15, 2) CHECK (total_budget >= 0)` in `public.proposals`.
 */
export const totalBudgetSchema = z
  .number()
  .finite("Total budget must be a finite number.")
  .min(0, "Total budget cannot be negative.")
  .max(9_999_999_999_999.99, "Total budget exceeds maximum NUMERIC(15,2) limit.")
  .refine((val) => Math.round(val * 100) === val * 100 || Number(val.toFixed(2)) === val, {
    message: "Total budget can have at most 2 decimal places.",
  });

// ============================================================================
// 1. PROPOSAL CREATION & DRAFT UPDATE SCHEMAS (`.strict()`)
// ============================================================================

export const proposalSignerItemSchema = z
  .object({
    approver_id: uuidSchema.optional(),
    approver_email: institutionalEmailSchema.optional(),
    role_title: z
      .string()
      .trim()
      .min(2, "Signer role_title must be at least 2 characters.")
      .max(120, "Signer role_title cannot exceed 120 characters."),
    step_order: z
      .number()
      .int("step_order must be an integer.")
      .min(1, "step_order must be >= 1."),
  })
  .strict()
  .refine((item) => Boolean(item.approver_id || item.approver_email), {
    message: "Each signer must specify either approver_id or approver_email.",
    path: ["approver_id"],
  });

export const ccUserRecipientSchema = z.union([
  uuidSchema,
  institutionalEmailSchema,
  z
    .object({
      stakeholder_id: uuidSchema.optional(),
      email: institutionalEmailSchema.optional(),
    })
    .strict()
    .refine((item) => Boolean(item.stakeholder_id || item.email), {
      message: "Each CC recipient must include stakeholder_id or email.",
      path: ["stakeholder_id"],
    }),
]);

function validateSignersSequence(
  signers: z.infer<typeof proposalSignerItemSchema>[],
  ctx: z.RefinementCtx
) {
  const sortedOrders = signers.map((s) => s.step_order).sort((a, b) => a - b);

  for (let i = 0; i < sortedOrders.length; i++) {
    const expected = i + 1;
    if (sortedOrders[i] !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["signers"],
        message: `Signer step_order values must form a sequential chain starting at 1 (1, 2, 3...). Missing or duplicate step ${expected}.`,
      });
      break;
    }
  }

  const seenIdentifiers = new Set<string>();
  signers.forEach((signer, index) => {
    const key = signer.approver_id
      ? `id:${signer.approver_id.toLowerCase()}`
      : `email:${signer.approver_email?.toLowerCase() ?? ""}`;
    if (seenIdentifiers.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["signers", index],
        message: "Duplicate approver detected in signers list.",
      });
    }
    seenIdentifiers.add(key);
  });
}

/**
 * Full schema for formal proposal creation / submission (`pending_ttd` or `v1 -> v2` resubmission).
 */
export const proposalCreateSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Proposal title must be at least 3 characters.")
      .max(200, "Proposal title cannot exceed 200 characters."),
    activity_type: z
      .string()
      .trim()
      .min(2, "Activity type must be at least 2 characters.")
      .max(100, "Activity type cannot exceed 100 characters."),
    organization_name: z
      .string()
      .trim()
      .min(2, "Organization name must be at least 2 characters.")
      .max(150, "Organization name cannot exceed 150 characters.")
      .optional(),
    person_in_charge: z
      .string()
      .trim()
      .min(2, "Person in charge must be at least 2 characters.")
      .max(150, "Person in charge cannot exceed 150 characters.")
      .optional(),
    venue: z
      .string()
      .trim()
      .min(2, "Venue must be at least 2 characters.")
      .max(200, "Venue cannot exceed 200 characters.")
      .optional(),
    event_date: isoCalendarDateSchema,
    total_budget: totalBudgetSchema,
    budget_breakdown: z
      .string()
      .trim()
      .min(5, "Budget breakdown must be at least 5 characters.")
      .max(10_000, "Budget breakdown cannot exceed 10,000 characters.")
      .optional(),
    executive_summary: z
      .string()
      .trim()
      .min(10, "Executive summary must be at least 10 characters.")
      .max(10_000, "Executive summary cannot exceed 10,000 characters.")
      .optional(),
    pdf_storage_path: z
      .string()
      .trim()
      .min(1)
      .max(255, "pdf_storage_path cannot exceed 255 characters.")
      .optional(),
    status: z.enum(["draft", "pending_ttd"]).default("pending_ttd"),
    signers: z
      .array(proposalSignerItemSchema)
      .min(1, "At least one TTD signer is required.")
      .max(10, "Cannot exceed 10 sequential TTD signers."),
    cc_users: z
      .array(ccUserRecipientSchema)
      .max(25, "Cannot exceed 25 CC stakeholders.")
      .default([]),
  })
  .strict()
  .superRefine((data, ctx) => {
    validateSignersSequence(data.signers, ctx);
  });

/**
 * Schema for saving or updating a proposal draft (`status = 'draft'`).
 */
export const proposalDraftUpdateSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Draft title cannot be empty.")
      .max(200, "Proposal title cannot exceed 200 characters.")
      .optional(),
    activity_type: z
      .string()
      .trim()
      .min(1, "Activity type cannot be empty.")
      .max(100, "Activity type cannot exceed 100 characters.")
      .optional(),
    organization_name: z.string().trim().max(150).optional(),
    person_in_charge: z.string().trim().max(150).optional(),
    venue: z.string().trim().max(200).optional(),
    event_date: isoCalendarDateSchema.optional(),
    total_budget: totalBudgetSchema.optional(),
    budget_breakdown: z.string().trim().max(10_000).optional(),
    executive_summary: z.string().trim().max(10_000).optional(),
    pdf_storage_path: z.string().trim().max(255).optional(),
    signers: z.array(proposalSignerItemSchema).max(10).optional(),
    cc_users: z.array(ccUserRecipientSchema).max(25).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.signers && data.signers.length > 0) {
      validateSignersSequence(data.signers, ctx);
    }
  });

export type ProposalCreateInput = z.infer<typeof proposalCreateSchema>;
export type ProposalDraftUpdateInput = z.infer<typeof proposalDraftUpdateSchema>;

// ============================================================================
// 2. SIGNER ACTION SCHEMA (`approve` | `reject` | `request_revision`)
// ============================================================================

export const signerActionSchema = z
  .object({
    action: z.enum(["approve", "reject", "request_revision"]),
    notes: z
      .string()
      .trim()
      .max(2000, "Decision notes cannot exceed 2,000 characters.")
      .optional(),
    signature_type: z.enum(["drawn", "stamp"]).optional(),
    signature_storage_path: z
      .string()
      .trim()
      .min(1)
      .max(255, "signature_storage_path cannot exceed 255 characters.")
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      (data.action === "reject" || data.action === "request_revision") &&
      (!data.notes || data.notes.trim().length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["notes"],
        message: `A mandatory notes explanation is required when action is '${data.action}'.`,
      });
    }

    if (data.action === "approve" && !data.signature_type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["signature_type"],
        message:
          "signature_type ('drawn' or 'stamp') is required when approving a proposal.",
      });
    }
  });

export type SignerActionInput = z.infer<typeof signerActionSchema>;

// ============================================================================
// 3. FILE UPLOAD VALIDATION HELPERS (PDF <= 10MB, PNG <= 2MB, SAFE FILENAMES)
// ============================================================================

export interface FileValidationResult {
  valid: boolean;
  safeFilename?: string;
  error?: string;
}

/**
 * Strips directory traversal sequences, null bytes, and unsafe characters
 * to produce a clean storage object filename.
 */
export function sanitizeStorageFilename(rawFilename: string): string {
  const baseName = rawFilename
    .replace(/[\x00-\x1f\x7f]/g, "")
    .split(/[\\/]/)
    .pop()
    ?.trim();

  if (!baseName) {
    return "document";
  }

  const sanitized = baseName
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^\.+/, "");

  return sanitized.slice(0, 120) || "document";
}

function hasMagicBytes(
  bytes: Uint8Array,
  expectedHeader: readonly number[]
): boolean {
  if (bytes.length < expectedHeader.length) return false;
  for (let i = 0; i < expectedHeader.length; i++) {
    if (bytes[i] !== expectedHeader[i]) return false;
  }
  return true;
}

/**
 * Validates a proposal document upload:
 * - Strictly `application/pdf` MIME type & `.pdf` extension
 * - Non-empty and max 10 MB (`10_485_760` bytes)
 * - Optionally verifies `%PDF-` magic header bytes on the server
 */
export async function validateProposalPdfFile(
  file: File,
  options: { verifyMagicBytes?: boolean } = { verifyMagicBytes: true }
): Promise<FileValidationResult> {
  if (!(file instanceof File)) {
    return { valid: false, error: "Invalid file upload payload." };
  }

  if (file.size <= 0) {
    return { valid: false, error: "Uploaded PDF file cannot be empty." };
  }

  if (file.size > MAX_PROPOSAL_PDF_BYTES) {
    return {
      valid: false,
      error: "Proposal PDF exceeds the maximum allowed size of 10 MB.",
    };
  }

  const safeFilename = sanitizeStorageFilename(file.name);
  if (
    file.type !== PROPOSAL_PDF_MIME_TYPE ||
    !safeFilename.toLowerCase().endsWith(".pdf")
  ) {
    return {
      valid: false,
      error: "Only PDF documents (application/pdf) are accepted for proposals.",
    };
  }

  if (options.verifyMagicBytes !== false) {
    const headerBuffer = await file.slice(0, PDF_MAGIC_HEADER.length).arrayBuffer();
    if (!hasMagicBytes(new Uint8Array(headerBuffer), PDF_MAGIC_HEADER)) {
      return {
        valid: false,
        error: "File content does not match a valid PDF document header.",
      };
    }
  }

  return { valid: true, safeFilename };
}

/**
 * Validates a user digital signature upload:
 * - Strictly `image/png` MIME type & `.png` extension
 * - Non-empty and max 2 MB (`2_097_152` bytes)
 * - Optionally verifies PNG binary magic bytes (`89 50 4E 47 0D 0A 1A 0A`)
 */
export async function validateSignaturePngFile(
  file: File,
  options: { verifyMagicBytes?: boolean } = { verifyMagicBytes: true }
): Promise<FileValidationResult> {
  if (!(file instanceof File)) {
    return { valid: false, error: "Invalid signature image payload." };
  }

  if (file.size <= 0) {
    return { valid: false, error: "Signature PNG file cannot be empty." };
  }

  if (file.size > MAX_SIGNATURE_PNG_BYTES) {
    return {
      valid: false,
      error: "Signature PNG exceeds the maximum allowed size of 2 MB.",
    };
  }

  const safeFilename = sanitizeStorageFilename(file.name);
  if (
    file.type !== SIGNATURE_PNG_MIME_TYPE ||
    !safeFilename.toLowerCase().endsWith(".png")
  ) {
    return {
      valid: false,
      error: "Only PNG images (image/png) are accepted for user signatures.",
    };
  }

  if (options.verifyMagicBytes !== false) {
    const headerBuffer = await file.slice(0, PNG_MAGIC_HEADER.length).arrayBuffer();
    if (!hasMagicBytes(new Uint8Array(headerBuffer), PNG_MAGIC_HEADER)) {
      return {
        valid: false,
        error: "File content does not match a valid PNG image header.",
      };
    }
  }

  return { valid: true, safeFilename };
}
