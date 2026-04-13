import {
  // handlePaystackWebhook,
  handleSquadWebhook,
} from "../services/paymentWebHookService";
import {Router} from "express";

const router = Router();

// Paystack webhook is intentionally disabled for now.
// router.route("/webhook").post(handlePaystackWebhook);
router.route("/webhook/squad").post(handleSquadWebhook);

export default router;
