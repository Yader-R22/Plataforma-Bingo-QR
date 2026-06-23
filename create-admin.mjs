#!/usr/bin/env node
/**
 * Script interactivo para crear el usuario administrador inicial.
 * Ejecutar desde la raíz del proyecto: node create-admin.mjs
 *
 * Requiere:
 *  - DATABASE_URL en el archivo .env
 *  - psql instalado (viene con: apt install postgresql-client)
 *  - bcryptjs accesible en el workspace (pnpm install primero)
 */

import { createInterface } from "readline";
import { readFileSync } from "fs";
import { execFileSync } from "child_process";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// ── Cargar variables del .env ──────────────────────────────────────────────
function loadEnv() {
  try {
    const envPath = join(__dirname, ".env");
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (key && !process.env[key]) process.env[key] = val;
    }
  } catch {
    console.error("❌  No se encontró el archivo .env.");
    console.error("    Asegurate de estar en /var/www/tubingazo y de haber creado el .env primero.");
    process.exit(1);
  }
}

loadEnv();

// ── Verificar DATABASE_URL ────────────────────────────────────────────────
if (!process.env.DATABASE_URL) {
  console.error("❌  DATABASE_URL no está definida en el .env");
  process.exit(1);
}

// ── Verificar que psql está disponible ───────────────────────────────────
try {
  execFileSync("psql", ["--version"], { stdio: "pipe" });
} catch {
  console.error("❌  psql no está instalado. Instalalo con: apt install -y postgresql-client");
  process.exit(1);
}

