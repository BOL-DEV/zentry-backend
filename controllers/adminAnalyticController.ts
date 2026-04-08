import { Request, Response } from "express";
import Organizer from "../models/organizer";
import Event from "../models/event";
import Order from "../models/order";
import Ticket from "../models/ticket";
import { catchAsync } from "../utils/catchAsync";

export const getAdminAnalyticsSummary = catchAsync(
  async (_req: Request, res: Response) => {
    const now = new Date();

    const totalOrganizers = await Organizer.countDocuments();
    const activeOrganizers = await Organizer.countDocuments({
      isActive: true,
    });
    const inactiveOrganizers = totalOrganizers - activeOrganizers;


    const totalEvents = await Event.countDocuments();

    const upcomingEvents = await Event.countDocuments({
      date: { $gte: now },
    });

    const completedEvents = await Event.countDocuments({
      date: { $lt: now },
    });


    const orderAgg = await Order.aggregate([
      {
        $match: {
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
    ]);

    const orderSummary = orderAgg[0] || {
      totalPaidOrders: 0,
      grossRevenue: 0,
      platformFees: 0,
    };

   
    const ticketAgg = await Ticket.aggregate([
      {
        $group: {
          _id: null,
          totalTicketsIssued: { $sum: 1 },
          totalCheckedInTickets: {
            $sum: {
              $cond: [{ $eq: ["$status", "checked-in"] }, 1, 0],
            },
          },
        },
      },
    ]);

    const ticketSummary = ticketAgg[0] || {
      totalTicketsIssued: 0,
      totalCheckedInTickets: 0,
    };


    res.status(200).json({
      status: "success",
      data: {
        organizers: {
          total: totalOrganizers,
          active: activeOrganizers,
          inactive: inactiveOrganizers,
        },
        events: {
          total: totalEvents,
          upcoming: upcomingEvents,
          completed: completedEvents,
        },
        orders: {
          totalPaidOrders: orderSummary.totalPaidOrders,
          grossRevenue: orderSummary.grossRevenue,
        },
        tickets: {
          totalIssued: ticketSummary.totalTicketsIssued,
          totalCheckedIn: ticketSummary.totalCheckedInTickets,
        },
        revenue: {
          platformFees: orderSummary.platformFees,
        },
      },
    });
  },
);
