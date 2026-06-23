# Tu Bingazo — Guía de Instalación Paso a Paso con Webmin

> **Para quién es esta guía:** Personas sin experiencia en servidores Linux que van a instalar Tu Bingazo en un VPS usando la interfaz visual **Webmin**.
>
> **Tiempo estimado:** 45–60 minutos si seguís los pasos en orden.

---

## ¿Qué es Webmin?

Webmin es un **panel de control visual** para administrar tu servidor Linux desde el navegador, sin necesidad de saber comandos complejos. Muchos proveedores de VPS (como Hostinger, Contabo, DigitalOcean) te permiten instalarlo con un clic.

---

## PARTE 1 — Requisitos antes de empezar

Necesitás tener:

- ✅ Un **VPS con Ubuntu 22.04** (mínimo 1GB RAM, 1 CPU — plan ~$5/mes)
- ✅ **Webmin instalado** en el servidor (ver sección A si no lo tenés)
- ✅ Un **dominio apuntando a la IP del servidor** (ej: `tubingazo.com`)
- ✅ Las **claves de PagosYa** (pública y secreta) de tu cuenta

---

## SECCIÓN A — Instalar Webmin (si todavía no lo tenés)

> Si ya tenés Webmin andando, saltá directo a la **PARTE 2**.

### Paso A1: Conectarse al servidor por primera vez

1. Abrí **PuTTY** (Windows) o la **Terminal** (Mac/Linux)
2. Escribí este comando cambiando `TU_IP` por la IP de tu servidor:
   ```
   ssh root@TU_IP
   ```
3. Te va a pedir la contraseña que te dio el proveedor de hosting — escribila y presioná Enter
   > ⚠️ Cuando escribís la contraseña no se ven los caracteres, es normal.

### Paso A2: Instalar Webmin

Copiá y pegá estos comandos uno por uno, presionando Enter después de cada uno:

```bash
apt update && apt upgrade -y
```
```bash
curl -fsSL https://download.webmin.com/jcameron-key.asc | gpg --dearmor -o /usr/share/keyrings/webmin.gpg
echo "deb [signed-by=/usr/share/keyrings/webmin.gpg] https://download.webmin.com/download/repository sarge contrib" > /etc/apt/sources.list.d/webmin.list
apt update
apt install -y webmin
```

### Paso A3: Acceder a Webmin

1. Abrí tu navegador
2. Escribí: `https://TU_IP:10000`
   > ⚠️ Va a aparecer un aviso de "sitio no seguro" — hacé clic en **Avanzado → Continuar de todas formas** (es normal en la primera visita)
3. Usuario: `root`
4. Contraseña: la misma que usaste para conectarte por SSH

---

## PARTE 2 — Abrir el Terminal de Webmin

Todo el trabajo técnico se hace desde el terminal. En Webmin es muy fácil abrirlo:

1. En el menú izquierdo de Webmin, buscá **"Tools"** (Herramientas)
2. Hacé clic en **"Terminal"**
3. Se abre una ventana negra — ahí escribirás todos los comandos que siguen

> 💡 **Tip:** Podés copiar cualquier comando de esta guía y pegarlo en el terminal con **clic derecho → Pegar** o **Ctrl+Shift+V**

---

## PARTE 3 — Instalar Node.js, Git y herramientas necesarias

En el terminal de Webmin, ejecutá estos comandos en orden:

### Paso 3.1: Actualizar el sistema
```bash
apt update && apt upgrade -y
```
> Puede tardar 1–2 minutos. Esperá que termine.

### Paso 3.2: Instalar Node.js v22
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
```

### Paso 3.3: Verificar que Node.js se instaló bien
```bash
node --version
```
> Debería mostrar algo como `v22.x.x`. Si no aparece, repetí el paso 3.2.

### Paso 3.4: Instalar Git, pnpm y PM2
```bash
apt install -y git
npm install -g pnpm@latest pm2
```

### Paso 3.5: Verificar instalaciones
```bash
pnpm --version
pm2 --version
git --version
```
> Cada comando debe mostrar un número de versión. Si alguno dice "command not found", repetí el paso anterior.

---

## PARTE 4 — Instalar y configurar PostgreSQL (base de datos)

### Paso 4.1: Instalar PostgreSQL
```bash
apt install -y postgresql postgresql-contrib
```

### Paso 4.2: Iniciar el servicio de base de datos
```bash
systemctl start postgresql
systemctl enable postgresql
```

### Paso 4.3: Crear la base de datos del proyecto

Primero entrá al administrador de PostgreSQL:
```bash
sudo -u postgres psql
```
> El indicador cambia a `postgres=#` — ahora estás dentro de PostgreSQL.

