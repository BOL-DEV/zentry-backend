import { Router } from "express";
import {
  getOrderByPaymentReference,
  getOrderStatus,
  getOrderTickets,
} from "../controllers/orderController";

const router = Router();

router.get("/payment-reference/:paymentReference", getOrderByPaymentReference);
router.get("/:orderId/status", getOrderStatus);
router.get("/:orderId/tickets", getOrderTickets);

export default router;
