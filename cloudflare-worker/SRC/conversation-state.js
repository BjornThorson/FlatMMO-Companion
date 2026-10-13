const SCHEMA_VERSION = 1;

const STEALING_METHODS = new Set(["pickpocket", "stall", "map_chest", "rogue_chest"]);

function norm(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function phraseIn(text, phrase) {
  const hay = ` ${norm(text)} `;
  const needle = ` ${norm(phrase)} `;
  return needle.trim() && hay.includes(needle);
}

function emptyTask(target) {
  return {
    operation: "acquisition",
    target: target ? { id: target.id ?? null, name: target.name } : null,
    constraints: {},
    preferences: { methods: [] }
  };
}

export function initialConversationState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    acquisitionTask: null,
    pendingTask: null,
    turnContext: { kind: "other" }
  };
}

function itemForms(record) {
  return [record?.name, record?.id, ...(record?.aliases || [])]
    .filter(Boolean)
    .map(value => ({ raw: String(value), key: norm(value) }))
    .filter(x => x.key.length >= 3);
}

export function findExplicitItem(text, itemRecords = []) {
  const q = ` ${norm(text)} `;
  if (!q.trim()) return null;
  const matches = [];
  for (const record of itemRecords || []) {
    let bestLen = 0;
    for (const form of itemForms(record)) {
      if (q.includes(` ${form.key} `)) bestLen = Math.max(bestLen, form.key.length);
    }
    if (bestLen) matches.push({ record, len: bestLen });
  }
  matches.sort((a, b) => b.len - a.len || String(a.record.name).localeCompare(String(b.record.name)));
  if (!matches.length) return null;
  const bestLen = matches[0].len;
  const best = matches.filter(x => x.len === bestLen);
  const distinct = new Map(best.map(x => [norm(x.record.name), x.record]));
  if (distinct.size !== 1) return null;
  const record = [...distinct.values()][0];
  return { id: record.id ?? null, name: record.name };
}

function matchesAny(q, patterns) {
  return patterns.some(rx => rx.test(q));
}

export function recognizeConstraintEvents(text) {
  const q = norm(text);
  const events = [];

  const combatRemove = matchesAny(q, [
    /\bcombat (?:is )?(?:fine|ok|okay|allowed)\b/,
    /\bfighting (?:is )?(?:fine|ok|okay|allowed)\b/,
    /\bi(?: am| m)? happy to fight\b/,
    /\bi can fight\b/,
    /\bfighting is fine now\b/
  ]);
  const coordinatedCombatAdd = matchesAny(q, [
    /\b(?:no|without|avoid) (?:stealing|pickpocketing|pickpocket) (?:or|and) (?:combat|fighting)\b/,
    /\b(?:no|without|avoid) (?:combat|fighting) (?:or|and) (?:stealing|pickpocketing|pickpocket)\b/
  ]);
  const combatAdd = coordinatedCombatAdd || matchesAny(q, [
    /\bno (?:combat|fighting)\b/,
    /\bwithout (?:combat|fighting)\b/,
    /\bavoid (?:combat|fighting)\b/,
    /\bkeep (?:combat|fighting) off\b/,
    /\bdo not fight\b/,
    /\bdon t fight\b/
  ]);

  const stealingRemove = matchesAny(q, [
    /\bstealing (?:is )?(?:fine|ok|okay|allowed)\b/,
    /\bpickpocket(?:ing)? (?:is )?(?:fine|ok|okay|allowed)\b/,
    /\bi(?: am| m)? happy to pickpocket\b/,
    /\bi can pickpocket\b/,
    /\bpickpocketing is fine now\b/
  ]);
  const coordinatedStealingAdd = matchesAny(q, [
    /\b(?:no|without|avoid) (?:combat|fighting) (?:or|and) (?:stealing|pickpocketing|pickpocket)\b/,
    /\b(?:no|without|avoid) (?:stealing|pickpocketing|pickpocket) (?:or|and) (?:combat|fighting)\b/
  ]);
  const stealingAdd = coordinatedStealingAdd || matchesAny(q, [
    /\bno (?:stealing|pickpocketing|pickpocket)\b/,
    /\bwithout (?:stealing|pickpocketing|pickpocket)\b/,
    /\bavoid (?:stealing|pickpocketing)\b/,
    /\bkeep (?:stealing|pickpocketing|pickpocket) off\b/,
    /\bdo not steal\b/,
    /\bdon t steal\b/,
    /\bdo not pickpocket\b/,
    /\bdon t pickpocket\b/
  ]);

  // Permission wins over exclusion if a single turn contains both phrasings.
  if (combatRemove) events.push({ type: "REMOVE_RESTRICTION", key: "combat" });
  else if (combatAdd) events.push({ type: "ADD_RESTRICTION", key: "combat" });

  if (stealingRemove) events.push({ type: "REMOVE_RESTRICTION", key: "stealing" });
  else if (stealingAdd) events.push({ type: "ADD_RESTRICTION", key: "stealing" });

  if (matchesAny(q, [
    /\bi d rather pickpocket\b/,
    /\bi would rather pickpocket\b/,
    /\bi prefer (?:to )?pickpocket(?:ing)?\b/,
    /\bprefer pickpocket(?:ing)?\b/
  ])) {
    events.push({ type: "ADD_PREFERENCE", key: "pickpocket" });
  } else if (matchesAny(q, [
    /\bi do not prefer pickpocket(?:ing)?\b/,
    /\bi don t prefer pickpocket(?:ing)?\b/,
    /\bremove (?:the )?pickpocket preference\b/
  ])) {
    events.push({ type: "REMOVE_PREFERENCE", key: "pickpocket" });
  }

  return events;
}