Copiá y pegá **exactamente** estos comandos (cambiá `UNA_CONTRASEÑA_SEGURA` por una contraseña real que recuerdes):
```sql
CREATE DATABASE tubingazo;
CREATE USER tubingazo_user WITH PASSWORD 'UNA_CONTRASEÑA_SEGURA';
GRANT ALL PRIVILEGES ON DATABASE tubingazo TO tubingazo_user;
\q
```
> El `\q` es para salir de PostgreSQL. Después de ejecutarlo volvés al terminal normal.

### Paso 4.4: Probar que la base de datos funciona

Reemplazá `UNA_CONTRASEÑA_SEGURA` con la contraseña que pusiste antes:
```bash
psql postgresql://tubingazo_user:UNA_CONTRASEÑA_SEGURA@localhost:5432/tubingazo -c "SELECT 1"
```
> Si responde `1` significa que todo está bien ✅

---

## PARTE 5 — Descargar el código del proyecto

### Paso 5.1: Crear la carpeta donde va a vivir el proyecto
```bash
mkdir -p /var/www/tubingazo
```

### Paso 5.2: Descargar el código desde GitHub
```bash
git clone https://github.com/Yader-R22/Plataforma-Bingo-QR.git /var/www/tubingazo
```
> Esto descarga todos los archivos del proyecto al servidor. Puede tardar 1–2 minutos.

### Paso 5.3: Entrar a la carpeta del proyecto
```bash
cd /var/www/tubingazo
```
> A partir de acá, **todos los comandos se ejecutan estando en esta carpeta**. Si cerrás el terminal y volvés a abrirlo, acordate de escribir `cd /var/www/tubingazo` antes de cualquier otro comando.

### Paso 5.4: Instalar las dependencias del proyecto
```bash
pnpm install
```
> Esto puede tardar 2–5 minutos. Es normal que descargue muchos paquetes.

---

## PARTE 6 — Crear el archivo de configuración (.env)

El archivo `.env` contiene las contraseñas y configuraciones privadas del sistema. **Nunca lo compartas con nadie.**

### Paso 6.1: Crear el archivo

En el terminal:
```bash
nano /var/www/tubingazo/.env
```
> Se abre un editor de texto en el terminal.

### Paso 6.2: Pegar la configuración

Copiá el siguiente bloque **completo** y pegalo en el editor (clic derecho en el terminal):

```env
# ── BASE DE DATOS ──────────────────────────────────────────────
# Reemplazá UNA_CONTRASEÑA_SEGURA con la contraseña que usaste en el Paso 4.3
DATABASE_URL=postgresql://tubingazo_user:UNA_CONTRASEÑA_SEGURA@localhost:5432/tubingazo

# ── SEGURIDAD ──────────────────────────────────────────────────
# Copiá y pegá exactamente esta línea — genera una clave aleatoria segura
SESSION_SECRET=mi_clave_super_secreta_de_bingo_2025_cambiar_por_algo_muy_largo_y_unico

# ── PAGOSYA ────────────────────────────────────────────────────
# Obtené estas claves desde tu cuenta de PagosYa Bolivia
PAGOSYA_PUBLIC_KEY=tu_clave_publica_de_pagosya
PAGOSYA_SECRET_KEY=tu_clave_secreta_de_pagosya
PAGOSYA_BASE_URL=https://api.pagosya.com

# ── PUERTO ─────────────────────────────────────────────────────
PORT=8080
```

### Paso 6.3: Guardar el archivo

1. Presioná **Ctrl + X** (para salir)
2. Te pregunta si querés guardar — presioná **Y** (yes)
3. Presioná **Enter** para confirmar el nombre del archivo

### Paso 6.4: Verificar que el archivo se creó bien
```bash
cat /var/www/tubingazo/.env
```
> Deberías ver el contenido que acabás de escribir.

> ⚠️ **Importante:** El valor `SESSION_SECRET` debe ser una cadena larga y única. Podés generar una escribiendo este comando y copiando el resultado:
> ```bash
> openssl rand -base64 48
> ```

---

## PARTE 7 — Crear las tablas en la base de datos y construir el proyecto

### Paso 7.1: Asegurarte de estar en la carpeta correcta
```bash
cd /var/www/tubingazo
```

### Paso 7.2: Crear todas las tablas automáticamente
```bash
pnpm --filter @workspace/db run push
```
> Esto crea **todas las tablas de la base de datos** automáticamente:
> usuarios, juegos, cartones, ganadores, retiros, bonos, comisiones, auditoría, etc.
> Esperá que aparezca el mensaje `Changes applied` ✅

