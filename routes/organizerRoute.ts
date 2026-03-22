import { Router } from "express";
import { createOrganizer,getOrganizerBySlug } from "../controllers/organizerController";

const router = Router()

router.route("/").post(createOrganizer)
router.route("/:slug").get(getOrganizerBySlug)

export default router