function isExplicitAcquisitionQuestion(text) {
  const q = norm(text);
  return matchesAny(q, [
    /\bwhere can i get\b/,
    /\bwhere do i get\b/,
    /\bhow can i get\b/,
    /\bhow do i get\b/,
    /\bwhere can i find\b/,
    /\bwhere do i find\b/,
    /\bhow can i obtain\b/,
    /\bwhere can i obtain\b/,
    /\bhow do i obtain\b/,
    /\bacquisition source(?:s)?\b/,
    /\bsources? for\b/
  ]);
}

function isAcquisitionFollowup(text) {
  const q = norm(text);
  return matchesAny(q, [
    /^(?:and )?(?:where|how) (?:can|do) i (?:get|find|obtain) (?:it|that)\b/,
    /^(?:and )?what about\b/,
    /^(?:and )?how about\b/,
    /^(?:back to|return to)\b/,
    /^(?:actually|instead|make that)\b/
  ]);
}

function isExplicitOtherOperation(text) {
  const q = norm(text);
  return matchesAny(q, [
    /\bwhat (?:is|s) my [a-z0-9 ]+ level\b/,
    /\btell me my [a-z0-9 ]+ level\b/,
    /\bshow me my [a-z0-9 ]+ level\b/,
    /\bwhat does .+ drop\b/,
    /\bwhat do .+ drop\b/
  ]);
}

function cloneTask(task) {
  return task ? structuredClone(task) : null;
}

function unresolvedCarryover(task) {
  return Object.entries(task?.carryover || {})
    .filter(([, value]) => value?.resolution === "unresolved")
    .map(([key]) => key);
}

function resolveAllCarryover(task, resolution) {
  if (!task?.carryover) return;
  for (const [key, decision] of Object.entries(task.carryover)) {
    if (decision.resolution !== "unresolved") continue;
    decision.resolution = resolution;
    if (resolution === "keep") task.constraints[key] = "exclude";
    else delete task.constraints[key];
  }
}