### Paso 7.3: Construir el proyecto
```bash
pnpm run build
```
> Esto prepara el código para producción. Puede tardar 2–4 minutos.
> Al finalizar debe aparecer algo como `Build complete` sin errores en rojo.

---

## PARTE 8 — Crear el usuario administrador

### Paso 8.1: Entrar a la base de datos
```bash
sudo -u postgres psql -d tubingazo
```

### Paso 8.2: Insertar el usuario administrador

Copiá y pegá este bloque **exactamente como está**:
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
> La contraseña inicial es `password` (en inglés). Vas a cambiarla en el Paso 11.

---

## PARTE 9 — Iniciar los servidores con PM2

PM2 es un programa que mantiene el servidor andando siempre, incluso si se reinicia el VPS.

### Paso 9.1: Asegurarte de estar en la carpeta correcta
```bash
cd /var/www/tubingazo
```

### Paso 9.2: Iniciar el servidor de la API (backend)
```bash
pm2 start "pnpm --filter @workspace/api-server run start" --name tubingazo-api
```

### Paso 9.3: Iniciar el servidor del sitio web (frontend)
```bash
pm2 start "pnpm --filter @workspace/tu-bingazo run preview" --name tubingazo-web
```

### Paso 9.4: Verificar que ambos están corriendo
```bash
pm2 status
```
> Debería mostrar dos filas con estado `online` en verde ✅
>
> Si alguno dice `errored` en rojo, revisá los logs con: `pm2 logs tubingazo-api`

### Paso 9.5: Guardar la configuración de PM2 para que arranque solo
```bash
pm2 save
pm2 startup
```
> PM2 te va a mostrar un comando largo para copiar y pegar — hacelo.  
> Eso asegura que el servidor arranque solo si el VPS se reinicia.

---

## PARTE 10 — Configurar Nginx (para acceder con tu dominio)

Nginx es el programa que conecta tu dominio con el servidor del proyecto.

### Paso 10.1: Instalar Nginx
```bash
apt install -y nginx
```

### Paso 10.2: Crear la configuración del sitio

```bash
nano /etc/nginx/sites-available/tubingazo
```

Pegá **exactamente** este contenido (reemplazá `TU_DOMINIO.COM` con tu dominio real, ej: `tubingazo.com`):

```nginx
server {
    listen 80;
    server_name TU_DOMINIO.COM www.TU_DOMINIO.COM;

    # Seguridad básica
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";

    # API del backend (puerto 8080)
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

    # Sitio web del frontend (puerto 24958)
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

### Paso 10.3: Activar la configuración
```bash
ln -s /etc/nginx/sites-available/tubingazo /etc/nginx/sites-enabled/
```

### Paso 10.4: Verificar que la configuración está bien escrita
```bash
nginx -t
```
> Debe decir `syntax is ok` y `test is successful`. Si hay errores, revisá que copiaste bien el bloque del paso anterior.

### Paso 10.5: Aplicar la configuración
```bash
systemctl reload nginx
```

### Paso 10.6: Probar que el sitio carga

Abrí tu navegador y escribí `http://TU_DOMINIO.COM`. Deberías ver el inicio de Tu Bingazo ✅

---

## PARTE 11 — Activar HTTPS (candado de seguridad, gratis)

> ⚠️ Este paso solo funciona si el dominio ya apunta a la IP del servidor. Si acabás de cambiar los DNS, esperá hasta 24 horas antes de hacer este paso.

### Paso 11.1: Instalar Certbot
```bash
apt install -y certbot python3-certbot-nginx
```

### Paso 11.2: Obtener el certificado SSL gratuito

Reemplazá `TU_DOMINIO.COM` con tu dominio:
```bash
certbot --nginx -d TU_DOMINIO.COM -d www.TU_DOMINIO.COM
```

Te va a preguntar:
- Tu email — escribilo y presioná Enter
- Aceptar términos — escribí `A` y Enter
- Si querés compartir tu email con EFF — escribí `N` y Enter

Al finalizar, el sitio va a estar disponible con HTTPS (candado verde) ✅

### Paso 11.3: Renovación automática (para que no venza nunca)
```bash
certbot renew --dry-run
```
> Si no da error, la renovación automática está configurada.

---

## PARTE 12 — Primer ingreso al panel de administración

1. Abrí `https://TU_DOMINIO.COM` en el navegador
2. Hacé clic en **"Entrar"** o **"Iniciar Sesión"**
3. Ingresá:
   - **CI:** `1000001`
   - **Contraseña:** `password`
