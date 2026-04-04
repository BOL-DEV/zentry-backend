import { Router } from "express";
import {
  getOrganizerDashboardSummary,
  getOrganizerEventStats,
  getEventAttendees,
  getScannerSummary,
  getEventSettlementSummary,
  getOrganizerSettlementSummary,
} from "../controllers/organizerDashboardController";
import { createGalleryItem } from "../controllers/galleryController";
import { createEvent } from "../controllers/eventController";
import { createTicketType } from "../controllers/ticketTypeController";
import { verifyTicketForEvent } from "../controllers/ticketController";
import { protect, restrictTo } from "../middlewares/protect";
import { syncPaystackSettlements } from "../services/syncPaystackSettlement";

const router = Router();

router.use(protect);

router
  .route("/summary")
  .get(restrictTo("organizer"), getOrganizerDashboardSummary);

router
  .route("/events")
  .get(restrictTo("organizer"), getOrganizerEventStats)
  .post(restrictTo("organizer"), createEvent);

router.route("/gallery").post(restrictTo("organizer"), createGalleryItem);

router
  .route("/overall-settlement-summary")
  .get(restrictTo("organizer"), getOrganizerSettlementSummary);

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

router
  .route("/sync-settlements")
  .post(restrictTo("organizer"), syncPaystackSettlements);

router
  .route("/events/:eventId/settlement-summary")
  .get(restrictTo("organizer"), getEventSettlementSummary);



export default router;
