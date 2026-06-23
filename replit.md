# Tu Bingazo

Plataforma boliviana de bingo en vivo — los jugadores compran cartones con pagos QR (Enlazo), marcan números durante el sorteo en vivo, reclaman premios y retiran a su billetera digital.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server (puerto 8080, ruta `/api`)
- `pnpm --filter @workspace/tu-bingazo run dev` — Frontend React/Vite (puerto 24958, ruta `/`)
- `pnpm run typecheck` — verificación de tipos en todos los paquetes
- `pnpm run build` — typecheck + build
- `pnpm --filter @workspace/api-spec run codegen` — regenerar hooks y schemas Zod desde OpenAPI
- `pnpm --filter @workspace/db run push` — aplicar cambios de schema a la DB (solo dev)
- Variables env requeridas: `DATABASE_URL`, `SESSION_SECRET`, `PAYMENT_API_KEY`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + TailwindCSS v4 + shadcn/ui + Wouter (routing) + Zustand (estado) + TanStack Query
- API: Express 5 + pino logging
- DB: PostgreSQL + Drizzle ORM
- Auth: JWT (via `SESSION_SECRET`), bcryptjs, almacenado en localStorage como `token`
- Pagos: Enlazo API (generación QR + verificación de pago vía Supabase Functions)
- Validación: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (desde OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — contrato OpenAPI (fuente de verdad)
- `lib/api-zod/src/generated/api.ts` — schemas Zod generados
- `lib/api-client-react/src/generated/api.ts` — hooks React Query generados
- `lib/db/src/schema/` — tablas Drizzle: users, games, cards, winners, withdrawals, name_change_requests, audit_logs, feed_items
- `artifacts/api-server/src/routes/` — rutas Express: auth, games, cards, payments, wallet, profile, feed, admin
- `artifacts/api-server/src/middlewares/auth.ts` — middleware JWT + `requireAuth` + `requireAdmin`
- `artifacts/tu-bingazo/src/pages/` — páginas: home, login, register, games, game-detail, play, payment, my-cards, wallet, profile, admin/
- `artifacts/tu-bingazo/src/hooks/useAuth.ts` — store Zustand para auth (persist en localStorage)
- `artifacts/tu-bingazo/src/components/AppLayout.tsx` — layout con navbar top + bottom nav

## Architecture decisions

- **Contrato API primero (OpenAPI → Orval)**: todos los endpoints se definen en YAML, se generan hooks y schemas automáticamente; nunca se escriben a mano.
- **JWT sin sesión server-side**: token 30 días en localStorage, middleware re-lee usuario de DB en cada request para detectar cambios de estado.
- **Cartón bingo**: matriz 5×5, columnas B(1-15)/I(16-30)/N(31-45)/G(46-60)/O(61-75), casilla central [2][2]=0 (espacio libre).
- **Validación de bingo en servidor**: el reclamo de bingo es verificado en el backend contra los números cantados (`calledNumbers`), nunca solo en el cliente.
- **Pagos async via polling**: el frontend consulta `GET /api/payments/:checkoutId/status` cada pocos segundos; cuando Enlazo confirma el pago, el servidor activa los cartones automáticamente.
- **Retiros manuales**: el admin marca manualmente los retiros como pagados; el sistema descuenta el saldo del usuario en ese momento.

## Product

- **Jugadores**: registrarse con CI boliviano, comprar cartones de bingo con QR (Enlazo), jugar en vivo marcando números con auto-polling cada 3s, reclamar BINGO, ver su billetera y retirar saldo.
- **Admin**: crear y gestionar juegos (diarios/semanales/mensuales), verificar identidades de usuarios, cantar números manualmente, validar ganadores, procesar retiros, ver logs de auditoría.

## User preferences

- Idioma: español boliviano en toda la UI
- Departamentos de Bolivia: Beni, Chuquisaca, Cochabamba, La Paz, Oruro, Pando, Potosí, Santa Cruz, Tarija

## Gotchas

- El usuario admin de prueba: CI `1000001`, password `admin123` — se activó manualmente vía SQL (`is_admin=true, status='active'`)
- Los juegos con `status='upcoming'` muestran formulario de compra; los `active` muestran botón "Jugar ahora"; los `finished` solo información.
- Las rutas GET `/api/games` y `/api/games/:id` son **públicas** (sin auth requerida) — el resto de rutas requiere token.
- El frontend hace polling cada 3s a `/api/games/:id/session` durante el juego activo para recibir números cantados.

## Pointers

- Ver skill `pnpm-workspace` para estructura de workspace, TypeScript, y detalles de paquetes.
