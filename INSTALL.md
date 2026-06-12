# Tu Bingazo — Guía de Instalación en Hostinger / cPanel

## Requisitos del Hosting

Tu plan de hosting debe soportar:
- **Node.js v20 o superior** (Hostinger Business, Premium o VPS)
- **Base de datos PostgreSQL** (recomendado: plan VPS) **O** usar Supabase/Neon gratis (ver opción B)
- **Acceso SSH** al servidor

---

## OPCIÓN A — Hostinger VPS (recomendado, control total)

### Paso 1: Contratar el hosting
- Plan mínimo recomendado: **Hostinger KVM 1** (~$5/mes)
- Sistema operativo: **Ubuntu 22.04**

### Paso 2: Conectarse al servidor por SSH
```bash
ssh root@TU_IP_DEL_SERVIDOR
```

### Paso 3: Instalar dependencias del sistema
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs postgresql postgresql-contrib git
npm install -g pnpm pm2
```

### Paso 4: Crear la base de datos
```bash
sudo -u postgres psql
```
Dentro de PostgreSQL:
```sql
CREATE DATABASE tubingazo;
CREATE USER tubingazo_user WITH PASSWORD 'TU_CONTRASEÑA_SEGURA';
GRANT ALL PRIVILEGES ON DATABASE tubingazo TO tubingazo_user;
\q
```

### Paso 5: Subir los archivos del proyecto
Desde tu computadora, descomprimir el `.zip` y subir la carpeta al servidor:
```bash
scp -r tu-bingazo/ root@TU_IP:/var/www/tubingazo
```
O usar FileZilla/WinSCP para subir los archivos.

### Paso 6: Instalar dependencias del proyecto
```bash
cd /var/www/tubingazo
pnpm install
```

### Paso 7: Configurar variables de entorno
```bash
cp .env.example .env
nano .env
```
Llenar todos los valores (ver sección "Variables de entorno" abajo).

### Paso 8: Construir el proyecto y aplicar base de datos
```bash
pnpm --filter @workspace/db run push
pnpm run build
```

### Paso 9: Iniciar el servidor con PM2 (para que quede corriendo siempre)
```bash
pm2 start "pnpm --filter @workspace/api-server run start" --name tubingazo-api
pm2 start "pnpm --filter @workspace/tu-bingazo run preview" --name tubingazo-web
pm2 save
pm2 startup
```

### Paso 10: Configurar Nginx (proxy para el dominio)
```bash
apt install -y nginx
nano /etc/nginx/sites-available/tubingazo
```
Pegar esta configuración:
```nginx
server {
    listen 80;
    server_name TU_DOMINIO.COM www.TU_DOMINIO.COM;

    location /api {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        proxy_pass http://localhost:24958;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```
Activar:
```bash
ln -s /etc/nginx/sites-available/tubingazo /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### Paso 11: Activar HTTPS (SSL gratuito)
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d TU_DOMINIO.COM -d www.TU_DOMINIO.COM
```

### Paso 12: Crear usuario administrador
```bash
sudo -u postgres psql -d tubingazo
```
```sql
INSERT INTO users (full_name, ci, phone, password_hash, department, status, is_admin, balance)
VALUES (
  'Administrador',
  '1000001',
  '70000000',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- contraseña: password
  'La Paz',
  'active',
  true,
  0
);
\q
```
⚠️ **Cambiar la contraseña inmediatamente** desde el panel de administración después del primer login.

---

## OPCIÓN B — Hostinger Premium/Business + Supabase (base de datos gratuita en la nube)

Use esta opción si tu plan de Hostinger no incluye VPS.

### Paso 1: Crear base de datos gratuita en Supabase
1. Ir a https://supabase.com y crear una cuenta gratuita
2. Crear un nuevo proyecto
3. Copiar la **Connection String** desde: Settings → Database → Connection string → URI
   Ejemplo: `postgresql://postgres:[PASSWORD]@db.xxxx.supabase.co:5432/postgres`

### Paso 2: Habilitar Node.js en Hostinger
1. Entrar al hPanel de Hostinger
2. Ir a **Sitios web → Administrar → Node.js**
3. Seleccionar Node.js versión 20
4. Establecer el directorio raíz del proyecto

### Paso 3: Subir archivos
- Comprimir y subir la carpeta del proyecto via Administrador de archivos de Hostinger o FTP
- Descomprimir en el directorio configurado

### Paso 4: Instalar dependencias desde el terminal SSH de Hostinger
```bash
npm install -g pnpm
pnpm install
```

### Paso 5: Configurar variables de entorno
Crear el archivo `.env` con los datos de Supabase como DATABASE_URL.

### Paso 6: Aplicar base de datos y construir
```bash
pnpm --filter @workspace/db run push
pnpm run build
```

### Paso 7: Configurar el punto de entrada en hPanel
- En la sección Node.js de hPanel, definir el archivo de entrada como:
  `artifacts/api-server/dist/index.js`

---

## Variables de Entorno (archivo .env)

Crear un archivo `.env` en la raíz del proyecto con estos valores:

```env
# Base de datos (reemplazar con tus datos reales)
DATABASE_URL=postgresql://tubingazo_user:TU_CONTRASEÑA@localhost:5432/tubingazo

# Seguridad (generar una cadena aleatoria larga)
SESSION_SECRET=cambia_esto_por_una_cadena_muy_larga_y_segura_de_al_menos_64_caracteres

# PagosYa (obtener desde tu cuenta de PagosYa)
PAGOSYA_PUBLIC_KEY=tu_clave_publica_de_pagosya
PAGOSYA_SECRET_KEY=tu_clave_secreta_de_pagosya
PAGOSYA_BASE_URL=https://api.pagosya.com

# Puerto del servidor API (dejar en 8080 salvo que tu hosting requiera otro)
PORT=8080
```

---

## Credenciales de administrador por defecto

Después de la instalación:
- **CI:** `1000001`
- **Contraseña:** `password`

⚠️ **Cambiar la contraseña inmediatamente desde el panel de administración.**

---

## Soporte

Si tenés problemas durante la instalación, verificar:
1. Que Node.js v20+ esté instalado: `node --version`
2. Que la base de datos esté accesible: `psql $DATABASE_URL -c "SELECT 1"`
3. Que todos los valores del `.env` estén correctamente configurados
4. Los logs del servidor: `pm2 logs tubingazo-api`
