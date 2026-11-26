import { z } from "zod";
import { isAllowedInstitutionalEmail } from "../auth/domain";

// ============================================================================
// CONSTANTS
// ============================================================================

export const MAX_PROPOSAL_PDF_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_SIGNATURE_PNG_BYTES = 2 * 1024 * 1024; // 2 MB

export const PROPOSAL_PDF_MIME_TYPE = "application/pdf" as const;
export const SIGNATURE_PNG_MIME_TYPE = "image/png" as const;

export const ALLOWED_SUPPORTING_ATTACHMENT_MIMES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export type AllowedSupportingAttachmentMime =
  (typeof ALLOWED_SUPPORTING_ATTACHMENT_MIMES)[number];

export const ACTIVITY_CATEGORIES = [
  "Academic Seminar / Symposium",
  "Competition / Hackathon",
  "Workshop / Bootcamp",
  "Cultural & Arts Festival",
  "Community Service (CSR)",
  "Leadership & Organizational Training",
  "Sports & Campus Tournament",
  "Other Campus Activity",
] as const;

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PDF_MAGIC_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d] as const; // "%PDF-"
const PNG_MAGIC_HEADER = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
] as const;
const JPEG_MAGIC_HEADER = [0xff, 0xd8, 0xff] as const;
const ZIP_OOXML_MAGIC_HEADER = [0x50, 0x4b, 0x03, 0x04] as const; // PK.. (DOCX/XLSX)

// ============================================================================
// STRING SANITIZATION & SHARED PRIMITIVE SCHEMAS
// ============================================================================

