import { Router, type IRouter } from "express";
import healthRouter from "./health";
import phishshieldRouter from "./phishshield";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/phishshield", phishshieldRouter);

export default router;
