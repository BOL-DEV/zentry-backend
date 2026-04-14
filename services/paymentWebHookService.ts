import crypto from "crypto";
import mongoose from "mongoose";
import { Request, Response, NextFunction } from "express";
import Order from "../models/order";
import OrderItem from "../models/orderItem";
import Event from "../models/event";
import Organizer from "../models/organizer";
import { TicketType } from "../models/ticketTypes";
import Ticket from "../models/ticket";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import { generateTicketCode } from "../utils/generateTicketCode";
import { sendEmail } from "../utils/email";
import { generateTicketEmailTemplate } from "../utils/ticketEmailTemplate";
import { releaseOrderReservation } from "./orderReservationService";
import { SquadService } from "./squadService";

type FulfilledOrderResult =
  | {
      alreadyProcessed: true;
      event?: undefined;
      orderItems?: undefined;
      createdTickets?: undefined;
    }
  | {
      alreadyProcessed: false;
      event: {
        title: string;
        organizerId: mongoose.Types.ObjectId;
      };
      orderItems: Array<{
        ticketTypeId: mongoose.Types.ObjectId;
        ticketTypeName: string;
        quantity: number;
      }>;
      createdTickets: Array<{
        ticketCode: string;
        ticketTypeId: mongoose.Types.ObjectId;
      }>;
    };

