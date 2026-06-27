import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import DashboardUser from "../models/dasboardUser";
import Organizer from "../models/organizer";
import UserSession from "../models/userSession";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import {
  createDashboardUserSchema,
  changePasswordSchema,
  loginSchema,
} from "../validations/auth.schema";

type SignTokenPayload = {
  id: string;
  role: "organizer" | "staff";
  organizerId: string;
  sessionId: string;
};

type TokenExpiresIn = number;

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

const signToken = (payload: SignTokenPayload, expiresIn: TokenExpiresIn) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new AppError("JWT_SECRET is not set", 500);
  }

  const options: SignOptions = { expiresIn };
  return jwt.sign(payload, secret, options);
};

export const login = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email, password, deviceName, rememberMe } = loginSchema.parse(
      req.body,
    );

    const user = await DashboardUser.findOne({ email }).select("+password");

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return next(new AppError("Incorrect email or password", 401));
    }

    if (!user.isActive) {
      return next(new AppError("User account is disabled", 403));
    }

    const userId = String((user as any)._id ?? (user as any).id ?? "").trim();
    const organizerId = String(
      (user as any).organizerId ?? (user as any).organizer_id ?? "",
    ).trim();

    if (!userId) {
      return next(new AppError("User record is missing an id", 500));
    }

    if (!organizerId) {
      return next(new AppError("User record is missing an organizer id", 500));
    }

    const organizer = await Organizer.findById(user.organizerId)
      .select("slug staffSessionLimit organizerSessionLimit")
      .lean();

    if (!organizer) {
      return next(new AppError("Organizer not found for this user", 404));
    }

    if (user.role === "organizer") {
      const organizerSessionLimit =
        typeof (organizer as any).organizerSessionLimit === "number"
          ? (organizer as any).organizerSessionLimit
          : 1;

      if (organizerSessionLimit <= 1) {
        await UserSession.updateMany(
          { userId, isActive: true },
          { isActive: false },
        );
      } else {
        const activeSessionsCount = await UserSession.countDocuments({
          userId,
          isActive: true,
        });

        // Make room for the new login session by revoking the oldest sessions.
        const numberToRevoke =
          activeSessionsCount - (organizerSessionLimit - 1);

        if (numberToRevoke > 0) {
          const sessionsToRevoke = await UserSession.find({
            userId,
            isActive: true,
          })
            .select("_id")
            .sort({ createdAt: 1 })
            .limit(numberToRevoke)
            .lean();

          const ids = sessionsToRevoke.map((s) => s._id);
          if (ids.length) {
            await UserSession.updateMany(
              { _id: { $in: ids } },
              { isActive: false },
            );
          }
        }
      }
    }

    if (user.role === "staff") {
      const staffSessionLimit =
        typeof (organizer as any).staffSessionLimit === "number"
          ? (organizer as any).staffSessionLimit
          : 3;

      const activeSessionsCount = await UserSession.countDocuments({
        userId,
        isActive: true,
      });

      if (activeSessionsCount >= staffSessionLimit) {
        return next(
          new AppError(
            `Maximum of ${staffSessionLimit} devices allowed. Log out from one device first.`,
            403,
          ),
        );
      }
    }

    const session = await UserSession.create({
      userId,
      organizerId,
      role: user.role,
      userAgent: req.get("user-agent") || "",
      ipAddress: req.ip || req.socket.remoteAddress || "",
      deviceName: typeof deviceName === "string" ? deviceName : "",
      lastSeenAt: new Date(),
    });

    const shortExpiryRaw = process.env.JWT_EXPIRES_IN_SHORT ?? "2h";
    const longExpiryRaw = process.env.JWT_EXPIRES_IN_LONG ?? "7d";
    const expiresIn = rememberMe
      ? toExpirySeconds(longExpiryRaw, 7 * 24 * 60 * 60)
      : toExpirySeconds(shortExpiryRaw, 2 * 60 * 60);

    const token = signToken(
      {
        id: userId,
        role: user.role,
        organizerId,
        sessionId: session._id.toString(),
      },
      expiresIn,
    );

    res.status(200).json({
      status: "success",
      token,
      data: {
        user: {
          id: userId,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          organizerId,
          organizerSlug: organizer.slug,
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

export const createDashboardUser = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { organizerId, fullName, email, password, role } =
      createDashboardUserSchema.parse(req.body);

    const organizerExists = await Organizer.exists({ _id: organizerId });

    if (!organizerExists) {
      return next(new AppError("Organizer not found", 404));
    }

    const existingUser = await DashboardUser.findOne({ email });

    if (existingUser) {
      return next(new AppError("A user with this email already exists", 400));
    }

    const user = await DashboardUser.create({
      organizerId,
      fullName,
      email,
      password,
      role,
    });

    res.status(201).json({
      status: "success",
      data: {
        user: {
          id: user._id,
          organizerId: user.organizerId,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
        },
      },
    });
  },
);

export const logout = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session) {
      return next(new AppError("No active session found", 401));
    }

    req.session.isActive = false;
    await req.session.save();

    res.status(200).json({
      status: "success",
      message: "Logged out successfully",
    });
  },
);

export const changePassword = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError("You are not logged in", 401));
    }

    if (req.user.role !== "organizer") {
      return next(
        new AppError(
          "Staff users cannot change their password. Contact your organizer.",
          403,
        ),
      );
    }

    const { currentPassword, newPassword } = changePasswordSchema.parse(
      req.body,
    );

    const user = await DashboardUser.findById(req.user._id).select("+password");

    if (!user) {
      return next(new AppError("User no longer exists", 401));
    }

    const isCorrect = await bcrypt.compare(currentPassword, user.password);
    if (!isCorrect) {
      return next(new AppError("Current password is incorrect", 401));
    }

    user.password = newPassword;
    await user.save();

    // Revoke all active sessions (including current). User must login again.
    await UserSession.updateMany(
      { userId: user._id, isActive: true },
      { isActive: false },
    );

    res.status(200).json({
      status: "success",
      message: "Password changed successfully. Please log in again.",
    });
  },
);
