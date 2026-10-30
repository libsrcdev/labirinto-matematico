/** Original Labirintos MIDI and WAV playback, entirely local and dependency-free.
 * MIDI notes/controllers/tempo are original; instrument timbres are a new compact
 * General MIDI-style Web Audio synthesizer, not the original Windows soundbank.
 */
const ROOT = new URL('./audio/', import.meta.url);
const FX = {0:'sound0',1:'sound1',2:'sound2',4:'sound4',5:'sound5',14:'sound14',15:'sound15',16:'sound16',17:'sound_click',18:'sound_abertura'};
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function parseMidi(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p=0, order=0, limit=bytes.length;
  const take = n => { if (p+n>limit) throw Error('Truncated MIDI'); const at=p; p+=n; return at; };
  const u8 = () => bytes[take(1)];
  const u16 = () => view.getUint16(take(2));
  const u32 = () => view.getUint32(take(4));
  const tag = () => String.fromCharCode(...bytes.subarray(p, take(4)+4));
  const vlq = () => { let n=0; for(let i=0;i<4;i++){const c=u8();n=n*128+(c&127);if(c<128)return n;} throw Error('Invalid MIDI variable integer'); };
  if(tag()!=='MThd') throw Error('Not a MIDI file');
  const header=u32(), format=u16(), tracks=u16(), division=u16();
  if(header<6 || format>1 || !division || division&32768) throw Error('Unsupported MIDI format');
  take(header-6);
  const events=[], metadata=[];let endTick=0;
  for(let track=0;track<tracks;track++) {
    limit=bytes.length;
    if(tag()!=='MTrk') throw Error('Missing MIDI track');
    const length=u32();limit=p+length;if(limit>bytes.length)throw Error('Truncated MIDI track');
    let tick=0,running=0;
    while(p<limit) {
      tick+=vlq();let status=u8();
      if(status<128){p--;status=running;if(!status)throw Error('Invalid running status');}
      const event={tick,order:order++,track};
      if(status===255){
        const kind=u8(),size=vlq(),at=take(size);
        if(kind===81 && size===3)events.push({...event,type:'tempo',tempo:(bytes[at]<<16)+(bytes[at+1]<<8)+bytes[at+2]});
        if(kind>=1&&kind<=9)metadata.push({track,kind,text:new TextDecoder('windows-1252').decode(bytes.subarray(at,at+size))});
      } else if(status===240||status===247){take(vlq());running=0;}
      else {
        if(status>=240)throw Error('Unsupported MIDI event');
        running=status;
        const kind=status>>4,channel=status&15,a=u8(),b=kind===12||kind===13?0:u8();
        if(a>127||b>127)throw Error('Invalid MIDI data');
        events.push({...event,type:'midi',kind,channel,a,b});
      }
    }
    endTick=Math.max(endTick,tick);
  }
  events.sort((a,b)=>a.tick-b.tick||a.order-b.order);
  let tick=0,seconds=0,tempo=500000;
  for(const e of events){seconds+=(e.tick-tick)*tempo/(division*1e6);tick=e.tick;e.time=seconds;if(e.type==='tempo')tempo=e.tempo;}
  seconds+=(endTick-tick)*tempo/(division*1e6);
  return {format,tracks,division,duration:seconds,metadata,events:events.filter(e=>e.type==='midi')};
}

