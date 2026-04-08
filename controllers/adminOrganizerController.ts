import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import Organizer from "../models/organizer";
import Event from "../models/event";
import Order from "../models/order";
import Ticket from "../models/ticket";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import { organizerIdParamSchema } from "../validations/organizer.schema";

const parseBooleanQuery = (value: unknown): boolean | undefined => {
  if (typeof value !== "string") return undefined;

  if (value === "true") return true;
  if (value === "false") return false;

  return undefined;
};

export const getAdminOrganizers = catchAsync(
  async (req: Request, res: Response) => {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.max(Number(req.query.limit) || 10, 1);
    const skip = (page - 1) * limit;

    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";

    const isActive = parseBooleanQuery(req.query.isActive);

    const filter: Record<string, unknown> = {};

    if (typeof isActive === "boolean") {
      filter.isActive = isActive;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { slug: { $regex: search, $options: "i" } },
        { contactEmail: { $regex: search, $options: "i" } },
      ];
    }

    const [organizers, total] = await Promise.all([
      Organizer.find(filter)
        .select(
          "name slug logoUrl contactEmail contactPhone isActive createdAt",
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Organizer.countDocuments(filter),
    ]);

    const organizerIds = organizers.map((organizer) => organizer._id);

    let statsMap = new Map<
      string,
      {
        totalEvents: number;
        totalPaidOrders: number;
        totalTicketsSold: number;
        grossRevenue: number;
      }
    >();

    if (organizerIds.length) {
      const eventStats = await Event.aggregate([
        {
          $match: {
            organizerId: { $in: organizerIds },
          },
        },
        {
          $group: {
            _id: "$organizerId",
            totalEvents: { $sum: 1 },
          },
        },
      ]);

      const orderStats = await Order.aggregate([
        {
          $lookup: {
            from: "events",
            localField: "eventId",
            foreignField: "_id",
            as: "event",
          },
        },
        {
          $unwind: "$event",
        },
        {
          $match: {
            "event.organizerId": { $in: organizerIds },
            paymentStatus: "paid",
          },
        },
        {
          $group: {
            _id: "$event.organizerId",
            totalPaidOrders: { $sum: 1 },
            grossRevenue: { $sum: "$totalAmount" },
          },
        },
      ]);

      const ticketStats = await Ticket.aggregate([
        {
          $lookup: {
            from: "events",
            localField: "eventId",
            foreignField: "_id",
            as: "event",
          },
        },
        {
          $unwind: "$event",
        },
        {
          $match: {
            "event.organizerId": { $in: organizerIds },
          },
        },
        {
          $group: {
            _id: "$event.organizerId",
            totalTicketsSold: { $sum: 1 },
          },
        },
      ]);

      statsMap = new Map(
        organizerIds.map((id) => [
          id.toString(),
          {
            totalEvents: 0,
            totalPaidOrders: 0,
            totalTicketsSold: 0,
            grossRevenue: 0,
          },
        ]),
      );

      for (const stat of eventStats) {
        const key = stat._id.toString();
        const current = statsMap.get(key);
        if (current) current.totalEvents = stat.totalEvents;
      }

      for (const stat of orderStats) {
        const key = stat._id.toString();
        const current = statsMap.get(key);
        if (current) {
          current.totalPaidOrders = stat.totalPaidOrders;
          current.grossRevenue = stat.grossRevenue;
        }
      }

      for (const stat of ticketStats) {
        const key = stat._id.toString();
        const current = statsMap.get(key);
        if (current) current.totalTicketsSold = stat.totalTicketsSold;
      }
    }

    const formattedOrganizers = organizers.map((organizer) => {
      const stats = statsMap.get(organizer._id.toString()) || {
        totalEvents: 0,
        totalPaidOrders: 0,
        totalTicketsSold: 0,
        grossRevenue: 0,
      };

      return {
        id: organizer._id,
        name: organizer.name,
        slug: organizer.slug,
        logoUrl: organizer.logoUrl || "",
        contactEmail: organizer.contactEmail || "",
        contactPhone: organizer.contactPhone || "",
        isActive: organizer.isActive,
        createdAt: organizer.createdAt,
        stats,
      };
    });

    res.status(200).json({
      status: "success",
      results: formattedOrganizers.length,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      data: {
        organizers: formattedOrganizers,
      },
    });
  },
);

