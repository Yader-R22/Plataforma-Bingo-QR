# Tu Bingazo — Guía de Instalación en VPS con Webmin

> **Para quién es esta guía:** Personas sin experiencia en servidores Linux que van a instalar Tu Bingazo en un VPS que ya tiene **Webmin** como gestor de archivos y panel de administración.
>
> **Tiempo estimado:** 45–60 minutos siguiendo los pasos en orden.

---

## ¿Qué es Webmin?

Webmin es el **panel de control visual** de tu servidor que permite administrar archivos, bases de datos y servicios desde el navegador, sin necesidad de saber comandos complejos. Ya viene instalado en tu servidor.

---

## PARTE 1 — Requisitos antes de empezar

Verificá que tu servidor tenga:

- ✅ **Ubuntu 22.04** como sistema operativo (o similar: Debian 11/12)
- ✅ **Webmin** instalado y accesible desde el navegador
- ✅ Mínimo **1 GB de RAM** y **10 GB de disco**
- ✅ Un **dominio apuntando a la IP del servidor** (ej: `tubingazo.com`)
- ✅ Las **claves de tu pasarela de pago** (las que uses para procesar pagos QR)

---

## PARTE 2 — Acceder al Terminal de Webmin

Todo el trabajo técnico se hace desde el terminal integrado en Webmin:

1. Abrí tu navegador y entrá a Webmin: `https://TU_IP:10000`
   > ⚠️ Si aparece aviso de "sitio no seguro", hacé clic en **Avanzado → Continuar de todas formas** — es normal.
2. Ingresá con tu usuario y contraseña de administrador del servidor
3. En el menú izquierdo buscá **"Tools"** (Herramientas)
4. Hacé clic en **"Terminal"**
5. Se abre una ventana negra — desde ahí ejecutarás todos los comandos

> 💡 **Tip:** Podés pegar comandos con **clic derecho → Pegar** o **Ctrl+Shift+V**

---

## PARTE 3 — Instalar Node.js, Git y herramientas necesarias

Ejecutá estos comandos en el terminal de Webmin, uno por uno:

### Paso 3.1: Actualizar el sistema
```bash
apt update && apt upgrade -y
```
> Puede tardar 1–2 minutos. Esperá que termine antes de continuar.

### Paso 3.2: Instalar Node.js v22
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
```

### Paso 3.3: Verificar que Node.js se instaló
```bash
node --version
```
> Debe mostrar algo como `v22.x.x`. Si dice "command not found", repetí el Paso 3.2.

### Paso 3.4: Instalar Git, pnpm y PM2
```bash
apt install -y git
npm install -g pnpm@latest pm2
```

### Paso 3.5: Verificar las instalaciones
```bash
pnpm --version && pm2 --version && git --version
```
> Cada herramienta debe mostrar un número de versión. Si alguna dice "command not found", repetí el paso anterior.

---

## PARTE 4 — Instalar y configurar PostgreSQL (base de datos)

### Paso 4.1: Instalar PostgreSQL
```bash
apt install -y postgresql postgresql-contrib
```

### Paso 4.2: Iniciar el servicio
```bash
systemctl start postgresql
systemctl enable postgresql
```

### Paso 4.3: Crear la base de datos del proyecto

Entrá al administrador de base de datos:
```bash
sudo -u postgres psql
```
> El indicador cambia a `postgres=#` — ahora estás dentro de PostgreSQL.

Ejecutá estos comandos (**cambiá `TU_CONTRASEÑA` por una contraseña segura que recuerdes**):
```sql
CREATE DATABASE tubingazo;
CREATE USER tubingazo_user WITH PASSWORD 'TU_CONTRASEÑA';
GRANT ALL PRIVILEGES ON DATABASE tubingazo TO tubingazo_user;
\q
```
> El `\q` es para salir. Después volvés al terminal normal.

### Paso 4.4: Probar que la base de datos funciona
```bash
psql postgresql://tubingazo_user:TU_CONTRASEÑA@localhost:5432/tubingazo -c "SELECT 1"
```
> Si responde con `1` todo está bien ✅. Reemplazá `TU_CONTRASEÑA` por la que pusiste arriba.

---

## PARTE 5 — Subir el código del proyecto

### Opción A: Clonar desde GitHub (recomendado si tenés acceso)
```bash
mkdir -p /var/www/tubingazo
git clone https://github.com/Yader-R22/Plataforma-Bingo-QR.git /var/www/tubingazo
```

### Opción B: Subir archivos desde el Gestor de Archivos de Webmin
1. En Webmin, andá a **"Tools" → "File Manager"**
2. Navegá hasta `/var/www/` (creá la carpeta `tubingazo` si no existe)
3. Usá el botón **Upload** para subir el archivo `.zip` del proyecto
4. Hacé clic derecho sobre el `.zip` → **Extract** para descomprimirlo
5. Asegurate de que los archivos queden en `/var/www/tubingazo/`

