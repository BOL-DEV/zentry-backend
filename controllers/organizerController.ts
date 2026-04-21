import { Request, Response, NextFunction } from "express";
import Organizer from "../models/organizer";
import { catchAsync } from "../utils/catchAsync";
import {
  createOrganizerSchema,
  updateOrganizerProfileSchema,
} from "../validations/organizer.schema";
import { generateSlug } from "../utils/slugify";
import { AppError } from "../utils/appError";

export const getPublicOrganizers = catchAsync(
  async (_req: Request, res: Response) => {
    const organizers = await Organizer.find({ isActive: true })
      .select(
        "name slug logoUrl bannerUrl heroTitle heroSubtitle about contactEmail contactPhone location isActive createdAt updatedAt",
      )
      .sort({ createdAt: -1, name: 1 })
      .lean();

    res.status(200).json({
      status: "success",
      results: organizers.length,
      data: {
        organizers,
      },
    });
  },
);

export const createOrganizer = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const data = createOrganizerSchema.parse(req.body);

    const slug = generateSlug(data.name);

    const existingOrganizer = await Organizer.findOne({ slug });

    if (existingOrganizer) {
      return next(new AppError("Organizer with this name already exists", 400));
    }

    const organizer = await Organizer.create({
      ...data,
      slug,
    });

    res.status(201).json({
      status: "success",
      data: {
        organizer,
      },
    });
  },
);

export const getOrganizerBySlug = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const organizerId = req.organizer?._id;

    if (!organizerId) {
      return next(new AppError("Organizer not found", 404));
    }

    const organizer = await Organizer.findById(organizerId).select(
      "name slug logoUrl bannerUrl heroTitle heroSubtitle about contactEmail contactPhone location isActive createdAt updatedAt",
    );

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }

    res.status(200).json({
      status: "success",
      data: {
        organizer,
      },
    });
  },
);

export const getOrganizerDashboardProfile = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return next(new AppError("User not found", 401));
    }

    const organizer = await Organizer.findById(user.organizerId).select(
      "name slug logoUrl bannerUrl heroTitle heroSubtitle about contactEmail contactPhone location bankDetails createdAt updatedAt",
    );

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }

    res.status(200).json({
      status: "success",
      data: {
        organizer: {
          id: organizer._id,
          name: organizer.name,
          slug: organizer.slug,
          logoUrl: organizer.logoUrl,
          bannerUrl: organizer.bannerUrl,
          heroTitle: organizer.heroTitle,
          heroSubtitle: organizer.heroSubtitle,
          about: organizer.about,
          contactEmail: organizer.contactEmail,
          contactPhone: organizer.contactPhone,
          location: organizer.location,
          bankDetails: {
            bankName: organizer.bankDetails?.bankName ?? "",
            bankCode: organizer.bankDetails?.bankCode ?? "",
            accountNumber: organizer.bankDetails?.accountNumber ?? "",
            accountName: organizer.bankDetails?.accountName ?? "",
          },
          createdAt: organizer.createdAt,
          updatedAt: organizer.updatedAt,
        },
      },
    });
  },
);

export const updateOrganizerProfile = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return next(new AppError("User not found", 401));
    }

    const data = updateOrganizerProfileSchema.parse(req.body);

    if (!Object.keys(data).length) {
      return next(new AppError("No updates provided", 400));
    }

    const organizer = await Organizer.findById(user.organizerId);

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }

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
        organizer: {
          id: organizer._id,
          name: organizer.name,
          slug: organizer.slug,
          logoUrl: organizer.logoUrl,
          bannerUrl: organizer.bannerUrl,
          heroTitle: organizer.heroTitle,
          heroSubtitle: organizer.heroSubtitle,
          about: organizer.about,
          contactEmail: organizer.contactEmail,
          contactPhone: organizer.contactPhone,
          location: organizer.location,
          bankDetails: {
            bankName: organizer.bankDetails?.bankName ?? "",
            bankCode: organizer.bankDetails?.bankCode ?? "",
            accountNumber: organizer.bankDetails?.accountNumber ?? "",
            accountName: organizer.bankDetails?.accountName ?? "",
          },
          createdAt: organizer.createdAt,
          updatedAt: organizer.updatedAt,
        },
      },
    });
  },
);
