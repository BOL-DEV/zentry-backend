import { Request, Response, NextFunction } from "express";
import {
  createTicketTypeSchema,
} from "../validations/ticketType.schema";
import { TicketType } from "../models/ticketTypes";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/appError";


export const getEventTicketTypes = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const organizer = req.organizer;
    const event = req.event;

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }

    if (!event) {
      return next(new AppError("Event not found for this organizer", 404));
    }

    const ticketTypes = await TicketType.find({ eventId: event._id })
      .sort({ displayOrder: 1, createdAt: 1 })
      .lean();

    res.status(200).json({
      status: "success",
      results: ticketTypes.length,
      data: {
        organizer: {
          slug: organizer.slug,
          name: organizer.name,
        },
        event: {
          id: event._id,
          title: event.title,
        },
        ticketTypes,
      },
    });
  },
);
