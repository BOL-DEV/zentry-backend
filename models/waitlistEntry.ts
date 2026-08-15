import { createModel } from "../db/orm";

export interface IWaitlistEntry {
  _id: string;
  eventId: string;
  ticketTypeId: string;
  name: string;
  email: string;
  phone?: string;
  status: "waiting" | "notified";
  notifiedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export const WaitlistEntry = createModel<IWaitlistEntry>({
  modelName: "WaitlistEntry",
  tableName: "waitlist_entries",
  fields: {
    _id: "id",
    eventId: "event_id",
    ticketTypeId: "ticket_type_id",
    name: "name",
    email: "email",
    phone: "phone",
    status: "status",
    notifiedAt: "notified_at",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  relations: {
    eventId: { modelName: "Event" },
    ticketTypeId: { modelName: "TicketType" },
  },
});
