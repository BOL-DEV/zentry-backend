import { Schema, model, Document, Types } from "mongoose";
import { hash } from "bcryptjs";

export interface IDashboardUser extends Document {
  organizerId: Types.ObjectId;
  fullName: string;
  email: string;
  password: string;
  role: "organizer" | "staff";
  isActive: boolean;
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

const DashboardUser = model<IDashboardUser>(
  "DashboardUser",
  dashboardUserSchema,
);

export default DashboardUser;
