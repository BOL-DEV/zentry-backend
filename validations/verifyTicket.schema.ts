import { z } from "zod";

export const verifyTicketSchema = z.object({
  ticketCode: z.string().trim().nonempty("Ticket code is required").min(6, "Ticket code must be at least 6 characters").max(20, "Ticket code must be at most 20 characters"),
});