import { Types } from "mongoose";
import { Request, Response, NextFunction } from "express";
import Event from "../models/event";
import Order from "../models/order";
import Ticket from "../models/ticket";
import { TicketType } from "../models/ticketTypes";
import { eventIdParamSchema } from "../validations/event.schema";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import { syncSquadSettlements } from "../services/syncSquadSettlement";

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
  },
);

export const getEventSettlementSummary = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError("You are not logged in", 401));
    }

    const { eventId } = eventIdParamSchema.parse(req.params);

    if (!Types.ObjectId.isValid(eventId)) {
      return next(new AppError("Invalid event ID", 400));
    }

    const event = await Event.findOne({
      _id: eventId,
      organizerId: req.user.organizerId,
    }).select("title date location organizerId");

    if (!event) {
      return next(new AppError("Event not found", 404));
    }

    const summaryAgg = await Order.aggregate([
      {
        $match: {
          eventId: event._id,
          paymentStatus: "paid",
        },
      },
      {
        $group: {
          _id: null,
          confirmedSales: { $sum: "$totalAmount" },
          platformFees: { $sum: "$platformFeeTotal" },
          squadGatewayFees: { $sum: "$squadGatewayFee" },
          squadTransferFees: { $sum: "$squadTransferFee" },
          organizerPayoutAmount: { $sum: "$organizerPayoutAmount" },
          totalPaidOrders: { $sum: 1 },

          pendingSettlement: {
            $sum: {
              $cond: [
                { $in: ["$settlementStatus", ["pending", "processing"]] },
                "$organizerPayoutAmount",
                0,
              ],
            },
          },

          settled: {
            $sum: {
              $cond: [
                { $eq: ["$settlementStatus", "settled"] },
                "$organizerPayoutAmount",
                0,
              ],
            },
          },
        },
      },
    ]);

    const summary = summaryAgg[0] || {
      confirmedSales: 0,
      pendingSettlement: 0,
      settled: 0,
      platformFees: 0,
      squadGatewayFees: 0,
      squadTransferFees: 0,
      organizerPayoutAmount: 0,
      totalPaidOrders: 0,
    };

    // Pagination
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const perPage = Math.max(
      1,
      Math.min(100, parseInt(req.query.perPage as string) || 20),
    );
    const skip = (page - 1) * perPage;

    const totalOrders = await Order.countDocuments({
      eventId: event._id,
      paymentStatus: "paid",
    });

    const orders = await Order.find({
      eventId: event._id,
      paymentStatus: "paid",
    })
      .select(
        "buyerName buyerEmail paymentReference totalAmount platformFeeTotal squadGatewayFee squadTransferFee organizerPayoutAmount settlementStatus paidAt settlementDate",
      )
      .sort({ paidAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(perPage)
      .lean();

    const totalPages = Math.ceil(totalOrders / perPage);

    res.status(200).json({
      status: "success",
      data: {
        event: {
          id: event._id,
          title: event.title,
          date: event.date,
          location: event.location,
        },
        summary,
        pagination: {
          page,
          perPage,
          totalOrders,
          totalPages,
        },
        orders: orders.map((order) => ({
          id: order._id,
          buyerName: order.buyerName,
          buyerEmail: order.buyerEmail,
          paymentReference: order.paymentReference,
          grossAmount: order.totalAmount,
          platformFeeTotal: order.platformFeeTotal,
          squadGatewayFee: order.squadGatewayFee || 0,
          squadTransferFee: order.squadTransferFee || 0,
          organizerPayoutAmount: order.organizerPayoutAmount || 0,
          settlementStatus: order.settlementStatus,
          paidAt: order.paidAt,
          settlementDate: order.settlementDate,
        })),
      },
    });
  },
);

export const syncOrganizerSettlements = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError("You are not logged in", 401));
    }

    const organizerEvents = await Event.find({
      organizerId: req.user.organizerId,
    })
      .select("_id")
      .lean();

    const eventIds = organizerEvents.map((event) => event._id);

    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 7);

    const result = await syncSquadSettlements({
      from,
      to: now,
      eventIds,
    });

    res.status(200).json({
      status: "success",
      data: result,
    });
  },
);

