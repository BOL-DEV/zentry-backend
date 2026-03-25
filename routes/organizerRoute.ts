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
import {
  createEvent,
  getOrganizerEvents,
  getEventById,
} from "../controllers/eventController";

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

router.route("/:slug/events/:eventId").get(checkOrganizerExist, getEventById);

export default router;