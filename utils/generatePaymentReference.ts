import crypto from "crypto";

export const generatePaymentReference = (): string => {
  return `ORD-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
};
