import { createModel } from "../db/orm";

export const DEFAULT_PLATFORM_FEE_FLAT_NAIRA = 100;
export const DEFAULT_PLATFORM_FEE_THRESHOLD_NAIRA = 3500;
export const DEFAULT_PLATFORM_FEE_PERCENT_ABOVE_THRESHOLD = 0.03;
export const PLATFORM_FEE_SETTINGS_KEY = "default";

export interface IPlatformFeeSetting {
  _id: string;
  key: string;
  flatFeeBelowThreshold: number;
  thresholdAmount: number;
  percentAboveThreshold: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type PlatformFeeSettingDocument = any;

const PlatformFeeSetting = createModel<IPlatformFeeSetting>({
  modelName: "PlatformFeeSetting",
  tableName: "platform_fee_settings",
  fields: {
    _id: "id",
    key: "key",
    flatFeeBelowThreshold: "flat_fee_below_threshold",
    thresholdAmount: "threshold_amount",
    percentAboveThreshold: "percent_above_threshold",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
});

export default PlatformFeeSetting;