function stripControlChars(input: string): string {
  return input.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

const cleanShortText = (maxLen: number) =>
  z
    .string()
    .transform((v) => stripControlChars(v).trim())
    .pipe(z.string().max(maxLen, `Cannot exceed ${maxLen} characters.`));

const cleanLongText = (maxLen: number) =>
  z
    .string()
    .transform((v) => stripControlChars(v).trim())
    .pipe(z.string().max(maxLen, `Cannot exceed ${maxLen} characters.`));

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

function isValidIsoCalendarDate(val: string): boolean {
  if (!ISO_DATE_REGEX.test(val)) return false;
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
}

export const isoCalendarDateSchema = z
  .string()
  .trim()
  .refine(isValidIsoCalendarDate, {
    message: "Date must use a valid YYYY-MM-DD calendar format.",
  });

export const optionalDraftDateSchema = z
  .union([z.literal(""), isoCalendarDateSchema, z.null()])
  .optional()
  .transform((val) => (val === "" ? null : val));

/**
 * Matches `NUMERIC(15, 2) CHECK (total_budget >= 0)` in `public.proposals`.
 */
export const totalBudgetSchema = z
  .number()
  .finite("Budget amount must be a finite number.")
  .min(0, "Budget amount cannot be negative.")
  .max(9_999_999_999_999.99, "Budget amount exceeds maximum NUMERIC(15,2) limit.")
  .refine(
    (val) =>
      Math.round(val * 100) === val * 100 || Number(val.toFixed(2)) === val,
    {
      message: "Budget amount can have at most 2 decimal places.",
    }
  );

// ============================================================================
// RAB / BUDGET LINE ITEMS SCHEMA (`.strict()`)
// ============================================================================

export const budgetLineItemDraftSchema = z
  .object({
    id: cleanShortText(80),
    category: cleanShortText(100),
    description: cleanShortText(240),
    quantity: z
      .number()
      .finite()
      .min(0, "Quantity cannot be negative.")
      .max(1_000_000, "Quantity exceeds maximum allowed."),
    unit: cleanShortText(40),
    unit_price: totalBudgetSchema,
    subtotal: totalBudgetSchema.optional(),
  })
  .strict();

export const budgetLineItemStrictSchema = z
  .object({
    id: cleanShortText(80).refine((v) => v.length >= 1, {
      message: "Budget line item ID is required.",
    }),
    category: cleanShortText(100).refine((v) => v.length >= 2, {
      message: "Budget item category is required (min 2 characters).",
    }),
    description: cleanShortText(240).refine((v) => v.length >= 2, {
      message: "Budget item description is required (min 2 characters).",
    }),
    quantity: z
      .number()
      .finite()
      .gt(0, "Budget item quantity must be greater than 0.")
      .max(1_000_000, "Quantity exceeds maximum allowed."),
    unit: cleanShortText(40).refine((v) => v.length >= 1, {
      message: "Budget item unit (e.g., pcs, pax, package) is required.",
    }),
    unit_price: totalBudgetSchema,
    subtotal: totalBudgetSchema,
  })
  .strict();

export function computeBudgetItemsGrandTotal(
  items: ReadonlyArray<{ quantity: number; unit_price: number }>
): number {
  const rawTotal = items.reduce((acc, item) => {
    const qty = Number.isFinite(item.quantity) && item.quantity >= 0 ? item.quantity : 0;
    const price =
      Number.isFinite(item.unit_price) && item.unit_price >= 0 ? item.unit_price : 0;
    return acc + Math.round(qty * price * 100) / 100;
  }, 0);

  return Math.round(rawTotal * 100) / 100;
}

// ============================================================================
// ORDERED SIGNERS & CC SCHEMAS (`.strict()`)
// ============================================================================

export const proposalSignerItemSchema = z
  .object({
    approver_id: uuidSchema.optional(),
    approver_email: institutionalEmailSchema.optional(),
    role_title: cleanShortText(120).refine((v) => v.length >= 2, {
      message: "Signer role_title must be at least 2 characters.",
    }),
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

export function validateSignersSequence(
  signers: ReadonlyArray<{
    approver_id?: string;
    approver_email?: string;
    step_order: number;
  }>,
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

// ============================================================================
// 1. DRAFT CREATE & AUTO-SAVE PATCH SCHEMAS (`.strict()`)
// ============================================================================

/**
 * Used by `POST /api/proposals` when initializing a brand-new proposal draft.
 * Allows partial/empty fields while strictly rejecting unknown properties.
 */
export const proposalDraftCreateSchema = z
  .object({
    title: cleanShortText(200).optional(),
    activity_type: cleanShortText(100).nullable().optional(),
    organization_name: cleanShortText(150).optional(),
    person_in_charge: cleanShortText(150).optional(),
    event_date: optionalDraftDateSchema,
    event_end_date: optionalDraftDateSchema,
    venue: cleanShortText(200).optional(),
    background: cleanLongText(10_000).nullable().optional(),
    objectives: cleanLongText(10_000).nullable().optional(),
    target_audience: cleanLongText(4_000).nullable().optional(),
    budget_items: z.array(budgetLineItemDraftSchema).max(100).optional(),
    total_budget: totalBudgetSchema.optional(),
    signers: z.array(proposalSignerItemSchema).max(10).optional(),
    cc_users: z.array(ccUserRecipientSchema).max(25).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.event_date &&
      data.event_end_date &&
      data.event_end_date < data.event_date
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["event_end_date"],
        message: "Event end date cannot be earlier than the event start date.",
      });
    }
    if (data.signers && data.signers.length > 0) {
      validateSignersSequence(data.signers, ctx);
    }
  });

/**
 * Used by `PATCH /api/proposals/[id]` for debounced draft auto-save & revision edits.
 */
export const proposalDraftUpdateSchema = z
  .object({
    title: cleanShortText(200).optional(),
    activity_type: cleanShortText(100).nullable().optional(),
    organization_name: cleanShortText(150).optional(),
    person_in_charge: cleanShortText(150).optional(),
    event_date: optionalDraftDateSchema,
    event_end_date: optionalDraftDateSchema,
    venue: cleanShortText(200).optional(),
    background: cleanLongText(10_000).nullable().optional(),
    objectives: cleanLongText(10_000).nullable().optional(),
    target_audience: cleanLongText(4_000).nullable().optional(),
    budget_breakdown: cleanLongText(10_000).optional(),
    executive_summary: cleanLongText(10_000).optional(),
    pdf_storage_path: cleanShortText(255).optional(),
    budget_items: z.array(budgetLineItemDraftSchema).max(100).optional(),
    total_budget: totalBudgetSchema.optional(),
    signers: z.array(proposalSignerItemSchema).max(10).optional(),
    cc_users: z.array(ccUserRecipientSchema).max(25).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.event_date &&
      data.event_end_date &&
      data.event_end_date < data.event_date
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["event_end_date"],
        message: "Event end date cannot be earlier than the event start date.",
      });
    }
    if (data.signers && data.signers.length > 0) {
      validateSignersSequence(data.signers, ctx);
    }
  });

