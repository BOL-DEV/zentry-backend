import { z } from "zod";

const bankDetailsSchema = z
  .object({
    bankName: z.string().trim().min(2, "Bank name is required").optional(),
    bankCode: z
      .string()
      .trim()
      .regex(/^\d{3}$/, "Bank code must be 3 digits")
      .optional(),
    accountNumber: z
      .string()
      .trim()
      .regex(/^\d{10}$/, "Account number must be 10 digits")
      .optional(),
    accountName: z
      .string()
      .trim()
      .min(2, "Account name must be at least 2 characters")
      .optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    const payoutFieldsProvided =
      typeof val.bankCode === "string" ||
      typeof val.accountNumber === "string" ||
      typeof val.accountName === "string";

    if (!payoutFieldsProvided) return;

    if (!val.bankCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "bankCode is required when providing bank details",
        path: ["bankCode"],
      });
    }

    if (!val.accountNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "accountNumber is required when providing bank details",
        path: ["accountNumber"],
      });
    }

    if (!val.accountName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "accountName is required when providing bank details",
        path: ["accountName"],
      });
    }
  });

export const adminCreateOrganizerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(4, "Organizer name must be at least 4 characters")
      .max(50, "Organizer name must be less than 50 characters"),

    logoUrl: z.string().trim().url("Logo URL must be a valid URL"),

    bannerUrl: z.string().trim().url("Banner URL must be a valid URL"),

    heroTitle: z
      .string()
      .trim()
      .min(3, "Hero title must be at least 3 characters"),

    heroSubtitle: z
      .string()
      .trim()
      .min(3, "Hero subtitle must be at least 3 characters"),

    about: z.string().trim().min(10, "About must be at least 10 characters"),

    contactEmail: z
      .string()
      .trim()
      .email("Contact email must be valid")
      .transform((v: string) => v.toLowerCase()),

    contactPhone: z
      .string()
      .trim()
      .min(7, "Contact phone must be at least 7 characters"),

    location: z.string().trim().min(2, "Location is required"),

    bankDetails: bankDetailsSchema.optional(),
  })
  .strict();

export const adminUpdateOrganizerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(4, "Organizer name must be at least 4 characters")
      .max(50, "Organizer name must be less than 50 characters")
      .optional(),

    logoUrl: z.string().trim().url("Logo URL must be a valid URL").optional(),

    bannerUrl: z
      .string()
      .trim()
      .url("Banner URL must be a valid URL")
      .optional(),

    heroTitle: z
      .string()
      .trim()
      .min(3, "Hero title must be at least 3 characters")
      .optional(),

    heroSubtitle: z
      .string()
      .trim()
      .min(3, "Hero subtitle must be at least 3 characters")
      .optional(),

    about: z
      .string()
      .trim()
      .min(10, "About must be at least 10 characters")
      .optional(),

    contactEmail: z
      .string()
      .trim()
      .email("Contact email must be valid")
      .transform((v: string) => v.toLowerCase())
      .optional(),

    contactPhone: z
      .string()
      .trim()
      .min(7, "Contact phone must be at least 7 characters")
      .optional(),

    location: z.string().trim().min(2, "Location is required").optional(),

    bankDetails: bankDetailsSchema.optional(),
  })
  .strict();
