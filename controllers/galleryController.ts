import { Request, Response, NextFunction } from "express";
import { catchAsync } from "../utils/catchAsync";
import {
  createGalleryItemSchema,
  galleryItemIdParamSchema,
  updateGalleryItemSchema,
} from "../validations/gallery.schema";
import { AppError } from "../utils/appError";
import Gallery from "../models/gallery";

export const createGalleryItem = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return next(new AppError("User not found", 401));
    }

    const data = createGalleryItemSchema.parse(req.body);

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
    const data = updateGalleryItemSchema.parse(req.body);

    if (!Object.keys(data).length) {
      return next(new AppError("No updates provided", 400));
    }

    const galleryItem = await Gallery.findOne({
      _id: galleryItemId,
      organizerId: user.organizerId,
    });

    if (!galleryItem) {
      return next(new AppError("Gallery item not found", 404));
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

