import { z } from "zod";

export const orderIdParamSchema = z.object({
  orderId: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid order ID"),
});

export const paymentReferenceParamSchema = z.object({
  paymentReference: z
    .string()
    .trim()
    .min(3, "Invalid payment reference")
    .max(100, "Invalid payment reference"),
});
