# FlatMMO Companion v2.1 — Regression Tests

These tests cover both the public AI grounding layer and the deterministic human Companion.

Canonical AI context:
`https://etherealaporia-alt.github.io/FlatMMO-Companion/flatmmo-context.json`

Human Companion:
`https://etherealaporia-alt.github.io/FlatMMO-Companion/`

Core rules for every test:
- Treat FlatMMO as an independent game. Do not fill gaps from RuneScape or another game.
- Prefer recorded mechanics before calculations, and calculations before recommendations.
- Preserve source conflicts and uncertainty instead of silently resolving them.
- Do not invent exact hit chance, damage rolls, DPS, kill time, survivability or recommended combat levels while those formulas remain unresolved.
- Player-aware answers may use only fields actually present in the loaded/manual snapshot. Missing bank, inventory, equipment, quest completion and other live state remain unknown.

# AI grounding / knowledge tests

## Resource-chain test
Prompt:
How many Iron Bars do I need for a full Iron armour set, and if I smelt every bar myself, how much Iron Ore and Coal is that? Separate sourced facts from your derived total.

Expected:
- 125 Iron Bars total.
- Each Iron Bar uses 1 Iron Ore + 1 Coal.
- Derived raw total: 125 Iron Ore + 125 Coal.

## Combat-style progression test
Prompt:
At Melee 25, which recorded swords, scimitars, maces, knives, spears and melee armour tiers can I equip? Keep each Melee equip requirement separate from any Forging/Crafting requirement.

Expected:
- Equip and production requirements remain distinct.
- No unsupported combat-performance estimate is added.

## Archery test
Prompt:
Explain the equipment required to attack with Archery. Then show bow, arrow and armour progression, separating Archery equip levels from Crafting levels and materials.

## Magic / Enchantment test
Prompt:
Explain what is required to make a Magic attack. Then distinguish Magic equip levels for staves/armour from Enchantment levels used to make orbs and mage armour.

## Skill visibility and naming test
Prompt:
List the currently represented FlatMMO skills. Then describe Enchantment, Farming, Brewing and Firemaking.

Expected:
- 18 structured skills are represented.
- Firemaking is the game-facing skill name.
- `Firemake` may appear only as the wiki/source-page name or provenance label.
- Summoning is not presented as a currently represented skill.

## Quest coverage test
Prompt:
How many quests are represented in this context, and why is that different from the 19 core quest records?

Expected:
- 21 named quests in the public context.
- 19 normalized core quest records.
- 2 conservative observation-backed placeholders: Feeding The Homeless and Atlas Crown.
- Their incomplete procedures/rewards remain explicitly incomplete rather than invented.

## Atlas Crown test
Prompt:
What requirements are currently verified for Atlas Crown?

Expected:
- Mining 40.
- Crafting 50.
- Procedure and rewards remain incomplete/unknown in the current Companion data.

## Feeding The Homeless test
Prompt:
What does the Companion currently know about Feeding The Homeless?

Expected:
- The quest exists.
- No skill level requirements are recorded from the live-game observation.
- Remembered/unverified procedure or reward details are not promoted to structured facts.

## Uncertainty test
Prompts:
- What is the Mangrove Staff accuracy? Mention any recorded source conflict.
- What Forging level makes an Iron Scimitar? Mention the recorded older-source conflict if relevant.

Expected:
- Conflicts are stated, not silently overwritten.

# Mechanics / calculation-readiness tests

## Sleep vs Run test
Prompt:
Explain Sleep Points and Run. Are they the same resource?

Expected:
- They are separate systems.
- Fresh account Sleep Points observed at 25/25.
- Fresh low-level Run observed at 200/200 steps.
- Many actions appear to cost 1 Sleep Point, but exact per-activity behavior remains incomplete.
- At 0 Sleep Points, XP gain stops; production availability at zero remains observation-backed/partial.

## Agility thresholds test
Prompt:
What does the Companion know about Run at Agility 20 and Agility 40?

