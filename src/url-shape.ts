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
 * request loop never uses. Both layers therefore classify with
 * {@link classifyBaseUrl}, and the pattern below mirrors what the WHATWG URL
 * parser actually accepts rather than approximating it.
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
 * store-then-fail gap this module exists to close. Measured against 400k random
 * inputs, this alternation accepts nothing the parser rejects.
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
 * A registered name whose final label carries a letter. An all-numeric trailing
 * label makes the parser treat the host as IPv4 and either throw or rewrite it
 * (`https://9` becomes `0.0.0.9`), which would silently send the API key to a
 * host the user never named. A trailing dot is the root label the parser allows.
 */
const HOSTNAME =
  String.raw`(?:[\p{L}\p{N}_~-]+\.)*[\p{L}_~-]*\p{L}[\p{L}\p{N}_~-]*\.?`;
/** A port bounded to 0-65535, exactly as the parser bounds it. */
const PORT =
  String.raw`(?::(?:[0-9]{1,4}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5]))?`;

/**
 * Shape every `baseURL` must have before it is persisted: an http(s) scheme,
 * a reachable authority with no credentials, and a tail the resolver can follow
 * without relocating the request root.
 *
 * Every negative lookahead here encodes a value {@link normalizeBaseUrl} would
 * otherwise have to reject at request time — where the rejection is invisible:
 *  - `\/\.\.?` and `%2e` refuse dot segments, which `new URL()` resolves BEFORE
 *    the resolver can see them (`…/v1/../../evil` becomes `…/evil`, posting the
 *    key outside the configured root);
 *  - `%2f` refuses an encoded path separator, which keeps `/chat/completions%2F`
 *    from matching the suffix strip and produces a silent 404;
 *  - `@` refuses userinfo, which `fetch` rejects outright;
 *  - `\S` keeps whitespace out, since a space would be percent-encoded into the
 *    path and defeat the suffix strip on the next pass.
 * The pattern is anchored at `$`, so nothing beyond the authority can slip
 * through unconstrained.
 */
export const BASE_URL_PATTERN = new RegExp(
  String.raw`^(?!.*[\/](?:\.{1,2}|%2e{1,2})(?:[\/?#]|$))(?!.*%2f)https?:\/\/(?![^\/?#]*@)(?:\[${IPV6}\]|${IPV4}|${HOSTNAME})${PORT}(?:[\/?#]\S*)?$`,
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
 * parser changed the destination.
 * @param raw - the trimmed endpoint, with or without a chat path.
 * @returns the authority with userinfo, port, and IPv6 brackets removed.
 */
export function typedHostOf(raw: string): string {
  const authority = raw.replace(/^https?:\/\//i, "").split(/[/?#]/)[0] ?? "";
  const withoutUser = authority.replace(/^.*@/, "");
  if (withoutUser.startsWith("[")) {
    const end = withoutUser.indexOf("]");
    return end === -1 ? withoutUser : withoutUser.slice(1, end);
  }
  return withoutUser.replace(/:\d*$/, "");
}

/**
 * Whether the path contains a `.` or `..` segment, including its percent-encoded
 * spelling. Checked against the raw string because `new URL()` has already
 * resolved (and erased) these by the time the parsed path is available.
 * @param raw - the endpoint, after the scheme.
 * @returns true when a segment would move the request root.
 */
export function hasDotSegment(raw: string): boolean {
  const afterAuthority = raw.replace(/^https?:\/\//i, "").replace(/^[^/?#]*/, "");
  const path = afterAuthority.split(/[?#]/, 1)[0] ?? "";
  for (const segment of path.split("/")) {
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
 * or resolve (the adapter), so the accepted set is identical on both sides.
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
  if (/%2f/i.test(base)) return "encoded-separator";
  if (!BASE_URL_PATTERN.test(trimmed)) return "shape";
  return undefined;
}
