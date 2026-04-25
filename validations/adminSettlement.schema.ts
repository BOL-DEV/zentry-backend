import { z } from "zod";

export const settlementBatchIdParamSchema = z.object({
  batchId: z.string().trim().min(1, "batchId is required"),
});

export const adminDailyPayoutQuerySchema = z.object({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be in YYYY-MM-DD format")
    .optional(),
  status: z.enum(["processing", "settled", "all"]).default("processing"),
  organizerId: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{24}$/, "Invalid organizer ID")
    .optional(),
});

export const toggleSettlementBatchSchema = z
  .object({
    settled: z.boolean(),
  })
  .strict();
