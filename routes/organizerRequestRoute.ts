import { Router } from "express";
import { submitOrganizerRequest } from "../controllers/organizerRequestController";

const router = Router();

router.route("/").post(submitOrganizerRequest);

export default router;
