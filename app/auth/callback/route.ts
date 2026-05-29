import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/pools";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }

    // Code was present but exchange failed (PKCE mismatch, already used, or
    // opened in a different browser). Email is confirmed in Supabase — just
    // send to login with a success message instead of an error.
    return NextResponse.redirect(`${origin}/login?message=email_confirmed`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
