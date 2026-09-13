import {GamePhysics,terrain,slope,hash,clamp,WHEEL_BASE,WHEEL_RADIUS,START_X} from './physics.mjs';

const $=id=>document.getElementById(id);
const canvas=$('gameCanvas'),ctx=canvas.getContext('2d');
const game=new GamePhysics();
const dom={distance:$('distance'),coins:$('coins'),best:$('best'),fuel:$('fuelValue'),fill:$('fuelFill'),fuelBar:$('fuelBar'),status:$('runStatus'),milestone:$('milestoneText'),milestoneFill:$('milestoneFill'),overlay:$('overlay'),card:$('overlayCard'),title:$('overlayTitle'),description:$('overlayDescription'),eyebrow:$('overlayEyebrow'),play:$('playButton'),secondary:$('secondaryButton'),pause:$('pauseButton'),hint:$('startHint'),results:$('runResults'),shell:$('gameShell')};
let W=1200,H=650,dpr=1,scale=1,cam={x:0,y:40},last=0,accumulator=0,visualTime=0,toastUntil=0,particles=[],floating=[],lastDust=0,lowFuelWarned=false,runBest=0;
const keys=new Set(),pointers={gas:new Set(),brake:new Set()};
let best=0,soundEnabled=false,previousState='ready';
try{best=Math.max(0,Number(localStorage.getItem('ridge-rush-best'))||0);soundEnabled=localStorage.getItem('ridge-rush-sound')==='true';}catch{}
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
  try{const osc=audio.createOscillator(),gain=audio.createGain();osc.type=type;osc.frequency.setValueAtTime(frequency,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(frequency*1.25,audio.currentTime+duration);gain.gain.setValueAtTime(volume,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration);}catch{}
}
function updateSound(){if(!audio||!engineGain)return;const active=game.state==='playing'&&soundEnabled&&game.fuel>0;engineGain.gain.setTargetAtTime(active?(getInput().gas?.042:.018):0,audio.currentTime,.10);engineOsc.frequency.setTargetAtTime(35+Math.abs(game.car.vx)*.15+(getInput().gas?10:0),audio.currentTime,.08);}
function syncSoundButton(){$('soundButton').setAttribute('aria-pressed',String(soundEnabled));$('soundButton').setAttribute('aria-label',soundEnabled?'Turn sound off':'Turn sound on');$('soundButton').title=soundEnabled?'Turn sound off':'Turn sound on';}
syncSoundButton();
$('soundButton').addEventListener('click',()=>{soundEnabled=!soundEnabled;try{localStorage.setItem('ridge-rush-sound',String(soundEnabled));}catch{}initAudio();syncSoundButton();updateSound();});

