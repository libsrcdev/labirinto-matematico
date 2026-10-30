import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {Game, STAGES, translateGML} from '../engine.js';

const data=JSON.parse(readFileSync(new URL('../game-data.json',import.meta.url)));
const assets=JSON.parse(readFileSync(new URL('../assets/manifest.json',import.meta.url)));

// Decode the real exported PNG alpha, independently of the browser image loader.
// These generated preservation PNGs use RGBA8 and filter 0 on each scanline.
for(const sprite of assets.sprites)for(const frame of sprite.frames){
  const png=readFileSync(new URL('../'+frame.path,import.meta.url));
  const parts=[];let offset=8;
  assert.equal(png[24],8);assert.equal(png[25],6);
  while(offset<png.length){const size=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8);if(type==='IDAT')parts.push(png.subarray(offset+8,offset+8+size));offset+=12+size;}
  const rows=inflateSync(Buffer.concat(parts));
  frame.mask=new Uint8Array(frame.width*frame.height);
  let minX=frame.width,minY=frame.height,maxX=-1,maxY=-1;
  for(let y=0;y<frame.height;y++){
    const start=y*(frame.width*4+1);assert.equal(rows[start],0);
    for(let x=0;x<frame.width;x++)if(rows[start+1+x*4+3]){
      frame.mask[y*frame.width+x]=1;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    }
  }
  frame.bounds={x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1};
}

function makeGame(random=()=>.5){
  const calls=[],messages=[],scores=[];
  const audio={playMusic:(...a)=>calls.push(['music',...a]),playSound:(...a)=>calls.push(['sound',...a]),stopMusic:()=>calls.push(['stop'])};
  const game=new Game(data,assets,{random,audio,onMessage:m=>messages.push(m),onScores:(...a)=>scores.push(a)});
  return {game,calls,messages,scores};
}
function scene(actors,random){
  const fixture=makeGame(random);const g=fixture.game;
  g.roomId=2;g.global={x1:5,pbonus:1,statc_equ:0,statc_err:0,coo:0,sbonus:0,magia:2};
  g.instances=actors.map(([id,x,y])=>g.make(id,x,y));return fixture;
}
const action=(id,args=[],target=-1,relative=0)=>({id,target,relative,args:[...args.map(String),...Array(8).fill('0')].slice(0,8)});

test('all shipped GML compiles; conditional equality does not turn assignments into comparisons',()=>{
  for(const object of data.objects.filter(Boolean))for(const event of object.events)for(const a of event.actions){
    if(a.id===34)new Function('scope',`with(scope){${translateGML(a.args[0])}}`);
    if(a.id===30)new Function('scope',`with(scope){return (${translateGML(a.args[0],true)})}`);
  }
  const {game:g}=scene([[0,100,100]]),hero=g.player;
  g.execute("global.x1 = 4; if (global.x1 = 4) { score += 10; } if (global.x1 <> 4) { score = -99; }",hero);
  assert.equal(g.global.x1,4);assert.equal(g.score,10);
  assert.equal(g.evaluate("room_caption <> 'Fase 7'",hero),true);
  assert.equal(g.evaluate('global.x1 = 4',hero),true);
});

test('fresh start preserves all seven original levels and gives five lives/two magic charges',()=>{
  const {game:g,calls}=makeGame();g.start();
  assert.deepEqual(STAGES,[2,6,7,8,9,10,11]);assert.equal(g.roomId,2);
  assert.equal(g.lives,5);assert.equal(g.score,0);assert.equal(g.global.magia,2);
  assert.equal(g.global.x1,5);assert.equal(g.global.equac,'6x=30');
  assert.deepEqual([g.player.x,g.player.y],[144,24]);
  assert.ok(calls.some(([kind,id,options])=>kind==='music'&&id===10&&options.loop));
  for(const id of STAGES){g.loadRoom(id);assert.ok(g.player);assert.equal(g.list(9).length,1);assert.equal(g.list(15).length,1);}
});

test('correct gate gives +10, teleports hero down40, becomes a wall and rerolls all surviving answers',()=>{
  const {game:g}=makeGame();g.start();
  const hero=g.player,gate=g.list(10)[0],controller=g.list(9)[0],before=hero.y,wrong=g.list(13);
  const oldSprites=wrong.map(x=>x.sprite_index);g.random=()=>.2;
  g.event(gate,4,0,hero);
  assert.equal(g.score,10);assert.equal(g.global.statc_equ,1);assert.equal(g.lives,5);
  assert.equal(hero.y,before+40);assert.equal(gate.object,20);assert.equal(gate.solid,true);
  assert.equal(controller.dead,true);assert.equal(g.list(9).length,1);assert.equal(g.list(26).length,1);
  assert.equal(g.global.x1,2);assert.equal(g.global.equac,'3x=6');
  assert.equal(g.list(13).length,wrong.length);assert.ok(wrong.every((x,i)=>x.sprite_index!==oldSprites[i]));
  assert.ok(g.list(10).every(x=>x.sprite_index===g.resources.dois));
});

