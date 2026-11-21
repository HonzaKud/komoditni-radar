import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export const isDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export const isTimestamp=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT/.test(v)&&Number.isFinite(Date.parse(v));
export function safeUrl(v){try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}}
function checkSnapshot(d){
  const errors=[];const check=(ok,msg)=>{if(!ok)errors.push(msg);};
  const text=v=>typeof v==='string'&&v.trim().length>0;
  const number=v=>typeof v==='number'&&Number.isFinite(v);
  if(!d||typeof d!=='object'||Array.isArray(d))return {ok:false,errors:['Snímek musí být objekt.']};
  check(d.schemaVersion===1,'Nepodporované schemaVersion.');check(isTimestamp(d.generatedAt),'Neplatné generatedAt.');
  const arrays=['sources','market','fx','inflation','dailyReports','weeklyReports','runs','exclusions','notices'];
  for(const key of arrays)check(Array.isArray(d[key]),'Chybí pole '+key+'.');
  check(Object.keys(d).every(k=>['schemaVersion','generatedAt','calendar',...arrays].includes(k)),'Snímek obsahuje neznámé kořenové položky.');
  if(errors.length)return {ok:false,errors};
  check(d.sources.length>0,'Chybí zdroje.');check(d.market.length>0,'Chybí tržní historie.');
  const ids=new Set();for(const s of d.sources){check(s&&text(s.id)&&text(s.name)&&text(s.kind)&&safeUrl(s.url),'Neplatný zdroj.');if(s){check(!ids.has(s.id),'Duplicitní zdroj '+s.id);ids.add(s.id);}}
  if(d.calendar)check(Array.isArray(d.calendar.holidays)&&d.calendar.holidays.every(isDate)&&Array.isArray(d.calendar.years)&&d.calendar.years.every(y=>Number.isInteger(y)&&y>=2021)&&ids.has(d.calendar.sourceId)&&isTimestamp(d.calendar.retrievedAt),'Neplatný kalendář obchodních dnů.');
  const refs=(v,label)=>check(Array.isArray(v)&&v.every(id=>ids.has(id)),label+': neznámý zdroj.');
  const unique=(rows,key,label)=>{const keys=new Set();for(const r of rows){if(!r||typeof r!=='object'){errors.push(label+': neplatný řádek.');continue;}const k=key(r);check(!keys.has(k),label+': duplicita '+k);keys.add(k);}};
  const metals=['copper','zinc','lead'];const maxDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d.generatedAt));
  unique(d.market,r=>r.metal+'/'+r.date,'Trh');
  for(const r of d.market){if(!r)continue;check(metals.includes(r.metal)&&isDate(r.date)&&r.date<=maxDay,'Neplatný kov/datum trhu.');refs(r.sourceIds,'Trh');check(r.sourceIds?.length>0&&text(r.verification)&&isTimestamp(r.retrievedAt),'Chybí provenance trhu.');for(const f of ['cash','threeMonth','stocks'])check(r[f]===null?text(r.reasons?.[f]):number(r[f])&&(f==='stocks'?r[f]>=0:r[f]>0),`Neplatná hodnota/důvod ${r.metal} ${r.date} ${f}.`);}
  unique(d.fx,r=>r.date,'FX');for(const r of d.fx){if(!r)continue;check(isDate(r.date)&&r.date<=maxDay&&number(r.usdCzk)&&r.usdCzk>0&&number(r.eurCzk)&&r.eurCzk>0&&r.sourceId==='cnb'&&ids.has(r.sourceId)&&isTimestamp(r.retrievedAt),'Neplatný kurz.');}
  unique(d.inflation,r=>r.series+'/'+r.month,'Inflace');for(const r of d.inflation){if(!r)continue;check(['cz-cpi','cz-ppi','ea-hicp','us-cpi'].includes(r.series)&&/^\d{4}-(0[1-9]|1[0-2])$/.test(r.month)&&r.month<=maxDay.slice(0,7)&&number(r.value)&&r.value>0&&ids.has(r.sourceId)&&isTimestamp(r.retrievedAt),'Neplatný inflační index.');}
  for(const list of ['dailyReports','weeklyReports']){
    unique(d[list],r=>r.id,list);unique(d[list],r=>r.date+'/'+r.revision,list+' revize');
    for(const r of d[list]){if(!r)continue;const label=list+' '+r.id;
      check(text(r.id)&&isDate(r.date)&&r.date<=maxDay&&isDate(r.dataThrough)&&r.dataThrough<=r.date&&isTimestamp(r.createdAt)&&Number.isInteger(r.revision)&&r.revision>0,label+': metadata.');
      for(const f of ['title','summary','outlook'])check(text(r[f]),label+': chybí '+f);
      check(Array.isArray(r.metals)&&r.metals.length>0&&r.metals.every(m=>metals.includes(m)),label+': kovy.');
      for(const m of ['overall',...metals]){check(Number.isInteger(r.risk?.[m])&&r.risk[m]>=1&&r.risk[m]<=5,label+': riziko '+m);check(text(r.riskNotes?.[m]),label+': zdůvodnění '+m);}
      check(Object.keys(r.risk??{}).every(k=>['overall',...metals].includes(k)),label+': neznámé rizikové klíče.');
      refs(r.sources,label);for(const f of ['watch','decisionPoints'])check(Array.isArray(r[f])&&r[f].every(text),label+': '+f);
      check(Array.isArray(r.factors)&&r.factors.length<=5,label+': faktory.');
      for(const f of r.factors??[]){check(['fact','interpretation','scenario'].includes(f.type)&&text(f.title)&&text(f.text)&&Array.isArray(f.urls)&&f.urls.every(safeUrl),label+': neplatný faktor.');refs(f.sourceIds,label);if(f.type==='fact')check(f.urls.length>0,label+': fakt bez odkazu.');}
      for(const f of ['sections','scenarios','bullBear','forecasts'])check(Array.isArray(r[f]),label+': chybí '+f);
      for(const s of r.sections??[])check(text(s.title)&&text(s.text),label+': oddíl.');
      for(const s of r.scenarios??[])check(['1–4 týdny','3–12 měsíců'].includes(s.horizon)&&['title','text','confirms','invalidates'].every(k=>text(s[k])),label+': scénář.');
      for(const s of r.bullBear??[])check(metals.includes(s.metal)&&['bull','bear','evidence'].every(k=>text(s[k])),label+': býčí/medvědí faktor.');
      for(const s of r.forecasts??[])check(text(s.institution)&&text(s.text)&&safeUrl(s.url)&&isDate(s.date)&&s.date<=r.date,label+': prognóza.');
    }
  }
  unique(d.runs,r=>r.id,'Běhy');for(const r of d.runs){if(!r)continue;check(text(r.id)&&isTimestamp(r.startedAt)&&isTimestamp(r.finishedAt)&&Date.parse(r.finishedAt)>=Date.parse(r.startedAt)&&['ok','partial','error'].includes(r.status)&&['passed','failed'].includes(r.validation)&&Number.isInteger(r.loaded)&&r.loaded>=0&&Array.isArray(r.missing)&&r.missing.every(text)&&text(r.message)&&Array.isArray(r.sourceStatus),'Neplatný běh.');for(const s of r.sourceStatus??[])check(ids.has(s.sourceId)&&text(s.status)&&(s.latestDate===null||isDate(s.latestDate))&&typeof s.message==='string','Neplatný stav zdroje.');}
  for(const e of d.exclusions)check(e&&metals.includes(e.metal)&&isDate(e.date)&&['cash','threeMonth','stocks'].includes(e.field)&&text(e.reason),'Neplatná výluka.');
  check(d.notices.every(text),'Neplatná upozornění.');
  check(!/sellier|bellot|\bS\s*&\s*B\b/i.test(JSON.stringify(d)),'Snímek obsahuje zakázanou firemní značku.');
  return {ok:errors.length===0,errors};
}
export function validateSnapshot(d){try{return checkSnapshot(d);}catch(error){return {ok:false,errors:['Neplatná struktura snímku: '+error.message]};}}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  try{const d=JSON.parse(await readFile(path.resolve(root,process.argv[2]??'data/snapshot.json'),'utf8'));const result=validateSnapshot(d);if(!result.ok)throw Error(result.errors.join('\n'));console.log(`Validní snímek: ${d.market.length} tržních řádků, ${d.fx.length} kurzů, ${d.inflation.length} indexů.`);}catch(error){console.error(error.message);process.exitCode=1;}
}
