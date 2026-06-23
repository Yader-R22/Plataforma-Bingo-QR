# Tu Bingazo — Guía de Instalación en Hostinger / VPS

> Plataforma boliviana de bingo en vivo con pagos QR (PagosYa), panel de administración completo, billetera digital, sistema de referidos y reportes financieros.

---

## Requisitos del Hosting

Tu plan de hosting debe soportar:
- **Node.js v24 o superior** (Hostinger VPS recomendado)
- **PostgreSQL 14+** (VPS local) **O** Supabase/Neon gratis (ver Opción B)
- **Acceso SSH** al servidor
- **pnpm v9+** como gestor de paquetes

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
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs postgresql postgresql-contrib git
npm install -g pnpm@latest pm2
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
Desde tu computadora, clonar el repositorio o subir el `.zip`:
```bash
# Con Git (recomendado)
git clone https://github.com/Yader-R22/Plataforma-Bingo-QR.git /var/www/tubingazo

# O bien, subir el zip por SCP
scp -r tu-bingazo/ root@TU_IP:/var/www/tubingazo
```

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
Llenar todos los valores (ver sección **Variables de entorno** más abajo).

### Paso 8: Construir el proyecto y aplicar la base de datos
```bash
pnpm --filter @workspace/db run push
pnpm run build
```

> ⚠️ El comando `push` crea **todas las tablas automáticamente**, incluyendo las nuevas columnas del sistema de bonos y las tablas de finanzas.

