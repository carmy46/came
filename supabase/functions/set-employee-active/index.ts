// Supabase Edge Function: set-employee-active
//
// Disattiva (o riattiva) l'account di un dipendente che non lavora più con noi.
// Disattivare NON cancella nulla: ore, richieste e ordini restano per i report.
// - in Supabase Auth l'utente viene "bannato": non può più entrare né rinnovare la sessione
// - profiles.active = false: l'app admin lo sposta tra gli ex dipendenti
// Serve una funzione lato server perché il ban richiede la "service role key".
//
// Chi può chiamarla: solo un utente loggato con profiles.role = 'admin', e mai su un altro admin.
// Body: { user_id: string, active: boolean }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Ban "per sempre" (100 anni); "none" lo toglie.
const BAN_FOREVER = "876000h";

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
    return json({ error: "Solo l'amministratore può disattivare account." }, 403);
  }

  // 2) Dati in ingresso
  let input: { user_id?: unknown; active?: unknown };
  try {
    input = await req.json();
  } catch {
    return json({ error: "Richiesta non valida." }, 400);
  }
  const userId = String(input.user_id ?? "").trim();
  const active = input.active === true;
  if (!userId || typeof input.active !== "boolean") return json({ error: "Richiesta non valida." }, 400);
  if (userId === caller.user.id) return json({ error: "Non puoi disattivare il tuo account." }, 400);

  // 3) Solo dipendenti (mai un admin)
  const { data: target } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return json({ error: "Dipendente non trovato." }, 404);
  if (target.role === "admin") return json({ error: "Non si può disattivare un amministratore." }, 400);

  // 4) Accesso: ban (o sblocco) in Supabase Auth
  const { error: banErr } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: active ? "none" : BAN_FOREVER,
  });
  if (banErr) return json({ error: `Impossibile aggiornare l'accesso: ${banErr.message}` }, 500);

  // 5) Stato nel profilo (se fallisce, riporta l'accesso com'era)
  const { error: profileErr } = await admin.from("profiles").update({ active }).eq("id", userId);
  if (profileErr) {
    await admin.auth.admin.updateUserById(userId, { ban_duration: active ? BAN_FOREVER : "none" });
    return json({ error: `Impossibile salvare lo stato: ${profileErr.message}` }, 500);
  }

  return json({ ok: true, id: userId, active });
});
