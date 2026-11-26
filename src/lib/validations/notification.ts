import { z } from "zod";
import { uuidSchema } from "./proposal";

export const markNotificationsReadSchema = z.union([
  z
    .object({
      mark_all: z.literal(true),
    })
    .strict(),
  z
    .object({
      notification_id: uuidSchema,
    })
    .strict(),
]);

export type MarkNotificationsReadInput = z.infer<
  typeof markNotificationsReadSchema
>;
