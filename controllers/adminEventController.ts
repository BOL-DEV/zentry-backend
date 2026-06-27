import { Request, Response, NextFunction } from "express";
import Event from "../models/event";
import Organizer from "../models/organizer";
import Order from "../models/order";
import Ticket from "../models/ticket";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import {
  createEventSchema,
  eventIdParamSchema,
  updateEventSchema,
} from "../validations/event.schema";
import { adminEventsQuerySchema } from "../validations/adminEvent.schema";
import {
  createTicketTypeSchema,
  ticketTypeIdParamSchema,
  updateTicketTypeQuantitySchema,
  updateTicketTypeSchema,
} from "../validations/ticketType.schema";
import { TicketType } from "../models/ticketTypes";
import { organizerIdParamSchema } from "../validations/organizer.schema";
import {
  deleteCloudinaryAsset,
  MEDIA_FOLDERS,
  uploadImageBuffer,
} from "../services/cloudinaryService";
import { getUploadedFile } from "../utils/mediaHelpers";

export const getAdminEvents = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { page, limit, search, organizerId, upcoming } =
      adminEventsQuerySchema.parse(req.query);

    const skip = (page - 1) * limit;

    const now = new Date();

    const filter: Record<string, unknown> = {};

    if (organizerId) {
      filter.organizerId = organizerId;
    }

    if (typeof upcoming === "boolean") {
      filter.date = upcoming ? { $gte: now } : { $lt: now };
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
      ];
    }

    const [events, total] = await Promise.all([
      Event.find(filter)
        .populate({
          path: "organizerId",
          select: "name slug isActive",
        })
        .select(
          "organizerId title description date location posterUrl dressCode policies createdAt",
        )
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Event.countDocuments(filter),
    ]);

    const eventIds = events.map((event) => event._id);

    let statsMap = new Map<
      string,
      {
        totalPaidOrders: number;
        totalTicketsSold: number;
        totalCheckedInTickets: number;
        grossRevenue: number;
        platformFees: number;
      }
    >();

    if (eventIds.length) {
      const orderStats = await Order.aggregate([
        {
          $match: {
            eventId: { $in: eventIds },
            paymentStatus: "paid",
          },
        },
        {
          $group: {
            _id: "$eventId",
            totalPaidOrders: { $sum: 1 },
            grossRevenue: { $sum: "$totalAmount" },
            platformFees: { $sum: "$platformFeeTotal" },
          },
        },
      ]);

      const ticketStats = await Ticket.aggregate([
        {
          $match: {
            eventId: { $in: eventIds },
          },
        },
        {
          $group: {
            _id: "$eventId",
            totalTicketsSold: { $sum: 1 },
            totalCheckedInTickets: {
              $sum: {
                $cond: [{ $eq: ["$status", "checked-in"] }, 1, 0],
              },
            },
          },
        },
      ]);

      statsMap = new Map(
        eventIds.map((id) => [
          id.toString(),
          {
            totalPaidOrders: 0,
            totalTicketsSold: 0,
            totalCheckedInTickets: 0,
            grossRevenue: 0,
            platformFees: 0,
          },
        ]),
      );

      for (const stat of orderStats) {
        const key = stat._id.toString();
        const current = statsMap.get(key);
        if (current) {
          current.totalPaidOrders = stat.totalPaidOrders;
          current.grossRevenue = stat.grossRevenue;
          current.platformFees = stat.platformFees;
        }
      }

      for (const stat of ticketStats) {
        const key = stat._id.toString();
        const current = statsMap.get(key);
        if (current) {
          current.totalTicketsSold = stat.totalTicketsSold;
          current.totalCheckedInTickets = stat.totalCheckedInTickets;
        }
      }
    }

    const formattedEvents = events.map((event: any) => {
      const stats = statsMap.get(event._id.toString()) || {
        totalPaidOrders: 0,
        totalTicketsSold: 0,
        totalCheckedInTickets: 0,
        grossRevenue: 0,
        platformFees: 0,
      };

      return {
        id: event._id,
        title: event.title,
        description: event.description || "",
        date: event.date,
        location: event.location || "",
        posterUrl: event.posterUrl || "",
        dressCode: event.dressCode || "",
        policies: event.policies || "",
        createdAt: event.createdAt,
        isUpcoming: event.date >= now,
        organizer: {
          id: event.organizerId?._id,
          name: event.organizerId?.name || "",
          slug: event.organizerId?.slug || "",
          isActive: event.organizerId?.isActive ?? true,
        },
        stats,
      };
    });

    res.status(200).json({
      status: "success",
      results: formattedEvents.length,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      data: {
        events: formattedEvents,
      },
    });
  },
);

export const createAdminEventForOrganizer = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { organizerId } = organizerIdParamSchema.parse(req.params);
    const body = req.body as Record<string, unknown>;

    const organizerExists = await Organizer.exists({ _id: organizerId });

    if (!organizerExists) {
      return next(new AppError("Organizer not found", 404));
    }

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

