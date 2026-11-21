import {readFile,writeFile,rename,unlink,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

export function appendReport(snapshot,input,kind='daily',now=new Date().toISOString()){
  if(!['daily','weekly'].includes(kind))throw Error('Typ reportu musí být daily nebo weekly.');
  if(!input||!/^\d{4}-\d{2}-\d{2}$/.test(input.date))throw Error('Chybí datum reportu.');
  const list=kind==='daily'?'dailyReports':'weeklyReports';
  const next=structuredClone(snapshot);
  const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
  const plain=r=>{const {id,revision,createdAt,...content}=r;return canonical(content);};
  const prior=next[list].filter(r=>r.date===input.date).sort((a,b)=>b.revision-a.revision)[0];
  const content={...input};delete content.id;delete content.revision;delete content.createdAt;
  if(prior&&plain(prior)===canonical(content))return {snapshot:next,changed:false};
  const revision=(prior?.revision??0)+1;
  const report={...content,id:`${kind}-${input.date}-r${revision}`,revision,createdAt:now};
  next[list].push(report);next.generatedAt=now;
  return {snapshot:next,changed:true,report};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  if(args.includes('--help')||args.length<2){console.log('node tools/report.mjs <candidate.json> <report.json> [daily|weekly]\nPřipojí report do kandidáta, zachová starší revize; shodný obsah nepřidá znovu.');process.exit(args.includes('--help')?0:1);}
  const [candidate,reportFile,kind='daily']=args;
  try{
    const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','.local');
    const target=path.resolve(candidate);
    if(!target.startsWith(root+path.sep)||!target.endsWith('.json'))throw Error('Výstup report composeru musí být JSON v projektové .local/.');
    const snapshot=JSON.parse(await readFile(target,'utf8'));
    const report=JSON.parse(await readFile(path.resolve(reportFile),'utf8'));
    const result=appendReport(snapshot,report,kind);
    if(!result.changed){console.log('Shodný report už existuje; nová revize nevznikla.');process.exit(0);}
    await mkdir(root,{recursive:true});
    const temp=target+'.report-'+randomUUID()+'.tmp';
    try{await writeFile(temp,JSON.stringify(result.snapshot,null,2)+'\n',{flag:'wx'});await rename(temp,target);}finally{await unlink(temp).catch(()=>{});}
    console.log('Přidán '+result.report.id+'. Kandidát ještě vyžaduje validaci a přijetí.');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
