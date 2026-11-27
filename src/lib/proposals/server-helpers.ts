import "server-only";

import {
  SIGNATURES_BUCKET,
  SIGNED_URL_TTL_SECONDS,
} from "../auth/guard";
import { createAdminClient } from "../supabase/admin";
import { normalizeEnvValue } from "../supabase/url";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BudgetLineItemDb,
  Database,
  Json,
} from "../supabase/database.types";
import {
  computeBudgetItemsGrandTotal,
  type ccUserRecipientSchema,
  type proposalSignerItemSchema,
} from "../validations/proposal";
import type { z } from "zod";

export const PROPOSAL_ATTACHMENTS_BUCKET =
  process.env.NEXT_PUBLIC_PROPOSAL_ATTACHMENTS_BUCKET || "proposal-attachments";
export const ATTACHMENT_SIGNED_URL_TTL_SECONDS = 300; // 5 minutes

export type SignerInputItem = z.infer<typeof proposalSignerItemSchema>;
export type CcInputItem = z.infer<typeof ccUserRecipientSchema>;

export function generateProposalCode(): string {
  const year = new Date().getUTCFullYear();
  const randomDigits = Math.floor(1000 + Math.random() * 9000);
  const timeSuffix = String(Date.now()).slice(-3);
  return `PU-PROP-${year}-${randomDigits}${timeSuffix}`;
}

export function parseBudgetItemsFromJson(raw: Json | null | undefined): BudgetLineItemDb[] {
  if (!Array.isArray(raw)) return [];
  const items: BudgetLineItemDb[] = [];

  raw.forEach((entry, idx) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
    const rec = entry as Record<string, Json | undefined>;
    const quantity = typeof rec.quantity === "number" && Number.isFinite(rec.quantity)
      ? Math.max(0, rec.quantity)
      : 0;
    const unitPrice =
      typeof rec.unit_price === "number" && Number.isFinite(rec.unit_price)
        ? Math.max(0, rec.unit_price)
        : 0;
    const subtotal = Math.round(quantity * unitPrice * 100) / 100;

    items.push({
      id: typeof rec.id === "string" && rec.id.trim() !== "" ? rec.id : `item-${idx + 1}`,
      category: typeof rec.category === "string" ? rec.category : "",
      description: typeof rec.description === "string" ? rec.description : "",
      quantity,
      unit: typeof rec.unit === "string" ? rec.unit : "pcs",
      unit_price: unitPrice,
      subtotal,
    });
  });

  return items;
}

export function normalizeDraftBudgetItems(
  items: ReadonlyArray<{
    id: string;
    category: string;
    description: string;
    quantity: number;
    unit: string;
    unit_price: number;
  }>
): { normalized: BudgetLineItemDb[]; grandTotal: number } {
  const normalized: BudgetLineItemDb[] = items.map((item, idx) => {
    const qty = Number.isFinite(item.quantity) && item.quantity >= 0 ? item.quantity : 0;
    const price =
      Number.isFinite(item.unit_price) && item.unit_price >= 0 ? item.unit_price : 0;
    const subtotal = Math.round(qty * price * 100) / 100;
    return {
      id: item.id || `rab-${idx + 1}`,
      category: item.category,
      description: item.description,
      quantity: qty,
      unit: item.unit || "pcs",
      unit_price: price,
      subtotal,
    };
  });

  return {
    normalized,
    grandTotal: computeBudgetItemsGrandTotal(normalized),
  };
}

export function formatBudgetBreakdownText(items: BudgetLineItemDb[]): string {
  if (items.length === 0) {
    return "No itemized expenditure lines recorded.";
  }

  return items
    .map(
      (item, index) =>
        `${index + 1}. [${item.category}] ${item.description}: ${item.quantity} ${
          item.unit
        } x IDR ${item.unit_price.toLocaleString("en-US")} = IDR ${item.subtotal.toLocaleString(
          "en-US"
        )}`
    )
    .join("\n");
}

export function formatExecutiveSummaryText(params: {
  activityType: string | null;
  background: string | null;
  objectives: string | null;
  targetAudience: string | null;
}): string {
  const sections: string[] = [];
  if (params.activityType) {
    sections.push(`Activity Category: ${params.activityType}`);
  }
  if (params.background) {
    sections.push(`Background & Description:\n${params.background}`);
  }
  if (params.objectives) {
    sections.push(`Objectives:\n${params.objectives}`);
  }
  if (params.targetAudience) {
    sections.push(`Target Audience:\n${params.targetAudience}`);
  }
  return sections.join("\n\n").trim();
}

