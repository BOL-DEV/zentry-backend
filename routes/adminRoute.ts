import {Router} from "express";
import { getAdminAnalyticsSummary } from "../controllers/adminAnalyticController";
import { protectAdmin, restrictTo } from "../middlewares/protect";
import { getAdminOrganizerById, getAdminOrganizers, toggleAdminOrganizerActiveState } from "../controllers/adminOrganizerController";
import { getAdminOrderById, getAdminOrders } from "../controllers/adminOrderController";
import { getAdminEventById, getAdminEvents } from "../controllers/adminEventController";


const router = Router();

router.use(protectAdmin);
router.use(restrictTo("admin"));

router.route("/analytics").get(getAdminAnalyticsSummary);

/// ORGANIZER MANAGEMENT
router.route("/organizers").get(getAdminOrganizers);
router.route("/organizers/:organizerId").get(getAdminOrganizerById);
router.route("/organizers/:organizerId/toggle-active").patch(toggleAdminOrganizerActiveState);

/// ORDER MANAGEMENT
router.route("/orders").get(getAdminOrders);
router.route("/orders/:orderId").get(getAdminOrderById);

/// EVENT MANAGEMENT
router.route("/events").get(getAdminEvents);
router.route("/events/:eventId").get(getAdminEventById);

export default router;