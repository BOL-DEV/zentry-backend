import { Request, Response, NextFunction } from "express";
import Organizer from "../models/organizer";
import { catchAsync } from "../utils/catchAsync";
import {
  createOrganizerSchema,
  updateOrganizerProfileSchema,
} from "../validations/organizer.schema";
import { generateSlug } from "../utils/slugify";
import { AppError } from "../utils/appError";
import {
  deleteCloudinaryAsset,
  MEDIA_FOLDERS,
  uploadImageBuffer,
} from "../services/cloudinaryService";
import { getUploadedFile, normalizeBankDetailsBody } from "../utils/mediaHelpers";

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

      const data = createOrganizerSchema.parse({
        ...body,
        ...(uploadedLogo ? { logoUrl: uploadedLogo.url } : {}),
        ...(uploadedBanner ? { bannerUrl: uploadedBanner.url } : {}),
      });

      const organizer = await Organizer.create({
        ...data,
        slug,
        logoPublicId: uploadedLogo?.publicId ?? null,
        bannerPublicId: uploadedBanner?.publicId ?? null,
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

    const organizer = await Organizer.findById(user.organizerId);

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

      const data = updateOrganizerProfileSchema.parse({
        ...normalizeBankDetailsBody(req.body as Record<string, unknown>),
        ...(uploadedLogo ? { logoUrl: uploadedLogo.url } : {}),
        ...(uploadedBanner ? { bannerUrl: uploadedBanner.url } : {}),
      });

      if (!Object.keys(data).length) {
        return next(new AppError("No updates provided", 400));
      }

      const previousLogoPublicId = organizer.logoPublicId;
      const previousBannerPublicId = organizer.bannerPublicId;

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
    } catch (error) {
      await Promise.all([
        deleteCloudinaryAsset(uploadedLogo?.publicId),
        deleteCloudinaryAsset(uploadedBanner?.publicId),
      ]);

      throw error;
    }
  },
);
