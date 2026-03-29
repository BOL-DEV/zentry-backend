interface TicketEmailItem {
  ticketCode: string;
  ticketTypeName?: string;
}

interface TicketEmailTemplateOptions {
  buyerName: string;
  eventTitle: string;
  eventDate?: string;
  eventLocation?: string;
  tickets: TicketEmailItem[];
}

export const generateTicketEmailTemplate = ({
  buyerName,
  eventTitle,
  eventDate,
  eventLocation,
  tickets,
}: TicketEmailTemplateOptions) => {
  const ticketsHtml = tickets
    .map(
      (ticket, index) => `
          <div style="padding:12px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:12px;">
            <p style="margin:0 0 8px;"><strong>Ticket ${index + 1}</strong></p>
            ${
              ticket.ticketTypeName
                ? `<p style="margin:0 0 6px;">Type: ${ticket.ticketTypeName}</p>`
                : ""
            }
            <p style="margin:0;">Code: <strong>${ticket.ticketCode}</strong></p>
          </div>
        `,
    )
    .join("");

  return `
      <div style="font-family:Arial, Helvetica, sans-serif; max-width:600px; margin:0 auto; padding:24px; color:#111827;">
        <h2 style="margin-bottom:16px;">Your Event Tickets</h2>
        <p>Hi ${buyerName},</p>
        <p>Your payment was successful and your ticket(s) for <strong>${eventTitle}</strong> have been generated.</p>
  
        <div style="padding:16px; background:#f9fafb; border-radius:8px; margin:16px 0;">
          <p style="margin:0 0 8px;"><strong>Event:</strong> ${eventTitle}</p>
          ${eventDate ? `<p style="margin:0 0 8px;"><strong>Date:</strong> ${eventDate}</p>` : ""}
          ${eventLocation ? `<p style="margin:0;"><strong>Location:</strong> ${eventLocation}</p>` : ""}
        </div>
  
        <h3 style="margin:24px 0 12px;">Your Ticket Codes</h3>
        ${ticketsHtml}
  
        <p style="margin-top:24px;">Please keep this email safe. You can also view your tickets in the app.</p>
        <p style="margin-top:24px;">Thanks,<br/>EventFlow</p>
      </div>
    `;
};
