import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";
import { db, siteSettingsTable, gamesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UPLOADS_DIR } from "./config";

// Social media crawler User-Agents that cannot execute JavaScript
const SOCIAL_BOT_RE = /WhatsApp|facebookexternalhit|Facebot|Twitterbot|TelegramBot|LinkedInBot|Discordbot|Slackbot|ia_archiver|rogerbot|vkShare|W3C_Validator/i;

function escHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Rate limiters ────────────────────────────────────────────────────────────
// Login / registro: máx. 10 intentos por IP cada 15 minutos
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Espera 15 minutos antes de volver a intentarlo." },
  skip: () => process.env["NODE_ENV"] === "development",
});

// API general: máx. 300 requests por IP cada minuto (anti-scraping)
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas peticiones. Intenta de nuevo en un momento." },
  skip: () => process.env["NODE_ENV"] === "development",
});

const app: Express = express();
app.set("trust proxy", 1); // VPS está detrás de Nginx — confiar en X-Forwarded-For
app.disable("etag");

// ── Security headers (helmet) ─────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // permite cargar imágenes desde el frontend
  contentSecurityPolicy: false, // el frontend es SPA, CSP se configura en Nginx
}));

// ── Social-bot OG middleware ────────────────────────────────────────────────
// Nginx routes social crawler User-Agents to Express (see deployment docs).
// Express replies with a minimal HTML page containing correct Open Graph tags
// built from live DB settings. Normal browser requests fall through to next().
app.use(async (req, res, next) => {
  const ua = req.headers["user-agent"] || "";
  if (req.path.startsWith("/api") || !SOCIAL_BOT_RE.test(ua)) {
    next(); return;
  }
  try {
    const proto = (req.headers["x-forwarded-proto"] as string | undefined) || "https";
    const rawHost = (req.headers["x-forwarded-host"] as string | undefined) || req.headers["host"] || "";
    const host = rawHost && !rawHost.startsWith("localhost") && !rawHost.startsWith("127.") ? rawHost : "elbingote.com";
    const base = `${proto}://${host}`;

    // ── Página de juego específico → OG con imagen de portada del juego ──────
    const gameMatch = req.path.match(/^\/juego\/(\d+)/);
    if (gameMatch) {
      const gameId = parseInt(gameMatch[1]);
      const [game] = await db.select({
        id: gamesTable.id,
        title: gamesTable.title,
        prizeAmount: gamesTable.prizeAmount,
        cardPrice: gamesTable.cardPrice,
        drawDate: gamesTable.drawDate,
        coverImageUrl: gamesTable.coverImageUrl,
        slug: gamesTable.slug,
      }).from(gamesTable).where(eq(gamesTable.id, gameId)).limit(1);

      if (game) {
        const gameUrl = game.slug
          ? `${base}/juego/${game.id}/${game.slug}`
          : `${base}/juego/${game.id}`;
        const ogImage = game.coverImageUrl
          ? `${base}/api/og/game/${game.id}/image`
          : `${base}/api/site-settings/og-image`;
        const prize = Number(game.prizeAmount).toLocaleString("es-BO");
        const cardPrice = Number(game.cardPrice).toLocaleString("es-BO");
        const drawDate = game.drawDate
          ? new Date(game.drawDate).toLocaleDateString("es-BO", {
              weekday: "long", day: "numeric", month: "long",
              hour: "2-digit", minute: "2-digit",
            })
          : "";
        const title = escHtml(`${game.title} — Bs ${prize} en premios`);
        const desc = escHtml(`🎱 Sorteo: ${drawDate} · Cartón Bs ${cardPrice} · ¡Juega desde tu celular!`);
        const url = escHtml(gameUrl);
        const img = escHtml(ogImage);

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=300");
        res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>${title}</title>
<meta name="description" content="${desc}"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="El Bingote"/>
<meta property="og:title" content="${title}"/>
<meta property="og:description" content="${desc}"/>
<meta property="og:url" content="${url}"/>
<meta property="og:image" content="${img}"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${title}"/>
<meta name="twitter:description" content="${desc}"/>
<meta name="twitter:image" content="${img}"/>
<script>window.location.replace(${JSON.stringify(gameUrl)});</script>
</head>
<body><p><a href="${url}">${title}</a></p></body>
</html>`);
        return;
      }
    }

    // ── Resto de rutas → OG genérico del sitio ───────────────────────────────
    const rows = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.id, 1));
    const s = rows[0];
    if (!s) { next(); return; }

    const ogImage = `${base}/api/site-settings/og-image`;
    const siteName = escHtml(s.siteName);
    const title = escHtml(s.seoTitle || s.siteName);
    const desc = escHtml(s.seoDescription);
    const url = escHtml(`${base}/`);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>${title}</title>
<meta name="description" content="${desc}"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="${siteName}"/>
<meta property="og:title" content="${title}"/>
<meta property="og:description" content="${desc}"/>
<meta property="og:url" content="${url}"/>
<meta property="og:image" content="${ogImage}"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="og:image:type" content="image/png"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${title}"/>
<meta name="twitter:description" content="${desc}"/>
<meta name="twitter:image" content="${ogImage}"/>
</head>
<body><p><a href="${url}">${siteName}</a></p></body>
</html>`);
  } catch { next(); }
});

app.use(
  pinoHttp({
    logger,
    // No logear el endpoint de sesión (se llama cada 3 s por jugador)
    autoLogging: {
      ignore: (req) => !!req.url?.includes("/session"),
    },
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "8mb" }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use("/api/auth/login",    authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api",               generalLimiter);

// Serve uploaded media files (videos, large images) as static — bypasses JSON body limit
app.use("/api/uploads", express.static(UPLOADS_DIR));

app.use("/api", router);

export default app;
