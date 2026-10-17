import {GamePhysics,terrain,slope,hash,clamp,START_X,VEHICLES} from './physics.mjs';
import {createRoom,joinRoom,readRoom,updateRoom} from './multiplayer-client.mjs';

const $=id=>document.getElementById(id);
const canvas=$('gameCanvas'),ctx=canvas.getContext('2d');
const game=new GamePhysics();
const BIOMES=[{name:'GREEN HILLS',sky:['#b8dcd4','#dee7c6','#eef0c7'],soil:['#9a8556','#665f3d'],tree:'#345e41',light:'#4f7850'},{name:'ROCKY MOUNTAINS',sky:['#a7c0c4','#dbe2d7','#eee8d6'],soil:['#8c8174','#555451'],tree:'#53615d',light:'#89958d'},{name:'DESERT',sky:['#e5a274','#f1c987','#f4dfaa'],soil:['#b78550','#79583a'],tree:'#987344',light:'#c49a5e'},{name:'SNOW MOUNTAINS',sky:['#9cc3d2','#d7e8e8','#f0f3ea'],soil:['#9aa7a4','#667a7b'],tree:'#456369',light:'#91b5b5'},{name:'NIGHT VALLEY',sky:['#17283f','#2b4260','#56647b'],soil:['#625d58','#373b43'],tree:'#263f3b',light:'#45635c'},{name:'DEEP FOREST',sky:['#668b79','#aac39a','#dfe5b9'],soil:['#655d3d','#343d2d'],tree:'#214b37',light:'#588052'},{name:'COASTAL CLIFFS',sky:['#7fc4d3','#c5e1d7','#f3dfb0'],soil:['#c3a879','#776347'],tree:'#41745e',light:'#72a783'},{name:'VOLCANIC RIDGE',sky:['#392e40','#795052','#d28b61'],soil:['#51413e','#29272b'],tree:'#463636',light:'#9d5a46'}];
const BIOME_TONES={
  'GREEN HILLS':{far:'#8fb7aa',farLight:'#b1cfc0',near:'#6f9e8b',nearLight:'#92b4a1',peak:'#d9e4c9',edge:'#577d41',highlight:'#adc36b',grass:'#88a653'},
  'ROCKY MOUNTAINS':{far:'#a4aaa1',farLight:'#d2d5c8',near:'#747d78',nearLight:'#a2a69c',peak:'#d0d1c6',edge:'#66685d',highlight:'#c5bda4',grass:'#9b977c'},
  DESERT:{far:'#c28d67',farLight:'#e2bc8b',near:'#a66e4c',nearLight:'#d09a69',peak:'#eac486',edge:'#9b7047',highlight:'#d4a65f',grass:'#c1a06a'},
  'SNOW MOUNTAINS':{far:'#a9c8ce',farLight:'#e3eeee',near:'#789da6',nearLight:'#c5dce0',peak:'#f4f6ef',edge:'#8caeaf',highlight:'#d7ece5',grass:'#c2d9ca'},
  'NIGHT VALLEY':{far:'#394e68',farLight:'#73839a',near:'#304e4d',nearLight:'#60766c',peak:'#65718a',edge:'#465749',highlight:'#728363',grass:'#596b50'},
  'DEEP FOREST':{far:'#476b5e',farLight:'#78977c',near:'#365644',nearLight:'#62805c',peak:'#a4bd99',edge:'#34533a',highlight:'#789456',grass:'#547344'},
  'COASTAL CLIFFS':{far:'#8abfc3',farLight:'#c8dfd4',near:'#609a91',nearLight:'#a1c3a6',peak:'#f6e5ba',edge:'#497b65',highlight:'#9ec78b',grass:'#6b9d68'},
  'VOLCANIC RIDGE':{far:'#5b474f',farLight:'#a2685d',near:'#45363a',nearLight:'#83564b',peak:'#b16a53',edge:'#3e3933',highlight:'#c2744e',grass:'#78513e'},
};
const VEHICLE_DATA={
  buggy:{name:'Buggy',label:'BUGGY',cost:0,stats:'Balanced handling · easy to control',paint:['#ee8646','#f9a15b']},
  rally:{name:'Rally Car',label:'RALLY',cost:250,stats:'Fast acceleration · sharp grip',paint:['#ce5543','#ec7e55']},
  monster:{name:'Monster Truck',label:'MONSTER',cost:500,stats:'Large tires · soft suspension',paint:['#398c83','#63b8a2']},
  snow:{name:'Snow Runner',label:'SNOW',cost:750,stats:'Stable in the air · extra grip',paint:['#77a9c0','#b3d5dc']},
  pickup:{name:'Trail Pickup',label:'PICKUP',cost:900,stats:'Heavy chassis · steady over rough ground',paint:['#bd7547','#e6ad66']},
  quad:{name:'Hill Quad',label:'QUAD',cost:1100,stats:'Quick and nimble · smaller tires',paint:['#cb4c4f','#f07861']},
  crawler:{name:'Rock Crawler',label:'CRAWLER',cost:1500,stats:'Maximum grip · big suspension travel',paint:['#665d9a','#9b8bd0']},
  bike:{name:'Ridge Racer Bike',label:'BIKE',cost:0,stats:'Fastest top speed · light and nimble',paint:['#e14d46','#ff9b57']},
};
const VEHICLE_LABELS=Object.fromEntries(Object.entries(VEHICLE_DATA).map(([id,v])=>[id,v.label])),VEHICLE_PAINT=Object.fromEntries(Object.entries(VEHICLE_DATA).map(([id,v])=>[id,[...v.paint,VEHICLES[id].wheelRadius]]));
const dom={distance:$('distance'),coins:$('coins'),best:$('best'),fuel:$('fuelValue'),fill:$('fuelFill'),fuelBar:$('fuelBar'),status:$('runStatus'),milestone:$('milestoneText'),milestoneFill:$('milestoneFill'),overlay:$('overlay'),card:$('overlayCard'),title:$('overlayTitle'),description:$('overlayDescription'),eyebrow:$('overlayEyebrow'),play:$('playButton'),secondary:$('secondaryButton'),pause:$('pauseButton'),hint:$('startHint'),results:$('runResults'),shell:$('gameShell')};
let W=1200,H=650,dpr=1,scale=1,cam={x:0,y:40},last=0,accumulator=0,visualTime=0,toastUntil=0,particles=[],lastDust=0,cameraShake=0,lowFuelWarned=false,runBest=0;
const keys=new Set(),pointers={gas:new Set(),brake:new Set()};
let best=0,soundEnabled=false,bankedRunCoins=0,autosaveElapsed=0;
let modUnlocked=false;
const modSettings={fastSpeed:false,infiniteFuel:false,infiniteHealth:false};
const multiplayer={session:null,room:null,pollTimer:0,startTimer:0,scheduledStart:null,serverOffset:0,activeRace:false,raceStarted:false,localFinished:false,syncBusy:false,syncElapsed:0,lastRoomState:null};
try{navigator.storage?.persist?.().catch(()=>{});}catch{}
const defaultProfile={coins:0,vehicle:'buggy',unlocked:['buggy','bike'],upgrades:{engine:1,grip:1,tank:1,suspension:1,air:1},achievements:[],mission:0,missionProgress:0,settings:{volume:70,reducedMotion:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false,hints:true,environment:0},checkpoint:0};
let profile={...defaultProfile,upgrades:{...defaultProfile.upgrades},settings:{...defaultProfile.settings}};
try{const saved=JSON.parse(localStorage.getItem('ridge-rush-save')||'null');if(saved&&typeof saved==='object'){profile={...profile,...saved,upgrades:{...profile.upgrades,...(saved.upgrades||{})},settings:{...profile.settings,...(saved.settings||{})}};}best=Math.max(0,Number(localStorage.getItem('ridge-rush-best'))||Number(profile.best)||0);soundEnabled=localStorage.getItem('ridge-rush-sound')==='true'||profile.settings.sound===true;}catch{}
const validVehicles=Object.keys(VEHICLE_DATA),upgradeKeys=['engine','grip','tank','suspension','air'],safeNumber=v=>Number.isFinite(Number(v))?Number(v):0;
profile.coins=Math.max(0,Math.floor(safeNumber(profile.coins)));profile.unlocked=Array.isArray(profile.unlocked)?[...new Set(profile.unlocked.filter(v=>validVehicles.includes(v)))]:['buggy','bike'];if(!profile.unlocked.includes('buggy'))profile.unlocked.unshift('buggy');if(!profile.unlocked.includes('bike'))profile.unlocked.push('bike');profile.vehicle=validVehicles.includes(profile.vehicle)&&profile.unlocked.includes(profile.vehicle)?profile.vehicle:'buggy';
for(const k of upgradeKeys)profile.upgrades[k]=clamp(Math.floor(safeNumber(profile.upgrades[k])||1),1,5);profile.achievements=Array.isArray(profile.achievements)?profile.achievements.filter(a=>['First Ride','1 KM','5 KM','Coin Collector','Air Time','Flip Master','Long Run','Checkpoint Runner'].includes(a)):[];profile.mission=clamp(Math.floor(safeNumber(profile.mission)),0,5);profile.missionProgress=Math.max(0,safeNumber(profile.missionProgress));profile.checkpoint=Math.max(0,safeNumber(profile.checkpoint));profile.bestScore=Math.max(0,safeNumber(profile.bestScore));profile.settings.volume=clamp(safeNumber(profile.settings.volume),0,100);profile.settings.reducedMotion=!!profile.settings.reducedMotion;profile.settings.hints=profile.settings.hints!==false;profile.settings.environment=clamp(Math.floor(safeNumber(profile.settings.environment)||0),-1,BIOMES.length-1);profile.settings.sound=!!soundEnabled;
const missions=[{name:'Trail Starter',goal:500,unit:'m',reward:40},{name:'Coin Collector',goal:25,unit:'run coins',reward:50},{name:'Long Ride',goal:1500,unit:'m',reward:75},{name:'Air Time',goal:3,unit:'air seconds',reward:60},{name:'Flip Practice',goal:2,unit:'flips',reward:80},{name:'Checkpoint Runner',goal:3,unit:'checkpoints',reward:100}];
const achievements=[['First Ride',()=>profile.rides>0],['1 KM',()=>best>=1000],['5 KM',()=>best>=5000],['Coin Collector',()=>profile.coins>=100],['Air Time',()=>profile.totalAir>=5],['Flip Master',()=>profile.totalFlips>=3],['Long Run',()=>best>=2500],['Checkpoint Runner',()=>profile.checkpoint>=1500]];
function saveProfile(){try{profile.bestScore=Math.max(Number(profile.bestScore)||0,Number(profile.currentScore)||0);localStorage.setItem('ridge-rush-save',JSON.stringify(profile));localStorage.setItem('ridge-rush-best',String(best));localStorage.setItem('ridge-rush-sound',String(soundEnabled));}catch{}}
function bankRunCoins(){const earned=Math.max(0,game.coins-bankedRunCoins);if(earned){profile.coins+=earned;bankedRunCoins+=earned;const wallet=profile.coins.toLocaleString();$('walletCoins').textContent=wallet;$('garageWallet').textContent=wallet;saveProfile();}return earned;}
function persistSession(){bankRunCoins();storeBest();saveProfile();}
window.addEventListener('pagehide',persistSession);
function multiplayerError(message,roomPanel=false){const target=$(roomPanel?'multiplayerErrorRoom':'multiplayerError');target.textContent=message||'';}
function renderMultiplayerRoom(room){
  multiplayer.room=room;multiplayer.serverOffset=(room.serverTime||Date.now())-Date.now();
  $('multiplayerHome').hidden=!!multiplayer.session;$('multiplayerLobby').hidden=!multiplayer.session;
  if(!multiplayer.session)return;
  if(room.environment!==undefined&&multiplayer.session.index!==room.hostIndex&&room.state==='lobby'&&profile.settings.environment!==room.environment){profile.settings.environment=room.environment;$('environmentSelect').value=String(room.environment);saveProfile();updateHUD();}
  const you=room.players[room.youIndex],rival=room.players[1-room.youIndex];
  $('roomCodeText').textContent=room.code;
  $('roomPlayerYou').textContent=`You · ${you?.name||multiplayer.session.name||'Rider'} · ${you?.ready?'Ready':'Not ready'}`;
  $('roomPlayerRival').textContent=rival?`Friend · ${rival.name} · ${rival.online?'Online':'Reconnecting'} · ${rival.ready?'Ready':'Not ready'}`:'Friend · waiting to join';
  const status=room.state==='lobby'?(rival?'Both riders ready up to start.':'Waiting for a friend to join…'):room.state==='countdown'?'Race starting…':room.state==='playing'?(you?.finished?'You finished. Waiting for your friend…':rival?.finished?'Your friend finished. Keep riding!':'Race in progress!'):room.state==='finished'?'Race complete! Compare your distances below.':room.state==='abandoned'?'The other rider left the race.':'Room status updated.';
  $('multiplayerRoomStatus').textContent=status;
  const readyButton=$('multiplayerReadyButton');readyButton.hidden=room.state!=='lobby'||!rival;readyButton.textContent=you?.ready?'CANCEL READY':'I’M READY';
  const isHost=room.youIndex===room.hostIndex;
  const canStart=isHost&&room.state==='lobby'&&!!rival&&room.players.every(p=>p?.ready&&p.online);
  $('multiplayerStartButton').hidden=!isHost||room.state!=='lobby';$('multiplayerStartButton').disabled=!canStart;
  $('multiplayerRematchButton').hidden=!isHost||room.state!=='finished';
  $('multiplayerHud').hidden=!multiplayer.activeRace||room.state==='lobby';
  if(multiplayer.activeRace&&rival){$('rivalDistance').textContent=String(rival.finished&&rival.finishDistance!==null?rival.finishDistance:rival.distance);$('multiplayerHudStatus').textContent=rival.finished?'RIVAL FINISHED':'RIVAL';$('rivalHudDetail').textContent=rival.finished?'Final distance':`${rival.online?'Online':'Reconnecting'} · ${rival.speed} km/h`;}
  if(room.state==='countdown'||room.state==='playing')scheduleOnlineStart(room);
  if(room.state==='abandoned'&&multiplayer.activeRace){multiplayer.activeRace=false;multiplayer.raceStarted=false;$('multiplayerHud').hidden=true;if(game.state==='playing')pauseRun();toast('RACE ENDED · THE OTHER RIDER LEFT');}
  if(multiplayer.lastRoomState==='finished'&&room.state==='lobby'){
    multiplayer.activeRace=false;multiplayer.raceStarted=false;multiplayer.localFinished=false;multiplayer.scheduledStart=null;
    if(multiplayer.startTimer)clearTimeout(multiplayer.startTimer);
    game.reset();bankedRunCoins=0;syncOverlay();updateHUD();
  }
  multiplayer.lastRoomState=room.state;
  if(room.state==='finished'&&multiplayer.activeRace&&game.state==='over'){
    showRaceOutcome(room);
    if(!$('multiplayerDialog').open)$('multiplayerDialog').showModal();
  }
}
const onlineRaceSetup={vehicle:'buggy',engine:1,grip:1,tank:1,suspension:1,air:1,fastSpeed:false,infiniteFuel:false,infiniteHealth:false};
function scheduleOnlineStart(room){
  if(!room.startAt||multiplayer.raceStarted||multiplayer.scheduledStart===room.startAt)return;
  multiplayer.scheduledStart=room.startAt;if(multiplayer.startTimer)clearTimeout(multiplayer.startTimer);
  const delay=Math.max(0,room.startAt-(Date.now()+multiplayer.serverOffset));
  multiplayer.startTimer=setTimeout(()=>{
    if(!multiplayer.session||multiplayer.raceStarted||!['countdown','playing'].includes(multiplayer.room?.state))return;
    multiplayer.activeRace=true;multiplayer.raceStarted=true;multiplayer.localFinished=false;multiplayer.syncElapsed=0;
    if($('multiplayerDialog').open)$('multiplayerDialog').close();$('multiplayerHud').hidden=false;startRun(onlineRaceSetup);
  },delay);
}
async function refreshMultiplayerRoom(){
  if(!multiplayer.session)return;
  try{renderMultiplayerRoom(await readRoom(multiplayer.session.code,multiplayer.session.token));}
  catch(error){multiplayerError(error.message,true);}
  finally{if(multiplayer.session)multiplayer.pollTimer=setTimeout(refreshMultiplayerRoom,700);}
}
function beginRoomPolling(){if(multiplayer.pollTimer)clearTimeout(multiplayer.pollTimer);refreshMultiplayerRoom();}
function setMultiplayerSession(data,name){
  multiplayer.session={code:data.code,token:data.token,index:data.youIndex,name};multiplayer.activeRace=false;multiplayer.raceStarted=false;multiplayer.localFinished=false;multiplayer.lastRoomState=null;
  multiplayerError('');multiplayerError('',true);renderMultiplayerRoom(data);beginRoomPolling();
}
async function actInRoom(action,details={}){
  if(!multiplayer.session)throw new Error('Join or create a room first.');
  const room=await updateRoom(multiplayer.session.code,multiplayer.session.token,action,details);renderMultiplayerRoom(room);return room;
}
function showRaceOutcome(room=multiplayer.room){
  if(!room)return;const mine=room.players[room.youIndex]?.finishDistance??game.distance,theirs=room.players[1-room.youIndex]?.finishDistance??0;
  dom.eyebrow.textContent='FRIEND RACE COMPLETE';dom.title.textContent=mine===theirs?'IT’S A TIE!':mine>theirs?'YOU WIN!':'YOUR FRIEND WINS';dom.description.textContent=`You: ${mine.toLocaleString()} m · Friend: ${theirs.toLocaleString()} m`;
  dom.play.innerHTML='RACE LOBBY <span aria-hidden="true">↗</span>';dom.secondary.hidden=true;
}
async function sendRaceProgress(){
  if(!multiplayer.session||!multiplayer.activeRace||multiplayer.localFinished||multiplayer.syncBusy||game.state!=='playing')return;
  multiplayer.syncBusy=true;
  try{await actInRoom('update',{distance:game.distance,speed:game.snapshot().speed,x:game.car.x,y:game.car.y});}
  catch(error){multiplayerError(error.message,true);}
  finally{multiplayer.syncBusy=false;}
}
async function finishOnlineRace(){
  if(!multiplayer.session||!multiplayer.activeRace||multiplayer.localFinished)return;
  multiplayer.localFinished=true;
  try{await actInRoom('finish',{distance:game.distance});}
  catch(error){multiplayerError(error.message,true);multiplayer.localFinished=false;}
}
async function leaveMultiplayer(){
  const session=multiplayer.session;if(!session)return;
  try{await updateRoom(session.code,session.token,'leave');}catch{}
  if(multiplayer.pollTimer)clearTimeout(multiplayer.pollTimer);if(multiplayer.startTimer)clearTimeout(multiplayer.startTimer);
  multiplayer.session=null;multiplayer.room=null;multiplayer.activeRace=false;multiplayer.raceStarted=false;multiplayer.localFinished=false;multiplayer.scheduledStart=null;multiplayer.lastRoomState=null;
  $('multiplayerHud').hidden=true;if($('multiplayerDialog').open)$('multiplayerDialog').close();
  if(game.state==='playing')pauseRun();
}
function refreshProfileUI(){ $('walletCoins').textContent=profile.coins.toLocaleString();$('garageWallet').textContent=profile.coins.toLocaleString();$('menuBest').textContent=best.toLocaleString()+' m';renderGarage();renderAchievements(); }
function renderGarage(){$('vehicleList').innerHTML=Object.entries(VEHICLE_DATA).map(([id,vehicle])=>{const unlocked=profile.unlocked.includes(id),selected=profile.vehicle===id,physics=VEHICLES[id];return `<div class="garage-row"><div><b>${vehicle.name}${selected?' · Selected':''}</b><small>${vehicle.stats} · Engine ${physics.engine.toFixed(2)} / Grip ${physics.grip.toFixed(2)}</small></div><button data-vehicle="${id}" ${!unlocked&&profile.coins<vehicle.cost?'disabled':''}>${selected?'SELECTED':unlocked?'SELECT':`UNLOCK · ${vehicle.cost}`}</button></div>`}).join('');const labels={engine:'Engine',grip:'Tires / grip',tank:'Fuel tank',suspension:'Suspension',air:'Air control'};const perks={engine:'+7.5% acceleration',grip:'+8% traction limit',tank:'+10 fuel capacity',suspension:'+8% suspension force',air:'+9% air rotation'};$('upgradeList').innerHTML=Object.keys(labels).map(k=>{const lv=profile.upgrades[k]||1,cost=lv*100;return `<div class="upgrade-row"><div><b>${labels[k]} · Lv ${lv}/5</b><small>${perks[k]}${lv<5?` · Next: Lv ${lv+1}`:' · MAX LEVEL'}</small></div><button data-upgrade="${k}" ${lv>=5||profile.coins<cost?'disabled':''}>${lv>=5?'MAX':`UPGRADE · ${cost}`}</button></div>`}).join('');}
function renderAchievements(){$('achievementList').innerHTML=achievements.map(([name,check])=>{const unlocked=profile.achievements.includes(name);return `<div class="achievement-row ${unlocked?'':'locked'}"><span>${unlocked?'✓':'○'} ${name}</span><small>${unlocked?'UNLOCKED':'LOCKED'}</small></div>`}).join('');const m=missions[profile.mission%missions.length];$('missionText').textContent=`${m.name}: ${Math.min(profile.missionProgress,m.goal)} / ${m.goal} ${m.unit} · Reward ${m.reward} coins`}
function checkAchievements(){let changed=false;for(const [name,check] of achievements)if(!profile.achievements.includes(name)&&check()){profile.achievements.push(name);toast('ACHIEVEMENT · '+name);beep(960,.18);changed=true;}if(changed)saveProfile();}
dom.best.textContent=best;
let audio=null,engineOsc=null,engineGain=null;

