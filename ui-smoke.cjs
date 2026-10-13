/* DOM-stub integration test, not a visual browser test. Run: node ui-smoke.cjs */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
function element(){return {value:'',checked:false,style:{},children:[],events:{},addEventListener(k,fn){this.events[k]=fn},appendChild(x){this.children.push(x)},scrollIntoView(){},classList:{add(){},remove(){},toggle(){}},setAttribute(){}}}
async function run(saved){
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)};
 const sandbox={console,structuredClone,URL,URLSearchParams,setTimeout,clearTimeout,AbortController,location:{hash:'',pathname:'/',search:''},history:{replaceState(){}},document:{querySelector:node,createElement:element,addEventListener(){}},fetch:async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(__dirname,url),'utf8'))})};
 Object.defineProperty(sandbox,'localStorage',{get(){if(saved)return {getItem:()=>JSON.stringify(saved),setItem(){},removeItem(){}};throw Error('Storage disabled')}});
 const ctx=vm.createContext(sandbox);
 for(const f of ['companion-engine.js','companion-conversation.js','companion-ui.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,f),'utf8'),ctx);
 await new Promise(resolve=>setTimeout(resolve,50));
 assert.equal(vm.runInContext('state.ready',ctx),true);assert.match(node('#loadState').textContent,/588 items, 1574 typed graph nodes/);
 if(saved)assert.equal(vm.runInContext('state.conversation.userFacts.skills.crafting.level',ctx),50);
 node('#q').value='Full Iron Armour from scratch. What do I need?';node('#askForm').events.submit({preventDefault(){}});
 assert.match(node('#chat').children.at(-1).innerHTML,/Iron Ore.*125/);
 node('#q').value='Just the totals';node('#askForm').events.submit({preventDefault(){}});
 assert.match(node('#chat').children.at(-1).innerHTML,/Coal Ore.*125/);
 assert.equal(node('#q').value,'');
 return node('#chat').children.length;
}
(async()=>{await run(null);console.log('PASS bootstrap and form submission with storage disabled');await run({history:['I am Crafting 48','No, make that Crafting 50','What if my Crafting was 60?']});console.log('PASS optional history replay preserves corrected actual facts');})().catch(e=>{console.error(e);process.exit(1)});
