import { createDashboardUser, login } from "../controllers/authController";
import { Router } from "express";

const router = Router();

router.route("/login").post(login);

// Create dashboard user (organizer/staff)
router.route("/bootstrap/users").post(createDashboardUser);

export default router;
