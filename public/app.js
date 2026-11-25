const $ = id => document.getElementById(id);
let token = localStorage.getItem('guildops-token'), player, world, pos, busy = false;
const ctx = $('world').getContext('2d');
const status = message => { $('status').textContent = message; };
async function api(path, options = {}) {
  const headers = { ...options.headers };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (options.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, { ...options, headers });
  const data = await res.json();
  if (!res.ok) { const error = new Error(data.error || 'Erreur API'); error.status = res.status; throw error; }
  return data;
}
function iso(x,y) { return [400 + (x-y)*36, 82 + (x+y)*18]; }
function tile(x,y) {
  const [a,b] = iso(x,y);
  ctx.beginPath();ctx.moveTo(a,b-18);ctx.lineTo(a+36,b);ctx.lineTo(a,b+18);ctx.lineTo(a-36,b);ctx.closePath();
  ctx.fillStyle=(x+y)%2?'#577b50':'#63865a';ctx.fill();ctx.strokeStyle='#415d40';ctx.stroke();
}
function character(x,y,color,label) {
  const [a,b]=iso(x,y);
  ctx.fillStyle='#293934';ctx.fillRect(a-12,b-3,24,6);
  ctx.fillStyle=color;ctx.fillRect(a-9,b-35,18,29);
  ctx.fillStyle='#e9c39a';ctx.fillRect(a-7,b-48,14,14);
  ctx.fillStyle='#f7e4b8';ctx.font='14px system-ui';ctx.textAlign='center';ctx.fillText(label,a,b-55);
}
function draw() {
  ctx.clearRect(0,0,800,520);
  for(let x=0;x<world.size;x++) for(let y=0;y<world.size;y++) tile(x,y);
  const actors=[{...world.npc,color:'#b47745',label:'Maître de guilde'},{...pos,color:'#527bc0',label:player.name}];
  actors.sort((a,b)=>a.x+a.y-b.x-b.y).forEach(a=>character(a.x,a.y,a.color,a.label));
}
function near() { return Math.abs(pos.x-world.npc.x)+Math.abs(pos.y-world.npc.y)<=1; }
function render() {
  $('login').hidden=true;$('play').hidden=false;
  $('hero').textContent=player.name;
  $('quest').textContent=({available:'Bienvenue à la guilde — disponible',active:'Parle au maître de guilde',complete:'Quête terminée'})[player.quest];
  $('inventory').textContent=Object.entries(player.inventory).map(([k,v])=>k+' × '+v).join(', ')||'Vide';
  $('accept').disabled=busy||!near()||player.quest!=='available';
  $('talk').disabled=busy||!near();
  draw();
}
function move(dx,dy) {
  if (!player||busy) return;
  const x=pos.x+dx,y=pos.y+dy;
  if(x<0||y<0||x>=world.size||y>=world.size||(x===world.npc.x&&y===world.npc.y)) return;
  pos={x,y};render();
}
async function enter(p) { world=await api('/api/world');player=p;pos={...world.spawn};render(); }
async function action(path,body) {
  if(busy||!near()) return;
  busy=true;render();
  try {
    const result=await api(path,{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},...(body?{body:JSON.stringify(body)}:{})});
    player=result.player;status(result.message);
  } catch(e){status('Action non confirmée : '+e.message+' ; réessaie après rétablissement.');}
  finally{busy=false;render();}
}
$('join').addEventListener('submit',async e=>{
  e.preventDefault();
  if(busy)return;busy=true;
  try{const result=await api('/api/players',{method:'POST',body:JSON.stringify({name:$('name').value})});token=result.token;localStorage.setItem('guildops-token',token);await enter(result.player);status('Bienvenue au village !');}
  catch(e){status(e.message);}
  finally{busy=false;if(player)render();}
});
$('accept').onclick=()=>action('/api/quests/welcome/accept');
$('talk').onclick=()=>action('/api/interactions',{action:'talk',target:'guildmaster'});
$('logout').onclick=()=>{if(busy)return;localStorage.removeItem('guildops-token');token=null;player=null;$('play').hidden=true;$('login').hidden=false;status('Session locale effacée.');};
document.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>move(...b.dataset.move.split(',').map(Number)));
const keys={ArrowUp:[0,-1],z:[0,-1],w:[0,-1],ArrowDown:[0,1],s:[0,1],ArrowLeft:[-1,0],q:[-1,0],a:[-1,0],ArrowRight:[1,0],d:[1,0]};
window.addEventListener('keydown',e=>{if(!player||e.target instanceof HTMLInputElement)return;const delta=keys[e.key];if(delta){e.preventDefault();move(...delta);}});
if(token) {
  try{await enter(await api('/api/players/me'));status('Session retrouvée.');}
  catch(e){if(e.status===401){localStorage.removeItem('guildops-token');token=null;status('Session expirée : état volatile.');}else status('Serveur indisponible. Recharge la page pour retrouver la session.');}
}
