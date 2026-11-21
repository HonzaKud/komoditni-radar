import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base='https://honzakud.github.io/komoditni-radar/';
const digest=text=>createHash('sha256').update(text).digest('hex');
try{
  const local=JSON.parse(await readFile(path.join(root,'data/snapshot.json'),'utf8'));
  const request=async file=>{
    const response=await fetch(new URL(file+'?check='+encodeURIComponent(local.generatedAt),base),{signal:AbortSignal.timeout(20000),headers:{'Cache-Control':'no-cache'}});
    if(!response.ok)throw Error(file+': HTTP '+response.status);
    return response.text();
  };
  const [index,remoteText,...assets]=await Promise.all(['index.html','data/snapshot.json','app.js','styles.css','lib/analytics.mjs'].map(request));
  const remote=JSON.parse(remoteText);
  if(!index.includes('Komoditní radar'))throw Error('Na adrese není očekávaný web.');
  if(digest(JSON.stringify(remote))!==digest(JSON.stringify(local)))throw Error('Web ještě neobsahuje shodný datový snímek.');
  for(const [i,file] of ['app.js','styles.css','lib/analytics.mjs'].entries()){
    const current=await readFile(path.join(root,file),'utf8');
    if(digest(current.replace(/\r\n/g,'\n'))!==digest(assets[i].replace(/\r\n/g,'\n')))throw Error('Web ještě neobsahuje shodnou verzi '+file+'.');
  }
  console.log('Ověřen živý web i shoda dat a aplikace: '+base+' · '+remote.generatedAt);
}catch(error){console.error('Živé nasazení není potvrzené: '+error.message);process.exitCode=1;}
