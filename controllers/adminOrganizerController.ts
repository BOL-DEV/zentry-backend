import { Request, Response, NextFunction } from "express";
import Organizer from "../models/organizer";
import Event from "../models/event";
import Order from "../models/order";
import Ticket from "../models/ticket";
import Gallery from "../models/gallery";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import { generateSlug } from "../utils/slugify";
import {
  organizerIdParamSchema,
  updateOrganizerOrganizerSessionLimitSchema,
  updateOrganizerStaffSessionLimitSchema,
} from "../validations/organizer.schema";
import {
  bulkUpdateGalleryItemsSchema,
  createGalleryItemSchema,
  galleryItemIdParamSchema,
  updateGalleryItemSchema,
} from "../validations/gallery.schema";
import {
  adminCreateOrganizerSchema,
  adminUpdateOrganizerSchema,
} from "../validations/adminOrganizer.schema";
import {
  deleteCloudinaryAsset,
  MEDIA_FOLDERS,
  uploadImageBuffer,
} from "../services/cloudinaryService";
import { getUploadedFile, normalizeBankDetailsBody } from "../utils/mediaHelpers";
import { bulkUpdateGalleryItemsForOrganizer } from "../services/galleryBulkService";
import {
  getDefaultPlatformFeeSettings,
  getEffectivePlatformFeeSettings,
} from "../services/platformFeeService";
import { isValidId } from "../utils/id";

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

    if (!isValidId(organizerId)) {
      return next(new AppError("Invalid organizer ID", 400));
    }

    const organizer = await Organizer.findById(organizerId)
      .select(
        "name slug logoUrl bannerUrl heroTitle heroSubtitle about contactEmail contactPhone location bankDetails staffSessionLimit organizerSessionLimit platformFeeOverride isActive createdAt updatedAt",
      )
      .lean();

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }

    const [eventStats, orderStats, ticketStats, recentEvents, effectivePlatformFee] =
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
        getEffectivePlatformFeeSettings(organizer._id),
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

    const organizerPlatformFeeOverride = (organizer as any).platformFeeOverride;

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
          staffSessionLimit:
            typeof (organizer as any).staffSessionLimit === "number"
              ? (organizer as any).staffSessionLimit
              : 3,
          organizerSessionLimit:
            typeof (organizer as any).organizerSessionLimit === "number"
              ? (organizer as any).organizerSessionLimit
              : 1,
          platformFee: {
            override: organizerPlatformFeeOverride
              ? {
                  flatFeeBelowThreshold:
                    organizerPlatformFeeOverride.flatFeeBelowThreshold,
                  thresholdAmount: organizerPlatformFeeOverride.thresholdAmount,
                  percentAboveThreshold:
                    organizerPlatformFeeOverride.percentAboveThreshold,
                }
              : null,
            effective: {
              flatFeeBelowThreshold:
                effectivePlatformFee.flatFeeBelowThreshold,
              thresholdAmount: effectivePlatformFee.thresholdAmount,
              percentAboveThreshold:
                effectivePlatformFee.percentAboveThreshold,
            },
            defaults: getDefaultPlatformFeeSettings(),
            isUsingDefault:
              !effectivePlatformFee.isUsingOrganizerOverride,
          },
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
    const body = normalizeBankDetailsBody(req.body as Record<string, unknown>);
    const slug = generateSlug(String(body.name || ""));

    const existingOrganizer = await Organizer.findOne({ slug });

    if (existingOrganizer) {
      return next(new AppError("Organizer with this name already exists", 400));
    }

    let uploadedLogo:
      | {
          url: string;
          publicId: string;
        }
      | undefined;
    let uploadedBanner:
      | {
          url: string;
          publicId: string;
        }
      | undefined;

    try {
      const logoFile = getUploadedFile(req, "logo");
      const bannerFile = getUploadedFile(req, "banner");

      if (logoFile) {
        uploadedLogo = await uploadImageBuffer({
          buffer: logoFile.buffer,
          folder: MEDIA_FOLDERS.organizerLogo,
          filename: slug,
        });
      }

      if (bannerFile) {
        uploadedBanner = await uploadImageBuffer({
          buffer: bannerFile.buffer,
          folder: MEDIA_FOLDERS.organizerBanner,
          filename: `${slug}-banner`,
        });
      }

      const data = adminCreateOrganizerSchema.parse({
        ...body,
        ...(uploadedLogo ? { logoUrl: uploadedLogo.url } : {}),
        ...(uploadedBanner ? { bannerUrl: uploadedBanner.url } : {}),
      });

      const bankDetailsProvided =
        data.bankDetails && Object.keys(data.bankDetails).length > 0;
      const platformFeeOverrideProvided =
        data.platformFeeOverride && typeof data.platformFeeOverride === "object";
      const defaultPlatformFeeSettings = getDefaultPlatformFeeSettings();

      const organizer = await Organizer.create({
        name: data.name,
        slug,
        logoUrl: data.logoUrl,
        logoPublicId: uploadedLogo?.publicId ?? null,
        bannerUrl: data.bannerUrl,
        bannerPublicId: uploadedBanner?.publicId ?? null,
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
        ...(platformFeeOverrideProvided
          ? {
              platformFeeOverride: {
                flatFeeBelowThreshold:
                  data.platformFeeOverride?.flatFeeBelowThreshold ??
                  defaultPlatformFeeSettings.flatFeeBelowThreshold,
                thresholdAmount:
                  data.platformFeeOverride?.thresholdAmount ??
                  defaultPlatformFeeSettings.thresholdAmount,
                percentAboveThreshold:
                  data.platformFeeOverride?.percentAboveThreshold ??
                  defaultPlatformFeeSettings.percentAboveThreshold,
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
    } catch (error) {
      await Promise.all([
        deleteCloudinaryAsset(uploadedLogo?.publicId),
        deleteCloudinaryAsset(uploadedBanner?.publicId),
      ]);
      throw error;
    }
  },
);

export const updateAdminOrganizer = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { organizerId } = organizerIdParamSchema.parse(req.params);

    const organizer = await Organizer.findById(organizerId);

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }

    let uploadedLogo:
      | {
          url: string;
          publicId: string;
        }
      | undefined;
    let uploadedBanner:
      | {
          url: string;
          publicId: string;
        }
      | undefined;

    try {
      const logoFile = getUploadedFile(req, "logo");
      const bannerFile = getUploadedFile(req, "banner");

      if (logoFile) {
        uploadedLogo = await uploadImageBuffer({
          buffer: logoFile.buffer,
          folder: MEDIA_FOLDERS.organizerLogo,
          filename: organizer.slug,
        });
      }

      if (bannerFile) {
        uploadedBanner = await uploadImageBuffer({
          buffer: bannerFile.buffer,
          folder: MEDIA_FOLDERS.organizerBanner,
          filename: `${organizer.slug}-banner`,
        });
      }

      const data = adminUpdateOrganizerSchema.parse({
        ...normalizeBankDetailsBody(req.body as Record<string, unknown>),
        ...(uploadedLogo ? { logoUrl: uploadedLogo.url } : {}),
        ...(uploadedBanner ? { bannerUrl: uploadedBanner.url } : {}),
      });

      if (!Object.keys(data).length) {
        return next(new AppError("No updates provided", 400));
      }

      const previousLogoPublicId = organizer.logoPublicId;
      const previousBannerPublicId = organizer.bannerPublicId;

      if (typeof data.name === "string") organizer.name = data.name;
      if (typeof data.logoUrl === "string") {
        organizer.logoUrl = data.logoUrl;
        if (uploadedLogo) {
          organizer.logoPublicId = uploadedLogo.publicId;
        }
      }
      if (typeof data.bannerUrl === "string") {
        organizer.bannerUrl = data.bannerUrl;
        if (uploadedBanner) {
          organizer.bannerPublicId = uploadedBanner.publicId;
        }
      }
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

      if (data.platformFeeOverride === null) {
        organizer.set("platformFeeOverride", undefined);
      } else if (data.platformFeeOverride) {
        const currentOverride = (organizer as any).platformFeeOverride;
        const basePlatformFee =
          currentOverride && typeof currentOverride === "object"
            ? {
                flatFeeBelowThreshold: currentOverride.flatFeeBelowThreshold,
                thresholdAmount: currentOverride.thresholdAmount,
                percentAboveThreshold: currentOverride.percentAboveThreshold,
              }
            : await getEffectivePlatformFeeSettings(organizer._id);

        organizer.set("platformFeeOverride", {
          flatFeeBelowThreshold:
            data.platformFeeOverride.flatFeeBelowThreshold ??
            basePlatformFee.flatFeeBelowThreshold,
          thresholdAmount:
            data.platformFeeOverride.thresholdAmount ??
            basePlatformFee.thresholdAmount,
          percentAboveThreshold:
            data.platformFeeOverride.percentAboveThreshold ??
            basePlatformFee.percentAboveThreshold,
        });
      }

      await organizer.save();

      if (uploadedLogo) {
        await deleteCloudinaryAsset(previousLogoPublicId);
      }

      if (uploadedBanner) {
        await deleteCloudinaryAsset(previousBannerPublicId);
      }

      res.status(200).json({
        status: "success",
        data: {
          organizer,
        },
      });
    } catch (error) {
      await Promise.all([
        deleteCloudinaryAsset(uploadedLogo?.publicId),
        deleteCloudinaryAsset(uploadedBanner?.publicId),
      ]);
      throw error;
    }
  },
);

