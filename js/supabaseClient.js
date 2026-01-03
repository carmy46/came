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

    if (!_client) _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return _client;
  }

  async function getCurrentUser() {
    const client = getClient();
    if (!client) return null;
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
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
})();
