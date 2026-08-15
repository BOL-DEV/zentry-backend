import multer from "multer";
import { AppError } from "../utils/appError";
import { MAX_IMAGE_UPLOAD_SIZE_BYTES } from "../services/cloudinaryService";

const storage = multer.memoryStorage();

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  if (!file.mimetype.startsWith("image/")) {
    cb(new AppError("Only image uploads are allowed", 400));
    return;
  }

  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_IMAGE_UPLOAD_SIZE_BYTES,
  },
  fileFilter,
});

export const uploadOrganizerMedia = upload.fields([
  { name: "logo", maxCount: 1 },
  { name: "banner", maxCount: 1 },
]);

export const uploadEventPoster = upload.fields([{ name: "poster", maxCount: 1 }]);

export const uploadGalleryMedia = upload.fields([{ name: "image", maxCount: 1 }]);

export const uploadGalleryMediaBulk = upload.fields([
  { name: "images", maxCount: 20 },
]);
