import { Request, Response, NextFunction } from "express";
import Event from "../models/event";
import Organizer from "../models/organizer";
import {
  getAdminDailyPayoutReport,
  getEventSettlementSummaryData,
  getOrganizerSettlementSummaryData,
  syncSquadSettlements,
  toggleManualSettlement,
} from "../services/syncSquadSettlement";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import { eventIdParamSchema } from "../validations/event.schema";
import { organizerIdParamSchema } from "../validations/organizer.schema";
import {
  adminDailyPayoutQuerySchema,
  settlementBatchIdParamSchema,
  toggleSettlementBatchSchema,
} from "../validations/adminSettlement.schema";

const isAuthorizedCronRequest = (req: Request) => {
  const bearer = req.headers.authorization;
  const cronSecret = req.headers["x-cron-secret"];

  if (
    bearer === `Bearer ${process.env.ADMIN_CRON_SECRET}` ||
    cronSecret === process.env.ADMIN_CRON_SECRET
  ) {
    return true;
  }

  return false;
};

export const runAdminSettlementSync = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!isAuthorizedCronRequest(req)) {
      return next(new AppError("Unauthorized cron request", 401));
    }

    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 7);

    const result = await syncSquadSettlements({
      from,
      to: now,
    });

    res.status(200).json({
      status: "success",
      message: "Automatic settlement sync completed",
      data: result,
    });
  },
);

export const runAdminSettlementSyncAsAdmin = catchAsync(
  async (_req: Request, res: Response) => {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 7);

    const result = await syncSquadSettlements({
      from,
      to: now,
    });

    res.status(200).json({
      status: "success",
      message: "Settlement sync completed",
      data: result,
    });
  },
);

export const getAdminOrganizerSettlementSummary = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { organizerId } = organizerIdParamSchema.parse(req.params);
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const perPage = Math.max(
      1,
      Math.min(100, parseInt(req.query.perPage as string) || 20),
    );

    const organizer = await Organizer.findById(organizerId)
      .select("_id")
      .lean();

    if (!organizer) {
      return next(new AppError("Organizer not found", 404));
    }

    const data = await getOrganizerSettlementSummaryData({
      organizerId,
      page,
      perPage,
    });

    res.status(200).json({
      status: "success",
      data,
    });
  },
);

export const getAdminOrganizerEventSettlementSummary = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { organizerId } = organizerIdParamSchema.parse(req.params);
    const { eventId } = eventIdParamSchema.parse(req.params);
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const perPage = Math.max(
      1,
      Math.min(100, parseInt(req.query.perPage as string) || 20),
    );

    const event = await Event.findOne({
      _id: eventId,
      organizerId,
    })
      .select("_id")
      .lean();

    if (!event) {
      return next(new AppError("Event not found", 404));
    }

    const data = await getEventSettlementSummaryData({
      organizerId,
      eventId,
      page,
      perPage,
    });

    if (!data) {
      return next(new AppError("Event not found", 404));
    }

    res.status(200).json({
      status: "success",
      data,
    });
  },
);

export const getAdminDailyPayouts = catchAsync(
  async (req: Request, res: Response) => {
    const query = adminDailyPayoutQuerySchema.parse(req.query);
    const data = await getAdminDailyPayoutReport({
      status: query.status,
      ...(query.date ? { date: query.date } : {}),
      ...(query.organizerId ? { organizerId: query.organizerId } : {}),
    });

    res.status(200).json({
      status: "success",
      data,
    });
  },
);

export const toggleAdminSettlementBatch = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { batchId } = settlementBatchIdParamSchema.parse(req.params);
    const { settled } = toggleSettlementBatchSchema.parse(req.body);

    try {
      const data = await toggleManualSettlement(batchId, settled);

      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Settlement batch not found"
      ) {
        return next(new AppError("Settlement batch not found", 404));
      }

      throw error;
    }
  },
);
