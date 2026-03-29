import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import DashboardUser from "../models/dasboardUser";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import { loginSchema } from "../validations/auth.schema";

const signToken = (id: string) => {
  return jwt.sign({ id }, process.env.JWT_SECRET as string, {
    expiresIn: "7d",
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

    const token = signToken(user._id.toString());

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
        },
      },
    });
  },
);
