import mongoose, { Document, Schema, Types } from "mongoose";

export type SessionRole = "organizer" | "staff";

export interface IUserSession extends Document {
  userId: Types.ObjectId;
  organizerId?: Types.ObjectId | null;
  role: SessionRole;
  isActive: boolean;
  userAgent?: string;
  ipAddress?: string;
  deviceName?: string;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSessionSchema = new Schema<IUserSession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "DashboardUser",
      required: true,
      index: true,
    },
    organizerId: {
      type: Schema.Types.ObjectId,
      ref: "Organizer",
      default: null,
      index: true,
    },
    role: {
      type: String,
      enum: ["organizer", "staff"],
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    userAgent: {
      type: String,
      trim: true,
    },
    ipAddress: {
      type: String,
      trim: true,
    },
    deviceName: {
      type: String,
      trim: true,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

const UserSession = mongoose.model<IUserSession>(
  "UserSession",
  userSessionSchema,
);

export default UserSession;