### Paso 5.1: Entrar a la carpeta del proyecto
```bash
cd /var/www/tubingazo
```
> ⚠️ **Importante:** Cada vez que abras el terminal, escribí este comando antes de cualquier otro.

### Paso 5.2: Instalar las dependencias del proyecto
```bash
pnpm install
```
> Puede tardar 3–5 minutos. Es normal que descargue muchos paquetes.

---

## PARTE 6 — Crear el archivo de configuración (.env)

El archivo `.env` contiene las contraseñas y claves privadas. **Nunca lo compartas.**

### Paso 6.1: Abrir el editor
```bash
nano /var/www/tubingazo/.env
```

### Paso 6.2: Pegar la configuración

Copiá el bloque completo y pegalo en el editor:

```env
# ── BASE DE DATOS ──────────────────────────────────────────────
# Reemplazá TU_CONTRASEÑA con la contraseña que pusiste en el Paso 4.3
DATABASE_URL=postgresql://tubingazo_user:TU_CONTRASEÑA@localhost:5432/tubingazo

# ── SEGURIDAD ──────────────────────────────────────────────────
# Cadena larga y aleatoria — podés generarla con: openssl rand -base64 48
SESSION_SECRET=cambia_esto_por_una_cadena_muy_larga_y_unica_de_al_menos_64_caracteres

# ── PASARELA DE PAGO ───────────────────────────────────────────
# Completá con las claves de la API de pagos que estés usando
PAYMENT_API_KEY=tu_clave_de_la_api_de_pagos
PAYMENT_API_SECRET=tu_clave_secreta_de_la_api_de_pagos
PAYMENT_API_BASE_URL=https://api.tu-pasarela-de-pago.com

# ── PUERTO ─────────────────────────────────────────────────────
PORT=8080
```

> 💡 Para generar un `SESSION_SECRET` seguro, abrí otra pestaña del terminal y ejecutá:
> ```bash
> openssl rand -base64 48
> ```
> Copiá el resultado y pegalo como valor de `SESSION_SECRET`.

### Paso 6.3: Guardar el archivo
1. Presioná **Ctrl + X**
2. Presioná **Y** (sí, guardar)
3. Presioná **Enter**

### Paso 6.4: Verificar el contenido
```bash
cat /var/www/tubingazo/.env
```
> Deberías ver las líneas que acabás de escribir.

---

## PARTE 7 — Crear las tablas e inicializar la base de datos

### Paso 7.1: Estar en la carpeta correcta
```bash
cd /var/www/tubingazo
```

### Paso 7.2: Crear todas las tablas automáticamente
```bash
pnpm --filter @workspace/db run push
```
> Crea automáticamente todas las tablas del sistema. Esperá el mensaje `Changes applied` ✅

### Paso 7.3: Construir el proyecto
```bash
pnpm run build
```
> Prepara el código para producción. Tarda 2–4 minutos. Al terminar no debe haber mensajes de error en rojo.

---

## PARTE 8 — Crear el usuario administrador

### Paso 8.1: Entrar a la base de datos
```bash
sudo -u postgres psql -d tubingazo
```

### Paso 8.2: Crear el administrador
```sql
INSERT INTO users (full_name, ci, phone, password_hash, department, status, is_admin, balance, bonus_balance)
VALUES (
  'Administrador Principal',
  '1000001',
  '70000000',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'La Paz',
  'active',
  true,
  0,
  0
);
\q
```
> Contraseña inicial: `password` — la cambiás en el Paso 12.

---

## PARTE 9 — Iniciar los servidores con PM2

PM2 mantiene el servidor siempre activo, incluso después de reinicios del VPS.

### Paso 9.1: Estar en la carpeta correcta
```bash
cd /var/www/tubingazo
```

### Paso 9.2: Iniciar el backend (API)
```bash
pm2 start "pnpm --filter @workspace/api-server run start" --name tubingazo-api
```

### Paso 9.3: Iniciar el frontend (sitio web)
```bash
pm2 start "pnpm --filter @workspace/tu-bingazo run preview" --name tubingazo-web
```

### Paso 9.4: Verificar que ambos están activos
```bash
pm2 status
```
> Ambas filas deben mostrar `online` en verde ✅
>
> Si alguna dice `errored`, revisá los logs: `pm2 logs tubingazo-api`

### Paso 9.5: Configurar inicio automático al reiniciar el servidor
```bash
pm2 save
pm2 startup
```
> PM2 mostrará un comando largo para copiar y pegar — ejecutalo para completar la configuración.

---

## PARTE 10 — Configurar Nginx (para conectar tu dominio)

### Paso 10.1: Instalar Nginx
```bash
apt install -y nginx
```

### Paso 10.2: Crear la configuración del sitio
```bash
nano /etc/nginx/sites-available/tubingazo
```

Pegá exactamente esto (reemplazá `TU_DOMINIO.COM` con tu dominio real):

