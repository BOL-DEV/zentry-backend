import { Router } from "express";
import { runAdminSettlementSync } from "../controllers/adminSettlementController";

const router = Router();

router.post("/settlements/sync", runAdminSettlementSync);

export default router;
