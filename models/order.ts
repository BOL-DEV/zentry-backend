import { model, Schema, Types, type HydratedDocument } from "mongoose";

export interface IOrder {
  eventId: Types.ObjectId;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string;
  totalAmount: number;
  paymentStatus: "pending" | "paid" | "cancelled";
  paymentReference?: string;
  createdAt: Date;
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
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

OrderSchema.index({ eventId: 1, createdAt: -1 });

const Order = model<IOrder>("Order", OrderSchema);

export default Order;
