import assert from "node:assert/strict";
import {
  carryoverQuestion,
  deriveConversationState,
  effectiveAcquisitionPolicy,
  enforceToolArguments,
  recognizeConstraintEvents,
  rewriteAiToolCalls,
  sanitizeToolResult
} from "./SRC/conversation-state.js";

const items = [
  { id: "green_leaf_seeds", name: "Green Leaf Seeds", aliases: ["Green Leaf Seed"] },
  { id: "coal_ore", name: "Coal Ore" },
  { id: "iron_ore", name: "Iron Ore" }
];

const user = content => ({ role: "user", content });
const assistant = content => ({ role: "assistant", content });
const state = (...messages) => deriveConversationState(messages, items);

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function policy(...messages) {
  return effectiveAcquisitionPolicy(state(...messages));
}

test("no fighting changes only combat", () => {
  const s = state(user("How can I get Green Leaf Seeds?"), user("No fighting."));
  assert.deepEqual(s.acquisitionTask.constraints, { combat: "exclude" });
  assert.deepEqual(s.acquisitionTask.preferences.methods, []);
});

test("second restriction patches rather than regenerates", () => {
  const s = state(
    user("How can I get Green Leaf Seeds?"),
    user("No fighting."),
    user("No stealing.")
  );
  assert.deepEqual(s.acquisitionTask.constraints, { combat: "exclude", stealing: "exclude" });
});

test("permission removes only the addressed stealing restriction", () => {
  const s = state(
    user("How can I get Green Leaf Seeds without fighting or stealing?"),
    user("I'm happy to pickpocket.")
  );
  assert.deepEqual(s.acquisitionTask.constraints, { combat: "exclude" });
  assert.deepEqual(s.acquisitionTask.preferences.methods, []);
});

test("pickpocket preference never changes eligibility", () => {
  const s = state(
    user("How can I get Green Leaf Seeds without fighting?"),
    user("I'd rather pickpocket.")
  );
  assert.deepEqual(s.acquisitionTask.constraints, { combat: "exclude" });
  assert.deepEqual(s.acquisitionTask.preferences.methods, ["pickpocket"]);
});

test("target change creates unresolved carryover", () => {
  const s = state(
    user("How can I get Green Leaf Seeds without fighting?"),
    user("What about Coal Ore?")
  );
  assert.equal(s.acquisitionTask.target.name, "Green Leaf Seeds");
  assert.equal(s.pendingTask.target.name, "Coal Ore");
  assert.equal(s.pendingTask.carryover.combat.resolution, "unresolved");
  assert.match(carryoverQuestion(s), /Coal Ore.*combat/);
  assert.equal(effectiveAcquisitionPolicy(s).active, false);
});

test("carryover decisions resolve independently", () => {
  const s = state(
    user("How can I get Green Leaf Seeds without fighting or stealing?"),
    user("What about Coal Ore?"),
    user("Keep combat off, stealing is fine.")
  );
  assert.equal(s.pendingTask, null);
  assert.equal(s.acquisitionTask.target.name, "Coal Ore");
  assert.deepEqual(s.acquisitionTask.constraints, { combat: "exclude" });
});

test("partial carryover resolution asks only what remains", () => {
  const s = state(
    user("How can I get Green Leaf Seeds without fighting or stealing?"),
    user("What about Coal Ore?"),
    user("Keep combat off.")
  );
  assert.equal(s.pendingTask.carryover.combat.resolution, "keep");
  assert.equal(s.pendingTask.carryover.stealing.resolution, "unresolved");
  const question = carryoverQuestion(s);
  assert.match(question, /stealing\/pickpocketing/);
  assert.doesNotMatch(question, /restriction on combat/);
});

test("operation change suspends acquisition constraints", () => {
  const s = state(
    user("How can I get Green Leaf Seeds without fighting?"),
    user("What's my Mining level?")
  );
  assert.deepEqual(s.acquisitionTask.constraints, { combat: "exclude" });
  assert.equal(s.turnContext.kind, "other");
  assert.equal(effectiveAcquisitionPolicy(s).active, false);
});

