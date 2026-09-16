import { model, Schema, Types } from "mongoose";

export interface IGalleryReaction {
  galleryItemId: Types.ObjectId;
  ipAddress: string;
  createdAt: Date;
  updatedAt: Date;
}

const galleryReactionSchema = new Schema<IGalleryReaction>(
  {
    galleryItemId: {
      type: Schema.Types.ObjectId,
      ref: "Gallery",
      required: [true, "Gallery item ID is required"],
      index: true,
    },
    ipAddress: {
      type: String,
      required: [true, "IP address is required"],
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

galleryReactionSchema.index(
  { galleryItemId: 1, ipAddress: 1 },
  { unique: true },
);

const GalleryReaction = model<IGalleryReaction>(
  "GalleryReaction",
  galleryReactionSchema,
);

export default GalleryReaction;
