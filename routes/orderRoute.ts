import { Router } from "express";
import { initializeOrderPayment } from "../services/paymentService";

const router = Router();

router.post("/:orderId/pay", initializeOrderPayment);

export default router;