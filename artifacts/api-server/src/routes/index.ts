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
import { manualPaymentsRouter } from "./manual-payments";
import storageRouter from "./storage";
import { pushRouter } from "./push";
import { activatorSalesRouter } from "./activator-sales";
import { ogRouter } from "./og";
import { physicalPrizesRouter } from "./physical-prizes";
import { walletTopUpsRouter } from "./wallet-top-ups";
import { organizerRouter } from "./organizer";

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
// Site-settings needs higher limit — admin uploads images as base64 (logo, QR, OG image)
router.use("/site-settings", express.json({ limit: "8mb" }), siteSettingsRouter);
router.use("/banners", bannersRouter);
router.use("/pwa", pwaRouter);
router.use("/manual-payments", manualPaymentsRouter);
router.use("/storage", storageRouter);
router.use("/push", pushRouter);
router.use("/activator-sales", activatorSalesRouter);
router.use("/og", ogRouter);
// Higher body limit for physical-prizes ship — admin may upload receipt image as base64
router.use("/admin/physical-prizes", express.json({ limit: "8mb" }), physicalPrizesRouter);
router.use("/wallet-top-ups", walletTopUpsRouter);
router.use("/organizer-requests", organizerRouter);

export default router;
