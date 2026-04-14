import { Request, Response, NextFunction } from "express";
import { syncSquadSettlements } from "../services/syncSquadSettlement";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";

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
