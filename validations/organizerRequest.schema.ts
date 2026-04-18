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
      .min(4, "Organizer name must be at least 4 characters")
      .max(50, "Organizer name must be less than 50 characters"),
    email: z
      .string()
      .trim()
      .email("Email must be valid")
      .transform((v: string) => v.toLowerCase()),

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

    phone: z
      .string()
      .trim()
      .min(7, "Contact phone must be at least 7 characters"),
    about: z.string().trim().min(10, "About must be at least 10 characters"),
    location: z.string().trim().min(2, "Location is required"),

    bankDetails: bankDetailsSchema.optional(),

    preferredSlug: z
      .string()
      .trim()
      .min(3, "Preferred slug must be at least 3 characters")
      .max(50, "Preferred slug must be less than 50 characters"),
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
