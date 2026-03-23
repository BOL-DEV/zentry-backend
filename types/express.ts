import type { Types } from "mongoose";

declare global {
  namespace Express {
    interface Request {
      organizer?: {
        _id: Types.ObjectId;
        slug: string;
        name?: string;
      };
    }
  }
}

export {};
