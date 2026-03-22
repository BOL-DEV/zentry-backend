import { Request, Response, NextFunction } from "express";
import Organizer from "../models/organizer";
import { catchAsync } from "../utils/catchAsync";
import { createOrganizerSchema, organizerSlugParamSchema } from "../validations/organizer.schema";
import { generateSlug } from "../utils/slugify";
import { AppError } from "../utils/appError";

export const createOrganizer = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const data = createOrganizerSchema.parse(req.body);

    const slug = generateSlug(data.name);

    const existingOrganizer = await Organizer.findOne({ slug });

    if (existingOrganizer) {
      return next(new AppError("Organizer with this name already exists", 400));
    }

    const organizer = await Organizer.create({
      ...data,
      slug,
    });

    res.status(201).json({
      status: "success",
      data: {
        organizer,
      },
    });
  },
);

export const getOrganizerBySlug = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { slug } = organizerSlugParamSchema.parse(req.params);

    const organizer = await Organizer.findOne({ slug });

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }

    res.status(200).json({
      status: "success",
      data: {
        organizer,
      },
    });
  },
);