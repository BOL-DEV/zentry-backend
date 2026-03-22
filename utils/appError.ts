
export interface error {
  [key: string]: {message: string};
}

export interface IAppError {
  message: string;
  statusCode: number;
  status: "fail" | "error";
  isOperational: boolean;
  path?: string;
  value?: string;
  keyValue?: string;
  errors?: error[];
};

export class AppError extends Error {
  public statusCode: number;
  public status: "fail" | "error";
  public isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);

    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}
