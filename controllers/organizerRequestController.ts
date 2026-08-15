// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import OrganizerRequest from "../models/organizerRequest";
import Organizer from "../models/organizer";
import DashboardUser from "../models/dasboardUser";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import { generateSlug } from "../utils/slugify";
import { createOrganizerRequestSchema } from "../validations/organizerRequest.schema";
import {
  deleteCloudinaryAsset,
  MEDIA_FOLDERS,
  uploadImageBuffer,
} from "../services/cloudinaryService";
import { getUploadedFile, normalizeBankDetailsBody } from "../utils/mediaHelpers";

export const submitOrganizerRequest = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const body = normalizeBankDetailsBody(req.body as Record<string, unknown>);

    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const preferredSlug = String(body.preferredSlug || "").trim();

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
          folder: MEDIA_FOLDERS.organizerRequestLogo,
          filename: requestedSlug,
        });
      }

      if (bannerFile) {
        uploadedBanner = await uploadImageBuffer({
          buffer: bannerFile.buffer,
          folder: MEDIA_FOLDERS.organizerRequestBanner,
          filename: `${requestedSlug}-banner`,
        });
      }

      const payload = createOrganizerRequestSchema.parse({
        ...body,
        ...(uploadedLogo ? { logoUrl: uploadedLogo.url } : {}),
        ...(uploadedBanner ? { bannerUrl: uploadedBanner.url } : {}),
      });

      const requestDoc = await OrganizerRequest.create({
        name: payload.name,
        email: payload.email,
        logoUrl: payload.logoUrl,
        logoPublicId: uploadedLogo?.publicId ?? null,
        bannerUrl: payload.bannerUrl,
        bannerPublicId: uploadedBanner?.publicId ?? null,
        heroTitle: payload.heroTitle,
        heroSubtitle: payload.heroSubtitle,
        phone: payload.phone,
        about: payload.about,
        location: payload.location,
        ...(payload.bankDetails ? { bankDetails: payload.bankDetails } : {}),
        preferredSlug: payload.preferredSlug,
        status: "pending",
      });

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
    } catch (error) {
      await Promise.all([
        deleteCloudinaryAsset(uploadedLogo?.publicId),
        deleteCloudinaryAsset(uploadedBanner?.publicId),
      ]);

      throw error;
    }
  },
);

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
