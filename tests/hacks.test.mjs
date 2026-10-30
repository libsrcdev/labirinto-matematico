import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game,STAGES} from '../engine.js';
import {readOptions,prepareGameData} from '../hacks.js';
import {GameClock} from '../timing.js';
const data=JSON.parse(readFileSync(new URL('../game-data.json',import.meta.url)));
const assets=JSON.parse(readFileSync(new URL('../assets/manifest.json',import.meta.url)));
const make=(easy,random=()=>.5)=>new Game(prepareGameData(data,{easy}),assets,{random});

test('speed hack scales complete game ticks without skipping collision steps or accumulating pause time',()=>{
  for(const speed of [1,2,3,4]){
    let ticks=0;const game={room:{fps:20},step(){ticks++;}},clock=new GameClock(speed);
    for(let i=0;i<60;i++)clock.advance(1/60,game);
    assert.equal(ticks,20*speed);
    clock.advance(.01,game);clock.reset();const before=ticks;
    clock.advance(0,game);assert.equal(ticks,before);
  }
  let ticks=0;const clock=new GameClock(4),game={room:{fps:20},step(){ticks++;return false;}};
  clock.advance(.15,game);assert.equal(ticks,1);assert.equal(clock.accumulator,0);
});

test('hacks default off, remain independent, and reject unsupported speed values',()=>{
  assert.deepEqual(readOptions(''),{speed:1,easy:false});
  assert.deepEqual(readOptions('?speed=4'),{speed:4,easy:false});
  assert.deepEqual(readOptions('?easy=1'),{speed:1,easy:true});
  assert.deepEqual(readOptions('?speed=2&easy=1'),{speed:2,easy:true});
  for(const speed of ['-1','0','Infinity','999','NaN','2.5'])assert.equal(readOptions('?speed='+speed).speed,1);
});
test('easy mode leaves the recovered data intact and normal runs keep their equations',()=>{
  const before=JSON.stringify(data);const normal=make(false),easy=make(true);
  normal.start();easy.start();assert.equal(normal.global.equac,'6x=30');assert.equal(easy.global.equac,'1 + 1 = ?');
  assert.equal(JSON.stringify(data),before);assert.equal(prepareGameData(data),data);
});
test('all seven easy mazes label only correct doors 2, before and after both kinds of gate',()=>{
  for(const random of [()=>0,()=>.125,()=>.5,()=>.999]){
    const g=make(true,random);g.start();
    for(const room of STAGES){
      g.loadRoom(room);
      const verify=()=>{
        assert.equal(g.global.equac,'1 + 1 = ?');assert.equal(g.global.x1,2);
        assert.ok(g.list(10).every(x=>x.sprite_index===g.resources.dois));
        assert.ok(g.list(13).every(x=>x.sprite_index!==g.resources.dois));
      };
      verify();g.event(g.list(10)[0],4,0,g.player);verify();g.event(g.list(13)[0],4,0,g.player);verify();
    }
  }
});
test('bonus easy mode keeps answer 2 across correct catches and draws the same 1 + 1 question',()=>{
  const g=make(true,()=>.125);g.start();g.global.guarda_fase=2;g.loadRoom(12);
  for(let i=0;i<5;i++){
    assert.equal(g.global.bonus_x,2);assert.equal(g.list(34)[0].sprite_index,g.resources.dois);
    assert.ok(g.list(35).every(x=>x.sprite_index!==g.resources.dois));
    g.event(g.list(34)[0],4,44,g.player);
  }
  assert.equal(g.score,5);assert.equal(g.global.sbonus,5);
  const lines=[];g.drawText=(x,y,t)=>lines.push(t);g.event(g.list(45)[0],8,0);
  assert.ok(lines.includes('1 + 1 = ?'));
});
