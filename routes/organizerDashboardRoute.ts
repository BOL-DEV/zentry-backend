import { Router } from "express";
import {
  getOrganizerDashboardSummary,
  getOrganizerEventStats,
  getEventAttendees,
  getScannerSummary,
  getEventSettlementSummary,
  getOrganizerSettlementSummary,
  syncOrganizerSettlements,
} from "../controllers/organizerDashboardController";
import {
  bulkUpdateGalleryItems,
  createGalleryItem,
  updateGalleryItem,
} from "../controllers/galleryController";
import { createEvent, updateEvent } from "../controllers/eventController";
import {
  createTicketType,
  updateTicketType,
  updateTicketTypeQuantity,
} from "../controllers/ticketTypeController";
import { verifyTicketForEvent } from "../controllers/ticketController";
import { protect, restrictTo } from "../middlewares/protect";
import {
  getStaffSessions,
  getOrganizerDashboardUsers,
  getOrganizerStaffUsers,
  logoutAllStaffSessions,
  logoutOneStaffSession,
  resetStaffPassword,
} from "../controllers/staffSessionController";
import {
  getOrganizerDashboardProfile,
  updateOrganizerProfile,
} from "../controllers/organizerController";
import {
  uploadEventPoster,
  uploadGalleryMedia,
  uploadOrganizerMedia,
} from "../middlewares/upload";

const router = Router();

router.use(protect);
router.use(restrictTo("organizer", "staff"));

router
  .route("/summary")
  .get(restrictTo("organizer"), getOrganizerDashboardSummary);

router
  .route("/events")
  .get(restrictTo("organizer"), getOrganizerEventStats)
  .post(restrictTo("organizer"), uploadEventPoster, createEvent);
router
  .route("/events/:eventId")
  .patch(restrictTo("organizer"), uploadEventPoster, updateEvent);

router
  .route("/gallery")
  .post(restrictTo("organizer"), uploadGalleryMedia, createGalleryItem);
router
  .route("/gallery/bulk")
  .patch(restrictTo("organizer"), bulkUpdateGalleryItems);
router
  .route("/gallery/:galleryItemId")
  .patch(restrictTo("organizer"), uploadGalleryMedia, updateGalleryItem);

router
  .route("/profile")
  .get(restrictTo("organizer"), getOrganizerDashboardProfile)
  .patch(restrictTo("organizer"), uploadOrganizerMedia, updateOrganizerProfile);

router
  .route("/overall-settlement-summary")
  .get(restrictTo("organizer"), getOrganizerSettlementSummary);

router
  .route("/events/:eventId/ticket-types")
  .post(restrictTo("organizer"), createTicketType);
router
  .route("/events/:eventId/ticket-types/:ticketTypeId")
  .patch(restrictTo("organizer"), updateTicketType);
router
  .route("/events/:eventId/ticket-types/:ticketTypeId/quantity")
  .patch(restrictTo("organizer"), updateTicketTypeQuantity);

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
  .post(restrictTo("organizer"), syncOrganizerSettlements);

router
  .route("/events/:eventId/settlement-summary")
  .get(restrictTo("organizer"), getEventSettlementSummary);

router.route("/staff").get(restrictTo("organizer"), getOrganizerStaffUsers);

router.route("/users").get(restrictTo("organizer"), getOrganizerDashboardUsers);

router
  .route("/staff/:staffId/sessions")
  .get(restrictTo("organizer"), getStaffSessions);

router
  .route("/staff/:staffId/sessions/:sessionId/logout")
  .patch(restrictTo("organizer"), logoutOneStaffSession);

router
  .route("/staff/:staffId/logout-all")
  .patch(restrictTo("organizer"), logoutAllStaffSessions);

router
  .route("/staff/:staffId/password")
  .patch(restrictTo("organizer"), resetStaffPassword);



export default router;
