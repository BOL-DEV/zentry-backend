import { createModel } from "../db/orm";

export interface IOrder {
  _id: string;
  eventId: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string;
  totalAmount: number;
  paymentStatus: "pending" | "paid" | "cancelled";
  paymentReference?: string;
  accessToken?: string;
  reservationExpiresAt?: Date;
  reservationReleasedAt?: Date;
  paymentGateway: "squad";
  paidAt?: Date;
  squadTransferFee: number;
  squadGatewayFee: number;
  platformFeeTotal: number;
  organizerPayoutAmount: number;
  settlementStatus: "pending" | "processing" | "settled" | "failed";
  settlementBatchId?: string;
  settlementDate?: Date;
  settlementLastError?: string;
  settlementLastAttemptAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type OrderDocument = any;

const Order = createModel<IOrder>({
  modelName: "Order",
  tableName: "orders",
  fields: {
    _id: "id",
    eventId: "event_id",
    buyerName: "buyer_name",
    buyerEmail: "buyer_email",
    buyerPhone: "buyer_phone",
    totalAmount: "total_amount",
    paymentStatus: "payment_status",
    paymentReference: "payment_reference",
    accessToken: "access_token",
    reservationExpiresAt: "reservation_expires_at",
    reservationReleasedAt: "reservation_released_at",
    paymentGateway: "payment_gateway",
    paidAt: "paid_at",
    squadTransferFee: "squad_transfer_fee",
    squadGatewayFee: "squad_gateway_fee",
    platformFeeTotal: "platform_fee_total",
    organizerPayoutAmount: "organizer_payout_amount",
    settlementStatus: "settlement_status",
    settlementBatchId: "settlement_batch_id",
    settlementDate: "settlement_date",
    settlementLastError: "settlement_last_error",
    settlementLastAttemptAt: "settlement_last_attempt_at",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  hiddenFields: ["accessToken"],
  relations: {
    eventId: { modelName: "Event" },
  },
});

export default Order;

