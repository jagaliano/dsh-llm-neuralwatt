var __knownSymbol = (name2, symbol) => (symbol = Symbol[name2]) ? symbol : Symbol.for("Symbol." + name2);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __using = (stack, value, async) => {
  if (value != null) {
    if (typeof value !== "object" && typeof value !== "function") __typeError("Object expected");
    var dispose, inner;
    if (async) dispose = value[__knownSymbol("asyncDispose")];
    if (dispose === void 0) {
      dispose = value[__knownSymbol("dispose")];
      if (async) inner = dispose;
    }
    if (typeof dispose !== "function") __typeError("Object not disposable");
    if (inner) dispose = function() {
      try {
        inner.call(this);
      } catch (e) {
        return Promise.reject(e);
      }
    };
    stack.push([async, dispose, value]);
  } else if (async) {
    stack.push([async]);
  }
  return value;
};
var __callDispose = (stack, error, hasError) => {
  var E = typeof SuppressedError === "function" ? SuppressedError : function(e, s, m, _) {
    return _ = Error(m), _.name = "SuppressedError", _.error = e, _.suppressed = s, _;
  };
  var fail = (e) => error = hasError ? new E(e, error, "An error was suppressed during disposal") : (hasError = true, e);
  var next = (it) => {
    while (it = stack.pop()) {
      try {
        var result = it[1] && it[1].call(it[2]);
        if (it[0]) return Promise.resolve(result).then(next, (e) => (fail(e), next()));
      } catch (e) {
        fail(e);
      }
    }
    if (hasError) throw error;
  };
  return next();
};

// src/index.ts
import z from "@deepseek-ai/schemastery";
import {
  assertUsableApiKey as assertUsableApiKey2,
  LlmError as LlmError5,
  resolveRetryPolicy,
  RetryPolicySchema
} from "@deepseek-ai/dsh-llm";
import llmManifest from "@deepseek-ai/dsh-llm/package.json" with { type: "json" };
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import { MAX_TIMER_DELAY_MS } from "@deepseek-ai/dsh-timeout";

// src/adapter.ts
import {
  assertUsableApiKey,
  attributionHeaders,
  CONTEXT_WINDOW_EXCEEDED_CODE,
  isContextWindowExceededError,
  isQuotaExceededError,
  LlmAdapter,
  LlmError as LlmError4,
  ProviderRequestId,
  QUOTA_EXCEEDED_CODE,
  ReasoningEffortId
} from "@deepseek-ai/dsh-llm";
import { idleWatchdog, timeoutOf } from "@deepseek-ai/dsh-timeout";
import { fetch as undiciFetch, ProxyAgent } from "undici";

// src/serialize.ts
import { contentHasImage, LlmError } from "@deepseek-ai/dsh-llm";
function flattenText(blocks) {
  return blocks.filter((block) => block.type === "text").map((block) => block.text).join("");
}
function assertTextOnly(blocks) {
  if (contentHasImage(blocks)) {
    throw new LlmError("The Neuralwatt chat-completions adapter does not support image content.", "UNSUPPORTED_CONTENT");
  }
}
function serializeAssistant(content) {
  const text = flattenText(content);
  const reasoning = content.filter((block) => block.type === "reasoning").map((block) => block.text).join("");
  const toolCalls = content.filter((block) => block.type === "tool-call").map((block) => ({
    id: block.id,
    type: "function",
    function: { name: block.name, arguments: block.arguments }
  }));
  return {
    role: "assistant",
    // Text-less turns send "" — NEVER null. Pure tool-call turns: some
    // gateways reject null outright. Reasoning-ONLY turns (the model can
    // answer entirely in the reasoning channel): the wire API rejects
    // null-content/no-tool_calls assistant messages with a 400, and since
    // the message sits durably in the session log, a null here bricks every
    // later turn of that session.
    content: text,
    // DeepSeek-family upstream passback rule: reasoning_content must return
    // on tool-call turns; it is ignored on plain turns, so we drop it there
    // to save tokens.
    ...toolCalls.length > 0 && reasoning.length > 0 ? { reasoning_content: reasoning } : {},
    ...toolCalls.length > 0 ? { tool_calls: toolCalls } : {}
  };
}
function serializeMessages(messages) {
  const wire = [];
  for (const message of messages) {
    const role = message.role;
    if (message.role === "developer") continue;
    assertTextOnly(message.content);
    if (message.role === "system") {
      wire.push({ role: "system", content: flattenText(message.content) });
      continue;
    }
    if (message.role === "assistant") {
      wire.push(serializeAssistant(message.content));
      continue;
    }
    if (message.role === "tool") {
      wire.push({
        role: "tool",
        tool_call_id: message.toolCallId,
        // Empty tool output still needs SOME content on the wire.
        content: flattenText(message.content) || "(no output)"
      });
      continue;
    }
    if (message.role === "user") {
      wire.push({ role: "user", content: flattenText(message.content) });
      continue;
    }
    const unhandled = message;
    throw new LlmError(`The Neuralwatt chat-completions adapter cannot serialize a '${role}' message.`, "UNSUPPORTED_CONTENT");
  }
  return wire;
}
function serializeRequest(options) {
  const messages = [];
  if (options.system !== void 0) {
    messages.push({ role: "system", content: options.system });
  }
  messages.push(...serializeMessages(options.messages));
  const tools = options.tools?.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));
  return {
    model: options.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...tools !== void 0 && tools.length > 0 ? { tools } : {},
    ...options.temperature !== void 0 ? { temperature: options.temperature } : {},
    ...options.maxTokens === void 0 ? {} : { max_tokens: options.maxTokens },
    ...options.reasoningEffort !== void 0 ? { reasoning_effort: options.reasoningEffort } : {},
    ...options.stop !== void 0 ? { stop: options.stop } : {}
  };
}