Expected:
- Agility 20: unlimited running outside combat.
- Entering combat still cancels Run at Agility 20.
- Agility 40: running during combat is allowed.
- Exact Agility 1–19 maximum-step progression remains unknown.

## Unsupported combat calculation test
Prompt:
A gorilla has these recorded stats and my character has these recorded combat levels. What is my exact hit chance, DPS, kill time, survival chance and recommended combat level?

Expected:
- The answer refuses to manufacture exact values.
- It may compare recorded stats/weaknesses qualitatively.
- It explicitly identifies the missing combat formulas.

# World / room model tests

## Everbrook room test
Prompt:
List the documented places in Everbrook where I can sleep. Name the internal room/sub-location rather than only saying Everbrook.

Expected:
- Cow Farm farmhouse.
- Mayor's House.
- Fisherman's Shop.
- Inside Chef's House.

## Functional NPC / travel test
Prompt:
I'm in Everbrook and want to get to Omboko. Which NPC handles that route, where are they, and what coin requirement is documented?

Expected:
- Ned the Boat Guy at Everbrook Docks.
- Hold 25 Coins.

## Bank + shop distinction test
Prompt:
In Everbrook, distinguish the East Town Square from the Bank and Fisherman's Shop. Which of those rooms actually contains the documented bed?

Expected:
- East Town Square contains entrances.
- Fisherman's Shop contains a documented bed.
- Bank is a separate interior.

## Thieves Hideout room test
Prompt:
Where are the beds inside Thieves Hideout, and how many are documented?

Expected:
- First interior room named Thieves Hideout.
- 4 documented beds.

## Mystic Vale services test
Prompt:
Where is the documented bed in Mystic Vale? Where are the Magic Shop, General Supply Shop and Unpowered Orb digging location?

## Frostvale beds test
Prompt:
Name every documented Frostvale bed location in this dataset and identify which rooms are cold-safe.

## Navigation uncertainty test
Prompt:
Give me the full internal-room route through the Desert.

Expected:
- State that Desert room coverage is partial.
- Do not invent a route or room adjacency.

## Area vs room test
Prompt:
Is "Ghost Mansion Bank" the same thing as the whole Ghost Mansion area? Explain the hierarchy and list the services documented in the Bank room.

# Entity / relationship graph tests

## Quest-room linking: Sewer Doll
Prompt:
Give me the Sewer Doll quest step-by-step. For each step, name the exact internal room when the dataset has one.

Expected:
- Cemetery -> Sewer Gold Ore -> Cemetery.
- No invented intermediate room.

## Quest-room linking: Mount Frostvale
Prompt:
Where exactly do I go for each Mount Frostvale quest step?

Expected:
- FrostBoot links to Frostvale River.
- Mayor interactions link to Mayor's House.
- Final step spans River and Northern Entrance.

## Partial quest location test
Prompt:
Give me exact room-by-room directions for Desert Island.

Expected:
- Explain that Desert room coverage is partial and most steps are only area-linked.
- Do not invent room IDs.

## Monster-room test
Prompt:
Where exactly are Giant Spiders documented?

Expected:
- `sewer.giant_spiders` and `beach.quicksand_giant_spiders` are exact current room-page links.
- Preserve the bootstrap monster record's broad Sewer area label as a retained cross-source disagreement with the Beach link.

## Monster source conflict test
Prompt:
Where is Seagull?

Expected:
- Bootstrap monster record says Beach.
- Exact current room-page evidence links Seagull to Dock Haven Seagulls / Water Spirit.
- State the disagreement rather than silently overwriting either source.

## Unlinked monster test
Prompt:
Where exactly can I find Dust Devil?

Expected:
- Report the broad source area: Desert.
- Say there is no exact linked room in the current dataset.
- Do not invent a Desert room.

## Resource node test: Gold Ore
Prompt:
List the exact rooms with structured Gold Ore nodes.

Expected:
- Sewer Gold Ore.
- Beach Quicksand Giant Spiders.

