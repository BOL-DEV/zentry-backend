import Router from "express";
import { getAllEvents } from "../controllers/eventController";

const router = Router();

router.route("/").get(getAllEvents);

export default router;