function initAudio(){
  if(!soundEnabled)return;
  try{
    if(!audio){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;audio=new Audio();engineOsc=audio.createOscillator();engineOsc.type='triangle';engineOsc.frequency.value=45;const filter=audio.createBiquadFilter();filter.type='lowpass';filter.frequency.value=220;engineGain=audio.createGain();engineGain.gain.value=0;engineOsc.connect(filter);filter.connect(engineGain);engineGain.connect(audio.destination);engineOsc.start();}
    if(audio.state==='suspended')audio.resume().catch(()=>{});
  }catch{}
}
function beep(frequency=600,duration=.10,type='sine',volume=.055){
  if(!soundEnabled||!audio)return;
  try{const osc=audio.createOscillator(),gain=audio.createGain();osc.type=type;osc.frequency.setValueAtTime(frequency,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(frequency*1.25,audio.currentTime+duration);gain.gain.setValueAtTime(volume*(profile.settings.volume/100),audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration);}catch{}
}
function updateSound(){if(!audio||!engineGain)return;const active=game.state==='playing'&&soundEnabled&&game.fuel>0;engineGain.gain.setTargetAtTime(active?(getInput().gas?.042:.018)*(profile.settings.volume/100):0,audio.currentTime,.10);engineOsc.frequency.setTargetAtTime(35+Math.abs(game.car.vx)*.15+(getInput().gas?10:0),audio.currentTime,.08);}
function syncSoundButton(){$('soundButton').setAttribute('aria-pressed',String(soundEnabled));$('soundButton').setAttribute('aria-label',soundEnabled?'Turn sound off':'Turn sound on');$('soundButton').title=soundEnabled?'Turn sound off':'Turn sound on';}
syncSoundButton();
$('soundButton').addEventListener('click',()=>{soundEnabled=!soundEnabled;profile.settings.sound=soundEnabled;saveProfile();initAudio();syncSoundButton();$('soundSetting').checked=soundEnabled;updateSound();});

function resize(){const r=canvas.getBoundingClientRect();W=r.width;H=r.height;dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);scale=W<650?.70:clamp(H/590,.67,1.45);if(game.state==='ready')snapCamera();}
new ResizeObserver(resize).observe(canvas);
function snapCamera(){cam.x=game.car.x-Math.max(130,W*.27/scale);cam.y=game.car.y-37;}
function sx(x){return(x-cam.x)*scale;}
function sy(y){return H*.67-(y-cam.y)*scale;}
function clearControls(){keys.clear();pointers.gas.clear();pointers.brake.clear();$('gasPedal').classList.remove('pressed');$('brakePedal').classList.remove('pressed');}
function getInput(){return{gas:keys.has('ArrowRight')||keys.has('KeyD')||pointers.gas.size>0,brake:keys.has('ArrowLeft')||keys.has('KeyA')||pointers.brake.size>0};}
function startRun(overrides={}){if(multiplayer.session&&!multiplayer.activeRace){multiplayerError('Leave the room before starting a solo run.',true);if(!$('multiplayerDialog').open)$('multiplayerDialog').showModal();return;}if(game.state==='playing'||game.state==='paused')bankRunCoins();bankedRunCoins=0;autosaveElapsed=0;clearControls();game.start({...profile.upgrades,vehicle:profile.vehicle,...modSettings,...overrides});runBest=best;particles=[];cameraShake=0;toastUntil=0;$('toast').classList.remove('visible');lastDust=0;lowFuelWarned=false;accumulator=0;snapCamera();initAudio();syncOverlay();updateHUD();canvas.focus({preventScroll:true});}
function pauseRun(){game.pause();clearControls();bankRunCoins();storeBest();saveProfile();syncOverlay();updateSound();}
function resumeRun(){game.resume();clearControls();accumulator=0;initAudio();syncOverlay();canvas.focus({preventScroll:true});}
function togglePause(){if(game.state==='playing')pauseRun();else if(game.state==='paused')resumeRun();}
function storeBest(){if(game.distance>best){best=game.distance;dom.best.textContent=best;try{localStorage.setItem('ridge-rush-best',String(best));}catch{}}}
function syncOverlay(){
  const playing=game.state==='playing',paused=game.state==='paused',over=game.state==='over';
  dom.overlay.classList.toggle('hidden',playing);dom.overlay.classList.toggle('is-modal',paused||over);dom.shell.classList.toggle('running',playing);
  dom.pause.disabled=!playing&&!paused;dom.pause.setAttribute('aria-label',paused?'Resume game':'Pause game');dom.pause.title=paused?'Resume (P)':'Pause (P)';dom.pause.firstElementChild.textContent=paused?'▷':'Ⅱ';
  dom.results.hidden=!over;dom.secondary.hidden=!paused&&!over;dom.menuButton=$('menuButton');dom.menuButton.hidden=multiplayer.activeRace||(!paused&&!over);$('overlaySettings').hidden=!paused&&!over;dom.hint.hidden=paused;
  if(paused){dom.eyebrow.textContent='TAKE A BREATHER';dom.title.textContent='ENJOY THE VIEW.';dom.description.textContent='Your trail will be right here.';dom.play.innerHTML='KEEP RIDING <span aria-hidden="true">↗</span>';dom.secondary.textContent='Start a fresh run';}
  else if(over){storeBest();const score=game.distance+game.coins*10+game.flips*100;profile.currentScore=score;profile.bestScore=Math.max(Number(profile.bestScore)||0,score);dom.eyebrow.textContent=game.distance>runBest?'A NEW PERSONAL BEST':'THERE’S ALWAYS ANOTHER HILL';dom.title.textContent=game.reason==='Out of fuel'?'EMPTY TANK.':game.reason==='Watch your head!'?'HEAD HIT.':'ROUGH LANDING.';dom.description.textContent=game.reason==='Out of fuel'?'Grab the red fuel cans to keep the adventure going.':game.reason==='Watch your head!'?'The buggy came down on its roof. Ease off at the crest and rotate to land on your wheels.':'The buggy fell below the trail. Try to keep both wheels in contact.';dom.play.innerHTML='RIDE AGAIN <span aria-hidden="true">↗</span>';dom.secondary.textContent='Open garage';$('resultDistance').textContent=game.distance+' m';$('resultCoins').textContent=game.coins;$('resultAir').textContent=game.totalAir.toFixed(1)+'s / '+game.flips;$('resultScore').textContent=score.toLocaleString();$('resultBestScore').textContent=profile.bestScore.toLocaleString();dom.hint.innerHTML='or press <kbd>ENTER</kbd>';}
  else{dom.eyebrow.textContent='FRESH AIR. FULL TANK.';dom.title.innerHTML='ONE MORE<br><span>HILL.</span>';dom.description.innerHTML='Keep your fuel up.<br>Keep your wheels down.';dom.play.innerHTML='LET’S RIDE <span aria-hidden="true">↗</span>';dom.secondary.hidden=true;dom.menuButton.hidden=true;$('overlaySettings').hidden=true;dom.hint.innerHTML='or press <kbd>ENTER</kbd>';}
  if(over&&multiplayer.activeRace){dom.secondary.hidden=true;if(multiplayer.room?.state==='finished')showRaceOutcome();else{dom.eyebrow.textContent='FRIEND RACE';dom.title.textContent='RACE FINISHED';dom.description.textContent='Waiting for your friend to finish…';dom.play.innerHTML='RACE STATUS <span aria-hidden="true">↗</span>';}if(!multiplayer.localFinished)void finishOnlineRace();}
  if(!playing)dom.play.focus({preventScroll:true});
}
dom.play.addEventListener('click',()=>{if(multiplayer.activeRace&&game.state==='over'){if(!$('multiplayerDialog').open)$('multiplayerDialog').showModal();return;}game.state==='paused'?resumeRun():startRun();});dom.secondary.addEventListener('click',()=>{if(multiplayer.activeRace&&game.state==='over'){$('multiplayerDialog').showModal();}else if(game.state==='paused')startRun();else $('garageDialog').showModal();});$('menuButton').addEventListener('click',()=>{bankRunCoins();storeBest();saveProfile();clearControls();game.reset();bankedRunCoins=0;syncOverlay();updateHUD();});$('overlaySettings').addEventListener('click',()=>$('settingsDialog').showModal());dom.pause.addEventListener('click',togglePause);