export const getAdminEventById = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { eventId } = eventIdParamSchema.parse(req.params);

    const event = await Event.findById(eventId)
      .populate({
        path: "organizerId",
        select: "name slug contactEmail contactPhone isActive",
      })
      .select(
        "organizerId title description date location posterUrl dressCode policies createdAt updatedAt",
      )
      .lean();

    if (!event) {
      return next(new AppError("Event not found", 404));
    }

    const [orderStats, ticketStats, recentOrders] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            eventId,
            paymentStatus: "paid",
          },
        },
        {
          $group: {
            _id: null,
            totalPaidOrders: { $sum: 1 },
            grossRevenue: { $sum: "$totalAmount" },
            platformFees: { $sum: "$platformFeeTotal" },
            squadGatewayFees: { $sum: "$squadGatewayFee" },
            squadTransferFees: { $sum: "$squadTransferFee" },
            organizerPayoutAmount: { $sum: "$organizerPayoutAmount" },
          },
        },
      ]),
      Ticket.aggregate([
        {
          $match: {
            eventId,
          },
        },
        {
          $group: {
            _id: null,
            totalTicketsSold: { $sum: 1 },
            totalCheckedInTickets: {
              $sum: {
                $cond: [{ $eq: ["$status", "checked-in"] }, 1, 0],
              },
            },
          },
        },
      ]),
      Order.find({
        eventId,
        paymentStatus: "paid",
      })
        .select(
          "buyerName buyerEmail paymentReference totalAmount paymentStatus settlementStatus paidAt createdAt",
        )
        .sort({ paidAt: -1, createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    const orderSummary = orderStats[0] || {
      totalPaidOrders: 0,
      grossRevenue: 0,
      platformFees: 0,
      squadGatewayFees: 0,
      squadTransferFees: 0,
      organizerPayoutAmount: 0,
    };

    const ticketSummary = ticketStats[0] || {
      totalTicketsSold: 0,
      totalCheckedInTickets: 0,
    };

    res.status(200).json({
      status: "success",
      data: {
        event: {
          id: event._id,
          title: event.title,
          description: event.description || "",
          date: event.date,
          location: event.location || "",
          posterUrl: event.posterUrl || "",
          dressCode: event.dressCode || "",
          policies: event.policies || "",
          createdAt: event.createdAt,
          updatedAt: event.updatedAt,
          isUpcoming: event.date >= new Date(),
          organizer: {
            id: (event.organizerId as any)?._id,
            name: (event.organizerId as any)?.name || "",
            slug: (event.organizerId as any)?.slug || "",
            contactEmail: (event.organizerId as any)?.contactEmail || "",
            contactPhone: (event.organizerId as any)?.contactPhone || "",
            isActive: (event.organizerId as any)?.isActive ?? true,
          },
        },
        stats: {
          totalPaidOrders: orderSummary.totalPaidOrders,
          grossRevenue: orderSummary.grossRevenue,
          platformFees: orderSummary.platformFees,
          squadGatewayFees: orderSummary.squadGatewayFees,
          squadTransferFees: orderSummary.squadTransferFees,
          organizerPayoutAmount: orderSummary.organizerPayoutAmount,
          totalTicketsSold: ticketSummary.totalTicketsSold,
          totalCheckedInTickets: ticketSummary.totalCheckedInTickets,
        },
        recentOrders: recentOrders.map((order) => ({
          id: order._id,
          buyerName: order.buyerName,
          buyerEmail: order.buyerEmail,
          paymentReference: order.paymentReference || "",
          totalAmount: order.totalAmount,
          paymentStatus: order.paymentStatus,
          settlementStatus: order.settlementStatus || "pending",
          paidAt: order.paidAt || null,
          createdAt: order.createdAt,
        })),
      },
    });
  },
);

