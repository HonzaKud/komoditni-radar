import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEurostat,parseCsu,parseBls} from '../tools/inflation.mjs';
test('Eurostat musí být jedna datová řada, nikoli směs ukazatelů',()=>{
  const d={class:'dataset',id:['geo','time'],size:[1,2],dimension:{time:{category:{index:{'2026-09':0,'2026-10':1}}}},value:{0:104,1:105}};assert.equal(parseEurostat(JSON.stringify(d)).length,2);assert.throws(()=>parseEurostat(JSON.stringify({...d,size:[2,2]})));
});
test('ČSÚ vybere úhrn domácností, pevný základ a jednotlivý měsíc',()=>{
  const head=['IndicatorType','TYPUDAJE4A','CZCOICOP2.CZCOP1','CZCOICOP2.CZCOP23','EKAKTIOCDS','UZ02P','CASMKMQRM12','Hodnota'];const rows=[head,['6134','IZ2025','0','','0','CZ','2026-10','107.7'],['6134','IZ2025','0','','0','CZ','2026-10K','107.7'],['6134','IZ2025','0','','2','CZ','2026-10','108.5'],['6134','PMR','0','','0','CZ','2026-10','102.4']];const csv=rows.map(r=>r.map(v=>'"'+v+'"').join(',')).join('\r\n');assert.deepEqual(parseCsu(csv),[{month:'2026-10',value:107.7}]);
});
test('BLS ignoruje roční M13 a nepřijme sezónně očištěnou řadu',()=>{
  const d={status:'REQUEST_SUCCEEDED',Results:{series:[{seriesID:'CUUR0000SA0',data:[{year:'2026',period:'M10',value:'337.511'},{year:'2025',period:'M13',value:'320'}]}]}};assert.deepEqual(parseBls(JSON.stringify(d)),[{month:'2026-10',value:337.511}]);d.Results.series[0].seriesID='CUSR0000SA0';assert.throws(()=>parseBls(JSON.stringify(d)));
});
