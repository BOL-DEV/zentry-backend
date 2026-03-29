import { Request, Response, NextFunction } from "express";
import Ticket from "../models/ticket";
import Event from "../models/event";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import { verifyTicketSchema } from "../validations/verifyTicket.schema";
import { eventIdParamSchema } from "../validations/event.schema";

export const verifyTicketForEvent = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return next(new AppError("User not found", 401));
    }

    const { eventId } = eventIdParamSchema.parse(req.params);
    const { ticketCode } = verifyTicketSchema.parse(req.body);

    const event = await Event.findOne({
      _id: eventId,
      organizerId: user.organizerId,
    })
      .select("_id organizerId")
      .lean();

    if (!event) {
      return next(new AppError("Event not found for this organizer", 404));
    }

    const ticket = await Ticket.findOne({
      ticketCode,
      eventId: event._id,
    });

    if (!ticket) {
      return next(new AppError("Invalid ticket for this event", 404));
    }

    if (ticket.status === "checked-in") {
      return res.status(409).json({
        status: "fail",
        message: "Ticket has already been used",
        data: {
          ticketCode: ticket.ticketCode,
          ticketStatus: ticket.status,
        },
      });
    }

    ticket.status = "checked-in";
    await ticket.save();

    res.status(200).json({
      status: "success",
      message: "Ticket verified successfully",
      data: {
        ticket: {
          id: ticket._id,
          ticketCode: ticket.ticketCode,
          status: ticket.status,
          buyerName: ticket.buyerName,
          buyerEmail: ticket.buyerEmail,
        },
      },
    });
  },
);
