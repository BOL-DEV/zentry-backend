import { Router } from "express";
import { protect, restrictTo } from "../middlewares/protect";
import {
  getStaffSessions,
  logoutOneStaffSession,
  logoutAllStaffSessions,
} from "../controllers/staffSessionController";

const router = Router();

router.use(protect);
router.use(restrictTo("organizer"));

router.get("/staff/:staffId/sessions", getStaffSessions);
router.patch(
  "/staff/:staffId/sessions/:sessionId/logout",
  logoutOneStaffSession,
);
router.patch("/staff/:staffId/logout-all", logoutAllStaffSessions);

export default router;
