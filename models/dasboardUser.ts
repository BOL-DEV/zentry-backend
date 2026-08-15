import { createModel } from "../db/orm";

export interface IDashboardUser {
  _id: string;
  organizerId: string;
  fullName: string;
  email: string;
  password: string;
  role: "organizer" | "staff";
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  comparePassword?: (candidatePassword: string) => Promise<boolean>;
}

const DashboardUser = createModel<IDashboardUser>({
  modelName: "DashboardUser",
  tableName: "dashboard_users",
  fields: {
    _id: "id",
    organizerId: "organizer_id",
    fullName: "full_name",
    email: "email",
    password: "password",
    role: "role",
    isActive: "is_active",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  hiddenFields: ["password"],
  relations: {
    organizerId: { modelName: "Organizer" },
  },
});

export default DashboardUser;

