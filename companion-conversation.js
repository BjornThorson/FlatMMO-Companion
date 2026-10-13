"use strict";

/* Conversation control owns interpretation and memory. The engine owns game facts.
 * No utterance, glossary entry or comparison is allowed to add a graph fact.
 * Classic scripts share lexical scope; no network service or build step is needed.
 */
function conversationSession(){
  const c=state.conversation;
  if(!c.gameplayContext)c.gameplayContext={}; // keyed by the existing bounded topic IDs
  if(!c.languageContext)c.languageContext={kind:null,expires:0};
  if(!c.clock)c.clock=0;
  if(!c.undo)c.undo=[];
  return c;
}
function emptyConstraints(){return {includeMethods:[],excludeMethods:[],excludedNames:[],areas:[],skillCaps:{},maxPrice:null,fromScratch:false,avoidCombat:false,avoidQuests:false,avoidSpending:false,onlyAccessible:false}}
function queryEnvelope(raw,goal,extra={}){return {raw,q:semanticEnglish(raw),intent:goal,goal,entities:[],overrides:{},constraints:emptyConstraints(),searchTerms:[],ambiguity:null,collection:null,directRule:null,move:"new",...extra}}
function activeOperation(){const c=conversationSession();return c.gameplayContext[c.activeThreadId]||null}
function languageMatches(q,kind){return (languageData().englishColloquialisms||[]).filter(e=>(!kind||e.kind===kind)&&(e.forms||[]).some(f=>hasWholePhrase(q,semanticEnglish(f))))}
function responseStyle(q){
  const entries=languageMatches(q,"answer_style");
  if(/\b(numbers only|just the numbers)\b/.test(q))return "numbers";
  if(/\bbottom line\b/.test(q))return "summary";
  if(entries.some(e=>e.semantic==="summary_or_totals"))return "totals";
  if(entries.some(e=>e.semantic==="simplify"))return "simple";
  if(entries.some(e=>e.semantic==="expand"))return "detail";
  return null;
}
function stripStyle(raw){let s=semanticEnglish(raw);for(const e of languageMatches(s,"answer_style"))for(const f of e.forms||[])s=phraseReplace(s,semanticEnglish(f),"");return s.replace(/\s+/g," ").trim()}
function semanticActions(q){return (languageData().semanticActions||[]).filter(a=>(a.forms||[]).some(f=>hasWholePhrase(q,f))&&(!a.modifiers||a.modifiers.some(m=>hasWholePhrase(q,m)))).map(a=>a.operation)}
function definitionEntry(raw,follow=false){
  let q=semanticEnglish(raw).replace(/^(?:please\s+)?(?:can you|could you)\s+(?:tell me|explain)\s+/,"");
  const match=q.match(/^(?:what (?:is|are)|what (?:does|do)|define|explain|what do you mean by)\s+(?:a |an |the )?(.+?)(?:\s+mean)?$/);
  let term=match?.[1];if(!term&&follow)term=q.replace(/^(?:and|what about|how about|and what about)\s+/,"");
  if(!term)return null;
  return glossaryEntries().find(e=>(e.forms||[]).some(f=>semanticEnglish(f)===term))||null;
}
function comparisonMatch(raw){
  const q=semanticEnglish(raw),c=conversationSession(),lc=c.languageContext;
  const fallback=languageData().foreignComparisonFallback||{};
  const explicitGame=[...(fallback.games||[]),...foreignComparisons().flatMap(e=>e.foreignAliases||[])].some(g=>hasWholePhrase(q,g));
  const continuation=lc.kind==="comparison"&&lc.expires>=c.clock&&/^(?:so|and|same|does|can|is|what about|how about|do)\b/.test(q)&&/\b(same|assume|too|that|it|recipes|levels|growth times|way)\b/.test(q);
  const foreignTerm=foreignComparisons().some(e=>(e.foreignTerms||[]).some(t=>hasWholePhrase(q,t)));
  if(!explicitGame&&!continuation&&!(foreignTerm&&/\b(like|basically|same|equivalent)\b/.test(q)))return null;
  const stock=foreignComparisons().find(e=>(e.foreignTerms||[]).some(t=>hasWholePhrase(q,t))&&(hasWholePhrase(q,e.flatmmoTerm)||explicitGame||/\b(basically|like)\b/.test(q)));
  if(stock&&!/\b(assume|same levels|same growth|recipes)\b/.test(q))return {kind:"stock",comparison:stock};
  return {kind:"fallback",answer:"No—another game's recipes, levels, growth times and combat rules do not establish how FlatMMO works. I can check the recorded FlatMMO recipe or rule if you name it. Anything missing stays unknown."};
}
function excludedEntityNames(raw){
  const q=semanticEnglish(raw),names=[];
  for(const e of state.entityCatalog||[]){
    for(const alias of [e.name,...(e.aliases||[])]){
      const n=norm(alias);if(n.length<2)continue;
      const rx=n.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
      if(new RegExp("\\b(?:not|except|excluding|without|other than|apart from|leave out|do not mean)\\s+(?:the\\s+)?"+rx+"\\b").test(q))names.push(norm(e.name));
    }
  }
  return unique(names);
}
function requestedRole(raw){
  const q=semanticEnglish(raw);
  const positive=q.replace(/\b(?:not|without|except)\s+(?:the\s+)?(?:monster|pickpocket|shop)(?:\s+one)?/g,"");
  if(/\bpickpocket(?:s|ing)?\b/.test(positive))return "pickpocket";
  if(/\b(?:monster|combat)\s+(?:one|version|source|drop)\b/.test(positive))return "monster_drop";
  if(/\bshop\s+(?:one|source)\b/.test(positive))return "shop";
  return null;
}
function typedSources(name,role){
  const nodes=graphNodesNamed(name,"acquisition_source").filter(n=>!role||n.role===role);
  return nodes.map(n=>{
    const a=(state.data.items.records||[]).flatMap(i=>i.acquisition||[]).find(a=>a.type===n.role&&norm(sourceActorName(a))===norm(n.name)&&(!n.area||norm(a.area)===norm(n.area)));
    if(!a)return null;
    const ref={name:n.name,role:n.role,method:n.role,source:a,area:n.area,id:n.id};
    return {type:"source_ref",name:n.name,role:n.role,obj:ref,source:a,area:n.area,score:200};
  }).filter(Boolean);
}
function explicitEntities(raw){
  const q=semanticEnglish(raw),excluded=excludedEntityNames(raw);
  const rows=resolveEntities(q,{limit:40}).filter(e=>!excluded.includes(norm(e.name))&&e.score>=115&&!(norm(e.name)==="coins"&&/\d+\s*coins?/.test(q)));
  // Exact multiword mentions beat nested names (Coal Ore beats Coal; Master Farmer beats Farmer).
  return rows.filter(e=>!rows.some(x=>norm(x.name)!==norm(e.name)&&hasWholePhrase(x.name,e.name)&&entityMentioned(q,x)));
}
function repairQuery(raw,desc){
  const previous=conversationSession().pendingClarification||activeOperation(),thread=activeThread();
  if(!previous)return queryEnvelope(raw,"repair_clarify",{repair:{needsReplacement:true}});
  const text=desc.replacement||"",role=requestedRole(raw),rep=explicitEntities(text);
  const named=rep.filter(e=>e.type!=="skill"||!Object.keys(extractStatedSkillLevels(raw)).length);
  let entities=named.length?named:previous.query.entities;
  if(role){const name=named[0]?.name||previous.query.entities[0]?.name;entities=typedSources(name,role)}
  const excluded=excludedEntityNames(raw);
  entities=entities.filter(e=>!excluded.includes(norm(e.name)));
  // Replacing the subject is a set replacement, never a score boost or appended sentence.
  const query={...previous.query,raw,q:semanticEnglish(text||raw),entities,ambiguity:null,threadId:thread?.id||null,move:thread?"repair":"new",contextUsed:true,constraints:structuredClone(previous.query.constraints),repair:{needsReplacement:false,rejectedEntities:previous.query.entities.filter(e=>!entities.some(x=>x.type===e.type&&norm(x.name)===norm(e.name)&&x.role===e.role)),replacement:text}};
  if(!entities.length||(!text&&!desc.reopen?.length))return {...query,goal:"repair_clarify",repair:{needsReplacement:true}};
  const intent=detectIntent(query.q,entities);
  if(intent!=="info"&&!/^(?:the )?(?:pickpocket|monster|shop) one/.test(query.q)){query.intent=intent;query.goal=inferGoal(query.q,intent,entities)}
  applyRepairConstraintPatch(query,desc);
  query.constraints.excludedNames=unique([...(query.constraints.excludedNames||[]),...excluded]);
  if(role&&query.goal!=="success_threshold"){query.goal="locate";query.intent="locate"}
  return query;
}
function interpretQuestion(raw){
  const c=conversationSession(),q=semanticEnglish(raw),style=responseStyle(q),op=activeOperation();
  if(/^(?:why|how come|why though|why is that|why was that|why so|why did you say that)$/.test(q))return queryEnvelope(raw,"explain");
  if(/^(?:scratch that|undo that|go back one|forget that bit|ignore that)$/.test(q))return queryEnvelope(raw,"undo");
  if((languageData().englishColloquialisms||[]).some(e=>e.semantic==="acknowledgement"&&(e.forms||[]).some(f=>q===norm(f))))return queryEnvelope(raw,"acknowledge");
  const comp=comparisonMatch(raw);if(comp)return queryEnvelope(raw,"foreign_comparison",{languageComparison:comp,style});
  const gl=definitionEntry(raw,c.languageContext.kind==="glossary"&&c.languageContext.expires>=c.clock);
  if(gl)return queryEnvelope(raw,"glossary",{glossary:gl,style});
  if(style&&!stripStyle(raw))return queryEnvelope(raw,"recompose",{style,operation:op,language:c.languageContext.expires>=c.clock?c.languageContext:null});
  const hypothetical=/\b(?:what if|suppose|imagine|if i had|if my|say i had|say i have|would be)\b/.test(q);
  const levels=extractStatedSkillLevels(raw),correctFacts=/^(?:no |nah |actually |make that |change that )/.test(q)&&Object.keys(levels).some(k=>c.userFacts.skills[k]);
  const asserted=Object.keys(levels).length&&(!hypothetical&&(/\b(?:i am|i have|my)\b/.test(q)||correctFacts));
  if(asserted){return queryEnvelope(raw,"assert_facts",{facts:levels,style})}
  // Returning restores the operation, not merely the old entity name.
  if(/\b(?:back to|return to|back on)\b/.test(q)){
    const t=recentThreads().find(t=>(t.topicEntities||[]).some(e=>entityMentioned(q,e)));
    const old=t&&c.gameplayContext[t.id];
    if(old)return {...old.query,raw,threadId:t.id,move:"return",style,ambiguity:null};
  }
  const constraintOnly=/^(?:without|except|anything except|no quests|no combat|no stealing|avoid|other than)\b/.test(q);
  const desc=constraintOnly?null:correctionDescriptor(raw);
  let query;
  if(desc){query=repairQuery(raw,desc)}
  else if(op&&op.model?.kind==="journey"&&/^(?:cost|how much|what does it cost|where from|where do i leave from)$/.test(q)){
    return queryEnvelope(raw,"operation_view",{operation:op,facet:/where/.test(q)?"departure":"cost",style});
  }else if(op&&op.model?.kind==="production"&&/^(?:and |what about |how about )?(?:the )?(?:ore and coal|coal and ore|raw materials|ingredients|materials|totals)$/.test(q)){
    return queryEnvelope(raw,"operation_view",{operation:op,facet:"totals",style:style||"totals"});
  }else if(op&&hypothetical){
    query={...op.query,raw,q,overrides:levels,constraints:{...structuredClone(op.query.constraints),skillCaps:levels},move:"continue",threadId:c.activeThreadId,ambiguity:null,hypothetical:true};
  }else{
    const newTopic=/^(?:new question|different question|moving on|never mind|nevermind|forget it)\b/.test(q);
    query=interpretQuestionCore(newTopic?q.replace(/^(?:new question|different question|moving on|never mind|nevermind|forget it)\s*/,""):raw,newTopic?{contextAllowed:false}:{});
    if(newTopic){query.move="new";query.entities=explicitEntities(query.q);c.pendingRepair=null}
    const explicit=explicitEntities(raw),role=requestedRole(raw);
    if(explicit.length&&!hypothetical){
      // An explicit subject excludes stale context and fuzzy partial entities.
      query.entities=explicit;
      query.intent=detectIntent(q,explicit);query.goal=inferGoal(q,query.intent,explicit);
      if(op&&/^(?:and|what about|how about|same thing|same again)\b/.test(q)&&query.intent==="info"){
        query.intent=op.query.intent;query.goal=op.query.goal;
      }
    }
    if(role){const name=explicit.find(e=>typedSources(e.name,role).length)?.name||op?.query.entities[0]?.name;query.entities=typedSources(name,role);query.ambiguity=null;if(query.entities.length){query.goal="locate";query.intent="locate"}}
    if(!explicit.length&&op&&/^(?:and at|at|and by) (?:level )?\d+$/.test(q)){
      const skill=op.query.entities.find(e=>e.type==="skill")?.name||Object.keys(op.query.constraints.skillCaps||{})[0];
      if(skill){query={...op.query,raw,q,overrides:{[norm(skill)]:Number(q.match(/\d+/)[0])},constraints:structuredClone(op.query.constraints),threadId:c.activeThreadId,move:"continue",hypothetical:true};query.constraints.skillCaps={...query.constraints.skillCaps,...query.overrides}}
    }
  }
  // Refinements retain the full live query/result, including method exclusions.
  if(op&&["search_acquisition","refine_result_set","rank_result_set_price"].includes(op.query.goal)&&/^(?:only|just|nothing but|without|except|no quests|anything except|under|below)\b/.test(q)&&!style){
    const entities=explicitEntities(raw);
    query={...query,goal:"refine_result_set",entities:op.query.entities,threadId:c.activeThreadId,move:"continue",contextUsed:true};
    query.constraints=inheritContextConstraints("and "+q,extractConstraints(raw,q,entities,extractStatedSkillLevels(raw)),activeThread(),true);
    query.searchTerms=searchTermsForQuery(q.replace(/\b(?:without|except|anything|no quests)\b/g,""),entities).filter(t=>!['not','quest','combat','stealing'].includes(t));
  }
  if(hypothetical&&!op&&Object.keys(levels).length){query.goal="hypothetical_level";query.overrides=levels}
  if(constraintOnly&&op&&!op.output.resultSet?.length){
    query={...op.query,raw,q,entities:op.query.entities,threadId:c.activeThreadId,move:"continue",contextUsed:true,ambiguity:null};
    query.constraints=inheritContextConstraints("and "+q,extractConstraints(raw,q,explicitEntities(raw),{}),activeThread(),true);
  }
  query.style=style;query.hypothetical=!!(query.hypothetical||hypothetical);
  query.constraints.excludedNames=unique([...(query.contextUsed?op?.query.constraints.excludedNames||[]:[]),...excludedEntityNames(raw)]);
  query.entities=query.entities.filter(e=>!query.constraints.excludedNames.includes(norm(e.name)));
  if(/\bnot (?:the )?monster\b/.test(q))query.entities=query.entities.filter(e=>e.type!=="monster"&&e.role!=="monster_drop");
  const actions=semanticActions(q);query.semanticActions=actions;
  if(actions.includes("combat_comparison")||/\b(best|strongest)\b.*\b(weapon|armour|armor|melee|archery|magic)\b/.test(q))query.goal="combat_comparison";
  if(actions.includes("probability_comparison"))query.goal="highest_drop_rate";
  if(actions.includes("success_threshold")){
    query.goal="success_threshold";const named=explicitEntities(raw);const name=named.find(e=>typedSources(e.name,"pickpocket").length)?.name||op?.query.entities[0]?.name;
    query.entities=typedSources(name,requestedRole(raw)||"pickpocket");query.ambiguity=null;
  }
  if(query.intent==="travel"||query.goal==="travel"){
    const areas=query.entities.filter(e=>e.type==="area").sort((a,b)=>q.indexOf(norm(a.name))-q.indexOf(norm(b.name)));
    if(areas.length>=2){query.entities=areas;query.goal="travel";query.intent="travel"}
  }
  // Avoid promoting generic category words to arbitrary equipment/monster names.
  if(!explicitEntities(raw).length&&!query.contextUsed&&!actions.length&&query.entities.every(e=>e.score<115))query.entities=[];
  if(!desc)query.ambiguity=semanticAmbiguity(query.entities,query.goal);
  if(query.goal==="locate"&&!requestedRole(raw)&&!desc){
    const name=explicitEntities(raw)[0]?.name,roles=name?typedSources(name):[];
    if(new Set(roles.map(e=>e.role)).size>1){query.ambiguity={options:roles,reason:`Do you mean ${name} as ${roles.map(e=>title(e.role)).join(" or ")}?`};query.entities=roles}
  }
  return query;
}

