import { IDashboardUser } from "../models/dasboardUser";
import { IUserSession } from "../models/userSession";
import { IAdmin } from "../models/admin";
import { IAdminSession } from "../models/adminSession";

declare global {
  namespace Express {
    interface Request {
      organizer?: {
        _id: string;
        slug: string;
        name: string;
      };
      event?: {
        _id: string;
        organizerId: string;
        title: string;
      };
      user?: IDashboardUser;
      session?: IUserSession;
      admin?: IAdmin;
      adminSession?: IAdminSession;
      rawBody?: Buffer;
    }
  }
}

export {};
