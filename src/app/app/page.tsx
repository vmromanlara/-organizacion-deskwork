import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export default async function ProtectedFoundationPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/app");
  }

  return (
    <main>
      <h1>DeskWork Foundation</h1>
      <p>Sesión autenticada: {user.email}</p>
      <p>Esta ruta está protegida. Ticketing Core no forma parte de Fase 3A.</p>
      <SignOutButton />
    </main>
  );
}
