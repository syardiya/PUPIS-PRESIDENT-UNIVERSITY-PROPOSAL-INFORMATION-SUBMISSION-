import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { requireAuth, toAuthErrorResponse } from "@/src/lib/auth/guard";
import { createClient } from "@/src/lib/supabase/server";
import { profileUpdateSchema } from "@/src/lib/validations/profile";

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

    const parsed = profileUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstIssue =
        parsed.error.issues[0]?.message ?? "Invalid profile fields.";
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: firstIssue,
          },
        },
        { status: 400 }
      );
    }

    const { full_name, organization_unit } = parsed.data;
    const supabase = await createClient();

    // Update strictly `full_name` and `organization_unit` scoped to authenticated user's own `id`
    const { data: updatedUser, error: updateError } = await supabase
      .from("users")
      .update({
        full_name,
        organization_unit,
      })
      .eq("id", profile.id)
      .select("id, email, full_name, organization_unit, role")
      .single();

    if (updateError || !updatedUser) {
      return NextResponse.json(
        {
          error: {
            code: "PROFILE_UPDATE_FAILED",
            message:
              updateError?.message ?? "Unable to update campus profile record.",
          },
        },
        { status: 500 }
      );
    }

    revalidatePath("/profile");
    revalidatePath("/dashboard");

    return NextResponse.json({
      ok: true,
      profile: updatedUser,
    });
  } catch (error) {
    const authResponse = toAuthErrorResponse(error);
    if (authResponse) return authResponse;

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Unexpected server error while updating profile.",
        },
      },
      { status: 500 }
    );
  }
}
