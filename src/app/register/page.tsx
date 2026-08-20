import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export default function RegisterPage() {
  return (
    <Suspense fallback={<main>Cargando registro…</main>}>
      <AuthForm mode="register" />
    </Suspense>
  );
}
