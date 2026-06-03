import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuthStore } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const DEPARTMENTS = [
  "Beni", "Chuquisaca", "Cochabamba", "La Paz",
  "Oruro", "Pando", "Potosí", "Santa Cruz", "Tarija",
];

export default function RegisterPage() {
  const [form, setForm] = useState({
    full_name: "", ci: "", phone: "", department: "",
    password: "", confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const [, navigate] = useLocation();

  function update(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    if (form.password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: form.full_name,
          ci: form.ci,
          phone: form.phone,
          department: form.department,
          password: form.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Error al registrarse");
        return;
      }
      setAuth(data.token, data.user);
      toast.success("¡Cuenta creada! Tu cuenta está pendiente de verificación.");
      navigate("/juegos");
    } catch {
      toast.error("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary text-white text-2xl font-black mb-2 shadow-lg">
            🎱
          </div>
          <h1 className="text-2xl font-black text-foreground">Tu Bingazo</h1>
        </div>

        <div className="bg-card rounded-2xl shadow-lg border p-6">
          <h2 className="text-xl font-bold mb-5">Crear Cuenta</h2>
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div className="space-y-1.5">
              <Label>Nombre completo</Label>
              <Input placeholder="Juan Pérez" value={form.full_name} onChange={e => update("full_name", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Carnet de Identidad (CI)</Label>
              <Input placeholder="1234567" value={form.ci} onChange={e => update("ci", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono / WhatsApp</Label>
              <Input placeholder="+591 70000000" value={form.phone} onChange={e => update("phone", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Departamento</Label>
              <Select onValueChange={val => update("department", val)} required>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona tu departamento" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Contraseña</Label>
              <Input type="password" placeholder="••••••••" value={form.password} onChange={e => update("password", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Confirmar contraseña</Label>
              <Input type="password" placeholder="••••••••" value={form.confirmPassword} onChange={e => update("confirmPassword", e.target.value)} required />
            </div>
            <Button type="submit" className="w-full mt-2" disabled={loading || !form.department}>
              {loading ? "Creando cuenta..." : "Crear Cuenta"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="text-primary font-semibold hover:underline">Inicia sesión</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
