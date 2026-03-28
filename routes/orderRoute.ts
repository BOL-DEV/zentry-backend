import { Router } from "express";
import { initializeOrderPayment } from "../controllers/paymentController";
import { getOrderTickets } from "../controllers/orderController";

const router = Router();

router.post("/:orderId/pay", initializeOrderPayment);
router.get("/:orderId/tickets", getOrderTickets);


export default router;