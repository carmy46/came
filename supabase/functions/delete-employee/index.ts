// Supabase Edge Function: delete-employee
//
// Elimina DEFINITIVAMENTE l'account di un dipendente.
// Nel database tutto è collegato all'account con ON DELETE CASCADE: insieme all'utente spariscono
// profilo, ore, richieste, ordini prodotti e notifiche. Non si può annullare.
// (Per tenere lo storico c'è la disattivazione: set-employee-active.)
// Serve una funzione lato server perché eliminare utenti richiede la "service role key".
//
// Chi può chiamarla: solo un utente loggato con profiles.role = 'admin', e mai su un altro admin.
// Body: { user_id: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Metodo non consentito." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Configurazione del server incompleta." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Chi chiama? Deve essere un admin.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Non autenticato." }, 401);

  const { data: caller, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !caller?.user) return json({ error: "Sessione non valida." }, 401);

  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", caller.user.id)
    .maybeSingle();
  if (callerProfile?.role !== "admin") {
    return json({ error: "Solo l'amministratore può eliminare account." }, 403);
  }

  // 2) Dati in ingresso
  let input: { user_id?: unknown };
  try {
    input = await req.json();
  } catch {
    return json({ error: "Richiesta non valida." }, 400);
  }
  const userId = String(input.user_id ?? "").trim();
  if (!userId) return json({ error: "Richiesta non valida." }, 400);
  if (userId === caller.user.id) return json({ error: "Non puoi eliminare il tuo account." }, 400);

  // 3) Solo dipendenti (mai un admin)
  const { data: target } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return json({ error: "Dipendente non trovato." }, 404);
  if (target.role === "admin") return json({ error: "Non si può eliminare un amministratore." }, 400);

  // 4) Elimina l'utente: il database cancella a cascata profilo e tutti i suoi dati
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) return json({ error: `Impossibile eliminare l'account: ${delErr.message}` }, 500);

  return json({ ok: true, id: userId });
});