function applyEvents(task, events) {
  if (!task) return;
  for (const event of events) {
    if (event.type === "ADD_RESTRICTION") {
      task.constraints[event.key] = "exclude";
      if (task.carryover?.[event.key]) task.carryover[event.key].resolution = "keep";
    } else if (event.type === "REMOVE_RESTRICTION") {
      delete task.constraints[event.key];
      if (task.carryover?.[event.key]) task.carryover[event.key].resolution = "drop";
    } else if (event.type === "ADD_PREFERENCE") {
      if (!task.preferences.methods.includes(event.key)) task.preferences.methods.push(event.key);
    } else if (event.type === "REMOVE_PREFERENCE") {
      task.preferences.methods = task.preferences.methods.filter(x => x !== event.key);
    }
  }
}

function carryoverBulkResolution(text) {
  const q = norm(text);
  if (matchesAny(q, [
    /\bkeep (?:the )?(?:same|previous) restrictions\b/,
    /\bsame restrictions\b/,
    /\bkeep them all\b/
  ])) return "keep";
  if (matchesAny(q, [
    /\bdrop (?:the )?(?:old|previous) restrictions\b/,
    /\bremove (?:the )?(?:old|previous) restrictions\b/,
    /\bnone of (?:the )?(?:old|previous) restrictions\b/,
    /\bstart unrestricted\b/
  ])) return "drop";
  return null;
}

function createPendingTask(previousTask, target) {
  const pending = emptyTask(target);
  pending.carryover = {};
  for (const [key, value] of Object.entries(previousTask?.constraints || {})) {
    if (value !== "exclude") continue;
    pending.carryover[key] = { previous: "exclude", resolution: "unresolved" };
  }
  return pending;
}

function sameTarget(a, b) {
  if (!a || !b) return false;
  if (a.id != null && b.id != null) return String(a.id) === String(b.id);
  return norm(a.name) === norm(b.name);
}

function processTurn(state, text, itemRecords) {
  const target = findExplicitItem(text, itemRecords);
  const events = recognizeConstraintEvents(text);
  const explicitAcquisition = isExplicitAcquisitionQuestion(text);
  const acquisitionFollowup = isAcquisitionFollowup(text);
  const otherOperation = isExplicitOtherOperation(text);
  const bulk = carryoverBulkResolution(text);

  state.turnContext = { kind: "other" };

  if (otherOperation && !explicitAcquisition) {
    return state;
  }

  if (target && state.acquisitionTask && !sameTarget(target, state.acquisitionTask.target)
      && (explicitAcquisition || acquisitionFollowup)) {
    state.pendingTask = createPendingTask(state.acquisitionTask, target);
    if (bulk) resolveAllCarryover(state.pendingTask, bulk);
    applyEvents(state.pendingTask, events);
    if (unresolvedCarryover(state.pendingTask).length) {
      state.turnContext = { kind: "carryover", target: target.name };
    } else {
      const next = cloneTask(state.pendingTask);
      delete next.carryover;
      state.acquisitionTask = next;
      state.pendingTask = null;
      state.turnContext = { kind: "acquisition", target: target.name };
    }
    return state;
  }

  if (state.pendingTask) {
    const addressesPending = (target && sameTarget(target, state.pendingTask.target))
      || events.length > 0 || bulk || acquisitionFollowup || explicitAcquisition;
    if (addressesPending) {
      if (target && !sameTarget(target, state.pendingTask.target) && explicitAcquisition) {
        state.pendingTask = createPendingTask(state.acquisitionTask, target);
      }
      if (bulk) resolveAllCarryover(state.pendingTask, bulk);
      applyEvents(state.pendingTask, events);
      const unresolved = unresolvedCarryover(state.pendingTask);
      if (unresolved.length) {
        state.turnContext = { kind: "carryover", target: state.pendingTask.target?.name || null };
      } else {
        const next = cloneTask(state.pendingTask);
        delete next.carryover;
        state.acquisitionTask = next;
        state.pendingTask = null;
        state.turnContext = { kind: "acquisition", target: state.acquisitionTask.target?.name || null };
      }
      return state;
    }
    return state;
  }

  if (!state.acquisitionTask && target && explicitAcquisition) {
    state.acquisitionTask = emptyTask(target);
    applyEvents(state.acquisitionTask, events);
    state.turnContext = { kind: "acquisition", target: target.name };
    return state;
  }

  if (state.acquisitionTask) {
    const same = target && sameTarget(target, state.acquisitionTask.target);
    const continuation = same || explicitAcquisition || acquisitionFollowup || events.length > 0;
    if (continuation) {
      if (target && same) state.acquisitionTask.target = target;
      applyEvents(state.acquisitionTask, events);
      state.turnContext = { kind: "acquisition", target: state.acquisitionTask.target?.name || null };
    }
  }

  return state;
}