test("unrelated monster question does not inherit no-fighting", () => {
  const p = policy(
    user("How can I get Green Leaf Seeds without fighting?"),
    user("What does a Gorilla drop?")
  );
  assert.equal(p.active, false);
});

test("assistant statements never mutate deterministic state", () => {
  const s = state(
    user("How can I get Green Leaf Seeds?"),
    assistant("You said no fighting and no stealing."),
    user("Where can I get it?")
  );
  assert.deepEqual(s.acquisitionTask.constraints, {});
});

test("model cannot switch target or turn exclusions off in find_item_sources", () => {
  const s = state(user("How can I get Green Leaf Seeds without fighting or stealing?"));
  const args = enforceToolArguments("find_item_sources", {
    item: "Coal Ore",
    exclude_combat: false,
    exclude_stealing: false
  }, s);
  assert.equal(args.item, "Green Leaf Seeds");
  assert.equal(args.exclude_combat, true);
  assert.equal(args.exclude_stealing, true);
});

test("OpenAI wrapped model tool calls are rewritten deterministically", () => {
  const s = state(user("How can I get Green Leaf Seeds without fighting?"));
  const raw = {
    choices: [{ message: { tool_calls: [{
      id: "call_1",
      type: "function",
      function: {
        name: "find_item_sources",
        arguments: JSON.stringify({ item: "Coal Ore", exclude_combat: false })
      }
    }] } }]
  };
  const next = rewriteAiToolCalls(raw, s);
  const args = JSON.parse(next.choices[0].message.tool_calls[0].function.arguments);
  assert.equal(args.item, "Green Leaf Seeds");
  assert.equal(args.exclude_combat, true);
});

test("get_item acquisition side door is sanitized", () => {
  const s = state(user("How can I get Green Leaf Seeds without fighting or stealing?"));
  const result = sanitizeToolResult("get_item", {
    found: true,
    item: {
      name: "Green Leaf Seeds",
      acquisition: [
        { type: "monster_drop", monster: "Silkfang" },
        { type: "pickpocket", victim: "Farmer" },
        { type: "farming", area: "Everbrook" }
      ]
    }
  }, s);
  assert.deepEqual(result.item.acquisition, [{ type: "farming", area: "Everbrook" }]);
});

test("direct combat loot side door is blocked during no-combat acquisition", () => {
  const s = state(user("How can I get Green Leaf Seeds without fighting?"));
  const result = sanitizeToolResult("get_source_loot", {
    found: true,
    sourceType: "monster",
    source: "Silkfang",
    drops: [{ item: "Green Leaf Seeds" }]
  }, s);
  assert.equal(result.blockedByConversationConstraint, "combat");
  assert.equal(result.drops, undefined);
});

test("new target can explicitly resolve a carryover in the same turn", () => {
  const s = state(
    user("How can I get Green Leaf Seeds without fighting?"),
    user("What about Coal Ore? Combat is fine.")
  );
  assert.equal(s.pendingTask, null);
  assert.equal(s.acquisitionTask.target.name, "Coal Ore");
  assert.deepEqual(s.acquisitionTask.constraints, {});
});

test("unknown wording produces no invented state patch", () => {
  const before = state(user("How can I get Green Leaf Seeds without fighting?"));
  const after = state(
    user("How can I get Green Leaf Seeds without fighting?"),
    user("That sounds a bit annoying.")
  );
  assert.deepEqual(after.acquisitionTask, before.acquisitionTask);
  assert.equal(after.turnContext.kind, "other");
});

test("recognizer distinguishes permission from preference", () => {
  assert.deepEqual(recognizeConstraintEvents("I'm happy to pickpocket."), [
    { type: "REMOVE_RESTRICTION", key: "stealing" }
  ]);
  assert.deepEqual(recognizeConstraintEvents("I'd rather pickpocket."), [
    { type: "ADD_PREFERENCE", key: "pickpocket" }
  ]);
});

console.log(`${passed} deterministic conversation-state scenarios passed.`);