4. Una vez adentro, **cambiá la contraseña inmediatamente:**
   - Andá al menú de perfil
   - Buscá la opción "Cambiar contraseña"
   - Poné una contraseña segura que solo vos conozcas

---

## PARTE 13 — Cómo actualizar el sistema cuando haya cambios

Cuando descargues una nueva versión del código, seguí estos pasos:

```bash
# 1. Entrar a la carpeta del proyecto
cd /var/www/tubingazo

# 2. Descargar los cambios nuevos
git pull

# 3. Instalar dependencias nuevas (si las hay)
pnpm install

# 4. Actualizar la base de datos (por si hay columnas nuevas)
pnpm --filter @workspace/db run push

# 5. Reconstruir el proyecto
pnpm run build

# 6. Reiniciar los servidores
pm2 restart all
```

---

## Variables de entorno — referencia completa

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DATABASE_URL` | Dirección de la base de datos | `postgresql://tubingazo_user:PASS@localhost:5432/tubingazo` |
| `SESSION_SECRET` | Clave secreta para los tokens JWT (mín. 32 caracteres) | Cadena aleatoria larga |
| `PAGOSYA_PUBLIC_KEY` | Clave pública de tu cuenta PagosYa | `pk_live_xxxx` |
| `PAGOSYA_SECRET_KEY` | Clave secreta de tu cuenta PagosYa | `sk_live_xxxx` |
| `PAGOSYA_BASE_URL` | URL de la API de PagosYa | `https://api.pagosya.com` |
| `PORT` | Puerto del servidor API | `8080` |

---

## Tablas de la base de datos

Se crean **automáticamente** con `pnpm --filter @workspace/db run push`:

| Tabla | ¿Para qué sirve? |
|-------|-----------------|
| `users` | Jugadores y administradores con su saldo y saldo de bono |
| `games` | Partidas de bingo (diarias, semanales, mensuales) |
| `cards` | Cartones comprados — incluye `bonus_amount_used` para excluir bonos de los ingresos |
| `winners` | Ganadores validados con sus premios y comisiones |
| `withdrawals` | Solicitudes de retiro de saldo |
| `referral_transactions` | Bonos de bienvenida y comisiones por referidos |
| `operating_expenses` | Gastos operativos del negocio (configurables desde el admin) |
| `game_categories` | Categorías de juegos visibles en la página de inicio |
| `name_change_requests` | Solicitudes de cambio de nombre a verificar |
| `audit_logs` | Registro de todas las acciones importantes del sistema |
| `feed_items` | Feed de actividad en tiempo real |

---

## Comandos de emergencia

```bash
# Ver qué está pasando en el servidor ahora mismo
pm2 logs tubingazo-api --lines 50

# El servidor no responde — reiniciarlo
pm2 restart all

# Ver si los puertos están escuchando
ss -tlnp | grep -E "8080|24958"

# Ver el estado de la base de datos
systemctl status postgresql

# Reiniciar la base de datos si no responde
systemctl restart postgresql

# Ver el espacio disponible en disco
df -h

# Ver el uso de memoria
free -h
```

---

## Solución de problemas comunes

### ❌ "Cannot connect to database"
1. Verificá que PostgreSQL esté corriendo: `systemctl status postgresql`
2. Verificá que la contraseña en `.env` sea la misma que pusiste en el Paso 4.3
3. Probá la conexión manualmente: `psql $DATABASE_URL -c "SELECT 1"`

### ❌ El sitio no carga en el navegador
1. Verificá que Nginx esté corriendo: `systemctl status nginx`
2. Verificá que PM2 esté corriendo: `pm2 status`
3. Revisá que el dominio apunte a la IP del servidor

### ❌ "pm2: command not found"
```bash
npm install -g pm2
```

### ❌ La API responde pero el frontend no carga
1. Revisá que el proceso `tubingazo-web` esté `online` en `pm2 status`
2. Reinicialo: `pm2 restart tubingazo-web`

### ❌ Error después de actualizar el código
Siempre corré estos pasos en orden después de un `git pull`:
```bash
pnpm install
pnpm --filter @workspace/db run push
pnpm run build
pm2 restart all
```

---

## Datos importantes de acceso

| Dato | Valor |
|------|-------|
| Panel de administración | `https://TU_DOMINIO.COM/admin` |
| CI del admin inicial | `1000001` |
| Contraseña inicial | `password` (¡cambiala ya!) |
| Webmin | `https://TU_IP:10000` |
| Puerto API | `8080` |
| Puerto frontend | `24958` |
