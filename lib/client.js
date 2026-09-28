window.__ModuleLoader__.load({ id: "dsh-llm-neuralwatt", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/NeuralwattSection.tsx
var import_react = require("react");

// src/url-shape.ts
var OCTET = String.raw`(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)`;
var IPV4 = String.raw`(?:${OCTET}\.){3}${OCTET}`;
var H16 = String.raw`[0-9A-Fa-f]{1,4}`;
var LS32 = String.raw`(?:${H16}:${H16}|${IPV4})`;
var IPV6 = String.raw`(?:` + String.raw`(?:${H16}:){6}${LS32}` + String.raw`|::(?:${H16}:){5}${LS32}` + String.raw`|(?:${H16})?::(?:${H16}:){4}${LS32}` + String.raw`|(?:(?:${H16}:){0,1}${H16})?::(?:${H16}:){3}${LS32}` + String.raw`|(?:(?:${H16}:){0,2}${H16})?::(?:${H16}:){2}${LS32}` + String.raw`|(?:(?:${H16}:){0,3}${H16})?::${H16}:${LS32}` + String.raw`|(?:(?:${H16}:){0,4}${H16})?::${LS32}` + String.raw`|(?:(?:${H16}:){0,5}${H16})?::${H16}` + String.raw`|(?:(?:${H16}:){0,6}${H16})?::` + String.raw`)`;
var HOSTNAME = String.raw`(?:[\p{L}\p{N}_~-]+\.)*[\p{L}_~-]*\p{L}[\p{L}\p{N}_~-]*\.?`;
var PORT = String.raw`(?::(?:[0-9]{1,4}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5]))?`;
var BASE_URL_PATTERN = new RegExp(
  String.raw`^(?!.*[\/](?:\.{1,2}|%2e{1,2})(?:[\/?#]|$))(?!.*%2f)https?:\/\/(?![^\/?#]*@)(?:\[${IPV6}\]|${IPV4}|${HOSTNAME})${PORT}(?:[\/?#]\S*)?$`,
  "iu"
);
function typedHostOf(raw) {
  const authority = raw.replace(/^https?:\/\//i, "").split(/[/?#]/)[0] ?? "";
  const withoutUser = authority.replace(/^.*@/, "");
  if (withoutUser.startsWith("[")) {
    const end = withoutUser.indexOf("]");
    return end === -1 ? withoutUser : withoutUser.slice(1, end);
  }
  return withoutUser.replace(/:\d*$/, "");
}
function hasDotSegment(raw) {
  const afterAuthority = raw.replace(/^https?:\/\//i, "").replace(/^[^/?#]*/, "");
  const path = afterAuthority.split(/[?#]/, 1)[0] ?? "";
  for (const segment of path.split("/")) {
    let decoded = segment;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
    }
    if (decoded === "." || decoded === "..") return true;
  }
  return false;
}
function classifyBaseUrl(raw) {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "empty";
  const base = trimmed.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) return "scheme";
  let url;
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
  return void 0;
}

// src/client/NeuralwattSection.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function textOf(model, key) {
  const value = model[key];
  return typeof value === "string" ? value : "";
}
function numberOf(model, key) {
  const value = model[key];
  return typeof value === "number" ? value : void 0;
}
var CAPACITY_PATTERN = /^(\d+(?:\.\d+)?)([km])?$/i;
var CAPACITY_SCALE = { k: 1e3, m: 1e6 };
function parseCapacity(text) {
  const trimmed = text.trim();
  if (trimmed.length === 0) return void 0;
  const match = CAPACITY_PATTERN.exec(trimmed);
  if (match === null) return Number.NaN;
  const suffix = match[2]?.toLowerCase();
  const scale = suffix === "k" || suffix === "m" ? CAPACITY_SCALE[suffix] : 1;
  const scaled = Number(match[1]) * scale;
  const rounded = Math.round(scaled);
  return Math.abs(scaled - rounded) < 1e-6 ? rounded : scaled;
}
function formatCapacity(value) {
  if (!Number.isInteger(value) || value <= 0) return String(value);
  if (value % CAPACITY_SCALE.m === 0) return `${String(value / CAPACITY_SCALE.m)}M`;
  if (value % CAPACITY_SCALE.k === 0) return `${String(value / CAPACITY_SCALE.k)}K`;
  return String(value);
}
var CAPACITY_HINT = {
  contextWindow: "128K",
  maxTokens: "8K"
};
function IconChevron({ open }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "svg",
    {
      width: "14",
      height: "14",
      viewBox: "0 0 16 16",
      fill: "none",
      "aria-hidden": true,
      style: { transform: open ? "rotate(90deg)" : void 0, transition: "transform 120ms ease" },
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M6 3.5L10.5 8L6 12.5", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" })
    }
  );
}
function IconTrash() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", "aria-hidden": true, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "path",
    {
      d: "M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9a1 1 0 001 .9h4.6a1 1 0 001-.9L12 4M6.5 6.8v4.4M9.5 6.8v4.4",
      stroke: "currentColor",
      strokeWidth: "1.3",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }
  ) });
}
var NS = "llm-neuralwatt";
var KEY_REF = "neuralwatt";
var DEFAULT_PROXY_URL = "http://127.0.0.1:7890";
function toDrafts(source) {
  if (!Array.isArray(source)) return [];
  return source.map((entry) => typeof entry === "object" && entry !== null && !Array.isArray(entry) ? entry : {});
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
function highestOf(efforts) {
  const ids = efforts.filter((effort) => typeof effort === "string");
  return [...ids].sort((a, b) => (EFFORT_RUNG[b] ?? -1) - (EFFORT_RUNG[a] ?? -1))[0] ?? "";
}
function bufferKey(index, field) {
  return `${String(index)}:${field}`;
}
function percentage(used, total) {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, used / total * 100));
}
function usd(value) {
  return `$${value.toFixed(4)}`;
}
function NeuralwattSection(props) {
  const { api, t, fetchModelParams, fetchQuota } = props;
  const [status, setStatus] = (0, import_react.useState)("loading");
  const [errorText, setErrorText] = (0, import_react.useState)(void 0);
  const [revision, setRevision] = (0, import_react.useState)(0);
  const [writable, setWritable] = (0, import_react.useState)(true);
  const [keyConfigured, setKeyConfigured] = (0, import_react.useState)(void 0);
  const [keyLocked, setKeyLocked] = (0, import_react.useState)(false);
  const [baseURL, setBaseURL] = (0, import_react.useState)("");
  const [keyDraft, setKeyDraft] = (0, import_react.useState)("");
  const [models, setModels] = (0, import_react.useState)([]);
  const [expanded, setExpanded] = (0, import_react.useState)(/* @__PURE__ */ new Set());
  const [editing, setEditing] = (0, import_react.useState)(/* @__PURE__ */ new Map());
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [notice, setNotice] = (0, import_react.useState)(void 0);
  const [candidates, setCandidates] = (0, import_react.useState)(void 0);
  const [picked, setPicked] = (0, import_react.useState)(/* @__PURE__ */ new Set());
  const [proxyEnabled, setProxyEnabled] = (0, import_react.useState)(false);
  const [proxyUrl, setProxyUrl] = (0, import_react.useState)(DEFAULT_PROXY_URL);
  const [params, setParams] = (0, import_react.useState)(void 0);
  const [paramChoices, setParamChoices] = (0, import_react.useState)(/* @__PURE__ */ new Map());
  const [paramsBusy, setParamsBusy] = (0, import_react.useState)(false);
  const [quotas, setQuotas] = (0, import_react.useState)(void 0);
  const [quotaBusy, setQuotaBusy] = (0, import_react.useState)(false);
  const [quotaError, setQuotaError] = (0, import_react.useState)(void 0);
  const paramsRef = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    paramsRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [params]);
  const load = async () => {
    setStatus("loading");
    setErrorText(void 0);
    try {
      const described = await api.describeSettings();
      if (!described.ok) {
        setErrorText(described.error.message);
        setStatus("error");
        return;
      }
      setWritable(described.value.writable);
      const section = described.value.namespaces.find((entry) => entry.ns === NS);
      if (section === void 0) {
        setErrorText(t("nsNotRegistered"));
        setStatus("error");
        return;
      }
      const value = section.value ?? {};
      setRevision(section.revision);
      setBaseURL(typeof value.baseURL === "string" ? value.baseURL : "");
      setModels(toDrafts(value.models));
      const proxy = value.proxy ?? {};
      setProxyEnabled(proxy.enabled === true);
      if (typeof proxy.url === "string" && proxy.url.length > 0) setProxyUrl(proxy.url);
      setExpanded(/* @__PURE__ */ new Set());
      setEditing(/* @__PURE__ */ new Map());
      const credential = await api.describeCredentials([KEY_REF]);
      if (credential.ok) {
        const view = credential.value[KEY_REF];
        setKeyConfigured(view?.configured);
        setKeyLocked(view?.writable === false);
      }
      setStatus("ready");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
      setStatus("error");
    }
  };
  (0, import_react.useEffect)(() => {
    void load();
    void refreshQuota();
  }, []);
  const refreshQuota = async () => {
    setQuotaBusy(true);
    setQuotaError(void 0);
    try {
      const result = await fetchQuota();
      if (!result.ok) {
        setQuotaError(result.error.message);
        return;
      }
      setQuotas(result.value);
    } catch (error) {
      setQuotaError(error instanceof Error ? error.message : String(error));
    } finally {
      setQuotaBusy(false);
    }
  };
  const saved = (text) => {
    setNotice(text);
    void load();
    void refreshQuota();
  };
  const catalogProblem = () => {
    const seen = /* @__PURE__ */ new Set();
    for (const [index, model] of models.entries()) {
      const id = textOf(model, "id").trim();
      if (id.length === 0) return `${t("modelIdRequired")} (${t("models")} ${String(index + 1)})`;
      if (seen.has(id)) return `${t("modelIdDuplicate")} (${id})`;
      seen.add(id);
      for (const field of ["contextWindow", "maxTokens"]) {
        const buffer = editing.get(bufferKey(index, field));
        if (buffer !== void 0 && Number.isNaN(parseCapacity(buffer) ?? 0)) {
          return `${t("capacityInvalid")} (${id} \xB7 ${t(field)})`;
        }
      }
    }
    return void 0;
  };
  const baseUrlProblem = () => classifyBaseUrl(baseURL) === void 0 ? void 0 : t("baseUrlInvalid");
  const save = async () => {
    const problem = catalogProblem() ?? baseUrlProblem();
    if (problem !== void 0) {
      setErrorText(problem);
      return;
    }
    setBusy(true);
    setNotice(void 0);
    setErrorText(void 0);
    try {
      const trimmedBase = baseURL.trim();
      const ops = [];
      if (trimmedBase.length > 0) ops.push({ op: "set", path: ["baseURL"], value: trimmedBase });
      else ops.push({ op: "unset", path: ["baseURL"] });
      ops.push({
        op: "set",
        path: ["proxy"],
        value: { enabled: proxyEnabled, url: proxyUrl.trim().length > 0 ? proxyUrl.trim() : DEFAULT_PROXY_URL }
      });
      ops.push({
        op: "set",
        path: ["models"],
        value: models.map((model) => {
          const id = textOf(model, "id").trim();
          const name = textOf(model, "name").trim();
          const contextWindow = numberOf(model, "contextWindow");
          const maxTokens = numberOf(model, "maxTokens");
          const efforts = Array.isArray(model.reasoningEfforts) ? model.reasoningEfforts.filter((effort) => typeof effort === "string" && effort.length > 0) : [];
          const preset = typeof model.defaultReasoningEffort === "string" && efforts.includes(model.defaultReasoningEffort) ? model.defaultReasoningEffort : void 0;
          return {
            id,
            ...name.length > 0 ? { name } : {},
            ...contextWindow !== void 0 ? { contextWindow } : {},
            ...maxTokens !== void 0 ? { maxTokens } : {},
            ...efforts.length > 0 ? { reasoningEfforts: efforts } : {},
            ...preset !== void 0 ? { defaultReasoningEffort: preset } : {}
          };
        })
      });
      const mutated = await api.mutateSettings(NS, ops, revision);
      if (!mutated.ok) {
        setErrorText(mutated.error.message);
        return;
      }
      setRevision(mutated.value.revision);
      const key = keyDraft.trim();
      if (key.length > 0) {
        const stored = await api.setCredential(KEY_REF, key);
        if (!stored.ok) {
          setErrorText(stored.error.message);
          return;
        }
        setKeyDraft("");
      }
      saved(t("saved"));
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const fetchModels = async () => {
    setBusy(true);
    setErrorText(void 0);
    setCandidates(void 0);
    try {
      const key = keyDraft.trim();
      const response = await api.discoverModels(NS, {
        provider: "neuralwatt",
        ...baseURL.trim().length > 0 ? { baseURL: baseURL.trim() } : {},
        ...key.length > 0 ? { apiKey: key } : {}
      });
      if (!response.ok) {
        setErrorText(response.error.message);
        return;
      }
      const found = response.value;
      found.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      if (found.length === 0) {
        setErrorText(t("fetchEmpty"));
        return;
      }
      const known = new Set(models.map((model) => textOf(model, "id")));
      setCandidates(found);
      setPicked(new Set(found.filter((model) => !known.has(model.id)).map((model) => model.id)));
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const adopt = () => {
    if (candidates === void 0) return;
    const existing = new Map(models.map((model) => [textOf(model, "id"), model]));
    for (const candidate of candidates) {
      if (!picked.has(candidate.id)) continue;
      if (existing.has(candidate.id)) continue;
      existing.set(candidate.id, {
        id: candidate.id,
        ...candidate.name === void 0 ? {} : { name: candidate.name },
        ...candidate.contextWindow === void 0 ? {} : { contextWindow: candidate.contextWindow },
        ...candidate.maxTokens === void 0 ? {} : { maxTokens: candidate.maxTokens }
      });
    }
    setModels([...existing.values()].sort((a, b) => {
      const ai = textOf(a, "id").trim();
      const bi = textOf(b, "id").trim();
      if (ai.length === 0) return bi.length === 0 ? 0 : 1;
      if (bi.length === 0) return -1;
      return ai < bi ? -1 : ai > bi ? 1 : 0;
    }));
    setExpanded(/* @__PURE__ */ new Set());
    setEditing(/* @__PURE__ */ new Map());
    setCandidates(void 0);
    setPicked(/* @__PURE__ */ new Set());
  };
  const toggle = (id) => {
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };
  const allPicked = candidates !== void 0 && candidates.length > 0 && candidates.every((model) => picked.has(model.id));
  const somePicked = candidates !== void 0 && candidates.some((model) => picked.has(model.id));
  const toggleAll = () => {
    if (candidates === void 0) return;
    setPicked(allPicked ? /* @__PURE__ */ new Set() : new Set(candidates.map((model) => model.id)));
  };
  const selectAllRef = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    if (selectAllRef.current !== null) selectAllRef.current.indeterminate = somePicked && !allPicked;
  }, [somePicked, allPicked]);
  const updateParams = async () => {
    const ids = models.map((model) => textOf(model, "id").trim()).filter((id) => id.length > 0);
    if (ids.length === 0) {
      setErrorText(t("paramsNoModels"));
      return;
    }
    setParamsBusy(true);
    setErrorText(void 0);
    setParams(void 0);
    try {
      const response = await fetchModelParams({
        modelIds: ids,
        ...proxyEnabled && proxyUrl.trim().length > 0 ? { proxyUrl: proxyUrl.trim() } : {}
      });
      if (!response.ok) {
        setErrorText(response.error.message);
        return;
      }
      setParams(response.value);
      setParamChoices(/* @__PURE__ */ new Map());
      const matched = response.value.models.filter((entry) => entry.matches.length > 0).length;
      setNotice(
        t("paramsSummary").replace("{matched}", String(matched)).replace("{unmatched}", String(response.value.models.length - matched))
      );
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setParamsBusy(false);
    }
  };
  const chosenMatch = (entry) => entry.matches[paramChoices.get(entry.id) ?? 0] ?? entry.matches[0];
  const applyParams = (overwrite) => {
    if (params === void 0) return;
    const byId = new Map(params.models.map((entry) => [entry.id, entry]));
    let touched = 0;
    const next = models.map((model) => {
      const id = textOf(model, "id").trim();
      const entry = byId.get(id);
      const match = entry === void 0 || entry.matches.length === 0 ? void 0 : chosenMatch(entry);
      if (match === void 0) return model;
      const nextContext = match.contextWindow;
      const nextMax = match.maxTokens;
      const nextEfforts = match.reasoningEfforts;
      const currentContext = numberOf(model, "contextWindow");
      const currentMax = numberOf(model, "maxTokens");
      const hasEfforts = Array.isArray(model.reasoningEfforts);
      const takeContext = nextContext !== void 0 && (overwrite || currentContext === void 0);
      const takeMax = nextMax !== void 0 && (overwrite || currentMax === void 0);
      const takeEfforts = nextEfforts !== void 0 && nextEfforts.length > 0 && (overwrite || !hasEfforts);
      if (!takeContext && !takeMax && !takeEfforts) return model;
      touched += 1;
      return {
        ...model,
        ...takeContext && nextContext !== void 0 ? { contextWindow: nextContext } : {},
        ...takeMax && nextMax !== void 0 ? { maxTokens: nextMax } : {},
        ...takeEfforts && nextEfforts !== void 0 ? { reasoningEfforts: nextEfforts } : {}
      };
    });
    setModels(next);
    setParams(void 0);
    setParamChoices(/* @__PURE__ */ new Map());
    setNotice(`${t("paramsApplied")} (${String(touched)})`);
  };
  const patch = (index, next) => {
    setModels((current) => current.map((model, at) => {
      if (at !== index) return model;
      const cleared = new Set(
        Object.entries(next).filter(([, value]) => value === void 0 || value === "").map(([key]) => key)
      );
      return Object.fromEntries(
        Object.entries({ ...model, ...next }).filter(([key]) => !cleared.has(key))
      );
    }));
  };
  const toggleExpanded = (index) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(index)) next.add(index);
      return next;
    });
  };
  const capacityText = (model, index, field) => editing.get(bufferKey(index, field)) ?? (numberOf(model, field) === void 0 ? "" : formatCapacity(numberOf(model, field)));
  const editCapacity = (index, field, text) => {
    setEditing((current) => new Map(current).set(bufferKey(index, field), text));
    patch(index, { [field]: parseCapacity(text) });
  };
  const reindexOnRemove = (current, index) => {
    const next = /* @__PURE__ */ new Map();
    for (const [key, value] of current) {
      const at = Number(key.slice(0, key.indexOf(":")));
      if (at === index) continue;
      next.set(at > index ? key.replace(/^\d+/, String(at - 1)) : key, value);
    }
    return next;
  };
  const removeModel = (index) => {
    setModels((current) => current.filter((_model, at) => at !== index));
    setExpanded((current) => {
      const next = /* @__PURE__ */ new Set();
      for (const at of current) {
        if (at < index) next.add(at);
        else if (at > index) next.add(at - 1);
      }
      return next;
    });
    setEditing((current) => reindexOnRemove(current, index));
  };
  if (status === "loading") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", { "aria-label": t("nav"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u2026" }) });
  if (status === "error") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { "aria-label": t("nav"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "neuralwatt-error", children: `${t("loadFailed")}: ${errorText ?? ""}` }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "neuralwatt-button", onClick: () => {
        void load();
      }, children: t("retry") })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { "aria-label": t("nav"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: t("intro") }),
    notice === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "status", children: notice }),
    !writable ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: t("readOnly") }) : null,
    errorText === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "neuralwatt-error", children: errorText }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "neuralwatt-usage", "aria-label": "Neuralwatt account usage", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-usage-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Account usage" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "neuralwatt-button", disabled: quotaBusy, onClick: () => {
          void refreshQuota();
        }, children: quotaBusy ? "Refreshing\u2026" : "Refresh" })
      ] }),
      quotaError === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "neuralwatt-error", children: quotaError }),
      quotas === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "neuralwatt-hint", children: "Refresh to load Neuralwatt credits, energy, usage, and API-key allowance." }) : (() => {
        const { balance, subscription, usage, key } = quotas;
        const creditUsed = balance.credits_used_usd || Math.max(0, balance.total_credits_usd - balance.credits_remaining_usd);
        const creditPercent = percentage(creditUsed, balance.total_credits_usd);
        const energyPercent = subscription === null ? 0 : percentage(subscription.kwh_used, subscription.kwh_included);
        const keyPercent = key.allowance === null ? 0 : percentage(key.allowance.spent_usd, key.allowance.limit_usd);
        const updated = new Date(quotas.snapshot_at);
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-badges", children: [
            subscription === null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "neuralwatt-badge", children: "On-demand credits" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "neuralwatt-badge", children: subscription.plan }),
            subscription?.status === "active" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "neuralwatt-badge neuralwatt-badge--active", children: "Active" }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "neuralwatt-badge", children: [
              quotas.limits.rate_limit_tier,
              " tier"
            ] }),
            subscription?.in_overage === true ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "neuralwatt-badge", children: "Overage" }) : null
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-usage-cards", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-usage-card", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "neuralwatt-usage-label", children: "Credits remaining" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "neuralwatt-usage-value", children: usd(balance.credits_remaining_usd) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-usage-detail", children: [
                balance.accounting_method,
                " accounting"
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-usage-card", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "neuralwatt-usage-label", children: "Monthly spend" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "neuralwatt-usage-value", children: usd(usage.current_month.cost_usd) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "neuralwatt-usage-detail", children: "Current billing month" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-usage-card", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "neuralwatt-usage-label", children: "Requests" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "neuralwatt-usage-value", children: usage.current_month.requests.toLocaleString() }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "neuralwatt-usage-detail", children: "Current billing month" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-usage-card", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "neuralwatt-usage-label", children: "Tokens" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "neuralwatt-usage-value", children: usage.current_month.tokens.toLocaleString() }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-usage-detail", children: [
                usage.current_month.energy_kwh.toFixed(6),
                " kWh used"
              ] })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-meter", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-meter-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Credit balance" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "neuralwatt-meter-value", children: [
                usd(creditUsed),
                " used / ",
                usd(balance.total_credits_usd)
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "neuralwatt-meter-track", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `neuralwatt-meter-fill${creditPercent >= 90 ? " neuralwatt-meter-fill--warning" : ""}`, style: { width: `${creditPercent}%` } }) })
          ] }),
          subscription === null ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-meter", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-meter-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Subscription energy" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "neuralwatt-meter-value", children: [
                subscription.kwh_used.toFixed(6),
                " / ",
                subscription.kwh_included.toFixed(6),
                " kWh"
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "neuralwatt-meter-track", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `neuralwatt-meter-fill${energyPercent >= 90 ? " neuralwatt-meter-fill--warning" : ""}`, style: { width: `${energyPercent}%` } }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-usage-detail", children: [
              subscription.kwh_remaining.toFixed(6),
              " kWh remaining",
              subscription.current_period_end.length > 0 ? ` \xB7 resets ${new Date(subscription.current_period_end).toLocaleDateString()}` : ""
            ] })
          ] }),
          key.allowance === null ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-meter", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-meter-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "API-key allowance" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "neuralwatt-meter-value", children: [
                usd(key.allowance.spent_usd),
                " used / ",
                usd(key.allowance.limit_usd)
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "neuralwatt-meter-track", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `neuralwatt-meter-fill${keyPercent >= 90 ? " neuralwatt-meter-fill--warning" : ""}`, style: { width: `${keyPercent}%` } }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-usage-detail", children: [
              usd(key.allowance.remaining_usd),
              " remaining \xB7 ",
              key.allowance.period,
              key.allowance.blocked ? " \xB7 blocked" : ""
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "neuralwatt-usage-updated", children: [
            "Updated ",
            Number.isNaN(updated.getTime()) ? "just now" : updated.toLocaleString()
          ] })
        ] });
      })()
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: "neuralwatt-key", children: t("keyInput") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          id: "neuralwatt-key",
          type: "password",
          autoComplete: "off",
          className: "neuralwatt-input",
          disabled: keyLocked,
          placeholder: keyLocked ? t("keyEnvLocked") : keyConfigured === true ? t("keyStored") : keyConfigured === false ? t("keyMissing") : t("keyPlaceholder"),
          value: keyDraft,
          onChange: (event) => {
            setKeyDraft(event.target.value);
          }
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor: "neuralwatt-base", children: t("baseUrl") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          id: "neuralwatt-base",
          type: "text",
          className: "neuralwatt-input",
          placeholder: t("baseUrlPlaceholder"),
          value: baseURL,
          onChange: (event) => {
            setBaseURL(event.target.value);
          }
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "neuralwatt-catalog", "aria-label": t("models"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-catalog-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "neuralwatt-catalog-title", children: t("models") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-catalog-actions", style: { display: "flex", gap: 4 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "neuralwatt-linkbutton", disabled: busy, onClick: () => {
            void fetchModels();
          }, children: busy ? t("fetching") : t("fetchModels") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "neuralwatt-linkbutton", disabled: paramsBusy, onClick: () => {
            void updateParams();
          }, children: paramsBusy ? t("paramsFetching") : t("updateParams") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "neuralwatt-linkbutton", disabled: busy || models.length === 0, onClick: () => {
            setModels([]);
            setExpanded(/* @__PURE__ */ new Set());
            setEditing(/* @__PURE__ */ new Map());
            setParams(void 0);
            setParamChoices(/* @__PURE__ */ new Map());
          }, children: t("clearModels") })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-proxyrow", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              type: "checkbox",
              checked: proxyEnabled,
              "aria-label": t("proxyToggle"),
              onChange: (event) => {
                setProxyEnabled(event.target.checked);
              }
            }
          ),
          t("proxyToggle")
        ] }),
        proxyEnabled ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            className: "neuralwatt-input",
            type: "text",
            style: { maxWidth: 220 },
            "aria-label": t("proxyUrl"),
            placeholder: DEFAULT_PROXY_URL,
            value: proxyUrl,
            onChange: (event) => {
              setProxyUrl(event.target.value);
            }
          }
        ) : null
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "neuralwatt-hint", children: t("proxyHint") }),
      models.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "neuralwatt-empty", children: t("modelsEmpty") }) : null,
      models.map((model, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-entry", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-modelrow", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              className: "neuralwatt-input",
              type: "text",
              value: textOf(model, "id"),
              placeholder: t("modelId"),
              "aria-label": `${t("modelId")} ${String(index + 1)}`,
              onChange: (event) => {
                patch(index, { id: event.target.value });
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              className: "neuralwatt-input",
              type: "text",
              value: textOf(model, "name"),
              placeholder: t("modelName"),
              "aria-label": `${t("modelName")} ${String(index + 1)}`,
              onChange: (event) => {
                patch(index, { name: event.target.value === "" ? void 0 : event.target.value });
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: "neuralwatt-iconbutton",
              "aria-label": `${t("modelAdvanced")} ${String(index + 1)}`,
              "aria-expanded": expanded.has(index),
              title: t("modelAdvanced"),
              onClick: () => {
                toggleExpanded(index);
              },
              children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconChevron, { open: expanded.has(index) })
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: "neuralwatt-iconbutton neuralwatt-iconbutton--danger",
              "aria-label": `${t("removeModel")} ${String(index + 1)}`,
              title: t("removeModel"),
              onClick: () => {
                removeModel(index);
              },
              children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconTrash, {})
            }
          )
        ] }),
        expanded.has(index) ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-modeladvanced", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "neuralwatt-modelfield", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "neuralwatt-modelfield-label", children: t("contextWindow") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                className: "neuralwatt-input",
                type: "text",
                inputMode: "numeric",
                value: capacityText(model, index, "contextWindow"),
                placeholder: CAPACITY_HINT.contextWindow,
                "aria-label": `${t("contextWindow")} ${String(index + 1)}`,
                onChange: (event) => {
                  editCapacity(index, "contextWindow", event.target.value);
                }
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "neuralwatt-modelfield", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "neuralwatt-modelfield-label", children: t("maxTokens") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                className: "neuralwatt-input",
                type: "text",
                inputMode: "numeric",
                value: capacityText(model, index, "maxTokens"),
                placeholder: CAPACITY_HINT.maxTokens,
                "aria-label": `${t("maxTokens")} ${String(index + 1)}`,
                onChange: (event) => {
                  editCapacity(index, "maxTokens", event.target.value);
                }
              }
            )
          ] }),
          Array.isArray(model.reasoningEfforts) && model.reasoningEfforts.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "neuralwatt-modelfield", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "neuralwatt-modelfield-label", children: t("modelReasoning") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "select",
              {
                className: "neuralwatt-select",
                "aria-label": `${t("defaultEffort")} ${String(index + 1)}`,
                value: typeof model.defaultReasoningEffort === "string" && model.reasoningEfforts.includes(model.defaultReasoningEffort) ? model.defaultReasoningEffort : highestOf(model.reasoningEfforts),
                onChange: (event) => {
                  patch(index, { defaultReasoningEffort: event.target.value });
                },
                children: model.reasoningEfforts.map((effort) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: effort, children: effort }, effort))
              }
            )
          ] }) : null
        ] }) : null
      ] }, index)),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: "neuralwatt-addmodel",
          disabled: busy,
          onClick: () => {
            setModels((current) => [...current, { id: "" }]);
          },
          children: t("addModel")
        }
      )
    ] }),
    candidates === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-candidates", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-candidates-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: t("fetchTitle") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              ref: selectAllRef,
              type: "checkbox",
              checked: allPicked,
              "aria-label": t("fetchSelectAll"),
              onChange: toggleAll
            }
          ),
          " ",
          t("fetchSelectAll")
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { children: candidates.map((model) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            type: "checkbox",
            checked: picked.has(model.id),
            onChange: () => {
              toggle(model.id);
            }
          }
        ),
        " ",
        model.id,
        model.name === void 0 || model.name === model.id ? "" : ` (${model.name})`
      ] }) }, model.id)) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "neuralwatt-button neuralwatt-button--primary", disabled: picked.size === 0, onClick: adopt, children: t("fetchAdopt") }),
      " ",
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "neuralwatt-button", onClick: () => {
        setCandidates(void 0);
        setPicked(/* @__PURE__ */ new Set());
      }, children: t("fetchCancel") })
    ] }),
    params === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-params", ref: paramsRef, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: t("paramsTitle") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "neuralwatt-params-summary", children: t("paramsSummary").replace("{matched}", String(params.models.filter((entry) => entry.matches.length > 0).length)).replace("{unmatched}", String(params.models.filter((entry) => entry.matches.length === 0).length)) }),
      params.models.map((entry) => {
        if (entry.matches.length === 0) {
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-params-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "neuralwatt-params-id", children: entry.id }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "neuralwatt-params-unmatched", children: t("paramsUnmatched") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {})
          ] }, entry.id);
        }
        if (entry.matches.length === 1) {
          const match2 = entry.matches[0];
          if (match2 === void 0) return null;
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-params-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "neuralwatt-params-id", children: entry.id }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "neuralwatt-params-values", children: `${match2.official === true ? `${t("officialMark")} \xB7 ` : ""}${match2.provider} \xB7 ${t("contextWindow")} ${match2.contextWindow ?? "\u2014"} / ${t("maxTokens")} ${match2.maxTokens ?? "\u2014"}${match2.reasoningEfforts !== void 0 && match2.reasoningEfforts.length > 0 ? ` \xB7 ${t("modelReasoning")}: ${match2.reasoningEfforts.join("/")}` : ""}` }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {})
          ] }, entry.id);
        }
        const chosen = paramChoices.get(entry.id) ?? 0;
        const match = entry.matches[chosen] ?? entry.matches[0];
        if (match === void 0) return null;
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "neuralwatt-params-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "neuralwatt-params-id", children: entry.id }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "select",
            {
              className: "neuralwatt-select",
              "aria-label": `${t("paramsProvider")} ${entry.id}`,
              value: String(chosen),
              onChange: (event) => {
                setParamChoices((current) => new Map(current).set(entry.id, Number(event.target.value)));
              },
              children: entry.matches.map((candidate, at) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: String(at), children: `${candidate.official === true ? `${t("officialMark")} \xB7 ` : ""}${candidate.provider}: ${t("contextWindow")} ${candidate.contextWindow ?? "\u2014"} / ${t("maxTokens")} ${candidate.maxTokens ?? "\u2014"}${candidate.reasoningEfforts !== void 0 && candidate.reasoningEfforts.length > 0 ? ` \xB7 ${t("modelReasoning")}: ${candidate.reasoningEfforts.join("/")}` : ""}` }, candidate.provider))
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "neuralwatt-params-values", children: match.provider })
        ] }, entry.id);
      }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8, marginTop: 10 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "neuralwatt-button neuralwatt-button--primary", onClick: () => {
          applyParams(true);
        }, children: t("paramsOverwrite") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "neuralwatt-button", onClick: () => {
          applyParams(false);
        }, children: t("paramsFillBlank") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "neuralwatt-button", onClick: () => {
          setParams(void 0);
          setParamChoices(/* @__PURE__ */ new Map());
        }, children: t("fetchCancel") })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "neuralwatt-hint", children: t("modelHint") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "neuralwatt-button neuralwatt-button--primary", disabled: busy || !writable, onClick: () => {
      void save();
    }, children: busy ? t("applying") : t("apply") })
  ] });
}

