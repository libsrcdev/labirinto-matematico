const form=document.getElementById('launcher'),hacks=document.getElementById('hacks'),note=document.getElementById('emulator-note'),speedEnabled=document.getElementById('speed-enabled'),speed=document.getElementById('speed');
function update(){const emulator=form.elements.version.value==='emulator';hacks.hidden=emulator;hacks.disabled=emulator;note.hidden=!emulator;speed.disabled=!speedEnabled.checked||emulator;}
form.addEventListener('change',update);
form.addEventListener('submit',event=>{
  event.preventDefault();
  if(form.elements.version.value==='emulator'){location.href='emulator.html';return;}
  const params=new URLSearchParams();
  if(speedEnabled.checked)params.set('speed',speed.value);
  if(document.getElementById('easy').checked)params.set('easy','1');
  location.href='recreation.html'+(params.size?'?'+params:'');
});
update();
