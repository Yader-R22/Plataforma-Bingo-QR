import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";
import { db, siteSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UPLOADS_DIR } from "./config";

// Social media crawler User-Agents that cannot execute JavaScript
const SOCIAL_BOT_RE = /WhatsApp|facebookexternalhit|Facebot|Twitterbot|TelegramBot|LinkedInBot|Discordbot|Slackbot|ia_archiver|rogerbot|vkShare|W3C_Validator/i;

function escHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const app: Express = express();
app.disable("etag");

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
    const rows = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.id, 1));
    const s = rows[0];
    if (!s) { next(); return; }

    const proto = (req.headers["x-forwarded-proto"] as string | undefined) || "https";
    const rawHost = (req.headers["x-forwarded-host"] as string | undefined) || req.headers["host"] || "";
    const host = rawHost && !rawHost.startsWith("localhost") && !rawHost.startsWith("127.") ? rawHost : "elbingote.com";
    const base = `${proto}://${host}`;
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
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// Serve uploaded media files (videos, large images) as static — bypasses JSON body limit
app.use("/api/uploads", express.static(UPLOADS_DIR));

app.use("/api", router);

export default app;
