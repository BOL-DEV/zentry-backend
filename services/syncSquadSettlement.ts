import mongoose from "mongoose";
import Order from "../models/order";
import Event from "../models/event";
import Organizer from "../models/organizer";
import { SquadService } from "./squadService";

export type SquadSettlementSyncResult = {
  ordersMatched: number;
  ordersProcessed: number;
  payoutsAttempted: number;
  payoutsSucceeded: number;
  payoutsFailed: number;
  skippedNoBankDetails: number;
  skippedNoPayoutRequired: number;
  skippedMissingReference: number;
  errors: Array<{ orderId: string; message: string }>;
};

export const syncSquadSettlements = async (options?: {
  from?: Date;
  to?: Date;
  eventIds?: mongoose.Types.ObjectId[];
  limit?: number;
}) => {
  const result: SquadSettlementSyncResult = {
    ordersMatched: 0,
    ordersProcessed: 0,
    payoutsAttempted: 0,
    payoutsSucceeded: 0,
    payoutsFailed: 0,
    skippedNoBankDetails: 0,
    skippedNoPayoutRequired: 0,
    skippedMissingReference: 0,
    errors: [],
  };

  const to = options?.to ?? new Date();

  const match: Record<string, unknown> = {
    paymentGateway: "squad",
    paymentStatus: "paid",
    settlementStatus: { $in: ["pending", "failed"] },
  };

  if (options?.from) {
    match.paidAt = {
      $gte: options.from,
      $lte: to,
    };
  }

  if (options?.eventIds?.length) {
    match.eventId = { $in: options.eventIds };
  }

  const limit = Math.max(1, Math.min(options?.limit ?? 250, 1000));

  const orders = await Order.find(match)
    .sort({ paidAt: -1, createdAt: -1 })
    .limit(limit)
    .select(
      "_id eventId paymentReference organizerPayoutAmount settlementStatus settlementBatchId",
    )
    .lean();

  result.ordersMatched = orders.length;

  if (!orders.length) return result;

  const orderEventIds = Array.from(
    new Set(orders.map((order) => String(order.eventId))),
  ).map((id) => new mongoose.Types.ObjectId(id));

  const events = await Event.find({ _id: { $in: orderEventIds } })
    .select("_id organizerId")
    .lean();

  if (!events.length) return result;

  const organizerIds = Array.from(
    new Set(events.map((event) => String(event.organizerId))),
  ).map((id) => new mongoose.Types.ObjectId(id));

  const organizers = await Organizer.find({ _id: { $in: organizerIds } })
    .select("_id bankDetails")
    .lean();

  const eventOrganizerMap = new Map(
    events.map((event) => [String(event._id), String(event.organizerId)]),
  );

  const organizerBankMap = new Map(
    organizers.map((org) => [String(org._id), org.bankDetails]),
  );

  for (const order of orders) {
    const orderId = String(order._id);

    try {
      const paymentReference = String(order.paymentReference || "").trim();
      if (!paymentReference) {
        result.skippedMissingReference += 1;
        continue;
      }

      const payoutAmount = Number(order.organizerPayoutAmount || 0);

      if (payoutAmount <= 0) {
        await Order.updateOne(
          { _id: order._id },
          {
            settlementStatus: "settled",
            settlementDate: new Date(),
            settlementBatchId: `NO_PAYOUT-${paymentReference}`,
          },
        );

        result.skippedNoPayoutRequired += 1;
        result.ordersProcessed += 1;
        continue;
      }

      const organizerId = eventOrganizerMap.get(String(order.eventId));
      const bankDetails = organizerId
        ? organizerBankMap.get(String(organizerId))
        : undefined;

      if (
        !bankDetails?.bankCode ||
        !bankDetails.accountNumber ||
        !bankDetails.accountName
      ) {
        result.skippedNoBankDetails += 1;
        continue;
      }

      const transferReference = String(order.settlementBatchId || "").trim()
        ? String(order.settlementBatchId).trim()
        : `PAYOUT-${paymentReference}`;

      const lockResult = await Order.updateOne(
        {
          _id: order._id,
          settlementStatus: { $in: ["pending", "failed"] },
        },
        {
          settlementStatus: "processing",
          settlementBatchId: transferReference,
        },
      );

      // Another worker already picked this up (or webhook is processing it).
      if (!lockResult.modifiedCount) {
        continue;
      }

      result.payoutsAttempted += 1;

      await SquadService.transferToOrganizer({
        amount: Math.round(payoutAmount * 100),
        bank_code: bankDetails.bankCode,
        account_number: bankDetails.accountNumber,
        account_name: String(bankDetails.accountName),
        transaction_reference: transferReference,
      });

      await Order.updateOne(
        { _id: order._id },
        {
          settlementStatus: "settled",
          settlementDate: new Date(),
          settlementBatchId: transferReference,
        },
      );

      result.payoutsSucceeded += 1;
      result.ordersProcessed += 1;
    } catch (error) {
      result.payoutsFailed += 1;
      result.errors.push({
        orderId,
        message: error instanceof Error ? error.message : "Unknown error",
      });

      await Order.updateOne(
        { _id: order._id },
        {
          settlementStatus: "failed",
        },
      );
    }
  }

  return result;
};
