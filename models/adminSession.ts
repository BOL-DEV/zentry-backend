import { Schema, model, Document, Types } from "mongoose";

export interface IAdminSession extends Document {
  adminId: Types.ObjectId;
  isActive: boolean;
  userAgent?: string;
  ipAddress?: string;
  deviceName?: string;
  lastSeenAt: Date;
}

const adminSessionSchema = new Schema<IAdminSession>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
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
  {
    timestamps: true,
  },
);

const AdminSession = model<IAdminSession>("AdminSession", adminSessionSchema);

export default AdminSession;
