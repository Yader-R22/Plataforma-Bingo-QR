# Tu Bingazo — Guía de Instalación en VPS con Webmin

> **Para quién es esta guía:** Personas sin experiencia en servidores Linux que van a instalar Tu Bingazo en un VPS que ya tiene **Webmin** como gestor de archivos y panel de administración.
>
> **Tiempo estimado:** 60–90 minutos siguiendo los pasos en orden.
>
> **Sistema operativo recomendado:** Ubuntu 22.04 LTS o Ubuntu 24.04 LTS

---

## Índice

1. [Requisitos antes de empezar](#parte-1--requisitos-antes-de-empezar)
2. [Acceder al Terminal de Webmin](#parte-2--acceder-al-terminal-de-webmin)
3. [Memoria SWAP (solo si tenés 1 GB de RAM)](#parte-3--configurar-memoria-swap-solo-servidores-con-1-gb-de-ram)
4. [Instalar Node.js, Git y herramientas](#parte-4--instalar-nodejs-git-y-herramientas-necesarias)
5. [Instalar y configurar PostgreSQL](#parte-5--instalar-y-configurar-postgresql-base-de-datos)
6. [Subir el código del proyecto](#parte-6--subir-el-código-del-proyecto)
7. [Crear el archivo de configuración (.env)](#parte-7--crear-el-archivo-de-configuración-env)
8. [Crear las tablas e inicializar la base de datos](#parte-8--crear-las-tablas-e-inicializar-la-base-de-datos)
9. [Compilar el proyecto para producción](#parte-9--compilar-el-proyecto-para-producción)
10. [Crear el usuario administrador](#parte-10--crear-el-usuario-administrador)
11. [Iniciar el servidor con PM2](#parte-11--iniciar-el-servidor-con-pm2)
12. [Configurar Nginx](#parte-12--configurar-nginx-para-conectar-tu-dominio)
13. [Activar HTTPS](#parte-13--activar-https-candado-de-seguridad-gratis)
14. [Configurar el Firewall](#parte-14--configurar-el-firewall-ufw)
15. [Primer ingreso al panel de administración](#parte-15--primer-ingreso-al-panel-de-administración)
16. [Cómo actualizar el sistema](#parte-16--cómo-actualizar-el-sistema)
17. [Backups de la base de datos](#parte-17--backups-de-la-base-de-datos)
18. [Referencia de variables de entorno](#variables-de-entorno--referencia-completa)
19. [Tablas de la base de datos](#tablas-de-la-base-de-datos)
20. [Comandos de emergencia](#comandos-de-emergencia)
21. [Solución de problemas frecuentes](#solución-de-problemas-frecuentes)
22. [Referencia rápida de accesos](#referencia-rápida-de-accesos)

---

## PARTE 1 — Requisitos antes de empezar

Verificá que tu servidor tenga:

- ✅ **Ubuntu 22.04 o 24.04 LTS** como sistema operativo (o Debian 12)
- ✅ **Webmin** instalado y accesible desde el navegador
- ✅ Mínimo **2 GB de RAM** recomendado (1 GB funciona con SWAP configurado — ver Parte 3)
- ✅ Mínimo **20 GB de espacio en disco**
- ✅ Un **dominio apuntando a la IP del servidor** (ej: `tubingazo.com`)
- ✅ Las **credenciales de Enlazo** (pasarela de pago QR boliviana)

> ⚠️ **Importante:** El dominio debe apuntar a la IP del servidor **antes** de llegar al Paso 13 (HTTPS). Podés verificarlo con: `ping TU_DOMINIO.COM` — debe responder con la IP de tu VPS.

---

## PARTE 2 — Acceder al Terminal de Webmin

Todo el trabajo técnico se hace desde el terminal integrado en Webmin:

1. Abrí tu navegador y entrá a Webmin: `https://TU_IP:10000`
   > ⚠️ Si aparece aviso de "sitio no seguro", hacé clic en **Avanzado → Continuar de todas formas** — es normal con el certificado autofirmado de Webmin.
2. Ingresá con tu usuario y contraseña de administrador del servidor (generalmente `root`)
3. En el menú izquierdo buscá **"Tools"** (Herramientas)
4. Hacé clic en **"Terminal"**
5. Se abre una ventana negra — desde ahí ejecutarás todos los comandos

> 💡 **Tips para el terminal:**
> - Podés pegar comandos con **clic derecho → Pegar** o **Ctrl+Shift+V**
> - Si el terminal de Webmin se cierra, abrí SSH directamente: `ssh root@TU_IP`
> - Para saber dónde estás: `pwd`
> - Para ver archivos en la carpeta actual: `ls -la`

---

## PARTE 3 — Configurar memoria SWAP (solo servidores con 1 GB de RAM)

> Si tu servidor tiene **2 GB o más de RAM**, saltá esta parte y continuá con la Parte 4.

El compilado del proyecto requiere memoria. Con 1 GB de RAM puede fallar. La SWAP es memoria de disco que actúa como RAM extra:

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

# Verificar que quedó activa
free -h
```
> Debe aparecer una fila `Swap: 2.0Gi` ✅

---

## PARTE 4 — Instalar Node.js, Git y herramientas necesarias

Ejecutá estos comandos en el terminal, **uno por uno**, esperando que cada uno termine:

### Paso 4.1: Actualizar el sistema

```bash
apt update && apt upgrade -y
```
> Puede tardar 2–5 minutos. Esperá que termine antes de continuar.

### Paso 4.2: Instalar Node.js 24 (versión requerida por el proyecto)

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs
```

### Paso 4.3: Verificar que Node.js 24 se instaló correctamente

```bash
node --version
```
> Debe mostrar `v24.x.x`. Si muestra otra versión o "command not found", repetí el Paso 4.2.

### Paso 4.4: Instalar Git, pnpm y PM2

```bash
apt install -y git
npm install -g pnpm@latest pm2
```

### Paso 4.5: Verificar todas las instalaciones

```bash
node --version && pnpm --version && pm2 --version && git --version
```
> Cada herramienta debe mostrar un número de versión. Si alguna dice "command not found", repetí el paso correspondiente.

---

## PARTE 5 — Instalar y configurar PostgreSQL (base de datos)

### Paso 5.1: Instalar PostgreSQL

```bash
apt install -y postgresql postgresql-contrib
```

### Paso 5.2: Iniciar el servicio y habilitarlo al arranque

```bash
systemctl start postgresql
systemctl enable postgresql
systemctl status postgresql
```
> La última línea debe mostrar `active (running)` en verde ✅

### Paso 5.3: Crear la base de datos del proyecto

Entrá al administrador de base de datos:
```bash
sudo -u postgres psql
```
> El indicador cambia a `postgres=#` — ahora estás dentro de PostgreSQL.

Ejecutá estos comandos (**reemplazá `TU_CONTRASEÑA_SEGURA` por una contraseña que recuerdes — anótala**):

```sql
CREATE DATABASE tubingazo;
CREATE USER tubingazo_user WITH PASSWORD 'TU_CONTRASEÑA_SEGURA';
GRANT ALL PRIVILEGES ON DATABASE tubingazo TO tubingazo_user;
ALTER DATABASE tubingazo OWNER TO tubingazo_user;
\q
```
> El `\q` es para salir de PostgreSQL y volver al terminal normal.

### Paso 5.4: Probar que la conexión funciona

```bash
psql postgresql://tubingazo_user:TU_CONTRASEÑA_SEGURA@localhost:5432/tubingazo -c "SELECT 'conexión exitosa' AS resultado"
```
> Si muestra `conexión exitosa` todo está bien ✅. Si hay error, verificá la contraseña.

---

## PARTE 6 — Subir el código del proyecto

### Opción A: Clonar desde GitHub (recomendado)

```bash
mkdir -p /var/www
git clone https://github.com/Yader-R22/Plataforma-Bingo-QR.git /var/www/tubingazo
```

### Opción B: Subir archivos comprimidos desde Webmin

1. En Webmin, andá a **"Tools" → "File Manager"**
2. Navegá hasta `/var/www/`
3. Creá la carpeta `tubingazo` si no existe (botón "New Directory")
4. Usá el botón **Upload** para subir el archivo `.zip` del proyecto
5. Hacé clic derecho sobre el `.zip` → **Extract** para descomprimirlo
6. Asegurate de que los archivos queden directamente en `/var/www/tubingazo/` (no en una subcarpeta extra)

### Paso 6.1: Verificar que los archivos quedaron bien

```bash
ls /var/www/tubingazo
```
> Debe mostrar carpetas como `artifacts/`, `lib/`, `scripts/`, y archivos como `package.json`, `pnpm-workspace.yaml`.

### Paso 6.2: Entrar a la carpeta del proyecto

```bash
cd /var/www/tubingazo
```
> ⚠️ **Importante:** Cada vez que abras el terminal, ejecutá este comando antes de cualquier otro relacionado con el proyecto.

### Paso 6.3: Instalar las dependencias del proyecto

```bash
pnpm install
```
> Puede tardar 3–8 minutos. Es normal que descargue cientos de paquetes. Esperá el mensaje `Done` o `packages installed`.

---

## PARTE 7 — Crear el archivo de configuración (.env)

El archivo `.env` contiene las contraseñas y claves privadas del sistema. **Nunca lo compartas ni lo subas a GitHub.**

### Paso 7.1: Generar un SESSION_SECRET seguro

Ejecutá este comando y copiá el resultado — lo necesitarás en el siguiente paso:

```bash
openssl rand -base64 48
```
> Guarda ese texto largo en un lugar seguro (ej: bloc de notas).

### Paso 7.2: Abrir el editor de texto

```bash
nano /var/www/tubingazo/.env
```

### Paso 7.3: Pegar y completar la configuración

Copiá el bloque completo, pegalo en el editor, y **reemplazá todos los valores entre `< >`**:

```env
# ── BASE DE DATOS ──────────────────────────────────────────────
# Reemplazá TU_CONTRASEÑA_SEGURA con la contraseña del Paso 5.3
DATABASE_URL=postgresql://tubingazo_user:TU_CONTRASEÑA_SEGURA@localhost:5432/tubingazo

# ── SEGURIDAD JWT ──────────────────────────────────────────────
# Pegá el resultado del comando openssl del Paso 7.1
SESSION_SECRET=PEGAR_AQUI_EL_RESULTADO_DE_OPENSSL

# ── PASARELA DE PAGO ENLAZO ────────────────────────────────────
# Credenciales de tu cuenta Enlazo Business (pagos QR bolivianos)
PAYMENT_API_KEY=tu_api_key_de_enlazo

# ── SERVIDOR ───────────────────────────────────────────────────
PORT=8080
NODE_ENV=production
```

> 💡 **¿Dónde obtener las credenciales de Enlazo?**
> Registrá tu negocio en [enlazo.com.bo](https://enlazo.com.bo), activá tu cuenta Business, y encontrarás las claves en el panel de desarrollador bajo "API Keys".

### Paso 7.4: Guardar el archivo

1. Presioná **Ctrl + X**
2. Presioná **Y** (confirmar guardar)
3. Presioná **Enter**

### Paso 7.5: Verificar que el archivo se guardó correctamente

```bash
grep -c "=" /var/www/tubingazo/.env
```
> Debe mostrar un número mayor a 4. Si muestra 0, el archivo está vacío — repetí los pasos anteriores.

### Paso 7.6: Proteger el archivo de configuración

```bash
chmod 600 /var/www/tubingazo/.env
```
> Solo el propietario podrá leerlo.

---

## PARTE 8 — Crear las tablas e inicializar la base de datos

### Paso 8.1: Estar en la carpeta correcta

```bash
cd /var/www/tubingazo
```

### Paso 8.2: Cargar las variables de entorno y crear todas las tablas

```bash
export $(grep -v '^#' .env | xargs)
pnpm --filter @workspace/db run push
```
> Crea automáticamente todas las tablas del sistema. Esperá el mensaje `Changes applied` ✅
>
> Si aparece error de conexión, verificá que `DATABASE_URL` en el `.env` tiene la contraseña correcta.

### Paso 8.3: Verificar que las tablas se crearon

```bash
psql $DATABASE_URL -c "\dt"
```
> Debe listar todas las tablas: `users`, `games`, `cards`, `winners`, `withdrawals`, etc.

---

## PARTE 9 — Compilar el proyecto para producción

### Paso 9.1: Compilar el backend (API)

```bash
cd /var/www/tubingazo
pnpm --filter @workspace/api-server run build
```
> Genera el archivo `artifacts/api-server/dist/index.mjs`. No debe haber errores en rojo.

### Paso 9.2: Compilar el frontend (sitio web)

El frontend necesita saber en qué ruta y puerto va a servirse:

```bash
BASE_PATH=/ PORT=8080 pnpm --filter @workspace/tu-bingazo run build
```
> Genera los archivos estáticos en `artifacts/tu-bingazo/dist/`. Tarda 1–3 minutos.

### Paso 9.3: Verificar que los archivos compilados existen

```bash
ls artifacts/api-server/dist/
ls artifacts/tu-bingazo/dist/
```
> El primero debe tener `index.mjs`. El segundo debe tener `index.html` y una carpeta `assets/`.

---

## PARTE 10 — Crear el usuario administrador

### Paso 10.1: Entrar a la base de datos

```bash
sudo -u postgres psql -d tubingazo
```

### Paso 10.2: Crear el administrador con contraseña segura

Copiá y ejecutá este bloque SQL completo. **El hash corresponde a la contraseña `password` — la cambiarás inmediatamente después de entrar.**

```sql
INSERT INTO users (
  full_name, ci, phone, password_hash, department,
  status, is_admin, balance, bonus_balance, admin_credit_balance
) VALUES (
  'Administrador Principal',
  '1000001',
  '70000000',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'La Paz',
  'active',
  true,
  0,
  0,
  0
);
\q
```

> ⚠️ **Contraseña inicial:** `password` — **Cambiarla de inmediato** desde el panel de perfil después del primer ingreso.

### Paso 10.3: Verificar que el usuario se creó

```bash
psql $DATABASE_URL -c "SELECT id, full_name, ci, is_admin, status FROM users;"
```
> Debe aparecer una fila con `is_admin = t` y `status = active`.

---

## PARTE 11 — Iniciar el servidor con PM2

PM2 mantiene el backend siempre activo, incluso después de reinicios del VPS.

### Paso 11.1: Crear el archivo de configuración de PM2

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

### Paso 11.2: Iniciar el backend

```bash
cd /var/www/tubingazo
pm2 start ecosystem.config.cjs
```

### Paso 11.3: Verificar que está activo

```bash
pm2 status
```
> La fila `tubingazo-api` debe mostrar `online` en verde ✅
>
> Si dice `errored`, revisá los logs: `pm2 logs tubingazo-api --lines 30`

### Paso 11.4: Configurar inicio automático al reiniciar el servidor

```bash
pm2 save
pm2 startup
```
> PM2 mostrará un comando que empieza con `sudo env PATH=...` — **copialo y ejecutalo** para completar la configuración de arranque automático.

### Paso 11.5: Probar que el backend responde

```bash
curl -s http://localhost:8080/api/healthz
```
> Debe responder con `{"status":"ok"}` ✅. Si no responde, revisá los logs con `pm2 logs tubingazo-api`.

---

## PARTE 12 — Configurar Nginx (para conectar tu dominio)

Nginx actúa como intermediario entre internet y tus servidores. El frontend se sirve como archivos estáticos (más eficiente que un proceso Node.js separado).

### Paso 12.1: Instalar Nginx

```bash
apt install -y nginx
systemctl enable nginx
```

### Paso 12.2: Eliminar la configuración por defecto

```bash
rm -f /etc/nginx/sites-enabled/default
```

### Paso 12.3: Crear la configuración del sitio

```bash
nano /etc/nginx/sites-available/tubingazo
```

Pegá exactamente esto (**reemplazá `TU_DOMINIO.COM` con tu dominio real en los 3 lugares donde aparece**):

```nginx
server {
    listen 80;
    server_name TU_DOMINIO.COM www.TU_DOMINIO.COM;

    # Seguridad básica
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";

    # Tamaño máximo de archivos subidos (fotos de CI, etc.)
    client_max_body_size 10M;

    # API del backend — redirige a Node.js
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
    }

    # Sitio web (frontend) — archivos estáticos compilados
    location / {
        root /var/www/tubingazo/artifacts/tu-bingazo/dist;
        index index.html;
        try_files $uri $uri/ /index.html;

        # Cache para assets con hash (JS, CSS, imágenes)
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
```

Guardá con **Ctrl + X → Y → Enter**.

### Paso 12.4: Activar y aplicar la configuración

```bash
ln -s /etc/nginx/sites-available/tubingazo /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```
> El comando `nginx -t` debe decir `syntax is ok` y `test is successful`. Si hay error, revisá que copiaste bien el bloque anterior y que reemplazaste el dominio.

### Paso 12.5: Probar el sitio

Abrí `http://TU_DOMINIO.COM` en el navegador — deberías ver Tu Bingazo ✅

---

## PARTE 13 — Activar HTTPS (candado de seguridad, gratis)

> ⚠️ **Solo hacé este paso si el dominio ya apunta correctamente a la IP del servidor.** Para verificarlo:
> ```bash
> dig +short TU_DOMINIO.COM
> ```
> Debe mostrar la IP de tu VPS. Si acabás de cambiar los DNS, esperá hasta 24 horas.

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d TU_DOMINIO.COM -d www.TU_DOMINIO.COM
```

Cuando certbot pregunte:
- Tu email de contacto → escribilo y Enter
- Aceptar términos de servicio → `A` y Enter
- Compartir email con EFF → `N` y Enter

Al terminar, el sitio estará disponible con HTTPS ✅

### Verificar renovación automática del certificado

Los certificados duran 90 días. Certbot renueva automáticamente. Verificá que funciona:

```bash
certbot renew --dry-run
```
> Debe mostrar `Congratulations, all simulated renewals succeeded` ✅

---

## PARTE 14 — Configurar el Firewall (UFW)

El firewall bloquea accesos no autorizados al servidor.

```bash
# Instalar UFW si no está
apt install -y ufw

# Permitir SSH (para no perder acceso al servidor)
ufw allow 22/tcp

# Permitir HTTP y HTTPS (el sitio web)
ufw allow 80/tcp
ufw allow 443/tcp

# Permitir Webmin
ufw allow 10000/tcp

# Activar el firewall
ufw --force enable

# Verificar estado
ufw status
```

> ⚠️ **Importante:** Asegurate de ejecutar `ufw allow 22` ANTES de `ufw enable`, de lo contrario podrías perder acceso SSH al servidor.

Los puertos internos del backend (8080) y frontend (24958 en dev) **NO** se exponen al exterior — Nginx actúa como intermediario.

---

## PARTE 15 — Primer ingreso al panel de administración

1. Abrí `https://TU_DOMINIO.COM` en el navegador
2. Hacé clic en **"Entrar"**
3. **CI:** `1000001` / **Contraseña:** `password`
4. Andá inmediatamente al menú de perfil → **Cambiar contraseña**
5. Elegí una contraseña segura (mínimo 12 caracteres, con números y símbolos)

Para acceder al panel de administración: `https://TU_DOMINIO.COM/admin`

### Configuración inicial recomendada desde el admin

Una vez dentro del panel, hacé estas configuraciones en orden:

1. **Perfil del sitio** → Completá nombre del sitio, logo, colores
2. **Juegos** → Creá tu primer juego de bingo (tipo: diario, precio del cartón, premio)
3. **Usuarios** → Verificá y activá las cuentas de los jugadores que se registren
4. **Gastos operativos** → Registrá tus gastos fijos (hosting, internet, etc.) para que el reporte financiero sea preciso

---

## PARTE 16 — Cómo actualizar el sistema

Cuando haya una nueva versión del código:

```bash
cd /var/www/tubingazo

# 1. Descargar cambios
git pull

# 2. Actualizar dependencias
pnpm install

# 3. Aplicar cambios de base de datos (si los hay)
export $(grep -v '^#' .env | xargs)
pnpm --filter @workspace/db run push

# 4. Recompilar
pnpm --filter @workspace/api-server run build
BASE_PATH=/ PORT=8080 pnpm --filter @workspace/tu-bingazo run build

# 5. Reiniciar el backend
pm2 restart tubingazo-api

# 6. Recargar Nginx (para aplicar cambios del frontend)
systemctl reload nginx
```

> 💡 **Tip:** Creá un script de actualización para hacerlo en un solo comando:
> ```bash
> nano /var/www/tubingazo/update.sh
> ```
> Pegá todos los comandos de arriba, guardá, y hacelo ejecutable: `chmod +x /var/www/tubingazo/update.sh`
> Luego actualizar es tan simple como: `cd /var/www/tubingazo && ./update.sh`

---

## PARTE 17 — Backups de la base de datos

### Backup manual

```bash
# Crear una copia de seguridad con fecha y hora
pg_dump postgresql://tubingazo_user:TU_CONTRASEÑA_SEGURA@localhost:5432/tubingazo \
  > /root/backup-tubingazo-$(date +%Y%m%d-%H%M).sql

# Verificar que el archivo se creó
ls -lh /root/backup-tubingazo-*.sql
```

### Backup automático diario

```bash
# Crear script de backup
cat > /root/backup-tubingazo.sh << 'EOF'
#!/bin/bash
BACKUP_DIR=/root/backups/tubingazo
mkdir -p $BACKUP_DIR
pg_dump postgresql://tubingazo_user:TU_CONTRASEÑA_SEGURA@localhost:5432/tubingazo \
  > $BACKUP_DIR/backup-$(date +%Y%m%d-%H%M).sql
# Eliminar backups de más de 30 días
find $BACKUP_DIR -name "*.sql" -mtime +30 -delete
EOF

chmod +x /root/backup-tubingazo.sh

# Programar backup diario a las 3 AM
(crontab -l 2>/dev/null; echo "0 3 * * * /root/backup-tubingazo.sh") | crontab -
```

### Restaurar un backup

```bash
# En caso de emergencia, para restaurar:
psql postgresql://tubingazo_user:TU_CONTRASEÑA_SEGURA@localhost:5432/tubingazo \
  < /root/backup-tubingazo-FECHA.sql
```

---

## Variables de entorno — referencia completa

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DATABASE_URL` | Cadena de conexión completa a PostgreSQL | `postgresql://user:pass@localhost:5432/tubingazo` |
| `SESSION_SECRET` | Clave secreta para firmar tokens JWT (mínimo 32 caracteres) | Resultado de `openssl rand -base64 48` |
| `PAYMENT_API_KEY` | API Key de Enlazo Business | `enlz_live_xxxx...` |
| `PORT` | Puerto del servidor API backend | `8080` |
| `NODE_ENV` | Entorno de ejecución | `production` |

> 💡 Si en el futuro se agregan más variables, siempre deberán estar tanto en `.env` como en la sección `env` del archivo `ecosystem.config.cjs` de PM2.

---

## Tablas de la base de datos

Se crean automáticamente con `pnpm --filter @workspace/db run push`:

| Tabla | ¿Para qué sirve? |
|-------|-----------------|
| `users` | Jugadores y administradores. Columnas clave: `balance` (saldo real de pagos QR), `bonus_balance` (bonos de referidos), `admin_credit_balance` (crédito inyectado por el admin — no cuenta como ingreso) |
| `games` | Partidas de bingo (diarias, semanales, mensuales) con precio del cartón, premio y estado |
| `cards` | Cartones comprados. `bonus_amount_used` y `admin_credit_amount_used` separan qué parte no cuenta como ingreso real |
| `winners` | Ganadores validados con el monto del premio y comisiones a activadores |
| `withdrawals` | Historial de retiros de saldo. `method='admin_credit'` o `'admin_debit'` identifica ajustes manuales del admin |
| `referral_codes` | Códigos de referido de los activadores |
| `referral_transactions` | Bonos de bienvenida y comisiones generadas por el programa de referidos |
| `operating_expenses` | Gastos operativos fijos (hosting, internet, etc.) configurables desde el admin |
| `game_categories` | Categorías visuales de juegos en la página de inicio |
| `partners` | Socios inversores con su porcentaje de participación en las ganancias |
| `banners` | Imágenes y anuncios promocionales visibles en el sitio |
| `site_settings` | Configuración general del sitio (nombre, logo, colores, etc.) |
| `name_change_requests` | Solicitudes de cambio de nombre/CI de los jugadores |
| `audit_logs` | Registro inmutable de todas las acciones importantes (compras, retiros, ajustes de admin) |
| `feed_items` | Actividad en tiempo real visible a todos los jugadores (ganadores, compras recientes) |

---

## Comandos de emergencia

```bash
# ── PM2 ─────────────────────────────────────────────────────────
# Ver estado de todos los procesos
pm2 status

# Ver logs del backend en tiempo real
pm2 logs tubingazo-api

# Ver las últimas 100 líneas de logs
pm2 logs tubingazo-api --lines 100

# Reiniciar el backend
pm2 restart tubingazo-api

# Detener el backend
pm2 stop tubingazo-api

# Recompilar y reiniciar (después de actualizar el código)
cd /var/www/tubingazo && pnpm --filter @workspace/api-server run build && pm2 restart tubingazo-api

# ── NGINX ────────────────────────────────────────────────────────
# Estado de Nginx
systemctl status nginx

# Verificar configuración
nginx -t

# Recargar configuración (sin downtime)
systemctl reload nginx

# Reiniciar Nginx
systemctl restart nginx

# ── BASE DE DATOS ────────────────────────────────────────────────
# Estado de PostgreSQL
systemctl status postgresql

# Reiniciar PostgreSQL
systemctl restart postgresql

# Conectarse a la base de datos
psql $DATABASE_URL

# Ver todas las tablas
psql $DATABASE_URL -c "\dt"

# Contar usuarios registrados
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users WHERE is_admin=false;"

# ── SISTEMA ──────────────────────────────────────────────────────
# Ver si los puertos están escuchando
ss -tlnp | grep -E "80|443|8080|5432"

# Espacio en disco
df -h

# Uso de memoria RAM y SWAP
free -h

# Uso de CPU y procesos (salir con Q)
htop

# Ver los últimos logs del sistema
journalctl -xe --no-pager | tail -50
```

---

## Solución de problemas frecuentes

### ❌ Error: "Cannot connect to database" al aplicar migraciones

1. Verificar que PostgreSQL está activo: `systemctl status postgresql`
2. La contraseña en `.env` debe ser exactamente igual a la del Paso 5.3
3. Probar conexión directa: `psql $DATABASE_URL -c "SELECT 1"`
4. Si dice "role does not exist": `sudo -u postgres psql -c "CREATE USER tubingazo_user WITH PASSWORD 'TU_CONTRASEÑA';"`

### ❌ El sitio no carga / pantalla en blanco

1. `systemctl status nginx` — verificar que Nginx está activo
2. `pm2 status` — verificar que `tubingazo-api` está `online`
3. `nginx -t` — verificar que la configuración de Nginx no tiene errores
4. Verificar que los archivos compilados existen: `ls /var/www/tubingazo/artifacts/tu-bingazo/dist/index.html`
5. Si falta el `index.html`: repetir el Paso 9.2 para compilar el frontend

### ❌ Error 502 Bad Gateway

El backend no está respondiendo. Pasos:
1. `pm2 status` — ver si `tubingazo-api` está `online` o `errored`
2. Si está `errored`: `pm2 logs tubingazo-api --lines 50` — leer el error
3. Error común: variables de entorno faltantes → revisar el `.env` y el `ecosystem.config.cjs`
4. Reintentar: `pm2 restart tubingazo-api`

### ❌ Error 404 en rutas del frontend (ej: `/admin`, `/wallet`)

La aplicación es un SPA (Single Page App). Verificá que la configuración de Nginx incluye `try_files $uri $uri/ /index.html;` en la sección `location /`.

### ❌ No recibe pagos QR / Error de pagos

1. Verificar que `PAYMENT_API_KEY` en `.env` es correcta y está activa en el panel de Enlazo
2. Verificar que el sitio usa HTTPS (Enlazo requiere HTTPS para webhooks)
3. Revisar logs del backend: `pm2 logs tubingazo-api | grep -i payment`

### ❌ El compilado falla con "out of memory"

El servidor tiene poca RAM. Solución:
1. Configurar SWAP (ver Parte 3)
2. O compilar con memoria limitada: `NODE_OPTIONS=--max-old-space-size=512 pnpm run build`

### ❌ Error después de actualizar el código

Siempre ejecutar en orden completo:
```bash
cd /var/www/tubingazo
pnpm install
export $(grep -v '^#' .env | xargs)
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run build
BASE_PATH=/ PORT=8080 pnpm --filter @workspace/tu-bingazo run build
pm2 restart tubingazo-api
systemctl reload nginx
```

### ❌ PM2 no arranca después de reiniciar el servidor

```bash
# Restaurar la lista de procesos guardados
pm2 resurrect

# Si no funciona, iniciar de nuevo
cd /var/www/tubingazo && pm2 start ecosystem.config.cjs && pm2 save
```

### ❌ Perdí acceso SSH / Webmin no responde

Accedé desde la consola de rescate de tu proveedor de VPS (KVM/VNC console). Desde ahí podés revisar el firewall: `ufw status` y abrir el puerto si está bloqueado.

---

## Referencia rápida de accesos

| Qué | Dónde |
|-----|-------|
| Sitio web para jugadores | `https://TU_DOMINIO.COM` |
| Panel de administración | `https://TU_DOMINIO.COM/admin` |
| Webmin (gestión del servidor) | `https://TU_IP:10000` |
| CI del admin inicial | `1000001` |
| Contraseña inicial del admin | `password` — **cambiarla de inmediato** |
| Puerto del backend API | `8080` (interno, no expuesto) |
| Logs del backend | `pm2 logs tubingazo-api` |
| Archivos compilados del frontend | `/var/www/tubingazo/artifacts/tu-bingazo/dist/` |
| Archivo de configuración | `/var/www/tubingazo/.env` |
| Logs de Nginx | `/var/log/nginx/error.log` |
| Logs de la API | `/var/log/tubingazo-api-error.log` |
