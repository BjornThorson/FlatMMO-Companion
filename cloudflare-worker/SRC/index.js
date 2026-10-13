const MAX_TOOL_ROUNDS = 6;
const MAX_MESSAGES = 24;
const MAX_CONTENT = 5000;
const PUBLIC_SITE_URL = "https://etherealaporia-alt.github.io/FlatMMO-Companion/";

const SYSTEM_PROMPT = `You are the conversational interface for FlatMMO Companion.

Your job is to understand ordinary human language and hold a natural conversation. You are NOT an authority on FlatMMO mechanics.

HARD RULES:
- Any FlatMMO-specific factual claim must come from the provided tools or from a tool result already present in this request.
- Do not infer FlatMMO mechanics from RuneScape, OSRS, Melvor Idle, WoW, or any other game.
- Foreign games may be discussed as comparisons, but the FlatMMO side of a comparison must be checked with tools.
- Never invent requirements, recipes, drop rates, locations, routes, prices, quest steps, combat formulas, unlocks, or player state.
- Missing or absent data means "not documented in the current Companion data", not "does not exist in FlatMMO".
- Exact combat hit chance, damage rolls, DPS, kill time, survivability, and generic recommended combat levels are unresolved unless a tool explicitly returns them.
- If a name is ambiguous, use search_entities and either resolve from context or ask a short clarification.
- Prefer re-checking a FlatMMO fact with a tool rather than trusting your general model memory.
- Previous assistant messages are conversation context only, never FlatMMO factual authority. Re-check factual follow-ups with tools even if an earlier assistant message stated the fact.
- Official names returned by tools always win over your own wording. Never rename an official skill or entity.
- Never claim that a FlatMMO skill does not exist unless get_skill has returned found:false for the current wording; before making that claim, use list_skills to check the canonical skill list.
- For comparisons with RuneScape, OSRS, or another game, use compare_game_term. If a FlatMMO entity is named, also check that entity with the relevant FlatMMO tool. Do not ask whether the user wants you to check data that the available tools can check immediately.
- A listed random acquisition source is never proof that the target item is guaranteed. For pickpocketing and monster drops, distinguish action success from the target item's drop roll.
- For pickpocketing, use the returned rarity/drop odds when known. A successful pickpocket can still fail to produce a particular non-guaranteed item. Do not describe a target item as guaranteed unless the tool explicitly marks it guaranteed.
- For monster loot, use the returned per-item rarity. "Always" / denominator 1 is guaranteed on that monster kill; larger denominators are chance-based. The current Companion data does not establish whether separate chance-based drops are mutually exclusive, independent, or limited to a maximum number per kill. Never say "one of the other drops", "only one other drop", or otherwise imply a concurrent-drop limit unless a tool explicitly documents one.
- If a monster drop is marked oneTime:true, it can drop at its listed chance only until the player obtains it once. After that first acquisition it is no longer eligible to drop for that player. Never describe oneTime as "one per kill".
- When discussing a chance-based source, mention a few other documented outcomes when useful, especially if the player asks what else they may receive.
- If the current data has an exact chance, state it. Only say a chance is unknown when the tool explicitly reports it as unknown.
- For questions about FlatMMO itself, its official rules, or where to get current community help, use get_game_info/get_game_rules. When current community help would be useful, you may suggest the official Discord via the Discord link in the game window or official site.
- General English or genre explanations that do not assert FlatMMO-specific facts may be answered directly.

CONVERSATION:
- Follow pronouns, corrections, topic switches, implied subjects, and colloquial English naturally.
- Treat explicit corrections as authoritative: "not Bat, Gorilla", "the pickpocket one", "actually Coal Ore".
- Do not narrate memory or implementation details.
- Be concise for simple questions and explain more when the player asks.
- If the user gives a level, use it only as user-provided state unless the current request clearly says it is hypothetical.
- When a requested conclusion cannot be supported by the available FlatMMO data, say what is missing rather than guessing.

STYLE:
Sound like a knowledgeable player sitting beside the user: plain, calm, mildly informal, and comfortable saying "I don't know".`;

