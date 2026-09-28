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
import {
  assertUsableApiKey,
  LlmError,
  resolveRetryPolicy,
  RetryPolicySchema,
} from "@deepseek-ai/dsh-llm";
import type { RetryPolicyConfig } from "@deepseek-ai/dsh-llm";
import llmManifest from "@deepseek-ai/dsh-llm/package.json" with {
  type: "json",
};
import { credentialRef } from "@deepseek-ai/dsh-credentials";
// Type-only: pulls the ctx.settings merge (the 0.1.7 schema-derived forms).
import type {} from "@deepseek-ai/dsh-settings";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import { MAX_TIMER_DELAY_MS } from "@deepseek-ai/dsh-timeout";
import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MODEL_EXCLUDE_PATTERNS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  NeuralwattAdapter,
  normalizeBaseUrl,
  PKG,
} from "./adapter.ts";
import type {
  NeuralwattCatalogModel,
  NeuralwattConnectionOptions,
} from "./adapter.ts";
import type { ModelsDevParamsRequest, ProviderHints } from "./types.ts";
import { fetchQuotas } from "./quota.ts";
import { markVolatileFields, unwrapVolatileConfig } from "./config-volatile.ts";
import type { HostConnectionHandle } from "@deepseek-ai/dsh-client-connection";

export {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MODEL_EXCLUDE_PATTERNS,
  DEFAULT_PROVIDER_HINTS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  matchModelsDev,
  modelNameFromId,
  NeuralwattAdapter,
  normalizeBaseUrl,
  PKG,
} from "./adapter.ts";
export { serializeRequest } from "./serialize.ts";
export {
  isVolatileRef,
  markVolatile,
  markVolatileFields,
  unwrapVolatileConfig,
} from "./config-volatile.ts";
export type { VolatileRef } from "./config-volatile.ts";
export type {
  NeuralwattAdapterOptions,
  NeuralwattCatalogModel,
  NeuralwattConnectionOptions,
} from "./adapter.ts";
export type * from "./types.ts";

const MINIMUM_DSH_VERSION = "0.1.7-rc.1";

type SemverIdentifier = number | string;
interface ParsedSemver {
  core: [number, number, number];
  prerelease?: SemverIdentifier[];
}

function parseSemver(version: string): ParsedSemver | undefined {
  const match =
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.exec(
      version,
    );
  if (match === null) return undefined;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  const prerelease = match[4]
    ?.split(".")
    .map((part) => (/^\d+$/u.test(part) ? Number(part) : part));
  return prerelease === undefined
    ? { core: [major, minor, patch] }
    : { core: [major, minor, patch], prerelease };
}

function compareSemver(left: ParsedSemver, right: ParsedSemver): number {
  const [leftMajor, leftMinor, leftPatch] = left.core;
  const [rightMajor, rightMinor, rightPatch] = right.core;
  for (const difference of [
    leftMajor - rightMajor,
    leftMinor - rightMinor,
    leftPatch - rightPatch,
  ]) {
    if (difference !== 0) return difference;
  }
  if (left.prerelease === undefined)
    return right.prerelease === undefined ? 0 : 1;
  if (right.prerelease === undefined) return -1;
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart === undefined) return rightPart === undefined ? 0 : -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    if (typeof leftPart === "number" && typeof rightPart === "number")
      return leftPart - rightPart;
    if (typeof leftPart === "number") return -1;
    if (typeof rightPart === "number") return 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

function isSupportedHostVersion(version: string): boolean {
  const actual = parseSemver(version);
  const minimum = parseSemver(MINIMUM_DSH_VERSION);
  return (
    actual !== undefined &&
    minimum !== undefined &&
    compareSemver(actual, minimum) >= 0
  );
}

const hostLlmVersion =
  typeof llmManifest.version === "string" ? llmManifest.version : "unknown";
if (!isSupportedHostVersion(hostLlmVersion)) {
  throw new Error(
    `dsh-llm-neuralwatt requires dsh >= ${MINIMUM_DSH_VERSION} ` +
      `(host ships @deepseek-ai/dsh-llm ${hostLlmVersion}); ` +
      `upgrade the host: npm install -g @deepseek-ai/dsh@${MINIMUM_DSH_VERSION}`,
  );
}

export const name = "llm-neuralwatt";
export const inject = ["llm"];

