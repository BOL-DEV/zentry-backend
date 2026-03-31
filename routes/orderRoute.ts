import { Router } from "express";
import { initializeOrderPayment } from "../controllers/paymentController";
import {
  getOrderByPaymentReference,
  getOrderStatus,
  getOrderTickets,
} from "../controllers/orderController";

const router = Router();

router.get("/payment-reference/:paymentReference", getOrderByPaymentReference);
router.get("/:orderId/status", getOrderStatus);
router.post("/:orderId/pay", initializeOrderPayment);
router.get("/:orderId/tickets", getOrderTickets);


export default router;