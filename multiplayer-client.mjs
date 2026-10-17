async function request(url,options={}) {
  let response;
  try {
    response=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})},cache:'no-store'});
  } catch {
    throw new Error('Could not reach the multiplayer server. Check your connection and try again.');
  }
  let data={};
  try{data=await response.json();}catch{}
  if(!response.ok)throw new Error(data.error||`Multiplayer request failed (${response.status}).`);
  return data;
}

const post=(url,body)=>request(url,{method:'POST',body:JSON.stringify(body)});

export function createRoom(name,environment) {
  return post('/api/rooms',{name,environment});
}

export function joinRoom(code,name) {
  return post(`/api/rooms/${encodeURIComponent(code)}/join`,{name});
}

export function readRoom(code,token) {
  return request(`/api/rooms/${encodeURIComponent(code)}?token=${encodeURIComponent(token)}`);
}

export function updateRoom(code,token,action,details={}) {
  return post(`/api/rooms/${encodeURIComponent(code)}`,{token,action,...details});
}