// ============================================================================
// 2. FINAL PROPOSAL SUBMISSION SCHEMAS (`submit`, `.strict()`)
// ============================================================================

/**
 * Optional request body sent to `POST /api/proposals/[id]/submit`.
 */
export const proposalSubmitBodySchema = z
  .object({
    submission_note: cleanLongText(2_000).optional(),
  })
  .strict();

/**
 * Strictly validates the assembled proposal state right before transitioning
 * from `draft` / `needs_revision` to `pending_ttd` (In Review).
 */
export const proposalFinalSubmissionSchema = z
  .object({
    title: cleanShortText(200).refine((v) => v.length >= 5, {
      message: "Proposal title is required (minimum 5 characters).",
    }),
    activity_type: cleanShortText(100).refine((v) => v.length >= 2, {
      message: "Activity category is required.",
    }),
    organization_name: cleanShortText(150).refine((v) => v.length >= 2, {
      message: "Student organization / unit name is required.",
    }),
    person_in_charge: cleanShortText(150).refine((v) => v.length >= 2, {
      message: "Person in Charge (PIC) name is required.",
    }),
    event_date: isoCalendarDateSchema,
    event_end_date: isoCalendarDateSchema.nullable(),
    venue: cleanShortText(200).refine((v) => v.length >= 2, {
      message: "Event location / venue is required.",
    }),
    background: cleanLongText(10_000).refine((v) => v.length >= 20, {
      message:
        "Background & activity description must be at least 20 characters.",
    }),
    objectives: cleanLongText(10_000).refine((v) => v.length >= 15, {
      message: "Program objectives must be at least 15 characters.",
    }),
    target_audience: cleanLongText(4_000).refine((v) => v.length >= 5, {
      message: "Target audience / participants description is required.",
    }),
    budget_items: z
      .array(budgetLineItemStrictSchema)
      .min(1, "At least one RAB / budget line item is required.")
      .max(100, "Cannot exceed 100 budget line items."),
    total_budget: totalBudgetSchema,
    signers: z
      .array(
        z
          .object({
            approver_id: uuidSchema,
            role_title: cleanShortText(120).refine((v) => v.length >= 2, {
              message: "Signer role title is required.",
            }),
            step_order: z.number().int().min(1),
          })
          .strict()
      )
      .min(1, "At least one institutional TTD approver must be assigned.")
      .max(10, "Cannot exceed 10 sequential TTD approvers."),
    has_submitter_signature: z.literal(true, {
      error:
        "You must save an active digital signature (TTD) on your Profile page before submitting a proposal.",
    }),
    attachments_count: z
      .number()
      .int()
      .min(
        1,
        "Please upload at least one supporting document (e.g., Proposal PDF) before submitting."
      ),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.event_end_date && data.event_end_date < data.event_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["event_end_date"],
        message: "Event end date cannot be earlier than the event start date.",
      });
    }

    validateSignersSequence(data.signers, ctx);

    const expectedTotal = computeBudgetItemsGrandTotal(data.budget_items);
    if (Math.abs(data.total_budget - expectedTotal) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["total_budget"],
        message: `Total budget (${data.total_budget}) does not match the sum of RAB line items (${expectedTotal}).`,
      });
    }
  });

/**
 * Legacy compatibility export (`proposalCreateSchema`) kept strict for callers.
 */
export const proposalCreateSchema = proposalDraftCreateSchema;

export type BudgetLineItemInput = z.infer<typeof budgetLineItemDraftSchema>;
export type ProposalDraftCreateInput = z.infer<typeof proposalDraftCreateSchema>;
export type ProposalCreateInput = ProposalDraftCreateInput;
export type ProposalDraftUpdateInput = z.infer<typeof proposalDraftUpdateSchema>;
export type ProposalFinalSubmissionInput = z.infer<
  typeof proposalFinalSubmissionSchema
>;

// ============================================================================
// 3. SIGNER ACTION SCHEMA (`approve` | `reject` | `request_revision`)
// ============================================================================

