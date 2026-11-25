const $=id=>document.getElementById(id), modal=$('roomModal'),toast=$('toast');
const volatileStorage=new Map();
function safeGet(key){try{const value=window.localStorage.getItem(key);return value??volatileStorage.get(key)??null}catch{return volatileStorage.get(key)??null}}
function safeSet(key,value){const stored=String(value);volatileStorage.set(key,stored);try{window.localStorage.setItem(key,stored)}catch{}}
let currentCode='',player=null,playerType='',name=safeGet('lunaryWatchName')||'',roomTitle='Киновечер',theater=false,showingFavorites=false;
const sb=window.supabase?.createClient('https://vlwhhqmhmqnfodvmlqjf.supabase.co','sb_publishable_HgmpwSi-eEhzvssEw8k5_g_Rtwde0Y3');
const deviceId=crypto.randomUUID?.()||('tab-'+Math.random().toString(36).slice(2)+'-'+Date.now());
if(!name||name==='Ты')name='Гость-'+String(deviceId).slice(-4).toUpperCase();
let authUser=null,authProfile=null,authMode='login',selectedAvatarColor='green',profileLoadToken=0;
const avatarColorMap={green:'#55c982',violet:'#9679df',pink:'#e17eae',orange:'#e6a05e'};

let channel=null,roomMembers=new Map(),syncApplying=false,remoteActionUntil=0,ytPlayer=null,vkPlayer=null,videoSyncTimer=null,pendingRemoteState=null,activeVideoUrl='',roomConnected=false,latestVideoState=null,lastRoomPersist=0;
const DEMO_VIDEO='https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
const movieCards=[...document.querySelectorAll('.movie-card')];
function notify(s){toast.textContent=s;toast.classList.add('show');clearTimeout(notify.timer);notify.timer=setTimeout(()=>toast.classList.remove('show'),2400)}
function paintAvatar(el,color,letter){
 if(!el)return;
 el.textContent=letter||'L';
 el.style.background=avatarColorMap[color]||avatarColorMap.green;
 el.style.color='#08130d';
}
function updateIdentityUi(){
 const displayName=authProfile?.username||name||('Гость-'+String(deviceId).slice(-4).toUpperCase());
 if(authProfile)name=displayName;
 const initial=displayName.trim().charAt(0).toUpperCase()||'G';
 $('profileName').textContent=authProfile?displayName:'Войти';
 paintAvatar($('headerAvatar'),authProfile?.avatar_color||'green',initial);
 $('memberName').textContent=displayName;
 paintAvatar($('memberAvatar'),authProfile?.avatar_color||'green',initial);
 $('readyName').textContent=displayName;
 const readyAvatar=$('readyName')?.previousElementSibling;
 paintAvatar(readyAvatar,authProfile?.avatar_color||'green',initial);
 paintAvatar($('roomUserAvatar'),authProfile?.avatar_color||'green',initial);
 $('profileName').title=authProfile?.lunary_id||'Войти в Lunary ID';
 if($('nameInput'))$('nameInput').value=displayName;
}
function presencePayload(){
 return {name:authProfile?.username||name,lunaryId:authProfile?.lunary_id||'',avatarColor:authProfile?.avatar_color||'green',joinedAt:new Date().toISOString()};
}
function setAuthMode(mode){
 authMode=mode==='signup'?'signup':'login';
 document.querySelectorAll('[data-auth-mode]').forEach(b=>b.classList.toggle('active',b.dataset.authMode===authMode));
 $('authUsernameWrap').classList.toggle('hidden',authMode!=='signup');
 $('authColorsWrap').classList.toggle('hidden',authMode!=='signup');
 $('authHeading').textContent=authMode==='signup'?'Создать Lunary ID':'Войти в Lunary';
 $('authSubmit').textContent=authMode==='signup'?'Создать аккаунт':'Войти';
 $('authPassword').autocomplete=authMode==='signup'?'new-password':'current-password';
 $('authStatus').textContent='';
}
function renderAuthView(){
 const logged=!!(authUser&&authProfile);
 $('authForm').classList.toggle('hidden',logged);
 $('authAccount').classList.toggle('hidden',!logged);
 $('authTabs').classList.toggle('hidden',logged);
 if(logged){
  $('authHeading').textContent='Твой Lunary ID';
  $('authDisplayName').textContent=authProfile.username;
  $('authEmailDisplay').textContent=authUser.email||'';
  $('accountLunaryId').textContent=authProfile.lunary_id;
  paintAvatar($('authUserAvatar'),authProfile.avatar_color,authProfile.username.slice(0,1).toUpperCase());
 }else setAuthMode(authMode);
}
function openAuthModal(){
 $('authStatus').textContent='';
 renderAuthView();
 $('authModal').classList.remove('hidden');
 document.body.style.overflow='hidden';
}
function closeAuthModal(){
 $('authModal').classList.add('hidden');
 document.body.style.overflow=modal.classList.contains('hidden')?'':'hidden';
}
async function loadLunaryProfile(user){
 if(!sb||!user)return;
 authUser=user;
 const token=++profileLoadToken;
 const fields='id,lunary_id,username,avatar_color';
 let {data,error}=await sb.from('profiles').select(fields).eq('id',user.id).maybeSingle();
 if(error)throw error;
 if(!data){
  const username=String(user.user_metadata?.username||user.email?.split('@')[0]||'Lunarian').trim().slice(0,24)||'Lunarian';
  const avatarColor=avatarColorMap[user.user_metadata?.avatar_color]?user.user_metadata.avatar_color:'green';
  const candidate='LUN-'+(crypto.randomUUID?.()||Math.random().toString(36).slice(2)).replace(/-/g,'').slice(0,8).toUpperCase();
  const created=await sb.from('profiles').insert({id:user.id,lunary_id:candidate,username,avatar_color:avatarColor}).select(fields).single();
  if(created.error){
   const retry=await sb.from('profiles').select(fields).eq('id',user.id).maybeSingle();
   if(retry.error||!retry.data)throw created.error;
   data=retry.data;
  }else data=created.data;
 }
 if(token!==profileLoadToken)return;
 authProfile=data;
 name=data.username||'Lunarian';
 safeSet('lunaryWatchName',name);
 updateIdentityUi();
 if(!$('authModal').classList.contains('hidden'))renderAuthView();
 if(channel&&roomConnected){try{await channel.track(presencePayload())}catch(e){console.warn('Presence identity update',e)}}
}
function initAuth(){
 if(!sb?.auth){$('authStatus').textContent='Сервис аккаунтов временно недоступен.';return}
 document.querySelectorAll('[data-auth-mode]').forEach(b=>b.addEventListener('click',()=>setAuthMode(b.dataset.authMode)));
 document.querySelectorAll('[data-avatar-color]').forEach(b=>b.addEventListener('click',()=>{
  selectedAvatarColor=b.dataset.avatarColor;
  document.querySelectorAll('[data-avatar-color]').forEach(x=>x.classList.toggle('selected',x===b));
 }));
 $('profileBtn').onclick=openAuthModal;
 $('closeAuth').onclick=closeAuthModal;
 $('authModal').addEventListener('click',e=>{if(e.target===$('authModal'))closeAuthModal()});
 $('authForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const email=$('authEmail').value.trim().toLowerCase();
  const password=$('authPassword').value;
  const username=$('authUsername').value.trim();
  const submit=$('authSubmit');
  submit.disabled=true;
  submit.textContent='Подключаем…';
  $('authStatus').textContent='';
  try{
   if(authMode==='signup'){
    if(username.length<2)throw new Error('Имя должно содержать минимум 2 символа.');
    const {data,error}=await sb.auth.signUp({email,password,options:{data:{username:username.slice(0,24),avatar_color:selectedAvatarColor}}});
    if(error)throw error;
    $('authPassword').value='';
    if(data.session&&data.user){
     await loadLunaryProfile(data.user);
     $('authStatus').textContent='Аккаунт создан. Lunary ID готов.';
     renderAuthView();
    }else{
     $('authStatus').textContent='Аккаунт создан. Проверь почту и подтверди адрес, затем войди с теми же данными.';
    }
   }else{
    const {data,error}=await sb.auth.signInWithPassword({email,password});
    if(error)throw error;
    await loadLunaryProfile(data.user);
    $('authPassword').value='';
    $('authStatus').textContent='Ты вошёл в Lunary.';
    renderAuthView();
   }
  }catch(error){
   $('authStatus').textContent=error.message||'Не удалось подключиться к аккаунту.';
  }finally{
   submit.disabled=false;
   submit.textContent=authMode==='signup'?'Создать аккаунт':'Войти';
  }
 });
 $('authLogout').onclick=async()=>{
  const {error}=await sb.auth.signOut();
  if(error){$('authStatus').textContent=error.message;return}
  $('authStatus').textContent='Ты вышел из аккаунта.';
 };
 $('copyLunaryId').onclick=()=>copy(authProfile?.lunary_id||'');
 sb.auth.onAuthStateChange((event,session)=>{
  if(session?.user){
   setTimeout(()=>loadLunaryProfile(session.user).catch(error=>{console.warn('Lunary profile',error);notify('Не удалось загрузить Lunary ID: '+error.message)}),0);
  }else if(event==='SIGNED_OUT'){
   profileLoadToken++;authUser=null;authProfile=null;name='Гость-'+String(deviceId).slice(-4).toUpperCase();updateIdentityUi();
   if(!$('authModal').classList.contains('hidden'))renderAuthView();
  }
 });
 sb.auth.getSession().then(({data,error})=>{
  if(error){console.warn('Auth session',error);return}
  if(data.session?.user)loadLunaryProfile(data.session.user).catch(e=>console.warn('Lunary profile',e));
 });
 updateIdentityUi();
 setAuthMode('login');
}

