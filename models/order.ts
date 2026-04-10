import { model, Schema, Types, type HydratedDocument } from "mongoose";

export interface IOrder {
  eventId: Types.ObjectId;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string;
  totalAmount: number;
  paymentStatus: "pending" | "paid" | "cancelled";
  paymentReference?: string;
  accessToken?: string;
  reservationExpiresAt?: Date;
  reservationReleasedAt?: Date;

  paymentGateway: "paystack" | "squad";
  paidAt?: Date;

  virtualAccountDetails?: {
    accountNumber: string;
    bankName: string;
    accountName: string;
    expiresAt: Date;
  };

  squadTransferFee: number;
  organizerPayoutAmount: number;

  platformFeeTotal: number;
  paystackFeeTotal: number;
  expectedNetSettlement: number;

  settlementStatus: "pending" | "processing" | "settled" | "failed";
  settlementBatchId?: string;
  settlementDate?: Date;

  paystackTransactionId?: string;

  createdAt: Date;
  updatedAt: Date;
}

export type OrderDocument = HydratedDocument<IOrder>;

const OrderSchema = new Schema<IOrder>(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: [true, "Order must belong to an event"],
    },
    buyerName: {
      type: String,
      required: [true, "Purchaser name is required"],
      trim: true,
    },
    buyerEmail: {
      type: String,
      required: [true, "Purchaser email is required"],
      trim: true,
      lowercase: true,
    },
    buyerPhone: {
      type: String,
      trim: true,
      default: "",
    },
    totalAmount: {
      type: Number,
      required: [true, "Order must have a total amount"],
      min: [0, "Total amount cannot be negative"],
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "cancelled"],
      default: "pending",
    },
    paymentReference: {
      type: String,
      trim: true,
    },
    accessToken: {
      type: String,
      trim: true,
      select: false,
    },
    reservationExpiresAt: Date,
    reservationReleasedAt: Date,
    paymentGateway: {
      type: String,
      enum: ["paystack", "squad"],
      default: "squad",
    },
    paidAt: Date,
    platformFeeTotal: {
      type: Number,
      default: 0,
    },
    paystackFeeTotal: {
      type: Number,
      default: 0,
    },
    expectedNetSettlement: {
      type: Number,
      default: 0,
    },
    settlementStatus: {
      type: String,
      enum: ["pending", "processing", "settled", "failed"],
      default: "pending",
    },
    settlementBatchId: {
      type: String,
      trim: true,
      default: "",
    },
    settlementDate: Date,
    paystackTransactionId: {
      type: String,
      trim: true,
      default: "",
    },
    virtualAccountDetails: {
      accountNumber: {
        type: String,
        trim: true,
      },
      bankName: {
        type: String,
        trim: true,
      },
      accountName: {
        type: String,
        trim: true,
      },
      expiresAt: Date,
    },
    squadTransferFee: {
      type: Number,
      default: 0,
    },
    organizerPayoutAmount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

OrderSchema.index({ eventId: 1, createdAt: -1 });
OrderSchema.index({ paymentReference: 1 }, { unique: true, sparse: true });
OrderSchema.index({ accessToken: 1 }, { unique: true, sparse: true });
OrderSchema.index({ eventId: 1, paymentStatus: 1, createdAt: -1 });
OrderSchema.index({ eventId: 1, settlementStatus: 1, paidAt: -1 });

const Order = model<IOrder>("Order", OrderSchema);

export default Order;
