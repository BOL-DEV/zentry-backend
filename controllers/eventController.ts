import Event from "../models/event";
import { TicketType } from "../models/ticketTypes";
import {
  createEventSchema,
  eventIdParamSchema,
  updateEventSchema,
} from "../validations/event.schema";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/appError";
import { Request, Response, NextFunction } from "express";
import {
  deleteCloudinaryAsset,
  MEDIA_FOLDERS,
  uploadImageBuffer,
} from "../services/cloudinaryService";
import { getUploadedFile } from "../utils/mediaHelpers";

type PopulatedOrganizerRef = {
  slug?: string;
} | null;

type EventWithPopulatedOrganizer = {
  _id: unknown;
  organizerId?: PopulatedOrganizerRef;
};

export const createEvent = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return next(new AppError("User not found", 401));
    }

    const organizerId = user.organizerId;
    const body = req.body as Record<string, unknown>;
    const eventDate = new Date(String(body.date || ""));

    const existingEvent = await Event.findOne({
      organizerId,
      title: String(body.title || ""),
      date: eventDate,
    }).lean();

    if (existingEvent) {
      return next(
        new AppError(
          "An event with this title and date already exists for this organizer",
          400,
        ),
      );
    }

    let uploadedPoster:
      | {
          url: string;
          publicId: string;
        }
      | undefined;

    try {
      const posterFile = getUploadedFile(req, "poster");

      if (posterFile) {
        uploadedPoster = await uploadImageBuffer({
          buffer: posterFile.buffer,
          folder: MEDIA_FOLDERS.eventPoster,
          filename: String(body.title || "event-poster"),
        });
      }

      const data = createEventSchema.parse({
        ...body,
        ...(uploadedPoster ? { posterUrl: uploadedPoster.url } : {}),
      });

      const event = await Event.create({
        ...data,
        date: new Date(data.date),
        organizerId,
        posterPublicId: uploadedPoster?.publicId ?? null,
      });

      res.status(201).json({
        status: "success",
        data: {
          event,
        },
      });
    } catch (error) {
      await deleteCloudinaryAsset(uploadedPoster?.publicId);
      throw error;
    }
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
    const events = (await Event.find()
      .populate("organizerId", "slug")
      .sort({ date: 1, createdAt: -1 })
      .lean()) as EventWithPopulatedOrganizer[];

    res.status(200).json({
      status: "success",
      results: events.length,
      data: {
        events,
      },
    });
  },
);

export const getPastEvents = catchAsync(async (req: Request, res: Response) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;

  const now = new Date();

  const filter: Record<string, unknown> = {
    date: { $lt: now },
  };

  const [events, total] = await Promise.all([
    Event.find(filter)
      .populate("organizerId", "slug name")
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean() as unknown as EventWithPopulatedOrganizer[],
    Event.countDocuments(filter),
  ]);

  const formattedEvents = events.map((event) => {
    const organizerSlug =
      event.organizerId && typeof event.organizerId === "object"
        ? (event.organizerId as any).slug
        : undefined;
    const organizerName =
      event.organizerId && typeof event.organizerId === "object"
        ? (event.organizerId as any).name
        : undefined;

    return {
      ...event,
      eventId: (event as any)._id,
      organizerSlug,
      organizerName,
    };
  });

  res.status(200).json({
    status: "success",
    results: formattedEvents.length,
    page,
    limit,
    total,
    data: {
      events: formattedEvents,
    },
  });
});

export const getEventById = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const organizer = req.organizer;
    const eventRef = req.event;

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }

    if (!eventRef) {
      return next(new AppError("Event not found", 404));
    }

    const event = await Event.findOne({
      _id: eventRef._id,
      organizerId: organizer._id,
    }).lean();

    if (!event) {
      return next(new AppError("Event not found for this organizer", 404));
    }

    const ticketTypes = await TicketType.find({
      eventId: event._id,
      isActive: true,
    })
      .select(
        "_id name description price quantityAvailable quantitySold quantityReserved displayOrder isActive createdAt updatedAt",
      )
      .sort({ displayOrder: 1, createdAt: 1 })
      .lean();

    res.status(200).json({
      status: "success",
      data: {
        organizer: {
          slug: organizer.slug,
          name: organizer.name,
        },
        event,
        ticketTypes,
      },
    });
  },
);

export const updateEvent = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return next(new AppError("User not found", 401));
    }

    const { eventId } = eventIdParamSchema.parse(req.params);

    const event = await Event.findOne({
      _id: eventId,
      organizerId: user.organizerId,
    });

    if (!event) {
      return next(new AppError("Event not found for this organizer", 404));
    }

    let uploadedPoster:
      | {
          url: string;
          publicId: string;
        }
      | undefined;

    try {
      const posterFile = getUploadedFile(req, "poster");

      if (posterFile) {
        uploadedPoster = await uploadImageBuffer({
          buffer: posterFile.buffer,
          folder: MEDIA_FOLDERS.eventPoster,
          filename: event.title,
        });
      }

      const data = updateEventSchema.parse({
        ...(req.body as Record<string, unknown>),
        ...(uploadedPoster ? { posterUrl: uploadedPoster.url } : {}),
      });

      if (!Object.keys(data).length) {
        return next(new AppError("No updates provided", 400));
      }

    const nextTitle = typeof data.title === "string" ? data.title : event.title;
    const nextDate = data.date ? new Date(data.date) : event.date;

    const existingEvent = await Event.findOne({
      _id: { $ne: event._id },
      organizerId: user.organizerId,
      title: nextTitle,
      date: nextDate,
    }).lean();

    if (existingEvent) {
      return next(
        new AppError(
          "An event with this title and date already exists for this organizer",
          400,
        ),
      );
    }

      const previousPosterPublicId = event.posterPublicId;

      if (typeof data.title === "string") event.title = data.title;
      if (typeof data.description === "string")
        event.description = data.description;
      if (typeof data.location === "string") event.location = data.location;
      if (typeof data.posterUrl === "string") {
        event.posterUrl = data.posterUrl;
        if (uploadedPoster) {
          event.posterPublicId = uploadedPoster.publicId;
        }
      }
      if (typeof data.dressCode === "string") event.dressCode = data.dressCode;
      if (typeof data.policies === "string") event.policies = data.policies;
      if (data.date) event.date = new Date(data.date);

      await event.save();

      if (uploadedPoster) {
        await deleteCloudinaryAsset(previousPosterPublicId);
      }

      res.status(200).json({
        status: "success",
        data: {
          event,
        },
      });
    } catch (error) {
      await deleteCloudinaryAsset(uploadedPoster?.publicId);
      throw error;
    }
  },
);
