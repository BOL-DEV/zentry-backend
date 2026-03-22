import { z } from "zod";

export const createGalleryItemSchema = z.object({
  imageUrl: z.url("Image URL must be a valid URL"),
  caption: z
    .string()
    .trim()
    .max(200, "Caption must be at most 200 characters")
    .optional(),
  altText: z
    .string()
    .trim()
    .max(200, "Alt text must be at most 200 characters")
    .optional(),
  displayOrder: z.number().int().min(0).optional(),
});

