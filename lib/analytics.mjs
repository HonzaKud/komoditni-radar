const cache=new WeakMap();
const valid=v=>typeof v==='number'&&Number.isFinite(v);
const dayMs=86400000;
const day=v=>new Date(v+'T00:00:00Z');
const iso=d=>d.toISOString().slice(0,10);
const addDays=(v,n)=>iso(new Date(day(v).getTime()+n*dayMs));
const diffDays=(a,b)=>(day(a)-day(b))/dayMs;
const fallbackHolidays=new Set(('2021-01-01 2021-04-02 2021-04-05 2021-05-03 2021-05-31 2021-08-30 2021-12-27 2021-12-28 2022-01-03 2022-04-15 2022-04-18 2022-05-02 2022-06-02 2022-06-03 2022-08-29 2022-09-19 2022-12-26 2022-12-27 2023-01-02 2023-04-07 2023-04-10 2023-05-01 2023-05-08 2023-05-29 2023-08-28 2023-12-25 2023-12-26 2024-01-01 2024-03-29 2024-04-01 2024-05-06 2024-05-27 2024-08-26 2024-12-25 2024-12-26 2025-01-01 2025-04-18 2025-04-21 2025-05-05 2025-05-26 2025-08-25 2025-12-25 2025-12-26 2026-01-01 2026-04-03 2026-04-06 2026-05-04 2026-05-25 2026-08-31 2026-12-25 2026-12-28').split(' '));
function index(data){if(cache.has(data))return cache.get(data);const result={market:{},fx:[...(data.fx??[])].sort((a,b)=>a.date.localeCompare(b.date)),inflation:{},monthly:{},holidays:new Set([...fallbackHolidays,...(data.calendar?.holidays??[])])};for(const metal of ['copper','zinc','lead']){const raw=(data.market??[]).filter(r=>r.metal===metal).sort((a,b)=>a.date.localeCompare(b.date));result.market[metal]={raw};for(const field of ['cash','threeMonth','stocks'])result.market[metal][field]=raw.filter(r=>valid(r[field]));result.market[metal].spread=raw.filter(r=>valid(r.cash)&&valid(r.threeMonth));}for(const r of data.inflation??[])(result.inflation[r.series]??=[]).push(r);for(const rows of Object.values(result.inflation))rows.sort((a,b)=>a.month.localeCompare(b.month));cache.set(data,result);return result;}
function before(rows,date,key='date'){let lo=0,hi=rows.length;while(lo<hi){const mid=(lo+hi)>>>1;if(rows[mid][key]<=date)lo=mid+1;else hi=mid;}return rows[lo-1]??null;}
function monthBack(date,n){const d=day(date),wanted=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-n);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(wanted,last));return iso(d);}
export function latest(data,metal,field='cash',asOf=null){return before(index(data).market[metal]?.[field]??[],asOf??'9999-12-31');}
export function fxAt(data,date){const r=before(index(data).fx,date);return r&&valid(r.usdCzk)&&r.usdCzk>0&&valid(r.eurCzk)&&r.eurCzk>0&&diffDays(date,r.date)<=7?r:null;}
export function convert(data,value,date,currency='USD'){
  if(!valid(value))return {value:null,fxDate:null,reason:'Chybí cena.'};
  if(currency==='USD')return {value,fxDate:null,reason:null};
  if(!['EUR','CZK'].includes(currency))return {value:null,fxDate:null,reason:'Neznámá měna.'};
  const fx=fxAt(data,date);if(!fx)return {value:null,fxDate:null,reason:'Chybí kurz ČNB stejného nebo posledního předchozího dne (nejvýše 7 dní).'};
  return {value:value*fx.usdCzk/(currency==='EUR'?fx.eurCzk:1),fxDate:fx.date,reason:null};
}
export function change(data,metal,field,period,asOf=null){
  const rows=index(data).market[metal]?.[field]??[],current=latest(data,metal,field,asOf);const missing=reason=>({value:null,fromDate:null,toDate:current?.date??null,reason});if(!current)return missing('Chybí konečná hodnota.');
  let reference=null,target=null,tolerance=5;
  if(period==='day'){reference=before(rows,addDays(current.date,-1));if(reference&&diffDays(current.date,reference.date)>7)reference=null;}
  else{if(period==='week'){target=addDays(current.date,-7);tolerance=4;}else if(period==='month')target=monthBack(current.date,1);else if(period==='year')target=monthBack(current.date,12);else if(period==='qtd'){const d=day(current.date);target=iso(new Date(Date.UTC(d.getUTCFullYear(),Math.floor(d.getUTCMonth()/3)*3,0)));tolerance=7;}else if(period==='ytd'){target=current.date.slice(0,4)+'-01-01';target=addDays(target,-1);tolerance=7;}else return missing('Neznámé období.');reference=before(rows,target);if(reference&&diffDays(target,reference.date)>tolerance)reference=null;}
  if(!reference||reference[field]===0)return missing('Chybí srovnatelný referenční den nebo je základ nulový.');
  return {value:(current[field]/reference[field]-1)*100,fromDate:reference.date,toDate:current.date,reason:null};
}
export function spread(data,metal,asOf=null){const r=before(index(data).market[metal]?.spread??[],asOf??'9999-12-31');return r?{value:r.cash-r.threeMonth,date:r.date,reason:null}:{value:null,date:null,reason:'Chybí Cash a 3M ze stejného dne.'};}
function calendarKnown(data,year){return data.calendar?.years?.includes(year)||(year>=2021&&year<=2026);}
function businessDays(data,from,to){const holidays=index(data).holidays;let count=0;for(let date=from;date<=to;date=addDays(date,1)){if(!calendarKnown(data,Number(date.slice(0,4))))return null;const weekday=day(date).getUTCDay();if(weekday!==0&&weekday!==6&&!holidays.has(date))count++;}return count;}
export function quarterStats(data,metal,field,asOf=null){
  const end=asOf??latest(data,metal,field)?.date;if(!end){const empty={value:null,fromDate:null,toDate:null,count:0,coverage:0,reason:'Chybí data.'};return {current:empty,previous:{...empty},change:null};}
  const d=day(end),q=Math.floor(d.getUTCMonth()/3)*3,from=iso(new Date(Date.UTC(d.getUTCFullYear(),q,1))),previousTo=addDays(from,-1),p=day(previousTo),previousFrom=iso(new Date(Date.UTC(p.getUTCFullYear(),Math.floor(p.getUTCMonth()/3)*3,1)));
  const stats=(start,stop)=>{const rows=(index(data).market[metal]?.[field]??[]).filter(r=>r.date>=start&&r.date<=stop),expected=businessDays(data,start,stop),coverage=expected?rows.length/expected:null;const reason=expected===null?'Chybí ověřený kalendář obchodních dnů.':!rows.length?'Chybí hodnoty.':coverage<0.85?'Pokrytí je pod 85 % obchodních dnů.':null;return {value:reason?null:rows.reduce((sum,r)=>sum+r[field],0)/rows.length,fromDate:start,toDate:stop,count:rows.length,coverage,reason};};
  const current=stats(from,end),previous=stats(previousFrom,previousTo);return {current,previous,change:valid(current.value)&&valid(previous.value)&&previous.value!==0?(current.value/previous.value-1)*100:null};
}
const seriesCurrency={'cz-cpi':'CZK','cz-ppi':'CZK','ea-hicp':'EUR','us-cpi':'USD'};
function monthlyRaw(data,metal,series){
  const idx=index(data),key=metal+'/'+series;if(idx.monthly[key])return idx.monthly[key];const groups=new Map();for(const r of idx.market[metal]?.raw??[]){const month=r.date.slice(0,7);if(!groups.has(month))groups.set(month,[]);groups.get(month).push(r);}
  const prices=new Map();for(const [month,rows] of groups){const values=rows.map(r=>convert(data,r.cash,r.date,seriesCurrency[series])).filter(r=>valid(r.value));const missingFx=rows.some(r=>valid(r.cash)&&!valid(convert(data,r.cash,r.date,seriesCurrency[series]).value));prices.set(month,{value:values.length>=10&&!missingFx?values.reduce((s,r)=>s+r.value,0)/values.length:null,reason:missingFx?'Chybí historický kurz pro některý den.':values.length<10?'Méně než 10 platných obchodních dnů.':null});}
  const inflation=new Map((idx.inflation[series]??[]).map(r=>[r.month,r.value]));const all=[...new Set([...prices.keys(),...inflation.keys()])].sort();const output=all.map(month=>({month,metal:prices.get(month)?.value??null,inflation:inflation.get(month)??null,reason:prices.get(month)?.reason??(!prices.has(month)?'Chybí měsíční cena.':!inflation.has(month)?'Chybí inflační index.':null)}));idx.monthly[key]=output;return output;
}
export function monthlySeries(data,metal,series){
  const rows=monthlyRaw(data,metal,series),base=rows.find(r=>valid(r.metal)&&valid(r.inflation));if(!base)return rows.map(r=>({...r,metal:null,inflation:null,real:null,reason:r.reason??'Chybí společný základ.'}));
  return rows.map(r=>{const m=valid(r.metal)?r.metal/base.metal*100:null,i=valid(r.inflation)?r.inflation/base.inflation*100:null;return {month:r.month,metal:m,inflation:i,real:valid(m)&&valid(i)?m/i*100:null,reason:r.reason};});
}
export function inflationComparison(data,metal,series,asOf=null){
  const rows=monthlyRaw(data,metal,series).filter(r=>!asOf||r.month<asOf.slice(0,7)),current=rows.filter(r=>valid(r.metal)&&valid(r.inflation)).at(-1);const empty={month:current?.month??null,metalYoY:null,inflationYoY:null,realYoY:null,metalSince2021:null,inflationSince2021:null,realSince2021:null,reason:'Chybí společná cena kovu a inflační index.'};if(!current)return empty;
  const previousMonth=String(Number(current.month.slice(0,4))-1)+current.month.slice(4),year=rows.find(r=>r.month===previousMonth),base=rows.find(r=>r.month==='2021-01');const result={...empty,reason:null};
  for(const [ref,suffix] of [[year,'YoY'],[base,'Since2021']])if(ref&&valid(ref.metal)&&valid(ref.inflation)&&ref.metal>0&&ref.inflation>0){const m=current.metal/ref.metal,i=current.inflation/ref.inflation;result['metal'+suffix]=(m-1)*100;result['inflation'+suffix]=(i-1)*100;result['real'+suffix]=(m/i-1)*100;}else result.reason='Část srovnání nemá přesný referenční měsíc.';
  return result;
}