function resize(){const r=canvas.getBoundingClientRect();W=r.width;H=r.height;dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);scale=W<650?.70:clamp(H/590,.67,1.45);if(game.state==='ready')snapCamera();}
new ResizeObserver(resize).observe(canvas);
function snapCamera(){cam.x=game.car.x-Math.max(130,W*.27/scale);cam.y=game.car.y-37;}
function sx(x){return(x-cam.x)*scale;}
function sy(y){return H*.67-(y-cam.y)*scale;}
function clearControls(){keys.clear();pointers.gas.clear();pointers.brake.clear();$('gasPedal').classList.remove('pressed');$('brakePedal').classList.remove('pressed');}
function getInput(){return{gas:keys.has('ArrowRight')||keys.has('KeyD')||pointers.gas.size>0,brake:keys.has('ArrowLeft')||keys.has('KeyA')||pointers.brake.size>0};}
function startRun(){clearControls();game.start();runBest=best;particles=[];floating=[];toastUntil=0;$('toast').classList.remove('visible');lastDust=0;lowFuelWarned=false;accumulator=0;snapCamera();initAudio();syncOverlay();updateHUD();canvas.focus({preventScroll:true});}
function pauseRun(){game.pause();clearControls();syncOverlay();updateSound();}
function resumeRun(){game.resume();clearControls();accumulator=0;initAudio();syncOverlay();canvas.focus({preventScroll:true});}
function togglePause(){if(game.state==='playing')pauseRun();else if(game.state==='paused')resumeRun();}
function storeBest(){if(game.distance>best){best=game.distance;dom.best.textContent=best;try{localStorage.setItem('ridge-rush-best',String(best));}catch{}}}
function syncOverlay(){
  const playing=game.state==='playing',paused=game.state==='paused',over=game.state==='over';
  dom.overlay.classList.toggle('hidden',playing);dom.overlay.classList.toggle('is-modal',paused||over);dom.shell.classList.toggle('running',playing);
  dom.pause.disabled=!playing&&!paused;dom.pause.setAttribute('aria-label',paused?'Resume game':'Pause game');dom.pause.title=paused?'Resume (P)':'Pause (P)';dom.pause.firstElementChild.textContent=paused?'▷':'Ⅱ';
  dom.results.hidden=!over;dom.secondary.hidden=!paused;dom.hint.hidden=paused;
  if(paused){dom.eyebrow.textContent='TAKE A BREATHER';dom.title.textContent='ENJOY THE VIEW.';dom.description.textContent='Your trail will be right here.';dom.play.innerHTML='KEEP RIDING <span aria-hidden="true">↗</span>';}
  else if(over){storeBest();dom.eyebrow.textContent=game.distance>runBest?'A NEW PERSONAL BEST':'THERE’S ALWAYS ANOTHER HILL';dom.title.textContent=game.reason==='Out of fuel'?'EMPTY TANK.':'ROUGH LANDING.';dom.description.textContent=game.reason==='Out of fuel'?'Grab the red fuel cans to keep the adventure going.':'Ease off at the crest. Use the pedals in the air to land on your wheels.';dom.play.innerHTML='RIDE AGAIN <span aria-hidden="true">↗</span>';$('resultDistance').textContent=game.distance+' m';$('resultCoins').textContent=game.coins;dom.hint.innerHTML='or press <kbd>ENTER</kbd>';}
  if(!playing)dom.play.focus({preventScroll:true});
}
dom.play.addEventListener('click',()=>game.state==='paused'?resumeRun():startRun());dom.secondary.addEventListener('click',startRun);dom.pause.addEventListener('click',togglePause);

for(const [name,id] of [['gas','gasPedal'],['brake','brakePedal']]){
  const el=$(id);
  el.addEventListener('pointerdown',e=>{e.preventDefault();if(game.state!=='playing')return;el.setPointerCapture(e.pointerId);pointers[name].add(e.pointerId);el.classList.add('pressed');initAudio();});
  const release=e=>{pointers[name].delete(e.pointerId);el.classList.toggle('pressed',pointers[name].size>0);};
  el.addEventListener('pointerup',release);el.addEventListener('pointercancel',release);el.addEventListener('lostpointercapture',release);el.addEventListener('contextmenu',e=>e.preventDefault());
}
document.addEventListener('keydown',e=>{
  if($('helpDialog').open)return;
  if(['ArrowLeft','ArrowRight','KeyA','KeyD','KeyP','KeyR','Space','Enter','Escape'].includes(e.code)){
    if(e.target instanceof HTMLButtonElement&&(e.code==='Space'||e.code==='Enter'))return;
    e.preventDefault();
    if(['ArrowLeft','ArrowRight','KeyA','KeyD'].includes(e.code)&&game.state==='playing')keys.add(e.code);
    if(e.repeat)return;
    if(e.code==='KeyP'||e.code==='Escape')togglePause();
    if(e.code==='KeyR')startRun();
    if(e.code==='Enter'||e.code==='Space'){if(game.state==='ready'||game.state==='over')startRun();else togglePause();}
  }
});
document.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{clearControls();if(game.state==='playing')pauseRun();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&game.state==='playing')pauseRun();});
window.addEventListener('pagehide',storeBest);
let helpReturn=null;
$('helpButton').addEventListener('click',()=>{helpReturn=document.activeElement;if(game.state==='playing')pauseRun();$('helpDialog').showModal();});
$('closeHelp').addEventListener('click',()=>$('helpDialog').close());$('helpDone').addEventListener('click',()=>$('helpDialog').close());$('helpDialog').addEventListener('close',()=>helpReturn?.focus());
document.addEventListener('keydown',e=>{if(e.key!=='Tab'||dom.overlay.classList.contains('hidden')||$('helpDialog').open)return;const focusables=[dom.play,...(dom.secondary.hidden?[]:[dom.secondary])];if(e.shiftKey&&document.activeElement===focusables[0]){e.preventDefault();focusables.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===focusables.at(-1)){e.preventDefault();focusables[0].focus();}});
$('fullscreenButton').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(dom.shell.requestFullscreen)await dom.shell.requestFullscreen();else{dom.shell.classList.toggle('expanded');syncFullscreen();}}catch{dom.shell.classList.toggle('expanded');syncFullscreen();}});
function syncFullscreen(){const full=!!document.fullscreenElement||dom.shell.classList.contains('expanded');$('fullscreenButton').setAttribute('aria-label',full?'Exit fullscreen':'Enter fullscreen');$('fullscreenButton').title=full?'Exit fullscreen':'Fullscreen';resize();}
document.addEventListener('fullscreenchange',syncFullscreen);

