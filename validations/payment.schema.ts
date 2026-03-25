import {z} from "zod"

export const orderIdParamSchema = z.object({
    orderId: z.string().trim().regex(/^[0-9a-fA-F]{24}$/, "Invalid order ID"),
})