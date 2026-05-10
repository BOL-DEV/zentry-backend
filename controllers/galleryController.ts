import { Request, Response, NextFunction } from "express";
import { catchAsync } from "../utils/catchAsync";
import {
  bulkUpdateGalleryItemsSchema,
  createGalleryItemSchema,
  galleryItemIdParamSchema,
  updateGalleryItemSchema,
} from "../validations/gallery.schema";
import { AppError } from "../utils/appError";
import Gallery from "../models/gallery";
import {
  deleteCloudinaryAsset,
  MEDIA_FOLDERS,
  uploadImageBuffer,
} from "../services/cloudinaryService";
import { getUploadedFile } from "../utils/mediaHelpers";
import { bulkUpdateGalleryItemsForOrganizer } from "../services/galleryBulkService";

export const createGalleryItem = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return next(new AppError("User not found", 401));
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
        organizerId: user.organizerId,
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
        organizerId: user.organizerId,
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

export const getGalleryItems = catchAsync(async (req, res, next) => {
  const organizer = req.organizer;

  if (!organizer) {
    return next(new AppError("Organizer not found", 404));
  }

  const gallery = await Gallery.find({ organizerId: organizer._id }).sort({
    displayOrder: 1,
    createdAt: -1,
  });

  res.status(200).json({
    status: "success",
    data: {
      organizer: {
        slug: organizer.slug,
      },
      results: gallery.length,
      gallery,
    },
  });
});

export const updateGalleryItem = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return next(new AppError("User not found", 401));
    }

    const { galleryItemId } = galleryItemIdParamSchema.parse(req.params);

    const galleryItem = await Gallery.findOne({
      _id: galleryItemId,
      organizerId: user.organizerId,
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
          organizerId: user.organizerId,
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

export const bulkUpdateGalleryItems = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return next(new AppError("User not found", 401));
    }

    const { items } = bulkUpdateGalleryItemsSchema.parse(req.body);

    const galleryItems = await bulkUpdateGalleryItemsForOrganizer({
      organizerId: user.organizerId,
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

