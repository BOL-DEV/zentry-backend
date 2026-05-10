import mongoose from "mongoose";
import Gallery from "../models/gallery";
import { AppError } from "../utils/appError";

type GalleryBulkUpdateItem = {
  galleryItemId: string;
  imageUrl?: string | undefined;
  caption?: string | undefined;
  altText?: string | undefined;
  displayOrder?: number | undefined;
};

type BulkUpdatedGalleryItem = {
  _id: unknown;
  organizerId: unknown;
  imageUrl: string;
  imagePublicId?: string | null;
  caption?: string;
  altText?: string;
  displayOrder?: number;
  createdAt?: Date;
  updatedAt?: Date;
};

export const bulkUpdateGalleryItemsForOrganizer = async ({
  organizerId,
  items,
}: {
  organizerId: string | mongoose.Types.ObjectId;
  items: GalleryBulkUpdateItem[];
}): Promise<BulkUpdatedGalleryItem[]> => {
  const galleryItemIds = items.map((item) => item.galleryItemId);
  const uniqueItemIds = new Set(galleryItemIds);

  if (uniqueItemIds.size !== galleryItemIds.length) {
    throw new AppError(
      "Each gallery item can only appear once in a bulk update request",
      400,
    );
  }

  const organizerObjectId =
    organizerId instanceof mongoose.Types.ObjectId
      ? organizerId
      : new mongoose.Types.ObjectId(organizerId);

  const [galleryItemsToUpdate, organizerGalleryItems] = await Promise.all([
    Gallery.find({
      organizerId: organizerObjectId,
      _id: { $in: galleryItemIds },
    }),
    Gallery.find({ organizerId: organizerObjectId })
      .select("_id imageUrl")
      .lean(),
  ]);

  if (galleryItemsToUpdate.length !== items.length) {
    throw new AppError("One or more gallery items were not found", 404);
  }

  const itemById = new Map(
    galleryItemsToUpdate.map((galleryItem) => [galleryItem._id.toString(), galleryItem]),
  );

  const finalImageUrlById = new Map(
    organizerGalleryItems.map((galleryItem) => [
      galleryItem._id.toString(),
      galleryItem.imageUrl,
    ]),
  );

  for (const item of items) {
    const existingGalleryItem = itemById.get(item.galleryItemId);

    if (!existingGalleryItem) {
      throw new AppError("One or more gallery items were not found", 404);
    }

    finalImageUrlById.set(
      item.galleryItemId,
      typeof item.imageUrl === "string" ? item.imageUrl : existingGalleryItem.imageUrl,
    );
  }

  const seenImageUrls = new Map<string, string>();

  for (const [galleryItemId, imageUrl] of finalImageUrlById.entries()) {
    const existingGalleryItemId = seenImageUrls.get(imageUrl);

    if (existingGalleryItemId && existingGalleryItemId !== galleryItemId) {
      throw new AppError(
        "This gallery image already exists for this organizer",
        400,
      );
    }

    seenImageUrls.set(imageUrl, galleryItemId);
  }

  const now = new Date();

  await Gallery.bulkWrite(
    items.map((item) => {
      const updates: Record<string, unknown> = {
        updatedAt: now,
      };

      if (typeof item.imageUrl === "string") updates.imageUrl = item.imageUrl;
      if (typeof item.caption === "string") updates.caption = item.caption;
      if (typeof item.altText === "string") updates.altText = item.altText;
      if (typeof item.displayOrder === "number") {
        updates.displayOrder = item.displayOrder;
      }

      return {
        updateOne: {
          filter: {
            _id: new mongoose.Types.ObjectId(item.galleryItemId),
            organizerId: organizerObjectId,
          },
          update: {
            $set: updates,
          },
        },
      };
    }),
  );

  const updatedGalleryItems = await Gallery.find({
    organizerId: organizerObjectId,
    _id: { $in: galleryItemIds },
  }).lean();

  const updatedGalleryItemById = new Map(
    updatedGalleryItems.map((galleryItem) => [galleryItem._id.toString(), galleryItem]),
  );

  return items
    .map((item) => updatedGalleryItemById.get(item.galleryItemId))
    .filter((galleryItem): galleryItem is NonNullable<typeof galleryItem> =>
      Boolean(galleryItem),
    );
};
