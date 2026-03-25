import { z } from "zod";

export const createTicketTypeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Ticket type name must be at least 2 characters")
    .max(100, "Ticket type name must be at most 100 characters"),

  description: z
    .string()
    .trim()
    .max(300, "Description must be at most 300 characters")
    .optional(),

  price: z.coerce.number().min(0, "Price cannot be negative"),

  quantityAvailable: z.coerce
    .number()
    .int("Available quantity must be a whole number")
    .min(1, "Available quantity must be at least 1"),

  displayOrder: z.coerce
    .number()
    .int("Display order must be a whole number")
    .min(0, "Display order cannot be negative"),
});

export const eventIdParamSchema = z.object({
  eventId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid event ID"),
});
