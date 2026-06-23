# Tu Bingazo — Guía de Instalación en VPS

> **Para quién es esta guía:** Personas sin experiencia en servidores Linux que van a instalar Tu Bingazo en un VPS con **Webmin** como panel de administración.
>
> **Tiempo estimado:** 60–90 minutos siguiendo los pasos en orden.
>
> **Sistema operativo recomendado:** Ubuntu 22.04 LTS o Ubuntu 24.04 LTS

---

## Diagrama de arquitectura

```
  Internet (jugadores y administradores)
           │
           ▼
      [ Nginx :80/:443 ]        ← Proxy inverso, HTTPS, compresión
           │
     ┌─────┴──────┐
     │             │
     ▼             ▼
 /api/*          /*
 (proxy)      (estático)
     │             │
     ▼             └─ /var/www/tubingazo/artifacts/tu-bingazo/dist/public/
[ API Node.js :8080 ]            ← Express 5, JWT, lógica de negocio
           │
           ▼
     [ PostgreSQL ]              ← Base de datos (solo acceso local)
```

Los puertos `8080` y `5432` **nunca se exponen a internet** — solo Nginx y la API se comunican internamente con ellos.

---

## Tabla de puertos

| Puerto | Servicio | ¿Público? | Notas |
|--------|----------|-----------|-------|
| `22` | SSH | ✅ Público | Para acceso remoto al servidor |
| `80` | HTTP (Nginx) | ✅ Público | Redirige automáticamente a HTTPS tras instalar Certbot |
| `443` | HTTPS (Nginx) | ✅ Público | Sitio web y API bajo un solo dominio |
| `10000` | Webmin | ✅ Público | Panel de administración del servidor |
| `8080` | API (Node.js) | ❌ Solo interno | Nginx le hace proxy. Nunca abrirlo al exterior |
| `5432` | PostgreSQL | ❌ Solo interno | Solo la API accede a la base de datos |

---

## Índice

