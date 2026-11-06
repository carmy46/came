-- Storico delle modifiche alle ore (visibile SOLO all'admin).
-- Ogni volta che una riga di work_logs viene modificata (data, orari, pausa, luogo, attività) o
-- eliminata, si salva com'era prima e com'è diventata, con chi l'ha fatto e quando.
-- I dipendenti non vedono nulla: la tabella ha una sola policy, di lettura per l'admin.
--
-- Sicurezza del lavoro quotidiano: il trigger scrive il registro dentro un blocco che ignora
-- qualsiasi errore, quindi inserire/modificare/eliminare ore non può mai fallire per colpa dello storico.

create table if not exists public.work_log_history (
  id              bigint generated always as identity primary key,
  work_log_id     bigint      not null,                       -- id della riga di ore (anche se poi eliminata)
  user_id         uuid        not null references public.profiles(id) on delete cascade, -- di chi sono le ore
  action          text        not null check (action in ('update', 'delete')),
  changed_by      uuid,                                       -- chi ha fatto la modifica
  changed_by_role text,                                       -- 'admin' | 'employee' al momento della modifica
  changed_at      timestamptz not null default now(),
  old_data        jsonb       not null,                       -- riga prima della modifica
  new_data        jsonb                                       -- riga dopo (null se eliminata)
);

create index if not exists work_log_history_user_idx on public.work_log_history (user_id, changed_at desc);
create index if not exists work_log_history_log_idx  on public.work_log_history (work_log_id);

alter table public.work_log_history enable row level security;

-- Solo lettura, solo admin. Nessuna policy di scrittura: scrive soltanto il trigger.
drop policy if exists work_log_history_select_admin on public.work_log_history;
create policy work_log_history_select_admin
  on public.work_log_history for select to authenticated
  using (public.is_admin());

revoke all on table public.work_log_history from anon, authenticated;
grant select on table public.work_log_history to authenticated;

create or replace function public.log_work_log_history()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_role  text;
begin
  begin
    -- Operazioni lato server senza utente (es. eliminazione di un account a cascata): non si registrano.
    if v_actor is null then
      return null;
    end if;

    if tg_op = 'UPDATE' then
      -- Registra solo se è cambiato qualcosa che conta per le ore.
      if (new.work_date, new.start_time, new.end_time, new.break_start, new.break_end, new.location, new.activity)
         is not distinct from
         (old.work_date, old.start_time, old.end_time, old.break_start, old.break_end, old.location, old.activity) then
        return null;
      end if;
    end if;

    select p.role into v_role from public.profiles p where p.id = v_actor;

    insert into public.work_log_history (work_log_id, user_id, action, changed_by, changed_by_role, old_data, new_data)
    values (
      old.id,
      old.user_id,
      lower(tg_op),
      v_actor,
      v_role,
      to_jsonb(old),
      case when tg_op = 'UPDATE' then to_jsonb(new) else null end
    );
  exception when others then
    -- lo storico non deve MAI impedire di salvare le ore
    null;
  end;
  return null;
end;
$function$;

drop trigger if exists trg_work_logs_history on public.work_logs;
create trigger trg_work_logs_history
  after update or delete on public.work_logs
  for each row execute function public.log_work_log_history();
