const $=id=>document.getElementById(id);
const modal=$('roomModal'), toast=$('toast');
let currentCode=null, playerType=null, player=null, showingFavorites=false;
const channel=('BroadcastChannel' in window)?new BroadcastChannel('lunary-watch-demo'):null;
const DEMO_VIDEO='https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
const movieCards=[...document.querySelectorAll('.movie-card')];
function notify(msg){toast.textContent=msg;toast.classList.add('show');clearTimeout(notify.timer);notify.timer=setTimeout(()=>toast.classList.remove('show'),2600)}
function code(){return 'LUNA-'+Math.random().toString(36).slice(2,6).toUpperCase()}
function openRoom(c){currentCode=c;$('roomCodeDisplay').textContent=c;$('roomTitle').textContent='Твоя комната готова';modal.classList.remove('hidden');document.body.style.overflow='hidden'}
function closeRoom(){modal.classList.add('hidden');document.body.style.overflow=''}
$('createRoom').onclick=()=>openRoom(code());
$('joinToggle').onclick=()=>{$('joinBox').classList.toggle('hidden');$('roomCode').focus()};
$('joinRoom').onclick=()=>{const c=$('roomCode').value.trim().toUpperCase();if(!c){notify('Введи код комнаты');return}openRoom(c);notify('Открыт демо-режим комнаты')};
document.querySelectorAll('[data-close]').forEach(x=>x.onclick=closeRoom);
$('copyCode').onclick=async()=>{try{await navigator.clipboard.writeText(currentCode);notify('Код скопирован')}catch(e){notify('Код комнаты: '+currentCode)}};
function broadcast(type,data={}){channel?.postMessage({room:currentCode,type,...data})}
function parseYouTube(raw){try{const u=new URL(raw);if(u.hostname==='youtu.be'||u.hostname.endsWith('.youtu.be'))return u.pathname.slice(1);if(u.hostname.includes('youtube.com'))return u.searchParams.get('v')||u.pathname.split('/').pop()}catch{}return null}
function parseVK(raw){
 try{
  let input=raw.trim();
  const iframeSrc=input.match(/<iframe\\b[^>]*\\bsrc=["']([^"']+)["']/i);
  if(iframeSrc)input=iframeSrc[1].replace(/&amp;/g,'&');
  const u=new URL(input),host=u.hostname.toLowerCase();
  if(!/(^|\\.)((vkvideo\\.ru)|(vk\\.com)|(vk\\.ru))$/.test(host))return null;
  if(u.pathname.includes('video_ext.php')){
   const oid=u.searchParams.get('oid'),id=u.searchParams.get('id');
   if(!oid||!id)return null;
   if(!u.searchParams.get('hash'))return {needsEmbed:true};
   const out=new URL('https://vkvideo.ru/video_ext.php');
   for(const [k,v] of u.searchParams)out.searchParams.set(k,v);
   return {url:out.toString()};
  }
  if(u.pathname.match(/video(-?\\d+)_(-?\\d+)/))return {needsEmbed:true};
  return null;
 }catch{return null}
}
function showPlayerError(message){$('playerStatus').textContent=message;notify(message)}
function loadDirect(url){
 const wrap=$('playerWrap');wrap.innerHTML='';
 const v=document.createElement('video');v.controls=true;v.playsInline=true;v.preload='metadata';v.crossOrigin='anonymous';v.src=url;
 v.addEventListener('loadedmetadata',()=>{$('playerStatus').textContent='Видео готово · '+Math.round(v.duration)+' сек.';$('playPause').disabled=false;$('syncBtn').disabled=false});
 v.addEventListener('error',()=>{ $('playerStatus').textContent='Не удалось загрузить видео';notify('Источник недоступен или ссылка не ведёт на MP4 / WebM. Проверь ссылку и доступность хостинга.')});
 v.addEventListener('play',()=>broadcast('play'));v.addEventListener('pause',()=>broadcast('pause'));v.addEventListener('seeked',()=>broadcast('seek',{time:v.currentTime}));
 wrap.appendChild(v);player=v;playerType='direct';$('playerStatus').textContent='Подключаем видео…';$('playPause').disabled=false;$('syncBtn').disabled=false;
}
function loadVideo(){
 const url=$('videoUrl').value.trim();if(!url){notify('Вставь ссылку на видео');return}
 const vkEmbed=parseVK(url);
 if(vkEmbed?.needsEmbed){showPlayerError('Для VK нужна ссылка video_ext.php с hash. В VK открой «Поделиться» → «Экспортировать» и вставь сюда ссылку или весь код iframe.');return}
 if(vkEmbed?.url){
  playerType='vk';$('playerWrap').innerHTML='';
  const frame=document.createElement('iframe');frame.src=vkEmbed.url;frame.allow='autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';
  $('playerWrap').appendChild(frame);player=frame;$('playerStatus').textContent='VK Видео · проверяем доступность';$('playPause').disabled=true;$('syncBtn').disabled=true;
  broadcast('video',{url:vkEmbed.url});notify('VK Видео добавлено. Управление воспроизведением выполняется в самом плеере VK.');return;
 }
 let parsed;try{parsed=new URL(url)}catch{notify('Проверь формат ссылки');return}
 if(parsed.protocol!=='https:'){notify('Используй HTTPS-ссылку для безопасной загрузки');return}
 if(parseYouTube(url)){playerType='youtube';$('playerWrap').innerHTML='';const frame=document.createElement('iframe');frame.src='https://www.youtube-nocookie.com/embed/'+encodeURIComponent(parseYouTube(url));frame.allow='accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';frame.allowFullscreen=true;$('playerWrap').appendChild(frame);player=frame;$('playerStatus').textContent='YouTube · доступ зависит от региона';$('playPause').disabled=true;$('syncBtn').disabled=true;notify('YouTube может требовать VPN. Для просмотра без него используй прямую MP4 / WebM ссылку.');return}
 loadDirect(url);broadcast('video',{url});notify('Ссылка добавлена. Проверяем доступность источника…');
}
$('loadVideo').onclick=loadVideo;
$('demoVideo').onclick=()=>{ $('videoUrl').value=DEMO_VIDEO;loadDirect(DEMO_VIDEO);broadcast('video',{url:DEMO_VIDEO});notify('Загружен тестовый ролик с открытой лицензией')};
function receive(m){if(!m||m.room!==currentCode)return;if(m.type==='chat'){addMessage(m.name||'Участник',m.message);return}if(m.type==='video'&&m.url){loadDirect(m.url);return}if(!player||playerType!=='direct')return;if(m.type==='play')player.play().catch(()=>{});if(m.type==='pause')player.pause();if(m.type==='seek'&&Math.abs(player.currentTime-m.time)>1)player.currentTime=m.time}
if(channel)channel.onmessage=e=>receive(e.data);
$('playPause').onclick=()=>{if(playerType!=='direct'||!player)return;if(player.paused)player.play().catch(()=>notify('Браузер не разрешил автозапуск'));else player.pause()};
$('syncBtn').onclick=()=>{if(playerType==='direct'&&player){broadcast('seek',{time:player.currentTime});notify('Позиция отправлена другим вкладкам этого браузера')}};
function send(){const input=$('chatInput'),v=input.value.trim();if(!v)return;addMessage('Ты',v);broadcast('chat',{name:'Участник',message:v});input.value=''}
function addMessage(name,msg){const p=document.createElement('p');p.className='chat-line';const b=document.createElement('b');b.textContent=name;const span=document.createElement('span');span.textContent=msg;p.append(b,span);$('chatMessages').appendChild(p);$('chatMessages').scrollTop=$('chatMessages').scrollHeight}
$('sendChat').onclick=send;$('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter')send()});
$('profileBtn').onclick=()=>notify('LunaryID подключим отдельным этапом');
$('mobileMenu').onclick=()=>notify('Навигация: Главная · Каталог · Как это работает');
// Избранное хранится локально на этом устройстве.
let favorites=[];try{favorites=JSON.parse(localStorage.getItem('lunaryWatchFavorites')||'[]')}catch{}
function saveFavorites(){localStorage.setItem('lunaryWatchFavorites',JSON.stringify(favorites));$('favCount').textContent=favorites.length}
movieCards.forEach((card,i)=>{const title=card.querySelector('.movie-info b')?.textContent||('Подборка '+(i+1));const button=document.createElement('button');button.className='favorite-btn';button.type='button';button.textContent=favorites.includes(title)?'♥ В избранном':'♡ В избранное';button.onclick=()=>{favorites=favorites.includes(title)?favorites.filter(x=>x!==title):[...favorites,title];saveFavorites();button.textContent=favorites.includes(title)?'♥ В избранном':'♡ В избранное';applyCatalog()};card.querySelector('.movie-info').appendChild(button)});
function applyCatalog(){const q=$('movieSearch').value.trim().toLowerCase();movieCards.forEach(card=>{const title=(card.innerText||'').toLowerCase();const name=card.querySelector('.movie-info b')?.textContent||'';card.classList.toggle('hidden',(!title.includes(q))||(showingFavorites&&!favorites.includes(name)))})}
$('movieSearch').addEventListener('input',applyCatalog);
$('showFavorites').onclick=()=>{showingFavorites=!showingFavorites;$('showFavorites').classList.toggle('active-filter',showingFavorites);$('showFavorites').innerHTML=(showingFavorites?'Показать всё':'♡ Избранное')+' <span id="favCount">'+favorites.length+'</span>';applyCatalog()};
saveFavorites();
