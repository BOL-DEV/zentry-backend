import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/appError";
import { IAppError } from "../utils/appError";
import { error } from "../utils/appError";

const handleCastErrorDB = (err: IAppError) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = (err: IAppError) => {
  const duplicatedFields = Object.keys(err.keyValue || {});
  const message = `Duplicate field value for: ${duplicatedFields.join(", ")}`;
  return new AppError(message, 400);
};

const handleValidationErrorDB = (err: IAppError) => {
  const errors = Object.values(err.errors || []).map((el: error) => el.message);
  const message = `Invalid input data. ${errors.join(". ")}`;
  return new AppError(message, 400);
};

const handleZodError = (err: ZodError) => {
  const errors = err.issues.map((issue) => issue.message);
  const message = `Validation failed. ${errors.join(". ")}`;
  return new AppError(message, 400);
};

const sendErrorDev = (err: any, res: Response) => {
  res.status(err.statusCode || 500).json({
    status: err.status || "error",
    message: err.message,
    error: err,
    stack: err.stack,
  });
};

const sendErrorProd = (err: any, res: Response) => {
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  }

  return res.status(500).json({
    status: "error",
    message: "Something went wrong!",
  });
};

export const globalErrorHandler = (
  err: any,
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  console.log(process.env.NODE_ENV);

  let error = err;

  if (error.name === "CastError") {
    error = handleCastErrorDB(error);
  } else if (error.code === 11000) {
    error = handleDuplicateFieldsDB(error);
  } else if (error.name === "ValidationError") {
    error = handleValidationErrorDB(error);
  } else if (error instanceof ZodError) {
    error = handleZodError(error);
  }

  error.statusCode = error.statusCode || 500;
  error.status = error.status || "error";

  if (process.env.NODE_ENV === "development") {
    return sendErrorDev(error, res);
  }

  sendErrorProd(error, res);
};
