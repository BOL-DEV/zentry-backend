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
import {
  getStaffSessions,
  logoutAllStaffSessions,
  logoutOneStaffSession,
} from "../controllers/staffSessionController";

const router = Router();

router.use(protect);
router.use(restrictTo("organizer"));

router
  .route("/summary")
  .get(getOrganizerDashboardSummary);

router
  .route("/events")
  .get(getOrganizerEventStats)
  .post(createEvent);

router.route("/gallery").post(createGalleryItem);

router
  .route("/overall-settlement-summary")
  .get(getOrganizerSettlementSummary);

router
  .route("/events/:eventId/ticket-types")
  .post(createTicketType);

router
  .route("/events/:eventId/attendees")
  .get(getEventAttendees);

router
  .route("/events/:eventId/scanner-summary")
  .get(restrictTo("organizer", "staff"), getScannerSummary);

router
  .route("/events/:eventId/verify-ticket")
  .post(restrictTo("organizer", "staff"), verifyTicketForEvent);

router
  .route("/sync-settlements")
  .post(syncPaystackSettlements);

router
  .route("/events/:eventId/settlement-summary")
  .get(getEventSettlementSummary);

router
  .route("/staff/:staffId/sessions")
  .get(getStaffSessions);

router
  .route("/staff/:staffId/sessions/:sessionId/logout")
  .patch(logoutOneStaffSession);

router
  .route("/staff/:staffId/logout-all")
  .patch(logoutAllStaffSessions);



export default router;
