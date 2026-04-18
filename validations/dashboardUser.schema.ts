import { z } from "zod";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ID format");

export const dashboardUserIdParamSchema = z.object({
  userId: objectIdSchema,
});

export const dashboardUserSessionParamsSchema = z.object({
  userId: objectIdSchema,
  sessionId: objectIdSchema,
});

export const resetDashboardUserPasswordBodySchema = z
  .object({
    newPassword: z
      .string()
      .min(6, { message: "New password must be at least 6 characters long" }),
  })
  .strict();
