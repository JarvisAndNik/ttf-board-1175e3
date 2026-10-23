'use strict';
let data = null, selected = null, filter = 'ready', key = '', loading = false;
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = value => value ? new Date(value).toLocaleString('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : 'Unknown';
function storageGet(name){try{return localStorage.getItem(name);}catch(e){return null;}}
function storageSet(name,value){try{localStorage.setItem(name,value);}catch(e){toast('Browser storage unavailable; keep this tab open.');}}
function bytes(s){return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
function toast(text){$('toast').textContent=text;$('toast').classList.remove('hidden');setTimeout(()=>$('toast').classList.add('hidden'),3500);}
function review(item){return ['held','needs_info','pending'].includes(item.state);}
function label(item){return {ready:'READY',held:'REVIEW',needs_info:'RESEARCH',pending:'PREPARING',no_reply_needed:'NO REPLY NEEDED'}[item.state]||item.state;}
function editKey(item){return 'responder-edit:'+item.person_id+':'+item.fingerprint;}
function draftText(item){return storageGet(editKey(item)) ?? item.result?.draft ?? '';}
function renderList(){
  const query=$('search').value.trim().toLowerCase();
  $('ready-count').textContent=data.items.filter(i=>i.state==='ready').length;
  $('review-count').textContent=data.items.filter(review).length;
  const items=data.items.filter(i=>(filter==='all'||(filter==='ready'?i.state==='ready':review(i)))&&(!query||(i.name+' '+i.tags.join(' ')).toLowerCase().includes(query)));
  $('list').innerHTML=items.map(i=>'<button class="lead '+(i.person_id===selected?'selected':'')+'" data-id="'+i.person_id+'"><div class="row"><span class="name">'+esc(i.name)+'</span><span class="pill '+(review(i)?'review':i.state==='no_reply_needed'?'done':'')+'">'+esc(label(i))+'</span></div><div class="preview">'+esc(i.trigger.body||'[Attachment]')+'</div><div class="muted">'+esc(fmt(i.trigger.at))+' · '+esc(i.route.kind==='group'?'Group conversation':'Direct conversation')+'</div></button>').join('')||'<div class="empty">'+(query?'No matching conversations.':filter==='ready'?'No ready drafts in this scan. Check Needs review for requests that need your input.':'Nothing here right now.')+'</div>';
  document.querySelectorAll('.lead').forEach(el=>el.onclick=()=>openConversation(Number(el.dataset.id)));
}
function bubble(m){return '<div class="bubble '+(m.who==='NIK'?'me':'')+'"><span class="speaker">'+esc(m.who)+' · thread '+esc(m.chats.join(', '))+'</span>'+esc(m.body||'')+(m.attachment?'\n[Attachment — open Messages to view]':'')+(m.decode_failed?'\n[Message could not be decoded]':'')+'<small>'+esc(fmt(m.at))+(m.send_status&&m.send_status!=='sent'?' · '+esc(m.send_status):'')+'</small></div>';}
function renderDetail(){
  const i=data.items.find(x=>x.person_id===selected);
  if(!i){$('detail').innerHTML='<div class="empty">This conversation is no longer awaiting your reply in the latest scan.</div>';return;}
  const result=i.result||{};
  const route=i.route.kind==='group'?'Group · '+i.route.recipients.join(', '):i.route.recipients.join(', ')||'Original thread';
  let html='<div class="detail-top"><button class="back" id="back">‹ Inbox</button><div><h1>'+esc(i.name)+'</h1><div class="muted">'+esc(i.tags.join(' · '))+'</div></div></div><div class="muted">'+esc(route)+'<br>Latest scan '+esc(fmt(data.scan_at))+'</div>';
  html+='<div class="section-label">Recent conversation</div><div class="conversation">'+i.messages.slice(-8).map(bubble).join('')+'</div>';
  html+='<details><summary>Read all '+i.messages.length+' messages across related threads</summary><div class="conversation">'+i.messages.map(bubble).join('')+'</div></details>';
  if(i.state==='ready'){
    html+='<div class="composer"><label class="section-label" for="draft">Your reply · edit before sending</label><textarea id="draft">'+esc(draftText(i))+'</textarea><p class="reason">'+esc(result.reason)+'</p><div class="actions"><button class="primary" id="open-message">Review in Messages</button><button id="copy">Copy reply</button></div><p class="muted">'+esc(i.route.reason)+' You send from Messages.</p><p class="muted" id="edit-status">Drafted '+esc(fmt(i.drafted_at))+'. Opening Messages does not mark it sent.</p></div>';
  }else{
    html+='<div class="composer"><span class="pill '+(review(i)?'review':'done')+'">'+esc(label(i))+'</span><p class="reason">'+esc(i.hold||result.reason||'Waiting for a context-aware draft.')+'</p><div class="notice">'+esc(result.next_step||'The next scan will retry pending work. You can review the original thread now.')+'</div><div class="actions"><button id="open-original">Open original conversation</button></div></div>';
  }
  if(i.notes?.length){html+='<details><summary>FUB notes · '+i.notes.length+' · checked '+esc(fmt(i.crm_checked_at))+'</summary>'+i.notes.map(n=>'<pre class="note">'+esc(fmt(n.created))+'\n'+esc(n.body)+'</pre>').join('')+'</details>';}
  html+='<footer>Messages can arrive late through iCloud. No visible reply as of '+esc(fmt(data.scan_at))+'. Attachment content and live listing availability require review.</footer>';
  $('detail').innerHTML=html;
  if($('back'))$('back').onclick=()=>document.body.classList.remove('view-chat');
  if($('draft')){
    $('draft').oninput=()=>{storageSet(editKey(i),$('draft').value);$('edit-status').textContent='Your edits are saved on this browser. Not sent.';};
    $('copy').onclick=()=>copy($('draft').value);
    $('open-message').onclick=()=>openMessages(i,$('draft').value);
  }
  if($('open-original'))$('open-original').onclick=()=>openMessages(i,'');
}
function openConversation(id){selected=id;renderList();renderDetail();document.body.classList.add('view-chat');$('detail').scrollTop=0;}
async function copy(text){try{await navigator.clipboard.writeText(text);toast('Copied. Review and send in Messages.');}catch(e){toast('Select the reply text and copy it manually.');}}
function messageURL(item,text,platform){
  const recipients=item.route.recipients;
  if(item.route.kind==='manual'||!recipients.length)return null;
  if(!recipients.every(p=>/^\+1\d{10}$/.test(p)))return null;
  const body=encodeURIComponent(text);
  if(platform==='android')return 'sms:'+recipients.join(',')+(text?'?body='+body:'');
  return recipients.length>1?'sms:/open?addresses='+recipients.join(',')+(text?'&body='+body:''):'sms:'+recipients[0]+(text?'&body='+body:'');
}
async function openMessages(item,text){
  const platform=/Android/i.test(navigator.userAgent)?'android':'apple';
  const url=messageURL(item,text,platform);
  if(!url){if(text)await copy(text);toast('Open the original thread in Messages; preserve its participants.');return;}
  if(/Macintosh/.test(navigator.userAgent)&&!navigator.maxTouchPoints&&text)await copy(text);
  window.location.href=url;
}
function status(){
  const age=(Date.now()-Date.parse(data.scan_at))/60000;
  const warning=age>90||data.errors.length;
  $('status').classList.toggle('warning',Boolean(warning));
  $('status').textContent=(warning?'Check freshness · ':'')+'Scanned '+fmt(data.scan_at)+' · '+(data.complete?'Draft pass complete':'Drafting in progress')+' · Latest local message '+fmt(data.source_latest_at)+(data.errors.length?' · '+data.errors.length+' items need retry':'');
}
async function load(){
  if(loading||!key)return;
  loading=true;$('refresh').disabled=true;
  try{
    const response=await fetch('payload-responder.b64?t='+Date.now(),{cache:'no-store'});
    if(!response.ok)throw new Error('Inbox could not be fetched.');
    const raw=bytes((await response.text()).trim());
    const cryptoKey=await crypto.subtle.importKey('raw',bytes(key),'AES-GCM',false,['decrypt']);
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:raw.slice(0,12)},cryptoKey,raw.slice(12));
    const incoming=JSON.parse(new TextDecoder().decode(plain));
    if(!Array.isArray(incoming.items))throw new Error('Invalid inbox data.');
    const before=data?.items.find(i=>i.person_id===selected);
    const after=incoming.items.find(i=>i.person_id===selected);
    const same=before&&after&&before.fingerprint===after.fingerprint&&before.state===after.state;
    data=incoming;storageSet('ttf-site-key',key);
    $('unlock').classList.add('hidden');$('app').classList.remove('hidden');status();renderList();
    if(selected&&!same){renderDetail();if(before)toast('This conversation changed. Review the latest messages.');}
  }catch(e){
    if(data){$('status').textContent='Refresh failed. Showing the last successful scan from '+fmt(data.scan_at)+'.';$('status').classList.add('warning');}
    else{$('unlock-error').textContent='Could not unlock the inbox. Check your private key and connection.';$('unlock-error').classList.remove('hidden');}
  }finally{loading=false;$('refresh').disabled=false;}
}
$('refresh').onclick=load;
$('search').oninput=renderList;
document.querySelectorAll('[data-filter]').forEach(el=>el.onclick=()=>{filter=el.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b===el));renderList();});
$('unlock-button').onclick=()=>{key=$('key').value.trim();load();};
key=(location.hash.match(/[#&]k=([A-Za-z0-9_-]+)/)||[])[1]||storageGet('ttf-site-key')||'';
if(key)load();
setInterval(()=>{if(!document.hidden)load();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
