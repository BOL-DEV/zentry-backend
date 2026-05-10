import type { Request, Response, NextFunction } from "express";
import PlatformFeeSetting, {
  PLATFORM_FEE_SETTINGS_KEY,
} from "../models/platformFeeSetting";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import {
  getDefaultPlatformFeeSettings,
  getEffectivePlatformFeeSettings,
} from "../services/platformFeeService";
import { updateAdminPlatformFeeSettingsSchema } from "../validations/adminPlatformFee.schema";

export const getAdminPlatformFeeSettings = catchAsync(
  async (_req: Request, res: Response) => {
    const [savedSettings, effectiveSettings] = await Promise.all([
      PlatformFeeSetting.findOne({ key: PLATFORM_FEE_SETTINGS_KEY })
        .select(
          "flatFeeBelowThreshold thresholdAmount percentAboveThreshold createdAt updatedAt",
        )
        .lean(),
      getEffectivePlatformFeeSettings(),
    ]);

    res.status(200).json({
      status: "success",
      data: {
        settings: {
          ...effectiveSettings,
          defaults: getDefaultPlatformFeeSettings(),
          isUsingDefault:
            !savedSettings ||
            (savedSettings.flatFeeBelowThreshold ===
              effectiveSettings.flatFeeBelowThreshold &&
              savedSettings.thresholdAmount === effectiveSettings.thresholdAmount &&
              savedSettings.percentAboveThreshold ===
                effectiveSettings.percentAboveThreshold),
          updatedAt: savedSettings?.updatedAt || null,
          createdAt: savedSettings?.createdAt || null,
        },
      },
    });
  },
);

export const updateAdminPlatformFeeSettings = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const data = updateAdminPlatformFeeSettingsSchema.parse(req.body);

    const settings = await PlatformFeeSetting.findOneAndUpdate(
      { key: PLATFORM_FEE_SETTINGS_KEY },
      {
        $set: {
          key: PLATFORM_FEE_SETTINGS_KEY,
          ...data,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );

    if (!settings) {
      return next(new AppError("Unable to update platform fee settings", 500));
    }

    res.status(200).json({
      status: "success",
      message: "Platform fee settings updated successfully",
      data: {
        settings: {
          flatFeeBelowThreshold: settings.flatFeeBelowThreshold,
          thresholdAmount: settings.thresholdAmount,
          percentAboveThreshold: settings.percentAboveThreshold,
          defaults: getDefaultPlatformFeeSettings(),
          updatedAt: settings.updatedAt,
          createdAt: settings.createdAt,
        },
      },
    });
  },
);
