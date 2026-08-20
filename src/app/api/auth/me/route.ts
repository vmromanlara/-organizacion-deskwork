import { createSupabaseServerClient } from "@/shared/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return Response.json({ error: "authentication_required" }, { status: 401 });
  }

  return Response.json({ id: user.id, email: user.email });
}
