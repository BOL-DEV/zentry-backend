import { Request, Response, NextFunction } from "express";
import DashboardUser from "../models/dasboardUser";
import UserSession from "../models/userSession";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import {
  logoutOneStaffSessionParamsSchema,
  resetStaffPasswordBodySchema,
  staffSessionParamsSchema,
} from "../validations/staffSession.schema";

export const getStaffSessions = catchAsync(
  async (req: any, res: Response, next: NextFunction) => {
    const { staffId } = staffSessionParamsSchema.parse(req.params);

    const staffUser = await DashboardUser.findOne({
      _id: staffId,
      organizerId: req.user.organizerId,
      role: "staff",
    });

    if (!staffUser) {
      return next(new AppError("Staff user not found", 404));
    }

    const sessions = await UserSession.find({
      userId: staffUser._id,
      isActive: true,
    }).sort({ createdAt: -1 });

    res.status(200).json({
      status: "success",
      results: sessions.length,
      data: {
        sessions,
      },
    });
  },
);

export const logoutOneStaffSession = catchAsync(
  async (req: any, res: Response, next: NextFunction) => {
    const { staffId, sessionId } = logoutOneStaffSessionParamsSchema.parse(
      req.params,
    );

    const staffUser = await DashboardUser.findOne({
      _id: staffId,
      organizerId: req.user.organizerId,
      role: "staff",
    });

    if (!staffUser) {
      return next(new AppError("Staff user not found", 404));
    }

    const session = await UserSession.findOne({
      _id: sessionId,
      userId: staffUser._id,
      isActive: true,
    });

    if (!session) {
      return next(new AppError("Active session not found", 404));
    }

    session.isActive = false;
    await session.save();

    res.status(200).json({
      status: "success",
      message: "Staff session logged out successfully",
    });
  },
);

export const logoutAllStaffSessions = catchAsync(
  async (req: any, res: Response, next: NextFunction) => {
    const { staffId } = staffSessionParamsSchema.parse(req.params);

    const staffUser = await DashboardUser.findOne({
      _id: staffId,
      organizerId: req.user.organizerId,
      role: "staff",
    });

    if (!staffUser) {
      return next(new AppError("Staff user not found", 404));
    }

    await UserSession.updateMany(
      {
        userId: staffUser._id,
        isActive: true,
      },
      {
        isActive: false,
      },
    );

    res.status(200).json({
      status: "success",
      message: "All staff sessions logged out successfully",
    });
  },
);

export const resetStaffPassword = catchAsync(
  async (req: any, res: Response, next: NextFunction) => {
    const { staffId } = staffSessionParamsSchema.parse(req.params);
    const { newPassword } = resetStaffPasswordBodySchema.parse(req.body);

    const staffUser = await DashboardUser.findOne({
      _id: staffId,
      organizerId: req.user.organizerId,
      role: "staff",
    }).select("+password");

    if (!staffUser) {
      return next(new AppError("Staff user not found", 404));
    }

    staffUser.password = newPassword;
    await staffUser.save();

    await UserSession.updateMany(
      {
        userId: staffUser._id,
        isActive: true,
      },
      {
        isActive: false,
      },
    );

    res.status(200).json({
      status: "success",
      message: "Staff password reset successfully. Staff must log in again.",
    });
  },
);

export const getOrganizerStaffUsers = catchAsync(
  async (req: any, res: Response) => {
    const role =
      typeof req.query.role === "string" ? req.query.role.trim() : "";

    const filter: Record<string, unknown> = {
      organizerId: req.user.organizerId,
    };

    if (role === "staff" || role === "organizer") {
      filter.role = role;
    } else {
      // Backwards-compatible default: only return staff users.
      filter.role = "staff";
    }

    const staffUsers = await DashboardUser.find(filter)
      .select(
        "_id organizerId fullName email role isActive createdAt updatedAt",
      )
      .sort({ createdAt: -1 });

    res.status(200).json({
      status: "success",
      results: staffUsers.length,
      data: {
        staff: staffUsers,
      },
    });
  },
);

export const getOrganizerDashboardUsers = catchAsync(
  async (req: any, res: Response) => {
    const users = await DashboardUser.find({
      organizerId: req.user.organizerId,
    })
      .select(
        "_id organizerId fullName email role isActive createdAt updatedAt",
      )
      .sort({ createdAt: -1 });

    res.status(200).json({
      status: "success",
      results: users.length,
      data: {
        users,
      },
    });
  },
);