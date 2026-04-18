import { Router } from "express";
import { getAdminAnalyticsSummary } from "../controllers/adminAnalyticController";
import { protectAdmin, restrictTo } from "../middlewares/protect";
import {
  createAdminOrganizer,
  createAdminGalleryItem,
  getAdminOrganizerById,
  getAdminOrganizerGalleryItems,
  getAdminOrganizers,
  toggleAdminOrganizerActiveState,
  updateAdminGalleryItem,
  updateAdminOrganizer,
  updateAdminOrganizerOrganizerSessionLimit,
  updateAdminOrganizerStaffSessionLimit,
} from "../controllers/adminOrganizerController";
import {
  getAdminOrderById,
  getAdminOrders,
} from "../controllers/adminOrderController";
import {
  createAdminEventForOrganizer,
  getAdminEventById,
  getAdminEventAttendees,
  getAdminEvents,
  getAdminEventTicketTypes,
  getAdminScannerSummary,
  createAdminTicketTypeForEvent,
  updateAdminEvent,
  updateAdminTicketType,
  updateAdminTicketTypeQuantity,
} from "../controllers/adminEventController";
import {
  getAdminTicketById,
  getAdminTickets,
  verifyAdminTicket,
} from "../controllers/adminTicketController";
import {
  getAdminDashboardUserSessions,
  getAdminOrganizerDashboardUsers,
  logoutAdminDashboardUserSession,
  logoutAllAdminDashboardUserSessions,
  resetAdminOrganizerDashboardUserPassword,
  resetAdminDashboardUserPassword,
  toggleAdminDashboardUserActiveState,
} from "../controllers/adminDashboardUserController";

const router = Router();

router.use(protectAdmin);
router.use(restrictTo("admin"));

router.route("/analytics").get(getAdminAnalyticsSummary);

/// ORGANIZER MANAGEMENT
router.route("/organizers").get(getAdminOrganizers).post(createAdminOrganizer);
router
  .route("/organizers/:organizerId")
  .get(getAdminOrganizerById)
  .patch(updateAdminOrganizer);
router
  .route("/organizers/:organizerId/events")
  .post(createAdminEventForOrganizer);
router
  .route("/organizers/:organizerId/gallery")
  .get(getAdminOrganizerGalleryItems)
  .post(createAdminGalleryItem);
router
  .route("/organizers/:organizerId/gallery/:galleryItemId")
  .patch(updateAdminGalleryItem);
router
  .route("/organizers/:organizerId/toggle-active")
  .patch(toggleAdminOrganizerActiveState);
router
  .route("/organizers/:organizerId/staff-session-limit")
  .patch(updateAdminOrganizerStaffSessionLimit);
router
  .route("/organizers/:organizerId/organizer-session-limit")
  .patch(updateAdminOrganizerOrganizerSessionLimit);

/// DASHBOARD USER MANAGEMENT
router
  .route("/organizers/:organizerId/dashboard-users")
  .get(getAdminOrganizerDashboardUsers);
router
  .route("/organizers/:organizerId/dashboard-users/:userId/reset-password")
  .patch(resetAdminOrganizerDashboardUserPassword);
router
  .route("/dashboard-users/:userId/sessions")
  .get(getAdminDashboardUserSessions);
router
  .route("/dashboard-users/:userId/sessions/:sessionId/logout")
  .patch(logoutAdminDashboardUserSession);
router
  .route("/dashboard-users/:userId/reset-password")
  .patch(resetAdminDashboardUserPassword);
router
  .route("/dashboard-users/:userId/logout-all")
  .patch(logoutAllAdminDashboardUserSessions);
router
  .route("/dashboard-users/:userId/toggle-active")
  .patch(toggleAdminDashboardUserActiveState);

/// ORDER MANAGEMENT
router.route("/orders").get(getAdminOrders);
router.route("/orders/:orderId").get(getAdminOrderById);

/// EVENT MANAGEMENT
router.route("/events").get(getAdminEvents);
router.route("/events/:eventId").get(getAdminEventById).patch(updateAdminEvent);
router
  .route("/events/:eventId/ticket-types")
  .get(getAdminEventTicketTypes)
  .post(createAdminTicketTypeForEvent);
router.route("/events/:eventId/attendees").get(getAdminEventAttendees);
router.route("/events/:eventId/scanner-summary").get(getAdminScannerSummary);
router
  .route("/events/:eventId/ticket-types/:ticketTypeId")
  .patch(updateAdminTicketType);
router
  .route("/events/:eventId/ticket-types/:ticketTypeId/quantity")
  .patch(updateAdminTicketTypeQuantity);

/// TICKET MANAGEMENT
router.route("/tickets").get(getAdminTickets);
router.route("/tickets/verify").post(verifyAdminTicket);
router.route("/tickets/:ticketId").get(getAdminTicketById);

export default router;