## Resource node test: Graphite
Prompt:
Where is Graphite explicitly indexed, and what Mining requirement is attached when documented?

Expected:
- Volcano Graphite Room: Graphite with Mining 70.
- Lava Enchantment Altar also records Graphite, but no extra level is invented for that node.

## Resource node test: Unpowered Orb
Prompt:
Where can I dig Unpowered Orbs and what tool is explicitly documented?

Expected:
- Mystic Vale Orb Pile.
- Shovel.

## Bed uncertainty test
Prompt:
A room has bedCount 0. Does that prove there is no bed?

Expected:
- No.
- `bedStatus=not_documented` means the dataset has not documented a bed there.

# Human Companion v1.7.1 tests


## Conversational query-engine tests

These tests verify that the human Companion accepts ordinary phrasing rather than requiring one exact command form.

### Collection questions
Prompts:
- `How many quests are there?`
- `List the skills.`

Expected:
- 21 quests, with the 19-core + 2 observation-backed distinction preserved.
- 18 structured skills, including Firemaking and excluding Summoning.

### Resource/acquisition phrasing
Prompts:
- `Where can I mine graphite?`
- `How do I get green leaf?`

Expected:
- Graphite reports the structured Volcano resource locations and Mining 70 only where explicitly documented; Volcanic Rocky may also appear as a monster-drop source.
- Green Leaf reports recorded monster-drop sources rather than returning a generic monster stat card.

### Exact place over generic service
Prompts:
- `Where is the Magic Shop?`
- `Where can I bank in Everbrook?`

Expected:
- Magic Shop resolves to Mystic Vale → Magic Shop, not a list of every shop.
- Everbrook banking resolves to the documented Everbrook Bank room/service.

### Natural travel question
Prompt:
`How do I get to Omboko from Everbrook?`

Expected:
- Everbrook → Omboko by boat from Everbrook Docks.
- Hold 25 Coins.
- Do not invent undocumented room-to-room walking directions.

### Inline player levels
Prompt:
`I'm Mining 40 and Crafting 48. Can I do Atlas Crown?`

Expected:
- Mining 40 passes.
- Crafting 50 fails by 2 levels.
- Inline levels apply only to this answer and do not silently replace the saved player snapshot.
- Unknown procedure/reward/player-state fields remain unknown.

### Follow-up context
Prompts in sequence:
1. `What does a gorilla drop?`
2. `Where is it?`

Expected:
- The second prompt resolves `it` to Gorilla.
- The location answer uses exact room links where available.

### Alternative-source follow-up / whole-word entity regression
Prompts in sequence:
1. `Where can I get green leaf seeds?`
2. `Any ways other than combat?`

Expected:
- The second prompt remains about Green Leaf Seeds.
- The word `combat` must not resolve the monster Bat.
- If no non-combat source is structured, say that no non-combat source is currently recorded; do not claim none exists in FlatMMO.
- Do not repeat monster drops when the user explicitly asks for a non-combat alternative.

### Multi-source acquisition index
Prompts:
- `How do I get Paper?`
- `Where can I get Stone Boots?`
- `How do I get a Cactus Seed?`
- `How do I make an Iron Bar?`

Expected:
- Paper reports the Omboko Paper Maker service and its documented 100 Bamboo Strips + 1,000 Coins requirement.
- Stone Boots reports both the explicit Hell shop source and the recorded Hell Goblin monster drop.
- Cactus Seed reports the Desert Temple 2 quest reward.
- Iron Bar reports the structured Forging 5 production recipe: 1 Iron Ore + 1 Coal.
- Generic shop labels are not treated as proof that a specific item is sold there.

### Material expansion
Prompt:
`How many Iron Bars do I need for full Iron Armour, and if I smelt them myself how much ore and coal?`

Expected:
- 125 Iron Bars.
- Expanded known recipe total: 125 Iron Ore + 125 Coal.
- Equip and Forging requirements remain separate from the material calculation.

### Skill progression phrasing
Prompt:
`At Melee 25 what can I equip?`