const verifyHmacSignature = ({
  payload,
  secret,
  signature,
}: {
  payload: Buffer | string;
  secret: string;
  signature: string;
}) => {
  const normalizedSignature = signature.trim().replace(/^sha512=/i, "");

  if (!/^[a-fA-F0-9]{128}$/.test(normalizedSignature)) {
    return false;
  }

  const computedSignature = crypto
    .createHmac("sha512", secret)
    .update(payload)
    .digest("hex");

  const provided = Buffer.from(normalizedSignature, "hex");
  const expected = Buffer.from(computedSignature, "hex");

  if (provided.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(provided, expected);
};

const sendTicketsEmail = async ({
  order,
  eventTitle,
  createdTickets,
  orderItems,
}: {
  order: {
    buyerName: string;
    buyerEmail: string;
  };
  eventTitle: string;
  createdTickets: Array<{
    ticketCode: string;
    ticketTypeId: mongoose.Types.ObjectId;
  }>;
  orderItems: Array<{
    ticketTypeId: mongoose.Types.ObjectId;
    ticketTypeName: string;
  }>;
}) => {
  const ticketTypeNameMap = new Map(
    orderItems.map((item) => [
      item.ticketTypeId.toString(),
      item.ticketTypeName,
    ]),
  );

  const ticketEmailItems = createdTickets.map((ticket) => {
    const ticketTypeName = ticketTypeNameMap.get(
      ticket.ticketTypeId.toString(),
    );

    if (ticketTypeName) {
      return {
        ticketCode: ticket.ticketCode,
        ticketTypeName,
      };
    }

    return {
      ticketCode: ticket.ticketCode,
    };
  });

  const emailHtml = generateTicketEmailTemplate({
    buyerName: order.buyerName,
    eventTitle,
    tickets: ticketEmailItems,
  });

  try {
    await sendEmail({
      to: order.buyerEmail,
      subject: `Your tickets for ${eventTitle}`,
      html: emailHtml,
      text: `Your payment was successful. Your ticket codes: ${createdTickets
        .map((ticket) => ticket.ticketCode)
        .join(", ")}`,
    });
  } catch (emailError) {
    console.error("Failed to send ticket email:", emailError);
  }
};

const fulfillPaidOrder = async ({
  session,
  order,
  platformFeeTotal,
  organizerPayoutAmount,
}: {
  session: mongoose.ClientSession;
  order: typeof Order.prototype;
  platformFeeTotal: number;
  organizerPayoutAmount: number;
}): Promise<FulfilledOrderResult> => {
  if (order.paymentStatus === "paid") {
    return {
      alreadyProcessed: true,
    };
  }

  if (order.paymentStatus !== "pending") {
    throw new AppError(
      "Order is not in a valid state for payment confirmation",
      400,
    );
  }

  if (
    order.reservationExpiresAt &&
    order.reservationExpiresAt.getTime() <= Date.now()
  ) {
    await releaseOrderReservation({ order, session });
    throw new AppError(
      "Order reservation has expired. Please create a new order before paying.",
      409,
    );
  }

  const event = await Event.findById(order.eventId)
    .select("_id title organizerId")
    .session(session)
    .lean();

  if (!event) {
    throw new AppError("Event not found for this order", 404);
  }

  const orderItems = await OrderItem.find({ orderId: order._id })
    .session(session)
    .lean();

  if (!orderItems.length) {
    throw new AppError("No order items found for this order", 400);
  }

  const ticketTypeIds = orderItems.map((item) => item.ticketTypeId);

  const ticketTypes = await TicketType.find({
    _id: { $in: ticketTypeIds },
    eventId: order.eventId,
  }).session(session);

  if (ticketTypes.length !== orderItems.length) {
    throw new AppError(
      "Some ticket types linked to this order are missing",
      400,
    );
  }

  const ticketTypeMap = new Map(
    ticketTypes.map((ticketType) => [ticketType._id.toString(), ticketType]),
  );

  for (const item of orderItems) {
    const ticketType = ticketTypeMap.get(item.ticketTypeId.toString());

    if (!ticketType) {
      throw new AppError("Ticket type not found during fulfillment", 400);
    }

    if (!ticketType.isActive) {
      throw new AppError(
        `Ticket type "${ticketType.name}" is no longer active`,
        400,
      );
    }

    const availableQuantity =
      ticketType.quantityAvailable - ticketType.quantitySold;

    if (item.quantity > availableQuantity) {
      throw new AppError(
        `Not enough tickets available for "${ticketType.name}" during payment confirmation`,
        400,
      );
    }
  }

  const ticketsToCreate = [];

  for (const item of orderItems) {
    for (let i = 0; i < item.quantity; i++) {
      ticketsToCreate.push({
        orderId: order._id,
        eventId: order.eventId,
        ticketTypeId: item.ticketTypeId,
        buyerName: order.buyerName,
        buyerEmail: order.buyerEmail,
        ticketCode: generateTicketCode(event.title),
        status: "valid",
      });
    }
  }

  const createdTickets = await Ticket.insertMany(ticketsToCreate, {
    session,
  });

  for (const item of orderItems) {
    await TicketType.updateOne(
      { _id: item.ticketTypeId },
      {
        $inc: {
          quantitySold: item.quantity,
          quantityReserved: -item.quantity,
        },
      },
      { session },
    );
  }

  order.paymentStatus = "paid";
  order.paidAt = new Date();
  order.platformFeeTotal = platformFeeTotal;
  order.organizerPayoutAmount = organizerPayoutAmount;
  order.settlementStatus = "pending";
  order.reservationReleasedAt = new Date();

  await order.save({ session });

  return {
    alreadyProcessed: false,
    event,
    orderItems,
    createdTickets,
  };
};

export const handleSquadWebhook = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const headerValue = (value: string | string[] | undefined) =>
      Array.isArray(value) ? value[0] : value;

    const secret = process.env.SQUAD_API_KEY;
    const signature =
      headerValue(
        req.headers["x-squad-encrypted-body"] as string | string[] | undefined,
      ) ||
      headerValue(
        req.headers["x_squad_encrypted_body"] as string | string[] | undefined,
      );

    if (!secret) {
      return next(new AppError("SQUAD_API_KEY is not configured", 500));
    }

    if (!signature || !req.rawBody) {
      return next(new AppError("Invalid webhook request", 400));
    }

    if (!verifyHmacSignature({ payload: req.rawBody, secret, signature })) {
      return next(new AppError("Invalid Squad signature", 401));
    }

    const payload = req.body ?? {};
    const eventType = payload?.Event;
    const body = payload?.Body || {};

    if (eventType !== "charge_successful") {
      return res.sendStatus(200);
    }

    const reference = body?.transaction_ref;

    if (!reference) {
      return next(new AppError("Payment reference is missing", 400));
    }

    const order = await Order.findOne({ paymentReference: reference });

    if (!order || order.paymentStatus === "paid") {
      return res.sendStatus(200); // Already processed or not found
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const pendingOrder = await Order.findById(order._id).session(session);
      if (!pendingOrder) throw new AppError("Order not found", 404);

      // Fulfill order (Tickets, Email, etc.)
      const fulfillment = await fulfillPaidOrder({
        session,
        order: pendingOrder,
        platformFeeTotal: pendingOrder.platformFeeTotal || 0,
        organizerPayoutAmount: pendingOrder.organizerPayoutAmount || 0,
      });

      if (fulfillment.alreadyProcessed) {
        await session.commitTransaction();
        session.endSession();
        return res.sendStatus(200);
      }

      await session.commitTransaction();
      session.endSession();

      // Send Confirmation Email
      await sendTicketsEmail({
        order: pendingOrder,
        eventTitle: fulfillment.event.title,
        createdTickets: fulfillment.createdTickets,
        orderItems: fulfillment.orderItems,
      });

      // --- PAYOUT LOGIC ---
      const organizer = await Organizer.findById(
        fulfillment.event.organizerId,
      ).lean();
      const bankDetails = organizer?.bankDetails;

      if ((pendingOrder.organizerPayoutAmount || 0) <= 0) {
        await Order.updateOne(
          { _id: pendingOrder._id },
          {
            settlementStatus: "settled",
            settlementDate: new Date(),
            settlementBatchId: `NO_PAYOUT-${pendingOrder.paymentReference}`,
          },
        );

        return res.sendStatus(200);
      }

      if (
        bankDetails?.bankCode &&
        bankDetails.accountNumber &&
        bankDetails.accountName
      ) {
        const accountName = String(bankDetails.accountName);

        try {
          const transferReference = `PAYOUT-${pendingOrder.paymentReference}`;

          await Order.updateOne(
            { _id: pendingOrder._id, settlementStatus: { $ne: "settled" } },
            {
              settlementStatus: "processing",
              settlementBatchId: transferReference,
            },
          );

          // Payout Amount (in Kobo)
          await SquadService.transferToOrganizer({
            amount: Math.round(pendingOrder.organizerPayoutAmount * 100),
            bank_code: bankDetails.bankCode,
            account_number: bankDetails.accountNumber,
            account_name: accountName,
            transaction_reference: transferReference,
          });

          await Order.updateOne(
            { _id: pendingOrder._id },
            {
              settlementStatus: "settled",
              settlementDate: new Date(),
              settlementBatchId: transferReference,
            },
          );
        } catch (transferError) {
          console.error("Payout Failed:", transferError);
          await Order.updateOne(
            { _id: pendingOrder._id },
            { settlementStatus: "failed" },
          );
        }
      }

      return res.sendStatus(200);
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  },
);
