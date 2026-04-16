import { Router } from "express";
import { getAdminAnalyticsSummary } from "../controllers/adminAnalyticController";
import { protectAdmin, restrictTo } from "../middlewares/protect";
import {
  createAdminOrganizer,
  getAdminOrganizerById,
  getAdminOrganizers,
  toggleAdminOrganizerActiveState,
  updateAdminGalleryItem,
  updateAdminOrganizer,
} from "../controllers/adminOrganizerController";
import {
  getAdminOrderById,
  getAdminOrders,
} from "../controllers/adminOrderController";
import {
  getAdminEventById,
  getAdminEvents,
  updateAdminEvent,
  updateAdminTicketType,
  updateAdminTicketTypeQuantity,
} from "../controllers/adminEventController";
import {
  getAdminTicketById,
  getAdminTickets,
} from "../controllers/adminTicketController";

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
  .route("/organizers/:organizerId/gallery/:galleryItemId")
  .patch(updateAdminGalleryItem);
router
  .route("/organizers/:organizerId/toggle-active")
  .patch(toggleAdminOrganizerActiveState);

/// ORDER MANAGEMENT
router.route("/orders").get(getAdminOrders);
router.route("/orders/:orderId").get(getAdminOrderById);

/// EVENT MANAGEMENT
router.route("/events").get(getAdminEvents);
router.route("/events/:eventId").get(getAdminEventById).patch(updateAdminEvent);
router
  .route("/events/:eventId/ticket-types/:ticketTypeId")
  .patch(updateAdminTicketType);
router
  .route("/events/:eventId/ticket-types/:ticketTypeId/quantity")
  .patch(updateAdminTicketTypeQuantity);

/// TICKET MANAGEMENT
router.route("/tickets").get(getAdminTickets);
router.route("/tickets/:ticketId").get(getAdminTicketById);

export default router;
