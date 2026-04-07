import Order from "../models/order";
import {
  listSettlements,
  listSettlementTransactions,
} from "./paystackSettlementService";

type SyncResult = {
  settlementsChecked: number;
  transactionsChecked: number;
  ordersUpdated: number;
  unmatchedTransactions: Array<{
    settlementId: number;
    reference: string;
    transactionId: string;
    amount: number;
  }>;
};

const mapSettlementStatus = (
  status: "success" | "processing" | "pending" | "failed",
): "settled" | "processing" | "pending" | "failed" => {
  if (status === "success") return "settled";
  if (status === "processing") return "processing";
  if (status === "failed") return "failed";
  return "pending";
};

const areDatesEqual = (a?: Date | null, b?: Date | null) => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.getTime() === b.getTime();
};

export const syncPaystackSettlements = async (options?: {
  from?: Date;
  to?: Date;
  subaccount?: string;
}) => {
  const result: SyncResult = {
    settlementsChecked: 0,
    transactionsChecked: 0,
    ordersUpdated: 0,
    unmatchedTransactions: [],
  };

  let settlementPage = 1;
  const perPage = 30;

  while (true) {
    const settlementQuery: {
      from?: string;
      to?: string;
      subaccount?: string;
      page: number;
      perPage: number;
    } = {
      page: settlementPage,
      perPage,
    };

    if (options?.from) {
      settlementQuery.from = options.from.toISOString();
    }

    if (options?.to) {
      settlementQuery.to = options.to.toISOString();
    }

    if (options?.subaccount) {
      settlementQuery.subaccount = options.subaccount;
    }

    const settlements = await listSettlements(settlementQuery);

    if (!settlements.length) break;

    result.settlementsChecked += settlements.length;

    for (const settlement of settlements) {
      let transactionPage = 1;

      while (true) {
        const transactions = await listSettlementTransactions(settlement.id, {
          page: transactionPage,
          perPage,
        });

        if (!transactions.length) break;

        for (const trx of transactions) {
          result.transactionsChecked += 1;

          const transactionId = String(trx.id);
          const reference = trx.reference;
          const settlementStatus = mapSettlementStatus(settlement.status);
          const settlementDate = settlement.settlement_date
            ? new Date(settlement.settlement_date)
            : null;
          const settlementBatchId = String(settlement.id);

          const order = await Order.findOne({
            paymentStatus: "paid",
            $or: [
              { paystackTransactionId: transactionId },
              { paymentReference: reference },
            ],
          });

          if (!order) {
            result.unmatchedTransactions.push({
              settlementId: settlement.id,
              reference,
              transactionId,
              amount: trx.amount,
            });
            continue;
          }

          let hasChanged = false;

          if (order.settlementStatus !== settlementStatus) {
            order.settlementStatus = settlementStatus;
            hasChanged = true;
          }

          if (order.settlementBatchId !== settlementBatchId) {
            order.settlementBatchId = settlementBatchId;
            hasChanged = true;
          }

          if (!areDatesEqual(order.settlementDate, settlementDate)) {
            if (settlementDate) {
              order.settlementDate = settlementDate;
            } else {
              delete order.settlementDate;
            }
            hasChanged = true;
          }

          if (!order.paystackTransactionId && transactionId) {
            order.paystackTransactionId = transactionId;
            hasChanged = true;
          }

          if (hasChanged) {
            await order.save();
            result.ordersUpdated += 1;
          }
        }

        if (transactions.length < perPage) break;
        transactionPage += 1;
      }
    }

    if (settlements.length < perPage) break;
    settlementPage += 1;
  }

  return result;
};
