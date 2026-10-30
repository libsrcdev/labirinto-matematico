// Scale simulation time, not movement distances, so collisions still run each tick.
export class GameClock {
  constructor(speed=1){this.speed=speed;this.accumulator=0;}
  reset(){this.accumulator=0;}
  advance(elapsed,game){
    this.accumulator+=Math.min(Math.max(elapsed,0),.15)*this.speed;
    let steps=0;
    while(this.accumulator+1e-9>=1/game.room.fps&&steps<16){
      this.accumulator-=1/game.room.fps;steps++;
      if(game.step()===false){this.reset();break;}
    }
    return steps;
  }
}
