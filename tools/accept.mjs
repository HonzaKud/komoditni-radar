import {readFile,writeFile,rename,unlink,mkdir,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {validateSnapshot} from './validate.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function assertPreserved(previous,next){
  for(const [list,key] of [['market',r=>r.metal+'/'+r.date],['fx',r=>r.date],['inflation',r=>r.series+'/'+r.month],['runs',r=>r.id]]){
    const keys=new Set(next[list].map(key));if(previous[list].some(r=>!keys.has(key(r))))throw Error('Kandidát by odstranil historii '+list+'.');
  }
  for(const list of ['dailyReports','weeklyReports','runs','sources'])for(const old of previous[list]){
    const same=next[list].find(r=>r.id===old.id&&r.revision===old.revision);if(JSON.stringify(same)!==JSON.stringify(old))throw Error('Archivovaný záznam '+list+' se nesmí změnit.');
  }
}
export async function acceptCandidate(candidate,target=path.join(root,'data/snapshot.json')){
  const text=await readFile(candidate,'utf8');const next=JSON.parse(text);const result=validateSnapshot(next);if(!result.ok)throw Error(result.errors.join('\n'));
  let previousText=null;
  try{previousText=await readFile(target,'utf8');assertPreserved(JSON.parse(previousText),next);}catch(error){if(error.code!=='ENOENT')throw error;}
  await mkdir(path.dirname(target),{recursive:true});const lock=target+'.lock';let locked=false;
  const temp=target+'.'+randomUUID()+'.tmp';
  try{
    await writeFile(lock,String(process.pid),{flag:'wx'});locked=true;
    const current=await readFile(target,'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    if(current!==previousText)throw Error('Snímek se mezitím změnil; kandidát nebyl přijat.');
    await writeFile(temp,JSON.stringify(next,null,2)+'\n',{flag:'wx'});await rename(temp,target);
  }finally{await unlink(temp).catch(()=>{});if(locked)await unlink(lock).catch(()=>{});}
  return next;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(!process.argv[2]||process.argv.includes('--help')){console.log('node tools/accept.mjs .local/candidate.json\nValiduje a atomicky přijme kandidáta; chybný vstup zachová původní data.');process.exit(process.argv.includes('--help')?0:1);}
    const candidate=await realpath(path.resolve(root,process.argv[2]));if(!candidate.startsWith(path.join(root,'.local')+path.sep))throw Error('Kandidát musí být v projektové .local/.');
    const d=await acceptCandidate(candidate);console.log('Přijat validní snímek '+d.generatedAt+'.');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
