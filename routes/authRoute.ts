import {
  createDashboardUser,
  changePassword,
  login,
  logout,
} from "../controllers/authController";
import { Router } from "express";
import { protect, protectAdmin } from "../middlewares/protect";

const router = Router();

router.route("/login").post(login);
router.route("/logout").post(protect, logout);
router.route("/change-password").patch(protect, changePassword);

// Create dashboard user (organizer/staff)
router.route("/users").post(protectAdmin, createDashboardUser);

export default router;
