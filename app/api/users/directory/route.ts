import { NextResponse, type NextRequest } from "next/server";
import { requireAuth, toAuthErrorResponse } from "@/src/lib/auth/guard";
import { createClient } from "@/src/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const supabase = await createClient();

    const rawQuery = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const sanitizedQuery = rawQuery.replace(/[,%()]/g, "").slice(0, 80);

    let dbQuery = supabase
      .from("users")
      .select("id, email, full_name, organization_unit, role")
      .order("role", { ascending: true })
      .order("full_name", { ascending: true })
      .limit(50);

    if (sanitizedQuery.length > 0) {
      dbQuery = dbQuery.or(
        `full_name.ilike.%${sanitizedQuery}%,email.ilike.%${sanitizedQuery}%,organization_unit.ilike.%${sanitizedQuery}%`
      );
    }

    const { data: users, error } = await dbQuery;

    if (error) {
      return NextResponse.json(
        {
          error: {
            code: "DIRECTORY_FETCH_FAILED",
            message: "Unable to load campus user directory.",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      users: users ?? [],
    });
  } catch (error) {
    const authResp = toAuthErrorResponse(error);
    if (authResp) return authResp;

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Unexpected error while loading campus directory.",
        },
      },
      { status: 500 }
    );
  }
}
