---
name: Server stability fixes
description: Root causes and fixes for 1240+ server restarts and high memory on Tu Bingazo VPS
---

## Context
VPS: Hetzner-style, escalado de 4 GB/2 vCore → 8 GB/4 vCore.
PM2 process: `elbingote-api`, path `/var/www/tubingazo`, user `elbingote`.

## Fix 1 — Auto-restart falso en arranque (causa de 1240+ reinicios)

**Problema:** `artifacts/api-server/src/lib/autoRestart.ts` calculaba:
```js
const heapPct = Math.round((mem.heapUsed / mem.heapTotal) * 100);
```
`heapTotal` es la asignación dinámica de V8 (~76 MB al arrancar). Con 73 MB usados → 96% → superaba el umbral del 80% → reinicio. El servidor se mataba solo antes de recibir requests.

**Fix:** Usar `v8.getHeapStatistics().heap_size_limit` (el límite real, ej. 512 MB):
```js
import { getHeapStatistics } from "v8";
const heapLimit = getHeapStatistics().heap_size_limit;
const heapPct = Math.round((mem.heapUsed / heapLimit) * 100);
```
Resultado: 73 MB / 512 MB = 14% → no reinicia.

## Fix 2 — Polling de billetera a 2s sin document.hidden (causa de external 158 MB)

**Problema:** `artifacts/tu-bingazo/src/pages/wallet.tsx` tenía `setInterval` a **2000ms** sin guard. Cada usuario en billetera = 2 req/seg a `/api/wallet` + `/api/wallet/withdrawals`. Múltiples usuarios/tabs = lluvia de queries → Buffers de `pg` acumulados en memoria `external`.

**Fix:** Intervalo a 15_000ms + `if (!document.hidden)` guard.

## Fix 3 — Pollings sin document.hidden en todo el frontend

Todos estos archivos recibieron `if (!document.hidden)` guard en sus `setInterval`:
- `play.tsx` — 3s — fetchSession + fetchWinners
- `profile.tsx` — 5s — fetchReqStatus
- `game-detail.tsx` — 8s×2 — refetchGame + winners load
- `game-detail.tsx` — 30s — checkStatus (solicitud manual)

`AppLayout.tsx` y `admin/index.tsx` ya tenían guards previos.

## Fix 4 — Panel de Sistema mostraba % heap engañoso

**Problema:** `heap_pct` en `/api/admin/system/health` usaba `heapUsed/heapTotal` → mostraba 92% en rojo siendo normal.

**Fix:** Backend usa `v8.getHeapStatistics().heap_size_limit` para calcular `heap_pct`. Frontend muestra "Límite" en vez de "Asignado". Rojo ahora al 70% (real peligro) en vez de 80%.

## Configuración PM2 por plan de VPS

| Plan | node_args | max_memory_restart |
|---|---|---|
| 4 GB RAM | `--max-old-space-size=512` | `500M` |
| 8 GB RAM | `--max-old-space-size=1024` | `900M` |

Archivo en VPS: `/var/www/tubingazo/ecosystem.config.cjs`

**Why:** max-old-space-size es el techo de seguridad del heap V8. Debe ser ~25% de RAM total. max_memory_restart de PM2 es backup por RSS total. Ambos deben escalar juntos al cambiar plan.

## Regla general document.hidden

Todo `setInterval` que haga requests HTTP al servidor DEBE tener:
```js
const id = setInterval(() => {
  if (!document.hidden) { /* request */ }
}, intervalMs);
```
Sin esto, tabs en segundo plano siguen generando tráfico continuo.
