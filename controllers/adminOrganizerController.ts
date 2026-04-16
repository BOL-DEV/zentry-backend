import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import Organizer from "../models/organizer";
import Event from "../models/event";
import Order from "../models/order";
import Ticket from "../models/ticket";
import Gallery from "../models/gallery";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import { generateSlug } from "../utils/slugify";
import { organizerIdParamSchema } from "../validations/organizer.schema";
import {
  galleryItemIdParamSchema,
  updateGalleryItemSchema,
} from "../validations/gallery.schema";
import {
  adminCreateOrganizerSchema,
  adminUpdateOrganizerSchema,
} from "../validations/adminOrganizer.schema";

const parseBooleanQuery = (value: unknown): boolean | undefined => {
  if (typeof value !== "string") return undefined;

  if (value === "true") return true;
  if (value === "false") return false;

  return undefined;
};

export const getAdminOrganizers = catchAsync(
  async (req: Request, res: Response) => {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.max(Number(req.query.limit) || 10, 1);
    const skip = (page - 1) * limit;

    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";

    const isActive = parseBooleanQuery(req.query.isActive);

    const filter: Record<string, unknown> = {};

    if (typeof isActive === "boolean") {
      filter.isActive = isActive;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { slug: { $regex: search, $options: "i" } },
        { contactEmail: { $regex: search, $options: "i" } },
      ];
    }

    const [organizers, total] = await Promise.all([
      Organizer.find(filter)
        .select(
          "name slug logoUrl contactEmail contactPhone isActive createdAt",
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Organizer.countDocuments(filter),
    ]);

    const organizerIds = organizers.map((organizer) => organizer._id);

    let statsMap = new Map<
      string,
      {
        totalEvents: number;
        totalPaidOrders: number;
        totalTicketsSold: number;
        grossRevenue: number;
      }
    >();

    if (organizerIds.length) {
      const eventStats = await Event.aggregate([
        {
          $match: {
            organizerId: { $in: organizerIds },
          },
        },
        {
          $group: {
            _id: "$organizerId",
            totalEvents: { $sum: 1 },
          },
        },
      ]);

      const orderStats = await Order.aggregate([
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
          $match: {
            "event.organizerId": { $in: organizerIds },
            paymentStatus: "paid",
          },
        },
        {
          $group: {
            _id: "$event.organizerId",
            totalPaidOrders: { $sum: 1 },
            grossRevenue: { $sum: "$totalAmount" },
          },
        },
      ]);

      const ticketStats = await Ticket.aggregate([
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
          $match: {
            "event.organizerId": { $in: organizerIds },
          },
        },
        {
          $group: {
            _id: "$event.organizerId",
            totalTicketsSold: { $sum: 1 },
          },
        },
      ]);

      statsMap = new Map(
        organizerIds.map((id) => [
          id.toString(),
          {
            totalEvents: 0,
            totalPaidOrders: 0,
            totalTicketsSold: 0,
            grossRevenue: 0,
          },
        ]),
      );

      for (const stat of eventStats) {
        const key = stat._id.toString();
        const current = statsMap.get(key);
        if (current) current.totalEvents = stat.totalEvents;
      }

      for (const stat of orderStats) {
        const key = stat._id.toString();
        const current = statsMap.get(key);
        if (current) {
          current.totalPaidOrders = stat.totalPaidOrders;
          current.grossRevenue = stat.grossRevenue;
        }
      }

      for (const stat of ticketStats) {
        const key = stat._id.toString();
        const current = statsMap.get(key);
        if (current) current.totalTicketsSold = stat.totalTicketsSold;
      }
    }

    const formattedOrganizers = organizers.map((organizer) => {
      const stats = statsMap.get(organizer._id.toString()) || {
        totalEvents: 0,
        totalPaidOrders: 0,
        totalTicketsSold: 0,
        grossRevenue: 0,
      };

      return {
        id: organizer._id,
        name: organizer.name,
        slug: organizer.slug,
        logoUrl: organizer.logoUrl || "",
        contactEmail: organizer.contactEmail || "",
        contactPhone: organizer.contactPhone || "",
        isActive: organizer.isActive,
        createdAt: organizer.createdAt,
        stats,
      };
    });

    res.status(200).json({
      status: "success",
      results: formattedOrganizers.length,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      data: {
        organizers: formattedOrganizers,
      },
    });
  },
);

