import crypto from "crypto";
import axios from "axios";
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
import { calculateOrderPlatformFee } from "../utils/platformFee";
import { calculatePaystackFee } from "../utils/paystackFee";
import { releaseOrderReservation } from "./orderReservationService";
import { SquadService } from "./squadService";

const verifyHmacSignature = ({
  rawBody,
  secret,
  signature,
}: {
  rawBody: Buffer;
  secret: string;
  signature: string;
}) => {
  const computedSignature = crypto
    .createHmac("sha512", secret)
    .update(rawBody)
    .digest("hex");

  const provided = Buffer.from(signature, "hex");
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
  paystackFeeTotal,
  expectedNetSettlement,
  paystackTransactionId,
}: {
  session: mongoose.ClientSession;
  order: typeof Order.prototype;
  platformFeeTotal: number;
  paystackFeeTotal: number;
  expectedNetSettlement: number;
  paystackTransactionId?: string;
}) => {
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
  order.paystackFeeTotal = paystackFeeTotal;
  order.expectedNetSettlement = expectedNetSettlement;
  order.settlementStatus = "pending";
  order.reservationReleasedAt = new Date();

  if (paystackTransactionId) {
    order.paystackTransactionId = paystackTransactionId;
  }

  await order.save({ session });

  return {
    alreadyProcessed: false,
    event,
    orderItems,
    createdTickets,
  };
};

