import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import Admin from "../models/admin";
import AdminSession from "../models/adminSession";
import { adminLoginSchema } from "../validations/adminAuth.schema";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";

type AdminTokenPayload = {
  id: string;
  sessionId: string;
};

const signAdminToken = (payload: AdminTokenPayload) => {
  return jwt.sign(payload, process.env.ADMIN_JWT_SECRET as string, {
    expiresIn: "1d",
  });
};

export const adminLogin = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email, password, deviceName } = adminLoginSchema.parse(req.body);

    const admin = await Admin.findOne({ email }).select("+password");

    if (!admin || !(await admin.comparePassword(password))) {
      return next(new AppError("Incorrect email or password", 401));
    }

    if (!admin.isActive) {
      return next(new AppError("Admin account is disabled", 403));
    }

    // Single-session admin: newest login wins
    await AdminSession.updateMany(
      { adminId: admin._id, isActive: true },
      { isActive: false },
    );

    const session = await AdminSession.create({
      adminId: admin._id,
      isActive: true,
      userAgent: req.get("user-agent") || "",
      ipAddress: req.ip || req.socket.remoteAddress || "",
      deviceName: typeof deviceName === "string" ? deviceName : "",
      lastSeenAt: new Date(),
    });

    const token = signAdminToken({
      id: admin._id.toString(),
      sessionId: session._id.toString(),
    });

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
