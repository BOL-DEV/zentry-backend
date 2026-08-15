import { Request, Response, NextFunction } from "express";
import {
  createTicketTypeSchema,
  ticketTypeIdParamSchema,
  updateTicketTypeQuantitySchema,
  updateTicketTypeSchema,
} from "../validations/ticketType.schema";
import { TicketType } from "../models/ticketTypes";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/appError";
import Event from "../models/event";
import { eventIdParamSchema } from "../validations/event.schema";
import { notifyWaitlistForTicketType } from "../services/waitlistService";

export const createTicketType = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return next(new AppError("User not found", 401));
    }

    const { eventId } = eventIdParamSchema.parse(req.params);
    const data = createTicketTypeSchema.parse(req.body);

    const event = await Event.findOne({
      _id: eventId,
      organizerId: user.organizerId,
    })
      .select("_id title organizerId")
      .lean();

    if (!event) {
      return next(new AppError("Event not found for this organizer", 404));
    }

    const normalizedName = data.name.trim().toUpperCase();

    const existingTicketType = await TicketType.findOne({
      eventId: event._id,
      name: normalizedName,
    }).lean();

    if (existingTicketType) {
      return next(
        new AppError(
          "Ticket type with this name already exists for this event",
          400,
        ),
      );
    }

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

export const updateTicketTypeQuantity = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return next(new AppError("User not found", 401));
    }

    const { eventId } = eventIdParamSchema.parse(req.params);
    const { ticketTypeId } = ticketTypeIdParamSchema.parse(req.params);
    const { quantityAvailable } = updateTicketTypeQuantitySchema.parse(
      req.body,
    );

    const event = await Event.findOne({
      _id: eventId,
      organizerId: user.organizerId,
    })
      .select("_id title")
      .lean();

    if (!event) {
      return next(new AppError("Event not found for this organizer", 404));
    }

    const ticketType = await TicketType.findOne({
      _id: ticketTypeId,
      eventId: event._id,
    });

    if (!ticketType) {
      return next(new AppError("Ticket type not found for this event", 404));
    }

    const minRequired =
      Number(ticketType.quantitySold || 0) +
      Number(ticketType.quantityReserved || 0);

    if (quantityAvailable < minRequired) {
      return next(
        new AppError(
          `quantityAvailable cannot be less than sold + reserved (${minRequired})`,
          400,
        ),
      );
    }

    const previousQuantityAvailable = Number(ticketType.quantityAvailable);
    ticketType.quantityAvailable = quantityAvailable;
    await ticketType.save();

    if (quantityAvailable > previousQuantityAvailable) {
      try {
        await notifyWaitlistForTicketType(
          ticketType._id,
          quantityAvailable - previousQuantityAvailable,
        );
      } catch (error) {
        console.error("Failed to notify waitlist for ticket type:", error);
      }
    }

    res.status(200).json({
      status: "success",
      data: {
        event: {
          id: event._id,
          title: event.title,
        },
        ticketType,
      },
    });
  },
);

export const updateTicketType = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return next(new AppError("User not found", 401));
    }

    const { eventId } = eventIdParamSchema.parse(req.params);
    const { ticketTypeId } = ticketTypeIdParamSchema.parse(req.params);
    const data = updateTicketTypeSchema.parse(req.body);

    if (!Object.keys(data).length) {
      return next(new AppError("No updates provided", 400));
    }

    const event = await Event.findOne({
      _id: eventId,
      organizerId: user.organizerId,
    })
      .select("_id title")
      .lean();

    if (!event) {
      return next(new AppError("Event not found for this organizer", 404));
    }

    const ticketType = await TicketType.findOne({
      _id: ticketTypeId,
      eventId: event._id,
    });

    if (!ticketType) {
      return next(new AppError("Ticket type not found for this event", 404));
    }

    if (typeof data.name === "string") {
      const normalizedName = data.name.trim().toUpperCase();

      const existingTicketType = await TicketType.findOne({
        _id: { $ne: ticketType._id },
        eventId: event._id,
        name: normalizedName,
      }).lean();

      if (existingTicketType) {
        return next(
          new AppError(
            "Ticket type with this name already exists for this event",
            400,
          ),
        );
      }

      ticketType.name = normalizedName;
    }

    if (typeof data.description === "string")
      ticketType.description = data.description;
    if (typeof data.price === "number") ticketType.price = data.price;
    if (typeof data.displayOrder === "number")
      ticketType.displayOrder = data.displayOrder;
    if (typeof data.isActive === "boolean") ticketType.isActive = data.isActive;

    await ticketType.save();

    res.status(200).json({
      status: "success",
      data: {
        event: {
          id: event._id,
          title: event.title,
        },
        ticketType,
      },
    });
  },
);
