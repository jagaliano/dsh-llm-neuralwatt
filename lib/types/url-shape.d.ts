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
 *   - leading zeros in the port (so the stored port is the parsed port), and
 *   - any non-ASCII host (so IDNA punycoding, the bidi rule, and the rest of
 *     UTS-46 cannot rewrite or reject a host the pattern let through).
 *
 * This module is shared with the browser bundle, so it must stay free of Node
 * built-ins: only `RegExp`, `URL`, and `decodeURIComponent` are used, all of
 * which exist in both the host and the renderer.
 */
/**
 * Shape every `baseURL` must have before it is persisted. Because no
 * alternative above can express a separator the parser would reinterpret, a
 * value matching this pattern is one {@link classifyBaseUrl} and
 * `normalizeBaseUrl` accept too, including when it arrives in uppercase.
 *
 * The pattern carries the Unicode flag but deliberately NOT the `i` flag. The
 * scheme is spelled out ([Hh][Tt][Tt][Pp][Ss]) because case-insensitive matching
 * in Unicode mode folds non-ASCII characters onto ASCII ones — U+017F (long s)
 * folds to `s` — which would let such a character satisfy `[A-Za-z]` while also
 * escaping the `[^\x00-\x7F]` ASCII guard, since that negated range folds too. The assertion is checked by differential fuzz,
 * but it holds by construction, not by luck.
 */
export declare const BASE_URL_PATTERN: RegExp;
/**
 * Why a `baseURL` may not be used. `undefined` means "acceptable".
 *
 * A reason is returned rather than a boolean so the browser can keep reporting
 * one localized message while the host can name the specific defect in its
 * thrown error.
 */
export type BaseUrlProblem = "empty" | "scheme" | "invalid" | "credentials" | "rewritten" | "dot-segments" | "encoded-separator" | "shape";
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
export declare function typedHostOf(raw: string): string;
/**
 * Whether the path contains a `.` or `..` segment, including its percent-encoded
 * spelling and its backslash-separated spelling. Checked against the raw string
 * because `new URL()` has already resolved — and erased — these by the time the
 * parsed path is available, and because the parser accepts `\` as a separator
 * for http/https.
 * @param raw - the endpoint, after the scheme.
 * @returns true when a segment would move the request root.
 */
export declare function hasDotSegment(raw: string): boolean;
/**
 * Classify an endpoint against every rule the store and the resolver share.
 *
 * Callers must apply this to the value they are about to persist (the browser)
 * or resolve (the adapter), so the accepted set is identical on both sides. The
 * shape test comes first and is conservative enough that the checks after it
 * cannot fire on a shape the pattern admitted; they remain because
 * `normalizeBaseUrl` also sees values from a hand-edited profile or the
 * environment, which never pass through the settings schema.
 * @param raw - the candidate endpoint, tested exactly as given. Callers trim
 *   before writing (the browser form) or before resolving (the adapter), so a
 *   whitespace-padded value is refused here rather than silently accepted.
 * @returns the first defect found, or `undefined` when the value is usable.
 */
export declare function classifyBaseUrl(raw: string): BaseUrlProblem | undefined;
/**
 * The path portion of an endpoint, with the authority and any query/fragment
 * removed. Used to apply the path-only rules without re-parsing.
 * @param raw - the endpoint, after the scheme.
 */
export declare function pathOf(raw: string): string;
