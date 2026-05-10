import { z } from "zod";

const moneyField = z.coerce
  .number()
  .min(0, "Value cannot be negative")
  .finite("Value must be a valid number");

const rateField = z.coerce
  .number()
  .min(0, "Rate cannot be negative")
  .max(1, "Rate must be between 0 and 1")
  .finite("Rate must be a valid number");

export const updateAdminPlatformFeeSettingsSchema = z
  .object({
    flatFeeBelowThreshold: moneyField.optional(),
    thresholdAmount: moneyField.optional(),
    percentAboveThreshold: rateField.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "No updates provided",
  });
