# FlatMMO Companion

FlatMMO Companion is a web-only deterministic knowledge and decision assistant for FlatMMO.

Public site:
https://etherealaporia-alt.github.io/FlatMMO-Companion/

AI grounding page:
https://etherealaporia-alt.github.io/FlatMMO-Companion/ai.html

Canonical AI JSON:
https://etherealaporia-alt.github.io/FlatMMO-Companion/flatmmo-context.json

## Current build

The `v2-online` branch is the active development branch. Project data is deliberately kept at the repository root because the mobile maintenance workflow flattens archive directory structures.

The human UI is a deterministic conversational companion. v2.1 keeps the v2.0 unified typed relationship graph, longer topic-thread memory and semantic repair, then adds a curated language layer before fuzzy entity resolution. English colloquialisms and provenance-backed FlatMMO player terminology help identify speech acts and concepts; explicit negation suppresses rejected entities; and obvious RuneScape/OSRS comparisons use isolated stock responses rather than becoming FlatMMO aliases. Official FlatMMO names and structured mechanics remain authoritative. No LLM is required.

The current public-profile loader is interim and may be blocked by normal browser cross-origin policy. It fails cleanly. The player-provider boundary is already isolated so an official player API can replace the loader without redesigning the assistant.

Browser persistence is a convenience, not a dependency. Clearing site data must result in a harmless cold start.

## v2.2 architecture and implementation pass

The current replacement extracts the browser engine into `companion-engine.js`, adds `companion-conversation.js` for semantic interpretation and operation memory, and moves startup/events into `companion-ui.js`. All three files must be deployed beside `index.html`. The structured game knowledge is preserved.

See `ARCHITECTURE-v2.2.md` for implementation boundaries, validation and known limitations; `UPLOAD-v2.2.txt` for the flat-upload procedure. Run `node conversation-regression.cjs` and `node ui-smoke.cjs` for the included checks. No browser/LLM service or new public API dependency is added.

## Current source scope

Included:
- monsters and drops
- 21 named quests in the public context: 19 normalized core records plus 2 conservative observation-backed placeholders
- skills and mechanics
- explicit mechanics/calculation-readiness rules
- areas, rooms, services, NPCs and resource nodes
- equipment, weapons, crafting requirements and production relationships
- **588 first-class item records with 1,168 normalized acquisition routes and 199 items with structured uses**
- explicit shop inventories/prices where item rows are documented
- Stealing pickpockets, stalls and chest sources; Farming seed/crop relationships; spirit/event/bundle rewards
- monster/quest/location cross-links
- curated English colloquial interpretation and FlatMMO-attested terminology from `flatmmo-language.json`
- quarantined RuneScape/OSRS comparison responses that never enter the FlatMMO alias catalog

Human-side player support:
- username selection
- optional local session persistence
- portable player link
- interim public skill-level/XP loading when browser policy permits
- stats-only requirement and nearby-unlock reasoning
- conversational intent/entity resolution across quests, monsters, skills, areas, rooms, NPCs, resources/items, equipment and mechanics
- short follow-up references such as “it”, “there” and requirement/location follow-ups
- deterministic area-level route finding from explicit world connections
- known production-chain expansion for supported material calculations
- item-centric acquisition filtering: buy, steal, farm, craft and non-combat requests
- structured item-use queries such as “what can I make with Graphite?”
- item-specific shop inventory answers such as “what does the Omboko shop sell?”

Still pending or intentionally incomplete:
- official player API integration for reliable player snapshots
- automatic bank, inventory, equipped gear and quest-completion state
- exact combat hit-chance/damage-resolution formulas
- exact DPS, kill-time, survivability and recommended-level calculations
- Agility level 1–19 Run-step formula
- complete zero-Sleep behavior by activity
- market data
- official news/change-note ingestion

FlatMMO is treated as an independent game. Missing mechanics must never be inferred from RuneScape or other games.

See `flatmmo-sources.json`, `flatmmo-status.json`, `flatmmo-rules.json` and `flatmmo-overrides.json` for provenance, readiness and known limitations.

## Updating and AI access

The knowledge files are manually maintained static snapshots. The GitHub Pages workflow publishes committed files; it does not refresh game data. The official player API/schema is still pending. Public AI retrieval is optional and best-effort; the human assistant works without AI.

The JSON, text and HTML grounding copies contain the same context. Compact quest-step and monster-room arrays have explicit field-order schemas in `flatmmo-context.json`. After changing the context, regenerate both copies and update `aiContextSha256` in `flatmmo-status.json`.

