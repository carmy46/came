-- Le operazioni lato server (nessun auth.uid(), es. eliminazione account dalla Edge Function
-- delete-employee, che cancella a cascata anche gli ordini) non devono essere bloccate.
-- Per gli utenti dell'app la regola resta identica: solo l'admin imposta la consegna o
-- cancella un ordine già consegnato.
create or replace function public.enforce_product_orders_delivery_admin()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
begin
  if auth.uid() is null then
    if (tg_op = 'DELETE') then return old; end if;
    return new;
  end if;

  -- UPDATE: se cambia delivery_date e non sei admin -> blocca
  if (tg_op = 'UPDATE') then
    if (new.delivery_date is distinct from old.delivery_date) and (not public.is_admin()) then
      raise exception 'Solo admin può impostare la data di consegna';
    end if;
  end if;

  -- DELETE: se già consegnato e non sei admin -> blocca
  if (tg_op = 'DELETE') then
    if (old.delivery_date is not null) and (not public.is_admin()) then
      raise exception 'Ordine già consegnato: non puoi cancellarlo';
    end if;
  end if;

  if (tg_op = 'DELETE') then
    return old;
  end if;
  return new;
end;
$function$;
