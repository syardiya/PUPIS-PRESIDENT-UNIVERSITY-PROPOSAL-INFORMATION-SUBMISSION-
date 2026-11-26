const DEFAULT_ALLOWED_EMAIL_DOMAINS = [
  "student.president.ac.id",
  "president.ac.id",
] as const;

const BASIC_EMAIL_LOCAL_PART_REGEX = /^[A-Za-z0-9._%+-]+$/;

/**
 * Returns normalized list of allowed institutional email domains from
 * `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS` (falling back to canonical PU domains).
 */
export function getAllowedEmailDomains(): string[] {
  const raw = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS;
  if (!raw || raw.trim() === "") {
    return [...DEFAULT_ALLOWED_EMAIL_DOMAINS];
  }

  const parsed = raw
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@+/, ""))
    .filter((domain) => domain.length > 0);

  return parsed.length > 0 ? parsed : [...DEFAULT_ALLOWED_EMAIL_DOMAINS];
}

/**
 * Safely extracts the lowercase domain portion of an email address, or null if malformed.
 */
export function extractEmailDomain(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  const atIndex = normalized.indexOf("@");
  if (atIndex <= 0 || atIndex !== normalized.lastIndexOf("@")) {
    return null;
  }

  const localPart = normalized.slice(0, atIndex);
  const domainPart = normalized.slice(atIndex + 1);

  if (!localPart || !domainPart || !BASIC_EMAIL_LOCAL_PART_REGEX.test(localPart)) {
    return null;
  }

  return domainPart;
}

/**
 * Validates that an email strictly belongs to an allowed President University domain.
 */
export function isAllowedInstitutionalEmail(
  email: string | null | undefined
): email is string {
  if (!email) return false;
  const domain = extractEmailDomain(email);
  if (!domain) return false;

  const allowedDomains = getAllowedEmailDomains();
  return allowedDomains.includes(domain);
}

/**
 * Safely sanitizes an internal redirect target to prevent Open Redirect attacks.
 */
export function sanitizeRedirectPath(
  nextParam: string | null | undefined,
  fallback = "/dashboard"
): string {
  if (!nextParam) return fallback;
  const trimmed = nextParam.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return fallback;
  }
  return trimmed;
}
