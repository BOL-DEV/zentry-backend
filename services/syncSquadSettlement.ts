import mongoose from "mongoose";
import Order from "../models/order";
import Event from "../models/event";
import Organizer from "../models/organizer";
// import { SquadService } from "./squadService";

// export type SquadSettlementSyncResult = {

//   ordersMatched: number;
//   ordersProcessed: number;
//   payoutsAttempted: number;
//   payoutsSucceeded: number;
//   payoutsFailed: number;
//   skippedNoBankDetails: number;
//   skippedNoPayoutRequired: number;
//   skippedMissingReference: number;
//   errors: Array<{ orderId: string; message: string }>;
// };

// export const syncSquadSettlements = async (options?: {
//   from?: Date;
//   to?: Date;
//   eventIds?: mongoose.Types.ObjectId[];
//   limit?: number;
// }) => {
//   const result: SquadSettlementSyncResult = {
//     ordersMatched: 0,
//     ordersProcessed: 0,
//     payoutsAttempted: 0,
//     payoutsSucceeded: 0,
//     payoutsFailed: 0,
//     skippedNoBankDetails: 0,
//     skippedNoPayoutRequired: 0,
//     skippedMissingReference: 0,
//     errors: [],
//   };

//   const to = options?.to ?? new Date();

//   const match: Record<string, unknown> = {
//     paymentGateway: "squad",
//     paymentStatus: "paid",
//     settlementStatus: { $in: ["pending", "failed"] },
//   };

//   if (options?.from) {
//     match.paidAt = {
//       $gte: options.from,
//       $lte: to,
//     };
//   }

//   if (options?.eventIds?.length) {
//     match.eventId = { $in: options.eventIds };
//   }

//   const limit = Math.max(1, Math.min(options?.limit ?? 250, 1000));

//   const orders = await Order.find(match)
//     .sort({ paidAt: -1, createdAt: -1 })
//     .limit(limit)
//     .select(
//       "_id eventId paymentReference organizerPayoutAmount settlementStatus settlementBatchId",
//     )
//     .lean();

//   result.ordersMatched = orders.length;

//   if (!orders.length) return result;

//   const orderEventIds = Array.from(
//     new Set(orders.map((order) => String(order.eventId))),
//   ).map((id) => new mongoose.Types.ObjectId(id));

//   const events = await Event.find({ _id: { $in: orderEventIds } })
//     .select("_id organizerId")
//     .lean();

//   if (!events.length) return result;

//   const organizerIds = Array.from(
//     new Set(events.map((event) => String(event.organizerId))),
//   ).map((id) => new mongoose.Types.ObjectId(id));

//   const organizers = await Organizer.find({ _id: { $in: organizerIds } })
//     .select("_id bankDetails")
//     .lean();

//   const eventOrganizerMap = new Map(
//     events.map((event) => [String(event._id), String(event.organizerId)]),
//   );

//   const organizerBankMap = new Map(
//     organizers.map((org) => [String(org._id), org.bankDetails]),
//   );

//   for (const order of orders) {
//     const orderId = String(order._id);

//     try {
//       const paymentReference = String(order.paymentReference || "").trim();
//       if (!paymentReference) {
//         result.skippedMissingReference += 1;
//         continue;
//       }

//       const payoutAmount = Number(order.organizerPayoutAmount || 0);

//       if (payoutAmount <= 0) {
//         await Order.updateOne(
//           { _id: order._id },
//           {
//             settlementStatus: "settled",
//             settlementDate: new Date(),
//             settlementBatchId: `NO_PAYOUT-${paymentReference}`,
//           },
//         );

//         result.skippedNoPayoutRequired += 1;
//         result.ordersProcessed += 1;
//         continue;
//       }

//       const organizerId = eventOrganizerMap.get(String(order.eventId));
//       const bankDetails = organizerId
//         ? organizerBankMap.get(String(organizerId))
//         : undefined;

//       if (
//         !bankDetails?.bankCode ||
//         !bankDetails.accountNumber ||
//         !bankDetails.accountName
//       ) {
//         result.skippedNoBankDetails += 1;
//         continue;
//       }