for(const [name,id] of [['gas','gasPedal'],['brake','brakePedal']]){
  const el=$(id);
  el.addEventListener('pointerdown',e=>{e.preventDefault();if(game.state!=='playing')return;el.setPointerCapture(e.pointerId);pointers[name].add(e.pointerId);el.classList.add('pressed');initAudio();});
  const release=e=>{pointers[name].delete(e.pointerId);el.classList.toggle('pressed',pointers[name].size>0);};
  el.addEventListener('pointerup',release);el.addEventListener('pointercancel',release);el.addEventListener('lostpointercapture',release);el.addEventListener('contextmenu',e=>e.preventDefault());
}
document.addEventListener('keydown',e=>{
  if(document.querySelector('dialog[open]'))return;
  if(['ArrowLeft','ArrowRight','KeyA','KeyD','KeyP','KeyR','Space','Enter','Escape'].includes(e.code)){
    if(e.target instanceof HTMLButtonElement&&(e.code==='Space'||e.code==='Enter'))return;
    e.preventDefault();
    if(['ArrowLeft','ArrowRight','KeyA','KeyD'].includes(e.code)&&game.state==='playing')keys.add(e.code);
    if(e.repeat)return;
    if(multiplayer.activeRace&&(e.code==='KeyR'||e.code==='Enter'||e.code==='Space')){if(game.state==='over'&&!$('multiplayerDialog').open)$('multiplayerDialog').showModal();return;}
    if(e.code==='KeyP'||e.code==='Escape')togglePause();
    if(e.code==='KeyR')startRun();
    if(e.code==='Enter'||e.code==='Space'){if(game.state==='ready'||game.state==='over')startRun();else togglePause();}
  }
});
document.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{clearControls();if(game.state==='playing')pauseRun();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&game.state==='playing')pauseRun();});
let helpReturn=null;
$('helpButton').addEventListener('click',()=>{helpReturn=document.activeElement;if(game.state==='playing')pauseRun();$('helpDialog').showModal();});
$('closeHelp').addEventListener('click',()=>$('helpDialog').close());$('helpDone').addEventListener('click',()=>$('helpDialog').close());$('helpDialog').addEventListener('close',()=>helpReturn?.focus());
$('garageButton').addEventListener('click',()=>$('garageDialog').showModal());$('settingsButton').addEventListener('click',()=>$('settingsDialog').showModal());$('achievementsButton').addEventListener('click',()=>$('achievementDialog').showModal());
$('multiplayerButton').addEventListener('click',()=>{multiplayerError('');multiplayerError('',true);$('multiplayerHome').hidden=!!multiplayer.session;$('multiplayerLobby').hidden=!multiplayer.session;if(multiplayer.room)renderMultiplayerRoom(multiplayer.room);$('multiplayerDialog').showModal();});
$('createRoomButton').addEventListener('click',async()=>{const button=$('createRoomButton');button.disabled=true;multiplayerError('');try{const room=await createRoom($('multiplayerName').value,profile.settings.environment);setMultiplayerSession(room,$('multiplayerName').value.trim()||'Rider');}catch(error){multiplayerError(error.message);}finally{button.disabled=false;}});
$('joinRoomButton').addEventListener('click',async()=>{const button=$('joinRoomButton'),code=$('joinRoomCode').value.trim().replace(/\D/g,'');button.disabled=true;multiplayerError('');if(code.length!==6){multiplayerError('Enter the 6-digit friend code.');button.disabled=false;return;}try{const room=await joinRoom(code,$('multiplayerName').value);setMultiplayerSession(room,$('multiplayerName').value.trim()||'Rider');}catch(error){multiplayerError(error.message);}finally{button.disabled=false;}});
$('multiplayerReadyButton').addEventListener('click',async()=>{try{const you=multiplayer.room?.players[multiplayer.room.youIndex];await actInRoom('ready',{ready:!you?.ready});multiplayerError('',true);}catch(error){multiplayerError(error.message,true);}});
$('multiplayerStartButton').addEventListener('click',async()=>{try{await actInRoom('start');multiplayerError('',true);}catch(error){multiplayerError(error.message,true);}});
$('multiplayerRematchButton').addEventListener('click',async()=>{try{await actInRoom('rematch');multiplayerError('',true);}catch(error){multiplayerError(error.message,true);}});
$('multiplayerLeaveButton').addEventListener('click',leaveMultiplayer);
$('copyRoomCodeButton').addEventListener('click',async()=>{try{const invite=new URL(location.href);invite.searchParams.set('room',multiplayer.session.code);await navigator.clipboard.writeText(invite.toString());$('copyRoomCodeButton').textContent='INVITE LINK COPIED';}catch{$('copyRoomCodeButton').textContent=`CODE: ${multiplayer.session?.code||''}`;}});
const invitationCode=new URLSearchParams(location.search).get('room');if(invitationCode&&/^\d{6}$/.test(invitationCode)){$('joinRoomCode').value=invitationCode;$('multiplayerDialog').showModal();}
function syncModDialog(){$('modUnlockPanel').hidden=modUnlocked;$('modOptionsPanel').hidden=!modUnlocked;$('modButton').textContent=modUnlocked?'MOD ✓':'MOD 🔒';for(const [id,key] of [['modFastSpeed','fastSpeed'],['modInfiniteFuel','infiniteFuel'],['modInfiniteHealth','infiniteHealth']])$(id).checked=modSettings[key];}
$('modButton').addEventListener('click',()=>{syncModDialog();$('modDialog').showModal();if(!modUnlocked)setTimeout(()=>$('modPassword').focus(),0);});
$('modPasswordForm').addEventListener('submit',e=>{e.preventDefault();const input=$('modPassword');if(input.value!=='4444'){$('modPasswordMessage').textContent='Incorrect password. Try again.';input.value='';input.focus();return;}modUnlocked=true;modSettings.fastSpeed=true;modSettings.infiniteFuel=true;modSettings.infiniteHealth=true;$('modPasswordMessage').textContent='Unlocked. Choose your modifiers.';syncModDialog();$('modFastSpeed').focus();});
for(const [id,key] of [['modFastSpeed','fastSpeed'],['modInfiniteFuel','infiniteFuel'],['modInfiniteHealth','infiniteHealth']])$(id).addEventListener('change',e=>{modSettings[key]=e.target.checked;});
$('environmentSelect').value=String(profile.settings.environment);$('environmentSelect').addEventListener('change',e=>{profile.settings.environment=clamp(Math.floor(Number(e.target.value)),-1,BIOMES.length-1);saveProfile();updateHUD();});
document.querySelectorAll('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.closeDialog).close()));
$('vehicleList').addEventListener('click',e=>{const button=e.target.closest('[data-vehicle]');if(!button)return;const id=button.dataset.vehicle,cost=VEHICLE_DATA[id]?.cost;if(cost===undefined)return;if(profile.unlocked.includes(id)){profile.vehicle=id;}else if(profile.coins>=cost){profile.coins-=cost;profile.unlocked.push(id);profile.vehicle=id;beep(840,.16);}saveProfile();refreshProfileUI();$('currentVehicle').textContent=VEHICLE_LABELS[profile.vehicle];});
$('upgradeList').addEventListener('click',e=>{const button=e.target.closest('[data-upgrade]');if(!button)return;const key=button.dataset.upgrade,level=profile.upgrades[key]||1,cost=level*100;if(level>=5||profile.coins<cost)return;profile.coins-=cost;profile.upgrades[key]=level+1;beep(720,.12);saveProfile();refreshProfileUI();});
$('soundSetting').addEventListener('change',e=>{soundEnabled=e.target.checked;profile.settings.sound=soundEnabled;saveProfile();syncSoundButton();initAudio();updateSound();});
$('volumeSetting').addEventListener('input',e=>{profile.settings.volume=Number(e.target.value);saveProfile();});
$('motionSetting').addEventListener('change',e=>{profile.settings.reducedMotion=e.target.checked;saveProfile();});
$('hintsSetting').addEventListener('change',e=>{profile.settings.hints=e.target.checked;document.querySelector('.control-hints').hidden=!e.target.checked;saveProfile();});
$('settingsFullscreen').addEventListener('click',()=>$('fullscreenButton').click());
refreshProfileUI();$('soundSetting').checked=soundEnabled;$('volumeSetting').value=profile.settings.volume;$('motionSetting').checked=!!profile.settings.reducedMotion;$('hintsSetting').checked=profile.settings.hints!==false;document.querySelector('.control-hints').hidden=profile.settings.hints===false;
document.addEventListener('keydown',e=>{if(e.key!=='Tab'||dom.overlay.classList.contains('hidden')||document.querySelector('dialog[open]'))return;const focusables=Array.from(dom.overlay.querySelectorAll('button:not([hidden])')).filter(el=>el.getClientRects().length);if(e.shiftKey&&document.activeElement===focusables[0]){e.preventDefault();focusables.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===focusables.at(-1)){e.preventDefault();focusables[0].focus();}});
$('fullscreenButton').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(dom.shell.requestFullscreen)await dom.shell.requestFullscreen();else{dom.shell.classList.toggle('expanded');syncFullscreen();}}catch{dom.shell.classList.toggle('expanded');syncFullscreen();}});
function syncFullscreen(){const full=!!document.fullscreenElement||dom.shell.classList.contains('expanded');$('fullscreenButton').setAttribute('aria-label',full?'Exit fullscreen':'Enter fullscreen');$('fullscreenButton').title=full?'Exit fullscreen':'Fullscreen';resize();}
document.addEventListener('fullscreenchange',syncFullscreen);

