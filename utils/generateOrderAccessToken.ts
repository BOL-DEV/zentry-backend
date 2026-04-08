import crypto from "crypto";

export const generateOrderAccessToken = (): string => {
  return crypto.randomBytes(18).toString("hex").toUpperCase();
};
