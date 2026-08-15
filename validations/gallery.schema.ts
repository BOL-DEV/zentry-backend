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
  displayOrder: z.coerce.number().int().min(0).optional(),
});

export const updateGalleryItemSchema = z
  .object({
    imageUrl: z.url("Image URL must be a valid URL").optional(),
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
    displayOrder: z.coerce.number().int().min(0).optional(),
  })
  .strict();

const galleryBulkUpdateItemSchema = z
  .object({
    galleryItemId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid gallery item ID"),
    imageUrl: z.url("Image URL must be a valid URL").optional(),
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
    displayOrder: z.coerce.number().int().min(0).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.imageUrl === undefined &&
      value.caption === undefined &&
      value.altText === undefined &&
      value.displayOrder === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one gallery field must be provided",
        path: ["galleryItemId"],
      });
    }
  });

export const bulkUpdateGalleryItemsSchema = z
  .object({
    items: z
      .array(galleryBulkUpdateItemSchema)
      .min(1, "At least one gallery item update is required")
      .max(100, "You can update at most 100 gallery items at once"),
  })
  .strict();

export const galleryItemIdParamSchema = z.object({
  galleryItemId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid gallery item ID"),
});

export const submitGalleryItemSchema = z.object({
  caption: z
    .string()
    .trim()
    .max(200, "Caption must be at most 200 characters")
    .optional(),
  submittedByName: z
    .string()
    .trim()
    .max(100, "Name must be at most 100 characters")
    .optional(),
});

export const moderateGalleryItemSchema = z.object({
  action: z.enum(["approve", "reject"]),
});

export const bulkCreateGalleryItemsSchema = z.object({
  caption: z
    .string()
    .trim()
    .max(200, "Caption must be at most 200 characters")
    .optional(),
});

