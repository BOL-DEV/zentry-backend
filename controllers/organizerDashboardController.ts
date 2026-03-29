import { Request, Response, NextFunction } from "express";
import Event from "../models/event";
import Order from "../models/order";
import Ticket from "../models/ticket";
import { TicketType } from "../models/ticketTypes";
import { eventIdParamSchema } from "../validations/event.schema";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import { createEventSchema } from "../validations/event.schema";
import { createTicketTypeSchema } from "../validations/ticketType.schema";


export const createEvent = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return next(new AppError("User not found", 401));
    }

    const data = createEventSchema.parse(req.body);
    const organizerId = user.organizerId;
    const eventDate = new Date(data.date);

    const existingEvent = await Event.findOne({
      organizerId,
      title: data.title,
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

    const event = await Event.create({
      ...data,
      date: eventDate,
      organizerId,
    });

    res.status(201).json({
      status: "success",
      data: {
        event,
      },
    });
  },
);


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

export const getOrganizerDashboardSummary = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return next(new AppError("User not found", 401));
    }

    const organizerId = user.organizerId;

    const events = await Event.find({ organizerId }).select("_id").lean();
    const eventIds = events.map((event) => event._id);

    const totalEvents = events.length;

    const paidOrders = await Order.find({
      eventId: { $in: eventIds },
      paymentStatus: "paid",
    })
      .select("totalAmount")
      .lean();

    const totalOrders = paidOrders.length;

    const totalRevenue = paidOrders.reduce(
      (sum, order) => sum + order.totalAmount,
      0,
    );

    const totalTicketsSold = await Ticket.countDocuments({
      eventId: { $in: eventIds },
    });

    res.status(200).json({
      status: "success",
      data: {
        summary: {
          totalEvents,
          totalOrders,
          totalTicketsSold,
          totalRevenue,
        },
      },
    });
  },
);

export const getOrganizerEventStats = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return next(new AppError("User not found", 401));
    }

    const organizerId = user.organizerId;

    const events = await Event.find({ organizerId })
      .select("_id title date location")
      .sort({ date: 1 })
      .lean();

    const eventStats = await Promise.all(
      events.map(async (event) => {
        const paidOrders = await Order.find({
          eventId: event._id,
          paymentStatus: "paid",
        })
          .select("totalAmount")
          .lean();

        const revenue = paidOrders.reduce(
          (sum, order) => sum + order.totalAmount,
          0,
        );

        const ticketsSold = await Ticket.countDocuments({
          eventId: event._id,
        });

        return {
          id: event._id,
          title: event.title,
          date: event.date,
          location: event.location,
          ticketsSold,
          revenue,
          totalOrders: paidOrders.length,
        };
      }),
    );

    res.status(200).json({
      status: "success",
      results: eventStats.length,
      data: {
        events: eventStats,
      },
    });
  },
);

export const getEventAttendees = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return next(new AppError("User not found", 401));
    }

    const { eventId } = eventIdParamSchema.parse(req.params);

    const event = await Event.findOne({
      _id: eventId,
      organizerId: user.organizerId,
    })
      .select("_id title")
      .lean();

    if (!event) {
      return next(new AppError("Event not found for this organizer", 404));
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

export const getScannerSummary = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
      const user = req.user;
  
      if (!user) {
        return next(new AppError("User not found", 401));
      }
  
      const { eventId } = eventIdParamSchema.parse(req.params);
  
      const event = await Event.findOne({
        _id: eventId,
        organizerId: user.organizerId,
      })
        .select("_id title date location")
        .lean();
  
      if (!event) {
        return next(new AppError("Event not found for this organizer", 404));
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
    }
  );