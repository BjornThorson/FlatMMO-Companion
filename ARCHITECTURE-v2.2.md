# FlatMMO Companion v2.2 — conversation kernel

This replacement was built from `v2-online` commit `9a9ed99a7e3b35d190c2b2cae47fb05549a1f232`. The deployed index was fetched and matched that commit byte for byte before implementation. GitHub was not changed.

## Architecture

`index.html` retains the existing interface and loads three local classic scripts in order. No bundler, module server, LLM or new remote dependency is required.

| File | Responsibility |
|---|---|
| companion-engine.js | Existing knowledge loading, graph indexes, structured queries/calculations, player handling and data-backed answer functions |
| companion-conversation.js | Speech acts, semantic actions, typed subject selection, correction, conversation state, operation objects and response composition |
| companion-ui.js | Form/chip events and application startup |
| flatmmo-language.json | Curated language evidence plus executable semantic-action declarations; never mechanics authority |

The pipeline is: utterance → speech act/style → comparison or definition routing → explicit typed subjects and hard exclusions → operation and constraints → structured data execution → stored result → response composition.

The existing 588 items, 1,168 acquisition routes, 199 items with uses, 1,574 graph nodes and 7,380 edges are preserved. Item, graph, equipment, skill, monster, quest, area, mechanic, rule and override files are unchanged. Grounding metadata and its JSON/text/HTML copies are synchronized.

## State and precedence

- `gameplayContext` stores the accepted query, result and optional production/journey model per bounded topic thread. Search outputs retain the full candidate set; display limits do not truncate the stored search.
- `languageContext` stores the most recent definition/comparison separately. It expires after three subsequent utterances and closes on an accepted gameplay operation. Language responses never install gameplay aliases or user levels.
- `userFacts.skills` stores explicit actual skill levels. Corrections update those facts. Hypothetical overrides remain attached to their calculation and are labelled in the answer.
- Existing thread bounds remain 12 topics and 36 turns per topic. Optional history replays up to 120 utterances. All operation is available in memory when storage is disabled.
- Twelve reversible checkpoints support `scratch that`/`undo that`, including actual-level corrections. This is bounded conversational undo, not a game-state operation.
- Ambiguity retains a pending clarification rather than committing every candidate as a gameplay subject.

Explicit replacements replace the candidate set. Old entities are not appended to the replacement sentence or retained to compete by score. Role corrections resolve typed acquisition-source nodes and structured source records. Excluded entities are suppressed before fuzzy scoring; excluded methods are applied to acquisition execution and retained search results.

Equipment-family words and fragments of rule IDs no longer act as aliases for individual records. `melee weapon` cannot resolve directly to an arbitrary high-level weapon.

## Retained operations

Production models keep recipe branches, direct inputs, expanded terminal inputs and unresolved branches. Totals, detail and raw-material follow-ups compose from that model. The full Iron Armour example computes 125 Iron Bars, expanding to 125 Iron Ore and 125 Coal Ore using the existing graph.

Journey models retain ordered endpoints and explicit directed edges. Cost and departure questions inspect the same journey; reversing endpoints recomputes the directed path. A requirement saying `Have 25 Coins` is reported as a requirement, not asserted to be a consumed fare. Empty cost requirements remain unknown rather than free.

Search refinements operate on retained candidates and constraints. An empty refinement stays an empty set; it does not silently restore excluded rows. Numeric ranking uses the existing documented shop/drop fields, without inferring time efficiency or combat performance.

## Authority boundaries

BiS/combat-comparison language invokes an uncertainty response instead of an item lookup. Exact hit chance, damage rolls, DPS, kill time, survivability and generic recommended combat levels remain unresolved. A pickpocket unlock requirement does not establish a no-failure threshold; the supplied snapshot lacks a structured success-threshold rule.

Foreign-game statements and follow-ups invoke curated comparisons or a conservative fallback. They cannot update recipes, skill aliases, user facts or graph relationships. Community language establishes wording only.

## Validation

Run from this folder, using Node 18 or later:

```
node conversation-regression.cjs
node ui-smoke.cjs
```

The regression suite covers 21 multi-turn scenarios, including both visible answers and internal state. The UI smoke suite covers application startup and form dispatch with storage disabled, plus optional history replay. It uses a DOM stub; it is not a rendered browser test.

A visual browser run could not be completed: no browser binary was installed, and the Chromium download timed out. The existing CSS/layout was preserved. Test the uploaded build on your device before treating visual/browser compatibility as verified.

## Remaining limits

This remains a finite deterministic interpreter, not general language understanding. Unsupported paraphrases may require clarification. The new model-based style composition is strongest for production and travel; existing data answers use conservative compact rendering. Numeric-only mode retains item labels and uncertainty because bare numbers can be misleading; nonnumeric operations explain that no isolated numeric result is available.

The engine retains existing numeric-price comparison behavior; it does not add market pricing, universal best-item ranking, or new mechanics. Missing success thresholds, routes, recipes and access facts stay unknown. The user prompt ended at section K before its beginner examples, so no unseen K requirements are claimed as implemented.
