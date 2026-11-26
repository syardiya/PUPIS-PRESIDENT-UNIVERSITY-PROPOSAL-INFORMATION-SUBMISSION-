import { NextResponse, type NextRequest } from "next/server";
import { requireAuth, toAuthErrorResponse } from "@/src/lib/auth/guard";
import { createClient } from "@/src/lib/supabase/server";
import { approvalQueueFilterSchema } from "@/src/lib/validations/approval";
import { fetchUserApprovalQueue } from "@/src/lib/proposals/approval-helpers";

export async function GET(request: NextRequest) {
  try {
    const profile = await requireAuth();
    const rawFilter =
      request.nextUrl.searchParams.get("filter") ?? "action_required";

    const parsedFilter = approvalQueueFilterSchema.safeParse(rawFilter);
    if (!parsedFilter.success) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_FILTER",
            message:
              "Filter must be one of: all, action_required, upcoming, completed.",
          },
        },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const queue = await fetchUserApprovalQueue(
      supabase,
      profile.id,
      parsedFilter.data
    );

    return NextResponse.json({
      ok: true,
      ...queue,
    });
  } catch (error) {
    const authResp = toAuthErrorResponse(error);
    if (authResp) return authResp;

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Unexpected error while loading approval queue.",
        },
      },
      { status: 500 }
    );
  }
}
