import { z } from "zod";

export const generateEventCopySchema = z.object({
  title: z
    .string()
    .trim()
    .min(4, "Title must be at least 4 characters")
    .max(100, "Title must be at most 100 characters"),
  highlights: z
    .string()
    .trim()
    .max(500, "Highlights must be at most 500 characters")
    .optional(),
  tone: z
    .enum(["professional", "fun", "casual", "formal"])
    .optional()
    .default("professional"),
  location: z
    .string()
    .trim()
    .max(200, "Location must be at most 200 characters")
    .optional(),
});
