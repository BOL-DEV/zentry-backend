import express, { type Request } from "express";
import organizerRoute from "../routes/organizerRoute";
import eventsRoute from "../routes/eventRoute";
import orderRoute from "../routes/orderRoute";
import paymentRoute from "../routes/paymentRoute";
import adminAuthRoute from "../routes/adminAuthRoute";
// import ticketRoute from "./routes/ticketRoute";
import authRoute from "../routes/authRoute";
import organizerDashboardRoute from "../routes/organizerDashboardRoute";
import adminCronRoute from "../routes/adminCronRoute";
import adminRoute from "../routes/adminRoute";
import organizerRequestRoute from "../routes/organizerRequestRoute";
import adminOrganizerRequestRoute from "../routes/adminOrganizerRequestRoute";
import morgan from "morgan";
import { globalErrorHandler } from "../middlewares/errorMiddleware";
import cors from "cors";

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

app.use("/api/v1/organizer/dashboard", organizerDashboardRoute);
app.use("/api/v1/organizer", organizerRoute);
app.use("/api/v1/events", eventsRoute);
app.use("/api/v1/orders", orderRoute);
app.use("/api/v1/payments", paymentRoute);
// app.use("/api/v1/tickets", ticketRoute);
app.use("/api/v1/auth", authRoute);
app.use("/api/v1/organizer-requests", organizerRequestRoute);
app.use("/api/v1/admin/auth", adminAuthRoute);
app.use("/api/v1/admin/organizer-requests", adminOrganizerRequestRoute);
app.use("/api/v1/internal/cron", adminCronRoute);
app.use("/api/v1/admin", adminRoute);

app.get("/", (_req, res) => {
  res.status(200).json({
    status: "success",
    message: "Welcome to the Zentra API!",
  });
});

app.use(globalErrorHandler);

export default app;
