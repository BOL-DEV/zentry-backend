import { Schema, model, Types } from 'mongoose';

interface IGallery {
    organizerId: Types.ObjectId;
    imageUrl: string;
    imagePublicId?: string | null;
    caption?: string;
    altText ?: string;
    displayOrder?: number;
}

const gallerySchema = new Schema<IGallery>(
  {
    organizerId: {
      type: Types.ObjectId,
      ref: "Organizer",
      required: [true, "Organizer ID is required"],
    },
    imageUrl: {
      type: String,
      required: [true, "Image Url is required"],
      trim: true,
      unique: true,
    },
    imagePublicId: {
      type: String,
      trim: true,
      default: null,
    },
    caption: {
      type: String,
      trim: true,
      default: "",
    },
    altText: {
      type: String,
      trim: true,
      default: "",
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

gallerySchema.index({ organizerId: 1, displayOrder: 1 });

gallerySchema.index({ organizerId: 1, imageUrl: 1 }, { unique: true });

const Gallery = model<IGallery>('Gallery', gallerySchema);

export default Gallery;
