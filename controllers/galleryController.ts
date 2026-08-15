import { Request, Response, NextFunction } from "express";
import { catchAsync } from "../utils/catchAsync";
import {
  bulkCreateGalleryItemsSchema,
  bulkUpdateGalleryItemsSchema,
  createGalleryItemSchema,
  galleryItemIdParamSchema,
  moderateGalleryItemSchema,
  submitGalleryItemSchema,
  updateGalleryItemSchema,
} from "../validations/gallery.schema";
import { AppError } from "../utils/appError";
import Gallery from "../models/gallery";
import {
  deleteCloudinaryAsset,
  MEDIA_FOLDERS,
  uploadImageBuffer,
} from "../services/cloudinaryService";
import { getUploadedFile, getUploadedFiles } from "../utils/mediaHelpers";
import { bulkUpdateGalleryItemsForOrganizer } from "../services/galleryBulkService";
import {
  getLikeCounts,
  getLikedItemIds,
  recordLike,
} from "../services/galleryReactionService";

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

export const createGalleryItemsBulk = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return next(new AppError("User not found", 401));
    }

    const imageFiles = getUploadedFiles(req, "images");

    if (!imageFiles.length) {
      return next(new AppError("At least one image is required", 400));
    }

    const { caption } = bulkCreateGalleryItemsSchema.parse(req.body);

    const [lastItem] = await Gallery.find({ organizerId: user.organizerId })
      .sort({ displayOrder: -1 })
      .limit(1)
      .lean();
    let nextDisplayOrder = (lastItem?.displayOrder ?? -1) + 1;

    const created: Array<Awaited<ReturnType<typeof Gallery.create>>> = [];
    const failed: Array<{ filename: string; reason: string }> = [];

    for (const file of imageFiles) {
      let uploadedImage: { url: string; publicId: string } | undefined;

      try {
        uploadedImage = await uploadImageBuffer({
          buffer: file.buffer,
          folder: MEDIA_FOLDERS.gallery,
          filename: caption || file.originalname,
        });

        const galleryItem = await Gallery.create({
          organizerId: user.organizerId,
          imageUrl: uploadedImage.url,
          imagePublicId: uploadedImage.publicId,
          caption: caption || "",
          displayOrder: nextDisplayOrder,
        });

        nextDisplayOrder += 1;
        created.push(galleryItem);
      } catch (error) {
        await deleteCloudinaryAsset(uploadedImage?.publicId);
        failed.push({
          filename: file.originalname,
          reason: error instanceof Error ? error.message : "Upload failed",
        });
      }
    }

    res.status(201).json({
      status: "success",
      results: created.length,
      data: {
        created,
        failed,
      },
    });
  },
);

export const getGalleryItems = catchAsync(async (req, res, next) => {
  const organizer = req.organizer;

  if (!organizer) {
    return next(new AppError("Organizer not found", 404));
  }

  const gallery = await Gallery.find({
    organizerId: organizer._id,
    status: "published",
  })
    .sort({
      displayOrder: 1,
      createdAt: -1,
    })
    .lean();

  const galleryItemIds = gallery.map((item: { _id: string }) => item._id);
  const [likeCounts, likedItemIds] = await Promise.all([
    getLikeCounts(galleryItemIds),
    getLikedItemIds(req.ip || "", galleryItemIds),
  ]);

  const galleryWithReactions = gallery.map((item: { _id: string }) => ({
    ...item,
    likeCount: likeCounts.get(item._id) ?? 0,
    hasLiked: likedItemIds.has(item._id),
  }));

  res.status(200).json({
    status: "success",
    data: {
      organizer: {
        slug: organizer.slug,
      },
      results: galleryWithReactions.length,
      gallery: galleryWithReactions,
    },
  });
});

export const likeGalleryItem = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const organizer = req.organizer;

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }

    const { galleryItemId } = galleryItemIdParamSchema.parse(req.params);

    const galleryItem = await Gallery.findOne({
      _id: galleryItemId,
      organizerId: organizer._id,
    }).lean();

    if (!galleryItem) {
      return next(new AppError("Gallery item not found", 404));
    }

    await recordLike(galleryItemId, req.ip || "");

    const likeCounts = await getLikeCounts([galleryItemId]);

    res.status(200).json({
      status: "success",
      data: {
        likeCount: likeCounts.get(galleryItemId) ?? 0,
        hasLiked: true,
      },
    });
  },
);

export const submitGalleryItem = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const organizer = req.organizer;

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }

    const imageFile = getUploadedFile(req, "image");

    if (!imageFile) {
      return next(new AppError("An image is required", 400));
    }

    const data = submitGalleryItemSchema.parse(req.body);

    let uploadedImage: { url: string; publicId: string } | undefined;

    try {
      uploadedImage = await uploadImageBuffer({
        buffer: imageFile.buffer,
        folder: MEDIA_FOLDERS.gallery,
        filename: data.caption || "gallery-submission",
      });

      const galleryItem = await Gallery.create({
        organizerId: organizer._id,
        imageUrl: uploadedImage.url,
        imagePublicId: uploadedImage.publicId,
        caption: data.caption || "",
        submittedByName: data.submittedByName || null,
        status: "pending",
      });

      res.status(201).json({
        status: "success",
        data: {
          galleryItem,
          message: "Thanks! Your photo is pending review.",
        },
      });
    } catch (error) {
      await deleteCloudinaryAsset(uploadedImage?.publicId);
      throw error;
    }
  },
);

export const getPendingGalleryItems = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return next(new AppError("User not found", 401));
    }

    const galleryItems = await Gallery.find({
      organizerId: user.organizerId,
      status: "pending",
    })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      status: "success",
      results: galleryItems.length,
      data: {
        galleryItems,
      },
    });
  },
);

export const moderateGalleryItem = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return next(new AppError("User not found", 401));
    }

    const { galleryItemId } = galleryItemIdParamSchema.parse(req.params);
    const { action } = moderateGalleryItemSchema.parse(req.body);

    const galleryItem = await Gallery.findOne({
      _id: galleryItemId,
      organizerId: user.organizerId,
    });

    if (!galleryItem) {
      return next(new AppError("Gallery item not found", 404));
    }

    if (action === "approve") {
      galleryItem.status = "published";
      await galleryItem.save();

      return res.status(200).json({
        status: "success",
        data: {
          galleryItem,
        },
      });
    }

    await Gallery.deleteOne({ _id: galleryItem._id });
    await deleteCloudinaryAsset(galleryItem.imagePublicId ?? undefined);

    res.status(200).json({
      status: "success",
      data: {
        message: "Submission rejected and removed.",
      },
    });
  },
);

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

