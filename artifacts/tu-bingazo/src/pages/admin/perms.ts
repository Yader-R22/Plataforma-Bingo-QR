export const ADMIN_PERMS = [
  { id: "admin:users",       label: "👥 Usuarios",     desc: "Ver, verificar, banear y crear usuarios" },
  { id: "admin:games",       label: "🎱 Juegos",        desc: "Crear juegos, cantar números, validar ganadores" },
  { id: "admin:withdrawals", label: "💸 Retiros",       desc: "Ver y procesar solicitudes de retiro" },
  { id: "admin:resets",      label: "🔑 Reseteos",      desc: "Aprobar/rechazar reseteos de contraseña" },
  { id: "admin:logs",        label: "📋 Auditoría",     desc: "Ver logs de auditoría del sistema" },
] as const;
