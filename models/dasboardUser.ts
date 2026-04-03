import { Schema, model, Document, Types } from "mongoose";
import { hash, compare } from "bcryptjs";

export interface IDashboardUser extends Document {
  organizerId: Types.ObjectId;
  fullName: string;
  email: string;
  password: string;
  role: "organizer" | "staff";
  isActive: boolean;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const dashboardUserSchema = new Schema<IDashboardUser>(
  {
    organizerId: {
      type: Schema.Types.ObjectId,
      ref: "Organizer",
      required: true,
      index: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: ["organizer", "staff"],
      default: "staff",
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

dashboardUserSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await hash(this.password, 12);
});

dashboardUserSchema.methods.comparePassword = async function (
  candidatePassword: string,
) {
  return compare(candidatePassword, this.password);
};

const DashboardUser = model<IDashboardUser>(
  "DashboardUser",
  dashboardUserSchema,
);

export default DashboardUser;
