import { model, Schema, Document, Types } from "mongoose";

export interface ITicketType extends Document {
  eventId: Types.ObjectId;
  name: string;
  description?: string;
  price: number;
  quantityAvailable: number;
  quantitySold: number;
  isActive: boolean;
  displayOrder: number;
}

const TicketTypeSchema = new Schema<ITicketType>(
  {
    name: {
      type: String,
      required: [true, "A ticket must have a name"],
    },

    description: {
      type: String,
      required: [true, "A ticket must have a description"],
    },
    price: {
      type: Number,
      required: [true, "A ticket must have a price"],
    },
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: [true, "A ticket must belong to an event"],
    },
    quantityAvailable: {
      type: Number,
      required: [true, "A ticket must have an available quantity"],
    },
    quantitySold: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    displayOrder: {
      type: Number,
      required: [true, "A ticket must have a display order"],
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

TicketTypeSchema.index({ eventId: 1, displayOrder: 1 });
TicketTypeSchema.index({ eventId: 1, name: 1 }, { unique: true });

export const TicketType = model<ITicketType>("TicketType", TicketTypeSchema);
