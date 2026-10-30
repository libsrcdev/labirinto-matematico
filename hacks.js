// Optional recreation-only changes. The recovered data and original EXE stay intact.
export function readOptions(search='') {
  const params=new URLSearchParams(search),speed=Number(params.get('speed'));
  return {speed:[2,3,4].includes(speed)?speed:1,easy:params.get('easy')==='1'};
}
export function prepareGameData(original,{easy=false}={}) {
  if(!easy)return original;
  const data=structuredClone(original);
  const event=(object,kind,id=0)=>data.objects[object].events.find(e=>e.kind===kind&&e.event===id);
  const code=(object,kind,id=0)=>event(object,kind,id).actions.find(a=>a.id===34);
  code(9,0).args[0]="global.x1=2; num1=1; num2=1; total=2; global.equac='1 + 1 = ?'; Certo.sprite_index=dois;";
  const bonus="global.bonus_a=1; global.bonus_x=2; global.bonus_c=2;";
  code(45,0).args[0]=bonus;
  code(34,4,44).args[0]=bonus+' global.sbonus += 1;';
  code(45,8).args[0]="draw_text(11,10,'1 + 1 = ?');";
  return data;
}
