import test from 'node:test';
import assert from 'node:assert/strict';
import {latest,convert,change,spread,quarterStats,monthlySeries,inflationComparison} from '../lib/analytics.mjs';
const row=(date,cash,threeMonth=null,stocks=10)=>({metal:'copper',date,cash,threeMonth,stocks});
const fixture=market=>({market,fx:[],inflation:[]});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('Chybějící ceny nejsou nuly a spread nikdy nemíchá různá data',()=>{
  const d=fixture([row('2026-01-02',100),row('2026-01-05',null,90)]);
  assert.equal(latest(d,'copper').date,'2026-01-02');assert.equal(spread(d,'copper').value,null);
  const e=fixture([...d.market,row('2026-01-06',110,102,0)]);assert.equal(spread(e,'copper').value,8);assert.equal(spread(e,'copper').date,'2026-01-06');assert.equal(latest(e,'copper','stocks').stocks,0);
});
test('Přepočty používají poslední minulý kurz a měsíční změna ošetří konec února',()=>{
  const d=fixture([]);d.fx=[{date:'2026-01-06',usdCzk:22,eurCzk:24},{date:'2026-01-10',usdCzk:30,eurCzk:25}];
  close(convert(d,100,'2026-01-08','EUR').value,100*22/24);assert.equal(convert(d,100,'2026-01-05','CZK').value,null);assert.equal(convert(d,100,'2026-02-01','CZK').value,null);
  const e=fixture([row('2025-02-28',100),row('2025-03-31',120)]);const c=change(e,'copper','cash','month');assert.equal(c.fromDate,'2025-02-28');close(c.value,20);
});
test('Kvartální průměr vyžaduje alespoň 85 % dní a respektuje UK svátek',()=>{
  const poor=quarterStats(fixture([row('2026-01-02',100)]),'copper','cash','2026-01-06');assert.equal(poor.current.value,null);assert.match(poor.current.reason,/85/);
  const good=quarterStats(fixture([row('2026-01-02',90),row('2026-01-05',100),row('2026-01-06',110)]),'copper','cash','2026-01-06');assert.equal(good.current.count,3);assert.equal(good.current.coverage,1);assert.equal(good.current.value,100);
});
test('Reálná inflace je podíl indexů, přesný chybějící rok nebo kurz se neodhadne',()=>{
  const dates={2021:[4,5,6,7,8,11,12,13,14,15],2025:[2,3,6,7,8,9,10,13,14,15],2026:[2,5,6,7,8,9,12,13,14,15]};
  const d=fixture(Object.entries(dates).flatMap(([year,days])=>days.map(n=>row(`${year}-01-${String(n).padStart(2,'0')}`,year==='2021'?90:year==='2025'?100:110))));d.inflation=[{series:'us-cpi',month:'2021-01',value:80},{series:'us-cpi',month:'2025-01',value:100},{series:'us-cpi',month:'2026-01',value:105}];
  const r=inflationComparison(d,'copper','us-cpi');close(r.metalYoY,10);close(r.inflationYoY,5);close(r.realYoY,(1.1/1.05-1)*100);assert.equal(monthlySeries(d,'copper','us-cpi')[0].real,100);
  assert.equal(inflationComparison(d,'copper','us-cpi','2026-01-10').month,'2025-01');
  const missing=structuredClone(d);missing.inflation=missing.inflation.filter(r=>r.month!=='2025-01');assert.equal(inflationComparison(missing,'copper','us-cpi').realYoY,null);
  const noFx=structuredClone(d);noFx.inflation=noFx.inflation.map(r=>({...r,series:'cz-cpi'}));assert.equal(inflationComparison(noFx,'copper','cz-cpi').realYoY,null);
  const nine=structuredClone(d);nine.market=nine.market.filter(r=>r.date!=='2026-01-15');assert.notEqual(inflationComparison(nine,'copper','us-cpi').month,'2026-01');
});
