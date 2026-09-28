/**
 * One source of truth for "may this gateway endpoint be stored, and can it be
 * resolved later?".
 *
 * The host settings schema and the browser form must agree exactly. When they
 * drift, the form accepts a value the schema then refuses, and the user sees
 * schemastery's raw `$.baseURL expect string to match regexp …` instead of the
 * localized message; worse, a value the schema accepts but
 * {@link normalizeBaseUrl} rejects stores cleanly and then throws where the
 * adapter's `options()` swallows it, leaving the page showing an endpoint the
 * request loop never uses.
 *
 * Both layers therefore classify with the same predicate, and the pattern below
 * is deliberately a CONSERVATIVE grammar rather than an approximation of the
 * WHATWG URL parser. Making it conservative is what turns "no silent redirect
 * of the API key" from a fuzzing hope into something provable: every shape the
 * pattern admits is one the parser handles without rewriting the authority or
 * moving the path root. Concretely the pattern refuses, by construction,
 *   - a final host label that starts with a digit (so the parser cannot read it
 *     as IPv4 and rewrite `https://9` → `0.0.0.9` or `https://0xdeadbeef` →
 *     `222.173.190.239`),
 *   - `%` anywhere in the path (so no encoded dot, slash, or backslash can
 *     smuggle a `.`/`..` segment or a separator past the literal checks),
 *   - `\` anywhere in the path (the parser treats it as `/` for http/https),
 *   - a segment consisting only of `.` or `..`,
 *   - an empty path segment (`//`), and
 *   - leading zeros in the port (so the stored port is the parsed port).
 *
 * This module is shared with the browser bundle, so it must stay free of Node
 * built-ins: only `RegExp`, `URL`, and `decodeURIComponent` are used, all of
 * which exist in both the host and the renderer.
 */

/** One in-range decimal IPv4 octet (no leading zeroes, as the parser requires). */
const OCTET = String.raw`(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)`;
/** A dotted quad. */
const IPV4 = String.raw`(?:${OCTET}\.){3}${OCTET}`;
/** One 16-bit hex group. */
const H16 = String.raw`[0-9A-Fa-f]{1,4}`;
/** The right-most 32 bits: either two hex groups or a dotted quad. */
const LS32 = String.raw`(?:${H16}:${H16}|${IPV4})`;
/**
 * The full WHATWG IPv6 grammar, one alternative per position of the `::`
 * compression. A looser rule (for example "two colons and a hex digit") admits
 * `[1:2:3]` and `[::1::]`, which `new URL()` then refuses — the exact
 * store-then-fail gap this module exists to close. Measured against 1.5M random
 * inputs, this alternation diverges from the parser in neither direction.
 */
const IPV6 = String.raw`(?:` +
  String.raw`(?:${H16}:){6}${LS32}` +
  String.raw`|::(?:${H16}:){5}${LS32}` +
  String.raw`|(?:${H16})?::(?:${H16}:){4}${LS32}` +
  String.raw`|(?:(?:${H16}:){0,1}${H16})?::(?:${H16}:){3}${LS32}` +
  String.raw`|(?:(?:${H16}:){0,2}${H16})?::(?:${H16}:){2}${LS32}` +
  String.raw`|(?:(?:${H16}:){0,3}${H16})?::${H16}:${LS32}` +
  String.raw`|(?:(?:${H16}:){0,4}${H16})?::${LS32}` +
  String.raw`|(?:(?:${H16}:){0,5}${H16})?::${H16}` +
  String.raw`|(?:(?:${H16}:){0,6}${H16})?::` +
  String.raw`)`;
/**
 * A dotted hostname whose final label begins with a letter. Requiring a letter
 * (not merely "contains a letter") is what keeps every numeric spelling the
 * parser would reinterpret out of the accepted set: `9`, `0x7f`, `0177`, and
 * `0xdeadbeef` all start with a digit and are refused, while `localhost`,
 * `example.com`, and `api-gw.internal` pass. A trailing dot is the root label.
 * IPv4 literals are handled by {@link IPV4} instead, so plain dotted quads still
 * work.
 */
const HOSTNAME = String.raw`(?:[\p{L}\p{N}_~-]+\.)*\p{L}[\p{L}\p{N}_~-]*\.?`;
/**
 * A port bounded to 0-65535 with no leading zeros, so the value stored is
 * exactly the value parsed (`:080` and `:00000` are refused rather than being
 * silently rewritten to `:80` and `:0`).
 */
const PORT =
  String.raw`(?::(?:0|[1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5]))?`;
/**
 * A path segment: at least one character that is not a separator, an encoded
 * byte, `@`, or whitespace, and not a bare `.` or `..`. Excluding `%`, `\`, and
 * `@` here is what makes the dot-segment rule airtight.
 */
const SEGMENT = String.raw`/(?!\.{1,2}(?:[/\\?#]|$))[^/\\%?#@\s]+`;
/**
 * A path of non-empty segments. Extra trailing slashes are permitted because
 * the resolver strips every one of them, so `…/v1////` and `…/v1/` are the same
 * endpoint; empty segments *inside* the path stay refused.
 */
