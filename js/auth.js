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

// --- username -> email interna (TENERE UGUALE nella Edge Function supabase/functions/create-employee) ---
// L'username è libero (maiuscole, spazi, accenti...), ma Supabase Auth vuole un'email valida:
// perciò l'account usa un'email interna calcolata dall'username (maiuscole e spazi extra non contano).
const INTERNAL_EMAIL_DOMAIN = "came.invalid";
function normalizeUsername(s) {
  return String(s ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}
async function usernameToEmail(username) {
  const bytes = new TextEncoder().encode(normalizeUsername(username));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `u${hex.slice(0, 40)}@${INTERNAL_EMAIL_DOMAIN}`;
}
// --- fine ---

loginBtn?.addEventListener("click", async () => {
  try {
    setMsg("Accesso in corso...");
    // Si può scrivere l'username (account creati dall'admin) oppure un'email vera (account storici).
    // Se c'è una @ provo prima come email, poi come username.
    const typed = (emailEl?.value || "").trim();
    const password = passEl?.value || "";

    if (!typed || !password) {
      setMsg("Inserisci username e password.", "error");
      return;
    }

    if (!window.supabaseClient) {
      setMsg("Supabase non configurato correttamente (controlla chiave anon e script).", "error");
      return;
    }

    const candidates = typed.includes("@") ? [typed] : [];
    try {
      candidates.push(await usernameToEmail(typed));
    } catch (_) {
      if (!candidates.length) {
        setMsg("Per entrare con l'username apri il sito da https.", "error");
        return;
      }
    }

    let signedIn = false;
    for (const email of candidates) {
      const { error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
      if (!error) { signedIn = true; break; }
    }

    if (!signedIn) {
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


