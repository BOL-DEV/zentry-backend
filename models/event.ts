import { createModel } from "../db/orm";

export interface IEvent {
  _id: string;
  organizerId: string;
  title: string;
  description: string;
  date: Date;
  location: string;
  posterUrl: string;
  posterPublicId?: string | null;
  dressCode: string;
  policies: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const Event = createModel<IEvent>({
  modelName: "Event",
  tableName: "events",
  fields: {
    _id: "id",
    organizerId: "organizer_id",
    title: "title",
    description: "description",
    date: "date",
    location: "location",
    posterUrl: "poster_url",
    posterPublicId: "poster_public_id",
    dressCode: "dress_code",
    policies: "policies",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  relations: {
    organizerId: { modelName: "Organizer" },
  },
});

export default Event;