const TOOLS = [
  {
    name: "search_entities",
    description: "Search current FlatMMO Companion data for items, monsters, quests, skills, and areas by player wording. Use this to resolve names or ambiguity before factual lookup.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The player's name or phrase to resolve." },
        types: { type: "array", items: { type: "string", enum: ["item","monster","quest","skill","area"] }, description: "Optional entity types to restrict the search." }
      },
      required: ["query"]
    }
  },
  {
    name: "get_item",
    description: "Return the authoritative current Companion record for one FlatMMO item, including documented acquisition routes and structured uses.",
    parameters: {
      type: "object",
      properties: {
        item: { type: "string", description: "Canonical item name or item id." }
      },
      required: ["item"]
    }
  },
  {
    name: "find_item_sources",
    description: "Find documented acquisition routes for one FlatMMO item, apply explicit player constraints conservatively, and return chance semantics plus other documented outcomes for random pickpocket/monster sources.",
    parameters: {
      type: "object",
      properties: {
        item: { type: "string" },
        include_methods: { type: "array", items: { type: "string" }, description: "Optional acquisition types such as pickpocket, shop, monster_drop, farming, production, smelting, quest_reward." },
        exclude_combat: { type: "boolean" },
        exclude_stealing: { type: "boolean" },
        exclude_quests: { type: "boolean" },
        area: { type: "string", description: "Optional area name." },
        player_levels: { type: "object", additionalProperties: { type: "number" }, description: "User-provided skill levels relevant to access checks." }
      },
      required: ["item"]
    }
  },
  {
    name: "get_monster",
    description: "Return one monster's documented FlatMMO stats, area, room links, and full loot table with explicit guaranteed-vs-chance semantics.",
    parameters: {
      type: "object",
      properties: { monster: { type: "string" } },
      required: ["monster"]
    }
  },
  {
    name: "get_quest",
    description: "Return one quest's documented requirements, procedure, locations, and rewards.",
    parameters: {
      type: "object",
      properties: { quest: { type: "string" } },
      required: ["quest"]
    }
  },
  {
    name: "get_skill",
    description: "Resolve player wording to one official FlatMMO skill and return its current Companion record. Safe input wording such as 'forge skill' may resolve to the canonical official name Forging. Foreign-game terms such as RuneScape Smithing are not FlatMMO skill aliases.",
    parameters: {
      type: "object",
      properties: { skill: { type: "string" } },
      required: ["skill"]
    }
  },
  {
    name: "list_skills",
    description: "Return the complete canonical list of official playable skills in the current Companion data. Use this when the player asks for all skills and before claiming that a proposed skill name does not exist.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "compare_game_term",
    description: "Look up a curated comparison between a foreign-game term (for example RuneScape Smithing) and its documented FlatMMO comparison. This is the preferred tool for cross-game terminology comparisons; it does not import foreign-game mechanics into FlatMMO.",
    parameters: {
      type: "object",
      properties: {
        foreign_game: { type: "string", description: "Foreign game name, such as RuneScape or OSRS." },
        foreign_term: { type: "string", description: "Foreign-game term, such as Smithing." },
        flatmmo_term: { type: "string", description: "Optional FlatMMO term named by the player, such as Forging." }
      },
      required: ["foreign_term"]
    }
  },
  {
    name: "get_source_loot",
    description: "Return the documented loot/drop table for a random source. Use pickpocket for an NPC such as Farmer, or monster for a combat monster. This tool distinguishes guaranteed entries from chance-based entries and reports unknown odds explicitly.",
    parameters: {
      type: "object",
      properties: {
        source_type: { type: "string", enum: ["pickpocket", "monster"] },
        source: { type: "string", description: "NPC victim or monster name, such as Farmer." }
      },
      required: ["source_type", "source"]
    }
  },
  {
    name: "get_game_info",
    description: "Return the Companion's sourced description of FlatMMO, official/community links, and guidance for finding current help including the official Discord link exposed by the game/official site.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "get_game_rules",
    description: "Return FlatMMO's official Rules & Code of Conduct as structured sourced data. Use this for questions about allowed tools, botting, alts, trading, conduct, exploits, account security, or other game rules.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "find_route",
    description: "Find a documented directed route between FlatMMO areas using current area connection data. Requirements are reported as requirements, not assumed costs.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string" },
        to: { type: "string" }
      },
      required: ["from","to"]
    }
  },
  {
    name: "search_rules",
    description: "Search documented FlatMMO mechanics/rules for a concept such as Sleep Points, Run, combat defence, progression, or other recorded rules.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"]
    }
  },
  {
    name: "lookup_term",
    description: "Look up a curated FlatMMO/community term or English interpretation entry. This explains terminology only and is not mechanics authority.",
    parameters: {
      type: "object",
      properties: { term: { type: "string" } },
      required: ["term"]
    }
  }
];

function json(data, status = 200, origin = "*") {
  return new Response(JSON.stringify({ publicSite: PUBLIC_SITE_URL, ...data }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "content-type, authorization, x-flatmmo-client",
      "access-control-allow-methods": "POST, OPTIONS",
      "vary": "Origin"
    }
  });
}