function readStore(key){try{return JSON.parse(safeGet(key)||'[]')}catch{return []}}
function writeStore(key,value){safeSet(key,JSON.stringify(value))}
function pushNotification(title,detail=''){const items=readStore('lunaryWatchNotifications');items.unshift({title,detail,time:Date.now()});writeStore('lunaryWatchNotifications',items.slice(0,30))}
function rememberHistory(url,title){const items=readStore('lunaryWatchHistory').filter(x=>x.url!==url);items.unshift({url,title,watchedAt:Date.now()});writeStore('lunaryWatchHistory',items.slice(0,50))}
function renderNotifications(){const box=$('notificationList'),items=readStore('lunaryWatchNotifications');box.innerHTML='';if(!items.length){const p=document.createElement('p');p.textContent='Пока уведомлений нет.';box.append(p);return}items.forEach(x=>{const el=document.createElement('div');el.className='notification-item';const b=document.createElement('b'),small=document.createElement('small');b.textContent=x.title;small.textContent=(x.detail?x.detail+' · ':'')+new Date(x.time).toLocaleString('ru-RU');el.append(b,small);box.append(el)})}
function renderLibrary(tab='saved'){document.querySelectorAll('[data-library-tab]').forEach(b=>b.classList.toggle('active',b.dataset.libraryTab===tab));$('savedList').classList.toggle('hidden',tab!=='saved');$('historyList').classList.toggle('hidden',tab!=='history');const saved=readStore('lunaryWatchSaved'),historyItems=readStore('lunaryWatchHistory');[['savedList',saved,'saved'],['historyList',historyItems,'history']].forEach(([id,items,kind])=>{const box=$(id);box.innerHTML='';if(!items.length){const p=document.createElement('div');p.className='library-empty';p.textContent=kind==='saved'?'Здесь пока ничего нет. Сохрани видео из комнаты.':'История просмотров пока пуста.';box.append(p);return}items.forEach((item,index)=>{const row=document.createElement('div');row.className='library-item';const main=document.createElement('div');main.className='library-item-main';const title=document.createElement('b'),meta=document.createElement('small');title.textContent=item.title||'Видео';meta.textContent=kind==='history'?'Просмотрено: '+new Date(item.watchedAt).toLocaleString('ru-RU'):item.url;main.append(title,meta);const use=document.createElement('button');use.textContent='Открыть';use.onclick=()=>{ $('videoUrl').value=item.url;$('libraryModal').classList.add('hidden');$('sourcePanel').classList.remove('hidden');loadVideo()};row.append(main,use);if(kind==='saved'){const del=document.createElement('button');del.textContent='Удалить';del.onclick=()=>{const next=readStore('lunaryWatchSaved');next.splice(index,1);writeStore('lunaryWatchSaved',next);renderLibrary('saved')};row.append(del)}box.append(row)})})}
function queueKey(){return 'lunaryWatchQueue_'+(currentCode||'default')}
function renderQueue(){const items=readStore(queueKey()),box=$('queueList');box.innerHTML='';$('queueEmpty').classList.toggle('hidden',items.length>0);$('queueStatus').textContent=items.length?items.length+' в очереди':'Выбрать следующее';items.forEach((item,index)=>{const row=document.createElement('div');row.className='queue-item';const label=document.createElement('span');label.textContent=(index+1)+'. '+item.title;const play=document.createElement('button');play.textContent='Включить';play.onclick=()=>{if(item.url){$('videoUrl').value=item.url;loadVideo();const next=readStore(queueKey());next.splice(index,1);writeStore(queueKey(),next);renderQueue()}else notify('Для этого пункта нет ссылки на видео')};const remove=document.createElement('button');remove.className='remove';remove.textContent='×';remove.onclick=()=>{const next=readStore(queueKey());next.splice(index,1);writeStore(queueKey(),next);renderQueue()};row.append(label,play,remove);box.append(row)})}
function code(){return 'LUNA-'+Math.random().toString(36).slice(2,6).toUpperCase()}
function openRoom(c){currentCode=c;roomMembers.clear();renderQueue();pushNotification('Открыта комната',c);history.replaceState({},'',location.pathname+'?room='+encodeURIComponent(c));roomTitle='Киновечер';$('roomTitle').textContent=roomTitle;$('roomCodeLabel').textContent=c;$('memberName').textContent=name;$('memberAvatar').textContent=name[0]?.toUpperCase()||'L';$('readyName').textContent=name;$('roomUserAvatar').textContent=name[0]?.toUpperCase()||'L';$('roomWatching').textContent='Подключение…';$('roomCode').value=c;modal.classList.remove('hidden');document.body.style.overflow='hidden';$('settingsPop').classList.add('hidden');connectRoom(c)}
function closeRoom(){modal.classList.add('hidden');history.replaceState({},'',location.pathname+location.hash);document.body.style.overflow='';document.body.classList.remove('theater');theater=false}
$('homeRoomsNav').onclick=()=>{$('joinBox').classList.remove('hidden');$('joinBox').scrollIntoView({behavior:'smooth',block:'center'});$('roomCode').focus()};
$('createRoom').onclick=()=>openRoom(code());$('joinToggle').onclick=()=>{$('joinBox').classList.toggle('hidden');$('roomCode').focus()};
$('joinRoom').onclick=()=>{const c=$('roomCode').value.trim().toUpperCase();if(!c)return notify('Введи код комнаты');openRoom(c);notify('Подключаемся к комнате…')};
$('closeRoom').onclick=closeRoom;
$('roomHomeLink').onclick=e=>{e.preventDefault();closeRoom();window.scrollTo({top:0,behavior:'smooth'})};
$('myRoomsLink').onclick=e=>{e.preventDefault();notify('Список комнат появится после подключения аккаунтов')};
$('roomBell').onclick=()=>{renderNotifications();$('notificationModal').classList.remove('hidden')};
$('closeNotifications').onclick=()=>$('notificationModal').classList.add('hidden');
$('clearNotifications').onclick=()=>{writeStore('lunaryWatchNotifications',[]);renderNotifications()};
$('notificationModal').addEventListener('click',e=>{if(e.target===$('notificationModal'))$('closeNotifications').click()});
$('closeLibrary').onclick=()=>$('libraryModal').classList.add('hidden');
$('libraryModal').addEventListener('click',e=>{if(e.target===$('libraryModal'))$('closeLibrary').click()});
document.querySelectorAll('[data-library-tab]').forEach(b=>b.onclick=()=>renderLibrary(b.dataset.libraryTab));

