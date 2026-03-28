import express, { type Request } from "express";
import organizerRoute from "./routes/organizerRoute";
import eventsRoute from "./routes/eventRoute";
import orderRoute from "./routes/orderRoute";
import paymentRoute from "./routes/paymentRoute";
import ticketRoute from "./routes/ticketRoute";
import morgan from "morgan";
import { globalErrorHandler } from "./middlewares/errorMiddleware";
import cors from "cors";
import connectDB from "./config/db";

const app = express();

app.use(cors());
app.use(morgan("dev"));
app.use(
  express.json({
    verify: (req: Request, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(async (_req, _res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    next(error);
  }
});

app.use("/api/v1/organizer", organizerRoute);
app.use("/api/v1/events", eventsRoute);
app.use("/api/v1/orders", orderRoute);
app.use("/api/v1/payments", paymentRoute);
app.use("/api/v1/tickets", ticketRoute);

app.get("/", (_req, res) => {
  res.status(200).json({
    status: "success",
    message: "Welcome to the EventFlow API!",
  });
});

app.use(globalErrorHandler);

export default app;
