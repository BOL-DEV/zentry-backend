import PlatformFeeSetting, {
  DEFAULT_PLATFORM_FEE_FLAT_NAIRA,
  DEFAULT_PLATFORM_FEE_PERCENT_ABOVE_THRESHOLD,
  DEFAULT_PLATFORM_FEE_THRESHOLD_NAIRA,
  PLATFORM_FEE_SETTINGS_KEY,
} from "../models/platformFeeSetting";

export type EffectivePlatformFeeSettings = {
  flatFeeBelowThreshold: number;
  thresholdAmount: number;
  percentAboveThreshold: number;
};

export const getDefaultPlatformFeeSettings =
  (): EffectivePlatformFeeSettings => ({
    flatFeeBelowThreshold: DEFAULT_PLATFORM_FEE_FLAT_NAIRA,
    thresholdAmount: DEFAULT_PLATFORM_FEE_THRESHOLD_NAIRA,
    percentAboveThreshold: DEFAULT_PLATFORM_FEE_PERCENT_ABOVE_THRESHOLD,
  });

export const getEffectivePlatformFeeSettings =
  async (): Promise<EffectivePlatformFeeSettings> => {
    const settings = await PlatformFeeSetting.findOne({
      key: PLATFORM_FEE_SETTINGS_KEY,
    })
      .select("flatFeeBelowThreshold thresholdAmount percentAboveThreshold")
      .lean();

    return {
      flatFeeBelowThreshold:
        settings?.flatFeeBelowThreshold ?? DEFAULT_PLATFORM_FEE_FLAT_NAIRA,
      thresholdAmount:
        settings?.thresholdAmount ?? DEFAULT_PLATFORM_FEE_THRESHOLD_NAIRA,
      percentAboveThreshold:
        settings?.percentAboveThreshold ??
        DEFAULT_PLATFORM_FEE_PERCENT_ABOVE_THRESHOLD,
    };
  };

export const calculatePlatformFee = (
  amount: number,
  settings: EffectivePlatformFeeSettings,
) => {
  if (amount < settings.thresholdAmount) {
    return settings.flatFeeBelowThreshold;
  }

  return Number((amount * settings.percentAboveThreshold).toFixed(2));
};
