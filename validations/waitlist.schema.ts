import { z } from "zod";

export const joinWaitlistSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be at most 100 characters"),
  email: z.string().trim().email("A valid email is required"),
  phone: z
    .string()
    .trim()
    .max(30, "Phone must be at most 30 characters")
    .optional(),
});
