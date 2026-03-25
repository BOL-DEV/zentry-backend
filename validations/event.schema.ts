import { z } from "zod";

export const createEventSchema = z.object({
  title: z
    .string()
    .trim()
    .min(4, "Title must be at least 4 characters")
    .max(100, "Title must be at most 100 characters"),
  description: z
    .string()
    .trim()
    .max(1000, "Description must be at most 1000 characters"),
  date: z
    .string()
    .refine(
      (date) => !isNaN(Date.parse(date)),
      "Date must be a valid date string",
    ),
  location: z
    .string()
    .trim()
    .max(200, "Location must be at most 200 characters"),
  posterUrl: z.url("Poster URL must be a valid URL"),
  dressCode: z
    .string()
    .trim()
    .max(100, "Dress code must be at most 100 characters"),
  policies: z
    .string()
    .trim()
    .max(1000, "Policies must be at most 1000 characters"),
});

export const organizerSlugParamSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, "Organizer slug is required")
    .regex(/^[a-z0-9-]+$/, "Invalid organizer slug"),
});

export const eventIdParamSchema = z.object({
  eventId: z
    .string()
    .trim()
    .length(24, "Invalid event ID")
    .regex(/^[0-9a-fA-F]+$/, "Invalid event ID"),
});
