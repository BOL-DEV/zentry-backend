import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ID format");

export const staffSessionParamsSchema = z.object({
  staffId: objectIdSchema,
});

export const logoutOneStaffSessionParamsSchema = z.object({
  staffId: objectIdSchema,
  sessionId: objectIdSchema,
});

export const resetStaffPasswordBodySchema = z
  .object({
    newPassword: z
      .string()
      .min(6, { message: "New password must be at least 6 characters long" }),
  })
  .strict();
