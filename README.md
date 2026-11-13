# Fit Archive — Google Fit Insights

Dashboard statico per leggere un archivio ZIP di Google Takeout / Google Fit. Non richiede backend, account, database o build step.

## Pubblicazione su GitHub Pages

1. Crea un repository GitHub, ad esempio `fit-archive`.
2. Carica **tutti** i file e le cartelle di questo progetto nella root del repository:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `jszip.min.js`
3. Apri **Settings → Pages** nel repository.
4. In **Build and deployment**, seleziona **Deploy from a branch**, scegli il branch `main` e la cartella `/ (root)`, quindi salva.
5. Apri l'indirizzo GitHub Pages mostrato nella stessa schermata.

Non è necessario configurare un workflow, installare Node.js o avviare un server applicativo.

## Utilizzo

1. Apri la pagina pubblicata.
2. Trascina il file ZIP di Google Takeout nel riquadro, oppure selezionalo dal dispositivo.
3. Attendi che l'elaborazione termini: i grafici e le tabelle vengono costruiti nel browser.
4. Usa **Esporta CSV** per scaricare una tabella giornaliera con passi, km e sonno.

Per creare l'archivio: [Google Takeout](https://takeout.google.com/) → deseleziona tutto → seleziona **Fit** → esporta in ZIP.

## Cosa analizza

### Passi

- Media giornaliera all-time, per anno e per mese.
- Totale dei passi e numero di giorni con registrazioni.
- Classifica dei giorni con più passi (Top 5 / 10 / 20).
- Classifica separata dei giorni con più km, se è presente una misura di distanza.
- Distanza in km mostrata anche nella classifica dei passi.
- Tabella mensile compatta: una riga per anno e 12 colonne per i mesi.

### Sonno

- Durata totale e media per notte.
- Totale e media mensile e annuale.
- Classifica delle notti più lunghe e più brevi.
- Classifica delle settimane con più e meno sonno, ordinabile per media per notte o totale settimanale.
- Giorno della settimana con la maggiore durata media del sonno.

Le notti sono attribuite alla data del risveglio. Le settimane iniziano il lunedì.

## Formati e criteri di lettura

Il parser considera le strutture JSON dei dataset di Google Fit (`All Data`), i CSV delle metriche giornaliere (`Daily activity metrics`) e le sessioni di `All sessions`.

- **Passi:** dà priorità ai dati derivati `estimated_steps` di Google Fit, quindi agli altri dataset derivati; usa i CSV giornalieri come fallback per i giorni privi di dati JSON. Nei punti temporali sovrapposti mantiene una sola registrazione per ridurre i doppi conteggi.
- **Distanza:** usa `com.google.distance.delta` (normalizzato in metri/km) o la colonna distanza del CSV. Mostra soltanto misure trovate nell'archivio: non stima i km dalla lunghezza del passo.
- **Sonno:** se sono presenti segmenti `com.google.sleep.segment`, somma le fasi di sonno (inclusi i segmenti non classificati) ed esclude i segmenti di veglia e fuori dal letto. In assenza di fasi, usa la durata delle sessioni identificate come sonno.
- **Giorni senza registrazioni:** non sono trasformati in zero. Le medie sono calcolate sui soli giorni/notte con una misura disponibile; il numero di giorni/notte è riportato nelle tabelle.
- **Fusi orari:** i timestamp vengono convertiti nel fuso orario locale del browser. I risultati giornalieri possono quindi dipendere dal fuso orario del dispositivo su cui viene aperta la pagina.

Il formato dell'esportazione può variare a seconda della versione di Google Fit, delle app collegate e dei dati effettivamente sincronizzati. La dashboard mostra avvisi quando una metrica non è stata trovata.

## Privacy e dipendenze

L'archivio viene letto in memoria tramite JavaScript nel browser. Il progetto non contiene richieste HTTP applicative, API, analytics, backend o persistenza dei dati. La libreria JSZip è inclusa localmente (`jszip.min.js`), quindi anche l'apertura di ZIP non richiede CDN esterni. Il CSV esportato viene generato localmente dal browser.

La pagina non salva automaticamente i dati tra una visita e l'altra: per aggiornare l'analisi occorre importare nuovamente il file ZIP.

JSZip v3.10.1 è distribuito secondo la licenza MIT; il testo della licenza è incluso in `JSZIP-LICENSE.markdown`.

## Limiti da conoscere

- Google Takeout può contenere esportazioni parziali o fonti diverse; il parser non può ricostruire misurazioni mai sincronizzate in Google Fit.
- Il sonno basato sulla sola sessione misura la durata tra inizio e fine sessione, non necessariamente il tempo effettivamente dormito. Quando ci sono segmenti di sonno, la dashboard li preferisce.
- I km possono non essere disponibili anche quando i passi sono presenti.
- L'analisi è descrittiva e non costituisce una valutazione medica.
