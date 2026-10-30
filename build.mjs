import {cp,mkdir,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist');
for(const file of ['index.html','picker.css','picker.js','recreation.html','style.css','app.js','hacks.js','timing.js','engine.js','audio.js','game-data.json','emulator.html','emulator.js'])await cp(file,`dist/${file}`);
await cp('emulator','dist/emulator',{recursive:true});
await cp('assets','dist/assets',{recursive:true,filter:path=>!path.includes('_inspection')});
await cp('audio','dist/audio',{recursive:true,filter:path=>!path.endsWith('test.html')&&!path.endsWith('README.txt')});
console.log('Built self-contained static game in dist/');
