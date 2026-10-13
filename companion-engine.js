
"use strict";

const FILES = {
  monsters:"flatmmo-monsters.json",
  quests:"flatmmo-quests.json",
  skills:"flatmmo-skills.json",
  areas:"flatmmo-areas.json",
  equipment:"flatmmo-equipment.json",
  items:"flatmmo-items.json",
  graph:"flatmmo-graph.json",
  language:"flatmmo-language.json",
  mechanics:"flatmmo-mechanics.json",
  rules:"flatmmo-rules.json",
  overrides:"flatmmo-overrides.json"
};
const STORAGE_KEY="flatmmoCompanion.v1";
const MAX_HISTORY=120;
const MAX_THREADS=12;
const MAX_THREAD_TURNS=36;
const KNOWN_SKILLS=[
  "Health","Melee","Archery","Magic","Worship","Mining","Forging","Crafting",
  "Enchantment","Fishing","Woodcutting","Firemaking","Cooking","Brewing","Farming",
  "Stealing","Hunting","Agility"
];
const SKILL_ALIASES={firemake:"Firemaking"};

const state = {
  data:{}, ready:false, lastEntity:null,
  context:{intent:null,entities:[],raw:""}, contextStack:[], lastReasoning:null, lastQuery:null, graphDiagnostics:null,
  conversation:{threads:[],activeThreadId:null,nextThreadId:1,pendingRepair:null,turnSeq:0,userFacts:{skills:{}}},
  playerRequest:0,
  player:null, history:[], restoring:false,
  playerProvider:{
    status:"interim-public-profile",
    async fetch(username){
      const url=officialProfileUrl(username);
      let response;
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),15000);
      try{
        response=await fetch(url,{method:"GET",mode:"cors",credentials:"omit",cache:"no-store",redirect:"follow",signal:controller.signal});
      }catch(err){
        const e=new Error("Your browser could not read the official FlatMMO profile directly. This is usually a cross-origin browser restriction. You can enter skill levels manually or open the official profile normally.");
        e.code="CORS_OR_NETWORK";
        e.cause=err;
        throw e;
      }finally{clearTimeout(timer)}
      if(!response.ok) throw new Error(`Official profile returned HTTP ${response.status}.`);
      const html=await response.text();
      return parseOfficialProfileHtml(username,html,url);
    }
  }
};

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const norm = s => String(s ?? "").toLowerCase().replace(/[_-]+/g," ").replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim();
// Grammatical forms are interpretation-only. Never stem arbitrary names or skill labels.
const ITEM_NOUN_PAIRS = `orb/orbs bar/bars ore/ores seed/seeds log/logs plank/planks
arrow/arrows arrowhead/arrowheads head/heads shaft/shafts feather/feathers
knife/knives leaf/leaves staff/staves axe/axes pickaxe/pickaxes sword/swords
scimitar/scimitars mace/maces spear/spears bow/bows club/clubs trident/tridents
potion/potions vial/vials bucket/buckets bottle/bottles pie/pies egg/eggs
berry/berries ruby/rubies anchovy/anchovies key/keys bone/bones ash/ashes
nail/nails shard/shards fragment/fragments page/pages note/notes strip/strips
piece/pieces hide/hides match/matches glove/gloves boot/boots leg/legs
helmet/helmets hat/hats hood/hoods body/bodies coif/coifs skirt/skirts
net/nets rod/rods harpoon/harpoons cage/cages book/books scroll/scrolls
ring/rings necklace/necklaces gem/gems diamond/diamonds emerald/emeralds
pearl/pearls sapphire/sapphires mushroom/mushrooms rockshroom/rockshrooms
moldshroom/moldshrooms seashroom/seashrooms fireshroom/fireshrooms
apple/apples banana/bananas pear/pears pineapple/pineapples coconut/coconuts
avocado/avocados pepper/peppers cake/cakes steak/steaks sardine/sardines eel/eels
shark/sharks lobster/lobsters tree/trees artifact/artifacts relic/relics
badge/badges emblem/emblems birdnest/birdnests shovel/shovels machete/machetes
barrel/barrels crate/crates block/blocks handle/handles mask/masks mug/mugs
skull/skulls tail/tails tip/tips tank/tanks totem/totems`.split(/\s+/).map(p=>p.split("/"));
const ITEM_NUMBER_FORMS=new Map(ITEM_NOUN_PAIRS.flatMap(([a,b])=>[[a,[a,b]],[b,[a,b]]]));
ITEM_NUMBER_FORMS.set("staff",["staff","staves","staffs"]);
ITEM_NUMBER_FORMS.set("staves",["staff","staves","staffs"]);
function itemNameForms(name){
  const n=norm(name),m=n.match(/^(.*?)([a-z]+)(\s+(?:\d+|lit|unlit))?$/);
  if(!m)return [n];
  return [...new Set([n,...(ITEM_NUMBER_FORMS.get(m[2])||[]).map(w=>m[1]+w+(m[3]||""))])];
}
function entityMentioned(q,e){const aliases=e.aliases?.length?e.aliases:state.entityCatalog?.find(x=>x.type===e.type&&norm(x.name)===norm(e.name))?.aliases||[];return [e.name,...aliases].some(n=>hasWholePhrase(q,n))}
const title = s => String(s ?? "").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());
function phraseReplace(text,from,to){const escRx=String(from).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");return text.replace(new RegExp("\\b"+escRx.replace(/\s+/g,"\\s+")+"\\b","g"),to)}
function semanticEnglish(raw){
  let q=norm(raw);
  const rewrites=[
    ["what s","what is"],["where s","where is"],["who s","who is"],["that s","that is"],["it s","it is"],
    ["i m","i am"],["i ve","i have"],["don t","do not"],["doesn t","does not"],["isn t","is not"],["aren t","are not"],
    ["can t","cannot"],["couldn t","could not"],["wouldn t","would not"],["shouldn t","should not"],["won t","will not"],
    ["wanna","want to"],["lemme","let me"],["gimme","give me"]
  ];
  for(const [a,b] of rewrites)q=phraseReplace(q,a,b);
  return q.replace(/\s+/g," ").trim();
}
function languageData(){return state.data.language||{}}
function glossaryEntries(){return languageData().flatmmoTerms||[]}
function foreignComparisons(){return languageData().foreignComparisons||[]}



function explicitlyNegatedEntity(q,e){
  const names=[e.name,...(e.aliases||[])].map(norm).filter(x=>x.length>=2);
  const negated=[];for(const m of q.matchAll(/\b(?:not|not the|do not mean|do not mean the|rather than|instead of)\s+([a-z0-9 ]+?)(?=\s*(?:,|;|\.|$|\bbut\b|\brather\b))/g))negated.push(norm(m[1]));
  for(const n of names){
    const r=n.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/\s+/g,"\\s+");
    if(new RegExp("\\b(?:not|not the|do not mean|do not mean the|is not|is not the|rather than|instead of)\\s+"+r+"\\b").test(q))return true;
    const toks=contentTokens(n);for(const x of negated){if(x===n)return true;if(toks.length>1&&x===toks[toks.length-1])return true}
  }
  return false;
}

const unique = xs => [...new Set(xs.filter(Boolean))];
const nowIso = () => new Date().toISOString();
const officialProfileUrl = username => `https://flatmmo.com/profile/?user=${encodeURIComponent(username)}`;

function srcLink(url,label){
  if(!url) return "";
  return `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label||url)}</a>`;
}
function evidence(sources=[], notes=[]){
  const srcs=unique(sources);
  if(!srcs.length && !notes.length) return "";
  return `<div class="evidence"><details><summary>Evidence / limits</summary>${
    srcs.length?`<div>${srcs.map((s,i)=>srcLink(s,`Source ${i+1}`)).join(" · ")}</div>`:""
  }${notes.length?`<ul>${notes.map(n=>`<li>${esc(n)}</li>`).join("")}</ul>`:""}</details></div>`;
}
function addMsg(kind,html,doScroll=true){
  const el=document.createElement("div");
  el.className=`msg ${kind}`;
  el.innerHTML=html;
  $("#chat").appendChild(el);
  if(doScroll) el.scrollIntoView({behavior:"smooth",block:"end"});
}
function chips(items=[]){
  if(!items.length) return "";
  return `<div class="chips">${items.map(x=>`<button class="chip" data-q="${esc(x)}">${esc(x)}</button>`).join("")}</div>`;
}
function fmtDrop(d){
  const amt=d.min===d.max?d.min:`${d.min}–${d.max}`;
  const rarity=d.rarity_denominator===1?"Always":`1/${d.rarity_denominator}`;
  return `${title(d.item)} — ${amt} (${rarity})`;
}
function fmtNumber(n){ return Number.isFinite(Number(n)) ? Number(n).toLocaleString() : String(n??""); }
function flattenEquipment(eq){
  const out=[];
  for(const [family,items] of Object.entries(eq.weaponFamilies||{})){
    for(const x of items||[]) out.push({kind:"weapon",family,name:x.name,obj:x});
  }
  for(const [style,sets] of Object.entries(eq.armourSets||{})){
    for(const set of sets||[]){
      out.push({kind:"armour-set",style,name:set.name,obj:set});
      for(const p of set.pieces||[]) out.push({kind:"armour-piece",style,name:p.name,obj:p,parent:set});
    }
  }
  for(const x of eq.enchantmentOrbs||[]) out.push({kind:"orb",name:x.name,obj:x});
  for(const [kind,items] of Object.entries(eq.productionChains||{})){
    if(Array.isArray(items)) for(const x of items) out.push({kind:"production",family:kind,name:x.name,obj:x});
  }
  return out;
}
function entityScore(q,name){
  q=norm(q); name=norm(name);
  if(!q||!name) return 0;
  if(q===name) return 100;
  if(q.includes(name)) return 80+Math.min(15,name.length/3);
  if(name.includes(q) && q.length>=3) return 60+Math.min(15,q.length/3);
  const qt=new Set(q.split(" ")), nt=new Set(name.split(" "));
  let common=0; for(const t of qt) if(nt.has(t)) common++;
  return common?20+common*10:0;
}
function findNamed(q,records){
  let best=null,bestScore=0;
  for(const r of records||[]){
    const s=entityScore(q,r.name);
    if(s>bestScore){best=r;bestScore=s}
  }
  return bestScore>=50?best:null;
}
function rule(id){ return (state.data.rules?.rules||[]).find(x=>x.id===id); }
const playerKey = name => String(name||"").trim().toLowerCase();
function playerBasis(){
  const p=state.player;if(!p)return "";
  const basis=p.source==="manual"?"User-entered levels; not verified by FlatMMO":p.cached?"Cached public stats":"Public skill snapshot";
  return `<p class="muted small">${esc(basis)}${p.refreshFailed?" · Refresh failed; using previous levels":""}. Missing skills, XP and other fields remain unknown.</p>`;
}
function canonicalSkillName(name){
  const key=norm(name);
  return SKILL_ALIASES[key] || KNOWN_SKILLS.find(x=>norm(x)===key) || String(name||"").trim();
}
function snapshotSkill(snapshot,name){
  const key=norm(canonicalSkillName(name));
  if(!snapshot?.skills) return null;
  return snapshot.skills[key] || (key==="firemaking" ? snapshot.skills.firemake : null) || null;
}
function playerSkill(name){ return snapshotSkill(state.player,name); }

