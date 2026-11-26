import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { requireAuth, toAuthErrorResponse } from "@/src/lib/auth/guard";
import { createClient } from "@/src/lib/supabase/server";
import { markNotificationsReadSchema } from "@/src/lib/validations/notification";

export async function GET() {
  try {
    const profile = await requireAuth();
    const supabase = await createClient();

    const [{ data: items, error }, { count: unreadCount }] = await Promise.all([
      supabase
        .from("notifications")
        .select("id, user_id, proposal_id, title, message, is_read, created_at")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("is_read", false),
    ]);

    if (error) {
      return NextResponse.json(
        {
          error: {
            code: "NOTIFICATIONS_FETCH_FAILED",
            message: "Unable to load notifications.",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      unreadCount: unreadCount ?? 0,
      items: items ?? [],
    });
  } catch (error) {
    const authResp = toAuthErrorResponse(error);
    if (authResp) return authResp;

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Unexpected error while loading notifications.",
        },
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const profile = await requireAuth();

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_JSON",
            message: "Invalid JSON payload.",
          },
        },
        { status: 400 }
      );
    }

    const parsed = markNotificationsReadSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message:
              parsed.error.issues[0]?.message ??
              "Expected { mark_all: true } or { notification_id: '<uuid>' }.",
          },
        },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    if ("mark_all" in parsed.data) {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", profile.id)
        .eq("is_read", false);

      if (error) {
        return NextResponse.json(
          {
            error: {
              code: "NOTIFICATION_UPDATE_FAILED",
              message: "Failed to mark all notifications as read.",
            },
          },
          { status: 500 }
        );
      }
    } else {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", profile.id)
        .eq("id", parsed.data.notification_id);

      if (error) {
        return NextResponse.json(
          {
            error: {
              code: "NOTIFICATION_UPDATE_FAILED",
              message: "Failed to mark notification as read.",
            },
          },
          { status: 500 }
        );
      }
    }

    revalidatePath("/dashboard");

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authResp = toAuthErrorResponse(error);
    if (authResp) return authResp;

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Unexpected error while updating notifications.",
        },
      },
      { status: 500 }
    );
  }
}
