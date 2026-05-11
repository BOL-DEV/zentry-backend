import { Schema, model } from "mongoose";

const organizerSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Organizer name is required"],
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      required: [true, "Organizer slug is required"],
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
    about: {
      type: String,
      required: [true, "Organizer about is required"],
      trim: true,
    },
    contactEmail: {
      type: String,
      required: [true, "Organizer contact email is required"],
      trim: true,
      lowercase: true,
    },
    contactPhone: {
      type: String,
      required: [true, "Organizer contact phone is required"],
      trim: true,
    },
    location: {
      type: String,
      required: [true, "Organizer location is required"],
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
    staffSessionLimit: {
      type: Number,
      default: 3,
      min: 1,
      max: 20,
    },
    organizerSessionLimit: {
      type: Number,
      default: 1,
      min: 1,
      max: 20,
    },
    platformFeeOverride: {
      flatFeeBelowThreshold: {
        type: Number,
        min: 0,
      },
      thresholdAmount: {
        type: Number,
        min: 0,
      },
      percentAboveThreshold: {
        type: Number,
        min: 0,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const Organizer = model("Organizer", organizerSchema);

export default Organizer;
