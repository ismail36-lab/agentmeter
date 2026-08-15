import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// DELETE /api/keys/:id — revoke (is_active = false) or delete key
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const isHardDelete = searchParams.get("hard") === "true";

  let error;
  if (isHardDelete) {
    const res = await supabaseAdmin
      .from("api_keys")
      .delete()
      .eq("id", params.id)
      .eq("user_id", user.id);
    error = res.error;
  } else {
    const res = await supabaseAdmin
      .from("api_keys")
      .update({ is_active: false })
      .eq("id", params.id)
      .eq("user_id", user.id);
    error = res.error;
  }

  if (error) {
    console.error("api_keys DELETE error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
