import { Router } from "express";
import {
  createOrganizer,
  getPublicOrganizers,
  getOrganizerBySlug,
} from "../controllers/organizerController";
import {
  getGalleryItems,
  likeGalleryItem,
  submitGalleryItem,
} from "../controllers/galleryController";
import { checkOrganizerExist } from "../middlewares/checkOrganizerExist";
import { checkEventExist } from "../middlewares/checkEventExist";
import { checkEventBelongToOrganizer } from "../middlewares/checkEventBelongToOrganizer";
import {
  getOrganizerEvents,
  getOrganizerLandingEvents,
  getEventById,
} from "../controllers/eventController";
import { getEventTicketTypes } from "../controllers/ticketTypeController";
import { createPurchase } from "../controllers/purchaseController";
import { joinWaitlist } from "../controllers/waitlistController";
import { uploadOrganizerMedia, uploadGalleryMedia } from "../middlewares/upload";

const router = Router();

router.route("/").get(getPublicOrganizers).post(uploadOrganizerMedia, createOrganizer);
router.route("/:slug").get(checkOrganizerExist, getOrganizerBySlug);

router.route("/:slug/gallery").get(checkOrganizerExist, getGalleryItems);

router
  .route("/:slug/gallery/submit")
  .post(checkOrganizerExist, uploadGalleryMedia, submitGalleryItem);

router
  .route("/:slug/gallery/:galleryItemId/like")
  .post(checkOrganizerExist, likeGalleryItem);

router.route("/:slug/events").get(checkOrganizerExist, getOrganizerEvents);

router
  .route("/:slug/landing-events")
  .get(checkOrganizerExist, getOrganizerLandingEvents);

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

router
  .route("/:slug/events/:eventId/ticket-types/:ticketTypeId/waitlist")
  .post(
    checkOrganizerExist,
    checkEventExist,
    checkEventBelongToOrganizer,
    joinWaitlist,
  );



export default router;