async function copy(text){try{await navigator.clipboard.writeText(text);notify('Скопировано')}catch{const field=document.createElement('textarea');field.value=text;document.body.append(field);field.select();try{document.execCommand('copy');notify('Скопировано')}catch{notify('Выдели и скопируй ссылку вручную')}field.remove()}}
function inviteUrl(){return location.origin+location.pathname+'?room='+encodeURIComponent(currentCode)}
function openShare(){if(!currentCode){notify('Сначала создай или открой комнату');return}const link=inviteUrl();const modal=$('shareModal');if(!modal){notify('Окно приглашения не найдено');return}$('shareLink').value=link;$('shareCode').textContent=currentCode;modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden'}
$('copyCode').onclick=()=>copy(currentCode);
$('inviteBtn').addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openShare()});
$('invitePeople').addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openShare()});
$('closeShare').onclick=()=>{const modal=$('shareModal');modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');document.body.style.overflow='hidden'};
$('shareModal').addEventListener('click',e=>{if(e.target===$('shareModal'))$('closeShare').click()});
$('copyInvite').onclick=()=>copy(inviteUrl());
$('nativeShare').onclick=async()=>{const data={title:'Lunary Watch · '+roomTitle,text:'Присоединяйся к моему киновечеру!',url:inviteUrl()};if(navigator.share){try{await navigator.share(data)}catch(e){if(e.name!=='AbortError')notify('Не удалось открыть меню отправки')}}else copy(inviteUrl())};
$('settingsBtn').onclick=()=>$('settingsPop').classList.toggle('hidden');$('closeSettings').onclick=()=>$('settingsPop').classList.add('hidden');
$('saveSettings').onclick=async()=>{roomTitle=$('roomNameInput').value.trim()||'Киновечер';const requestedName=$('nameInput').value.trim().slice(0,24)||name||'Гость';if(authUser&&authProfile){const {data,error}=await sb.from('profiles').update({username:requestedName,updated_at:new Date().toISOString()}).eq('id',authUser.id).select('id,lunary_id,username,avatar_color').single();if(error){notify('Не удалось обновить профиль: '+error.message);return}authProfile=data;name=data.username}else{name=requestedName;safeSet('lunaryWatchName',name)}$('roomTitle').textContent=roomTitle;updateIdentityUi();$('settingsPop').classList.add('hidden');notify('Настройки сохранены')};
// Profile actions are wired by initAuth() to the shared Lunary ID account.
$('mobileMenu').onclick=()=>document.querySelector('#catalog').scrollIntoView({behavior:'smooth'});
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));$('chatPage').classList.toggle('hidden',b.dataset.tab!=='chat');$('peoplePage').classList.toggle('hidden',b.dataset.tab!=='people')});
$('hideChatBtn').onclick=()=>{const side=document.querySelector('.side-panel');side.classList.toggle('hidden');$('hideChatBtn').textContent=side.classList.contains('hidden')?'Показать чат':'Скрыть чат'};
$('theaterBtn').onclick=()=>{theater=!theater;document.body.classList.toggle('theater',theater);$('theaterBtn').textContent=theater?'⛶ Обычный режим':'⛶ Режим кино'};
async function broadcast(type,data={}){if(!currentCode)return;const message={room:currentCode,type,...data,stamp:Date.now(),name};if(type==='video'){latestVideoState=message}else if(['play','pause','seek','tick'].includes(type)){latestVideoState={room:currentCode,type:'video',url:data.url||activeVideoUrl,kind:data.kind||playerType,time:Number(data.time??getVideoTime())||0,playing:type==='play'||type==='tick'||(type==='seek'&&getVideoPlaying()),stamp:message.stamp,name}}/* Presence is tracked once on room join, never on playback heartbeats. */if(channel){try{const result=await channel.send({type:'broadcast',event:'watch',payload:message});if(result!=='ok')console.warn('Realtime broadcast status',result)}catch(e){console.warn('Realtime send',e)}}try{safeSet('lunaryWatchSyncEvent',JSON.stringify(message))}catch{}}
async function connectRoom(code){
 roomConnected=false;latestVideoState=null;
 if(!sb){$('playerStatus').textContent='Supabase не загружен';notify('Не удалось подключить общий сервер');return}
 if(channel){try{await sb.removeChannel(channel)}catch{}channel=null}
 const {data:existing,error:loadError}=await sb.from('watch_rooms').select('*').eq('room_code',code).maybeSingle();
 if(loadError){$('playerStatus').textContent='Ошибка базы комнаты';notify('Не удалось открыть комнату: '+loadError.message);console.warn(loadError);return}
 if(!existing){const {error:insertError}=await sb.from('watch_rooms').insert({room_code:code,room_name:roomTitle,host_name:name});if(insertError){$('playerStatus').textContent='Не удалось создать комнату';notify('Ошибка создания комнаты: '+insertError.message);console.warn(insertError);return}}
 else{roomTitle=existing.room_name||roomTitle;$('roomTitle').textContent=roomTitle}
 const presenceKey=crypto.randomUUID?.()||Math.random().toString(36).slice(2);
 channel=sb.channel('lunary-watch-'+code,{config:{broadcast:{self:false},presence:{key:presenceKey}}});
 channel.on('broadcast',{event:'watch'},({payload})=>receive(payload));
 // Persisted room state is the reliable fallback for source changes and late joiners.
 // Supabase documents Postgres Changes errors as extension-level; they do not close
 // the whole channel, so keep broadcast/presence alive alongside this listener.
 channel.on('postgres_changes',{event:'UPDATE',schema:'public',table:'watch_rooms',filter:'room_code=eq.'+code},payload=>{
  const row=payload?.new;
  if(!row||row.sync_sender===deviceId||!row.video_url)return;
  receive({room:code,type:'room-state',url:row.video_url,kind:row.video_kind||'direct',time:Number(row.playback_time)||0,playing:!!row.is_playing,stamp:Date.parse(row.updated_at)||Date.now()});
 });
 channel.on('presence',{event:'sync'},()=>{
  const state=channel.presenceState(),members=Object.entries(state).flatMap(([key,metas])=>metas.map(p=>({...p,_presenceKey:key})));
  roomMembers.clear();members.forEach((p,i)=>roomMembers.set(p._presenceKey+'-'+i,p));
  const count=Math.max(1,members.length);$('roomWatching').textContent=count+' смотрит';$('memberCount').textContent=count;
  const people=$('peoplePage');people?.querySelectorAll('.member.remote').forEach(x=>x.remove());
  members.forEach(p=>{if(p._presenceKey===presenceKey)return;const row=document.createElement('div');row.className='member remote';const av=document.createElement('span');av.className='avatar';av.textContent=(p.name||'Гость').slice(0,1).toUpperCase();const label=document.createElement('span');label.textContent=p.name||'Гость';const tag=document.createElement('small');tag.textContent=p.lunaryId||'Гость';paintAvatar(av,p.avatarColor,(p.name||'Гость').slice(0,1).toUpperCase());row.append(av,label,tag);const note=people?.querySelector('.side-note');if(note)people.insertBefore(row,note)});
 });
 channel.subscribe(async status=>{
  if(status==='SUBSCRIBED'){
   roomConnected=true;await channel.track(presencePayload());
   $('playerStatus').textContent='Комната подключена · общая синхронизация активна';
   const {data:latest,error}=await sb.from('watch_rooms').select('*').eq('room_code',code).maybeSingle();
   if(error)console.warn('Initial room state read',error);
   else if(latest?.video_url)receive({room:code,type:'room-state',url:latest.video_url,kind:latest.video_kind||'direct',time:Number(latest.playback_time)||0,playing:!!latest.is_playing,stamp:Date.parse(latest.updated_at)||Date.now()});
  }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
   roomConnected=false;$('playerStatus').textContent='Нет соединения с сервером синхронизации';notify('Supabase Realtime отключился: '+status);console.warn('Watch channel status',status);
  }
 });
 if(existing?.video_url)latestVideoState={room:code,type:'video',url:existing.video_url,kind:existing.video_kind||'direct',time:Number(existing.playback_time)||0,playing:!!existing.is_playing,stamp:Date.parse(existing.updated_at)||Date.now()};
}
function saveRoomVideo(url,kind,time=0,playing=false){
 if(!currentCode||!sb||!url)return;
 const payload={room_code:currentCode,room_name:roomTitle||'Киновечер',host_name:name||'Гость',video_url:url,video_kind:kind,playback_time:Number(time)||0,is_playing:!!playing,updated_at:new Date().toISOString(),sync_sender:deviceId};
 sb.from('watch_rooms').update(payload).eq('room_code',currentCode).then(({error})=>{if(error){console.warn('Room state save',error);$('playerStatus').textContent='Не удалось сохранить синхронизацию';}});
}
function parseYouTube(raw){try{const u=new URL(raw);if(u.hostname==='youtu.be')return u.pathname.slice(1).split('/')[0];if(u.hostname.includes('youtube.com')||u.hostname==='youtube-nocookie.com')return u.searchParams.get('v')||u.pathname.split('/').filter(Boolean).pop()}catch{}return null}
function parseVK(raw){try{let input=raw.trim(),m=input.match(/<iframe\b[^>]*\bsrc=["']([^"']+)["']/i);if(m)input=m[1].replace(/&amp;/g,'&');const u=new URL(input),h=u.hostname.toLowerCase();if(!/(^|\.)((vkvideo\.ru)|(vk\.com)|(vk\.ru))$/.test(h))return null;if(u.pathname.includes('video_ext.php')){if(!u.searchParams.get('oid')||!u.searchParams.get('id'))return null;u.searchParams.set('js_api','1');return{url:u.toString()}}const x=u.pathname.match(/video(-?\d+)_(-?\d+)/);if(!x)return null;const out=new URL('https://vkvideo.ru/video_ext.php');out.searchParams.set('oid',x[1]);out.searchParams.set('id',x[2]);out.searchParams.set('hd','3');out.searchParams.set('js_api','1');return{url:out.toString()}}catch{return null}}
function getVideoTime(){try{if(playerType==='direct')return player?.currentTime||0;if(playerType==='youtube')return ytPlayer?.getCurrentTime?.()||0;if(playerType==='vk')return vkPlayer?.getCurrentTime?.()||0}catch{}return 0}
function getVideoPlaying(){try{if(playerType==='direct')return !!player&&!player.paused;if(playerType==='youtube')return ytPlayer?.getPlayerState?.()===1;if(playerType==='vk')return /playing|started|resumed/i.test(String(vkPlayer?.getState?.()||''))}catch{}return false}
function applyRemoteState(time=0,playing=false){remoteActionUntil=Date.now()+3500;syncApplying=true;const t=Math.max(0,Number(time)||0);try{if(playerType==='direct'&&player){if(player.readyState<1){pendingRemoteState={time:t,playing};return}if(Math.abs(player.currentTime-t)>1.4)player.currentTime=t;playing?player.play().catch(()=>{}):player.pause()}else if(playerType==='youtube'&&ytPlayer?.seekTo){if(Math.abs((ytPlayer.getCurrentTime?.()||0)-t)>1.4)ytPlayer.seekTo(t,true);playing?ytPlayer.playVideo():ytPlayer.pauseVideo()}else if(playerType==='vk'&&vkPlayer){if(Math.abs((vkPlayer.getCurrentTime?.()||0)-t)>1.4)vkPlayer.seek(t);playing?vkPlayer.play():vkPlayer.pause()}else pendingRemoteState={time:t,playing}}catch(e){console.warn('Apply sync',e)}setTimeout(()=>{syncApplying=false},3600)}
function startVideoHeartbeat(){clearInterval(videoSyncTimer);videoSyncTimer=setInterval(()=>{if(!currentCode||!getVideoPlaying()||Date.now()<remoteActionUntil)return;const time=getVideoTime();broadcast('tick',{time,playing:true,kind:playerType,url:activeVideoUrl});if(Date.now()-lastRoomPersist>5000){lastRoomPersist=Date.now();saveRoomVideo(activeVideoUrl,playerType,time,true)}},2500)}
function loadDirect(url){const wrap=$('playerWrap');wrap.innerHTML='';ytPlayer=null;vkPlayer=null;const v=document.createElement('video');v.controls=true;v.playsInline=true;v.preload='metadata';v.src=url;v.addEventListener('loadedmetadata',()=>{$('playerStatus').textContent='Видео готово · '+Math.round(v.duration)+' сек.';$('playPause').disabled=false;$('syncBtn').disabled=false;if(pendingRemoteState){const state=pendingRemoteState;pendingRemoteState=null;applyRemoteState(state.time,state.playing)}});v.addEventListener('error',()=>{$('playerStatus').textContent='Не удалось загрузить видео';notify('Источник недоступен или ссылка не ведёт на MP4/WebM')});v.addEventListener('play',()=>{if(!syncApplying&&Date.now()>remoteActionUntil){broadcast('play',{time:v.currentTime,kind:'direct',url});saveRoomVideo(url,'direct',v.currentTime,true)}});v.addEventListener('pause',()=>{if(!syncApplying&&Date.now()>remoteActionUntil){broadcast('pause',{time:v.currentTime,kind:'direct',url});saveRoomVideo(url,'direct',v.currentTime,false)}});v.addEventListener('seeked',()=>{if(!syncApplying&&Date.now()>remoteActionUntil){broadcast('seek',{time:v.currentTime,kind:'direct',url});saveRoomVideo(url,'direct',v.currentTime,!v.paused)}});wrap.appendChild(v);player=v;playerType='direct';activeVideoUrl=url;$('playerStatus').textContent='Подключаем видео…';$('videoTitle').textContent='Прямое видео';$('playPause').disabled=false;$('syncBtn').disabled=false;startVideoHeartbeat()}
function ensureScript(src,globalCheck){return new Promise((resolve,reject)=>{if(globalCheck())return resolve();let s=document.querySelector('script[data-lunary-api="'+src+'"]');if(s){s.addEventListener('load',()=>resolve(),{once:true});s.addEventListener('error',reject,{once:true});return}s=document.createElement('script');s.src=src;s.async=true;s.dataset.lunaryApi=src;s.onload=()=>resolve();s.onerror=reject;document.head.appendChild(s)})}
function loadYouTube(raw,remoteState=null){const id=parseYouTube(raw)||raw;const wrap=$('playerWrap');wrap.innerHTML='';player=null;vkPlayer=null;ytPlayer=null;playerType='youtube';activeVideoUrl=raw;$('videoTitle').textContent='Видео YouTube';$('playerStatus').textContent='Загружаем YouTube Player API…';$('playPause').disabled=false;$('syncBtn').disabled=false;const mount=document.createElement('div');mount.id='lunaryYouTubePlayer';mount.style.width='100%';mount.style.height='100%';wrap.appendChild(mount);window.onYouTubeIframeAPIReady=()=>{try{ytPlayer=new YT.Player(mount.id,{videoId:id,playerVars:{playsinline:1,enablejsapi:1,origin:location.origin},events:{onReady:()=>{$('playerStatus').textContent='YouTube подключён · синхронизация активна';if(remoteState)applyRemoteState(remoteState.time,remoteState.playing);else if(pendingRemoteState){applyRemoteState(pendingRemoteState.time,pendingRemoteState.playing);pendingRemoteState=null}startVideoHeartbeat()},onStateChange:e=>{if(syncApplying||Date.now()<remoteActionUntil)return;if(e.data===1){const t=getVideoTime();broadcast('play',{time:t,kind:'youtube',url:activeVideoUrl});saveRoomVideo(activeVideoUrl,'youtube',t,true)}if(e.data===2){const t=getVideoTime();broadcast('pause',{time:t,kind:'youtube',url:activeVideoUrl});saveRoomVideo(activeVideoUrl,'youtube',t,false)}}}})}catch(e){$('playerStatus').textContent='Не удалось запустить YouTube API';console.warn(e)}};if(window.YT?.Player){window.onYouTubeIframeAPIReady()}else ensureScript('https://www.youtube.com/iframe_api',()=>!!window.YT?.Player).then(()=>{if(window.YT?.Player)window.onYouTubeIframeAPIReady()}).catch(()=>notify('Не удалось загрузить YouTube Player API'))}
function loadVK(embedUrl,remoteState=null){const wrap=$('playerWrap');wrap.innerHTML='';player=null;ytPlayer=null;vkPlayer=null;playerType='vk';activeVideoUrl=embedUrl;const url=new URL(embedUrl);url.searchParams.set('js_api','1');const f=document.createElement('iframe');f.src=url.toString();f.allow='autoplay; encrypted-media; fullscreen; picture-in-picture';f.allowFullscreen=true;f.referrerPolicy='strict-origin-when-cross-origin';wrap.appendChild(f);$('videoTitle').textContent='Видео VK';$('playerStatus').textContent='Подключаем VK Player API…';$('playPause').disabled=false;$('syncBtn').disabled=false;ensureScript('https://vk.com/js/api/videoplayer.js',()=>!!window.VK?.VideoPlayer).then(()=>{try{vkPlayer=VK.VideoPlayer(f);const onState=(state)=>{if(syncApplying||Date.now()<remoteActionUntil)return;const st=state?.state||vkPlayer.getState?.();const time=Number(state?.time??vkPlayer.getCurrentTime?.()??0);if(/started|resumed|playing/i.test(String(st))){broadcast('play',{time,kind:'vk',url:activeVideoUrl});saveRoomVideo(activeVideoUrl,'vk',time,true)}if(/paused/i.test(String(st))){broadcast('pause',{time,kind:'vk',url:activeVideoUrl});saveRoomVideo(activeVideoUrl,'vk',time,false)}};['started','resumed','paused'].forEach(ev=>vkPlayer.on(ev,onState));vkPlayer.on('inited',()=>{$('playerStatus').textContent='VK Видео подключено · синхронизация активна';if(remoteState)applyRemoteState(remoteState.time,remoteState.playing);else if(pendingRemoteState){applyRemoteState(pendingRemoteState.time,pendingRemoteState.playing);pendingRemoteState=null}startVideoHeartbeat()});vkPlayer.on('timeupdate',state=>{if(!syncApplying&&Date.now()>remoteActionUntil&&getVideoPlaying()){const time=Number(state?.time??vkPlayer.getCurrentTime?.()??0);if(time>0){broadcast('tick',{time,playing:true,kind:'vk',url:activeVideoUrl});if(Date.now()-lastRoomPersist>5000){lastRoomPersist=Date.now();saveRoomVideo(activeVideoUrl,'vk',time,true)}}}})}catch(e){$('playerStatus').textContent='VK API не подключился';console.warn(e)}}).catch(()=>notify('Не удалось загрузить VK Player API'))}
function loadVideo(options={}){const raw=$('videoUrl').value.trim();if(!raw)return notify('Вставь ссылку на видео');const vk=parseVK(raw);if(vk){rememberHistory(raw,'Видео VK');loadVK(vk.url);broadcast('video',{url:vk.url,kind:'vk',time:0,playing:false});saveRoomVideo(vk.url,'vk',0,false);notify('VK Видео добавлено');return}let u;try{u=new URL(raw)}catch{return notify('Проверь ссылку')};if(u.protocol!=='https:')return notify('Нужна HTTPS-ссылка');const yt=parseYouTube(raw);if(yt){rememberHistory(raw,'Видео YouTube');loadYouTube(raw);broadcast('video',{url:raw,kind:'youtube',time:0,playing:false});saveRoomVideo(raw,'youtube',0,false);return}rememberHistory(raw,'Прямое видео');loadDirect(raw);broadcast('video',{url:raw,kind:'direct',time:0,playing:false});saveRoomVideo(raw,'direct',0,false)}

