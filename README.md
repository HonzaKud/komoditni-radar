# Komoditní radar

Český přehled mědi, zinku a olova. Statický web, který při otevření nepotřebuje AI, databázový server ani přihlášení. Čte jediný ověřený snímek `data/snapshot.json`.

## Provoz

- Zamýšlená adresa: https://honzakud.github.io/komoditni-radar/
- Ceny: veřejné tabulky Westmetall, dvě jazyková čtení stejného zdroje; Wieland jako záloha Cash mědi a zinku.
- Kurzy: ČNB, historický kurz pro každé datum.
- AI píše komentář, faktory a scénáře. Výpočty provádí `lib/analytics.mjs`.
- Běžná aktualizace mění pouze `data/snapshot.json`. Chybný kandidát se nepřijme a při neúspěšném testu/build procesu se předchozí Pages nasazení nemění.
- Originální databáze předchozího řešení nebyla dostupná. Historie cen se rekonstruuje z veřejných zdrojů; původní archiv reportů a revizí se nepředstírá.

## Místní spuštění

Node.js 22+ a Python 3 pro jednoduchý náhled. Žádné npm balíčky ani AI API klíč nejsou potřeba.

```powershell
cd C:\Users\Johnny\komoditni-radar
node --test
node tools/validate.mjs
node tools/build.mjs
python -m http.server 4340 --bind 127.0.0.1 --directory dist
```

Potom otevři http://127.0.0.1:4340/ .

## Aktualizace

Přesný postup obsahuje [AUTOMATION_PROMPT.md](AUTOMATION_PROMPT.md). Ranní běh zpracovává předchozí obchodní den. Zpoždění zdroje se přiznává a chybění se nedoplňuje nulou, průměrem ani starou hodnotou pod novým datem.

Plánovaný běh v desktopové aplikaci vyžaduje dostupný počítač a běžící přihlášenou aplikaci. Samotný web na tomto počítači nezávisí. Není zřízené placené API ani server; AI běh používá limity účtu, do kterého je naplánován. Dostupnost a limity předplatného se mohou měnit.

## Metodika a omezení

Cash a 3M jsou různé kontrakty; 3M není tříměsíční průměr. Cash–3M se počítá pouze ze stejného dne. Přepočty jsou orientační, bez prémií, dopravy, zpracování, daní a smluvních položek. Veřejné tabulky jsou sekundární zdroj a shoda EN/DE není nezávislé potvrzení burzou. Reporty rozlišují fakt, interpretaci a scénář a nenahrazují odborné posouzení.

Licence cenových dat se řídí podmínkami poskytovatele a oprávněním provozovatele; veřejná dostupnost stránky sama není licencí k další distribuci. Zdrojový kód neobsahuje licenční smlouvy ani přístupové údaje.
