import test from 'node:test';
import assert from 'node:assert/strict';
import {appendReport} from '../tools/report.mjs';
test('Opakovaný report nevytváří revizi, změna archivuje starou verzi',()=>{
  const base={dailyReports:[],weeklyReports:[],generatedAt:'2026-11-20T08:00:00Z'};
  const input={date:'2026-11-20',title:'První vydání',summary:'Text'};
  const first=appendReport(base,input,'daily','2026-11-20T08:00:00Z');
  assert.equal(first.report.revision,1);assert.equal(base.dailyReports.length,0);
  const repeat=appendReport(first.snapshot,input,'daily','2026-11-20T09:00:00Z');
  assert.equal(repeat.changed,false);assert.equal(repeat.snapshot.dailyReports.length,1);
  assert.equal(appendReport(first.snapshot,{summary:'Text',title:'První vydání',date:'2026-11-20'}).changed,false);
  const correction=appendReport(first.snapshot,{...input,summary:'Oprava'},'daily','2026-11-20T09:00:00Z');
  assert.equal(correction.report.revision,2);assert.deepEqual(correction.snapshot.dailyReports[0],first.report);
});