export const getAdminOrganizerById = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { organizerId } = organizerIdParamSchema.parse(req.params);

    if (!mongoose.Types.ObjectId.isValid(organizerId)) {
      return next(new AppError("Invalid organizer ID", 400));
    }

    const organizer = await Organizer.findById(organizerId)
      .select(
        "name slug logoUrl heroTitle heroSubtitle about contactEmail contactPhone isActive createdAt updatedAt",
      )
      .lean();

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }

    const [eventStats, orderStats, ticketStats, recentEvents] =
      await Promise.all([
        Event.countDocuments({ organizerId: organizer._id }),
        Order.aggregate([
          {
            $lookup: {
              from: "events",
              localField: "eventId",
              foreignField: "_id",
              as: "event",
            },
          },
          {
            $unwind: "$event",
          },
          {
            $match: {
              "event.organizerId": organizer._id,
              paymentStatus: "paid",
            },
          },
          {
            $group: {
              _id: null,
              totalPaidOrders: { $sum: 1 },
              grossRevenue: { $sum: "$totalAmount" },
              platformFees: { $sum: "$platformFeeTotal" },
            },
          },
        ]),
        Ticket.aggregate([
          {
            $lookup: {
              from: "events",
              localField: "eventId",
              foreignField: "_id",
              as: "event",
            },
          },
          {
            $unwind: "$event",
          },
          {
            $match: {
              "event.organizerId": organizer._id,
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
        Event.find({ organizerId: organizer._id })
          .select("_id title date location createdAt")
          .sort({ date: -1 })
          .limit(10)
          .lean(),
      ]);

    const orderSummary = orderStats[0] || {
      totalPaidOrders: 0,
      grossRevenue: 0,
      platformFees: 0,
    };

    const ticketSummary = ticketStats[0] || {
      totalTicketsSold: 0,
      totalCheckedInTickets: 0,
    };

    res.status(200).json({
      status: "success",
      data: {
        organizer: {
          id: organizer._id,
          name: organizer.name,
          slug: organizer.slug,
          logoUrl: organizer.logoUrl || "",
          heroTitle: organizer.heroTitle || "",
          heroSubtitle: organizer.heroSubtitle || "",
          about: organizer.about || "",
          contactEmail: organizer.contactEmail || "",
          contactPhone: organizer.contactPhone || "",
          isActive: organizer.isActive,
          createdAt: organizer.createdAt,
          updatedAt: organizer.updatedAt,
        },
        stats: {
          totalEvents: eventStats,
          totalPaidOrders: orderSummary.totalPaidOrders,
          grossRevenue: orderSummary.grossRevenue,
          platformFees: orderSummary.platformFees,
          totalTicketsSold: ticketSummary.totalTicketsSold,
          totalCheckedInTickets: ticketSummary.totalCheckedInTickets,
        },
        recentEvents: recentEvents.map((event) => ({
          id: event._id,
          title: event.title,
          date: event.date,
          location: event.location,
          createdAt: event.createdAt,
        })),
      },
    });
  },
);

export const toggleAdminOrganizerActiveState = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { organizerId } = organizerIdParamSchema.parse(req.params);

    if (!mongoose.Types.ObjectId.isValid(organizerId)) {
      return next(new AppError("Invalid organizer ID", 400));
    }

    const organizer = await Organizer.findById(organizerId);

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }

    organizer.isActive = !organizer.isActive;
    await organizer.save();

    res.status(200).json({
      status: "success",
      message: `Organizer has been ${
        organizer.isActive ? "reactivated" : "suspended"
      } successfully`,
      data: {
        organizer: {
          id: organizer._id,
          name: organizer.name,
          slug: organizer.slug,
          isActive: organizer.isActive,
        },
      },
    });
  },
);
