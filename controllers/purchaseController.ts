import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import Order from "../models/order";
import OrderItem from "../models/orderItem";
import { TicketType } from "../models/ticketTypes";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import { createPurchaseSchema } from "../validations/purchase.schema";

export const createPurchase = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const event = req.event;

    if (!event) {
      return next(new AppError("Event not found", 404));
    }

    const { buyerName, buyerEmail, buyerPhone, items } =
      createPurchaseSchema.parse(req.body);

    const ticketTypeIds = items.map((item) => item.ticketTypeId);

    const ticketTypes = await TicketType.find({
      _id: { $in: ticketTypeIds },
      eventId: event._id,
    }).lean();

    if (ticketTypes.length !== ticketTypeIds.length) {
      return next(
        new AppError(
          "One or more ticket types were not found for this event",
          404,
        ),
      );
    }

    const ticketTypeMap = new Map(
      ticketTypes.map((ticketType) => [ticketType._id.toString(), ticketType]),
    );

    let totalAmount = 0;

    const orderItemsToCreate = items.map((item) => {
      const ticketType = ticketTypeMap.get(item.ticketTypeId);

      if (!ticketType) {
        throw new AppError("Ticket type not found", 404);
      }

      if (!ticketType.isActive) {
        throw new AppError(
          `Ticket type "${ticketType.name}" is not active`,
          400,
        );
      }

      const availableQuantity =
        ticketType.quantityAvailable - ticketType.quantitySold;

      if (item.quantity > availableQuantity) {
        throw new AppError(
          `Not enough tickets available for "${ticketType.name}"`,
          400,
        );
      }

      const unitPrice = ticketType.price;
      const subtotal = unitPrice * item.quantity;

      totalAmount += subtotal;

      return {
        ticketTypeId: ticketType._id,
        ticketTypeName: ticketType.name,
        quantity: item.quantity,
        unitPrice,
        subtotal,
      };
    });

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const order = new Order({
        eventId: event._id,
        buyerName,
        buyerEmail,
        ...(buyerPhone ? { buyerPhone } : {}),
        totalAmount,
        paymentStatus: "pending",
      });

      await order.save({ session });

      await OrderItem.insertMany(
        orderItemsToCreate.map((item) => ({
          ...item,
          orderId: order._id,
        })),
        { session },
      );

      await session.commitTransaction();
      session.endSession();

      return res.status(201).json({
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
          },
          items: orderItemsToCreate.map((item) => ({
            ticketTypeId: item.ticketTypeId,
            ticketTypeName: item.ticketTypeName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
          })),
        },
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  },
);
