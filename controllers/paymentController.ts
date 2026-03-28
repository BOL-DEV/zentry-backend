import { Request, Response, NextFunction } from "express";
import axios from "axios";
import Order from "../models/order";
import Event from "../models/event";
import Organizer from "../models/organizer";
import OrderItem from "../models/orderItem";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import { orderIdParamSchema } from "../validations/payment.schema";
import { generatePaymentReference } from "../utils/generatePaymentReference";

const PLATFORM_FEE_FLAT_NAIRA = 100;
const PLATFORM_FEE_THRESHOLD_NAIRA = 3500;
const PLATFORM_FEE_PERCENT_ABOVE_THRESHOLD = 0.03;

function platformFeePerTicketInKobo(unitPriceNaira: number): number {
  if (!Number.isFinite(unitPriceNaira) || unitPriceNaira < 0) return 0;

  if (unitPriceNaira < PLATFORM_FEE_THRESHOLD_NAIRA) {
    return PLATFORM_FEE_FLAT_NAIRA * 100;
  }

  return Math.round(unitPriceNaira * PLATFORM_FEE_PERCENT_ABOVE_THRESHOLD * 100);
}

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

    if (order.totalAmount <= 0) {
      return next(new AppError("Invalid order amount", 400));
    }

    if (!process.env.PAYSTACK_SECRET_KEY) {
      return next(new AppError("Paystack secret key is not configured", 500));
    }

    if (!process.env.PAYSTACK_CALLBACK_URL) {
      return next(new AppError("Paystack callback URL is not configured", 500));
    }

    const event = await Event.findById(order.eventId)
      .select("_id organizerId title")
      .lean();

    if (!event) {
      return next(new AppError("Event not found for this order", 404));
    }

    const organizer = await Organizer.findById(event.organizerId)
      .select("_id name paystackSubaccountCode")
      .lean();

    if (!organizer) {
      return next(new AppError("Organizer not found for this event", 404));
    }

    if (!organizer.paystackSubaccountCode) {
      return next(new AppError("Organizer payment setup is incomplete", 400));
    }

    const orderItems = await OrderItem.find({ orderId: order._id })
      .select("quantity unitPrice")
      .lean();

    if (!orderItems.length) {
      return next(new AppError("No order items found for this order", 400));
    }

    const totalTickets = orderItems.reduce(
      (acc, item) => acc + item.quantity,
      0,
    );

    if (totalTickets <= 0) {
      return next(new AppError("Invalid ticket quantity for this order", 400));
    }

    if (!order.paymentReference) {
      order.paymentReference = generatePaymentReference();
      await order.save();
    }

    const amountInKobo = Math.round(order.totalAmount * 100);
    const platformFeeInKobo = orderItems.reduce((acc, item) => {
      return acc + item.quantity * platformFeePerTicketInKobo(item.unitPrice);
    }, 0);

    if (platformFeeInKobo >= amountInKobo) {
      return next(
        new AppError(
          "Platform fee exceeds or equals the order amount; cannot initialize split payment",
          400,
        ),
      );
    }

    try {
      const response = await axios.post(
        "https://api.paystack.co/transaction/initialize",
        {
          email: order.buyerEmail,
          amount: amountInKobo,
          reference: order.paymentReference,
          callback_url: process.env.PAYSTACK_CALLBACK_URL,

          // split payment fields
          subaccount: organizer.paystackSubaccountCode,
          transaction_charge: platformFeeInKobo,
          bearer: "subaccount",

          metadata: {
            orderId: order._id.toString(),
            eventId: event._id.toString(),
            organizerId: organizer._id.toString(),
            organizerName: organizer.name,
            buyerName: order.buyerName,
            totalTickets,
            platformFeeRule: {
              thresholdNaira: PLATFORM_FEE_THRESHOLD_NAIRA,
              belowThresholdFlatNaira: PLATFORM_FEE_FLAT_NAIRA,
              aboveThresholdPercent: PLATFORM_FEE_PERCENT_ABOVE_THRESHOLD * 100,
            },
            platformFeePerTicket: PLATFORM_FEE_FLAT_NAIRA,
            platformFeeTotalKobo: platformFeeInKobo,
            platformFeeTotal: platformFeeInKobo / 100,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        },
      );

      const paymentData = response.data?.data;

      if (!paymentData) {
        return next(new AppError("Failed to initialize payment", 500));
      }

      res.status(200).json({
        status: "success",
        data: {
          order: {
            id: order._id.toString(),
            buyerName: order.buyerName,
            buyerEmail: order.buyerEmail,
            totalAmount: order.totalAmount,
            paymentStatus: order.paymentStatus,
            paymentReference: order.paymentReference,
          },
          payment: {
            provider: "paystack",
            authorizationUrl: paymentData.authorization_url,
            accessCode: paymentData.access_code,
            reference: paymentData.reference,
          },
          split: {
            organizerId: organizer._id.toString(),
            subaccount: organizer.paystackSubaccountCode,
            totalTickets,
            platformFeeRule: {
              thresholdNaira: PLATFORM_FEE_THRESHOLD_NAIRA,
              belowThresholdFlatNaira: PLATFORM_FEE_FLAT_NAIRA,
              aboveThresholdPercent: PLATFORM_FEE_PERCENT_ABOVE_THRESHOLD * 100,
            },
            platformFeePerTicket: PLATFORM_FEE_FLAT_NAIRA,
            platformFeeTotalKobo: platformFeeInKobo,
            platformFeeTotal: platformFeeInKobo / 100,
          },
        },
      });
    } catch (error: any) {
      const paystackMessage =
        error?.response?.data?.message || "Failed to initialize payment";

      return next(new AppError(paystackMessage, 500));
    }
  },
);
