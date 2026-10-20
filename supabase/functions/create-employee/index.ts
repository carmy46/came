// Supabase Edge Function: create-employee
//
// Crea l'account di un dipendente a partire da nome, username e password scelti dall'admin.
// Serve una funzione lato server perché la creazione di utenti richiede la "service role key",
// che NON deve mai stare nel browser.
//
// L'username è libero (maiuscole, spazi, accenti...). Il dipendente non ha un'email vera, ma
// Supabase Auth vuole un indirizzo valido: l'account usa un'email interna "u<codice>@came.invalid"
// calcolata dall'username (dominio riservato, non esiste e non riceve posta).
// Il calcolo è lo stesso di js/auth.js: se cambi uno, cambia anche l'altro.
//
// Chi può chiamarla: solo un utente loggato con profiles.role = 'admin'.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- username -> email interna (TENERE UGUALE a js/auth.js) ---
const INTERNAL_EMAIL_DOMAIN = "came.invalid";
function normalizeUsername(s: unknown): string {
  return String(s ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}
async function usernameToEmail(username: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeUsername(username));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `u${hex.slice(0, 40)}@${INTERNAL_EMAIL_DOMAIN}`;
}
// --- fine ---

const USERNAME_MAX = 100;

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
  // Come l'ha scritto l'admin (solo spazi ripuliti): è quello che si vede nell'app.
  const username = String(input.username ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
  const password = String(input.password ?? "");

  if (fullName.length < 2 || fullName.length > 80) {
    return json({ error: "Inserisci nome e cognome (da 2 a 80 caratteri)." }, 400);
  }
  if (!username) return json({ error: "Inserisci l'username." }, 400);
  if (username.length > USERNAME_MAX) {
    return json({ error: `Username troppo lungo (massimo ${USERNAME_MAX} caratteri).` }, 400);
  }
  if (password.length < 8 || password.length > 72) {
    return json({ error: "La password deve avere da 8 a 72 caratteri." }, 400);
  }

  // 3) Crea l'account (già confermato: nessuna email da verificare).
  //    Se l'username esiste già (maiuscole e spazi extra non contano) l'email interna coincide
  //    e Supabase rifiuta la creazione.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: await usernameToEmail(username),
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

  // 4) Profilo: il trigger lo crea già come 'employee'; qui completiamo nome e username.
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
