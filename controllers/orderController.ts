import { Request, Response, NextFunction } from "express";
import Order from "../models/order";
import Ticket from "../models/ticket";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import {
  orderIdParamSchema,
  paymentReferenceParamSchema,
} from "../validations/payment.schema";
import { assertOrderAccess } from "../utils/orderAccess";

export const getOrderByPaymentReference = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { paymentReference } = paymentReferenceParamSchema.parse(req.params);

    const order = await Order.findOne({ paymentReference })
      .select("+accessToken")
      .lean();

    if (!order) {
      return next(
        new AppError("Order not found for this payment reference", 404),
      );
    }

    assertOrderAccess(req, order);

    res.status(200).json({
      status: "success",
      data: {
        order: {
          id: order._id,
          eventId: order.eventId,
          buyerName: order.buyerName,
          buyerEmail: order.buyerEmail,
          buyerPhone: order.buyerPhone,
          totalAmount: order.totalAmount,
          paymentStatus: order.paymentStatus,
          paymentReference: order.paymentReference,
          reservationExpiresAt: order.reservationExpiresAt,
          createdAt: order.createdAt,
        },
      },
    });
  },
);

export const getOrderStatus = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { orderId } = orderIdParamSchema.parse(req.params);

    const order = await Order.findById(orderId)
      .select(
        "_id paymentStatus paymentReference totalAmount createdAt buyerEmail reservationExpiresAt +accessToken",
      )
      .lean();

    if (!order) {
      return next(new AppError("Order not found", 404));
    }

    assertOrderAccess(req, order);

    res.status(200).json({
      status: "success",
      data: {
        orderStatus: {
          orderId: order._id,
          paymentStatus: order.paymentStatus,
          paymentReference: order.paymentReference,
          totalAmount: order.totalAmount,
          isPaid: order.paymentStatus === "paid",
          reservationExpiresAt: order.reservationExpiresAt,
          createdAt: order.createdAt,
        },
      },
    });
  },
);

export const getOrderTickets = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { orderId } = orderIdParamSchema.parse(req.params);

    const order = await Order.findById(orderId).select("+accessToken").lean();

    if (!order) {
      return next(new AppError("Order not found", 404));
    }

    assertOrderAccess(req, order);

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
