import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import OrganizerRequest from "../models/organizerRequest";
import Organizer from "../models/organizer";
import DashboardUser from "../models/dasboardUser";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import {
  approveOrganizerRequestSchema,
  organizerRequestIdParamSchema,
  rejectOrganizerRequestSchema,
} from "../validations/organizerRequest.schema";
import { resolveUniqueOrganizerSlug } from "../services/organizerRequestService";
import { generateTemporaryPassword } from "../utils/generateTemporaryPassword";

export const getAdminOrganizerRequests = catchAsync(
  async (req: Request, res: Response) => {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.max(Number(req.query.limit) || 20, 1);
    const skip = (page - 1) * limit;

    const status =
      typeof req.query.status === "string" ? req.query.status.trim() : "";

    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";

    const filter: Record<string, unknown> = {};

    if (status && ["pending", "approved", "rejected"].includes(status)) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const [requests, total] = await Promise.all([
      OrganizerRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      OrganizerRequest.countDocuments(filter),
    ]);

    res.status(200).json({
      status: "success",
      results: requests.length,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      data: {
        requests,
      },
    });
  },
);

export const getAdminOrganizerRequestById = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { requestId } = organizerRequestIdParamSchema.parse(req.params);

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return next(new AppError("Invalid request ID", 400));
    }

    const requestDoc = await OrganizerRequest.findById(requestId).lean();

    if (!requestDoc) {
      return next(new AppError("Organizer request not found", 404));
    }

    res.status(200).json({
      status: "success",
      data: {
        request: requestDoc,
      },
    });
  },
);

export const approveAdminOrganizerRequest = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { requestId } = organizerRequestIdParamSchema.parse(req.params);
    const payload = approveOrganizerRequestSchema.parse(req.body);

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return next(new AppError("Invalid request ID", 400));
    }

    const session = await mongoose.startSession();

    let result: {
      organizer: any;
      dashboardUser: any;
      temporaryPassword: string;
    } | null = null;

    try {
      await session.withTransaction(async () => {
        const requestDoc = await OrganizerRequest.findById(requestId).session(
          session,
        );

        if (!requestDoc) {
          throw new AppError("Organizer request not found", 404);
        }

        if (requestDoc.status !== "pending") {
          throw new AppError("Organizer request is not pending", 400);
        }

        const slug = await resolveUniqueOrganizerSlug({
          name: requestDoc.name,
          preferredSlug: requestDoc.preferredSlug,
          session,
        });

        if (!slug) {
          throw new AppError(
            "Unable to generate a unique slug for this organizer",
            400,
          );
        }

        const existingOrganizer = await Organizer.findOne({
          $or: [
            { slug },
            { contactEmail: requestDoc.email },
            {
              name: {
                $regex: `^${escapeRegex(requestDoc.name)}$`,
                $options: "i",
              },
            },
          ],
        })
          .select("_id")
          .session(session)
          .lean();

        if (existingOrganizer) {
          throw new AppError(
            "An organizer already exists with conflicting details",
            400,
          );
        }

        const existingDashboardUser = await DashboardUser.findOne({
          email: requestDoc.email,
        })
          .select("_id")
          .session(session)
          .lean();

        if (existingDashboardUser) {
          throw new AppError(
            "A dashboard user already exists with this email",
            400,
          );
        }

        const temporaryPassword = generateTemporaryPassword();

        const organizer = new Organizer({
          name: requestDoc.name,
          slug,
          logoUrl: "",
          bannerUrl: "",
          heroTitle: requestDoc.name,
          heroSubtitle: "",
          about: requestDoc.about || "",
          contactEmail: requestDoc.email,
          contactPhone: requestDoc.phone || "",
          location: requestDoc.location || "",
          isActive: true,
        });

        await organizer.save({ session });

        const dashboardUser = new DashboardUser({
          organizerId: organizer._id,
          fullName: requestDoc.name,
          email: requestDoc.email,
          password: temporaryPassword,
          role: "organizer",
          isActive: true,
        });

        await dashboardUser.save({ session });

        requestDoc.status = "approved";
        requestDoc.approvedAt = new Date();
        requestDoc.rejectedAt = null;
        requestDoc.reviewNote =
          payload.reviewNote || requestDoc.reviewNote || "";
        requestDoc.createdOrganizerId = organizer._id;
        requestDoc.createdDashboardUserId = dashboardUser._id;

        await requestDoc.save({ session });

        result = {
          organizer: {
            id: organizer._id,
            name: organizer.name,
            slug: organizer.slug,
            contactEmail: organizer.contactEmail,
            isActive: organizer.isActive,
          },
          dashboardUser: {
            id: dashboardUser._id,
            organizerId: dashboardUser.organizerId,
            fullName: dashboardUser.fullName,
            email: dashboardUser.email,
            role: dashboardUser.role,
            isActive: dashboardUser.isActive,
          },
          temporaryPassword,
        };
      });
    } finally {
      await session.endSession();
    }

    if (!result) {
      return next(new AppError("Approval failed", 500));
    }

    res.status(200).json({
      status: "success",
      data: result,
    });
  },
);

export const rejectAdminOrganizerRequest = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { requestId } = organizerRequestIdParamSchema.parse(req.params);
    const payload = rejectOrganizerRequestSchema.parse(req.body);

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return next(new AppError("Invalid request ID", 400));
    }

    const requestDoc = await OrganizerRequest.findById(requestId);

    if (!requestDoc) {
      return next(new AppError("Organizer request not found", 404));
    }

    if (requestDoc.status !== "pending") {
      return next(new AppError("Organizer request is not pending", 400));
    }

    requestDoc.status = "rejected";
    requestDoc.rejectedAt = new Date();
    requestDoc.approvedAt = null;
    requestDoc.reviewNote = payload.reviewNote || requestDoc.reviewNote || "";

    await requestDoc.save();

    res.status(200).json({
      status: "success",
      data: {
        request: requestDoc,
      },
    });
  },
);

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
