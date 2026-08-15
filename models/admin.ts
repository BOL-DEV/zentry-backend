import { createModel } from "../db/orm";

export interface IAdmin {
  _id: string;
  fullName: string;
  email: string;
  password: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  comparePassword?: (candidatePassword: string) => Promise<boolean>;
}

const Admin = createModel<IAdmin>({
  modelName: "Admin",
  tableName: "admins",
  fields: {
    _id: "id",
    fullName: "full_name",
    email: "email",
    password: "password",
    isActive: "is_active",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  hiddenFields: ["password"],
});

export default Admin;

