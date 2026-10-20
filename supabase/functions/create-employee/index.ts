// Supabase Edge Function: create-employee
//
// Crea l'account di un dipendente a partire da nome, username e password scelti dall'admin.
// Serve una funzione lato server perché la creazione di utenti richiede la "service role key",
// che NON deve mai stare nel browser.
//
// Il dipendente non ha un'email vera: su Supabase Auth l'account usa un indirizzo interno
// "<username>@came.invalid" (dominio riservato, non esiste e non riceve posta).
// Lo stesso dominio è in js/auth.js: se lo cambi qui, cambialo anche là.
//
// Chi può chiamarla: solo un utente loggato con profiles.role = 'admin'.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EMAIL_DOMAIN = "came.invalid";
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;

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
    return json({ error: "Solo l'amministratore può creare account." }, 403);
  }

  // 2) Dati in ingresso
  let input: { full_name?: unknown; username?: unknown; password?: unknown };
  try {
    input = await req.json();
  } catch {
    return json({ error: "Richiesta non valida." }, 400);
  }

  const fullName = String(input.full_name ?? "").trim().replace(/\s+/g, " ");
  const username = String(input.username ?? "").trim().toLowerCase();
  const password = String(input.password ?? "");

  if (fullName.length < 2 || fullName.length > 80) {
    return json({ error: "Inserisci nome e cognome (da 2 a 80 caratteri)." }, 400);
  }
  if (!USERNAME_RE.test(username)) {
    return json(
      { error: "Username non valido: da 3 a 30 caratteri, solo lettere minuscole, numeri, punto, trattino e underscore." },
      400,
    );
  }
  if (password.length < 8 || password.length > 72) {
    return json({ error: "La password deve avere da 8 a 72 caratteri." }, 400);
  }

  // 3) Username già usato?
  const { data: taken, error: takenErr } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (takenErr) {
    return json({ error: `Errore nel controllo username: ${takenErr.message}` }, 500);
  }
  if (taken) return json({ error: "Questo username è già in uso." }, 409);

  // 4) Crea l'account (già confermato: nessuna email da verificare)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: `${username}@${EMAIL_DOMAIN}`,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, username },
  });
  if (createErr || !created?.user) {
    const msg = createErr?.message ?? "";
    if (/already|registered|exists/i.test(msg)) {
      return json({ error: "Questo username è già in uso." }, 409);
    }
    if (/password/i.test(msg)) {
      return json({ error: `Password rifiutata: ${msg}` }, 400);
    }
    return json({ error: `Impossibile creare l'account: ${msg || "errore sconosciuto"}` }, 500);
  }

  // 5) Profilo: il trigger lo crea già come 'employee'; qui completiamo nome e username.
  const { error: profileErr } = await admin.from("profiles").upsert({
    id: created.user.id,
    full_name: fullName,
    username,
    role: "employee",
  });
  if (profileErr) {
    // Niente account a metà: se il profilo non si salva, annulla anche l'utente.
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: `Impossibile salvare il profilo: ${profileErr.message}` }, 500);
  }

  return json({ ok: true, id: created.user.id, full_name: fullName, username });
});
