import { Request, Response, NextFunction } from "express";
import mongoose, { PipelineStage } from "mongoose";
import Ticket from "../models/ticket";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import {
  adminTicketIdParamSchema,
  adminTicketsQuerySchema,
} from "../validations/adminTicket.schema";
import { verifyTicketSchema } from "../validations/verifyTicket.schema";

export const getAdminTickets = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { page, limit, search, status, eventId, organizerId } =
      adminTicketsQuerySchema.parse(req.query);

    const skip = (page - 1) * limit;

    const matchStage: Record<string, unknown> = {};

    if (status) {
      matchStage.status = status;
    }

    if (eventId) {
      matchStage.eventId = new mongoose.Types.ObjectId(eventId);
    }

    const pipeline: PipelineStage[] = [
      {
        $match: matchStage,
      },
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
        $lookup: {
          from: "organizers",
          localField: "event.organizerId",
          foreignField: "_id",
          as: "organizer",
        },
      },
      {
        $unwind: "$organizer",
      },
    ];

    if (organizerId) {
      pipeline.push({
        $match: {
          "organizer._id": new mongoose.Types.ObjectId(organizerId),
        },
      });
    }

    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { ticketCode: { $regex: search, $options: "i" } },
            { buyerName: { $regex: search, $options: "i" } },
            { buyerEmail: { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    const countPipeline = [
      ...pipeline,
      {
        $count: "total",
      },
    ];

    const dataPipeline = [
      ...pipeline,
      {
        $sort: {
          checkedInAt: -1 as const,
          createdAt: -1 as const,
        },
      },
      {
        $skip: skip,
      },
      {
        $limit: limit,
      },
      {
        $project: {
          _id: 1,
          orderId: 1,
          eventId: 1,
          ticketTypeId: 1,
          buyerName: 1,
          buyerEmail: 1,
          ticketCode: 1,
          status: 1,
          checkedInAt: 1,
          verifiedBy: 1,
          createdAt: 1,
          "event._id": 1,
          "event.title": 1,
          "event.date": 1,
          "event.location": 1,
          "organizer._id": 1,
          "organizer.name": 1,
          "organizer.slug": 1,
        },
      },
    ];

    const [countResult, tickets] = await Promise.all([
      Ticket.aggregate(countPipeline),
      Ticket.aggregate(dataPipeline),
    ]);

    const total = countResult[0]?.total || 0;

    res.status(200).json({
      status: "success",
      results: tickets.length,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      data: {
        tickets: tickets.map((ticket) => ({
          id: ticket._id,
          orderId: ticket.orderId,
          eventId: ticket.eventId,
          ticketTypeId: ticket.ticketTypeId,
          buyerName: ticket.buyerName,
          buyerEmail: ticket.buyerEmail,
          ticketCode: ticket.ticketCode,
          status: ticket.status,
          checkedInAt: ticket.checkedInAt || null,
          verifiedBy: ticket.verifiedBy || null,
          createdAt: ticket.createdAt,
          event: {
            id: ticket.event?._id,
            title: ticket.event?.title || "",
            date: ticket.event?.date || null,
            location: ticket.event?.location || "",
          },
          organizer: {
            id: ticket.organizer?._id,
            name: ticket.organizer?.name || "",
            slug: ticket.organizer?.slug || "",
          },
        })),
      },
    });
  },
);

export const getAdminTicketById = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { ticketId } = adminTicketIdParamSchema.parse(req.params);

    const ticketResult = await Ticket.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(ticketId),
        },
      },
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
        $lookup: {
          from: "organizers",
          localField: "event.organizerId",
          foreignField: "_id",
          as: "organizer",
        },
      },
      {
        $unwind: "$organizer",
      },
      {
        $lookup: {
          from: "dashboardusers",
          localField: "verifiedBy",
          foreignField: "_id",
          as: "verifiedUser",
        },
      },
      {
        $unwind: {
          path: "$verifiedUser",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          orderId: 1,
          eventId: 1,
          ticketTypeId: 1,
          buyerName: 1,
          buyerEmail: 1,
          ticketCode: 1,
          status: 1,
          checkedInAt: 1,
          verifiedBy: 1,
          createdAt: 1,
          updatedAt: 1,
          "event._id": 1,
          "event.title": 1,
          "event.date": 1,
          "event.location": 1,
          "organizer._id": 1,
          "organizer.name": 1,
          "organizer.slug": 1,
          "verifiedUser._id": 1,
          "verifiedUser.fullName": 1,
          "verifiedUser.email": 1,
          "verifiedUser.role": 1,
        },
      },
    ]);

    const ticket = ticketResult[0];

    if (!ticket) {
      return next(new AppError("Ticket not found", 404));
    }

    res.status(200).json({
      status: "success",
      data: {
        ticket: {
          id: ticket._id,
          orderId: ticket.orderId,
          eventId: ticket.eventId,
          ticketTypeId: ticket.ticketTypeId,
          buyerName: ticket.buyerName,
          buyerEmail: ticket.buyerEmail,
          ticketCode: ticket.ticketCode,
          status: ticket.status,
          checkedInAt: ticket.checkedInAt || null,
          verifiedBy: ticket.verifiedBy || null,
          createdAt: ticket.createdAt,
          updatedAt: ticket.updatedAt,
          event: {
            id: ticket.event?._id,
            title: ticket.event?.title || "",
            date: ticket.event?.date || null,
            location: ticket.event?.location || "",
          },
          organizer: {
            id: ticket.organizer?._id,
            name: ticket.organizer?.name || "",
            slug: ticket.organizer?.slug || "",
          },
          verifiedUser: ticket.verifiedUser
            ? {
                id: ticket.verifiedUser._id,
                fullName: ticket.verifiedUser.fullName || "",
                email: ticket.verifiedUser.email || "",
                role: ticket.verifiedUser.role || "",
              }
            : null,
        },
      },
    });
  },
);

export const verifyAdminTicket = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { ticketCode } = verifyTicketSchema.parse(req.body);

    const normalizedTicketCode = ticketCode.trim().toUpperCase();

    const ticket = await Ticket.findOne({
      ticketCode: normalizedTicketCode,
    });

    if (!ticket) {
      return next(new AppError("Invalid ticket", 404));
    }

    if (ticket.status === "checked-in") {
      return res.status(409).json({
        status: "fail",
        message: "Ticket has already been used",
        data: {
          ticketCode: ticket.ticketCode,
          ticketStatus: ticket.status,
          checkedInAt: ticket.checkedInAt || null,
        },
      });
    }

    ticket.status = "checked-in";
    ticket.checkedInAt = new Date();
    ticket.verifiedBy = null;
    await ticket.save();

    res.status(200).json({
      status: "success",
      message: "Ticket verified successfully",
      data: {
        ticket: {
          id: ticket._id,
          ticketCode: ticket.ticketCode,
          status: ticket.status,
          checkedInAt: ticket.checkedInAt || null,
        },
      },
    });
  },
);