export interface ResolvedSignerRow {
  approver_id: string;
  role_title: string;
  step_order: number;
}

/**
 * Resolves signer inputs (UUID or institutional email) and CC stakeholder inputs
 * against registered rows in `public.users`.
 */
export async function resolveSignersAndCcUsers(
  supabase: SupabaseClient<Database>,
  signersInput?: SignerInputItem[],
  ccInput?: CcInputItem[]
): Promise<{
  ok: boolean;
  error?: string;
  signers?: ResolvedSignerRow[];
  ccStakeholderIds?: string[];
}> {
  const emailsToLookup = new Set<string>();
  const idsToVerify = new Set<string>();

  if (signersInput) {
    for (const s of signersInput) {
      if (s.approver_id) idsToVerify.add(s.approver_id);
      else if (s.approver_email) emailsToLookup.add(s.approver_email.toLowerCase());
    }
  }

  if (ccInput) {
    for (const cc of ccInput) {
      if (typeof cc === "string") {
        if (cc.includes("@")) emailsToLookup.add(cc.toLowerCase());
        else idsToVerify.add(cc);
      } else {
        if (cc.stakeholder_id) idsToVerify.add(cc.stakeholder_id);
        else if (cc.email) emailsToLookup.add(cc.email.toLowerCase());
      }
    }
  }

  const userById = new Map<string, { id: string; email: string }>();
  const userByEmail = new Map<string, { id: string; email: string }>();

  if (idsToVerify.size > 0) {
    const { data: idRows, error: idErr } = await supabase
      .from("users")
      .select("id, email")
      .in("id", Array.from(idsToVerify));

    if (idErr) {
      return { ok: false, error: "Failed to verify Campus User IDs." };
    }
    for (const u of idRows ?? []) {
      userById.set(u.id, u);
      userByEmail.set(u.email.toLowerCase(), u);
    }
  }

  if (emailsToLookup.size > 0) {
    const { data: emailRows, error: emailErr } = await supabase
      .from("users")
      .select("id, email")
      .in("email", Array.from(emailsToLookup));

    if (emailErr) {
      return { ok: false, error: "Failed to look up Campus User emails." };
    }
    for (const u of emailRows ?? []) {
      userById.set(u.id, u);
      userByEmail.set(u.email.toLowerCase(), u);
    }
  }

  let resolvedSigners: ResolvedSignerRow[] | undefined;
  if (signersInput !== undefined) {
    resolvedSigners = [];
    for (const s of signersInput) {
      const matched = s.approver_id
        ? userById.get(s.approver_id)
        : s.approver_email
        ? userByEmail.get(s.approver_email.toLowerCase())
        : undefined;

      if (!matched) {
        return {
          ok: false,
          error: `Approver '${
            s.approver_email ?? s.approver_id
          }' is not yet registered in PUPIS. Please select a registered campus user.`,
        };
      }

      resolvedSigners.push({
        approver_id: matched.id,
        role_title: s.role_title,
        step_order: s.step_order,
      });
    }

    // Ensure no duplicate resolved approver_id
    const uniqueIds = new Set(resolvedSigners.map((r) => r.approver_id));
    if (uniqueIds.size !== resolvedSigners.length) {
      return {
        ok: false,
        error: "Each sequential TTD signer must be a distinct campus user.",
      };
    }
  }

  let resolvedCcIds: string[] | undefined;
  if (ccInput !== undefined) {
    const ccSet = new Set<string>();
    for (const cc of ccInput) {
      let matched: { id: string; email: string } | undefined;
      let label = "";
      if (typeof cc === "string") {
        label = cc;
        matched = cc.includes("@")
          ? userByEmail.get(cc.toLowerCase())
          : userById.get(cc);
      } else {
        label = cc.email ?? cc.stakeholder_id ?? "";
        matched = cc.stakeholder_id
          ? userById.get(cc.stakeholder_id)
          : cc.email
          ? userByEmail.get(cc.email.toLowerCase())
          : undefined;
      }

      if (!matched) {
        return {
          ok: false,
          error: `CC recipient '${label}' is not yet registered in PUPIS.`,
        };
      }
      ccSet.add(matched.id);
    }
    resolvedCcIds = Array.from(ccSet);
  }

  return {
    ok: true,
    signers: resolvedSigners,
    ccStakeholderIds: resolvedCcIds,
  };
}