//       const transferReference = String(order.settlementBatchId || "").trim()
//         ? String(order.settlementBatchId).trim()
//         : `PAYOUT-${paymentReference}`;

//       const lockResult = await Order.updateOne(
//         {
//           _id: order._id,
//           settlementStatus: { $in: ["pending", "failed"] },
//         },
//         {
//           settlementStatus: "processing",
//           settlementBatchId: transferReference,
//           settlementLastAttemptAt: new Date(),
//           settlementLastError: "",
//         },
//       );

//       // Another worker already picked this up (or webhook is processing it).
//       if (!lockResult.modifiedCount) {
//         continue;
//       }

//       result.payoutsAttempted += 1;

//       await SquadService.transferToOrganizer({
//         amount: Math.round(payoutAmount * 100),
//         bank_code: bankDetails.bankCode,
//         account_number: bankDetails.accountNumber,
//         account_name: String(bankDetails.accountName),
//         transaction_reference: transferReference,
//       });

//       await Order.updateOne(
//         { _id: order._id },
//         {
//           settlementStatus: "settled",
//           settlementDate: new Date(),
//           settlementBatchId: transferReference,
//           settlementLastError: "",
//         },
//       );

//       result.payoutsSucceeded += 1;
//       result.ordersProcessed += 1;
//     } catch (error) {
//       result.payoutsFailed += 1;
//       result.errors.push({
//         orderId,
//         message: error instanceof Error ? error.message : "Unknown error",
//       });

//       const message = error instanceof Error ? error.message : "Unknown error";

//       await Order.updateOne(
//         { _id: order._id },
//         {
//           settlementStatus: "failed",
//           settlementLastError: message,
//           settlementLastAttemptAt: new Date(),
//         },
//       );
//     }
//   }

//   return result;
// };

export type SquadSettlementSyncResult = {
  ordersMatched: number;
  ordersProcessed: number;
  payoutsAttempted: number;
  payoutsSucceeded: number;
  payoutsFailed: number;
  skippedNoBankDetails: number;
  skippedNoPayoutRequired: number;
  skippedMissingReference: number;
  eventGroupsMatched: number;
  eventGroupsPrepared: number;
  errors: Array<{ eventId: string; message: string }>;
};

type SettlementOrderLite = {
  _id: mongoose.Types.ObjectId;
  eventId: mongoose.Types.ObjectId;
  organizerPayoutAmount?: number;
};

type SettlementSummary = {
  confirmedSales: number;
  pendingSettlement: number;
  settled: number;
  platformFees: number;
  squadGatewayFees: number;
  squadTransferFees: number;
  organizerPayoutAmount: number;
  totalPaidOrders: number;
};

type SettlementPagination = {
  page: number;
  perPage: number;
  totalOrders: number;
  totalPages: number;
};

type DailyPayoutStatus = "processing" | "settled" | "all";

const defaultSettlementSummary = (): SettlementSummary => ({
  confirmedSales: 0,
  pendingSettlement: 0,
  settled: 0,
  platformFees: 0,
  squadGatewayFees: 0,
  squadTransferFees: 0,
  organizerPayoutAmount: 0,
  totalPaidOrders: 0,
});

const buildSettlementSummaryPipeline = (
  match: Record<string, unknown>,
): mongoose.PipelineStage[] => [
  {
    $match: match,
  },
  {
    $group: {
      _id: null,
      confirmedSales: { $sum: "$totalAmount" },
      platformFees: { $sum: "$platformFeeTotal" },
      squadGatewayFees: { $sum: "$squadGatewayFee" },
      squadTransferFees: { $sum: "$squadTransferFee" },
      organizerPayoutAmount: { $sum: "$organizerPayoutAmount" },
      totalPaidOrders: { $sum: 1 },
      pendingSettlement: {
        $sum: {
          $cond: [
            { $in: ["$settlementStatus", ["pending", "processing"]] },
            "$organizerPayoutAmount",
            0,
          ],
        },
      },
      settled: {
        $sum: {
          $cond: [
            { $eq: ["$settlementStatus", "settled"] },
            "$organizerPayoutAmount",
            0,
          ],
        },
      },
    },
  },
];