// Harmonic spectra are original approximations, grouped by GM instrument family.
const COLORS = {
  piano:[1,.32,.19,.09,.055,.035,.02,.012], bell:[1,.03,.42,.015,.15,.01,.08],
  organ:[1,.6,.3,.2,.12,.08], guitar:[1,.48,.25,.15,.08,.04], bass:[1,.32,.12,.05],
  strings:[1,.58,.32,.23,.15,.11,.08,.06,.04,.03,.02], brass:[1,.8,.65,.45,.28,.17,.09],
  reed:[1,.13,.65,.09,.3,.05,.13,.03,.07], flute:[1,.11,.035,.01], lead:[1,.48,.3,.22,.15],
  pad:[1,.22,.12,.06], ethnic:[1,.4,.28,.17,.1], percussion:[1,.5,.25,.12]
};
function instrument(program) {
  if(program<8)return {color:'piano',attack:.005,decay:1.5,sustain:.055,release:.18,gain:.23};
  if(program<16)return {color:'bell',attack:.002,decay:.7,sustain:.025,release:.3,gain:.17};
  if(program<24)return {color:'organ',attack:.012,decay:.1,sustain:.85,release:.1,gain:.12};
  if(program<32)return {color:'guitar',attack:.003,decay:.8,sustain:.05,release:.13,gain:.19};
  if(program<40)return {color:'bass',attack:.008,decay:.55,sustain:.24,release:.15,gain:.21};
  if(program===45)return {color:'strings',attack:.002,decay:.2,sustain:.015,release:.08,gain:.2};
  if(program===46)return {color:'guitar',attack:.003,decay:1,sustain:.025,release:.3,gain:.22};
  if(program===47)return {color:'percussion',attack:.002,decay:.7,sustain:.01,release:.25,gain:.25};
  if(program<56)return {color:'strings',attack:.045,decay:.15,sustain:.7,release:.22,gain:.15};
  if(program<64)return {color:'brass',attack:.035,decay:.12,sustain:.75,release:.12,gain:.13};
  if(program<72)return {color:'reed',attack:.022,decay:.1,sustain:.78,release:.1,gain:.12};
  if(program<80)return {color:'flute',attack:.025,decay:.1,sustain:.85,release:.12,gain:.21};
  if(program<88)return {color:'lead',attack:.01,decay:.12,sustain:.6,release:.1,gain:.12};
  if(program<104)return {color:'pad',attack:.08,decay:.3,sustain:.65,release:.4,gain:.14};
  if(program<112)return {color:'ethnic',attack:.002,decay:.6,sustain:.08,release:.16,gain:.18};
  return {color:'percussion',attack:.002,decay:.3,sustain:.025,release:.1,gain:.15};
}

