import { z } from "zod";

/**
 * Strict Zero-Trust schema for self-service profile updates.
 * Rejects any attempt to submit `role`, `email`, `id`, or `signature_url`.
 */
export const profileUpdateSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(2, "Full name must be at least 2 characters.")
      .max(120, "Full name cannot exceed 120 characters."),
    organization_unit: z
      .string()
      .trim()
      .max(150, "Organization / unit cannot exceed 150 characters.")
      .nullable()
      .optional()
      .transform((val) => (val && val.length > 0 ? val : null)),
  })
  .strict();

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
