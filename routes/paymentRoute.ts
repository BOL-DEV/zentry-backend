import { handlePaystackWebhook } from "../services/paymentWebHookService";
import {Router} from "express";

const router = Router();

router.route("/webhook").post(handlePaystackWebhook);

export default router;