$('sourceToggle').onclick=()=>{$('sourcePanel').classList.toggle('hidden');if(!$('sourcePanel').classList.contains('hidden'))$('videoUrl').focus()};
$('saveVideoBtn').onclick=()=>{const url=$('videoUrl').value.trim();if(!url)return notify('Сначала добавь ссылку на видео');let saved=[];try{saved=JSON.parse(safeGet('lunaryWatchSaved')||'[]')}catch{};if(!saved.some(x=>x.url===url)){saved.push({url,title:$('videoTitle').textContent});safeSet('lunaryWatchSaved',JSON.stringify(saved))}notify('Видео сохранено на этом устройстве')};
$('libraryBtn').onclick=()=>{renderLibrary('saved');$('libraryModal').classList.remove('hidden')};
document.querySelectorAll('[data-accordion]').forEach(b=>b.onclick=()=>$(b.dataset.accordion).classList.toggle('hidden'));
$('passwordToggle').onclick=()=>notify('Защита паролем появится после подключения серверной авторизации');
$('readyToggle').onclick=()=>{const ready=$('readyToggle').getAttribute('aria-pressed')!=='true';$('readyToggle').setAttribute('aria-pressed',String(ready));$('readyToggle').textContent=ready?'Готов':'Не готов';pushNotification(ready?'Ты отметил готовность':'Ты снял отметку готовности',currentCode);notify(ready?'Отметка готовности включена':'Отметка готовности снята')};
$('queueAdd').onclick=()=>{const v=$('queueInput').value.trim();if(!v)return notify('Введи название или ссылку');const parts=v.split('|').map(x=>x.trim()),url=parts.find(x=>/^https:\/\//i.test(x))||'',title=parts.find(x=>x&&!/^https:\/\//i.test(x))||url||v;const items=readStore(queueKey());items.push({title,url});writeStore(queueKey(),items);$('queueInput').value='';renderQueue();pushNotification('Добавлено в очередь',title);notify('Добавлено в очередь')};
renderQueue();
$('emojiBtn').onclick=()=>{$('chatInput').value+='🙂';$('chatInput').focus()};
$('attachBtn').onclick=()=>notify('Прикрепление файлов пока не подключено');
$('loadVideo').onclick=()=>loadVideo();$('playPause').onclick=()=>{if(playerType==='direct'&&player){player.paused?player.play().catch(()=>notify('Автозапуск заблокирован')):player.pause();return}if(playerType==='youtube'&&ytPlayer){getVideoPlaying()?ytPlayer.pauseVideo():ytPlayer.playVideo();return}if(playerType==='vk'&&vkPlayer){getVideoPlaying()?vkPlayer.pause():vkPlayer.play();return}notify('Плеер ещё загружается')};
$('syncBtn').onclick=()=>{if(!currentCode||!channel||!roomConnected)return notify('Комната ещё подключается, подожди пару секунд');if(!player&&!ytPlayer&&!vkPlayer)return notify('Сначала добавь видео');const time=getVideoTime(),playing=getVideoPlaying();broadcast('video',{url:activeVideoUrl||$('videoUrl').value.trim(),kind:playerType,time,playing});saveRoomVideo(activeVideoUrl||$('videoUrl').value.trim(),playerType,time,playing);notify('Отправил ссылку и состояние всем в комнате')};
function receive(m){
 if(!m||m.room!==currentCode)return;
 if(m.type==='chat'){addMessage(m.name||'Гость',m.message);return}
 if(m.type==='reaction'){$('reactionStatus').textContent=m.emoji+' от '+m.name;return}
 if(m.type==='video'||m.type==='room-state'){
  const url=m.url||'';if(!url)return;
  const kind=m.kind||'direct',time=Number(m.time)||0,playing=!!m.playing;
  latestVideoState={room:currentCode,type:'video',url,kind,time,playing,stamp:m.stamp||Date.now()};
  $('videoUrl').value=url;
  const sameSource=activeVideoUrl===url&&playerType===kind&&(player||ytPlayer||vkPlayer);
  if(!sameSource){
   activeVideoUrl=url;
   if(kind==='vk')loadVK(url,{time,playing});
   else if(kind==='youtube')loadYouTube(url,{time,playing});
   else {pendingRemoteState={time,playing};loadDirect(url);}
  }else applyRemoteState(time,playing);
  return;
 }
 if(m.type==='tick'||m.type==='play'||m.type==='pause'||m.type==='seek'){
  if(m.kind&&m.kind!==playerType)return;
  const time=Number.isFinite(m.time)?m.time:getVideoTime();
  if(m.type==='tick'){if(Math.abs(getVideoTime()-time)>1.5)applyRemoteState(time,true);return}
  if(m.type==='play')applyRemoteState(time,true);
  if(m.type==='pause')applyRemoteState(time,false);
  if(m.type==='seek')applyRemoteState(time,getVideoPlaying());
 }
}

window.addEventListener('storage',e=>{if(e.key==='lunaryWatchSyncEvent'&&e.newValue){try{receive(JSON.parse(e.newValue))}catch{}}});
function send(){const i=$('chatInput'),v=i.value.trim();if(!v)return;addMessage(name,v);broadcast('chat',{name,message:v});i.value=''}
function addMessage(n,msg){$('chatEmpty')?.classList.add('hidden');const p=document.createElement('p');p.className='chat-line';const b=document.createElement('b'),s=document.createElement('span');b.textContent=n;s.textContent=msg;p.append(b,s);$('chatMessages').append(p);$('chatMessages').scrollTop=$('chatMessages').scrollHeight}
$('sendChat').onclick=send;$('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter')send()});
document.querySelectorAll('[data-reaction]').forEach(b=>b.onclick=()=>{const emoji=b.dataset.reaction;$('reactionStatus').textContent=emoji+' отправлено';broadcast('reaction',{emoji,name})});
let favorites=[];try{favorites=JSON.parse(safeGet('lunaryWatchFavorites')||'[]')}catch{}
function saveFavorites(){safeSet('lunaryWatchFavorites',JSON.stringify(favorites));$('favCount').textContent=favorites.length}
movieCards.forEach((card,i)=>{const title=card.querySelector('.movie-info b')?.textContent||'Подборка '+i;const b=document.createElement('button');b.className='favorite-btn';b.textContent=favorites.includes(title)?'♥ В избранном':'♡ В избранное';b.onclick=()=>{favorites=favorites.includes(title)?favorites.filter(x=>x!==title):[...favorites,title];saveFavorites();b.textContent=favorites.includes(title)?'♥ В избранном':'♡ В избранное';applyCatalog()};card.querySelector('.movie-info').append(b)});
function applyCatalog(){const q=$('movieSearch').value.trim().toLowerCase();movieCards.forEach(c=>{const t=c.innerText.toLowerCase(),n=c.querySelector('.movie-info b')?.textContent||'';c.classList.toggle('hidden',!t.includes(q)||(showingFavorites&&!favorites.includes(n)))})}
$('movieSearch').addEventListener('input',applyCatalog);$('showFavorites').onclick=()=>{showingFavorites=!showingFavorites;$('showFavorites').classList.toggle('active-filter',showingFavorites);$('showFavorites').innerHTML=(showingFavorites?'Показать всё':'♡ Избранное')+' <span id="favCount">'+favorites.length+'</span>';applyCatalog()};
saveFavorites();updateIdentityUi();initAuth();
const roomParam=new URLSearchParams(location.search).get('room');if(roomParam)openRoom(roomParam.toUpperCase());