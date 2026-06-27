import type { Request } from "express";
import { AppError } from "./appError";

export const parseJsonField = (
  value: unknown,
  fieldName: string,
): unknown => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    throw new AppError(`${fieldName} must be valid JSON`, 400);
  }
};

export const normalizeBankDetailsBody = <T extends Record<string, unknown>>(
  body: T,
) => {
  if (!Object.prototype.hasOwnProperty.call(body, "bankDetails")) {
    return body;
  }

  return {
    ...body,
    bankDetails: parseJsonField(body.bankDetails, "bankDetails"),
  };
};

export const normalizeJsonBodyField = <T extends Record<string, unknown>>(
  body: T,
  fieldName: string,
) => {
  if (!Object.prototype.hasOwnProperty.call(body, fieldName)) {
    return body;
  }

  return {
    ...body,
    [fieldName]: parseJsonField(body[fieldName], fieldName),
  };
};

export const getUploadedFile = (req: Request, fieldName: string) => {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;

  return files?.[fieldName]?.[0];
};