export const updateAdminOrganizerStaffSessionLimit = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { organizerId } = organizerIdParamSchema.parse(req.params);
    const { staffSessionLimit } = updateOrganizerStaffSessionLimitSchema.parse(
      req.body,
    );

    const organizer = await Organizer.findById(organizerId).select(
      "_id name slug staffSessionLimit",
    );

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }

    (organizer as any).staffSessionLimit = staffSessionLimit;
    await organizer.save();

    res.status(200).json({
      status: "success",
      message: "Staff session limit updated successfully",
      data: {
        organizer: {
          id: organizer._id,
          name: organizer.name,
          slug: organizer.slug,
          staffSessionLimit: (organizer as any).staffSessionLimit,
        },
      },
    });
  },
);

export const updateAdminOrganizerOrganizerSessionLimit = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { organizerId } = organizerIdParamSchema.parse(req.params);
    const { organizerSessionLimit } =
      updateOrganizerOrganizerSessionLimitSchema.parse(req.body);

    const organizer = await Organizer.findById(organizerId).select(
      "_id name slug organizerSessionLimit",
    );

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }

    (organizer as any).organizerSessionLimit = organizerSessionLimit;
    await organizer.save();

    res.status(200).json({
      status: "success",
      message: "Organizer session limit updated successfully",
      data: {
        organizer: {
          id: organizer._id,
          name: organizer.name,
          slug: organizer.slug,
          organizerSessionLimit: (organizer as any).organizerSessionLimit,
        },
      },
    });
  },
);

