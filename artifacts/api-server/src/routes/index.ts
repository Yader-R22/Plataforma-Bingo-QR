import { Router, type IRouter } from "express";
import healthRouter from "./health";
import { authRouter } from "./auth";
import { gamesRouter } from "./games";
import { cardsRouter } from "./cards";
import { paymentsRouter } from "./payments";
import { walletRouter } from "./wallet";
import { profileRouter } from "./profile";
import { feedRouter } from "./feed";
import { adminRouter } from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/games", gamesRouter);
router.use("/cards", cardsRouter);
router.use("/payments", paymentsRouter);
router.use("/wallet", walletRouter);
router.use("/profile", profileRouter);
router.use("/feed", feedRouter);
router.use("/admin", adminRouter);

export default router;
