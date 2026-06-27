import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import DashboardUser from "../models/dasboardUser";
import UserSession from "../models/userSession";
import Admin from "../models/admin";
import AdminSession from "../models/adminSession";
import Organizer from "../models/organizer";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";

type JwtPayload = {
  id: string;
  role: "organizer" | "staff";
  organizerId?: string | null;
  sessionId: string;
  iat: number;
  exp: number;
};

const requireJwtSecret = (name: string, value: string | undefined) => {
  if (!value || !value.trim()) {
    throw new AppError(`${name} is not set`, 500);
  }

  return value;
};

export const protect = catchAsync(
  async (req: Request, _res: Response, next: NextFunction) => {
    let token: string | undefined;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return next(new AppError("You are not logged in", 401));
    }

    const decoded = jwt.verify(
      token,
      requireJwtSecret("JWT_SECRET", process.env.JWT_SECRET),
    ) as JwtPayload;

    const user = await DashboardUser.findById(decoded.id);

    if (!user) {
      return next(new AppError("User no longer exists", 401));
    }

    if (!user.isActive) {
      return next(new AppError("User account is disabled", 403));
    }

    const session = await UserSession.findById(decoded.sessionId);

    if (!session) {
      return next(new AppError("Session no longer exists", 401));
    }

    if (!session.isActive) {
      return next(new AppError("Session has been logged out", 401));
    }

    if (session.userId.toString() !== user._id.toString()) {
      return next(new AppError("Invalid session", 401));
    }

    const organizer = await Organizer.findById(user.organizerId).select(
      "_id isActive",
    );

    if (!organizer) {
      return next(new AppError("Associated organizer not found", 404));
    }

    if (!organizer.isActive) {
      return next(
        new AppError(
          "Associated organizer account is disabled, Contact platform support",
          403,
        ),
      );
    }

    session.lastSeenAt = new Date();
    await session.save();

    req.user = user;
    req.session = session;

    next();
  },
);

export const restrictTo = (...roles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    // Dashboard users (organizer/staff)
    if (req.user && roles.includes(req.user.role)) {
      return next();
    }

    // Admin users
    if (req.admin && roles.includes("admin")) {
      return next();
    }

    return next(new AppError("You do not have permission", 403));
  };
};

type AdminJwtPayload = {
  id: string;
  sessionId: string;
  iat: number;
  exp: number;
};

export const protectAdmin = catchAsync(
  async (req: Request, _res: Response, next: NextFunction) => {
    let token: string | undefined;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return next(new AppError("You are not logged in as admin", 401));
    }

    const decoded = jwt.verify(
      token,
      requireJwtSecret("ADMIN_JWT_SECRET", process.env.ADMIN_JWT_SECRET),
    ) as AdminJwtPayload;

    const admin = await Admin.findById(decoded.id);

    if (!admin) {
      return next(new AppError("Admin no longer exists", 401));
    }

    if (!admin.isActive) {
      return next(new AppError("Admin account is disabled", 403));
    }

    const session = await AdminSession.findById(decoded.sessionId);

    if (!session) {
      return next(new AppError("Admin session no longer exists", 401));
    }

    if (!session.isActive) {
      return next(new AppError("Admin session has been logged out", 401));
    }

    if (session.adminId.toString() !== admin._id.toString()) {
      return next(new AppError("Invalid admin session", 401));
    }

    session.lastSeenAt = new Date();
    await session.save();

    req.admin = admin;
    req.adminSession = session;

    next();
  },
);