export const toggleAdminOrganizerActiveState = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { organizerId } = organizerIdParamSchema.parse(req.params);

    if (!isValidId(organizerId)) {
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

    const galleryItem = await Gallery.findOne({
      _id: galleryItemId,
      organizerId,
    });

    if (!galleryItem) {
      return next(new AppError("Gallery item not found", 404));
    }

    let uploadedImage:
      | {
          url: string;
          publicId: string;
        }
      | undefined;

    try {
      const imageFile = getUploadedFile(req, "image");

      if (imageFile) {
        uploadedImage = await uploadImageBuffer({
          buffer: imageFile.buffer,
          folder: MEDIA_FOLDERS.gallery,
          filename: String((req.body as Record<string, unknown>).caption || "gallery"),
        });
      }

      const data = updateGalleryItemSchema.parse({
        ...(req.body as Record<string, unknown>),
        ...(uploadedImage ? { imageUrl: uploadedImage.url } : {}),
      });

      if (!Object.keys(data).length) {
        return next(new AppError("No updates provided", 400));
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

        const previousImagePublicId = galleryItem.imagePublicId;
        galleryItem.imageUrl = data.imageUrl;
        if (uploadedImage) {
          galleryItem.imagePublicId = uploadedImage.publicId;
        }

        if (typeof data.caption === "string") galleryItem.caption = data.caption;
        if (typeof data.altText === "string") galleryItem.altText = data.altText;
        if (typeof data.displayOrder === "number")
          galleryItem.displayOrder = data.displayOrder;

        await galleryItem.save();
        if (uploadedImage) {
          await deleteCloudinaryAsset(previousImagePublicId);
        }
      } else {
        if (typeof data.caption === "string") galleryItem.caption = data.caption;
        if (typeof data.altText === "string") galleryItem.altText = data.altText;
        if (typeof data.displayOrder === "number")
          galleryItem.displayOrder = data.displayOrder;

        await galleryItem.save();
      }

      res.status(200).json({
        status: "success",
        data: {
          galleryItem,
        },
      });
    } catch (error) {
      await deleteCloudinaryAsset(uploadedImage?.publicId);
      throw error;
    }
  },
);

