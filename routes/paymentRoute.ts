import {
  // handlePaystackWebhook,
  handleSquadWebhook,
} from "../services/paymentWebHookService";
import {Router} from "express";

const router = Router();

// Paystack webhook is intentionally disabled for now.
// router.route("/webhook").post(handlePaystackWebhook);
router.route("/webhook/squad").post((req, _res, next) => {
  const hasVerificationHeader = Boolean(
    req.headers["x-squad-encrypted-body"] ||
      req.headers["x_squad_encrypted_body"] ||
    req.headers["x-squad-signature"] ||
      req.headers["x-squad-verification"] ||
      req.headers["x_squad_verification"],
  );

  console.log("[WebhookRoute] /api/v1/payments/webhook/squad hit", {
    method: req.method,
    hasSignature: hasVerificationHeader,
    contentType: req.headers["content-type"],
  });
  next();
}, handleSquadWebhook);

export default router;
