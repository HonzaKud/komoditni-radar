# Komoditní radar

Statický český web na GitHub Pages. Žádná AI ani externí služba není potřebná při otevření. Referenční screenshoty jsou mimo repozitář v ../komoditni-radar-private a nikdy se nepublikují.

## Rozdělení
- index.html, styles.css, app.js: rozhraní a grafy bez CDN závislostí.
- lib/analytics.mjs: deterministické výpočty sdílené browserem a nástroji.
- tools/: sběr dat, validace, atomické přijetí kandidáta, sestavení webu.
- data/snapshot.json: jediný publikovaný datový snímek.
- docs/: specifikace a provoz; .github/workflows/: validace a Pages.

## Data v1 (závazné rozhraní)
Kořen: {schemaVersion:1, generatedAt:ISO timestamp, sources:[{id,name,url,kind}], market:[], fx:[], inflation:[], dailyReports:[], weeklyReports:[], runs:[], exclusions:[], notices:[]}.
market řádek: {metal:'copper'|'zinc'|'lead',date:'YYYY-MM-DD',cash:number|null,threeMonth:number|null,stocks:number|null,sourceIds:string[],verification:string,retrievedAt:ISO timestamp,reasons:{cash?:string,threeMonth?:string,stocks?:string}}. Každá kombinace metal/date jediná. Hodnoty ze stejného data; neslučovat jiný den. null má důvod. Cena USD/t, zásoby t.
fx řádek: {date,usdCzk:number,eurCzk:number,sourceId:'cnb',retrievedAt}.
inflation řádek: {series:'cz-cpi'|'cz-ppi'|'ea-hicp'|'us-cpi',month:'YYYY-MM',value:number,sourceId:string,retrievedAt}.
Report: {id,date,revision:integer,title,summary,metals:string[],risk:{overall:1..5,copper:1..5,zinc:1..5,lead:1..5},riskNotes:{overall:string,copper:string,zinc:string,lead:string},factors:[{type:'fact'|'interpretation'|'scenario',title,text,sourceIds:string[],urls:string[]}],outlook:string,watch:string[],decisionPoints:string[],sources:string[],dataThrough:date,createdAt:timestamp,sections:[{title,text}],scenarios:[{horizon:'1–4 týdny'|'3–12 měsíců',title,text,confirms,invalidates}],bullBear:[{metal,bull,bear,evidence}],forecasts:[{institution,text,url,date}]}. Části mohou být prázdné, UI jasně přizná chybění. Report obsahuje jen text AI, čísla tabulek počítá lib/analytics.mjs. Revize se archivují jako další report se stejným date a zvýšenou revision. Původní archiv bez exportu se nevymýšlí.
run: {id,startedAt,finishedAt,status:'ok'|'partial'|'error',loaded:number,missing:string[],validation:'passed'|'failed',message:string,sourceStatus:[{sourceId,status,latestDate,message}]}.
exclusion: {metal,date,field,reason}; notices:string[].

Volitelný calendar: {holidays:ISO-date[],years:number[],sourceId:'uk-bank-holidays',retrievedAt:timestamp}. Ověřené UK svátky se obnovují z GOV.UK jako data; nepokryté budoucí roky nemají vypočtené kvartální pokrytí.

## Bezpečnost a kvalita
Pouze veřejné tržní údaje; žádné firemní názvy, loga nebo interní údaje v nasazovaném balíčku. Nevyplňovat chybění nulou ani vymyšlenou historií. Dva jazyky stejného zdroje nejsou nezávislé zdroje. Texty v JSON vykreslovat escapované, URL pouze http/https. Selhání kandidáta nesmí přepsat poslední platný snapshot. Automatický běh mění jen data, nikoli aplikaci. Nejsme sami v kódu; chránit souběžné změny.

## Ověření
node --test; node tools/validate.mjs; node tools/build.mjs. UI vizuálně ověřit desktop a mobil, záložky, filtry, grafy, kopírování, tisk a export.
