import { Request, Response, NextFunction } from "express";
import OrganizerRequest from "../models/organizerRequest";
import Organizer from "../models/organizer";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import { createOrganizerRequestSchema } from "../validations/organizerRequest.schema";

export const submitOrganizerRequest = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const payload = createOrganizerRequestSchema.parse(req.body);

    const email = payload.email;
    const name = payload.name;

    const existingPending = await OrganizerRequest.findOne({
      status: "pending",
      $or: [
        { email },
        { name: { $regex: `^${escapeRegex(name)}$`, $options: "i" } },
      ],
    }).lean();

    if (existingPending) {
      return next(
        new AppError(
          "A pending organizer request already exists for this email or name",
          400,
        ),
      );
    }

    const existingOrganizer = await Organizer.findOne({
      $or: [
        { contactEmail: email },
        { name: { $regex: `^${escapeRegex(name)}$`, $options: "i" } },
      ],
    })
      .select("_id")
      .lean();

    if (existingOrganizer) {
      return next(new AppError("Organizer already exists", 400));
    }

    const requestDoc = await OrganizerRequest.create({
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      about: payload.about,
      location: payload.location,
      preferredSlug: payload.preferredSlug,
      status: "pending",
    });

    res.status(201).json({
      status: "success",
      data: {
        request: {
          id: requestDoc._id,
          name: requestDoc.name,
          email: requestDoc.email,
          status: requestDoc.status,
          createdAt: requestDoc.createdAt,
        },
      },
    });
  },
);

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
