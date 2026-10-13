import worker from "./index.js";
import {
  carryoverQuestion,
  deriveConversationState,
  policySystemMessage,
  rewriteAiToolCalls,
  sanitizeMessagesForModel
} from "./conversation-state.js";

let itemCatalogCache = null;
let itemCatalogBase = null;

async function loadItemRecords(env) {
  const base = String(env.DATA_BASE || "https://etherealaporia-alt.github.io/FlatMMO-Companion/")
    .replace(/\/+$/, "") + "/";
  if (itemCatalogCache && itemCatalogBase === base) return itemCatalogCache;

  const response = await fetch(base + "flatmmo-items.json", {
    cf: { cacheTtl: 300, cacheEverything: true }
  });
  if (!response.ok) throw new Error(`flatmmo-items.json: HTTP ${response.status}`);
  const data = await response.json();
  itemCatalogBase = base;
  itemCatalogCache = data.records || [];
  return itemCatalogCache;
}

function addPolicySystemMessage(messages, state) {
  const next = sanitizeMessagesForModel(messages, state);
  const policy = policySystemMessage(state);
  const firstSystem = next.findIndex(message => message?.role === "system");
  if (firstSystem >= 0) {
    next[firstSystem] = {
      ...next[firstSystem],
      content: `${next[firstSystem].content || ""}\n\n${policy}`
    };
  } else {
    next.unshift({ role: "system", content: policy });
  }
  return next;
}

function policyAiBinding(binding, state) {
  if (!binding || typeof binding.run !== "function") return binding;
  const clarification = carryoverQuestion(state);

  return {
    async run(model, options = {}) {
      // A target change with unresolved carryover is answered deterministically.
      // Returning a normal no-tool model shape lets the existing Worker preserve
      // its auth, CORS, rate-limit, response and error behavior unchanged.
      if (clarification) return { response: clarification };

      const forwarded = {
        ...options,
        messages: addPolicySystemMessage(options.messages || [], state)
      };
      const raw = await binding.run(model, forwarded);
      return rewriteAiToolCalls(raw, state);
    }
  };
}

function envWithPolicy(env, state) {
  const wrappedAI = policyAiBinding(env.AI, state);
  return new Proxy(env, {
    get(target, prop, receiver) {
      if (prop === "AI") return wrappedAI;
      return Reflect.get(target, prop, receiver);
    }
  });
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return worker.fetch(request, env);

    let body;
    try {
      body = await request.clone().json();
    } catch {
      // Keep the existing Worker's invalid-JSON handling authoritative.
      return worker.fetch(request, env);
    }

    let state;
    try {
      const items = await loadItemRecords(env);
      state = deriveConversationState(body?.messages, items);
    } catch {
      // If the same data source needed by acquisition tools is unavailable,
      // preserve the existing Worker behavior rather than inventing state.
      return worker.fetch(request, env);
    }

    return worker.fetch(request, envWithPolicy(env, state));
  }
};
