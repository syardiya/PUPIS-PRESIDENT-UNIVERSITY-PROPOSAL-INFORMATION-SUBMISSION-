import type {
  FunctionalRoleDb,
  ProposalStatusDb,
  SecretaryReviewStatusDb,
  SignerStatusDb,
  UserRole,
} from "@/src/lib/supabase/database.types";

export interface AuthorityProfileLike {
  role: UserRole | string;
  functional_role?: FunctionalRoleDb | string | null;
  organization_unit?: string | null;
  email?: string | null;
}

/**
 * Mirrors PostgreSQL `public.is_faculty_secretary()` from migration 005.
 * Faculty Secretaries manage proposal intake, completeness checks, clarification
 * requests, and forwarding to Head of Study Program (Kaprodi), and cannot directly approve or reject.
 */
export function isFacultySecretaryProfile(
  user: AuthorityProfileLike | null | undefined
): boolean {
  if (!user) return false;
  if (user.functional_role === "faculty_secretary") return true;
  if (user.role !== "staff") return false;
  if (!user.functional_role) {
    const unit = (user.organization_unit ?? "").toLowerCase();
    return unit.includes("secretary") || unit.includes("sekretaris");
  }
  return false;
}

/**
 * Mirrors PostgreSQL `public.is_student_affairs()` from migration 005.
 */
export function isStudentAffairsProfile(
  user: AuthorityProfileLike | null | undefined
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.functional_role === "student_affairs") return true;
  if (user.role !== "staff") return false;
  if (!user.functional_role) {
    const unit = (user.organization_unit ?? "").toLowerCase();
    const email = (user.email ?? "").toLowerCase();
    return (
      unit.includes("student affairs") ||
      unit.includes("kemahasiswaan") ||
      email.includes("student.affairs") ||
      email.includes("kemahasiswaan")
    );
  }
  return false;
}

/**
 * Validates whether a campus user account holds institutional authority to be
 * selected as a sequential TTD approver (`proposal_signers`):
 * - Faculty Secretary accounts perform intake verification & forwarding only and cannot approve/reject.
 * - Ordinary student accounts (`student`) cannot be assigned as official approvers.
 * - Official institutional approvers (`kaprodi`, `faculty_advisor`, `student_affairs`, `staff`, `admin`) are eligible.
 */
export function canBeAssignedAsApprover(
  user: AuthorityProfileLike | null | undefined
): { allowed: boolean; reason?: string } {
  if (!user) {
    return {
      allowed: false,
      reason: "Selected user profile was not found.",
    };
  }

  if (isFacultySecretaryProfile(user)) {
    return {
      allowed: false,
      reason:
        "Faculty Secretary accounts handle proposal intake verification and forwarding, and cannot act as TTD approvers.",
    };
  }

  const hasOfficialApproverFunctionalRole =
    user.functional_role === "kaprodi" ||
    user.functional_role === "faculty_advisor" ||
    user.functional_role === "student_affairs";

  if (
    user.role !== "staff" &&
    user.role !== "admin" &&
    !hasOfficialApproverFunctionalRole
  ) {
    return {
      allowed: false,
      reason:
        "Student accounts do not hold institutional signing authority and cannot be selected as proposal approvers.",
    };
  }

  return { allowed: true };
}

/**
 * Formats a concise human-readable institutional authority badge for directory
 * selectors, routing previews, and workspace headers.
 */
export function formatFunctionalAuthorityLabel(
  user: AuthorityProfileLike | null | undefined
): string {
  if (!user) return "Campus Member";

  switch (user.functional_role) {
    case "kaprodi":
      return "Head of Study Program (Kaprodi)";
    case "faculty_advisor":
      return "Faculty Advisor";
    case "faculty_secretary":
      return "Faculty Secretary";
    case "student_affairs":
      return "Student Affairs";
    case "organization_rep":
      return "Student Org Representative";
    default:
      break;
  }

  if (user.role === "admin") {
    return "Administrator";
  }
  if (user.role === "staff") {
    return user.organization_unit?.trim()
      ? `Staff • ${user.organization_unit.trim()}`
      : "Institutional Staff";
  }
  return "Student";
}

/**
 * Suggests an appropriate default `role_title` when an eligible approver is chosen
 * in Step 4 of the Proposal Creation Wizard.
 */