export const getAdminOrganizerById = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { organizerId } = organizerIdParamSchema.parse(req.params);

    if (!mongoose.Types.ObjectId.isValid(organizerId)) {
      return next(new AppError("Invalid organizer ID", 400));
    }

    const organizer = await Organizer.findById(organizerId)
      .select(
        "name slug logoUrl bannerUrl heroTitle heroSubtitle about contactEmail contactPhone location bankDetails isActive createdAt updatedAt",
      )
      .lean();

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }

    const [eventStats, orderStats, ticketStats, recentEvents] =
      await Promise.all([
        Event.countDocuments({ organizerId: organizer._id }),
        Order.aggregate([
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
            $match: {
              "event.organizerId": organizer._id,
              paymentStatus: "paid",
            },
          },
          {
            $group: {
              _id: null,
              totalPaidOrders: { $sum: 1 },
              grossRevenue: { $sum: "$totalAmount" },
              platformFees: { $sum: "$platformFeeTotal" },
            },
          },
        ]),
        Ticket.aggregate([
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
            $match: {
              "event.organizerId": organizer._id,
            },
          },
          {
            $group: {
              _id: null,
              totalTicketsSold: { $sum: 1 },
              totalCheckedInTickets: {
                $sum: {
                  $cond: [{ $eq: ["$status", "checked-in"] }, 1, 0],
                },
              },
            },
          },
        ]),
        Event.find({ organizerId: organizer._id })
          .select("_id title date location createdAt")
          .sort({ date: -1 })
          .limit(10)
          .lean(),
      ]);

    const orderSummary = orderStats[0] || {
      totalPaidOrders: 0,
      grossRevenue: 0,
      platformFees: 0,
    };

    const ticketSummary = ticketStats[0] || {
      totalTicketsSold: 0,
      totalCheckedInTickets: 0,
    };

    const bank = (organizer as any).bankDetails ?? {};

    const bankDetails = {
      bankName: typeof bank.bankName === "string" ? bank.bankName : "",
      bankCode: typeof bank.bankCode === "string" ? bank.bankCode : "",
      accountNumber:
        typeof bank.accountNumber === "string" ? bank.accountNumber : "",
      accountName: typeof bank.accountName === "string" ? bank.accountName : "",
    };

    res.status(200).json({
      status: "success",
      data: {
        organizer: {
          id: organizer._id,
          name: organizer.name,
          slug: organizer.slug,
          logoUrl: organizer.logoUrl || "",
          bannerUrl: (organizer as any).bannerUrl || "",
          heroTitle: organizer.heroTitle || "",
          heroSubtitle: organizer.heroSubtitle || "",
          about: organizer.about || "",
          contactEmail: organizer.contactEmail || "",
          contactPhone: organizer.contactPhone || "",
          location: (organizer as any).location || "",
          bankDetails,
          isActive: organizer.isActive,
          createdAt: organizer.createdAt,
          updatedAt: organizer.updatedAt,
        },
        stats: {
          totalEvents: eventStats,
          totalPaidOrders: orderSummary.totalPaidOrders,
          grossRevenue: orderSummary.grossRevenue,
          platformFees: orderSummary.platformFees,
          totalTicketsSold: ticketSummary.totalTicketsSold,
          totalCheckedInTickets: ticketSummary.totalCheckedInTickets,
        },
        recentEvents: recentEvents.map((event) => ({
          id: event._id,
          title: event.title,
          date: event.date,
          location: event.location,
          createdAt: event.createdAt,
        })),
      },
    });
  },
);

export const createAdminOrganizer = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const data = adminCreateOrganizerSchema.parse(req.body);

    const slug = generateSlug(data.name);

    const existingOrganizer = await Organizer.findOne({ slug });

    if (existingOrganizer) {
      return next(new AppError("Organizer with this name already exists", 400));
    }

    const bankDetailsProvided =
      data.bankDetails && Object.keys(data.bankDetails).length > 0;

    const organizer = await Organizer.create({
      name: data.name,
      slug,
      logoUrl: data.logoUrl,
      bannerUrl: data.bannerUrl,
      heroTitle: data.heroTitle,
      heroSubtitle: data.heroSubtitle,
      about: data.about,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
      location: data.location,
      ...(bankDetailsProvided
        ? {
            bankDetails: {
              bankName: data.bankDetails?.bankName ?? null,
              bankCode: data.bankDetails?.bankCode ?? null,
              accountNumber: data.bankDetails?.accountNumber ?? null,
              accountName: data.bankDetails?.accountName ?? null,
            },
          }
        : {}),
    });

    res.status(201).json({
      status: "success",
      data: {
        organizer,
      },
    });
  },
);

