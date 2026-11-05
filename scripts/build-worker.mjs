import {WORLD_LIMIT} from '../dist/world-config.js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';

const paths=['index.html','style.css','app.js','clock.js','naturalism.js','landscape.js','discoveries.js','world.js','world-config.js','multiplayer.js',
 'vendor/three.module.js','vendor/three.core.js','vendor/BufferGeometryUtils.js','vendor/THREE-LICENSE.txt'];
const assets=Object.fromEntries(await Promise.all(paths.map(async path=>['/'+path,await readFile('dist/'+path,'utf8')])));
await mkdir('dist/server',{recursive:true});
await writeFile('dist/server/index.js','const WORLD_LIMIT = '+JSON.stringify(WORLD_LIMIT)+';\nconst assets = '+JSON.stringify(assets)+';\n'+await readFile('worker/index.js','utf8'));
