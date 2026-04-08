import { Request, Response, NextFunction } from "express";
import Organizer from "../models/organizer";
import { catchAsync } from "../utils/catchAsync";
import { createOrganizerSchema } from "../validations/organizer.schema";
import { syncPaystackSettlements } from "../services/syncPaystackSettlement";
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
      "-paystackSubaccountCode",
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

export const syncOrganizerSettlements = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError("You are not logged in", 401));
    }

    const organizer = await Organizer.findById(req.user.organizerId).select(
      "name paystackSubaccountCode",
    );

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }

    if (!organizer.paystackSubaccountCode) {
      return next(
        new AppError(
          "Organizer does not have a Paystack subaccount configured",
          400,
        ),
      );
    }

    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 7);

    const result = await syncPaystackSettlements({
      from,
      to: now,
      subaccount: organizer.paystackSubaccountCode,
    });

    res.status(200).json({
      status: "success",
      data: {
        organizer: {
          id: organizer._id,
          name: organizer.name,
        },
        sync: result,
      },
    });
  },
);
