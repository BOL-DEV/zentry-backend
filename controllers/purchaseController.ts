import { Request, Response, NextFunction } from "express";
import { createPurchaseSchema } from "../validations/purchase.schema";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/appError";
import { TicketType } from "../models/ticketTypes";
import Order from "../models/order";
import OrderItem from "../models/orderItem";

export const createPurchase = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const organizer = req.organizer;
    const event = req.event;

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }

    if (!event) {
      return next(new AppError("Event not found", 404));
    }

    const data = createPurchaseSchema.parse(req.body);

    const ticketTypeIds = data.items.map((item) => item.ticketTypeId);

    const ticketTypes = await TicketType.find({
      _id: { $in: ticketTypeIds },
      eventId: event._id,
    }).lean();

    if (ticketTypes.length !== ticketTypeIds.length) {
      return next(
        new AppError(
          "One or more ticket types are invalid for this event",
          400,
        ),
      );
    }

    const ticketTypeMap = new Map(
      ticketTypes.map((ticketType) => [ticketType._id.toString(), ticketType]),
    );

    let totalAmount = 0;

    const orderItemsData = data.items.map((item) => {
      const ticketType = ticketTypeMap.get(item.ticketTypeId);

      if (!ticketType) {
        throw new AppError("Ticket type not found", 400);
      }

      if (!ticketType.isActive) {
        throw new AppError(
          `Ticket type "${ticketType.name}" is not currently available`,
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

      const subtotal = ticketType.price * item.quantity;
      totalAmount += subtotal;

      return {
        ticketTypeId: ticketType._id,
        ticketTypeName: ticketType.name,
        unitPrice: ticketType.price,
        quantity: item.quantity,
        subtotal,
      };
    });

    const order = await Order.create({
      eventId: event._id,
      buyerName: data.buyerName,
      buyerEmail: data.buyerEmail,
      buyerPhone: data.buyerPhone ?? "",
      totalAmount,
      paymentStatus: "pending",
    });

    const orderItems = await OrderItem.insertMany(
      orderItemsData.map((item) => ({
        orderId: order._id,
        ...item,
      })),
    );

    res.status(201).json({
      status: "success",
      data: {
        organizer: {
          slug: organizer.slug,
          name: organizer.name,
        },
        event: {
          id: event._id,
          title: event.title,
        },
        order,
        orderItems,
      },
    });
  },
);
