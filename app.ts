import express from "express";
import organizerRoute from "./routes/organizerRoute";
import morgan from "morgan";
import { globalErrorHandler } from "./middlewares/errorMiddleware";
import cors from "cors";
import connectDB from "./config/db";

const app = express();

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

app.use(async (_req, _res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    next(error);
  }
});

app.use("/api/v1/organizer", organizerRoute);

app.use(globalErrorHandler);

export default app;
