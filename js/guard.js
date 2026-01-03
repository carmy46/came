// js/guard.js
// Protegge le pagine in base al ruolo salvato nel profilo (tabella "profiles").
// Richiede: js/supabaseClient.js caricato prima.

async function requireRole(requiredRole) {
  try {
    const user = await window.getCurrentUser?.();
    if (!user) {
      window.location.replace("login.html");
      return false;
    }

    const profile = await window.getMyProfile?.();
    if (!profile) {
      window.location.replace("login.html");
      return false;
    }

    const target = profile.role === "admin" ? "admin.html" : "employee.html";
    const current = window.location.pathname.split("/").pop();

    // Se ruolo richiesto non combacia, manda alla pagina corretta
    if (requiredRole && profile.role !== requiredRole) {
      if (current !== target) window.location.replace(target);
      return false;
    }

    // Se sei già loggato ma sulla pagina sbagliata, correggi
    if (current && current !== target && (current === "admin.html" || current === "employee.html")) {
      window.location.replace(target);
      return false;
    }

    return true;
  } catch (e) {
    console.error(e);
    window.location.replace("login.html");
    return false;
  }
}


