const $=id=>document.getElementById(id);
const modal=$('roomModal'), toast=$('toast');
let currentCode=null, playerType=null, player=null, isPlaying=false;
const channel = ('BroadcastChannel' in window) ? new BroadcastChannel('lunary-watch-demo') : null;
function notify(msg){toast.textContent=msg;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2300)}
function code(){return 'LUNA-'+Math.random().toString(36).slice(2,6).toUpperCase()}
function openRoom(c){currentCode=c; $('roomCodeDisplay').textContent=c; $('roomTitle').textContent='Комната готова'; modal.classList.remove('hidden');document.body.style.overflow='hidden';}
function closeRoom(){modal.classList.add('hidden');document.body.style.overflow=''}
$('createRoom').onclick=()=>openRoom(code());
$('joinToggle').onclick=()=>{$('joinBox').classList.toggle('hidden');$('roomCode').focus()};
$('joinRoom').onclick=()=>{let c=$('roomCode').value.trim().toUpperCase();if(!c){notify('Введи код комнаты');return}openRoom(c);notify('Открыт демо-режим комнаты')};
document.querySelectorAll('[data-close]').forEach(x=>x.onclick=closeRoom);
$('copyCode').onclick=async()=>{try{await navigator.clipboard.writeText(currentCode);notify('Код скопирован')}catch(e){notify('Код комнаты: '+currentCode)}};
function parseYouTube(url){try{const u=new URL(url);if(u.hostname.includes('youtu.be'))return u.pathname.slice(1);if(u.hostname.includes('youtube.com'))return u.searchParams.get('v')||u.pathname.split('/').pop()}catch(e){}return null}
function loadVideo(){
 const url=$('videoUrl').value.trim();if(!url){notify('Добавь ссылку на видео');return}
 const id=parseYouTube(url), wrap=$('playerWrap');wrap.innerHTML='';
 if(id){playerType='youtube';wrap.innerHTML=`<iframe id="ytPlayer" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?enablejsapi=1&origin=${encodeURIComponent(location.origin)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;player=$('ytPlayer');$('playerStatus').textContent='YouTube · готово';}
 else if(/^https?:\/\//i.test(url)){playerType='direct';const v=document.createElement('video');v.src=url;v.controls=true;v.playsInline=true;v.addEventListener('play',()=>broadcast('play'));v.addEventListener('pause',()=>broadcast('pause'));wrap.appendChild(v);player=v;$('playerStatus').textContent='Прямое видео · готово';}
 else{notify('Нужна корректная ссылка https://');return}
 $('playPause').disabled=false;$('syncBtn').disabled=false;notify('Видео добавлено в комнату');broadcast('video',{url});
}
$('loadVideo').onclick=loadVideo;
function broadcast(type,data={}){if(channel)channel.postMessage({room:currentCode,type,...data})}
if(channel)channel.onmessage=e=>{const m=e.data;if(!m||m.room!==currentCode)return;if(m.type==='play'&&playerType==='direct')player.play().catch(()=>{});if(m.type==='pause'&&playerType==='direct')player.pause();if(m.type==='seek'&&playerType==='direct')player.currentTime=m.time};
$('playPause').onclick=()=>{if(playerType==='direct'){if(player.paused){player.play().catch(()=>notify('Браузер заблокировал автозапуск'));broadcast('play')}else{player.pause();broadcast('pause')}}else notify('Для YouTube управление пока выполняется в самом плеере. Синхронизация требует серверной интеграции.');};
$('syncBtn').onclick=()=>{if(playerType==='direct'){broadcast('seek',{time:player.currentTime});notify('Состояние отправлено другим вкладкам')}else notify('Для полноценной синхронизации YouTube нужен общий сервер комнаты')};
function send(){const input=$('chatInput'),v=input.value.trim();if(!v)return;addMessage('Ты',v);broadcast('chat',{name:'Участник',message:v});input.value=''}
function addMessage(name,msg){const p=document.createElement('p');p.className='chat-line';const b=document.createElement('b');b.textContent=name;const span=document.createElement('span');span.textContent=msg;p.append(b,span);$('chatMessages').appendChild(p);$('chatMessages').scrollTop=$('chatMessages').scrollHeight}
$('sendChat').onclick=send;$('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter')send()});
if(channel){const old=channel.onmessage;channel.onmessage=e=>{const m=e.data;if(m?.room===currentCode&&m.type==='chat')addMessage(m.name||'Участник',m.message);if(m?.room===currentCode&&m.type==='play'&&playerType==='direct')player.play().catch(()=>{});if(m?.room===currentCode&&m.type==='pause'&&playerType==='direct')player.pause();if(m?.room===currentCode&&m.type==='seek'&&playerType==='direct')player.currentTime=m.time;};}
$('profileBtn').onclick=()=>notify('Профили подключим через LunaryID на следующем этапе');
$('mobileMenu').onclick=()=>notify('Навигация: Главная · Каталог · Как это работает');