```nginx
server {
    listen 80;
    server_name TU_DOMINIO.COM www.TU_DOMINIO.COM;

    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";

    # API del backend
    location /api {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }

    # Sitio web (frontend)
    location / {
        proxy_pass http://localhost:24958;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Guardá con **Ctrl + X → Y → Enter**.

### Paso 10.3: Activar y aplicar la configuración
```bash
ln -s /etc/nginx/sites-available/tubingazo /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```
> El comando `nginx -t` debe decir `syntax is ok`. Si hay error, revisá que copiaste bien el bloque anterior.

### Paso 10.4: Probar el sitio
Abrí `http://TU_DOMINIO.COM` en el navegador — deberías ver Tu Bingazo ✅

---

## PARTE 11 — Activar HTTPS (candado de seguridad, gratis)

> ⚠️ Solo hacé este paso si el dominio **ya apunta a la IP del servidor**. Si acabás de cambiar los DNS, esperá hasta 24 horas.

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d TU_DOMINIO.COM -d www.TU_DOMINIO.COM
```

Cuando certbot pregunte:
- Tu email → escribilo y Enter
- Aceptar términos → `A` y Enter
- Compartir email con EFF → `N` y Enter

Al terminar, el sitio estará disponible con HTTPS ✅

---

## PARTE 12 — Primer ingreso al panel de administración

1. Abrí `https://TU_DOMINIO.COM` en el navegador
2. Hacé clic en **"Entrar"**
3. **CI:** `1000001` / **Contraseña:** `password`
4. Cambiá la contraseña de inmediato desde el menú de perfil

Para acceder al panel de administración: `https://TU_DOMINIO.COM/admin`

---

## PARTE 13 — Cómo actualizar el sistema

Cuando haya una nueva versión del código:

```bash
cd /var/www/tubingazo
git pull
pnpm install
pnpm --filter @workspace/db run push
pnpm run build
pm2 restart all
```

---

## Variables de entorno — referencia completa

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Conexión a PostgreSQL |
| `SESSION_SECRET` | Clave secreta para tokens JWT (mínimo 32 caracteres) |
| `PAYMENT_API_KEY` | Clave pública de tu pasarela de pago |
| `PAYMENT_API_SECRET` | Clave secreta de tu pasarela de pago |
| `PAYMENT_API_BASE_URL` | URL base de la API de pagos |
| `PORT` | Puerto del servidor API (dejar en `8080`) |

---

## Tablas de la base de datos

Se crean automáticamente con `pnpm --filter @workspace/db run push`:

| Tabla | ¿Para qué sirve? |
|-------|-----------------|
| `users` | Jugadores y administradores, saldo real y saldo de bono |
| `games` | Partidas de bingo (diarias, semanales, mensuales) |
| `cards` | Cartones comprados — `bonus_amount_used` separa bonos de ingreso real |
| `winners` | Ganadores validados con premios y comisiones |
| `withdrawals` | Solicitudes de retiro |
| `referral_transactions` | Bonos de bienvenida y comisiones por referidos |
| `operating_expenses` | Gastos operativos configurables desde el admin |
| `game_categories` | Categorías de juegos en la página de inicio |
| `name_change_requests` | Solicitudes de cambio de nombre |
| `audit_logs` | Registro de todas las acciones importantes |
| `feed_items` | Actividad en tiempo real |

---

## Comandos de emergencia

```bash
# Ver logs del servidor en tiempo real
pm2 logs tubingazo-api --lines 50

# Reiniciar todo
pm2 restart all

# Ver estado de los servicios
pm2 status

# Ver si los puertos están escuchando
ss -tlnp | grep -E "8080|24958"

# Estado de la base de datos
systemctl status postgresql

# Reiniciar la base de datos
systemctl restart postgresql

# Espacio en disco
df -h

# Uso de memoria RAM
free -h
```

---

## Solución de problemas frecuentes

### ❌ "Cannot connect to database"
1. `systemctl status postgresql` — verificar que está activo
2. La contraseña en `.env` debe ser igual a la del Paso 4.3
3. Probar conexión: `psql $DATABASE_URL -c "SELECT 1"`

### ❌ El sitio no carga
1. `systemctl status nginx` — verificar Nginx
2. `pm2 status` — verificar que ambos procesos están `online`
3. Verificar que el dominio apunta a la IP del servidor

### ❌ Error 502 Bad Gateway
El backend no está respondiendo. Revisar: `pm2 logs tubingazo-api`

### ❌ Error después de actualizar el código
Correr siempre en orden:
```bash
pnpm install && pnpm --filter @workspace/db run push && pnpm run build && pm2 restart all
```

---

## Referencia rápida de accesos

| Qué | Dónde |
|-----|-------|
| Sitio web | `https://TU_DOMINIO.COM` |
| Panel admin | `https://TU_DOMINIO.COM/admin` |
| Webmin | `https://TU_IP:10000` |
| CI admin inicial | `1000001` |
| Contraseña inicial | `password` — **cambiarla de inmediato** |
| Puerto API | `8080` |
| Puerto frontend | `24958` |