// ── Cargar bcryptjs ───────────────────────────────────────────────────────
let bcrypt;
const bcryptPaths = [
  "./node_modules/.pnpm/bcryptjs@3.0.2/node_modules/bcryptjs/dist/cjs/bcryptjs.cjs",
  "./artifacts/api-server/node_modules/bcryptjs",
];
// Try the pnpm store first, then fall back to api-server local install
for (const p of bcryptPaths) {
  try {
    bcrypt = require(p);
    break;
  } catch {
    // try next
  }
}
if (!bcrypt) {
  // Last resort: search inside .pnpm directory
  try {
    const { readdirSync } = await import("fs");
    const pnpmDir = join(__dirname, "node_modules", ".pnpm");
    const dirs = readdirSync(pnpmDir).filter(d => d.startsWith("bcryptjs@"));
    if (dirs.length > 0) {
      bcrypt = require(join(pnpmDir, dirs[0], "node_modules", "bcryptjs"));
    }
  } catch {
    // ignore
  }
}
if (!bcrypt) {
  console.error("❌  No se pudo cargar bcryptjs.");
  console.error("    Ejecutá: pnpm install   y luego volvé a ejecutar este script.");
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────
const rl = createInterface({ input: process.stdin, output: process.stdout });

function pregunta(texto, ocultar = false) {
  return new Promise((resolve) => {
    if (ocultar && process.stdin.isTTY) {
      process.stdout.write(texto);
      process.stdin.setRawMode(true);
      let chars = "";
      process.stdin.resume();
      process.stdin.setEncoding("utf8");
      const onData = (ch) => {
        if (ch === "\n" || ch === "\r" || ch === "\u0003") {
          if (ch === "\u0003") process.exit();
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener("data", onData);
          process.stdout.write("\n");
          resolve(chars);
        } else if (ch === "\u007F") {
          if (chars.length > 0) {
            chars = chars.slice(0, -1);
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            process.stdout.write(texto + "*".repeat(chars.length));
          }
        } else {
          chars += ch;
          process.stdout.write("*");
        }
      };
      process.stdin.on("data", onData);
    } else {
      rl.question(texto, resolve);
    }
  });
}

function runPsql(sql) {
  return execFileSync("psql", [process.env.DATABASE_URL, "-t", "-c", sql], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

const DEPARTAMENTOS = [
  "Beni", "Chuquisaca", "Cochabamba", "La Paz",
  "Oruro", "Pando", "Potosí", "Santa Cruz", "Tarija",
];

async function elegirDepartamento() {
  console.log("\n  Departamentos disponibles:");
  DEPARTAMENTOS.forEach((d, i) => console.log(`    ${i + 1}. ${d}`));
  while (true) {
    const resp = await pregunta("  Elegí un número (1-9): ");
    const idx = parseInt(resp) - 1;
    if (idx >= 0 && idx < DEPARTAMENTOS.length) return DEPARTAMENTOS[idx];
    console.log("  ⚠️  Número inválido, intentá de nuevo.");
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
console.log("\n╔══════════════════════════════════════════════════════╗");
console.log("║       TU BINGAZO — Crear Administrador Inicial       ║");
console.log("╚══════════════════════════════════════════════════════╝\n");

// Verificar conexión a la DB
try {
  runPsql("SELECT 1");
} catch (err) {
  console.error("❌  No se pudo conectar a la base de datos.");
  console.error("    Verificá que DATABASE_URL en .env es correcta y que PostgreSQL está activo.");
  console.error("   ", err.stderr?.trim() ?? err.message);
  process.exit(1);
}

console.log("  Completá los datos del administrador principal:\n");

const nombre = await pregunta("  Nombre completo (ej: Juan Mamani López): ");
if (!nombre.trim()) { console.error("❌  El nombre no puede estar vacío."); process.exit(1); }

const ci = await pregunta("  Cédula de Identidad (CI): ");
if (!ci.trim() || !/^\d{6,10}$/.test(ci.trim())) {
  console.error("❌  CI inválida. Debe contener entre 6 y 10 dígitos numéricos.");
  process.exit(1);
}

const telefono = await pregunta("  Teléfono (ej: 70123456): ");
if (!telefono.trim() || !/^\d{7,10}$/.test(telefono.trim())) {
  console.error("❌  Teléfono inválido. Debe contener entre 7 y 10 dígitos.");
  process.exit(1);
}

const departamento = await elegirDepartamento();

let password = "";
while (true) {
  password = await pregunta("\n  Contraseña (mínimo 8 caracteres): ", true);
  if (password.length < 8) {
    console.log("  ⚠️  La contraseña debe tener al menos 8 caracteres.");
    continue;
  }
  const confirm = await pregunta("  Confirmá la contraseña: ", true);
  if (password !== confirm) {
    console.log("  ⚠️  Las contraseñas no coinciden. Intentá de nuevo.");
    continue;
  }
  break;
}

rl.close();

console.log("\n  Procesando...");

// Verificar si ya existe un admin con ese CI
try {
  const exists = runPsql(`SELECT COUNT(*) FROM users WHERE ci = '${ci.trim().replace(/'/g, "''")}'`);
  if (parseInt(exists) > 0) {
    console.error(`\n❌  Ya existe un usuario con CI ${ci.trim()}. Elegí otro CI.`);
    process.exit(1);
  }
} catch (err) {
  console.error("❌  Error al consultar la base de datos:", err.message);
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, 10);

// Escapar valores para SQL
const safeHash = passwordHash.replace(/'/g, "''");
const safeName = nombre.trim().replace(/'/g, "''");
const safeCi = ci.trim().replace(/'/g, "''");
const safePhone = telefono.trim().replace(/'/g, "''");
const safeDept = departamento.replace(/'/g, "''");

try {
  runPsql(
    `INSERT INTO users
       (full_name, ci, phone, password_hash, department, status, is_admin,
        balance, bonus_balance, admin_credit_balance)
     VALUES
       ('${safeName}', '${safeCi}', '${safePhone}', '${safeHash}',
        '${safeDept}', 'active', true, 0, 0, 0)`
  );
} catch (err) {
  console.error("❌  Error al crear el administrador:", err.stderr?.trim() ?? err.message);
  process.exit(1);
}

console.log("\n╔══════════════════════════════════════════════════════╗");
console.log("║              ✅  ADMINISTRADOR CREADO                ║");
console.log("╚══════════════════════════════════════════════════════╝");
console.log(`\n  Nombre:       ${nombre.trim()}`);
console.log(`  CI:           ${ci.trim()}`);
console.log(`  Departamento: ${departamento}`);
console.log(`  Contraseña:   (la que ingresaste — guardala en un lugar seguro)`);
console.log("\n  Acceso al panel admin: https://TU_DOMINIO.COM/admin\n");