export const updateAdminOrganizer = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { organizerId } = organizerIdParamSchema.parse(req.params);
    const data = adminUpdateOrganizerSchema.parse(req.body);

    if (!Object.keys(data).length) {
      return next(new AppError("No updates provided", 400));
    }

    const organizer = await Organizer.findById(organizerId);

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }

    if (typeof data.name === "string") organizer.name = data.name;
    if (typeof data.logoUrl === "string") organizer.logoUrl = data.logoUrl;
    if (typeof data.bannerUrl === "string")
      organizer.bannerUrl = data.bannerUrl;
    if (typeof data.heroTitle === "string")
      organizer.heroTitle = data.heroTitle;
    if (typeof data.heroSubtitle === "string")
      organizer.heroSubtitle = data.heroSubtitle;
    if (typeof data.about === "string") organizer.about = data.about;
    if (typeof data.contactEmail === "string")
      organizer.contactEmail = data.contactEmail;
    if (typeof data.contactPhone === "string")
      organizer.contactPhone = data.contactPhone;
    if (typeof data.location === "string") organizer.location = data.location;

    if (data.bankDetails) {
      const incoming = data.bankDetails;
      const keys = Object.keys(incoming);

      const payoutFieldsProvided =
        typeof incoming.bankCode === "string" ||
        typeof incoming.accountNumber === "string" ||
        typeof incoming.accountName === "string";

      if (keys.length === 0) {
        organizer.bankDetails = {
          bankName: null,
          bankCode: null,
          accountNumber: null,
          accountName: null,
        };
      } else if (payoutFieldsProvided) {
        organizer.bankDetails = {
          bankName: incoming.bankName ?? null,
          bankCode: incoming.bankCode ?? null,
          accountNumber: incoming.accountNumber ?? null,
          accountName: incoming.accountName ?? null,
        };
      } else {
        const current = (organizer as any).bankDetails || {};

        organizer.bankDetails = {
          bankName: incoming.bankName ?? null,
          bankCode: current.bankCode ?? null,
          accountNumber: current.accountNumber ?? null,
          accountName: current.accountName ?? null,
        };
      }
    }

    await organizer.save();

    res.status(200).json({
      status: "success",
      data: {
        organizer,
      },
    });
  },
);

export const toggleAdminOrganizerActiveState = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { organizerId } = organizerIdParamSchema.parse(req.params);

    if (!mongoose.Types.ObjectId.isValid(organizerId)) {
      return next(new AppError("Invalid organizer ID", 400));
    }

    const organizer = await Organizer.findById(organizerId);

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }

    organizer.isActive = !organizer.isActive;
    await organizer.save();

    res.status(200).json({
      status: "success",
      message: `Organizer has been ${
        organizer.isActive ? "reactivated" : "suspended"
      } successfully`,
      data: {
        organizer: {
          id: organizer._id,
          name: organizer.name,
          slug: organizer.slug,
          isActive: organizer.isActive,
        },
      },
    });
  },
);

export const updateAdminGalleryItem = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { organizerId } = organizerIdParamSchema.parse(req.params);
    const { galleryItemId } = galleryItemIdParamSchema.parse(req.params);
    const data = updateGalleryItemSchema.parse(req.body);

    if (!Object.keys(data).length) {
      return next(new AppError("No updates provided", 400));
    }

    const galleryItem = await Gallery.findOne({
      _id: galleryItemId,
      organizerId,
    });

    if (!galleryItem) {
      return next(new AppError("Gallery item not found", 404));
    }

    if (typeof data.imageUrl === "string") {
      const existing = await Gallery.findOne({
        _id: { $ne: galleryItem._id },
        organizerId,
        imageUrl: data.imageUrl,
      }).lean();

      if (existing) {
        return next(
          new AppError(
            "This gallery image already exists for this organizer",
            400,
          ),
        );
      }

      galleryItem.imageUrl = data.imageUrl;
    }

    if (typeof data.caption === "string") galleryItem.caption = data.caption;
    if (typeof data.altText === "string") galleryItem.altText = data.altText;
    if (typeof data.displayOrder === "number")
      galleryItem.displayOrder = data.displayOrder;

    await galleryItem.save();

    res.status(200).json({
      status: "success",
      data: {
        galleryItem,
      },
    });
  },
);
