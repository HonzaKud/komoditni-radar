# Stav projektu

Aktualizováno 21. 11. 2026.

## Cíl
Nezávislý statický Komoditní radar pro měď, zinek a olovo na osobním GitHubu HonzaKud. Web funguje bez AI; ranní běh pouze aktualizuje ověřený JSON. Výpadek nesmí znefunkčnit web nebo přepsat poslední správná data.

## Rozhodnutí a podklady
- Zadání a dva osobní e-maily z 20. 11. 2026: souhrn a 18 screenshotů. Obrázky prohlédnuté, uloženy mimo repozitář.
- Původní vzor HonzaKud/sb-tender-radar ověřen přes připojený GitHub.
- Původní JSON není k dispozici; uživatel žádá rekonstrukci z veřejných zdrojů. Archiv původních textů a revizí nelze prohlásit za migrovaný.
- Uživatel potvrzuje existující licenci LME a zadal veřejné nasazení na osobním GitHub Pages. Nasazení vychází z tohoto potvrzení; smlouva a její konkrétní rozsah nebyly nezávisle ověřeny. Žádné placené služby se nezřizují.
- Bez firemních názvů, log a interních údajů v publikovaném obsahu.
- Vanilla HTML/CSS/JS, SVG grafy bez CDN; data/snapshot.json jako jediný snímek, striktní validace před nasazením.

## Aktuální stav
Aplikace, grafy, reporty, metodika a provozní přehled jsou implementované. Obnoveno 4 464 tržních řádků, 1 480 kurzů ČNB a 278 měsíčních indexů CPI/PPI/HICP/USA od roku 2021. Aktuální tržní den 20. 11. 2026. První spouštěcí denní a označené zkušební týdenní vydání jsou z 21. 11.; skutečné lokální opravy jsou uchované jako revize. Původní archiv není převzatý.

Zbývá dokončit vizuální kontrolu, nahrát ověřenou verzi a potvrdit živé GitHub Pages, poté aktivovat ranní úlohu. Nic zatím neoznačovat za nasazené nebo automaticky běžící.

## Dosud ověřeno
Založený repozitář `https://github.com/HonzaKud/komoditni-radar`, zdroj Pages nastaven na GitHub Actions. Místní Git používá noreply adresu; náhled push potvrdil oprávnění. Všech 11 testů prošlo, včetně atomického zachování souboru při chybě, nemazání historie, výpočtů kurzů/kvartálů/inflace a parserů měnících se hlaviček. Nezávisle ověřeny numerické hraniční případy; nezávislá kontrola našla a po opravě potvrdila odstranění HTML injekce přes extra rizikový klíč. Běžný sběr byl vyzkoušen i při opakování bez nových dat, nezduplikoval historii a zachoval reporty. Přehled skutečně otevřen a vizuálně porovnán v Edge.

## Provozní omezení
Denní AI úloha bude místní: vyžaduje zapnutý počítač a přihlášenou běžící desktopovou aplikaci. Web na této dostupnosti nezávisí. Číselné tabulky starších reportů se přepočítávají z aktuálně ověřené historie s časovým řezem; původní texty a revize jsou neměnné. Tato vlastnost je výslovně uvedena v rozhraní. Chybějící zdrojová pozorování a referenční měsíce se neodhadují. Oficiální indexy se načítají až po očekávaném zveřejnění; velké CSV ČSÚ nečte AI, zpracuje ho místní parser a uchovává se malá mezipaměť.

## Kritéria přijetí
Šest záložek, filtry a grafy, přesná data/provenance a důvody chybění, reporty/revize, export a tisk. Chybný JSON nebo selhání aktualizace zachová publikovanou verzi. Automatická AI nesmí upravovat aplikaci. Ověřit desktop a mobil a skutečný průchod aktualizace.
