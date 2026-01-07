# Analisi progetto **CAME2** (Supabase) – repo `Came/`

Questo documento descrive **cosa c’è nel progetto**, come funziona (frontend + Supabase) e cosa serve configurare su Supabase per farlo andare bene.

> Nota: alcune parti del database/policy **non si vedono direttamente nel codice** (perché stanno su Supabase). In questo documento ci sono sia parti **dedotte dal codice** sia una sezione con i dati **letti direttamente da Supabase (MCP)**.

## Panoramica (in parole semplici)

Il progetto è una **web app statica** (solo **HTML + CSS + JavaScript**) che gira nel browser e usa:

- **Supabase Auth**: login con **email + password**
- **Supabase Database** (Postgres): salva e legge dati (ore, richieste, ordini prodotti)
- **Ruoli**: `admin` e `employee` letti dalla tabella `profiles`
- **Export**:
  - Excel tramite libreria `xlsx` (CDN)
  - PDF tramite `jsPDF` + `autoTable` (CDN)

Non ci sono build tool (React/Vite ecc.): si apre con un server statico.

## Struttura file (cosa c’è nella cartella)

```
Came/
  index.html            -> redirect immediato a login.html
  login.html            -> login Supabase (email/password)
  employee.html         -> dashboard dipendente
  admin.html            -> dashboard amministratore
  report.html           -> pagina che genera un PDF di documentazione (projectReport.js)
  css/style.css         -> stile unico (dark UI + layout admin/employee)
  js/
    supabaseClient.js   -> crea il client Supabase e funzioni helper globali
    auth.js             -> gestione login + redirect in base al ruolo
    guard.js            -> protezione pagine (blocca se non loggato/ruolo sbagliato)
    employee.js         -> logica dipendente (ore, archivio, richieste, prodotti, export)
    admin.js            -> logica admin (dipendenti, ore, richieste, prodotti, export)
    export.js           -> utility export Excel/PDF
    projectReport.js    -> genera PDF “documentazione progetto”
```

## Dipendenze esterne (caricate via CDN)

- **Supabase JS v2**: usata in `login.html`, `employee.html`, `admin.html`
  - `<script src="https://unpkg.com/@supabase/supabase-js@2"></script>`
- **XLSX** (Excel): usata in `employee.html` e `admin.html`
  - `<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>`
- **jsPDF + autoTable** (PDF): usata in `employee.html` (export archivio) e `report.html`
  - `<script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>`
  - `<script src="https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js"></script>`

## Config Supabase (nel codice)

### URL e ANON KEY

In `js/supabaseClient.js` il client è creato con:

- **SUPABASE_URL**: `https://uiebrgppvpukrrdyccgf.supabase.co`
- **SUPABASE_ANON_KEY**: presente nel file

Nota importante:

- La **anon key** è “pubblica” per definizione (sta nel browser). La vera sicurezza dipende da:
  - **RLS attivo** sulle tabelle
  - **policy corrette** (soprattutto per evitare escalation del ruolo ad admin)

### API globali

`js/supabaseClient.js` espone:

- `window.supabaseClient` (istanza Supabase)
- `window.getCurrentUser()` (legge utente loggato)
- `window.getMyProfile()` (legge riga in `profiles` dell’utente)

## Pagine e flussi (come si usa l’app)

### 1) `index.html`

Fa solo redirect a `login.html`.

### 2) `login.html` + `js/auth.js`

Flusso:

- L’utente inserisce **email/password**
- `auth.js` fa `supabaseClient.auth.signInWithPassword(...)`
- Poi chiama `getMyProfile()` e legge `profiles.role`
- Redirect:
  - se `role === "admin"` → `admin.html`
  - altrimenti → `employee.html`

Inoltre: se sei già loggato, prova subito a fare redirect alla pagina giusta.

### 3) Protezione pagine (`js/guard.js`)

`admin.html` e `employee.html` chiamano:

- `requireRole("admin")` oppure `requireRole("employee")`

