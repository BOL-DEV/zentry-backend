import Event from "../models/event";
import { createEventSchema } from "../validations/event.schema";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/appError";
import { Request, Response, NextFunction } from "express";

export const createEvent = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const data = createEventSchema.parse(req.body);
    const organizer = req.organizer;

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }

    const event = await Event.create({
      ...data,
      organizerId: organizer._id,
    });

    res.status(201).json({
      status: "success",
      data: {
        event,
      },
    });
  },
);
