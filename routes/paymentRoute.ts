import {
  // handlePaystackWebhook,
  handleSquadWebhook,
} from "../services/paymentWebHookService";
import {Router} from "express";

const router = Router();

// Paystack webhook is intentionally disabled for now.
// router.route("/webhook").post(handlePaystackWebhook);
router.route("/webhook/squad").post((req, _res, next) => {
  console.log("[WebhookRoute] /api/v1/payments/webhook/squad hit", {
    method: req.method,
    hasSignature: Boolean(req.headers["x-squad-signature"]),
    contentType: req.headers["content-type"],
  });
  next();
}, handleSquadWebhook);

export default router;
