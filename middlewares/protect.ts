import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import DashboardUser from "../models/dasboardUser";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";

export const protect = catchAsync(
  async (req: any, _res: Response, next: NextFunction) => {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return next(new AppError("You are not logged in", 401));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      id: string;
    };

    const user = await DashboardUser.findById(decoded.id);

    if (!user) {
      return next(new AppError("User no longer exists", 401));
    }

    req.user = user;

    next();
  },
);

export const restrictTo = (...roles: string[]) => {
  return (req: any, _res: Response, next: NextFunction) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError("You do not have permission", 403));
    }
    next();
  };
};