export const signerActionSchema = z
  .object({
    action: z.enum(["approve", "reject", "request_revision"]),
    notes: cleanLongText(2000).optional(),
    signature_type: z.enum(["drawn", "stamp"]).optional(),
    signature_storage_path: cleanShortText(255).optional(),
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
// 4. FILE UPLOAD VALIDATION HELPERS (PDF, PNG, JPEG, DOCX/XLSX + MAGIC BYTES)
// ============================================================================

export interface FileValidationResult {
  valid: boolean;
  safeFilename?: string;
  detectedMime?: string;
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
 * Validates supporting proposal attachment uploads:
 * - Allowed types: PDF (`application/pdf`), PNG (`image/png`), JPG/JPEG (`image/jpeg`),
 *   DOCX (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`),
 *   XLSX (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`)
 * - Max file size: 10 MB (`10_485_760` bytes)
 * - Verifies binary magic bytes for PDF, PNG, JPEG, and OOXML ZIP containers.
 */
export async function validateSupportingAttachmentFile(
  file: File
): Promise<FileValidationResult> {
  if (!(file instanceof File)) {
    return { valid: false, error: "Invalid file upload payload." };
  }

  if (file.size <= 0) {
    return { valid: false, error: "Uploaded file cannot be empty." };
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    return {
      valid: false,
      error: "Attachment exceeds the maximum allowed size of 10 MB.",
    };
  }

  const safeFilename = sanitizeStorageFilename(file.name);
  const lowerName = safeFilename.toLowerCase();
  const mime = file.type as AllowedSupportingAttachmentMime;

  if (!ALLOWED_SUPPORTING_ATTACHMENT_MIMES.includes(mime)) {
    return {
      valid: false,
      error:
        "Unsupported file type. Allowed formats: PDF, PNG, JPG/JPEG, DOCX, and XLSX (max 10 MB).",
    };
  }

  const headerBytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());

  if (mime === "application/pdf") {
    if (!lowerName.endsWith(".pdf") || !hasMagicBytes(headerBytes, PDF_MAGIC_HEADER)) {
      return {
        valid: false,
        error: "File does not match a valid PDF document header.",
      };
    }
  } else if (mime === "image/png") {
    if (!lowerName.endsWith(".png") || !hasMagicBytes(headerBytes, PNG_MAGIC_HEADER)) {
      return {
        valid: false,
        error: "File does not match a valid PNG image header.",
      };
    }
  } else if (mime === "image/jpeg") {
    if (
      (!lowerName.endsWith(".jpg") && !lowerName.endsWith(".jpeg")) ||
      !hasMagicBytes(headerBytes, JPEG_MAGIC_HEADER)
    ) {
      return {
        valid: false,
        error: "File does not match a valid JPEG image header.",
      };
    }
  } else if (
    mime ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    if (
      !lowerName.endsWith(".docx") ||
      !hasMagicBytes(headerBytes, ZIP_OOXML_MAGIC_HEADER)
    ) {
      return {
        valid: false,
        error: "File does not match a valid DOCX container.",
      };
    }
  } else if (
    mime ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    if (
      !lowerName.endsWith(".xlsx") ||
      !hasMagicBytes(headerBytes, ZIP_OOXML_MAGIC_HEADER)
    ) {
      return {
        valid: false,
        error: "File does not match a valid XLSX container.",
      };
    }
  }

  return { valid: true, safeFilename, detectedMime: mime };
}

/**
 * Validates a proposal PDF document upload (strictly `application/pdf`, max 10 MB).
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
    const headerBuffer = await file
      .slice(0, PDF_MAGIC_HEADER.length)
      .arrayBuffer();
    if (!hasMagicBytes(new Uint8Array(headerBuffer), PDF_MAGIC_HEADER)) {
      return {
        valid: false,
        error: "File content does not match a valid PDF document header.",
      };
    }
  }

  return { valid: true, safeFilename, detectedMime: PROPOSAL_PDF_MIME_TYPE };
}

/**
 * Validates a user digital signature upload (strictly `image/png`, max 2 MB).
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
    const headerBuffer = await file
      .slice(0, PNG_MAGIC_HEADER.length)
      .arrayBuffer();
    if (!hasMagicBytes(new Uint8Array(headerBuffer), PNG_MAGIC_HEADER)) {
      return {
        valid: false,
        error: "File content does not match a valid PNG image header.",
      };
    }
  }

  return { valid: true, safeFilename, detectedMime: SIGNATURE_PNG_MIME_TYPE };
}
