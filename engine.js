// Compatibility runtime for the finite set of GM4 actions in this recovered game.
// See ../research/rules.txt for source offsets, semantics and fidelity limitations.
export const STAGES = [2,6,7,8,9,10,11];
const DIR = [225,270,315,180,null,0,135,90,45];
const color = n => `rgb(${n&255},${(n>>8)&255},${(n>>16)&255})`;

// Translate only the reviewed GML snippets shipped with Labirintos, never user input.
export function translateGML(source, expression=false) {
  let condition=expression, depth=0, awaiting=false;
  const tokens=source.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b|<>|==|!=|>=|<=|\+=|-=|&&|\|\||[^\s]|\s+/g)||[];
  return tokens.map(t=>{
    if(t.startsWith('//')||t.startsWith('/*'))return ' ';
    if(t==='if'){awaiting=true;return t;}
    if(t==='('){if(awaiting){condition=true;depth=1;awaiting=false;}else if(condition&&!expression)depth++;}
    if(t===')'&&condition&&!expression){if(--depth===0)condition=false;}
    if(t==='='&&condition)return '==';
    if(t==='<>')return '!=';
    if(/^0\d+$/.test(t))return String(Number(t));
    return t;
  }).join('');
}

export class Game {
  constructor(data, assets, {audio=null, random=Math.random, onChange=()=>{}, onMessage=()=>{}, onScores=()=>{}}={}) {
    this.data=data; this.assets=assets; this.audio=audio; this.random=random;
    this.onChange=onChange;this.onMessage=onMessage;this.onScores=onScores;
    this.sprites=new Map(assets.sprites.map(x=>[x.id,x]));
    this.backgrounds=new Map(assets.backgrounds.map(x=>[x.id,x]));
    this.functions=new Map();this.expressions=new Map();this.keys=new Set();this.global={};
    this.instances=[];this.score=0;this.lives=5;this.tick=0;this.roomId=1;this.nextId=200000;
    this.paused=false;this.pending=null;this.camera={x:0,y:0};this.font={name:'Times New Roman',size:14,color:0,style:0};
    this.resources={};
    for(const o of data.objects)if(o)this.resources[o.name]={object:o.index};
    for(const s of assets.sprites)this.resources[s.name]=s.id;
    for(const r of data.rooms)if(r)this.resources[r.name]=r.index;
    Object.assign(this.resources,{sound_click:17,sound_abertura:18,fs_bold:1,c_red:255,c_white:16777215});
  }
  get room(){return this.data.rooms[this.roomId];}
  get player(){return this.instances.find(x=>!x.dead&&(x.object===0||x.object===44));}
  list(id){return this.instances.filter(x=>!x.dead&&x.object===Number(id));}
  play(id,loop=false){if(!this.audio)return;const p=id>=6&&id<=13?this.audio.playMusic(id,{loop}):this.audio.playSound(id);p?.catch?.(()=>{});}
  fresh(){this.paused=false;this.score=0;this.lives=5;this.global={x1:0,pbonus:1,statc_equ:0,statc_err:0,coo:0,sbonus:0,magia:2};this.loadRoom(1);}
  start(){this.paused=false;this.score=0;this.lives=5;this.global={x1:0,pbonus:1,statc_equ:0,statc_err:0,coo:0,sbonus:0,magia:2};this.loadRoom(2);}
  make(object,x,y,id){
    const o=this.data.objects[object];if(!o)throw new Error(`Missing object ${object}`);
    return {id:id??this.nextId++,object,x,y,xstart:x,ystart:y,xprevious:x,yprevious:y,sprite_index:o.sprite,solid:!!o.solid,visible:!!o.visible,depth:o.depth,speed:0,direction:0,image_index:0,image_speed:1,alarms:{},dead:false};
  }
  spawn(id,x,y){const i=this.make(id,x,y);this.instances.push(i);this.event(i,0,0);return i;}
  loadRoom(id){
    if(!this.data.rooms[id])throw new Error(`Missing room ${id}`);
    this.pending=null;this.keys.clear();this.roomId=id;this.tick=0;this.camera={x:0,y:0};
    this.instances=this.room.instances.map(p=>this.make(p.object,p.x,p.y,p.id));
    this.audio?.stopMusic();
    for(const i of [...this.instances])if(!i.dead)this.event(i,0,0);
    if(this.room.code)this.execute(this.room.code,this.instances[0]||this.make(19,0,0));
    this.onChange(this);
  }
  requestRoom(id){this.pending=id;}
  nextRoom(delta=1){const order=this.data.room_order;this.requestRoom(order[Math.max(0,Math.min(order.length-1,order.indexOf(this.roomId)+delta))]);}
  applyPending(){if(this.pending===null)return;const p=this.pending;this.pending=null;if(p==='restart')this.fresh();else this.loadRoom(p);}
  objectProxy(id){const game=this;return new Proxy({}, {get(_,key){if(key===Symbol.toPrimitive)return ()=>id;return game.list(id)[0]?.[key]??0;},set(_,key,v){for(const i of game.list(id))i[key]=v;return true;}});}
  scope(i,other=null){
    const g=this;
    const f={round:Math.round,random:n=>g.random()*n,string:v=>String(typeof v==='number'?Math.round(v*100)/100:v),
      sound_play:id=>g.play(Number(id)),sound_loop:id=>g.play(Number(id),true),
      room_goto:id=>g.requestRoom(Number(id)),room_goto_next:()=>g.nextRoom(),
      highscore_clear:()=>g.onScores('clear'),highscore_add:()=>{},
      draw_text:(x,y,t)=>g.drawText(x,y,t),self:i,other,global:g.global,true:true,false:false};
    return new Proxy({}, {
      has(){return true;},
      get(_,key){
        if(key===Symbol.unscopables)return undefined;
        if(key in f)return f[key];
        if(key==='score'||key==='lives')return g[key];
        if(key==='room')return g.roomId;if(key==='room_caption')return g.room.caption;
        if(key==='font_name')return g.font.name;if(key==='font_size')return g.font.size;if(key==='font_style')return g.font.style;if(key==='font_color')return g.font.color;
        if(key in i)return i[key];
        if(key in g.resources){const v=g.resources[key];return typeof v==='object'?g.objectProxy(v.object):v;}
        if(key==='undefined')return undefined;
        return 0;
      },
      set(_,key,v){
        if(key==='score'||key==='lives')g[key]=v;
        else if(key==='font_name')g.font.name=v;else if(key==='font_size')g.font.size=v;else if(key==='font_style')g.font.style=v;else if(key==='font_color')g.font.color=v;
        else i[key]=v;return true;
      }
    });
  }
  evaluate(s,i,other){
    if(s===undefined||s==='')return 0;
    let fn=this.expressions.get(s);if(!fn){fn=new Function('scope',`with(scope){return (${translateGML(s,true)});}`);this.expressions.set(s,fn);}
    return fn(this.scope(i,other));
  }
  execute(code,i,other){let fn=this.functions.get(code);if(!fn){fn=new Function('scope',`with(scope){${translateGML(code)}}`);this.functions.set(code,fn);}fn(this.scope(i,other));}
  event(i,kind,id,other=null){const e=this.data.objects[i.object].events.find(e=>e.kind===kind&&e.event===id);if(e)this.actions(e.actions,i,other);}
  actions(actions,i,other){
    // A question governs the following action or balanced begin/end block.
    const statement=(p,run)=>{
      if(p>=actions.length)return p;
      const a=actions[p];
      if(a.id===32){p++;while(p<actions.length&&actions[p].id!==33)p=statement(p,run);return p+1;}
      if(a.id===26||a.id===30){
        let yes=false;
        if(run){yes=a.id===30?!!this.evaluate(a.args[0],i,other):this.list(this.evaluate(a.args[0],i,other)).length===this.evaluate(a.args[1],i,other);if(a.args[7]==='1')yes=!yes;}
        let end=statement(p+1,run&&yes);
        if(actions[end]?.id===31)end=statement(end+1,run&&!yes);
        return end;
      }
      if(run)this.action(a,i,other);return p+1;
    };
    let p=0;while(p<actions.length)p=statement(p,true);
  }
  action(a,self,other){
    const targets=a.target===-1?[self]:a.target===-2?(other?[other]:[]):this.list(a.target);
    for(const i of targets){
      const v=n=>this.evaluate(a.args[n],i,other), relative=!!a.relative;
      switch(a.id){
        case 1:{const dirs=[...a.args[0]].flatMap((c,k)=>c==='1'?[DIR[k]]:[]);const d=dirs[Math.floor(this.random()*dirs.length)];i.speed=d===null?0:v(1);if(d!==null)i.direction=d;break;}
        case 4:i.x=(relative?i.x:0)+v(0);i.y=(relative?i.y:0)+v(1);break;
        case 12:i.alarms[v(1)]=v(0);break;
        case 13:this.spawn(v(0),(relative?i.x:0)+v(1),(relative?i.y:0)+v(2));break;
        case 14:i.dead=true;break;
        case 15:{const object=v(0),events=v(1),o=this.data.objects[object];i.object=object;i.sprite_index=o.sprite;i.solid=!!o.solid;i.visible=!!o.visible;i.depth=o.depth;if(events)this.event(i,0,0);break;}
        case 17:this.play(v(0),!!v(1));break;
        case 19:this.score=(relative?this.score:0)+v(0);break;
        case 20:this.onScores('show',this.score);break;
        case 21:this.requestRoom(v(0));break;
        case 22:this.onMessage('O jogo fica por aqui. Até a próxima aventura!');this.paused=true;break;
        case 34:this.execute(a.args[0],i,other);break;
        case 35:this.execute(`${a.args[0]} ${relative?'+=':'='} (${a.args[1]});`,i,other);break;
        case 36:this.drawSprite(v(0),v(1)+(relative?i.x:0),v(2)+(relative?i.y:0),i.image_index);break;
        case 37:this.drawText(v(1)+(relative?i.x:0),v(2)+(relative?i.y:0),a.args[0]);break;
        case 38:this.font={name:a.args[0],size:v(1),color:v(2),style:v(3),italic:!!v(4)};break;
        case 39:if(this.audio?.currentMusic===v(0))this.audio.stopMusic();break;
        case 41:this.nextRoom(-1);break;
        case 42:this.nextRoom();break;
        case 50:{const x=v(0)+(relative?i.x:0),y=v(1)+(relative?i.y:0);i.direction=Math.atan2(i.y-y,x-i.x)*180/Math.PI;i.speed=v(2);break;}
        case 51:i.sprite_index=v(0);i.image_scale=v(1);break;
        case 52:this.lives=(relative?this.lives:0)+v(0);break;
        case 53:this.requestRoom(this.roomId);this.onMessage(this.lives<0?'Fim de jogo!':'Uma chance a menos. Vamos tentar de novo.');break;
        case 60:this.pending='restart';break;
        default:throw new Error(`Unsupported original action ${a.id}`);
      }
    }
  }
  frame(i){const s=this.sprites.get(i.sprite_index);return s?.frames[Math.floor(i.image_index)%s.frames.length];}
  bounds(i){const s=this.sprites.get(i.sprite_index);if(!s)return null;const f=this.frame(i);const b=f?.bounds;return {x:i.x+(b?.x??s.bbox_left),y:i.y+(b?.y??s.bbox_top),w:b?.w??(s.bbox_right-s.bbox_left+1),h:b?.h??(s.bbox_bottom-s.bbox_top+1)};}
  overlaps(a,b){
    const aa=this.bounds(a),bb=this.bounds(b);if(!aa||!bb)return false;
    const x=Math.ceil(Math.max(aa.x,bb.x)),y=Math.ceil(Math.max(aa.y,bb.y)),right=Math.min(aa.x+aa.w,bb.x+bb.w),bottom=Math.min(aa.y+aa.h,bb.y+bb.h);
    if(x>=right||y>=bottom)return false;
    const af=this.frame(a),bf=this.frame(b),as=this.sprites.get(a.sprite_index),bs=this.sprites.get(b.sprite_index);
    if(!af?.mask||!bf?.mask||(!as.precise_collision&&!bs.precise_collision))return true;
    for(let py=y;py<bottom;py++)for(let px=x;px<right;px++){
      if((!as.precise_collision||af.mask[Math.floor(py-a.y)*af.width+Math.floor(px-a.x)])&&(!bs.precise_collision||bf.mask[Math.floor(py-b.y)*bf.width+Math.floor(px-b.x)]))return true;
    }return false;
  }
  click(x,y){for(const i of [...this.instances].reverse()){const b=this.bounds(i);if(b&&x>=b.x&&y>=b.y&&x<b.x+b.w&&y<b.y+b.h)this.event(i,6,0);}this.applyPending();}
  step(){
    if(this.paused)return;
    this.tick++;
    let current=this.instances.filter(i=>!i.dead);
    for(const i of current){
      i.xprevious=i.x;i.yprevious=i.y;
      for(const alarm of Object.keys(i.alarms)){if(--i.alarms[alarm]===0){delete i.alarms[alarm];this.event(i,2,Number(alarm));}}
      if(this.keys.size){for(const k of this.keys)this.event(i,5,k);}else this.event(i,5,0);
      this.event(i,3,0);
      if(this.pending!==null){this.applyPending();return;}
    }
    for(const i of current){if(i.dead)continue;const rad=i.direction*Math.PI/180;i.x+=Math.cos(rad)*i.speed;i.y-=Math.sin(rad)*i.speed;}
    // Spatial broad phase retains instance order; precise alpha masks narrow contacts.
    const grid=new Map(),cell=48;
    for(const i of this.instances){if(i.dead)continue;const b=this.bounds(i);if(!b)continue;for(let y=Math.floor(b.y/cell);y<=Math.floor((b.y+b.h-1)/cell);y++)for(let x=Math.floor(b.x/cell);x<=Math.floor((b.x+b.w-1)/cell);x++){const key=`${x},${y}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(i);}}
    const seen=new Set();
    for(const a of current){
      if(a.dead)continue;const ba=this.bounds(a);if(!ba)continue;
      const candidates=new Set();for(let y=Math.floor(ba.y/cell);y<=Math.floor((ba.y+ba.h-1)/cell);y++)for(let x=Math.floor(ba.x/cell);x<=Math.floor((ba.x+ba.w-1)/cell);x++)for(const b of grid.get(`${x},${y}`)||[])candidates.add(b);
      for(const b of candidates){
        if(a===b||a.dead||b.dead)continue;
        const key=a.id<b.id?`${a.id}:${b.id}`:`${b.id}:${a.id}`;if(seen.has(key))continue;seen.add(key);
        const ae=this.data.objects[a.object].events.find(e=>e.kind===4&&e.event===b.object),be=this.data.objects[b.object].events.find(e=>e.kind===4&&e.event===a.object);
        if((!ae&&!be)||!this.overlaps(a,b))continue;
        if(b.solid&&ae){a.x=a.xprevious;a.y=a.yprevious;}
        if(a.solid&&be){b.x=b.xprevious;b.y=b.yprevious;}
        if(ae)this.actions(ae.actions,a,b);if(be)this.actions(be.actions,b,a);
        if(this.pending!==null){this.applyPending();return;}
      }
    }
    for(const i of current){
      if(i.dead)continue;const b=this.bounds(i);
      if(b&&(b.x+b.w<0||b.y+b.h<0||b.x>this.room.width||b.y>this.room.height))this.event(i,7,0);
      else if(b&&(b.x<0||b.y<0||b.x+b.w>this.room.width||b.y+b.h>this.room.height))this.event(i,7,1);
      i.image_index+=i.image_speed;
      if((i.object===26||i.object===27)&&i.image_index>70)i.dead=true;
      if(this.pending!==null){this.applyPending();return;}
    }
    this.instances=this.instances.filter(i=>!i.dead);
    const view=this.room.views[0];
    if(this.room.views_enabled&&view?.visible){const target=this.list(view.follow)[0];if(target){this.camera.y=Math.max(0,Math.min(this.room.height-view.height,Math.max(target.y-(view.height-view.border_y),Math.min(this.camera.y,target.y-view.border_y))));this.camera.x=0;}}
    this.onChange(this);
  }
  drawSprite(id,x,y,frame=0){const s=this.sprites.get(id),f=s?.frames[Math.floor(frame)%s.frames.length];if(f?.image&&this.ctx)this.ctx.drawImage(f.image,Math.round(x),Math.round(y));}
  drawText(x,y,text){if(!this.ctx)return;const c=this.ctx;c.fillStyle=color(this.font.color);c.font=`${this.font.italic?'italic ':''}${this.font.style?'bold ':''}${this.font.size}px "${this.font.name}", serif`;c.textBaseline='top';String(text).split('#').forEach((t,n)=>c.fillText(t,Math.round(x),Math.round(y)+n*this.font.size*1.2));}
  render(ctx){
    this.ctx=ctx;const room=this.room,view=room.views[0];const w=room.views_enabled?view.width:room.width,h=room.views_enabled?view.height:room.height;
    if(ctx.canvas.width!==w||ctx.canvas.height!==h){ctx.canvas.width=w;ctx.canvas.height=h;}
    ctx.imageSmoothingEnabled=false;ctx.fillStyle=color(room.color);ctx.fillRect(0,0,w,h);ctx.save();ctx.translate(-Math.round(this.camera.x),-Math.round(this.camera.y));
    const drawBG=foreground=>{for(const bg of room.backgrounds){if(!bg.visible||!!bg.foreground!==foreground)continue;const b=this.backgrounds.get(bg.background);const img=b?.image;if(!img)continue;const x0=bg.tile_x?Math.floor((this.camera.x-bg.x)/b.width)*b.width+bg.x:bg.x,y0=bg.tile_y?Math.floor((this.camera.y-bg.y)/b.height)*b.height+bg.y:bg.y;for(let y=y0;y<(bg.tile_y?this.camera.y+h:y0+1);y+=b.height)for(let x=x0;x<(bg.tile_x?this.camera.x+w:x0+1);x+=b.width)ctx.drawImage(img,x,y);}};
    drawBG(false);
    for(const tile of room.tiles){if(tile.y+tile.height<this.camera.y||tile.y>this.camera.y+h)continue;const b=this.backgrounds.get(tile.background);if(b?.image)ctx.drawImage(b.image,tile.source_x,tile.source_y,tile.width,tile.height,tile.x,tile.y,tile.width,tile.height);}
    const instances=this.instances.filter(i=>!i.dead&&i.visible).sort((a,b)=>b.depth-a.depth);
    for(const i of instances){const draw=this.data.objects[i.object].events.find(e=>e.kind===8&&e.event===0);if(draw)this.actions(draw.actions,i,null);else if(i.y+100>=this.camera.y&&i.y<=this.camera.y+h)this.drawSprite(i.sprite_index,i.x,i.y,i.image_index);}
    drawBG(true);ctx.restore();this.ctx=null;
  }
  snapshot(){return {room:this.roomId,caption:this.room.caption,score:this.score,lives:this.lives,global:{...this.global},camera:{...this.camera},player:this.player?{x:this.player.x,y:this.player.y}:null,instances:this.instances.filter(i=>!i.dead).map(i=>({id:i.id,object:i.object,x:i.x,y:i.y,sprite:i.sprite_index}))};}
}
