import { z } from "zod";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId");

const trimmedOptionalString = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.string().optional(),
);

const positiveIntWithDefault = (defaultValue: number) =>
  z.coerce.number().int().min(1).default(defaultValue);

export const adminTicketsQuerySchema = z.object({
  page: positiveIntWithDefault(1),
  limit: positiveIntWithDefault(10),
  search: trimmedOptionalString.transform((value) => value ?? ""),
  status: z
    .preprocess(
      (value) => (typeof value === "string" ? value.trim() : value),
      z.enum(["valid", "checked-in"]).optional(),
    )
    .transform((value) => value ?? ""),
  eventId: z
    .preprocess(
      (value) => {
        if (typeof value !== "string") return undefined;
        const trimmed = value.trim();
        return trimmed === "" ? undefined : trimmed;
      },
      objectIdSchema.optional(),
    )
    .transform((value) => value ?? ""),
  organizerId: z
    .preprocess(
      (value) => {
        if (typeof value !== "string") return undefined;
        const trimmed = value.trim();
        return trimmed === "" ? undefined : trimmed;
      },
      objectIdSchema.optional(),
    )
    .transform((value) => value ?? ""),
});

export const adminTicketIdParamSchema = z.object({
  ticketId: objectIdSchema,
});
