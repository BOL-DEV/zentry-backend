import { Router } from "express";
import {
  adminLogin,
  adminLogout,
  getAdminMe,
} from "../controllers/adminAuthController";
import { protectAdmin } from "../middlewares/protect";

const router = Router();

router.post("/login", adminLogin);
router.post("/logout", protectAdmin, adminLogout);
router.get("/me", protectAdmin, getAdminMe);

export default router;
