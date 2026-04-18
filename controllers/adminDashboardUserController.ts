import { Request, Response, NextFunction } from "express";
import Organizer from "../models/organizer";
import DashboardUser from "../models/dasboardUser";
import UserSession from "../models/userSession";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import { organizerIdParamSchema } from "../validations/organizer.schema";
import {
  dashboardUserIdParamSchema,
  dashboardUserSessionParamsSchema,
} from "../validations/dashboardUser.schema";

export const getAdminOrganizerDashboardUsers = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { organizerId } = organizerIdParamSchema.parse(req.params);

    const organizerExists = await Organizer.exists({ _id: organizerId });

    if (!organizerExists) {
      return next(new AppError("Organizer not found", 404));
    }

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.max(Number(req.query.limit) || 20, 1);
    const skip = (page - 1) * limit;

    const role = typeof req.query.role === "string" ? req.query.role.trim() : "";

    const filter: Record<string, unknown> = {
      organizerId,
    };

    if (role === "organizer" || role === "staff") {
      filter.role = role;
    }

    const [users, total] = await Promise.all([
      DashboardUser.find(filter)
        .select("_id organizerId fullName email role isActive createdAt updatedAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      DashboardUser.countDocuments(filter),
    ]);

    res.status(200).json({
      status: "success",
      results: users.length,
      page,
      limit,
      total,
      data: {
        users,
      },
    });
  },
);

export const getAdminDashboardUserSessions = catchAsync(
  async (req: Request, res: Response) => {
    const { userId } = dashboardUserIdParamSchema.parse(req.params);

    const sessions = await UserSession.find({
      userId,
      isActive: true,
    })
      .select("_id userId organizerId role isActive deviceName userAgent ipAddress lastSeenAt createdAt updatedAt")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      status: "success",
      results: sessions.length,
      data: {
        sessions,
      },
    });
  },
);

export const logoutAdminDashboardUserSession = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { userId, sessionId } = dashboardUserSessionParamsSchema.parse(
      req.params,
    );

    const session = await UserSession.findOne({
      _id: sessionId,
      userId,
      isActive: true,
    });

    if (!session) {
      return next(new AppError("Active session not found", 404));
    }

    session.isActive = false;
    await session.save();

    res.status(200).json({
      status: "success",
      message: "Session logged out successfully",
    });
  },
);

export const logoutAllAdminDashboardUserSessions = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = dashboardUserIdParamSchema.parse(req.params);

    const activeCount = await UserSession.countDocuments({
      userId,
      isActive: true,
    });

    if (activeCount === 0) {
      return next(new AppError("No active sessions found", 404));
    }

    await UserSession.updateMany(
      {
        userId,
        isActive: true,
      },
      {
        isActive: false,
      },
    );

    res.status(200).json({
      status: "success",
      message: "All sessions logged out successfully",
    });
  },
);

export const toggleAdminDashboardUserActiveState = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = dashboardUserIdParamSchema.parse(req.params);

    const user = await DashboardUser.findById(userId).select(
      "_id organizerId fullName email role isActive",
    );

    if (!user) {
      return next(new AppError("Dashboard user not found", 404));
    }

    user.isActive = !user.isActive;
    await user.save();

    if (!user.isActive) {
      await UserSession.updateMany(
        {
          userId: user._id,
          isActive: true,
        },
        {
          isActive: false,
        },
      );
    }

    res.status(200).json({
      status: "success",
      message: `Dashboard user has been ${
        user.isActive ? "reactivated" : "disabled"
      } successfully`,
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
