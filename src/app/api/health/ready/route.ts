import { getServerEnv } from "@/shared/config/env";

export function GET() {
  const env = getServerEnv();
  const ready = Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  return Response.json(
    { status: ready ? "ok" : "not_ready", service: "deskwork", check: "ready" },
    { status: ready ? 200 : 503 },
  );
}