const NS = "llm-neuralwatt";
/**
 * Fixed credential reference for the gateway API key. Deliberately not an
 * environment-variable-style name: the inherited process environment is the
 * credentials service's read-only top layer, so an `NEURALWATT_API_KEY`-style
 * ref would let a stray exported variable shadow the web-stored key and lock
 * the settings input read-only. `neuralwatt` names the route, and the web
 * settings page is the one configuration surface for the value.
 */
const API_KEY_REF = "neuralwatt";
/** Environment variable naming this provider's endpoint, honored only from trusted layers. */
const BASE_URL_ENV = "NEURALWATT_BASE_URL";
/** Gateway base used when neither config nor environment names one. */
export const DEFAULT_BASE_URL = "https://api.neuralwatt.com/v1/chat/completions";
/** The single provider route this plugin owns. */
const PROVIDER = "neuralwatt";

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
   * The fixed credential reference exposed to the shared Models page. This is
   * not user-configurable: it mirrors the `neuralwatt` reference resolved by
   * the adapter so the page can render its standard red/green credential dot.
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

const catalogModel: z<NeuralwattCatalogModel> = z.object({
  id: z.string().required(),
  name: z.string(),
  description: z.string(),
  contextWindow: z.number().step(1).min(1),
  maxTokens: z.number().step(1).min(1),
  reasoningEfforts: z.array(z.string()),
  defaultReasoningEffort: z.string(),
});

/** Default forward proxy: the conventional Clash port on loopback. */
export const DEFAULT_PROXY_URL = "http://127.0.0.1:7890";

const proxySchema: z<ProxyConfig> = z.object({
  enabled: z.boolean().default(false),
  url: z.string().default(DEFAULT_PROXY_URL),
});

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
export const Config: z<Config> = z.object(
  markVolatileFields({
    baseURL: z.string().default(DEFAULT_BASE_URL),
    // `ui-settings-models` reads this conventional field to join a provider
    // with `credentials.describe()`. Keep it aligned with API_KEY_REF, which
    // remains the only credential reference the adapter and dedicated page
    // use. The role tells the generic form this is a reference name, not a
    // secret literal, so it renders the credential affordance.
    apiKeyEnv: z.string().role('credential-ref').default(API_KEY_REF),
    models: z.array(catalogModel).default([]),
    modelExcludePatterns: z
      .array(z.string())
      .default([...DEFAULT_MODEL_EXCLUDE_PATTERNS]),
    defaultContextWindow: z
      .number()
      .step(1)
      .min(1)
      .default(DEFAULT_CONTEXT_WINDOW),
    maxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER),
    streamIdleTimeoutMs: z
      .number()
      .min(Number.MIN_VALUE)
      .max(MAX_TIMER_DELAY_MS)
      .default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
    proxy: proxySchema.default({ enabled: false, url: DEFAULT_PROXY_URL }),
    providerHints: z.object({
      defaults: z.object({}),
      models: z.object({}),
    }),
    retryPolicy: RetryPolicySchema,
  }),
);

/**
 * One resolution's complete request facts. Connection and credential facts
 * are one value on purpose: a snapshot the resolver rejects keeps the whole
 * previous generation, so a request can never pair a stale endpoint with a
 * newer key.
 */
export type ResolvedNeuralwattOptions = NeuralwattConnectionOptions;

