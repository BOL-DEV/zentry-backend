import { Router } from "express";
import {
  createOrganizer,
  getOrganizerBySlug,
} from "../controllers/organizerController";
import {
  createGalleryItems,
  getGalleryItems,
} from "../controllers/galleryController";
import { checkOrganizerExist } from "../middlewares/checkOrganizerExist";
import { checkEventExist } from "../middlewares/checkEventExist";
import { checkEventBelongToOrganizer } from "../middlewares/checkEventBelongToOrganizer";
import {
  createEvent,
  getOrganizerEvents,
  getEventById,
} from "../controllers/eventController";

import {
  createTicketType,
  getEventTicketTypes,
} from "../controllers/ticketTypeController";

import { createPurchase } from "../controllers/purchaseController";

const router = Router();

router.route("/").post(createOrganizer);
router.route("/:slug").get(checkOrganizerExist, getOrganizerBySlug);

router
  .route("/:slug/gallery")
  .post(checkOrganizerExist, createGalleryItems)
  .get(checkOrganizerExist, getGalleryItems);

router
  .route("/:slug/events")
  .post(checkOrganizerExist, createEvent)
  .get(checkOrganizerExist, getOrganizerEvents);

router
  .route("/:slug/events/:eventId")
  .get(
    checkOrganizerExist,
    checkEventExist,
    checkEventBelongToOrganizer,
    getEventById,
  );

router
  .route("/:slug/events/:eventId/ticket-types")
  .post(
    checkOrganizerExist,
    checkEventExist,
    checkEventBelongToOrganizer,
    createTicketType,
  )
  .get(
    checkOrganizerExist,
    checkEventExist,
    checkEventBelongToOrganizer,
    getEventTicketTypes,
  );

router
  .route("/:slug/events/:eventId/purchases")
  .post(
    checkOrganizerExist,
    checkEventExist,
    checkEventBelongToOrganizer,
    createPurchase,
  );

export default router;