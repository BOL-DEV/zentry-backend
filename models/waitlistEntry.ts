import { model, Schema, Types } from "mongoose";

export interface IWaitlistEntry {
  eventId: Types.ObjectId;
  ticketTypeId: Types.ObjectId;
  name: string;
  email: string;
  phone?: string;
  status: "waiting" | "notified";
  notifiedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const waitlistEntrySchema = new Schema<IWaitlistEntry>(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: [true, "Event ID is required"],
      index: true,
    },
    ticketTypeId: {
      type: Schema.Types.ObjectId,
      ref: "TicketType",
      required: [true, "Ticket type ID is required"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["waiting", "notified"],
      default: "waiting",
      index: true,
    },
    notifiedAt: Date,
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

waitlistEntrySchema.index({ eventId: 1, createdAt: 1 });
waitlistEntrySchema.index(
  { ticketTypeId: 1, email: 1 },
  { unique: true },
);

export const WaitlistEntry = model<IWaitlistEntry>(
  "WaitlistEntry",
  waitlistEntrySchema,
);