function toast(text,seconds=2){$('toast').textContent=text;$('toast').classList.add('visible');toastUntil=visualTime+seconds;}
function burst(x,y,color,count=9){for(let i=0;i<count;i++)particles.push({x,y,vx:(Math.random()-.5)*150,vy:40+Math.random()*145,life:.55+Math.random()*.4,maxLife:.95,size:2+Math.random()*3,color});}
function handleEvents(){for(const e of game.drainEvents()){
  if(e.type==='coin'){burst(e.x,e.y,'#f9d867',5);beep(700+game.coins%25*15,.07);}
  else if(e.type==='fuel'){burst(e.x,e.y,'#f18e58',15);toast('REFUELED  +48%');beep(450,.18);lowFuelWarned=false;}
  else if(e.type==='air'){toast('AIR TIME  +'+e.amount+' COINS');beep(880,.13);}
  else if(e.type==='flip'){toast('FULL FLIP!  +100 COINS');beep(1100,.23);}
  else if(e.type==='milestone'){toast(e.distance.toLocaleString()+' m  ·  KEEP ON CLIMBING',2.5);beep(660,.2);storeBest();}
  else if(e.type==='over'){clearControls();beep(100,.5,'triangle',.09);burst(game.car.x,game.car.y,'#baac80',18);syncOverlay();}
}}
function updateHUD(){
  const s=game.snapshot();dom.distance.textContent=s.distance.toLocaleString();dom.coins.textContent=s.coins.toLocaleString();dom.fuel.textContent=s.fuel+'%';dom.fill.style.width=game.fuel+'%';dom.fuelBar.setAttribute('aria-valuenow',String(s.fuel));dom.fuelBar.classList.toggle('low',s.fuel<=22);dom.milestoneFill.style.width=((s.distance%500)/5)+'%';dom.milestone.textContent='NEXT MILESTONE · '+game.nextMilestone.toLocaleString()+' m';
  dom.status.textContent=game.state==='ready'?'YOUR NEXT ADVENTURE STARTS HERE':game.state==='paused'?'JUST TAKING IN THE VIEW':game.state==='over'?'THE TRAIL IS CALLING':!game.grounded&&game.airtime>.2?'A LITTLE HANG TIME':s.speed+' KM/H  ·  KEEP IT ROLLING';
  if(s.fuel<=22&&!lowFuelWarned&&game.state==='playing'){toast('LOW FUEL · LOOK FOR A RED CAN',2.5);lowFuelWarned=true;}
  const input=getInput();$('gasPedal').classList.toggle('pressed',game.state==='playing'&&input.gas);$('brakePedal').classList.toggle('pressed',game.state==='playing'&&input.brake);
}

