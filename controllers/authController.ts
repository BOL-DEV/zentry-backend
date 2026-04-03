import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import DashboardUser from "../models/dasboardUser";
import Organizer from "../models/organizer";
import UserSession from "../models/userSession";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import {
  createDashboardUserSchema,
  loginSchema,
} from "../validations/auth.schema";

type SignTokenPayload = {
  id: string;
  role: "organizer" | "staff";
  organizerId: string;
  sessionId: string;
};

const signToken = (payload: SignTokenPayload) => {
  return jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: "2d",
  });
};

export const login = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = loginSchema.parse(req.body);

    const user = await DashboardUser.findOne({ email }).select("+password");

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return next(new AppError("Incorrect email or password", 401));
    }

    if (!user.isActive) {
      return next(new AppError("User account is disabled", 403));
    }

    if (user.role === "organizer") {
      await UserSession.updateMany(
        { userId: user._id, isActive: true },
        { isActive: false },
      );
    }

    if (user.role === "staff") {
      const activeSessionsCount = await UserSession.countDocuments({
        userId: user._id,
        isActive: true,
      });

      if (activeSessionsCount >= 3) {
        return next(
          new AppError(
            "Maximum of 3 devices allowed. Log out from one device first.",
            403,
          ),
        );
      }
    }

    const organizer = await Organizer.findById(user.organizerId).select("slug");

    if (!organizer) {
      return next(new AppError("Organizer not found for this user", 404));
    }

    const session = await UserSession.create({
      userId: user._id,
      organizerId: user.organizerId,
      role: user.role,
      userAgent: req.get("user-agent") || "",
      ipAddress: req.ip || req.socket.remoteAddress || "",
      deviceName:
        typeof req.body.deviceName === "string" ? req.body.deviceName : "",
      lastSeenAt: new Date(),
    });

    const token = signToken({
      id: user._id.toString(),
      role: user.role,
      organizerId: user.organizerId.toString(),
      sessionId: session._id.toString(),
    });

    res.status(200).json({
      status: "success",
      token,
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          organizerId: user.organizerId,
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
  async (req: any, res: Response, next: NextFunction) => {
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
