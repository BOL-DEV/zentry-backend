import { Request, Response, NextFunction } from "express";
import Order from "../models/order";
import Ticket from "../models/ticket";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import { orderIdParamSchema } from "../validations/payment.schema";

export const getOrderTickets = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { orderId } = orderIdParamSchema.parse(req.params);

    const order = await Order.findById(orderId).lean();

    if (!order) {
      return next(new AppError("Order not found", 404));
    }

    const tickets = await Ticket.find({ orderId: order._id })
      .sort({ createdAt: 1 })
      .lean();

    res.status(200).json({
      status: "success",
      results: tickets.length,
      data: {
        order: {
          id: order._id,
          buyerName: order.buyerName,
          buyerEmail: order.buyerEmail,
          buyerPhone: order.buyerPhone,
          totalAmount: order.totalAmount,
          paymentStatus: order.paymentStatus,
          paymentReference: order.paymentReference,
          createdAt: order.createdAt,
        },
        tickets,
      },
    });
  },
);
