import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import DashboardUser from "../models/dasboardUser";
import UserSession from "../models/userSession";
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

export const protect = catchAsync(
  async (req: any, _res: Response, next: NextFunction) => {
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
      process.env.JWT_SECRET as string,
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

    session.lastSeenAt = new Date();
    await session.save();

    req.user = user;
    req.session = session;

    next();
  },
);

export const restrictTo = (...roles: string[]) => {
  return (req: any, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError("You do not have permission", 403));
    }

    next();
  };
};
