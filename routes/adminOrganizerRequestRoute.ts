import { Router } from "express";
import {
  approveAdminOrganizerRequest,
  getAdminOrganizerRequestById,
  getAdminOrganizerRequests,
  rejectAdminOrganizerRequest,
} from "../controllers/adminOrganizerRequestController";
import { protectAdmin, restrictTo } from "../middlewares/protect";

const router = Router();

router.use(protectAdmin);
router.use(restrictTo("admin"));

router.route("/").get(getAdminOrganizerRequests);
router.route("/:requestId").get(getAdminOrganizerRequestById);
router.route("/:requestId/approve").patch(approveAdminOrganizerRequest);
router.route("/:requestId/reject").patch(rejectAdminOrganizerRequest);

export default router;