test('wrong gate subtracts5 without a lost life and replaces itself with a wall',()=>{
  const {game:g}=makeGame();g.start();g.score=20;
  const hero=g.player,gate=g.list(13)[0],before=hero.y,position=[gate.x,gate.y];
  g.event(gate,4,0,hero);
  assert.equal(g.score,15);assert.equal(g.global.statc_err,1);assert.equal(g.global.statc_equ,0);
  assert.equal(g.lives,5);assert.equal(hero.y,before+40);assert.equal(gate.dead,true);
  assert.ok(g.list(20).some(x=>x.x===position[0]&&x.y===position[1]));
  assert.equal(g.list(9).length,1);assert.equal(g.list(27).length,1);
});

test('held arrow motion is8px/step; release stops; real sprite contact with a wall reverts motion',()=>{
  const {game:g}=scene([[0,100,100],[5,100,100]]);const hero=g.player;
  g.keys.add(39);g.step();assert.equal(hero.x,108);assert.equal(hero.y,100);
  g.keys.clear();g.step();assert.equal(hero.x,108);assert.equal(hero.sprite_index,35);assert.equal(hero.speed,0);
  const wall=g.make(2,132,100);g.instances.push(wall);g.keys.add(39);
  g.step();assert.equal(hero.x,108);assert.equal(hero.speed,0);assert.equal(g.overlaps(hero,wall),false);
});

test('camera anchor constrains progress and falling behind loses one life then restarts the same maze',()=>{
  let {game:g}=scene([[0,100,140],[5,100,100]]);g.keys.add(40);g.step();
  assert.equal(g.player.y,140);assert.equal(g.player.speed,0);
  ({game:g}=scene([[0,100,100],[5,100,291]]));g.score=37;g.global.statc_equ=4;g.step();
  assert.equal(g.roomId,2);assert.equal(g.lives,4);assert.equal(g.score,37);assert.equal(g.global.statc_equ,4);
  assert.deepEqual([g.player.x,g.player.y],[144,24]);assert.equal(g.global.magia,2);
});

test('hazard hit restarts room, retains score, and game over occurs below zero lives',()=>{
  const {game:g,scores}=makeGame();g.start();g.score=22;
  for(let hit=0;hit<6;hit++){
    const hero=g.player;g.event(hero,4,3,g.make(3,hero.x,hero.y));g.applyPending();
    assert.equal(g.lives,4-hit);assert.equal(g.score,22);assert.equal(g.roomId,2);
  }
  g.step();assert.equal(g.roomId,1);assert.equal(g.score,0);assert.equal(g.lives,5);
  assert.ok(scores.some(([type,score])=>type==='show'&&score===22));
});

test('space consumes one charge, prevents concurrent projectiles, and destroys a destructible wall',()=>{
  const {game:g}=scene([[0,100,100],[5,100,100],[2,100,132]]);
  const hero=g.player,wall=g.list(2)[0];g.keys.add(32);g.step();
  assert.equal(g.global.magia,1);assert.equal(g.list(21).length,1);
  g.event(hero,5,32);assert.equal(g.global.magia,1);assert.equal(g.list(21).length,1);
  g.keys.clear();for(let i=0;i<10&&!wall.dead;i++)g.step();
  assert.equal(wall.dead,true);assert.equal(g.list(21).length,0);
  g.global.magia=0;g.event(hero,5,32);assert.equal(g.list(21).length,0);
});

test('magic passes through killed spiders; ghost and indestructible walls absorb it and survive',()=>{
  for(const [target,shouldDie,projectileDies] of [[3,true,false],[29,false,true],[32,false,true],[33,false,true]]){
    const {game:g}=scene([[21,100,100],[target,100,100]]);
    const projectile=g.list(21)[0],obstacle=g.list(target)[0];g.step();
    assert.equal(projectile.dead,projectileDies,`projectile against object${target}`);
    assert.equal(obstacle.dead,shouldDie,`object${target} survival`);
  }
});

test('pickup contact adds two magic and coordination count exactly once',()=>{
  const {game:g}=scene([[0,100,100],[5,100,100],[22,100,100]]);const pickup=g.list(22)[0];
  g.step();assert.equal(g.global.magia,4);assert.equal(g.global.coo,1);assert.equal(pickup.dead,true);
  g.step();assert.equal(g.global.magia,4);assert.equal(g.global.coo,1);
});

test('original exit gates advance through all seven stages and finish in results, skipping bonus room',()=>{
  const {game:g,scores}=makeGame();g.start();
  for(let n=0;n<STAGES.length;n++){
    assert.equal(g.roomId,STAGES[n]);g.event(g.list(15)[0],4,0,g.player);g.applyPending();
    assert.equal(g.roomId,n===6?13:STAGES[n+1]);
  }
  assert.ok(scores.some(([kind])=>kind==='show'));assert.equal(g.global.pbonos,1);
});

