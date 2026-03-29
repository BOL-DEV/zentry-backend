import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email({ message: 'Invalid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters long' }),
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