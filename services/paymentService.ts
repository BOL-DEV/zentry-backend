import { Request, Response, NextFunction } from "express";
import Order from "../models/order";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import { orderIdParamSchema } from "../validations/payment.schema";
import { generatePaymentReference } from "../utils/generatePaymentReference";

export const initializeOrderPayment = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { orderId } = orderIdParamSchema.parse(req.params);

    const order = await Order.findById(orderId);

    if (!order) {
      return next(new AppError("Order not found", 404));
    }

    if (order.paymentStatus !== "pending") {
      return next(
        new AppError(
          "This order is not eligible for payment initialization",
          400,
        ),
      );
    }

    if (!order.paymentReference) {
      order.paymentReference = generatePaymentReference();
      await order.save();
    }

    res.status(200).json({
      status: "success",
      data: {
        order: {
          id: order._id,
          buyerName: order.buyerName,
          buyerEmail: order.buyerEmail,
          totalAmount: order.totalAmount,
          paymentStatus: order.paymentStatus,
          paymentReference: order.paymentReference,
        },
        payment: {
          provider: "mock",
          paymentUrl: `https://mock-payment-link.com/pay/${order.paymentReference}`,
        },
      },
    });
  },
);
