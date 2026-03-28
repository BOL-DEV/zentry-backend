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

    const existingEvent = await Event.findOne({
      organizerId: organizer._id,
      title: data.title,
      date: new Date(data.date),
    }).lean();

    if (existingEvent) {
      return next(
        new AppError(
          "An event with this title and date already exists for this organizer",
          400,
        ),
      );
    }

    const event = await Event.create({
      ...data,
      organizerId: organizer._id,
    });

    res.status(201).json({
      status: "success",
      data: {
        organizer: {
          slug: organizer.slug,
          name: organizer.name,
        },
        event,
      },
    });
  },
);

export const getOrganizerEvents = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const organizer = req.organizer;

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }

    const events = await Event.find({ organizerId: organizer._id })
      .sort({
        date: 1,
        createdAt: -1,
      })
      .lean();

    res.status(200).json({
      status: "success",
      results: events.length,
      data: {
        organizer: {
          slug: organizer.slug,
          name: organizer.name,
        },
        events,
      },
    });
  },
);

export const getOrganizerLandingEvents = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const organizer = req.organizer;

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }

    const now = new Date();

    const featuredEvent = await Event.findOne({
      organizerId: organizer._id,
      date: { $gte: now },
    })
      .sort({
        date: 1,
        createdAt: -1,
      })
      .lean();

    const upcomingEvents = await Event.find({
      organizerId: organizer._id,
      date: { $gte: now },
      ...(featuredEvent ? { _id: { $ne: featuredEvent._id } } : {}),
    })
      .sort({
        date: 1,
        createdAt: -1,
      })
      .limit(3)
      .lean();

    const pastEvents = await Event.find({
      organizerId: organizer._id,
      date: { $lt: now },
    })
      .sort({
        date: -1,
        createdAt: -1,
      })
      .limit(3)
      .lean();

    res.status(200).json({
      status: "success",
      data: {
        featuredEvent: featuredEvent ?? null,
        upcomingEvents,
        pastEvents,
      },
    });
  },
);

export const getAllEvents = catchAsync(
  async (_req: Request, res: Response, _next: NextFunction) => {
    const events = await Event.find().sort({ date: 1, createdAt: -1 });
    res.status(200).json({
      status: "success",
      results: events.length,
      data: {
        events,
      },
    });
  },
);

export const getEventById = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const organizer = req.organizer;
    const event = req.event;

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }

    if (!event) {
      return next(new AppError("Event not found", 404));
    }

    res.status(200).json({
      status: "success",
      data: {
        organizer: {
          slug: organizer.slug,
          name: organizer.name,
        },
        event,
      },
    });
  },
);