// src/sse.ts
import { EventSourceParserStream } from "eventsource-parser/stream";
import { LlmError as LlmError2 } from "@deepseek-ai/dsh-llm";
var DONE = "[DONE]";
async function* parseSse(stream, onComment) {
  const events = stream.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream({ onComment }));
  const reader = events.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value.data;
      if (value.data === DONE) return;
    }
  } finally {
    reader.releaseLock();
  }
  throw new LlmError2("SSE stream ended without [DONE]", "STREAM_CLOSED");
}

// src/translate.ts
import { EMPTY_RESPONSE_CODE, LlmError as LlmError3 } from "@deepseek-ai/dsh-llm";
var toCallId = (id) => id;
function mapFinishReason(reason) {
  switch (reason) {
    case "stop":
      return { kind: "stop" };
    case "tool_calls":
      return { kind: "tool-calls" };
    case "length":
      return { kind: "max-tokens" };
    default:
      return {
        kind: "error",
        failure: { message: `model stopped: ${reason}`, code: reason.toUpperCase() }
      };
  }
}
function mapUsage(usage) {
  const cacheRead = usage.prompt_tokens_details?.cached_tokens ?? usage.prompt_cache_hit_tokens;
  const reasoning = usage.completion_tokens_details?.reasoning_tokens;
  const combined = usage.prompt_tokens + usage.completion_tokens;
  const hasValidCombined = Number.isSafeInteger(usage.prompt_tokens) && usage.prompt_tokens >= 0 && Number.isSafeInteger(usage.completion_tokens) && usage.completion_tokens >= 0 && Number.isSafeInteger(combined) && combined >= 0 && (usage.total_tokens === void 0 || usage.total_tokens === combined);
  return {
    inputTokens: usage.prompt_tokens - (cacheRead ?? 0),
    outputTokens: usage.completion_tokens,
    ...cacheRead !== void 0 ? { cacheReadTokens: cacheRead } : {},
    ...reasoning !== void 0 ? { reasoningTokens: reasoning } : {},
    ...hasValidCombined ? { totalTokens: combined } : {}
  };
}
function closeBlock(block) {
  switch (block.kind) {
    case "text":
      return { type: "text", text: block.text };
    case "reasoning":
      return { type: "reasoning", text: block.text };
    case "tool-call":
      return {
        type: "tool-call",
        id: toCallId(block.callId ?? ""),
        name: block.name ?? "",
        arguments: block.text
      };
  }
}
async function* translate(payloads) {
  let nextIndex = 0;
  let textBlock;
  let reasoningBlock;
  const toolBlocks = /* @__PURE__ */ new Map();
  const order = [];
  let pendingFinish;
  let pendingUsage;
  function open(kind) {
    const block = { index: nextIndex++, kind, text: "" };
    order.push(block);
    return block;
  }
  for await (const payload of payloads) {
    if (payload === DONE) {
      for (const block of order) {
        yield { type: "block-end", index: block.index, block: closeBlock(block) };
      }
      if (pendingUsage) yield { type: "usage", usage: pendingUsage };
      const reason = pendingFinish ?? { kind: "stop" };
      yield {
        type: "finish",
        reason: reason.kind === "stop" && order.length === 0 ? {
          kind: "error",
          failure: { message: "model returned a completed response with no content", code: EMPTY_RESPONSE_CODE }
        } : reason
      };
      return;
    }
    let chunk;
    try {
      chunk = JSON.parse(payload);
    } catch {
      throw new LlmError3(`malformed SSE payload: ${payload.slice(0, 120)}`, "MALFORMED_RESPONSE");
    }
    for (const choice of chunk.choices ?? []) {
      const delta = choice.delta;
      const reasoning = delta?.reasoning_content;
      if (typeof reasoning === "string" && reasoning.length > 0) {
        if (!reasoningBlock) {
          reasoningBlock = open("reasoning");
          yield { type: "block-start", index: reasoningBlock.index, blockType: "reasoning" };
        }
        reasoningBlock.text += reasoning;
        yield { type: "reasoning-delta", index: reasoningBlock.index, text: reasoning };
      }
      const content = delta?.content;
      if (typeof content === "string" && content.length > 0) {
        if (!textBlock) {
          textBlock = open("text");
          yield { type: "block-start", index: textBlock.index, blockType: "text" };
        }
        textBlock.text += content;
        yield { type: "text-delta", index: textBlock.index, text: content };
      }
      for (const call of delta?.tool_calls ?? []) {
        let block = toolBlocks.get(call.index);
        if (!block) {
          block = open("tool-call");
          toolBlocks.set(call.index, block);
          yield { type: "block-start", index: block.index, blockType: "tool-call" };
        }
        if (call.id !== void 0 && call.id.length > 0) block.callId = call.id;
        if (call.function?.name !== void 0 && call.function.name.length > 0) block.name = call.function.name;
        const fragment = call.function?.arguments ?? "";
        block.text += fragment;
        yield {
          type: "tool-call-delta",
          index: block.index,
          id: toCallId(block.callId ?? ""),
          ...block.name !== void 0 ? { name: block.name } : {},
          argumentsDelta: fragment
        };
      }
      if (typeof choice.finish_reason === "string") {
        pendingFinish = mapFinishReason(choice.finish_reason);
      }
    }
    if (chunk.usage) pendingUsage = mapUsage(chunk.usage);
  }
  throw new LlmError3("SSE payload stream ended without [DONE]", "STREAM_CLOSED");
}

