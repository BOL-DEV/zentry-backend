import mongoose, { Document, Schema, Types } from "mongoose";

export type OrganizerRequestStatus = "pending" | "approved" | "rejected";

export interface IOrganizerRequest extends Document {
  name: string;
  email: string;
  logoUrl: string;
  logoPublicId?: string | null;
  bannerUrl: string;
  bannerPublicId?: string | null;
  heroTitle: string;
  heroSubtitle: string;
  phone: string;
  about: string;
  location: string;
  bankDetails?: {
    bankName?: string;
    bankCode?: string;
    accountNumber?: string;
    accountName?: string;
  };
  preferredSlug: string;
  status: OrganizerRequestStatus;
  reviewNote: string;
  approvedAt?: Date | null;
  rejectedAt?: Date | null;
  createdOrganizerId?: Types.ObjectId | null;
  createdDashboardUserId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const organizerRequestSchema = new Schema<IOrganizerRequest>(
  {
    name: {
      type: String,
      required: [true, "Organizer name is required"],
      trim: true,
      index: true,
    },
    email: {
      type: String,
      required: [true, "Organizer email is required"],
      trim: true,
      lowercase: true,
      index: true,
    },
    logoUrl: {
      type: String,
      required: [true, "Organizer logo is required"],
      trim: true,
    },
    logoPublicId: {
      type: String,
      trim: true,
      default: null,
    },
    bannerUrl: {
      type: String,
      required: [true, "Organizer banner is required"],
      trim: true,
    },
    bannerPublicId: {
      type: String,
      trim: true,
      default: null,
    },
    heroTitle: {
      type: String,
      required: [true, "Organizer hero title is required"],
      trim: true,
    },
    heroSubtitle: {
      type: String,
      required: [true, "Organizer hero subtitle is required"],
      trim: true,
    },
    phone: {
      type: String,
      default: "",
      trim: true,
    },
    about: {
      type: String,
      default: "",
      trim: true,
    },
    location: {
      type: String,
      default: "",
      trim: true,
    },
    bankDetails: {
      bankName: {
        type: String,
        trim: true,
      },
      bankCode: {
        type: String,
        trim: true,
      },
      accountNumber: {
        type: String,
        trim: true,
      },
      accountName: {
        type: String,
        trim: true,
      },
    },
    preferredSlug: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    reviewNote: {
      type: String,
      default: "",
      trim: true,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    createdOrganizerId: {
      type: Schema.Types.ObjectId,
      ref: "Organizer",
      default: null,
      index: true,
    },
    createdDashboardUserId: {
      type: Schema.Types.ObjectId,
      ref: "DashboardUser",
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

organizerRequestSchema.index({ status: 1, createdAt: -1 });
organizerRequestSchema.index({ createdAt: -1 });

const OrganizerRequest = mongoose.model<IOrganizerRequest>(
  "OrganizerRequest",
  organizerRequestSchema,
);

export default OrganizerRequest;
