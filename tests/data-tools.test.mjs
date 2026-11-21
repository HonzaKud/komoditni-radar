import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateSnapshot} from '../tools/validate.mjs';
import {acceptCandidate} from '../tools/accept.mjs';
import {parseCnb,parseWestmetall} from '../tools/collect.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','.local');
function fixture(){return {schemaVersion:1,generatedAt:'2026-11-21T09:00:00Z',sources:[{id:'west',name:'Westmetall',url:'https://www.westmetall.com/',kind:'secondary'},{id:'cnb',name:'ČNB',url:'https://www.cnb.cz/',kind:'primary'}],market:[{metal:'copper',date:'2026-11-19',cash:12570,threeMonth:null,stocks:null,sourceIds:['west'],verification:'Dvě jazykové verze stejného zdroje.',retrievedAt:'2026-11-21T08:00:00Z',reasons:{threeMonth:'Zdroj chybí.',stocks:'Zdroj chybí.'}}],fx:[{date:'2026-11-19',usdCzk:22,eurCzk:24,sourceId:'cnb',retrievedAt:'2026-11-21T08:00:00Z'}],inflation:[],dailyReports:[],weeklyReports:[],runs:[],exclusions:[],notices:[]};}
test('ČNB mění během roku seznam měn; parser respektuje novou hlavičku',()=>{
  const rows=parseCnb('Date|1 EUR|100 RUB|1 USD\n01.03.2022|25|20|22\nDate|1 USD|1 EUR\n02.03.2022|23|26\n');assert.deepEqual(rows.map(r=>[r.usdCzk,r.eurCzk]),[[22,25],[23,26]]);
  const header='<tr><th>date</th><th>LME Cash</th><th>LME 3-month</th><th>LME stock</th></tr>';
  assert.equal(parseWestmetall(header+'<tr><td>20. November 2026</td><td>12,230.50</td><td>12,237.00</td><td>332,025</td></tr>')[0].cash,12230.5);
});
test('Validátor odmítne ztracené důvody, duplicity, nečíselné ceny a nebezpečné URL',()=>{
  assert.equal(validateSnapshot(fixture()).ok,true);
  const a=fixture();delete a.market[0].reasons.stocks;assert.equal(validateSnapshot(a).ok,false);
  const b=fixture();b.market.push({...b.market[0]});assert.equal(validateSnapshot(b).ok,false);
  const c=fixture();c.market[0].cash=NaN;assert.equal(validateSnapshot(c).ok,false);
  const d=fixture();d.sources[0].url='https://user:password@example.com/';assert.equal(validateSnapshot(d).ok,false);
  const wrongFx=fixture();wrongFx.fx[0].sourceId='west';assert.equal(validateSnapshot(wrongFx).ok,false);
  const e=fixture();e.market[0].verification='SEL'+'LIER & BEL'+'LOT';assert.equal(validateSnapshot(e).ok,false);
  assert.equal(validateSnapshot({}).ok,false);assert.equal(validateSnapshot(null).ok,false);
  const reportData=fixture();const report={id:'r',date:'2026-11-21',dataThrough:'2026-11-19',revision:1,createdAt:'2026-11-21T09:00:00Z',title:'Report',summary:'Shrnutí',outlook:'Výhled',metals:['copper'],risk:{overall:3,copper:3,zinc:3,lead:3},riskNotes:{overall:'Text',copper:'Text',zinc:'Text',lead:'Text'},sources:['west'],watch:[],decisionPoints:[],factors:[],sections:[],scenarios:[],bullBear:[],forecasts:[]};reportData.dailyReports.push(report);assert.equal(validateSnapshot(reportData).ok,true);report.risk['<img src=x onerror=alert(1)>']=1;assert.equal(validateSnapshot(reportData).ok,false);
});
test('Chybný kandidát a odstranění historie nezmění soubor; validní doplnění se přijme',async()=>{
  await mkdir(root,{recursive:true});const dir=await mkdtemp(path.join(root,'accept-test-'));
  const target=path.join(dir,'snapshot.json'),candidate=path.join(dir,'candidate.json');
  const hash=async()=>createHash('sha256').update(await readFile(target)).digest('hex');
  try{
    await writeFile(target,JSON.stringify(fixture()));const original=await hash();
    await writeFile(candidate,'{bad');await assert.rejects(acceptCandidate(candidate,target));assert.equal(await hash(),original);
    const missing=fixture();missing.market=[];await writeFile(candidate,JSON.stringify(missing));await assert.rejects(acceptCandidate(candidate,target));assert.equal(await hash(),original);
    const removedFx=fixture();removedFx.fx=[];await writeFile(candidate,JSON.stringify(removedFx));await assert.rejects(acceptCandidate(candidate,target));assert.equal(await hash(),original);
    const next=fixture();next.market.push({...next.market[0],date:'2026-11-20',cash:12600});await writeFile(candidate,JSON.stringify(next));await acceptCandidate(candidate,target);assert.equal(JSON.parse(await readFile(target,'utf8')).market.length,2);
  }finally{if(!path.resolve(dir).startsWith(root+path.sep))throw Error('Neočekávaná cesta úklidu.');await rm(dir,{recursive:true,force:true});}
});
