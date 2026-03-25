import { z } from "zod";

const purchaseItemSchema = z.object({
  ticketTypeId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ticket type ID"),

  quantity: z
    .number()
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1"),
});

export const createPurchaseSchema = z
  .object({
    buyerName: z
      .string()
      .trim()
      .min(2, "Buyer name must be at least 2 characters")
      .max(100, "Buyer name must be at most 100 characters"),

    buyerEmail: z
      .email("Buyer email must be a valid email address"),
      
    buyerPhone: z
      .string()
      .trim()
      .regex(
        /^[+]?[0-9]{10,15}$/,
        "Buyer phone number must be a valid phone number",
      )
      .optional(),

    items: z
      .array(purchaseItemSchema)
      .min(1, "At least one item must be purchased"),
  })
  .refine(
    (data) => {
      const ids = data.items.map((item) => item.ticketTypeId);
      return new Set(ids).size === ids.length;
    },
    {
      message: "Duplicate ticket types are not allowed in one purchase",
      path: ["items"],
    },
  );
