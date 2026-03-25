import { model, Schema, Document, Types } from "mongoose";

export interface IEvent extends Document {
  organizerId: Types.ObjectId;
  title: string;
  description: string;
  date: Date;
  location: string;
  posterUrl: string;
  dressCode: string;
  policies: string;
}

const eventSchema = new Schema<IEvent>(
  {
    organizerId: {
      type: Schema.Types.ObjectId,
      ref: "Organizer",
      required: [true, "Organizer ID is required"],
      index: true,
    },
    title: {
      type: String,
      required: [true, "Event title is required"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Event description is required"],
      trim: true,
    },
    date: {
      type: Date,
      required: [true, "Event date is required"],
    },
    location: {
      type: String,
      required: [true, "Event location is required"],
      trim: true,
    },
    posterUrl: {
      type: String,
      required: [true, "Event poster URL is required"],
      trim: true,
    },
    dressCode: {
      type: String,
      required: [true, "Dress code is required"],
      trim: true,
    },
    policies: {
      type: String,
      required: [true, "Event policies are required"],
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

eventSchema.index({ organizerId: 1, date: 1 });
eventSchema.index({ organizerId: 1, title: 1, date: 1 }, { unique: true });

const Event = model<IEvent>("Event", eventSchema);

export default Event;
