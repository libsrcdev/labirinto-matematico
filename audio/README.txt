LABIRINTOS AUDIO

The MIDI and WAV files in this directory are exact copies of the audio extracted
from Labirintos.exe, with the original game resource names. Resource IDs 17 and
18 are sound_click.wav and sound_abertura.wav respectively. Music IDs are 6–13.

../audio.js plays the original note, tempo, velocity, program, pan, volume,
expression, sustain, modulation and pitch-bend events through an original small
Web Audio synthesizer. No network/CDN, plugin or external soundbank is needed.
It begins only after a user gesture permits the browser AudioContext to resume.

This is a reconstruction of the playback instruments. It does not reproduce
the precise timbres of the old Windows MIDI synthesizer. General MIDI families
are approximated with harmonic synthesis; bank variants, vendor SysEx, NRPN,
chorus and per-channel reverb controllers are not reproduced. The supplied
recorded WAV effects are played unchanged. The note/event data is unmodified.

Implementation references:
https://developer.mozilla.org/en-US/docs/Web/API/AudioContext
https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/createPeriodicWave

Usage:
  import {GameAudio} from './audio.js';
  const audio = new GameAudio({volume: 0.65});
  await audio.unlock(); // call from click/tap/keyboard gesture
  await audio.playMusic(6); // loops by default
  await audio.playSound(18);
  audio.setMuted(true);
  audio.stopMusic();

Methods that load/play audio return promises: handle load/permission failures in
the UI without blocking gameplay. setMuted(false) preserves the music position.
