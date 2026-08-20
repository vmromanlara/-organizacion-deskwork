import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>DeskWork</h1>
      <p>Foundation de autenticación y autorización. Ticket Core no está implementado en Fase 3A.</p>
      <p><Link href="/login">Iniciar sesión</Link> · <Link href="/register">Crear cuenta</Link></p>
    </main>
  );
}
