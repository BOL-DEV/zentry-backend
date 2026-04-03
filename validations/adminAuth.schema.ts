import { z } from "zod";

export const adminLoginSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(1, "Password is required"),
  deviceName: z.string().trim().optional(),
});
