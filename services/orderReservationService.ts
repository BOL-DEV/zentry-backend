import type { ClientSession, Types } from "mongoose";
import Order, { type OrderDocument } from "../models/order";
import OrderItem from "../models/orderItem";
import { TicketType } from "../models/ticketTypes";
import { AppError } from "../utils/appError";

export const ORDER_RESERVATION_WINDOW_MS = 15 * 60 * 1000;

export const buildReservationExpiry = () =>
  new Date(Date.now() + ORDER_RESERVATION_WINDOW_MS);

type ReservableItem = {
  ticketTypeId: string;
  quantity: number;
};

type ExpiredReservationCleanupResult = {
  releasedOrders: number;
};

export const reserveTicketQuantities = async ({
  eventId,
  items,
  session,
}: {
  eventId: Types.ObjectId;
  items: ReservableItem[];
  session: ClientSession;
}) => {
  for (const item of items) {
    const reserveResult = await TicketType.updateOne(
      {
        _id: item.ticketTypeId,
        eventId,
        isActive: true,
        $expr: {
          $gte: [
            {
              $subtract: [
                "$quantityAvailable",
                { $add: ["$quantitySold", "$quantityReserved"] },
              ],
            },
            item.quantity,
          ],
        },
      },
      {
        $inc: {
          quantityReserved: item.quantity,
        },
      },
      { session },
    );

    if (reserveResult.modifiedCount !== 1) {
      throw new AppError(
        "One or more selected ticket types are no longer available",
        409,
      );
    }
  }
};

export const releaseOrderReservation = async ({
  order,
  session,
}: {
  order: OrderDocument;
  session: ClientSession;
}) => {
  if (order.paymentStatus !== "pending" || order.reservationReleasedAt) {
    return false;
  }

  const orderItems = await OrderItem.find({ orderId: order._id })
    .select("ticketTypeId quantity")
    .session(session)
    .lean();

  for (const item of orderItems) {
    await TicketType.updateOne(
      { _id: item.ticketTypeId },
      {
        $inc: {
          quantityReserved: -item.quantity,
        },
      },
      { session },
    );
  }

  order.paymentStatus = "cancelled";
  order.reservationReleasedAt = new Date();
  await order.save({ session });

  return true;
};

export const cleanupExpiredReservationsForEvent = async ({
  eventId,
  session,
}: {
  eventId: Types.ObjectId;
  session: ClientSession;
}): Promise<ExpiredReservationCleanupResult> => {
  const expiredOrders = await Order.find({
    eventId,
    paymentStatus: "pending",
    $or: [
      { reservationReleasedAt: { $exists: false } },
      { reservationReleasedAt: null },
    ],
    reservationExpiresAt: { $lte: new Date() },
  }).session(session);

  let releasedOrders = 0;

  for (const order of expiredOrders) {
    const released = await releaseOrderReservation({ order, session });

    if (released) {
      releasedOrders += 1;
    }
  }

  return {
    releasedOrders,
  };
};

export const syncReservedQuantitiesForEvent = async ({
  eventId,
  session,
}: {
  eventId: Types.ObjectId;
  session: ClientSession;
}) => {
  const now = new Date();

  const activePendingOrders = await Order.find({
    eventId,
    paymentStatus: "pending",
    $or: [
      { reservationReleasedAt: { $exists: false } },
      { reservationReleasedAt: null },
    ],
    reservationExpiresAt: { $gt: now },
  })
    .select("_id")
    .session(session)
    .lean();

  const pendingOrderIds = activePendingOrders.map((order) => order._id);

  await TicketType.updateMany(
    { eventId },
    { $set: { quantityReserved: 0 } },
    { session },
  );

  if (!pendingOrderIds.length) {
    return;
  }

  const reservedByTicketType = await OrderItem.aggregate<{
    _id: Types.ObjectId;
    reserved: number;
  }>([
    { $match: { orderId: { $in: pendingOrderIds } } },
    {
      $group: {
        _id: "$ticketTypeId",
        reserved: { $sum: "$quantity" },
      },
    },
  ]).session(session);

  for (const row of reservedByTicketType) {
    await TicketType.updateOne(
      { _id: row._id, eventId },
      { $set: { quantityReserved: row.reserved } },
      { session },
    );
  }
};