export const handlePaystackWebhook = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const secret = process.env.PAYSTACK_SECRET_KEY;

    if (!secret) {
      return next(new AppError("Paystack secret key is not configured", 500));
    }

    const signature = req.headers["x-paystack-signature"] as string | undefined;

    if (!signature) {
      return next(new AppError("Missing Paystack signature", 400));
    }

    const rawBody = req.rawBody;

    if (!rawBody) {
      return next(
        new AppError("Missing raw request body for webhook verification", 400),
      );
    }

    const computedSignature = crypto
      .createHmac("sha512", secret)
      .update(rawBody)
      .digest("hex");

    if (computedSignature !== signature) {
      return next(new AppError("Invalid Paystack signature", 401));
    }

    const payload = JSON.parse(rawBody.toString("utf8"));
    const eventType = payload.event;

    if (eventType !== "charge.success") {
      return res.status(200).json({
        status: "success",
        message: "Webhook received and ignored",
      });
    }

    const paymentData = payload.data;
    const reference = paymentData?.reference;

    if (!reference) {
      return next(new AppError("Payment reference is missing", 400));
    }

    // Server-side verify with Paystack before fulfilling
    const verifyResponse = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${secret}`,
        },
        timeout: 15000,
      },
    );

    const verified = verifyResponse.data?.data;

    if (!verified || verified.status !== "success") {
      return next(new AppError("Payment verification failed", 400));
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const order = await Order.findOne({
        paymentReference: reference,
      }).session(session);

      if (!order) {
        throw new AppError("Order not found for this payment reference", 404);
      }

      const platformFeeTotal = calculateOrderPlatformFee(
        (
          await OrderItem.find({ orderId: order._id })
            .session(session)
            .select("unitPrice quantity")
            .lean()
        ).map((item) => ({
          unitPrice: item.unitPrice,
          quantity: item.quantity,
        })),
      );

      const paystackFeeTotal = calculatePaystackFee(order.totalAmount);
      const expectedNetSettlement = Math.max(
        order.totalAmount - platformFeeTotal - paystackFeeTotal,
        0,
      );

      const fulfillment = await fulfillPaidOrder({
        session,
        order,
        platformFeeTotal,
        paystackFeeTotal,
        expectedNetSettlement,
        paystackTransactionId: String(verified.id ?? ""),
      });

      if (fulfillment.alreadyProcessed) {
        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
          status: "success",
          message: "Order already processed",
        });
      }

      if (
        !fulfillment.event ||
        !fulfillment.createdTickets ||
        !fulfillment.orderItems
      ) {
        throw new AppError(
          "Payment fulfillment did not complete correctly",
          500,
        );
      }

      const paidAmount = Number(verified.amount) / 100;

      if (paidAmount !== order.totalAmount) {
        throw new AppError("Paid amount does not match order amount", 400);
      }

      await session.commitTransaction();
      session.endSession();

      await sendTicketsEmail({
        order,
        eventTitle: fulfillment.event.title,
        createdTickets: fulfillment.createdTickets,
        orderItems: fulfillment.orderItems,
      });

      return res.status(200).json({
        status: "success",
        message: "Payment confirmed and tickets generated successfully",
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  },
);

export const handleSquadWebhook = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const secret = process.env.SQUAD_SECRET_KEY;

    if (!secret) {
      return next(new AppError("Squad secret key is not configured", 500));
    }

    const signature = req.headers["x-squad-signature"] as string | undefined;

    if (!signature) {
      return next(new AppError("Missing Squad signature", 400));
    }

    const rawBody = req.rawBody;

    if (!rawBody) {
      return next(
        new AppError("Missing raw request body for webhook verification", 400),
      );
    }

    if (
      !verifyHmacSignature({
        rawBody,
        secret,
        signature,
      })
    ) {
      return next(new AppError("Invalid Squad signature", 401));
    }

    const eventType = req.body?.event_type;
    const body = req.body?.body;

    if (eventType !== "virtual_account.funded") {
      return res.sendStatus(200);
    }

    const reference = body?.customer_identifier;

    if (!reference) {
      return next(new AppError("Payment reference is missing", 400));
    }

    const order = await Order.findOne({
      paymentReference: reference,
    });

    if (!order) {
      return next(
        new AppError("Order not found for this payment reference", 404),
      );
    }

    if (order.paymentGateway !== "squad") {
      return next(
        new AppError("Order is not configured for Squad payments", 400),
      );
    }

    const amountPaid = Number(body?.amount_paid) / 100;

    if (!Number.isFinite(amountPaid) || amountPaid !== order.totalAmount) {
      return next(new AppError("Paid amount does not match order amount", 400));
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const pendingOrder = await Order.findById(order._id).session(session);

      if (!pendingOrder) {
        throw new AppError("Order not found for this payment reference", 404);
      }

      const fulfillment = await fulfillPaidOrder({
        session,
        order: pendingOrder,
        platformFeeTotal: pendingOrder.platformFeeTotal || 0,
        paystackFeeTotal: 0,
        expectedNetSettlement:
          pendingOrder.organizerPayoutAmount ||
          pendingOrder.expectedNetSettlement,
      });

      if (fulfillment.alreadyProcessed) {
        await session.commitTransaction();
        session.endSession();
        return res.sendStatus(200);
      }

      if (
        !fulfillment.event ||
        !fulfillment.createdTickets ||
        !fulfillment.orderItems
      ) {
        throw new AppError(
          "Payment fulfillment did not complete correctly",
          500,
        );
      }

      await session.commitTransaction();
      session.endSession();

      await sendTicketsEmail({
        order: pendingOrder,
        eventTitle: fulfillment.event.title,
        createdTickets: fulfillment.createdTickets,
        orderItems: fulfillment.orderItems,
      });

      const organizer = await Organizer.findById(fulfillment.event.organizerId)
        .select("bankDetails")
        .lean();

      const bankDetails = organizer?.bankDetails;

      if (
        !bankDetails?.bankCode ||
        !bankDetails.accountNumber ||
        !bankDetails.accountName
      ) {
        await Order.updateOne(
          { _id: pendingOrder._id },
          { settlementStatus: "failed" },
        );

        return res.sendStatus(200);
      }

      try {
        const transferReference = `PAYOUT-${pendingOrder.paymentReference}`;
        await SquadService.transferToOrganizer({
          amount: Math.round(pendingOrder.organizerPayoutAmount * 100),
          bank_code: bankDetails.bankCode,
          account_number: bankDetails.accountNumber,
          account_name: bankDetails.accountName,
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
        console.error("Failed to transfer Squad payout:", transferError);
        await Order.updateOne(
          { _id: pendingOrder._id },
          { settlementStatus: "failed" },
        );
      }

      return res.sendStatus(200);
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  },
);