export class GameAudio {
  constructor({volume=.65,muted=false}={}) {
    this.volume=clamp(volume,0,1);this.muted=muted;this.context=null;
    this.currentMusic=null;this.cache=new Map();this.voices=[];this.effects=new Set();this.generation=0;
    this.available=true;
  }
  async unlock() {
    if(!this.context){
      const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
      if(!Context){this.available=false;return false;}
      this.context=new Context();const c=this.context;
      this.master=c.createGain();this.master.gain.value=this.muted?0:this.volume;
      const compressor=c.createDynamicsCompressor();compressor.threshold.value=-10;compressor.knee.value=14;compressor.ratio.value=4;
      compressor.attack.value=.003;compressor.release.value=.18;this.master.connect(compressor);compressor.connect(c.destination);
      this.musicGain=c.createGain();this.musicGain.gain.value=.6;this.musicGain.connect(this.master);
      this.fxGain=c.createGain();this.fxGain.gain.value=.7;this.fxGain.connect(this.master);
      // Deterministic generated room impulse: no external sample bank required.
      let seed=81213;const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/2147483648-1;};
      this.noise=c.createBuffer(1,c.sampleRate,c.sampleRate);const samples=this.noise.getChannelData(0);
      for(let i=0;i<samples.length;i++)samples[i]=noise();
      const impulse=c.createBuffer(2,Math.floor(c.sampleRate*.9),c.sampleRate);
      for(let ch=0;ch<2;ch++){const data=impulse.getChannelData(ch);for(let i=0;i<data.length;i++)data[i]=noise()*Math.pow(1-i/data.length,3)*.3;}
      this.reverb=c.createConvolver();this.reverb.buffer=impulse;
      this.reverbGain=c.createGain();this.reverbGain.gain.value=.16;this.reverb.connect(this.reverbGain);this.reverbGain.connect(this.master);
      this.waves={};for(const [name,values] of Object.entries(COLORS)){const imag=new Float32Array(values.length+1);imag.set(values,1);this.waves[name]=c.createPeriodicWave(new Float32Array(imag.length),imag);}
      this.channels=Array.from({length:16},()=>{
        const gain=c.createGain(),pan=c.createStereoPanner(),vibrato=c.createOscillator(),vibratoGain=c.createGain();
        gain.connect(pan);pan.connect(this.musicGain);pan.connect(this.reverb);
        vibrato.frequency.value=5.4;vibratoGain.gain.value=0;vibrato.connect(vibratoGain);vibrato.start();
        return {gain,pan,vibrato,vibratoGain};
      });this._resetChannels(c.currentTime);
    }
    if(this.context.state==='suspended')await this.context.resume();
    return this.context.state==='running';
  }
  _resetChannels(time) {
    for(const ch of this.channels){
      Object.assign(ch,{program:0,volume:100,expression:127,sustain:false,bend:0,bendRange:2,rpnMSB:127,rpnLSB:127,modulation:0});
      ch.gain.gain.cancelScheduledValues(time);ch.gain.gain.setValueAtTime(100/127,time);
      ch.pan.pan.cancelScheduledValues(time);ch.pan.pan.setValueAtTime(0,time);
      ch.vibratoGain.gain.cancelScheduledValues(time);ch.vibratoGain.gain.setValueAtTime(0,time);
    }
  }
  async _load(name,type) {
    const key=type+name;
    if(!this.cache.has(key)){
      const promise=fetch(new URL(name,ROOT)).then(r=>{if(!r.ok)throw Error(`Audio ${name}: ${r.status}`);return r.arrayBuffer();}).then(b=>type==='midi'?parseMidi(b):this.context.decodeAudioData(b));
      this.cache.set(key,promise);promise.catch(()=>this.cache.delete(key));
    }
    return this.cache.get(key);
  }
  async playMusic(index,{loop=true}={}) {
    index=Number(index);if(index<6||index>13)return this.playSound(index);
    if(this.currentMusic===index && this.timer)return;
    this.stopMusic();const generation=this.generation;
    if(!await this.unlock())return;
    const midi=await this._load(`sound${index}.mid`,'midi');
    if(generation!==this.generation)return;
    this.currentMusic=index;this.sequence=midi;this.loop=loop;this.cursor=0;
    this.origin=this.context.currentTime+.06;this._resetChannels(this.origin);
    this.timer=setInterval(()=>this._schedule(),25);this._schedule();
  }
  _schedule() {
    const now=this.context.currentTime,horizon=now+.12;
    while(this.cursor<this.sequence.events.length){
      const e=this.sequence.events[this.cursor],time=this.origin+e.time;
      if(time>horizon)break;
      this.cursor++;
      // Recover gracefully after background-tab timer throttling; don't burst old notes.
      if(time<now-.25 && e.kind===9 && e.b>0)continue;
      this._event(e,Math.max(now,time));
    }
    if(this.cursor===this.sequence.events.length && now>=this.origin+this.sequence.duration+.6){
      if(this.loop){this._silence(now);this.cursor=0;this.origin=now+.03;this._resetChannels(this.origin);}
      else this.stopMusic();
    }
  }
  _event(e,time) {
    const ch=this.channels[e.channel];
    if(e.kind===9 && e.b>0){this._note(e.channel,e.a,e.b,time);return;}
    if(e.kind===8||e.kind===9){
      const voice=this.voices.find(v=>v.channel===e.channel&&v.note===e.a&&!v.keyReleased&&!v.released);
      if(voice){voice.keyReleased=true;if(!ch.sustain)this._release(voice,time);}return;
    }
    if(e.kind===12){ch.program=e.a;return;}
    if(e.kind===14){ch.bend=((e.a+(e.b<<7))-8192)/8192;this._pitch(e.channel,time);return;}
    if(e.kind!==11)return;
    switch(e.a){
      case 1: ch.modulation=e.b;ch.vibratoGain.gain.setValueAtTime(e.b/127*35,time);break;
      case 7:ch.volume=e.b;break;
      case 11:ch.expression=e.b;break;
      case 10:ch.pan.pan.setValueAtTime(clamp((e.b-64)/63,-1,1),time);break;
      case 64:ch.sustain=e.b>=64;if(!ch.sustain)for(const v of this.voices)if(v.channel===e.channel&&v.keyReleased)this._release(v,time);break;
      case 100:ch.rpnLSB=e.b;break;
      case 101:ch.rpnMSB=e.b;break;
      case 6:if(ch.rpnMSB===0&&ch.rpnLSB===0){ch.bendRange=e.b;this._pitch(e.channel,time);}break;
      case 120:for(const v of [...this.voices])if(v.channel===e.channel)this._release(v,time,.01);break;
      case 123:for(const v of this.voices)if(v.channel===e.channel){v.keyReleased=true;if(!ch.sustain)this._release(v,time);}break;
      case 121:ch.expression=127;ch.sustain=false;ch.bend=0;ch.modulation=0;ch.vibratoGain.gain.setValueAtTime(0,time);this._pitch(e.channel,time);for(const v of this.voices)if(v.channel===e.channel&&v.keyReleased)this._release(v,time);break;
    }
    if(e.a===7||e.a===11||e.a===121)ch.gain.gain.setValueAtTime(ch.volume*ch.expression/(127*127),time);
  }
  _pitch(channel,time){const ch=this.channels[channel];for(const v of this.voices)if(v.channel===channel&&!v.released)for(const o of v.oscillators)o.detune.setValueAtTime(ch.bend*ch.bendRange*100,time);}
  _note(channel,note,velocity,time) {
    if(channel===9){this._drum(note,velocity,time);return;}
    if(this.voices.length>=128)this._release(this.voices.find(v=>!v.released)||this.voices[0],time,.02);
    const c=this.context,ch=this.channels[channel],profile=instrument(ch.program),gain=c.createGain(),osc=c.createOscillator();
    const freq=440*Math.pow(2,(note-69)/12),peak=Math.pow(velocity/127,1.5)*profile.gain;
    osc.setPeriodicWave(this.waves[profile.color]);osc.frequency.value=freq;osc.detune.setValueAtTime(ch.bend*ch.bendRange*100,time);
    ch.vibratoGain.connect(osc.detune);
    osc.connect(gain);gain.connect(ch.gain);
    gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(peak,time+profile.attack);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0001,peak*profile.sustain),time+profile.attack+profile.decay);
    const voice={channel,note,gain,oscillators:[osc],profile,peak,start:time,keyReleased:false,released:false};
    this.voices.push(voice);osc.start(time);
    osc.onended=()=>{ch.vibratoGain.disconnect(osc.detune);osc.disconnect();gain.disconnect();const at=this.voices.indexOf(voice);if(at>=0)this.voices.splice(at,1);};
  }
  _release(voice,time,override) {
    if(!voice||voice.released)return;voice.released=true;
    const param=voice.gain.gain,release=override??voice.profile.release;
    // cancelAndHoldAtTime avoids clicks and preserves the scheduled attack/decay value.
    if(param.cancelAndHoldAtTime)param.cancelAndHoldAtTime(time);
    else {param.cancelScheduledValues(time);param.setValueAtTime(Math.max(.0001,param.value),time);}
    param.linearRampToValueAtTime(0,time+release);
    for(const o of voice.oscillators){try{o.stop(time+release+.01);}catch{}}
  }
  _drum(note,velocity,time) {
    const c=this.context,gain=c.createGain();gain.connect(this.channels[9].gain);
    let source,filter,duration=.15,amplitude=.19*Math.pow(velocity/127,1.3);
    if(note===35||note===36||note>=41&&note<=50&&![42,44,46,49].includes(note)){
      source=c.createOscillator();source.type='sine';
      const kick=note<37,freq=kick?150:90+(note-41)*17;
      source.frequency.setValueAtTime(freq,time);source.frequency.exponentialRampToValueAtTime(kick?42:freq*.55,time+.14);duration=kick?.28:.35;amplitude*=1.7;
      source.connect(gain);
    }else{
      source=c.createBufferSource();source.buffer=this.noise;filter=c.createBiquadFilter();filter.type='highpass';
      const cymbal=[42,44,46,49,51,52,53,55,57,59].includes(note);
      filter.frequency.value=cymbal?6500:note===39?1500:950;
      duration=[46,49,51,52,55,57,59].includes(note)?1.1:note===42||note===44?.06:.18;
      amplitude*=cymbal?.5:1;source.connect(filter);filter.connect(gain);
    }
    gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(amplitude,time+.002);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
    source.start(time);source.stop(time+duration+.02);
    const voice={channel:9,note,gain,oscillators:[source],profile:{release:.02},released:true};this.voices.push(voice);
    source.onended=()=>{source.disconnect();filter?.disconnect();gain.disconnect();const at=this.voices.indexOf(voice);if(at>=0)this.voices.splice(at,1);};
  }
  async playSound(index) {
    const name=FX[index]||({'sound_click':'sound_click','sound_abertura':'sound_abertura'}[index]);
    if(!name||!await this.unlock())return;
    const buffer=await this._load(`${name}.wav`,'wav');
    if(this.context.state==='closed')return;
    const source=this.context.createBufferSource();source.buffer=buffer;source.connect(this.fxGain);
    this.effects.add(source);source.onended=()=>{this.effects.delete(source);source.disconnect();};source.start();
  }
  _silence(time) {
    for(const voice of this.voices){
      if(!voice.released)this._release(voice,time,.025);
      else for(const source of voice.oscillators){try{source.stop(time+.03);}catch{}}
    }
  }
  stopMusic() {
    this.generation++;clearInterval(this.timer);this.timer=null;this.currentMusic=null;
    if(this.context)this._silence(this.context.currentTime);
  }
  setMuted(value){this.muted=Boolean(value);if(this.master)this.master.gain.setTargetAtTime(this.muted?0:this.volume,this.context.currentTime,.025);}
  setVolume(value){this.volume=clamp(Number(value)||0,0,1);if(this.master)this.master.gain.setTargetAtTime(this.muted?0:this.volume,this.context.currentTime,.025);}
  async dispose(){this.stopMusic();for(const source of this.effects){try{source.stop();}catch{}}this.effects.clear();if(this.context&&this.context.state!=='closed')await this.context.close();}
}
