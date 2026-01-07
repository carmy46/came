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