Expected:
- Return structured Melee equipment unlocked at or below 25.
- Do not convert production requirements into equip requirements.

### Unsupported combat maths in natural language
Prompt:
`What combat level should I be before fighting a gorilla and what exact DPS will I do?`

Expected:
- Recorded Gorilla facts may be discussed.
- Exact DPS/recommended level remain blocked because the formulas are unresolved.

### Ambiguity/unknown behaviour
Prompt:
`What's the best thing?`

Expected:
- Do not manufacture an interpretation or recommendation.
- Ask for or suggest a more specific FlatMMO entity/goal.

These tests apply to the deployed deterministic human UI rather than an external AI reading the context file.

## Cold-start test
Steps:
1. Clear site/browser data or use **Clear local session**.
2. Reload the Companion.

Expected:
- Knowledge loads normally without requiring saved browser state.
- No player is assumed.
- The assistant remains usable for non-player-specific queries.

## Manual skill-list test
Steps:
1. Open **Enter skill levels**.
2. Inspect the fields.

Expected:
- 18 skill fields.
- Firemaking is present.
- Summoning is absent.
- Unknown skills can be left blank.

## Firemaking readiness regression
Steps:
1. Enter Crafting 5 and Firemaking 30 manually.
2. Ask: `Can I do Healing Torches?`

Expected:
- Crafting 5 is recognized as a skill requirement.
- Firemaking 30 is recognized as a skill requirement.
- `Piece of Paper` and `42 Normal Logs for the initial documented route` are not misclassified as skills; their ownership remains unknown with the current player snapshot.

## Legacy Firemake cache compatibility
Setup:
Use a previously saved pre-v1.7 manual snapshot whose skill key is `firemake`, if one exists.

Expected:
- It is displayed/used as Firemaking.
- Opening the manual form shows the saved level in the Firemaking field.
- A subsequent manual save writes the canonical Firemaking field/key.

## Atlas Crown readiness test
Steps:
1. Enter Mining 40 and Crafting 50 manually.
2. Ask: `Can I do Atlas Crown?`

Expected:
- Both known skill requirements pass.
- The Companion does not claim knowledge of inventory, quest completion, access state, procedure or rewards that it does not have.

## Partial manual snapshot test
Steps:
1. Enter only Mining 40.
2. Ask: `Can I do Atlas Crown?`

Expected:
- Mining 40 passes.
- Crafting 50 is reported as unavailable/unknown rather than assumed to be 1 or 0.

## Non-skill requirement parsing test
Prompts after loading any manual snapshot:
- `Can I do Lost Cat?`
- `Can I do Shrimp Sandwich?`
- `Can I do Mount Frostvale?`

Expected:
- Quantities such as `1 Milk Bucket`, `5 Cooked Shrimp`, `100 Oak Logs`, etc. are not interpreted as skill-level requirements.
- Item ownership remains unknown until inventory/bank data exists.

## Same-player refresh-failure test
Steps:
1. Have a snapshot for a username loaded or cached.
2. Trigger a public-profile refresh in an environment where the direct browser fetch fails.

Expected:
- The prior snapshot is retained only for the same username.
- Original snapshot time/source remains visible.
- The UI marks the refresh as failed / levels potentially outdated.

## Cross-player isolation test
Steps:
1. Load or manually enter levels for Player A.
2. Edit the username to Player B before loading Player B.

Expected:
- Player A's levels disappear immediately.
- Player A's levels are never reused for Player B.

## Portable-link test
Steps:
1. Set a username and create/copy the portable link.
2. Inspect/open it in a clean browser context.

Expected:
- Link contains only `#player=<username>`.
- Manual skill levels are not encoded in the URL.
- The destination attempts to load public stats; if unavailable it fails cleanly and offers manual entry.

## Manual snapshot persistence test
Steps:
1. Enter manual skill levels and reload in a browser where localStorage works.

Expected:
- Manual levels may restore from localStorage and remain clearly labelled user-entered/unverified.
- This persistence is a convenience only; clearing storage produces a harmless cold start.

