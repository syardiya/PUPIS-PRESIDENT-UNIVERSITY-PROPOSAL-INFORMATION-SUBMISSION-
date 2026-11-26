/**
 * Trims surrounding whitespace and accidental wrapping quotes from environment values.
 */
export function normalizeEnvValue(rawValue: string | undefined): string {
  if (!rawValue) return "";
  return rawValue.trim().replace(/^['"]+|['"]+$/g, "").trim();
}

/**
 * Normalizes `NEXT_PUBLIC_SUPABASE_URL` to a strict `{protocol}//{host}` origin
 * (e.g. `https://<project-ref>.supabase.co`), stripping trailing slashes or
 * accidental path segments (`/auth/v1`, `/rest/v1`, etc.) that cause Supabase's
 * gateway to reject requests with `Invalid path specified in request URL`.
 */
export function normalizeSupabaseUrl(rawUrl: string | undefined): string {
  const cleaned = normalizeEnvValue(rawUrl);
  if (!cleaned) {
    return "";
  }

  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.origin;
  } catch {
    return "";
  }
}

/**
 * Resolves a clean `{protocol}//{host}` application origin without trailing slashes,
 * double slashes, or path suffixes, preferring an explicit browser/forwarded origin
 * and falling back to `NEXT_PUBLIC_APP_URL` or `http://localhost:3000`.
 */
export function resolveCleanAppOrigin(preferredOrigin?: string | null): string {
  const envAppUrl = normalizeEnvValue(process.env.NEXT_PUBLIC_APP_URL);
  const candidates = [preferredOrigin, envAppUrl, "http://localhost:3000"];

  for (const candidate of candidates) {
    const cleaned = normalizeEnvValue(candidate ?? undefined);
    if (!cleaned) continue;

    try {
      const parsed = new URL(cleaned);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.origin;
      }
    } catch {
      // Try next fallback candidate
    }
  }

  return "http://localhost:3000";
}

/**
 * Constructs a clean Magic Link callback URL (`${origin}/auth/callback`)
 * without double slashes or extra query parameters so it matches Supabase's
 * Redirect URLs allowlist cleanly.
 */
export function buildAuthCallbackUrl(preferredOrigin?: string | null): string {
  const origin = resolveCleanAppOrigin(preferredOrigin);
  return `${origin}/auth/callback`;
}
