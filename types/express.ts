import type { Types } from "mongoose";

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
      organizer?: {
        _id: Types.ObjectId;
        slug: string;
        name?: string;
      };
      event?: {
        _id: Types.ObjectId;
        organizerId: Types.ObjectId;
        title?: string;
      };
    }
  }
}

export {};