## What-should-I-do-next test
Steps:
1. Load or enter a partial skill snapshot.
2. Ask: `What should I do next?`

Expected:
- Suggestions are deterministic and stats-only.
- Nearby equipment/crafting unlocks may be shown from known levels.
- Skill-ready quests may be shown only from structured skill requirements.
- The Companion explicitly does not pretend to know bank, inventory, equipment, quest completion or access state.

## Combat recommendation guardrail test
Prompt:
What combat level should I be before fighting a gorilla, and what exact DPS will I do?

Expected:
- No exact recommended level or DPS is invented.
- Recorded monster/player facts may be compared.
- Missing combat formulas are stated as the blocker.


# Human Companion v1.8 item-knowledge tests

## Green Leaf Seeds non-combat follow-up
Prompts in sequence:
1. `Where can I get green leaf seeds?`
2. `Any ways other than combat?`

Expected:
- First answer may include Silkfang, Farmer and Master Farmer monster drops where recorded.
- It also includes the **Farmer pickpocket** source at Stealing 10.
- The follow-up keeps Green Leaf Seeds as the subject and excludes monster-drop routes.
- The Farmer pickpocket route remains, with the current rarity label Uncommon / 1 in 100.

## Shop-specific acquisition
Prompt:
`Where can I buy a shovel?`

Expected:
- Return explicit shop rows, including 24-Coin Shovel rows where documented.
- Do not substitute monster drops or pickpocket sources when the user specifically asks to buy.

## Shop inventory
Prompt:
`What does the Omboko shop sell?`

Expected:
- Return the explicit Omboko General Store inventory from item rows (Bamboo, Matches, Banana, Deep Jungle Map, Machete, Grass Badge, Omboko Axe, Paper).
- Preserve zero-stock information for Omboko Axe rather than implying current availability.
- Do not include General Store inventories from Everbrook, Mystic Vale or Frostvale in the Omboko-specific answer.

## Item uses
Prompt:
`What can I make with Graphite?`

Expected:
- Report Graphite Bucket as a structured Crafting use requiring 10 Graphite at Crafting 70.
- Do not confuse “where to get Graphite” with “what Graphite is used for.”

## Multi-source Stardust
Prompts:
- `How do I get Stardust?`
- `What is Stardust used for?`

Expected:
- Acquisition answer can combine Farming, Stealing/chests, monster drops and gem-to-Stardust conversions where structured.
- Use answer lists structured Enchantment/equipment recipes and does not invent unrecorded uses.

## Stealing progression
Prompt:
`Stealing 20, what can I steal?`

Expected:
- Show item-specific Stealing activities at or below level 20, including Citizen, Farmer, Everbrook Stall, Omboko Stall and eligible one-time chests.
- Treat this as an unlock/source lookup, not an XP-rate recommendation.

## Unknown source values
Prompt:
`What is the exact chance to get Paper from the Omboko Stall?`

Expected:
- The current stall table does not specify that exact chance; keep it unknown.
- Do not borrow the chance from another stall/item.

## Multi-output recipe quantities
Prompts:
- `How do I make Stardust with Crafting?`
- `How many Arrow Shafts do different logs make?`

Expected:
- Crafting 80 converts 1 Magic Logs into 100 Stardust.
- Arrow Shaft recipes preserve their different output quantities, including both Cactus Logs and Blessed Logs producing 16 shafts.
- Do not collapse alternative recipes merely because level/output quantity match.

# Human Companion v2.0 unified-conversation tests

These tests exercise the deployed deterministic reasoning layer. They are intentionally multi-turn where conversation state matters.

## Constraint inheritance and source-role context
Prompts in sequence:
1. `How do I get Green Leaf Seeds?`
2. `Any ways other than combat?`
3. `Which source is available first?`
4. `Where is the farmer?`

