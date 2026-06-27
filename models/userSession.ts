import { createModel } from "../db/orm";

export type SessionRole = "organizer" | "staff";

export interface IUserSession {
  _id: string;
  userId: string;
  organizerId?: string | null;
  role: SessionRole;
  isActive: boolean;
  userAgent?: string;
  ipAddress?: string;
  deviceName?: string;
  lastSeenAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
  save?: (session?: any) => Promise<any>;
  set?: (values: Record<string, any>) => void;
}

const UserSession = createModel<IUserSession>({
  modelName: "UserSession",
  tableName: "user_sessions",
  fields: {
    _id: "id",
    userId: "user_id",
    organizerId: "organizer_id",
    role: "role",
    isActive: "is_active",
    userAgent: "user_agent",
    ipAddress: "ip_address",
    deviceName: "device_name",
    lastSeenAt: "last_seen_at",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  relations: {
    userId: { modelName: "DashboardUser" },
    organizerId: { modelName: "Organizer" },
  },
});

export default UserSession;
