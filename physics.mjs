export const START_X = 180;
export const WHEEL_RADIUS = 20;
export const WHEEL_BASE = 78;
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export function terrain(x) {
  const ramp = clamp((x - 290) / 740, 0, 1);
  const ease = ramp * ramp * (3 - 2 * ramp);
  const difficulty = 1 + Math.min(Math.max(x - 2700, 0) / 16000, 1.05);
  const bumps = clamp((x - 1400) / 2100, 0, 1) * (Math.sin((x - 1400) / 66) * 30 + Math.sin((x - 1500) / 41) * 7);
  return 40 + ease * (Math.sin((x - 270) / 265) * 83 + Math.sin((x - 290) / 107) * 23 + Math.sin((x - 300) / 680) * 92 + bumps) * difficulty;
}
export function slope(x) { return (terrain(x + 1) - terrain(x - 1)) / 2; }

export class GamePhysics {
  constructor() { this.reset(); }
  reset() {
    this.car = {x:START_X,y:terrain(START_X)+37,vx:0,vy:0,angle:0,omega:0,wheelSpin:0};
    this.state = 'ready'; this.fuel = 100; this.coins = 0; this.distance = 0; this.maxX = START_X;
    this.time = 0; this.grounded = true; this.airtime = 0; this.totalAir = 0; this.crashTime = 0; this.emptyTime = 0;
    this.items = []; this.itemCursor = 0; this.events = []; this.nextMilestone = 500; this.reason = '';
    this.contacts = [false,false]; this.compression = [0,0]; this.flipStart = 0; this.generateItems();
  }
  start() { this.reset(); this.state = 'playing'; }
  pause() { if(this.state === 'playing') this.state = 'paused'; }
  resume() { if(this.state === 'paused') this.state = 'playing'; }
  end(reason) { if(this.state !== 'playing') return; this.state = 'over'; this.reason = reason; this.events.push({type:'over',reason}); }
  point(lx,ly) { const c=Math.cos(this.car.angle),s=Math.sin(this.car.angle);return {x:this.car.x+lx*c-ly*s,y:this.car.y+lx*s+ly*c}; }
  generateItems() {
    while(this.itemCursor*620 < this.car.x+2600) {
      const group=this.itemCursor++;
      const begin=560+group*620;
      for(let j=0;j<5;j++) {const x=begin+j*52;this.items.push({id:'c'+group+'-'+j,type:'coin',x,y:terrain(x)+58+Math.sin(j*Math.PI/4)*20,taken:false});}
      if(group%3===2) {const x=begin+350;this.items.push({id:'f'+group,type:'fuel',x,y:terrain(x)+44,taken:false});}
    }
    this.items=this.items.filter(i=>i.x>this.car.x-1800);
  }
  step(dt,input={gas:false,brake:false}) {
    if(this.state!=='playing') return;
    dt=clamp(dt,0,1/60);this.time+=dt;
    const c=this.car, cos=Math.cos(c.angle),sin=Math.sin(c.angle);
    let fx=-c.vx*.09,fy=-650-c.vy*.06,torque=-c.omega*140;
    let grounded=false;
    const gas=input.gas&&this.fuel>0?1:0,brake=input.brake?1:0;
    for(let k=0;k<2;k++) {
      const lx=k===0?-WHEEL_BASE/2:WHEEL_BASE/2, ly=-17;
      const rx=lx*cos-ly*sin,ry=lx*sin+ly*cos;
      const wx=c.x+rx,wy=c.y+ry;
      const s=slope(wx),normalLength=Math.sqrt(1+s*s),nx=-s/normalLength,ny=1/normalLength,tx=ny,ty=-nx;
      const penetration=(terrain(wx)-wy)/normalLength+WHEEL_RADIUS;
      const pvx=c.vx-c.omega*ry,pvy=c.vy+c.omega*rx;
      this.contacts[k]=penetration>-.8;this.compression[k]=Math.max(0,penetration);
      if(penetration>0) {
        grounded=true;
        const vn=pvx*nx+pvy*ny,vt=pvx*tx+pvy*ty;
        const force=clamp(penetration*215-vn*16,0,6000);
        const engine=gas*420*Math.max(.12,1-Math.max(0,vt)/550);
        const braking=brake*(vt>10?620:vt < -125?0:175);
        let traction=engine-braking-vt*.37;
        if(brake&&gas) traction=-vt*5;
        traction=clamp(traction,-force*1.6,force*1.6);
        const ax=nx*force+tx*traction,ay=ny*force+ty*traction;
        fx+=ax;fy+=ay;torque+=rx*ay-ry*ax;
      }
    }
    if(!grounded){torque+=(gas-brake)*2800;torque-=c.omega*480;this.airtime+=dt;if(this.airtime<dt*1.1)this.flipStart=c.angle;}
    else {
      if(this.airtime>.65){const bonus=Math.min(30,Math.floor(this.airtime*10));this.coins+=bonus;this.events.push({type:'air',amount:bonus,seconds:this.airtime});}
      if(this.airtime>.35&&Math.abs(c.angle-this.flipStart)>5.5){this.coins+=100;this.events.push({type:'flip',amount:100});}
      this.totalAir+=this.airtime;this.airtime=0;
    }
    this.grounded=grounded;
    c.vx+=fx*dt;c.vy+=fy*dt;c.omega+=torque/1550*dt;c.omega=clamp(c.omega,-6,6);
    c.x+=c.vx*dt;c.y+=c.vy*dt;c.angle+=c.omega*dt;c.wheelSpin+=c.vx*dt/WHEEL_RADIUS;
    if(c.x<65){c.x=65;c.vx=Math.max(0,c.vx);}
    if(c.y<terrain(c.x)-140){this.end('A rough landing');return;}
    const head=this.point(-8,35),roof=this.point(16,25);
    if(head.y<terrain(head.x)+8||roof.y<terrain(roof.x)+5){this.crashTime+=dt;}else this.crashTime=0;
    if(this.crashTime>.10){this.end('Watch your head!');return;}
    this.maxX=Math.max(this.maxX,c.x);this.distance=Math.max(0,Math.floor((this.maxX-START_X)/6));
    this.fuel=Math.max(0,this.fuel-dt*(gas?3.3:1.3));
    if(this.fuel===0){this.emptyTime+=dt;if(Math.abs(c.vx)<15||this.emptyTime>4)this.end('Out of fuel');}
    for(const item of this.items) {
      if(item.taken||Math.abs(item.x-c.x)>78) continue;
      if(Math.hypot(item.x-c.x,item.y-(c.y+3))<(item.type==='coin'?66:72)) {
        item.taken=true;
        if(item.type==='coin'){this.coins+=5;this.events.push({type:'coin',x:item.x,y:item.y});}
        else {this.fuel=Math.min(100,this.fuel+48);this.events.push({type:'fuel',x:item.x,y:item.y});}
      }
    }
    if(this.distance>=this.nextMilestone){this.events.push({type:'milestone',distance:this.nextMilestone});this.nextMilestone+=500;}
    this.generateItems();
  }
  drainEvents() {const events=this.events;this.events=[];return events;}
  snapshot() {return {state:this.state,distance:this.distance,coins:this.coins,fuel:Math.ceil(this.fuel),speed:Math.round(Math.abs(this.car.vx)*.06),grounded:this.grounded,reason:this.reason};}
}