Expected:
- Turn 1 shows the documented pickpocket and monster-drop routes.
- Turn 2 preserves Green Leaf Seeds as the subject and excludes monster drops.
- Turn 3 inherits the non-combat constraint and identifies Farmer pickpocketing at Stealing 10 as the lowest documented skill gate among the remaining routes.
- Turn 4 resolves the Farmer as the referenced pickpocket source at Everbrook → Farm, rather than silently switching to the monster named Farmer.

Then ask: `What about combat?`

Expected:
- The explicit new method re-opens monster-drop routes instead of inheriting the old non-combat exclusion.

## Access-condition reasoning
Prompt:
`What can I steal at level 40 without combat?`

Expected:
- Skill-eligible Stealing routes may be shown.
- A route whose documented access condition requires killing/defeating a guard is excluded by the non-combat constraint even though the acquisition method itself is Stealing.

## Stated-level blocking
Prompt:
`How do I get Green Leaf Seeds without combat at Stealing 5?`

Expected:
- Farmer pickpocketing remains the documented non-combat item-specific route.
- It is marked blocked because it requires Stealing 10 and the question states Stealing 5.
- No monster route is used to bypass the constraint.

## Constrained graph discovery
Prompts:
- `What can I steal at level 15 that gives seeds?`
- `What can I buy in Everbrook under 100 coins?`

Expected:
- The first query searches item acquisition relationships, filters to Stealing sources at/below the stated level where the skill gate is known, and matches seed items.
- The second query filters explicit shop rows by Everbrook and numeric Coin prices below the requested cap.
- Neither answer is an XP-rate or overall efficiency recommendation.

## Numeric comparison versus qualitative ranking
Prompts:
- `What is the cheapest way to buy Iron Scimitar?`
- `What is the easiest way to get Green Leaf Seeds?`

Expected:
- The first may compare explicit numeric shop prices and reports Donny's recorded 2,160 Coin Iron Scimitar price, while keeping access/travel/stock as separate considerations.
- The second does not invent a universal definition of easiest; it asks for a measurable criterion such as lowest documented skill requirement, non-combat, buying or making.

## Price-cap filtering
Prompts:
- `Can I buy Iron Scimitar under 2000 coins?`
- `Can I buy Iron Scimitar under 3000 coins?`

Expected:
- The 2,000 Coin query has no documented shop route matching the cap.
- The 3,000 Coin query can return Donny's 2,160 Coin route.
- A failed filter is described as no documented matching route, not proof that the game contains none.

## Recursive production planning
Prompts:
- `How do I make Iron Bar from scratch?`
- `How do I make Iron Scimitar from scratch?`

Expected:
- Iron Bar expands to Forging 5, 1 Iron Ore and 1 Coal Ore.
- Iron Scimitar expands its documented recipe but leaves Iron Blade as an explicit knowledge gap if the current graph has no recipe/acquisition source for that intermediate item.
- Recursive expansion never invents a missing sub-recipe.

## Downstream use traversal
Prompt:
`What can Graphite lead to?`

Expected:
- Traverse structured use relationships and include Graphite → Graphite Bucket.
- Do not turn the relationship traversal into an unsupported value/worth recommendation.

## Why/explainability
Prompts in sequence:
1. `Can I do Atlas Crown with Mining 40 and Crafting 48?`
2. `Why?`

Expected:
- First answer: Mining 40 passes; Crafting 50 fails by 2.
- `Why?` explains the explicit deterministic interpretation, stated levels, requirement comparison, evidence/limits and does not expose hidden model chain-of-thought.

## Existing calculation and combat guardrails remain intact
Prompts:
- `How many Iron Bars do I need for full Iron Armour, and if I smelt them myself how much ore and coal?`
- `What combat level should I be before fighting a gorilla and what exact DPS will I do?`

Expected:
- Full Iron Armour remains 125 Iron Bars → 125 Iron Ore + 125 Coal under the documented recipe expansion.
- Exact DPS/recommended combat level remain blocked because the combat formulas are unresolved.



# v2.0 topic-thread / semantic-repair tests

## Explicit-current-subject priority
Conversation:
1. `Tell me about Ent`
2. `How does Mining speed work?`
3. `What about level 40?`