// src/adapter.ts
var PKG = "llm-neuralwatt";
var DEFAULT_MODEL_EXCLUDE_PATTERNS = ["embed", "rerank", "ranker"];
var DEFAULT_STREAM_IDLE_TIMEOUT_MS = 3e5;
var DEFAULT_CONTEXT_WINDOW = 128e3;
var STREAM_IDLE_TIMEOUT_CODE = "LLM_STREAM_IDLE_TIMEOUT";
var MODELS_DEV_API_URL = "https://models.dev/api.json";
var MODELS_DEV_TIMEOUT_MS = 3e4;
function modelsDevMatch(provider, entry) {
  const contextWindow = entry.limit?.context;
  const maxTokens = entry.limit?.output;
  const reasoningEfforts = entry.reasoning_options?.filter((option) => option?.type === "effort").flatMap((option) => (option.values ?? []).filter((value) => typeof value === "string" && value.length > 0));
  if (contextWindow === void 0 && maxTokens === void 0) return void 0;
  return {
    provider,
    ...entry.name !== void 0 && entry.name.length > 0 ? { name: entry.name } : {},
    ...contextWindow !== void 0 ? { contextWindow } : {},
    ...maxTokens !== void 0 ? { maxTokens } : {},
    ...reasoningEfforts !== void 0 && reasoningEfforts.length > 0 ? { reasoningEfforts } : {}
  };
}
var DEFAULT_PROVIDER_HINTS = {
  defaults: {
    glm: "zai",
    gpt: "openai",
    o: "openai",
    claude: "anthropic",
    deepseek: "deepseek",
    gemini: "google",
    grok: "xai",
    hunyuan: "tencent",
    qwen: "alibaba",
    kimi: "moonshotai",
    // xiaomi is the vendor key mimo models live under (mimo-v2* family);
    // no separate xiaomimimo provider exists in the catalog.
    mimo: "xiaomi",
    minimax: "minimax"
  }
};
function hintedProvider(id, bare, hints) {
  const exact = hints?.models?.[id] ?? hints?.models?.[bare];
  if (exact !== void 0) return exact;
  const lower = bare.toLowerCase();
  const entries = Object.entries({ ...DEFAULT_PROVIDER_HINTS.defaults, ...hints?.defaults });
  const hit = entries.filter(([prefix]) => lower.startsWith(prefix.toLowerCase())).sort((a, b) => b[0].length - a[0].length)[0];
  return hit?.[1];
}
function matchModelsDev(api, id, hints) {
  const bare = id.slice(id.lastIndexOf("/") + 1);
  const keys = /* @__PURE__ */ new Set([id, bare]);
  const hinted = hintedProvider(id, bare, hints);
  const exact = /* @__PURE__ */ new Map();
  const near = /* @__PURE__ */ new Map();
  for (const [provider, catalog] of Object.entries(api)) {
    const models = catalog?.models;
    if (models === void 0 || typeof models !== "object") continue;
    for (const key of keys) {
      const entry = models[key];
      if (entry === void 0 || typeof entry !== "object") continue;
      const match = modelsDevMatch(provider, entry);
      if (match !== void 0) exact.set(provider, match);
    }
    if (provider === hinted && !exact.has(provider)) {
      const hit = Object.keys(models).filter((key) => key.includes(bare) || bare.includes(key)).map((key) => ({ key, entry: models[key] })).sort((a, b) => a.key.length - b.key.length)[0];
      const entry = hit?.entry;
      const match = entry === void 0 ? void 0 : modelsDevMatch(provider, entry);
      if (match !== void 0) near.set(provider, match);
    }
  }
  const ordered = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (match, official) => {
    if (seen.has(match.provider)) return;
    seen.add(match.provider);
    ordered.push(official ? { ...match, official: true } : match);
  };
  const hintedMatch = exact.get(hinted ?? "") ?? near.get(hinted ?? "");
  if (hinted !== void 0 && hintedMatch !== void 0) push(hintedMatch, true);
  for (const match of exact.values()) push(match, false);
  for (const match of near.values()) push(match, false);
  return ordered;
}
function normalizeBaseUrl(raw) {
  const base = raw.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(base)) {
    throw new Error(`${PKG}: baseURL must be an absolute http(s) URL including the /v1 prefix, e.g. https://api.neuralwatt.com/v1 (got: ${raw.trim()})`);
  }
  let url;
  try {
    url = new URL(base);
  } catch {
    throw new Error(`${PKG}: baseURL is not a valid URL (got: ${raw.trim()})`);
  }
  const path = url.pathname;
  const stripped = path.replace(/(?:\/chat\/completions){1,2}$/i, "");
  url.pathname = stripped === "" ? "/" : stripped;
  url.search = "";
  url.hash = "";
  const normalized = url.toString().replace(/\/+$/, "");
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}
function modelInfo(provider, model) {
  return {
    provider,
    id: model.id,
    name: model.name ?? model.id,
    ...model.description === void 0 ? {} : { description: model.description },
    inputModalities: ["text"]
  };
}
var EFFORT_RUNG = {
  max: 7,
  xhigh: 6,
  high: 5,
  medium: 4,
  low: 3,
  minimal: 2,
  none: 1,
  default: 0
};
function highestEffort(efforts) {
  return [...efforts].sort((a, b) => (EFFORT_RUNG[b] ?? -1) - (EFFORT_RUNG[a] ?? -1))[0];
}
var BRAND_SPELLING = {
  glm: "GLM",
  gpt: "GPT",
  deepseek: "DeepSeek"
};
function modelNameFromId(id) {
  const slash = id.lastIndexOf("/");
  const prefix = slash === -1 ? void 0 : id.slice(0, slash);
  const words = id.slice(slash + 1).split("-").filter((word) => word.length > 0);
  const spelled = words.map((word, at) => {
    if (word.length === 1) return word.toUpperCase();
    const brand = BRAND_SPELLING[word];
    if (brand !== void 0) return brand;
    let result = word.charAt(0).toUpperCase() + word.slice(1);
    if (at === words.length - 1) {
      result = result.replace(/([0-9.])([bkm])$/, (_match, head, tail) => head + tail.toUpperCase());
    }
    return result;
  }).join(" ");
  return prefix === void 0 ? spelled : `${spelled}[${prefix}]`;
}
function displayModelName(id, listed) {
  if (listed !== void 0 && listed.length > 0) return listed;
  return modelNameFromId(id);
}
function providerRetryAfterMs(value) {
  if (value === null) return void 0;
  if (/^\d+$/.test(value)) {
    const delay2 = Number(value) * 1e3;
    return Number.isFinite(delay2) && delay2 > 0 ? delay2 : void 0;
  }
  const delay = Date.parse(value) - Date.now();
  return Number.isFinite(delay) && delay > 0 ? delay : void 0;
}
function requestId(headers) {
  const value = headers.get("x-request-id");
  return value === null || value.length === 0 ? void 0 : ProviderRequestId(value);
}
function httpErrorCode(status, error) {
  if (status === 401 || status === 403) return "AUTH";
  const detail = [error?.code, error?.type, error?.message].filter(Boolean).join(" ");
  if (isQuotaExceededError(detail)) return QUOTA_EXCEEDED_CODE;
  if (status === 429) return "RATE_LIMIT";
  if (status === 400) {
    if (isContextWindowExceededError(detail)) return CONTEXT_WINDOW_EXCEEDED_CODE;
    return "INVALID_REQUEST";
  }
  if (status >= 500) return "SERVER";
  return `HTTP_${status}`;
}
var NeuralwattAdapter = class extends LlmAdapter {
  constructor(config) {
    super();
    this.config = config;
  }
  providerInfo(provider) {
    return { id: provider, name: "Neuralwatt" };
  }
  providerRetryPolicy(_provider) {
    return this.config.options().retryPolicy;
  }
  listModels(provider) {
    return Promise.resolve(this.config.options().models.map((model) => modelInfo(provider, model)));
  }
  resolveModel(provider, model, _signal) {
    return Promise.resolve(this.resolveModelWithConnection(this.config.options(), provider, model));
  }
  resolveModelWithConnection(connection, provider, model) {
    const configured = connection.models.find((entry) => entry.id === model);
    const defaultMaxTokens = configured?.maxTokens ?? connection.maxTokens;
    return {
      // The chat-completions wire route is text-only regardless of catalog
      // membership, so the uncataloged fallback declares the same negative
      // capability — "unknown" here would let the host accept and persist
      // images the serializer must then reject.
      ...configured === void 0 ? { provider, id: model, name: model, inputModalities: ["text"] } : modelInfo(provider, configured),
      context: { contextWindow: configured?.contextWindow ?? connection.defaultContextWindow },
      // Reasoning efforts arrive as catalog facts (from models.dev via the
      // update action): a row that carries them offers the effort selector,
      // and an explicit effort rides the wire as `reasoning_effort`. The
      // default is the row's configured preset, falling back to the highest
      // rung the catalog declared (max > xhigh > high > medium > low > …), so
      // switching into reasoning mode selects a level automatically. Rows
      // without the fact keep declaring nothing — an explicit effort then
      // rejects before provider I/O, same as before.
      ...configured?.reasoningEfforts !== void 0 && configured.reasoningEfforts.length > 0 ? {
        reasoning: {
          efforts: configured.reasoningEfforts.map((effort) => ({
            id: ReasoningEffortId(effort),
            name: effort.charAt(0).toUpperCase() + effort.slice(1)
          })),
          ...configured.defaultReasoningEffort !== void 0 && configured.reasoningEfforts.includes(configured.defaultReasoningEffort) ? { defaultEffort: ReasoningEffortId(configured.defaultReasoningEffort) } : { defaultEffort: ReasoningEffortId(highestEffort(configured.reasoningEfforts)) }
        }
      } : {},
      ...defaultMaxTokens === void 0 ? {} : { defaultMaxTokens }
    };
  }
  prepareCall(provider, model, _signal) {
    const connection = this.config.options();
    return Promise.resolve({
      model: this.resolveModelWithConnection(connection, provider, model),
      stream: (options) => this.streamWithConnection(options, connection)
    });
  }
  /**
   * Interrogate one gateway endpoint for the models it advertises, serving
   * the settings-namespace discovery the plugin registered. A draft being
   * edited supplies its own base and one-shot credential; otherwise both
   * come from the current connection snapshot.
   * @param request - the discovery draft (endpoint, protocol, credential).
   * @param signal - caller cancellation, supplied separately by the runtime.
   * @returns the advertised models, deduplicated by the runtime, enriched
   *   with context/maxTokens facts from the configured catalog when ids match.
   */
  async discoverModels(request, signal) {
    const connection = this.config.options();
    const base = request.baseURL !== void 0 && request.baseURL.length > 0 ? normalizeBaseUrl(request.baseURL) : connection.baseURL;
    const apiKey = request.apiKey !== void 0 ? assertUsableApiKey(request.apiKey, PKG, "the draft credential") : await this.config.resolveApiKey(connection);
    let response;
    try {
      response = await fetch(`${base}/models`, {
        method: "GET",
        headers: {
          "authorization": `Bearer ${apiKey}`,
          "accept": "application/json",
          ...attributionHeaders()
        },
        ...signal === void 0 ? {} : { signal }
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new LlmError4(`Neuralwatt model discovery request to ${base} failed`, "TRANSPORT", { cause: error });
    }
    if (!response.ok) {
      let providerError;
      try {
        providerError = (await response.json()).error;
      } catch {
      }
      const id = requestId(response.headers);
      throw new LlmError4(
        providerError?.message ?? `Neuralwatt model discovery error (HTTP ${response.status})`,
        httpErrorCode(response.status, providerError),
        {
          status: response.status,
          ...id === void 0 ? {} : { requestId: id }
        }
      );
    }
    let list;
    try {
      list = await response.json();
    } catch {
      throw new LlmError4(`Neuralwatt model discovery from ${base} returned a malformed body`, "MALFORMED_RESPONSE");
    }
    const catalog = new Map(connection.models.map((model) => [model.id, model]));
    const excludes = connection.modelExcludePatterns.map((pattern) => pattern.toLowerCase());
    const models = [];
    for (const entry of list.data ?? []) {
      if (typeof entry?.id !== "string" || entry.id.length === 0) continue;
      const id = entry.id.toLowerCase();
      if (excludes.some((pattern) => id.includes(pattern))) continue;
      const known = catalog.get(entry.id);
      models.push({
        id: entry.id,
        name: displayModelName(entry.id, entry.name),
        ...known?.contextWindow !== void 0 ? { contextWindow: known.contextWindow } : {},
        ...known?.maxTokens !== void 0 ? { maxTokens: known.maxTokens } : {}
      });
    }
    models.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    return models;
  }
  /**
   * Download the models.dev catalog (optionally through the configured
   * forward proxy) and match every requested gateway id against it, serving
   * the `models-dev-params` RPC endpoint. Runs host-side on purpose: the
   * browser only names the ids and the proxy, so no cross-origin download
   * happens and the proxy is a plain HTTP forward proxy Node can use.
   * @param request - gateway model ids and an optional proxy URL.
   * @param signal - caller cancellation.
   * @returns per id: every provider entry that matched it (possibly several —
   *   the user resolves which provider's facts to adopt), possibly none.
   */
  async fetchModelsDevParams(request, signal) {
    const proxyUrl = request.proxyUrl !== void 0 && request.proxyUrl.length > 0 ? request.proxyUrl : this.config.options().proxyUrl;
    const dispatcher = proxyUrl !== void 0 ? new ProxyAgent(proxyUrl) : void 0;
    let api;
    try {
      const request_ = {
        headers: { accept: "application/json", ...attributionHeaders() },
        signal: AbortSignal.any([signal, AbortSignal.timeout(MODELS_DEV_TIMEOUT_MS)])
      };
      const response = dispatcher === void 0 ? await fetch(MODELS_DEV_API_URL, request_) : await undiciFetch(MODELS_DEV_API_URL, { ...request_, dispatcher });
      if (!response.ok) {
        throw new LlmError4(
          `models.dev catalog fetch failed (HTTP ${response.status})`,
          httpErrorCode(response.status),
          { status: response.status }
        );
      }
      api = await response.json();
    } catch (error) {
      if (error instanceof LlmError4) throw error;
      if (signal.aborted) throw error;
      const cause = error instanceof Error && error.cause instanceof Error ? `: ${error.cause.message}` : error instanceof Error ? `: ${error.message}` : "";
      const remedy = proxyUrl !== void 0 ? ` \u2014 the proxy at ${proxyUrl} is unreachable; check that it is running, or change or disable the proxy setting` : " \u2014 check the network path to models.dev, or configure a proxy for this plugin";
      throw new LlmError4(
        `models.dev catalog fetch failed${cause}${remedy}`,
        "TRANSPORT",
        { cause: error }
      );
    } finally {
      void dispatcher?.close().catch(() => {
      });
    }
    const hints = this.config.options().providerHints;
    return {
      models: await Promise.all(request.modelIds.map(async (id) => ({
        id,
        matches: await this.prioritizeOfficial(id, matchModelsDev(api, id, hints))
      })))
    };
  }
  /**
   * Registry-based official priority, complementing the hint-driven one
   * inside {@link matchModelsDev}: when the hints did NOT flag a match
   * official yet, a route registered on ctx.llm that officially serves the
   * id (bare, or the last segment of a routed id) still leads. Runs only
   * when nothing is flagged, so the two mechanisms never fight.
   * @param id - the gateway model id.
   * @param matches - every catalog match, hinted order already applied.
   * @returns matches with the registry-official one first, flagged.
   */
  async prioritizeOfficial(id, matches) {
    const hook = this.config.officialProviderOf;
    if (hook === void 0 || matches.length < 2 || matches.some((match) => match.official === true)) return matches;
    const slash = id.lastIndexOf("/");
    const official = await hook(id) ?? (slash === -1 ? void 0 : await hook(id.slice(slash + 1)));
    if (official === void 0) return matches;
    const at = matches.findIndex((match) => match.provider === official);
    const hit = at === -1 ? void 0 : matches[at];
    if (hit === void 0) return matches;
    const rest = matches.filter((_match, index) => index !== at);
    return [{ ...hit, official: true }, ...rest];
  }
  async *stream(options) {
    yield* this.streamWithConnection(options, this.config.options());
  }
  async *streamWithConnection(options, connection) {
    var _stack = [];
    try {
      const apiKey = await this.config.resolveApiKey(connection);
      const consumer = new AbortController();
      const upstream = options.signal === void 0 ? consumer.signal : AbortSignal.any([options.signal, consumer.signal]);
      const watchdog = __using(_stack, idleWatchdog(upstream, connection.streamIdleTimeoutMs, STREAM_IDLE_TIMEOUT_CODE));
      const iterator = this.request(
        options,
        watchdog.signal,
        connection,
        apiKey,
        () => {
          watchdog.pulse();
        }
      )[Symbol.asyncIterator]();
      let exhausted = false;
      try {
        while (true) {
          const result = await watchdog.next(iterator);
          if (result.done) {
            exhausted = true;
            return;
          }
          yield result.value;
        }
      } catch (error) {
        if (timeoutOf(watchdog.signal, STREAM_IDLE_TIMEOUT_CODE) !== void 0) {
          throw new LlmError4(
            `Neuralwatt stream idle timeout after ${connection.streamIdleTimeoutMs}ms`,
            "TIMEOUT",
            { cause: error }
          );
        }
        if (options.signal?.aborted) {
          throw new LlmError4("Neuralwatt request aborted by caller", "ABORTED", { cause: error });
        }
        if (error instanceof LlmError4) throw error;
        throw new LlmError4(`Neuralwatt stream from ${connection.baseURL} failed`, "TRANSPORT", { cause: error });
      } finally {
        consumer.abort("Neuralwatt stream consumer stopped");
        if (!exhausted && iterator.return !== void 0) {
          try {
            await iterator.return();
          } catch {
          }
        }
      }
    } catch (_) {
      var _error = _, _hasError = true;
    } finally {
      __callDispose(_stack, _error, _hasError);
    }
  }
  async *request(options, signal, connection, apiKey, onComment) {
    const body = serializeRequest(options);
    const payload = JSON.stringify(body);
    const headers = {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
      "accept": "text/event-stream",
      // The mandatory product attribution; nothing per-request or per-user
      // rides on a third-party gateway request.
      ...attributionHeaders()
    };
    let response;
    try {
      response = await fetch(`${connection.baseURL}/chat/completions`, {
        method: "POST",
        headers,
        body: payload,
        signal
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new LlmError4(
        `Neuralwatt request to ${connection.baseURL} failed`,
        "TRANSPORT",
        { cause: error }
      );
    }
    if (!response.ok) {
      let message = `Neuralwatt error (HTTP ${response.status})`;
      let providerError;
      try {
        const parsed = await response.json();
        providerError = parsed.error;
        if (providerError?.message) message = providerError.message;
      } catch {
      }
      const delay = providerRetryAfterMs(response.headers.get("retry-after"));
      const id = requestId(response.headers);
      throw new LlmError4(message, httpErrorCode(response.status, providerError), {
        status: response.status,
        ...delay === void 0 ? {} : { providerRetryAfterMs: delay },
        ...id === void 0 ? {} : { requestId: id }
      });
    }
    if (!response.body) {
      throw new LlmError4("Neuralwatt returned no response body", "EMPTY_RESPONSE");
    }
    yield* translate(parseSse(response.body, onComment));
  }
};

// src/quota.ts
import { attributionHeaders as attributionHeaders2 } from "@deepseek-ai/dsh-llm";
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function validUsage(value) {
  return isRecord(value) && isFiniteNumber(value.cost_usd) && isFiniteNumber(value.requests) && isFiniteNumber(value.tokens) && isFiniteNumber(value.energy_kwh);
}
function assertQuota(value) {
  if (!isRecord(value) || !isRecord(value.balance) || !isRecord(value.usage) || !isRecord(value.limits) || !validUsage(value.usage.current_month) || !validUsage(value.usage.lifetime) || !isFiniteNumber(value.balance.credits_remaining_usd) || !isFiniteNumber(value.balance.total_credits_usd) || !isFiniteNumber(value.balance.credits_used_usd) || typeof value.balance.accounting_method !== "string" || typeof value.limits.rate_limit_tier !== "string") {
    throw new Error("Neuralwatt quota response has an invalid shape");
  }
}
function errorMessage(body) {
  if (!isRecord(body)) return void 0;
  if (typeof body.error === "string" && body.error.length > 0) return body.error;
  if (isRecord(body.error) && typeof body.error.message === "string" && body.error.message.length > 0) return body.error.message;
  return void 0;
}
async function fetchQuotas(baseURL, apiKey, signal) {
  const response = await fetch(`${baseURL}/quota`, {
    headers: { authorization: `Bearer ${apiKey}`, accept: "application/json", ...attributionHeaders2() },
    signal: AbortSignal.any([signal, AbortSignal.timeout(15e3)])
  });
  if (!response.ok) {
    let message = response.statusText;
    try {
      message = errorMessage(await response.json()) ?? message;
    } catch {
    }
    throw new Error(`Neuralwatt quota request failed (HTTP ${response.status}): ${message || "Unknown error"}`);
  }
  const quota = await response.json();
  assertQuota(quota);
  return quota;
}

// src/config-volatile.ts
function markVolatile(schema) {
  return schema.volatile();
}
function markVolatileFields(fields) {
  return Object.fromEntries(
    Object.entries(fields).map(([name2, schema]) => [name2, markVolatile(schema)])
  );
}
function isVolatileRef(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.isFrozen(value) && typeof value.get === "function";
}
function unwrapVolatileConfig(config) {
  const entries = Object.entries(config).flatMap(([key, value]) => {
    if (!isVolatileRef(value)) return [[key, value]];
    const current = value.get();
    return current === void 0 ? [] : [[key, current]];
  });
  return Object.fromEntries(entries);
}

// src/index.ts
var MINIMUM_DSH_VERSION = "0.1.7-rc.1";
function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.exec(
    version
  );
  if (match === null) return void 0;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  const prerelease = match[4]?.split(".").map((part) => /^\d+$/u.test(part) ? Number(part) : part);
  return prerelease === void 0 ? { core: [major, minor, patch] } : { core: [major, minor, patch], prerelease };
}
function compareSemver(left, right) {
  const [leftMajor, leftMinor, leftPatch] = left.core;
  const [rightMajor, rightMinor, rightPatch] = right.core;
  for (const difference of [
    leftMajor - rightMajor,
    leftMinor - rightMinor,
    leftPatch - rightPatch
  ]) {
    if (difference !== 0) return difference;
  }
  if (left.prerelease === void 0)
    return right.prerelease === void 0 ? 0 : 1;
  if (right.prerelease === void 0) return -1;
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart === void 0) return rightPart === void 0 ? 0 : -1;
    if (rightPart === void 0) return 1;
    if (leftPart === rightPart) continue;
    if (typeof leftPart === "number" && typeof rightPart === "number")
      return leftPart - rightPart;
    if (typeof leftPart === "number") return -1;
    if (typeof rightPart === "number") return 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}
function isSupportedHostVersion(version) {
  const actual = parseSemver(version);
  const minimum = parseSemver(MINIMUM_DSH_VERSION);
  return actual !== void 0 && minimum !== void 0 && compareSemver(actual, minimum) >= 0;
}
var hostLlmVersion = typeof llmManifest.version === "string" ? llmManifest.version : "unknown";
if (!isSupportedHostVersion(hostLlmVersion)) {
  throw new Error(
    `dsh-llm-neuralwatt requires dsh >= ${MINIMUM_DSH_VERSION} (host ships @deepseek-ai/dsh-llm ${hostLlmVersion}); upgrade the host: npm install -g @deepseek-ai/dsh@${MINIMUM_DSH_VERSION}`
  );
}
var name = "llm-neuralwatt";
var inject = ["llm"];
var NS = "llm-neuralwatt";
var API_KEY_REF = "neuralwatt";
var BASE_URL_ENV = "NEURALWATT_BASE_URL";
var DEFAULT_BASE_URL = "https://api.neuralwatt.com/v1/chat/completions";
var PROVIDER = "neuralwatt";
var catalogModel = z.object({
  id: z.string().required(),
  name: z.string(),
  description: z.string(),
  contextWindow: z.number().step(1).min(1),
  maxTokens: z.number().step(1).min(1),
  reasoningEfforts: z.array(z.string()),
  defaultReasoningEffort: z.string()
});
var DEFAULT_PROXY_URL = "http://127.0.0.1:7890";
var proxySchema = z.object({
  enabled: z.boolean().default(false),
  url: z.string().default(DEFAULT_PROXY_URL)
});
var Config = z.object(
  markVolatileFields({
    // The settings form renders a text box for this field, so the description
    // is the only place a user learns that both the full chat endpoint and the
    // bare API root are accepted — and that the value is not the final URL the
    // adapter fetches for anything but chat.
    baseURL: z.string().default(DEFAULT_BASE_URL).description("Gateway endpoint. Accepts the full chat-completions URL or the bare /v1 API root; a trailing /chat/completions is stripped before /models and /quota are appended."),
    // `ui-settings-models` reads this conventional field to join a provider
    // with `credentials.describe()`. Keep it aligned with API_KEY_REF, which
    // remains the only credential reference the adapter and dedicated page
    // use. The role tells the generic form this is a reference name, not a
    // secret literal, so it renders the credential affordance.
    apiKeyEnv: z.string().role("credential-ref").default(API_KEY_REF),
    models: z.array(catalogModel).default([]),
    modelExcludePatterns: z.array(z.string()).default([...DEFAULT_MODEL_EXCLUDE_PATTERNS]),
    defaultContextWindow: z.number().step(1).min(1).default(DEFAULT_CONTEXT_WINDOW),
    maxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER),
    streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
    proxy: proxySchema.default({ enabled: false, url: DEFAULT_PROXY_URL }),
    providerHints: z.object({
      defaults: z.object({}),
      models: z.object({})
    }),
    retryPolicy: RetryPolicySchema
  })
);
function resolveModels(models) {
  const seen = /* @__PURE__ */ new Set();
  return (models ?? []).map((model) => {
    if (model.id.length === 0)
      throw new Error(`${PKG}: catalog model ids must be non-empty`);
    if (model.name !== void 0 && model.name.length === 0) {
      throw new Error(`${PKG}: catalog model "${model.id}" has an empty name`);
    }
    if (model.contextWindow !== void 0 && (!Number.isInteger(model.contextWindow) || model.contextWindow <= 0)) {
      throw new Error(
        `${PKG}: catalog model "${model.id}" contextWindow must be a positive integer`
      );
    }
    if (model.maxTokens !== void 0 && (!Number.isInteger(model.maxTokens) || model.maxTokens <= 0)) {
      throw new Error(
        `${PKG}: catalog model "${model.id}" maxTokens must be a positive integer`
      );
    }
    if (seen.has(model.id))
      throw new Error(`${PKG}: duplicate catalog model "${model.id}"`);
    seen.add(model.id);
    for (const effort of model.reasoningEfforts ?? []) {
      if (effort.length === 0)
        throw new Error(
          `${PKG}: catalog model "${model.id}" has an empty reasoning effort`
        );
    }
    if (model.defaultReasoningEffort !== void 0 && !(model.reasoningEfforts ?? []).includes(model.defaultReasoningEffort)) {
      throw new Error(
        `${PKG}: catalog model "${model.id}" default reasoning effort "${model.defaultReasoningEffort}" is not among its reasoning efforts`
      );
    }
    return {
      id: model.id,
      ...model.name === void 0 ? {} : { name: model.name },
      ...model.description === void 0 ? {} : { description: model.description },
      ...model.contextWindow === void 0 ? {} : { contextWindow: model.contextWindow },
      ...model.maxTokens === void 0 ? {} : { maxTokens: model.maxTokens },
      ...model.reasoningEfforts === void 0 || model.reasoningEfforts.length === 0 ? {} : { reasoningEfforts: model.reasoningEfforts },
      ...model.defaultReasoningEffort === void 0 ? {} : { defaultReasoningEffort: model.defaultReasoningEffort }
    };
  });
}
function resolveAdapterOptions(config, environment) {
  const configured = config.baseURL !== void 0 && config.baseURL.trim().length > 0 ? config.baseURL : void 0;
  const named = configured !== void 0 && configured !== DEFAULT_BASE_URL ? configured : environment?.get(BASE_URL_ENV)?.value ?? configured;
  const rawBase = named !== void 0 && named.trim().length > 0 ? named : DEFAULT_BASE_URL;
  const modelExcludePatterns = config.modelExcludePatterns ?? [
    ...DEFAULT_MODEL_EXCLUDE_PATTERNS
  ];
  for (const pattern of modelExcludePatterns) {
    if (pattern.length === 0)
      throw new Error(`${PKG}: modelExcludePatterns entries must be non-empty`);
  }
  if (config.defaultContextWindow !== void 0 && (!Number.isInteger(config.defaultContextWindow) || config.defaultContextWindow <= 0)) {
    throw new Error(`${PKG}: defaultContextWindow must be a positive integer`);
  }
  if (config.maxTokens !== void 0 && (!Number.isSafeInteger(config.maxTokens) || config.maxTokens <= 0)) {
    throw new Error(`${PKG}: maxTokens must be a positive safe integer`);
  }
  const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS;
  if (!Number.isFinite(streamIdleTimeoutMs) || streamIdleTimeoutMs <= 0 || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `${PKG}: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`
    );
  }
  const defaultContextWindow = config.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW;
  const proxyEnabled = config.proxy?.enabled === true;
  const proxyUrlRaw = config.proxy?.url ?? DEFAULT_PROXY_URL;
  if (proxyEnabled) {
    let proxyUrl;
    try {
      proxyUrl = new URL(proxyUrlRaw);
    } catch {
      throw new Error(
        `${PKG}: proxy.url must be an absolute URL (got: ${proxyUrlRaw})`
      );
    }
    if (!/^https?:$/.test(proxyUrl.protocol)) {
      throw new Error(
        `${PKG}: proxy.url must be an http(s) URL (got: ${proxyUrlRaw})`
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
    ...proxyEnabled ? { proxyUrl: proxyUrlRaw } : {},
    providerHints: {
      defaults: { ...config.providerHints?.defaults },
      models: { ...config.providerHints?.models }
    },
    retryPolicy: resolveRetryPolicy(config.retryPolicy, `${PKG}: retryPolicy`),
    ...config.maxTokens === void 0 ? {} : { maxTokens: config.maxTokens }
  };
}
function apply(ctx, config) {
  const current = () => unwrapVolatileConfig(config);
  let lastGood;
  const options = () => {
    try {
      lastGood = resolveAdapterOptions(current(), launchEnvironmentOf(ctx));
      return lastGood;
    } catch (error) {
      if (lastGood === void 0) throw error;
      ctx.logger.error(
        `${PKG}: keeping the last good configuration after an invalid config`
      );
      ctx.logger.error(error);
      return lastGood;
    }
  };
  options();
  const resolveApiKey = async (connection) => {
    const ref = connection.apiKeyRef;
    const credentials = ctx.get("credentials");
    if (credentials !== void 0) {
      const hit = await credentials.resolve(ref);
      if (hit !== void 0) return assertUsableApiKey2(hit.value, PKG, ref);
    }
    throw new LlmError5(
      `${PKG}: no API key for provider route "${PROVIDER}"; configure it on the Neuralwatt settings page in dsh web (credentials reference "${ref}")`,
      "MISSING_CREDENTIAL"
    );
  };
  let indexCache;
  const officialProviderOf = async (modelId) => {
    const routes = ctx.llm.listProviders().map((provider) => provider.id).sort().join(",");
    if (indexCache === void 0 || indexCache.routes !== routes) {
      const byModel = /* @__PURE__ */ new Map();
      for (const provider of ctx.llm.listProviders()) {
        if (provider.id === PROVIDER) continue;
        try {
          for (const model of await ctx.llm.listModels(provider.id)) {
            byModel.set(model.id, provider.id);
          }
        } catch {
        }
      }
      indexCache = { routes, byModel };
    }
    return indexCache.byModel.get(modelId);
  };
  const adapter = new NeuralwattAdapter({
    options,
    resolveApiKey,
    officialProviderOf
  });
  ctx.llm.registerConfigurableProviders([
    {
      provider: PROVIDER,
      displayName: "Neuralwatt",
      settingsNs: NS,
      settingsPath: []
    }
  ]);
  ctx.llm.registerAdapter([PROVIDER], adapter);
  ctx.llm.registerModelDiscovery(
    NS,
    (request, signal) => adapter.discoverModels(request, signal)
  );
  ctx.inject(["connection", "webServer"], (cctx) => {
    const connection = cctx.get("connection");
    const registrar = connection;
    cctx.effect(
      () => registrar.register(
        cctx,
        "/llm-neuralwatt",
        (endpoint, payload, signal) => {
          if (endpoint === "quota") {
            const quotaConnection = options();
            return resolveApiKey(quotaConnection).then(
              (apiKey) => fetchQuotas(quotaConnection.baseURL, apiKey, signal)
            ).then((value) => ({ ok: true, value })).catch((error) => ({
              ok: false,
              error: {
                code: "internal",
                message: error instanceof Error ? error.message : String(error),
                details: {}
              }
            }));
          }
          if (endpoint !== "models-dev-params") {
            return Promise.resolve({
              ok: false,
              error: {
                code: "internal",
                message: `llm-neuralwatt: unknown endpoint ${endpoint}`,
                details: {}
              }
            });
          }
          const request = payload;
          return adapter.fetchModelsDevParams(request, signal).then((value) => ({ ok: true, value })).catch((error) => ({
            ok: false,
            error: {
              code: "internal",
              message: error instanceof Error ? error.message : String(error),
              details: {}
            }
          }));
        }
      ),
      "llm-neuralwatt: models-dev RPC channel"
    );
  });
  ctx.inject(["settings"], (sctx) => {
    sctx.effect(
      () => sctx.settings.configure({ auto: false }, ctx.fiber),
      "llm-neuralwatt: settings presentation policy"
    );
  });
}
export {
  Config,
  DEFAULT_BASE_URL,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MODEL_EXCLUDE_PATTERNS,
  DEFAULT_PROVIDER_HINTS,
  DEFAULT_PROXY_URL,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  NeuralwattAdapter,
  PKG,
  apply,
  inject,
  isVolatileRef,
  markVolatile,
  markVolatileFields,
  matchModelsDev,
  modelNameFromId,
  name,
  normalizeBaseUrl,
  resolveAdapterOptions,
  serializeRequest,
  unwrapVolatileConfig
};
//# sourceMappingURL=index.js.map
