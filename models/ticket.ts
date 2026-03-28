import { model, Types, Schema, Document } from "mongoose";

export interface ITicket extends Document {
  eventId: Types.ObjectId;
  ticketTypeId: Types.ObjectId;
  orderId: Types.ObjectId;
  buyerName: string;
  buyerEmail: string;
  ticketCode: string;
  status: "valid" | "checked-in";
}

const TicketSchema = new Schema(
  {
    eventId: {
      type: Types.ObjectId,
      ref: "Event",
      required: [true, "Ticket must belong to an event"],
      index: true,
    },
    ticketTypeId: {
      type: Types.ObjectId,
      ref: "TicketType",
      required: [true, "Ticket must belong to a ticket type"],
    },
    orderId: {
      type: Types.ObjectId,
      ref: "Order",
      required: [true, "Ticket must belong to an order"],
      index: true,
    },
    buyerName: {
      type: String,
      required: [true, "Buyer name is required"],
      trim: true,
    },
    buyerEmail: {
      type: String,
      required: [true, "Buyer email is required"],
      trim: true,
      lowercase: true,
    },
    ticketCode: {
      type: String,
      required: [true, "Ticket code is required"],
      unique: true,
      index: true,
      trim: true,
      uppercase: true,
    },
    status: {
      type: String,
      enum: ["valid", "checked-in"],
      default: "valid",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

TicketSchema.index({ orderId: 1 });
TicketSchema.index({ eventId: 1, status: 1 });

const Ticket = model<ITicket>("Ticket", TicketSchema);

export default Ticket;