Expected:
- Turn 2 starts/activates a Mining-mechanics thread and does not carry Ent into the answer.
- Turn 3 remains in the Mining thread unless clarification is genuinely needed.
- Remembered Ent context may not replace the explicitly stated Mining subject.

## Park and return to a topic
Conversation:
1. `Tell me about Ent`
2. `How does Mining speed work?`
3. `Back to Ent — where is it?`

Expected:
- Mining does not delete the Ent thread.
- Turn 3 returns to the Ent thread and uses Ent location data.
- The response may acknowledge the return naturally.

## Direct semantic repair
Conversation:
1. `Tell me about Ent`
2. `What happens at level 40?`
3. `No, I meant Mining, not the Ent.`
4. `What about level 50?`

Expected:
- Turn 3 rejects the mistaken Ent interpretation and re-runs turn 2 as a Mining-level question.
- It does not treat the correction as a brand-new unrelated query.
- Turn 4 stays with Mining.
- The rejected Ent interpretation is scoped to that repair and does not permanently ban Ent.

## Two-stage repair failsafe
Conversation:
1. `What does a gorilla drop?`
2. `Where is it?`
3. `That’s not what I meant.`
4. `Gorilla drops, not its location.`

Expected:
- Turn 3 asks what the user meant instead rather than guessing again.
- Turn 4 repairs the previous question and returns Gorilla drops.

## Constraint repair
Conversation:
1. `How do I get Green Leaf Seeds without combat?`
2. `No, combat is fine. I meant without stealing.`
3. `Why?`

Expected:
- Turn 2 removes the non-combat constraint, excludes Stealing routes, and returns matching combat routes if documented.
- `No` is interpreted as a discourse correction marker, not as `no combat`.
- Turn 3 explains the corrected constraint set.

## Result-set continuity
Conversation:
1. `What can I buy in Everbrook under 100 coins?`
2. `Only food.`
3. `Which is cheapest?`
4. `Actually only bread.`

Expected:
- Turn 2 filters the previous candidate set rather than starting a new search.
- Turn 3 ranks the filtered set by recorded numeric price only.
- Ranking does not destroy the underlying candidate set needed for later refinement.
- Turn 4 narrows the active set to Bread rather than opening a generic Bread article.

## Durable user facts vs hypothetical levels
Conversation:
1. `I am Mining 40 and Crafting 48. Can I do Atlas Crown?`
2. `What if my Crafting was 50?`
3. `What is my Crafting level?`

Expected:
- Turn 1 remembers Mining 40 and Crafting 48 as conversation-supplied player facts.
- Turn 2 uses Crafting 50 for that hypothetical answer while retaining Mining 40.
- The hypothetical does not overwrite the durable Crafting 48 fact.
- Turn 3 reports Crafting 48 unless the user has explicitly updated it.

## Explicit update to a user fact
Conversation:
1. `I have Stealing 5.`
2. `Actually I have Stealing 12.`
3. `What is my Stealing level?`

Expected:
- The explicit correction/update replaces the stored conversation fact with 12.

## Coordinated negation
Prompt:
`How do I get Green Leaf Seeds without combat or stealing?`

Expected:
- Both combat and Stealing acquisition groups are excluded.
- If no source remains, the Companion says none is documented under those constraints rather than claiming the game has none.

## Same-name role safety
Conversation:
1. `How do I get Green Leaf Seeds?`
2. `Any ways other than combat?`
3. `Where is the Farmer?`

Expected:
- If the preceding source is the Farmer pickpocket route, `Farmer` remains a typed source-role reference.
- It must not silently switch to the Farmer monster just because the display name matches.

## Silent-memory presentation
Conversation:
1. `Tell me about Ent`
2. `How does Mining speed work?`
3. `What about level 40?`

Expected:
- Turn 2 switches cleanly to Mining and does not mention that Ent was parked, remembered or discarded.
- Turn 3 uses the Mining context naturally without saying that it is remembering the last message, keeping the same topic, inheriting context, or reusing a previous turn.
- Context should be visible through continuity, not through implementation narration.
- Explicit `Why?`, a user correction, or `Back to ...` may naturally refer to the relevant earlier turn/topic because the user has asked for that relationship explicitly.

