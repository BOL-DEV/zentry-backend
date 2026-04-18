import { z } from "zod";

export const organizerRequestIdParamSchema = z
  .object({
    requestId: z.string().trim(),
  })
  .strict();

export const createOrganizerRequestSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Organizer name is required")
      .max(80, "Organizer name must be less than 80 characters"),
    email: z
      .string()
      .trim()
      .email("Email must be valid")
      .transform((v: string) => v.toLowerCase()),
    phone: z.string().trim().optional().default(""),
    about: z.string().trim().optional().default(""),
    location: z.string().trim().optional().default(""),
    preferredSlug: z.string().trim().optional().default(""),
  })
  .strict();

export const approveOrganizerRequestSchema = z
  .object({
    reviewNote: z.string().trim().optional().default(""),
  })
  .strict();

export const rejectOrganizerRequestSchema = z
  .object({
    reviewNote: z.string().trim().optional().default(""),
  })
  .strict();
