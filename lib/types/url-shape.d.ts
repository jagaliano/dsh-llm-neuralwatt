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
 * parser changed the destination.
 * @param raw - the trimmed endpoint, with or without a chat path.
 * @returns the authority with userinfo, port, and IPv6 brackets removed.
 */
export declare function typedHostOf(raw: string): string;
/**
 * Whether the path contains a `.` or `..` segment, including its percent-encoded
 * spelling. Checked against the raw string because `new URL()` has already
 * resolved (and erased) these by the time the parsed path is available.
 * @param raw - the endpoint, after the scheme.
 * @returns true when a segment would move the request root.
 */
export declare function hasDotSegment(raw: string): boolean;
/**
 * Classify an endpoint against every rule the store and the resolver share.
 *
 * Callers must apply this to the value they are about to persist (the browser)
 * or resolve (the adapter), so the accepted set is identical on both sides.
 * @param raw - the candidate endpoint. Surrounding whitespace is ignored;
 *   callers still trim what they write.
 * @returns the first defect found, or `undefined` when the value is usable.
 */
export declare function classifyBaseUrl(raw: string): BaseUrlProblem | undefined;
