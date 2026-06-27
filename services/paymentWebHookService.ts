import crypto from "crypto";
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
import { startSession } from "../db/pg";

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
        organizerId: string;
      };
      orderItems: Array<{
        ticketTypeId: string;
        ticketTypeName: string;
        quantity: number;
      }>;
      createdTickets: Array<{
        ticketCode: string;
        ticketTypeId: string;
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
    ticketTypeId: string;
  }>;
  orderItems: Array<{
    ticketTypeId: string;
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
  session: any;
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

  const ticketTypes = (await TicketType.find({
    _id: { $in: ticketTypeIds },
    eventId: order.eventId,
  }).session(session)) as Array<any>;

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

  if ((organizerPayoutAmount || 0) <= 0) {
    order.settlementStatus = "settled";
    order.settlementDate = new Date();
    order.settlementBatchId = order.paymentReference
      ? `NO_PAYOUT-${order.paymentReference}`
      : "";
  } else {
    order.settlementStatus = "pending";
  }

  order.reservationReleasedAt = new Date();

  await order.save({ session });

  return {
    alreadyProcessed: false,
    event,
    orderItems,
    createdTickets,
  };
};

// const attemptImmediateOrganizerPayout = async (orderId: string) => {

//   const order = await Order.findById(orderId)
//     .select(
//       "_id eventId paymentGateway paymentStatus paymentReference organizerPayoutAmount settlementStatus settlementBatchId",
//     )
//     .lean();

//   if (!order) return;

//   if (order.paymentGateway !== "squad" || order.paymentStatus !== "paid") {
//     return;
//   }

//   if (order.settlementStatus === "settled") {
//     return;
//   }

//   const payoutAmount = Number(order.organizerPayoutAmount || 0);
//   if (payoutAmount <= 0) {
//     // No payout required (should already be settled by fulfillment)
//     return;
//   }

//   if (order.settlementStatus !== "pending" && order.settlementStatus !== "failed") {
//     return;
//   }

//   const event = await Event.findById(order.eventId)
//     .select("_id organizerId")
//     .lean();
//   if (!event) return;

//   const organizer = await Organizer.findById(event.organizerId)
//     .select("_id bankDetails")
//     .lean();
//   if (!organizer) return;

//   const bank = (organizer as any).bankDetails || {};
//   const bankCode = typeof bank.bankCode === "string" ? bank.bankCode.trim() : "";
//   const accountNumber =
//     typeof bank.accountNumber === "string" ? bank.accountNumber.trim() : "";
//   const accountName =
//     typeof bank.accountName === "string" ? bank.accountName.trim() : "";

//   if (!bankCode || !accountNumber || !accountName) {
//     // Can't pay out without bank details; leave as pending/failed for later.
//     return;
//   }

//   const paymentReference = String(order.paymentReference || "").trim();
//   if (!paymentReference) {
//     return;
//   }

//   const transferReference = String(order.settlementBatchId || "").trim()
//     ? String(order.settlementBatchId).trim()
//     : `PAYOUT-${paymentReference}`;

//   // Mark processing (idempotent guard)
//   const updated = await Order.updateOne(
//     {
//       _id: order._id,
//       settlementStatus: { $in: ["pending", "failed"] },
//     },
//     {
//       settlementStatus: "processing",
//       settlementBatchId: transferReference,
//       settlementLastAttemptAt: new Date(),
//       settlementLastError: "",
//     },
//   );

//   if (!updated.modifiedCount) {
//     return;
//   }

//   try {
//     await SquadService.transferToOrganizer({
//       amount: Math.round(payoutAmount * 100),
//       bank_code: bankCode,
//       account_number: accountNumber,
//       account_name: accountName,
//       transaction_reference: transferReference,
//     });

//     await Order.updateOne(
//       { _id: order._id },
//       {
//         settlementStatus: "settled",
//         settlementDate: new Date(),
//         settlementBatchId: transferReference,
//         settlementLastError: "",
//       },
//     );
//   } catch (err) {
//     const message = err instanceof Error ? err.message : "Unknown error";
//     await Order.updateOne(
//       { _id: order._id },
//       {
//         settlementStatus: "failed",
//         settlementBatchId: transferReference,
//         settlementLastError: message,
//         settlementLastAttemptAt: new Date(),
//       },
//     );

