import { createModel } from "../db/orm";

export interface ITicket {
  _id: string;
  eventId: string;
  ticketTypeId: string;
  orderId: string;
  buyerName: string;
  buyerEmail: string;
  ticketCode: string;
  status: "valid" | "checked-in";
  checkedInAt?: Date | null;
  verifiedBy?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const Ticket = createModel<ITicket>({
  modelName: "Ticket",
  tableName: "tickets",
  fields: {
    _id: "id",
    eventId: "event_id",
    ticketTypeId: "ticket_type_id",
    orderId: "order_id",
    buyerName: "buyer_name",
    buyerEmail: "buyer_email",
    ticketCode: "ticket_code",
    status: "status",
    checkedInAt: "checked_in_at",
    verifiedBy: "verified_by",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  relations: {
    eventId: { modelName: "Event" },
    ticketTypeId: { modelName: "TicketType" },
    orderId: { modelName: "Order" },
    verifiedBy: { modelName: "DashboardUser" },
  },
});

export default Ticket;