## v1.6 player reliability and manual levels

Use **Enter skill levels** to supply known levels, with or without a username. Leave unknown skills blank. Saving replaces the current snapshot and marks it as user-entered; XP is unknown. The current session works when browser storage is unavailable. Portable links carry only a username, never manual levels.

A failed public-profile refresh retains the previous snapshot only for the same username, with its original timestamp and a warning. Editing the username clears a different player's levels immediately. Late requests cannot overwrite a new player, manual entry, or a cleared session. Successful public-profile loads replace manual levels. Cached manual levels retain their unverified source label.

This update changes player handling, not game mechanics. Official player API integration remains pending.

## v1.6.1 visual polish

The Companion takes visual cues from FlatMMO's public website: charcoal panels, warm brown controls, cream text, green primary buttons and monospace headings. Body text remains readable sans-serif. All styling is local CSS and system fonts; no external art or font downloads are required.

The manual-level dialog keeps its header and action footer outside the scrolling field area. Save and Cancel stay visible within the dialog. Phone widths use two columns, larger inputs and touch targets; dynamic viewport height and safe-area padding help on smaller screens. Real-device keyboard behaviour still needs checking.

The assistant JavaScript and game data are unchanged from v1.6. Player-state logic checks pass. The unpublished preview could not be rendered in cloud Chrome because local-file URLs are blocked; check the deployed layout after upload.


## v1.7 conversational query engine

v1.7 replaces the narrow entity-card dispatcher with a deterministic natural-language query layer. Questions are interpreted as an intent plus one or more structured entities before the answer is composed. The engine indexes monsters, quests, skills, areas, internal rooms, NPCs, resources/items, equipment, mechanics and readiness rules. Supported intents include information, location/acquisition, drops, requirements/readiness, walkthroughs, materials, progression, travel, counts/lists, comparisons and player-aware next-step queries.

Short follow-ups can reuse recent conversational context, so sequences such as `What does a gorilla drop?` followed by `Where is it?` remain on the same subject. A question can also supply temporary levels such as `Mining 40 and Crafting 48`; those values are used for that answer only and do not overwrite the saved player snapshot.

The interpreter remains deterministic and local to the browser. It is not an LLM and does not invent FlatMMO facts. Ambiguous or unsupported questions fall back to a clarification-style response rather than borrowing mechanics from another game. Combat calculations remain gated by the same readiness rules as before.


## v1.7.1 conversational follow-up hotfix

v1.7.1 tightens entity matching and follow-up context. Short entity names now match whole normalized words/phrases, preventing names such as `Bat` from matching inside unrelated words such as `combat`. Elliptical alternative-source follow-ups such as `Any ways other than combat?` can inherit the previous item/resource subject and acquisition intent.

The acquisition index now combines item-specific sources from structured world/resource nodes, crafting and production recipes, quest rewards, explicit item-named NPC shops/trades/services, and monster drops. Generic shop descriptions remain service/location evidence rather than being treated as complete inventories. If only combat sources are recorded for an item, the Companion says that no item-specific non-combat source is currently documented rather than inventing one or claiming none exists in the game.


## v1.8 knowledge expansion

v1.8 moves item knowledge into `flatmmo-items.json`, a first-class acquisition/use graph with **588 item records**, **1,168 normalized acquisition routes**, and **199 items with structured uses**. Existing monster drops, world resource nodes and production recipes are retained, then expanded with explicit shop rows, Stealing pickpockets/stalls/chests, Farming crop relationships, quest rewards, spirit reward pools, community-event rewards, starter-bundle rewards and explicit NPC services/trades.

The source policy is intentionally conservative. A generic statement such as “sells fishing-related items” is not treated as a complete inventory; the Companion uses explicit item rows. Unknown stall odds remain unknown, zero-stock shop rows stay visible as source-state information, and unlabeled Prospector price units are not silently assumed to be Coins.

The human query engine now uses this graph for ordinary questions such as `Where can I get Green Leaf Seeds?`, `Any ways other than combat?`, `Where can I buy a Shovel?`, `What does the Omboko shop sell?`, and `What can I make with Graphite?`. The item graph is broad, not exhaustive: a missing source or use means **not documented in this snapshot**, not that FlatMMO has none.

## v1.9 reasoning engine

