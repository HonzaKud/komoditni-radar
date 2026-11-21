import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {validateSnapshot} from './validate.mjs';
import {collectInflation} from './inflation.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const metals={copper:{code:'Cu',name:'měď'},zinc:{code:'Zn',name:'zinek'},lead:{code:'Pb',name:'olovo'}};
const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
const german=['januar','februar','märz','april','mai','juni','juli','august','september','oktober','november','dezember'];
const clean=s=>s.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
export function parseWestmetall(html,lang='en'){
  const rows=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>[...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c=>clean(c[1])));
  const header=rows.find(r=>r.some(c=>/cash/i.test(c))&&r.some(c=>/3.month|3.monat/i.test(c)));
  if(!header)throw Error('V tabulce nebyly nalezeny očekávané ceny Cash/3M.');
  const indices={cash:header.findIndex(c=>/cash/i.test(c)),threeMonth:header.findIndex(c=>/3.month|3.monat/i.test(c)),stocks:header.findIndex(c=>/stock|bestand|beständ/i.test(c))};
  if(Object.values(indices).some(i=>i<1))throw Error('Chybí očekávaný sloupec zásob nebo cen.');
  const out=[];
  for(const cells of rows){const m=cells[0]?.match(/^(\d{1,2})\.\s+([\p{L}]+)\s+(\d{4})$/u);if(!m)continue;const month=(lang==='de'?german:months).indexOf(m[2].toLowerCase());if(month<0)throw Error('Neznámý měsíc zdroje.');const date=`${m[3]}-${String(month+1).padStart(2,'0')}-${m[1].padStart(2,'0')}`;const record={date};for(const [f,i] of Object.entries(indices)){const raw=cells[i]??'';const value=Number(lang==='de'?raw.replace(/\./g,'').replace(',','.'):raw.replace(/,/g,''));record[f]=raw&&/^[\d.,]+$/.test(raw)&&Number.isFinite(value)?value:null;}out.push(record);}
  if(!out.length)throw Error('Tabulka neobsahuje žádné denní hodnoty.');return out;
}
export function parseCnb(text){
  const lines=text.trim().replace(/^\uFEFF/,'').split(/\r?\n/);let usd=-1,eur=-1;const rows=[];
  for(const line of lines.filter(Boolean)){const parts=line.trim().split('|');if(parts[0]==='Date'){usd=parts.findIndex(v=>/^1\s+USD$/.test(v));eur=parts.findIndex(v=>/^1\s+EUR$/.test(v));if(usd<0||eur<0)throw Error('Chybí sloupce ČNB USD/EUR.');continue;}const m=parts[0].match(/^(\d\d)\.(\d\d)\.(\d{4})$/);if(!m||usd<0||eur<0)throw Error('Neznámý formát data ČNB.');const usdCzk=Number(parts[usd]),eurCzk=Number(parts[eur]);if(!(usdCzk>0&&eurCzk>0))throw Error('Neplatný kurz ČNB.');rows.push({date:`${m[3]}-${m[2]}-${m[1]}`,usdCzk,eurCzk});}if(!rows.length)throw Error('ČNB nevrátila kurzy.');return rows;
}
export function parseWieland(html){
  const found=[];
  for(const match of html.matchAll(/<table\b[^>]*class="[^"]*(?:table-lme-settlement|table-mason-metal-prices)[^"]*"[^>]*>([\s\S]*?)<\/table>/gi)){
    const dates=[...html.slice(0,match.index).matchAll(/Value from\s+([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/gi)];const d=dates.at(-1);if(!d)continue;const month=months.findIndex(m=>m.startsWith(d[1].toLowerCase()));if(month<0)continue;const date=`${d[3]}-${String(month+1).padStart(2,'0')}-${d[2].padStart(2,'0')}`;
    for(const row of match[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(c=>clean(c[1]));if(!/^(Cu|Zn)$/i.test(cells[0]??''))continue;const cash=Number(cells[1]?.replaceAll(',',''));if(Number.isFinite(cash)&&cash>0)found.push({metal:cells[0].toLowerCase()==='cu'?'copper':'zinc',date,cash});}
  }
  const result={};for(const metal of ['copper','zinc']){const rows=found.filter(r=>r.metal===metal).sort((a,b)=>b.date.localeCompare(a.date));if(!rows.length)continue;const current=rows.filter(r=>r.date===rows[0].date);if(new Set(current.map(r=>r.cash)).size===1)result[metal]=current[0];}
  if(!Object.keys(result).length)throw Error('Wieland neobsahuje jednoznačnou datovanou tabulku LME Cash.');return result;
}
let powershellOnly=false;
async function download(url){
  if(!powershellOnly){try{const response=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'CommodityRadar/1.0 public market data'}});if(!response.ok)throw Error('HTTP '+response.status);return await response.text();}catch(error){if(process.platform!=='win32')throw error;powershellOnly=true;}}
  const script="[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); (Invoke-WebRequest -UseBasicParsing -Uri '"+url.replaceAll("'","''")+"').Content";
  const result=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',timeout:35000,maxBuffer:20*1024*1024,windowsHide:true});return result.stdout;
}
export async function collect({history=false,fromYear=null,output=path.join(root,'.local/candidate.json')}={}){
  const now=new Date().toISOString(),startedAt=now,year=Number(now.slice(0,4));let data;
  try{data=JSON.parse(await readFile(path.join(root,'data/snapshot.json'),'utf8'));const check=validateSnapshot(data);if(!check.ok)throw Error('Původní snímek není validní: '+check.errors.join('; '));}catch(error){if(error.code!=='ENOENT')throw error;data={schemaVersion:1,generatedAt:now,sources:[],market:[],fx:[],inflation:[],dailyReports:[],weeklyReports:[],runs:[],exclusions:[],notices:[]};history=true;}
  const first=fromYear??(history?2021:year);if(!Number.isInteger(first)||first<2021||first>year)throw Error('Neplatný počáteční rok.');
  const target=path.resolve(output);if(!target.startsWith(path.join(root,'.local')+path.sep))throw Error('Kandidát musí být v .local/.');
  const sourceStatus=[],missing=[],notices=[],market=new Map(data.market.map(r=>[r.metal+'/'+r.date,r])),fx=new Map(data.fx.map(r=>[r.date,r]));let loaded=0;
  const addSource=s=>{if(!data.sources.some(old=>old.id===s.id))data.sources.push(s);};
  addSource({id:'uk-bank-holidays',name:'GOV.UK · England and Wales bank holidays',url:'https://www.gov.uk/bank-holidays.json',kind:'primary'});
  try{const calendar=JSON.parse(await download('https://www.gov.uk/bank-holidays.json'));const holidays=calendar['england-and-wales'].events.map(e=>e.date).filter(d=>d>='2021-01-01').sort();const counts=new Map();for(const d of holidays){const y=Number(d.slice(0,4));counts.set(y,(counts.get(y)??0)+1);}data.calendar={holidays,years:[...counts].filter(([,count])=>count>=7).map(([y])=>y).sort(),sourceId:'uk-bank-holidays',retrievedAt:now};sourceStatus.push({sourceId:'uk-bank-holidays',status:'ok',latestDate:holidays.at(-1)??null,message:'Kalendář britských bankovních svátků pro výpočet pokrytí.'});}catch(error){missing.push('Kalendář: '+error.message);sourceStatus.push({sourceId:'uk-bank-holidays',status:'error',latestDate:null,message:'Kalendář se nepodařilo načíst; poslední dostupný zůstává.'});}
  const exclusion=(metal,date,field)=>{const reason='Vyřazený chybný údaj zdroje podle metodiky; hodnota se nedopočítává.';if(!data.exclusions.some(e=>e.metal===metal&&e.date===date&&e.field===field))data.exclusions.push({metal,date,field,reason});return reason;};
  for(let y=first;y<=year;y++)for(const [metal,info] of Object.entries(metals)){
    const versions={};
    for(const lang of ['en','de']){
      const url=`https://www.westmetall.com/${lang}/markdaten.php?action=table&field=LME_${info.code}_cash&year=${y}`,id=`west-${metal}-${lang}-${y}`;
      addSource({id,name:`Westmetall · ${info.name} · ${lang.toUpperCase()} · ${y}`,url,kind:'secondary'});
      try{versions[lang]=parseWestmetall(await download(url),lang).filter(r=>r.date.startsWith(String(y))&&r.date<=now.slice(0,10));sourceStatus.push({sourceId:id,status:'ok',latestDate:versions[lang].map(r=>r.date).sort().at(-1)??null,message:'Načtena jazyková verze stejného zdroje.'});}
      catch(error){versions[lang]=null;missing.push(`${metal} ${y} ${lang}: ${error.message.slice(0,160)}`);sourceStatus.push({sourceId:id,status:'error',latestDate:null,message:error.message.slice(0,160)});}
    }
    if(!versions.en||!versions.de)continue;
    const en=new Map(versions.en.map(r=>[r.date,r])),de=new Map(versions.de.map(r=>[r.date,r]));let disagreements=0;
    for(const date of new Set([...en.keys(),...de.keys()])){
      const a=en.get(date),b=de.get(date),old=market.get(metal+'/'+date);const r={metal,date,sourceIds:[`west-${metal}-en-${y}`,`west-${metal}-de-${y}`],verification:'Shoda EN/DE stejného sekundárního zdroje; nejde o nezávislé ověření.',retrievedAt:now,reasons:{}};
      let mismatch=false;
      for(const field of ['cash','threeMonth','stocks']){
        if(field==='stocks'&&((metal==='zinc'&&date==='2025-10-03')||(metal==='lead'&&date==='2023-05-05'))){r[field]=null;r.reasons[field]=exclusion(metal,date,field);continue;}
        if(a?.[field]!=null&&b?.[field]!=null&&a[field]===b[field])r[field]=a[field];
        else{r[field]=null;r.reasons[field]=!a||!b?'Datum není v obou jazykových verzích zdroje.':'Neshoda nebo chybějící údaj EN/DE; neověřená hodnota se nepublikuje.';mismatch=true;}
      }
      if(mismatch){disagreements++;if(old)continue;r.verification='Částečná shoda EN/DE; chybějící či neshodné hodnoty jsou null.';}
      const equivalent=old&&['cash','threeMonth','stocks'].every(f=>old[f]===r[f])&&JSON.stringify(old.reasons)===JSON.stringify(r.reasons)&&JSON.stringify(old.sourceIds)===JSON.stringify(r.sourceIds);
      if(!equivalent){market.set(metal+'/'+date,r);loaded++;}
    }
    if(disagreements){const message=`${info.name} ${y}: ${disagreements} řádků s neshodou EN/DE; dříve ověřené záznamy zůstaly zachované.`;missing.push(message);notices.push(message);}
    console.log(`Westmetall ${metal} ${y}: EN ${en.size}, DE ${de.size}.`);
  }
  addSource({id:'wieland',name:'Wieland · LME settlement Cash Cu/Zn',url:'https://www.wieland.com/resources/metal-information',kind:'secondary'});
  try{
    const [a,b]=await Promise.all([download('https://www.wieland.com/resources/metal-information').then(parseWieland),download('https://www.wieland.com/resources/metal-information').then(parseWieland)]);let latestDate=null;
    for(const metal of ['copper','zinc']){const row=a[metal],second=b[metal];if(!row||!second||row.date!==second.date||row.cash!==second.cash){missing.push('Wieland '+metal+': neshoda dvou načtení.');continue;}if(row.date>now.slice(0,10))continue;latestDate=latestDate&&latestDate>row.date?latestDate:row.date;const key=metal+'/'+row.date,old=market.get(key);
      if(old?.cash!==null&&old?.cash!==undefined&&!old.sourceIds.includes('wieland')){if(old.cash!==row.cash){missing.push('Rozdíl Westmetall/Wieland '+metal+' '+row.date+'; upřednostněn hlavní zdroj.');}continue;}
      if(old?.cash===row.cash)continue;
      const r=old?structuredClone(old):{metal,date:row.date,cash:null,threeMonth:null,stocks:null,sourceIds:[],reasons:{threeMonth:'Wieland cenu 3M neposkytuje; hlavní zdroj dosud chybí.',stocks:'Wieland zásoby neposkytuje; hlavní zdroj dosud chybí.'}};
      r.cash=row.cash;delete r.reasons.cash;r.sourceIds=[...new Set([...r.sourceIds,'wieland'])];r.retrievedAt=now;r.verification='Cash: shoda dvou načtení Wielandu; nejde o nezávislé zdroje. Další dostupné řady případně ověřeny EN/DE Westmetall.';market.set(key,r);loaded++;
    }
    sourceStatus.push({sourceId:'wieland',status:'ok',latestDate,message:'Dvě shodná načtení; pouze Cash mědi a zinku, přednost má hlavní zdroj.'});
  }catch(error){missing.push('Wieland: '+error.message.slice(0,160));sourceStatus.push({sourceId:'wieland',status:'error',latestDate:null,message:error.message.slice(0,160)});}
  addSource({id:'cnb',name:'ČNB · kurzy devizového trhu USD/CZK a EUR/CZK',url:'https://www.cnb.cz/en/financial_markets/foreign_exchange_market/exchange_rate_fixing/',kind:'primary'});
  for(let y=first;y<=year;y++){
    try{const rows=parseCnb(await download(`https://www.cnb.cz/en/financial_markets/foreign_exchange_market/exchange_rate_fixing/year.txt?year=${y}`));for(const row of rows){if(row.date>now.slice(0,10))continue;const old=fx.get(row.date);if(!old||old.usdCzk!==row.usdCzk||old.eurCzk!==row.eurCzk){fx.set(row.date,{...row,sourceId:'cnb',retrievedAt:now});loaded++;}}sourceStatus.push({sourceId:'cnb',status:'ok',latestDate:rows.map(r=>r.date).sort().at(-1)??null,message:'Roční tabulka ČNB '+y});console.log(`ČNB ${y}: ${rows.length} kurzů.`);}
    catch(error){missing.push('ČNB '+y+': '+error.message.slice(0,160));sourceStatus.push({sourceId:'cnb',status:'error',latestDate:null,message:error.message.slice(0,160)});}
  }
  data.market=[...market.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.metal.localeCompare(b.metal));data.fx=[...fx.values()].sort((a,b)=>a.date.localeCompare(b.date));
  for(const [metal,info] of Object.entries(metals)){const date=data.market.filter(r=>r.metal===metal&&r.cash!==null).at(-1)?.date;if(!date)missing.push('Chybí cena '+info.name);}
  let expected=new Date(now);expected.setUTCDate(expected.getUTCDate()-1);const holidays=new Set(data.calendar?.holidays??[]);while([0,6].includes(expected.getUTCDay())||holidays.has(expected.toISOString().slice(0,10)))expected.setUTCDate(expected.getUTCDate()-1);const expectedDate=expected.toISOString().slice(0,10);
  for(const [metal,info] of Object.entries(metals))for(const field of ['cash','threeMonth','stocks']){const last=data.market.filter(r=>r.metal===metal&&r[field]!==null).at(-1)?.date;if(last&&last<expectedDate)missing.push(`${info.name} ${field}: zdroj zatím neposkytl den ${expectedDate}; poslední hodnota ${last}.`);}
  const indexes=await collectInflation({download,now});for(const source of indexes.sources)addSource(source);const indexMap=new Map(data.inflation.map(r=>[r.series+'/'+r.month,r]));for(const r of indexes.inflation){const old=indexMap.get(r.series+'/'+r.month);if(!old||old.value!==r.value){indexMap.set(r.series+'/'+r.month,r);loaded++;}}data.inflation=[...indexMap.values()].sort((a,b)=>a.series.localeCompare(b.series)||a.month.localeCompare(b.month));sourceStatus.push(...indexes.sourceStatus);missing.push(...indexes.missing);notices.push(...indexes.missing.map(m=>'Inflační zdroj: '+m));
  const inflationNotice='Inflační indexy nejsou v tomto snímku doplněny; srovnání bez ověřených indexů se nepočítá.';
  if(!data.inflation.length)notices.push(inflationNotice);
  data.notices=[...new Set([...data.notices.filter(n=>n!==inflationNotice&&!n.startsWith('Inflační zdroj:')&&!n.includes('řádků s neshodou EN/DE')), ...notices])];
  data.generatedAt=new Date().toISOString();data.runs.push({id:'collect-'+data.generatedAt.replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,6),startedAt,finishedAt:data.generatedAt,status:missing.length?'partial':'ok',loaded,missing,validation:'passed',message:'Deterministický sběr veřejných tabulek. Starší historie a reporty zachovány.',sourceStatus});
  const check=validateSnapshot(data);if(!check.ok)throw Error('Kandidát neprošel validací: '+check.errors.join('; '));
  await mkdir(path.dirname(target),{recursive:true});await writeFile(target,JSON.stringify(data,null,2)+'\n');console.log('Připraven kandidát '+target+'; '+loaded+' nových/opravených záznamů, '+missing.length+' omezení.');return data;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);if(args.includes('--help')){console.log('node tools/collect.mjs [--history] [--from-year 2021] [--output .local/candidate.json]\nDenní režim znovu ověří aktuální rok; historie načte roky od 2021. Nikdy nepřepisuje publikovaný snímek.');process.exit(0);}
  const option=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
  try{await collect({history:args.includes('--history'),fromYear:option('--from-year')===null?null:Number(option('--from-year')),output:path.resolve(root,option('--output')??'.local/candidate.json')});}catch(error){console.error(error.message);process.exitCode=1;}
}