/** Resolve, validate, and detach the advisory model catalog. */
function resolveModels(
  models: readonly NeuralwattCatalogModel[] | undefined,
): NeuralwattCatalogModel[] {
  const seen = new Set<string>();
  return (models ?? []).map((model) => {
    if (model.id.length === 0)
      throw new Error(`${PKG}: catalog model ids must be non-empty`);
    if (model.name !== undefined && model.name.length === 0) {
      throw new Error(`${PKG}: catalog model "${model.id}" has an empty name`);
    }
    if (
      model.contextWindow !== undefined &&
      (!Number.isInteger(model.contextWindow) || model.contextWindow <= 0)
    ) {
      throw new Error(
        `${PKG}: catalog model "${model.id}" contextWindow must be a positive integer`,
      );
    }
    if (
      model.maxTokens !== undefined &&
      (!Number.isInteger(model.maxTokens) || model.maxTokens <= 0)
    ) {
      throw new Error(
        `${PKG}: catalog model "${model.id}" maxTokens must be a positive integer`,
      );
    }
    if (seen.has(model.id))
      throw new Error(`${PKG}: duplicate catalog model "${model.id}"`);
    seen.add(model.id);
    for (const effort of model.reasoningEfforts ?? []) {
      if (effort.length === 0)
        throw new Error(
          `${PKG}: catalog model "${model.id}" has an empty reasoning effort`,
        );
    }
    if (
      model.defaultReasoningEffort !== undefined &&
      !(model.reasoningEfforts ?? []).includes(model.defaultReasoningEffort)
    ) {
      throw new Error(
        `${PKG}: catalog model "${model.id}" default reasoning effort "${model.defaultReasoningEffort}" is not among its reasoning efforts`,
      );
    }
    return {
      id: model.id,
      ...(model.name === undefined ? {} : { name: model.name }),
      ...(model.description === undefined
        ? {}
        : { description: model.description }),
      ...(model.contextWindow === undefined
        ? {}
        : { contextWindow: model.contextWindow }),
      ...(model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens }),
      ...(model.reasoningEfforts === undefined ||
      model.reasoningEfforts.length === 0
        ? {}
        : { reasoningEfforts: model.reasoningEfforts }),
      ...(model.defaultReasoningEffort === undefined
        ? {}
        : { defaultReasoningEffort: model.defaultReasoningEffort }),
    };
  });
}

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
export function resolveAdapterOptions(
  config: Config,
  environment?: ReturnType<typeof launchEnvironmentOf>,
): ResolvedNeuralwattOptions {
  // Absent everywhere falls back to {@link DEFAULT_BASE_URL} below. A value
  // someone actually typed must still be a usable http(s) URL, which
  // normalizeBaseUrl enforces below.
  const named =
    config.baseURL !== undefined && config.baseURL.trim().length > 0
      ? config.baseURL
      : environment?.get(BASE_URL_ENV)?.value;
  const rawBase =
    named !== undefined && named.trim().length > 0 ? named : DEFAULT_BASE_URL;
  const modelExcludePatterns = config.modelExcludePatterns ?? [
    ...DEFAULT_MODEL_EXCLUDE_PATTERNS,
  ];
  for (const pattern of modelExcludePatterns) {
    if (pattern.length === 0)
      throw new Error(`${PKG}: modelExcludePatterns entries must be non-empty`);
  }
  if (
    config.defaultContextWindow !== undefined &&
    (!Number.isInteger(config.defaultContextWindow) ||
      config.defaultContextWindow <= 0)
  ) {
    throw new Error(`${PKG}: defaultContextWindow must be a positive integer`);
  }
  if (
    config.maxTokens !== undefined &&
    (!Number.isSafeInteger(config.maxTokens) || config.maxTokens <= 0)
  ) {
    throw new Error(`${PKG}: maxTokens must be a positive safe integer`);
  }
  const streamIdleTimeoutMs =
    config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS;
  if (
    !Number.isFinite(streamIdleTimeoutMs) ||
    streamIdleTimeoutMs <= 0 ||
    streamIdleTimeoutMs > MAX_TIMER_DELAY_MS
  ) {
    throw new Error(
      `${PKG}: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`,
    );
  }
  const defaultContextWindow =
    config.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW;
  const proxyEnabled = config.proxy?.enabled === true;
  const proxyUrlRaw = config.proxy?.url ?? DEFAULT_PROXY_URL;
  if (proxyEnabled) {
    // Only judged while enabled: a stored disabled proxy with a stale URL
    // must not fail the whole section.
    let proxyUrl: URL;
    try {
      proxyUrl = new URL(proxyUrlRaw);
    } catch {
      throw new Error(
        `${PKG}: proxy.url must be an absolute URL (got: ${proxyUrlRaw})`,
      );
    }
    if (!/^https?:$/.test(proxyUrl.protocol)) {
      throw new Error(
        `${PKG}: proxy.url must be an http(s) URL (got: ${proxyUrlRaw})`,
      );
    }
  }
  return {
    baseURL: normalizeBaseUrl(rawBase),
    apiKeyRef: credentialRef(API_KEY_REF),
    models: resolveModels(config.models),
    modelExcludePatterns,
    defaultContextWindow,
    streamIdleTimeoutMs,
    ...(proxyEnabled ? { proxyUrl: proxyUrlRaw } : {}),
    providerHints: {
      defaults: { ...config.providerHints?.defaults },
      models: { ...config.providerHints?.models },
    },
    retryPolicy: resolveRetryPolicy(config.retryPolicy, `${PKG}: retryPolicy`),
    ...(config.maxTokens === undefined ? {} : { maxTokens: config.maxTokens }),
  };
}

