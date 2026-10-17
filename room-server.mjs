import { randomBytes } from 'node:crypto';

const rooms = new Map();
const ROOM_TTL = 45 * 60 * 1000;
const ONLINE_WINDOW = 12_000;
const MAX_BODY = 8_192;

function json(response, status, body) {
  response.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  response.end(JSON.stringify(body));
}

function cleanName(value) {
  const name = String(value || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 18);
  return name || 'Rider';
}

function newPlayer(name) {
  return {token:randomBytes(24).toString('base64url'),name:cleanName(name),ready:false,onlineAt:Date.now(),distance:0,speed:0,x:180,y:0,finished:false,finishDistance:null};
}

function publicRoom(room, token) {
  const now=Date.now();
  return {
    code:room.code,state:room.state,hostIndex:room.hostIndex,startAt:room.startAt,serverTime:now,environment:room.environment,
    players:room.players.map(p=>p?{name:p.name,ready:p.ready,online:now-p.onlineAt<ONLINE_WINDOW,distance:p.distance,speed:p.speed,x:p.x,y:p.y,finished:p.finished,finishDistance:p.finishDistance}:null),
    youIndex:room.players.findIndex(p=>p?.token===token),
  };
}

async function readBody(request) {
  let body='';
  for await (const chunk of request) {
    body+=chunk;
    if(body.length>MAX_BODY)throw Object.assign(new Error('Request is too large.'),{status:413});
  }
  if(!body)return {};
  try{return JSON.parse(body);}catch{throw Object.assign(new Error('Invalid JSON.'),{status:400});}
}

function cleanupRooms() {
  const now=Date.now();
  for(const [code,room] of rooms)if(now-room.updatedAt>ROOM_TTL)rooms.delete(code);
}
const cleanupTimer=setInterval(cleanupRooms,60_000);
cleanupTimer.unref?.();

export async function handleMultiplayerApi(request,response) {
  const url=new URL(request.url,'http://localhost');
  if(url.pathname==='/api/health'&&request.method==='GET'){
    json(response,200,{ok:true,service:'ridge-rush'});return true;
  }
  if(url.pathname==='/api/rooms'&&request.method==='POST'){
    try{
      const body=await readBody(request),player=newPlayer(body.name),environment=Math.max(-1,Math.min(7,Math.floor(Number(body.environment)||0)));
      let code;
      for(let attempt=0;attempt<40;attempt++){code=String(randomBytes(4).readUInt32BE(0)%1_000_000).padStart(6,'0');if(!rooms.has(code))break;code=null;}
      if(!code){json(response,503,{error:'Could not create a room. Try again.'});return true;}
      const room={code,state:'lobby',hostIndex:0,startAt:null,environment,players:[player,null],updatedAt:Date.now()};
      rooms.set(code,room);json(response,201,{...publicRoom(room,player.token),token:player.token});
    }catch(error){json(response,error.status||400,{error:error.message||'Could not create room.'});}
    return true;
  }
  const joinMatch=url.pathname.match(/^\/api\/rooms\/([0-9]{6})\/join$/);
  if(joinMatch&&request.method==='POST'){
    try{
      const body=await readBody(request),room=rooms.get(joinMatch[1]);
      if(!room){json(response,404,{error:'Room not found. Check the code or ask for a new one.'});return true;}
      if(room.state!=='lobby'){json(response,409,{error:'That race has already started.'});return true;}
      const index=room.players.findIndex(p=>!p);
      if(index<0){json(response,409,{error:'That room already has two riders.'});return true;}
      const player=newPlayer(body.name);room.players[index]=player;room.updatedAt=Date.now();
      json(response,201,{...publicRoom(room,player.token),token:player.token});
    }catch(error){json(response,error.status||400,{error:error.message||'Could not join room.'});}
    return true;
  }
  const roomMatch=url.pathname.match(/^\/api\/rooms\/([0-9]{6})$/);
  if(!roomMatch)return false;
  const room=rooms.get(roomMatch[1]);
  if(!room){json(response,404,{error:'Room not found. It may have expired.'});return true;}
  let body={};
  if(request.method==='POST'){
    try{body=await readBody(request);}catch(error){json(response,error.status||400,{error:error.message||'Invalid request.'});return true;}
  }
  const token=url.searchParams.get('token')||request.headers['x-room-token']||body.token;
  const playerIndex=room.players.findIndex(p=>p?.token===token);
  if(playerIndex<0){json(response,403,{error:'This device is not in that room.'});return true;}
  const player=room.players[playerIndex];player.onlineAt=Date.now();room.updatedAt=Date.now();
  if(request.method==='GET'){
    if(room.state==='countdown'&&Date.now()>=room.startAt)room.state='playing';
    json(response,200,publicRoom(room,token));return true;
  }
  if(request.method!=='POST'){json(response,405,{error:'Method not allowed.'});return true;}
  try{
    if(body.action==='ready'){
      if(room.state!=='lobby'){json(response,409,{error:'The room is not waiting for riders.'});return true;}
      player.ready=!!body.ready;
    }else if(body.action==='start'){
      if(playerIndex!==room.hostIndex){json(response,403,{error:'Only the room host can start the race.'});return true;}
      if(room.state!=='lobby'||room.players.some(p=>!p)||room.players.some(p=>!p.ready)){json(response,409,{error:'Both riders must join and be ready first.'});return true;}
      room.state='countdown';room.startAt=Date.now()+4_000;
      for(const p of room.players)Object.assign(p,{distance:0,speed:0,x:180,y:0,finished:false,finishDistance:null});
    }else if(body.action==='update'){
      if(room.state!=='countdown'&&room.state!=='playing'){json(response,409,{error:'The race is not running.'});return true;}
      player.distance=Math.max(0,Math.min(1_000_000,Math.floor(Number(body.distance)||0)));
      player.speed=Math.max(0,Math.min(5_000,Math.floor(Number(body.speed)||0)));
      player.x=Math.max(0,Math.min(10_000_000,Number(body.x)||0));
      player.y=Math.max(-100_000,Math.min(100_000,Number(body.y)||0));
    }else if(body.action==='finish'){
      if(room.state!=='playing'){json(response,409,{error:'The race has not started.'});return true;}
      player.finished=true;player.finishDistance=Math.max(0,Math.min(1_000_000,Math.floor(Number(body.distance)||0)));player.distance=player.finishDistance;
      if(room.players.every(p=>p?.finished))room.state='finished';
    }else if(body.action==='rematch'){
      if(playerIndex!==room.hostIndex){json(response,403,{error:'Only the room host can request a rematch.'});return true;}
      if(room.state!=='finished'){json(response,409,{error:'Both riders must finish before a rematch.'});return true;}
      room.state='lobby';room.startAt=null;
      for(const p of room.players)if(p)Object.assign(p,{ready:false,distance:0,speed:0,x:180,y:0,finished:false,finishDistance:null});
    }else if(body.action==='leave'){
      room.players[playerIndex]=null;
      if(playerIndex===room.hostIndex){const replacement=room.players.findIndex(Boolean);room.hostIndex=replacement<0?0:replacement;}
      if(room.players.every(p=>!p))rooms.delete(room.code);
      else if(room.state==='countdown'||room.state==='playing')room.state='abandoned';
    }else{json(response,400,{error:'Unknown room action.'});return true;}
    room.updatedAt=Date.now();
    json(response,200,publicRoom(room,token));
  }catch(error){json(response,error.status||400,{error:error.message||'Could not update room.'});}
  return true;
}
