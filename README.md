# Fit Archive — Vue + Vite

Dashboard statica per analizzare localmente gli archivi ZIP di Google Takeout / Google Fit. Il progetto usa Vue 3, TypeScript e Vite; la decompressione e tutte le analisi avvengono nel browser e non richiedono un backend. Versione corrente: **2.1.0**.

## Requisiti

- Node.js **22.12+** (richiesto dalla linea Vite 8).
- npm incluso con Node.js.

## Sviluppo locale

```bash
npm install
npm run dev
```

Il server di sviluppo Vite mostra l'URL locale nella console.

## Type-check e build

```bash
npm run typecheck
npm run build
npm run preview
```

La build di produzione viene generata direttamente nella cartella **`docs/`**. In Vite l'opzione equivalente a `buildDir: "docs"` è `build.outDir: "docs"`, configurata in `vite.config.ts`. Il `base: './'` permette di usare gli asset sia su un dominio root sia sotto il percorso `/<repository>/` di GitHub Pages.

## Pubblicazione su GitHub Pages

1. Esegui `npm install` e `npm run build`.
2. Esegui il commit e il push dei sorgenti e della cartella generata `docs/`.
3. Nel repository apri **Settings → Pages**.
4. In **Build and deployment**, scegli **Deploy from a branch**, branch `main`, cartella **`/docs`**.
5. Salva e apri l'URL GitHub Pages mostrato da GitHub.

La build copia automaticamente `public/.nojekyll` in `docs/.nojekyll`.

## Struttura del progetto

```text
fit-archive/
├── index.html                 # HTML entry-point di Vite
├── vite.config.ts             # plugin Vue, base relativo e output docs/
├── tsconfig.json              # TypeScript strict
├── package.json               # dipendenze e script npm
├── public/
│   └── .nojekyll               # copiato nella build GitHub Pages
├── src/
│   ├── main.ts                 # bootstrap Vue e CSS globale
│   ├── App.vue                 # composizione principale della dashboard
│   ├── styles.css              # design system e layout responsive
│   ├── components/
│   │   ├── AppHeader.vue       # header, upload ZIP e drag & drop
│   │   ├── HelpDialog.vue      # modale con istruzioni Google Takeout
│   │   ├── KpiStrip.vue        # metriche all-time e intervalli temporali
│   │   ├── MonthlyBarsChart.vue# grafici mensili riutilizzabili
│   │   ├── DistributionChart.vue # istogramma, media, mediana e curva normale
│   │   ├── StepsSection.vue    # statistiche, classifiche e tabelle passi
│   │   └── SleepSection.vue    # statistiche, classifiche e tabelle sonno
│   ├── composables/
│   │   └── useFitArchive.ts    # stato importazione e messaggi UI
│   ├── services/
│   │   ├── googleFitParser.ts  # lettura ZIP, JSON/CSV e normalizzazione
│   │   └── exportCsv.ts        # esportazione dei dati giornalieri
│   ├── types/
│   │   └── fit.ts              # interfacce e tipi condivisi
│   └── utils/
│       ├── analytics.ts        # aggregazioni, classifiche e distribuzioni
│       ├── date.ts             # date locali e formattazione calendario
│       └── numbers.ts          # parsing e formattazione numerica
├── docs/                       # output generato da `npm run build`
└── JSZIP-LICENSE.markdown      # licenza della dipendenza JSZip
```

## Dove modificare cosa

| Necessità | File |
|---|---|
| Cambiare colori, spaziature, font e responsive layout | `src/styles.css` |
| Modificare l'header, il caricamento o il drag & drop | `src/components/AppHeader.vue` |
| Cambiare la guida Google Takeout | `src/components/HelpDialog.vue` |
| Modificare i KPI all-time | `src/components/KpiStrip.vue` |
| Cambiare il grafico mensile | `src/components/MonthlyBarsChart.vue` |
| Cambiare istogramma, media, mediana o curva | `src/components/DistributionChart.vue` e `src/utils/analytics.ts` |
| Aggiungere o modificare le statistiche dei passi | `src/components/StepsSection.vue` e `src/utils/analytics.ts` |
| Aggiungere o modificare le statistiche del sonno | `src/components/SleepSection.vue` e `src/utils/analytics.ts` |
| Adattare i formati JSON/CSV di Google Takeout | `src/services/googleFitParser.ts` |
| Modificare i tipi dei dati normalizzati | `src/types/fit.ts` |
| Modificare parsing/formato di date o numeri | `src/utils/date.ts`, `src/utils/numbers.ts` |

