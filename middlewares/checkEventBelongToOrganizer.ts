import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";

export const checkEventBelongToOrganizer = catchAsync(
  async (req: Request, _res: Response, next: NextFunction) => {
    const organizer = req.organizer;
    const event = req.event;

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }

    if (!event) {
      return next(new AppError("Event not found", 404));
    }

    if (String(event.organizerId) !== String(organizer._id)) {
      return next(new AppError("Event not found for this organizer", 404));
    }

    next();
  },
);
