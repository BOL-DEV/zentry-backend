import { Schema, model, Document } from "mongoose";
import { hash, compare } from "bcryptjs";

export interface IAdmin extends Document {
  fullName: string;
  email: string;
  password: string;
  isActive: boolean;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const adminSchema = new Schema<IAdmin>(
  {
    fullName: {
      type: String,
      required: [true, "Admin full name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Admin email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Admin password is required"],
      minlength: 8,
      select: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

adminSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await hash(this.password, 12);
});

adminSchema.methods.comparePassword = async function (
  candidatePassword: string,
) {
  return compare(candidatePassword, this.password);
};

const Admin = model<IAdmin>("Admin", adminSchema);

export default Admin;