function roundRect(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
function polygon(points,fill,stroke){ctx.beginPath();for(let i=0;i<points.length;i++)i?ctx.lineTo(...points[i]):ctx.moveTo(...points[i]);ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
function ellipse(x,y,rx,ry,fill){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();}
function drawPine(x,y,size,color,light){ctx.fillStyle=color;ctx.fillRect(x-size*.027,y-size*.18,size*.055,size*.2);polygon([[x,y-size],[x-size*.2,y-size*.57],[x-size*.105,y-size*.6],[x-size*.29,y-size*.28],[x-size*.16,y-size*.33],[x-size*.36,y-size*.06],[x+size*.36,y-size*.06],[x+size*.17,y-size*.33],[x+size*.28,y-size*.28],[x+size*.11,y-size*.6],[x+size*.2,y-size*.57]],color);if(light)polygon([[x,y-size],[x-size*.20,y-size*.57],[x-size*.105,y-size*.6],[x-size*.29,y-size*.28],[x-size*.16,y-size*.33],[x-size*.36,y-size*.06],[x,y-size*.11]],light);}

function drawSky(){
  const sky=ctx.createLinearGradient(0,0,0,H*.8);sky.addColorStop(0,'#b8dcd4');sky.addColorStop(.6,'#dee7c6');sky.addColorStop(1,'#eef0c7');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
  const sunX=W*.78-cam.x*.017%70,sunY=H*.235;
  ellipse(sunX,sunY,59,59,'#f3ecc742');ellipse(sunX,sunY,44,44,'#fff3c7bb');ellipse(sunX,sunY,32,32,'#fff5d1');
  for(let i=0;i<5;i++){
    const span=W+430;const x=((i*317+70-cam.x*.035+visualTime*1.5)%span+span)%span-150,y=H*(.17+hash(i+23)*.2),s=.55+hash(i+41)*.7;
    ctx.globalAlpha=.30;ellipse(x,y,60*s,12*s,'#f9f8e6');ellipse(x+17*s,y-8*s,29*s,17*s,'#f9f8e6');ellipse(x-18*s,y-5*s,22*s,14*s,'#f9f8e6');ctx.globalAlpha=1;
  }
  mountainLayer(.10,H*.57,190,'#8fb7aa','#b1cfc0',91);
  mountainLayer(.20,H*.70,165,'#6f9e8b','#92b4a1',40);
  drawFoothills();
  if(W>600){ctx.strokeStyle='#517d7166';ctx.lineWidth=1.4;const x=((W*.57-cam.x*.05)%(W+100)+W+100)%(W+100);const y=H*.2;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(x+i*15-5,y+i*7);ctx.quadraticCurveTo(x+i*15-2,y+i*7-4,x+i*15,y+i*7);ctx.quadraticCurveTo(x+i*15+2,y+i*7-4,x+i*15+5,y+i*7);ctx.stroke();}}
}
function mountainLayer(parallax,base,amplitude,color,light,seed){
  const stretch=W<650?.8:1.1,unit=260*stretch,start=Math.floor((cam.x*parallax)/unit)-2,end=start+Math.ceil(W/unit)+5,offset=cam.x*parallax;
  const points=[[-300,H]];
  const peaks=[];
  for(let i=start;i<=end;i++){const x=i*unit-offset;const y=base-(.4+hash(i+seed)*.65)*amplitude*(H/650);points.push([x,y+amplitude*.32],[x+unit*.47,y],[x+unit*.82,y+amplitude*.42]);peaks.push({x:x+unit*.47,y,unit});}
  points.push([W+400,H]);polygon(points,color);
  for(const p of peaks){polygon([[p.x,p.y],[p.x+p.unit*.35,p.y+amplitude*.42],[p.x+p.unit*.06,p.y+amplitude*.35],[p.x-p.unit*.1,p.y+amplitude*.20]],light);if(parallax===.10)polygon([[p.x,p.y],[p.x+p.unit*.13,p.y+amplitude*.155],[p.x+p.unit*.025,p.y+amplitude*.13],[p.x-p.unit*.06,p.y+amplitude*.17],[p.x-p.unit*.18,p.y+amplitude*.20]],'#d9e4c9');}
}
function drawFoothills(){
  const offset=cam.x*.37;
  function ridge(x){return H*.72+Math.sin((x+offset)/240)*H*.055+Math.sin((x+offset)/110)*H*.025;}
  const p=[[-20,H]];for(let x=-20;x<W+30;x+=12)p.push([x,ridge(x)]);p.push([W+30,H]);polygon(p,'#578775');
  const first=Math.floor(offset/54)-2;
  for(let i=first;i<first+W/54+5;i++){const x=i*54-offset+hash(i)*22;drawPine(x,ridge(x)+12,30+hash(i+55)*58,'#578775');}
  const offset2=cam.x*.58;
  const p2=[[-20,H]];for(let x=-20;x<W+30;x+=14)p2.push([x,H*.82+Math.sin((x+offset2)/290)*H*.075]);p2.push([W+30,H]);polygon(p2,'#477760');
}

function drawScenery(){
  const start=Math.floor((cam.x-180)/175),end=Math.ceil((cam.x+W/scale+150)/175);
  for(let i=start;i<=end;i++){
    const x=i*175+hash(i+12)*80;if(x<350)continue;
    const y=terrain(x),screenX=sx(x),screenY=sy(y);
    if(hash(i+62)>.36){drawPine(screenX,screenY+3,scale*(64+hash(i+51)*70),'#345e41','#4f7850');if(hash(i)>.63)drawPine(screenX+30*scale,screenY+5,scale*(44+hash(i+41)*48),'#426b43','#62864f');}
    else {ctx.save();ctx.translate(screenX,screenY);ctx.scale(scale,scale);ctx.lineWidth=3;ctx.strokeStyle='#6c7250';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-3,-36);ctx.moveTo(-3,-19);ctx.lineTo(-15,-31);ctx.stroke();ellipse(-6,-45,17,25,'#85a455');ellipse(6,-47,12,20,'#a1b961');ellipse(-16,-35,12,16,'#91ac58');ctx.restore();}
  }
  if(cam.x<400){drawSign(78,'GO EXPLORE',false);drawSign(420,'EASY DOES IT',true);}
  const from=Math.max(1,Math.floor(cam.x/3000));for(let i=from;i<=Math.ceil((cam.x+W/scale)/3000);i++)drawSign(START_X+i*3000,i*500+' m',false);
}
function drawSign(x,label,small){const px=sx(x),py=sy(terrain(x));if(px<-120||px>W+120)return;ctx.save();ctx.translate(px,py);ctx.scale(scale,scale);ctx.fillStyle='#816e48';ctx.fillRect(-3,-62,6,65);roundRect(-43,-82,94,27,3,'#e1d49b','#957d50');ctx.fillStyle='#466044';ctx.textAlign='center';ctx.font='bold '+(small?'9':'10')+'px Arial';ctx.fillText(label,4,-65);ctx.restore();}

