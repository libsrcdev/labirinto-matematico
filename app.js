import {Game} from './engine.js';
import {GameAudio} from './audio.js';
import {readOptions,prepareGameData} from './hacks.js';
import {GameClock} from './timing.js';

const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
const audio=new GameAudio();
const options=readOptions(location.search);
let game,loadError='',loading=true,scoresOpen=false,ended=false,backgroundPaused=false,lastRoom;
let runId=Date.now();
const heldKeys=new Set(),pressedKeys=new Set();
audio.setVolume(.55);

function readScores(){
  try {const rows=JSON.parse(localStorage.getItem('labirintos-scores-v1')||'[]');return Array.isArray(rows)?rows.filter(s=>Number.isFinite(s.score)).slice(0,10):[];}catch{return [];}
}
function saveScore(){
  if(!game||game.score<=0)return;
  const rows=readScores();
  if(rows.some(s=>s.run===runId&&s.score>=game.score))return;
  rows.splice(0,rows.length,...rows.filter(s=>s.run!==runId),{score:game.score,run:runId});
  rows.sort((a,b)=>b.score-a.score);
  try{localStorage.setItem('labirintos-scores-v1',JSON.stringify(rows.slice(0,10)));}catch{}
}
function changed(){
  if(game.roomId===1&&lastRoom!==1)runId=Date.now();
  if(game.roomId===13&&lastRoom!==13)saveScore();
  lastRoom=game.roomId;
  document.title=game.room.caption||'Os Labirintos da Matemática';
}
function fail(error){console.error(error);loadError='Não foi possível carregar o jogo. Recarregue a página.';loading=false;}
function unlock(){audio.unlock().catch(()=>{});}
function fitCanvas(){
  const scale=Math.min(innerWidth/canvas.width,innerHeight/canvas.height);
  canvas.style.width=`${Math.floor(canvas.width*scale)}px`;
  canvas.style.height=`${Math.floor(canvas.height*scale)}px`;
}
function panel(lines){
  const w=canvas.width,h=canvas.height;
  ctx.save();ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font=`${Math.max(12,Math.floor(w/32))}px "Times New Roman",serif`;
  lines.forEach((line,i)=>ctx.fillText(line,w/2,h/2+(i-(lines.length-1)/2)*h/16,w-24));
  ctx.restore();
}

// Deliver the original virtual-key codes to the recovered game events.
const keyMap={ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,' ':32,Enter:13,Escape:27,F1:112,Home:36,End:35,Delete:46,s:83,S:83};
document.addEventListener('keydown',e=>{
  if(!game)return;
  const key=keyMap[e.key];
  if(key===undefined&&e.code!=='KeyP')return;
  e.preventDefault();unlock();
  if(scoresOpen){if(!e.repeat&&[13,27,32].includes(key))scoresOpen=false;return;}
  if(ended){if(key===13&&!e.repeat){ended=false;game.fresh();}return;}
  if(e.code==='KeyP'){if(!e.repeat){game.paused=!game.paused;clearKeys();}return;}
  if(!game.paused){heldKeys.add(key);pressedKeys.add(key);game.keys.add(key);}
});
document.addEventListener('keyup',e=>{const key=keyMap[e.key];if(key!==undefined){heldKeys.delete(key);if(!pressedKeys.has(key))game?.keys.delete(key);}});
function clearKeys(){heldKeys.clear();pressedKeys.clear();game?.keys.clear();}
window.addEventListener('blur',()=>{clearKeys();backgroundPaused=true;});
window.addEventListener('focus',()=>{backgroundPaused=false;});
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearKeys();});
canvas.addEventListener('pointerdown',e=>{
  unlock();canvas.focus({preventScroll:true});
  if(!game||loading||loadError||game.paused||ended)return;
  if(scoresOpen){scoresOpen=false;return;}
  const r=canvas.getBoundingClientRect();
  game.click((e.clientX-r.left)*canvas.width/r.width+game.camera.x,(e.clientY-r.top)*canvas.height/r.height+game.camera.y);
});
window.addEventListener('resize',fitCanvas);

async function loadImage(path){const i=new Image();i.src=path;await i.decode();return i;}
async function init(){
  const responses=await Promise.all([fetch('game-data.json'),fetch('assets/manifest.json')]);for(const r of responses)if(!r.ok)throw new Error('Os arquivos do jogo não foram encontrados');
  const [originalData,assets]=await Promise.all(responses.map(r=>r.json()));
  const data=prepareGameData(originalData,options);
  await Promise.all(assets.sprites.flatMap(s=>s.frames.map(async f=>{f.image=await loadImage(f.path);const c=document.createElement('canvas');c.width=f.width;c.height=f.height;const cx=c.getContext('2d',{willReadFrequently:true});cx.drawImage(f.image,0,0);const pixels=cx.getImageData(0,0,c.width,c.height).data;f.mask=new Uint8Array(f.width*f.height);let x0=f.width,y0=f.height,x1=-1,y1=-1;for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++){const p=y*f.width+x;f.mask[p]=pixels[p*4+3]>0?1:0;if(f.mask[p]){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}}if(s.bbox_mode===0&&x1>=0)f.bounds={x:x0,y:y0,w:x1-x0+1,h:y1-y0+1};})));
  await Promise.all(assets.backgrounds.map(async b=>{b.image=await loadImage(b.image.path);}));
  game=new Game(data,assets,{audio,onChange:changed,onMessage:message=>{
    if(message.startsWith('O jogo fica por aqui')){ended=true;audio.stopMusic();}
  },onScores:action=>{
    if(action==='clear'){try{localStorage.removeItem('labirintos-scores-v1');}catch{}}
    else{saveScore();scoresOpen=true;game.keys.clear();}
  }});
  game.fresh();game.loadRoom(data.room_order[0]);loading=false;
  canvas.focus({preventScroll:true});
  if(new URLSearchParams(location.search).has('debug'))window.__labirintos={game,audio,assets,options,start:()=>game.start(),snapshot:()=>game.snapshot()};
}
let previous=performance.now();
const clock=new GameClock(options.speed);
function frame(now){
  try{
    const elapsed=Math.min((now-previous)/1000,.15);previous=now;
    if(game&&!loadError){
      if(!game.paused&&!scoresOpen&&!backgroundPaused&&!document.hidden){
        clock.advance(elapsed,{get room(){return game.room;},step(){
          for(const key of pressedKeys)game.keys.add(key);
          game.step();pressedKeys.clear();
          for(const key of game.keys)if(!heldKeys.has(key))game.keys.delete(key);
          return !scoresOpen&&!game.paused;
        }});
      }else clock.reset();
      game.render(ctx);
      if(scoresOpen)panel(['Recordes','',...readScores().map((s,i)=>`${i+1}.     ${s.score}`),'','Enter — voltar']);
      else if(ended)panel(['Fim','Enter — reiniciar']);
      else if(game.paused)panel(['Pausa','P — continuar']);
    }
    if(loading)panel(['Carregando…']);
    if(loadError)panel([loadError]);
    fitCanvas();
  }catch(error){fail(error);}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
init().catch(fail);
