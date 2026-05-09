import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import Order from "../models/order";
import OrderItem from "../models/orderItem";
import { TicketType } from "../models/ticketTypes";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import { createPurchaseSchema } from "../validations/purchase.schema";
import { generatePaymentReference } from "../utils/generatePaymentReference";
import { generateOrderAccessToken } from "../utils/generateOrderAccessToken";
import {
  buildReservationExpiry,
  cleanupExpiredReservationsForEvent,
  reserveTicketQuantities,
  syncReservedQuantitiesForEvent,
} from "../services/orderReservationService";
import { SquadService } from "../services/squadService";

const PLATFORM_FEE_FLAT_NAIRA = 100;
const PLATFORM_FEE_THRESHOLD_NAIRA = 3500;
const PLATFORM_FEE_PERCENT_ABOVE_THRESHOLD = 0.03;
const SQUAD_TRANSFER_FEE_NAIRA = 25;
const SQUAD_MODAL_GATEWAY_PERCENT = 0.015; // 1.5%

const calculatePlatformFee = (amount: number) => {
  if (amount < PLATFORM_FEE_THRESHOLD_NAIRA) {
    return PLATFORM_FEE_FLAT_NAIRA;
  }
  return Number((amount * PLATFORM_FEE_PERCENT_ABOVE_THRESHOLD).toFixed(2));
};

export const createPurchase = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const event = req.event;

    if (!event) {
      return next(new AppError("Event not found", 404));
    }

    const { buyerName, buyerEmail, buyerPhone, paymentGateway, items } =
      createPurchaseSchema.parse(req.body);

    const ticketTypeIds = items.map((item) => item.ticketTypeId);

    const ticketTypes = await TicketType.find({
      _id: { $in: ticketTypeIds },
      eventId: event._id,
    }).lean();

    if (ticketTypes.length !== ticketTypeIds.length) {
      return next(new AppError("One or more ticket types were not found", 404));
    }

    const ticketTypeMap = new Map(
      ticketTypes.map((ticketType) => [ticketType._id.toString(), ticketType]),
    );

    let totalAmount = 0;

    const orderItemsToCreate = items.map((item) => {
      const ticketType = ticketTypeMap.get(item.ticketTypeId);
      if (!ticketType || !ticketType.isActive) {
        throw new AppError(
          `Ticket type "${ticketType?.name}" is unavailable`,
          400,
        );
      }

      const availableQuantity =
        ticketType.quantityAvailable - ticketType.quantitySold - ticketType.quantityReserved;
      if (item.quantity > availableQuantity) {
        throw new AppError(`Not enough tickets for "${ticketType.name}"`, 400);
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

    const paymentReference = generatePaymentReference();
    const accessToken = generateOrderAccessToken();
    const reservationExpiresAt = buildReservationExpiry();

    // --- UPDATED FEE CALCULATION ---
    const platformFeeTotal =
      paymentGateway === "squad" ? calculatePlatformFee(totalAmount) : 0;
    const squadTransferFee =
      paymentGateway === "squad" ? SQUAD_TRANSFER_FEE_NAIRA : 0;

    // Calculate the 1.5% that Squad takes from the transaction
    const squadGatewayFee =
      paymentGateway === "squad"
        ? Number((totalAmount * SQUAD_MODAL_GATEWAY_PERCENT).toFixed(2))
        : 0;

    // Organizer payout = Total - (Zentra fee) - (Squad 1.5% fee) - (Transfer 25 Naira)
    const organizerPayoutAmount =
      paymentGateway === "squad"
        ? Math.max(
            totalAmount - platformFeeTotal - squadGatewayFee - squadTransferFee,
            0,
          )
        : 0;

    let checkoutUrl: string | undefined;

    // --- SQUAD MODAL INITIATION ---
    if (paymentGateway === "squad") {
      if (!process.env.SQUAD_CHECKOUT_REDIRECT_URL) {
        return next(
          new AppError("SQUAD_CHECKOUT_REDIRECT_URL is not configured", 500),
        );
      }

      const squadPayment = await SquadService.initiatePayment({
        amount: Math.round(totalAmount * 100), // Convert to Kobo
        email: buyerEmail,
        transaction_ref: paymentReference,
        customer_name: buyerName,
        callback_url: process.env.SQUAD_CHECKOUT_REDIRECT_URL,
      });

      checkoutUrl = squadPayment.checkout_url;
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      await cleanupExpiredReservationsForEvent({ eventId: event._id, session });
      await syncReservedQuantitiesForEvent({ eventId: event._id, session });

      // Re-check availability within transaction to prevent race conditions
      const finalTicketTypes = await TicketType.find({
        _id: { $in: ticketTypeIds },
        eventId: event._id,
      }).session(session);

      const finalTicketTypeMap = new Map(
        finalTicketTypes.map((ticketType) => [
          ticketType._id.toString(),
          ticketType,
        ]),
      );

      for (const item of items) {
        const ticketType = finalTicketTypeMap.get(item.ticketTypeId);
        if (!ticketType) {
          throw new AppError(`Ticket type not found`, 404);
        }
        const availableQuantity =
          ticketType.quantityAvailable -
          ticketType.quantitySold -
          ticketType.quantityReserved;
        if (item.quantity > availableQuantity) {
          throw new AppError(
            `Not enough tickets for "${ticketType.name}"`,
            409,
          );
        }
      }

      const order = new Order({
        eventId: event._id,
        buyerName,
        buyerEmail,
        buyerPhone: buyerPhone || "",
        totalAmount,
        paymentStatus: "pending",
        paymentGateway,
        paymentReference,
        accessToken,
        reservationExpiresAt,
        platformFeeTotal,
        squadTransferFee,
        squadGatewayFee,
        organizerPayoutAmount,
      });

      await order.save({ session });

      try {
        await reserveTicketQuantities({
          eventId: event._id,
          items: items.map((item) => ({
            ticketTypeId: item.ticketTypeId,
            quantity: item.quantity,
          })),
          session,
        });
      } catch (reserveError) {
        console.error("Reservation failed. Debug info:", {
          ticketTypeIds,
          items,
          finalInventory: finalTicketTypes.map((tt) => ({
            name: tt.name,
            available: tt.quantityAvailable,
            sold: tt.quantitySold,
            reserved: tt.quantityReserved,
            remaining:
              tt.quantityAvailable - tt.quantitySold - tt.quantityReserved,
          })),
        });
        throw reserveError;
      }

      await OrderItem.insertMany(
        orderItemsToCreate.map((item) => ({ ...item, orderId: order._id })),
        { session },
      );

      await session.commitTransaction();
      session.endSession();

      return res.status(201).json({
        status: "success",
        data: {
          order: {
            id: order._id,
            totalAmount: order.totalAmount,
            paymentReference: order.paymentReference,
            accessToken: order.accessToken,
            checkoutUrl, // Frontend uses this to open the payment page
            organizerPayoutAmount: order.organizerPayoutAmount,
          },
          items: orderItemsToCreate,
        },
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  },
);
