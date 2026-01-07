# Manuale CAME2 (App + Supabase)

Questo manuale ti spiega, in modo semplice:

- come **creare utenti** e farli accedere
- come impostare **ruoli** (Admin / Employee)
- cosa controllare su **Supabase** (tabelle, RLS, sicurezza)
- come fare **modifiche future**
- come risolvere **problemi ed errori comuni**

> Il progetto è una web app statica (HTML/CSS/JS) e usa Supabase.  
> Project ref / URL: `uiebrgppvpukrrdyccgf` / `https://uiebrgppvpukrrdyccgf.supabase.co`

---

## 1) Come si usa l’app (veloce)

- Vai su `login.html`
- Fai login con **email + password**
- In base al ruolo in `profiles.role` vieni portato a:
  - `admin.html` (admin)
  - `employee.html` (dipendente)

### Dipendente (employee.html)
- Inserisce ore (anche più righe nello stesso giorno)
- Invia richieste (ferie/permessi)
- Invia ordini prodotti
- Vede archivio mensile e fa export (Excel/PDF)

### Admin (admin.html)
- Vede dati di tutti (ore / richieste / prodotti)
- Approva/rifiuta richieste
- Imposta data consegna ordini prodotti
- Export Excel

---

## 2) Creare utenti (chi può fare login)

### Metodo consigliato (da Supabase Dashboard)
1. Apri Supabase → il tuo progetto.
2. Vai su **Authentication → Users**.
3. Premi **Add user**.
4. Inserisci **email** e **password**.
5. Salva.

✅ Risultato: l’utente esiste in `auth.users` (quindi può loggarsi).

### Importante: il profilo `public.profiles` viene creato da solo
Nel tuo progetto c’è un trigger su `auth.users` che esegue `public.handle_new_user()`:
- crea automaticamente una riga in `public.profiles`
- imposta `role = 'employee'` di default

Quindi normalmente **non devi creare a mano** la riga in `profiles`.

---

## 3) Impostare ruoli (Admin / Employee)

### Dove si imposta il ruolo
Il ruolo è in `public.profiles.role` e può essere solo:
- `admin`
- `employee`

### Regola importante (sicurezza)
Abbiamo bloccato dall’app la modifica di `profiles.role`.  
Quindi:
- **un dipendente NON può diventare admin dall’app**
- il ruolo lo cambi **solo da Supabase** (o via SQL come admin)

### Come promuovere un utente a Admin
1. Supabase → **Table Editor**
2. Apri tabella **`profiles`**
3. Trova l’utente (di solito per `id` oppure per `full_name` se compilato)
4. Cambia `role` da `employee` a `admin`
5. Salva

Consiglio: tieni sempre **almeno 1 admin**.

---

## 4) Tabelle principali (cosa salvano)

- **`profiles`**: utenti + nome + ruolo
- **`work_logs`**: ore lavorate
- **`requests`**: richieste (ferie/permessi) con stato
- **`product_orders`**: ordini prodotti (una riga per prodotto) + consegna

Dettagli completi: vedi `CAME2_ANALISI.md`.

---

## 5) Sicurezza: RLS (Row Level Security) – cosa devi sapere

RLS è **fondamentale**: decide chi può vedere/modificare cosa.

Nel tuo progetto:
- RLS è **attivo** sulle tabelle.
- Le policy sono pensate così:
  - employee: può vedere/inserire/modificare **solo i suoi dati**
  - admin: può vedere/modificare **tutto**

Se in futuro tocchi le policy, ricorda:
- se rompi una policy, l’app potrebbe mostrare “Errore invio” o “Errore caricamento”
- gli errori RLS si vedono nella console del browser e nei log di Supabase

---

## 6) Impostazioni Supabase consigliate (prima del lancio)

### 6.1 Password security (consigliato)
Attiva in Supabase Auth la protezione “password compromesse”:
- Supabase → **Auth → Settings** → abilita **Leaked password protection**

### 6.2 Redirect URLs (solo se usi OAuth)
Se in futuro aggiungi login Google ecc.:
- dovrai impostare i **Redirect URLs** corretti (dominio del sito).

---

## 7) Modifiche future: cosa fare e dove

### 7.1 Cambiare URL/chiave Supabase nell’app
File: `js/supabaseClient.js`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Se cambi progetto Supabase, devi aggiornare questi valori.

### 7.2 Aggiungere un nuovo campo in tabella
Esempio: aggiungere `phone` a `profiles`
1. Supabase → **SQL Editor**
2. Crea una migration (ALTER TABLE)
3. Aggiorna il frontend (JS) se vuoi mostrare/usare quel campo

Regola: ogni volta che aggiungi campi, controlla anche:
- RLS/policy (se serve)
- validazioni

### 7.3 Aggiungere una nuova “funzione” (es. nuova tabella)
Passi:
1. Disegna la tabella (campi, FK, default, check)
2. Attiva RLS
3. Crea policy:
   - “own” per employee
   - “own_or_admin” se serve
4. Aggiorna l’app (nuove query `.from("...")`)

---

## 8) Errori comuni e soluzioni (troubleshooting)

### “Non riesco ad accedere” / “Credenziali non valide”
Possibili cause:
- email/password sbagliate
- utente non creato in Supabase Auth

Cosa fare:
- Supabase → Auth → Users: verifica che l’utente esista
- se serve: usa “Reset password” (o crea nuova password)

### L’app rimanda sempre a `login.html` (loop)
Possibili cause:
- non sei loggato (sessione scaduta)
- manca la riga in `profiles` (raro, ma possibile)
- `profiles.role` non è valorizzato correttamente

Cosa fare:
- Supabase → Table Editor → `profiles`: verifica che esista una riga per quell’utente
- verifica `role` (admin/employee)

### “Errore invio. Controlla console e RLS.”
Significa quasi sempre:
- policy RLS blocca INSERT/UPDATE/DELETE
- oppure stai provando a salvare un valore non valido (es. quantità 0 con vincolo `quantity > 0`)

Cosa fare:
- Apri la console del browser (F12) e leggi l’errore
- Supabase → Logs (Postgres/Auth) per capire quale policy ha bloccato
- Verifica che stai inserendo dati corretti:
  - ore: fine > inizio, pausa coerente
  - prodotti: quantità > 0

### Admin non vede dati / vede poco
Possibili cause:
- il tuo utente non è `admin` in `profiles.role`

Cosa fare:
- Supabase → `profiles` → imposta `role='admin'`
- fai logout/login

### Export Excel/PDF non funziona
Possibili cause:
- le librerie CDN non si caricano (connessione / blocchi)
- stai aprendo l’app con `file://` invece che con un server `http://`

Cosa fare:
- avvia un server locale (es. `python -m http.server 5173`)
- riprova
- controlla se la rete blocca `cdn.jsdelivr.net`

---

## 9) Operazioni “da admin” utili (SQL pronti)

> Se non ti senti sicuro con SQL, dimmelo e ti guido passo passo.

### Contare utenti
- `auth.users`: quanti utenti possono loggarsi
- `public.profiles`: quanti profili applicativi

### Verificare quanti admin ci sono
- conta `profiles.role='admin'`

---

## 10) Se vuoi: checklist finale “pronto al lancio”

- Almeno **1 admin** in `profiles`
- Leaked password protection abilitata (consigliato)
- Test:
  - login admin
  - login employee
  - inserimento ore
  - invio richiesta
  - invio prodotti
  - export Excel/PDF


