import { Request } from "express";
import { AppError } from "./appError";

type OrderAccessShape = {
  buyerEmail: string;
  accessToken?: string;
};

const normalizeHeaderValue = (value?: string | string[]) => {
  if (Array.isArray(value)) {
    return value[0]?.trim();
  }

  return value?.trim();
};

export const assertOrderAccess = (
  req: Request,
  order: OrderAccessShape,
): void => {
  const accessToken = normalizeHeaderValue(req.headers["x-order-access-token"]);
  const buyerEmail = normalizeHeaderValue(req.headers["x-buyer-email"]);

  const tokenMatches = Boolean(
    accessToken && order.accessToken && accessToken === order.accessToken,
  );

  const emailMatches = Boolean(
    buyerEmail && buyerEmail.toLowerCase() === order.buyerEmail.toLowerCase(),
  );

  if (!tokenMatches && !emailMatches) {
    throw new AppError(
      "Order access denied. Provide a valid order access token or buyer email.",
      403,
    );
  }
};