const buildPagination = (
  page: number,
  perPage: number,
  totalOrders: number,
): SettlementPagination => ({
  page,
  perPage,
  totalOrders,
  totalPages: Math.ceil(totalOrders / perPage),
});

const buildUtcDateRange = (dateInput?: string) => {
  const date =
    String(dateInput || "").trim() || new Date().toISOString().slice(0, 10);
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${date}T23:59:59.999Z`);

  return {
    date,
    start,
    end,
  };
};

const getBatchStatusCounts = async (batchId: string) => {
  const counts = (await Order.aggregate([
    {
      $match: {
        settlementBatchId: batchId,
      },
    },
    {
      $group: {
        _id: "$settlementStatus",
        count: { $sum: 1 },
      },
    },
  ])) as Array<{ _id: string; count: number }>;

  return counts.reduce(
    (acc, item) => {
      if (item._id === "processing") acc.processing += item.count;
      if (item._id === "settled") acc.settled += item.count;
      if (item._id === "pending") acc.pending += item.count;
      if (item._id === "failed") acc.failed += item.count;
      return acc;
    },
    { processing: 0, settled: 0, pending: 0, failed: 0 },
  );
};

const hasValidBankDetails = (
  bankDetails?: {
    bankCode?: string | null;
    accountNumber?: string | null;
    accountName?: string | null;
  } | null,
) => {
  return Boolean(
    bankDetails?.bankCode &&
    bankDetails.accountNumber &&
    bankDetails.accountName,
  );
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
    eventGroupsMatched: 0,
    eventGroupsPrepared: 0,
    errors: [],
  };

  const now = options?.to ?? new Date();
  const maturedBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const match: Record<string, unknown> = {
    paymentGateway: "squad",
    paymentStatus: "paid",
    settlementStatus: { $in: ["pending", "failed"] },
    createdAt: { $lte: maturedBefore },
  };

  if (options?.from) {
    match.createdAt = {
      $gte: options.from,
      $lte: maturedBefore,
    };
  }

  if (options?.eventIds?.length) {
    match.eventId = { $in: options.eventIds };
  }

  const limit = Math.max(1, Math.min(options?.limit ?? 1000, 3000));

  const orders = (await Order.find(match)
    .sort({ createdAt: 1, _id: 1 })
    .limit(limit)
    .select("_id eventId organizerPayoutAmount")
    .lean()) as SettlementOrderLite[];

  result.ordersMatched = orders.length;

  if (!orders.length) return result;

  const groupedByEvent = new Map<
    string,
    {
      orderIds: mongoose.Types.ObjectId[];
      totalPayoutAmount: number;
      orderCount: number;
    }
  >();

  for (const order of orders) {
    const eventId = String(order.eventId);
    const existing = groupedByEvent.get(eventId);

    if (existing) {
      existing.orderIds.push(order._id);
      existing.totalPayoutAmount += Number(order.organizerPayoutAmount || 0);
      existing.orderCount += 1;
      continue;
    }

    groupedByEvent.set(eventId, {
      orderIds: [order._id],
      totalPayoutAmount: Number(order.organizerPayoutAmount || 0),
      orderCount: 1,
    });
  }

  result.eventGroupsMatched = groupedByEvent.size;

  const eventIds = Array.from(groupedByEvent.keys()).map(
    (id) => new mongoose.Types.ObjectId(id),
  );

  const events = await Event.find({ _id: { $in: eventIds } })
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
    organizers.map((organizer) => [
      String(organizer._id),
      organizer.bankDetails,
    ]),
  );

  for (const [eventId, group] of groupedByEvent.entries()) {
    try {
      result.payoutsAttempted += 1;

      if (group.totalPayoutAmount <= 0) {
        result.skippedNoPayoutRequired += group.orderCount;
        continue;
      }

      const organizerId = eventOrganizerMap.get(eventId);
      const bankDetails = organizerId
        ? organizerBankMap.get(String(organizerId))
        : undefined;

      if (!hasValidBankDetails(bankDetails)) {
        result.skippedNoBankDetails += group.orderCount;
        continue;
      }

      const batchId = `MANUAL-BATCH-${eventId}-${Date.now()}`;

      const lockResult = await Order.updateMany(
        {
          _id: { $in: group.orderIds },
          settlementStatus: { $in: ["pending", "failed"] },
        },
        {
          settlementStatus: "processing",
          settlementBatchId: batchId,
          settlementLastAttemptAt: new Date(),
          settlementLastError: "",
        },
      );

      if (!lockResult.modifiedCount) {
        continue;
      }

      result.ordersProcessed += lockResult.modifiedCount;
      result.eventGroupsPrepared += 1;
      result.payoutsSucceeded += 1;
    } catch (error) {
      result.payoutsFailed += 1;
      result.errors.push({
        eventId,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return result;
};

export const confirmManualSettlement = async (batchId: string) => {
  const safeBatchId = String(batchId || "").trim();

  if (!safeBatchId) {
    throw new Error("batchId is required");
  }

  const settlementDate = new Date();

  const updateResult = await Order.updateMany(
    {
      settlementBatchId: safeBatchId,
      settlementStatus: "processing",
    },
    {
      settlementStatus: "settled",
      settlementDate,
      settlementLastError: "",
    },
  );

  return {
    batchId: safeBatchId,
    ordersSettled: updateResult.modifiedCount,
    ordersMatched: updateResult.matchedCount,
    settlementDate,
  };
};

export const reopenManualSettlement = async (batchId: string) => {
  const safeBatchId = String(batchId || "").trim();

  if (!safeBatchId) {
    throw new Error("batchId is required");
  }

  const updateResult = await Order.updateMany(
    {
      settlementBatchId: safeBatchId,
      settlementStatus: "settled",
    },
    {
      $set: {
        settlementStatus: "processing",
        settlementLastAttemptAt: new Date(),
        settlementLastError: "",
      },
      $unset: {
        settlementDate: 1,
      },
    },
  );

  return {
    batchId: safeBatchId,
    ordersReopened: updateResult.modifiedCount,
    ordersMatched: updateResult.matchedCount,
  };
};

export const getOrganizerSettlementSummaryData = async (options: {
  organizerId: string | mongoose.Types.ObjectId;
  page: number;
  perPage: number;
}) => {
  const organizerObjectId =
    typeof options.organizerId === "string"
      ? new mongoose.Types.ObjectId(options.organizerId)
      : options.organizerId;

  const organizerEvents = (await Event.find({
    organizerId: organizerObjectId,
  })
    .select("_id title date location")
    .lean()) as Array<{
    _id: mongoose.Types.ObjectId;
    title: string;
    date?: Date;
    location?: string;
  }>;

  const eventIds = organizerEvents.map((event) => event._id);

  if (!eventIds.length) {
    return {
      summary: {
        ...defaultSettlementSummary(),
        totalEventsWithSales: 0,
      },
      events: [],
      pagination: buildPagination(options.page, options.perPage, 0),
      recentOrders: [],
    };
  }

  const summaryAgg = (await Order.aggregate(
    buildSettlementSummaryPipeline({
      eventId: { $in: eventIds },
      paymentStatus: "paid",
    }),
  )) as SettlementSummary[];

  const eventBreakdownAgg = (await Order.aggregate([
    {
      $match: {
        eventId: { $in: eventIds },
        paymentStatus: "paid",
      },
    },
    {
      $group: {
        _id: "$eventId",
        confirmedSales: { $sum: "$totalAmount" },
        platformFees: { $sum: "$platformFeeTotal" },
        squadGatewayFees: { $sum: "$squadGatewayFee" },
        squadTransferFees: { $sum: "$squadTransferFee" },
        organizerPayoutAmount: { $sum: "$organizerPayoutAmount" },
        totalPaidOrders: { $sum: 1 },
        pendingSettlement: {
          $sum: {
            $cond: [
              { $in: ["$settlementStatus", ["pending", "processing"]] },
              "$organizerPayoutAmount",
              0,
            ],
          },
        },
        settled: {
          $sum: {
            $cond: [
              { $eq: ["$settlementStatus", "settled"] },
              "$organizerPayoutAmount",
              0,
            ],
          },
        },
      },
    },
    {
      $sort: {
        confirmedSales: -1,
      },
    },
  ])) as Array<
    SettlementSummary & {
      _id: mongoose.Types.ObjectId;
    }
  >;

  const eventMap = new Map(
    organizerEvents.map((event) => [event._id.toString(), event]),
  );

  const events = eventBreakdownAgg.map((item) => {
    const event = eventMap.get(item._id.toString());

    return {
      eventId: item._id,
      title: event?.title || "Unknown Event",
      date: event?.date || null,
      location: event?.location || "",
      confirmedSales: item.confirmedSales,
      pendingSettlement: item.pendingSettlement,
      settled: item.settled,
      platformFees: item.platformFees,
      squadGatewayFees: item.squadGatewayFees,
      squadTransferFees: item.squadTransferFees,
      organizerPayoutAmount: item.organizerPayoutAmount,
      totalPaidOrders: item.totalPaidOrders,
    };
  });

  const skip = (options.page - 1) * options.perPage;

  const totalOrders = await Order.countDocuments({
    eventId: { $in: eventIds },
    paymentStatus: "paid",
  });

  const recentOrders = (await Order.find({
    eventId: { $in: eventIds },
    paymentStatus: "paid",
  })
    .select(
      "eventId buyerName buyerEmail paymentReference totalAmount platformFeeTotal squadGatewayFee squadTransferFee organizerPayoutAmount settlementStatus paidAt settlementDate createdAt",
    )
    .sort({ paidAt: -1, createdAt: -1 })
    .skip(skip)
    .limit(options.perPage)
    .lean()) as Array<{
    _id: mongoose.Types.ObjectId;
    eventId: mongoose.Types.ObjectId;
    buyerName: string;
    buyerEmail: string;
    paymentReference?: string;
    totalAmount: number;
    platformFeeTotal?: number;
    squadGatewayFee?: number;
    squadTransferFee?: number;
    organizerPayoutAmount?: number;
    settlementStatus: string;
    paidAt?: Date;
    settlementDate?: Date;
  }>;

  const summary = summaryAgg[0] || defaultSettlementSummary();

  return {
    summary: {
      ...summary,
      totalEventsWithSales: events.length,
    },
    events,
    pagination: buildPagination(options.page, options.perPage, totalOrders),
    recentOrders: recentOrders.map((order) => {
      const event = eventMap.get(order.eventId.toString());

      return {
        id: order._id,
        eventId: order.eventId,
        eventTitle: event?.title || "Unknown Event",
        buyerName: order.buyerName,
        buyerEmail: order.buyerEmail,
        paymentReference: order.paymentReference,
        grossAmount: order.totalAmount,
        platformFeeTotal: order.platformFeeTotal || 0,
        squadGatewayFee: order.squadGatewayFee || 0,
        squadTransferFee: order.squadTransferFee || 0,
        organizerPayoutAmount: order.organizerPayoutAmount || 0,
        settlementStatus: order.settlementStatus,
        paidAt: order.paidAt,
        settlementDate: order.settlementDate,
      };
    }),
  };
};

export const getEventSettlementSummaryData = async (options: {
  organizerId: string | mongoose.Types.ObjectId;
  eventId: string | mongoose.Types.ObjectId;
  page: number;
  perPage: number;
}) => {
  const organizerObjectId =
    typeof options.organizerId === "string"
      ? new mongoose.Types.ObjectId(options.organizerId)
      : options.organizerId;
  const eventObjectId =
    typeof options.eventId === "string"
      ? new mongoose.Types.ObjectId(options.eventId)
      : options.eventId;

  const event = (await Event.findOne({
    _id: eventObjectId,
    organizerId: organizerObjectId,
  }).select("title date location organizerId")) as {
    _id: mongoose.Types.ObjectId;
    title: string;
    date?: Date;
    location?: string;
    organizerId: mongoose.Types.ObjectId;
  } | null;

  if (!event) {
    return null;
  }

  const summaryAgg = (await Order.aggregate(
    buildSettlementSummaryPipeline({
      eventId: event._id,
      paymentStatus: "paid",
    }),
  )) as SettlementSummary[];

  const skip = (options.page - 1) * options.perPage;

  const totalOrders = await Order.countDocuments({
    eventId: event._id,
    paymentStatus: "paid",
  });

  const orders = (await Order.find({
    eventId: event._id,
    paymentStatus: "paid",
  })
    .select(
      "buyerName buyerEmail paymentReference totalAmount platformFeeTotal squadGatewayFee squadTransferFee organizerPayoutAmount settlementStatus paidAt settlementDate",
    )
    .sort({ paidAt: -1, createdAt: -1 })
    .skip(skip)
    .limit(options.perPage)
    .lean()) as Array<{
    _id: mongoose.Types.ObjectId;
    buyerName: string;
    buyerEmail: string;
    paymentReference?: string;
    totalAmount: number;
    platformFeeTotal?: number;
    squadGatewayFee?: number;
    squadTransferFee?: number;
    organizerPayoutAmount?: number;
    settlementStatus: string;
    paidAt?: Date;
    settlementDate?: Date;
  }>;

  return {
    event: {
      id: event._id,
      title: event.title,
      date: event.date,
      location: event.location,
    },
    summary: summaryAgg[0] || defaultSettlementSummary(),
    pagination: buildPagination(options.page, options.perPage, totalOrders),
    orders: orders.map((order) => ({
      id: order._id,
      buyerName: order.buyerName,
      buyerEmail: order.buyerEmail,
      paymentReference: order.paymentReference,
      grossAmount: order.totalAmount,
      platformFeeTotal: order.platformFeeTotal || 0,
      squadGatewayFee: order.squadGatewayFee || 0,
      squadTransferFee: order.squadTransferFee || 0,
      organizerPayoutAmount: order.organizerPayoutAmount || 0,
      settlementStatus: order.settlementStatus,
      paidAt: order.paidAt,
      settlementDate: order.settlementDate,
    })),
  };
};

export const getAdminDailyPayoutReport = async (options?: {
  date?: string;
  status?: DailyPayoutStatus;
  organizerId?: string;
}) => {
  const status = options?.status || "processing";
  const { date, start, end } = buildUtcDateRange(options?.date);
  const baseMatch: Record<string, unknown> = {
    paymentStatus: "paid",
    settlementBatchId: { $ne: "" },
  };

  if (options?.organizerId) {
    baseMatch.organizerId = new mongoose.Types.ObjectId(options.organizerId);
  }

  const statusFilters: Record<
    Exclude<DailyPayoutStatus, "all">,
    Record<string, unknown>
  > = {
    processing: {
      settlementStatus: "processing",
      settlementLastAttemptAt: { $gte: start, $lte: end },
    },
    settled: {
      settlementStatus: "settled",
      settlementDate: { $gte: start, $lte: end },
    },
  };

  const pipeline: mongoose.PipelineStage[] = [
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
      $addFields: {
        organizerId: "$organizer._id",
      },
    },
    {
      $match: baseMatch,
    },
  ];

  if (status === "all") {
    pipeline.push({
      $match: {
        $or: [statusFilters.processing, statusFilters.settled],
      },
    });
  } else {
    pipeline.push({
      $match: statusFilters[status],
    });
  }

  pipeline.push(
    {
      $group: {
        _id: "$settlementBatchId",
        settlementBatchId: { $first: "$settlementBatchId" },
        status: { $first: "$settlementStatus" },
        settlementDate: { $max: "$settlementDate" },
        settlementLastAttemptAt: { $max: "$settlementLastAttemptAt" },
        orderCount: { $sum: 1 },
        totalPayout: { $sum: "$organizerPayoutAmount" },
        eventId: { $first: "$event._id" },
        eventTitle: { $first: "$event.title" },
        eventDate: { $first: "$event.date" },
        organizerId: { $first: "$organizer._id" },
        organizerName: { $first: "$organizer.name" },
        organizerSlug: { $first: "$organizer.slug" },
        bankName: { $first: "$organizer.bankDetails.bankName" },
        bankCode: { $first: "$organizer.bankDetails.bankCode" },
        accountNumber: { $first: "$organizer.bankDetails.accountNumber" },
        accountName: { $first: "$organizer.bankDetails.accountName" },
      },
    },
    {
      $sort: {
        settlementLastAttemptAt: -1,
        settlementDate: -1,
        eventTitle: 1,
      },
    },
  );

  const batches = (await Order.aggregate(pipeline)) as Array<{
    settlementBatchId: string;
    status: "processing" | "settled";
    settlementDate?: Date;
    settlementLastAttemptAt?: Date;
    orderCount: number;
    totalPayout: number;
    eventId: mongoose.Types.ObjectId;
    eventTitle: string;
    eventDate?: Date;
    organizerId: mongoose.Types.ObjectId;
    organizerName: string;
    organizerSlug?: string;
    bankName?: string;
    bankCode?: string;
    accountNumber?: string;
    accountName?: string;
  }>;

  const totalReadyToPay = batches
    .filter((batch) => batch.status === "processing")
    .reduce((sum, batch) => sum + batch.totalPayout, 0);
  const totalSettledToday = batches
    .filter((batch) => batch.status === "settled")
    .reduce((sum, batch) => sum + batch.totalPayout, 0);
  const totalOrderCount = batches.reduce(
    (sum, batch) => sum + batch.orderCount,
    0,
  );

  return {
    summary: {
      date,
      status,
      totalReadyToPay,
      totalProcessing: batches.filter((batch) => batch.status === "processing")
        .length,
      totalSettledToday,
      totalBatches: batches.length,
      totalOrders: totalOrderCount,
    },
    batches: batches.map((batch) => ({
      batchId: batch.settlementBatchId,
      status: batch.status,
      orderCount: batch.orderCount,
      totalPayout: batch.totalPayout,
      event: {
        id: batch.eventId,
        title: batch.eventTitle,
        date: batch.eventDate || null,
      },
      organizer: {
        id: batch.organizerId,
        name: batch.organizerName,
        slug: batch.organizerSlug || "",
      },
      bankDetails: {
        bankName: batch.bankName || "",
        bankCode: batch.bankCode || "",
        accountNumber: batch.accountNumber || "",
        accountName: batch.accountName || "",
      },
      preparedAt: batch.settlementLastAttemptAt || null,
      settlementDate: batch.settlementDate || null,
    })),
  };
};

export const toggleManualSettlement = async (
  batchId: string,
  settled: boolean,
) => {
  const normalizedBatchId = String(batchId || "").trim();

  if (!normalizedBatchId) {
    throw new Error("batchId is required");
  }

  const toggleResult = settled
    ? await confirmManualSettlement(normalizedBatchId)
    : await reopenManualSettlement(normalizedBatchId);

  const batch = (await Order.aggregate([
    {
      $match: {
        settlementBatchId: normalizedBatchId,
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
      $group: {
        _id: "$settlementBatchId",
        batchId: { $first: "$settlementBatchId" },
        status: { $first: "$settlementStatus" },
        orderCount: { $sum: 1 },
        totalPayout: { $sum: "$organizerPayoutAmount" },
        settlementDate: { $max: "$settlementDate" },
        preparedAt: { $max: "$settlementLastAttemptAt" },
        eventId: { $first: "$event._id" },
        eventTitle: { $first: "$event.title" },
        organizerId: { $first: "$organizer._id" },
        organizerName: { $first: "$organizer.name" },
      },
    },
  ])) as Array<{
    batchId: string;
    status: string;
    orderCount: number;
    totalPayout: number;
    settlementDate?: Date;
    preparedAt?: Date;
    eventId: mongoose.Types.ObjectId;
    eventTitle: string;
    organizerId: mongoose.Types.ObjectId;
    organizerName: string;
  }>;

  if (!batch.length) {
    throw new Error("Settlement batch not found");
  }

  const batchDetails = batch[0]!;

  return {
    ...toggleResult,
    batch: {
      batchId: batchDetails.batchId,
      status: batchDetails.status,
      orderCount: batchDetails.orderCount,
      totalPayout: batchDetails.totalPayout,
      settlementDate: batchDetails.settlementDate || null,
      preparedAt: batchDetails.preparedAt || null,
      event: {
        id: batchDetails.eventId,
        title: batchDetails.eventTitle,
      },
      organizer: {
        id: batchDetails.organizerId,
        name: batchDetails.organizerName,
      },
    },
    counts: await getBatchStatusCounts(normalizedBatchId),
  };
};
