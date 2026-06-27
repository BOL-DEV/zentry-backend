// @ts-nocheck
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
  _id: string;
  organizerId: string;
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
  organizerId: string;
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

  const galleryItemsToUpdate = await Gallery.find({
    organizerId,
    _id: { $in: galleryItemIds },
  }).lean();

  const organizerGalleryItems = await Gallery.find({ organizerId })
    .select("_id imageUrl")
    .lean();

  if (galleryItemsToUpdate.length !== items.length) {
    throw new AppError("One or more gallery items were not found", 404);
  }

  const itemById = new Map(
    galleryItemsToUpdate.map((galleryItem) => [String(galleryItem._id), galleryItem]),
  );

  const finalImageUrlById = new Map(
    organizerGalleryItems.map((galleryItem) => [
      String(galleryItem._id),
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
      typeof item.imageUrl === "string"
        ? item.imageUrl
        : existingGalleryItem.imageUrl,
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

  const updated: BulkUpdatedGalleryItem[] = [];
  for (const item of items) {
    const updates: Record<string, unknown> = {};
    if (typeof item.imageUrl === "string") updates.imageUrl = item.imageUrl;
    if (typeof item.caption === "string") updates.caption = item.caption;
    if (typeof item.altText === "string") updates.altText = item.altText;
    if (typeof item.displayOrder === "number") {
      updates.displayOrder = item.displayOrder;
    }

    const result = await Gallery.findOneAndUpdate(
      {
        _id: item.galleryItemId,
        organizerId,
      },
      { $set: updates },
      { new: true },
    );

    if (result) {
      updated.push(result);
    }
  }

  return updated;
};

