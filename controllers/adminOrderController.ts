import { Request, Response, NextFunction } from "express";
import Order from "../models/order";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import { adminOrdersQuerySchema } from "../validations/adminOrder.schema";
import { orderIdParamSchema } from "../validations/payment.schema";
import { isValidId } from "../utils/id";



export const getAdminOrders = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const {
      page,
      limit,
      search,
      paymentStatus,
      settlementStatus,
      eventId,
      organizerId,
    } = adminOrdersQuerySchema.parse(req.query);

    const skip = (page - 1) * limit;

    const matchStage: Record<string, unknown> = {};

    if (paymentStatus) {
      matchStage.paymentStatus = paymentStatus;
    }

    if (settlementStatus) {
      matchStage.settlementStatus = settlementStatus;
    }

    if (eventId) {
      matchStage.eventId = eventId;
    }

    const pipeline = [
      {
        $match: matchStage,
      },
      {
        $lookup: {
          from: "events",
          localField: "eventId",
          foreignField: "_id",
          as: "event",
        },
      },
      {
        $unwind: "$event",
      },
      {
        $lookup: {
          from: "organizers",
          localField: "event.organizerId",
          foreignField: "_id",
          as: "organizer",
        },
      },
      {
        $unwind: "$organizer",
      },
    ];

    if (organizerId) {
      pipeline.push({
        $match: {
          "organizer._id": organizerId,
        },
      });
    }

    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { paymentReference: { $regex: search, $options: "i" } },
            { buyerName: { $regex: search, $options: "i" } },
            { buyerEmail: { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    const countPipeline = [
      ...pipeline,
      {
        $count: "total",
      },
    ];

    const dataPipeline = [
      ...pipeline,
      {
        $sort: {
          paidAt: -1 as const,
          createdAt: -1 as const,
        },
      },
      {
        $skip: skip,
      },
      {
        $limit: limit,
      },
      {
        $project: {
          _id: 1,
          buyerName: 1,
          buyerEmail: 1,
          buyerPhone: 1,
          totalAmount: 1,
          paymentStatus: 1,
          paymentReference: 1,
          paidAt: 1,
          platformFeeTotal: 1,
          squadGatewayFee: 1,
          squadTransferFee: 1,
          organizerPayoutAmount: 1,
          settlementStatus: 1,
          settlementBatchId: 1,
          settlementDate: 1,
          createdAt: 1,
          "event._id": 1,
          "event.title": 1,
          "event.date": 1,
          "event.location": 1,
          "organizer._id": 1,
          "organizer.name": 1,
          "organizer.slug": 1,
        },
      },
    ];

    const [countResult, orders] = await Promise.all([
      Order.aggregate(countPipeline),
      Order.aggregate(dataPipeline),
    ]);

    const total = countResult[0]?.total || 0;

    res.status(200).json({
      status: "success",
      results: orders.length,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      data: {
        orders: orders.map((order) => ({
          id: order._id,
          buyerName: order.buyerName,
          buyerEmail: order.buyerEmail,
          buyerPhone: order.buyerPhone || "",
          paymentReference: order.paymentReference || "",
          totalAmount: order.totalAmount,
          paymentStatus: order.paymentStatus,
          paidAt: order.paidAt || null,
          platformFeeTotal: order.platformFeeTotal || 0,
          squadGatewayFee: order.squadGatewayFee || 0,
          squadTransferFee: order.squadTransferFee || 0,
          organizerPayoutAmount: order.organizerPayoutAmount || 0,
          settlementStatus: order.settlementStatus || "pending",
          settlementBatchId: order.settlementBatchId || "",
          settlementDate: order.settlementDate || null,
          createdAt: order.createdAt,
          event: {
            id: order.event?._id,
            title: order.event?.title || "",
            date: order.event?.date || null,
            location: order.event?.location || "",
          },
          organizer: {
            id: order.organizer?._id,
            name: order.organizer?.name || "",
            slug: order.organizer?.slug || "",
          },
        })),
      },
    });
  },
);

export const getAdminOrderById = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { orderId } = orderIdParamSchema.parse(req.params);

    const orderResult = await Order.aggregate([
      {
        $match: {
          _id: orderId,
        },
      },
      {
        $lookup: {
          from: "events",
          localField: "eventId",
          foreignField: "_id",
          as: "event",
        },
      },
      {
        $unwind: "$event",
      },
      {
        $lookup: {
          from: "organizers",
          localField: "event.organizerId",
          foreignField: "_id",
          as: "organizer",
        },
      },
      {
        $unwind: "$organizer",
      },
      {
        $lookup: {
          from: "orderItems",
          localField: "_id",
          foreignField: "orderId",
          as: "items",
        },
      },
      {
        $project: {
          _id: 1,
          buyerName: 1,
          buyerEmail: 1,
          buyerPhone: 1,
          totalAmount: 1,
          paymentStatus: 1,
          paymentReference: 1,
          paidAt: 1,
          platformFeeTotal: 1,
          squadGatewayFee: 1,
          squadTransferFee: 1,
          organizerPayoutAmount: 1,
          settlementStatus: 1,
          settlementBatchId: 1,
          settlementDate: 1,
          createdAt: 1,
          updatedAt: 1,
          "event._id": 1,
          "event.title": 1,
          "event.date": 1,
          "event.location": 1,
          "organizer._id": 1,
          "organizer.name": 1,
          "organizer.slug": 1,
          items: 1,
        },
      },
    ]);

    const order = orderResult[0];

    if (!order) {
      return next(new AppError("Order not found", 404));
    }

    res.status(200).json({
      status: "success",
      data: {
        order: {
          id: order._id,
          buyerName: order.buyerName,
          buyerEmail: order.buyerEmail,
          buyerPhone: order.buyerPhone || "",
          paymentReference: order.paymentReference || "",
          totalAmount: order.totalAmount,
          paymentStatus: order.paymentStatus,
          paidAt: order.paidAt || null,
          platformFeeTotal: order.platformFeeTotal || 0,
          squadGatewayFee: order.squadGatewayFee || 0,
          squadTransferFee: order.squadTransferFee || 0,
          organizerPayoutAmount: order.organizerPayoutAmount || 0,
          settlementStatus: order.settlementStatus || "pending",
          settlementBatchId: order.settlementBatchId || "",
          settlementDate: order.settlementDate || null,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          event: {
            id: order.event?._id,
            title: order.event?.title || "",
            date: order.event?.date || null,
            location: order.event?.location || "",
          },
          organizer: {
            id: order.organizer?._id,
            name: order.organizer?.name || "",
            slug: order.organizer?.slug || "",
          },
          items: Array.isArray(order.items)
            ? order.items.map((item: any) => ({
                id: item._id,
                ticketTypeId: item.ticketTypeId,
                ticketTypeName: item.ticketTypeName,
                unitPrice: item.unitPrice,
                quantity: item.quantity,
                subtotal: item.subtotal,
              }))
            : [],
        },
      },
    });
  },
);
