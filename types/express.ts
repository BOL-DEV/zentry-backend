import { Types } from "mongoose";

declare global {
  namespace Express {
    interface Request {
      organizer?: {
        _id: Types.ObjectId;
        slug: string;
        name: string;
      };
      event?: {
        _id: Types.ObjectId;
        organizerId: Types.ObjectId;
        title: string;
      };
      user?: {
        _id: Types.ObjectId;
        organizerId: Types.ObjectId;
        fullName: string;
        email: string;
        role: "organizer" | "staff";
        isActive: boolean;
      };
      rawBody?: Buffer;
    }
  }
}

export {};
