# dsh-llm-neuralwatt

Native DeepSeek Harness (DSH) plugin for the Neuralwatt OpenAI-compatible API.

## Features

- `neuralwatt` provider at `https://api.neuralwatt.com/v1`
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