export function apply(ctx: Context, config: Config): void {
  // Every top-level Config field is volatile, so at runtime `config` carries
  // live references rather than plain values. Read them per use: the 0.1.7
  // loader commits a volatile-only settings write IN PLACE — it does not
  // remount this fiber and does not re-run `apply` — so a reader that cached
  // the config, or compared it by identity, would never see a change. Caching
  // by identity is impossible anyway: unwrap returns a fresh object each call
  // precisely because the references' identities stay fixed while their
  // values move.
  const current: () => Config = () => unwrapVolatileConfig(config);
  let lastGood: ResolvedNeuralwattOptions | undefined;
  const options = (): ResolvedNeuralwattOptions => {
    try {
      lastGood = resolveAdapterOptions(current(), launchEnvironmentOf(ctx));
      return lastGood;
    } catch (error) {
      // Static composition resolves before anything registers, so this branch
      // only sees a live settings snapshot failing a beyond-schema bound:
      // keep serving the last good facts and say so once per bad snapshot.
      if (lastGood === undefined) throw error;
      ctx.logger.error(
        `${PKG}: keeping the last good configuration after an invalid config`,
      );
      ctx.logger.error(error);
      return lastGood;
    }
  };
  options();

  const resolveApiKey = async (
    connection: ResolvedNeuralwattOptions,
  ): Promise<string> => {
    // Every credential fact comes from the caller's snapshot, so a rejected
    // settings generation cannot leak its key onto the previous endpoint.
    // The credentials store is the only source: the web settings page owns
    // the value, and this plugin deliberately reads no environment variable
    // for it (a stray export must not shadow a web-configured key).
    const ref = connection.apiKeyRef;
    const credentials = ctx.get("credentials");
    if (credentials !== undefined) {
      const hit = await credentials.resolve(ref);
      if (hit !== undefined) return assertUsableApiKey(hit.value, PKG, ref);
    }
    throw new LlmError(
      `${PKG}: no API key for provider route "${PROVIDER}"; configure it on the Neuralwatt` +
        ` settings page in dsh web (credentials reference "${ref}")`,
      "MISSING_CREDENTIAL",
    );
  };

  // Official-vendor index for the models.dev params panel: model id → the
  // provider route that serves it officially, read from every OTHER route
  // registered on ctx.llm (the built-in catalogs are the authority — e.g.
  // deepseek-v4-flash under the deepseek route). Rebuilt when the set of
  // routes changes; a route that fails to list models is no authority.
  let indexCache: { routes: string; byModel: Map<string, string> } | undefined;
  const officialProviderOf = async (
    modelId: string,
  ): Promise<string | undefined> => {
    const routes = ctx.llm
      .listProviders()
      .map((provider) => provider.id)
      .sort()
      .join(",");
    if (indexCache === undefined || indexCache.routes !== routes) {
      const byModel = new Map<string, string>();
      for (const provider of ctx.llm.listProviders()) {
        if (provider.id === PROVIDER) continue;
        try {
          for (const model of await ctx.llm.listModels(provider.id)) {
            byModel.set(model.id, provider.id);
          }
        } catch {
          // An unlistable route contributes nothing; other routes still can.
        }
      }
      indexCache = { routes, byModel };
    }
    return indexCache.byModel.get(modelId);
  };

  const adapter = new NeuralwattAdapter({
    options,
    resolveApiKey,
    officialProviderOf,
  });
  ctx.llm.registerConfigurableProviders([
    {
      provider: PROVIDER,
      displayName: "Neuralwatt",
      settingsNs: NS,
      settingsPath: [],
    },
  ]);
  // Route effects bind to this apply fiber via the stable `ctx` reference.
  // The route set is fixed — one provider, `neuralwatt` — so it never needs
  // the 0.1.5-era in-place `registration.replace` hook. The retry policy is
  // NOT captured here: `providerRetryPolicy()` reads it from the live
  // `options()` snapshot, which is what lets a volatile settings write change
  // it without this fiber being remounted. The one registration-captured fact
  // is the route name itself, which no setting changes.
  ctx.llm.registerAdapter([PROVIDER], adapter);
  // Model discovery for the settings namespace this plugin owns: the Models
  // page interrogates the gateway's /models with the draft's endpoint and
  // one-shot credential, or the current snapshot's facts. The runtime hands
  // caller cancellation as a separate signal (0.1.5 seam).
  ctx.llm.registerModelDiscovery(NS, (request, signal) =>
    adapter.discoverModels(request, signal),
  );

  // Host-side endpoint for the「更新模型信息」action: the browser names
  // the gateway model ids (and optionally the proxy draft) and the host
  // downloads https://models.dev/api.json — no cross-origin fetch happens in
  // the browser, and a plain HTTP forward proxy works because Node performs
  // the request.
  //
  // The channel goes through the connection service's own `register(owner,
  // channel, handler)` rather than the `rpc.handle(channel, handler)` the
  // type advertises. On the 0.1.5 host line `handle` is unusable: its `rpc`
  // getter captures `this.ctx`, and that captured context is the connection
  // service's own scope, which has no `webServer` injected. `register` then
  // evaluates `owner.webServer.register(route)`, cordis answers
  // `cannot get property "webServer" without inject`, and the throw is
  // swallowed by the effect — so the channel silently never appears and the
  // browser meets the SPA fallback's 405 (the boot check catches exactly
  // this). Passing our own inject-scope context as the owner fixes it, and
  // `register` is the very method `rpc.handle` delegates to. No upstream
  // plugin calls `rpc.handle`; `dsh-api-gateway` injects this same
  // `connection` + `webServer` pair for the work that does touch `webServer`.
  //
  // Both services are injected so registration waits for each to exist and
  // re-runs if either reloads.
  ctx.inject(["connection", "webServer"], (cctx) => {
    const connection = cctx.get("connection") as HostConnectionHandle;
    // The owner-taking overload is on the service prototype but not on
    // `HostConnectionHandle`, so the extra shape is declared here.
    // SAFETY: invariant TypeScript cannot check — `connection` is the live
    // `dsh-client-connection` service, whose prototype owns the owner-taking
    // `register(owner, channel, handler)` overload this plugin calls; the
    // published handle interface simply omits it.
    const registrar = connection as unknown as {
      register(
        owner: unknown,
        channel: string,
        handler: (
          endpoint: string,
          payload: unknown,
          signal: AbortSignal,
        ) => Promise<unknown>,
      ): () => Promise<void>;
    };
    cctx.effect(
      () =>
        registrar.register(
          cctx,
          "/llm-neuralwatt",
          (endpoint: string, payload: unknown, signal: AbortSignal) => {
            if (endpoint === "quota") {
              const quotaConnection = options();
              return resolveApiKey(quotaConnection)
                .then((apiKey) =>
                  fetchQuotas(quotaConnection.baseURL, apiKey, signal),
                )
                .then((value) => ({ ok: true as const, value }))
                .catch((error: unknown) => ({
                  ok: false as const,
                  error: {
                    code: "internal" as const,
                    message:
                      error instanceof Error ? error.message : String(error),
                    details: {},
                  },
                }));
            }
            if (endpoint !== "models-dev-params") {
              return Promise.resolve({
                ok: false as const,
                error: {
                  code: "internal" as const,
                  message: `llm-neuralwatt: unknown endpoint ${endpoint}`,
                  details: {},
                },
              });
            }
            const request = payload as ModelsDevParamsRequest;
            // Failures answer as the error envelope, never a thrown value: the
            // transport maps a thrown handler to an opaque HTTP 500, which hides
            // the actual reason (unreachable endpoint, dead proxy) from the
            // settings page that asked.
            return adapter
              .fetchModelsDevParams(request, signal)
              .then((value) => ({ ok: true as const, value }))
              .catch((error: unknown) => ({
                ok: false as const,
                error: {
                  code: "internal" as const,
                  message:
                    error instanceof Error ? error.message : String(error),
                  details: {},
                },
              }));
          },
        ),
      "llm-neuralwatt: models-dev RPC channel",
    );
  });

  // The 0.1.5 `settings.installSection` seam is gone; the 0.1.7 replacement is
  // a per-instance presentation policy. This plugin owns a dedicated Neuralwatt
  // section (credentials, discovery, models.dev params, quota), so the
  // schema-derived generic page is switched off: the volatile marks on
  // {@link Config} are what make the namespace describable and writable, not
  // what should render a second, duplicate form. Refusal of an unserviceable
  // value happens at the schema and at the profile write that carries it, not
  // in a plugin-side validate hook.
  ctx.inject(["settings"], (sctx) => {
    sctx.effect(
      () => sctx.settings.configure({ auto: false }, ctx.fiber),
      "llm-neuralwatt: settings presentation policy",
    );
  });
}