// src/client/locale.ts
var zh = {
  nav: "Neuralwatt",
  intro: "\u914D\u7F6E Neuralwatt \u7F51\u5173\uFF1AAPI \u5BC6\u94A5\u3001\u7F51\u5173\u5730\u5740\u4E0E\u6A21\u578B\u5217\u8868\u3002\u6A21\u578B\u53D1\u73B0\u53EA\u5217\u51FA\u652F\u6301 chat \u63A5\u53E3\u7684\u6A21\u578B\u3002",
  keyInput: "API \u5BC6\u94A5",
  keyPlaceholder: "\u7C98\u8D34\u4EE4\u724C\uFF1B\u7559\u7A7A\u4FDD\u6301\u5DF2\u5B58\u5BC6\u94A5\u4E0D\u53D8",
  keyStored: "\u5DF2\u914D\u7F6E\uFF08\u4E0D\u56DE\u663E\uFF09",
  keyMissing: "\u672A\u914D\u7F6E",
  keyEnvLocked: "\u7531\u542F\u52A8\u73AF\u5883\u63D0\u4F9B\uFF08\u53EA\u8BFB\uFF09",
  baseUrl: "\u7F51\u5173\u5730\u5740\uFF08\u5B8C\u6574 chat/completions \u5730\u5740\u6216 /v1 \u6839\u5730\u5740\u5747\u53EF\uFF09",
  baseUrlPlaceholder: "https://api.neuralwatt.com/v1/chat/completions",
  models: "\u6A21\u578B",
  modelsEmpty: "\u6682\u65E0\u6A21\u578B\uFF1A\u70B9\u300C\u6DFB\u52A0\u6A21\u578B\u300D\u624B\u52A8\u65B0\u589E\uFF0C\u6216\u300C\u83B7\u53D6\u6A21\u578B\u300D\u4ECE\u7F51\u5173\u62C9\u53D6\u3002",
  clearModels: "\u6E05\u7A7A",
  addModel: "\u6DFB\u52A0\u6A21\u578B",
  removeModel: "\u5220\u9664\u8BE5\u6A21\u578B",
  modelAdvanced: "\u9AD8\u7EA7\u8BBE\u7F6E\uFF08\u4E0A\u4E0B\u6587 / \u8F93\u51FA\u4E0A\u9650\uFF09",
  modelId: "\u6A21\u578B ID",
  modelName: "\u663E\u793A\u540D\u79F0",
  contextWindow: "\u4E0A\u4E0B\u6587\u7A97\u53E3",
  maxTokens: "\u8F93\u51FA\u4E0A\u9650",
  modelReasoning: "\u601D\u8003\u7B49\u7EA7",
  defaultEffort: "\u9884\u8BBE\u601D\u8003\u7B49\u7EA7\uFF08\u5207\u6362\u6A21\u5F0F\u65F6\u81EA\u52A8\u9009\u62E9\uFF09",
  modelIdRequired: "\u6A21\u578B ID \u4E0D\u80FD\u4E3A\u7A7A",
  modelIdDuplicate: "\u6A21\u578B ID \u91CD\u590D",
  capacityInvalid: "\u5BB9\u91CF\u9700\u4E3A\u6B63\u6570\uFF0C\u53EF\u7528 K/M \u7F29\u5199\uFF08\u5982 128K\u30011M\uFF09",
  baseUrlInvalid: "\u7AEF\u70B9\u9700\u4E3A http(s) URL\uFF0C\u4E14\u9700\u542B\u6709\u6548\u4E3B\u673A\u540D\u6216\u7EAF IPv4 \u5730\u5740\uFF0C\u4E0D\u80FD\u5305\u542B\u7528\u6237\u540D\u6216\u5BC6\u7801\uFF0C\u4E5F\u4E0D\u80FD\u662F\u88AB\u81EA\u52A8\u6539\u5199\u7684\u5199\u6CD5\uFF08\u5982 https://9 \u4F1A\u53D8\u6210 0.0.0.9\uFF09",
  fetchModels: "\u83B7\u53D6\u6A21\u578B",
  fetching: "\u6B63\u5728\u8BE2\u95EE\u7F51\u5173\u2026",
  fetchEmpty: "\u7F51\u5173\u6CA1\u6709\u5217\u51FA\u53EF\u7528\u7684 chat \u6A21\u578B\uFF08embedding / rerank / ranker \u5DF2\u8FC7\u6EE4\uFF09\u3002",
  fetchTitle: "\u9009\u62E9\u8981\u6DFB\u52A0\u7684\u6A21\u578B",
  fetchSelectAll: "\u5168\u9009",
  fetchAdopt: "\u6DFB\u52A0\u6240\u9009",
  fetchCancel: "\u53D6\u6D88",
  updateParams: "\u4ECEmodels.dev\u83B7\u53D6\u6A21\u578B\u4FE1\u606F",
  paramsFetching: "\u6B63\u5728\u67E5\u8BE2 models.dev\u2026",
  paramsTitle: "\u6A21\u578B\u53C2\u6570\uFF08\u6765\u81EA models.dev\uFF09",
  paramsSummary: "\u5339\u914D {matched} \u4E2A \xB7 \u672A\u5339\u914D {unmatched} \u4E2A",
  paramsUnmatched: "\u672A\u5339\u914D\uFF08\u4FDD\u6301\u539F\u503C\uFF09",
  paramsProvider: "\u9009\u62E9\u6570\u636E\u6765\u6E90\u4F9B\u5E94\u5546",
  officialMark: "\u5B98\u65B9",
  paramsOverwrite: "\u5E94\u7528\uFF08\u8986\u76D6\u73B0\u6709\u503C\uFF09",
  paramsFillBlank: "\u4EC5\u586B\u7A7A\u767D\u5B57\u6BB5",
  paramsApplied: "\u5DF2\u66F4\u65B0\u6A21\u578B\u4FE1\u606F",
  paramsNoModels: "\u6CA1\u6709\u53EF\u67E5\u8BE2\u7684\u6A21\u578B\uFF1A\u5148\u6DFB\u52A0\u6A21\u578B\u6216\u4ECE\u7F51\u5173\u83B7\u53D6\u3002",
  proxyToggle: "\u4EE3\u7406",
  proxyUrl: "\u4EE3\u7406\u5730\u5740",
  proxyHint: "\u4EC5\u7528\u4E8E\u4E0B\u8F7D models.dev \u6A21\u578B\u53C2\u6570\uFF1B\u7F51\u5173\u8BF7\u6C42\u4ECD\u8D70\u5BBF\u4E3B\u7F51\u7EDC\uFF0C\u5BBF\u4E3B\u81EA\u8EAB\u7684\u4EE3\u7406\u8BBE\u7F6E\u4F9D\u7136\u751F\u6548\uFF0C\u5173\u95ED\u6B64\u9879\u4E0D\u7B49\u4E8E\u76F4\u8FDE\u3002",
  apply: "\u4FDD\u5B58",
  applying: "\u6B63\u5728\u4FDD\u5B58\u2026",
  saved: "\u5DF2\u4FDD\u5B58\u3002",
  loadFailed: "\u52A0\u8F7D\u5931\u8D25",
  nsNotRegistered: "llm-neuralwatt: \u8BBE\u7F6E\u547D\u540D\u7A7A\u95F4\u672A\u6CE8\u518C\uFF08\u63D2\u4EF6\u884C\u662F\u5426\u5DF2\u52A0\u8F7D\uFF1F\uFF09",
  retry: "\u91CD\u8BD5",
  readOnly: "\u5F53\u524D\u8BBE\u7F6E\u6E90\u53EA\u8BFB\uFF0C\u65E0\u6CD5\u4FDD\u5B58\u3002",
  modelHint: "\u9ED8\u8BA4\u53EA\u5217\u51FA /chat/completions \u63A5\u53E3\u652F\u6301\u7684\u6A21\u578B\uFF1B\u4E0D\u652F\u6301\u8BE5\u63A5\u53E3\u7684\u6A21\u578B\u8BF7\u624B\u52A8\u6DFB\u52A0\u3002\u8BE5\u914D\u7F6E\u53EF\u5728 settings.yaml \u7684 llm-neuralwatt: \u6BB5\u7528 modelExcludePatterns \u8C03\u6574\u3002"
};
var en = {
  nav: "Neuralwatt",
  intro: "Configure the Neuralwatt gateway: API key, gateway base URL, and model list. Discovery lists chat-capable models only.",
  keyInput: "API key",
  keyPlaceholder: "Paste the token; leave blank to keep the stored key",
  keyStored: "Configured (never echoed)",
  keyMissing: "Not configured",
  keyEnvLocked: "Provided by the launch environment (read-only)",
  baseUrl: "Gateway endpoint (full chat-completions URL or the /v1 root)",
  baseUrlPlaceholder: "https://api.neuralwatt.com/v1/chat/completions",
  models: "Models",
  modelsEmpty: "No models yet: add one by hand, or fetch the list from the gateway.",
  clearModels: "Clear",
  addModel: "Add model",
  removeModel: "Remove this model",
  modelAdvanced: "Advanced (context window / max output)",
  modelId: "Model ID",
  modelName: "Display name",
  contextWindow: "Context window",
  maxTokens: "Max output tokens",
  modelReasoning: "Reasoning efforts",
  defaultEffort: "Default reasoning effort (auto-selected on mode switch)",
  modelIdRequired: "Model id is required",
  modelIdDuplicate: "Duplicate model id",
  capacityInvalid: "Capacity must be a positive number; K/M suffix allowed (e.g. 128K, 1M)",
  baseUrlInvalid: "Endpoint must be an http(s) URL with a valid hostname or plain IPv4 address, must not embed a username or password, and must not be a spelling the URL parser would rewrite (https://9 becomes 0.0.0.9)",
  fetchModels: "Fetch models",
  fetching: "Asking the gateway\u2026",
  fetchEmpty: "The gateway listed no chat-capable models (embedding / rerank / ranker filtered out).",
  fetchTitle: "Choose models to add",
  fetchSelectAll: "Select all",
  fetchAdopt: "Add selected",
  fetchCancel: "Cancel",
  updateParams: "Fetch model info from models.dev",
  paramsFetching: "Querying models.dev\u2026",
  paramsTitle: "Model parameters (from models.dev)",
  paramsSummary: "{matched} matched \xB7 {unmatched} unmatched",
  paramsUnmatched: "No match (values kept)",
  paramsProvider: "Choose the data provider",
  officialMark: "Official",
  paramsOverwrite: "Apply (overwrite existing)",
  paramsFillBlank: "Fill blank fields only",
  paramsApplied: "Model info updated",
  paramsNoModels: "No models to look up: add one or fetch from the gateway first.",
  proxyToggle: "Proxy",
  proxyUrl: "Proxy URL",
  proxyHint: "Used only for the models.dev parameter download. Gateway requests still use the host network, and the host may apply its own proxy settings, so disabling this does not force a direct connection.",
  apply: "Save",
  applying: "Saving\u2026",
  saved: "Saved.",
  loadFailed: "Load failed",
  nsNotRegistered: "llm-neuralwatt: the settings namespace is not registered (is the plugin row loaded?)",
  retry: "Retry",
  readOnly: "The active settings source is read-only; nothing can be saved.",
  modelHint: "By default only models supported by the /chat/completions endpoint are listed; models without that support must be added manually. Tune modelExcludePatterns in the llm-neuralwatt: settings section."
};

