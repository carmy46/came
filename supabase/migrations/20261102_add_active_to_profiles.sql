-- Dipendenti disattivati (ex dipendenti): l'account resta, con tutto lo storico (ore, richieste, ordini),
-- ma non può più entrare (ban in Supabase Auth, impostato dalla Edge Function set-employee-active)
-- e sparisce dagli elenchi di lavoro dell'admin.
alter table public.profiles add column if not exists active boolean not null default true;

-- Solo l'admin può cambiare ruolo e stato attivo (le chiamate lato server, senza auth.uid(), passano).
create or replace function public.prevent_role_change_by_non_admin()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
begin
  if ((new.role is distinct from old.role) or (new.active is distinct from old.active)) and v_actor is not null then
    select p.role into v_actor_role from public.profiles p where p.id = v_actor;
    if coalesce(v_actor_role,'') <> 'admin' then
      raise exception 'Non sei autorizzato a modificare il ruolo o lo stato dell''account';
    end if;
  end if;
  return new;
end;
$function$;