export const getAdminOrganizerGalleryItems = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { organizerId } = organizerIdParamSchema.parse(req.params);

    const organizer = await Organizer.findById(organizerId)
      .select("_id slug name")
      .lean();

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }

    const gallery = await Gallery.find({ organizerId })
      .sort({ displayOrder: 1, createdAt: -1 })
      .lean();

    res.status(200).json({
      status: "success",
      results: gallery.length,
      data: {
        organizer: {
          id: organizer._id,
          slug: organizer.slug,
          name: organizer.name,
        },
        gallery,
      },
    });
  },
);

export const createAdminGalleryItem = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { organizerId } = organizerIdParamSchema.parse(req.params);

    const organizerExists = await Organizer.exists({ _id: organizerId });

    if (!organizerExists) {
      return next(new AppError("Organizer not found", 404));
    }

    let uploadedImage:
      | {
          url: string;
          publicId: string;
        }
      | undefined;

    try {
      const imageFile = getUploadedFile(req, "image");

      if (imageFile) {
        uploadedImage = await uploadImageBuffer({
          buffer: imageFile.buffer,
          folder: MEDIA_FOLDERS.gallery,
          filename: String((req.body as Record<string, unknown>).caption || "gallery"),
        });
      }

      const data = createGalleryItemSchema.parse({
        ...(req.body as Record<string, unknown>),
        ...(uploadedImage ? { imageUrl: uploadedImage.url } : {}),
      });

      const existingGalleryItem = await Gallery.findOne({
        organizerId,
        imageUrl: data.imageUrl,
      }).lean();

      if (existingGalleryItem) {
        return next(
          new AppError(
            "This gallery image already exists for this organizer",
            400,
          ),
        );
      }

      const galleryItem = await Gallery.create({
        organizerId,
        imageUrl: data.imageUrl,
        imagePublicId: uploadedImage?.publicId ?? null,
        caption: data.caption || "",
        altText: data.altText || "",
        displayOrder: data.displayOrder || 0,
      });

      res.status(201).json({
        status: "success",
        data: {
          galleryItem,
        },
      });
    } catch (error) {
      await deleteCloudinaryAsset(uploadedImage?.publicId);
      throw error;
    }
  },
);

export const bulkUpdateAdminGalleryItems = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { organizerId } = organizerIdParamSchema.parse(req.params);

    const organizerExists = await Organizer.exists({ _id: organizerId });

    if (!organizerExists) {
      return next(new AppError("Organizer not found", 404));
    }

    const { items } = bulkUpdateGalleryItemsSchema.parse(req.body);

    const galleryItems = await bulkUpdateGalleryItemsForOrganizer({
      organizerId,
      items,
    });

    res.status(200).json({
      status: "success",
      results: galleryItems.length,
      data: {
        galleryItems,
      },
    });
  },
);