La guard:

- se non sei loggato → ti manda a `login.html`
- se sei loggato ma `profiles.role` non combacia → ti manda alla pagina corretta

### 4) `employee.html` + `js/employee.js` (Dipendente)

La dashboard dipendente ha 4 aree principali:

- **Home**: riepilogo (ore settimana/oggi, richieste, prodotti consegnati/non consegnati)
- **Ore**: inserimento ore giornaliere
  - supporta **più righe nello stesso giorno** (più luoghi/attività)
  - validazioni (fine > inizio, pausa dentro orario, ecc.)
  - salva con `insert` su tabella `work_logs`
- **Richieste**: invio richieste (ferie/permessi)
  - salva con `insert` su tabella `requests`
  - nell’Archivio si possono **modificare/annullare** richieste ancora “inviata”
- **Prodotti**: ordine prodotti (con quantità)
  - salva con `insert` su tabella `product_orders` (una riga per prodotto)
  - in Archivio prodotti: raggruppa ordini per (data + luogo), e permette di **annullare** l’ordine se non consegnato
- **Archivio**: vista mensile con:
  - Ore (raggruppate per giorno) + totali mese/oggi + modifica ore
  - Richieste (in attesa + storico esito)
  - Prodotti (non consegnati / consegnati)
  - **Export Excel** e **Export PDF** (per la sezione ore del mese)

Profilo:

- se `profiles.full_name` è vuoto, appare un box “Nome e cognome (una volta sola)”
- salva con `update` su `profiles`

### 5) `admin.html` + `js/admin.js` (Amministratore)

Dashboard admin:

- Sidebar con elenco dipendenti (da tabella `profiles`)
- Se selezioni un dipendente si apre una **scheda dipendente** (modale “as page”) con tabs:
  - Ore del dipendente (mese selezionato) + export Excel
  - Richieste del dipendente (filtri stato/tipo/mese) + azioni approva/rifiuta

Sezioni principali admin:

- **Ore** (mese):
  - query su `work_logs` (tutti) + join `profiles(full_name)`
  - calcola totali mese/oggi
  - raggruppa e mostra per dipendente → per giorno → righe
  - export Excel “Admin Ore”
- **Richieste**:
  - query su `requests` + join `profiles(full_name)`
  - filtri: stato, tipo, mese (su `start_date`), ricerca nome (client-side)
  - azioni su richieste “inviata”: **Approva** / **Rifiuta** (update `status`)
  - export Excel “Admin Richieste”
- **Prodotti**:
  - query su `product_orders` + join `profiles(full_name)`
  - raggruppa ordine unico per `(user_id, order_date, place)` e mostra l’elenco prodotti
  - campo **data consegna** modificabile: fa `update({delivery_date})` su tutte le righe del gruppo
  - export Excel “Admin Prodotti”

## Database: tabelle e campi (dedotti dalle query)

### `profiles`
Letta con:

- `select("id, full_name, role")`

Campi minimi necessari:

- **id**: deve corrispondere a `auth.users.id` (di solito UUID)
- **full_name**: nome visualizzato
- **role**: stringa `"admin"` oppure `"employee"`

### `work_logs` (registrazione ore)
Letta/scritta con campi:

- `id`
- `user_id`
- `work_date` (YYYY-MM-DD)
- `start_time`, `end_time` (HH:MM o HH:MM:SS)
- `break_start`, `break_end` (opzionali)
- `location`
- `activity`
- `created_at`

### `requests` (richieste)
Letta/scritta con campi:

- `id`
- `user_id`
- `type`: `ferie | permesso_giornaliero | entrata_anticipata | entrata_posticipata`
- `start_date`, `end_date` (per ferie)
- `time` (per entrata anticipata/posticipata)
- `status`: `inviata | approvata | rifiutata`
- `note`
- `created_at`

### `product_orders` (ordini prodotti)
Letta/scritta con campi:

- `id`
- `user_id`
- `order_date`
- `place`
- `product_name`
- `quantity`
- `delivery_date` (usata per segnare consegna; può essere `null`)
- `created_at`

