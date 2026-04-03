import {
  createDashboardUser,
  login,
  logout,
} from "../controllers/authController";
import { Router } from "express";
import { protect, restrictTo } from "../middlewares/protect";

const router = Router();

router.route("/login").post(login);
router.route("/logout").post(protect, logout);

// Create dashboard user (organizer/staff)
router.route("/users").post(restrictTo("admin"), createDashboardUser);

export default router;
