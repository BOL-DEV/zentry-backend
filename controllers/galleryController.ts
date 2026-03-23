import { catchAsync } from "../utils/catchAsync";
import { createGalleryItemSchema } from "../validations/gallery.schema";
import { AppError } from "../utils/appError";
import Gallery from "../models/gallery";

export const createGalleryItems = catchAsync(async (req, res, next) => {
  const data = createGalleryItemSchema.parse(req.body);
  const organizer = req.organizer;

  if (!organizer) {
    return next(new AppError("Organizer not found", 404));
  }

  const galleryItem = await Gallery.create({
    organizerId: organizer._id,
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
});

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
      gallery,
    },
  });
});