function groundPath(depth=0){ctx.beginPath();ctx.moveTo(-20,H+40);for(let x=-20;x<=W+24;x+=7)ctx.lineTo(x,sy(terrain(cam.x+x/scale))+depth*scale);ctx.lineTo(W+24,H+40);ctx.closePath();}
function drawTerrain(){
  groundPath();const soil=ctx.createLinearGradient(0,H*.55,0,H);soil.addColorStop(0,'#9a8556');soil.addColorStop(1,'#665f3d');ctx.fillStyle=soil;ctx.fill();
  ctx.save();groundPath(17);ctx.clip();
  ctx.strokeStyle='#b2a16e2e';ctx.lineWidth=3;for(let layer=0;layer<5;layer++){ctx.beginPath();for(let x=-10;x<W+20;x+=12){const world=cam.x+x/scale,y=sy(terrain(world))+scale*(48+layer*40+Math.sin(world/130+layer)*10);x===-10?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();}
  const first=Math.floor(cam.x/40);for(let i=first;i<first+W/scale/40+4;i++){const x=i*40+hash(i+6)*20;for(let j=0;j<5;j++){const y=terrain(x)-38-j*45-hash(i+j*13)*24;ellipse(sx(x),sy(y),scale*(2+hash(i+j)*4),scale*(1.5+hash(i+j+8)*2),'#d4c18d25');}}
  ctx.restore();
  ctx.beginPath();for(let x=-20;x<W+25;x+=6){const y=sy(terrain(cam.x+x/scale))+7*scale;x===-20?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.lineWidth=20*scale;ctx.lineCap='round';ctx.strokeStyle='#577d41';ctx.stroke();
  ctx.beginPath();for(let x=-20;x<W+25;x+=6){const y=sy(terrain(cam.x+x/scale))-1*scale;x===-20?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.lineWidth=5*scale;ctx.strokeStyle='#adc36b';ctx.stroke();
  const firstGrass=Math.floor(cam.x/16);ctx.strokeStyle='#88a653';ctx.lineWidth=1.5*scale;
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
  const c=game.car,x=sx(c.x),y=sy(c.y);
  const shadowGround=sy(terrain(c.x));const lift=clamp((c.y-terrain(c.x)-35)/180,0,1);ellipse(x+5,shadowGround+2,scale*59*(1-lift*.45),scale*7*(1-lift*.5),'#263d2638');
  ctx.save();ctx.translate(x,y);ctx.rotate(-c.angle);ctx.scale(scale,scale);
  // Working suspension and chassis are drawn in the car's local frame.
  ctx.lineCap='round';ctx.strokeStyle='#293c35';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(-40,12);ctx.lineTo(40,12);ctx.stroke();
  for(let k=0;k<2;k++){
    const wx=k===0?-WHEEL_BASE/2:WHEEL_BASE/2,compression=Math.min(game.compression[k]*.55,7);
    ctx.lineWidth=4;ctx.strokeStyle='#44534a';ctx.beginPath();ctx.moveTo(wx*.67,-3);ctx.lineTo(wx,18-compression);ctx.stroke();
    ctx.strokeStyle='#e4bb79';ctx.lineWidth=2.8;ctx.beginPath();ctx.moveTo(wx,-6);for(let j=0;j<5;j++)ctx.lineTo(wx+(j%2===0?4:-4),-2+j*(17-compression)/4);ctx.stroke();
  }
  // Roll cage, rear cargo and a bright orange buggy body.
  roundRect(-44,-30,22,17,3,'#405749','#273a30');ctx.strokeStyle='#bcb58a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-39,-30);ctx.lineTo(-39,-13);ctx.moveTo(-29,-30);ctx.lineTo(-29,-13);ctx.stroke();
  ctx.strokeStyle='#263d37';ctx.lineWidth=5.5;ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(-28,-11);ctx.lineTo(-20,-41);ctx.lineTo(13,-41);ctx.lineTo(29,-11);ctx.stroke();
  polygon([[-18,-38],[10,-38],[23,-15],[-24,-15]],'#aacbc277');polygon([[11,-37],[21,-19],[13,-20],[2,-37]],'#d7e8d455');
  // Driver with helmet, hands on the wheel.
  roundRect(-15,-15,12,18,3,'#294f43');polygon([[-15,-17],[-4,-17],[7,-5],[-11,0]],'#ece4ba');ctx.strokeStyle='#e1cba0';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-5,-14);ctx.lineTo(10,-12);ctx.stroke();ellipse(-9,-30,9,10,'#dca97b');ellipse(-10,-35,10,8,'#eae4cd');roundRect(-17,-34,16,5,2,'#edeee0');roundRect(-3,-33,6,5,1,'#334b3b');ctx.strokeStyle='#273d31';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(11,-7);ctx.lineTo(14,-15);ctx.stroke();
  ctx.lineWidth=2.5;polygon([[-54,-10],[-27,-13],[-23,-1],[14,-1],[19,-17],[48,-14],[57,1],[53,14],[-54,14]],'#ee8646','#874d2e');
  polygon([[-50,-8],[-29,-10],[-24,2],[13,2],[20,-13],[46,-11],[51,-4],[19,-4],[16,7],[-49,7]],'#f9a15b');
  roundRect(-21,3,34,7,2,'#e99752');roundRect(-57,8,16,7,2,'#374940');roundRect(44,8,17,7,2,'#374940');
  roundRect(49,-9,7,7,2,'#ffe9ab');roundRect(-54,-5,5,6,1,'#b85136');ctx.strokeStyle='#8e5031';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(30,-8);ctx.lineTo(30,-3);ctx.moveTo(35,-8);ctx.lineTo(35,-3);ctx.moveTo(40,-8);ctx.lineTo(40,-3);ctx.stroke();
  ctx.fillStyle='#f6e8b7';ctx.font='bold 10px Arial';ctx.fillText('01',-8,10);
  // The wheels rotate with distance and visibly respond to suspension load.
  for(let k=0;k<2;k++){
    const wx=k===0?-WHEEL_BASE/2:WHEEL_BASE/2,wy=17-Math.min(game.compression[k]*.55,7);
    ctx.save();ctx.translate(wx,wy);ctx.rotate(c.wheelSpin);
    ellipse(0,0,WHEEL_RADIUS+1,WHEEL_RADIUS+1,'#25382f');ctx.strokeStyle='#3d4c3c';ctx.lineWidth=3;for(let n=0;n<12;n++){const a=n*Math.PI/6;ctx.beginPath();ctx.moveTo(Math.cos(a)*16,Math.sin(a)*16);ctx.lineTo(Math.cos(a+.11)*20,Math.sin(a+.11)*20);ctx.stroke();}
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
    if(input.gas&&game.grounded&&Math.abs(game.car.vx)>20&&visualTime-lastDust>.05){lastDust=visualTime;const p=game.point(-41,-25);particles.push({x:p.x,y:p.y,vx:-35-Math.random()*50,vy:12+Math.random()*35,life:.65,maxLife:.65,size:3+Math.random()*5,color:'#c3b27e'});}
  }
  const targetX=game.car.x-Math.max(130,W*.27/scale),targetY=game.car.y-37+clamp(game.car.vy*.07,-25,35);
  cam.x+=(targetX-cam.x)*(1-Math.exp(-dt*6));cam.y+=(targetY-cam.y)*(1-Math.exp(-dt*3));
  if(toastUntil&&visualTime>toastUntil){$('toast').classList.remove('visible');toastUntil=0;}
  render(dt);updateHUD();updateSound();previousState=game.state;requestAnimationFrame(frame);
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
