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
} from "../services/orderReservationService";
import { SquadService } from "../services/squadService";
import { generateRandomDOB } from "../utils/dob";

const PLATFORM_FEE_FLAT_NAIRA = 100;
const PLATFORM_FEE_THRESHOLD_NAIRA = 3500;
const PLATFORM_FEE_PERCENT_ABOVE_THRESHOLD = 0.03;
const SQUAD_TRANSFER_FEE_NAIRA = 25;

const calculatePlatformFee = (amount: number) => {
  if (amount < PLATFORM_FEE_THRESHOLD_NAIRA) {
    return PLATFORM_FEE_FLAT_NAIRA;
  }

  return Number((amount * PLATFORM_FEE_PERCENT_ABOVE_THRESHOLD).toFixed(2));
};

const splitBuyerName = (buyerName: string) => {
  const normalized = buyerName.trim().replace(/\s+/g, " ");
  const [firstName, ...rest] = normalized.split(" ");

  return {
    firstName: firstName || normalized,
    lastName: rest.join(" ") || "Customer",
  };
};

export const createPurchase = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const event = req.event;

    if (!event) {
      return next(new AppError("Event not found", 404));
    }

    const {
      buyerName,
      buyerEmail,
      buyerPhone,
      buyerDob,
      paymentGateway,
      items,
    } = createPurchaseSchema.parse(req.body);

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

    const paymentReference = generatePaymentReference();
    const accessToken = generateOrderAccessToken();
    const reservationExpiresAt = buildReservationExpiry();

    const platformFeeTotal =
      paymentGateway === "squad" ? calculatePlatformFee(totalAmount) : 0;
    const squadTransferFee =
      paymentGateway === "squad" ? SQUAD_TRANSFER_FEE_NAIRA : 0;
    const organizerPayoutAmount =
      paymentGateway === "squad"
        ? Math.max(totalAmount - platformFeeTotal - squadTransferFee, 0)
        : 0;

    let virtualAccountDetails:
      | {
          accountNumber: string;
          bankName: string;
          accountName: string;
          expiresAt: Date;
        }
      | undefined;

    if (paymentGateway === "squad") {
      if (!buyerPhone) {
        return next(
          new AppError(
            "Buyer phone number is required for Squad payments",
            400,
          ),
        );
      }

      const { firstName, lastName } = splitBuyerName(buyerName);
      const dobValue = buyerDob || generateRandomDOB();
      const squadAccount = await SquadService.createVirtualAccount({
        first_name: firstName,
        last_name: lastName,
        email: buyerEmail,
        mobile_num: buyerPhone,
        amount: Math.round(totalAmount * 100),
        transaction_ref: paymentReference,
        dob: dobValue,
      });

      virtualAccountDetails = {
        accountNumber: String(squadAccount.virtual_account_number ?? ""),
        bankName:
          String(
            squadAccount.bank_name ??
              squadAccount.bank ??
              squadAccount.bankName ??
              "",
          ) || "GTBank (Squad)",
        accountName: String(
          squadAccount.account_name ?? squadAccount.customer_name ?? buyerName,
        ),
        expiresAt: reservationExpiresAt,
      };
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      await cleanupExpiredReservationsForEvent({
        eventId: event._id,
        session,
      });

      const order = new Order({
        eventId: event._id,
        buyerName,
        buyerEmail,
        ...(buyerPhone ? { buyerPhone } : {}),
        totalAmount,
        paymentStatus: "pending",
        paymentGateway,
        paymentReference,
        accessToken,
        reservationExpiresAt,
        platformFeeTotal,
        squadTransferFee,
        organizerPayoutAmount,
        ...(virtualAccountDetails ? { virtualAccountDetails } : {}),
      });

      await order.save({ session });

      await reserveTicketQuantities({
        eventId: event._id,
        items: items.map((item) => ({
          ticketTypeId: item.ticketTypeId,
          quantity: item.quantity,
        })),
        session,
      });

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
            paymentGateway: order.paymentGateway,
            paymentReference: order.paymentReference,
            accessToken: order.accessToken,
            reservationExpiresAt: order.reservationExpiresAt,
            platformFeeTotal: order.platformFeeTotal,
            squadTransferFee: order.squadTransferFee,
            organizerPayoutAmount: order.organizerPayoutAmount,
            virtualAccountDetails: order.virtualAccountDetails,
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
