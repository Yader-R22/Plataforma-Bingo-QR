import { Router } from "express";
import { db, gamesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const ogRouter = Router();

// ── GET /api/og/game/:id/image ─────────────────────────────────────────────
// Sirve la imagen de portada del juego como binario (decodifica base64 si aplica)
ogRouter.get("/game/:id/image", async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).end(); return; }

  const [game] = await db.select({ coverImageUrl: gamesTable.coverImageUrl })
    .from(gamesTable)
    .where(eq(gamesTable.id, id))
    .limit(1);

  if (!game?.coverImageUrl) { res.status(404).end(); return; }

  const src = game.coverImageUrl;

  if (src.startsWith("data:")) {
    // base64 data URI — decodificar y servir como binario
    const match = src.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) { res.status(500).end(); return; }
    const [, mime, b64] = match;
    const buf = Buffer.from(b64, "base64");
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(buf);
  } else {
    // URL externa — redirigir
    res.redirect(302, src);
  }
});

// ── GET /api/og/game/:id ───────────────────────────────────────────────────
// Sirve HTML con Open Graph tags + redirect JS para browsers normales
ogRouter.get("/game/:id", async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).end(); return; }

  const [game] = await db.select({
    id: gamesTable.id,
    title: gamesTable.title,
    prizeAmount: gamesTable.prizeAmount,
    cardPrice: gamesTable.cardPrice,
    drawDate: gamesTable.drawDate,
    coverImageUrl: gamesTable.coverImageUrl,
    slug: gamesTable.slug,
  }).from(gamesTable)
    .where(eq(gamesTable.id, id))
    .limit(1);

  if (!game) { res.status(404).end(); return; }

  const proto = req.headers["x-forwarded-proto"] ?? "https";
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost";
  const base = `${proto}://${host}`;

  const gameUrl = game.slug
    ? `${base}/juego/${game.id}/${game.slug}`
    : `${base}/juego/${game.id}`;

  const imageUrl = game.coverImageUrl
    ? `${base}/api/og/game/${game.id}/image`
    : `${base}/opengraph.jpg`;

  const prize = Number(game.prizeAmount).toLocaleString("es-BO");
  const cardPrice = Number(game.cardPrice).toLocaleString("es-BO");
  const drawDate = game.drawDate
    ? new Date(game.drawDate).toLocaleDateString("es-BO", {
        weekday: "long", day: "numeric", month: "long",
        hour: "2-digit", minute: "2-digit",
        timeZone: "America/La_Paz",
      })
    : "";

  const title = `${game.title} — Bs ${prize} en premios`;
  const description = `🎱 Sorteo: ${drawDate} · Cartón Bs ${cardPrice} · ¡Juega desde tu celular en El Bingote!`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(imageUrl)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="${escapeHtml(gameUrl)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="El Bingote" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
  <script>window.location.replace(${JSON.stringify(gameUrl)});</script>
</head>
<body style="font-family:sans-serif;text-align:center;padding:2rem">
  <p>Redirigiendo al juego… <a href="${escapeHtml(gameUrl)}">Haz clic aquí si no redirige automáticamente</a></p>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.end(html);
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
