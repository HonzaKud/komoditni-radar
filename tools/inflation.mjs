import {readFile,writeFile,mkdir,rename,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function parseEurostat(text){const d=JSON.parse(text);if(d.class!=='dataset'||!d.id?.includes('time')||d.size.some((size,i)=>d.id[i]!=='time'&&size!==1))throw Error('Eurostat nevrátil jedinou jednoznačnou řadu.');const time=d.dimension.time.category.index,rows=[];for(const [month,i] of Object.entries(time)){const value=d.value?.[i];if(typeof value==='number'&&Number.isFinite(value)&&value>0)rows.push({month,value});}if(!rows.length)throw Error('Eurostat nemá hodnoty pro zvolený ukazatel.');return rows.sort((a,b)=>a.month.localeCompare(b.month));}
export function* csvRecords(text){let record=[],field='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){record.push(field);field='';}else if(c==='\n'&&!quoted){record.push(field.replace(/\r$/,''));if(record.some(Boolean))yield record;record=[];field='';}else if(c!=='\r'||quoted)field+=c;}if(field||record.length){record.push(field);yield record;}if(quoted)throw Error('Neukončená CSV hodnota.');}
export function parseCsu(text){let header=null,indices;const values=new Map();for(const r of csvRecords(text.replace(/^\uFEFF/,''))){if(!header){header=r;indices=Object.fromEntries(['IndicatorType','TYPUDAJE4A','CZCOICOP2.CZCOP1','CZCOICOP2.CZCOP23','EKAKTIOCDS','UZ02P','CASMKMQRM12','Hodnota'].map(k=>[k,header.indexOf(k)]));if(Object.values(indices).some(i=>i<0))throw Error('Změnilo se schéma CSV ČSÚ.');continue;}const v=k=>r[indices[k]];if(v('IndicatorType')!=='6134'||v('TYPUDAJE4A')!=='IZ2025'||v('CZCOICOP2.CZCOP1')!=='0'||v('CZCOICOP2.CZCOP23')!==''||v('EKAKTIOCDS')!=='0'||v('UZ02P')!=='CZ'||!/^\d{4}-\d{2}$/.test(v('CASMKMQRM12')))continue;const month=v('CASMKMQRM12'),value=Number(v('Hodnota').replace(',','.'));if(!(Number.isFinite(value)&&value>0))continue;if(values.has(month)&&values.get(month)!==value)throw Error('Neshodné duplicitní měsíční indexy ČSÚ.');values.set(month,value);}if(!values.size)throw Error('Nenalezen bazický CPI Česka 2025=100.');return [...values].map(([month,value])=>({month,value})).sort((a,b)=>a.month.localeCompare(b.month));}
export function parseBls(text){const d=JSON.parse(text),series=d.Results?.series?.find(s=>s.seriesID==='CUUR0000SA0');if(d.status!=='REQUEST_SUCCEEDED'||!series)throw Error('BLS nevrátil požadovanou NSA řadu CUUR0000SA0.');const rows=series.data.filter(r=>/^M(0[1-9]|1[0-2])$/.test(r.period)).map(r=>({month:r.year+'-'+r.period.slice(1),value:Number(r.value)})).filter(r=>Number.isFinite(r.value)&&r.value>0);if(!rows.length)throw Error('BLS nevrátil měsíční indexy.');return rows.sort((a,b)=>a.month.localeCompare(b.month));}
function expectedMonth(now,releaseDay){const d=new Date(now);const offset=d.getUTCDate()>=releaseDay?1:2;d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-offset);return d.toISOString().slice(0,7);}
export async function collectInflation({download,now,force=false}){
  const year=Number(now.slice(0,4)),definitions=[
    {series:'cz-cpi',id:'csu-cpi-2025',name:'ČSÚ · CPI Česko · domácnosti celkem · 2025=100',url:'https://data.csu.gov.cz/opendata/sady/CEN0101E/distribuce/csv',parser:parseCsu,release:12},
    {series:'cz-ppi',id:'eurostat-cz-ppi-2021',name:'Eurostat / ČSÚ · PPI Česko B–E36 · NSA · 2021=100',url:'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/sts_inpp_m?lang=en&freq=M&unit=I21&s_adj=NSA&nace_r2=B-E36&indic_bt=PRC_PRR&geo=CZ&sinceTimePeriod=2021-01',parser:parseEurostat,release:20},
    {series:'ea-hicp',id:'eurostat-ea-hicp-2025',name:'Eurostat · HICP eurozóna, měnící se složení · 2025=100',url:'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?lang=en&freq=M&unit=I25&coicop18=TOTAL&geo=EA&sinceTimePeriod=2021-01',parser:parseEurostat,release:18},
    {series:'us-cpi',id:'bls-us-cpi-nsa',name:'BLS · CPI-U USA CUUR0000SA0 · NSA · 1982–1984=100',url:'https://api.bls.gov/publicAPI/v2/timeseries/data/CUUR0000SA0',fetchUrl:`https://api.bls.gov/publicAPI/v2/timeseries/data/CUUR0000SA0?startyear=${Math.max(2021,year-9)}&endyear=${year}`,parser:parseBls,release:15}
  ];
  const file=path.join(root,'.local/inflation-cache.json');let cache={};try{cache=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')cache={};}
  const sources=[],inflation=[],sourceStatus=[],missing=[];
  for(const def of definitions){sources.push({id:def.id,name:def.name,url:def.url,kind:'primary'});let entry=cache[def.series],error=null;
    if(force||!entry?.rows?.length||(entry.rows.at(-1).month<expectedMonth(now,def.release)&&entry.checkedDay!==now.slice(0,10))){
      try{const rows=def.parser(await download(def.fetchUrl??def.url)).filter(r=>r.month>='2021-01'&&r.month<=now.slice(0,7));if(!rows.length)throw Error('Chybí indexy od roku 2021.');entry={rows,retrievedAt:now,checkedDay:now.slice(0,10)};cache[def.series]=entry;}
      catch(e){error=e.message;missing.push(def.series+': '+error.slice(0,180));if(entry)entry.checkedDay=now.slice(0,10);}
    }
    if(entry?.rows?.length){for(const r of entry.rows)inflation.push({...r,series:def.series,sourceId:def.id,retrievedAt:entry.retrievedAt});const month=entry.rows.at(-1).month;sourceStatus.push({sourceId:def.id,status:error?'partial':'ok',latestDate:month+'-01',message:`Poslední dostupný měsíc ${month}; kontrola ${entry.checkedDay}. ${error?'Nové načtení selhalo, platí dříve ověřené indexy.':''}`});}
    else sourceStatus.push({sourceId:def.id,status:'error',latestDate:null,message:error??'Index nebyl načten.'});
    console.log(`Inflace ${def.series}: ${entry?.rows?.length??0} měsíců${error?' · '+error.slice(0,100):''}.`);
  }
  await mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';try{await writeFile(temp,JSON.stringify(cache),{flag:'wx'});await rename(temp,file);}finally{await unlink(temp).catch(()=>{});}
  return {sources,inflation,sourceStatus,missing};
}
