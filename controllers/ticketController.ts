import { Request, Response, NextFunction } from "express";
import Ticket from "../models/ticket";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import { verifyTicketSchema } from "../validations/verifyTicket.schema";

export const verifyTicket = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { ticketCode } = verifyTicketSchema.parse(req.body);

    const ticket = await Ticket.findOne({ ticketCode });

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
          id: ticket._id.toString(),
          ticketCode: ticket.ticketCode,
          status: ticket.status,
          eventId: ticket.eventId.toString(),
          ticketTypeId: ticket.ticketTypeId.toString(),
          buyerName: ticket.buyerName,
          buyerEmail: ticket.buyerEmail,
        },
      },
    });
  },
);
