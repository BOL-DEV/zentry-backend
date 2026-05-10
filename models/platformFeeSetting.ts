import { Schema, model, type HydratedDocument } from "mongoose";

export const DEFAULT_PLATFORM_FEE_FLAT_NAIRA = 100;
export const DEFAULT_PLATFORM_FEE_THRESHOLD_NAIRA = 3500;
export const DEFAULT_PLATFORM_FEE_PERCENT_ABOVE_THRESHOLD = 0.03;
export const PLATFORM_FEE_SETTINGS_KEY = "default";

export interface IPlatformFeeSetting {
  key: string;
  flatFeeBelowThreshold: number;
  thresholdAmount: number;
  percentAboveThreshold: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type PlatformFeeSettingDocument = HydratedDocument<IPlatformFeeSetting>;

const platformFeeSettingSchema = new Schema<IPlatformFeeSetting>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: PLATFORM_FEE_SETTINGS_KEY,
      trim: true,
    },
    flatFeeBelowThreshold: {
      type: Number,
      required: true,
      default: DEFAULT_PLATFORM_FEE_FLAT_NAIRA,
      min: 0,
    },
    thresholdAmount: {
      type: Number,
      required: true,
      default: DEFAULT_PLATFORM_FEE_THRESHOLD_NAIRA,
      min: 0,
    },
    percentAboveThreshold: {
      type: Number,
      required: true,
      default: DEFAULT_PLATFORM_FEE_PERCENT_ABOVE_THRESHOLD,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

const PlatformFeeSetting = model<IPlatformFeeSetting>(
  "PlatformFeeSetting",
  platformFeeSettingSchema,
);

export default PlatformFeeSetting;
