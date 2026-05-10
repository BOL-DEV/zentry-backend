import { Readable } from "stream";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { AppError } from "../utils/appError";

export const MAX_IMAGE_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

export const MEDIA_FOLDERS = {
  organizerLogo: "organizers/logos",
  organizerBanner: "organizers/banners",
  organizerRequestLogo: "organizer-requests/logos",
  organizerRequestBanner: "organizer-requests/banners",
  eventPoster: "events/posters",
  gallery: "gallery",
} as const;

type UploadedMediaAsset = {
  url: string;
  publicId: string;
};

let isCloudinaryConfigured = false;

const ensureCloudinaryConfigured = () => {
  if (isCloudinaryConfigured) {
    return;
  }

  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
    process.env;

  if (
    !CLOUDINARY_CLOUD_NAME ||
    !CLOUDINARY_API_KEY ||
    !CLOUDINARY_API_SECRET
  ) {
    throw new AppError("Cloudinary environment variables are not configured", 500);
  }

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
  });

  isCloudinaryConfigured = true;
};

export const uploadImageBuffer = async ({
  buffer,
  folder,
  filename,
}: {
  buffer: Buffer;
  folder: string;
  filename?: string;
}): Promise<UploadedMediaAsset> => {
  ensureCloudinaryConfigured();

  const uploadResult = await new Promise<UploadApiResponse>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        use_filename: Boolean(filename),
        unique_filename: true,
        ...(filename ? { filename_override: filename } : {}),
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        if (!result) {
          reject(new AppError("Cloudinary upload did not return a result", 500));
          return;
        }

        resolve(result);
      },
    );

    Readable.from(buffer).pipe(uploadStream);
  });

  return {
    url: uploadResult.secure_url,
    publicId: uploadResult.public_id,
  };
};

export const deleteCloudinaryAsset = async (publicId?: string | null) => {
  if (!publicId) {
    return;
  }

  ensureCloudinaryConfigured();

  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
  } catch (error) {
    console.error("Failed to delete Cloudinary asset", {
      publicId,
      error,
    });
  }
};