## Supabase (stato reale letto da MCP): tabelle, vincoli, RLS, policy, funzioni

Questa sezione è presa **direttamente dal tuo progetto Supabase** (`uiebrgppvpukrrdyccgf`), non solo dal codice.

### Tabelle (schema `public`)

Tutte queste tabelle hanno **RLS abilitato** (`rls_enabled=true`) e **non forzato** (`rls_forced=false`):

- **`public.profiles`**
  - **Righe**: 2
  - **Colonne**:
    - `id uuid` (PK, FK → `auth.users.id`, `ON DELETE CASCADE`)
    - `full_name text` (nullable)
    - `role text` (default `'employee'`, check: solo `'admin'|'employee'`)
    - `created_at timestamptz` (default `now()`)
- **`public.work_logs`**
  - **Righe**: 6
  - **Colonne**: `id bigint` (identity), `user_id uuid` (FK → `profiles.id`), `work_date date`, `start_time time`, `end_time time`, `break_start/break_end time` (nullable), `location text`, `activity text`, `created_at timestamptz default now()`
  - **Indici**: `user_id`, `work_date`
- **`public.requests`**
  - **Righe**: 1
  - **Colonne**: `id bigint` (identity), `user_id uuid` (FK → `profiles.id`), `type text` (check: valori ammessi), `start_date date`, `end_date date` (nullable), `time time` (nullable), `status text` (default `'inviata'`, check: valori ammessi), `note text` (nullable), `created_at timestamptz default now()`
  - **Indici**: `user_id`, `status`, `type`
- **`public.product_orders`**
  - **Righe**: 3
  - **Colonne**: `id bigint` (identity), `user_id uuid` (FK → `profiles.id`), `place text`, `product_name text`, `quantity int` (check: `> 0`), `created_at timestamptz default now()`, `order_date date default CURRENT_DATE`, `order_group_id uuid default gen_random_uuid()`, `delivery_date date` (nullable)
  - **Indici**: `user_id`, `order_date`, `order_group_id`, `delivery_date`

### RLS policy (nome + regola)

Le policy esistono **solo per il ruolo `authenticated`** (quindi un utente “anon” non dovrebbe poter leggere/scrivere nulla, anche se a livello GRANT ha molti privilegi).

- **`profiles`**
  - **SELECT** `profiles_select_own_or_admin`:
    - `USING ((id = auth.uid()) OR is_admin())`
  - **UPDATE** `profiles_update_own_or_admin`:
    - `USING ((id = auth.uid()) OR is_admin())`
    - `WITH CHECK ((id = auth.uid()) OR is_admin())`
  - Nota: non vedo policy INSERT/DELETE per `profiles` (coerente: la tabella viene popolata via trigger su `auth.users`).

- **`work_logs`**
  - **SELECT** `work_logs_select_own_or_admin`: `USING ((user_id = auth.uid()) OR is_admin())`
  - **INSERT** `work_logs_insert_own`: `WITH CHECK (user_id = auth.uid())`
  - **UPDATE** `work_logs_update_own_or_admin`: `USING ...` + `WITH CHECK ...`
  - **DELETE** `work_logs_delete_own_or_admin`: `USING ((user_id = auth.uid()) OR is_admin())`

- **`requests`**
  - **SELECT** `requests_select_own_or_admin`: `USING ((user_id = auth.uid()) OR is_admin())`
  - **INSERT** `requests_insert_own`: `WITH CHECK (user_id = auth.uid())`
  - **UPDATE** `requests_update_own_or_admin`: `USING ...` + `WITH CHECK ...`
  - **DELETE** `requests_delete_own_or_admin`: `USING ((user_id = auth.uid()) OR is_admin())`