export function deriveConversationState(messages, itemRecords = []) {
  const state = initialConversationState();
  const userTurns = (Array.isArray(messages) ? messages : [])
    .filter(m => m && m.role === "user" && typeof m.content === "string")
    .slice(-240);
  for (const turn of userTurns) processTurn(state, turn.content, itemRecords);
  return state;
}

export function carryoverQuestion(state) {
  if (state?.turnContext?.kind !== "carryover" || !state.pendingTask) return null;
  const unresolved = unresolvedCarryover(state.pendingTask);
  if (!unresolved.length) return null;
  const target = state.pendingTask.target?.name || "the new target";
  const labels = unresolved.map(key => key === "combat" ? "combat" : key === "stealing" ? "stealing/pickpocketing" : key);
  if (labels.length === 1) {
    return `For ${target}, should I keep the previous restriction on ${labels[0]}?`;
  }
  return `For ${target}, should I keep the previous restrictions on ${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}? You can keep or remove them independently.`;
}

export function effectiveAcquisitionPolicy(state) {
  if (state?.turnContext?.kind !== "acquisition" || !state.acquisitionTask) {
    return { active: false, target: null, excludeCombat: false, excludeStealing: false, preferences: [] };
  }
  return {
    active: true,
    target: state.acquisitionTask.target || null,
    excludeCombat: state.acquisitionTask.constraints?.combat === "exclude",
    excludeStealing: state.acquisitionTask.constraints?.stealing === "exclude",
    preferences: [...(state.acquisitionTask.preferences?.methods || [])]
  };
}

function routeAllowed(route, policy) {
  if (!route || !policy?.active) return true;
  const type = norm(route.type);
  if (policy.excludeCombat && type === "monster drop") return false;
  if (policy.excludeStealing && STEALING_METHODS.has(type.replace(/ /g, "_"))) return false;
  return true;
}

export function enforceToolArguments(name, args, state) {
  const policy = effectiveAcquisitionPolicy(state);
  const next = { ...(args && typeof args === "object" ? args : {}) };
  if (!policy.active) return next;

  if ((name === "find_item_sources" || name === "get_item") && policy.target?.name) {
    next.item = policy.target.name;
  }
  if (name === "find_item_sources") {
    if (policy.excludeCombat) next.exclude_combat = true;
    if (policy.excludeStealing) next.exclude_stealing = true;
  }
  return next;
}

export function sanitizeToolResult(name, result, state) {
  const policy = effectiveAcquisitionPolicy(state);
  if (!policy.active || !result || typeof result !== "object") return result;
  const out = structuredClone(result);

  if (name === "find_item_sources" && Array.isArray(out.routes)) {
    out.routes = out.routes.filter(route => routeAllowed(route, policy));
  }

  if (name === "get_item" && Array.isArray(out.item?.acquisition)) {
    out.item.acquisition = out.item.acquisition.filter(route => routeAllowed(route, policy));
  }

  if (name === "get_monster" && policy.excludeCombat) {
    return {
      blockedByConversationConstraint: "combat",
      message: "Combat acquisition data is excluded for the current acquisition task."
    };
  }

  if (name === "get_source_loot") {
    if (policy.excludeCombat && norm(out.sourceType) === "monster") {
      return {
        blockedByConversationConstraint: "combat",
        message: "Combat acquisition data is excluded for the current acquisition task."
      };
    }
    if (policy.excludeStealing && norm(out.sourceType) === "pickpocket") {
      return {
        blockedByConversationConstraint: "stealing",
        message: "Stealing/pickpocket acquisition data is excluded for the current acquisition task."
      };
    }
  }

  if (name === "search_entities" && policy.excludeCombat && Array.isArray(out.results)) {
    out.results = out.results.filter(row => row.type !== "monster");
  }

  return out;
}