### Paso 9: Iniciar el servidor con PM2
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
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    location / {
        proxy_pass http://localhost:24958;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
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
INSERT INTO users (full_name, ci, phone, password_hash, department, status, is_admin, balance, bonus_balance)
VALUES (
  'Administrador',
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
> Contraseña inicial: `password`  
> ⚠️ **Cambiar la contraseña inmediatamente** desde el panel de administración.

---

## OPCIÓN B — Hostinger Premium/Business + Supabase (base de datos gratuita en la nube)

Usar esta opción si el plan de Hostinger no incluye VPS.

### Paso 1: Crear base de datos gratuita en Supabase
1. Ir a https://supabase.com y crear una cuenta gratuita
2. Crear un nuevo proyecto
3. Copiar la **Connection String** desde: Settings → Database → Connection string → URI  
   Ejemplo: `postgresql://postgres:[PASSWORD]@db.xxxx.supabase.co:5432/postgres`

### Paso 2: Habilitar Node.js en Hostinger
1. Entrar al hPanel de Hostinger
2. Ir a **Sitios web → Administrar → Node.js**
3. Seleccionar Node.js versión 22 o 24
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
Crear el archivo `.env` con los datos de Supabase como `DATABASE_URL`.

### Paso 6: Aplicar base de datos y construir
```bash
pnpm --filter @workspace/db run push
pnpm run build
```

### Paso 7: Configurar el punto de entrada en hPanel
- En la sección Node.js de hPanel, definir el archivo de entrada como:  
  `artifacts/api-server/dist/index.js`

---

## Variables de Entorno (archivo `.env`)

Crear un archivo `.env` en la raíz del proyecto:

```env
# Base de datos (reemplazar con tus datos reales)
DATABASE_URL=postgresql://tubingazo_user:TU_CONTRASEÑA@localhost:5432/tubingazo

# Seguridad — generar una cadena aleatoria larga (mínimo 64 caracteres)
SESSION_SECRET=cambia_esto_por_una_cadena_muy_larga_y_segura_de_al_menos_64_caracteres

# PagosYa — obtener desde tu cuenta de PagosYa Bolivia
PAGOSYA_PUBLIC_KEY=tu_clave_publica_de_pagosya
PAGOSYA_SECRET_KEY=tu_clave_secreta_de_pagosya
PAGOSYA_BASE_URL=https://api.pagosya.com

# Puerto del servidor API (dejar en 8080 salvo que tu hosting requiera otro)
PORT=8080
```

---

## Estructura de tablas en la base de datos

El comando `pnpm --filter @workspace/db run push` crea automáticamente todas las tablas. A continuación el listado completo:

| Tabla | Descripción |
|-------|-------------|
| `users` | Jugadores y administradores. Campos: `ci`, `phone`, `balance`, `bonus_balance`, `referral_code`, `referred_by`, `is_admin`, `status`, `department` |
| `games` | Partidas de bingo. Campos: `title`, `card_price`, `prize_amount`, `status` (upcoming/active/finished), `game_type` (daily/weekly/monthly), `called_numbers` |
| `cards` | Cartones comprados. Campos: `numbers` (matriz 5×5), `payment_status`, `marked_numbers`, `bonus_amount_used` (monto pagado con bono por cartón) |
| `winners` | Ganadores validados. Campos: `prize_amount`, `commission_amount`, `activator_id`, `validated` |
| `withdrawals` | Solicitudes de retiro. Campos: `amount`, `method`, `status`, `qr_alias` |
| `referral_transactions` | Comisiones y bonos de bienvenida. Campos: `type` (commission/welcome_bonus), `amount`, `activator_id` |
| `operating_expenses` | Gastos operativos fijos o recurrentes. Campos: `name`, `amount`, `frequency`, `is_active` |
| `game_categories` | Categorías visibles en el inicio (bingo diario, semanal, etc.) |
| `name_change_requests` | Solicitudes de cambio de nombre verificadas por el admin |
| `audit_logs` | Log de todas las acciones críticas del sistema |
| `feed_items` | Feed de actividad en tiempo real (compras, ganadores, etc.) |

---

## Panel de Administración

Acceder en: `https://TU_DOMINIO.COM/admin`

Funcionalidades disponibles:

### Gestión de juegos
- Crear juegos diarios, semanales y mensuales
- Cantar números manualmente durante el sorteo en vivo
- Ver cartones vendidos por juego
- Activar / finalizar juegos
- Eliminar juegos sin cartones pagados

### Gestión de usuarios
- Listar y filtrar jugadores
- Verificar identidad (CI boliviano)
- Activar / suspender cuentas
- Ajustar saldo manualmente (crédito o débito)
- Ver historial de cartones y retiros por usuario
- Aprobar solicitudes de cambio de nombre

### Procesamiento de retiros
- Ver todas las solicitudes pendientes
- Marcar retiros como pagados (descuenta el saldo del usuario en ese momento)
- Historial completo de retiros

### Panel financiero
- **Ingresos reales**: suma de `card_price − bonus_amount_used` — los cartones pagados con bono no inflan los ingresos
- **Premios pagados**: total de premios validados
- **Ganancia neta**: `Ingresos reales − Premios pagados`
- **Bonos de bienvenida**: desglose de otorgados / gastados en cartones / pendiente sin gastar
- **Comisiones de activadores**: redistribución interna del premio, informativo
- **Gastos operativos**: gastos fijos configurables que se descuentan del monto distribuible a socios
- **Monto distribuible a socios**: ganancia neta menos gastos operativos y premios comprometidos
- Filtros por período: hoy, semana, mes, año, personalizado
- Exportar PDF financiero completo
- Exportar PDF de pago a socios
- Compartir resumen financiero por WhatsApp

### Registros de auditoría
- Log completo de todas las acciones críticas: compras, reclamos de bingo, retiros, ajustes de saldo, etc.

---

## Sistema de Referidos

- Cada usuario tiene un `referral_code` único
- Al registrarse con código de un activador:
  - El nuevo usuario recibe un **bono de bienvenida** en `bonus_balance`
  - El activador recibe una **comisión** al momento en que el referido gana un premio
- Los bonos se usan automáticamente al comprar cartones (primero se consume `bonus_balance`, luego `balance`)
- Los bonos usados en cartones quedan registrados en `bonus_amount_used` por cartón para excluirlos de los ingresos reales

---

## Flujo de Pagos (PagosYa)

1. El jugador selecciona cartones y hace clic en "Pagar"
2. El sistema genera un checkout en PagosYa y redirige al QR
3. PagosYa notifica al servidor via webhook `POST /api/payments/webhook`
4. El servidor activa los cartones y acredita el saldo si corresponde
5. Los cartones solo se activan con `payment_status = 'paid'`

---

## Credenciales de administrador por defecto

Después de la instalación:
- **CI:** `1000001`
- **Contraseña inicial:** `password`

⚠️ **Cambiar la contraseña inmediatamente desde el panel de administración.**

---

## Comandos útiles en producción

```bash
# Ver logs del servidor API
pm2 logs tubingazo-api

# Reiniciar servicios
pm2 restart all

# Aplicar cambios de base de datos después de actualizar el código
pnpm --filter @workspace/db run push

# Reconstruir el proyecto después de actualizar el código
pnpm install && pnpm run build && pm2 restart all

# Ver estado de los servicios
pm2 status
```

---

## Soporte y diagnóstico

Si hay problemas durante la instalación, verificar:
1. Que Node.js v22+ esté instalado: `node --version`
2. Que la base de datos esté accesible: `psql $DATABASE_URL -c "SELECT 1"`
3. Que todos los valores del `.env` estén correctamente configurados
4. Los logs del servidor: `pm2 logs tubingazo-api`
5. Que la columna `bonus_amount_used` exista en la tabla `cards`: si se actualizó el código sin correr `push`, ejecutar `pnpm --filter @workspace/db run push` nuevamente
