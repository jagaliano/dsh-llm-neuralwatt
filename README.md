# dsh-llm-neuralwatt

Native DeepSeek Harness (DSH) plugin for the Neuralwatt OpenAI-compatible API.

## Features

- `neuralwatt` provider defaulting to the public gateway at `https://api.neuralwatt.com/v1/chat/completions` (fully editable; a bare `/v1` root is accepted too)
- Secure, write-only API-key storage through DSH credentials
- Chat-completions streaming, tool calls, and model discovery
- Web Settings page for credentials and model catalog management
- A quota panel that reads `GET /v1/quota` and presents credits, subscription energy, usage, rate-limit tier, and key allowance

## Compatibility

This plugin targets the DSH `0.1.7-rc` line (`0.1.7-rc.2` in development) and
declares its `@deepseek-ai/dsh-*` peers so the host's compatibility gate accepts
it. Two contracts of that line are load-bearing:

- **Settings fields must be marked volatile.** DSH `0.1.7` projects a plugin's
  `Config` schema through `volatileForm()`, so only fields carrying
  `meta.volatile` are described or writable. Every field here is marked (see
  `src/config-volatile.ts`); without the marks the `llm-neuralwatt` namespace is
  absent from `settings.describe()` and every write fails with
  `no volatile fields`, which leaves the Neuralwatt page blank and unsavable.
- **A volatile field parses to a live reference, not a plain value.** The loader
  resolves marked fields to frozen `{ get() }` handles, commits a settings write
  in place, and does **not** remount the plugin. `apply` therefore unwraps the
  config on every read, so a saved base URL, catalog, or retry policy reaches the
  next request without a restart.

`@deepseek-ai/schemastery` is pinned to `~3.18.4` because `.volatile()` is a
3.18.3+ method.

Both install routes work. Prefer `file:`, which copies the plugin into the
profile and leaves every `@deepseek-ai/*` import to the host installation — one
module instance, which is what keeps `LlmError` `instanceof` checks intact.

## Install for local development

```sh
dsh plugin --profile web add --save-exact file:/absolute/path/to/dsh-llm-neuralwatt
```

A `link:` install also works: DSH's runtime resolver routes each package the
plugin declares as a peer to the host installation's copy, so the plugin's own
`node_modules` does not shadow the host's instances.

Restart DSH Web, then open **Settings → Neuralwatt**, save an API key, fetch models, and select a Neuralwatt model.

## Configuring the endpoint

`baseURL` defaults to `https://api.neuralwatt.com/v1/chat/completions` and is
fully editable in the settings page, in `cordis.patch.yml`, or through
`$NEURALWATT_BASE_URL` from a trusted environment layer (a saved value beats the
environment, which beats the default). Both forms are accepted and resolve to
the same host:

| Value | Chat | Discovery | Quota |
| --- | --- | --- | --- |
| `https://api.neuralwatt.com/v1/chat/completions` | `/v1/chat/completions` | `/v1/models` | `/v1/quota` |
| `https://api.neuralwatt.com/v1` | `/v1/chat/completions` | `/v1/models` | `/v1/quota` |

A trailing `/chat/completions` is stripped case-insensitively (and a query
string or fragment is dropped) before those paths are appended, so a full
endpoint never turns into `/chat/completions/models`. A path that merely
contains those words, such as a reverse-proxy prefix, is left untouched.
The strip repeats to a fixed point, so an endpoint that repeats the suffix
(`…/chat/completions/chat/completions`) still reduces to the API root.
Trailing slashes are removed from the path itself, so
`https://host/v1/chat/completions/?x=1` normalizes exactly like the bare
endpoint.

An unusable value is refused when you save it, not silently ignored: the field
must be an `http(s)` URL naming a real host, with no embedded credentials.
That means a full dotted-quad IPv4 address or a hostname whose final label
begins with a letter, an optional port from 0 to 65535 written without leading
zeros, and — for IPv6 — a bracketed literal such as `http://[::1]:8080/v1`.
`https://user:pass@host` is rejected; put the API key on the Models page
instead. Ambiguous spellings the URL parser would silently rewrite are refused
too: `https://9` would become `0.0.0.9`, `https://1.2.3` would become
`1.2.0.3`, and `0xdeadbeef` would become `222.173.190.239`. Accepting one of
those would send your API key to a host you never named. A path segment of `.`
or `..` is refused as well, because the URL parser resolves it before anything
else runs and would move the request root — and the API key with it — somewhere
you did not type; the check covers the backslash spelling too, since the parser
treats `\` as `/` for http(s). For the same reason the path may not contain a
percent sign — an encoded dot, slash, or backslash could smuggle a segment or
separator past the literal checks — and may not contain an empty segment.

The check runs in two layers driven by one shared predicate, so they cannot
disagree: the settings schema rejects the value on save, and `normalizeBaseUrl`
refuses the same shapes again at request time, so a value that arrives from a
hand-edited profile or `$NEURALWATT_BASE_URL` cannot bypass it. This matters
because a value accepted but unusable at request time would leave the adapter
serving the *previous* endpoint while the page displayed the new one.

## Quota reporting

The quota panel calls the provider's authenticated `/v1/quota` endpoint. It uses the same response semantics as the Pi extension: balance, subscription/energy quota, monthly usage, limits, and key allowance. The adapter is configured for `openai-completions`; Neuralwatt compatibility defaults use `max_tokens` and avoid the developer role.

## Development

```sh
pnpm install
pnpm run typecheck
pnpm run build
```

`pnpm run build` writes `lib/` — the artifact a profile loads — so rebuild after
every `src/` change.