1. [Requisitos](#parte-1--requisitos-antes-de-empezar)
2. [Acceder al terminal de Webmin](#parte-2--acceder-al-terminal-de-webmin)
3. [Memoria SWAP](#parte-3--configurar-memoria-swap-solo-servidores-con-1-gb-de-ram)
4. [Instalar Node.js y herramientas](#parte-4--instalar-nodejs-git-y-herramientas-necesarias)
5. [Instalar PostgreSQL](#parte-5--instalar-y-configurar-postgresql-base-de-datos)
6. [Subir el código](#parte-6--subir-el-código-del-proyecto)
7. [Archivo de configuración (.env)](#parte-7--crear-el-archivo-de-configuración-env)
8. [Crear las tablas](#parte-8--crear-las-tablas-e-inicializar-la-base-de-datos)
9. [Compilar para producción](#parte-9--compilar-el-proyecto-para-producción)
10. [Crear el administrador](#parte-10--crear-el-usuario-administrador)
11. [Iniciar con PM2](#parte-11--iniciar-el-servidor-con-pm2)
12. [Configurar Nginx](#parte-12--configurar-nginx)
13. [Activar HTTPS](#parte-13--activar-https-candado-de-seguridad-gratis)
14. [Configurar el Firewall](#parte-14--configurar-el-firewall-ufw)
15. [Primer ingreso al admin](#parte-15--primer-ingreso-al-panel-de-administración)
16. [Cómo actualizar](#parte-16--cómo-actualizar-el-sistema)
17. [Backups](#parte-17--backups-completos-base-de-datos-y-archivos)
18. [Checklist final](#parte-18--checklist-final-de-verificación)
19. [Desinstalación](#parte-19--desinstalar-completamente-la-aplicación)
20. [Variables de entorno](#variables-de-entorno--referencia-completa)
21. [Tablas de la base de datos](#tablas-de-la-base-de-datos)
22. [Comandos de emergencia](#comandos-de-emergencia)
23. [Solución de problemas](#solución-de-problemas-frecuentes)
24. [Referencia rápida](#referencia-rápida-de-accesos)

---

## PARTE 1 — Requisitos antes de empezar

Verificá que tu servidor tenga:

- ✅ **Ubuntu 22.04 o 24.04 LTS** (o Debian 12)
- ✅ **Webmin** instalado y accesible
- ✅ Mínimo **2 GB de RAM** (1 GB funciona con SWAP — ver Parte 3)
- ✅ Mínimo **20 GB de espacio en disco**
- ✅ Un **dominio apuntando a la IP del servidor** (ej: `tubingazo.com`)
- ✅ Credenciales de **Enlazo Business** (pasarela de pago QR boliviana)

> ⚠️ El dominio debe apuntar a la IP del servidor **antes** de instalar HTTPS (Parte 13). Verificá con: `ping TU_DOMINIO.COM`

---

## PARTE 2 — Acceder al Terminal de Webmin

1. Abrí `https://TU_IP:10000` en el navegador
   > Si aparece aviso de "sitio no seguro" → clic en **Avanzado → Continuar** — es normal.
2. Ingresá con usuario `root` y tu contraseña del servidor
3. Menú izquierdo → **"Tools"** → **"Terminal"**
4. Se abre una ventana negra — desde ahí ejecutarás todos los comandos

> 💡 **Tips:**
> - Pegar con **clic derecho → Pegar** o **Ctrl+Shift+V**
> - Si el terminal se cierra: `ssh root@TU_IP`
> - Ver dónde estás: `pwd` · Ver archivos: `ls -la`

---

## PARTE 3 — Configurar memoria SWAP (solo servidores con 1 GB de RAM)

> Si tenés **2 GB o más de RAM**, saltá a la Parte 4.

```bash
# Verificar RAM disponible
free -h

# Crear 2 GB de SWAP
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile

# Hacer la SWAP permanente (sobrevive reinicios)
echo '/swapfile none swap sw 0 0' | tee -a /etc/fstab

# Verificar — debe aparecer "Swap: 2.0Gi"
free -h
```

---

## PARTE 4 — Instalar Node.js, Git y herramientas necesarias

### Paso 4.1: Instalar dependencias base del sistema

Antes de agregar el repositorio de Node.js, instalá las herramientas que Ubuntu mínimo puede no traer:

```bash
apt update
apt install -y curl ca-certificates gnupg git
```

> Estos tres paquetes son necesarios para descargar e instalar Node.js correctamente. Sin `ca-certificates`, la descarga del repositorio de NodeSource puede fallar con errores de SSL.

### Paso 4.2: Instalar Node.js 24

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs
```

### Paso 4.3: Verificar Node.js 24

```bash
node --version
```
> Debe mostrar `v24.x.x`. Si muestra otra versión, repetí el paso anterior.

### Paso 4.4: Instalar pnpm y PM2

```bash
npm install -g pnpm@latest pm2
```

> **¿Por qué `npm install -g` y no Corepack?**
> Corepack es el método oficial del equipo de pnpm, pero en Ubuntu 22/24 con el usuario `root` a veces no agrega el binario al `PATH` global sin pasos extra. `npm install -g pnpm` funciona de forma consistente en todos los entornos de VPS. Si preferís Corepack: `corepack enable && corepack prepare pnpm@latest --activate`.

### Paso 4.5: Verificar todo

```bash
node --version && pnpm --version && pm2 --version && git --version
```
> Cada herramienta debe mostrar un número de versión.

---

## PARTE 5 — Instalar y configurar PostgreSQL (base de datos)

### Paso 5.1: Instalar PostgreSQL

```bash
apt install -y postgresql postgresql-contrib
systemctl start postgresql
systemctl enable postgresql
systemctl status postgresql
```
> Debe mostrar `active (running)` ✅

### Paso 5.2: Crear la base de datos

```bash
sudo -u postgres psql
```
> El indicador cambia a `postgres=#`

```sql
CREATE DATABASE tubingazo;
CREATE USER tubingazo_user WITH PASSWORD 'TU_CONTRASEÑA_SEGURA';
GRANT ALL PRIVILEGES ON DATABASE tubingazo TO tubingazo_user;
ALTER DATABASE tubingazo OWNER TO tubingazo_user;
\q
```

> ⚠️ **Anotá esa contraseña** — la necesitarás en el archivo `.env`.

### Paso 5.3: Verificar la conexión

```bash
psql postgresql://tubingazo_user:TU_CONTRASEÑA_SEGURA@localhost:5432/tubingazo \
  -c "SELECT 'conexión exitosa' AS resultado"
```
> Debe mostrar `conexión exitosa` ✅

---

## PARTE 6 — Subir el código del proyecto

### Opción A: Clonar desde GitHub (recomendado)

```bash
mkdir -p /var/www
git clone https://github.com/Yader-R22/Plataforma-Bingo-QR.git /var/www/tubingazo
```

### Opción B: Subir archivos desde Webmin

1. Webmin → **"Tools" → "File Manager"**
2. Navegá a `/var/www/` → Crear carpeta `tubingazo`
3. **Upload** → subir el `.zip` del proyecto
4. Clic derecho sobre el `.zip` → **Extract**
5. Verificar que los archivos queden en `/var/www/tubingazo/`

### Verificar y entrar al proyecto

```bash
ls /var/www/tubingazo
# Debe mostrar: artifacts/ lib/ scripts/ package.json pnpm-workspace.yaml
cd /var/www/tubingazo
```

### Instalar dependencias

```bash
pnpm install
```
> Puede tardar 3–8 minutos. Esperá el mensaje `Done` o `packages installed`.

---

## PARTE 7 — Crear el archivo de configuración (.env)

### Reglas importantes para el archivo .env

Antes de crear el archivo, leé estas reglas — son la causa más frecuente de errores:

| ✅ Correcto | ❌ Incorrecto | Problema |
|------------|--------------|---------|
| `DATABASE_URL=postgresql://...` | `DATABASE_URL = postgresql://...` | Espacios alrededor del `=` |
| `SESSION_SECRET=abc123XYZ` | `SESSION_SECRET="abc123XYZ"` | Comillas innecesarias |
| `PORT=8080` | `PORT=8080 ` | Espacio al final de la línea |
| Cada variable en su propia línea | Dos variables en la misma línea | Error de lectura |
| `NOMBRE=Juan Pérez` | (sin comillas si hay espacios) | Funciona sin comillas en este sistema |

> 💡 Si una variable contiene caracteres especiales como `+`, `/`, `=` (frecuente en `SESSION_SECRET`), no hace falta envolverla en comillas — el sistema la lee correctamente tal cual.

### Paso 7.1: Generar un SESSION_SECRET seguro

```bash
openssl rand -base64 48
```
> Copiá el resultado completo — lo usarás en el siguiente paso.

### Paso 7.2: Crear el archivo

```bash
nano /var/www/tubingazo/.env
```

### Paso 7.3: Pegar y completar la configuración

```env
# ── BASE DE DATOS ──────────────────────────────────────────────
DATABASE_URL=postgresql://tubingazo_user:TU_CONTRASEÑA_SEGURA@localhost:5432/tubingazo

# ── SEGURIDAD JWT ──────────────────────────────────────────────
SESSION_SECRET=PEGAR_AQUI_EL_RESULTADO_DE_OPENSSL

# ── PASARELA DE PAGO ENLAZO ────────────────────────────────────
PAYMENT_API_KEY=tu_api_key_de_enlazo

# ── SERVIDOR ───────────────────────────────────────────────────
PORT=8080
NODE_ENV=production
```

Guardá: **Ctrl+X → Y → Enter**

### Paso 7.4: Proteger el archivo

```bash
chmod 600 /var/www/tubingazo/.env
```

### Paso 7.5: Verificar contenido

```bash
cat /var/www/tubingazo/.env
```

### Nota: carga segura de variables de entorno

Para cargar el `.env` en el terminal (necesario en los pasos siguientes), usá este método que maneja correctamente caracteres especiales:

```bash
set -a
source /var/www/tubingazo/.env
set +a
```

> **¿Por qué no `export $(grep ... | xargs)`?** Ese método popular falla cuando una variable contiene espacios, saltos de línea o caracteres como `+` y `=`, que son comunes en claves generadas con `openssl`. El método `source` lee el archivo nativo de bash sin esos problemas.

---

## PARTE 8 — Crear las tablas e inicializar la base de datos

```bash
cd /var/www/tubingazo
set -a && source .env && set +a
pnpm --filter @workspace/db run push
```
> Esperá el mensaje `Changes applied` ✅

### Verificar tablas creadas

```bash
psql $DATABASE_URL -c "\dt"
```
> Debe listar: `users`, `games`, `cards`, `winners`, `withdrawals`, y más.

---

## PARTE 9 — Compilar el proyecto para producción

### Compilar el backend (API)

```bash
cd /var/www/tubingazo
pnpm --filter @workspace/api-server run build
```
> Genera `artifacts/api-server/dist/index.mjs`

### Compilar el frontend (sitio web)

```bash
BASE_PATH=/ PORT=8080 pnpm --filter @workspace/tu-bingazo run build
```
> Genera archivos estáticos en `artifacts/tu-bingazo/dist/public/`
>
> `BASE_PATH` y `PORT` son requeridos por la configuración de Vite del proyecto.

### Verificar los archivos compilados

```bash
ls artifacts/api-server/dist/
# Debe mostrar: index.mjs

ls artifacts/tu-bingazo/dist/public/
# Debe mostrar: index.html  assets/
```

---

## PARTE 10 — Crear el usuario administrador

En lugar de usar una contraseña conocida públicamente, el proyecto incluye un script interactivo que pedirá los datos del administrador y generará el hash de la contraseña en el momento:

```bash
cd /var/www/tubingazo
set -a && source .env && set +a
node create-admin.mjs
```

El script te pedirá:
- **Nombre completo** del administrador
- **CI** (cédula de identidad boliviana)
- **Teléfono**
- **Departamento** (lista numerada de los 9 departamentos)
- **Contraseña** (ingresada de forma oculta, se pide dos veces para confirmar)

Al finalizar mostrará un resumen de confirmación ✅

> ⚠️ **Guardá la contraseña que elegiste** — no hay forma de recuperarla si la olvidás (tendría que resetearse desde la base de datos).

### Verificar que el administrador fue creado

```bash
psql $DATABASE_URL -c "SELECT id, full_name, ci, is_admin, status FROM users;"
```
> Debe aparecer el usuario con `is_admin = t` y `status = active`.

---

## PARTE 11 — Iniciar el servidor con PM2

PM2 mantiene el backend activo y lo reinicia automáticamente si falla.

### Crear el archivo de configuración de PM2

```bash
cat > /var/www/tubingazo/ecosystem.config.cjs << 'EOF'
module.exports = {
  apps: [
    {
      name: "tubingazo-api",
      script: "./artifacts/api-server/dist/index.mjs",
      cwd: "/var/www/tubingazo",
      env_file: "/var/www/tubingazo/.env",
      env: {
        NODE_ENV: "production",
        PORT: "8080"
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "400M",
      error_file: "/var/log/tubingazo-api-error.log",
      out_file: "/var/log/tubingazo-api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    }
  ]
};
EOF
```

### Iniciar el backend

```bash
cd /var/www/tubingazo
pm2 start ecosystem.config.cjs
```

### Verificar estado

```bash
pm2 status
```
> La fila `tubingazo-api` debe mostrar `online` en verde ✅
> Si dice `errored`: `pm2 logs tubingazo-api --lines 30`

### Probar que el backend responde

```bash
curl -s http://localhost:8080/api/healthz
```
> Debe responder `{"status":"ok"}` ✅

### Configurar inicio automático al reiniciar el servidor

```bash
pm2 save
pm2 startup
```

> **¿Por qué estos dos pasos son importantes?**
> - `pm2 save` guarda la lista de procesos activos en un archivo en disco.
> - `pm2 startup` genera un servicio del sistema operativo que arranca PM2 automáticamente cuando el servidor se reinicia.
> - Sin estos pasos, la aplicación **no volvería a estar activa** después de un reinicio del VPS — los usuarios verían el sitio caído hasta que un administrador lo iniciara manualmente.
>
> PM2 mostrará un comando largo (empieza con `sudo env PATH=...`). **Copialo y ejecutalo** para completar la configuración.

---

## PARTE 12 — Configurar Nginx

### Instalar Nginx

```bash
apt install -y nginx
systemctl enable nginx
rm -f /etc/nginx/sites-enabled/default
```

### Crear la configuración del sitio

```bash
nano /etc/nginx/sites-available/tubingazo
```

Pegá exactamente esto (**reemplazá `TU_DOMINIO.COM` en los 2 lugares donde aparece**):

```nginx
# ── Compresión gzip ──────────────────────────────────────────────────────
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_types text/plain text/css text/xml application/json application/javascript
           application/rss+xml application/atom+xml image/svg+xml
           application/x-font-ttf font/opentype;

server {
    listen 80;
    server_name TU_DOMINIO.COM www.TU_DOMINIO.COM;

    # ── Cabeceras de seguridad ───────────────────────────────────────────
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    # ── Límites ──────────────────────────────────────────────────────────
    client_max_body_size 10M;

    # ── API del backend ──────────────────────────────────────────────────
    location /api {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
    }

    # ── Sitio web — archivos estáticos ───────────────────────────────────
    location / {
        root /var/www/tubingazo/artifacts/tu-bingazo/dist/public;
        index index.html;

        # SPA: todas las rutas no encontradas sirven index.html
        try_files $uri $uri/ /index.html;

        # Assets con hash (JS, CSS): cache de 1 año, inmutables
        location ~* \.(js|css)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }

        # Imágenes, fuentes: cache de 30 días
        location ~* \.(png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|webp)$ {
            expires 30d;
            add_header Cache-Control "public";
        }
    }
}
```

Guardá: **Ctrl+X → Y → Enter**

### Activar y aplicar

```bash
ln -s /etc/nginx/sites-available/tubingazo /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```
> `nginx -t` debe decir `syntax is ok`. Si hay error, revisá que copiaste bien el bloque y reemplazaste el dominio.

### Probar el sitio

Abrí `http://TU_DOMINIO.COM` — deberías ver Tu Bingazo ✅

---

## PARTE 13 — Activar HTTPS (candado de seguridad, gratis)

> ⚠️ Solo si el dominio ya apunta a la IP del servidor:
> ```bash
> dig +short TU_DOMINIO.COM
> ```
> Debe mostrar la IP de tu VPS.

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d TU_DOMINIO.COM -d www.TU_DOMINIO.COM
```

Cuando pregunte:
- Email → escribilo y Enter
- Aceptar términos → `A` Enter
- Compartir email con EFF → `N` Enter

### Verificar que el certificado está activo

```bash
# Comprobar fecha de vencimiento
openssl s_client -connect TU_DOMINIO.COM:443 -servername TU_DOMINIO.COM \
  </dev/null 2>/dev/null | openssl x509 -noout -dates
```
> Debe mostrar `notAfter=` con una fecha futura.

### Verificar renovación automática

```bash
certbot renew --dry-run
```
> Debe mostrar `All simulated renewals succeeded` ✅

Certbot programa la renovación automáticamente cada 90 días — no necesitás hacer nada más.

---

## PARTE 14 — Configurar el Firewall (UFW)

```bash
apt install -y ufw

# SSH — SIEMPRE primero para no perder acceso
ufw allow 22/tcp

# HTTP y HTTPS — el sitio web
ufw allow 80/tcp
ufw allow 443/tcp

# Webmin
ufw allow 10000/tcp

# Activar
ufw --force enable

# Verificar
ufw status
```

### ¿Por qué los puertos 8080 y 5432 no se abren?

UFW bloquea por defecto todo puerto que no se abra explícitamente. Eso significa que el puerto `8080` (API backend) y `5432` (PostgreSQL) **ya están bloqueados** para cualquier conexión proveniente de internet.

Solo Nginx (que corre en el mismo servidor) puede acceder internamente a `localhost:8080`. Esto es importante porque:
- Evita que usuarios externos accedan directamente a la API sin pasar por Nginx
- Evita intentos de conexión directa a PostgreSQL desde el exterior
- Reduce significativamente la superficie de ataque del servidor

---

## PARTE 15 — Primer ingreso al panel de administración

1. Abrí `https://TU_DOMINIO.COM`
2. Hacé clic en **"Entrar"**
3. Ingresá la **CI** y **contraseña** que elegiste en el Paso 10
4. Verificar que funciona → vas al inicio como administrador

Para acceder al panel admin: `https://TU_DOMINIO.COM/admin`

### Configuración inicial recomendada

En orden desde el panel admin:

1. **Perfil del sitio** → Nombre del sitio, logo, colores
2. **Juegos** → Crear el primer juego (tipo, precio del cartón, premio)
3. **Gastos operativos** → Registrar costos fijos (hosting, etc.) para reportes financieros precisos
4. **Usuarios** → Verificar y activar las cuentas de los primeros jugadores

---

## PARTE 16 — Cómo actualizar el sistema

```bash
cd /var/www/tubingazo

# 1. Descargar cambios del repositorio
git pull

# 2. Actualizar dependencias
pnpm install

# 3. Aplicar cambios de base de datos
set -a && source .env && set +a
pnpm --filter @workspace/db run push

# 4. Recompilar
pnpm --filter @workspace/api-server run build
BASE_PATH=/ PORT=8080 pnpm --filter @workspace/tu-bingazo run build

# 5. Reiniciar el backend y recargar frontend
pm2 restart tubingazo-api
systemctl reload nginx
```

### Script de actualización rápida

```bash
cat > /var/www/tubingazo/update.sh << 'EOF'
#!/bin/bash
set -e
cd /var/www/tubingazo
echo "▶ Descargando cambios..."
git pull
echo "▶ Actualizando dependencias..."
pnpm install
echo "▶ Aplicando cambios de base de datos..."
set -a && source .env && set +a
pnpm --filter @workspace/db run push
echo "▶ Compilando backend..."
pnpm --filter @workspace/api-server run build
echo "▶ Compilando frontend..."
BASE_PATH=/ PORT=8080 pnpm --filter @workspace/tu-bingazo run build
echo "▶ Reiniciando servicios..."
pm2 restart tubingazo-api
systemctl reload nginx
echo "✅ Actualización completada."
EOF
chmod +x /var/www/tubingazo/update.sh
```

Próximas actualizaciones: `cd /var/www/tubingazo && ./update.sh`

---

## PARTE 17 — Backups completos (base de datos y archivos)

Un backup completo del sistema incluye **dos partes**: la base de datos y los archivos que los usuarios subieron (fotos de CI, logos, banners, configuración). Sin ambas partes, la restauración estaría incompleta.

### Backup de la base de datos

```bash
# Backup manual con fecha
pg_dump $DATABASE_URL > /root/backup-db-$(date +%Y%m%d-%H%M).sql

# Verificar tamaño del backup
ls -lh /root/backup-db-*.sql
```

### Backup de archivos del sistema

```bash
# Backup manual completo (DB + archivos críticos)
FECHA=$(date +%Y%m%d-%H%M)
BACKUP=/root/backups/$FECHA
mkdir -p $BACKUP

# Base de datos
pg_dump $DATABASE_URL > $BACKUP/database.sql

# Archivos de configuración
cp /var/www/tubingazo/.env $BACKUP/env.bak

# Imágenes subidas por usuarios (fotos de CI, avatares)
if [ -d /var/www/tubingazo/uploads ]; then
  cp -r /var/www/tubingazo/uploads $BACKUP/uploads
fi

# Certificados SSL (opcional — Certbot los renueva automáticamente)
cp -r /etc/letsencrypt $BACKUP/letsencrypt 2>/dev/null || true

echo "✅ Backup guardado en $BACKUP"
ls -lh $BACKUP
```

### Backup automático diario

```bash
cat > /root/backup-tubingazo.sh << 'BEOF'
#!/bin/bash
set -a
source /var/www/tubingazo/.env
set +a

BACKUP_DIR=/root/backups/tubingazo
mkdir -p $BACKUP_DIR
FECHA=$(date +%Y%m%d-%H%M)

# Base de datos
pg_dump $DATABASE_URL > $BACKUP_DIR/db-$FECHA.sql

# Archivos críticos
tar -czf $BACKUP_DIR/files-$FECHA.tar.gz \
  /var/www/tubingazo/.env \
  /var/www/tubingazo/uploads 2>/dev/null || true

# Limpiar backups de más de 30 días
find $BACKUP_DIR -name "*.sql" -mtime +30 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete
BEOF

chmod +x /root/backup-tubingazo.sh

# Ejecutar todos los días a las 3 AM
(crontab -l 2>/dev/null; echo "0 3 * * * /root/backup-tubingazo.sh") | crontab -
echo "✅ Backup automático configurado para las 3 AM diariamente"
```

### Restaurar un backup completo

```bash
# 1. Restaurar la base de datos
psql $DATABASE_URL < /root/backups/tubingazo/db-FECHA.sql

# 2. Restaurar archivos
tar -xzf /root/backups/tubingazo/files-FECHA.tar.gz -C /

# 3. Reiniciar la aplicación
pm2 restart tubingazo-api
```

---

## PARTE 18 — Checklist final de verificación

Antes de abrir el sistema al público, verificá cada punto:

```bash
# ── Infraestructura ───────────────────────────────────────────────────────
node --version              # Debe mostrar v24.x.x
pnpm --version              # Debe mostrar la versión instalada
pm2 status                  # tubingazo-api debe estar "online"
systemctl status nginx      # Debe mostrar "active (running)"
systemctl status postgresql # Debe mostrar "active (running)"

# ── Conectividad ─────────────────────────────────────────────────────────
curl -s http://localhost:8080/api/healthz
# Esperado: {"status":"ok"}

curl -s -o /dev/null -w "%{http_code}" http://TU_DOMINIO.COM
# Esperado: 200 o 301 (redirección a HTTPS)

curl -s -o /dev/null -w "%{http_code}" https://TU_DOMINIO.COM
# Esperado: 200

# ── Base de datos ────────────────────────────────────────────────────────
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users WHERE is_admin=true;"
# Esperado: 1 (el administrador que creaste)

# ── Certificado SSL ──────────────────────────────────────────────────────
openssl s_client -connect TU_DOMINIO.COM:443 -servername TU_DOMINIO.COM \
  </dev/null 2>/dev/null | openssl x509 -noout -dates
# notAfter debe ser una fecha futura

# ── Firewall ─────────────────────────────────────────────────────────────
ufw status
# Puertos abiertos: 22, 80, 443, 10000
# Puertos 8080 y 5432 NO deben aparecer en la lista
```

### Lista de verificación manual en el navegador

Abrí `https://TU_DOMINIO.COM` y confirmá:

- [ ] El sitio carga con el candado HTTPS ✅
- [ ] La página de inicio muestra los juegos disponibles
- [ ] El formulario de registro funciona
- [ ] El inicio de sesión con el administrador funciona
- [ ] El panel de administración (`/admin`) es accesible
- [ ] Se puede crear un juego de prueba desde el admin
- [ ] El flujo de compra de cartón genera el QR de Enlazo
- [ ] Los números se pueden cantar manualmente desde el admin
- [ ] El reporte financiero (`/admin` → Finanzas) carga correctamente
- [ ] El sistema de retiros es accesible desde la billetera del usuario

---

## PARTE 19 — Desinstalar completamente la aplicación

> ⚠️ Estos pasos son **irreversibles**. Hacé un backup antes si necesitás conservar los datos.

```bash
# 1. Detener y eliminar PM2
pm2 stop tubingazo-api
pm2 delete tubingazo-api
pm2 save

# 2. Eliminar archivos de la aplicación
rm -rf /var/www/tubingazo

# 3. Eliminar configuración de Nginx
rm -f /etc/nginx/sites-enabled/tubingazo
rm -f /etc/nginx/sites-available/tubingazo
nginx -t && systemctl reload nginx

# 4. Eliminar la base de datos y el usuario (si no los necesitás más)
sudo -u postgres psql -c "DROP DATABASE IF EXISTS tubingazo;"
sudo -u postgres psql -c "DROP USER IF EXISTS tubingazo_user;"

# 5. Eliminar certificados SSL (opcional)
certbot delete --cert-name TU_DOMINIO.COM

# 6. Eliminar backups (opcional)
rm -rf /root/backups/tubingazo

# 7. Eliminar logs de PM2
rm -f /var/log/tubingazo-api-*.log

# 8. Desinstalar PostgreSQL (solo si no lo usás para otra cosa)
# apt remove --purge -y postgresql postgresql-contrib
# rm -rf /etc/postgresql /var/lib/postgresql

# 9. Desinstalar Node.js (solo si no lo usás para otra cosa)
# apt remove --purge -y nodejs
# rm -rf /usr/lib/node_modules
```

---

## Variables de entorno — referencia completa

| Variable | Descripción | Requerida |
|----------|-------------|-----------|
| `DATABASE_URL` | Cadena de conexión PostgreSQL completa | ✅ Sí |
| `SESSION_SECRET` | Clave para firmar tokens JWT (mínimo 32 caracteres) | ✅ Sí |
| `PAYMENT_API_KEY` | API Key de Enlazo Business | ✅ Sí |
| `PORT` | Puerto del servidor API (dejar en `8080`) | ✅ Sí |
| `NODE_ENV` | Entorno (`production` en VPS) | ✅ Sí |

---

## Tablas de la base de datos

Creadas automáticamente con `pnpm --filter @workspace/db run push`:

| Tabla | ¿Para qué sirve? |
|-------|-----------------|
| `users` | Jugadores y administradores. Columnas clave: `balance` (pagos QR reales), `bonus_balance` (bonos de referidos), `admin_credit_balance` (crédito del admin — no cuenta como ingreso) |
| `games` | Partidas de bingo con precio del cartón, premio y estado |
| `cards` | Cartones comprados. `bonus_amount_used` y `admin_credit_amount_used` separan los montos que no son ingreso real |
| `winners` | Ganadores validados con monto de premio y comisiones |
| `withdrawals` | Retiros de saldo. `method='admin_credit'/'admin_debit'` identifica ajustes manuales |
| `referral_codes` | Códigos de referido de los activadores |
| `referral_transactions` | Bonos de bienvenida y comisiones del programa de referidos |
| `operating_expenses` | Gastos operativos fijos configurables desde el admin |
| `game_categories` | Categorías de juegos en la página de inicio |
| `partners` | Socios inversores con porcentaje de participación en ganancias |
| `banners` | Imágenes y anuncios promocionales |
| `site_settings` | Configuración general (nombre del sitio, logo, colores) |
| `name_change_requests` | Solicitudes de cambio de nombre de jugadores |
| `ci_change_requests` | Solicitudes de cambio de CI (foto + revisión admin) |
| `audit_logs` | Registro inmutable de todas las acciones importantes |
| `feed_items` | Actividad en tiempo real visible a los jugadores |
| `activator_requests` | Solicitudes para convertirse en activador del sistema |
| `activator_settings` | Configuración del programa de activadores (bonus, comisiones) |

---

## Comandos de emergencia

```bash
# ── PM2 ──────────────────────────────────────────────────────────────────
pm2 status                              # Estado de todos los procesos
pm2 logs tubingazo-api                  # Logs en tiempo real
pm2 logs tubingazo-api --lines 100      # Últimas 100 líneas
pm2 restart tubingazo-api               # Reiniciar el backend
pm2 stop tubingazo-api                  # Detener el backend
pm2 resurrect                           # Restaurar procesos guardados tras reinicio

# ── Nginx ────────────────────────────────────────────────────────────────
systemctl status nginx                  # Estado
nginx -t                                # Verificar configuración
systemctl reload nginx                  # Recargar sin downtime
systemctl restart nginx                 # Reinicio completo

# ── PostgreSQL ───────────────────────────────────────────────────────────
systemctl status postgresql             # Estado
systemctl restart postgresql            # Reiniciar
psql $DATABASE_URL                      # Conectarse
psql $DATABASE_URL -c "\dt"             # Ver todas las tablas
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;" # Contar usuarios

# ── Sistema ──────────────────────────────────────────────────────────────
ss -tlnp | grep -E "80|443|8080|5432"  # Ver puertos escuchando
df -h                                   # Espacio en disco
free -h                                 # RAM y SWAP
htop                                    # CPU y procesos (salir con Q)
journalctl -xe --no-pager | tail -50    # Logs del sistema operativo

# ── Recompilar y reiniciar rápido ─────────────────────────────────────────
cd /var/www/tubingazo && \
  pnpm --filter @workspace/api-server run build && \
  pm2 restart tubingazo-api
```

---

## Solución de problemas frecuentes

### ❌ "Cannot connect to database" al aplicar migraciones

1. `systemctl status postgresql` — verificar que está activo
2. La contraseña en `.env` debe ser exactamente igual a la del Paso 5.2 (sin espacios)
3. `psql $DATABASE_URL -c "SELECT 1"` — probar conexión directa
4. Si dice "role does not exist": repetir el Paso 5.2

### ❌ El sitio no carga / pantalla en blanco

1. `pm2 status` — verificar que `tubingazo-api` está `online`
2. `nginx -t` — verificar configuración de Nginx
3. Verificar que el frontend está compilado: `ls /var/www/tubingazo/artifacts/tu-bingazo/dist/public/index.html`
4. Si falta el `index.html`: repetir el Paso 9 (compilar frontend)
5. Revisar logs de Nginx: `tail -50 /var/log/nginx/error.log`

### ❌ Error 502 Bad Gateway

El backend no está respondiendo:
1. `pm2 status` — ver si está `online` o `errored`
2. `pm2 logs tubingazo-api --lines 50` — leer el error exacto
3. Error frecuente: `.env` mal formateado → revisar reglas de la Parte 7
4. Reintentar: `pm2 restart tubingazo-api`

### ❌ Error 404 en rutas del frontend (`/admin`, `/wallet`, etc.)

La app es un SPA. Verificar que Nginx tiene `try_files $uri $uri/ /index.html;` en `location /`.

### ❌ El script `create-admin.mjs` falla con "Cannot find module"

```bash
cd /var/www/tubingazo
pnpm install
node create-admin.mjs
```

### ❌ No recibe pagos QR / Error de Enlazo

1. Verificar que `PAYMENT_API_KEY` es correcta y activa en el panel de Enlazo
2. El sitio debe usar HTTPS (requerido por Enlazo para webhooks)
3. Revisar logs: `pm2 logs tubingazo-api | grep -i payment`

### ❌ El compilado falla con "JavaScript heap out of memory"

```bash
NODE_OPTIONS=--max-old-space-size=512 pnpm --filter @workspace/api-server run build
NODE_OPTIONS=--max-old-space-size=512 BASE_PATH=/ PORT=8080 pnpm --filter @workspace/tu-bingazo run build
```
O bien configurar SWAP (Parte 3).

### ❌ PM2 no arranca después de reiniciar el servidor

```bash
pm2 resurrect
# Si no funciona:
cd /var/www/tubingazo && pm2 start ecosystem.config.cjs && pm2 save
```

### ❌ Variables de entorno no cargadas correctamente

Si un comando falla porque no encuentra las variables:
```bash
set -a && source /var/www/tubingazo/.env && set +a
```
Verificar que no hay espacios alrededor del `=` en el `.env`.

---

## Referencia rápida de accesos

| Qué | Dónde |
|-----|-------|
| Sitio web | `https://TU_DOMINIO.COM` |
| Panel admin | `https://TU_DOMINIO.COM/admin` |
| Webmin | `https://TU_IP:10000` |
| Puerto API (interno) | `8080` |
| Logs del backend | `pm2 logs tubingazo-api` |
| Frontend compilado | `/var/www/tubingazo/artifacts/tu-bingazo/dist/public/` |
| Archivo de configuración | `/var/www/tubingazo/.env` |
| Logs de errores Nginx | `/var/log/nginx/error.log` |
| Logs de errores API | `/var/log/tubingazo-api-error.log` |
| Script de actualización | `/var/www/tubingazo/update.sh` |
| Script de crear admin | `/var/www/tubingazo/create-admin.mjs` |
| Backups automáticos | `/root/backups/tubingazo/` |