v1.9 adds a deterministic reasoning layer above the v1.8 knowledge graph. A question is parsed into a structured query containing a goal, candidate entities, player-level overrides and constraints such as acquisition method, excluded combat, area, price ceiling and access requirements. A query planner then chooses the relevant graph operation rather than relying on one first-match route.

Conversation context is now semantic rather than just a last-entity pointer. A bounded in-memory turn stack keeps recent subjects, goals, source roles and applicable constraints. This allows sequences such as `How do I get Green Leaf Seeds?` → `Any ways other than combat?` → `Which source is available first?` → `Where is the farmer?` while preserving the distinction between a Farmer as a pickpocket source and a Farmer as a monster. Explicit new constraints can replace inherited ones, so `What about combat?` re-opens monster-drop routes.

The reasoning engine supports constrained acquisition discovery (`What can I steal at level 15 that gives seeds?`, `What can I buy in Everbrook under 100 coins?`), access-aware filtering, lowest documented skill-gate comparison, numeric shop-price comparison, recursive production expansion with cycle/gap protection, and downstream structured-use traversal. `Why?` exposes the Companion's explicit deterministic interpretation, constraints, conclusions, evidence and limits. It does not expose or depend on hidden model reasoning.

Qualitative requests such as `best`, `easiest` or `fastest` are not silently converted into a made-up ranking. When the data cannot support a universal ordering, the Companion asks for a measurable criterion such as non-combat, lowest documented skill requirement, buying or making. Exact combat calculations remain blocked until the underlying mechanics are verified.



## v2.0 unified conversation graph

This release adds `flatmmo-graph.json`, a derived relationship index over stable typed entities. The graph currently contains **1,574 nodes and 7,380 explicit relationships** across items, acquisition sources, monsters, quests, skills, areas, rooms, NPCs, shops, mechanics and rules. Acquisition actors are typed source nodes so a name such as `Farmer` does not silently collapse a pickpocket source, monster and NPC into one entity.

Conversation state is also redesigned around bounded semantic topic threads rather than a single `lastEntity`. Up to 12 recent threads can be retained in a live session, each with up to 36 semantic turns; optional local history replays up to 120 user questions after a reload. Explicit current language always beats memory. A short follow-up may inherit the active topic/constraints/result set, a clearly named new subject starts or activates the appropriate thread, and wording such as `back to Ent` can return to a parked thread.

Semantic repair is first-class. `No, I meant Mining, not the Ent`, `No, combat is fine; I meant without stealing`, and the two-step `That’s not what I meant` → `Gorilla drops, not its location` repair the previous interpretation rather than simply adding another unrelated query. Corrections are scoped to the relevant thread, so rejecting an interpretation does not permanently ban that entity from future questions.

The response layer acknowledges meaningful changes, corrections and deliberate topic returns in ordinary language. **Memory itself stays invisible by default:** the Companion should demonstrate continuity by answering correctly, not by announcing that it remembered, retained, inherited or reused a previous message. Context mechanics are surfaced only when the user explicitly asks `Why?`, performs a correction, or deliberately returns to an older topic. The goal is conversational presence without allowing tone to become factual authority.


## v2.1 language & conversation lexicon

v2.1 adds `flatmmo-language.json` as an interpretation-only language layer. It currently contains **20 English colloquial groups**, **46 FlatMMO-attested terms**, and **7 curated RuneScape/OSRS comparison responses**. The language file is deliberately not mechanics authority: it may tell the parser that `nah` is rejection, that `AFK` is normal FlatMMO/player vocabulary, or that a RuneScape Smithing comparison should invoke the Forging stock response, but it cannot create a recipe, requirement, skill alias or graph relationship.

FlatMMO terminology is attested from public web-visible sources including official update/news language, the community Stealing wiki, and public developer/community discussions. Those sources prove that players/developers use the wording; they do not replace the normal authority rules for game mechanics. Broader genre vocabulary is intentionally deferred so terms such as generic MMO jargon cannot accidentally overwrite official skill names.

Negation is resolved before fuzzy subject selection. Phrases such as `combat, not Bat` suppress the rejected Bat entity, and language-only glossary/comparison answers do not replace the active gameplay topic thread. User-stated skill facts can enrich an active problem such as Atlas Crown instead of automatically opening a new standalone skill topic.

Foreign-game language is quarantined. A question such as `Is Forging like Smithing in RuneScape?` uses a curated comparison answer while keeping `Forging` as the canonical FlatMMO name. Unlisted comparisons use a conservative fallback and never import foreign recipes, levels, rates, timings or unlocks.
