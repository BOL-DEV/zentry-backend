import { Request, Response, NextFunction } from "express";
import OrganizerRequest from "../models/organizerRequest";
import Organizer from "../models/organizer";
import DashboardUser from "../models/dasboardUser";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import { generateSlug } from "../utils/slugify";
import { createOrganizerRequestSchema } from "../validations/organizerRequest.schema";

export const submitOrganizerRequest = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const payload = createOrganizerRequestSchema.parse(req.body);

    const email = payload.email;
    const name = payload.name;
    const preferredSlug = payload.preferredSlug;

    const requestedSlug = generateSlug(preferredSlug);
    if (!requestedSlug) {
      return next(new AppError("Invalid preferredSlug", 400));
    }

    const existingPending = await OrganizerRequest.findOne({
      status: "pending",
      $or: [
        { email },
        { name: { $regex: `^${escapeRegex(name)}$`, $options: "i" } },
        {
          preferredSlug: {
            $regex: `^${escapeRegex(preferredSlug)}$`,
            $options: "i",
          },
        },
      ],
    }).lean();

    if (existingPending) {
      return next(
        new AppError(
          "A pending organizer request already exists for this email, name, or slug",
          400,
        ),
      );
    }

    const [existingOrganizer, existingDashboardUser] = await Promise.all([
      Organizer.findOne({
        $or: [
          { contactEmail: email },
          { slug: requestedSlug },
          { name: { $regex: `^${escapeRegex(name)}$`, $options: "i" } },
        ],
      })
        .select("_id")
        .lean(),
      DashboardUser.findOne({ email }).select("_id").lean(),
    ]);

    if (existingOrganizer) {
      return next(
        new AppError(
          "Organizer already exists with this email, name, or slug",
          400,
        ),
      );
    }

    if (existingDashboardUser) {
      return next(
        new AppError("A dashboard user already exists with this email", 400),
      );
    }

    const requestDoc = new OrganizerRequest({
      name: payload.name,
      email: payload.email,
      logoUrl: payload.logoUrl,
      bannerUrl: payload.bannerUrl,
      heroTitle: payload.heroTitle,
      heroSubtitle: payload.heroSubtitle,
      phone: payload.phone,
      about: payload.about,
      location: payload.location,
      ...(payload.bankDetails ? { bankDetails: payload.bankDetails } : {}),
      preferredSlug: payload.preferredSlug,
      status: "pending",
    });

    await requestDoc.save();

    res.status(201).json({
      status: "success",
      data: {
        request: {
          id: requestDoc._id,
          name: requestDoc.name,
          email: requestDoc.email,
          preferredSlug: requestDoc.preferredSlug,
          status: requestDoc.status,
          createdAt: requestDoc.createdAt,
        },
      },
    });
  },
);

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
