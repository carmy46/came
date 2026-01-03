// js/auth.js
const emailEl = document.getElementById("email");
const passEl = document.getElementById("password");
const msgEl = document.getElementById("msg");
const loginBtn = document.getElementById("loginBtn");

function setMsg(text, type = "info") {
  if (!msgEl) return;
  msgEl.textContent = text;
  msgEl.className = `msg ${type}`;
}

async function redirectByRole() {
  const profile = await window.getMyProfile?.();
  if (!profile) return;

  const current = window.location.pathname.split("/").pop(); // es: admin.html
  const target = profile.role === "admin" ? "admin.html" : "employee.html";

  // Se sei già sulla pagina corretta, NON fare redirect
  if (current === target) return;

  window.location.replace(target); // meglio di href: evita loop/cronologia
}

loginBtn?.addEventListener("click", async () => {
  try {
    setMsg("Accesso in corso...");
    const email = (emailEl?.value || "").trim();
    const password = passEl?.value || "";

    if (!email || !password) {
      setMsg("Inserisci email e password.", "error");
      return;
    }

    if (!window.supabaseClient) {
      setMsg("Supabase non configurato correttamente (controlla chiave anon e script).", "error");
      return;
    }

    const { error } = await window.supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMsg("Credenziali non valide o utente non esistente.", "error");
      return;
    }

    await redirectByRole();
  } catch (err) {
    console.error(err);
    setMsg("Errore imprevisto. Controlla console e riprova.", "error");
  }
});

// Se sei già loggato, vai subito alla dashboard giusta
(async () => {
  try {
    const user = await window.getCurrentUser?.();
    if (user) await redirectByRole();
  } catch (_) {}
})();


