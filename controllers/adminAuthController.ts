import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import Admin from "../models/admin";
import AdminSession from "../models/adminSession";
import { adminLoginSchema } from "../validations/adminAuth.schema";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";

type AdminTokenPayload = {
  id: string;
  sessionId: string;
};

type AdminTokenExpiresIn = number;

const toExpirySeconds = (raw: string, fallbackSeconds: number): number => {
  const value = raw.trim();
  if (!value) return fallbackSeconds;

  if (/^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallbackSeconds;
  }

  const match = /^(\d+)\s*([smhd])$/i.exec(value);
  if (!match) return fallbackSeconds;

  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  const multiplier =
    unit === "s"
      ? 1
      : unit === "m"
        ? 60
        : unit === "h"
          ? 60 * 60
          : 24 * 60 * 60;

  const seconds = amount * multiplier;
  return Number.isFinite(seconds) ? seconds : fallbackSeconds;
};

const signAdminToken = (
  payload: AdminTokenPayload,
  expiresIn: AdminTokenExpiresIn,
) => {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) {
    throw new AppError("ADMIN_JWT_SECRET is not set", 500);
  }

  const options: SignOptions = { expiresIn };
  return jwt.sign(payload, secret, options);
};

export const adminLogin = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email, password, deviceName, rememberMe } = adminLoginSchema.parse(
      req.body,
    );

    const admin = await Admin.findOne({ email }).select(
      "+password _id fullName email isActive",
    );

    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return next(new AppError("Incorrect email or password", 401));
    }

    if (!admin.isActive) {
      return next(new AppError("Admin account is disabled", 403));
    }

    const adminId = String((admin as any)._id ?? (admin as any).id ?? "").trim();
    if (!adminId) {
      return next(new AppError("Admin record is missing an id", 500));
    }

    // Single-session admin: newest login wins
    await AdminSession.updateMany(
      { adminId, isActive: true },
      { isActive: false },
    );

    const session = await AdminSession.create({
      adminId,
      isActive: true,
      userAgent: req.get("user-agent") || "",
      ipAddress: req.ip || req.socket.remoteAddress || "",
      deviceName: typeof deviceName === "string" ? deviceName : "",
      lastSeenAt: new Date(),
    });

    const shortExpiryRaw = process.env.ADMIN_JWT_EXPIRES_IN_SHORT ?? "2h";
    const longExpiryRaw = process.env.ADMIN_JWT_EXPIRES_IN_LONG ?? "7d";
    const expiresIn = rememberMe
      ? toExpirySeconds(longExpiryRaw, 7 * 24 * 60 * 60)
      : toExpirySeconds(shortExpiryRaw, 2 * 60 * 60);

    const token = signAdminToken(
      {
        id: adminId,
        sessionId: session._id.toString(),
      },
      expiresIn,
    );

    res.status(200).json({
      status: "success",
      token,
      data: {
        admin: {
          id: admin._id,
          fullName: admin.fullName,
          email: admin.email,
        },
        session: {
          id: session._id,
          deviceName: session.deviceName,
          userAgent: session.userAgent,
        },
      },
    });
  },
);

export const adminLogout = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.adminSession) {
      return next(new AppError("No active admin session found", 401));
    }

    req.adminSession.isActive = false;
    await req.adminSession.save();

    res.status(200).json({
      status: "success",
      message: "Admin logged out successfully",
    });
  },
);

export const getAdminMe = catchAsync(async (req: Request, res: Response) => {
  res.status(200).json({
    status: "success",
    data: {
      admin: {
        id: req.admin?._id,
        fullName: req.admin?.fullName,
        email: req.admin?.email,
        isActive: req.admin?.isActive,
      },
    },
  });
});