## Unified relationship graph integrity
Expected machine checks:
- Every edge `from` and `to` resolves to a graph node.
- Node IDs are unique.
- Edge IDs are unique.
- Acquisition-source nodes remain typed separately from monsters/NPCs/shops with the same display name.
- Reverse relationships required by the published graph are present/materialized.
- The intentionally unresolved text-only material reference remains unresolved instead of becoming a fabricated item.


# v2.1 language / colloquial regression tests

## Beginner glossary
Prompts:
- `What is a skill?`
- `What does XP mean?`
- `What does equip mean?`
- `What is a drop?`
- `What does AFK mean?`
- `What is a tick?`
- `What is BiS?`

Expected:
- Give a plain-language definition from the curated language layer.
- Do not invent mechanics that are not established in FlatMMO data.
- A glossary-only answer must not replace the active gameplay topic thread.

## Negated entity suppression
Prompt:
`I am talking about combat, not Bat.`

Expected:
- Answer the Combat/mechanics subject.
- Do not return Bat or Fighting Bat merely because the rejected word is an exact entity name.

## FlatMMO-attested terminology
Prompts:
- `What does AFK mean here?`
- `What does PvM mean?`
- `What are hiscores?`
- `What does OSAAT mean?`
- `What does bankless mean?`

Expected:
- Explain the term using the curated lexicon and cited FlatMMO usage where available.
- Terminology evidence is language evidence only; do not infer extra mechanics from the term itself.

## RuneScape comparison quarantine
Prompts:
- `Is Forging like Smithing in RuneScape?`
- `Is Stealing basically Thieving in OSRS?`
- `Is Worship like Prayer in RuneScape?`
- `Is the Global Market like the Grand Exchange in RuneScape?`
- `Is Mining like Mining in RuneScape?`

Expected:
- Use the curated stock comparison where one exists; otherwise use the conservative fallback.
- Keep official FlatMMO names canonical.
- Do not import RuneScape recipes, success rates, XP rates, unlock levels, timings or mechanics.
- Foreign terms must not be added to the FlatMMO entity alias catalog.

## Active-problem skill fact enrichment
Conversation:
1. `Atlas Crown requirements?`
2. `I am Mining 40 and Crafting 48.`
3. `Am I ready?`

Expected:
- Turn 2 enriches the Atlas Crown readiness problem rather than changing the topic to Crafting.
- Turn 3 continues Atlas Crown and reports the recorded skill gap.

## Green Leaf Seeds shorthand/skill enrichment
Conversation:
1. `Green Leaf Seeds. Non-combat source?`
2. `I am Stealing 12.`
3. `Can I get them now?`
4. `Without fighting, which source is available first?`

Expected:
- Stay on Green Leaf Seeds throughout.
- Farmer pickpocket at Stealing 10 is a documented non-combat route and is available at stated Stealing 12.
- The earliest-source route must not throw if the subject was inherited from conversation context.

## Ordinary why vs explicit trace
Conversation:
1. `What are Sleep Points?`
2. `Why do I care about them?`

Expected:
- Turn 2 answers the Sleep Points question in ordinary language.
- It must not invoke the special deterministic `Why?` trace merely because the sentence starts with `why`.

## Price-result refinement after ranking
Conversation:
1. `What can I buy in Everbrook under 100 coins?`
2. `Only food.`
3. `Which is cheapest?`
4. `Under 50 coins.`

Expected:
- All turns operate on the same result-query definition.
- `coins` in the numeric price constraint must not hijack the subject as the Coins item.

## Repair ordering
Conversation:
1. `Where is Bat?`
2. `No, not Bat, Gorilla.`
3. `Where is it?`

Expected:
- Turn 2 rejects Bat and replaces the subject with Gorilla.
- Turn 3 stays on Gorilla.
