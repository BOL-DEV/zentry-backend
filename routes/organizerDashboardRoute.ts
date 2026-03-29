import { Router } from "express";
import {
  getOrganizerDashboardSummary,
  getOrganizerEventStats,
  getEventAttendees,
  getScannerSummary,
} from "../controllers/organizerDashboardController";
import {
  createEvent,
  createTicketType,
} from "../controllers/organizerDashboardController";
import { verifyTicketForEvent } from "../controllers/ticketController";
import { protect, restrictTo } from "../middlewares/protect";

const router = Router();

router.use(protect);

router
  .route("/summary")
  .get(restrictTo("organizer"), getOrganizerDashboardSummary);

router
  .route("/events")
  .get(restrictTo("organizer"), getOrganizerEventStats)
  .post(restrictTo("organizer"), createEvent);

router
  .route("/events/:eventId/ticket-types")
  .post(restrictTo("organizer"), createTicketType);

router
  .route("/events/:eventId/attendees")
  .get(restrictTo("organizer"), getEventAttendees);

router
  .route("/events/:eventId/scanner-summary")
  .get(restrictTo("organizer", "staff"), getScannerSummary);

router
  .route("/events/:eventId/verify-ticket")  
  .post(restrictTo("organizer", "staff"), verifyTicketForEvent);

export default router;
