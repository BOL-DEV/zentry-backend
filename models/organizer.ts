import { Schema, model } from "mongoose";

const organizerSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Organizer name is required"],
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      required: [true, "Organizer slug is required"],
      trim: true,
      lowercase: true,
      index: true,
    },
    logoUrl: {
      type: String,
      required: [true, "Organizer logo is required"],
      trim: true,
    },
    heroTitle: {
      type: String,
      required: [true, "Organizer hero title is required"],
      trim: true,
    },
    heroSubtitle: {
      type: String,
      required: [true, "Organizer hero subtitle is required"],
      trim: true,
    },
    about: {
      type: String,
      required: [true, "Organizer about is required"],
      trim: true,
    },
    contactEmail: {
      type: String,
      required: [true, "Organizer contact email is required"],
      trim: true,
      lowercase: true,
    },
    contactPhone: {
      type: String,
      required: [true, "Organizer contact phone is required"],
      trim: true,
    },
  },
  
  {
    timestamps: true,
    versionKey: false,
  },
);

const Organizer = model("Organizer", organizerSchema);

export default Organizer;