/**
 * Synchronizes `proposal_signers` (strictly preserving already-`signed` steps)
 * and `proposal_cc` for an editable draft/revision proposal.
 */
export async function syncProposalRouting(
  supabase: SupabaseClient<Database>,
  proposalId: string,
  resolvedSigners?: ResolvedSignerRow[],
  resolvedCcIds?: string[]
): Promise<{ ok: boolean; error?: string }> {
  if (resolvedSigners !== undefined) {
    const { data: existingSigners, error: fetchErr } = await supabase
      .from("proposal_signers")
      .select("id, approver_id, step_order, status")
      .eq("proposal_id", proposalId)
      .order("step_order", { ascending: true });

    if (fetchErr) {
      return { ok: false, error: "Unable to read existing proposal signers." };
    }

    const signedSteps = (existingSigners ?? []).filter(
      (row) => row.status === "signed"
    );

    // Verify already-signed steps were not tampered with or removed
    for (const signedRow of signedSteps) {
      const matchingIncoming = resolvedSigners.find(
        (inc) => inc.step_order === signedRow.step_order
      );
      if (
        !matchingIncoming ||
        matchingIncoming.approver_id !== signedRow.approver_id
      ) {
        return {
          ok: false,
          error: `Step ${signedRow.step_order} has already been digitally signed and cannot be removed or reordered.`,
        };
      }
    }

    // Delete all non-signed signer rows first to avoid step_order unique collisions
    const { error: deleteErr } = await supabase
      .from("proposal_signers")
      .delete()
      .eq("proposal_id", proposalId)
      .neq("status", "signed");

    if (deleteErr) {
      return { ok: false, error: "Failed to update pending signer steps." };
    }

    const signedOrdersSet = new Set(signedSteps.map((s) => s.step_order));
    const rowsToInsert = resolvedSigners
      .filter((s) => !signedOrdersSet.has(s.step_order))
      .sort((a, b) => a.step_order - b.step_order)
      .map((s) => ({
        proposal_id: proposalId,
        approver_id: s.approver_id,
        role_title: s.role_title,
        step_order: s.step_order,
        status: "pending" as const,
      }));

    if (rowsToInsert.length > 0) {
      const { error: insertErr } = await supabase
        .from("proposal_signers")
        .insert(rowsToInsert);

      if (insertErr) {
        return {
          ok: false,
          error: insertErr.message || "Failed to save sequential TTD signers.",
        };
      }
    }
  }

  if (resolvedCcIds !== undefined) {
    const { error: delCcErr } = await supabase
      .from("proposal_cc")
      .delete()
      .eq("proposal_id", proposalId);

    if (delCcErr) {
      return {
        ok: false,
        error: "Failed to update CC observer list.",
      };
    }

    if (resolvedCcIds.length > 0) {
      const ccRows = resolvedCcIds.map((stakeholderId) => ({
        proposal_id: proposalId,
        stakeholder_id: stakeholderId,
      }));

      const { error: insCcErr } = await supabase
        .from("proposal_cc")
        .insert(ccRows);

      if (insCcErr) {
        return {
          ok: false,
          error: insCcErr.message || "Failed to save CC observers.",
        };
      }
    }
  }

  return { ok: true };
}

/**
 * Loads complete proposal details including budget items, ordered signers, CC users,
 * revision logs, and short-lived signed URLs for supporting attachments.
 */
