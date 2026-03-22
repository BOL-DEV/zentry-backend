import { z } from "zod";

export const createOrganizerSchema = z.object({
  name: z
    .string()
    .trim()
        .min(4, "Organizer name must be at least 4 characters").max(50, "Organizer name must be less than 50 characters"),

  logoUrl: z.string().url("Logo URL must be a valid URL"),

  heroTitle: z
    .string()
    .trim()
    .min(3, "Hero title must be at least 3 characters"),

  heroSubtitle: z
    .string()
    .trim()
    .min(3, "Hero subtitle must be at least 3 characters"),

  about: z.string().trim().min(10, "About must be at least 10 characters"),

  contactEmail: z.email("Contact email must be valid"),

  contactPhone: z
    .string()
    .min(7, "Contact phone must be at least 7 characters"),
});

export const organizerSlugParamSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(4, "Organizer slug must be at least 4 characters")
    .max(50, "Organizer slug must be less than 50 characters")
    .regex(/^[a-z0-9-]+$/, "Invalid organizer slug"),
});

export type CreateOrganizerInput = z.infer<typeof createOrganizerSchema>;