function toast(text,seconds=2){$('toast').textContent=text;$('toast').classList.add('visible');toastUntil=visualTime+seconds;}
function burst(x,y,color,count=9){if(profile.settings.reducedMotion)return;for(let i=0;i<count&&particles.length<80;i++)particles.push({x,y,vx:(Math.random()-.5)*150,vy:40+Math.random()*145,life:.55+Math.random()*.4,maxLife:.95,size:2+Math.random()*3,color});}
function handleEvents(){for(const e of game.drainEvents()){
  if(e.type==='coin'){burst(e.x,e.y,'#f9d867',5);beep(700+game.coins%25*15,.07);}
  else if(e.type==='fuel'){burst(e.x,e.y,'#f18e58',15);toast('REFUELED · +48 FUEL');beep(450,.18);lowFuelWarned=false;}
  else if(e.type==='air'){toast('AIR TIME  +'+e.amount+' COINS');beep(880,.13);}
  else if(e.type==='flip'){toast('FULL FLIP!  +100 COINS');beep(1100,.23);}
  else if(e.type==='landing'){if(e.impact>260){cameraShake=Math.min(8,e.impact*.012);const p=game.point(0,-22);burst(p.x,p.y,'#c3b27e',8);beep(180,.11,'triangle',.035);}}
  else if(e.type==='milestone'){toast(e.distance.toLocaleString()+' m  ·  KEEP ON CLIMBING',2.5);beep(660,.2);storeBest();}
  else if(e.type==='checkpoint'){profile.checkpoint=Math.max(profile.checkpoint,e.distance);toast('CHECKPOINT · '+e.distance+' m  +25 COINS',2.5);profile.coins+=25;beep(760,.18);saveProfile();refreshProfileUI();}
  else if(e.type==='over'){clearControls();if(!profile.settings.reducedMotion){cameraShake=10;burst(game.car.x,game.car.y,'#baac80',18);}beep(100,.5,'triangle',.09);bankRunCoins();profile.rides=(profile.rides||0)+1;profile.totalAir=(profile.totalAir||0)+game.totalAir;profile.totalFlips=(profile.totalFlips||0)+game.flips;storeBest();const m=missions[profile.mission%missions.length];const amount=[game.distance,game.runCoins,game.distance,game.totalAir,game.flips,Math.floor(game.distance/500)][profile.mission%missions.length];profile.missionProgress+=amount;if(profile.missionProgress>=m.goal){profile.coins+=m.reward;toast('MISSION COMPLETE · +'+m.reward+' COINS',2.5);beep(980,.22);profile.mission=(profile.mission+1)%missions.length;profile.missionProgress=0;}checkAchievements();saveProfile();refreshProfileUI();syncOverlay();}
}}
function updateHUD(){
  const s=game.snapshot(),fuelPercent=game.maxFuel?Math.ceil(game.fuel/game.maxFuel*100):0;dom.distance.textContent=s.distance.toLocaleString();dom.coins.textContent=s.coins.toLocaleString();dom.fuel.textContent=fuelPercent+'%';dom.fill.style.width=fuelPercent+'%';dom.fuelBar.setAttribute('aria-valuenow',String(fuelPercent));dom.fuelBar.classList.toggle('low',fuelPercent<=22);dom.milestoneFill.style.width=((s.distance%500)/5)+'%';dom.milestone.textContent='NEXT MILESTONE · '+game.nextMilestone.toLocaleString()+' m';const vehicleName=VEHICLE_LABELS[profile.vehicle]||'BUGGY';$('currentVehicle').textContent=vehicleName;const trailVehicle=$('trailVehicle');if(trailVehicle.textContent!==vehicleName)trailVehicle.textContent=vehicleName;const regionIndex=(profile.settings.environment>=0?profile.settings.environment:Math.floor(Math.max(0,game.car.x)/6000)%BIOMES.length),regionName=biomeAt(game.car.x).name;const regionLabel=document.querySelector('.trail-label b');if(regionLabel.textContent!==regionName)regionLabel.textContent=regionName;const regionNumber=String(regionIndex+1).padStart(2,'0');if(document.querySelector('.trail-number').textContent!==regionNumber)document.querySelector('.trail-number').textContent=regionNumber;
  dom.status.textContent=game.state==='ready'?'YOUR NEXT ADVENTURE STARTS HERE':game.state==='paused'?'JUST TAKING IN THE VIEW':game.state==='over'?'THE TRAIL IS CALLING':!game.grounded&&game.airtime>.2?'A LITTLE HANG TIME':s.speed+' KM/H  ·  KEEP IT ROLLING';
  $('multiplayerHud').hidden=!multiplayer.activeRace;
  if(multiplayer.activeRace&&multiplayer.room){const rival=multiplayer.room.players[1-multiplayer.room.youIndex];if(rival){$('rivalDistance').textContent=String(rival.finished&&rival.finishDistance!==null?rival.finishDistance:rival.distance);$('multiplayerHudStatus').textContent=rival.finished?'RIVAL FINISHED':'RIVAL';$('rivalHudDetail').textContent=rival.finished?'Final distance':`${rival.online?'Online':'Reconnecting'} · ${rival.speed} km/h`;}}
  if(fuelPercent<=22&&!lowFuelWarned&&game.state==='playing'){toast('LOW FUEL · LOOK FOR A RED CAN',2.5);lowFuelWarned=true;}
  const input=getInput();$('gasPedal').classList.toggle('pressed',game.state==='playing'&&input.gas);$('brakePedal').classList.toggle('pressed',game.state==='playing'&&input.brake);
}