test('bonus entry records maze; correct catch adds1/new equation; wrong catch returns without life loss',()=>{
  const {game:g}=makeGame();g.start();g.score=50;g.lives=3;
  g.event(g.list(46)[0],4,0,g.player);g.applyPending();
  assert.equal(g.roomId,12);assert.equal(g.global.guarda_fase,2);assert.equal(g.global.pbonus,0);
  assert.equal(g.player.object,44);assert.equal(g.global.bonus_x,5);
  const correct=g.list(34)[0];g.event(correct,4,44,g.player);
  assert.equal(g.score,51);assert.equal(g.global.sbonus,1);assert.equal(correct.dead,true);
  const wrong=g.list(35)[0];g.event(wrong,4,44,g.player);g.applyPending();
  assert.equal(g.roomId,2);assert.equal(g.score,51);assert.equal(g.lives,3);
  assert.equal(g.list(46).length,0);assert.equal(g.global.sbonus,1);
});

test('nested questions, NOT, else, and count-of-projectiles execute only their guarded actions',()=>{
  const {game:g}=scene([[0,100,100]]),hero=g.player;
  const conditional=(condition,then,otherwise,not=false)=>[
    action(30,[condition,0,0,0,0,0,0,not?1:0]),action(32),...then,action(33),
    action(31),action(32),...otherwise,action(33)
  ];
  const add=n=>action(19,[n],-1,1);
  g.actions(conditional('global.magia = 2',[add(10)],[add(-100)]),hero);assert.equal(g.score,10);
  g.actions(conditional('global.magia = 2',[add(-100)],[add(2)],true),hero);assert.equal(g.score,12);
  g.actions(conditional('1',[...conditional('0',[add(-100)],[add(3)])],[add(-100)]),hero);assert.equal(g.score,15);
  g.actions([action(26,[21,0,0]),add(5)],hero);assert.equal(g.score,20);
  g.spawn(21,0,0);g.actions([action(26,[21,0,0]),add(-100)],hero);assert.equal(g.score,20);
});

test('alarms expire on the specified step; original logo advances after40 steps',()=>{
  const {game:g}=makeGame();g.loadRoom(14);
  for(let n=0;n<39;n++)g.step();assert.equal(g.roomId,14);
  g.step();assert.equal(g.roomId,1);
});

test('zero and negative coefficients preserve original equation semantics across difficulty levels',()=>{
  for(let level=1;level<=7;level++){
    const {game:g}=makeGame(()=>0);g.start();g.loadRoom(STAGES[level-1]);
    assert.equal(g.global.x1,0);
    const offset=level===1?0:-5*(level-1);
    assert.equal(g.global.equac,offset===0?'1x=0':`1x${offset}=${offset}`);
    assert.ok(g.list(10).every(x=>x.sprite_index===g.resources.zero));
  }
});

test('original menu tween, F1 instructions, Back and Enter route through recovered room order',()=>{
  const {game:g}=makeGame();g.fresh();
  const button=g.list(51)[0],x=button.x;assert.equal(x,700);
  g.step();assert.equal(button.x,x-(x-button.xstart)/5);
  g.event(button,5,112);g.applyPending();assert.equal(g.roomId,15);
  g.event(g.list(54)[0],6,0);g.applyPending();assert.equal(g.roomId,1);
  g.event(g.list(51)[0],5,13);g.applyPending();assert.equal(g.roomId,2);assert.equal(g.lives,5);
});

test('action targets apply to all named instances or collision-other without changing unrelated objects',()=>{
  const {game:g}=scene([[0,100,100],[2,0,0],[2,24,0],[23,48,0]]),hero=g.player;
  g.action(action(4,[0,12],2,1),hero);
  assert.deepEqual(g.list(2).map(x=>[x.x,x.y]),[[0,12],[24,12]]);
  assert.equal(g.list(23)[0].y,0);
  g.action(action(35,['test_value',7],-2),hero,g.list(23)[0]);
  assert.equal(g.list(23)[0].test_value,7);assert.equal(hero.test_value,undefined);
  g.action(action(14,[],-2),hero,g.list(23)[0]);assert.equal(g.list(23).length,0);
});

test('all shipped draw events execute; maze HUD and results carry original numeric state',()=>{
  const {game:g}=makeGame();g.start();g.score=40;g.lives=3;
  const drawn=[];g.drawText=(x,y,text)=>drawn.push(String(text));g.drawSprite=()=>{};
  for(const i of g.instances.filter(x=>!x.dead))g.event(i,8,0);
  assert.ok(drawn.includes('6x=30'));assert.ok(drawn.includes('M:2'));
  assert.ok(drawn.includes('pontos:40'));assert.ok(drawn.includes('chances:3'));
  for(const room of data.rooms.filter(Boolean)){
    g.loadRoom(room.index);
    for(const i of g.instances.filter(x=>!x.dead))g.event(i,8,0);
  }
  assert.ok(drawn.some(x=>x.includes('Equações Certas:')));
  assert.ok(drawn.some(x=>x.includes('Direcionais (setas)')));
});

test('original menu end action pauses desktop-equivalent gameplay and reports a departure message',()=>{
  const {game:g,messages}=makeGame();g.fresh();g.event(g.list(51)[0],5,27);
  assert.equal(g.paused,true);assert.equal(messages.length,1);const tick=g.tick;g.step();assert.equal(g.tick,tick);
});
