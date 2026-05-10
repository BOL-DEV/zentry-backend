import { Router } from "express";
import { submitOrganizerRequest } from "../controllers/organizerRequestController";
import { uploadOrganizerMedia } from "../middlewares/upload";

const router = Router();

router.route("/").post(uploadOrganizerMedia, submitOrganizerRequest);

export default router;
