"use strict";
document.addEventListener("click",e=>{
  const b=e.target.closest(".chip");if(!b)return;
  const q=b.dataset.q||b.textContent;$("#q").value="";submitQuestion(q);
});
$("#askForm").addEventListener("submit",e=>{e.preventDefault();const q=$("#q").value;$("#q").value="";submitQuestion(q)});
$("#loadPlayer").addEventListener("click",()=>loadPlayer($("#username").value));
$("#refreshPlayer").addEventListener("click",()=>loadPlayer($("#username").value));
$("#username").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();loadPlayer($("#username").value)}});
$("#username").addEventListener("input",changePlayerIdentity);
$("#manualPlayer").addEventListener("click",openManualPlayer);
$("#manualForm").addEventListener("submit",e=>{e.preventDefault();saveManualPlayer()});
$("#cancelManual").addEventListener("click",()=>$("#manualDialog").close());
$("#openOfficialProfile").addEventListener("click",()=>{const u=$("#username").value.trim();if(u)window.open(officialProfileUrl(u),"_blank","noopener")});
$("#copyProfileLink").addEventListener("click",async()=>{
  const u=$("#username").value.trim();if(!u)return;
  const link=portableUrl(u);$("#portableLink").textContent=link;$("#linkDialog").showModal();
  try{await copyText(link)}catch(_){}
});
$("#copyDialogLink").addEventListener("click",async()=>{try{await copyText($("#portableLink").textContent);$("#copyDialogLink").textContent="Copied"}catch(_){}});
$("#clearLocal").addEventListener("click",clearLocal);

loadAll().catch(err=>{
  $("#loading").textContent="Could not load one or more Companion data files.";
  $("#loadState").textContent="Knowledge load failed";
  addMsg("bot",`<h3>Data load failed</h3><p class="bad">${esc(err.message)}</p><p>Make sure this index.html is deployed beside the FlatMMO JSON files on GitHub Pages.</p>`);
});
