// js/supabaseClient.js
// IMPORTANTISSIMO:
// Per funzionare nel browser devi includere prima questa libreria nella pagina:
// <script src="https://unpkg.com/@supabase/supabase-js@2"></script>
//
// Poi puoi usare questo file per creare il client.

(function () {
  const SUPABASE_URL = "https://uiebrgppvpukrrdyccgf.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpZWJyZ3BwdnB1a3JyZHljY2dmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxMjEyMDksImV4cCI6MjA4MTY5NzIwOX0.YGYjvvABbz0bsD1u1sxZ0SvjoC7NT_1-O_VoFVmXkFc";

  function isConfigured() {
    return (
      typeof SUPABASE_URL === "string" &&
      SUPABASE_URL.startsWith("http") &&
      typeof SUPABASE_ANON_KEY === "string" &&
      !SUPABASE_ANON_KEY.includes("INCOLLA_QUI")
    );
  }

  let _client = null;
  function getClient() {
    if (!isConfigured()) return null;
    if (!window.supabase || typeof window.supabase.createClient !== "function") return null;

    if (!_client) {
      // IMPORTANTE:
      // - Usando sessionStorage, la sessione NON resta dopo chiusura scheda/finestra.
      // - Così, se chiudi e riapri l'app, ti richiede di fare login.
      // Nota: su alcuni browser in modalità "privata" lo storage può essere bloccato: in quel caso
      // Supabase potrebbe non mantenere la sessione.
      const storage =
        (function pickStorage() {
          try {
            if (window.sessionStorage) return window.sessionStorage;
          } catch (_) {}
          try {
            if (window.localStorage) return window.localStorage;
          } catch (_) {}
          return undefined;
        })();

      _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          // Mantieni la sessione SOLO finché la scheda è aperta
          persistSession: true,
          storage,
          // valori di default, ma li teniamo espliciti
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      });
    }
    return _client;
  }

  async function getCurrentUser() {
    const client = getClient();
    if (!client) return null;
    const { data, error } = await client.auth.getUser();
    if (error) return null;
    return data.user;
  }

  async function getMyProfile() {
    const client = getClient();
    if (!client) return null;

    const user = await getCurrentUser();
    if (!user) return null;

    const { data, error } = await client
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", user.id)
      .single();

    if (error) throw error;
    return data;
  }

  async function signInWithPassword(email, password) {
    const client = getClient();
    if (!client) throw new Error("Supabase non configurato (manca ANON_KEY o libreria).");

    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const client = getClient();
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }

  // Legge TUTTE le righe di una query, a blocchi.
  // Supabase restituisce al massimo ~1000 righe per richiesta e, se ce ne sono di più, taglia
  // senza dare errore: i totali risulterebbero sbagliati. Qui si chiede il conteggio esatto e si
  // continua finché non sono arrivate tutte; se alla fine ne manca anche una sola si restituisce
  // un errore (meglio nessun dato che un dato incompleto).
  //   table   = nome tabella
  //   columns = stringa del select (join compresi, es. "id, profiles ( full_name )")
  //   apply   = funzione che riceve la query e aggiunge filtri/ordinamenti (facoltativa)
  // Ritorna { data, error } come una query normale. Aggiunge in coda l'ordinamento per "id"
  // così i blocchi non si sovrappongono e non saltano righe.
  async function fetchAllRows(table, columns, apply) {
    const client = getClient();
    if (!client) return { data: null, error: new Error("Supabase non configurato.") };

    const PAGE = 1000;
    const rows = [];
    let total = null;
    try {
      for (;;) {
        let q = client.from(table).select(columns, { count: "exact" });
        if (typeof apply === "function") q = apply(q);
        const { data, error, count } = await q
          .order("id", { ascending: true })
          .range(rows.length, rows.length + PAGE - 1);
        if (error) return { data: null, error };

        if (total === null) total = count ?? 0;
        const page = data || [];
        for (const r of page) rows.push(r);
        if (!page.length || rows.length >= total) break;
      }
    } catch (e) {
      return { data: null, error: e };
    }

    if (rows.length < total) {
      return { data: null, error: new Error(`Dati incompleti da "${table}": ricevute ${rows.length} righe su ${total}.`) };
    }
    return { data: rows, error: null };
  }

  // API globale semplice
  window.SupabaseApi = {
    isConfigured,
    getClient,
    getCurrentUser,
    getMyProfile,
    signInWithPassword,
    signOut,
  };

  // Compatibilità con script "semplici" (come il tuo esempio):
  // - supabaseClient
  // - getCurrentUser()
  // - getMyProfile()
  window.supabaseClient = getClient();
  window.getCurrentUser = getCurrentUser;
  window.getMyProfile = getMyProfile;
  window.fetchAllRows = fetchAllRows;
})();
