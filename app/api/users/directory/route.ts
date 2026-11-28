import { NextResponse, type NextRequest } from "next/server";
import { requireAuth, toAuthErrorResponse } from "@/src/lib/auth/guard";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import { normalizeEnvValue } from "@/src/lib/supabase/url";
import { canBeAssignedAsApprover } from "@/src/lib/proposals/approver-authority";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const supabase = await createClient();
    const dbClient = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY)
      ? createAdminClient()
      : supabase;

    const rawQuery = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const scope = request.nextUrl.searchParams.get("scope")?.trim() ?? "all";
    const sanitizedQuery = rawQuery.replace(/[,%()]/g, "").slice(0, 80);

    let dbQuery = dbClient
      .from("users")
      .select("id, email, full_name, organization_unit, role, functional_role")
      .order("role", { ascending: true })
      .order("full_name", { ascending: true })
      .limit(80);

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

    const filteredUsers =
      scope === "approvers"
        ? (users ?? []).filter((u) => canBeAssignedAsApprover(u).allowed)
        : users ?? [];

    return NextResponse.json({
      ok: true,
      users: filteredUsers,
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
