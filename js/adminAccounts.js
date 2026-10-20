// js/adminAccounts.js
// Creazione account dipendenti (solo admin): l'admin sceglie nome, username e password.
// Il dipendente poi accede con username + password, senza email.
// Il lavoro vero lo fa la Edge Function "create-employee" (supabase/functions/create-employee),
// perché creare utenti richiede una chiave che non può stare nel browser.
// Usa funzioni già definite in admin.js: loadEmployees, lockBodyScroll, unlockBodyScroll.

(function () {
  const openBtn = document.getElementById("newEmployeeBtn");
  const modalEl = document.getElementById("newEmployeeModal");
  if (!openBtn || !modalEl) return;

  const formEl = document.getElementById("newEmployeeForm");
  const nameEl = document.getElementById("newEmpName");
  const userEl = document.getElementById("newEmpUsername");
  const passEl = document.getElementById("newEmpPassword");
  const genBtn = document.getElementById("newEmpGenBtn");
  const submitBtn = document.getElementById("newEmpSubmit");
  const msgEl = document.getElementById("newEmpMsg");

  const doneEl = document.getElementById("newEmpDone");
  const doneUserEl = document.getElementById("newEmpDoneUser");
  const donePassEl = document.getElementById("newEmpDonePass");
  const doneNameEl = document.getElementById("newEmpDoneName");
  const copyBtn = document.getElementById("newEmpCopyBtn");
  const againBtn = document.getElementById("newEmpAgainBtn");

  // password suggerita: solo cifre, comoda da dire a voce o scrivere su WhatsApp (si può cambiare a mano)
  const PASS_CHARS = "0123456789";

  let usernameTouched = false;
  let lastCreated = null; // { full_name, username, password }

  function setMsg(text, type) {
    msgEl.textContent = text || "";
    msgEl.className = "msg" + (type ? " " + type : "");
  }

  function slugify(name) {
    return String(name || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "")
      .slice(0, 30);
  }

  function generatePassword(len = 8) {
    const buf = new Uint32Array(len);
    crypto.getRandomValues(buf);
    return Array.from(buf, (n) => PASS_CHARS[n % PASS_CHARS.length]).join("");
  }

  function showForm() {
    formEl.style.display = "";
    doneEl.style.display = "none";
  }

  function resetForm() {
    formEl.reset();
    usernameTouched = false;
    passEl.value = generatePassword();
    setMsg("");
    submitBtn.disabled = false;
    submitBtn.textContent = "Crea account";
    showForm();
  }

  function openModal() {
    resetForm();
    modalEl.classList.add("open");
    modalEl.setAttribute("aria-hidden", "false");
    if (typeof lockBodyScroll === "function") lockBodyScroll();
    nameEl.focus();
  }

  function closeModal() {
    modalEl.classList.remove("open");
    modalEl.setAttribute("aria-hidden", "true");
    if (typeof unlockBodyScroll === "function") unlockBodyScroll();
    // non lasciare la password nella pagina
    lastCreated = null;
    formEl.reset();
    donePassEl.textContent = "";
  }

  // Messaggio d'errore leggibile dalla risposta della Edge Function
  async function readError(error) {
    try {
      const body = await error.context.json();
      if (body && body.error) return body.error;
    } catch (_) {}
    if (error && /Failed to send|fetch/i.test(String(error.message || ""))) {
      return "Server non raggiungibile: la funzione create-employee è stata pubblicata su Supabase?";
    }
    return "Creazione non riuscita. Riprova.";
  }

  openBtn.addEventListener("click", openModal);
  modalEl.querySelectorAll("[data-newemp-close]").forEach((el) => el.addEventListener("click", closeModal));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalEl.classList.contains("open")) closeModal();
  });

  // username suggerito dal nome, finché non lo modifichi a mano
  nameEl.addEventListener("input", () => {
    if (!usernameTouched) userEl.value = slugify(nameEl.value);
  });
  userEl.addEventListener("input", () => {
    usernameTouched = true;
  });

  genBtn.addEventListener("click", () => {
    passEl.value = generatePassword();
  });

  formEl.addEventListener("submit", async (e) => {
    e.preventDefault();

    const full_name = nameEl.value.trim().replace(/\s+/g, " ");
    const username = userEl.value.trim().replace(/\s+/g, " ");
    const password = passEl.value;

    if (full_name.length < 2) return setMsg("Inserisci nome e cognome.", "error");
    if (!username) return setMsg("Inserisci l'username.", "error");
    if (!password) return setMsg("Inserisci la password.", "error");

    submitBtn.disabled = true;
    submitBtn.textContent = "Creazione...";
    setMsg("");

    try {
      const { data, error } = await window.supabaseClient.functions.invoke("create-employee", {
        body: { full_name, username, password },
      });
      if (error) throw { message: await readError(error) };
      if (data && data.error) throw { message: data.error };

      lastCreated = { full_name, username, password };
      doneNameEl.textContent = full_name;
      doneUserEl.textContent = username;
      donePassEl.textContent = password;
      copyBtn.textContent = "Copia credenziali";
      formEl.style.display = "none";
      doneEl.style.display = "";

      if (typeof loadEmployees === "function") loadEmployees();
    } catch (err) {
      setMsg(err && err.message ? err.message : "Creazione non riuscita. Riprova.", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Crea account";
    }
  });

  copyBtn.addEventListener("click", async () => {
    if (!lastCreated) return;
    const text =
      `CAME - accesso\n` +
      `Nome: ${lastCreated.full_name}\n` +
      `Username: ${lastCreated.username}\n` +
      `Password: ${lastCreated.password}\n` +
      `Link: ${window.location.origin}/login.html`;
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = "Copiato ✓";
    } catch (_) {
      copyBtn.textContent = "Copia non riuscita: scrivile a mano";
    }
  });

  againBtn.addEventListener("click", resetForm);
})();
