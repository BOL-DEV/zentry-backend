import PlatformFeeSetting, {
  DEFAULT_PLATFORM_FEE_FLAT_NAIRA,
  DEFAULT_PLATFORM_FEE_PERCENT_ABOVE_THRESHOLD,
  DEFAULT_PLATFORM_FEE_THRESHOLD_NAIRA,
  PLATFORM_FEE_SETTINGS_KEY,
} from "../models/platformFeeSetting";
import Organizer from "../models/organizer";

export type EffectivePlatformFeeSettings = {
  flatFeeBelowThreshold: number;
  thresholdAmount: number;
  percentAboveThreshold: number;
};

export type PlatformFeeSettingsWithSource = EffectivePlatformFeeSettings & {
  isUsingOrganizerOverride: boolean;
};

export const getDefaultPlatformFeeSettings =
  (): EffectivePlatformFeeSettings => ({
    flatFeeBelowThreshold: DEFAULT_PLATFORM_FEE_FLAT_NAIRA,
    thresholdAmount: DEFAULT_PLATFORM_FEE_THRESHOLD_NAIRA,
    percentAboveThreshold: DEFAULT_PLATFORM_FEE_PERCENT_ABOVE_THRESHOLD,
  });

export const getGlobalPlatformFeeSettings =
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

export const getEffectivePlatformFeeSettings = async (
  organizerId?: string | { toString(): string },
): Promise<PlatformFeeSettingsWithSource> => {
  const defaultSettings = await getGlobalPlatformFeeSettings();

  if (!organizerId) {
    return {
      ...defaultSettings,
      isUsingOrganizerOverride: false,
    };
  }

  const organizer = await Organizer.findById(organizerId)
    .select("platformFeeOverride")
    .lean();

  const override = organizer?.platformFeeOverride;

  if (!override) {
    return {
      ...defaultSettings,
      isUsingOrganizerOverride: false,
    };
  }

  return {
    flatFeeBelowThreshold:
      override.flatFeeBelowThreshold ?? defaultSettings.flatFeeBelowThreshold,
    thresholdAmount: override.thresholdAmount ?? defaultSettings.thresholdAmount,
    percentAboveThreshold:
      override.percentAboveThreshold ?? defaultSettings.percentAboveThreshold,
    isUsingOrganizerOverride: true,
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
