// The 2020 runtime and Wine 1.7.55 filesystem must stay paired (filesystem ABI).
Config.storageMode=STORAGE_MEMORY;
Config.locateRootBaseUrl='emulator/legacy/';
Config.locateAppBaseUrl='emulator/';
Config.locateOverlayBaseUrl='emulator/legacy/';
Config.urlParams='root=boxedwine&overlay=overlay&app=labirintos&p=Labirintos.exe&auto=true&sound=true';
Module.locateFile=path=>'emulator/legacy/'+path;
const canvas=document.getElementById('canvas'),loading=document.getElementById('loading'),status=document.getElementById('status');
const debug=new URLSearchParams(location.search).has('debug'),logs=[];
let failed=false;
function emulatorFit(){
  const scale=Math.min(innerWidth/canvas.width,innerHeight/canvas.height);
  canvas.style.width=Math.floor(canvas.width*scale)+'px';
  canvas.style.height=Math.floor(canvas.height*scale)+'px';
}
function emulatorFailure(message){failed=true;loading.hidden=false;status.textContent=message;}
function emulatorLog(...args){
  const line=args.join(' ');logs.push(line);if(logs.length>100)logs.shift();
  if(debug){const pre=document.getElementById('diagnostics');pre.hidden=false;pre.textContent=logs.slice(-20).join('\n');}
}
Module.print=emulatorLog;
Module.printErr=emulatorLog;
Module.setStatus=text=>{if(text&&!failed)status.textContent='Preparando o emulador…';};
Module.onAbort=reason=>emulatorFailure('O emulador parou: '+String(reason));
Module.onExit=code=>emulatorFailure(code===0?'O jogo foi encerrado.':'O emulador encerrou com código '+code+'.');
Module.onRuntimeInitialized=()=>{loading.hidden=true;canvas.focus({preventScroll:true});emulatorFit();};
// Upstream file-operation errors use this callback.
errorCallback=error=>emulatorFailure('Falha ao carregar os arquivos: '+String(error));
window.onerror=(message,source,line,column,error)=>{emulatorLog(error?.stack||message,source,line,column,error?.errno);emulatorFailure('Erro no emulador: '+String(message));};
function activate(){canvas.focus({preventScroll:true});Module.SDL2?.audioContext?.resume().catch(()=>{});}
canvas.addEventListener('pointerdown',activate);
canvas.addEventListener('contextmenu',event=>event.preventDefault());
document.addEventListener('keydown',activate);
window.addEventListener('resize',emulatorFit);
new MutationObserver(emulatorFit).observe(canvas,{attributes:true,attributeFilter:['width','height']});
emulatorFit();

document.addEventListener("error",event=>{if(event.target?.id==="emulator-runtime")emulatorFailure("Não foi possível carregar o emulador.");},true);
