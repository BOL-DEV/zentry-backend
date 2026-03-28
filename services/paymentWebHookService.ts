import crypto from "crypto";
import axios from "axios";
import mongoose from "mongoose";
import { Request, Response, NextFunction } from "express";
import Order from "../models/order";
import OrderItem from "../models/orderItem";
import Event from "../models/event";
import { TicketType } from "../models/ticketTypes";
import Ticket from "../models/ticket";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import { generateTicketCode } from "../utils/generateTicketCode";

export const handlePaystackWebhook = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const secret = process.env.PAYSTACK_SECRET_KEY;

    if (!secret) {
      return next(new AppError("Paystack secret key is not configured", 500));
    }

    const signature = req.headers["x-paystack-signature"] as string | undefined;

    if (!signature) {
      return next(new AppError("Missing Paystack signature", 400));
    }

    const rawBody = req.rawBody;

    if (!rawBody) {
      return next(
        new AppError(
          "Missing raw request body for webhook verification",
          400,
        ),
      );
    }

    const computedSignature = crypto
      .createHmac("sha512", secret)
      .update(rawBody)
      .digest("hex");

    if (computedSignature !== signature) {
      return next(new AppError("Invalid Paystack signature", 401));
    }

    const payload = JSON.parse(rawBody.toString("utf8"));
    const eventType = payload.event;

    if (eventType !== "charge.success") {
      return res.status(200).json({
        status: "success",
        message: "Webhook received and ignored",
      });
    }

    const paymentData = payload.data;
    const reference = paymentData?.reference;

    if (!reference) {
      return next(new AppError("Payment reference is missing", 400));
    }

    // Server-side verify with Paystack before fulfilling
    const verifyResponse = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${secret}`,
        },
        timeout: 15000,
      },
    );

    const verified = verifyResponse.data?.data;

    if (!verified || verified.status !== "success") {
      return next(new AppError("Payment verification failed", 400));
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const order = await Order.findOne({
        paymentReference: reference,
      }).session(session);

      if (!order) {
        throw new AppError("Order not found for this payment reference", 404);
      }

      // Idempotency guard
      if (order.paymentStatus === "paid") {
        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
          status: "success",
          message: "Order already processed",
        });
      }

      if (order.paymentStatus !== "pending") {
        throw new AppError(
          "Order is not in a valid state for payment confirmation",
          400,
        );
      }

      const paidAmount = Number(verified.amount) / 100;

      if (paidAmount !== order.totalAmount) {
        throw new AppError("Paid amount does not match order amount", 400);
      }

      const event = await Event.findById(order.eventId)
        .select("_id title")
        .session(session)
        .lean();

      if (!event) {
        throw new AppError("Event not found for this order", 404);
      }

      const orderItems = await OrderItem.find({ orderId: order._id })
        .session(session)
        .lean();

      if (!orderItems.length) {
        throw new AppError("No order items found for this order", 400);
      }

      const ticketTypeIds = orderItems.map((item) => item.ticketTypeId);

      const ticketTypes = await TicketType.find({
        _id: { $in: ticketTypeIds },
        eventId: order.eventId,
      }).session(session);

      if (ticketTypes.length !== orderItems.length) {
        throw new AppError(
          "Some ticket types linked to this order are missing",
          400,
        );
      }

      const ticketTypeMap = new Map(
        ticketTypes.map((ticketType) => [
          ticketType._id.toString(),
          ticketType,
        ]),
      );

      // Final availability check before fulfillment
      for (const item of orderItems) {
        const ticketType = ticketTypeMap.get(item.ticketTypeId.toString());

        if (!ticketType) {
          throw new AppError("Ticket type not found during fulfillment", 400);
        }

        if (!ticketType.isActive) {
          throw new AppError(
            `Ticket type "${ticketType.name}" is no longer active`,
            400,
          );
        }

        const availableQuantity =
          ticketType.quantityAvailable - ticketType.quantitySold;

        if (item.quantity > availableQuantity) {
          throw new AppError(
            `Not enough tickets available for "${ticketType.name}" during payment confirmation`,
            400,
          );
        }
      }

      const ticketsToCreate = [];

      for (const item of orderItems) {
        for (let i = 0; i < item.quantity; i++) {
          ticketsToCreate.push({
            orderId: order._id,
            eventId: order.eventId,
            ticketTypeId: item.ticketTypeId,
            buyerName: order.buyerName,
            buyerEmail: order.buyerEmail,
            ticketCode: generateTicketCode(event.title),
            status: "valid",
          });
        }
      }

      await Ticket.insertMany(ticketsToCreate, { session });

      for (const item of orderItems) {
        await TicketType.updateOne(
          { _id: item.ticketTypeId },
          { $inc: { quantitySold: item.quantity } },
          { session },
        );
      }

      order.paymentStatus = "paid";
      await order.save({ session });

      await session.commitTransaction();
      session.endSession();

      return res.status(200).json({
        status: "success",
        message: "Payment confirmed and tickets generated successfully",
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  },
);
