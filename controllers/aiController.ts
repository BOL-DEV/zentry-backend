import { Request, Response, NextFunction } from "express";
import { catchAsync } from "../utils/catchAsync";
import { generateEventCopySchema } from "../validations/aiEvent.schema";
import { generateEventCopy as generateEventCopyFromGroq } from "../services/groqService";

export const generateEventCopy = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const data = generateEventCopySchema.parse(req.body);

    const copy = await generateEventCopyFromGroq(data);

    res.status(200).json({
      status: "success",
      data: copy,
    });
  },
);