export const updateAdminEvent = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { eventId } = eventIdParamSchema.parse(req.params);

    const event = await Event.findById(eventId);

    if (!event) {
      return next(new AppError("Event not found", 404));
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

      const incomingTitle =
        typeof data.title === "string" ? data.title.trim() : undefined;
      const incomingDate =
        typeof data.date === "string" ? new Date(data.date) : undefined;

      const nextTitle = incomingTitle ?? event.title;
      const nextDate = incomingDate ?? event.date;

      if (
        (incomingTitle || incomingDate) &&
        (nextTitle !== event.title ||
          nextDate.getTime() !== event.date.getTime())
      ) {
        const existing = await Event.findOne({
          _id: { $ne: event._id },
          organizerId: event.organizerId,
          title: nextTitle,
          date: nextDate,
        }).lean();

        if (existing) {
          return next(
            new AppError(
              "Another event with the same title and date already exists for this organizer",
              400,
            ),
          );
        }
      }

      const previousPosterPublicId = event.posterPublicId;

      if (incomingTitle) event.title = incomingTitle;
      if (typeof data.description === "string")
        event.description = data.description;
      if (incomingDate) event.date = incomingDate;
      if (typeof data.location === "string") event.location = data.location;
      if (typeof data.posterUrl === "string") {
        event.posterUrl = data.posterUrl;
        if (uploadedPoster) {
          event.posterPublicId = uploadedPoster.publicId;
        }
      }
      if (typeof data.dressCode === "string") event.dressCode = data.dressCode;
      if (typeof data.policies === "string") event.policies = data.policies;

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

export const updateAdminTicketTypeQuantity = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { eventId } = eventIdParamSchema.parse(req.params);
    const { ticketTypeId } = ticketTypeIdParamSchema.parse(req.params);
    const { quantityAvailable } = updateTicketTypeQuantitySchema.parse(
      req.body,
    );

    const event = await Event.findById(eventId).select("_id title").lean();

    if (!event) {
      return next(new AppError("Event not found", 404));
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

    ticketType.quantityAvailable = quantityAvailable;
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

export const updateAdminTicketType = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { eventId } = eventIdParamSchema.parse(req.params);
    const { ticketTypeId } = ticketTypeIdParamSchema.parse(req.params);
    const data = updateTicketTypeSchema.parse(req.body);

    if (!Object.keys(data).length) {
      return next(new AppError("No updates provided", 400));
    }

    const event = await Event.findById(eventId).select("_id title").lean();

    if (!event) {
      return next(new AppError("Event not found", 404));
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

export const createAdminTicketTypeForEvent = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { eventId } = eventIdParamSchema.parse(req.params);
    const data = createTicketTypeSchema.parse(req.body);

    const event = await Event.findById(eventId).select("_id title").lean();

    if (!event) {
      return next(new AppError("Event not found", 404));
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

export const getAdminEventAttendees = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { eventId } = eventIdParamSchema.parse(req.params);

    const event = await Event.findById(eventId).select("_id title").lean();

    if (!event) {
      return next(new AppError("Event not found", 404));
    }

    const tickets = await Ticket.find({ eventId: event._id })
      .select("buyerName buyerEmail ticketCode status ticketTypeId createdAt")
      .sort({ createdAt: -1 })
      .lean();

    const ticketTypeIds = [
      ...new Set(tickets.map((ticket) => ticket.ticketTypeId.toString())),
    ];

    const ticketTypes = await TicketType.find({
      _id: { $in: ticketTypeIds },
    })
      .select("_id name")
      .lean();

    const ticketTypeMap = new Map(
      ticketTypes.map((ticketType) => [
        ticketType._id.toString(),
        ticketType.name,
      ]),
    );

    const attendees = tickets.map((ticket) => ({
      id: ticket._id,
      buyerName: ticket.buyerName,
      buyerEmail: ticket.buyerEmail,
      ticketCode: ticket.ticketCode,
      status: ticket.status,
      ticketType:
        ticketTypeMap.get(ticket.ticketTypeId.toString()) || "Unknown",
      purchasedAt: ticket.createdAt,
    }));

    res.status(200).json({
      status: "success",
      results: attendees.length,
      data: {
        event: {
          id: event._id,
          title: event.title,
        },
        attendees,
      },
    });
  },
);

export const getAdminScannerSummary = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { eventId } = eventIdParamSchema.parse(req.params);

    const event = await Event.findById(eventId)
      .select("_id title date location")
      .lean();

    if (!event) {
      return next(new AppError("Event not found", 404));
    }

    const totalTicketsSold = await Ticket.countDocuments({
      eventId: event._id,
    });

    const totalCheckedIn = await Ticket.countDocuments({
      eventId: event._id,
      status: "checked-in",
    });

    const checkInPercentage =
      totalTicketsSold === 0
        ? 0
        : Number(((totalCheckedIn / totalTicketsSold) * 100).toFixed(2));

    res.status(200).json({
      status: "success",
      data: {
        event: {
          id: event._id,
          title: event.title,
          date: event.date,
          location: event.location,
        },
        scannerSummary: {
          totalTicketsSold,
          totalCheckedIn,
          totalUnchecked: totalTicketsSold - totalCheckedIn,
          checkInPercentage,
        },
      },
    });
  },
);

export const getAdminEventTicketTypes = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { eventId } = eventIdParamSchema.parse(req.params);

    const event = await Event.findById(eventId)
      .select("_id title organizerId date")
      .lean();

    if (!event) {
      return next(new AppError("Event not found", 404));
    }

    const ticketTypes = await TicketType.find({ eventId: event._id })
      .sort({ displayOrder: 1, createdAt: 1 })
      .lean();

    res.status(200).json({
      status: "success",
      results: ticketTypes.length,
      data: {
        event: {
          id: event._id,
          title: event.title,
          date: event.date,
          organizerId: event.organizerId,
        },
        ticketTypes,
      },
    });
  },
);
