/* Run with: node conversation-regression.cjs (Node 18+). No dependencies. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const ctx=vm.createContext({console,structuredClone,URL,Date,setTimeout,clearTimeout});
for(const f of ['companion-engine.js','companion-conversation.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,f),'utf8'),ctx);
ctx.fixture=Object.fromEntries(['monsters','quests','skills','areas','equipment','items','graph','language','mechanics','rules','overrides'].map(k=>[k,JSON.parse(fs.readFileSync(path.join(__dirname,'flatmmo-'+k+'.json')))]));
vm.runInContext('state.data=fixture;for(const q of state.data.overrides.quests||[])if(!state.data.quests.records.some(x=>x.name===q.name))state.data.quests.records.push(q);state.data.equipmentFlat=flattenEquipment(state.data.equipment);buildIndexes();state.ready=true;',ctx);
const read=s=>vm.runInContext(s,ctx);
const ask=q=>{ctx.input=q;return read('answer(input)')};
const plain=q=>ask(q).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
function reset(){read('state.conversation={threads:[],activeThreadId:null,nextThreadId:1,pendingRepair:null,turnSeq:0,userFacts:{skills:{}}};state.context={};state.contextStack=[];state.lastReasoning=null;state.lastQuery=null;')}
let passed=0;function test(name,fn){reset();try{fn();passed++;console.log('PASS '+name)}catch(e){console.error('FAIL '+name);throw e}}
function goal(g){assert.equal(read('conversationSession().lastInterpretation.goal'),g)}
function excludes(name){assert.equal(read(`activeOperation().query.entities.some(e=>norm(e.name)===${JSON.stringify(name)})`),false)}
test('semantic BiS action blocks ranking and avoids a fuzzy weapon',()=>{ask('What is BiS?');goal('glossary');assert.match(plain('Can you tell me the BiS melee weapon at level 30?'),/unresolved/);goal('combat_comparison');assert.equal(read('activeOperation().query.entities.some(e=>e.type==="equipment")'),false)});
test('drop probability beats glossary',()=>{ask('What is a drop rate?');assert.match(plain('What is the best drop rate for Green Leaf Seeds?'),/Silkfang.*1\/20/);goal('highest_drop_rate')});
test('threshold uses typed target; never equates unlock with certainty',()=>{assert.match(plain('When do I stop failing Farmer pickpockets?'),/documented level.*Stealing 10.*does not establish/);assert.equal(read('activeOperation().query.entities[0].role'),'pickpocket')});
test('hard entity replacement',()=>{ask('Tell me about Ent.');assert.match(plain('Actually Coal Ore.'),/Coal Ore/);excludes('ent');assert.match(plain('Where can I get it?'),/Coal Ore/)});
test('reject and replace preserves drops operation',()=>{ask('What does Bat drop?');assert.match(plain('No, not Bat, Gorilla.'),/Gorilla drops/);excludes('bat')});
test('ambiguous named source asks and accepts a typed correction',()=>{assert.match(plain('Where is Farmer?'),/one distinction/);assert.match(plain('No, the pickpocket one, not the monster.'),/Pickpocketing.*Farm/);assert.equal(read('activeOperation().query.entities[0].type'),'source_ref')});
test('actual levels corrected durably; hypothetical isolated',()=>{ask('I am Mining 40 and Crafting 48.');ask('No, make that Crafting 50.');ask('What if my Crafting was 60?');assert.equal(read('state.conversation.userFacts.skills.crafting.level'),50);assert.match(plain('What is my Crafting level?'),/50/)});
test('readiness hypothetical computes using preserved real levels',()=>{ask('Can I do Atlas Crown?');ask('I am Mining 40 and Crafting 48');assert.match(plain('What if my Crafting was 50?'),/On the recorded skill requirements, yes/);assert.equal(read('state.conversation.userFacts.skills.crafting.level'),48)});
test('production and style remain one operation',()=>{ask('Full Iron Armour from scratch. What do I need?');const id=read('state.conversation.activeThreadId');for(const q of ['Just the totals.','And the ore and coal?','Bottom line?','Numbers only']){const s=plain(q);assert.match(s,/Iron Ore: 125.*Coal Ore: 125/);assert.equal(read('state.conversation.activeThreadId'),id);assert.doesNotMatch(s,/125 crafts/)}assert.match(plain('More detail'),/125 crafts/)});
test('journey facets and direction are explicit',()=>{assert.match(plain('How do I get from Everbrook to Omboko?'),/Everbrook → Omboko.*Docks/);assert.match(plain('Cost?'),/Have 25 Coins.*not a confirmed charge/);assert.match(plain('Where from?'),/Docks/);assert.match(plain('Same thing, but Omboko to Everbrook?'),/Omboko → Everbrook.*Tuna Fishing/);assert.match(plain('Cost?'),/unknown.*free/)});
test('comparison followups never mutate game aliases or game topic',()=>{ask('Tell me about Ent');const id=read('state.conversation.activeThreadId');for(const q of ['Is Forging like Smithing in RuneScape?','So can I assume RuneScape recipes?','Does FlatMMO do that too?','Same growth times?']){ask(q);goal('foreign_comparison');assert.equal(read('state.conversation.activeThreadId'),id)}assert.equal(read('state.entityCatalog.some(e=>(e.aliases||[]).includes("smithing"))'),false)});
test('statement-shaped foreign comparisons quarantined',()=>{for(const q of ['In RuneScape an Iron Bar only needs Iron Ore. Same here?','Can I assume the same levels?','Does it work the same way?','Is it basically the GE?']){ask(q);goal('foreign_comparison')}});
test('glossary continuation preserves gameplay',()=>{ask('Tell me about Ent');const id=read('state.conversation.activeThreadId');for(const q of ['What does equip mean?','And requirements?','What about loot?']){ask(q);goal('glossary');assert.equal(read('state.conversation.activeThreadId'),id)}assert.match(plain('Where is Ent?'),/Omboko/)});
test('ordinary why is not explanation trace',()=>{assert.match(plain('Why do I care about Sleep Points?'),/XP gain stops/);assert.notEqual(read('conversationSession().lastInterpretation.goal'),'explain');assert.match(plain('Why?'),/Why I answered/)});
test('coordinated method exclusion and no quests persist',()=>{ask('Where can I get Green Leaf Seeds?');assert.match(plain('Without combat or stealing.'),/don’t have a documented acquisition route/);ask('No quests.');for(const method of ['monster_drop','pickpocket','stall','map_chest','rogue_chest','quest_reward'])assert.equal(read(`activeOperation().query.constraints.excludeMethods.includes('${method}')`),true)});
test('search is live and filters retained candidates',()=>{ask('What can I buy in Everbrook under 100 coins?');assert.ok(read('activeOperation().output.resultSet.length')>1);ask('Only seeds.');assert.equal(read('activeOperation().output.resultSet.length'),1);assert.match(plain('Which is cheapest?'),/Barley Seeds/)});
test('empty filtered search does not restore excluded candidates',()=>{ask('What can I steal at level 15 that gives seeds?');assert.match(plain('Without combat or stealing.'),/0 matching/);assert.equal(read('activeOperation().output.resultSet.length'),0)});
test('entity exclusion applies to acquisition actors',()=>{ask('Where can I get Green Leaf Seeds?');const s=plain('Anything except the Farmer.');assert.doesNotMatch(s,/Farmer —/);assert.match(s,/Silkfang/)});
test('parked operation returns after unrelated topics',()=>{ask('Full Iron Armour from scratch. What do I need?');ask('Tell me about Ent');ask('Tell me about Gorilla');ask('Back to Iron Armour');assert.match(plain('Just the totals'),/Iron Ore: 125.*Coal Ore: 125/)});
test('undo restores corrected user facts',()=>{ask('I am Crafting 48');ask('No, make that Crafting 50');ask('Scratch that');assert.equal(read('state.conversation.userFacts.skills.crafting.level'),48)});
test('script-shaped input is escaped',()=>{assert.doesNotMatch(ask('<img src=x onerror=alert(1)>'),/<img src=x/)});
test('singular/plural forms agree for full item lookups',()=>{
  for(const [a,b] of [['Unpowered Orb','Unpowered Orbs'],['Iron Bar','Iron Bars'],['Green Leaf Seeds','Green Leaf Seed'],['Bronze Knife','Bronze Knives'],['Green Leaf','Green Leaves'],['Oak Staff','Oak Staves'],['Bronze Axe','Bronze Axes'],['Damage Orb 1','Damage Orbs 1']]){
    reset();const one=plain('Where can I get '+a+'?');const name=read('activeOperation().query.entities[0].name');
    reset();const many=plain('Where can I get '+b+'?');assert.equal(read('activeOperation().query.entities[0].name'),name,b);assert.equal(many,one,b);
    ctx.lookup=b;assert.equal(read('itemRecord(lookup)?.name'),a);
  }
});
test('bare plural, hard correction, and return retain canonical subject',()=>{
  assert.match(plain('unpowered orbs'),/Unpowered Orb/);
  ask('Tell me about Ent');assert.match(plain('Actually unpowered orbs'),/Unpowered Orb/);excludes('ent');
  ask('Tell me about Gorilla');assert.match(plain('Back to unpowered orbs'),/Back to Unpowered Orb/);
});
test('plural negation suppresses the canonical item',()=>{
  assert.match(plain('Tell me about Unpowered Orb'),/Unpowered Orb/);
  ask('No, not unpowered orbs, Iron Bars');excludes('unpowered orb');
  assert.equal(read('activeOperation().query.entities[0].name'),'Iron Bar');
});
test('canonical plural collision and unrelated names stay distinct',()=>{
  assert.equal(read('itemRecord("Promethium Arrow").name'),'Promethium Arrow');
  assert.equal(read('itemRecord("Promethium Arrows").name'),'Promethium Arrows');
  assert.equal(read('itemNameForms("Glass").join(",")'),'glass');
  assert.equal(read('itemNameForms("Atlas").join(",")'),'atlas');
  assert.equal(read('itemNameForms("Brass").join(",")'),'brass');
  assert.equal(read('resolveEntities("combat").some(e=>e.name==="Bat")'),false);
  assert.equal(read('state.entityCatalog.some(e=>(e.aliases||[]).includes("smithing"))'),false);
});
console.log(`${passed} conversation scenarios passed.`);