- **`product_orders`**
  - **SELECT** `product_orders_select_own_or_admin`: `USING ((user_id = auth.uid()) OR is_admin())`
  - **INSERT** `product_orders_insert_own`: `WITH CHECK (user_id = auth.uid())`
  - **UPDATE** `product_orders_update_own_or_admin`: `USING ...` + `WITH CHECK ...`
  - **DELETE** `product_orders_delete_own_or_admin`: `USING ((user_id = auth.uid()) OR is_admin())`

### Funzioni e trigger (lato database)

Funzioni in `public`:

- **`public.is_admin()`** (SQL, STABLE):
  - ritorna `true` se nella tua riga `profiles` il campo `role` è `'admin'`.
- **`public.handle_new_user()`** (PL/pgSQL, `SECURITY DEFINER`):
  - su nuovo utente, inserisce `profiles(id, full_name, role='employee')` (con `ON CONFLICT DO NOTHING`).
- **`public.enforce_product_orders_delivery_admin()`** (PL/pgSQL, `SECURITY DEFINER`):
  - **blocca** UPDATE di `delivery_date` se non sei admin
  - **blocca** DELETE di righe già consegnate (`delivery_date` non null) se non sei admin

Trigger trovati:

- **`auth.users`**: `on_auth_user_created` (AFTER INSERT) → `handle_new_user()`
- **`public.product_orders`**: `trg_product_orders_delivery_admin` (BEFORE UPDATE OR DELETE) → `enforce_product_orders_delivery_admin()`

### Migrations presenti (DB)

Migrations in Supabase:

- `20251229112057_add_entrata_anticipata_request_type`
- `20251229114108_add_order_date_to_product_orders`
- `20251229120715_add_order_group_id_to_product_orders`
- `20251229150708_add_delivery_date_and_protect_product_orders`

### Advisors Supabase (problemi trovati)

**Sicurezza** (WARN):

