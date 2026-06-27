// @ts-nocheck
import type { PostgresSession } from "../db/pg";
import Order from "../models/order";
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
  eventId: string;
  items: ReservableItem[];
  session: PostgresSession;
}) => {
  for (const item of items) {
    const ticketType = await TicketType.findOne({
      _id: item.ticketTypeId,
      eventId,
      isActive: true,
    }).session(session).lean();

    if (!ticketType) {
      throw new AppError("One or more selected ticket types are no longer available", 409);
    }

    const availableQuantity =
      Number(ticketType.quantityAvailable || 0) -
      Number(ticketType.quantitySold || 0) -
      Number(ticketType.quantityReserved || 0);

    if (availableQuantity < item.quantity) {
      throw new AppError("One or more selected ticket types are no longer available", 409);
    }

    const reserveResult = await TicketType.updateOne(
      { _id: item.ticketTypeId, eventId },
      { $inc: { quantityReserved: item.quantity } },
      { session },
    );

    if (reserveResult.modifiedCount !== 1) {
      throw new AppError("One or more selected ticket types are no longer available", 409);
    }
  }
};

export const releaseOrderReservation = async ({
  order,
  session,
}: {
  order: any;
  session: PostgresSession;
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
  await order.save(session);

  return true;
};

export const cleanupExpiredReservationsForEvent = async ({
  eventId,
  session,
}: {
  eventId: string;
  session: PostgresSession;
}): Promise<ExpiredReservationCleanupResult> => {
  const expiredOrders = await Order.find({
    eventId,
    paymentStatus: "pending",
    reservationReleasedAt: null,
    reservationExpiresAt: { $lte: new Date() },
  }).session(session);

  let releasedOrders = 0;

  for (const order of expiredOrders) {
    const released = await releaseOrderReservation({ order, session });
    if (released) releasedOrders += 1;
  }

  return { releasedOrders };
};

export const syncReservedQuantitiesForEvent = async ({
  eventId,
  session,
}: {
  eventId: string;
  session: PostgresSession;
}) => {
  const now = new Date();
  const activePendingOrders = await Order.find({
    eventId,
    paymentStatus: "pending",
    reservationReleasedAt: null,
    reservationExpiresAt: { $gt: now },
  })
    .select("_id")
    .session(session)
    .lean();

  const pendingOrderIds = activePendingOrders.map((order) => order._id);

  await TicketType.updateMany({ eventId }, { $set: { quantityReserved: 0 } }, { session });

  if (!pendingOrderIds.length) return;

  const orderItems = await OrderItem.find({ orderId: { $in: pendingOrderIds } })
    .select("ticketTypeId quantity")
    .session(session)
    .lean();

  const reservedByTicketType = new Map<string, number>();
  for (const item of orderItems) {
    const key = String(item.ticketTypeId);
    reservedByTicketType.set(key, (reservedByTicketType.get(key) || 0) + Number(item.quantity || 0));
  }

  for (const [ticketTypeId, reserved] of reservedByTicketType.entries()) {
    await TicketType.updateOne(
      { _id: ticketTypeId, eventId },
      { $set: { quantityReserved: reserved } },
      { session },
    );
  }
};