// src/client/apply.ts
var NS2 = "settings.neuralwatt";
var SECTION_CSS = `
.neuralwatt-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.neuralwatt-input {
  box-sizing: border-box; padding: 6px 10px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 13px;
}
.neuralwatt-input:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
.neuralwatt-input::placeholder { color: var(--dsw-alias-label-dimmed); }
.neuralwatt-input:disabled { opacity: 0.6; cursor: default; }
.neuralwatt-button {
  padding: 6px 12px; border-radius: 6px; font: inherit; font-size: 13px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent; color: var(--dsw-alias-label-primary);
  cursor: pointer;
}
.neuralwatt-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.neuralwatt-button:disabled { opacity: 0.4; cursor: default; }
.neuralwatt-button--primary {
  border-color: transparent;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.neuralwatt-button--primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.neuralwatt-error { color: var(--dsw-alias-state-error-primary); }
.neuralwatt-hint { font-size: 12px; color: var(--dsw-alias-label-tertiary); }
/* Model catalog, mirroring ui-settings-models: one bordered entry per
   model, id and display name on the row, capacities behind the row's own
   disclosure. */
.neuralwatt-catalog {
  display: flex; flex-direction: column; gap: 10px;
  padding-top: 12px; margin-bottom: 12px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.neuralwatt-catalog-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.neuralwatt-catalog-title {
  font-size: 12px; line-height: 18px; font-weight: 500;
  color: var(--dsw-alias-label-secondary);
}
.neuralwatt-linkbutton {
  box-sizing: border-box; display: inline-flex; align-items: center;
  height: 28px; padding: 0 10px; border: none; border-radius: 14px;
  background: transparent; color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 12px; cursor: pointer;
}
.neuralwatt-linkbutton:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.neuralwatt-linkbutton:disabled { opacity: 0.4; cursor: default; }
.neuralwatt-empty { margin: 0; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.neuralwatt-entry {
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 6px;
}
.neuralwatt-modelrow {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 6px;
}
/* Square, label-free affordances: the row's own inputs carry the meaning, so
   the actions stay glyphs and announce themselves through aria-label. */
.neuralwatt-iconbutton {
  box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border: none; border-radius: 6px;
  background: transparent; color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.neuralwatt-iconbutton:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.neuralwatt-iconbutton:disabled { opacity: 0.4; cursor: default; }
.neuralwatt-iconbutton--danger:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover-danger);
  color: var(--dsw-alias-state-error-primary);
}
.neuralwatt-modeladvanced {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
  padding: 8px 4px 2px;
}
.neuralwatt-modelfield { display: flex; flex-direction: column; gap: 4px; }
.neuralwatt-modelfield-label { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.neuralwatt-addmodel {
  box-sizing: border-box; align-self: flex-start; display: inline-flex; align-items: center;
  gap: 4px; height: 28px; padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 14px;
  background: transparent; color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 12px; cursor: pointer;
}
.neuralwatt-addmodel:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.neuralwatt-addmodel:disabled { opacity: 0.4; cursor: default; }
.neuralwatt-candidates { border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 12px; margin-bottom: 12px; }
.neuralwatt-candidates-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.neuralwatt-candidates-head label { display: inline-flex; align-items: center; gap: 6px; color: var(--dsw-alias-label-primary); }
.neuralwatt-candidates ul { list-style: none; padding: 0; margin: 8px 0; }
/* Proxy control + models.dev params panel. */
.neuralwatt-proxyrow {
  display: flex; flex-direction: row; align-items: center; flex-wrap: wrap;
  gap: 8px; margin-bottom: 12px;
}
.neuralwatt-proxyrow label { display: inline-flex; align-items: center; gap: 6px; color: var(--dsw-alias-label-primary); }
.neuralwatt-select {
  box-sizing: border-box; padding: 6px 10px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 13px; max-width: 220px;
}
.neuralwatt-params {
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px;
  padding: 12px; margin-bottom: 12px;
}
.neuralwatt-params-summary { margin: 6px 0 10px; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.neuralwatt-params-row {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center; gap: 8px; padding: 4px 0;
}
/* The id rides a fixed-width text box so rows align; content wider than
   the box stays hidden until hover, when it scrolls horizontally. */
.neuralwatt-params-id {
  box-sizing: border-box; width: 30ch; max-width: 30ch;
  padding: 4px 8px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 12px; line-height: 18px;
  text-align: left; white-space: nowrap; overflow: hidden;
  scrollbar-width: thin;
}
.neuralwatt-params-id:hover { overflow-x: auto; }
.neuralwatt-params-values {
  color: var(--dsw-alias-label-tertiary); font-size: 12px;
  font-variant-numeric: tabular-nums; text-align: left;
}
.neuralwatt-params-unmatched { color: var(--dsw-alias-label-dimmed); font-size: 12px; padding: 4px 0; }
/* Neuralwatt account usage dashboard. */
.neuralwatt-usage { border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; padding: 18px; margin: 16px 0; }
.neuralwatt-usage-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.neuralwatt-usage-head h3 { margin: 0; font-size: 18px; }
.neuralwatt-badges { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 14px; }
.neuralwatt-badge { padding: 4px 10px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-size: 12px; font-weight: 600; }
.neuralwatt-badge--active { background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); }
.neuralwatt-usage-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px; }
.neuralwatt-usage-card { border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; padding: 14px; min-height: 74px; }
.neuralwatt-usage-label { color: var(--dsw-alias-label-tertiary); font-size: 12px; margin-bottom: 8px; }
.neuralwatt-usage-value { color: var(--dsw-alias-label-primary); font-size: 24px; font-weight: 600; font-variant-numeric: tabular-nums; }
.neuralwatt-usage-detail { color: var(--dsw-alias-label-tertiary); font-size: 12px; margin-top: 5px; }
.neuralwatt-meter { margin: 14px 0; }
.neuralwatt-meter-row { display: flex; justify-content: space-between; gap: 12px; color: var(--dsw-alias-label-secondary); font-size: 13px; margin-bottom: 7px; }
.neuralwatt-meter-value { color: var(--dsw-alias-label-primary); font-variant-numeric: tabular-nums; }
.neuralwatt-meter-track { height: 8px; overflow: hidden; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); }
.neuralwatt-meter-fill { height: 100%; border-radius: inherit; background: var(--dsw-alias-button-primary-fill); transition: width 160ms ease; }
.neuralwatt-meter-fill--warning { background: var(--dsw-alias-state-error-primary); }
.neuralwatt-usage-updated { color: var(--dsw-alias-label-tertiary); font-size: 12px; margin: 12px 0 0; }
`;
var inject = [
  "slots",
  "locale",
  "connection",
  "remote",
  "remote.settings",
  "remote.credentials",
  "remote.llm"
];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS2, { zh, en }), "llm-neuralwatt: copy dictionaries");
  if (typeof document !== "undefined") {
    ctx.effect(() => {
      const element = document.createElement("style");
      element.textContent = SECTION_CSS;
      document.head.append(element);
      return () => {
        element.remove();
      };
    }, "llm-neuralwatt: section styles");
  }
  const connection = ctx.get("connection");
  const t = ctx.locale.bind(NS2);
  const fetchModelParams = (request) => connection.rpc.call("/llm-neuralwatt", "models-dev-params", request);
  const fetchQuota = () => connection.rpc.call("/llm-neuralwatt", "quota", null);
  const injected = () => ({
    fetchQuota,
    fetchModelParams,
    api: {
      describeSettings: () => ctx.remote.settings.describe(),
      mutateSettings: (ns, ops, expectedRevision) => ctx.remote.settings.mutate(ns, ops, expectedRevision),
      describeCredentials: (refs) => ctx.remote.credentials.describe(refs),
      setCredential: (ref, value) => ctx.remote.credentials.set(ref, value),
      discoverModels: (settingsNs, request) => ctx.remote.llm.discoverModels(settingsNs, request)
    }
  });
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "neuralwatt",
    order: 15,
    label: () => t("nav"),
    locale: NS2,
    inject: injected
  }, NeuralwattSection));
}
return module.exports; } });
//# sourceMappingURL=client.js.map
