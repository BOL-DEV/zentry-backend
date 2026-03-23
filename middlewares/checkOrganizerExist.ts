import Organizer from "../models/organizer";
import { AppError } from "../utils/appError";
import { Request, Response, NextFunction } from "express";
import { catchAsync } from "../utils/catchAsync";

export const checkOrganizerExist = catchAsync(
  async (req: Request, _res: Response, next: NextFunction) => {
    const { slug } = req.params;
  

    if (typeof slug !== "string" || !slug.trim()) {
      return next(new AppError("Invalid organizer slug", 400));
    }

    const organizer = await Organizer.findOne({ slug })
      .select("_id slug name")
      .lean();

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }
    req.organizer = organizer;
    next();
  },
);
