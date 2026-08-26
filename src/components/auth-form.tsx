"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { safeNext } from "@/shared/auth/safe-next";
import { createSupabaseBrowserClient } from "@/shared/supabase/browser";

type AuthMode = "login" | "register";

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setNotice(undefined);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const supabase = createSupabaseBrowserClient();

    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }

    if (mode === "register" && !result.data.session) {
      setNotice("Registro creado. Revisa la confirmación de correo antes de iniciar sesión.");
      return;
    }

    const next = searchParams.get("next");
    router.replace(safeNext(next ?? undefined, "/app"));
    router.refresh();
  }

  const isLogin = mode === "login";
  return (
    <main>
      <h1>{isLogin ? "Iniciar sesión" : "Crear cuenta"}</h1>
      <p>Acceso a Foundation de DeskWork. Ticketing Core aún no está disponible.</p>
      <form onSubmit={onSubmit}>
        <label>
          Correo
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Contraseña
          <input name="password" type="password" autoComplete={isLogin ? "current-password" : "new-password"} minLength={6} required />
        </label>
        <button type="submit" disabled={loading}>{loading ? "Procesando…" : isLogin ? "Entrar" : "Registrarme"}</button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      <p>{isLogin ? "¿No tienes cuenta?" : "¿Ya tienes cuenta?"} <Link href={isLogin ? "/register" : "/login"}>{isLogin ? "Regístrate" : "Inicia sesión"}</Link></p>
    </main>
  );
}
