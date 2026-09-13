# dsh-llm-neuralwatt

Native DeepSeek Harness (DSH) plugin for the Neuralwatt OpenAI-compatible API.

## Features

- `neuralwatt` provider at `https://api.neuralwatt.com/v1`
- Secure, write-only API-key storage through DSH credentials
- Chat-completions streaming, tool calls, and model discovery
- Web Settings page for credentials and model catalog management
- A quota panel that reads `GET /v1/quota` and presents credits, subscription energy, usage, rate-limit tier, and key allowance

## Install for local development

```sh
dsh plugin --profile web add --save-exact file:/absolute/path/to/dsh-llm-neuralwatt
```

Restart DSH Web, then open **Settings → Neuralwatt**, save an API key, fetch models, and select a Neuralwatt model.

## Quota reporting

The quota panel calls the provider's authenticated `/v1/quota` endpoint. It uses the same response semantics as the Pi extension: balance, subscription/energy quota, monthly usage, limits, and key allowance. The adapter is configured for `openai-completions`; Neuralwatt compatibility defaults use `max_tokens` and avoid the developer role.

## Development

```sh
pnpm install
pnpm run typecheck
pnpm run build
```

This plugin targets DSH `0.1.5-rc`.