function roundRect(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
function polygon(points,fill,stroke){ctx.beginPath();for(let i=0;i<points.length;i++)i?ctx.lineTo(...points[i]):ctx.moveTo(...points[i]);ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
function ellipse(x,y,rx,ry,fill){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();}
function drawPine(x,y,size,color,light){ctx.fillStyle=color;ctx.fillRect(x-size*.027,y-size*.18,size*.055,size*.2);polygon([[x,y-size],[x-size*.2,y-size*.57],[x-size*.105,y-size*.6],[x-size*.29,y-size*.28],[x-size*.16,y-size*.33],[x-size*.36,y-size*.06],[x+size*.36,y-size*.06],[x+size*.17,y-size*.33],[x+size*.28,y-size*.28],[x+size*.11,y-size*.6],[x+size*.2,y-size*.57]],color);if(light)polygon([[x,y-size],[x-size*.20,y-size*.57],[x-size*.105,y-size*.6],[x-size*.29,y-size*.28],[x-size*.16,y-size*.33],[x-size*.36,y-size*.06],[x,y-size*.11]],light);}
function biomeAt(x=cam.x){const selected=profile.settings.environment;return BIOMES[selected>=0?selected:Math.floor(Math.max(0,x)/6000)%BIOMES.length];}

function drawSky(){
  const region=biomeAt(),tones=BIOME_TONES[region.name]||BIOME_TONES['GREEN HILLS'],sky=ctx.createLinearGradient(0,0,0,H*.8);sky.addColorStop(0,region.sky[0]);sky.addColorStop(.6,region.sky[1]);sky.addColorStop(1,region.sky[2]);ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
  const sunX=W*.78-cam.x*.017%70,sunY=H*.235;
  if(region.name==='NIGHT VALLEY'){
    for(let i=0;i<45;i++){const sx=(hash(i+801)*W+W-cam.x*.012%W)%W,sy=hash(i+913)*H*.47;ellipse(sx,sy,1+hash(i+17)*1.2,1+hash(i+29)*1.2,'#f4efd9cc');}
    ellipse(sunX,sunY,37,37,'#fff1c9');ellipse(sunX+14,sunY-9,34,34,region.sky[0]);
  }else{
    ellipse(sunX,sunY,59,59,'#f3ecc742');ellipse(sunX,sunY,44,44,'#fff3c7bb');ellipse(sunX,sunY,32,32,'#fff5d1');
    for(let i=0;i<5;i++){const span=W+430;const x=((i*317+70-cam.x*.035+visualTime*1.5)%span+span)%span-150,y=H*(.17+hash(i+23)*.2),s=.55+hash(i+41)*.7;ctx.globalAlpha=.30;ellipse(x,y,60*s,12*s,'#f9f8e6');ellipse(x+17*s,y-8*s,29*s,17*s,'#f9f8e6');ellipse(x-18*s,y-5*s,22*s,14*s,'#f9f8e6');ctx.globalAlpha=1;}
  }
  mountainLayer(.10,H*.57,190,tones.far,tones.farLight,91);
  mountainLayer(.20,H*.70,165,tones.near,tones.nearLight,40);
  if(region.name==='COASTAL CLIFFS'){const water=ctx.createLinearGradient(0,H*.59,0,H*.83);water.addColorStop(0,'#5aa9ba');water.addColorStop(1,'#347b91');ctx.fillStyle=water;ctx.fillRect(0,H*.59,W,H*.20);ctx.strokeStyle='#d9f0dd77';ctx.lineWidth=2;for(let i=0;i<7;i++){const y=H*(.62+i*.023),offset=(cam.x*.035+i*83)%190;ctx.beginPath();for(let x=-190;x<W+190;x+=12){const yy=y+Math.sin((x+offset)/35)*2;x===-190?ctx.moveTo(x,yy):ctx.lineTo(x,yy);}ctx.stroke();}}
  drawFoothills();
  if(W>600&&region.name!=='NIGHT VALLEY'){ctx.strokeStyle='#517d7166';ctx.lineWidth=1.4;const x=((W*.57-cam.x*.05)%(W+100)+W+100)%(W+100);const y=H*.2;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(x+i*15-5,y+i*7);ctx.quadraticCurveTo(x+i*15-2,y+i*7-4,x+i*15,y+i*7);ctx.quadraticCurveTo(x+i*15+2,y+i*7-4,x+i*15+5,y+i*7);ctx.stroke();}}
}
function mountainLayer(parallax,base,amplitude,color,light,seed){
  const stretch=W<650?.8:1.1,unit=260*stretch,start=Math.floor((cam.x*parallax)/unit)-2,end=start+Math.ceil(W/unit)+5,offset=cam.x*parallax;
  const points=[[-300,H]];
  const peaks=[];
  for(let i=start;i<=end;i++){const x=i*unit-offset;const y=base-(.4+hash(i+seed)*.65)*amplitude*(H/650);points.push([x,y+amplitude*.32],[x+unit*.47,y],[x+unit*.82,y+amplitude*.42]);peaks.push({x:x+unit*.47,y,unit});}
  points.push([W+400,H]);polygon(points,color);
  for(const p of peaks){polygon([[p.x,p.y],[p.x+p.unit*.35,p.y+amplitude*.42],[p.x+p.unit*.06,p.y+amplitude*.35],[p.x-p.unit*.1,p.y+amplitude*.20]],light);if(parallax===.10)polygon([[p.x,p.y],[p.x+p.unit*.13,p.y+amplitude*.155],[p.x+p.unit*.025,p.y+amplitude*.13],[p.x-p.unit*.06,p.y+amplitude*.17],[p.x-p.unit*.18,p.y+amplitude*.20]],(BIOME_TONES[biomeAt().name]||BIOME_TONES['GREEN HILLS']).peak);}
}
function drawFoothills(){
  const tones=BIOME_TONES[biomeAt().name]||BIOME_TONES['GREEN HILLS'];
  const offset=cam.x*.37;
  function ridge(x){return H*.72+Math.sin((x+offset)/240)*H*.055+Math.sin((x+offset)/110)*H*.025;}
  const p=[[-20,H]];for(let x=-20;x<W+30;x+=12)p.push([x,ridge(x)]);p.push([W+30,H]);polygon(p,tones.near);
  const first=Math.floor(offset/54)-2;
  for(let i=first;i<first+W/54+5;i++){const x=i*54-offset+hash(i)*22;drawPine(x,ridge(x)+12,30+hash(i+55)*58,biomeAt().tree,tones.nearLight);}
  const offset2=cam.x*.58;
  const p2=[[-20,H]];for(let x=-20;x<W+30;x+=14)p2.push([x,H*.82+Math.sin((x+offset2)/290)*H*.075]);p2.push([W+30,H]);polygon(p2,tones.edge);
}

function drawScenery(){
  const start=Math.floor((cam.x-180)/175),end=Math.ceil((cam.x+W/scale+150)/175);
  for(let i=start;i<=end;i++){
    const x=i*175+hash(i+12)*80;if(x<350)continue;
    const y=terrain(x),screenX=sx(x),screenY=sy(y);
    if(biomeAt(x).name==='DESERT'){ctx.save();ctx.translate(screenX,screenY);ctx.scale(scale,scale);ctx.strokeStyle='#56744b';ctx.lineWidth=7;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-34);ctx.moveTo(0,-18);ctx.lineTo(-10,-18);ctx.lineTo(-10,-27);ctx.moveTo(0,-24);ctx.lineTo(10,-24);ctx.lineTo(10,-31);ctx.stroke();ctx.restore();}
    else if(biomeAt(x).name==='COASTAL CLIFFS'){ctx.save();ctx.translate(screenX,screenY);ctx.scale(scale,scale);ctx.strokeStyle='#806044';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(3,-23,17,-39);ctx.stroke();ctx.strokeStyle='#347256';ctx.lineWidth=4;for(let a=-2;a<=2;a++){ctx.beginPath();ctx.moveTo(16,-39);ctx.quadraticCurveTo(16+a*8,-51,16+a*15,-48+Math.abs(a)*3);ctx.stroke();}ctx.restore();}
    else if(biomeAt(x).name==='VOLCANIC RIDGE'){const rock=18+hash(i+72)*22;ellipse(screenX,screenY-rock*.36,scale*rock,scale*rock*.55,'#51413c');if(hash(i+19)>.55)ellipse(screenX+scale*7,screenY-rock*.8,scale*2,scale*rock*.36,'#ee7648');}
    else if(hash(i+62)>(biomeAt(x).name==='DEEP FOREST'?.12:.36)){const r=biomeAt(x),size=biomeAt(x).name==='DEEP FOREST'?105:64;drawPine(screenX,screenY+3,scale*(size+hash(i+51)*70),r.tree,r.light);if(hash(i)>.63)drawPine(screenX+30*scale,screenY+5,scale*(44+hash(i+41)*48),r.tree,r.light);}
    else {ctx.save();ctx.translate(screenX,screenY);ctx.scale(scale,scale);ctx.lineWidth=3;ctx.strokeStyle='#6c7250';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-3,-36);ctx.moveTo(-3,-19);ctx.lineTo(-15,-31);ctx.stroke();ellipse(-6,-45,17,25,'#85a455');ellipse(6,-47,12,20,'#a1b961');ellipse(-16,-35,12,16,'#91ac58');ctx.restore();}
  }
  if(cam.x<400){drawSign(78,'GO EXPLORE',false);drawSign(420,'EASY DOES IT',true);}
  const from=Math.max(1,Math.floor(cam.x/3000));for(let i=from;i<=Math.ceil((cam.x+W/scale)/3000);i++)drawSign(START_X+i*3000,i*500+' m',false);
}
function drawSign(x,label,small){const px=sx(x),py=sy(terrain(x));if(px<-120||px>W+120)return;ctx.save();ctx.translate(px,py);ctx.scale(scale,scale);ctx.fillStyle='#816e48';ctx.fillRect(-3,-62,6,65);roundRect(-43,-82,94,27,3,'#e1d49b','#957d50');ctx.fillStyle='#466044';ctx.textAlign='center';ctx.font='bold '+(small?'9':'10')+'px Arial';ctx.fillText(label,4,-65);ctx.restore();}

