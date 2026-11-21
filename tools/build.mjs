import {readFile,mkdir,copyFile,readdir,unlink,stat,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateSnapshot} from './validate.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const out=path.join(root,'dist');
try{
  const data=JSON.parse(await readFile(path.join(root,'data/snapshot.json'),'utf8'));const check=validateSnapshot(data);if(!check.ok)throw Error(check.errors.join('\n'));
  const files=['index.html','styles.css','app.js','lib/analytics.mjs','data/snapshot.json'];
  for(const file of files)if(!(await stat(path.join(root,file))).isFile())throw Error('Chybí soubor '+file);
  await mkdir(out,{recursive:true});
  if((await realpath(out)).toLowerCase()!==out.toLowerCase())throw Error('Výstup dist nesmí odkazovat mimo projekt.');
  async function cleanFiles(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('Výstup obsahuje nepovolený odkaz.');if(entry.isDirectory())await cleanFiles(p);else if(!files.includes(path.relative(out,p).split(path.sep).join('/')))await unlink(p);}}
  await cleanFiles(out);
  for(const file of files){const destination=path.join(out,file);await mkdir(path.dirname(destination),{recursive:true});await copyFile(path.join(root,file),destination);}
  console.log('Sestaven statický web: '+out+' · '+files.length+' souborů.');
}catch(error){console.error('Build zastaven: '+error.message);process.exitCode=1;}
