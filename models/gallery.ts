import { createModel } from "../db/orm";

interface IGallery {
  _id: string;
  organizerId: string;
  imageUrl: string;
  imagePublicId?: string | null;
  caption?: string;
  altText?: string;
  displayOrder?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const Gallery = createModel<IGallery>({
  modelName: "Gallery",
  tableName: "galleries",
  fields: {
    _id: "id",
    organizerId: "organizer_id",
    imageUrl: "image_url",
    imagePublicId: "image_public_id",
    caption: "caption",
    altText: "alt_text",
    displayOrder: "display_order",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  relations: {
    organizerId: { modelName: "Organizer" },
  },
});

export default Gallery;