function groundPath(depth=0){ctx.beginPath();ctx.moveTo(-20,H+40);for(let x=-20;x<=W+24;x+=7)ctx.lineTo(x,sy(terrain(cam.x+x/scale))+depth*scale);ctx.lineTo(W+24,H+40);ctx.closePath();}
function drawTerrain(){
  const region=biomeAt(),tones=BIOME_TONES[region.name]||BIOME_TONES['GREEN HILLS'];groundPath();const soil=ctx.createLinearGradient(0,H*.55,0,H);soil.addColorStop(0,region.soil[0]);soil.addColorStop(1,region.soil[1]);ctx.fillStyle=soil;ctx.fill();
  ctx.save();groundPath(17);ctx.clip();
  ctx.strokeStyle='#b2a16e2e';ctx.lineWidth=3;for(let layer=0;layer<5;layer++){ctx.beginPath();for(let x=-10;x<W+20;x+=12){const world=cam.x+x/scale,y=sy(terrain(world))+scale*(48+layer*40+Math.sin(world/130+layer)*10);x===-10?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();}
  const first=Math.floor(cam.x/40);for(let i=first;i<first+W/scale/40+4;i++){const x=i*40+hash(i+6)*20;for(let j=0;j<5;j++){const y=terrain(x)-38-j*45-hash(i+j*13)*24;ellipse(sx(x),sy(y),scale*(2+hash(i+j)*4),scale*(1.5+hash(i+j+8)*2),'#d4c18d25');}}
  ctx.restore();
  ctx.beginPath();for(let x=-20;x<W+25;x+=6){const y=sy(terrain(cam.x+x/scale))+7*scale;x===-20?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.lineWidth=20*scale;ctx.lineCap='round';ctx.strokeStyle=tones.edge;ctx.stroke();
  ctx.beginPath();for(let x=-20;x<W+25;x+=6){const y=sy(terrain(cam.x+x/scale))-1*scale;x===-20?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.lineWidth=5*scale;ctx.strokeStyle=tones.highlight;ctx.stroke();
  const firstGrass=Math.floor(cam.x/16);ctx.strokeStyle=tones.grass;ctx.lineWidth=1.5*scale;
  for(let i=firstGrass;i<firstGrass+W/scale/16+2;i++){const x=i*16+hash(i)*8,px=sx(x),py=sy(terrain(x))-1;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px-2*scale,py-(3+hash(i+32)*6)*scale);ctx.moveTo(px,py);ctx.lineTo(px+3*scale,py-4*scale);ctx.stroke();if(hash(i+9)>.94){ellipse(px+2*scale,py-6*scale,2*scale,2*scale,'#e0d886');}}
}

function drawItems(){
  for(const item of game.items){if(item.taken)continue;const x=sx(item.x),y=sy(item.y);if(x<-45||x>W+45)continue;const bob=game.state==='playing'?Math.sin(visualTime*3+item.x)*2:0;ctx.save();ctx.translate(x,y+bob);ctx.scale(scale,scale);
    if(item.type==='coin'){
      ctx.shadowColor='#e6bd5655';ctx.shadowBlur=12;ellipse(0,0,11,12,'#b48126');ellipse(0,-1,10,11,'#f7d45c');ctx.shadowBlur=0;ctx.lineWidth=1.2;ctx.strokeStyle='#d6a83a';ctx.beginPath();ctx.ellipse(0,-1,7,8,0,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#fff0a3';ctx.fillRect(-2,-6,3,9);ctx.strokeStyle='#fff6b8';ctx.beginPath();ctx.moveTo(-5,-7);ctx.lineTo(-2,-9);ctx.stroke();
    }else{
      ctx.lineWidth=3;ctx.strokeStyle='#973e2f';ctx.beginPath();ctx.roundRect(-5,-22,11,9,2);ctx.stroke();roundRect(-14,-16,28,33,4,'#dd6541','#9b442e');roundRect(-10,-12,20,25,2,'#ed7a4b');ctx.strokeStyle='#a1442c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-7,-8);ctx.lineTo(7,9);ctx.moveTo(7,-8);ctx.lineTo(-7,9);ctx.stroke();roundRect(6,-22,9,7,1,'#424b3e');polygon([[0,-10],[-7,1],[-1,1],[-3,10],[7,-2],[1,-2]],'#ffe3a0');
    }ctx.restore();
  }
}

function drawCar(){
  const c=game.car,x=sx(c.x),y=sy(c.y),paint=VEHICLE_PAINT[profile.vehicle]||VEHICLE_PAINT.buggy,vehicle=VEHICLES[profile.vehicle]||VEHICLES.buggy;
  const shadowGround=sy(terrain(c.x));const lift=clamp((c.y-terrain(c.x)-35)/180,0,1);ellipse(x+5,shadowGround+2,scale*59*(1-lift*.45),scale*7*(1-lift*.5),'#263d2638');
  ctx.save();ctx.translate(x,y);ctx.rotate(-c.angle);ctx.scale(scale,scale);
  // Working suspension and chassis are drawn in the car's local frame.
  ctx.lineCap='round';ctx.strokeStyle='#293c35';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(-40,12);ctx.lineTo(40,12);ctx.stroke();
  for(let k=0;k<2;k++){
    const wx=k===0?-vehicle.wheelBase/2:vehicle.wheelBase/2,compression=Math.min(game.compression[k]*.55,7);
    ctx.lineWidth=4;ctx.strokeStyle='#44534a';ctx.beginPath();ctx.moveTo(wx*.67,-3);ctx.lineTo(wx,18-compression);ctx.stroke();
    ctx.strokeStyle='#e4bb79';ctx.lineWidth=2.8;ctx.beginPath();ctx.moveTo(wx,-6);for(let j=0;j<5;j++)ctx.lineTo(wx+(j%2===0?4:-4),-2+j*(17-compression)/4);ctx.stroke();
  }
  // Caged vehicles share the cockpit. The bike gets its own open frame and rider.
  if(profile.vehicle==='bike'){
    const rear=-vehicle.wheelBase/2,front=vehicle.wheelBase/2;
    ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#343b36';ctx.lineWidth=4;
    ctx.beginPath();ctx.moveTo(rear,16);ctx.lineTo(-8,15);ctx.lineTo(9,-2);ctx.lineTo(front-8,16);ctx.lineTo(rear,16);ctx.moveTo(-8,15);ctx.lineTo(-17,-1);ctx.lineTo(9,-2);ctx.lineTo(2,16);ctx.stroke();
    ctx.strokeStyle=paint[0];ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(-11,12);ctx.lineTo(6,-3);ctx.lineTo(20,12);ctx.stroke();
    ctx.strokeStyle='#b9c3b5';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(front-8,16);ctx.lineTo(front-13,-16);ctx.lineTo(front-22,-25);ctx.moveTo(front-17,-22);ctx.lineTo(front-6,-25);ctx.moveTo(rear,16);ctx.lineTo(rear+4,-8);ctx.stroke();
    roundRect(-25,-14,19,7,3,'#2b3430');roundRect(-21,-11,20,11,4,paint[0]);ellipse(-13,-12,3,2,'#fff0b2');
    // Seated rider, jacket, arms, gloves, and helmet.
    polygon([[-12,-13],[-3,-27],[8,-24],[15,-12],[4,-7],[-7,-7]],'#344b46');
    ctx.strokeStyle='#d7c5a0';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(5,-22);ctx.lineTo(16,-25);ctx.lineTo(23,-21);ctx.stroke();ellipse(24,-21,3,2,'#303b35');
    ctx.strokeStyle='#33423c';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-5,-9);ctx.lineTo(2,1);ctx.moveTo(5,-9);ctx.lineTo(12,0);ctx.stroke();
    ellipse(-1,-34,9,9,'#ebede1');ellipse(-3,-35,7,5,'#dfe8dc');roundRect(2,-34,8,3,1,'#43534b');
    ctx.strokeStyle='#f7e9bb';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-12,-12);ctx.lineTo(-7,-15);ctx.moveTo(5,-1);ctx.lineTo(12,0);ctx.stroke();
  }else if(profile.vehicle==='pickup'){
    // The remaining vehicles use the shared roll cage and driver detail.
    roundRect(-44,-30,22,17,3,'#405749','#273a30');ctx.strokeStyle='#bcb58a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-39,-30);ctx.lineTo(-39,-13);ctx.moveTo(-29,-30);ctx.lineTo(-29,-13);ctx.stroke();
    ctx.strokeStyle='#263d37';ctx.lineWidth=5.5;ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(-28,-11);ctx.lineTo(-20,-41);ctx.lineTo(13,-41);ctx.lineTo(29,-11);ctx.stroke();
    polygon([[-18,-38],[10,-38],[23,-15],[-24,-15]],'#aacbc277');polygon([[11,-37],[21,-19],[13,-20],[2,-37]],'#d7e8d455');
    roundRect(-15,-15,12,18,3,'#294f43');polygon([[-15,-17],[-4,-17],[7,-5],[-11,0]],'#ece4ba');ctx.strokeStyle='#e1cba0';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-5,-14);ctx.lineTo(10,-12);ctx.stroke();ellipse(-9,-30,9,10,'#dca97b');ellipse(-10,-35,10,8,'#eae4cd');roundRect(-17,-34,16,5,2,'#edeee0');roundRect(-3,-33,6,5,1,'#334b3b');ctx.strokeStyle='#273d31';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(11,-7);ctx.lineTo(14,-15);ctx.stroke();
    polygon([[-60,-8],[-35,-12],[-28,-40],[2,-40],[12,-14],[51,-13],[60,2],[56,14],[-58,14]],paint[0],'#593e32');
    polygon([[-31,-37],[-1,-37],[8,-15],[-34,-15]],'#9bc8d0');polygon([[14,-11],[48,-10],[55,2],[12,3]],paint[1]);
    ctx.lineWidth=3;ctx.strokeStyle='#f2c07d';ctx.strokeRect(16,-10,30,11);roundRect(-58,-5,7,6,1,'#fff0b2');
  }else if(profile.vehicle==='quad'){
    polygon([[-43,-5],[-26,-15],[-12,-17],[0,-8],[18,-11],[36,-3],[45,7],[36,13],[-38,13]],paint[0],'#563d38');
    polygon([[-21,-14],[-8,-17],[4,-8],[-17,-6]],paint[1]);ctx.lineWidth=4;ctx.strokeStyle='#344842';ctx.beginPath();ctx.moveTo(12,-14);ctx.lineTo(20,-28);ctx.lineTo(28,-28);ctx.stroke();
  }else if(profile.vehicle==='crawler'){
    polygon([[-59,-13],[-50,-28],[-31,-32],[22,-32],[42,-27],[57,-12],[62,10],[52,15],[-54,15]],paint[0],'#362f43');
    polygon([[-28,-29],[20,-29],[33,-15],[-36,-15]],paint[1]);polygon([[-47,-13],[-25,-18],[-16,-7],[16,-7],[24,-18],[47,-13],[51,7],[-48,7]],paint[1]);
  }else{
    ctx.lineWidth=2.5;polygon([[-54,-10],[-27,-13],[-23,-1],[14,-1],[19,-17],[48,-14],[57,1],[53,14],[-54,14]],paint[0],'#874d2e');
    polygon([[-50,-8],[-29,-10],[-24,2],[13,2],[20,-13],[46,-11],[51,-4],[19,-4],[16,7],[-49,7]],paint[1]);
  }
  if(profile.vehicle!=='bike'){
    roundRect(-21,3,34,7,2,'#e99752');roundRect(-57,8,16,7,2,'#374940');roundRect(44,8,17,7,2,'#374940');
    roundRect(49,-9,7,7,2,'#ffe9ab');roundRect(-54,-5,5,6,1,'#b85136');ctx.strokeStyle='#8e5031';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(30,-8);ctx.lineTo(30,-3);ctx.moveTo(35,-8);ctx.lineTo(35,-3);ctx.moveTo(40,-8);ctx.lineTo(40,-3);ctx.stroke();
    ctx.fillStyle='#f6e8b7';ctx.font='bold 10px Arial';ctx.fillText('01',-8,10);
  }
  // The wheels rotate with distance and visibly respond to suspension load.
  for(let k=0;k<2;k++){
    const wx=k===0?-vehicle.wheelBase/2:vehicle.wheelBase/2,wy=17-Math.min(game.compression[k]*.55,7);
    ctx.save();ctx.translate(wx,wy);ctx.rotate(c.wheelSpin);
    ellipse(0,0,paint[2]+1,paint[2]+1,'#25382f');ctx.strokeStyle='#3d4c3c';ctx.lineWidth=3;for(let n=0;n<12;n++){const a=n*Math.PI/6;ctx.beginPath();ctx.moveTo(Math.cos(a)*(paint[2]-4),Math.sin(a)*(paint[2]-4));ctx.lineTo(Math.cos(a+.11)*paint[2],Math.sin(a+.11)*paint[2]);ctx.stroke();}
    ellipse(0,0,12.3,12.3,'#acb8a2');ellipse(0,0,9.2,9.2,'#64796a');ctx.lineWidth=3;ctx.strokeStyle='#c5cdb1';for(let n=0;n<5;n++){const a=n*Math.PI*2/5;ctx.beginPath();ctx.moveTo(Math.cos(a)*4,Math.sin(a)*4);ctx.lineTo(Math.cos(a)*9,Math.sin(a)*9);ctx.stroke();}ellipse(0,0,3.3,3.3,'#d6d8bb');ctx.restore();
  }
  ctx.restore();
}

