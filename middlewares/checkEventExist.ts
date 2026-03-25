import { Request, Response, NextFunction } from "express";
import Event from "../models/event";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import { eventIdParamSchema } from "../validations/event.schema";

export const checkEventExist = catchAsync(
  async (req: Request, _res: Response, next: NextFunction) => {
    const { eventId } = eventIdParamSchema.parse(req.params);

    const event = await Event.findById(eventId).select("_id organizerId title").lean();

    if (!event) {
      return next(new AppError("Event not found", 404));
    }

    req.event = event;
    next();
  },
);