## Analisi disponibili

### Passi e distanza

- Media giornaliera e totale all-time, con intervallo specifico dei giorni usati.
- Medie annuali e mensili; matrice mensile compatta con anni sulle righe e mesi sulle colonne.
- Classifiche dei giorni con più passi e più chilometri.
- Distanza associata ai giorni in classifica quando è presente nell'export.
- Andamento mensile scorrevole sull’intera cronologia: rotella del mouse, Shift+rotella, trackpad, pulsanti di navigazione e swipe touch.
- Distribuzione dei passi giornalieri con istogramma, media e mediana evidenziate sopra le rispettive linee, assi X/Y con scale ricavate dai dati e curva normale di riferimento.

### Sonno

- Durata complessiva e media per notte all-time, con intervallo specifico delle notti usate.
- Totali e medie mensili e annuali.
- Classifiche delle notti e delle settimane con più e meno sonno.
- Giorno della settimana con durata media maggiore e minore.
- Andamento mensile scorrevole con gli stessi controlli desktop e mobile.
- Distribuzione delle ore di sonno con istogramma, media e mediana evidenziate sopra le rispettive linee, assi X/Y con scale ricavate dai dati e curva normale di riferimento.

Le schede KPI all-time scorrono orizzontalmente. I due elenchi dei record passi/distanza e le classifiche delle notti sono affiancati su desktop e si dispongono in colonna su schermi più stretti. I grafici di distribuzione mostrano frequenze osservate e sovrappongono una curva normale teorica come riferimento visivo: non è un modello predittivo e non implica che la distribuzione reale sia normale.

## Formati e criteri di lettura

Il parser considera i dataset JSON di Google Fit (`All Data`), i CSV delle metriche giornaliere (`Daily activity metrics`) e le sessioni di `All sessions`.

- **Passi:** priorità ai dati derivati `estimated_steps`, quindi agli altri dataset derivati; CSV giornalieri come fallback per le date non coperte dai JSON. Gli intervalli sovrapposti vengono deduplicati.
- **Distanza:** usa `com.google.distance.delta` normalizzato in km o la colonna distanza dei CSV. I km non vengono stimati dai passi.
- **Sonno:** se sono presenti segmenti `com.google.sleep.segment`, somma le fasi del sonno ed esclude veglia e segmenti fuori dal letto. Se mancano le fasi, usa la durata delle sessioni identificate come sonno.
- **Giorni senza registrazioni:** non sono trasformati in zero. Le medie sono calcolate soltanto sui giorni/notte con una misura disponibile.
- **Date:** i timestamp vengono convertiti nel fuso orario locale del browser.

## Privacy e dipendenze

Il file viene letto con `File.arrayBuffer()` e decompresso tramite JSZip direttamente nella memoria del browser. Il progetto non invia dati a server, non usa API, analytics o backend. Vue, JSZip e il codice dell'app vengono inclusi negli asset statici creati dalla build; la pagina pubblicata non dipende da CDN.

JSZip è distribuito secondo licenza MIT; il testo della licenza è incluso in `JSZIP-LICENSE.markdown`.

## Limiti

- Gli export possono contenere dati parziali, fonti differenti o misurazioni non sincronizzate.
- Una sessione sonno priva di segmenti misura l'intervallo tra inizio e fine, non necessariamente il tempo effettivo trascorso dormendo.
- I chilometri possono non essere presenti anche quando sono disponibili i passi.
- Le statistiche sono descrittive e non costituiscono una valutazione medica.