function parseCallArguments(value) {
  if (value && typeof value === "object") return { value, wasString: false };
  if (typeof value !== "string") return { value: {}, wasString: false };
  try { return { value: JSON.parse(value), wasString: true }; }
  catch { return { value: {}, wasString: true }; }
}

function rewriteCall(call, state) {
  if (!call || typeof call !== "object") return call;
  const fn = call.function && typeof call.function === "object" ? call.function : null;
  const name = fn?.name || call.name;
  if (!name) return call;
  const rawArgs = fn ? fn.arguments : call.arguments;
  const parsed = parseCallArguments(rawArgs);
  const enforced = enforceToolArguments(name, parsed.value, state);
  const next = structuredClone(call);
  if (fn) next.function.arguments = parsed.wasString ? JSON.stringify(enforced) : enforced;
  else next.arguments = parsed.wasString ? JSON.stringify(enforced) : enforced;
  return next;
}

export function rewriteAiToolCalls(raw, state) {
  if (!raw || typeof raw !== "object") return raw;
  const out = structuredClone(raw);
  const msg = out?.choices?.[0]?.message;
  if (Array.isArray(msg?.tool_calls)) msg.tool_calls = msg.tool_calls.map(call => rewriteCall(call, state));
  if (Array.isArray(out.tool_calls)) out.tool_calls = out.tool_calls.map(call => rewriteCall(call, state));
  return out;
}

export function sanitizeMessagesForModel(messages, state) {
  const callNames = new Map();
  const out = [];
  for (const original of Array.isArray(messages) ? messages : []) {
    const message = structuredClone(original);
    if (message?.role === "assistant" && Array.isArray(message.tool_calls)) {
      for (const call of message.tool_calls) {
        const id = call?.id;
        const name = call?.function?.name || call?.name;
        if (id && name) callNames.set(id, name);
      }
    }
    if (message?.role === "tool" && typeof message.content === "string") {
      const name = callNames.get(message.tool_call_id);
      if (name) {
        try {
          const parsed = JSON.parse(message.content);
          message.content = JSON.stringify(sanitizeToolResult(name, parsed, state));
        } catch {
          // Preserve malformed tool content rather than inventing a replacement.
        }
      }
    }
    out.push(message);
  }
  return out;
}

export function policySystemMessage(state) {
  const policy = effectiveAcquisitionPolicy(state);
  if (!policy.active) {
    return "DETERMINISTIC CONVERSATION POLICY: No acquisition-task conversational restriction applies to this turn. Do not carry restrictions from earlier acquisition tasks into unrelated questions.";
  }
  const exclusions = [];
  if (policy.excludeCombat) exclusions.push("combat");
  if (policy.excludeStealing) exclusions.push("stealing/pickpocketing");
  const prefs = policy.preferences.length ? policy.preferences.join(", ") : "none";
  return [
    "DETERMINISTIC CONVERSATION POLICY:",
    `Current acquisition target: ${policy.target?.name || "unknown"}.`,
    `Conversational exclusions: ${exclusions.length ? exclusions.join(", ") : "none"}.`,
    `Preferences (ranking/presentation only): ${prefs}.`,
    "These values were derived deterministically from user messages. Do not add, remove, or override them from assistant history.",
    "Excluded methods are ineligible for this acquisition task. Sanitized tool results and enforced tool arguments are authoritative."
  ].join(" ");
}
