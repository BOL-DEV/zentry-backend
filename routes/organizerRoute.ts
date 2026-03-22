import { Router } from "express";
import {
  createOrganizer,
  getOrganizerBySlug,
} from "../controllers/organizerController";
import { createGalleryItem } from "../controllers/galleryController";

const router = Router();

router.route("/").post(createOrganizer);
router.route("/:slug").get(getOrganizerBySlug);

router.route("/:slug/gallery").post(createGalleryItem);

export default router