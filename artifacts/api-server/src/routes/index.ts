import { Router, type IRouter } from "express";
import express from "express";
import healthRouter from "./health";
import { authRouter } from "./auth";
import { gamesRouter } from "./games";
import { cardsRouter } from "./cards";
import { paymentsRouter } from "./payments";
import { walletRouter } from "./wallet";
import { profileRouter } from "./profile";
import { feedRouter } from "./feed";
import { adminRouter } from "./admin";
import { categoriesRouter } from "./categories";
import { referralsRouter } from "./referrals";
import { siteSettingsRouter } from "./site-settings";
import { bannersRouter } from "./banners";
import { pwaRouter } from "./pwa";

const router: IRouter = Router();

router.use(healthRouter);
// Auth routes need higher body limit — CI reset sends 3 photos as base64
router.use("/auth", express.json({ limit: "8mb" }), authRouter);
router.use("/games", gamesRouter);
router.use("/cards", cardsRouter);
router.use("/payments", paymentsRouter);
router.use("/wallet", walletRouter);
router.use("/profile", profileRouter);
router.use("/feed", feedRouter);
router.use("/admin", adminRouter);
router.use("/categories", categoriesRouter);
router.use("/referrals", referralsRouter);
router.use("/site-settings", siteSettingsRouter);
router.use("/banners", bannersRouter);
router.use("/pwa", pwaRouter);

export default router;
