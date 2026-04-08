import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import Event from "../models/event";
import Order from "../models/order";
import Ticket from "../models/ticket";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import { eventIdParamSchema } from "../validations/event.schema";

const isValidObjectId = (value: string) =>
  mongoose.Types.ObjectId.isValid(value);

const parseBooleanQuery = (value: unknown): boolean | undefined => {
  if (typeof value !== "string") return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
};

export const getAdminEvents = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.max(Number(req.query.limit) || 10, 1);
    const skip = (page - 1) * limit;

    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";

    const organizerId =
      typeof req.query.organizerId === "string"
        ? req.query.organizerId.trim()
        : "";

    const upcoming = parseBooleanQuery(req.query.upcoming);

    const now = new Date();

    const filter: Record<string, unknown> = {};

    if (organizerId) {
      if (!isValidObjectId(organizerId)) {
        return next(new AppError("Invalid organizer ID", 400));
      }
      filter.organizerId = new mongoose.Types.ObjectId(organizerId);
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

export const getAdminEventById = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { eventId } = eventIdParamSchema.parse(req.params);

    if (eventId) {
      return next(new AppError("Invalid event ID", 400));
    }

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
            eventId: new mongoose.Types.ObjectId(eventId),
            paymentStatus: "paid",
          },
        },
        {
          $group: {
            _id: null,
            totalPaidOrders: { $sum: 1 },
            grossRevenue: { $sum: "$totalAmount" },
            platformFees: { $sum: "$platformFeeTotal" },
            paystackFees: { $sum: "$paystackFeeTotal" },
            expectedNetSettlement: { $sum: "$expectedNetSettlement" },
          },
        },
      ]),
      Ticket.aggregate([
        {
          $match: {
            eventId: new mongoose.Types.ObjectId(eventId),
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
        eventId: new mongoose.Types.ObjectId(eventId),
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
      paystackFees: 0,
      expectedNetSettlement: 0,
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
          paystackFees: orderSummary.paystackFees,
          expectedNetSettlement: orderSummary.expectedNetSettlement,
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
