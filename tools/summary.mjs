import {readFile,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {latest,change,spread,quarterStats,inflationComparison,convert} from '../lib/analytics.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
try{
  const args=process.argv.slice(2);
  if(args.includes('--help')){console.log('node tools/summary.mjs [data/snapshot.json|.local/candidate.json] [--weekly]\nVypíše kompaktní ověřené vstupy reportu; velkou historii není potřeba vkládat do kontextu AI.');process.exit(0);}
  const file=await realpath(path.resolve(root,args.find(a=>!a.startsWith('--'))??'data/snapshot.json'));
  const local=path.join(root,'.local')+path.sep;
  if(file!==path.join(root,'data','snapshot.json')&&!file.startsWith(local))throw Error('Povoleny jsou jen projektové kandidáty a publikovaný snímek.');
  const data=JSON.parse(await readFile(file,'utf8'));
  const weekly=args.includes('--weekly');
  const periods=weekly?['day','week','month','qtd','ytd','year']:['day','week','month'];
  const reportOrder=(a,b)=>b.date.localeCompare(a.date)||b.revision-a.revision;
  const result={generatedAt:data.generatedAt,notices:data.notices,lastRun:[...data.runs].sort((a,b)=>b.finishedAt.localeCompare(a.finishedAt))[0],lastDailyReport:[...data.dailyReports].sort(reportOrder)[0],lastWeeklyReport:weekly?[...data.weeklyReports].sort(reportOrder)[0]:undefined,metals:{}};
  for(const metal of ['copper','zinc','lead']){
    result.metals[metal]={observations:{},changes:{},convertedPrices:{},spread:spread(data,metal)};
    for(const field of ['cash','threeMonth','stocks']){
      result.metals[metal].observations[field]=latest(data,metal,field);
      const row=result.metals[metal].observations[field];
      if(field!=='stocks')result.metals[metal].convertedPrices[field]=Object.fromEntries(['EUR','CZK'].map(currency=>[currency,row?convert(data,row[field],row.date,currency):{value:null,fxDate:null,reason:'Chybí cena.'}]));
      result.metals[metal].changes[field]=Object.fromEntries(periods.map(p=>[p,change(data,metal,field,p)]));
    }
    if(weekly){
      result.metals[metal].quarters={cash:quarterStats(data,metal,'cash'),threeMonth:quarterStats(data,metal,'threeMonth')};
      result.metals[metal].inflation=Object.fromEntries(['cz-cpi','cz-ppi','ea-hicp','us-cpi'].map(s=>[s,inflationComparison(data,metal,s)]));
    }
  }
  console.log(JSON.stringify(result,null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
