/**
 * Register a {@link NeuralwattAdapter} for the `neuralwatt` provider route on
 * `ctx.llm`, with connection facts resolved per request instead of frozen at
 * load. The `llm-neuralwatt` namespace is derived from this module's exported
 * {@link Config} schema: every field is marked volatile, so the 0.1.7 settings
 * service describes and accepts writes to it, and the loader commits such a
 * write into the running fiber's live references WITHOUT remounting it. The
 * plugin therefore reads its config per request, so a changed base URL,
 * catalog, or retry policy reaches the very next request without restarting
 * anything, while an in-flight stream keeps the facts it started with. The API
 * key resolves through the optional credential seam (`ctx.credentials`). The
 * plugin also serves model discovery for the `llm-neuralwatt` settings
 * namespace by interrogating `GET {baseURL}/models`.
 * @module dsh-llm-neuralwatt
 */
import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import type { RetryPolicyConfig } from "@deepseek-ai/dsh-llm";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import type { NeuralwattCatalogModel, NeuralwattConnectionOptions } from "./adapter.ts";
import type { ProviderHints } from "./types.ts";
export { DEFAULT_CONTEXT_WINDOW, DEFAULT_MODEL_EXCLUDE_PATTERNS, DEFAULT_PROVIDER_HINTS, DEFAULT_STREAM_IDLE_TIMEOUT_MS, matchModelsDev, modelNameFromId, NeuralwattAdapter, normalizeBaseUrl, PKG, } from "./adapter.ts";
export { serializeRequest } from "./serialize.ts";
export { isVolatileRef, markVolatile, markVolatileFields, unwrapVolatileConfig, } from "./config-volatile.ts";
export type { VolatileRef } from "./config-volatile.ts";
export type { NeuralwattAdapterOptions, NeuralwattCatalogModel, NeuralwattConnectionOptions, } from "./adapter.ts";
export type * from "./types.ts";
export declare const name = "llm-neuralwatt";
export declare const inject: string[];
/** Gateway base used when neither config nor environment names one. */
export declare const DEFAULT_BASE_URL = "https://api.neuralwatt.com/v1/chat/completions";
/**
 * Plugin config, validated by the same-named schemastery schema and doubling
 * as the `llm-neuralwatt` settings-section shape. Every field is optional in
 * yml: `baseURL` falls back to $NEURALWATT_BASE_URL from a trusted environment
 * layer, then to {@link DEFAULT_BASE_URL}, the public Neuralwatt
 * chat-completions endpoint, so an unconfigured install talks to the real
 * service as soon as a key is stored. The setting stays fully editable: any
 * endpoint or bare API root is accepted, and the chat suffix is stripped at
 * {@link normalizeBaseUrl} so discovery and quota land on the same host.
 * The API key is not a config value at all: it lives in the
 * credentials store under the fixed reference `neuralwatt` (the web settings
 * page writes it), and a request without any stored key fails with
 * `MISSING_CREDENTIAL`, not at plugin load.
 */
export interface Config {
    /** Chat-completions endpoint; defaults to $NEURALWATT_BASE_URL from a trusted layer, then `https://api.neuralwatt.com/v1/chat/completions`. A bare API root is equally accepted — the chat suffix is stripped and re-appended per call. */
    baseURL?: string;
    /**
     * Credential reference the adapter and the shared Models page both resolve
     * the API key through. Defaults to the `neuralwatt` route reference; the
     * generic Models page reads this conventional field to join the provider
     * with `credentials.describe()`, so it can render its credential dot. It is
     * not an editable input on the dedicated Neuralwatt page, but a profile that
     * sets it in `cordis.patch.yml` does get the credential it names.
     */
    apiKeyEnv?: string;
    /** Advisory models shown by discovery consumers; defaults to none — a gateway's model set is deployment-specific. */
    models?: NeuralwattCatalogModel[];
    /**
     * Case-insensitive id substrings excluding discovered models that cannot
     * serve chat completions (embedding, rerank, ranker families). Replaces the
     * default {@link DEFAULT_MODEL_EXCLUDE_PATTERNS} list; an empty array
     * disables filtering. The hand-curated {@link models} catalog is unaffected.
     */
    modelExcludePatterns?: string[];
    /** Positive context capacity used when the selected model has no exact value (default 128,000). */
    defaultContextWindow?: number;
    /** Default per-request output cap; omission sends no cap and lets each upstream default apply. */
    maxTokens?: number;
    /** Maximum gateway idle time while one stream read is outstanding (default five minutes). */
    streamIdleTimeoutMs?: number;
    /**
     * Forward proxy for the models.dev catalog download performed by the
     *「更新模型信息」action: disabled by default; when enabled, that one
     * request is routed through `proxy.url` (a plain HTTP forward proxy).
     * Gateway traffic is untouched.
     */
    proxy?: ProxyConfig;
    /**
     * Match-shaping hints for the models.dev params lookup: family prefixes
     * and exact ids name which catalog provider counts as official (leading
     * match, flagged). Built-in families (glm→zai, gpt→openai, claude→
     * anthropic, …) apply first; these entries override and extend them.
     */
    providerHints?: ProviderHints;
    /** Provider-owned model-request retry policy; omission uses normal defaults. */
    retryPolicy?: RetryPolicyConfig;
}
/** Forward-proxy settings for the models.dev catalog download. */
export interface ProxyConfig {
    /** Whether the proxy is used; defaults to false. */
    enabled?: boolean;
    /** Proxy URL; presets default to `http://127.0.0.1:7890`. */
    url?: string;
}
/** Default forward proxy: the conventional Clash port on loopback. */
export declare const DEFAULT_PROXY_URL = "http://127.0.0.1:7890";
/**
 * The `llm-neuralwatt` profile Config.
 *
 * Every field is marked volatile: on dsh 0.1.7 the settings service projects a
 * plugin's schema through `volatileForm()`, so a namespace with no marked
 * field does not appear in `describe()` at all and every write to it is
 * refused with `has no volatile fields` — which is what makes the dedicated
 * Neuralwatt section fail to load and save. Marking is also what lets a write
 * reach the running plugin without remounting it (see the `current()` reader
 * in {@link apply}).
 *
 * Marking changes what the schema parses to — each top-level field becomes a
 * frozen `{ get() }` reference — so {@link apply} reads through
 * {@link unwrapVolatileConfig} and {@link resolveAdapterOptions} keeps its
 * plain signature.
 */
export declare const Config: z<Config>;
/**
 * One resolution's complete request facts. Connection and credential facts
 * are one value on purpose: a snapshot the resolver rejects keeps the whole
 * previous generation, so a request can never pair a stale endpoint with a
 * newer key.
 */
export type ResolvedNeuralwattOptions = NeuralwattConnectionOptions;
/**
 * The one explicit resolve step from raw config to validated connection
 * facts. Programmatic construction may bypass Schemastery normalization, so
 * every default and bound is re-judged here — for the composition entry at
 * load (fail loud) and for each settings snapshot at its first use.
 * @param config - raw plugin config or resolved settings snapshot.
 * @param environment - this run's environment layers, or `undefined` outside
 * the product CLI. A trusted layer may supply the gateway endpoint.
 * @returns validated connection facts plus the credential reference.
 */
export declare function resolveAdapterOptions(config: Config, environment?: ReturnType<typeof launchEnvironmentOf>): ResolvedNeuralwattOptions;
export declare function apply(ctx: Context, config: Config): void;