const PATH = String.raw`(?:${SEGMENT})*/*`;
/**
 * A query string and/or fragment. Their content is never used — the resolver
 * clears both before building a request URL — so it is matched loosely. The
 * trailing `$` anchoring every branch is what stops `https://gw/v1 extra` from
 * being stored and then normalized into `/v1%20extra`.
 */
const TAIL = String.raw`(?:\?[^\s]*)?(?:#[^\s]*)?`;

/**
 * Shape every `baseURL` must have before it is persisted. Because no
 * alternative above can express a separator the parser would reinterpret, a
 * value matching this pattern is one {@link classifyBaseUrl} and
 * `normalizeBaseUrl` accept too. The assertion is checked by differential fuzz,
 * but it holds by construction, not by luck.
 */
export const BASE_URL_PATTERN = new RegExp(
  String.raw`^https?:\/\/(?:\[${IPV6}\]|${IPV4}|${HOSTNAME})${PORT}${PATH}${TAIL}$`,
  "iu",
);

/**
 * Why a `baseURL` may not be used. `undefined` means "acceptable".
 *
 * A reason is returned rather than a boolean so the browser can keep reporting
 * one localized message while the host can name the specific defect in its
 * thrown error.
 */
export type BaseUrlProblem =
  | "empty"
  | "scheme"
  | "invalid"
  | "credentials"
  | "rewritten"
  | "dot-segments"
  | "encoded-separator"
  | "shape";

/**
 * The host the user literally typed, before the URL parser can reinterpret it.
 *
 * `URL` guesses a host's form and may rewrite it (`https://9` → `0.0.0.9`), so
 * comparing this against `url.hostname` is the only way to notice that the
 * parser changed the destination. Bracketed IPv6 literals are unwrapped, since
 * `url.hostname` reports them without brackets.
 * @param raw - the trimmed endpoint, with or without a chat path.
 * @returns the authority with userinfo, port, and IPv6 brackets removed.
 */
export function typedHostOf(raw: string): string {
  const authority = raw.replace(/^https?:\/\//i, "").split(/[/\\?#]/)[0] ?? "";
  const withoutUser = authority.replace(/^.*@/, "");
  if (withoutUser.startsWith("[")) {
    const end = withoutUser.indexOf("]");
    return end === -1 ? withoutUser : withoutUser.slice(1, end);
  }
  return withoutUser.replace(/:\d*$/, "");
}

/**
 * Whether the path contains a `.` or `..` segment, including its percent-encoded
 * spelling and its backslash-separated spelling. Checked against the raw string
 * because `new URL()` has already resolved — and erased — these by the time the
 * parsed path is available, and because the parser accepts `\` as a separator
 * for http/https.
 * @param raw - the endpoint, after the scheme.
 * @returns true when a segment would move the request root.
 */
export function hasDotSegment(raw: string): boolean {
  const afterAuthority = raw.replace(/^https?:\/\//i, "").replace(/^[^/\\?#]*/, "");
  const path = afterAuthority.split(/[?#]/, 1)[0] ?? "";
  for (const segment of path.split(/[/\\]/)) {
    let decoded = segment;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      // A malformed escape cannot be a dot segment; keep the raw text.
    }
    if (decoded === "." || decoded === "..") return true;
  }
  return false;
}

/**
 * Classify an endpoint against every rule the store and the resolver share.
 *
 * Callers must apply this to the value they are about to persist (the browser)
 * or resolve (the adapter), so the accepted set is identical on both sides. The
 * shape test comes first and is conservative enough that the checks after it
 * cannot fire on a shape the pattern admitted; they remain because
 * `normalizeBaseUrl` also sees values from a hand-edited profile or the
 * environment, which never pass through the settings schema.
 * @param raw - the candidate endpoint. Surrounding whitespace is ignored;
 *   callers still trim what they write.
 * @returns the first defect found, or `undefined` when the value is usable.
 */
export function classifyBaseUrl(raw: string): BaseUrlProblem | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "empty";
  // Trailing slashes are stripped before parsing so the checks below see the
  // same value the resolver will (it trims them first).
  const base = trimmed.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) return "scheme";
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return "invalid";
  }
  if (url.username !== "" || url.password !== "") return "credentials";
  if (/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) && typedHostOf(base) !== url.hostname) {
    return "rewritten";
  }
  if (hasDotSegment(base)) return "dot-segments";
  if (pathOf(base).includes("%")) return "encoded-separator";
  if (!BASE_URL_PATTERN.test(trimmed)) return "shape";
  return undefined;
}

/**
 * The path portion of an endpoint, with the authority and any query/fragment
 * removed. Used to apply the path-only rules without re-parsing.
 * @param raw - the endpoint, after the scheme.
 */
export function pathOf(raw: string): string {
  const afterAuthority = raw.replace(/^https?:\/\//i, "").replace(/^[^/\\?#]*/, "");
  return afterAuthority.split(/[?#]/, 1)[0] ?? "";
}