export async function fetchHydratedProposalDetail(
  supabase: SupabaseClient<Database>,
  proposalId: string
) {
  const { data: proposal, error: propError } = await supabase
    .from("proposals")
    .select(
      "*, submitter:submitter_id(id, email, full_name, organization_unit, role)"
    )
    .eq("id", proposalId)
    .maybeSingle();

  if (propError || !proposal) {
    return null;
  }

  const [
    { data: signers },
    { data: ccRows },
    { data: attachments },
    { data: revisionLogs },
  ] = await Promise.all([
    supabase
      .from("proposal_signers")
      .select(
        "*, users:approver_id(id, email, full_name, organization_unit, role)"
      )
      .eq("proposal_id", proposalId)
      .order("step_order", { ascending: true }),
    supabase
      .from("proposal_cc")
      .select(
        "id, proposal_id, stakeholder_id, added_at, users:stakeholder_id(id, email, full_name, organization_unit, role)"
      )
      .eq("proposal_id", proposalId)
      .order("added_at", { ascending: true }),
    supabase
      .from("proposal_attachments")
      .select("*")
      .eq("proposal_id", proposalId)
      .order("created_at", { ascending: true }),
    supabase
      .from("revision_logs")
      .select(
        "*, users:actor_id(id, email, full_name, organization_unit, role)"
      )
      .eq("proposal_id", proposalId)
      .order("created_at", { ascending: true }),
  ]);

  const signerList = signers ?? [];
  const pendingOrders = signerList
    .filter((s) => s.status === "pending")
    .map((s) => s.step_order)
    .sort((a, b) => a - b);
  const lowestPendingStepOrder =
    proposal.status === "pending_ttd" && pendingOrders.length > 0
      ? pendingOrders[0]
      : null;

  let optionalAdminStorageClient: SupabaseClient<Database> | null = null;
  if (normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    try {
      optionalAdminStorageClient = createAdminClient();
    } catch {
      optionalAdminStorageClient = null;
    }
  }

  const [attachmentsWithUrls, signersWithUrls] = await Promise.all([
    Promise.all(
      (attachments ?? []).map(async (att) => {
        const { data: signed } = await supabase.storage
          .from(PROPOSAL_ATTACHMENTS_BUCKET)
          .createSignedUrl(att.storage_path, ATTACHMENT_SIGNED_URL_TTL_SECONDS);

        let resolvedUrl = signed?.signedUrl ?? null;
        if (!resolvedUrl && optionalAdminStorageClient) {
          const { data: adminSigned } = await optionalAdminStorageClient.storage
            .from(PROPOSAL_ATTACHMENTS_BUCKET)
            .createSignedUrl(
              att.storage_path,
              ATTACHMENT_SIGNED_URL_TTL_SECONDS
            );
          resolvedUrl = adminSigned?.signedUrl ?? null;
        }

        return {
          ...att,
          signed_url: resolvedUrl,
        };
      })
    ),
    Promise.all(
      signerList.map(async (s) => {
        let signatureSignedUrl: string | null = null;
        if (s.status === "signed" && s.signature_storage_path) {
          const { data: sigUrlData } = await supabase.storage
            .from(SIGNATURES_BUCKET)
            .createSignedUrl(s.signature_storage_path, SIGNED_URL_TTL_SECONDS);
          signatureSignedUrl = sigUrlData?.signedUrl ?? null;

          if (!signatureSignedUrl && optionalAdminStorageClient) {
            const { data: adminSigUrl } =
              await optionalAdminStorageClient.storage
                .from(SIGNATURES_BUCKET)
                .createSignedUrl(
                  s.signature_storage_path,
                  SIGNED_URL_TTL_SECONDS
                );
            signatureSignedUrl = adminSigUrl?.signedUrl ?? null;
          }
        }

        return {
          ...s,
          approver: Array.isArray(s.users) ? s.users[0] ?? null : s.users ?? null,
          is_active_turn:
            lowestPendingStepOrder !== null &&
            s.status === "pending" &&
            s.step_order === lowestPendingStepOrder,
          signature_signed_url: signatureSignedUrl,
        };
      })
    ),
  ]);

  const submitterUser = Array.isArray(proposal.submitter)
    ? proposal.submitter[0] ?? null
    : proposal.submitter ?? null;

  return {
    ...proposal,
    submitter: submitterUser,
    active_step_order: lowestPendingStepOrder,
    budget_items: parseBudgetItemsFromJson(proposal.budget_items),
    signers: signersWithUrls,
    cc_users: (ccRows ?? []).map((c) => ({
      ...c,
      stakeholder: Array.isArray(c.users) ? c.users[0] ?? null : c.users ?? null,
    })),
    attachments: attachmentsWithUrls,
    revision_logs: (revisionLogs ?? []).map((log) => ({
      ...log,
      actor: Array.isArray(log.users) ? log.users[0] ?? null : log.users ?? null,
    })),
  };
}