export const getOrganizerSettlementSummary = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError("You are not logged in", 401));
    }

    const organizerId = req.user.organizerId;

    const organizerEvents = await Event.find({
      organizerId,
    })
      .select("_id title date location")
      .lean();

    const eventIds = organizerEvents.map((event) => event._id);

    if (!eventIds.length) {
      return res.status(200).json({
        status: "success",
        data: {
          summary: {
            confirmedSales: 0,
            pendingSettlement: 0,
            settled: 0,
            platformFees: 0,
            squadGatewayFees: 0,
            squadTransferFees: 0,
            organizerPayoutAmount: 0,
            totalPaidOrders: 0,
            totalEventsWithSales: 0,
          },
          events: [],
          recentOrders: [],
        },
      });
    }

    const summaryAgg = await Order.aggregate([
      {
        $match: {
          eventId: { $in: eventIds },
          paymentStatus: "paid",
        },
      },
      {
        $group: {
          _id: null,
          confirmedSales: { $sum: "$totalAmount" },
          platformFees: { $sum: "$platformFeeTotal" },
          squadGatewayFees: { $sum: "$squadGatewayFee" },
          squadTransferFees: { $sum: "$squadTransferFee" },
          organizerPayoutAmount: { $sum: "$organizerPayoutAmount" },
          totalPaidOrders: { $sum: 1 },

          pendingSettlement: {
            $sum: {
              $cond: [
                { $in: ["$settlementStatus", ["pending", "processing"]] },
                "$organizerPayoutAmount",
                0,
              ],
            },
          },

          settled: {
            $sum: {
              $cond: [
                { $eq: ["$settlementStatus", "settled"] },
                "$organizerPayoutAmount",
                0,
              ],
            },
          },
        },
      },
    ]);

    const eventBreakdownAgg = await Order.aggregate([
      {
        $match: {
          eventId: { $in: eventIds },
          paymentStatus: "paid",
        },
      },
      {
        $group: {
          _id: "$eventId",
          confirmedSales: { $sum: "$totalAmount" },
          platformFees: { $sum: "$platformFeeTotal" },
          squadGatewayFees: { $sum: "$squadGatewayFee" },
          squadTransferFees: { $sum: "$squadTransferFee" },
          organizerPayoutAmount: { $sum: "$organizerPayoutAmount" },
          totalPaidOrders: { $sum: 1 },

          pendingSettlement: {
            $sum: {
              $cond: [
                { $in: ["$settlementStatus", ["pending", "processing"]] },
                "$organizerPayoutAmount",
                0,
              ],
            },
          },

          settled: {
            $sum: {
              $cond: [
                { $eq: ["$settlementStatus", "settled"] },
                "$organizerPayoutAmount",
                0,
              ],
            },
          },
        },
      },
      {
        $sort: {
          confirmedSales: -1,
        },
      },
    ]);

    const summary = summaryAgg[0] || {
      confirmedSales: 0,
      pendingSettlement: 0,
      settled: 0,
      platformFees: 0,
      squadGatewayFees: 0,
      squadTransferFees: 0,
      organizerPayoutAmount: 0,
      totalPaidOrders: 0,
    };

    const eventMap = new Map(
      organizerEvents.map((event) => [event._id.toString(), event]),
    );

    const events = eventBreakdownAgg.map((item) => {
      const event = eventMap.get(item._id.toString());

      return {
        eventId: item._id,
        title: event?.title || "Unknown Event",
        date: event?.date || null,
        location: event?.location || "",
        confirmedSales: item.confirmedSales,
        pendingSettlement: item.pendingSettlement,
        settled: item.settled,
        platformFees: item.platformFees,
        squadGatewayFees: item.squadGatewayFees,
        squadTransferFees: item.squadTransferFees,
        organizerPayoutAmount: item.organizerPayoutAmount,
        totalPaidOrders: item.totalPaidOrders,
      };
    });

    // Pagination for recent orders
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const perPage = Math.max(
      1,
      Math.min(100, parseInt(req.query.perPage as string) || 20),
    );
    const skip = (page - 1) * perPage;

    const totalOrders = await Order.countDocuments({
      eventId: { $in: eventIds },
      paymentStatus: "paid",
    });

    const recentOrders = await Order.find({
      eventId: { $in: eventIds },
      paymentStatus: "paid",
    })
      .select(
        "eventId buyerName buyerEmail paymentReference totalAmount platformFeeTotal squadGatewayFee squadTransferFee organizerPayoutAmount settlementStatus paidAt settlementDate createdAt",
      )
      .sort({ paidAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(perPage)
      .lean();

    const totalPages = Math.ceil(totalOrders / perPage);

    const formattedRecentOrders = recentOrders.map((order) => {
      const event = eventMap.get(order.eventId.toString());

      return {
        id: order._id,
        eventId: order.eventId,
        eventTitle: event?.title || "Unknown Event",
        buyerName: order.buyerName,
        buyerEmail: order.buyerEmail,
        paymentReference: order.paymentReference,
        grossAmount: order.totalAmount,
        platformFeeTotal: order.platformFeeTotal,
        squadGatewayFee: order.squadGatewayFee || 0,
        squadTransferFee: order.squadTransferFee || 0,
        organizerPayoutAmount: order.organizerPayoutAmount || 0,
        settlementStatus: order.settlementStatus,
        paidAt: order.paidAt,
        settlementDate: order.settlementDate,
      };
    });

    res.status(200).json({
      status: "success",
      data: {
        summary: {
          ...summary,
          totalEventsWithSales: events.length,
        },
        events,
        pagination: {
          page,
          perPage,
          totalOrders,
          totalPages,
        },
        recentOrders: formattedRecentOrders,
      },
    });
  },
);
