import Router from "express";
import { getAllEvents, getPastEvents } from "../controllers/eventController";

const router = Router();

router.route("/").get(getAllEvents);
router.route("/past").get(getPastEvents);

export default router;