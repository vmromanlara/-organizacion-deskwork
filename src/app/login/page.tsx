import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<main>Cargando acceso…</main>}>
      <AuthForm mode="login" />
    </Suspense>
  );
}