export function suggestApproverRoleTitle(
  user: AuthorityProfileLike | null | undefined
): string {
  if (!user) return "Institutional Approver";

  switch (user.functional_role) {
    case "kaprodi":
      return "Head of Study Program (Kaprodi)";
    case "faculty_advisor":
      return "Faculty Advisor";
    case "student_affairs":
      return "Directorate of Student Affairs";
    default:
      if (user.organization_unit?.trim()) {
        return user.organization_unit.trim();
      }
      return user.role === "admin"
        ? "Institutional Governance Approver"
        : "Faculty Advisor";
  }
}

export interface SignerStepBrief {
  step_order: number;
  role_title: string;
  status: SignerStatusDb;
  approver_name?: string | null;
}

export interface ProposalStageSummary {
  activeStageLabel: string;
  progressLabel: string;
  signedCount: number;
  pendingCount: number;
  totalSteps: number;
}

/**
 * Derives a clear human-readable summary of a proposal's active approval stage,
 * completed sign-offs, and pending sign-offs across all workflow states.
 */
export function describeProposalActiveStage(params: {
  status: ProposalStatusDb;
  secretaryReviewStatus?: SecretaryReviewStatusDb | string | null;
  signers: ReadonlyArray<SignerStepBrief>;
}): ProposalStageSummary {
  const ordered = [...params.signers].sort(
    (a, b) => a.step_order - b.step_order
  );
  const totalSteps = ordered.length;
  const signedCount = ordered.filter((s) => s.status === "signed").length;
  const pendingSigners = ordered.filter((s) => s.status === "pending");
  const pendingCount = pendingSigners.length;

  if (params.status === "draft") {
    return {
      activeStageLabel: "Draft (Unsubmitted)",
      progressLabel:
        totalSteps > 0
          ? `0/${totalSteps} Signed`
          : "No approvers selected yet",
      signedCount,
      pendingCount,
      totalSteps,
    };
  }

  if (params.status === "pending_ttd") {
    if (params.secretaryReviewStatus === "pending_review") {
      return {
        activeStageLabel: "Faculty Secretary Intake",
        progressLabel:
          totalSteps > 0
            ? `${signedCount}/${totalSteps} Signed • ${pendingCount} Pending`
            : "Awaiting intake verification",
        signedCount,
        pendingCount,
        totalSteps,
      };
    }

    const activeSigner = pendingSigners[0] ?? null;
    return {
      activeStageLabel: activeSigner
        ? `Step ${activeSigner.step_order}: ${activeSigner.role_title}${
            activeSigner.approver_name
              ? ` (${activeSigner.approver_name})`
              : ""
          }`
        : "In Sequential Review",
      progressLabel:
        totalSteps > 0
          ? `${signedCount}/${totalSteps} Signed • ${pendingCount} Pending`
          : "In Review",
      signedCount,
      pendingCount,
      totalSteps,
    };
  }

  if (params.status === "needs_revision") {
    return {
      activeStageLabel:
        params.secretaryReviewStatus === "clarification_needed"
          ? "Clarification Follow-Up (Submitter)"
          : "Revision in Progress (Submitter)",
      progressLabel:
        totalSteps > 0
          ? `${signedCount}/${totalSteps} Signed • ${
              totalSteps - signedCount
            } Remaining`
          : "Awaiting resubmission",
      signedCount,
      pendingCount,
      totalSteps,
    };
  }

  if (params.status === "approved") {
    return {
      activeStageLabel: "Student Affairs Final Signature",
      progressLabel:
        totalSteps > 0
          ? `${signedCount}/${totalSteps} Approvers Signed`
          : "Approved by Approvers",
      signedCount,
      pendingCount: 0,
      totalSteps,
    };
  }

  if (params.status === "completed") {
    return {
      activeStageLabel: "Completed",
      progressLabel:
        totalSteps > 0
          ? `${signedCount}/${totalSteps} Signed + Final Signature`
          : "Final Signature Recorded",
      signedCount,
      pendingCount: 0,
      totalSteps,
    };
  }

  return {
    activeStageLabel: "Rejected",
    progressLabel:
      totalSteps > 0 ? `${signedCount}/${totalSteps} Signed` : "Closed",
    signedCount,
    pendingCount: 0,
    totalSteps,
  };
}