function drawParticles(dt){
  for(const p of particles){if(game.state==='playing'){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy-=200*dt;}p.life-=dt;ctx.globalAlpha=Math.max(0,p.life/p.maxLife)*.75;ellipse(sx(p.x),sy(p.y),p.size*scale,p.size*scale,p.color);}ctx.globalAlpha=1;particles=particles.filter(p=>p.life>0);
}
function drawVignette(){const gradient=ctx.createLinearGradient(0,H*.75,0,H);gradient.addColorStop(0,'#12332600');gradient.addColorStop(1,'#15392e88');ctx.fillStyle=gradient;ctx.fillRect(0,H*.75,W,H*.25);}
function render(dt){ctx.setTransform(dpr,0,0,dpr,0,0);drawSky();drawScenery();drawTerrain();drawItems();drawParticles(dt);drawCar();drawVignette();}

function frame(now){
  const dt=Math.min((now-last)/1000||0,1/20);last=now;visualTime+=dt;
  if(game.state==='playing'){
    accumulator=Math.min(accumulator+dt,.12);const input=getInput();
    while(accumulator>=1/120){game.step(1/120,input);accumulator-=1/120;}
    handleEvents();
    autosaveElapsed+=dt;if(autosaveElapsed>=5){bankRunCoins();storeBest();saveProfile();autosaveElapsed%=5;}
    if(multiplayer.activeRace){multiplayer.syncElapsed+=dt;if(multiplayer.syncElapsed>=.65){multiplayer.syncElapsed=0;void sendRaceProgress();}}
    if(input.gas&&!profile.settings.reducedMotion&&particles.length<80&&game.grounded&&Math.abs(game.car.vx)>20&&visualTime-lastDust>.05){lastDust=visualTime;const p=game.point(-41,-25);particles.push({x:p.x,y:p.y,vx:-35-Math.random()*50,vy:12+Math.random()*35,life:.65,maxLife:.65,size:3+Math.random()*5,color:'#c3b27e'});}
  }
  const targetX=game.car.x-Math.max(130,W*.27/scale),targetY=game.car.y-37+clamp(game.car.vy*.07,-25,35);
  const shake=profile.settings.reducedMotion||cameraShake<=0?0:(Math.random()-.5)*cameraShake;cameraShake=Math.max(0,cameraShake-dt*28);cam.x+=(targetX+shake-cam.x)*(1-Math.exp(-dt*6));cam.y+=(targetY+shake*.4-cam.y)*(1-Math.exp(-dt*3));
  if(toastUntil&&visualTime>toastUntil){$('toast').classList.remove('visible');toastUntil=0;}
  render(dt);updateHUD();updateSound();requestAnimationFrame(frame);
}
resize();snapCamera();updateHUD();requestAnimationFrame(frame);

// Optional native browser tools operate the same visible game state.
const modelContext=document.modelContext;
if(modelContext?.registerTool){
  const lifecycle=new AbortController();
  const tools=[
    {name:'get_ridge_rush_run',title:'Read current run',description:'Read Ridge Rush distance, fuel, coins, and game state.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(input){if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('Expected an empty object.');return{...game.snapshot(),personalBest:best};}},
    {name:'control_ridge_rush_run',title:'Start, pause, or resume run',description:'Start a fresh Ridge Rush run (resets the current run), pause a playing run, or resume a paused run. Driving uses the game pedals or keyboard.',inputSchema:{type:'object',properties:{action:{type:'string',enum:['start','pause','resume']}},required:['action'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||typeof input!=='object'||Object.keys(input).some(k=>k!=='action')||!['start','pause','resume'].includes(input.action))throw new Error('Action must be start, pause, or resume.');if(input.action==='start')startRun();else if(input.action==='pause'){if(game.state!=='playing')throw new Error('The run is not playing.');pauseRun();}else{if(game.state!=='paused')throw new Error('The run is not paused.');resumeRun();}updateHUD();return game.snapshot();}}
  ];
  for(const tool of tools){try{Promise.resolve(modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
