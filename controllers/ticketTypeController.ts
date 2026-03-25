import { Request, Response, NextFunction } from "express";
import {
  createTicketTypeSchema,
} from "../validations/ticketType.schema";
import { TicketType } from "../models/ticketTypes";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/appError";

export const createTicketType = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const organizer = req.organizer;
    const event = req.event;

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }

    if (!event) {
      return next(new AppError("Event not found for this organizer", 404));
    }
    const data = createTicketTypeSchema.parse(req.body);

    const existingTicketType = await TicketType.findOne({
      eventId: event._id,
      name: data.name,
    }).lean();

    if (existingTicketType) {
      return next(
        new AppError(
          "Ticket type with this name already exists for this event",
          400,
        ),
      );
    }

    const normalizedName = data.name.trim().toUpperCase();
    

    const ticketType = await TicketType.create({
      eventId: event._id,
      name: normalizedName,
      description: data.description ?? "",
      price: data.price,
      quantityAvailable: data.quantityAvailable,
      displayOrder: data.displayOrder ?? 0,
      isActive: true,
      quantitySold: 0,
    });
    res.status(201).json({
      status: "success",
      data: {
        organizer: {
          slug: organizer.slug,
          name: organizer.name,
        },
        event: {
          id: event._id,
          title: event.title,
        },
        ticketType,
      },
    });
  },
);

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
