import { Types } from "mongoose";
import { IDashboardUser } from "../models/dasboardUser";
import { IUserSession } from "../models/userSession";

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
      user?: IDashboardUser;
      session?: IUserSession;
      rawBody?: Buffer;
    }
  }
}

export {};