function saveLocal(){
  try{
    localStorage.setItem(STORAGE_KEY,JSON.stringify({
      version:1,
      username:$("#username").value.trim()||state.player?.username||"",
      player:state.player,
      history:state.history.slice(-MAX_HISTORY),
      savedAt:nowIso()
    }));
  }catch(_){}
}
function readLocal(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    return raw?JSON.parse(raw):null;
  }catch(_){return null}
}
function clearLocal(){
  state.playerRequest++;
  $("#loadPlayer").disabled=false;
  try{localStorage.removeItem(STORAGE_KEY)}catch(_){}
  state.player=null;state.history=[];state.lastEntity=null;state.context={intent:null,entities:[],raw:""};state.contextStack=[];state.lastReasoning=null;state.lastQuery=null;state.conversation={threads:[],activeThreadId:null,nextThreadId:1,pendingRepair:null,turnSeq:0,userFacts:{skills:{}}};
  $("#username").value="";
  updatePlayerUi();
  history.replaceState(null,"",location.pathname+location.search);
  const keep=$("#chat").firstElementChild;
  $("#chat").innerHTML="";
  if(keep) $("#chat").appendChild(keep);
  addMsg("bot","<p>Local Companion state cleared. The FlatMMO knowledge files themselves were not affected.</p>");
}
function parseHashPlayer(){
  const raw=location.hash.replace(/^#/,"");
  const params=new URLSearchParams(raw);
  return (params.get("player")||"").trim();
}
function setPortableHash(username){
  const url=new URL(location.href);
  url.hash=username?`player=${encodeURIComponent(username)}`:"";
  history.replaceState(null,"",url.pathname+url.search+url.hash);
}
function portableUrl(username){
  const url=new URL(location.href);
  url.hash=`player=${encodeURIComponent(username)}`;
  return url.toString();
}
async function copyText(text){
  if(navigator.clipboard?.writeText){
    await navigator.clipboard.writeText(text); return true;
  }
  const ta=document.createElement("textarea");ta.value=text;document.body.appendChild(ta);ta.select();
  const ok=document.execCommand("copy");ta.remove();return ok;
}

function parseOfficialProfileHtml(username,html,url){
  const doc=new DOMParser().parseFromString(html,"text/html");
  const text=(doc.body?.innerText||"").replace(/\u00a0/g," ").replace(/\r/g,"");
  if(/Player\s+Not\s+Found/i.test(text)) {
    const e=new Error(`No public FlatMMO player named "${username}" was found.`);
    e.code="NOT_FOUND"; throw e;
  }
  const skills={};
  const names=["Total",...KNOWN_SKILLS];
  for(const name of names){
    const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    const rx=new RegExp(`(?:^|\\n|\\s)${escaped}\\s+(?:LEVEL\\s+)?([0-9,]+)\\s+([0-9,]+)\\s*XP`,"i");
    const m=text.match(rx);
    if(m){
      const rec={level:Number(m[1].replace(/,/g,"")),xp:Number(m[2].replace(/,/g,""))};
      if(name==="Total") skills.total=rec; else skills[norm(name)]=rec;
    }
  }

  // Fallback: inspect compact DOM blocks when page text formatting changes.
  if(Object.keys(skills).length<4){
    const blocks=[...doc.querySelectorAll("tr,li,.card,.stat,.skill,.row,div")];
    for(const name of names){
      if(name!=="Total" && skills[norm(name)]) continue;
      const reName=new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`,"i");
      for(const el of blocks){
        const t=(el.innerText||"").replace(/\s+/g," ").trim();
        if(!reName.test(t) || t.length>180) continue;
        const m=t.match(/LEVEL\s*([0-9,]+).*?([0-9,]+)\s*XP/i);
        if(m){
          const rec={level:Number(m[1].replace(/,/g,"")),xp:Number(m[2].replace(/,/g,""))};
          if(name==="Total") skills.total=rec; else skills[norm(name)]=rec;
          break;
        }
      }
    }
  }

  const count=Object.keys(skills).length;
  if(count<4){
    const e=new Error("The official profile page loaded, but its current HTML could not be parsed reliably for skill data. The parser will need updating or the official API.");
    e.code="PARSE_FAILED"; throw e;
  }

  return {
    source:"official_public_profile_html",
    sourceUrl:url,
    username,
    fetchedAt:nowIso(),
    total:skills.total||null,
    skills:Object.fromEntries(Object.entries(skills).filter(([k])=>k!=="total")),
    completeness:{
      skillsParsed:Object.keys(skills).filter(k=>k!=="total").length,
      expectedSkills:KNOWN_SKILLS.length,
      bank:false,inventory:false,equipment:false,quests:false
    }
  };
}

function updatePlayerUi(message){
  const p=state.player;
  const user=$("#username").value.trim()||p?.username||"";
  $("#refreshPlayer").disabled=!user;
  $("#copyProfileLink").disabled=!user;
  $("#openOfficialProfile").disabled=!user;

  if(!p){
    $("#playerDot").className="dot warn";
    $("#playerState").textContent=message||"No player loaded";
    $("#playerSummary").hidden=true;
    return;
  }
  $("#playerDot").className=p.refreshFailed||p.cached||p.source==="manual"?"dot warn":"dot";
  const d=new Date(p.fetchedAt);
  $("#playerState").textContent=message||`${p.username||"Manual session"} · ${p.refreshFailed?"refresh failed — using previous levels":p.source==="manual"?"user-entered levels":p.cached?"cached stats":"public stats loaded"}`;
  const total=p.total;
  const skills=KNOWN_SKILLS.map(n=>({name:n,rec:playerSkill(n)})).filter(x=>x.rec);
  $("#playerSummary").hidden=false;
  $("#playerSummary").innerHTML=`
    <div><b>${esc(p.username||"Manual session")}</b>${total?` · Total level ${esc(fmtNumber(total.level))} · ${esc(fmtNumber(total.xp))} XP`:""}</div>
    <div class="muted tiny">Snapshot ${esc(isNaN(d)?p.fetchedAt:d.toLocaleString())}. Source: ${esc(p.source)}.</div>
    <div class="skillgrid">${skills.map(x=>`<div class="skillpill"><b>${esc(x.name)} ${esc(x.rec.level)}</b><span>${x.rec.xp==null?"XP unknown":esc(fmtNumber(x.rec.xp))+" XP"}</span></div>`).join("")}</div>
    <div class="muted tiny" style="margin-top:8px">${p.source==="manual"?"User-entered levels; not verified by FlatMMO.":"Public skill snapshot."} ${p.refreshFailed?"Refresh failed; these previous levels may be outdated.":""} Bank, inventory, equipment and quest state remain pending the official API.</div>`;
}
async function loadPlayer(username,{silent=false}={}){
  username=String(username||"").trim();if(!username)return;
  const request=++state.playerRequest;
  const previous=state.player && playerKey(state.player.username)===playerKey(username)?state.player:null;
  state.player=previous;
  $("#username").value=username;setPortableHash(username);
  updatePlayerUi("Loading public profile…");$("#loadPlayer").disabled=true;
  saveLocal();
  try{
    const snap=await state.playerProvider.fetch(username);
    if(request!==state.playerRequest)return;
    state.player=snap;updatePlayerUi();saveLocal();
    if(!silent)addMsg("bot",`<h3>Player loaded</h3><p>Loaded <b>${esc(snap.username)}</b>'s skill levels. Inventory, bank, equipment and quest completion remain unknown.</p>${chips(["What should I do next?","Can I do Atlas Crown?"])}`);
  }catch(err){
    if(request!==state.playerRequest)return;
    state.player=previous?{...previous,refreshFailed:true,lastRefreshAttempt:nowIso()}:null;
    updatePlayerUi(state.player?undefined:"Public profile unavailable — enter skill levels manually");saveLocal();
    if(!silent)addMsg("bot",`<h3>Public player load unavailable</h3><p class="warn">${esc(err.message)}</p><p>${previous?"Keeping the previous levels for this same player; they may be outdated.":"No player levels are loaded."} Use <b>Enter skill levels</b> to supply levels yourself. Browser saving is optional; the portable link carries only the username.</p>`);
  }finally{
    if(request===state.playerRequest)$("#loadPlayer").disabled=false;
  }
}
function changePlayerIdentity(){
  const u=$("#username").value.trim();
  state.playerRequest++;$("#loadPlayer").disabled=false;
  if(state.player && playerKey(state.player.username)!==playerKey(u))state.player=null;
  setPortableHash(u);updatePlayerUi();saveLocal();
}
function openManualPlayer(){
  const u=$("#username").value.trim();
  const p=state.player && playerKey(state.player.username)===playerKey(u)?state.player:null;
  $("#manualIdentity").textContent=u?`Levels for ${u}`:"Levels for this unnamed session";
  $("#manualSkills").innerHTML=KNOWN_SKILLS.map(n=>`<label>${esc(n)}<input aria-label="${esc(n)} level" data-skill="${esc(norm(n))}" type="number" min="1" step="1" inputmode="numeric" placeholder="Unknown" value="${esc(snapshotSkill(p,n)?.level??"")}"></label>`).join("");
  $("#manualError").textContent="";$("#manualDialog").showModal();
}
function saveManualPlayer(){
  const skills={};
  for(const input of document.querySelectorAll("#manualSkills input")){
    const raw=input.value.trim();if(!raw)continue;
    const level=Number(raw);
    if(!/^\d+$/.test(raw)||!Number.isSafeInteger(level)||level<1){$("#manualError").textContent="Enter whole-number levels of at least 1, or leave a skill blank.";return;}
    skills[input.dataset.skill]={level,xp:null};
  }
  if(!Object.keys(skills).length){$("#manualError").textContent="Enter at least one skill level.";return;}
  state.playerRequest++;$("#loadPlayer").disabled=false;
  const username=$("#username").value.trim();
  state.player={username,source:"manual",fetchedAt:nowIso(),skills,total:null,completeness:{skillsParsed:Object.keys(skills).length,expectedSkills:KNOWN_SKILLS.length,bank:false,inventory:false,equipment:false,quests:false}};
  setPortableHash(username);updatePlayerUi();saveLocal();$("#manualDialog").close();
  addMsg("bot",`<h3>User-entered levels ready</h3><p>Using ${Object.keys(skills).length} skill levels${username?` for ${esc(username)}`:" for this session"}. Blank skills remain unknown. These levels are not verified by FlatMMO and are not included in portable links.</p>${chips(["What should I do next?","Can I do Atlas Crown?"])}`);
}

function restoreSession(){
  const hashUser=parseHashPlayer();
  const saved=readLocal();
  const username=hashUser || saved?.username || "";
  if(username) $("#username").value=username;

  if(saved?.player && playerKey(saved.player.username)===playerKey(username)){
    state.player={...saved.player,source:saved.player.source==="local_cache"?"official_public_profile_html":saved.player.source,cached:true};
    updatePlayerUi();
  } else updatePlayerUi();

  const historyItems=Array.isArray(saved?.history)?saved.history.slice(-MAX_HISTORY):[];
  if(historyItems.length){
    state.restoring=true;
    for(const q of historyItems){
      addMsg("user",esc(q),false);
      addMsg("bot",answer(q),false);
    }
    state.history=historyItems;
    state.restoring=false;
  }

  if(hashUser && (!state.player || playerKey(state.player.username)!==playerKey(hashUser))){
    // The synced/bookmarked URL can reconnect a player automatically.
    loadPlayer(hashUser,{silent:true});
  }
}

async function loadAll(){
  const entries=await Promise.all(Object.entries(FILES).map(async([k,url])=>{
    const r=await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return [k,await r.json()];
  }));
  state.data=Object.fromEntries(entries);
  if(state.data.overrides?.quests?.length){
    const existing=new Set((state.data.quests.records||[]).map(x=>norm(x.name)));
    for(const q of state.data.overrides.quests) if(!existing.has(norm(q.name))) state.data.quests.records.push(q);
  }
  state.data.equipmentFlat=flattenEquipment(state.data.equipment);
  buildIndexes();
  state.ready=true;
  $("#loading").style.display="none";
  $("#loadState").textContent=`Knowledge loaded: ${state.data.items?.records?.length||0} items, ${state.graphDiagnostics?.nodes||0} typed graph nodes, ${state.data.language?.flatmmoTerms?.length||0} language terms, ${state.data.monsters.records.length} monsters, ${state.data.quests.records.length} quests`;
  restoreSession();
}
function buildIndexes(){
  const dropMap=new Map(), resourceMap=new Map(), acquisitionMap=new Map(), serviceMap=new Map(), roomById=new Map(), npcById=new Map(), productionMap=new Map(), areaGraph=new Map();
  const catalog=[];
  const add=(type,name,obj,extra={})=>{
    if(!name)return;
    const aliases=unique([name,...(extra.aliases||[])]).map(norm).filter(x=>x.length>=2);
    catalog.push({type,name:String(name),obj,aliases,area:extra.area||null,room:extra.room||null});
  };
  const pushMap=(map,key,value)=>{key=norm(key);if(!key)return;if(!map.has(key))map.set(key,[]);map.get(key).push(value)};
  const rewardItemName=text=>{
    let s=String(text||"").trim();
    if(!s||/\bXP\b|\baccess\b|\bability\b|\bsystem\b|\bsupply\b|more rooms/i.test(s))return null;
    s=s.replace(/^[0-9,]+\s+/,"").trim();
    return s||null;
  };
  const npcItemSource=npc=>{
    const d=String(npc.details||"").trim(); if(!d)return null;
    let m=d.match(/^Sells\/unlocks\s+(.+?)(?:\s+for\s+[0-9,]+\s+Coins)?\.?$/i);
    if(!m)m=d.match(/^Sells\s+(.+?)(?:\s+for\s+[0-9,]+\s+Coins)?\.?$/i);
    if(m){
      const item=m[1].replace(/\.$/,"").trim();
      if(/\band\b|same items|related items|tools|raw fish/i.test(item))return null;
      return {item,method:"shop"};
    }
    m=d.match(/^Makes\s+(.+?)\s+from\s+/i);
    if(m)return {item:m[1].trim(),method:"craft_service"};
    m=d.match(/^Trades\s+.+?\s+for\s+(.+?)\.?$/i);
    if(m)return {item:m[1].replace(/\.$/,"").trim(),method:"trade"};
    return null;
  };

  for(const m of state.data.monsters.records||[]){
    add("monster",title(m.name),m,{aliases:[m.name]});
    for(const d of m.drops||[]){
      const item=title(d.item),src={kind:"monster_drop",monster:m,drop:d};
      pushMap(dropMap,item,{monster:m,drop:d}); pushMap(acquisitionMap,item,src);
    }
  }
  for(const q of state.data.quests.records||[]){
    add("quest",q.name,q);
    for(const reward of q.rewards||[]){
      const item=rewardItemName(reward);
      if(item)pushMap(acquisitionMap,item,{kind:"quest_reward",quest:q,reward});
    }
  }
  for(const sk of state.data.skills.records||[]) add("skill",sk.name,sk,{aliases:sk.wikiPageName?[sk.wikiPageName]:[]});
  for(const e of state.data.equipmentFlat||[]) add("equipment",e.name,e,{aliases:[]});
  for(const m of state.data.mechanics.records||[]) add("mechanic",m.name,m,{aliases:[m.id]});
  for(const r of state.data.rules.rules||[]) add("rule",r.name,r,{aliases:[r.id]});

  for(const a of state.data.areas.records||[]){
    add("area",a.name,a);
    areaGraph.set(norm(a.name),(a.externalConnections||[]).map(x=>({...x,from:a.name})));
    for(const room of a.rooms||[]){
      roomById.set(room.id,{area:a,room});
      add("room",room.name,room,{area:a,aliases:[room.id]});
      for(const service of room.services||[]) pushMap(serviceMap,service,{area:a,room,kind:"service",value:service});
      for(const feature of room.features||[]) pushMap(serviceMap,feature,{area:a,room,kind:"feature",value:feature});
      for(const node of room.resourceNodes||[]){
        if(node.resource){
          pushMap(resourceMap,node.resource,{area:a,room,node});
          pushMap(acquisitionMap,node.resource,{kind:"world_resource",area:a,room,node});
        }
      }
    }
    for(const npc of a.npcs||[]){
      npcById.set(npc.id,{area:a,npc});
      const room=roomById.get(npc.roomId)?.room||null;
      add("npc",npc.name,npc,{area:a,room,aliases:[npc.id]});
      for(const fn of npc.functions||[]) pushMap(serviceMap,fn,{area:a,room,npc,kind:"npc-function",value:fn});
      const itemSource=npcItemSource(npc);
      if(itemSource)pushMap(acquisitionMap,itemSource.item,{kind:"npc_item",method:itemSource.method,area:a,room,npc,details:npc.details});
    }
  }

  for(const e of state.data.equipmentFlat||[]){
    const mats=e.obj?.materials||e.obj?.setMaterialTotals||{};
    for(const k of Object.keys(mats)) if(!catalog.some(x=>x.type==="item"&&norm(x.name)===norm(title(k)))) add("item",title(k),{name:title(k),key:norm(title(k))});
    if(Object.keys(mats).length)pushMap(acquisitionMap,e.name,{kind:"craft_recipe",equipment:e,materials:mats});
    if(e.kind==="production" && e.obj?.materials) productionMap.set(norm(e.name),e.obj);
  }
  for(const [family,recipes] of Object.entries(state.data.equipment?.productionChains||{})){
    const rows=Array.isArray(recipes)?recipes:[recipes];
    for(const rec of rows||[]){
      if(!rec?.name)continue;
      if(rec.materials){
        productionMap.set(norm(rec.name),rec);
        if(!(state.data.equipmentFlat||[]).some(e=>norm(e.name)===norm(rec.name)))pushMap(acquisitionMap,rec.name,{kind:"production_recipe",family,recipe:rec});
      }
    }
  }

  // v1.8: the first-class item graph is authoritative for item acquisition/use questions.
  // The legacy maps above remain useful for monster/room relationships, but item lookups no
  // longer depend on reconstructing meaning from scattered text at runtime.
  acquisitionMap.clear();
  const itemByName=new Map(),shopIndex=new Map(),stealingIndex=[];
  for(const item of state.data.items?.records||[]){
    itemByName.set(norm(item.name),item);
    add("item",item.name,item,{aliases:item.aliases||[]});
    for(const acq of item.acquisition||[]){
      pushMap(acquisitionMap,item.name,{kind:acq.type,item,source:acq});
      if(acq.type==="shop" && acq.shop){
        const shopKey=`${norm(acq.area||"")}|${norm(acq.shop)}`;
        if(!shopIndex.has(shopKey))shopIndex.set(shopKey,{name:acq.shop,area:acq.area||null,items:[]});
        shopIndex.get(shopKey).items.push({item:item.name,source:acq});
      }
      if(["pickpocket","stall","map_chest","rogue_chest"].includes(acq.type))stealingIndex.push({item:item.name,source:acq});
    }
  }
  for(const sh of shopIndex.values())add("shop",sh.name,sh,{area:sh.area||null,aliases:[sh.area?`${sh.area} ${sh.name}`:null,sh.area?`${sh.area} shop`:null].filter(Boolean)});

  // Exact canonical names win over generated forms, including singular/plural collisions.
  const canonicalNames=new Set(catalog.map(e=>norm(e.name))),formItems=new Map();
  for(const e of catalog){
    if(!["item","resource","equipment"].includes(e.type))continue;
    e.aliases=unique(e.aliases.flatMap(itemNameForms)).filter(a=>a===norm(e.name)||!canonicalNames.has(a));
  }
  for(const item of state.data.items?.records||[]){
    for(const form of unique([item.name,...(item.aliases||[])].flatMap(itemNameForms))){
      if(itemByName.has(form))continue;
      if(!formItems.has(form))formItems.set(form,new Set());
      formItems.get(form).add(item);
    }
  }
  // Ambiguous generated forms are never silently assigned to one item.
  for(const [form,records] of formItems)if(records.size===1)itemByName.set(form,[...records][0]);
  state.dropMap=dropMap; state.resourceMap=resourceMap; state.acquisitionMap=acquisitionMap; state.itemByName=itemByName; state.shopIndex=shopIndex; state.stealingIndex=stealingIndex; state.serviceMap=serviceMap;
  state.roomById=roomById; state.npcById=npcById; state.productionMap=productionMap; state.areaGraph=areaGraph; state.entityCatalog=catalog;
  buildRelationshipIndexes();
}

function buildRelationshipIndexes(){
  const graph=state.data.graph||{},nodeById=new Map(),nodesByName=new Map(),out=new Map(),incoming=new Map();
  for(const n of graph.nodes||[]){
    nodeById.set(n.id,n);
    const k=norm(n.name);if(!nodesByName.has(k))nodesByName.set(k,[]);nodesByName.get(k).push(n);
  }
  for(const e of graph.edges||[]){
    if(!out.has(e.from))out.set(e.from,[]);out.get(e.from).push(e);
    if(!incoming.has(e.to))incoming.set(e.to,[]);incoming.get(e.to).push(e);
  }
  state.graphNodeById=nodeById;state.graphNodesByName=nodesByName;state.graphOut=out;state.graphIn=incoming;
  state.graphDiagnostics={nodes:graph.counts?.nodes||nodeById.size,edges:graph.counts?.edges||(graph.edges||[]).length,unresolvedTextReferences:graph.counts?.unresolvedTextReferences||0};
}
function graphNodesNamed(name,type=null){return (state.graphNodesByName?.get(norm(name))||[]).filter(n=>!type||n.type===type)}
function graphNodeForEntity(e){
  if(!e)return null;const id=e.obj?.id;
  if(id&&state.graphNodeById?.has(id))return state.graphNodeById.get(id);
  if(e.type==="rule"&&e.obj?.id&&state.graphNodeById?.has(`rule.${e.obj.id}`))return state.graphNodeById.get(`rule.${e.obj.id}`);
  const preferred={item:"item",resource:"item",monster:"monster",quest:"quest",skill:"skill",area:"area",room:"room",npc:"npc",shop:"shop",mechanic:"mechanic"}[e.type];
  const rows=graphNodesNamed(e.name,preferred);if(rows.length===1)return rows[0];
  if(e.type==="equipment"){const item=graphNodesNamed(e.name,"item");if(item.length===1)return item[0]}
  return null;
}
function graphNeighborIds(id){const out=new Set();for(const e of state.graphOut?.get(id)||[])out.add(e.to);for(const e of state.graphIn?.get(id)||[])out.add(e.from);return out}
function graphRelatedEntities(a,b){
  const an=graphNodeForEntity(a),bn=graphNodeForEntity(b);if(!an||!bn)return false;if(an.id===bn.id)return true;
  const first=graphNeighborIds(an.id);if(first.has(bn.id))return true;
  // Two-hop relation is useful for item -> typed source -> area/NPC, but never by itself overrides an explicit current subject.
  for(const mid of first)if(graphNeighborIds(mid).has(bn.id))return true;
  return false;
}

const QUERY_STOP=new Set("what where when which who why how is are was were do does did can could should would i me my we our the a an to from for of in on at with about tell show give list find get need want please there here it its that this those these and or versus vs into through all any every".split(" "));
function contentTokens(s){return norm(s).split(" ").filter(x=>x.length>1&&!QUERY_STOP.has(x))}
function hasWholePhrase(haystack,needle){
  const h=` ${norm(haystack)} `,n=` ${norm(needle)} `;
  return n.trim().length>0 && h.includes(n);
}
function catalogScore(q,e){
  const nq=norm(q); let best=0;
  for(const a of e.aliases||[]){
    if(!a)continue;
    if(nq===a)best=Math.max(best,160+a.length/10);
    else if(a.length>=3 && hasWholePhrase(nq,a))best=Math.max(best,125+Math.min(20,a.length/2));
    else if(nq.length>=4 && hasWholePhrase(a,nq))best=Math.max(best,85+Math.min(15,nq.length/2));
    const qt=contentTokens(nq),at=contentTokens(a); if(qt.length&&at.length){
      const aset=new Set(at),common=qt.filter(t=>aset.has(t)).length;
      if(common)best=Math.max(best,35+common*20+(common===at.length?15:0));
    }
  }
  return best;
}
function resolveEntities(q,{types=null,limit=6,suppressNegated=true}={}){
  const rows=[],excluded=suppressNegated?excludedEntityNames(q):[];
  for(const e of state.entityCatalog||[]){
    if(types && !types.includes(e.type))continue;
    if(suppressNegated&&(excluded.includes(norm(e.name))||explicitlyNegatedEntity(q,e)))continue;
    const score=catalogScore(q,e); if(score>=58)rows.push({...e,score});
  }
  rows.sort((a,b)=>b.score-a.score || b.name.length-a.name.length);
  const seen=new Set(),out=[];
  for(const r of rows){const k=`${r.type}:${norm(r.name)}`;if(seen.has(k))continue;seen.add(k);out.push(r);if(out.length>=limit)break}
  return out;
}
function compactEntity(e){
  if(!e)return null;
  return {type:e.type,name:e.name,aliases:e.aliases||[],obj:e.obj,area:e.area||null,room:e.room||null,score:e.score??null,role:e.role||null,source:e.source||null};
}
function activeThread(){return state.conversation.threads.find(t=>t.id===state.conversation.activeThreadId)||null}
function recentThreads(){return [...state.conversation.threads].sort((a,b)=>(b.lastActive||0)-(a.lastActive||0))}
function threadTurn(thread){return thread?.turns?.length?thread.turns[thread.turns.length-1]:null}
function latestContextTurn(){return threadTurn(activeThread())||state.contextStack?.[state.contextStack.length-1]||null}
function subjectTypeForGoal(goal,type){
  const table={
    acquire:new Set(["item","resource","equipment"]),produce:new Set(["item","resource","equipment"]),uses:new Set(["item","resource","equipment"]),earliest_source:new Set(["item","resource","equipment"]),cheapest_source:new Set(["item","resource","equipment"]),preference_clarification:new Set(["item","resource","equipment"]),
    travel:new Set(["area"]),readiness:new Set(["quest","equipment"]),walkthrough:new Set(["quest"]),mechanics:new Set(["skill","rule","mechanic"]),progression:new Set(["skill","equipment"]),shop_inventory:new Set(["shop","area"]),search_acquisition:new Set(["area","skill"]),refine_result_set:new Set([]),rank_result_set_price:new Set([]),locate:new Set(["source_ref","room","npc","area","monster","item","resource"]),info:new Set(["item","resource","equipment","monster","quest","area","skill","room","npc","shop","rule","mechanic"])
  };return (table[goal]||table.info).has(type);
}
function queryTopicEntities(entities,goal,q=""){
  const priceCurrency=/\b[\d,]+\s*coins?\b/.test(q);
  return (entities||[]).filter(e=>e.score>=100&&subjectTypeForGoal(goal,e.type)&&!(priceCurrency&&norm(e.name)==="coins")).slice(0,4);
}
function threadLabelFrom(entities,goal){const e=entities?.[0];return e?.name||title(String(goal||"conversation").replace(/_/g," "))}
function makeThread(seedEntities=[],goal="info"){
  const id=`thread.${state.conversation.nextThreadId++}`;
  const t={id,label:threadLabelFrom(seedEntities,goal),topicEntities:(seedEntities||[]).map(compactEntity),goal,constraints:{},resultRefs:[],resultSet:[],turns:[],rejected:[],lastActive:++state.conversation.turnSeq};
  state.conversation.threads.push(t);if(state.conversation.threads.length>MAX_THREADS){const oldest=recentThreads().slice(MAX_THREADS);for(const x of oldest)state.conversation.threads=state.conversation.threads.filter(t=>t.id!==x.id)}
  return t;
}
function threadMatchesEntity(thread,e){return (thread?.topicEntities||[]).some(x=>x.type===e.type&&norm(x.name)===norm(e.name))}
function threadForExplicitEntity(e){for(const t of recentThreads())if(threadMatchesEntity(t,e))return t;return null}
function looksLikeFollowup(q){
  return /^(?:and\b|also\b|so\b|then\b|what about\b|how about\b|what if\b|where\b|why\b|which\b|only\b|except\b|instead\b|actually\b|same\b|again\b|does it\b|can it\b|can i still\b|any other\b|any ways?\b|what else\b)/.test(q)||/\b(it|its|this|that|them|those|same|again|former|latter|the other one)\b/.test(q);
}
function looksLikeExplicitNewQuestion(q){return /^(?:how does|how do i|what is|what are|tell me about|explain|where can i|where is|can i do|what does|list|show me|give me)\b/.test(q)}
function skillLooksLikeModifier(q,e){
  const t=activeThread();if(!t)return false;const stated=extractStatedSkillLevels(q),keys=Object.keys(stated),fact=keys.length>0&&/\b(?:i am|i have|my)\b/.test(q);
  if(e.type==="skill")return /^(?:what if|what about|how about|and|only|actually|instead|suppose|say|if)\b/.test(q)||/\bmy\s+\w+\s+(?:is|was|were|only)\s*\d+\b/.test(q)||fact;
  if(fact&&["rule","mechanic"].includes(e.type)){const en=norm(e.name);return keys.some(k=>en.includes(k))&&!/\b(speed|tick|run|running|dodge|cooldown|sleep|weakness|damage|hit chance)\b/.test(q)}
  return false;
}
function selectThreadForQuestion(q,baseEntities,goal){
  const strong=queryTopicEntities(baseEntities,goal,q).filter(e=>!skillLooksLikeModifier(q,e));
  if(/\bback to\b/.test(q))for(const t of recentThreads())if((t.topicEntities||[]).some(e=>hasWholePhrase(q,e.name)))return {thread:t,move:"return",contextAllowed:true};
  const current=activeThread(),follow=looksLikeFollowup(q);
  if(strong.length){
    const first=strong[0];
    if(current&&threadMatchesEntity(current,first))return {thread:current,move:follow?"continue":"continue",contextAllowed:follow};
    if(current&&follow&&(/^(?:what about|how about|and)\b/.test(q)||graphRelatedEntities(current.topicEntities?.[0],first)))return {thread:current,move:"branch",contextAllowed:true};
    const old=threadForExplicitEntity(first);if(old&&/\bback to\b/.test(q))return {thread:old,move:"return",contextAllowed:true};
    return {thread:null,move:"new",contextAllowed:false};
  }
  if(current&&follow)return {thread:current,move:"continue",contextAllowed:true};
  if(current&&!looksLikeExplicitNewQuestion(q)&&contentTokens(q).length<=5)return {thread:current,move:"continue",contextAllowed:true};
  return {thread:null,move:"new",contextAllowed:false};
}
function inheritedEntitiesFromThread(thread){
  if(!thread)return[];const rejected=new Set((thread.rejected||[]).map(x=>`${x.type||""}:${norm(x.name||x)}`));
  return (thread.topicEntities||[]).filter(e=>!rejected.has(`${e.type}:${norm(e.name)}`));
}
function contextResultCandidates(q,thread=activeThread()){
  const turns=thread?.turns||[];
  for(let i=turns.length-1;i>=Math.max(0,turns.length-12);i--){
    const rows=[];for(const ref of turns[i]?.resultRefs||[]){
      if(!ref?.name||!hasWholePhrase(q,ref.name))continue;const role=ref.role||ref.method||ref.type||"source";let boost=0;
      if(role==="pickpocket"&&/\b(pickpocket|steal|stealing)\b/.test(q))boost=30;else if(role==="monster_drop"&&/\b(monster|drop|combat|fight|fighting)\b/.test(q))boost=30;else if(role==="shop"&&/\b(shop|buy|purchase|store)\b/.test(q))boost=30;else if(["stall","map_chest","rogue_chest"].includes(role)&&/\b(stall|chest|steal|stealing)\b/.test(q))boost=24;
      rows.push({type:"source_ref",name:ref.name,obj:ref,source:ref.source||null,area:ref.area||null,room:null,aliases:[norm(ref.name)],score:195+boost,role});
    }if(rows.length)return rows;
  }return[];
}
function contextualize(q,entities,{thread=activeThread(),contextAllowed=true}={}){
  if(!contextAllowed||!thread)return entities;
  const prior=inheritedEntitiesFromThread(thread);if(!prior.length)return entities;
  const strong=queryTopicEntities(entities,"info",q).filter(e=>!skillLooksLikeModifier(q,e));
  // Explicit current subjects always win. Memory can fill omissions, never replace them.
  if(strong.some(e=>e.score>=120)&&!looksLikeFollowup(q))return entities;
  const seen=new Set(),merged=[];for(const e of [...prior,...entities]){const k=`${e.type}:${norm(e.name)}:${e.role||""}`;if(seen.has(k))continue;seen.add(k);merged.push(e)}return merged;
}
function compactQueryForThread(query){
  if(!query)return null;return {raw:query.raw,q:query.q,intent:query.intent,goal:query.goal,entities:(query.entities||[]).slice(0,8).map(compactEntity),overrides:{...(query.overrides||{})},constraints:JSON.parse(JSON.stringify(query.constraints||{})),collection:query.collection||null,directRule:query.directRule||null,searchTerms:[...(query.searchTerms||[])],move:query.move||null,threadId:query.threadId||null};
}
function rememberContext(intent,entities,raw,{query=null,resultRefs=[],reasoning=null,resultSet=[]}={}){
  if(!query?.hypothetical)rememberAssertedUserFacts(raw);
  const keep=(entities||[]).slice(0,8).map(compactEntity).filter(Boolean);state.context={intent,entities:keep,raw};
  let thread=(query?.threadId&&state.conversation.threads.find(t=>t.id===query.threadId))||activeThread();
  if(!thread||query?.move==="new")thread=makeThread(queryTopicEntities(keep,query?.goal||intent,query?.q||norm(raw)),query?.goal||intent);
  state.conversation.activeThreadId=thread.id;thread.lastActive=++state.conversation.turnSeq;
  const topics=queryTopicEntities(keep,query?.goal||intent,query?.q||norm(raw));
  const hasRootItem=(thread.topicEntities||[]).some(e=>["item","resource","equipment"].includes(e.type));
  const transientSourceLocation=query?.goal==="locate"&&topics[0]?.type==="source_ref"&&hasRootItem&&query?.contextUsed;
  if(topics.length&&!transientSourceLocation){thread.topicEntities=topics.map(compactEntity);thread.label=threadLabelFrom(topics,query?.goal||intent)}
  if(!transientSourceLocation)thread.goal=query?.goal||intent;thread.constraints=JSON.parse(JSON.stringify(query?.constraints||{}));thread.resultRefs=(resultRefs||[]).slice(0,40);thread.resultSet=(resultSet||[]);
  if(query?.repair?.rejectedEntities?.length){for(const e of query.repair.rejectedEntities)thread.rejected.push({type:e.type,name:e.name,at:state.conversation.turnSeq});thread.rejected=thread.rejected.slice(-8)}
  const turn={seq:state.conversation.turnSeq,intent,entities:keep,raw,goal:query?.goal||intent,constraints:thread.constraints,resultRefs:thread.resultRefs,resultSet:thread.resultSet,reasoning:reasoning||null,query:compactQueryForThread(query),repair:query?.repair||null};
  thread.turns.push(turn);if(thread.turns.length>MAX_THREAD_TURNS)thread.turns.shift();
  state.contextStack.push(turn);if(state.contextStack.length>60)state.contextStack.shift();
  const primary=keep[0];if(primary?.obj)state.lastEntity={type:primary.type,obj:primary.obj};if(reasoning)state.lastReasoning=reasoning;if(query)state.lastQuery=query;
}
function previousContextEntities(){return inheritedEntitiesFromThread(activeThread())}
function extractStatedSkillLevels(q){
  const out={};
  const labels=[...KNOWN_SKILLS,"Firemake"].sort((a,b)=>b.length-a.length);
  for(const label of labels){
    const p=label.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    let m=String(q).match(new RegExp(`\\b${p}\\s*(?:level\\s*)?(\\d+)\\b`,"i"));
    if(!m)m=String(q).match(new RegExp(`\\b(?:level\\s*)?(\\d+)\\s*${p}\\b`,"i"));
    if(!m)m=String(q).match(new RegExp(`\\b(?:my\\s+)?${p}\\s+(?:is|was|would be|were)\\s+(?:only\\s+)?(?:level\\s*)?(\\d+)\\b`,"i"));
    if(m)out[norm(canonicalSkillName(label))]=Number(m[1]);
  }
  return out;
}
function extractAssertedUserSkillLevels(raw){
  const text=String(raw||"");
  if(/^\s*(?:what if|suppose|say|if)\b/i.test(text))return {};
  // Only promote levels to durable conversation facts when the user actually speaks about themselves.
  if(!/\b(?:i am|i'm|im|i have|i've got|my)\b/i.test(text))return {};
  // A later hypothetical clause belongs to the current calculation, not the user's durable profile.
  const asserted=text.split(/\b(?:what if|suppose|imagine if)\b/i,1)[0];
  return extractStatedSkillLevels(asserted);
}
function rememberAssertedUserFacts(raw){
  const facts=extractAssertedUserSkillLevels(raw);
  for(const [k,v] of Object.entries(facts))state.conversation.userFacts.skills[k]={level:v,statedAt:state.conversation.turnSeq+1,source:"conversation"};
}
function detectIntent(q,entities){
  if(/\b(what should i do next|what do i do next|what should i work on|suggest.*next|recommend.*next)\b/.test(q))return "player_next";
  if(/\b(other|another|alternative|alternatives|else|instead|besides|without|ways?)\b/.test(q) && ["locate","drops"].includes(state.context?.intent))return "locate";
  if(/\bhow many\b/.test(q)&&/\b(materials?|ingredients?|bars?|ores?|coal|logs?|planks?|smelt|forge|craft|make|armour|armor)\b/.test(q))return "materials";
  if(/\b(how many|count|number of)\b/.test(q))return "count";
  if(/\b(list|show me all|which .* are there|what .* are there)\b/.test(q))return "list";
  if(/\b(walkthrough|step by step|start to finish|how (?:do|can) i (?:complete|finish)|quest steps)\b/.test(q))return "walkthrough";
  if(/\b(can i do|am i ready|ready for|requirements?|requirement|what do i need|what level do i need|eligible)\b/.test(q))return "requirements";
  if(/\b(get to|get from|travel to|travel from|route to|route from|how do i reach|how can i reach|go from|go to)\b/.test(q)||/\bfrom\s+.+?\s+to\s+.+/.test(q))return "travel";
  if(/\b(drop|drops|loot|dropped by)\b/.test(q))return "drops";
  if(/\b(used for|use it for|use this for|what can i make with|what can .* be used for|uses of|what is .* for|lead to|leads to|downstream|turn into|eventually make)\b/.test(q))return "uses";
  if(/\b(materials?|ingredients?|from scratch|smelt|forge|craft|make|recipe|how many .* (?:bar|ore|coal|log|plank))\b/.test(q))return "materials";
  if(/\b(compare|versus|\bvs\b|difference between)\b/.test(q))return "compare";
  if(/\b(bed|beds|sleep in|rest in)\b/.test(q) && entities.some(e=>e.type==="area"))return "beds";
  if(/\b(monsters?|enemies)\b/.test(q) && entities.some(e=>e.type==="area"))return "monsters_in_area";
  if(/\b(where|location|located|find|obtain|source|sources|get|mine|fish|chop|dig)\b/.test(q))return "locate";
  if(/\b(how does|how do|explain|mechanic|works?|what happens|ticks?|cooldown|sleep points?|run energy|dodge|weakness)\b/.test(q)||(/\b(run|running)\b/.test(q)&&/\b(agility|combat|level|steps?)\b/.test(q)))return "mechanics";
  if(/\b(unlock|progression|at level|by level|can i equip|can i make)\b/.test(q))return "progression";
  return "info";
}
function ruleForQuestion(q){
  if(/\bsleep(?: points?)?\b/.test(q) && !/\bbed/.test(q))return rule("sleep.core");
  if(/\b(run|running|run energy|run steps?)\b/.test(q))return rule("agility.run");
  if(/\bdodge\b/.test(q))return rule("agility.dodge");
  if(/\b(mining).*(speed|tick)|\b(speed|tick).*(mining)\b/.test(q))return rule("mining.speed");
  if(/\bwoodcutting.*speed|\bspeed.*woodcutting\b/.test(q))return rule("woodcutting.speed");
  if(/\bworship(?: points?)?\b/.test(q))return rule("worship.core");
  if(/\bachievement.*sleep|sleep.*achievement|achievement.*damage\b/.test(q))return rule("achievements.sleep_damage");
  if(/\b(defence|defense|magic defence|magic defense)\b/.test(q) && /\b(melee|archery|magic|combat)\b/.test(q))return rule("combat.defence");
  if(/\b(hit chance|dps|kill time|surviv|recommended combat|damage formula|combat formula)\b/.test(q))return rule("combat.formulas");
  if(/\bweakness(?:es)?\b/.test(q) && !resolveEntities(q,{types:["monster"],limit:1}).length)return rule("combat.weakness");
  return null;
}
function genericCollection(q){
  if(/\bskills?\b/.test(q))return "skills";
  if(/\bquests?\b/.test(q))return "quests";
  if(/\bareas?|regions?|locations?\b/.test(q))return "areas";
  if(/\bmonsters?|enemies\b/.test(q))return "monsters";
  if(/\bmechanics?|rules\b/.test(q))return "mechanics";
  return null;
}
function collectionAnswer(kind,intent){
  let rows=[],note="";
  if(kind==="skills")rows=state.data.skills.records||[];
  if(kind==="quests"){rows=state.data.quests.records||[];note="The public context contains 19 normalized core quests plus 2 conservative observation-backed quest placeholders."}
  if(kind==="areas")rows=state.data.areas.records||[];
  if(kind==="monsters")rows=state.data.monsters.records||[];
  if(kind==="mechanics")rows=state.data.mechanics.records||[];
  const label=kind[0].toUpperCase()+kind.slice(1);
  if(intent==="count")return `<h3>${label}</h3><p>The Companion currently represents <b>${rows.length}</b> ${esc(kind)}.</p>${note?`<p class="muted small">${esc(note)}</p>`:""}${chips(kind==="skills"?["List the skills"]:kind==="quests"?["List the quests"]:[])}`;
  const names=rows.map(x=>title(x.name)).sort((a,b)=>a.localeCompare(b));
  return `<h3>${label} (${rows.length})</h3><p>${esc(names.join(", "))}</p>${note?`<p class="muted small">${esc(note)}</p>`:""}`;
}
function monsterProfile(m){
  state.lastEntity={type:"monster",obj:m};
  const stats=[["HP",m.hp],["Damage",m.damage],["Accuracy",m.accuracy],["Defence",m.defence],["Magic Defence",m.magic_defence],["Weakness",m.weakness||"None recorded"]];
  const drops=(m.drops||[]).slice(0,8);
  return `<h3>${esc(title(m.name))}</h3><p>${esc(title(m.name))} is recorded in <b>${esc(m.area||"an unknown area")}</b>. Its current structured combat stats are:</p>
    <div class="grid">${stats.map(([a,b])=>`<div class="stat"><span class="kicker">${esc(a)}</span><b>${esc(b)}</b></div>`).join("")}</div>
    ${drops.length?`<p>It has ${drops.length} recorded drop${drops.length===1?"":"s"} in this dataset.</p>`:""}
    ${chips([`What does ${title(m.name)} drop?`,`Where is ${title(m.name)}?`,`How should I fight ${title(m.name)}?`])}
    ${evidence(["https://flatmmo.wiki/index.php/Monsters"],["Monster bootstrap data is still marked for an official-endpoint refresh."])}`;
}
function monsterDrops(m){
  state.lastEntity={type:"monster",obj:m};
  const drops=m.drops||[];
  return `<h3>${esc(title(m.name))} drops</h3>${drops.length?`<p>The Companion records the following drops:</p><ul>${drops.map(d=>`<li>${esc(fmtDrop(d))}${d.unique?" <span class='muted'>(unique)</span>":""}</li>`).join("")}</ul>`:`<p class="warn">No drops are recorded for this monster.</p>`}${chips([`Where is ${title(m.name)}?`,`Tell me about ${title(m.name)}`])}${evidence(["https://flatmmo.wiki/index.php/Monsters"])}`;
}
function monsterWhere(m){
  state.lastEntity={type:"monster",obj:m};
  const rooms=(m.roomRefs||[]).map(r=>{const hit=state.roomById?.get(r.roomId);return hit?`${hit.area.name} → ${hit.room.name}`:r.roomId});
  return `<h3>Where to find ${esc(title(m.name))}</h3>${rooms.length?`<p>I have ${rooms.length} exact room link${rooms.length===1?"":"s"}:</p><ul>${unique(rooms).map(x=>`<li>${esc(x)}</li>`).join("")}</ul>${m.area?`<p class="muted small">Its bootstrap area label is ${esc(m.area)}; retained source disagreements are not silently overwritten.</p>`:""}`:`<p>The broad recorded area is <b>${esc(m.area||"unknown")}</b>, but the Companion has no exact room link yet.</p>`}${evidence([], [m.roomLinkStatus==="linked"?"Exact room links are structured Companion relationships.":"Location coverage is incomplete."])}`;
}
function monsterCombat(m){
  state.lastEntity={type:"monster",obj:m};
  const formulas=rule("combat.formulas"),parts=[];
  if(m.weakness)parts.push(`<p><b>Listed weakness:</b> ${esc(title(m.weakness))}. A listed weakness is documented to improve hit chance and damage.</p>`);
  else parts.push(`<p><b>Weakness:</b> none recorded.</p>`);
  parts.push(`<p>Its physical <b>Defence is ${esc(m.defence)}</b>; its <b>Magic Defence is ${esc(m.magic_defence)}</b>.</p>`);
  if(!m.weakness&&Number(m.magic_defence)<Number(m.defence))parts.push(`<p>Magic faces the lower defensive stat here. That is a defence-stat observation, not a recorded elemental/style weakness.</p>`);
  else if(!m.weakness&&Number(m.defence)<Number(m.magic_defence))parts.push(`<p>Melee and Archery face the lower defensive stat here. Defence alone does not let the Companion choose between those two styles.</p>`);
  if(state.player){const levels=["Melee","Archery","Magic"].map(n=>[n,playerSkill(n)?.level]).filter(x=>x[1]!=null);if(levels.length)parts.push(`<p><b>Your known combat levels:</b> ${levels.map(([n,l])=>`${esc(n)} ${esc(l)}`).join(" · ")}</p>`)}
  parts.push(`<p class="warn">I can't calculate an exact hit chance, DPS, kill time, survival probability or recommended combat level yet because the required combat formulas are unresolved.</p>`);
  return `${playerBasis()}<h3>Fighting ${esc(title(m.name))}</h3>${parts.join("")}${evidence(["https://flatmmo.wiki/index.php/Monsters"],[...(formulas?.unknowns||[])])}`;
}
function bedsAnswer(area){
  const areas=area?[area]:state.data.areas.records,hits=[];
  for(const a of areas||[])for(const r of a.rooms||[])if((r.bedCount||0)>0||r.bedStatus==="documented_present")hits.push({area:a.name,room:r.name,count:r.bedCount});
  if(area)state.lastEntity={type:"area",obj:area};
  if(!hits.length)return `<h3>Bed locations</h3><p class="warn">No documented bed was found for ${esc(area?.name||"that location")}. “Not documented” is not treated as proof that no bed exists.</p>`;
  return `<h3>${area?`Beds in ${esc(area.name)}`:"Documented beds"}</h3><p>${area?`I found ${hits.length} documented sleeping location${hits.length===1?"":"s"}.`:"These are the explicitly documented bed locations."}</p><ul>${hits.map(x=>`<li>${esc(x.area)} → ${esc(x.room)}${x.count?` (${x.count})`:""}</li>`).join("")}</ul>${evidence([],["Only rooms with an explicitly documented bed are included."])}`;
}
function ruleAnswer(r){
  if(!r)return `<h3>Mechanic not resolved</h3><p>I couldn't match that question to a verified mechanics rule.</p>`;
  state.lastEntity={type:"rule",obj:r};
  return `<h3>${esc(r.name)}</h3>${(r.facts||[]).map(x=>`<p>${esc(x)}</p>`).join("")}${r.known?`<p><b>Known:</b></p><ul>${r.known.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:""}${r.observations?`<p><b>Direct observations:</b></p><ul>${r.observations.map(x=>`<li>${esc(x.fact)}</li>`).join("")}</ul>`:""}${r.unknowns?`<p class="warn"><b>Still unresolved:</b></p><ul>${r.unknowns.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:""}${evidence(r.sources||[],r.policy?[r.policy]:[])}`;
}
function mechanicAnswer(m){return `<h3>${esc(m.name)}</h3><p>${esc(m.summary||"")}</p>${evidence([m.source].filter(Boolean))}`}
function resourceLocations(name){return state.resourceMap?.get(norm(name))||[]}
function dropSources(name){return state.dropMap?.get(norm(name))||[]}
function acquisitionSources(name){return state.acquisitionMap?.get(norm(name))||[]}
function itemRecord(name){return state.itemByName?.get(norm(name))||null}
function itemMaterialsText(mats={}){return Object.entries(mats).map(([k,v])=>`${title(k)} ×${v}`).join(", ")}
function sourceLine(h){
  const a=h.source||{},type=h.kind||a.type;
  if(type==="monster_drop"){
    const amt=a.min==null?"":a.min===a.max?` ×${a.min}`:` ×${a.min}–${a.max}`;
    const rarity=a.rarityDenominator==null?"":a.rarityDenominator===1?" · always":` · 1/${a.rarityDenominator}`;
    return `${a.monster||"Monster"}${a.area?` (${a.area})`:""}${amt}${rarity}`;
  }
  if(type==="world_resource")return `${a.area||"Unknown area"}${a.room?` → ${a.room}`:""}${a.skill&&a.level!=null?` · ${a.skill} ${a.level}`:""}${a.tool?` · tool: ${a.tool}`:""}${a.activity?` · ${title(a.activity)}`:""}`;
  if(type==="shop"){
    const shownPrice=a.price!=null?fmtNumber(a.price):(a.priceText??"?");
    const price=a.currency?`${shownPrice} ${a.currency}`:a.priceText!=null?`price ${shownPrice} (currency not labelled in source)`:"price not recorded";
    const stock=a.maxStock!=null?` · stock ${a.maxStock}`:"";
    return `${a.area?`${a.area} → `:""}${a.shop||"Shop"} — ${price}${stock}${a.access?` · ${a.access}`:""}`;
  }
  if(type==="pickpocket")return `${a.victim||"NPC"}${a.area?` — ${a.area}${a.location?` (${a.location})`:""}`:""} · Stealing ${a.level??"?"}${a.rarity?` · ${a.rarity}${a.rarityDenominator?` (1/${a.rarityDenominator})`:""}`:""}`;
  if(type==="stall")return `${a.stall||"Stall"}${a.area?` — ${a.area}${a.location?` (${a.location})`:""}`:""} · Stealing ${a.level??"?"}${a.dropChance?` · ${a.dropChance}`:" · drop chance not documented"}${a.access?` · ${a.access}`:""}`;
  if(type==="map_chest")return `${a.chest||a.location||"Chest"} · Stealing ${a.level??"?"}${a.oneTime?" · one-time chest":""}`;
  if(type==="rogue_chest")return `${a.activity||"Rogue chest"}${a.area?` — ${a.area}`:""}${a.levelRange?` · Stealing ${a.levelRange}`:""}`;
  if(type==="farming")return `Farming ${a.level??"?"} from ${a.seed||"seed"}${a.growthTime?` · ${a.growthTime}`:""}${a.yieldPerHarvest?` · ${a.yieldPerHarvest}/harvest`:""}`;
  if(["production","smelting","enchantment","brewing","cooking","conversion"].includes(type))return `${a.skill||title(type)}${a.level!=null?` ${a.level}`:""}${a.materials?` · ${itemMaterialsText(a.materials)}`:""}${a.outputQuantity&&a.outputQuantity!==1?` → ×${a.outputQuantity}`:""}${a.location?` · ${a.location}`:""}`;
  if(type==="quest_reward")return `${a.quest||"Quest"}${a.quantity?` · ×${a.quantity}`:""}`;
  if(type==="spirit_reward")return `${a.spirit||"Spirit"}${a.area?` — ${a.area}`:""}${a.currency?` · redeem ${a.currency}`:""}`;
  if(type==="event_reward")return `${a.event||"Community event"}`;
  if(type==="bundle_reward")return `${a.bundle||"Bundle"}${a.milestoneTasks?` · ${a.milestoneTasks} tasks`:""}${a.quantity?` · ×${a.quantity}`:""}`;
  if(type==="npc_service")return `${a.area?`${a.area} — `:""}${a.npc||"NPC service"}${a.materials?` · ${itemMaterialsText(a.materials)}`:""}`;
  if(type==="npc_trade")return `${a.area?`${a.area} — `:""}${a.npc||"NPC trade"}${a.materials?` · exchange: ${itemMaterialsText(a.materials)}`:""}`;
  if(type==="special_source")return a.method||a.note||"Special source";
  return a.note||title(type||"source");
}
const ACQ_LABELS={world_resource:"World/resource locations",shop:"Shops",pickpocket:"Pickpocketing",stall:"Stealing stalls",map_chest:"One-time Stealing chests",rogue_chest:"Rogue chests",farming:"Farming",production:"Crafting/production",smelting:"Smelting",enchantment:"Enchantment",brewing:"Brewing",cooking:"Cooking",conversion:"Conversion",quest_reward:"Quest rewards",spirit_reward:"Spirit rewards",event_reward:"Community events",bundle_reward:"Bundle rewards",npc_service:"NPC services",npc_trade:"NPC trades",monster_drop:"Monster drops",special_source:"Special sources"};
function acquisitionFilter(q,all){
  const nq=norm(q),avoidCombat=/\b(other than combat|besides combat|without combat|avoid combat|non combat|other than fighting|besides fighting|without fighting|avoid fighting)\b/.test(nq);
  let allowed=null;
  if(/\b(buy|purchase|price|cost|sold|shop|store)\b/.test(nq))allowed=new Set(["shop"]);
  else if(/\b(pickpocket)\b/.test(nq))allowed=new Set(["pickpocket"]);
  else if(/\b(steal|stealing|stall|chest)\b/.test(nq))allowed=new Set(["pickpocket","stall","map_chest","rogue_chest"]);
  else if(/\b(farm|farming|grow|plant)\b/.test(nq))allowed=new Set(["farming"]);
  else if(/\b(craft|forge|smelt|brew|cook|make|recipe)\b/.test(nq))allowed=new Set(["production","smelting","enchantment","brewing","cooking","conversion","npc_service"]);
  let out=allowed?all.filter(x=>allowed.has(x.kind)):all.slice();
  if(avoidCombat)out=out.filter(x=>x.kind!=="monster_drop");
  return {sources:out,avoidCombat,filtered:!!allowed};
}
function resourceAnswer(name,q=""){
  const all=acquisitionSources(name),{sources,avoidCombat,filtered}=acquisitionFilter(q,all),bits=[];
  const order=["world_resource","farming","shop","npc_service","npc_trade","pickpocket","stall","map_chest","rogue_chest","production","smelting","enchantment","brewing","cooking","conversion","quest_reward","spirit_reward","event_reward","bundle_reward","special_source","monster_drop"];
  const by=new Map();for(const h of sources){if(!by.has(h.kind))by.set(h.kind,[]);by.get(h.kind).push(h)}
  for(const kind of order){const rows=by.get(kind)||[];if(!rows.length)continue;const shown=rows.slice(0,30);bits.push(`<p><b>${esc(ACQ_LABELS[kind]||title(kind))}:</b></p><ul>${shown.map(h=>`<li>${esc(sourceLine(h))}</li>`).join("")}</ul>${rows.length>shown.length?`<p class="muted small">${rows.length-shown.length} more recorded ${esc((ACQ_LABELS[kind]||kind).toLowerCase())} omitted from this compact answer.</p>`:""}`)}
  const item=itemRecord(name),sourceUrls=unique((sources.length?sources:all).map(h=>h.source?.source).filter(Boolean));
  if(!bits.length){
    if(avoidCombat&&all.some(x=>x.kind==="monster_drop"))return `<h3>Non-combat sources for ${esc(title(name))}</h3><p>I don't currently have an <b>item-specific non-combat source recorded</b> for ${esc(title(name))}.</p><p class="muted small">That means “not documented in the Companion,” not proof that no non-combat method exists in FlatMMO.</p>${evidence(sourceUrls,["The first-class item graph covers shops, Stealing, Farming, production, quests, spirits, events, bundles, world nodes and monster drops."])}`;
    return `<h3>${esc(title(name))}</h3><p class="warn">I can identify that item, but I don't have a matching item-specific source for the method you asked about.</p>${all.length?`<p class="muted small">There are ${all.length} other recorded acquisition route${all.length===1?"":"s"}; ask “how do I get ${esc(title(name))}?” to see them.</p>`:""}${evidence(sourceUrls,["Missing source types are not treated as proof that the method does not exist in the game."])}`;
  }
  const heading=avoidCombat?`Non-combat sources for ${title(name)}`:filtered?`Matching sources for ${title(name)}`:`How to get ${title(name)}`;
  const useHint=item?.uses?.length?chips([`What is ${title(name)} used for?`]):"";
  return `<h3>${esc(heading)}</h3>${bits.join("")}${useHint}${evidence(sourceUrls,["Item-specific sources are normalized in flatmmo-items.json. Unknown rates, prices or source types remain explicitly unknown rather than guessed."])}`;
}
function itemUseAnswer(name){
  const item=itemRecord(name);if(!item)return `<h3>${esc(title(name))}</h3><p class="warn">I don't have a first-class item record for that yet.</p>`;
  const uses=item.uses||[];if(!uses.length)return `<h3>Uses for ${esc(item.name)}</h3><p>I don't currently have a structured use recorded for this item.</p><p class="muted small">That is a knowledge gap, not proof the item has no use.</p>`;
  const material=uses.filter(x=>x.type==="material_for"),grow=uses.filter(x=>x.type==="plant_to_grow"||x.type==="plant_tree"),bits=[];
  if(material.length)bits.push(`<p><b>Used as a material for:</b></p><ul>${material.slice(0,35).map(u=>`<li>${esc(u.output)}${u.quantity!=null?` — needs ${esc(u.quantity)}`:""}${u.skill?` · ${esc(u.skill)}${u.level!=null?` ${esc(u.level)}`:""}`:""}</li>`).join("")}</ul>${material.length>35?`<p class="muted small">${material.length-35} additional structured recipe uses omitted from this compact answer.</p>`:""}`);
  if(grow.length)bits.push(`<p><b>Farming:</b></p><ul>${grow.map(u=>`<li>Plant to grow ${esc(u.output)}${u.level!=null?` · Farming ${esc(u.level)}`:""}${u.growthTime?` · ${esc(u.growthTime)}`:""}</li>`).join("")}</ul>`);
  const urls=unique(uses.map(u=>u.source).filter(Boolean));
  return `<h3>Uses for ${esc(item.name)}</h3>${bits.join("")}${chips([`How do I get ${item.name}?`])}${evidence(urls,["Only structured uses are listed; undocumented uses are not assumed absent."])}`;
}
function itemOverviewAnswer(name){
  const item=itemRecord(name);if(!item)return resourceAnswer(name,"");
  return `<h3>${esc(item.name)}</h3><p>I have <b>${item.acquisition?.length||0}</b> recorded acquisition route${item.acquisition?.length===1?"":"s"} and <b>${item.uses?.length||0}</b> structured use${item.uses?.length===1?"":"s"} for this item.</p>${chips([`How do I get ${item.name}?`,`What is ${item.name} used for?`])}`;
}
function shopInventoryAnswer(areaOrShop){
  const isArea=areaOrShop?.type==="area",isShop=areaOrShop?.type==="shop";
  const areaName=isArea?areaOrShop.name:(isShop?(areaOrShop.area||areaOrShop.obj?.area||null):areaOrShop?.area||null);
  const shopName=isShop?areaOrShop.name:null;
  let shops=[...state.shopIndex.values()].filter(sh=>(!areaName||norm(sh.area)===norm(areaName))&&(!shopName||norm(sh.name)===norm(shopName)));
  if(!shops.length)return `<h3>Shop inventory</h3><p class="warn">I don't have an item-specific shop inventory matching that location yet.</p>`;
  const heading=shopName&&areaName?`${areaName} → ${shopName}`:shopName||`Shops in ${areaName}`;
  return `<h3>${esc(heading)}</h3>${shops.map(sh=>`<p><b>${esc(sh.area?`${sh.area} → ${sh.name}`:sh.name)}</b></p><ul>${sh.items.sort((a,b)=>a.item.localeCompare(b.item)).map(x=>`<li>${esc(x.item)} — ${esc(sourceLine({kind:"shop",source:x.source}))}</li>`).join("")}</ul>`).join("")}`;
}
function stealingProgressionAnswer(level){
  const by=new Map();
  for(const row of state.stealingIndex||[]){const a=row.source,lvl=Number(a.level);if(!Number.isFinite(lvl)||lvl>level||!['pickpocket','stall','map_chest'].includes(a.type))continue;const key=`${a.type}|${a.victim||a.stall||a.chest||a.location||'activity'}|${lvl}`;if(!by.has(key))by.set(key,{type:a.type,name:a.victim||a.stall||a.chest||a.location||'Activity',level:lvl,area:a.area,items:[]});by.get(key).items.push(row.item)}
  const rows=[...by.values()].sort((a,b)=>a.level-b.level||a.name.localeCompare(b.name));
  if(!rows.length)return `<h3>Stealing ${esc(level)}</h3><p>No item-specific Stealing activities are indexed at or below that level.</p>`;
  return `<h3>Stealing options by level ${esc(level)}</h3><p>These item-specific activities are recorded at or below Stealing ${esc(level)}:</p><ul>${rows.map(r=>`<li><b>${esc(r.name)}</b> — level ${esc(r.level)}${r.area?` · ${esc(r.area)}`:""}: ${esc(unique(r.items).slice(0,12).join(", "))}${unique(r.items).length>12?"…":""}</li>`).join("")}</ul><p class="muted small">This is an unlock/source index, not an XP-rate recommendation.</p>`;
}
function npcAnswer(e){
  const n=e.obj,room=e.room||state.roomById?.get(n.roomId)?.room,area=e.area||state.roomById?.get(n.roomId)?.area;
  return `<h3>${esc(n.name)}</h3><p>${area?`You can find ${esc(n.name)} in <b>${esc(area.name)}${room?` → ${esc(room.name)}`:""}</b>.`:"The exact location is not linked."}</p>${n.functions?.length?`<p><b>Functions:</b> ${esc(n.functions.map(title).join(", "))}.</p>`:""}${n.details?`<p>${esc(n.details)}</p>`:""}`;
}
function roomAnswer(e){
  const r=e.obj,a=e.area||state.roomById?.get(r.id)?.area;
  const resources=(r.resourceNodes||[]).map(x=>x.resource).filter(Boolean);
  return `<h3>${esc(a?`${a.name} → ${r.name}`:r.name)}</h3>${r.services?.length?`<p><b>Services:</b> ${esc(r.services.map(title).join(", "))}.</p>`:""}${r.features?.length?`<p><b>Features:</b> ${esc(r.features.join(", "))}.</p>`:""}${resources.length?`<p><b>Resources:</b> ${esc(unique(resources).join(", "))}.</p>`:""}${r.accessRequirements?.length?`<p><b>Access:</b> ${esc(r.accessRequirements.join("; "))}.</p>`:""}${r.bedStatus==="documented_present"?`<p>A bed is documented here${r.bedCount?` (${esc(r.bedCount)})`:""}.</p>`:""}`;
}
function serviceAnswer(q,area=null){
  const keys=[...state.serviceMap.keys()].filter(k=>norm(q).includes(k));
  if(/\bbank\b/.test(q)&&!keys.includes("bank"))keys.push("bank");
  if(/\bshop|store\b/.test(q)&&!keys.includes("shop"))keys.push("shop");
  if(/\btravel|boat|teleport\b/.test(q)&&!keys.includes("travel"))keys.push("travel");
  const hits=[];for(const k of keys)for(const h of state.serviceMap.get(k)||[])if(!area||norm(h.area.name)===norm(area.name))hits.push({...h,key:k});
  const uniqueHits=[];const seen=new Set();for(const h of hits){const id=`${h.area.name}:${h.room?.id||h.npc?.id||h.key}`;if(!seen.has(id)){seen.add(id);uniqueHits.push(h)}}
  if(!uniqueHits.length)return null;
  return `<h3>${area?`Services in ${esc(area.name)}`:"Matching services"}</h3><ul>${uniqueHits.slice(0,20).map(h=>`<li>${esc(h.area.name)}${h.room?` → ${esc(h.room.name)}`:""}${h.npc?` — ${esc(h.npc.name)}`:""} (${esc(title(h.key))})</li>`).join("")}</ul>`;
}
function parseLevelRequirement(req){
  const s=String(req),labels=[...KNOWN_SKILLS,"Firemake"].sort((a,b)=>b.length-a.length),pattern=labels.map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");
  let m=s.match(new RegExp(`(?:level\\s*)?(\\d+)\\s+(${pattern})\\b`,"i"));if(m)return {level:Number(m[1]),skill:canonicalSkillName(m[2])};
  m=s.match(new RegExp(`\\b(${pattern})\\s+(?:level\\s*)?(\\d+)\\b`,"i"));if(m)return {level:Number(m[2]),skill:canonicalSkillName(m[1])};return null;
}
function requirementCheck(skill,level,overrides={}){
  const known=knownSkillLevel(skill,overrides,{});
  if(!known)return {status:"unknown",text:`${skill} ${level} — no player level supplied`};
  const have=Number(known.level),basis=known.basis||"known";
  const label=basis==="your"?`your level ${have}`:basis==="stated"?`stated level ${have}`:basis==="question limit"?`level ${have} for this question`:`${basis} level ${have}`;
  return have>=level?{status:"good",text:`${skill} ${level} — ${label} ✓`}:{status:"bad",text:`${skill} ${level} — ${label}; need ${level-have} more`};
}
function questAnswer(qst,readiness=false,overrides={}){
  state.lastEntity={type:"quest",obj:qst};
  const reqs=qst.requirements||[],checks=reqs.map(r=>{const parsed=parseLevelRequirement(r);return {raw:r,parsed,check:parsed?requirementCheck(parsed.skill,parsed.level,overrides):null}});
  const checkHtml=checks.map(x=>{if(!x.parsed)return `<li>${esc(x.raw)}${(state.player||Object.keys(overrides).length||Object.keys(state.conversation.userFacts?.skills||{}).length)?" <span class='muted'>— ownership/access not available from known player data</span>":""}</li>`;const c=x.check;return `<li class="${c.status}">${esc(c.text)}</li>`}).join("");
  let readinessLead="";
  if(readiness&&checks.some(x=>x.parsed)){
    const known=checks.filter(x=>x.check&&x.check.status!=="unknown"),bad=known.filter(x=>x.check.status==="bad"),unknown=checks.filter(x=>x.parsed&&x.check?.status==="unknown");
    if(bad.length)readinessLead=`<p><b>Not quite on the recorded skill requirements.</b> ${bad.length===1?"There’s one known skill gate you don’t meet yet.":`There are ${bad.length} known skill gates you don’t meet yet.`}</p>`;
    else if(known.length&&unknown.length===0)readinessLead=`<p><b>On the recorded skill requirements, yes.</b> That still isn’t the same as proving full quest readiness.</p>`;
    else readinessLead=`<p><b>I can only check part of your readiness from what I currently know.</b></p>`;
  }
  return `${playerBasis()}<h3>${esc(qst.name)}</h3>${readinessLead}<p><b>Difficulty:</b> ${esc(qst.difficulty||"Unknown")}</p>${reqs.length?`<p><b>${readiness?"Readiness":"Requirements"}:</b></p><ul>${checkHtml}</ul>`:""}${qst.rewards?.length?`<p><b>Rewards:</b></p><ul>${qst.rewards.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:""}${qst.procedure?.length?`<p><b>Procedure:</b></p><ol>${qst.procedure.map((x,i)=>{const g=qst.procedureGraph?.[i],rooms=(g?.roomIds||[]).map(id=>state.roomById?.get(id)).filter(Boolean).map(h=>`${h.area.name} → ${h.room.name}`);return `<li>${esc(x)}${rooms.length?` <span class="muted">(${esc(unique(rooms).join(" / "))})</span>`:""}</li>`}).join("")}</ol>`:`<p class="warn">I don’t have the procedure documented yet, so I won’t make one up.</p>`}${(state.player||Object.keys(overrides).length||Object.keys(state.conversation.userFacts?.skills||{}).length)&&readiness?`<p class="muted small">Skill readiness is only part of readiness: item ownership, access and quest completion may still be unknown.</p>`:""}${evidence([qst.source].filter(Boolean),qst.verificationNote?[qst.verificationNote]:[])}`;
}
function areaAnswer(a){
  state.lastEntity={type:"area",obj:a};const services=unique((a.rooms||[]).flatMap(r=>r.services||[]));
  return `<h3>${esc(a.name)}</h3>${a.gettingThere?`<p><b>Getting there:</b> ${esc(a.gettingThere)}</p>`:""}${a.requirements?.length?`<p><b>Requirements:</b> ${esc(a.requirements.join("; "))}</p>`:""}<p>I have <b>${(a.rooms||[]).length}</b> documented rooms/sub-locations here.</p>${services.length?`<p><b>Recorded services:</b> ${esc(services.map(title).join(", "))}.</p>`:""}${chips([`Where can I sleep in ${a.name}?`,`What monsters are in ${a.name}?`,`What services are in ${a.name}?`])}${evidence([a.source],a.coverage==="partial"?["Area coverage is partial."]:[])}`;
}
function skillAnswer(sk){
  state.lastEntity={type:"skill",obj:sk};const mine=playerSkill(sk.name);
  return `${playerBasis()}<h3>${esc(sk.name)}</h3>${mine?`<p><b>Your known level:</b> ${esc(mine.level)} · ${mine.xp==null?"XP unknown":esc(fmtNumber(mine.xp))+" XP"}</p>`:""}<p>${esc(sk.training||"")}</p>${sk.keyRules?.length?`<ul>${sk.keyRules.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:""}${evidence([sk.source])}`;
}
function expandedMaterials(mats,depth=2){
  const totals={};
  const add=(k,v,d)=>{const prod=d>0?state.productionMap?.get(norm(title(k))):null;if(prod?.materials){for(const [sub,n] of Object.entries(prod.materials))add(sub,v*Number(n),d-1)}else totals[k]=(totals[k]||0)+v};
  for(const [k,v] of Object.entries(mats||{}))add(k,Number(v),depth);return totals;
}
function equipmentAnswer(e,q="",overrides={}){
  state.lastEntity={type:"equipment",obj:e};const x=e.obj,mats=x.materials||x.setMaterialTotals;let checks="";
  if(x.equipSkill&&x.equipLevel!=null){const c=requirementCheck(x.equipSkill,x.equipLevel,overrides);checks+=`<p class="${c.status}"><b>Equip check:</b> ${esc(c.text)}</p>`}
  if(x.craftSkill&&x.craftLevel!=null){const c=requirementCheck(x.craftSkill,x.craftLevel,overrides);checks+=`<p class="${c.status}"><b>Make check:</b> ${esc(c.text)}</p>`}
  const wantsRaw=/\b(from scratch|raw|smelt|every|ore|coal)\b/.test(q),raw=wantsRaw&&mats?expandedMaterials(mats,2):null;
  return `${playerBasis()}<h3>${esc(e.name)}</h3>${x.style?`<p><b>Style:</b> ${esc(title(x.style))}</p>`:""}${x.damage!=null?`<p><b>Damage:</b> ${esc(x.damage)}${x.accuracy!=null?` · <b>Accuracy:</b> ${esc(x.accuracy)}`:""}</p>`:""}${x.equipSkill?`<p><b>Equip:</b> ${esc(x.equipSkill)} ${esc(x.equipLevel??"unknown")}</p>`:""}${x.craftSkill?`<p><b>Make:</b> ${esc(x.craftSkill)} ${esc(x.craftLevel??"unknown")}</p>`:""}${checks}${mats?`<p><b>Structured materials:</b></p><ul>${Object.entries(mats).map(([k,v])=>`<li>${esc(title(k))}: ${esc(v)}</li>`).join("")}</ul>`:""}${raw?`<p><b>Expanded raw materials from known production recipes:</b></p><ul>${Object.entries(raw).map(([k,v])=>`<li>${esc(title(k))}: ${esc(v)}</li>`).join("")}</ul>`:""}${state.player&&mats?`<p class="muted small">Material ownership cannot be checked until bank/inventory data is available.</p>`:""}${evidence(x.sources||[x.source].filter(Boolean),x.note?[x.note]:[])}`;
}
function monstersInArea(a){
  state.lastEntity={type:"area",obj:a};const names=unique((a.rooms||[]).flatMap(r=>(r.monsterRefs||[]).map(x=>{const id=(x&&typeof x==="object")?x.monsterId:x;return title(String(id||"").replace(/^monster\./,""))})));
  return `<h3>Monsters in ${esc(a.name)}</h3>${names.length?`<p>I have ${names.length} exact room-linked monster name${names.length===1?"":"s"}:</p><ul>${names.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:`<p class="warn">No exact room-linked monsters are recorded for this area.</p>`}${evidence([],["This uses exact room relationships, so it may omit monsters whose precise room is not yet linked."])}`;
}
function skillProgressionAnswer(skill,level){
  const key=norm(skill.name),equip=[],make=[];
  for(const e of state.data.equipmentFlat||[]){const x=e.obj;if(norm(x.equipSkill)===key&&x.equipLevel!=null&&x.equipLevel<=level)equip.push({name:e.name,level:x.equipLevel});if(norm(x.craftSkill)===key&&x.craftLevel!=null&&x.craftLevel<=level)make.push({name:e.name,level:x.craftLevel})}
  equip.sort((a,b)=>a.level-b.level||a.name.localeCompare(b.name));make.sort((a,b)=>a.level-b.level||a.name.localeCompare(b.name));
  return `<h3>${esc(skill.name)} ${esc(level)} progression</h3>${equip.length?`<p><b>Recorded equipment you can equip by this level:</b></p><ul>${equip.map(x=>`<li>${esc(x.name)} — ${esc(skill.name)} ${esc(x.level)}</li>`).join("")}</ul>`:""}${make.length?`<p><b>Recorded items whose production requirement uses ${esc(skill.name)}:</b></p><ul>${make.map(x=>`<li>${esc(x.name)} — ${esc(skill.name)} ${esc(x.level)}</li>`).join("")}</ul>`:""}${!equip.length&&!make.length?`<p>No structured equipment unlocks are indexed for this level.</p>`:""}`;
}
function nearestUnlocks(){
  if(!state.player)return null;const choices=[];for(const e of state.data.equipmentFlat){const x=e.obj;for(const [kind,skill,level] of [["equip",x.equipSkill,x.equipLevel],["craft",x.craftSkill,x.craftLevel]]){if(!skill||level==null)continue;const rec=playerSkill(skill);if(!rec||rec.level>=level)continue;choices.push({delta:level-rec.level,name:e.name,kind,skill,need:level,have:rec.level})}}choices.sort((a,b)=>a.delta-b.delta||a.need-b.need||a.name.localeCompare(b.name));return choices.slice(0,6);
}
function skillReadyQuests(){
  if(!state.player)return [];const out=[];for(const q of state.data.quests.records||[]){const parsed=(q.requirements||[]).map(parseLevelRequirement).filter(Boolean);if(!parsed.length)continue;if(parsed.every(r=>playerSkill(r.skill)?.level>=r.level))out.push(q)}return out.slice(0,6);
}
function playerAware(){
  if(!state.player)return `<h3>Load a player for personal suggestions</h3><p>I can make deterministic suggestions from known skill levels once you load a public profile or use <b>Enter skill levels</b>.</p><p class="muted small">Bank, inventory, equipment and quest state remain unknown until the official API is connected.</p>`;
  const unlocks=nearestUnlocks()||[],quests=skillReadyQuests();return `${playerBasis()}<h3>What you could work toward next</h3><p>This is a stats-only suggestion set for ${esc(state.player.username||"this session")}. I won't pretend to know your bank, inventory, equipped gear or completed quests.</p>${unlocks.length?`<p><b>Nearest structured equipment/crafting unlocks:</b></p><ul>${unlocks.map(x=>`<li>${esc(x.name)} — ${esc(title(x.kind))}: ${esc(x.skill)} ${esc(x.need)}; ${esc(x.delta)} level${x.delta===1?"":"s"} away</li>`).join("")}</ul>`:"<p>No nearby structured equipment unlocks were found.</p>"}${quests.length?`<p><b>Quests whose structured skill requirements you meet:</b></p><ul>${quests.map(q=>`<li>${esc(q.name)}</li>`).join("")}</ul>`:""}<p class="muted small">“Skill-ready” is not the same as fully ready: items, access and completion state may still matter.</p>`;
}
function travelAnswer(areas){
  const uniqueAreas=[];
  for(const e of areas){
    const a=e.obj||e;
    if(a?.name&&!uniqueAreas.some(x=>norm(x.name)===norm(a.name)))uniqueAreas.push(a);
  }
  if(uniqueAreas.length<2){
    const dest=uniqueAreas[0]; if(!dest)return null;
    const incoming=[];
    for(const a of state.data.areas.records||[]){
      for(const edge of a.externalConnections||[]){
        if(norm(edge.area)===norm(dest.name))incoming.push({from:a,edge});
      }
    }
    let html=`<h3>Getting to ${esc(dest.name)}</h3>`;
    if(dest.gettingThere)html+=`<p>${esc(dest.gettingThere)}</p>`;
    if(incoming.length){
      html+=`<p><b>Documented direct approaches:</b></p><ul>`;
      html+=incoming.map(h=>{
        const roomName=h.edge.fromRoom?(state.roomById?.get(h.edge.fromRoom)?.room?.name||h.edge.fromRoom):null;
        const req=h.edge.requirements?.length?` — ${esc(h.edge.requirements.join("; "))}`:"";
        return `<li>${esc(h.from.name)} → ${esc(dest.name)} via ${esc(title(h.edge.method||"connection"))}${roomName?` from ${esc(roomName)}`:""}${req}</li>`;
      }).join("");
      html+=`</ul>`;
    }else html+=`<p class="warn">No incoming area connection is structured in the current dataset.</p>`;
    return html;
  }
  const [src,dst]=uniqueAreas;
  const start=norm(src.name),goal=norm(dst.name),queue=[[start,[]]],seen=new Set([start]);
  let path=null;
  while(queue.length){
    const [cur,steps]=queue.shift();
    if(cur===goal){path=steps;break}
    const fromArea=state.data.areas.records.find(a=>norm(a.name)===cur);
    for(const edge of state.areaGraph.get(cur)||[]){
      const next=norm(edge.area); if(seen.has(next))continue;
      seen.add(next);
      queue.push([next,[...steps,{from:fromArea,to:state.data.areas.records.find(a=>norm(a.name)===next),edge}]]);
    }
  }
  if(!path)return `<h3>${esc(src.name)} → ${esc(dst.name)}</h3><p class="warn">I don't have a documented area-level route between those locations. I won't invent room adjacency.</p>`;
  let html=`<h3>${esc(src.name)} → ${esc(dst.name)}</h3><p>I found this route using only explicit area connections:</p><ol>`;
  html+=path.map(step=>{
    const roomName=step.edge.fromRoom?(state.roomById?.get(step.edge.fromRoom)?.room?.name||step.edge.fromRoom):null;
    const req=step.edge.requirements?.length?` — ${esc(step.edge.requirements.join("; "))}`:"";
    return `<li><b>${esc(step.from.name)} → ${esc(step.to?.name||step.edge.area)}</b> via ${esc(title(step.edge.method||"connection"))}${roomName?` from ${esc(roomName)}`:""}${req}</li>`;
  }).join("");
  html+=`</ol><p class="muted small">This is an area-connection route, not a claim about undocumented room-to-room walking paths.</p>`;
  return html;
}
function compareAnswer(entities){
  const ms=entities.filter(e=>e.type==="monster").slice(0,2);if(ms.length===2){const [a,b]=ms.map(e=>e.obj);return `<h3>${esc(title(a.name))} vs ${esc(title(b.name))}</h3><table><tr><th></th><th>${esc(title(a.name))}</th><th>${esc(title(b.name))}</th></tr>${[["HP","hp"],["Damage","damage"],["Accuracy","accuracy"],["Defence","defence"],["Magic Defence","magic_defence"],["Weakness","weakness"]].map(([n,k])=>`<tr><td>${esc(n)}</td><td>${esc(a[k]??"None")}</td><td>${esc(b[k]??"None")}</td></tr>`).join("")}</table><p class="muted small">These are recorded stats only; I am not declaring an overall winner.</p>`}
  return null;
}

const PRODUCTION_METHODS=new Set(["production","smelting","enchantment","brewing","cooking","conversion","npc_service"]);
const STEALING_METHODS=new Set(["pickpocket","stall","map_chest","rogue_chest"]);
const REWARD_METHODS=new Set(["quest_reward","spirit_reward","event_reward","bundle_reward","npc_trade","special_source"]);
const METHOD_GROUPS={
  combat:new Set(["monster_drop"]),buying:new Set(["shop"]),stealing:STEALING_METHODS,
  gathering:new Set(["world_resource"]),farming:new Set(["farming"]),production:PRODUCTION_METHODS,rewards:REWARD_METHODS
};
const REASON_METHOD_ORDER=["world_resource","farming","shop","npc_service","npc_trade","pickpocket","stall","map_chest","rogue_chest","production","smelting","enchantment","brewing","cooking","conversion","quest_reward","spirit_reward","event_reward","bundle_reward","special_source","monster_drop"];
const SEARCH_STOP=new Set([...QUERY_STOP,"thing","things","way","ways","method","methods","source","sources","item","items","available","first","earliest","lowest","level","levels","combat","fighting","fight","killing","kill","buy","buying","purchase","shop","shopping","steal","stealing","pickpocket","stall","chest","farm","farming","grow","growing","plant","mine","mining","fish","fishing","chop","woodcutting","dig","gather","craft","crafting","forge","forging","smelt","smelting","brew","brewing","cook","cooking","make","making","myself","self","without","other","another","instead","besides","under","below","less","than","coins","coin","give","gives","that","only","just","ones","one"].map(norm));

function setUnion(...sets){const out=new Set();for(const s of sets)for(const x of s||[])out.add(x);return out}
function addMethods(target,set){for(const x of set||[])target.add(x)}
function explicitPositive(q,wordPattern){return new RegExp(`\\b(?:${wordPattern})\\b`).test(q)&&!new RegExp(`\\b(?:without|avoid|excluding|except|no|besides|other than|non)\\s+(?:${wordPattern})\\b`).test(q)}
function sourceActorName(a){return a?.victim||a?.monster||a?.shop||a?.stall||a?.spirit||a?.npc||a?.quest||a?.chest||a?.event||a?.bundle||null}
function resultRefsFromSources(sources=[]){
  return sources.map(h=>{const a=h.source||h;const name=sourceActorName(a);if(!name)return null;return {type:a.type||h.kind,method:a.type||h.kind,role:a.type||h.kind,name,area:a.area||null,location:a.location||a.room||null,source:a};}).filter(Boolean);
}
function knownSkillLevel(skill,overrides={},caps={}){
  const key=norm(canonicalSkillName(skill));
  if(overrides[key]!=null)return {level:Number(overrides[key]),basis:"stated"};
  if(caps[key]!=null)return {level:Number(caps[key]),basis:"question limit"};
  const fact=state.conversation.userFacts?.skills?.[key];if(fact?.level!=null)return {level:Number(fact.level),basis:"your"};
  const rec=playerSkill(skill);if(rec?.level!=null)return {level:Number(rec.level),basis:state.player?.source==="manual"?"user-entered":"player snapshot"};
  return null;
}
function inferGoal(q,intent,entities){
  if(/^(?:why|how come)$/.test(q)||/^why (?:is that|was that|that|so)\b/.test(q)||/^why did you\b/.test(q)||/^what made you\b/.test(q))return "explain";
  if(/\b(?:what(?: is|'s| was)|which)\s+(?:is\s+)?my\s+[a-z -]+\s+level\b|\bwhat level (?:am i|do i have)\b/.test(q)&&entities.some(e=>e.type==="skill"))return "user_fact";
  const activeSet=activeThread()?.resultSet||[];
  if(activeSet.length&&/^only\b/.test(q))return "refine_result_set";
  if(activeSet.length&&/\b(which|what).*(cheapest|lowest price)|\bcheapest\b/.test(q)&&!entities.some(e=>["item","resource","equipment"].includes(e.type)&&e.score>=120))return "rank_result_set_price";
  if(/\b(swords?|scimitars?|maces?|knives?|spears?|bows?|arrows?|staves?|armou?r|helmets?|boots?|gloves?|legs?|bodies?)\b/.test(q)&&/\b(equip|wear|use|available)\b/.test(q))return "equipment_search";
  const skillMilestone=entities.find(e=>e.type==="skill"&&e.score>=80),levelMention=q.match(/\b(?:level\s*)?(\d+)\b/);
  if(skillMilestone&&levelMention&&/\b(what happens|what changes|what do i get|unlock|at level|by level)\b/.test(q)&&!/\b(run|running|dodge|speed|tick|cooldown)\b/.test(q))return "skill_milestone";
  if(/\b(which|what).*(available|accessible).*(first|earliest)|\b(first|earliest|lowest level).*(way|method|source)|\bwhich.*first\b/.test(q))return "earliest_source";
  const priceCurrency=/\b[\d,]+\s*coins?\b/.test(q);
  if(entities.some(e=>e.type==="source_ref")&&/\b(where|located|location|find)\b/.test(q))return "locate";
  const hasSpecificItem=entities.some(e=>["item","resource","equipment"].includes(e.type)&&e.score>=80&&!(priceCurrency&&norm(e.name)==="coins"));
  if(hasSpecificItem&&/^what about (?:combat|fighting|buying|shopping|stealing|pickpocketing|farming|crafting|making)\b/.test(q)&&["acquire","earliest_source","search_acquisition"].includes(latestContextTurn()?.goal))return "acquire";
  const methodSearch=/\bwhat(?:\s+\w+){0,3}\s+can i\b.*\b(buy|steal|pickpocket|farm|grow|mine|fish|gather|craft|forge|smelt|brew|cook|make)\b/.test(q)||/\b(show|list|which)\b.*\b(items?|things?)\b.*\b(buy|steal|farm|craft|make)\b/.test(q);
  if(hasSpecificItem&&/\bcheapest\b/.test(q)&&/\b(buy|shop|purchase|source|way|method)\b/.test(q))return "cheapest_source";
  if(hasSpecificItem&&(/\b(?:best|highest|greatest)\s+(?:documented\s+)?(?:drop rate|drop chance|chance)\b/.test(q)||/\b(?:drop rate|drop chance)\b.*\b(?:best|highest|greatest)\b/.test(q)))return "highest_drop_rate";
  if(hasSpecificItem&&/\b(best|easiest|fastest|simplest)\b/.test(q))return "preference_clarification";
  if(hasSpecificItem&&/\b(buy|purchase|shop|steal|pickpocket|farm|grow|plant|mine|fish|gather|obtain|get|acquire|drop|loot)\b/.test(q))return "acquire";
  if(methodSearch&&!hasSpecificItem)return "search_acquisition";
  if(/\b(from scratch|make .* from scratch|craft .* from scratch|what do i need to (?:make|craft|forge|smelt|brew|cook)|how (?:do|can) i (?:make|craft|forge|smelt|brew|cook))\b/.test(q)&&hasSpecificItem)return "produce";
  if(/\bwhat (?:does|do) .* (?:sell|stock)|\bshop inventory\b|\bwhat can i buy\b/.test(q)&&entities.some(e=>e.type==="shop"||e.type==="area"))return "shop_inventory";
  if(intent==="player_next")return "player_next";
  if(intent==="count"||intent==="list")return "enumerate";
  if(intent==="walkthrough")return "walkthrough";
  if(intent==="requirements")return "readiness";
  if(intent==="travel")return "travel";
  if(intent==="compare")return "compare";
  if(intent==="uses")return "uses";
  if(intent==="materials"&&hasSpecificItem)return "produce";
  if(intent==="drops"||intent==="locate")return hasSpecificItem?"acquire":"locate";
  if(intent==="mechanics")return "mechanics";
  if(intent==="progression")return "progression";
  return "info";
}
function goalTypeWeight(goal,type){
  const table={
    acquire:{item:48,resource:46,equipment:32,source_ref:36,monster:8,area:4},
    produce:{item:50,equipment:48,resource:38,skill:5},uses:{item:50,resource:48,equipment:30},
    search_acquisition:{item:25,resource:20,area:18,skill:12},earliest_source:{item:48,resource:46,equipment:30,source_ref:25},
    travel:{area:55,room:38,npc:10},locate:{source_ref:52,room:45,npc:42,area:40,monster:34,item:20,resource:20},
    readiness:{quest:55,equipment:32,skill:16},walkthrough:{quest:60},progression:{skill:48,equipment:38},
    shop_inventory:{shop:60,area:42},compare:{monster:40,equipment:34,item:20},mechanics:{rule:55,mechanic:50,skill:18},info:{item:28,quest:26,monster:24,area:22,skill:20,equipment:18,npc:18,room:16}
  };
  return table[goal]?.[type]||0;
}
function rankEntitiesForGoal(entities,goal){return [...entities].sort((a,b)=>(b.score+goalTypeWeight(goal,b.type))-(a.score+goalTypeWeight(goal,a.type))||b.name.length-a.name.length)}
function extractConstraints(raw,q,entities,overrides){
  const includeMethods=new Set(),excludeMethods=new Set(),skillCaps={};
  const addExclude=group=>addMethods(excludeMethods,METHOD_GROUPS[group]);
  const addInclude=group=>addMethods(includeMethods,METHOD_GROUPS[group]);
  // Coordinated negation: “without combat or stealing” must exclude both, not just the first noun.
  const negRx=/\b(?:without|avoid|excluding|except|no|besides|other than)\s+((?:(?:combat|fighting|killing|buying|shopping|spending|stealing|pickpocketing|farming|growing|crafting|making|forging|smelting|brewing|cooking|quests?)(?:\s*(?:,|or|and)\s*)?)+)/g;
  for(const m of q.matchAll(negRx)){const seg=m[1];if(/\b(combat|fighting|killing)\b/.test(seg))addExclude("combat");if(/\b(buying|shopping|spending)\b/.test(seg))addExclude("buying");if(/\b(stealing|pickpocketing)\b/.test(seg))addExclude("stealing");if(/\b(farming|growing)\b/.test(seg))addExclude("farming");if(/\b(crafting|making|forging|smelting|brewing|cooking)\b/.test(seg))addExclude("production");if(/\bquests?\b/.test(seg))excludeMethods.add("quest_reward")}
  if(/\b(without|avoid|excluding|except|no|besides|other than)\s+(combat|fighting|killing)\b|\bnon combat\b/.test(q))addExclude("combat");
  if(/\b(without|avoid|excluding|except|no|besides|other than)\s+(buying|shopping|spending)\b/.test(q))addExclude("buying");
  if(/\b(without|avoid|excluding|except|no|besides|other than)\s+(stealing|pickpocketing)\b/.test(q))addExclude("stealing");
  if(/\b(without|avoid|excluding|except|no|besides|other than)\s+(farming|growing)\b/.test(q))addExclude("farming");
  if(/\b(without|avoid|excluding|except|no|besides|other than)\s+(crafting|making|forging|smelting|brewing|cooking)\b/.test(q))addExclude("production");
  if(/\b(without|avoid|excluding|except|no)\s+quests?\b/.test(q))excludeMethods.add("quest_reward");
  if(explicitPositive(q,"combat|fighting|fight|kill|killing"))addInclude("combat");
  if(explicitPositive(q,"buy|purchase|shop"))addInclude("buying");
  if(explicitPositive(q,"steal|stealing|pickpocket|stall|chest"))addInclude("stealing");
  if(explicitPositive(q,"farm|farming|grow|plant"))addInclude("farming");
  if(explicitPositive(q,"mine|mining|fish|fishing|chop|woodcutting|dig|gather"))addInclude("gathering");
  if(explicitPositive(q,"craft|crafting|forge|forging|smelt|smelting|brew|brewing|cook|cooking|make"))addInclude("production");
  if(/\b(drop|drops|dropped|loot)\b/.test(q))addMethods(includeMethods,new Set(["monster_drop"]));
  for(const [skillKey,level] of Object.entries(overrides||{}))skillCaps[skillKey]=Number(level);
  let generic=q.match(/\b(?:at|by|under|below|up to|max(?:imum)?(?: level)?)\s*(?:level\s*)?(\d+)\b/);
  if(!generic)generic=q.match(/\blevel\s*(\d+)\b/);
  if(generic){
    const n=Number(generic[1]);let inferred=null;
    const skillEntity=entities.find(e=>e.type==="skill");if(skillEntity)inferred=norm(skillEntity.name);
    else if([...includeMethods].some(x=>STEALING_METHODS.has(x)))inferred="stealing";
    else if(includeMethods.has("farming"))inferred="farming";
    else if(includeMethods.has("world_resource")){if(/\bmine|mining\b/.test(q))inferred="mining";else if(/\bfish|fishing\b/.test(q))inferred="fishing";else if(/\bchop|woodcutting\b/.test(q))inferred="woodcutting";}
    if(inferred&&skillCaps[inferred]==null)skillCaps[inferred]=n;
  }
  let maxPrice=null;const pm=q.match(/\b(?:under|below|less than|at most|up to|max(?:imum)?)\s*([\d,]+)\s*coins?\b/);if(pm)maxPrice=Number(pm[1].replace(/,/g,""));
  const areas=unique(entities.filter(e=>e.type==="area").map(e=>e.name));
  const fromScratch=/\bfrom scratch\b|\braw materials?\b|\bevery ingredient\b/.test(q);
  const avoidCombat=/\b(without|avoid|excluding|except|no|besides|other than)\s+(combat|fighting|killing)\b|\bnon combat\b/.test(q);
  const avoidQuests=/\b(without|avoid|excluding|except|no|besides|other than)\s+quests?\b/.test(q);
  const avoidSpending=/\b(without|avoid|no)\s+(spending|coins?|money)\b|\bfree(?: way| source| method)?\b/.test(q);
  const onlyAccessible=/\b(can i|available to me|accessible to me|at level|by level|with .* level)\b/.test(q)||Object.keys(skillCaps).length>0;
  return {includeMethods:[...includeMethods].filter(m=>!excludeMethods.has(m)),excludeMethods:[...excludeMethods],areas,skillCaps,maxPrice,fromScratch,avoidCombat,avoidQuests,avoidSpending,onlyAccessible};
}
function isSemanticFollowup(q){
  if(/\b(what can i|how many|list|show me|which items?|what items?)\b/.test(q)&&!/^what if\b/.test(q))return false;
  return looksLikeFollowup(q);
}
function inheritContextConstraints(q,current,thread=activeThread(),contextAllowed=true){
  if(!contextAllowed||!isSemanticFollowup(q))return current;const prior=threadTurn(thread)?.constraints||thread?.constraints;if(!prior)return current;
  const merged={...current};
  merged.includeMethods=current.includeMethods?.length?current.includeMethods:[...(prior.includeMethods||[])];
  merged.excludeMethods=unique([...(prior.excludeMethods||[]),...(current.excludeMethods||[])]);
  if(current.includeMethods?.length)merged.excludeMethods=merged.excludeMethods.filter(x=>!current.includeMethods.includes(x));
  if(current.excludeMethods?.length)merged.includeMethods=merged.includeMethods.filter(x=>!current.excludeMethods.includes(x));
  merged.areas=current.areas?.length?current.areas:[...(prior.areas||[])];
  merged.skillCaps={...(prior.skillCaps||{}),...(current.skillCaps||{})};
  merged.maxPrice=current.maxPrice!=null?current.maxPrice:(prior.maxPrice??null);
  merged.fromScratch=!!(current.fromScratch||prior.fromScratch&&/\b(same|again|that|it|which|what about|how about)\b/.test(q));
  merged.avoidCombat=!!(current.avoidCombat||prior.avoidCombat&&!current.includeMethods?.includes("monster_drop"));
  merged.avoidQuests=!!(current.avoidQuests||prior.avoidQuests&&!current.includeMethods?.includes("quest_reward"));
  merged.avoidSpending=!!(current.avoidSpending||prior.avoidSpending);
  if(current.includeMethods?.includes("monster_drop"))merged.avoidCombat=false;if(current.includeMethods?.includes("quest_reward"))merged.avoidQuests=false;
  merged.onlyAccessible=!!(current.onlyAccessible||Object.keys(merged.skillCaps).length);return merged;
}
function correctionDescriptor(raw){
  const q=norm(raw),pending=state.conversation.pendingRepair;
  const marker=/^(?:no\b|nah\b|nope\b|wrong\b|wrong thing\b|not quite\b|sorry\b|actually\b|i meant\b|i mean\b|that s not\b|that isn t\b|that is not\b|not what i meant\b|i didn t mean\b)/.test(q);
  if(!marker&&!pending)return null;
  let replacement="",rejected="";
  // After “that’s not what I meant”, the very next user message is the repair content even without another marker.
  if(pending&&!marker)replacement=String(raw||"").trim();
  const meant=String(raw).match(/\b(?:i meant|i mean|meant)\s+(.+?)(?:\s*,?\s*not\s+(?:the\s+)?(.+?))?[.!?]?$/i);
  if(meant){replacement=(meant[1]||"").trim();rejected=(meant[2]||"").trim()}
  if(!replacement){const simple=String(raw).match(/^(?:no|nah|nope|wrong(?: thing)?|not quite|sorry|actually)\s*[-,:]?\s*(.+)$/i);if(simple)replacement=simple[1].trim()}
  if(replacement&&/^(?:that s not what i meant|that isn t what i meant|that is not what i meant|that was wrong)$/i.test(norm(replacement)))replacement="";
  const notPair=String(raw).match(/\bnot\s+(?:the\s+)?([^,.;]+)[,;]\s*(?:the\s+)?(.+?)[.!?]?$/i);if(notPair&&!meant){rejected=notPair[1].trim();replacement=notPair[2].trim()}
  const reopen=[];for(const [group,rx] of [["combat",/\b(?:combat|fighting)\s+(?:is|are)\s+(?:fine|ok|okay|allowed)\b/i],["stealing",/\bstealing\s+(?:is|are)\s+(?:fine|ok|okay|allowed)\b/i],["buying",/\b(?:buying|shopping|spending)\s+(?:is|are)\s+(?:fine|ok|okay|allowed)\b/i],["farming",/\bfarming\s+(?:is|are)\s+(?:fine|ok|okay|allowed)\b/i],["production",/\b(?:crafting|making|forging|smelting)\s+(?:is|are)\s+(?:fine|ok|okay|allowed)\b/i]])if(rx.test(raw))reopen.push(group);
  return {isRepair:true,replacement,rejected,reopen,pending:!!pending,raw};
}
function lastRepairableTurn(thread=activeThread()){
  const turns=thread?.turns||[];for(let i=turns.length-1;i>=0;i--)if(turns[i]?.query&&turns[i].goal!=="repair_clarify"&&turns[i].goal!=="explain")return turns[i];return null;
}
function constraintMethodsForGroup(group){return [...(METHOD_GROUPS[group]||[])];}
function applyRepairConstraintPatch(query,desc){
  // Leading “No,” is a discourse repair marker here, not a request to exclude the word that follows it.
  const patchRaw=String(desc.raw||"").replace(/^\s*(?:no|nah|nope|wrong(?: thing)?|not quite|sorry)\s*[-,:]?\s*/i,"");
  const patch=extractConstraints(patchRaw,norm(patchRaw),query.entities||[],extractStatedSkillLevels(patchRaw));
  const c={...query.constraints,skillCaps:{...(query.constraints?.skillCaps||{})},includeMethods:[...(query.constraints?.includeMethods||[])],excludeMethods:[...(query.constraints?.excludeMethods||[])]};
  for(const group of desc.reopen||[]){const methods=constraintMethodsForGroup(group);c.excludeMethods=c.excludeMethods.filter(x=>!methods.includes(x));if(group==="combat")c.avoidCombat=false;if(group==="buying")c.avoidSpending=false;if(group==="quests")c.avoidQuests=false}
  if(patch.includeMethods?.length){c.includeMethods=unique([...c.includeMethods,...patch.includeMethods]);c.excludeMethods=c.excludeMethods.filter(x=>!patch.includeMethods.includes(x))}
  if(patch.excludeMethods?.length){c.excludeMethods=unique([...c.excludeMethods,...patch.excludeMethods]);c.includeMethods=c.includeMethods.filter(x=>!patch.excludeMethods.includes(x))}
  c.skillCaps={...c.skillCaps,...patch.skillCaps};if(patch.maxPrice!=null)c.maxPrice=patch.maxPrice;if(patch.areas?.length)c.areas=patch.areas;
  c.avoidCombat=!!(patch.avoidCombat||c.avoidCombat&&!c.includeMethods.includes("monster_drop"));c.avoidQuests=!!(patch.avoidQuests||c.avoidQuests&&!c.includeMethods.includes("quest_reward"));c.avoidSpending=!!(patch.avoidSpending||c.avoidSpending);c.onlyAccessible=!!(c.onlyAccessible||Object.keys(c.skillCaps).length);query.constraints=c;query.overrides={...(query.overrides||{}),...extractStatedSkillLevels(desc.raw)};return query;
}

function searchTermsForQuery(q,entities){
  const entityWords=new Set(entities.flatMap(e=>contentTokens(e.name)));
  const skillWords=new Set(KNOWN_SKILLS.flatMap(x=>contentTokens(x)));
  const areaWords=new Set((state.data.areas.records||[]).flatMap(a=>contentTokens(a.name)));
  const out=[];
  for(let t of contentTokens(q)){
    if(/^\d+$/.test(t)||SEARCH_STOP.has(t)||entityWords.has(t)||skillWords.has(t)||areaWords.has(t))continue;
    if(t.endsWith("ies")&&t.length>4)t=t.slice(0,-3)+"y";else if(t.endsWith("s")&&t.length>3)t=t.slice(0,-1);
    if(!SEARCH_STOP.has(t))out.push(t);
  }
  return unique(out);
}
function itemMatchesTerms(item,terms){if(!terms.length)return true;const hay=[norm(item.name),...(item.categories||[]).map(norm),...(item.aliases||[]).map(norm)];return terms.every(t=>hay.some(x=>x===t||x.includes(t)||t.includes(x)))}
function semanticAmbiguity(entities,goal){
  if(entities.length<2)return null;const [a,b]=entities;const as=a.score+goalTypeWeight(goal,a.type),bs=b.score+goalTypeWeight(goal,b.type);
  if(as<115||bs<115||as-bs>7)return null;
  const sameName=norm(a.name)===norm(b.name),sameConcept=sameName&&new Set([a.type,b.type]).size===2&&[a.type,b.type].every(t=>["item","resource","equipment"].includes(t));
  if(sameConcept)return null;
  if(sameName&&a.type==="source_ref"&&b.type==="source_ref"&&a.role!==b.role)return {options:[a,b],reason:"The same name refers to more than one recent acquisition source."};
  if(sameName)return null;
  const at=new Set(contentTokens(a.name)),bt=new Set(contentTokens(b.name));let overlap=0;for(const t of at)if(bt.has(t))overlap++;
  if(!overlap)return null; // Different explicit entities can coexist in a compound question.
  const aContainsB=hasWholePhrase(a.name,b.name),bContainsA=hasWholePhrase(b.name,a.name);
  if((aContainsB||bContainsA)&&norm(a.name).length!==norm(b.name).length){
    const longer=norm(a.name).length>norm(b.name).length?a:b;
    if(hasWholePhrase(norm(entities.map(()=>"").join(" "))||"",longer.name))return null;
    // The resolver already knows the longer phrase occurred in the question when its score is high.
    if(longer.score>=125)return null;
  }
  const overlapRatio=overlap/Math.max(1,Math.min(at.size,bt.size));
  if(overlapRatio>=0.75)return {options:[a,b],reason:"Two overlapping entity names fit that wording almost equally well."};
  return null;
}
function interpretQuestionCore(raw,{forcedThread=null,contextAllowed=null,skipRepair=false,move=null}={}){
  const q=semanticEnglish(raw),base=resolveEntities(q,{limit:12});
  const baseIntent=detectIntent(q,base),baseGoal=inferGoal(q,baseIntent,base);const sel=forcedThread?{thread:forcedThread,move:move||"continue",contextAllowed:contextAllowed!==false}:selectThreadForQuestion(q,base,baseGoal);
  const allow=contextAllowed==null?sel.contextAllowed:contextAllowed,thread=sel.thread;
  const contextRefs=allow&&isSemanticFollowup(q)?contextResultCandidates(q,thread):[];let entities=[...contextRefs,...base];
  const seen=new Set();entities=entities.filter(e=>{const k=`${e.type}:${norm(e.name)}:${e.role||""}`;if(seen.has(k))return false;seen.add(k);return true});
  entities=contextualize(q,entities,{thread,contextAllowed:allow});
  let intent=detectIntent(q,entities),goal=inferGoal(q,intent,entities);entities=rankEntitiesForGoal(entities,goal);goal=inferGoal(q,intent,entities);entities=rankEntitiesForGoal(entities,goal);
  // Hypotheticals and user-provided levels enrich the active problem instead of silently becoming a new skill article.
  const factUpdate=/\b(?:i am|i have|my)\b/.test(q)&&Object.keys(extractStatedSkillLevels(raw)).length>0;
  if(thread&&allow&&(/^(?:what if|what about|how about|and|only|actually|instead|suppose|say|if)\b/.test(q)||factUpdate)&&["info","progression","mechanics"].includes(goal)&&thread.goal&&!['info','mechanics','progression'].includes(thread.goal))goal=thread.goal;
  const overrides=extractStatedSkillLevels(raw);let constraints=extractConstraints(raw,q,entities,overrides);constraints=inheritContextConstraints(q,constraints,thread,allow);
  const collection=genericCollection(q),directRule=ruleForQuestion(q),searchTerms=searchTermsForQuery(q,entities),ambiguity=semanticAmbiguity(entities,goal);
  return {raw,q,intent,goal,entities,overrides,constraints,collection,directRule,searchTerms,ambiguity,threadId:thread?.id||null,move:sel.move,contextUsed:!!(thread&&allow),contextThreadLabel:thread?.label||null};
}

function planQuery(query){
  let item=query.entities.find(e=>["item","resource","equipment"].includes(e.type));
  if(!item&&["earliest_source","cheapest_source","highest_drop_rate","acquire","produce","uses"].includes(query.goal)){const prior=inheritedEntitiesFromThread(activeThread()).find(e=>["item","resource","equipment"].includes(e.type));if(prior)item=prior}
  const sourceRef=query.entities.find(e=>e.type==="source_ref");
  const steps=[`Interpret goal as ${query.goal}.`];
  if(item)steps.push(`Resolve subject as ${item.name}.`);
  if(query.constraints.includeMethods.length)steps.push(`Keep requested acquisition methods: ${query.constraints.includeMethods.join(", ")}.`);
  if(query.constraints.excludeMethods.length)steps.push(`Exclude methods: ${query.constraints.excludeMethods.join(", ")}.`);
  if(query.constraints.areas.length)steps.push(`Apply area constraint: ${query.constraints.areas.join(", ")}.`);
  if(Object.keys(query.constraints.skillCaps).length)steps.push(`Apply stated skill levels/limits: ${Object.entries(query.constraints.skillCaps).map(([k,v])=>`${title(k)} ${v}`).join(", ")}.`);
  let route=query.goal;
  if(query.goal==="glossary")route="glossary";
  if(query.goal==="foreign_comparison")route="foreign_comparison";
  if(query.goal==="locate"&&sourceRef)route="source_location";
  if(query.goal==="acquire"&&item)route="item_acquisition";
  if(query.goal==="produce"&&item)route=(item.type==="equipment"&&!itemRecord(item.name))?"equipment_materials":"item_production";
  if(query.goal==="uses"&&item)route="item_uses";
  if(query.goal==="earliest_source"&&item)route="earliest_source";
  if(query.goal==="cheapest_source"&&item)route="cheapest_source";
  if(query.goal==="preference_clarification"&&item)route="preference_clarification";
  if(query.goal==="highest_drop_rate"&&item)route="highest_drop_rate";
  if(query.goal==="equipment_search")route="equipment_search";
  if(query.goal==="skill_milestone")route="skill_milestone";
  if(query.goal==="refine_result_set")route="refine_result_set";
  if(query.goal==="rank_result_set_price")route="rank_result_set_price";
  if(query.goal==="search_acquisition")route="search_acquisition";
  steps.push(`Execute ${route} plan against structured data.`);
  return {route,item,sourceRef,steps};
}
function sourceHardMatches(a,constraints){
  if((constraints.excludedNames||[]).some(n=>norm(sourceActorName(a))===norm(n)))return false;
  if(constraints.includeMethods.length&&!constraints.includeMethods.includes(a.type))return false;
  if(constraints.excludeMethods.includes(a.type))return false;
  const accessText=norm([a.access,a.note].filter(Boolean).join(" "));
  if(constraints.avoidCombat&&/\b(kill|defeat|combat|fight)\b/.test(accessText))return false;
  if(constraints.avoidQuests&&(a.type==="quest_reward"||/\b(quest|complete|completion)\b/.test(accessText)))return false;
  if(constraints.avoidSpending&&(a.type==="shop"||a.price!=null||Object.keys(a.materials||{}).some(k=>norm(k)==="coins")||/\bcoins?\b/.test(accessText)))return false;
  if(constraints.areas.length&&a.area&&!constraints.areas.some(x=>norm(x)===norm(a.area)))return false;
  if(constraints.areas.length&&!a.area)return false;
  if(constraints.maxPrice!=null&&a.type==="shop"&&a.price!=null&&Number(a.price)>constraints.maxPrice)return false;
  if(constraints.maxPrice!=null&&a.type==="shop"&&a.price==null)return false;
  return true;
}
function assessAcquisitionSource(a,query){
  if(!sourceHardMatches(a,query.constraints))return {source:a,eligible:false,status:"excluded",reason:"Does not match the question constraints."};
  if(a.skill&&a.level!=null){const known=knownSkillLevel(a.skill,query.overrides,query.constraints.skillCaps);if(known){const ok=known.level>=Number(a.level);return {source:a,eligible:true,status:ok?(a.access?"conditional":"accessible"):"blocked",have:known.level,basis:known.basis,reason:ok?(a.access?`Skill requirement met; additional access condition: ${a.access}`:`${a.skill} ${a.level} met.`):`Requires ${a.skill} ${a.level}; known level is ${known.level}.`}}}
  if(a.access)return {source:a,eligible:true,status:"conditional",reason:`Access condition is recorded but current completion state is unknown: ${a.access}`};
  return {source:a,eligible:true,status:"unknown",reason:a.skill&&a.level!=null?`Requires ${a.skill} ${a.level}; no level is known for this question.`:"No player-specific gate is represented for this route."};
}
function evaluatedAcquisition(item,query){return (item?.acquisition||[]).map(a=>assessAcquisitionSource(a,query)).filter(x=>x.eligible)}
function statusOrder(s){return {accessible:0,conditional:1,unknown:2,blocked:3}[s]??4}
function sourceOrder(type){const i=REASON_METHOD_ORDER.indexOf(type);return i<0?99:i}
function evaluatedSourceText(ev){const a=ev.source;let suffix="";if(ev.status==="accessible")suffix=" · available at the stated/known level";else if(ev.status==="blocked")suffix=` · blocked: ${ev.reason}`;else if(ev.status==="conditional")suffix=` · conditional: ${ev.reason}`;else if(a.skill&&a.level!=null)suffix=` · ${ev.reason}`;return `${sourceLine({kind:a.type,source:a})}${suffix}`}
function reasoningEntities(query,plan){
  if(plan?.sourceRef)return [`source: ${plan.sourceRef.name} (${ACQ_LABELS[plan.sourceRef.role||plan.sourceRef.method]||title(plan.sourceRef.role||plan.sourceRef.method||"source")})`];
  if(plan?.item)return [`${plan.item.type}: ${plan.item.name}`];
  if(query.goal==="travel")return query.entities.filter(e=>e.type==="area").slice(0,2).map(e=>`area: ${e.name}`);
  if(query.goal==="readiness")return query.entities.filter(e=>["quest","equipment"].includes(e.type)).slice(0,2).map(e=>`${e.type}: ${e.name}`);
  return query.entities.filter(e=>e.score>=115).slice(0,3).map(e=>`${e.type}: ${e.name}`);
}
function makeReasoning(query,plan,{conclusions=[],uncertainties=[],sources=[]}={}){
  return {question:query.raw,goal:query.goal,interpretation:{entities:reasoningEntities(query,plan),constraints:query.constraints},steps:plan.steps,conclusions,uncertainties,sources:unique(sources.filter(Boolean))};
}
function result(html,focus=[],reasoning=null,resultRefs=[],resultSet=[]){return {html,focus,reasoning,resultRefs,resultSet}}
const EXPLICIT_FOOD_NAMES=new Set(["bread","apple","banana","avocado","beer","premium beer","rogue premium beer","sardine sushi","octopus sushi"]);
function semanticItemCategories(item){
  const out=new Set((item?.categories||[]).map(norm)),name=norm(item?.name||"");
  if(/\bseeds?\b/.test(name)||(item?.uses||[]).some(u=>u.type==="plant_to_grow"||u.type==="plant_tree"))out.add("seed");
  // Conservative semantic class used for conversational filtering. Raw ingredients are not promoted to food.
  if((item?.acquisition||[]).some(a=>a.type==="cooking")||EXPLICIT_FOOD_NAMES.has(name)||/^(?:cooked|sardine sushi|octopus sushi)\b/.test(name)||/\bpie$/.test(name))out.add("food");
  const eq=(state.data.equipmentFlat||[]).find(e=>norm(e.name)===name);if(eq?.family){out.add(norm(eq.family));out.add(norm(eq.family).replace(/s$/,""))}if(eq?.kind)out.add(norm(eq.kind));if(eq?.style)out.add(norm(eq.style));
  return out;
}
function itemMatchesSemanticTerms(item,terms){if(!terms?.length)return true;const cats=semanticItemCategories(item),name=norm(item?.name||"");return terms.every(t=>name.includes(norm(t))||[...cats].some(c=>c===norm(t)||c.includes(norm(t))||norm(t).includes(c)))}
function compactResultRow(item,ev){return {kind:"item_source",itemName:item.name,itemId:item.id||null,source:ev?.source||null,status:ev?.status||null}}

function itemEntity(item){return {type:"item",name:item.name,obj:item,score:200,area:null,room:null}}
function reasonedAcquisitionAnswer(query,plan){
  const item=itemRecord(plan.item.name)||plan.item.obj;if(!item)return result(resourceAnswer(plan.item.name,query.q),[plan.item],makeReasoning(query,plan,{uncertainties:["No first-class item record was found; legacy lookup was used."]}));
  let rows=evaluatedAcquisition(item,query).sort((a,b)=>statusOrder(a.status)-statusOrder(b.status)||sourceOrder(a.source.type)-sourceOrder(b.source.type));
  const all=item.acquisition||[],sources=rows.map(x=>x.source.source),refs=resultRefsFromSources(rows.map(x=>({source:x.source})));
  if(!rows.length){
    const scoped=query.constraints.excludeMethods.length||query.constraints.includeMethods.length||query.constraints.areas.length||query.constraints.maxPrice!=null;
    const why=scoped?"I don’t have a documented acquisition route that fits all of those constraints.":"I don’t have an item-specific acquisition route documented yet.";
    const html=`<h3>${esc(item.name)}</h3><p>${esc(why)}</p><p class="muted small">That is a knowledge-gap statement, not proof that the method does not exist in FlatMMO.</p>${all.length?chips([`How do I get ${item.name}?`]):""}`;
    return result(html,[itemEntity(item)],makeReasoning(query,plan,{conclusions:[why],uncertainties:["The item graph is broad but not exhaustive."],sources:all.map(a=>a.source)}),[]);
  }
  const by=new Map();for(const ev of rows){const k=ev.source.type;if(!by.has(k))by.set(k,[]);by.get(k).push(ev)}
  const groups=[];for(const kind of REASON_METHOD_ORDER){const g=by.get(kind);if(!g?.length)continue;groups.push(`<p><b>${esc(ACQ_LABELS[kind]||title(kind))}:</b></p><ul>${g.slice(0,30).map(ev=>`<li>${esc(evaluatedSourceText(ev))}</li>`).join("")}</ul>${g.length>30?`<p class="muted small">${g.length-30} additional routes omitted from this compact answer.</p>`:""}`)}
  const accessible=rows.filter(x=>x.status==="accessible").length,blocked=rows.filter(x=>x.status==="blocked").length,conditional=rows.filter(x=>x.status==="conditional").length;
  let intro=query.constraints.avoidCombat&&rows.length?`Yep — you don’t have to fight for this one. I found <b>${rows.length}</b> documented non-combat route${rows.length===1?"":"s"}.`:`You’ve got <b>${rows.length}</b> documented route${rows.length===1?"":"s"} that fit${rows.length===1?"s":""} what you asked.`;
  if(query.constraints.onlyAccessible&&accessible)intro+=` <b>${accessible}</b> ${accessible===1?"is":"are"} available from the skill levels supplied/known.`;
  if(blocked)intro+=` ${blocked} ${blocked===1?"is":"are"} blocked by a known skill requirement.`;
  if(conditional)intro+=` ${conditional} ${conditional===1?"has":"have"} an additional access condition I can't verify from current player data.`;
  const html=`<h3>${esc(item.name)}</h3><p>${intro}</p>${groups.join("")}${item.uses?.length?chips([`What is ${item.name} used for?`,`Which source is available first?`]):chips([`Which source is available first?`])}${evidence(unique(sources),["Routes were filtered from the first-class item graph. Missing routes are not assumed impossible."])}`;
  const conclusions=[`Found ${rows.length} documented route(s) after applying the question constraints.`];if(accessible)conclusions.push(`${accessible} route(s) meet the known/stated skill level.`);if(blocked)conclusions.push(`${blocked} route(s) fail a known skill requirement.`);
  return result(html,[itemEntity(item)],makeReasoning(query,plan,{conclusions,uncertainties:["Ungated routes may still have game-state requirements that are not represented in the current player snapshot."],sources}),refs);
}
function acquisitionSearchAnswer(query,plan){
  const rows=[];
  for(const item of state.data.items?.records||[]){
    if(!itemMatchesSemanticTerms(item,query.searchTerms))continue;
    for(const a of item.acquisition||[]){const ev=assessAcquisitionSource(a,query);if(ev.eligible&&!(query.constraints.onlyAccessible&&ev.status==="blocked"))rows.push({item,ev})}
  }
  rows.sort((a,b)=>statusOrder(a.ev.status)-statusOrder(b.ev.status)||sourceOrder(a.ev.source.type)-sourceOrder(b.ev.source.type)||a.item.name.localeCompare(b.item.name));
  if(!rows.length){const desc=query.searchTerms.length?` matching “${query.searchTerms.join(" ")}”`:"";return result(`<h3>No matching documented routes</h3><p>I couldn't find an item-specific acquisition route${esc(desc)} that satisfies those constraints.</p><p class="muted small">That means not documented in the current graph, not impossible in FlatMMO.</p>`,query.entities,makeReasoning(query,plan,{conclusions:["No acquisition records matched the structured filters."],uncertainties:["The item graph is not exhaustive."]}));}
  const shown=rows.slice(0,45),terms=query.searchTerms.length?` matching <b>${esc(query.searchTerms.join(" "))}</b>`:"";
  const html=`<h3>Matching acquisition options</h3><p>Here’s what fits: <b>${rows.length}</b> item/source pair${rows.length===1?"":"s"}${terms}.</p><ul>${shown.map(({item,ev})=>`<li><b>${esc(item.name)}</b> — ${esc(evaluatedSourceText(ev))}</li>`).join("")}</ul>${rows.length>shown.length?`<p class="muted small">${rows.length-shown.length} additional matches omitted.</p>`:""}${evidence(unique(shown.map(x=>x.ev.source.source).filter(Boolean)),["This is a constrained graph search, not a recommendation ranking."])}`;
  const refs=resultRefsFromSources(shown.map(x=>({source:x.ev.source})));
  return result(html,unique(shown.slice(0,6).map(x=>itemEntity(x.item))),makeReasoning(query,plan,{conclusions:[`Matched ${rows.length} item/source pairs after applying method, area, level and price constraints.`],sources:shown.map(x=>x.ev.source.source)}),refs,rows.map(x=>compactResultRow(x.item,x.ev)));
}
function earliestSourceAnswer(query,plan){
  if(!plan.item)return result(`<h3>I need the item first</h3><p>Which item do you want me to compare acquisition requirements for?</p>`,[],makeReasoning(query,plan,{uncertainties:["No item subject was available for the earliest-source comparison."]}));
  const item=itemRecord(plan.item.name)||plan.item.obj;if(!item)return result(`<h3>${esc(plan.item.name)}</h3><p>I don't have a first-class item record to compare.</p>`,[plan.item],makeReasoning(query,plan,{uncertainties:["No first-class item record."]}));
  const rows=evaluatedAcquisition(item,query),gated=rows.filter(x=>x.source.skill&&Number.isFinite(Number(x.source.level)));
  if(query.constraints.onlyAccessible&&gated.length){const available=gated.filter(x=>x.status==="accessible"||x.status==="conditional");if(!available.length){const min=Math.min(...gated.map(x=>Number(x.source.level))),next=gated.filter(x=>Number(x.source.level)===min);return result(`<h3>${esc(item.name)} at your stated level</h3><p><b>None of the comparable documented skill-gated routes are available at the level you gave me.</b></p><p>The first recorded gate is ${esc(next.map(x=>sourceLine({kind:x.source.type,source:x.source})).join(" / "))}.</p>`,[itemEntity(item)],makeReasoning(query,plan,{conclusions:[`No comparable route meets the stated skill level; the lowest documented gate is ${min}.`],sources:next.map(x=>x.source.source)}),resultRefsFromSources(next.map(x=>({source:x.source}))));}}
  if(!gated.length){return result(`<h3>${esc(item.name)}</h3><p>None of the matching routes has a numeric skill requirement I can use for an “available first” comparison.</p><p class="muted small">I won't turn missing requirements into zero-level requirements.</p>`,[itemEntity(item)],makeReasoning(query,plan,{conclusions:["No comparable numeric skill gates were available."],uncertainties:["Ungated routes may still have other prerequisites."]}));}
  const skills=unique(gated.map(x=>norm(x.source.skill))),min=Math.min(...gated.map(x=>Number(x.source.level))),best=gated.filter(x=>Number(x.source.level)===min);
  let caveat=skills.length>1?`<p class="warn">These routes use different skills, so level numbers are not a universal measure of which you will reach first. The lowest <i>numeric documented requirement</i> is shown only as a factual comparison.</p>`:"";
  const ungated=rows.filter(x=>!x.source.skill||x.source.level==null);
  if(ungated.length)caveat+=`<p class="muted small">${ungated.length} matching route${ungated.length===1?" has":"s have"} no comparable numeric skill gate, so ${ungated.length===1?"it is":"they are"} not ranked here.</p>`;
  const html=`<h3>${esc(item.name)} — lowest documented skill gate</h3><p>${best.map(x=>`<b>${esc(sourceLine({kind:x.source.type,source:x.source}))}</b>`).join("<br>")}</p>${caveat}`;
  return result(html,[itemEntity(item)],makeReasoning(query,plan,{conclusions:[`Lowest numeric documented skill requirement among comparable routes is ${min}.`],uncertainties:[skills.length>1?"Different skill levels are not directly comparable as progression time.":"Routes without numeric skill requirements were not ranked."],sources:best.map(x=>x.source.source)}),resultRefsFromSources(best.map(x=>({source:x.source}))));
}
function recipeSources(item){return (item?.acquisition||[]).filter(a=>PRODUCTION_METHODS.has(a.type)&&a.materials&&Object.keys(a.materials).length)}
function expandRecipeBranch(itemName,qty=1,{depth=0,maxDepth=8,seen=new Set()}={}){
  const item=itemRecord(itemName);if(!item)return {name:itemName,qty,kind:"leaf",gap:true,reason:"No first-class item record."};
  if(depth>=maxDepth)return {name:item.name,qty,kind:"leaf",gap:true,reason:"Expansion depth limit reached."};
  const key=norm(item.name);if(seen.has(key))return {name:item.name,qty,kind:"leaf",gap:true,reason:"Recipe cycle detected."};
  const recipes=recipeSources(item);
  if(!recipes.length)return {name:item.name,qty,kind:"leaf",gap:!(item.acquisition||[]).length,sources:item.acquisition||[]};
  if(recipes.length>1)return {name:item.name,qty,kind:"alternatives",recipes:recipes.map(r=>expandSpecificRecipe(item,qty,r,{depth,maxDepth,seen}))};
  return expandSpecificRecipe(item,qty,recipes[0],{depth,maxDepth,seen});
}
function expandSpecificRecipe(item,qty,recipe,{depth,maxDepth,seen}){
  const outQty=Number(recipe.outputQuantity||1)||1,crafts=Math.ceil(Number(qty)/outQty),nextSeen=new Set(seen);nextSeen.add(norm(item.name));
  const children=Object.entries(recipe.materials||{}).map(([name,n])=>expandRecipeBranch(title(name),crafts*Number(n),{depth:depth+1,maxDepth,seen:nextSeen}));
  return {name:item.name,qty,kind:"recipe",recipe,crafts,children};
}
function collectRecipeLeaves(node,totals={},gaps=[]){
  if(!node)return {totals,gaps};
  if(node.kind==="leaf"){totals[node.name]=(totals[node.name]||0)+Number(node.qty||0);if(node.gap)gaps.push(`${node.name}: ${node.reason||"no documented acquisition/production source"}`);return {totals,gaps}}
  if(node.kind==="alternatives"){gaps.push(`${node.name}: multiple production recipes exist; totals depend on which recipe is chosen.`);return {totals,gaps}}
  for(const c of node.children||[])collectRecipeLeaves(c,totals,gaps);return {totals,gaps};
}
function recipeNodeHtml(node,depth=0){
  if(node.kind==="leaf")return `<li>${esc(node.name)} ×${esc(node.qty)}${node.gap?` <span class="warn">(knowledge gap)</span>`:""}</li>`;
  if(node.kind==="alternatives")return `<li><b>${esc(node.name)} ×${esc(node.qty)}</b> — multiple recipes:<ul>${node.recipes.map(r=>recipeNodeHtml(r,depth+1)).join("")}</ul></li>`;
  const r=node.recipe;return `<li><b>${esc(node.name)} ×${esc(node.qty)}</b> — ${esc(r.skill||title(r.type))}${r.level!=null?` ${esc(r.level)}`:""}; ${esc(node.crafts)} craft${node.crafts===1?"":"s"}<ul>${(node.children||[]).map(c=>recipeNodeHtml(c,depth+1)).join("")}</ul></li>`;
}
function productionPlanAnswer(query,plan){
  const item=itemRecord(plan.item.name)||plan.item.obj;if(!item)return result(`<h3>${esc(plan.item.name)}</h3><p>I don't have a first-class item record for a production plan.</p>`,[plan.item],makeReasoning(query,plan,{uncertainties:["No first-class item record."]}));
  const recipes=recipeSources(item);
  if(!recipes.length){const alt=(item.acquisition||[]).length?chips([`How do I get ${item.name}?`]):"";return result(`<h3>Making ${esc(item.name)}</h3><p>I don't currently have a structured production recipe for this item.</p>${alt}<p class="muted small">That is a knowledge gap, not proof the item cannot be made.</p>`,[itemEntity(item)],makeReasoning(query,plan,{conclusions:["No structured production recipe is recorded."],uncertainties:["The item graph is not exhaustive."],sources:(item.acquisition||[]).map(a=>a.source)}));}
  const branches=recipes.map(r=>expandSpecificRecipe(item,1,r,{depth:0,maxDepth:8,seen:new Set()}));
  const parts=branches.map((node,i)=>{const {totals,gaps}=collectRecipeLeaves(node,{},[]);return `<p><b>${branches.length>1?`Recipe ${i+1}`:"Production plan"}</b></p><ul>${recipeNodeHtml(node)}</ul>${query.constraints.fromScratch?`<p><b>Terminal inputs in the current graph:</b> ${esc(Object.entries(totals).map(([k,v])=>`${k} ×${v}`).join(", ")||"None")}</p>`:""}${gaps.length?`<p class="warn"><b>Unresolved while expanding:</b> ${esc(unique(gaps).join("; "))}</p>`:""}`}).join("");
  const reqs=unique(recipes.map(r=>r.skill&&r.level!=null?`${r.skill} ${r.level}`:null)),sources=recipes.map(r=>r.source);
  const html=`<h3>How to make ${esc(item.name)}</h3>${reqs.length?`<p><b>Direct production requirement${reqs.length===1?"":"s"}:</b> ${esc(reqs.join(" / "))}</p>`:""}${parts}${query.constraints.fromScratch?`<p class="muted small">“From scratch” recursively expands only documented production recipes. A terminal input may still be bought, gathered, stolen, rewarded or dropped; ask about that item to see those routes.</p>`:""}${evidence(unique(sources),["Recipe expansion is deterministic. Missing sub-recipes remain explicit gaps rather than invented steps."])}`;
  return result(html,[itemEntity(item)],makeReasoning(query,plan,{conclusions:[`Found ${recipes.length} structured production recipe(s) for ${item.name}.`,query.constraints.fromScratch?"Expanded documented sub-recipes recursively to terminal inputs.":"Reported the direct recipe."],uncertainties:["Terminal inputs are not assumed to be raw or self-gatherable unless their own records say so."],sources}),[]);
}
function cheapestSourceAnswer(query,plan){
  const item=itemRecord(plan.item.name)||plan.item.obj;if(!item)return result(`<h3>${esc(plan.item.name)}</h3><p>I don't have an item record to compare shop prices.</p>`,[plan.item],makeReasoning(query,plan,{uncertainties:["No first-class item record."]}));
  const shops=(item.acquisition||[]).filter(a=>a.type==="shop"&&a.price!=null&&sourceHardMatches(a,{...query.constraints,includeMethods:["shop"]}));
  if(!shops.length)return result(`<h3>${esc(item.name)}</h3><p>I don't have a matching shop source with a numeric price to compare.</p><p class="muted small">I won't treat missing prices as free or cheaper.</p>`,[itemEntity(item)],makeReasoning(query,plan,{conclusions:["No comparable numeric shop prices matched the constraints."],uncertainties:["Missing or unlabelled prices were not ranked."]}));
  const min=Math.min(...shops.map(a=>Number(a.price))),best=shops.filter(a=>Number(a.price)===min);
  const html=`<h3>Lowest recorded shop price for ${esc(item.name)}</h3><p>${best.map(a=>`<b>${esc(sourceLine({kind:"shop",source:a}))}</b>`).join("<br>")}</p><p class="muted small">This compares recorded purchase price only. Stock, access, travel and opportunity cost are separate.</p>${evidence(unique(best.map(a=>a.source)),["Only numeric shop prices are compared."])}`;
  return result(html,[itemEntity(item)],makeReasoning(query,plan,{conclusions:[`Lowest recorded numeric shop price is ${min} Coins.`],uncertainties:["This is not an overall easiest/fastest ranking."],sources:best.map(a=>a.source)}),resultRefsFromSources(best.map(a=>({source:a}))));
}
function preferenceClarificationAnswer(query,plan){
  const item=itemRecord(plan.item.name)||plan.item.obj,name=item?.name||plan.item.name;
  return result(`<h3>What should “${/\bfastest\b/.test(query.q)?"fastest":/\b(?:easiest|simplest)\b/.test(query.q)?"easiest":"best"}” mean for ${esc(name)}?</h3><p>I can compare documented routes by measurable criteria, but I won't invent a single overall ranking.</p>${chips([`Which source for ${name} has the lowest documented skill requirement?`,`How do I get ${name} without combat?`,`Can I buy ${name}?`,`How do I make ${name}?`])}`,item?[itemEntity(item)]:[plan.item],makeReasoning(query,plan,{conclusions:["The requested ranking criterion is ambiguous."],uncertainties:["Fastest/easiest cannot be inferred safely from incomplete timing, travel and probability data."]}));
}
function highestDropRateAnswer(query,plan){
  const item=itemRecord(plan.item.name)||plan.item.obj;if(!item)return result(`<h3>${esc(plan.item.name)}</h3><p>I don't have a first-class item record to compare.</p>`,[plan.item],makeReasoning(query,plan,{uncertainties:["No first-class item record."]}));
  const drops=(item.acquisition||[]).filter(a=>a.type==="monster_drop"&&Number.isFinite(Number(a.rarityDenominator))&&sourceHardMatches(a,{...query.constraints,includeMethods:["monster_drop"]}));
  if(!drops.length)return result(`<h3>${esc(item.name)}</h3><p>I don't have a matching monster drop with a numeric recorded drop chance to compare.</p>`,[itemEntity(item)],makeReasoning(query,plan,{conclusions:["No comparable numeric monster-drop probabilities matched."],uncertainties:["Missing drop rates were not ranked."]}));
  const bestDen=Math.min(...drops.map(a=>Number(a.rarityDenominator))),best=drops.filter(a=>Number(a.rarityDenominator)===bestDen);const pct=(100/bestDen).toFixed(bestDen===1?0:2).replace(/\.00$/,'');
  const html=`<h3>Highest recorded drop chance for ${esc(item.name)}</h3><p>${best.map(a=>`<b>${esc(a.monster)}</b> — 1/${esc(a.rarityDenominator)} (${esc(pct)}%)${a.min!=null?` · ${esc(a.min===a.max?a.min:`${a.min}–${a.max}`)} per drop` : ""}`).join("<br>")}</p><p class="muted small">That compares the documented probability per drop roll only. It does not estimate kills per hour or time-to-drop.</p>${evidence(unique(best.map(a=>a.source)),["Only numeric recorded drop probabilities are compared."])}`;
  return result(html,[itemEntity(item)],makeReasoning(query,plan,{conclusions:[`Highest recorded monster-drop probability is 1/${bestDen}.`],uncertainties:["No kill-speed or time-to-drop estimate is inferred."],sources:best.map(a=>a.source)}),resultRefsFromSources(best.map(a=>({source:a}))));
}
function equipmentFamilyFromQuery(q){const map=[["swords",/\bswords?\b/],["scimitars",/\bscimitars?\b/],["maces",/\bmaces?\b/],["knives",/\bknives?|knife\b/],["spears",/\bspears?\b/],["bows",/\bbows?\b/],["arrows",/\barrows?\b/],["staves",/\bstaves?|staff\b/]];for(const [k,rx] of map)if(rx.test(q))return k;return null}
function skillMilestoneAnswer(query,plan){
  const sk=query.entities.find(e=>e.type==="skill"),key=sk?norm(sk.name):null,level=sk?(query.constraints.skillCaps[key]??query.overrides[key]):null;if(!sk||level==null)return result(`<h3>Skill milestone</h3><p>I need a skill and level to check that.</p>`,query.entities,makeReasoning(query,plan,{uncertainties:["Skill or level was not resolved."]}));
  const exact=[],below=[],above=[];
  for(const item of state.data.items?.records||[])for(const a of item.acquisition||[]){if(norm(a.skill)!==key||a.level==null)continue;const row={kind:"source",name:item.name,level:Number(a.level),detail:`${ACQ_LABELS[a.type]||title(a.type)}${a.area?` · ${a.area}`:""}`,source:a};if(row.level===Number(level))exact.push(row);else if(row.level<Number(level))below.push(row);else above.push(row)}
  for(const e of state.data.equipmentFlat||[]){const x=e.obj;if(norm(x.equipSkill)===key&&x.equipLevel!=null){const row={kind:"equip",name:e.name,level:Number(x.equipLevel),detail:"Equip requirement"};if(row.level===Number(level))exact.push(row);else if(row.level<Number(level))below.push(row);else above.push(row)}if(norm(x.craftSkill)===key&&x.craftLevel!=null){const row={kind:"make",name:e.name,level:Number(x.craftLevel),detail:"Production requirement"};if(row.level===Number(level))exact.push(row);else if(row.level<Number(level))below.push(row);else above.push(row)}}
  for(const qst of state.data.quests.records||[])for(const req of qst.requirements||[]){const r=parseLevelRequirement(req);if(r&&norm(r.skill)===key){const row={kind:"quest",name:qst.name,level:Number(r.level),detail:"Quest skill requirement"};if(row.level===Number(level))exact.push(row);else if(row.level<Number(level))below.push(row);else above.push(row)}}
  const dedup=rows=>{const seen=new Set();return rows.filter(r=>{const k=`${r.kind}:${r.name}:${r.level}`;if(seen.has(k))return false;seen.add(k);return true})};
  const ex=dedup(exact).sort((a,b)=>a.name.localeCompare(b.name)),lo=dedup(below).sort((a,b)=>b.level-a.level).slice(0,6),hi=dedup(above).sort((a,b)=>a.level-b.level).slice(0,6);
  let body="";if(ex.length)body=`<p>At exactly <b>${esc(sk.name)} ${esc(level)}</b>, these structured gates/unlocks are recorded:</p><ul>${ex.map(r=>`<li><b>${esc(r.name)}</b> — ${esc(r.detail)}</li>`).join("")}</ul>`;else body=`<p>I don't have a specific structured unlock recorded at exactly <b>${esc(sk.name)} ${esc(level)}</b>.</p>`;
  if(!ex.length&&(lo.length||hi.length))body+=`${lo.length?`<p><b>Nearest below:</b> ${esc(lo.map(r=>`${r.name} (${r.level})`).join(", "))}</p>`:""}${hi.length?`<p><b>Nearest above:</b> ${esc(hi.map(r=>`${r.name} (${r.level})`).join(", "))}</p>`:""}`;
  body+=`<p class="muted small">This checks structured item-source, equipment, production and quest skill gates. It does not invent hidden perks between documented levels.</p>`;
  return result(`<h3>${esc(sk.name)} ${esc(level)}</h3>${body}`,[sk],makeReasoning(query,plan,{conclusions:[ex.length?`Found ${ex.length} structured relationship(s) at exactly ${sk.name} ${level}.`:`No exact structured milestone was found at ${sk.name} ${level}.`],uncertainties:["A missing structured milestone is not proof that the game has no other effect at that level."]}),[],ex.map(r=>({kind:r.kind,itemName:r.name,level:r.level})));
}
function equipmentSearchAnswer(query,plan){
  const family=equipmentFamilyFromQuery(query.q),armour=/\barmou?r|helmets?|boots?|gloves?|legs?|bodies?\b/.test(query.q);let rows=(state.data.equipmentFlat||[]).filter(e=>family?e.family===family:armour?e.kind.startsWith("armour"):false);
  const skillEntity=query.entities.find(e=>e.type==="skill"),skill=skillEntity?.name||null;let cap=null;if(skill)cap=query.constraints.skillCaps[norm(skill)]??query.overrides[norm(skill)]??state.conversation.userFacts?.skills?.[norm(skill)]?.level??playerSkill(skill)?.level??null;
  if(skill)rows=rows.filter(e=>!e.obj?.equipSkill||norm(e.obj.equipSkill)===norm(skill));if(cap!=null)rows=rows.filter(e=>e.obj?.equipLevel!=null&&Number(e.obj.equipLevel)<=Number(cap));
  rows.sort((a,b)=>(a.obj?.equipLevel??999)-(b.obj?.equipLevel??999)||a.name.localeCompare(b.name));
  if(!rows.length)return result(`<h3>Equipment search</h3><p>I don't have a structured match for that category and level.</p>`,query.entities,makeReasoning(query,plan,{conclusions:["No equipment records matched the category/skill filters."]}));
  const label=family?title(family):"Armour";const html=`<h3>${esc(label)}${cap!=null?` at ${esc(skill||"level")} ${esc(cap)}`:""}</h3><p>I found <b>${rows.length}</b> recorded option${rows.length===1?"":"s"}${cap!=null?" you can equip at or below that level":""}.</p><ul>${rows.map(e=>`<li><b>${esc(e.name)}</b>${e.obj?.equipSkill?` — ${esc(e.obj.equipSkill)} ${esc(e.obj.equipLevel)}`:""}${e.obj?.craftSkill?` · make: ${esc(e.obj.craftSkill)} ${esc(e.obj.craftLevel??"unknown")}`:""}</li>`).join("")}</ul><p class="muted small">Equip requirements and production requirements are kept separate.</p>`;
  return result(html,rows.slice(0,6),makeReasoning(query,plan,{conclusions:[`Matched ${rows.length} structured ${label.toLowerCase()} record(s)${cap!=null?` at or below ${skill} ${cap}`:""}.`]}),[],rows.slice(0,80).map(e=>({kind:"equipment",itemName:e.name,equipSkill:e.obj?.equipSkill||null,equipLevel:e.obj?.equipLevel??null})));
}
function refineResultSetAnswer(query,plan){
  const thread=activeThread(),base=thread?.resultSet||[],terms=query.searchTerms||[],priceCurrency=/\b[\d,]+\s*coins?\b/.test(query.q),named=unique((query.entities||[]).filter(e=>["item","resource","equipment"].includes(e.type)&&e.score>=115&&!(priceCurrency&&norm(e.name)==="coins")).map(e=>norm(e.name)));if(!base.length)return result(`<h3>Nothing to narrow down yet</h3><p>Give me a list or search to narrow down first.</p>`,[],makeReasoning(query,plan,{uncertainties:["No prior candidate set is active."]}));
  const rows=base.filter(r=>{const item=itemRecord(r.itemName);if(!item)return false;if(named.length&&!named.includes(norm(item.name)))return false;if(query.constraints.maxPrice!=null&&r.source?.type==="shop"&&Number.isFinite(Number(r.source.price))&&Number(r.source.price)>query.constraints.maxPrice)return false;return itemMatchesSemanticTerms(item,terms)});if(!rows.length)return result(`<h3>No matches after that filter</h3><p>Nothing in that list matches <b>${esc(terms.join(" ")||"that category")}</b>.</p><p class="muted small">Try a different filter if you want to narrow it another way.</p>`,thread.topicEntities||[],makeReasoning(query,plan,{conclusions:["The requested filter matched none of the prior candidates; the candidate set remains available for another refinement."]}),[],base);
  const filterLabel=terms.join(" ")||(named.length?named.map(title).join(", "):"that category");
  const html=`<h3>Filtered results</h3><p>Okay — that leaves <b>${rows.length}</b> match${rows.length===1?"":"es"} for <b>${esc(filterLabel)}</b>.</p><ul>${rows.slice(0,45).map(r=>{const a=r.source;return `<li><b>${esc(r.itemName)}</b>${a?` — ${esc(sourceLine({kind:a.type,source:a}))}`:""}</li>`}).join("")}</ul>${rows.length>45?`<p class="muted small">${rows.length-45} additional matches omitted.</p>`:""}`;
  return result(html,unique(rows.slice(0,6).map(r=>{const it=itemRecord(r.itemName);return it?itemEntity(it):null}).filter(Boolean)),makeReasoning(query,plan,{conclusions:[`Filtered the previous ${base.length}-row result set to ${rows.length} row(s).`]}),resultRefsFromSources(rows.filter(r=>r.source).map(r=>({source:r.source}))),rows);
}
function rankResultSetPriceAnswer(query,plan){
  const base=activeThread()?.resultSet||[],shops=base.filter(r=>r.source?.type==="shop"&&Number.isFinite(Number(r.source.price)));if(!shops.length)return result(`<h3>I can't compare those by price</h3><p>I don't have comparable numeric shop prices for those results.</p>`,[],makeReasoning(query,plan,{uncertainties:["Missing/unlabelled prices are not treated as zero."]}));
  const min=Math.min(...shops.map(r=>Number(r.source.price))),best=shops.filter(r=>Number(r.source.price)===min);const html=`<h3>Cheapest option</h3><p>${best.map(r=>`<b>${esc(r.itemName)}</b> — ${esc(sourceLine({kind:"shop",source:r.source}))}`).join("<br>")}</p>`;
  return result(html,unique(best.map(r=>{const it=itemRecord(r.itemName);return it?itemEntity(it):null}).filter(Boolean)),makeReasoning(query,plan,{conclusions:[`Lowest numeric shop price in the active result set is ${min}.`],uncertainties:["This ranks price only, not travel, stock or access."]}),resultRefsFromSources(best.map(r=>({source:r.source}))),base);
}
function downstreamUsePaths(itemName,maxDepth=3){
  const out=[],walk=(name,path,depth,seen)=>{if(depth>maxDepth)return;const item=itemRecord(name);if(!item)return;for(const u of item.uses||[]){if(u.type!=="material_for"&&u.type!=="plant_to_grow"&&u.type!=="plant_tree")continue;const next=u.output;if(!next||seen.has(norm(next)))continue;const np=[...path,{from:name,to:next,use:u}];out.push(np);const ns=new Set(seen);ns.add(norm(next));walk(next,np,depth+1,ns)}};walk(itemName,[],1,new Set([norm(itemName)]));return out;
}
function downstreamUseAnswer(name){
  const item=itemRecord(name);if(!item)return itemUseAnswer(name);const paths=downstreamUsePaths(item.name,3);if(!paths.length)return itemUseAnswer(name);
  const leaves=paths.filter(p=>!paths.some(q=>q.length>p.length&&q.slice(0,p.length).every((x,i)=>x.to===p[i].to))).slice(0,30);
  const urls=unique(paths.flatMap(p=>p.map(x=>x.use.source)).filter(Boolean));
  return `<h3>What ${esc(item.name)} can lead to</h3><p>Following structured use relationships up to three steps:</p><ul>${leaves.map(p=>`<li>${esc([item.name,...p.map(x=>x.to)].join(" → "))}</li>`).join("")}</ul><p class="muted small">These are relationship paths, not claims that every downstream item is worthwhile or currently accessible.</p>${evidence(urls,["Only structured use edges are traversed."])}`;
}
function sourceLocationAnswer(query,plan){
  const ref=plan.sourceRef?.obj||plan.sourceRef;if(!ref)return null;const a=ref.source||ref;
  if(a.type==="monster_drop"&&a.monster){const m=(state.data.monsters.records||[]).find(x=>norm(x.name)===norm(a.monster));if(m)return result(monsterWhere(m),[{type:"monster",name:title(m.name),obj:m,score:180}],makeReasoning(query,plan,{conclusions:[`Resolved ${a.monster} as the referenced monster-drop source and used its structured location links.`],sources:[a.source]}));}
  let where="";
  if(a.area)where+=a.area;if(a.location)where+=`${where?" → ":""}${a.location}`;else if(a.room)where+=`${where?" → ":""}${a.room}`;else if(a.shop)where+=`${where?" → ":""}${a.shop}`;
  const methodLabel=ACQ_LABELS[a.type||ref.method]||title(a.type||ref.method||"source");
  const html=`<h3>${esc(ref.name||sourceActorName(a)||"Referenced source")}</h3>${where?`<p>The <b>${esc(methodLabel)}</b> source is recorded at <b>${esc(where)}</b>.</p>`:`<p>I know which source you mean, but I don’t have a more precise structured location for it.</p>`}`;
  return result(html,[plan.sourceRef],makeReasoning(query,plan,{conclusions:[where?`Referenced source location: ${where}.`:"No precise location is structured for the referenced source."],sources:[a.source]}));
}
function whyAnswer(){
  const r=state.lastReasoning;if(!r)return `<h3>Why?</h3><p>I don't have a previous reasoning trace in this session yet.</p>`;
  const constraints=r.interpretation?.constraints||{},cs=[];
  if(constraints.includeMethods?.length)cs.push(`included methods: ${constraints.includeMethods.map(x=>ACQ_LABELS[x]||title(x)).join(", ")}`);
  if(constraints.excludeMethods?.length)cs.push(`excluded methods: ${constraints.excludeMethods.map(x=>ACQ_LABELS[x]||title(x)).join(", ")}`);
  if(constraints.areas?.length)cs.push(`area: ${constraints.areas.join(", ")}`);
  if(Object.keys(constraints.skillCaps||{}).length)cs.push(`levels: ${Object.entries(constraints.skillCaps).map(([k,v])=>`${title(k)} ${v}`).join(", ")}`);
  return `<h3>Why I answered that way</h3><p>I interpreted your previous question as <b>${esc(r.goal)}</b>${r.interpretation?.entities?.length?` about ${esc(r.interpretation.entities.join(", "))}`:""}.</p>${cs.length?`<p><b>Constraints I applied:</b> ${esc(cs.join("; "))}.</p>`:""}${r.conclusions?.length?`<p><b>Deterministic conclusions:</b></p><ul>${r.conclusions.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:""}${r.uncertainties?.length?`<p class="warn"><b>Limits:</b></p><ul>${r.uncertainties.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:""}${evidence(r.sources||[],["This is the Companion's explicit query trace, not hidden model reasoning."])}`;
}
function clarificationAnswer(query){
  const opts=query.ambiguity?.options||[];
  return `<h3>I need one distinction</h3><p>${esc(query.ambiguity?.reason||"More than one interpretation fits.")}</p>${chips(opts.map(o=>o.type==="source_ref"?`${o.name} — ${title(o.role||"source")}`:`Tell me about ${o.name}`))}`;
}
function glossaryAnswer(entry){
  const forms=(entry.forms||[]).slice(1,6);const srcs=unique((entry.evidence||[]).map(x=>x.url).filter(Boolean));
  return `<h3>${esc(title((entry.forms||[])[0]||entry.id))}</h3><p>${esc(entry.definition)}</p>${forms.length?`<p class="muted small">You may also see: ${esc(forms.join(", "))}.</p>`:""}${evidence(srcs,["This explains how the term is used; FlatMMO mechanics still come from the structured game data."])}`;
}
function foreignComparisonAnswer(match){
  if(match?.kind==="stock"){const c=match.comparison;return `<h3>${esc(c.flatmmoTerm)} and ${esc(c.foreignGame)}</h3><p>${esc(c.answer)}</p>${evidence([c.source].filter(Boolean),["The other game is used only for comparison; FlatMMO names and mechanics remain authoritative."])}`}
  return `<h3>Comparing with another game</h3><p>${esc(match?.answer||"There may be a useful broad comparison, but I won't import another game's mechanics into FlatMMO.")}</p>`;
}
function genericReasoning(query,plan,conclusion,sources=[],uncertainties=[]){return makeReasoning(query,plan,{conclusions:[conclusion],sources,uncertainties})}
function executeQuery(query,plan){
  if(query.goal==="glossary")return result(glossaryAnswer(query.glossary),[],genericReasoning(query,plan,`Explained attested FlatMMO term ${(query.glossary.forms||[])[0]||query.glossary.id}.`,(query.glossary.evidence||[]).map(x=>x.url),["Glossary definitions interpret language; mechanics remain governed by FlatMMO structured data."]));
  if(query.goal==="foreign_comparison")return result(foreignComparisonAnswer(query.languageComparison),[],genericReasoning(query,plan,"Used a quarantined foreign-game comparison response.",query.languageComparison?.comparison?.source?[query.languageComparison.comparison.source]:[],["Foreign-game terminology was not added to the FlatMMO entity catalog."]));
  if(query.goal==="explain")return result(whyAnswer(),[],null,[]);
  if(query.goal==="user_fact"){
    const sk=query.entities.find(e=>e.type==="skill"),known=sk?knownSkillLevel(sk.name,query.overrides,query.constraints?.skillCaps||{}):null;
    const html=known?`<h3>${esc(sk.name)}</h3><p>You told me your <b>${esc(sk.name)} is ${esc(known.level)}</b>.</p>`:`<h3>${esc(sk?.name||"Skill level")}</h3><p>I don't have a level for that yet. Tell me yours and I can use it when it matters.</p>`;
    return result(html,sk?[sk]:[],genericReasoning(query,plan,known?`Used the player's ${sk.name} level from ${known.basis}.`:`No known player level is stored for ${sk?.name||"that skill"}.`));
  }
  if(query.goal==="repair_clarify")return result(`<h3>Got it — I had the wrong thing.</h3><p>What did you mean instead?</p><p class="muted small">You can just say the subject, for example “Mining”, or correct the detail: “combat is fine; I meant without stealing”.</p>`,query.entities||[],null,[]);
  if(query.ambiguity)return result(clarificationAnswer(query),query.ambiguity.options,genericReasoning(query,plan,"Asked for clarification because multiple interpretations were similarly strong."));
  if(plan.route==="source_location"){const v=sourceLocationAnswer(query,plan);if(v)return v}
  if(plan.route==="item_acquisition")return reasonedAcquisitionAnswer(query,plan);
  if(plan.route==="search_acquisition")return acquisitionSearchAnswer(query,plan);
  if(plan.route==="earliest_source")return earliestSourceAnswer(query,plan);
  if(plan.route==="cheapest_source")return cheapestSourceAnswer(query,plan);
  if(plan.route==="highest_drop_rate")return highestDropRateAnswer(query,plan);
  if(plan.route==="equipment_search")return equipmentSearchAnswer(query,plan);
  if(plan.route==="skill_milestone")return skillMilestoneAnswer(query,plan);
  if(plan.route==="refine_result_set")return refineResultSetAnswer(query,plan);
  if(plan.route==="rank_result_set_price")return rankResultSetPriceAnswer(query,plan);
  if(plan.route==="preference_clarification")return preferenceClarificationAnswer(query,plan);
  if(plan.route==="equipment_materials"){const e=plan.item;return result(equipmentAnswer(e.obj,query.q,query.overrides),[e],genericReasoning(query,plan,`Calculated structured requirements/materials for ${e.name}.`,e.obj.obj?.sources||[]));}
  if(plan.route==="item_production")return productionPlanAnswer(query,plan);
  if(plan.route==="item_uses"){const item=itemRecord(plan.item.name)||plan.item.obj;const deep=/\b(lead to|leads to|downstream|eventually|turn into)\b/.test(query.q);return result(deep?downstreamUseAnswer(item.name):itemUseAnswer(item.name),[itemEntity(item)],genericReasoning(query,plan,deep?`Traversed structured downstream uses for ${item.name}.`:`Looked up structured uses for ${item.name}.`,(item.uses||[]).map(u=>u.source),["Only structured uses are traversed/listed."]))}

  const entities=query.entities,intent=query.intent,q=query.q,overrides=query.overrides,collection=query.collection,directRule=query.directRule;
  if(intent==="player_next")return result(playerAware(),entities,genericReasoning(query,plan,"Built a stats-only next-step set from the loaded skill snapshot.",[],["Bank, inventory, equipment and quest completion are not available yet."]));
  if((intent==="count"||intent==="list")&&collection)return result(collectionAnswer(collection,intent),entities,genericReasoning(query,plan,`Enumerated the structured ${collection} collection.`));
  if(directRule&&(intent==="mechanics"||!entities.length))return result(ruleAnswer(directRule),[{type:"rule",name:directRule.name,obj:directRule,score:180}],genericReasoning(query,plan,`Matched the question to mechanics rule ${directRule.name}.`,directRule.sources||[],directRule.unknowns||[]));
  if(intent==="compare"){const v=compareAnswer(entities);if(v)return result(v,entities,genericReasoning(query,plan,"Compared recorded fields only; no overall winner was inferred."))}

  const quests=entities.filter(e=>e.type==="quest"),monsters=entities.filter(e=>e.type==="monster"),areas=entities.filter(e=>e.type==="area"),skills=entities.filter(e=>e.type==="skill"),equipment=entities.filter(e=>e.type==="equipment"),rooms=entities.filter(e=>e.type==="room"),npcs=entities.filter(e=>e.type==="npc"),resources=entities.filter(e=>e.type==="resource"||e.type==="item"),shops=entities.filter(e=>e.type==="shop"),rules=entities.filter(e=>e.type==="rule"),mechanics=entities.filter(e=>e.type==="mechanic");
  if(intent==="travel"&&areas.length){const v=travelAnswer(areas);if(v)return result(v,areas,genericReasoning(query,plan,"Traversed explicit area connections only.",[],["Undocumented room adjacency is not invented."]))}
  if(intent==="beds"&&areas[0])return result(bedsAnswer(areas[0].obj),areas,genericReasoning(query,plan,`Listed explicitly documented beds in ${areas[0].name}.`));
  if(intent==="monsters_in_area"&&areas[0])return result(monstersInArea(areas[0].obj),areas,genericReasoning(query,plan,`Used exact room-linked monsters for ${areas[0].name}.`,[],["Unlinked monsters may be omitted."]));
  if(quests[0]){const ready=query.goal==="readiness"||intent==="requirements"||/\b(can i|ready|requirements?|need)\b/.test(q);return result(questAnswer(quests[0].obj,ready,overrides),quests,genericReasoning(query,plan,ready?`Checked ${quests[0].name} requirements against known/stated skill levels.`:`Returned the structured ${quests[0].name} quest record.`,[quests[0].obj.source].filter(Boolean),["Items/access/completion may remain unknown."]))}
  if(monsters[0]){let html,conclusion;if(intent==="drops"){html=monsterDrops(monsters[0].obj);conclusion="Returned recorded monster drops."}else if(intent==="locate"){html=monsterWhere(monsters[0].obj);conclusion="Returned exact room links where available."}else if(intent==="requirements"||intent==="mechanics"||/\b(fight|combat|weak|best|recommended|dps|hit chance)\b/.test(q)){html=monsterCombat(monsters[0].obj);conclusion="Compared only verified combat fields and preserved formula limits."}else{html=monsterProfile(monsters[0].obj);conclusion="Returned the structured monster profile."}return result(html,monsters,genericReasoning(query,plan,conclusion,["https://flatmmo.wiki/index.php/Monsters"],["Exact combat DPS/recommended levels remain unresolved."]))}
  if(shops[0]&&/\b(sell|sells|stock|inventory|buy|shop|store)\b/.test(q))return result(shopInventoryAnswer(shops[0]),shops,genericReasoning(query,plan,`Listed item-specific inventory for ${shops[0].name}.`));
  if(areas[0]&&/\b(shop|store)\b/.test(q)&&/\b(sell|sells|stock|inventory|buy|what)\b/.test(q))return result(shopInventoryAnswer(areas[0]),areas,genericReasoning(query,plan,`Listed item-specific shops in ${areas[0].name}.`));
  if(equipment[0]&&intent==="materials")return result(equipmentAnswer(equipment[0].obj,q,overrides),equipment,genericReasoning(query,plan,`Calculated structured materials for ${equipment[0].name}.`,equipment[0].obj.obj?.sources||[]));
  if(resources[0]&&intent==="info")return result(itemOverviewAnswer(resources[0].name),resources,genericReasoning(query,plan,`Summarized acquisition/use coverage for ${resources[0].name}.`));
  if(rooms[0])return result(roomAnswer(rooms[0]),rooms,genericReasoning(query,plan,`Returned structured room data for ${rooms[0].name}.`));
  if(npcs[0])return result(npcAnswer(npcs[0]),npcs,genericReasoning(query,plan,`Returned structured NPC data for ${npcs[0].name}.`));
  const service=serviceAnswer(q,areas[0]?.obj||null);if(service&&(intent==="locate"||/\b(service|shop|store|bank|travel|teleport)\b/.test(q)))return result(service,areas,genericReasoning(query,plan,"Matched documented room/NPC service relationships."));
  if(equipment[0])return result(equipmentAnswer(equipment[0].obj,q,overrides),equipment,genericReasoning(query,plan,`Returned structured equipment data for ${equipment[0].name}.`,equipment[0].obj.obj?.sources||[]));
  if(skills[0]){const key=norm(skills[0].name),level=overrides[key]??query.constraints.skillCaps[key];if(norm(skills[0].name)==="stealing"&&level!=null&&/\b(steal|pickpocket|stall|chest|unlock|can i)\b/.test(q))return result(stealingProgressionAnswer(level),skills,genericReasoning(query,plan,`Filtered Stealing sources to level ${level} or below.`));if(level!=null&&(intent==="progression"||/\b(at|level|equip|make|unlock|can i)\b/.test(q)))return result(skillProgressionAnswer(skills[0].obj,level),skills,genericReasoning(query,plan,`Filtered structured ${skills[0].name} unlocks to level ${level} or below.`));return result(skillAnswer(skills[0].obj),skills,genericReasoning(query,plan,`Returned the structured ${skills[0].name} skill record.`,[skills[0].obj.source].filter(Boolean)))}
  if(rules[0])return result(ruleAnswer(rules[0].obj),rules,genericReasoning(query,plan,`Returned mechanics rule ${rules[0].name}.`,rules[0].obj.sources||[],rules[0].obj.unknowns||[]));
  if(mechanics[0])return result(mechanicAnswer(mechanics[0].obj),mechanics,genericReasoning(query,plan,`Returned mechanic ${mechanics[0].name}.`,[mechanics[0].obj.source].filter(Boolean)));
  if(areas[0])return result(areaAnswer(areas[0].obj),areas,genericReasoning(query,plan,`Returned structured area data for ${areas[0].name}.`,[areas[0].obj.source].filter(Boolean)));
  if(collection&&(intent==="info"||intent==="mechanics"))return result(collectionAnswer(collection,"count"),entities,genericReasoning(query,plan,`Counted the structured ${collection} collection.`));
  return result(unknown(q),entities,genericReasoning(query,plan,"No supported interpretation/entity combination was strong enough to answer safely.",[],["The Companion chose not to fill the gap from another game or from unsupported assumptions."]));
}
function unknown(q){
  const candidates=resolveEntities(q,{limit:4});return `<h3>I’m not confident I understood that</h3><p>I can see it’s a FlatMMO question, but I’d rather ask than confidently answer the wrong thing.</p>${candidates.length?`<p>Were you talking about one of these?</p>${chips(candidates.map(x=>`Tell me about ${x.name}`))}`:""}<p class="muted small">Phrase it normally. If I grab the wrong subject, just correct me.</p>`;
}
function conversationalLead(query){
  if(query.repair&&!query.repair.needsReplacement){const topic=queryTopicEntities(query.entities,query.goal,query.q)[0]?.name||query.contextThreadLabel||null;return `<p><b>Got it${topic?` — ${esc(topic)}`:""}.</b></p>`}
  if(query.move==="return"&&query.contextThreadLabel)return `<p><b>Back to ${esc(query.contextThreadLabel)}.</b></p>`;
  if(query.contextUsed&&/^(?:what if|actually|instead)\b/.test(query.q))return `<p><b>That changes it.</b></p>`;
  return "";
}
function repairFailsafeChip(query){if(query.goal==="explain"||query.goal==="repair_clarify"||query.repair)return "";if(query.contextUsed||query.move==="continue"||query.move==="branch"||query.move==="return")return chips(["That's not what I meant"]);return ""}

function submitQuestion(text,{record=true}={}){
  const raw=String(text||"").trim(); if(!raw) return;
  addMsg("user",esc(raw),record);
  let html;
  try{html=answer(raw)}catch(e){html=`<p class="bad">The deterministic query engine hit an error: ${esc(e.message)}</p>`;console.error(e)}
  addMsg("bot",html,record);
  if(record && !state.restoring){
    state.history.push(raw);state.history=state.history.slice(-MAX_HISTORY);saveLocal();
  }
}

