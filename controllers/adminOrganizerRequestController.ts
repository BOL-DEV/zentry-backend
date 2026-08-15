import { Request, Response, NextFunction } from "express";
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
import {
  resolveUniqueDashboardLoginEmail,
  resolveUniqueOrganizerSlug,
} from "../services/organizerRequestService";
import { generateTemporaryPassword } from "../utils/generateTemporaryPassword";
import { sendEmail } from "../utils/email";
import { startSession } from "../db/pg";
import { isValidId } from "../utils/id";

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

    if (!isValidId(requestId)) {
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

    if (!isValidId(requestId)) {
      return next(new AppError("Invalid request ID", 400));
    }

    const session = await startSession();

    type ApprovalResult = {
      organizer: any;
      dashboardUser: any;
      temporaryPassword: string;
      notificationEmail: string;
    };

    let result: ApprovalResult | undefined;

    try {
      await session.startTransaction();
      result = await (async () => {
        const requestDoc =
          await OrganizerRequest.findById(requestId).session(session);

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

        const loginEmail = await resolveUniqueDashboardLoginEmail({
          slug,
          session,
        });

        if (!loginEmail) {
          throw new AppError(
            "Unable to generate a unique login email for this organizer",
            400,
          );
        }

        const organizer = await Organizer.create({
          name: requestDoc.name,
          slug,
          logoUrl: requestDoc.logoUrl,
          logoPublicId: requestDoc.logoPublicId ?? null,
          bannerUrl: requestDoc.bannerUrl,
          bannerPublicId: requestDoc.bannerPublicId ?? null,
          heroTitle: requestDoc.heroTitle,
          heroSubtitle: requestDoc.heroSubtitle,
          about: requestDoc.about || "",
          contactEmail: requestDoc.email,
          contactPhone: requestDoc.phone || "",
          location: requestDoc.location || "",
          bankDetails: requestDoc.bankDetails,
          isActive: true,
        }, session);

        const dashboardUser = await DashboardUser.create({
          organizerId: organizer._id,
          fullName: requestDoc.name,
          email: loginEmail,
          password: temporaryPassword,
          role: "organizer",
          isActive: true,
        }, session);

        requestDoc.status = "approved";
        requestDoc.approvedAt = new Date();
        requestDoc.rejectedAt = null;
        requestDoc.reviewNote =
          payload.reviewNote || requestDoc.reviewNote || "";
        requestDoc.createdOrganizerId = organizer._id;
        requestDoc.createdDashboardUserId = dashboardUser._id;

        await requestDoc.save(session);

        return {
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
          notificationEmail: organizer.contactEmail,
        };
      })();
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }

    if (!result) {
      return next(new AppError("Approval failed", 500));
    }

    let emailSent = false;

    try {
      const appName = process.env.APP_NAME || "Zentra";
      const dashboardUrl = process.env.DASHBOARD_URL || "";

      const subject = `${appName}: Organizer application approved`;

      const loginInstructions = dashboardUrl
        ? `You can log in here: ${dashboardUrl}`
        : "Log in via your dashboard app.";

      const text = [
        `Hi ${result.dashboardUser.fullName},`,
        "",
        "Your organizer application has been approved.",
        "",
        `Login email: ${result.dashboardUser.email}`,
        `Temporary password: ${result.temporaryPassword}`,
        loginInstructions,
        "",
        "Please change your password after logging in.",
      ].join("\n");

      const html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
          <p>Hi ${escapeHtml(result.dashboardUser.fullName)},</p>
          <p>Your organizer application has been <strong>approved</strong>.</p>
          <p><strong>Login details</strong></p>
          <ul>
            <li><strong>Login email:</strong> ${escapeHtml(result.dashboardUser.email)}</li>
            <li><strong>Temporary password:</strong> ${escapeHtml(result.temporaryPassword)}</li>
          </ul>
          ${
            dashboardUrl
              ? `<p><strong>Dashboard:</strong> <a href="${dashboardUrl}">${dashboardUrl}</a></p>`
              : ""
          }
          <p>Please change your password after logging in.</p>
        </div>
      `;

      await sendEmail({
        to: result.notificationEmail,
        subject,
        html,
        text,
      });

      emailSent = true;
    } catch {
      emailSent = false;
    }

    res.status(200).json({
      status: "success",
      data: {
        organizer: result.organizer,
        dashboardUser: result.dashboardUser,
        temporaryPassword: result.temporaryPassword,
        notification: {
          emailSent,
          to: result.notificationEmail,
        },
      },
    });
  },
);

export const rejectAdminOrganizerRequest = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { requestId } = organizerRequestIdParamSchema.parse(req.params);
    const payload = rejectOrganizerRequestSchema.parse(req.body);

    if (!isValidId(requestId)) {
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

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
