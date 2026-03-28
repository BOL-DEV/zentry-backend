import { verifyTicket } from "../controllers/ticketController";
import { Router } from "express";

const router = Router();

router.post("/verify", verifyTicket);

export default router;