function workerLanding() {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FlatMMO AI Prototype Worker</title><body><main><h1>FlatMMO AI Prototype Worker</h1><p><a href="${PUBLIC_SITE_URL}">Open the FlatMMO Companion public site</a></p><p>This endpoint serves the public AI API.</p></main></body></html>`, {
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

function allowedOrigin(origin) {
  if (!origin) return null;
  if (/^https?:\/\//.test(origin)) return origin;
  return null;
}

function validPublicClientId(value) {
  return /^[a-zA-Z0-9_-]{8,128}$/.test(String(value || ""));
}

function norm(v) {
  return String(v ?? "").toLowerCase().replace(/[_-]+/g, " ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function titleId(v) {
  return String(v ?? "").split("_").map(x => x ? x[0].toUpperCase() + x.slice(1) : x).join(" ");
}

function compactSource(a) {
  const out = { type: a.type };
  for (const k of ["monster","victim","stall","chest","shop","area","location","skill","level","price","priceText","currency","min","max","rarity","rarityDenominator","quantity","outputQuantity","oneTime","quest","npc","service","bundle","milestoneTasks","source","authority","confidence"]) {
    if (a[k] !== undefined && a[k] !== null) out[k] = a[k];
  }
  if (a.materials) out.materials = a.materials;
  if (a.requirements) out.requirements = a.requirements;
  return out;
}

function chanceFromDenominator(denominator, label = null) {
  const n = Number(denominator);
  if (!Number.isFinite(n) || n <= 0) {
    return { known: false, label: label || null, text: label ? `${label}; exact chance not documented` : "Exact chance not documented" };
  }
  if (n === 1) {
    return { known: true, denominator: 1, probability: 1, percent: 100, label: label || "Always", text: label ? `${label} (1/1)` : "Always (1/1)" };
  }
  const percent = 100 / n;
  return {
    known: true,
    denominator: n,
    probability: 1 / n,
    percent,
    label: label || null,
    text: label ? `${label} (1/${n})` : `1/${n}`
  };
}

function pickpocketPool(itemsData, victim) {
  const key = norm(victim);
  const rows = [];
  for (const rec of itemsData.records || []) {
    for (const a of rec.acquisition || []) {
      if (a.type !== "pickpocket" || norm(a.victim) !== key) continue;
      rows.push({
        item: rec.name,
        rarity: a.rarity || null,
        chance: chanceFromDenominator(a.rarityDenominator, a.rarity || null),
        area: a.area || null,
        location: a.location || null,
        level: a.level ?? null
      });
    }
  }
  return rows.sort((a, b) => {
    const ad = a.chance?.denominator ?? Number.POSITIVE_INFINITY;
    const bd = b.chance?.denominator ?? Number.POSITIVE_INFINITY;
    return ad - bd || a.item.localeCompare(b.item);
  });
}

function monsterLootTable(monster) {
  return (monster?.drops || []).map(d => {
    const oneTime = !!d.unique;
    return {
      item: titleId(d.item),
      min: d.min,
      max: d.max,
      chance: chanceFromDenominator(d.rarity_denominator, d.rarity_denominator === 1 ? "Always" : null),
      oneTime,
      dropEligibility: oneTime ? "until_first_acquisition" : "normal",
      oneTimeRule: oneTime
        ? "Can drop at the listed chance until the player obtains it once. After the first acquisition, it is no longer eligible to drop for that player."
        : null
    };
  });
}

function randomRouteSemantics(route, targetName, pools = {}) {
  if (route.type === "pickpocket") {
    const pool = pickpocketPool(pools.items, route.victim);
    const target = pool.find(x => norm(x.item) === norm(targetName));
    const targetChance = target?.chance || chanceFromDenominator(route.rarityDenominator, route.rarity || null);
    return {
      random: true,
      action: "pickpocket",
      targetChance,
      actionSuccessSeparateFromDropRoll: true,
      guarantee: targetChance.known ? targetChance.denominator === 1 : null,
      otherDocumentedOutcomes: pool.filter(x => norm(x.item) !== norm(targetName)),
      note: "Pickpocket success chance and item drop chance are separate. A successful pickpocket does not guarantee this target unless its listed item chance is 1/1. A null guarantee means the current data does not establish whether the target is guaranteed."
    };
  }
  if (route.type === "monster_drop") {
    const monster = (pools.monsters?.records || []).find(m => norm(m.name) === norm(route.monster));
    const table = monsterLootTable(monster);
    const target = table.find(x => norm(x.item) === norm(targetName));
    const targetChance = target?.chance || chanceFromDenominator(route.rarityDenominator);
    return {
      random: true,
      action: "monster_drop",
      targetChance,
      guarantee: targetChance.known ? targetChance.denominator === 1 : null,
      oneTime: target?.oneTime ?? false,
      dropEligibility: target?.dropEligibility ?? "unknown",
      oneTimeRule: target?.oneTimeRule ?? null,
      lootRollRelationship: {
        mutualExclusivity: "unknown",
        rollIndependence: "unknown",
        maxConcurrentChanceDrops: "unknown"
      },
      otherDocumentedOutcomes: table.filter(x => norm(x.item) !== norm(targetName)),
      note: target?.oneTime
        ? "This is a one-time drop: it can drop at the listed chance until the player obtains it once, then it is no longer eligible to drop for that player. This does not mean one copy per kill."
        : "Monster loot-table entries with odds above 1/1 are chance-based. A null guarantee means the current data does not establish whether the target is guaranteed. Other listed drops are additional documented outcomes. The current data does not establish whether chance-based drops are mutually exclusive, independent, or limited to a maximum number on the same kill."
    };
  }
  return null;
}

async function loadData(env, file) {
  const base = String(env.DATA_BASE || "https://etherealaporia-alt.github.io/FlatMMO-Companion/").replace(/\/+$/, "") + "/";
  const res = await fetch(base + file, { cf: { cacheTtl: 300, cacheEverything: true } });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return res.json();
}

function bestRecord(records, query) {
  const q = norm(query);
  let best = null, bestScore = -1;
  for (const r of records || []) {
    const names = [r.id, r.name, ...(r.aliases || [])].filter(Boolean);
    let score = 0;
    for (const n of names) {
      const x = norm(n);
      if (!x) continue;
      if (x === q) score = Math.max(score, 1000);
      else if (x.startsWith(q) || q.startsWith(x)) score = Math.max(score, 700 - Math.abs(x.length - q.length));
      else if (x.includes(q) || q.includes(x)) score = Math.max(score, 500 - Math.abs(x.length - q.length));
      else {
        const qt = new Set(q.split(" ")), xt = new Set(x.split(" "));
        const shared = [...qt].filter(t => xt.has(t)).length;
        if (shared) score = Math.max(score, shared * 80);
      }
    }
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return bestScore >= 80 ? best : null;
}

const SKILL_QUERY_NOISE = new Set(["skill", "skills", "level", "levels", "lvl", "the", "a", "an", "my", "flatmmo"]);
const SAFE_SKILL_INPUT_ALIASES = new Map([
  ["forge", "forging"],
  ["firemake", "firemaking"]
]);

function skillQueryKey(value) {
  const tokens = norm(value).split(" ").filter(Boolean).filter(t => !SKILL_QUERY_NOISE.has(t));
  const cleaned = tokens.join(" ");
  return SAFE_SKILL_INPUT_ALIASES.get(cleaned) || cleaned;
}

function skillRecordKeys(record) {
  const values = [record?.name, record?.id, ...(record?.aliases || [])].filter(Boolean);
  const out = new Set();
  for (const value of values) {
    const key = skillQueryKey(value);
    if (key) out.add(key);
  }
  return [...out];
}

function skillMatchScore(record, query) {
  const q = skillQueryKey(query);
  if (!q) return 0;
  let score = 0;
  for (const x of skillRecordKeys(record)) {
    if (x === q) score = Math.max(score, 1000);
    else if (q.split(" ").includes(x) && x.length >= 4) score = Math.max(score, 900);
    else if (x.split(" ").includes(q) && q.length >= 4) score = Math.max(score, 850);
    else if (q.length >= 4 && x.length >= 4 && (x.startsWith(q) || q.startsWith(x))) score = Math.max(score, 700 - Math.abs(x.length - q.length));
  }
  return score;
}

function resolveSkillRecord(records, query) {
  let best = null, bestScore = 0;
  for (const record of records || []) {
    const score = skillMatchScore(record, query);
    if (score > bestScore) { best = record; bestScore = score; }
  }
  return bestScore >= 650 ? { record: best, score: bestScore, inputKey: skillQueryKey(query) } : null;
}

function routeAccessible(route, levels = {}) {
  if (!route.skill || route.level == null) return { status: "unknown_or_no_skill_gate" };
  const lookup = Object.entries(levels).find(([k]) => norm(k) === norm(route.skill));
  if (!lookup) return { status: "unknown", requirement: `${route.skill} ${route.level}` };
  const supplied = Number(lookup[1]);
  if (!Number.isFinite(supplied)) return { status: "unknown", requirement: `${route.skill} ${route.level}` };
  return { status: supplied >= Number(route.level) ? "met" : "not_met", requirement: `${route.skill} ${route.level}`, supplied };
}

async function searchEntities(env, args) {
  const wanted = new Set(args.types || ["item","monster","quest","skill","area"]);
  const files = {
    item: "flatmmo-items.json", monster: "flatmmo-monsters.json", quest: "flatmmo-quests.json",
    skill: "flatmmo-skills.json", area: "flatmmo-areas.json"
  };
  const results = [];
  for (const [type, file] of Object.entries(files)) {
    if (!wanted.has(type)) continue;
    const data = await loadData(env, file);
    const q = norm(args.query);
    for (const r of data.records || []) {
      if (type === "skill") {
        const score = skillMatchScore(r, args.query);
        if (score >= 650) results.push({ id: r.id, type, name: r.name, score, canonical: true });
        continue;
      }
      const names = [r.name, r.id, ...(r.aliases || [])].filter(Boolean);
      let score = 0;
      for (const n of names) {
        const x = norm(n);
        if (x === q) score = Math.max(score, 1000);
        else if (x.startsWith(q) || q.startsWith(x)) score = Math.max(score, 700 - Math.abs(x.length - q.length));
        else if (x.includes(q) || q.includes(x)) score = Math.max(score, 500 - Math.abs(x.length - q.length));
        else {
          const shared = q.split(" ").filter(t => x.split(" ").includes(t)).length;
          score = Math.max(score, shared * 80);
        }
      }
      if (score >= 80) results.push({ id: r.id, type, name: r.name, score });
    }
  }
  return { query: args.query, results: results.sort((a,b) => b.score - a.score).slice(0,12) };
}

async function getItem(env, args) {
  const data = await loadData(env, "flatmmo-items.json");
  const r = bestRecord(data.records, args.item);
  if (!r) return { found: false, item: args.item };
  return {
    found: true,
    item: { id: r.id, name: r.name, categories: r.categories || [], acquisition: (r.acquisition || []).map(compactSource), uses: r.uses || [] },
    notes: [
      "Acquisition methods are additive. Missing methods mean not documented in this snapshot, not proven absent from the game.",
      "A listed pickpocket or monster-drop source means the item can come from that source; it does not mean the item is guaranteed. Use find_item_sources or get_source_loot for chance and alternative-drop context."
    ]
  };
}

async function findItemSources(env, args) {
  const data = await loadData(env, "flatmmo-items.json");
  const r = bestRecord(data.records, args.item);
  if (!r) return { found: false, item: args.item, routes: [] };
  let routes = (r.acquisition || []).slice();
  const include = new Set((args.include_methods || []).map(norm));
  if (include.size) routes = routes.filter(x => include.has(norm(x.type)));
  if (args.exclude_combat) routes = routes.filter(x => x.type !== "monster_drop");
  if (args.exclude_stealing) routes = routes.filter(x => !["pickpocket","stall","map_chest","rogue_chest"].includes(x.type));
  if (args.exclude_quests) routes = routes.filter(x => x.type !== "quest_reward");
  if (args.area) routes = routes.filter(x => norm(x.area || x.location || "").includes(norm(args.area)));

  const needsMonsters = routes.some(x => x.type === "monster_drop");
  const monsters = needsMonsters ? await loadData(env, "flatmmo-monsters.json") : { records: [] };

  return {
    found: true,
    item: { id: r.id, name: r.name },
    routes: routes.map(x => {
      const chanceContext = randomRouteSemantics(x, r.name, { items: data, monsters });
      return {
        ...compactSource(x),
        access_from_supplied_levels: routeAccessible(x, args.player_levels || {}),
        chanceContext
      };
    }),
    unknowns: [
      "A listed skill unlock does not by itself establish pickpocket success probability.",
      "Unlisted acquisition methods are not proven absent from FlatMMO.",
      "For monster loot, the current data does not establish mutual exclusivity, roll independence, or a maximum number of concurrent chance-based drops. Do not infer any of those mechanics."
    ]
  };
}

async function getMonster(env, args) {
  const data = await loadData(env, "flatmmo-monsters.json");
  const r = bestRecord(data.records, args.monster);
  if (!r) return { found: false, monster: args.monster };
  return {
    found: true,
    monster: {
      id: r.id, name: r.name, area: r.area, boss: !!r.boss,
      stats: { damage: r.damage, accuracy: r.accuracy, defence: r.defence, magic_defence: r.magic_defence, hp: r.hp, weakness: r.weakness },
      drops: monsterLootTable(r),
      rooms: (r.roomRefs || []).map(x => ({ roomId: x.roomId, relation: x.relation, confidence: x.confidence }))
    },
    lootRollRelationship: {
      mutualExclusivity: "unknown",
      rollIndependence: "unknown",
      maxConcurrentChanceDrops: "unknown"
    },
    lootSemantics: "Each listed loot-table entry has its own documented rarity. 1/1 means Always; larger denominators are chance-based. A drop with oneTime:true remains eligible at its listed chance until acquired once; after acquisition it is permanently ineligible for that player. oneTime never means one copy per kill. The current data does not establish whether chance-based drops are mutually exclusive, independent, or limited to a maximum number on the same kill. Do not state or imply any of those mechanics."
  };
}

async function getQuest(env, args) {
  const data = await loadData(env, "flatmmo-quests.json");
  const r = bestRecord(data.records, args.quest);
  if (!r) return { found: false, quest: args.quest };
  return { found: true, quest: { id: r.id, name: r.name, difficulty: r.difficulty, locations: r.locations || [], requirements: r.requirements || [], rewards: r.rewards || [], procedure: r.procedure || [], source: r.source } };
}

async function getSkill(env, args) {
  const data = await loadData(env, "flatmmo-skills.json");
  const match = resolveSkillRecord(data.records, args.skill);
  if (!match) {
    return {
      found: false,
      requested: args.skill,
      officialSkills: (data.records || []).map(r => r.name),
      note: "No canonical skill matched this wording. Do not substitute a different skill or invent a renamed skill."
    };
  }
  const r = match.record;
  return {
    found: true,
    requested: args.skill,
    canonicalName: r.name,
    interpretedInput: match.inputKey,
    skill: r,
    note: `Use the official name ${r.name} in the answer.`
  };
}

async function listSkills(env) {
  const data = await loadData(env, "flatmmo-skills.json");
  return {
    count: (data.records || []).length,
    skills: (data.records || []).map(r => ({ id: r.id, name: r.name, type: r.type }))
  };
}

async function compareGameTerm(env, args) {
  const data = await loadData(env, "flatmmo-language.json");
  const game = norm(args.foreign_game || "");
  const term = norm(args.foreign_term || "");
  const flat = norm(args.flatmmo_term || "");
  const matches = [];
  for (const e of data.foreignComparisons || []) {
    const gameNames = [e.foreignGame, ...(e.foreignAliases || [])].map(norm).filter(Boolean);
    const foreignTerms = (e.foreignTerms || []).map(norm).filter(Boolean);
    const flatTerm = norm(e.flatmmoTerm || "");
    const gameMatch = !game || gameNames.some(x => x === game || x.includes(game) || game.includes(x));
    const termMatch = !term || foreignTerms.some(x => x === term || x.includes(term) || term.includes(x));
    const flatMatch = !flat || flatTerm === flat || flatTerm.includes(flat) || flat.includes(flatTerm);
    if (!gameMatch || !termMatch || !flatMatch) continue;
    let score = 0;
    if (game && gameNames.some(x => x === game)) score += 100;
    if (term && foreignTerms.some(x => x === term)) score += 100;
    if (flat && flatTerm === flat) score += 100;
    matches.push({
      id: e.id,
      foreignGame: e.foreignGame,
      foreignTerms: e.foreignTerms || [],
      flatmmoTerm: e.flatmmoTerm,
      comparison: e.answer,
      source: e.source,
      mechanicsAuthority: false,
      score
    });
  }
  matches.sort((a, b) => b.score - a.score);
  return matches.length
    ? { found: true, match: matches[0], note: "This comparison is curated language guidance. FlatMMO mechanics still come from FlatMMO tools/data." }
    : { found: false, foreign_game: args.foreign_game || null, foreign_term: args.foreign_term, flatmmo_term: args.flatmmo_term || null };
}

async function getSourceLoot(env, args) {
  const sourceType = norm(args.source_type);
  if (sourceType === "pickpocket") {
    const data = await loadData(env, "flatmmo-items.json");
    const rows = pickpocketPool(data, args.source);
    if (!rows.length) {
      return { found: false, sourceType: "pickpocket", source: args.source };
    }
    return {
      found: true,
      sourceType: "pickpocket",
      source: args.source,
      drops: rows,
      semantics: [
        "Pickpocketing NPCs gives random item drops.",
        "The NPC pickpocket success chance is separate from the individual item drop rarity.",
        "A successful pickpocket does not guarantee every listed item. Items marked 1/1 are guaranteed item rolls; other entries are chance-based.",
        "Do not calculate an overall per-attempt item probability unless the current pickpocket success chance is also known."
      ],
      sourceUrl: "https://flatmmo.wiki/index.php/Stealing"
    };
  }
  if (sourceType === "monster") {
    const data = await loadData(env, "flatmmo-monsters.json");
    const monster = bestRecord(data.records, args.source);
    if (!monster) {
      return { found: false, sourceType: "monster", source: args.source };
    }
    return {
      found: true,
      sourceType: "monster",
      source: monster.name,
      drops: monsterLootTable(monster),
      lootRollRelationship: {
        mutualExclusivity: "unknown",
        rollIndependence: "unknown",
        maxConcurrentChanceDrops: "unknown"
      },
      semantics: [
        "Monster loot-table entries are per-item documented rarities.",
        "1/1 means Always; larger denominators are chance-based.",
        "A drop with oneTime:true can drop at its listed chance until the player obtains it once. After that first acquisition it is no longer eligible to drop for that player.",
        "oneTime means once-ever acquisition, not one copy per kill.",
        "The current data does not establish whether chance-based drops are mutually exclusive, independent, or limited to a maximum number on the same kill.",
        "Do not say or imply that only one additional drop can occur unless a documented mechanic explicitly establishes that."
      ],
      sourceUrl: "https://flatmmo.wiki/index.php/Monsters"
    };
  }
  return { found: false, error: "unsupported_source_type", sourceType: args.source_type };
}

async function getGameInfo(env) {
  const data = await loadData(env, "flatmmo-game.json");
  return {
    description: data.description,
    officialLinks: data.officialLinks,
    communityGuidance: data.communityGuidance,
    sources: data.sources
  };
}

async function getGameRules(env) {
  const data = await loadData(env, "flatmmo-game.json");
  return {
    rules: data.codeOfConduct || [],
    source: data.officialLinks?.rules || "https://flatmmo.com/rules.php",
    note: "These are the Companion's structured summaries of FlatMMO's official Rules & Code of Conduct. The official rules page is authoritative if wording changes."
  };
}

async function findRoute(env, args) {
  const data = await loadData(env, "flatmmo-areas.json");
  const from = bestRecord(data.records, args.from), to = bestRecord(data.records, args.to);
  if (!from || !to) return { found: false, from: args.from, to: args.to, reason: "Could not resolve one or both area names." };
  const byName = new Map((data.records || []).map(a => [norm(a.name), a]));
  const queue = [{ area: from, steps: [] }], seen = new Set([norm(from.name)]);
  while (queue.length) {
    const cur = queue.shift();
    if (norm(cur.area.name) === norm(to.name)) return { found: true, from: from.name, to: to.name, steps: cur.steps };
    for (const e of cur.area.externalConnections || []) {
      const next = byName.get(norm(e.area));
      if (!next || seen.has(norm(next.name))) continue;
      seen.add(norm(next.name));
      queue.push({ area: next, steps: [...cur.steps, { from: cur.area.name, to: next.name, method: e.method, fromRoom: e.fromRoom || null, requirements: e.requirements || [] }] });
    }
  }
  return { found: false, from: from.name, to: to.name, reason: "No directed route is documented in the current area graph." };
}

async function searchRules(env, args) {
  const [rules, mechanics, acquisition, game] = await Promise.all([
    loadData(env, "flatmmo-rules.json"),
    loadData(env, "flatmmo-mechanics.json"),
    loadData(env, "flatmmo-acquisition-rules.json"),
    loadData(env, "flatmmo-game.json")
  ]);
  const q = norm(args.query), rows = [];
  const addIfMatch = row => {
    const hay = norm(JSON.stringify(row));
    const shared = q.split(" ").filter(t => hay.includes(t)).length;
    if (hay.includes(q) || shared) rows.push({ ...row, score: (hay.includes(q) ? 20 : 0) + shared });
  };
  for (const r of rules.rules || []) {
    addIfMatch({ type: "rule", id: r.id, name: r.name, status: r.status, facts: r.facts || [], notes: r.notes || [], sources: r.sources || [] });
  }
  for (const r of acquisition.rules || []) {
    addIfMatch({ type: "acquisition_rule", id: r.id, name: r.name, status: r.status, facts: r.facts || [], unknowns: r.unknowns || [], sources: r.sources || [] });
  }
  for (const r of game.codeOfConduct || []) {
    addIfMatch({ type: "official_conduct_rule", id: r.id, name: r.name, summary: r.summary, source: game.officialLinks?.rules });
  }
  for (const r of mechanics.records || []) {
    addIfMatch({ type: "mechanic", id: r.id, name: r.name, record: r });
  }
  return { query: args.query, results: rows.sort((a,b) => b.score-a.score).slice(0,8) };
}

async function lookupTerm(env, args) {
  const data = await loadData(env, "flatmmo-language.json");
  const q = norm(args.term), results = [];
  for (const e of data.flatmmoTerms || []) {
    if ((e.forms || []).some(f => norm(f) === q || norm(f).includes(q) || q.includes(norm(f)))) results.push({ class: e.class, term: e.forms?.[0] || e.id, definition: e.definition, mechanicsAuthority: false, evidence: e.evidence || [] });
  }
  for (const e of data.englishColloquialisms || []) {
    if ((e.forms || []).some(f => norm(f) === q)) results.push({ class: "english_colloquial", term: args.term, semantic: e.semantic, mechanicsAuthority: false });
  }
  return { term: args.term, results: results.slice(0,8) };
}

async function executeTool(env, name, args) {
  switch (name) {
    case "search_entities": return searchEntities(env, args);
    case "get_item": return getItem(env, args);
    case "find_item_sources": return findItemSources(env, args);
    case "get_monster": return getMonster(env, args);
    case "get_quest": return getQuest(env, args);
    case "get_skill": return getSkill(env, args);
    case "list_skills": return listSkills(env, args);
    case "compare_game_term": return compareGameTerm(env, args);
    case "get_source_loot": return getSourceLoot(env, args);
    case "get_game_info": return getGameInfo(env, args);
    case "get_game_rules": return getGameRules(env, args);
    case "find_route": return findRoute(env, args);
    case "search_rules": return searchRules(env, args);
    case "lookup_term": return lookupTerm(env, args);
    default: return { error: "unknown_tool", name };
  }
}

function normalizeToolCall(c, index = 0) {
  const fn = c?.function && typeof c.function === "object" ? c.function : null;
  return {
    id: c?.id || `call_${index}`,
    name: fn?.name || c?.name,
    arguments: fn?.arguments ?? c?.arguments ?? {}
  };
}

function normalizeAi(raw) {
  const msg = raw?.choices?.[0]?.message;
  if (msg) {
    const calls = (msg.tool_calls || []).map((c, i) => normalizeToolCall(c, i));
    return { content: msg.content || "", tool_calls: calls };
  }
  return {
    content: raw?.response || raw?.content || "",
    tool_calls: (raw?.tool_calls || []).map((c, i) => normalizeToolCall(c, i))
  };
}

function cleanMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter(m => m && ["user","assistant"].includes(m.role) && typeof m.content === "string")
    .slice(-MAX_MESSAGES)
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CONTENT) }));
}

function needsToolGrounding(text) {
  const q = norm(text);
  if (!q) return false;
  // Pure social turns are the only turns allowed to skip a tool on the first model pass.
  // The prototype is otherwise a FlatMMO assistant, so factual, corrective, comparison,
  // and follow-up turns must re-ground against current tools instead of trusting chat history.
  return !/^(hi|hello|hey|hiya|thanks|thank you|cheers|nice|cool|good morning|good afternoon|good evening|good night|bye|goodbye|see you|lol|haha|ha)$/.test(q);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const corsOrigin = allowedOrigin(origin);
    const expected = env.PROTOTYPE_TOKEN;
    const auth = request.headers.get("Authorization") || "";
    const isAdmin = Boolean(expected) && auth === `Bearer ${expected}`;
    const responseOrigin = corsOrigin || "*";

    if (request.method === "OPTIONS") {
      if (!corsOrigin) return new Response("Origin not allowed", { status: 403 });
      return json({ ok: true }, 200, corsOrigin);
    }

    // Browser-visible health check. Public readiness depends on AI + rate-limit bindings,
    // not on the optional admin token.
    if (request.method === "GET") {
      if ((request.headers.get("Accept") || "").includes("text/html")) return workerLanding();
      const publicReady = Boolean(env.AI && env.PUBLIC_CLIENT_RATE_LIMITER && env.PUBLIC_IP_RATE_LIMITER);
      return json({
        ok: true,
        service: "FlatMMO AI Prototype",
        model: env.MODEL || "@cf/zai-org/glm-4.7-flash",
        publicAccess: true,
        rateLimited: Boolean(env.PUBLIC_CLIENT_RATE_LIMITER && env.PUBLIC_IP_RATE_LIMITER),
        adminAccess: Boolean(expected),
        ready: publicReady
      }, publicReady ? 200 : 503, responseOrigin);
    }
    if (request.method !== "POST") return json({ error: "POST only" }, 405, responseOrigin);

    // Normal public browser traffic must come from the published GitHub Pages site
    // (or localhost during development). The admin bearer token can still be used from
    // command-line/dev clients. Origin checking is a browser boundary, not authentication,
    // so public requests are also rate-limited below.
    if (!corsOrigin && !isAdmin) return new Response("Origin not allowed", { status: 403 });

    if (!isAdmin) {
      if (!env.PUBLIC_CLIENT_RATE_LIMITER || !env.PUBLIC_IP_RATE_LIMITER) {
        return json({
          error: "public_access_not_configured",
          message: "Public rate limiting is not configured."
        }, 503, responseOrigin);
      }

      const rawClientId = request.headers.get("X-FlatMMO-Client") || "";
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const clientKey = validPublicClientId(rawClientId)
        ? `client:${rawClientId}`
        : `ip-fallback:${ip}`;

      const [clientLimit, ipLimit] = await Promise.all([
        env.PUBLIC_CLIENT_RATE_LIMITER.limit({ key: clientKey }),
        env.PUBLIC_IP_RATE_LIMITER.limit({ key: `ip:${ip}` })
      ]);

      if (!clientLimit.success || !ipLimit.success) {
        return json({
          error: "rate_limited",
          message: "Too many requests. Please wait a moment and try again."
        }, 429, responseOrigin);
      }
    }

    let body;
    try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400, responseOrigin); }
    const history = cleanMessages(body.messages);
    if (!history.length || history[history.length - 1].role !== "user") return json({ error: "messages must end with a user message" }, 400, responseOrigin);
    const debugEnabled = Boolean(body.debug && isAdmin);

    const model = env.MODEL || "@cf/zai-org/glm-4.7-flash";
    const working = [{ role: "system", content: SYSTEM_PROMPT }, ...history];
    const trace = [];
    const requireInitialGrounding = needsToolGrounding(history[history.length - 1]?.content);

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const raw = await env.AI.run(model, {
          messages: working,
          // GLM-4.7-Flash accepts the OpenAI-compatible function-tool envelope.
          tools: TOOLS.map(tool => ({ type: "function", function: tool })),
          // Require one fresh deterministic lookup for substantive FlatMMO turns.
          // Later rounds return to auto so the model can stop calling tools and answer.
          tool_choice: round === 0 && requireInitialGrounding ? "required" : "auto",
          parallel_tool_calls: false,
          max_completion_tokens: 500,
          temperature: 0.2
        });
        const ai = normalizeAi(raw);
        const call = ai.tool_calls?.[0];
        if (!call) {
          const answer = ai.content || "I couldn't form an answer from the available FlatMMO data.";
          return json({ answer, model, toolTrace: debugEnabled ? trace : undefined }, 200, responseOrigin);
        }

        let args = call.arguments;
        if (typeof args === "string") {
          try { args = JSON.parse(args); } catch { args = {}; }
        }
        const toolResult = await executeTool(env, call.name, args || {});
        trace.push({ tool: call.name, arguments: args || {}, result: toolResult });

        // Preserve the model-generated tool call ID for the next inference round.
        // Current Workers AI chat models expect an OpenAI-compatible assistant
        // tool_calls message followed by a tool result carrying tool_call_id.
        const toolCallId = call.id || `call_${round}`;
        const callArguments = typeof call.arguments === "string"
          ? call.arguments
          : JSON.stringify(args || {});
        working.push({
          role: "assistant",
          // Workers AI binding rejects null assistant content on tool-call turns.
          content: ai.content || "",
          tool_calls: [{
            id: toolCallId,
            type: "function",
            function: {
              name: call.name,
              arguments: callArguments
            }
          }]
        });
        working.push({
          role: "tool",
          tool_call_id: toolCallId,
          content: JSON.stringify(toolResult)
        });
      }
      return json({ error: "tool_loop_limit", message: "The model requested too many tool calls for one reply.", toolTrace: debugEnabled ? trace : undefined }, 502, responseOrigin);
    } catch (err) {
      return json({ error: "ai_error", message: String(err?.message || err), toolTrace: debugEnabled ? trace : undefined }, 502, responseOrigin);
    }
  }
};
