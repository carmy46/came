# CAME (static HTML)

Sito statico (HTML/CSS/JS) con login via Supabase.

## Avvio in locale

Puoi usare qualsiasi server statico. Esempio con Python:

```bash
python -m http.server 5173
```

Apri `http://localhost:5173/` (reindirizza a `login.html`).

## Deploy su Vercel (via GitHub)

1. Carica questo progetto su GitHub.
2. Su Vercel: **Add New → Project → Import** e seleziona il repo.
3. Impostazioni consigliate:
   - **Framework Preset**: `Other`
   - **Build Command**: (vuoto)
   - **Output Directory**: (vuoto)
4. Premi **Deploy**.

## Note Supabase

- La chiave **anon** è pubblica per definizione (si usa nel browser), ma le regole di sicurezza dipendono da **RLS** e policy sul database.
- Se userai login OAuth (Google, ecc.), in Supabase dovrai aggiungere il dominio Vercel tra i **Redirect URLs**.









## Creazione account dipendenti (admin)

Dalla dashboard admin, **+ Nuovo dipendente** crea un account con nome, username e password.
Il dipendente accede dal login scrivendo solo l'username (chi ha un'email vera continua a usarla).

Sotto, l'account Supabase usa l'indirizzo interno `<username>@came.invalid` (dominio riservato, non riceve posta).
Il dominio è scritto in due punti da tenere uguali: `js/auth.js` e `supabase/functions/create-employee/index.ts`.

Da fare **una volta** su Supabase:

1. **SQL Editor** → esegui `supabase/migrations/20261020_add_username_to_profiles.sql` (aggiunge `profiles.username`).
2. **Edge Functions** → pubblica `supabase/functions/create-employee/index.ts` con il nome `create-employee`
   (da dashboard: *Deploy a new function* → *Via Editor*, oppure `supabase functions deploy create-employee`).
   Le chiavi `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` sono già fornite da Supabase, non vanno inserite.

La funzione accetta solo chiamate di un utente con `profiles.role = 'admin'`.