//     console.error("Immediate organizer payout failed:", err);
//   }
// };




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

    // Deep populate: Order -> Event -> Organizer
    const order = await Order.findOne({ paymentReference: reference }).populate(
      {
        path: "eventId",
        populate: { path: "organizerId" }, // This gets the User document owning the event
      },
    );

    if (!order) {
      return res.sendStatus(200);
    }

    if (order.paymentStatus === "paid") {
      return res.sendStatus(200);
    }

    const session = await startSession();
    await session.startTransaction();

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
        await session.endSession();
        return res.sendStatus(200);
      }

      await session.commitTransaction();
      await session.endSession();

      // Best-effort side effects after commit.
      await Promise.allSettled([
        sendTicketsEmail({
          order: pendingOrder,
          eventTitle: fulfillment.event.title,
          createdTickets: fulfillment.createdTickets,
          orderItems: fulfillment.orderItems,
        }),
        attemptOrganizerPayout(pendingOrder, fulfillment.event),
      ]);

      return res.sendStatus(200);
    } catch (error) {
      await session.abortTransaction();
      await session.endSession();
      throw error;
    }
  },
);

async function attemptOrganizerPayout(order: any, event: any) {
  try {
    const maskAccountNumber = (value: string) => {
      const trimmed = String(value || "").trim();
      if (!/^\d{10,}$/.test(trimmed)) return trimmed;
      return `${"*".repeat(Math.max(0, trimmed.length - 4))}${trimmed.slice(-4)}`;
    };

    // 1. Resolve organizer id and load bank details (event.organizerId is not always populated)
    const organizerId = event?.organizerId?._id || event?.organizerId;

    if (!organizerId) {
      console.warn(`[PAYOUT] Missing organizerId for event: ${event?._id}`);
      return;
    }

    const organizer =
      typeof event?.organizerId === "object" && event?.organizerId?.bankDetails
        ? event.organizerId
        : await Organizer.findById(organizerId).select("_id bankDetails").lean();

    const details = (organizer as any)?.bankDetails;

    // 2. Safety Checks
    if (!organizer) {
      console.warn(`[PAYOUT] Organizer not found: ${String(organizerId)}`);
      return;
    }

    const bankCode = typeof details?.bankCode === "string" ? details.bankCode.trim() : "";
    const accountNumber =
      typeof details?.accountNumber === "string" ? details.accountNumber.trim() : "";
    const accountName = typeof details?.accountName === "string" ? details.accountName.trim() : "";

    if (!bankCode || !accountNumber || !accountName) {
      console.warn(
        `[PAYOUT] Missing bank details for Organizer: ${String((organizer as any)._id)} (bankCode=${Boolean(
          bankCode,
        )}, accountNumber=${maskAccountNumber(accountNumber)}, accountName=${Boolean(accountName)})`,
      );
      return;
    }

    if (!order?.paymentReference) {
      console.warn(`[PAYOUT] Missing paymentReference for order: ${String(order?._id)}`);
      return;
    }

    const transferReference =
      typeof order?.settlementBatchId === "string" && order.settlementBatchId.trim()
        ? order.settlementBatchId.trim()
        : `PAYOUT-${order.paymentReference}`;

    // 2b. Idempotent lock: only one worker (webhook/sync) can attempt payout.
    const lock = await Order.updateOne(
      { _id: order._id, settlementStatus: { $in: ["pending", "failed"] } },
      {
        settlementStatus: "processing",
        settlementBatchId: transferReference,
        settlementLastAttemptAt: new Date(),
        settlementLastError: "",
      },
    );

    if (!lock.modifiedCount) {
      return;
    }

    // 3. Squad Transfer call
    await SquadService.transferToOrganizer({
      amount: Math.round(order.organizerPayoutAmount * 100), // Naira to Kobo
      bank_code: bankCode,
      account_number: accountNumber,
      account_name: accountName,
      transaction_reference: transferReference,
    });

    // 4. Update order status
    await Order.updateOne(
      { _id: order._id },
      {
        settlementStatus: "settled",
        settlementDate: new Date(),
        settlementBatchId: transferReference,
        settlementLastError: "",
      },
    );
    console.log(
      `✅ Payout sent to ${accountName} for Order ${order.paymentReference}`,
    );
  } catch (error: any) {
    console.error(
      "❌ Squad API Payout Error:",
      error.response?.data || error.message,
    );

    await Order.updateOne(
      { _id: order._id },
      {
        settlementStatus: "failed",
        settlementLastAttemptAt: new Date(),
        settlementLastError: error.response?.data?.message || error.message,
      },
    );
  }
}