- **Leaked password protection disabilitata** (Auth)  
  - Consiglio: abilitarla da Supabase Auth. Link: [Password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
- **Function Search Path Mutable** per:
  - `public.enforce_product_orders_delivery_admin`
  - `public.handle_new_user`
  - `public.is_admin`  
  Link: [Database linter – function_search_path_mutable](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)

**Performance**:

- Warning su molte policy: “Auth RLS initialization plan” (initplan) → migliorabile con `(select auth.uid())` / `(select is_admin())` nelle policy.  
  Link: [RLS – call functions with select](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select)
- Indici “unused” (INFO): `requests_type_idx`, alcuni indici su `product_orders` (possibile: DB piccolo, quindi non si sono ancora “attivati” nelle statistiche).

### Bug critico trovato (e fix): errore 500 / stack depth (ricorsione RLS)

Se la pagina dipendente resta su “Caricamento…” e in console vedi:
- `500` su endpoint `work_logs / requests / product_orders`
- errore Postgres `54001: stack depth limit exceeded`

La causa è una **ricorsione**:
- le policy RLS di varie tabelle usano `is_admin()`
- `is_admin()` legge `public.profiles`
- ma `profiles` ha policy che richiama `is_admin()` → loop

Fix consigliata: rendere `is_admin()` **SECURITY DEFINER** (bypass RLS) + impostare `search_path`. (Applico questa fix su Supabase.)

## Importante: sicurezza (RLS e ruolo)

Nel codice si vede che **spesso non viene applicato `eq("user_id", user.id)` lato client**.

Esempi:

- Home dipendente: conteggi e query su `work_logs/requests/product_orders` senza filtro esplicito su user
- Archivio dipendente: query `work_logs` del mese senza filtro esplicito su user

Quindi la privacy/sicurezza dipende da Supabase:

- **RLS deve essere ON**
- Le **policy** devono fare:
  - employee: può vedere/insert/update/delete **solo i propri record**
  - admin: può vedere e gestire tutto

Punto critico:

- Il ruolo `profiles.role` è un dato nel DB. Se un employee potesse fare `update profiles set role='admin'` (policy sbagliata), sarebbe un disastro.
  - Consiglio: permettere all’utente di aggiornare **solo `full_name`** e NON `role`.
  - Consiglio ancora migliore: gestire il ruolo con logiche server-side (o almeno policy rigidissime).

### ⚠️ Punto critico reale (conferma da Supabase): `profiles.role` oggi è aggiornabile

Dalla configurazione reale:

- esiste una policy `profiles_update_own_or_admin` che permette UPDATE anche “own” (sulla propria riga)
- la colonna **`profiles.role` è aggiornabille** (ha privilegi UPDATE per `authenticated`)
- il check constraint permette anche il valore `'admin'`

Quindi, così com’è, un utente **potrebbe promuoversi ad admin** cambiando `profiles.role` sulla propria riga (e poi `is_admin()` diventerebbe `true`).

Consiglio pratico (da fare su Supabase):

- **bloccare update di `role` agli utenti normali**, ad esempio:
  - revocare UPDATE sulla colonna `role` per `authenticated`
  - oppure aggiungere un trigger che impedisce cambio di `role` a chi non è admin
  - e tenere aggiornabile solo `full_name`

**Stato attuale (fix applicata)**:

- Ho applicato una migration su Supabase che fa:
  - `REVOKE UPDATE(role) ON public.profiles FROM authenticated, anon`
- Risultato: dalla tua app (che usa utenti `authenticated`) non si può più aggiornare `profiles.role`, ma resta possibile aggiornare `profiles.full_name`.

## Export (come funziona)

### Excel

- Implementato in `js/export.js` con funzione principale `exportToExcelElegant(...)`
- Crea un file Excel con:
  - Titolo, riga “Generato il”
  - Stile (header, righe zebra)
  - Auto-fit colonne
  - (opzionale) un foglio “Riepilogo”

### PDF

Dipendente (Archivio ore):

- Crea un PDF con tabella dettaglio + tabella riepilogo giornaliero.

Report progetto:

- `report.html` + `js/projectReport.js` genera un PDF di documentazione.
  - Attenzione: alcune frasi tipo “Storage presente ma bucket non creati” **non sono verificabili dal repo** (dipendono dal progetto Supabase online).

## Come avviare in locale

Da README:

1. Avvia un server statico (esempio Python):
   - `python -m http.server 5173`
2. Apri `http://localhost:5173/` (redirect a `login.html`)

È importante usare un server (http://) e non “apertura file” (file://), soprattutto per alcune librerie e download su mobile.

## Cosa serve su Supabase (checklist)

- **Auth**:
  - utenti creati (email/password)
- **Tabella `profiles`**:
  - riga per ogni utente (id = auth.users.id)
  - `role` valorizzato correttamente (`admin` o `employee`)
  - `full_name` opzionale, ma consigliato
  - (consigliato) trigger che crea `profiles` automaticamente alla registrazione
- **Tabelle**:
  - `work_logs`
  - `requests`
  - `product_orders`
- **RLS e policy**:
  - employee vede solo i propri record
  - admin vede tutto
  - bloccare update del campo `profiles.role` agli utenti normali

## Problemi/punti migliorabili (tecnici ma importanti)

- **Dipendenza forte da RLS**: molte query non filtrano per `user_id` nel client. Anche se RLS è corretto, filtrare nel client migliora performance e riduce rischi.
- **Gestione ruolo**: il ruolo è letto da DB; serve blindare bene `profiles.role`.
- **Chiave Supabase nel repo**: ok che sia anon key, ma è comunque meglio gestire URL/KEY con una configurazione più pulita (es. file separato non versionato o istruzioni chiare per cambiarla).
- **Mancanza signup UI**: non c’è pagina di registrazione; gli utenti vanno creati in Supabase e deve esistere anche la riga in `profiles`.

---

Se vuoi, nel prossimo passo posso anche:

- controllare insieme (con indicazioni “clicca qui”) come impostare **RLS/policy** su Supabase per far funzionare bene ruoli e privacy
- oppure aggiungere una piccola pagina “setup” che ti dice se Supabase è configurato e fa test di lettura/scrittura.


