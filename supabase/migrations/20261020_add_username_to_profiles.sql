-- Username dei dipendenti creati dall'admin (accesso senza email).
-- Da eseguire UNA VOLTA su Supabase: Dashboard > SQL Editor > incolla > Run.
-- È sicuro rieseguirla: non fa nulla se la colonna esiste già.

alter table public.profiles
  add column if not exists username text;

-- Un username non può esistere due volte (senza distinguere maiuscole/minuscole).
-- I dipendenti già esistenti, che accedono con la loro email, restano con username vuoto.
create unique index if not exists profiles_username_key
  on public.profiles (lower(username))
  where username is not null;
