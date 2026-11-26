import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/src/lib/supabase/server";

export async function POST(request: NextRequest) {
  const requestUrl = new URL(request.url);

  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Proceed to login redirect even if session was already cleared
  }

  return NextResponse.redirect(new URL("/login", requestUrl.origin), {
    status: 303,
  });
}
