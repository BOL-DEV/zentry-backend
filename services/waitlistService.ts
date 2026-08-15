import { WaitlistEntry } from "../models/waitlistEntry";
import { TicketType } from "../models/ticketTypes";
import Event from "../models/event";
import Organizer from "../models/organizer";
import { sendEmail } from "../utils/email";

const buildWaitlistEmailHtml = (options: {
  name: string;
  eventTitle: string;
  ticketTypeName: string;
  checkoutUrl: string;
}) => {
  const { name, eventTitle, ticketTypeName, checkoutUrl } = options;

  return `
    <div style="font-family:Arial, Helvetica, sans-serif; max-width:600px; margin:0 auto; padding:24px; color:#111827;">
      <h2 style="margin-bottom:16px;">A spot just opened up</h2>
      <p>Hi ${name},</p>
      <p>Good news — <strong>${ticketTypeName}</strong> tickets for <strong>${eventTitle}</strong> are available again. Spots tend to go quickly, so grab yours soon.</p>
      <p style="margin:24px 0;">
        <a href="${checkoutUrl}" style="background:#7e22ce;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Buy Now</a>
      </p>
      <p style="color:#6b7280;font-size:13px;">You're receiving this because you joined the waitlist for this ticket type.</p>
    </div>
  `;
};

export const notifyWaitlistForTicketType = async (
  ticketTypeId: string,
  freedSlots: number,
) => {
  if (freedSlots < 1) return;

  const entries = await WaitlistEntry.find({
    ticketTypeId,
    status: "waiting",
  })
    .sort({ createdAt: 1 })
    .limit(freedSlots)
    .lean();

  if (!entries.length) return;

  const ticketType = await TicketType.findById(ticketTypeId).lean();
  if (!ticketType) return;

  const event = await Event.findById(ticketType.eventId).lean();
  if (!event) return;

  const organizer = await Organizer.findById(event.organizerId)
    .select("_id slug")
    .lean();
  if (!organizer) return;

  const checkoutUrl = `${(process.env.FRONTEND_BASE_URL || "").replace(/\/+$/, "")}/${organizer.slug}/events/${event._id}/checkout`;

  for (const entry of entries) {
    try {
      await sendEmail({
        to: entry.email,
        subject: `Tickets available again: ${event.title}`,
        html: buildWaitlistEmailHtml({
          name: entry.name,
          eventTitle: event.title,
          ticketTypeName: ticketType.name,
          checkoutUrl,
        }),
      });

      await WaitlistEntry.updateOne(
        { _id: entry._id },
        { status: "notified", notifiedAt: new Date() },
      );
    } catch (error) {
      console.error(
        `Failed to send waitlist notification to ${entry.email}:`,
        error,
      );
    }
  }
};
