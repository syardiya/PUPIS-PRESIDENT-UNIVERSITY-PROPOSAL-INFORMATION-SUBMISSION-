import { NextResponse, type NextRequest } from "next/server";
import { requireAuth, toAuthErrorResponse } from "@/src/lib/auth/guard";
import { createClient } from "@/src/lib/supabase/server";
import {
  approvalQueueFilterSchema,
  secretaryQueueFilterSchema,
  studentAffairsQueueFilterSchema,
} from "@/src/lib/validations/approval";
import {
  fetchSecretaryIntakeQueue,
  fetchStudentAffairsFinalQueue,
  fetchUserApprovalQueue,
} from "@/src/lib/proposals/approval-helpers";
import {
  isFacultySecretaryProfile,
  isStudentAffairsProfile,
} from "@/src/lib/proposals/approver-authority";

export async function GET(request: NextRequest) {
  try {
    const profile = await requireAuth();
    const supabase = await createClient();

    if (isFacultySecretaryProfile(profile)) {
      const rawSecFilter =
        request.nextUrl.searchParams.get("filter") ?? "pending_review";
      const parsedSecFilter = secretaryQueueFilterSchema.safeParse(rawSecFilter);
      if (!parsedSecFilter.success) {
        return NextResponse.json(
          {
            error: {
              code: "INVALID_FILTER",
              message:
                "Filter must be one of: all, pending_review, clarification_needed, forwarded.",
            },
          },
          { status: 400 }
        );
      }

      const intakeQueue = await fetchSecretaryIntakeQueue(
        supabase,
        parsedSecFilter.data
      );

      return NextResponse.json({
        ok: true,
        mode: "secretary_intake",
        ...intakeQueue,
      });
    }

    if (profile.functional_role === "student_affairs") {
      const rawSaFilter =
        request.nextUrl.searchParams.get("filter") ?? "awaiting_signature";
      const parsedSaFilter =
        studentAffairsQueueFilterSchema.safeParse(rawSaFilter);
      if (!parsedSaFilter.success) {
        return NextResponse.json(
          {
            error: {
              code: "INVALID_FILTER",
              message:
                "Filter must be one of: all, awaiting_signature, completed.",
            },
          },
          { status: 400 }
        );
      }

      const saQueue = await fetchStudentAffairsFinalQueue(
        supabase,
        parsedSaFilter.data
      );

      return NextResponse.json({
        ok: true,
        mode: "student_affairs_final",
        ...saQueue,
      });
    }

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

    const queue = await fetchUserApprovalQueue(
      supabase,
      profile.id,
      parsedFilter.data
    );

    if (isStudentAffairsProfile(profile)) {
      const saQueue = await fetchStudentAffairsFinalQueue(supabase, "all");
      return NextResponse.json({
        ok: true,
        mode: "approver_ttd",
        ...queue,
        finalSignatureCounts: saQueue.counts,
      });
    }

    return NextResponse.json({
      ok: true,
      mode: "approver_ttd",
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
