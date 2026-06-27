import { createModel } from "../db/orm";

export interface IAdminSession {
  _id: string;
  adminId: string;
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

const AdminSession = createModel<IAdminSession>({
  modelName: "AdminSession",
  tableName: "admin_sessions",
  fields: {
    _id: "id",
    adminId: "admin_id",
    isActive: "is_active",
    userAgent: "user_agent",
    ipAddress: "ip_address",
    deviceName: "device_name",
    lastSeenAt: "last_seen_at",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  relations: {
    adminId: { modelName: "Admin" },
  },
});

export default AdminSession;
