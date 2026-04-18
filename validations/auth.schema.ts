import { z } from "zod";

export const loginSchema = z.object({
  email: z.email({ message: "Invalid email address" }),
  password: z
    .string()
    .min(6, { message: "Password must be at least 6 characters long" }),
});

export const createDashboardUserSchema = z.object({
  organizerId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, { message: "Invalid organizerId" }),
  fullName: z.string().trim().min(2, { message: "Full name is required" }),
  email: z.email({ message: "Invalid email address" }),
  password: z
    .string()
    .min(6, { message: "Password must be at least 6 characters long" }),
  role: z.enum(["organizer", "staff"]).default("staff"),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(6, {
        message: "Current password must be at least 6 characters long",
      }),
    newPassword: z
      .string()
      .min(6, { message: "New password must be at least 6 characters long" }),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.currentPassword === val.newPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "New password must be different from current password",
        path: ["newPassword"],
      });
    }
  });