function productionModel(query){
  const e=query.entities.find(e=>e.type==="equipment"&&e.obj?.obj?.setMaterialTotals)||query.entities.find(e=>["item","equipment","resource"].includes(e.type));
  if(!e)return null;
  const equip=e.type==="equipment"?e.obj:(state.data.equipmentFlat||[]).find(x=>norm(x.name)===norm(e.name));
  const set=equip?.obj?.setMaterialTotals;
  let branches=[];
  if(set){
    const children=Object.entries(set).map(([name,n])=>expandRecipeBranch(title(name),Number(n)));
    const totals={},gaps=[];for(const child of children)collectRecipeLeaves(child,totals,gaps);
    branches=[{totals,gaps,children,direct:set}];
  }else{
    const item=itemRecord(e.name);if(!item)return null;
    branches=recipeSources(item).map(recipe=>{const node=expandSpecificRecipe(item,1,recipe,{depth:0,maxDepth:8,seen:new Set()});return {...collectRecipeLeaves(node,{},[]),node,direct:recipe.materials}});
  }
  return {kind:"production",subject:e.name,branches,equip,fromScratch:query.constraints.fromScratch};
}
function journeyModel(query){
  const names=unique(query.entities.filter(e=>e.type==="area").map(e=>e.name));if(names.length<2)return null;
  const [from,to]=names,queue=[[from,[]]],seen=new Set([norm(from)]);let path=null;
  while(queue.length){const [at,steps]=queue.shift();if(norm(at)===norm(to)){path=steps;break}for(const edge of state.areaGraph.get(norm(at))||[]){if(seen.has(norm(edge.area)))continue;seen.add(norm(edge.area));queue.push([edge.area,[...steps,{from:at,to:edge.area,edge}]])}}
  return {kind:"journey",from,to,path};
}
function productionView(model,style="detail"){
  if(!model.branches.length)return `<p>I don’t have a structured recipe for ${esc(model.subject)}. That remains unknown.</p>`;
  const compact=["totals","summary","simple","numbers"].includes(style);
  return (style==="numbers"?"":`<h3>${esc(model.subject)}${compact?" — totals":" — production plan"}</h3>`)+model.branches.map((b,i)=>{
    const totals=model.fromScratch||compact?b.totals:b.direct;
    const nums=Object.entries(totals||{});
    // Labels and uncertainty stay even in numeric mode: unlabelled numbers would be misleading.
    let html=model.branches.length>1?`<p>Recipe ${i+1}</p>`:"";
    html+=`<ul>${nums.map(([name,n])=>`<li>${esc(title(name))}: ${esc(n)}</li>`).join("")}</ul>`;
    if(!compact){if(b.node)html+=`<ul>${recipeNodeHtml(b.node)}</ul>`;else html+=`<p>Set inputs: ${esc(Object.entries(b.direct).map(([k,v])=>`${title(k)} ×${v}`).join(", "))}.</p><ul>${b.children.map(x=>recipeNodeHtml(x)).join("")}</ul>`;
      if(model.equip?.obj?.craftSkill)html+=`<p>Make: ${esc(model.equip.obj.craftSkill)} ${esc(model.equip.obj.craftLevel)}. Equip: ${esc(model.equip.obj.equipSkill)} ${esc(model.equip.obj.equipLevel)}.</p>`;
    }
    if(b.gaps?.length)html+=`<p class="warn">Unresolved: ${esc(unique(b.gaps).join("; "))}</p>`;
    return html;
  }).join("");
}
function journeyView(model,facet,style){
  const heading=`<h3>${esc(model.from)} → ${esc(model.to)}</h3>`;
  if(model.path===null)return heading+`<p>No route is documented between those areas.</p>`;
  if(facet==="cost"){
    const requirements=model.path.flatMap(s=>s.edge.requirements||[]);
    return heading+(requirements.length?`<p>Recorded route requirements: ${esc(requirements.join("; "))}.</p>`:"<p>No cost or access requirement is recorded for these connections.</p>")+"<p class=\"muted\">A missing fare is unknown, not proof that travel is free. “Have” is a requirement, not a confirmed charge.</p>";
  }
  const steps=facet==="departure"?model.path.slice(0,1):model.path;
  return heading+`<ol>${steps.map(s=>{const room=state.roomById.get(s.edge.fromRoom)?.room?.name||s.edge.fromRoom;return `<li>${esc(s.from)} → ${esc(s.to)} via ${esc(title(s.edge.method))}${room?` from ${esc(room)}`:" (departure room unknown)"}${facet!=="departure"&&s.edge.requirements?.length?` — ${esc(s.edge.requirements.join("; "))}`:""}</li>`}).join("")}</ol>`+(style==="detail"?"<p>This follows recorded area connections. It does not establish room-to-room directions or the cheapest route.</p>":"");
}
function compactHtml(html,style){
  if(!style||style==="detail")return html;
  // Generic legacy answers retain substantive fact paragraphs and warnings; remove UI/evidence clutter.
  let s=html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g,"").replace(/<div class="chips">[\s\S]*?<\/div>/g,"");
  if(style==="simple"||style==="summary"){
    const blocks=s.match(/<(?:p|ul|ol)\b[^>]*>[\s\S]*?<\/(?:p|ul|ol)>/g)||[];
    const warnings=blocks.filter(b=>/class="(?:warn|bad)"|unknown|unresolved|not documented|cannot|can't|cannot|not a guarantee/i.test(b));
    s=unique([...blocks.slice(0,2),...warnings]).join("")||s;
  }
  return s;
}
function composeOperation(op,style,facet){
  if(!op)return "<p>What would you like me to explain or summarise?</p>";
  if(op.model?.kind==="production")return productionView(op.model,style||"detail");
  if(op.model?.kind==="journey")return journeyView(op.model,facet,style);
  if(style==="numbers")return "<p>This answer has no stored numeric calculation to display on its own.</p>";
  return compactHtml(op.output.html,style);
}
function executeConversation(query){
  if(query.goal==="hypothetical_level")return result(`<p>For this hypothetical: ${esc(Object.entries(query.overrides).map(([k,v])=>`${title(k)} ${v}`).join(", "))}. Your actual stated levels are unchanged. What would you like to check at that level?</p>`,query.entities);
  if(query.goal==="combat_comparison")return result("<h3>I can’t establish a best-in-slot winner</h3><p>FlatMMO’s exact hit chance and damage rolls are unresolved here, so I cannot calculate reliable DPS, kill time, survivability or recommended combat levels. An equip level or a large damage stat alone does not prove which weapon is best.</p><p>I can compare recorded equip requirements and stats. Which skill’s level are you limiting, and which weapon family would you like to compare?</p>",query.entities);
  if(query.goal==="success_threshold"){
    const source=query.entities[0];
    return result(source?`<h3>${esc(source.name)} — ${esc(source.role)}</h3><p>I don’t have a documented level at which this action stops failing. Its recorded unlock is ${esc(source.source.skill||"unknown skill")} ${esc(source.source.level??"unknown")}; that does not establish guaranteed success.</p>`:"<p>Which Stealing source do you mean? I need a specific target and a documented success rule to establish when failure stops.</p>",query.entities);
  }
  if(query.goal==="produce"){
    const model=productionModel(query);if(model)return {...result(productionView(model,query.style||"detail"),query.entities),model};
  }
  if(query.goal==="travel"){
    const model=journeyModel(query);if(model)return {...result(journeyView(model,null,query.style||"detail"),query.entities),model};
  }
  if(query.goal==="refine_result_set"){
    const base=activeOperation()?.output.resultSet||[];
    const rows=base.filter(r=>!query.constraints.excludedNames.includes(norm(r.itemName))&&(!r.source||sourceHardMatches(r.source,query.constraints))&&itemMatchesSemanticTerms(itemRecord(r.itemName),query.searchTerms));
    return result(`<p>${rows.length} matching item/source pairs.</p><ul>${rows.slice(0,45).map(r=>`<li>${esc(r.itemName)}${r.source?` — ${esc(sourceLine({kind:r.source.type,source:r.source}))}`:""}</li>`).join("")}</ul>`,query.entities,null,resultRefsFromSources(rows.filter(r=>r.source).map(r=>({source:r.source}))),rows);
  }
  return executeQuery(query,planQuery(query));
}
function checkpointConversation(){
  const c=conversationSession();
  // Immutable operation references make checkpoints cheap; gameplay objects are never mutated in place.
  c.undo.push({activeThreadId:c.activeThreadId,userFacts:structuredClone(c.userFacts),gameplayContext:{...c.gameplayContext},threads:structuredClone(c.threads),context:state.context,lastQuery:state.lastQuery,lastReasoning:state.lastReasoning});
  if(c.undo.length>12)c.undo.shift();
}
function answer(raw){
  if(!state.ready)return "<p>Knowledge is still loading.</p>";
  const c=conversationSession();c.clock++;
  const query=interpretQuestion(raw);c.lastInterpretation=query;
  if(query.goal==="undo"){
    const old=c.undo.pop();if(!old)return "<p>There is no earlier change to undo in this session.</p>";
    Object.assign(c,{activeThreadId:old.activeThreadId,userFacts:old.userFacts,gameplayContext:old.gameplayContext,threads:old.threads,pendingRepair:null});
    state.context=old.context;state.lastQuery=old.lastQuery;state.lastReasoning=old.lastReasoning;c.languageContext={kind:null,expires:0};
    return "<p>Undone.</p>"+composeOperation(activeOperation(),"summary");
  }
  if(query.goal==="acknowledge")return "<p>Any time. What would you like to check next?</p>";
  if(query.goal==="explain")return whyAnswer();
  if(["glossary","foreign_comparison"].includes(query.goal)){
    const out=executeQuery(query,planQuery(query));
    c.languageContext={kind:query.goal==="glossary"?"glossary":"comparison",expires:c.clock+3,query,output:out};
    return compactHtml(out.html,query.style);
  }
  if(query.goal==="recompose"){
    if(query.language?.output)return compactHtml(query.language.output.html,query.style);
    return composeOperation(query.operation,query.style);
  }
  if(query.goal==="operation_view")return composeOperation(query.operation,query.style,query.facet);
  if(query.goal==="assert_facts"){
    checkpointConversation();
    for(const [k,level] of Object.entries(query.facts))c.userFacts.skills[k]={level,source:"conversation",statedAt:c.clock};
    // Durable corrections supersede old non-hypothetical query caps.
    for(const [id,op] of Object.entries(c.gameplayContext))if(!op.query.hypothetical){
      const next=structuredClone(op.query);
      for(const k of Object.keys(query.facts)){delete next.overrides[k];delete next.constraints.skillCaps[k]}
      c.gameplayContext[id]={...op,query:next};
    }
    c.languageContext={kind:null,expires:0};
    return `<p>Your stated levels: ${esc(Object.entries(query.facts).map(([k,v])=>`${title(k)} ${v}`).join(", "))}.</p>`;
  }
  if(query.goal==="repair_clarify"){
    c.pendingRepair={threadId:c.activeThreadId};return "<p>What did you mean instead? You can name the subject or the role, such as the pickpocket source.</p>";
  }
  const out=executeConversation(query);
  // Clarifications must never install the ambiguous candidates as an accepted gameplay subject.
  if(query.ambiguity){c.pendingClarification={query,output:out};return out.html}
  checkpointConversation();
  c.pendingRepair=null;c.pendingClarification=null;c.languageContext={kind:null,expires:0};
  if(!out.reasoning)out.reasoning=makeReasoning(query,planQuery(query),{conclusions:[out.model?`Computed ${out.model.kind} from explicit structured records.`:`Answered ${query.goal} using recorded data and its limits.`],uncertainties:query.goal==="combat_comparison"?["Exact combat performance is unresolved."]:query.goal==="success_threshold"?["Success threshold is not documented."]:[]});
  rememberContext(query.intent,out.focus?.length?out.focus:query.entities,raw,{query,resultRefs:out.resultRefs||[],resultSet:out.resultSet||[],reasoning:out.reasoning});
  const op={query:compactQueryForThread(query),output:out,model:out.model||null};
  op.query.hypothetical=query.hypothetical;
  // Hypothetical levels live in this operation only, never in userFacts.
  c.gameplayContext[c.activeThreadId]=op;
  const ids=new Set(c.threads.map(t=>t.id));for(const key of Object.keys(c.gameplayContext))if(!ids.has(key))delete c.gameplayContext[key];
  return (query.hypothetical&&query.goal!=="hypothetical_level"?"<p>For this hypothetical:</p>":"")+(query.repair?"<p>Got it.</p>":query.move==="return"?`<p>Back to ${esc(activeThread()?.label)}.</p>`:"")+composeOperation(op,query.style);
}
