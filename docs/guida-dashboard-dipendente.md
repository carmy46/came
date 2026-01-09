# CAME – Guida rapida Dashboard Dipendente

Questa guida spiega **come usare la Dashboard Dipendente** di CAME: inserimento ore, richieste (ferie/permessi), richiesta prodotti e consultazione dell’archivio.

> Suggerimento: se sei su smartphone, usa il tasto **← Home** (in alto) per tornare velocemente alla Dashboard.

---

## 1) Accesso e profilo

1. Apri `login.html`.
2. Inserisci **email** e **password** e fai login.
3. Se è la prima volta, potrebbe comparire la casella **“Nome e cognome (una volta sola)”**:
   - Scrivi nome e cognome (es. *Mario Rossi*)
   - Premi **Salva**

In alto vedrai il tuo nome e il ruolo: **“Nome • Dipendente”**.

---

## 2) Home (Dashboard)

La Home mostra 4 riquadri:
- **Ore**: riepilogo **Settimana** e **Oggi**
- **Richieste**: quante **In attesa** e quante **Approvate** (nel mese)
- **Prodotti**: quanti ordini **Da consegnare** e quanti **Consegnati** (nel mese)
- **Archivio**: entra per consultare e gestire lo storico

Toccando un riquadro vai direttamente alla sezione.

---

## 3) Ore → Registrazione ore

### A) Compilazione (anche più righe nello stesso giorno)
1. Seleziona la **Data**.
2. Compila almeno **una riga** con:
   - **Ora inizio**
   - **Ora fine**
   - **Luogo**
   - **Attività**
3. (Opzionale) **Pausa**:
   - Se la inserisci, devi compilare **sia inizio che fine pausa**
   - La pausa deve stare **dentro** l’orario di lavoro
4. Se nello stesso giorno hai lavorato in più posti/attività:
   - Premi **+ Aggiungi riga**
   - Compila le righe aggiuntive
5. Premi **Invia** una sola volta.

### B) Pulsanti utili
- **+ Aggiungi riga**: aggiunge una riga extra per lo stesso giorno.
- **Reset righe**: azzera tutte le righe e ricrea una riga vuota.

### C) Errori comuni (e cosa fare)
- **“L'ora fine deve essere dopo l'ora inizio”**: controlla gli orari.
- **Errore pausa**: compila entrambe oppure svuotale.
- **“Compila tutti i campi obbligatori…”**: in quella riga manca un campo (oppure rimuovi la riga).

---

## 4) Richieste → Ferie / Permessi

### A) Tipi richiesta
Nel menu **Tipo richiesta** puoi scegliere:
- **Ferie (da / a)**: inserisci **Da** e **A**
- **Permesso giornaliero (data)**: inserisci **Data**
- **Permesso entrata anticipata (data + ora)**: inserisci **Data** e **Ora**
- **Permesso entrata posticipata (data + ora)**: inserisci **Data** e **Ora**

Puoi aggiungere **Note (opzionale)**.

### B) Invio
1. Seleziona il tipo
2. Compila le date/ora richieste
3. Premi **Invia richiesta**

Dopo l’invio, la richiesta si trova in **Archivio → Richieste**.

### C) Modifica / Annulla richiesta (solo se “Inviata / in attesa”)
In **Archivio → Richieste → Richieste in attesa**:
- **Modifica**: puoi correggere data/ora/note
- **Annulla**: elimina la richiesta (ti chiede conferma)

Quando la richiesta è **Approvata** o **Rifiutata**, resta nello storico e non si modifica.

---

## 5) Prodotti → Richieste prodotti

### A) Compilazione
1. Seleziona **Data**
2. Inserisci **Luogo**
3. Scegli i prodotti e metti la **quantità** (0 = non richiesto)
4. Se usi **Altro**:
   - metti la quantità
   - scrivi anche il nome del prodotto
5. Premi **Invia richiesta**

### B) Strumenti veloci
- **Cerca prodotto**: filtra la lista (es. “carta”, “sacchi”).
- **Azzera quantità**: riporta tutto a 0.
- **Metti 1 ai visibili**: mette 1 ai prodotti filtrati (comodo se vuoi “uno per tipo”).

Dopo l’invio, trovi tutto in **Archivio → Prodotti**.

### C) Annulla ordine (solo se non consegnato)
In **Archivio → Prodotti** apri un ordine:
- se è **Non consegnato**, puoi usare **Annulla ordine** (annulla tutti i prodotti di quel luogo+data).

---

## 6) Archivio personale

### A) Sezioni Archivio
In alto trovi **Ore / Richieste / Prodotti**.

### B) Filtri mese + ricerca
- **Mese**: scegli il mese da consultare.
- **Totale mese** e **Totale oggi**: riepiloghi rapidi.
- **Questo mese / Mese scorso**: scorciatoie.
- **Cerca in archivio…**: cerca per luogo, attività, note, ecc.

> Su smartphone: in alcune sezioni il blocco **Filtri** può essere nascosto; usa il pulsante **📅 Cambia mese** oppure torna su **Ore** per cambiare mese.

### C) Archivio Ore: apri/chiudi e modifica
In **Archivio → Ore** vedi un riepilogo per giorno:
- tocca il giorno per **aprire/chiudere**
- usa **Modifica** sulla singola riga per cambiare orari/pausa/luogo/attività

### D) Export (Ore)
Sempre in **Archivio → Ore**:
- **Export Excel**: scarica un file `.xlsx` con dettaglio + riepilogo
- **Export PDF**: scarica un PDF con dettaglio + riepilogo giornaliero

Se l’export non parte:
- può dipendere da internet/CDN (serve connessione)
- su smartphone è meglio aprire l’app da un indirizzo **http** (non da file)

---

## 7) Logout

In alto a destra premi **Logout**.

---

## FAQ veloce

**“Sessione scaduta. Rifai login.”**  
Succede se la sessione è terminata: torna a `login.html` e rientra.

**Non vedo “Luogo/Attività” suggeriti su telefono**  
Puoi scrivere liberamente; i suggerimenti compaiono come elenco quando tocchi il campo.

**Ho inserito una riga vuota in Ore**  
Non è un problema: le righe totalmente vuote vengono ignorate (ma se una riga è “mezza compilata”, dà errore).


