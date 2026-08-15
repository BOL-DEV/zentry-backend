import { Request, Response, NextFunction } from "express";
import { WaitlistEntry } from "../models/waitlistEntry";
import { TicketType } from "../models/ticketTypes";
import Event from "../models/event";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import { joinWaitlistSchema } from "../validations/waitlist.schema";
import {
  eventIdParamSchema,
  ticketTypeIdParamSchema,
} from "../validations/ticketType.schema";

export const joinWaitlist = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const event = req.event;

    if (!event) {
      return next(new AppError("Event not found", 404));
    }

    const { ticketTypeId } = ticketTypeIdParamSchema.parse(req.params);
    const data = joinWaitlistSchema.parse(req.body);

    const ticketType = await TicketType.findOne({
      _id: ticketTypeId,
      eventId: event._id,
    }).lean();

    if (!ticketType) {
      return next(new AppError("Ticket type not found for this event", 404));
    }

    const remaining =
      ticketType.quantityAvailable -
      ticketType.quantitySold -
      Number(ticketType.quantityReserved || 0);

    if (ticketType.isActive && remaining > 0) {
      return next(
        new AppError("Tickets are still available for this ticket type", 400),
      );
    }

    const existingEntry = await WaitlistEntry.findOne({
      ticketTypeId,
      email: data.email,
    }).lean();

    if (existingEntry) {
      return res.status(200).json({
        status: "success",
        data: {
          message: "You're already on the waitlist for this ticket type.",
        },
      });
    }

    await WaitlistEntry.create({
      eventId: event._id,
      ticketTypeId,
      name: data.name,
      email: data.email,
      phone: data.phone ?? "",
      status: "waiting",
    });

    res.status(201).json({
      status: "success",
      data: {
        message: "You're on the waitlist. We'll email you if a spot opens up.",
      },
    });
  },
);

export const getEventWaitlist = catchAsync(
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

    const ticketTypes = await TicketType.find({ eventId: event._id }).lean();
    const ticketTypeNameById = new Map(
      ticketTypes.map((ticketType: { _id: string; name: string }) => [
        ticketType._id,
        ticketType.name,
      ]),
    );

    const entries = await WaitlistEntry.find({ eventId: event._id })
      .sort({ createdAt: 1 })
      .lean();

    const formattedEntries = entries.map(
      (entry: { ticketTypeId: string; [key: string]: unknown }) => ({
        ...entry,
        ticketTypeName: ticketTypeNameById.get(entry.ticketTypeId) ?? "Unknown",
      }),
    );

    res.status(200).json({
      status: "success",
      results: formattedEntries.length,
      data: {
        entries: formattedEntries,
      },
    });
  },
);
