// js/admin.js

function formatDateIT(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return new Intl.DateTimeFormat("it-IT").format(d);
}

function fmtTime(t) {
  // accetta "HH:MM" o "HH:MM:SS" e restituisce sempre "HH:MM"
  const s = String(t || "").trim();
  if (!s) return "—";
  // formato tipico: 08:30:00
  if (s.length >= 5) return s.slice(0, 5);
  return s;
}

function fmtMonthYear(ym) {
  // "YYYY-MM" -> "MM/YYYY"
  const s = String(ym || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (!m) return s || "—";
  return `${m[2]}/${m[1]}`;
}

function fmtMonthYearFile(ym) {
  // per filename: niente "/"
  return fmtMonthYear(ym).replace("/", "-");
}

function timeToMinutes(t) {
  // "HH:MM" o "HH:MM:SS" -> minuti dal giorno (per ordinamenti)
  const s = String(t || "").trim();
  if (!s) return 0;
  const parts = s.split(":").map(Number);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  return h * 60 + m;
}

function minutesBetween(start, end) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  // Gestione turni notturni a cavallo della mezzanotte
  if (diff < 0) diff += 24 * 60;
  return diff;
}

function netMinutes(log) {
  let total = minutesBetween(log.start_time, log.end_time);
  if (log.break_start && log.break_end) total -= minutesBetween(log.break_start, log.break_end);
  return Math.max(0, total);
}

function formatHM(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${String(m).padStart(2,"0")}m`;
}

function getTodayISO() {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getCurrentMonthISO() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}`;
}

let adminCurrentRequestRows = [];
let adminCurrentProductGroups = [];

// Dipendenti (elenco + scheda dipendente)
let adminEmployees = []; // [{ id, full_name }]
let adminEmpSelected = null; // { id, full_name }
let empHoursRows = [];
let empReqRows = [];

const logoutBtn = document.getElementById("logoutBtn");

// --- Elenco dipendenti (sezione Dipendenti) ---
const adminEmployeesCountEl = document.getElementById("adminEmployeesCount");
const adminEmployeesSearchEl = document.getElementById("adminEmployeesSearch");
const adminEmployeesChipsEl = document.getElementById("adminEmployeesChips");

// --- Scheda dipendente (colonna di destra) ---
const empSplitEl = document.querySelector("#view-employees .emp-split");
const empEmptyEl = document.getElementById("empEmpty");
const empPanelEl = document.getElementById("empPanel");
const adminEmpModalNameEl = document.getElementById("adminEmpModalName");

const empHoursMonthEl = document.getElementById("empHoursMonth");
const empHoursMonthTotalEl = document.getElementById("empHoursMonthTotal");
const empHoursListEl = document.getElementById("empHoursList");
const empHoursExportXlsxBtn = document.getElementById("empHoursExportXlsxBtn");

const empReqStatusEl = document.getElementById("empReqStatus");
const empReqTypeEl = document.getElementById("empReqType");
const empReqMonthEl = document.getElementById("empReqMonth");
const empReqResetBtn = document.getElementById("empReqReset");
const empReqExportXlsxBtn = document.getElementById("empReqExportXlsxBtn");
const empReqInfoEl = document.getElementById("empReqInfo");
const empRequestsListEl = document.getElementById("empRequestsList");

logoutBtn?.addEventListener("click", async () => {
  try { await window.supabaseClient.auth.signOut(); } catch (_) {}
  try { sessionStorage.clear(); } catch (_) {}
  try { localStorage.clear(); } catch (_) {}
  window.location.replace("login.html");
});

function setEmpTab(tab) {
  const t = String(tab || "hours");
  document.querySelectorAll("[data-emp-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-emp-tab") === t);
  });
  document.querySelectorAll(".emp-tab").forEach((el) => el.classList.remove("active"));
  document.getElementById(`emp-tab-${t}`)?.classList.add("active");
}

// Apre la scheda di un dipendente nella sezione Dipendenti
function openEmployee({ id, full_name }) {
  if (!id) return;
  adminEmpSelected = { id, full_name: (full_name || "").trim() || "Senza nome" };

  if (adminEmpModalNameEl) adminEmpModalNameEl.textContent = adminEmpSelected.full_name;

  // default mesi
  if (empHoursMonthEl && !empHoursMonthEl.value) empHoursMonthEl.value = getCurrentMonthISO();
  if (empReqMonthEl && !empReqMonthEl.value) empReqMonthEl.value = "";

  showView("employees");
  if (empEmptyEl) empEmptyEl.hidden = true;
  if (empPanelEl) empPanelEl.hidden = false;
  empSplitEl?.classList.add("has-selection"); // su telefono: mostra la scheda al posto dell'elenco
  markSelectedEmployee();
  window.scrollTo(0, 0);

  setEmpTab("hours");
  loadEmpHours();
  loadEmpRequests();
  loadEmpPhone();
}

// --- Telefono del dipendente (serve per il promemoria WhatsApp) ---
const empPhoneEl = document.getElementById("empPhone");
const empPhoneSaveBtn = document.getElementById("empPhoneSave");
const empPhoneMsgEl = document.getElementById("empPhoneMsg");

function setEmpPhoneMsg(text, kind) {
  if (!empPhoneMsgEl) return;
  empPhoneMsgEl.textContent = text || "";
  empPhoneMsgEl.className = "msg" + (kind ? ` ${kind}` : "");
}

async function loadEmpPhone() {
  const id = adminEmpSelected?.id;
  if (!empPhoneEl || !id) return;
  empPhoneEl.value = "";
  setEmpPhoneMsg("");
  try {
    const { data, error } = await supabaseClient.from("profiles").select("phone").eq("id", id).single();
    if (error) throw error;
    if (adminEmpSelected?.id === id) empPhoneEl.value = data?.phone || "";
  } catch (e) {
    console.error(e);
  }
}

empPhoneSaveBtn?.addEventListener("click", async () => {
  const id = adminEmpSelected?.id;
  if (!id) return;
  const phone = (empPhoneEl?.value || "").trim();
  if (phone && !window.missingHours.waNumber(phone)) {
    setEmpPhoneMsg("Numero non valido.", "error");
    return;
  }
  empPhoneSaveBtn.disabled = true;
  try {
    const { error } = await supabaseClient.from("profiles").update({ phone: phone || null }).eq("id", id);
    if (error) throw error;
    setEmpPhoneMsg("Salvato ✅", "ok");
  } catch (e) {
    console.error(e);
    setEmpPhoneMsg("Errore salvataggio telefono.", "error");
  } finally {
    empPhoneSaveBtn.disabled = false;
  }
});

// Su telefono: torna dalla scheda all'elenco
document.getElementById("empBackBtn")?.addEventListener("click", () => {
  empSplitEl?.classList.remove("has-selection");
});

function markSelectedEmployee() {
  adminEmployeesChipsEl?.querySelectorAll("[data-open-emp]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-emp-id") === String(adminEmpSelected?.id || ""));
  });
}

// Scroll lock robusto (soprattutto su iPhone/Safari) - usato dal modale "Nuovo dipendente"
let _lockedScrollY = 0;
function lockBodyScroll() {
  if (document.body.classList.contains("modal-open")) return;
  _lockedScrollY = window.scrollY || 0;
  document.body.classList.add("modal-open");
  // evita “scroll bleed” su mobile
  document.body.style.position = "fixed";
  document.body.style.top = `-${_lockedScrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
}

function unlockBodyScroll() {
  if (!document.body.classList.contains("modal-open")) return;
  document.body.classList.remove("modal-open");
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  window.scrollTo(0, _lockedScrollY || 0);
}

function bindOpenEmployeeButtons(rootEl) {
  if (!rootEl) return;
  rootEl.querySelectorAll("[data-open-emp]").forEach((btn) => {
    if (btn.dataset.boundOpenEmp) return;
    btn.dataset.boundOpenEmp = "1";
    btn.addEventListener("click", (e) => {
      // evita toggle del <summary>
      e.preventDefault();
      e.stopPropagation();

      const id = btn.getAttribute("data-emp-id");
      const name = btn.getAttribute("data-emp-name") || "Senza nome";
      if (!id) return;
      openEmployee({ id, full_name: name });
    });
  });
}

// tabs
document.querySelectorAll("[data-emp-tab]").forEach((btn) => {
  btn.addEventListener("click", () => setEmpTab(btn.getAttribute("data-emp-tab")));
});

// --- NAV ---
// Mostra una sezione e carica i suoi dati
function showView(view) {
  const v = String(view || "overview");
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
  document.querySelectorAll(".view").forEach((el) => el.classList.remove("active"));
  document.getElementById(`view-${v}`)?.classList.add("active");

  if (v === "overview") loadOverview();
  if (v === "requests") loadRequests();
  if (v === "products") loadProducts();
  if (v === "catalog") loadCatalogAdmin();
}

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.view;
    // "Dipendenti" dal menu riparte dall'elenco (su telefono)
    if (view === "employees") empSplitEl?.classList.remove("has-selection");
    showView(view);
    window.scrollTo(0, 0);
  });
});

document.getElementById("adminHomeLink")?.addEventListener("click", () => showView("overview"));

const adminReqExportXlsxBtn = document.getElementById("adminReqExportXlsxBtn");
const adminProdExportXlsxBtn = document.getElementById("adminProdExportXlsxBtn");

empHoursMonthEl?.addEventListener("change", () => loadEmpHours());

empReqStatusEl?.addEventListener("change", () => loadEmpRequests());
empReqTypeEl?.addEventListener("change", () => loadEmpRequests());
empReqMonthEl?.addEventListener("change", () => loadEmpRequests());
empReqResetBtn?.addEventListener("click", () => {
  if (empReqStatusEl) empReqStatusEl.value = "";
  if (empReqTypeEl) empReqTypeEl.value = "";
  if (empReqMonthEl) empReqMonthEl.value = "";
  loadEmpRequests();
});

// ============================
// EXPORT RICHIESTE (scheda dipendente)
// ============================
empReqExportXlsxBtn?.addEventListener("click", () => {
  if (!adminEmpSelected?.id || !empReqRows || empReqRows.length === 0) {
    alert("Nessun dato da esportare (Richieste).");
    return;
  }

  const status = (empReqStatusEl?.value || "").trim();
  const type = (empReqTypeEl?.value || "").trim();
  const month = (empReqMonthEl?.value || "").trim(); // YYYY-MM

  const suffix = month ? fmtMonthYear(month) : "tutte";
  const fileSuffix = month ? fmtMonthYearFile(month) : "tutte";

  const sorted = empReqRows.slice().sort((a, b) => {
    if (a.start_date !== b.start_date) return String(a.start_date).localeCompare(String(b.start_date));
    if (a.type !== b.type) return String(a.type).localeCompare(String(b.type));
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  });

  const columns = ["Data", "Tipo", "Dettaglio", "Stato", "Nota"];
  const rows = sorted.map(r => {
    const dettaglio =
      r.type === "ferie"
        ? `Dal ${formatDateIT(r.start_date)} al ${formatDateIT(r.end_date)}`
        : (r.time ? `${formatDateIT(r.start_date)} • ${fmtTime(r.time)}` : `${formatDateIT(r.start_date)}`);

    return {
      "Data": r.start_date ? formatDateIT(r.start_date) : "",
      "Tipo": labelRequestType(r.type),
      "Dettaglio": dettaglio,
      "Stato": r.status || "",
      "Nota": (r.note || ""),
    };
  });

  const summaryRows = [
    { Voce: "Totale richieste", Valore: String(sorted.length) },
    { Voce: "Filtri", Valore: [month ? `Mese=${fmtMonthYear(month)}` : null, status ? `Stato=${status}` : null, type ? `Tipo=${type}` : null].filter(Boolean).join(" • ") || "—" },
  ];

  exportToExcelElegant({
    filename: `CAME_${adminEmpSelected.full_name}_Richieste_${fileSuffix}.xlsx`,
    sheetName: `Richieste ${suffix}`,
    title: `CAME – Richieste ${adminEmpSelected.full_name} (${suffix})`,
    columns,
    rows,
    summary: { title: `Riepilogo Richieste ${suffix}`, rows: summaryRows }
  });
});

async function loadEmployees() {
  if (!adminEmployeesChipsEl) return;
  adminEmployeesChipsEl.textContent = "Caricamento...";
  if (adminEmployeesCountEl) adminEmployeesCountEl.textContent = "—";

  try {
    // di default: role=employee (se nel DB è impostato così)
    let { data, error } = await supabaseClient
      .from("profiles")
      .select("id, full_name, role")
      .eq("role", "employee")
      .order("full_name", { ascending: true });

    // fallback: se non torna nulla, carica tutti e filtra client-side
    if (!error && (!data || data.length === 0)) {
      const res = await supabaseClient
        .from("profiles")
        .select("id, full_name, role")
        .order("full_name", { ascending: true });
      data = res.data;
      error = res.error;
    }

    if (error) throw error;

    adminEmployees = (data || [])
      .filter(p => p && p.id && String(p.role || "").toLowerCase() !== "admin")
      .map(p => ({ id: p.id, full_name: (p.full_name || "").trim() || "Senza nome" }));

    if (adminEmployeesCountEl) adminEmployeesCountEl.textContent = `${adminEmployees.length} account`;
    renderEmployeesChips();

  } catch (e) {
    console.error(e);
    adminEmployeesChipsEl.textContent = "Errore caricamento dipendenti.";
  }
}

function renderEmployeesChips() {
  if (!adminEmployeesChipsEl) return;
  const q = (adminEmployeesSearchEl?.value || "").trim().toLowerCase();
  const filtered = !q
    ? adminEmployees
    : adminEmployees.filter(p => String(p.full_name || "").toLowerCase().includes(q));

  if (!filtered.length) {
    adminEmployeesChipsEl.innerHTML = `<div class="muted">Nessun dipendente trovato.</div>`;
    return;
  }

  adminEmployeesChipsEl.innerHTML = filtered.map(p => `
    <button class="emp-list-item" type="button" data-open-emp data-emp-id="${escapeHtml(p.id)}" data-emp-name="${escapeHtml(p.full_name)}">
      ${escapeHtml(p.full_name)}
    </button>
  `).join("");

  bindOpenEmployeeButtons(adminEmployeesChipsEl);
  markSelectedEmployee();
}

let _empSearchTimer = null;
adminEmployeesSearchEl?.addEventListener("input", () => {
  clearTimeout(_empSearchTimer);
  _empSearchTimer = setTimeout(() => renderEmployeesChips(), 150);
});

// ============================
// PANORAMICA: numeri del mese + ore per dipendente
// ============================
const overviewMonthEl = document.getElementById("overviewMonth");
if (overviewMonthEl && !overviewMonthEl.value) overviewMonthEl.value = getCurrentMonthISO();
overviewMonthEl?.addEventListener("change", () => loadOverview());

function monthRange(ym) {
  const start = `${ym}-01`;
  const endDate = new Date(ym + "-01T00:00:00");
  endDate.setMonth(endDate.getMonth() + 1);
  endDate.setDate(0);
  const end = `${ym}-${String(endDate.getDate()).padStart(2, "0")}`;
  return { start, end };
}

async function loadOverview() {
  const listEl = document.getElementById("ovEmployeesList");
  const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = String(val); };
  const ym = (overviewMonthEl?.value || getCurrentMonthISO()).trim();
  const { start, end } = monthRange(ym);

  set("ovMonthTotal", "…");
  set("ovTodayTotal", "…");
  set("ovPendingRequests", "…");
  set("ovPendingOrders", "…");
  if (listEl) listEl.textContent = "Caricamento...";

  // Ore del mese (tutti) + totale per dipendente
  try {
    const { data, error } = await supabaseClient
      .from("work_logs")
      .select("user_id,work_date,start_time,end_time,break_start,break_end,profiles ( id, full_name )")
      .gte("work_date", start)
      .lte("work_date", end);
    if (error) throw error;

    const todayISO = getTodayISO();
    let monthMin = 0;
    let todayMin = 0;
    const byEmployee = new Map(); // user_id -> { full_name, totalMin, days:Set }
    for (const r of (data || [])) {
      const nm = netMinutes(r);
      monthMin += nm;
      if (r.work_date === todayISO) todayMin += nm;
      const g = byEmployee.get(r.user_id) || { full_name: (r.profiles?.full_name || "").trim() || "Senza nome", totalMin: 0, days: new Set() };
      g.totalMin += nm;
      g.days.add(r.work_date);
      byEmployee.set(r.user_id, g);
    }
    set("ovMonthTotal", formatHM(monthMin));
    set("ovTodayTotal", formatHM(todayMin));

    if (listEl) {
      const employees = Array.from(byEmployee.entries()).sort(([, a], [, b]) =>
        String(a.full_name).localeCompare(String(b.full_name), "it", { sensitivity: "base" })
      );
      listEl.innerHTML = employees.length
        ? employees.map(([userId, e]) => `
            <button class="ov-row" type="button" data-open-emp data-emp-id="${escapeHtml(String(userId))}" data-emp-name="${escapeHtml(e.full_name)}">
              <span class="ov-row-name">${escapeHtml(e.full_name)}</span>
              <span class="ov-row-days">${e.days.size} giorn${e.days.size === 1 ? "o" : "i"}</span>
              <span class="ov-row-total">${escapeHtml(formatHM(e.totalMin))}</span>
            </button>
          `).join("")
        : `<div class="empty-state">Nessuna ora registrata in ${escapeHtml(fmtMonthYear(ym))}.</div>`;
      bindOpenEmployeeButtons(listEl);
    }

    loadMissingHours(ym, data || []);
  } catch (e) {
    console.error(e);
    set("ovMonthTotal", "—");
    set("ovTodayTotal", "—");
    if (listEl) listEl.textContent = "Errore caricamento ore.";
    const missEl = document.getElementById("ovMissingList");
    if (missEl) missEl.textContent = "Errore caricamento ore.";
  }

  // Richieste ancora da approvare (tutte, non solo del mese)
  try {
    const { count, error } = await supabaseClient
      .from("requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "inviata");
    if (error) throw error;
    set("ovPendingRequests", count || 0);
  } catch (e) {
    console.error(e);
    set("ovPendingRequests", "—");
  }

  // Ordini del mese ancora da consegnare (un ordine = dipendente + giorno + luogo, come in Prodotti)
  try {
    const { data, error } = await supabaseClient
      .from("product_orders")
      .select("user_id,order_date,place")
      .is("delivery_date", null)
      .gte("order_date", start)
      .lte("order_date", end);
    if (error) throw error;
    const keys = new Set((data || []).map(r => `${r.user_id}|${r.order_date}|${r.place || ""}`));
    set("ovPendingOrders", keys.size);
  } catch (e) {
    console.error(e);
    set("ovPendingOrders", "—");
  }
}

// Panoramica: chi non ha ancora inserito le ore (lun–ven fino a ieri) + promemoria WhatsApp
const APP_URL = "https://came-eta.vercel.app";

function whatsappReminderLink(phone, fullName) {
  const n = window.missingHours.waNumber(phone);
  if (!n) return "";
  const first = String(fullName || "").trim().split(/\s+/)[0] || "";
  const text = `Ciao${first ? " " + first : ""}, ricordati di inserire le ore sull'app CAME: ${APP_URL}\nGrazie!`;
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

async function loadMissingHours(ym, monthLogs) {
  const el = document.getElementById("ovMissingList");
  const infoEl = document.getElementById("ovMissingInfo");
  if (!el) return;
  el.textContent = "Caricamento...";
  if (infoEl) infoEl.textContent = "";

  try {
    const { start, end } = monthRange(ym);
    const [{ data: profiles, error: e1 }, { data: reqs, error: e2 }] = await Promise.all([
      supabaseClient.from("profiles").select("id, full_name, role, phone, created_at"),
      supabaseClient
        .from("requests")
        .select("user_id, type, status, start_date, end_date")
        .in("type", ["ferie", "permesso_giornaliero"])
        .neq("status", "rifiutata")
        .lte("start_date", end),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;

    const logsByUser = new Map(); // user_id -> Set(date)
    for (const r of monthLogs) {
      if (!logsByUser.has(r.user_id)) logsByUser.set(r.user_id, new Set());
      logsByUser.get(r.user_id).add(r.work_date);
    }

    let checked = false;
    const rows = [];
    for (const p of (profiles || [])) {
      if (!p?.id || String(p.role || "").toLowerCase() === "admin") continue;
      const rg = window.missingHours.range(ym, p.created_at);
      if (!rg) continue;
      checked = true;
      const days = window.missingHours.missingWeekdays({
        from: rg.from,
        to: rg.to,
        loggedDates: logsByUser.get(p.id),
        requests: (reqs || []).filter(r => r.user_id === p.id && (r.end_date || r.start_date) >= start),
      });
      if (days.length) rows.push({ id: p.id, full_name: (p.full_name || "").trim() || "Senza nome", phone: p.phone });
    }

    if (!checked) {
      el.innerHTML = `<div class="empty-state">Niente da controllare per ${escapeHtml(fmtMonthYear(ym))}.</div>`;
      return;
    }
    if (!rows.length) {
      el.innerHTML = `<div class="empty-state">Tutti in regola ✅</div>`;
      return;
    }

    // Ultimo giorno lavorato con ore inserite (di sempre, non solo del mese)
    await Promise.all(rows.map(async (r) => {
      const { data: last, error } = await supabaseClient
        .from("work_logs")
        .select("work_date")
        .eq("user_id", r.id)
        .order("work_date", { ascending: false })
        .limit(1);
      if (error) throw error;
      r.lastDate = last?.[0]?.work_date || "";
    }));

    // Prima chi è più indietro (o non ha mai inserito ore)
    rows.sort((a, b) => a.lastDate.localeCompare(b.lastDate) || a.full_name.localeCompare(b.full_name, "it", { sensitivity: "base" }));
    if (infoEl) infoEl.textContent = `${rows.length} dipendent${rows.length === 1 ? "e" : "i"}`;

    const thisYear = new Date().getFullYear();
    const fmtLast = (iso) => {
      const d = new Date(iso + "T00:00:00");
      const opts = { weekday: "short", day: "numeric", month: "short" };
      if (d.getFullYear() !== thisYear) opts.year = "numeric";
      return new Intl.DateTimeFormat("it-IT", opts).format(d);
    };

    el.innerHTML = rows.map(r => {
      const link = whatsappReminderLink(r.phone, r.full_name);
      const action = link
        ? `<a class="btn small wa-btn" href="${escapeHtml(link)}" target="_blank" rel="noopener">WhatsApp</a>`
        : `<button class="btn small ghost" type="button" data-open-emp data-emp-id="${escapeHtml(r.id)}" data-emp-name="${escapeHtml(r.full_name)}">Aggiungi numero</button>`;
      return `
        <div class="ov-row ov-miss-row">
          <button class="ov-miss-name" type="button" data-open-emp data-emp-id="${escapeHtml(r.id)}" data-emp-name="${escapeHtml(r.full_name)}">${escapeHtml(r.full_name)}</button>
          <span class="ov-row-days">${r.lastDate ? `Ultime ore: ${escapeHtml(fmtLast(r.lastDate))}` : "Nessuna ora inserita"}</span>
          ${action}
        </div>`;
    }).join("");
    bindOpenEmployeeButtons(el);
  } catch (e) {
    console.error(e);
    el.textContent = "Errore caricamento.";
  }
}

// Riquadri cliccabili della Panoramica
document.querySelectorAll("[data-ov-go]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const go = btn.getAttribute("data-ov-go");
    const ym = (overviewMonthEl?.value || getCurrentMonthISO()).trim();
    if (go === "requests") setReqStatusFilter("inviata");
    if (go === "products") {
      const m = document.getElementById("poFilterMonth");
      if (m) m.value = ym;
      adminPoStatusFilter = "pending";
      document.querySelectorAll("[data-po-status]").forEach((b) => b.classList.toggle("active", b.getAttribute("data-po-status") === "pending"));
    }
    if (go === "employees") empSplitEl?.classList.remove("has-selection");
    showView(go);
    window.scrollTo(0, 0);
  });
});

// ============================
// EXPORT ORE – TUTTI I DIPENDENTI (dalla Panoramica, mese scelto in alto)
// ============================
document.getElementById("exportAllHoursBtn")?.addEventListener("click", async () => {
  const btn = document.getElementById("exportAllHoursBtn");
  const ym = (overviewMonthEl?.value || getCurrentMonthISO()).trim();
  const origLabel = btn ? btn.textContent : "";

  if (btn) { btn.disabled = true; btn.textContent = "Caricamento..."; }

  try {
    const start = `${ym}-01`;
    const endDate = new Date(ym + "-01T00:00:00");
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(0);
    const end = `${ym}-${String(endDate.getDate()).padStart(2, "0")}`;

    const { data, error } = await supabaseClient
      .from("work_logs")
      .select(`
        id,
        user_id,
        work_date,
        start_time,
        end_time,
        break_start,
        break_end,
        location,
        activity,
        created_at,
        profiles ( id, full_name )
      `)
      .gte("work_date", start)
      .lte("work_date", end)
      .order("work_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw error;

    const allRows = data || [];
    if (!allRows.length) {
      alert(`Nessuna registrazione trovata per ${fmtMonthYear(ym)}.`);
      return;
    }

    // Raggruppa per dipendente
    const byEmployee = new Map();
    for (const r of allRows) {
      const userId = r.user_id || "unknown";
      const name = (r.profiles?.full_name || "").trim() || "Senza nome";
      const g = byEmployee.get(userId) || { userId, full_name: name, totalMin: 0, rows: [] };
      g.totalMin += netMinutes(r);
      g.rows.push(r);
      byEmployee.set(userId, g);
    }

    // Ordina per nome
    const employees = Array.from(byEmployee.values()).sort((a, b) =>
      String(a.full_name).localeCompare(String(b.full_name), "it", { sensitivity: "base" })
    );

    const ymLabel = fmtMonthYear(ym);
    const ymFile = fmtMonthYearFile(ym);
    const columns = ["Data", "Ora inizio", "Ora fine", "Inizio pausa", "Fine pausa", "Luogo", "Attività", "Ore"];

    // Un foglio per ogni dipendente
    const empSheets = employees.map(emp => {
      const sorted = emp.rows.slice().sort((a, b) => {
        if (a.work_date !== b.work_date) return String(a.work_date).localeCompare(String(b.work_date));
        const ta = timeToMinutes(a.start_time);
        const tb = timeToMinutes(b.start_time);
        if (ta !== tb) return ta - tb;
        return String(a.created_at || "").localeCompare(String(b.created_at || ""));
      });

      const rows = sorted.map(r => ({
        "Data": formatDateIT(r.work_date),
        "Ora inizio": fmtTime(r.start_time),
        "Ora fine": fmtTime(r.end_time),
        "Inizio pausa": r.break_start ? fmtTime(r.break_start) : "",
        "Fine pausa": r.break_end ? fmtTime(r.break_end) : "",
        "Luogo": r.location || "",
        "Attività": r.activity || "",
        "Ore": formatHM(netMinutes(r)),
      }));

      return {
        sheetName: emp.full_name.slice(0, 31),
        title: `CAME – Ore ${emp.full_name} (${ymLabel})`,
        columns,
        rows,
      };
    });

    // Foglio riepilogo (primo)
    const summaryColumns = ["Dipendente", "Registrazioni", "Ore totali"];
    const summaryRows = employees.map(emp => ({
      "Dipendente": emp.full_name,
      "Registrazioni": String(emp.rows.length),
      "Ore totali": formatHM(emp.totalMin),
    }));
    const grandTotal = employees.reduce((acc, e) => acc + e.totalMin, 0);
    summaryRows.push(
      { "Dipendente": "", "Registrazioni": "", "Ore totali": "" },
      { "Dipendente": "TOTALE", "Registrazioni": String(allRows.length), "Ore totali": formatHM(grandTotal) }
    );

    exportToExcelMultiSheet({
      filename: `CAME_Admin_Ore_Tutti_${ymFile}.xlsx`,
      sheets: [
        {
          sheetName: "Riepilogo",
          title: `CAME – Riepilogo Ore Tutti (${ymLabel})`,
          columns: summaryColumns,
          rows: summaryRows,
        },
        ...empSheets,
      ],
    });

  } catch (err) {
    console.error(err);
    alert("Errore durante l'esportazione. Controlla la console.");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = origLabel; }
  }
});

// --- Filtri richieste (admin) ---
// Stato scelto con i bottoni sopra l'elenco: "inviata" (da approvare) | "approvata" | "rifiutata" | "" (tutte)
let adminReqStatusFilter = "inviata";

function setReqStatusFilter(status) {
  adminReqStatusFilter = status || "";
  document.querySelectorAll("[data-req-status]").forEach((b) =>
    b.classList.toggle("active", b.getAttribute("data-req-status") === adminReqStatusFilter)
  );
}

document.querySelectorAll("[data-req-status]").forEach((btn) => {
  btn.addEventListener("click", () => {
    setReqStatusFilter(btn.getAttribute("data-req-status"));
    loadRequests();
  });
});

(function initRequestFilters() {
  const typeEl = document.getElementById("reqFilterType");
  const monthEl = document.getElementById("reqFilterMonth");
  const employeeEl = document.getElementById("reqFilterEmployee");
  const btnReset = document.getElementById("reqFiltersReset");

  if (!typeEl && !monthEl && !employeeEl && !btnReset) return;

  function apply() {
    // se la view non è attiva, non serve (evitiamo richieste inutili)
    const view = document.getElementById("view-requests");
    if (view && !view.classList.contains("active")) return;
    loadRequests();
  }

  // Applica quando cambia un filtro “semplice”
  typeEl?.addEventListener("change", apply);
  monthEl?.addEventListener("change", apply);

  // Ricerca nome: debounce leggero
  let t = null;
  employeeEl?.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(apply, 250);
  });

  btnReset?.addEventListener("click", () => {
    if (typeEl) typeEl.value = "";
    if (monthEl) monthEl.value = "";
    if (employeeEl) employeeEl.value = "";
    apply();
  });
})();

function escapeHtml(str) {
  // Compatibilità: evita String.prototype.replaceAll (non supportato su alcuni browser)
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function labelRequestType(t) {
  switch (t) {
    case "ferie": return "Ferie";
    case "permesso_giornaliero": return "Permesso giornaliero";
    case "uscita_anticipata": return "Permesso uscita anticipata";
    case "entrata_anticipata": return "Permesso entrata anticipata";
    case "entrata_posticipata": return "Permesso entrata posticipata";
    default: return t || "—";
  }
}

// ============================
// PRODOTTI (admin)
// ============================

(function initProductFilters() {
  const monthEl = document.getElementById("poFilterMonth");
  const searchEl = document.getElementById("poSearch");

  if (monthEl && !monthEl.value) monthEl.value = getCurrentMonthISO();

  function apply() {
    const view = document.getElementById("view-products");
    if (view && !view.classList.contains("active")) return;
    loadProducts();
  }

  monthEl?.addEventListener("change", apply);

  let t = null;
  searchEl?.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(apply, 250);
  });
})();

// Filtro stato consegna (chips sopra l'elenco): "all" | "pending" | "delivered".
// Agisce SOLO sull'elenco: KPI ed export restano sul mese intero.
let adminPoStatusFilter = "all";

document.querySelectorAll("[data-po-status]").forEach((btn) => {
  btn.addEventListener("click", () => {
    adminPoStatusFilter = btn.getAttribute("data-po-status") || "all";
    document.querySelectorAll("[data-po-status]").forEach((b) => b.classList.toggle("active", b === btn));
    loadProducts();
  });
});

function updatePoStatusChips(pendingCount, deliveredCount) {
  const set = (status, label) => {
    const b = document.querySelector(`[data-po-status="${status}"]`);
    if (b) b.textContent = label;
  };
  set("all", "Tutti");
  set("pending", `Da consegnare (${pendingCount})`);
  set("delivered", `Consegnati (${deliveredCount})`);
}

function setProductKpis({ orders = "—", pieces = "—", places = "—", topProduct = "—" } = {}) {
  const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = String(val); };
  set("poKpiOrders", orders);
  set("poKpiPieces", pieces);
  set("poKpiPlaces", places);
  set("poKpiTopProduct", topProduct);
}

// Segna la consegna di un ordine (tutte le righe di dipendente + giorno + luogo); null = non consegnato
async function saveOrderDelivery(userId, orderDate, place, deliveryDate) {
  const { error } = await supabaseClient
    .from("product_orders")
    .update({ delivery_date: deliveryDate })
    .eq("user_id", userId)
    .eq("order_date", orderDate)
    .eq("place", place);

  if (error) {
    console.error(error);
    alert("Errore salvataggio data consegna. Controlla console.");
    return;
  }
  await loadProducts();
}

async function loadProducts() {
  const el = document.getElementById("productsList");
  if (!el) return;
  el.textContent = "Caricamento...";
  setProductKpis({ orders: "…", pieces: "…", places: "…", topProduct: "…" });

  const monthEl = document.getElementById("poFilterMonth");
  const searchEl = document.getElementById("poSearch");

  const month = (monthEl?.value || getCurrentMonthISO()).trim(); // YYYY-MM
  const search = (searchEl?.value || "").trim().toLowerCase();

  try {
    const { start, end } = monthRange(month);

    const { data, error } = await supabaseClient
      .from("product_orders")
      .select(`
        id,
        user_id,
        order_date,
        delivery_date,
        place,
        product_name,
        quantity,
        created_at,
        profiles ( id, full_name )
      `)
      .gte("order_date", start)
      .lte("order_date", end)
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      el.textContent = "Errore caricamento prodotti.";
      setProductKpis({ orders: "—", pieces: "—", places: "—", topProduct: "—" });
      return;
    }

    // Raggruppa in "ordine unico": (dipendente, data, luogo)
    const groupsMap = new Map(); // key -> group
    for (const r of (data || [])) {
      const userId = r.user_id || "unknown";
      const place = r.place || "";
      const key = `${userId}|${r.order_date}|${place}`;

      const g = groupsMap.get(key) || {
        key,
        userId,
        order_date: r.order_date,
        delivery_date: r.delivery_date || null,
        place,
        full_name: r.profiles?.full_name || "Senza nome",
        created_at: r.created_at,
        items: [],
      };

      // created_at più recente del gruppo (per ordinare)
      if (r.created_at && (!g.created_at || r.created_at > g.created_at)) g.created_at = r.created_at;
      // se una riga ha delivery_date, teniamo quella (dovrebbero essere uguali nel gruppo)
      if (r.delivery_date && !g.delivery_date) g.delivery_date = r.delivery_date;

      g.items.push({ product_name: r.product_name, quantity: r.quantity });
      groupsMap.set(key, g);
    }

    let groups = Array.from(groupsMap.values());

    // Ricerca unica (client-side) su dipendente, luogo e prodotti: un ordine resta sempre completo
    if (search) {
      groups = groups.filter(g =>
        String(g.full_name || "").toLowerCase().includes(search) ||
        String(g.place || "").toLowerCase().includes(search) ||
        g.items.some(it => String(it.product_name || "").toLowerCase().includes(search))
      );
    }

    const piecesOf = (g) => g.items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
    const totalPieces = groups.reduce((acc, g) => acc + piecesOf(g), 0);

    // KPI del mese (riflettono i dati filtrati mostrati sotto)
    const distinctPlaces = new Set(groups.map(g => String(g.place || "—"))).size;
    const productTotals = new Map();
    for (const g of groups) {
      for (const it of g.items) {
        const name = String(it.product_name || "").trim() || "—";
        productTotals.set(name, (productTotals.get(name) || 0) + (Number(it.quantity) || 0));
      }
    }
    let topProduct = "—", topQty = -1;
    for (const [name, qty] of productTotals.entries()) {
      if (qty > topQty) { topQty = qty; topProduct = name; }
    }
    setProductKpis({
      orders: groups.length,
      pieces: totalPieces,
      places: distinctPlaces,
      topProduct: groups.length ? `${topProduct} (${topQty})` : "—",
    });

    // Salva per export (dati già filtrati come in UI)
    adminCurrentProductGroups = groups.slice();

    // Conteggi per le chips di stato (sempre sul mese filtrato per testo)
    const pendingTotal = groups.filter(g => !g.delivery_date).length;
    updatePoStatusChips(pendingTotal, groups.length - pendingTotal);

    if (!groups.length) {
      el.innerHTML = `<div class="empty-state">${search ? "Nessun ordine trovato." : "Nessun ordine prodotti in questo mese."}</div>`;
      return;
    }

    // Coda di lavoro: la chip attiva restringe l'elenco (non KPI né export)
    let visibleGroups = groups;
    if (adminPoStatusFilter === "pending") visibleGroups = groups.filter(g => !g.delivery_date);
    else if (adminPoStatusFilter === "delivered") visibleGroups = groups.filter(g => !!g.delivery_date);

    if (!visibleGroups.length) {
      el.innerHTML = `<div class="empty-state">${adminPoStatusFilter === "pending"
        ? "Niente da consegnare in questo mese ✅"
        : "Nessun ordine consegnato in questo mese."}</div>`;
      return;
    }

    const byDay = new Map(); // order_date -> groups[]
    for (const g of visibleGroups) {
      const arr = byDay.get(g.order_date) || [];
      arr.push(g);
      byDay.set(g.order_date, arr);
    }
    const days = Array.from(byDay.entries()).sort(([a], [b]) => String(b).localeCompare(String(a)));

    const orderHtml = (g) => {
      const done = !!g.delivery_date;
      const chips = g.items
        .map(it => `<span class="po-chip">${escapeHtml(it.product_name)} <b>×${escapeHtml(String(it.quantity))}</b></span>`)
        .join("");
      const attrs = `data-user-id="${escapeHtml(g.userId)}" data-order-date="${escapeHtml(String(g.order_date))}" data-place="${escapeHtml(encodeURIComponent(g.place || ""))}"`;
      const deliveryVal = done ? String(g.delivery_date).slice(0, 10) : "";

      return `
        <div class="po-order${done ? " is-done" : " is-pending"}">
          <div class="po-order-who">
            <div class="po-order-placename">${escapeHtml(g.place || "—")}</div>
            <div class="po-order-place">
              <button class="po-order-emp" type="button" data-open-emp data-emp-id="${escapeHtml(g.userId)}" data-emp-name="${escapeHtml(g.full_name)}">${escapeHtml(g.full_name)}</button>
              · ${escapeHtml(String(piecesOf(g)))} pz
            </div>
          </div>
          <div class="po-order-items">${chips}</div>
          <div class="po-order-deliver">
            ${done
              ? `<span class="po-status po-status--done">Consegnato ${escapeHtml(reqDayLabel(g.delivery_date))}</span>`
              : `<button class="btn small po-deliver-today" type="button" data-po-deliver-today ${attrs}>✓ Consegnato oggi</button>`}
            <input class="input po-deliver-input" type="date" aria-label="Data consegna" title="Data consegna (cancella per togliere)"
              data-po-delivery-input ${attrs} value="${escapeHtml(deliveryVal)}" />
          </div>
        </div>`;
    };

    el.innerHTML = `<div class="po-table">` + days.map(([day, dayGroups]) => {
      // Prima ciò che è da consegnare, poi per dipendente e luogo
      const sorted = dayGroups.slice().sort((a, b) =>
        (!!a.delivery_date - !!b.delivery_date) ||
        String(a.full_name).localeCompare(String(b.full_name), "it", { sensitivity: "base" }) ||
        String(a.place).localeCompare(String(b.place), "it", { sensitivity: "base" })
      );
      const dayPieces = sorted.reduce((acc, g) => acc + piecesOf(g), 0);
      // Giorno interamente consegnato: attenuato (solo nella vista "Tutti")
      const dayDone = adminPoStatusFilter === "all" && sorted.every(g => !!g.delivery_date);

      return `
        <section class="po-day${dayDone ? " po-day--done" : ""}">
          <div class="po-day-head">
            <div class="po-day-date">${escapeHtml(reqDayLabel(day))}</div>
            <div class="po-day-sum">
              <span>${sorted.length} ordin${sorted.length === 1 ? "e" : "i"}</span>
              <span class="po-day-pz">${escapeHtml(String(dayPieces))} pz</span>
            </div>
          </div>
          ${sorted.map(orderHtml).join("")}
        </section>`;
    }).join("") + `</div>`;

    const orderKey = (n) => [n.getAttribute("data-user-id"), n.getAttribute("data-order-date"), decodeURIComponent(n.getAttribute("data-place") || "")];

    el.querySelectorAll("[data-po-deliver-today]").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.disabled = true;
        saveOrderDelivery(...orderKey(btn), getTodayISO());
      });
    });
    el.querySelectorAll("[data-po-delivery-input]").forEach((input) => {
      input.addEventListener("change", () => saveOrderDelivery(...orderKey(input), (input.value || "").trim() || null));
    });

    bindOpenEmployeeButtons(el);

  } catch (err) {
    console.error(err);
    el.textContent = "Errore imprevisto.";
  }
}

// Giorni di calendario tra due date ISO (estremi inclusi)
function daysInclusive(startISO, endISO) {
  const a = new Date(startISO + "T00:00:00");
  const b = new Date((endISO || startISO) + "T00:00:00");
  return Math.round((b - a) / 86400000) + 1;
}

const fmtReqDay = new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short" });
function reqDayLabel(iso) {
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  return isNaN(d.getTime()) ? "—" : fmtReqDay.format(d);
}

// "Quando" leggibile: ferie con intervallo e giorni, permessi con giorno (e ora)
function requestWhenLabel(r) {
  if (r.type === "ferie") {
    const end = r.end_date || r.start_date;
    const n = daysInclusive(r.start_date, end);
    return end === r.start_date
      ? `${reqDayLabel(r.start_date)} (1 giorno)`
      : `dal ${reqDayLabel(r.start_date)} al ${reqDayLabel(end)} (${n} giorni)`;
  }
  return r.time ? `${reqDayLabel(r.start_date)} alle ${fmtTime(r.time)}` : reqDayLabel(r.start_date);
}

// Elimina una richiesta (qualsiasi stato), dopo conferma. true se eliminata.
async function deleteRequest(r) {
  const who = (r.profiles?.full_name || adminEmpSelected?.full_name || "").trim();
  const what = `${labelRequestType(r.type)} – ${requestWhenLabel(r)}`;
  const statusTxt = r.status === "approvata" ? "\n\nAttenzione: è già stata APPROVATA." : "";
  if (!confirm(`Eliminare questa richiesta${who ? ` di ${who}` : ""}?\n\n${what}${statusTxt}\n\nL'operazione non si può annullare.`)) return false;

  const { error } = await supabaseClient.from("requests").delete().eq("id", r.id);
  if (error) {
    console.error(error);
    alert("Errore nell'eliminazione della richiesta.");
    return false;
  }
  return true;
}

async function loadRequests() {
  const el = document.getElementById("requestsList");
  if (!el) return;
  el.textContent = "Caricamento...";

  const typeEl = document.getElementById("reqFilterType");
  const monthEl = document.getElementById("reqFilterMonth");
  const employeeEl = document.getElementById("reqFilterEmployee");
  const resetBtn = document.getElementById("reqFiltersReset");

  const status = adminReqStatusFilter;
  const type = (typeEl?.value || "").trim();
  const month = (monthEl?.value || "").trim(); // YYYY-MM
  const employeeQuery = (employeeEl?.value || "").trim().toLowerCase();
  if (resetBtn) resetBtn.hidden = !(type || month || employeeQuery);

  try {
    // Lo stato si filtra qui sotto: così i bottoni mostrano sempre i conteggi
    let q = supabaseClient
      .from("requests")
      .select(`
        id,
        user_id,
        type,
        start_date,
        end_date,
        time,
        status,
        note,
        created_at,
        profiles ( id, full_name )
      `)
      .order("created_at", { ascending: false });

    if (type) q = q.eq("type", type);

    // filtro mese sulla data richiesta (start_date)
    if (month) {
      const { start, end } = monthRange(month);
      q = q.gte("start_date", start).lte("start_date", end);
    }

    const { data, error } = await q;

    if (error) {
      console.error(error);
      el.textContent = "Errore caricamento richieste.";
      return;
    }

    let all = (data || []);

    // filtro per nome dipendente (client-side, perché il join non è sempre filtrabile con semplicità)
    if (employeeQuery) {
      all = all.filter(r => String(r.profiles?.full_name || "").toLowerCase().includes(employeeQuery));
    }

    const counts = { inviata: 0, approvata: 0, rifiutata: 0 };
    for (const r of all) if (r.status in counts) counts[r.status]++;
    const labels = { inviata: "Da approvare", approvata: "Approvate", rifiutata: "Rifiutate", "": "Tutte" };
    document.querySelectorAll("[data-req-status]").forEach((b) => {
      const s = b.getAttribute("data-req-status");
      const c = s ? counts[s] : all.length;
      b.textContent = `${labels[s]} (${c})`;
    });

    const rows = status ? all.filter(r => r.status === status) : all;

    // Da approvare: prima le più vicine nel tempo; le altre dalla più recente
    rows.sort((a, b) => status === "inviata"
      ? String(a.start_date).localeCompare(String(b.start_date))
      : String(b.start_date).localeCompare(String(a.start_date)));

    // Salva per export (dati già filtrati come in UI)
    adminCurrentRequestRows = rows.slice();

    if (!rows.length) {
      el.innerHTML = `<div class="empty-state">${status === "inviata" ? "Nessuna richiesta da approvare ✅" : "Nessuna richiesta."}</div>`;
      return;
    }

    el.innerHTML = `<div class="req-list">${rows.map(r => {
      const who = (r.profiles?.full_name || "").trim() || "Senza nome";
      const note = r.note ? String(r.note).trim() : "";
      const sent = r.created_at ? `inviata ${reqDayLabel(r.created_at)}` : "";

      const delBtn = `<button class="btn small ghost icon-btn req-del" type="button" data-req-del="${escapeHtml(String(r.id))}"
        title="Elimina richiesta" aria-label="Elimina richiesta di ${escapeHtml(who)}">🗑</button>`;
      const right = r.status === "inviata"
        ? `<div class="req-actions">
             <button class="btn small req-approve" type="button" data-req-action="approve" data-req-id="${escapeHtml(String(r.id))}">Approva</button>
             <button class="btn small danger" type="button" data-req-action="reject" data-req-id="${escapeHtml(String(r.id))}">Rifiuta</button>
             ${delBtn}
           </div>`
        : `<div class="req-actions">
             <span class="req-status req-status--${escapeHtml(r.status)}">${r.status === "approvata" ? "Approvata" : "Rifiutata"}</span>
             ${delBtn}
           </div>`;

      return `
        <div class="req-card${r.status === "inviata" ? " is-pending" : ""}">
          <div class="req-main">
            <div class="req-top">
              <button class="req-who" type="button" data-open-emp data-emp-id="${escapeHtml(String(r.user_id))}" data-emp-name="${escapeHtml(who)}">${escapeHtml(who)}</button>
              <span class="req-type">${escapeHtml(labelRequestType(r.type))}</span>
            </div>
            <div class="req-when">${escapeHtml(requestWhenLabel(r))}</div>
            ${note ? `<div class="req-note">“${escapeHtml(note)}”</div>` : ""}
            ${sent ? `<div class="req-sent muted">${escapeHtml(sent)}</div>` : ""}
          </div>
          <div class="req-side">${right}</div>
        </div>`;
    }).join("")}</div>`;

    el.querySelectorAll("[data-req-action]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-req-id");
        const action = btn.getAttribute("data-req-action");
        if (!id || !action) return;

        const nextStatus = action === "approve" ? "approvata" : "rifiutata";
        btn.disabled = true;
        const { error } = await supabaseClient
          .from("requests")
          .update({ status: nextStatus })
          .eq("id", id);

        if (error) {
          console.error(error);
          alert("Errore aggiornamento stato. Controlla console.");
          btn.disabled = false;
          return;
        }

        await loadRequests();
      });
    });

    el.querySelectorAll("[data-req-del]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const r = rows.find(x => String(x.id) === btn.getAttribute("data-req-del"));
        if (r && await deleteRequest(r)) await loadRequests();
      });
    });

    bindOpenEmployeeButtons(el);

  } catch (err) {
    console.error(err);
    el.textContent = "Errore imprevisto.";
  }
}

// ============================
// SCHEDA DIPENDENTE (sezione Dipendenti)
// ============================
async function loadEmpHours() {
  if (!adminEmpSelected?.id || !empHoursListEl) return;
  empHoursListEl.textContent = "Caricamento...";
  if (empHoursMonthTotalEl) empHoursMonthTotalEl.textContent = "—";

  const ym = (empHoursMonthEl?.value || getCurrentMonthISO()).trim();
  if (empHoursMonthEl && empHoursMonthEl.value !== ym) empHoursMonthEl.value = ym;

  const start = `${ym}-01`;
  const endDate = new Date(ym + "-01T00:00:00");
  endDate.setMonth(endDate.getMonth() + 1);
  endDate.setDate(0);
  const end = `${ym}-${String(endDate.getDate()).padStart(2, "0")}`;

  const { data, error } = await supabaseClient
    .from("work_logs")
    .select("id,user_id,work_date,start_time,end_time,break_start,break_end,location,activity,created_at")
    .eq("user_id", adminEmpSelected.id)
    .gte("work_date", start)
    .lte("work_date", end)
    .order("work_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    empHoursListEl.textContent = "Errore caricamento ore.";
    empHoursRows = [];
    return;
  }

  empHoursRows = data || [];

  if (!empHoursRows.length) {
    empHoursListEl.textContent = "Nessuna registrazione in questo mese.";
    return;
  }

  // raggruppa per giorno
  const byDay = new Map(); // work_date -> rows[]
  let totalMin = 0;
  for (const r of empHoursRows) {
    totalMin += netMinutes(r);
    const arr = byDay.get(r.work_date) || [];
    arr.push(r);
    byDay.set(r.work_date, arr);
  }
  if (empHoursMonthTotalEl) empHoursMonthTotalEl.textContent = formatHM(totalMin);

  const days = Array.from(byDay.entries()).sort(([a],[b]) => String(b).localeCompare(String(a)));

  // Tabella unica "continua": un solo contenitore, righe attaccate (niente card distanziate)
  const allRowsHtml = days.map(([day, rows]) => {
    const sorted = (rows || []).slice().sort((a, b) => {
      const ta = timeToMinutes(a.start_time);
      const tb = timeToMinutes(b.start_time);
      if (ta !== tb) return ta - tb;
      return String(a.created_at || "").localeCompare(String(b.created_at || ""));
    });

    const dayTotalMin = sorted.reduce((acc, r) => acc + netMinutes(r), 0);
    const groupRow = `
      <div class="rowItem rowGroup">
        <div><strong>${escapeHtml(formatDateIT(day))}</strong></div>
        <div class="muted">${escapeHtml(String(sorted.length))} registrazione/i</div>
        <div>${escapeHtml(formatHM(dayTotalMin))}</div>
        <div></div>
      </div>
    `;

    const lines = sorted.map(r => {
      const pausa = (r.break_start && r.break_end) ? ` • pausa ${fmtTime(r.break_start)}-${fmtTime(r.break_end)}` : "";
      const when = `${fmtTime(r.start_time)}-${fmtTime(r.end_time)}${pausa}`;
      return `
        <div class="rowItem">
          <div><strong>${escapeHtml(when)}</strong></div>
          <div>${escapeHtml(r.location)} • ${escapeHtml(r.activity)}</div>
          <div>${escapeHtml(formatHM(netMinutes(r)))}</div>
          <div class="row-actions">
            <button class="btn small icon-btn" type="button" data-edit-log="${escapeHtml(String(r.id))}"
              title="Modifica questa registrazione" aria-label="Modifica registrazione ${escapeHtml(when)}">✏️</button>
            <button class="btn small danger icon-btn" type="button" data-del-log="${escapeHtml(String(r.id))}"
              title="Elimina questa registrazione" aria-label="Elimina registrazione ${escapeHtml(when)}">🗑</button>
          </div>
        </div>
      `;
    }).join("");

    return groupRow + lines;
  }).join("");

  empHoursListEl.innerHTML = `<div class="emp-hours-table"><div class="rows">${allRowsHtml}</div></div>`;

  empHoursListEl.querySelectorAll("[data-del-log]").forEach((btn) => {
    btn.addEventListener("click", () => deleteWorkLog(btn.getAttribute("data-del-log"), btn));
  });
  empHoursListEl.querySelectorAll("[data-edit-log]").forEach((btn) => {
    btn.addEventListener("click", () => openEditLog(btn.getAttribute("data-edit-log")));
  });
}

// ============================
// MODIFICA UNA REGISTRAZIONE ORE (modale)
// Stessi controlli della modifica lato dipendente (employee.js)
// ============================
const editLogModalEl = document.getElementById("editLogModal");
const editLogFormEl = document.getElementById("editLogForm");
const editLogMsgEl = document.getElementById("editLogMsg");
const editLogSaveBtn = document.getElementById("editLogSave");
const editLogFields = {
  work_date: document.getElementById("editLogDate"),
  start_time: document.getElementById("editLogStart"),
  end_time: document.getElementById("editLogEnd"),
  break_start: document.getElementById("editLogBreakStart"),
  break_end: document.getElementById("editLogBreakEnd"),
  location: document.getElementById("editLogLocation"),
  activity: document.getElementById("editLogActivity"),
};
let editLogId = null;
let adminCatalogListsLoaded = false;

function setEditLogMsg(text, type = "info") {
  if (!editLogMsgEl) return;
  editLogMsgEl.textContent = text || "";
  editLogMsgEl.className = `msg ${type}`;
}

function validateWorkLogLike({ start_time, end_time, break_start, break_end }) {
  if (!start_time || !end_time) return { ok: false, msg: "Seleziona ora inizio e fine." };

  const startMin = timeToMinutes(start_time);
  // Durata con passaggio mezzanotte (turni notturni)
  const durationMin = minutesBetween(start_time, end_time);
  if (durationMin === 0) return { ok: false, msg: "L'ora fine deve essere diversa dall'ora inizio." };

  if ((break_start && !break_end) || (!break_start && break_end)) {
    return { ok: false, msg: "Se inserisci la pausa, compila sia inizio che fine pausa." };
  }
  if (break_start && break_end) {
    const bs = timeToMinutes(break_start);
    const be = timeToMinutes(break_end);
    if (be <= bs) return { ok: false, msg: "La fine pausa deve essere dopo l'inizio pausa." };
    let bsRel = bs - startMin;
    let beRel = be - startMin;
    if (bsRel < 0) bsRel += 24 * 60;
    if (beRel < 0) beRel += 24 * 60;
    if (bsRel >= durationMin || beRel > durationMin) {
      return { ok: false, msg: "La pausa deve essere dentro l'orario di lavoro." };
    }
  }
  return { ok: true, msg: "" };
}

// Suggerimenti per Luogo e Attività presi dai Cataloghi (si può comunque scrivere a mano)
async function loadAdminCatalogLists() {
  if (adminCatalogListsLoaded) return;
  try {
    const { data, error } = await supabaseClient
      .from("catalog_items")
      .select("type,name")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    const fill = (listId, type) => {
      const dl = document.getElementById(listId);
      if (!dl) return;
      dl.innerHTML = (data || [])
        .filter(it => it.type === type)
        .map(it => `<option value="${escapeHtml(it.name)}"></option>`)
        .join("");
    };
    fill("adminPlacesList", "place");
    fill("adminActivitiesList", "activity");
    adminCatalogListsLoaded = true;
  } catch (e) {
    console.error(e);
  }
}

function openEditLog(id) {
  const r = empHoursRows.find(x => String(x.id) === String(id));
  if (!r || !editLogModalEl) return;
  editLogId = r.id;

  editLogFields.work_date.value = r.work_date || "";
  editLogFields.start_time.value = fmtTime(r.start_time) === "—" ? "" : fmtTime(r.start_time);
  editLogFields.end_time.value = fmtTime(r.end_time) === "—" ? "" : fmtTime(r.end_time);
  editLogFields.break_start.value = r.break_start ? fmtTime(r.break_start) : "";
  editLogFields.break_end.value = r.break_end ? fmtTime(r.break_end) : "";
  editLogFields.location.value = r.location || "";
  editLogFields.activity.value = r.activity || "";

  const who = document.getElementById("editLogWho");
  if (who) who.textContent = adminEmpSelected?.full_name || "";
  setEditLogMsg("");
  if (editLogSaveBtn) { editLogSaveBtn.disabled = false; editLogSaveBtn.textContent = "Salva modifiche"; }

  editLogModalEl.classList.add("open");
  editLogModalEl.setAttribute("aria-hidden", "false");
  lockBodyScroll();
  loadAdminCatalogLists();
}

function closeEditLog() {
  if (!editLogModalEl) return;
  editLogModalEl.classList.remove("open");
  editLogModalEl.setAttribute("aria-hidden", "true");
  unlockBodyScroll();
  editLogId = null;
}

editLogModalEl?.querySelectorAll("[data-editlog-close]").forEach((el) => el.addEventListener("click", closeEditLog));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && editLogModalEl?.classList.contains("open")) closeEditLog();
});

editLogFormEl?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!editLogId) return;

  const val = (k) => (editLogFields[k]?.value || "").trim();
  const payload = {
    work_date: val("work_date"),
    start_time: val("start_time"),
    end_time: val("end_time"),
    break_start: val("break_start") || null,
    break_end: val("break_end") || null,
    location: val("location"),
    activity: val("activity"),
  };

  if (!payload.work_date) { setEditLogMsg("Seleziona la data.", "error"); return; }
  if (!payload.location || !payload.activity) { setEditLogMsg("Compila luogo e attività.", "error"); return; }
  const v = validateWorkLogLike(payload);
  if (!v.ok) { setEditLogMsg(v.msg, "error"); return; }

  if (editLogSaveBtn) { editLogSaveBtn.disabled = true; editLogSaveBtn.textContent = "Salvo..."; }
  try {
    // .select() restituisce le righe aggiornate: se è vuoto, Supabase non ha dato il permesso
    const { data, error } = await supabaseClient
      .from("work_logs")
      .update(payload)
      .eq("id", editLogId)
      .select("id");

    if (error) {
      console.error(error);
      setEditLogMsg(
        error.code === "23505"
          ? "Esiste già una registrazione con queste ore per questo luogo in questa data."
          : "Errore durante il salvataggio. Riprova.",
        "error"
      );
      return;
    }
    if (!data || data.length === 0) {
      setEditLogMsg("Le modifiche non sono state salvate: il database non ha dato il permesso.", "error");
      return;
    }

    // Se la nuova data è in un altro mese, mostra quel mese così la registrazione si ritrova subito
    const newMonth = payload.work_date.slice(0, 7);
    if (empHoursMonthEl && newMonth && empHoursMonthEl.value !== newMonth) empHoursMonthEl.value = newMonth;

    closeEditLog();
    await loadEmpHours();
  } catch (err) {
    console.error(err);
    setEditLogMsg("Errore imprevisto. Riprova.", "error");
  } finally {
    if (editLogSaveBtn) { editLogSaveBtn.disabled = false; editLogSaveBtn.textContent = "Salva modifiche"; }
  }
});

// Elimina UNA registrazione ore (una riga), dopo conferma
async function deleteWorkLog(id, btn) {
  const r = empHoursRows.find(x => String(x.id) === String(id));
  if (!r) return;

  const when = `${formatDateIT(r.work_date)}, ${fmtTime(r.start_time)}-${fmtTime(r.end_time)}`;
  const where = [r.location, r.activity].filter(Boolean).join(" • ");
  const ok = confirm(
    `Eliminare questa registrazione di ${adminEmpSelected?.full_name || "questo dipendente"}?\n\n` +
    `${when}\n${where}\n${formatHM(netMinutes(r))}\n\n` +
    `L'operazione non si può annullare.`
  );
  if (!ok) return;

  if (btn) btn.disabled = true;
  try {
    // .select() restituisce le righe cancellate: se è vuoto, Supabase non ha dato il permesso
    const { data, error } = await supabaseClient
      .from("work_logs")
      .delete()
      .eq("id", id)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      alert("La registrazione non è stata eliminata: il database non ha dato il permesso.");
      if (btn) btn.disabled = false;
      return;
    }
  } catch (e) {
    console.error(e);
    alert("Errore durante l'eliminazione. Riprova.");
    if (btn) btn.disabled = false;
    return;
  }

  await loadEmpHours();
}

empHoursExportXlsxBtn?.addEventListener("click", () => {
  if (!adminEmpSelected?.id || !empHoursRows || empHoursRows.length === 0) {
    alert("Nessun dato da esportare (Ore).");
    return;
  }
  const ym = (empHoursMonthEl?.value || "mese");
  const columns = ["Data", "Ora inizio", "Ora fine", "Inizio pausa", "Fine pausa", "Luogo", "Attività", "Ore"];

  const rows = empHoursRows.slice().sort((a, b) => {
    if (a.work_date !== b.work_date) return String(a.work_date).localeCompare(String(b.work_date));
    const ta = timeToMinutes(a.start_time);
    const tb = timeToMinutes(b.start_time);
    if (ta !== tb) return ta - tb;
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  }).map(r => ({
    "Data": formatDateIT(r.work_date),
    "Ora inizio": fmtTime(r.start_time),
    "Ora fine": fmtTime(r.end_time),
    "Inizio pausa": r.break_start ? fmtTime(r.break_start) : "",
    "Fine pausa": r.break_end ? fmtTime(r.break_end) : "",
    "Luogo": r.location || "",
    "Attività": r.activity || "",
    "Ore": formatHM(netMinutes(r)),
  }));

  exportToExcelElegant({
    filename: `CAME_${adminEmpSelected.full_name}_Ore_${fmtMonthYearFile(ym)}.xlsx`,
    sheetName: `Ore ${fmtMonthYear(ym)}`,
    title: `CAME – Ore ${adminEmpSelected.full_name} (${fmtMonthYear(ym)})`,
    columns,
    rows,
  });
});

async function loadEmpRequests() {
  if (!adminEmpSelected?.id || !empRequestsListEl) return;
  empRequestsListEl.textContent = "Caricamento...";
  if (empReqInfoEl) empReqInfoEl.textContent = "";

  const status = (empReqStatusEl?.value || "").trim();
  const type = (empReqTypeEl?.value || "").trim();
  const month = (empReqMonthEl?.value || "").trim(); // YYYY-MM

  try {
    let q = supabaseClient
      .from("requests")
      .select("id,user_id,type,start_date,end_date,time,status,note,created_at")
      .eq("user_id", adminEmpSelected.id)
      .order("created_at", { ascending: false });

    if (status) q = q.eq("status", status);
    if (type) q = q.eq("type", type);

    if (month) {
      const start = `${month}-01`;
      const endDate = new Date(month + "-01T00:00:00");
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(0);
      const end = `${month}-${String(endDate.getDate()).padStart(2, "0")}`;
      q = q.gte("start_date", start).lte("start_date", end);
    }

    const { data, error } = await q;
    if (error) throw error;

    empReqRows = data || [];

    if (empReqInfoEl) {
      const parts = [];
      if (status) parts.push(`Stato: ${status}`);
      if (type) parts.push(`Tipo: ${type}`);
      if (month) parts.push(`Mese: ${fmtMonthYear(month)}`);
      empReqInfoEl.textContent = `${empReqRows.length} risultato/i` + (parts.length ? ` • ${parts.join(" • ")}` : "");
    }

    if (!empReqRows.length) {
      empRequestsListEl.textContent = "Nessuna richiesta.";
      return;
    }

    // raggruppa per giorno (start_date)
    const byDay = new Map();
    for (const r of empReqRows) {
      const k = r.start_date || "—";
      const arr = byDay.get(k) || [];
      arr.push(r);
      byDay.set(k, arr);
    }

    const days = Array.from(byDay.entries()).sort(([a],[b]) => String(b).localeCompare(String(a)));

    // Tabella unica "continua": righe attaccate (niente card distanziate)
    const allRowsHtml = days.map(([day, rows]) => {
      const sorted = (rows || []).slice().sort((a, b) => {
        if (a.start_date !== b.start_date) return String(a.start_date).localeCompare(String(b.start_date));
        if (a.type !== b.type) return String(a.type).localeCompare(String(b.type));
        return String(a.created_at || "").localeCompare(String(b.created_at || ""));
      });

      const groupRow = `
        <div class="rowItem rowGroup">
          <div><strong>${escapeHtml(day === "—" ? "—" : formatDateIT(day))}</strong></div>
          <div class="muted">${escapeHtml(String(sorted.length))} richiesta/e</div>
          <div style="text-align:right;">—</div>
        </div>
      `;

      const lines = sorted.map(r => {
        const when =
          r.type === "ferie"
            ? `Dal ${formatDateIT(r.start_date)} al ${formatDateIT(r.end_date)}`
            : (r.time ? `${formatDateIT(r.start_date)} • ${fmtTime(r.time)}` : `${formatDateIT(r.start_date)}`);

        const statusPill =
          r.status === "approvata"
            ? `<span class="pill ok">Approvata</span>`
            : (r.status === "rifiutata"
                ? `<span class="pill warn" style="border-color: rgba(255,107,107,.35); background: rgba(255,107,107,.12);">Rifiutata</span>`
                : `<span class="pill">Inviata</span>`);

        const note = r.note ? String(r.note).trim() : "";
        const noteSmall = note ? ` • ${note}` : "";

        const actions = `
          <span class="req-actions">
            ${r.status === "inviata" ? `
              <button class="btn small" data-emp-req-action="approve" data-req-id="${r.id}">Approva</button>
              <button class="btn small" data-emp-req-action="reject" data-req-id="${r.id}" style="border-color: rgba(255,107,107,.35);">Rifiuta</button>` : ""}
            <button class="btn small ghost icon-btn" type="button" data-emp-req-del="${r.id}" title="Elimina richiesta" aria-label="Elimina richiesta">🗑</button>
          </span>
        `;

        return `
          <div class="rowItem">
            <div><strong>${escapeHtml(labelRequestType(r.type))}</strong></div>
            <div class="muted">${escapeHtml(when + noteSmall)}</div>
            <div style="text-align:right;">
              ${statusPill}
              ${actions}
            </div>
          </div>
        `;
      }).join("");

      return groupRow + lines;
    }).join("");

    empRequestsListEl.innerHTML = `<div class="emp-req-table"><div class="rows">${allRowsHtml}</div></div>`;

    // azioni approva/rifiuta
    empRequestsListEl.querySelectorAll("[data-emp-req-action]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-req-id");
        const action = btn.getAttribute("data-emp-req-action");
        if (!id || !action) return;
        const nextStatus = action === "approve" ? "approvata" : "rifiutata";
        const { error } = await supabaseClient.from("requests").update({ status: nextStatus }).eq("id", id);
        if (error) {
          console.error(error);
          alert("Errore aggiornamento stato. Controlla console.");
          return;
        }
        await loadEmpRequests();
        const view = document.getElementById("view-requests");
        if (view?.classList.contains("active")) loadRequests();
      });
    });

    empRequestsListEl.querySelectorAll("[data-emp-req-del]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const r = (empReqRows || []).find(x => String(x.id) === btn.getAttribute("data-emp-req-del"));
        if (r && await deleteRequest(r)) await loadEmpRequests();
      });
    });

  } catch (e) {
    console.error(e);
    empRequestsListEl.textContent = "Errore caricamento richieste.";
  }
}

// ============================
// EXPORT RICHIESTE (admin)
// ============================
adminReqExportXlsxBtn?.addEventListener("click", () => {
  if (!adminCurrentRequestRows || adminCurrentRequestRows.length === 0) {
    alert("Nessun dato da esportare per i filtri attuali (Richieste).");
    return;
  }

  const typeEl = document.getElementById("reqFilterType");
  const monthEl = document.getElementById("reqFilterMonth");

  const status = adminReqStatusFilter;
  const type = (typeEl?.value || "").trim();
  const month = (monthEl?.value || "").trim();
  const monthLabel = month ? fmtMonthYear(month) : "tutte";
  const monthFile = month ? fmtMonthYearFile(month) : "tutte";

  const sorted = adminCurrentRequestRows.slice().sort((a, b) => {
    if (a.start_date !== b.start_date) return String(a.start_date).localeCompare(String(b.start_date));
    const an = String(a.profiles?.full_name || "").toLowerCase();
    const bn = String(b.profiles?.full_name || "").toLowerCase();
    if (an !== bn) return an.localeCompare(bn, "it", { sensitivity: "base" });
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  });

  const columns = ["Dipendente", "Data", "Tipo", "Dettaglio", "Stato", "Nota"];

  const rows = sorted.map(r => {
    const who = r.profiles?.full_name || "";
    const data = r.start_date ? formatDateIT(r.start_date) : "";

    const dettaglio =
      r.type === "ferie"
        ? `Dal ${formatDateIT(r.start_date)} al ${formatDateIT(r.end_date)}`
        : (r.time ? `${formatDateIT(r.start_date)} • ${fmtTime(r.time)}` : `${formatDateIT(r.start_date)}`);

    return {
      "Dipendente": who,
      "Data": data,
      "Tipo": labelRequestType(r.type),
      "Dettaglio": dettaglio,
      "Stato": r.status || "",
      "Nota": (r.note || ""),
    };
  });

  // Riepilogo: conteggi per stato/tipo
  const byStatus = new Map();
  const byType = new Map();
  for (const r of sorted) {
    const st = r.status || "—";
    byStatus.set(st, (byStatus.get(st) || 0) + 1);
    const tp = labelRequestType(r.type);
    byType.set(tp, (byType.get(tp) || 0) + 1);
  }

  const summaryRows = [
    { Voce: "Totale richieste", Valore: String(sorted.length) },
    { Voce: "Filtri", Valore: [month ? `Mese=${fmtMonthYear(month)}` : null, status ? `Stato=${status}` : null, type ? `Tipo=${type}` : null].filter(Boolean).join(" • ") || "—" },
    { Voce: "", Valore: "" },
    ...Array.from(byStatus.entries()).sort(([a],[b]) => String(a).localeCompare(String(b), "it", { sensitivity: "base" })).map(([k, v]) => ({ Voce: `Stato: ${k}`, Valore: String(v) })),
    { Voce: "", Valore: "" },
    ...Array.from(byType.entries()).sort(([a],[b]) => String(a).localeCompare(String(b), "it", { sensitivity: "base" })).map(([k, v]) => ({ Voce: `Tipo: ${k}`, Valore: String(v) })),
  ];

  const suffix = monthLabel;
  exportToExcelElegant({
    filename: `CAME_Admin_Richieste_${monthFile}.xlsx`,
    sheetName: `Richieste ${suffix}`,
    title: `CAME – Richieste (Admin) ${suffix}`,
    columns,
    rows,
    summary: { title: `Riepilogo Richieste ${suffix}`, rows: summaryRows }
  });
});

// ============================
// EXPORT PRODOTTI (admin)
// ============================
adminProdExportXlsxBtn?.addEventListener("click", () => {
  if (!adminCurrentProductGroups || adminCurrentProductGroups.length === 0) {
    alert("Nessun dato da esportare per i filtri attuali (Prodotti).");
    return;
  }

  const monthEl = document.getElementById("poFilterMonth");
  const month = (monthEl?.value || "").trim() || "mese";
  const monthLabel = fmtMonthYear(month);

  const sorted = adminCurrentProductGroups.slice().sort((a, b) => {
    if (a.order_date !== b.order_date) return String(a.order_date).localeCompare(String(b.order_date));
    const an = String(a.full_name || "").toLowerCase();
    const bn = String(b.full_name || "").toLowerCase();
    if (an !== bn) return an.localeCompare(bn, "it", { sensitivity: "base" });
    return String(a.place || "").localeCompare(String(b.place || ""), "it", { sensitivity: "base" });
  });

  const columns = ["Dipendente", "Data ordine", "Luogo", "Data consegna", "Prodotto", "Quantità"];

  const rows = sorted.flatMap(g => {
    const base = {
      "Dipendente": g.full_name || "",
      "Data ordine": g.order_date ? formatDateIT(g.order_date) : "",
      "Luogo": g.place || "",
      "Data consegna": g.delivery_date ? formatDateIT(String(g.delivery_date).slice(0, 10)) : "",
    };
    return (g.items || []).map(it => ({
      ...base,
      "Prodotto": it.product_name,
      "Quantità": String(it.quantity),
    }));
  });

  const totalPieces = sorted.reduce((acc, g) => acc + (g.items || []).reduce((a2, it) => a2 + (Number(it.quantity) || 0), 0), 0);

  // Quantità complessiva consumata per ogni prodotto (somma su tutti gli ordini del mese)
  const productTotals = new Map();
  for (const g of sorted) {
    for (const it of (g.items || [])) {
      const name = String(it.product_name || "").trim() || "—";
      productTotals.set(name, (productTotals.get(name) || 0) + (Number(it.quantity) || 0));
    }
  }
  const productRows = Array.from(productTotals.entries())
    .sort(([a], [b]) => a.localeCompare(b, "it", { sensitivity: "base" }))
    .map(([name, qty]) => ({ Voce: name, Valore: String(qty) }));

  const summaryRows = [
    { Voce: "Mese", Valore: monthLabel },
    { Voce: "Ordini (gruppi)", Valore: String(sorted.length) },
    { Voce: "Pezzi (totale)", Valore: String(totalPieces) },
    { Voce: "", Valore: "" },
    { Voce: "QUANTITÀ PER PRODOTTO", Valore: "" },
    ...productRows,
  ];

  exportToExcelElegant({
    filename: `CAME_Admin_Prodotti_${fmtMonthYearFile(month)}.xlsx`,
    sheetName: `Prodotti ${monthLabel}`,
    title: `CAME – Prodotti (Admin) ${monthLabel}`,
    columns,
    rows,
    summary: { title: `Riepilogo Prodotti ${monthLabel}`, rows: summaryRows },
    mergeColumns: ["Dipendente"]
  });
});

// ============================
// REPORT CONSUMI PRODOTTI (admin): un unico file Excel per l'ANNO scelto
// (l'anno viene dal campo "Mese" dei filtri). Foglio "Riepilogo" con la
// classifica dei luoghi per consumo + un foglio per luogo con i prodotti in
// riga e i 12 mesi in colonna. Conta TUTTE le richieste inviate (consegnate
// o no) e ignora gli altri filtri: sempre tutti i luoghi e tutti i dipendenti.
// ============================

const MONTH_LABELS_IT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

document.getElementById("adminProdConsumptionBtn")?.addEventListener("click", async () => {
  const btn = document.getElementById("adminProdConsumptionBtn");
  const origLabel = btn ? btn.innerHTML : "";
  const month = (document.getElementById("poFilterMonth")?.value || getCurrentMonthISO()).trim(); // YYYY-MM
  const year = month.slice(0, 4);
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  try {
    if (btn) { btn.disabled = true; btn.textContent = "Genero..."; }

    const { data, error } = await supabaseClient
      .from("product_orders")
      .select("place,product_name,quantity,order_date")
      .gte("order_date", start)
      .lte("order_date", end);

    if (error) { console.error(error); alert("Errore nel caricamento dei dati per il report."); return; }
    if (!data || data.length === 0) { alert(`Nessun ordine prodotti nel ${year}.`); return; }

    // luogo -> prodotto -> [12 quantità mensili]
    const byPlace = new Map();
    for (const r of data) {
      const place = String(r.place || "").trim() || "—";
      const product = String(r.product_name || "").trim() || "—";
      const qty = Number(r.quantity) || 0;
      const monthIdx = Number(String(r.order_date).slice(5, 7)) - 1;
      if (monthIdx < 0 || monthIdx > 11) continue;

      let products = byPlace.get(place);
      if (!products) { products = new Map(); byPlace.set(place, products); }
      let monthly = products.get(product);
      if (!monthly) { monthly = new Array(12).fill(0); products.set(product, monthly); }
      monthly[monthIdx] += qty;
    }

    // Statistiche per luogo (per il Riepilogo e per l'ordinamento dei fogli)
    const placeStats = Array.from(byPlace.entries()).map(([place, products]) => {
      let pieces = 0, topProduct = "—", topQty = -1;
      const monthlyTotals = new Array(12).fill(0);
      for (const [name, monthly] of products.entries()) {
        const t = monthly.reduce((a, b) => a + b, 0);
        pieces += t;
        monthly.forEach((q, i) => { monthlyTotals[i] += q; });
        if (t > topQty) { topQty = t; topProduct = name; }
      }
      return { place, products, pieces, distinct: products.size, topProduct, monthlyTotals };
    });

    // Luoghi ordinati per consumo decrescente: Riepilogo e fogli seguono quest'ordine
    placeStats.sort((a, b) => b.pieces - a.pieces || a.place.localeCompare(b.place, "it", { sensitivity: "base" }));

    const grandPieces = placeStats.reduce((a, p) => a + p.pieces, 0);

    // Foglio Riepilogo (classifica luoghi)
    const summaryHeader = ["Luogo", "Pezzi (anno)", "Prodotti diversi", "Prodotto più usato"];
    const summaryRows = placeStats.map(p => [p.place, p.pieces, p.distinct, p.topProduct]);
    const summaryTotalsRow = ["TOTALE", grandPieces, "", ""];

    // Un foglio per luogo: prodotti (righe) x 12 mesi + Totale
    const placeSheets = placeStats.map(p => {
      const productRows = Array.from(p.products.entries())
        .map(([name, monthly]) => {
          const total = monthly.reduce((a, b) => a + b, 0);
          return [name, ...monthly.map(q => q || ""), total];
        })
        .sort((a, b) => (b[b.length - 1] - a[a.length - 1]) || String(a[0]).localeCompare(String(b[0]), "it", { sensitivity: "base" }));

      const totalsRow = ["TOTALE MESE", ...p.monthlyTotals.map(q => q || ""), p.pieces];

      return {
        place: p.place,
        title: `Consumo ${year} — ${p.place}`,
        subtitle: `${p.pieces} pezzi nell'anno • ${p.distinct} prodotti diversi`,
        header: ["Prodotto", ...MONTH_LABELS_IT, "Totale"],
        productRows,
        totalsRow,
      };
    });

    const genStr = new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(new Date());

    exportConsumptionReport({
      filename: `CAME_Consumi_Prodotti_${year}.xlsx`,
      title: `CAME — Consumi prodotti ${year}`,
      subtitle: `Tutti i luoghi • ${placeStats.length} luoghi • ${grandPieces} pezzi totali • generato il ${genStr}`,
      summaryHeader,
      summaryRows,
      summaryTotalsRow,
      placeSheets,
    });
  } catch (e) {
    console.error(e);
    alert("Errore imprevisto nella generazione del report.");
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = origLabel; }
  }
});

// ============================
// CATALOGHI (admin): gestione prodotti / luoghi / attività
// Tabella catalog_items. Solo l'admin può modificare (regole RLS).
// ============================
const catalogListEl = document.getElementById("catalogList");
const catalogAddFormEl = document.getElementById("catalogAddForm");
const catalogNewNameEl = document.getElementById("catalogNewName");
const catalogNewCategoryEl = document.getElementById("catalogNewCategory");
const catalogCategoryListEl = document.getElementById("catalogCategoryList");
const catalogSearchEl = document.getElementById("catalogSearch");
const catalogCountEl = document.getElementById("catalogCount");
const catalogMsgEl = document.getElementById("catalogMsg");

let catalogCurrentType = "product"; // product | place | activity
let catalogItems = [];
let catalogEditingId = null; // voce aperta in modifica (una alla volta)
const CATALOG_LABEL = { product: "prodotto", place: "luogo", activity: "attività" };
const CATALOG_NO_CATEGORY = "Senza categoria";

function setCatalogMsg(text, type = "info") {
  if (!catalogMsgEl) return;
  catalogMsgEl.textContent = text || "";
  catalogMsgEl.className = `msg ${type}`;
}

// Carica e mostra le voci del tipo selezionato (incluse quelle nascoste)
async function loadCatalogAdmin() {
  if (!catalogListEl) return;
  catalogListEl.textContent = "Caricamento...";
  try {
    const { data, error } = await supabaseClient
      .from("catalog_items")
      .select("id,name,active,sort_order,category")
      .eq("type", catalogCurrentType)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      console.error(error);
      catalogListEl.textContent = "Errore nel caricamento del catalogo.";
      return;
    }
    catalogItems = data || [];
    renderCatalogList();
  } catch (e) {
    console.error(e);
    catalogListEl.textContent = "Errore imprevisto.";
  }
}

// Gruppi da mostrare: prodotti divisi per categoria ("Senza categoria" in fondo), il resto in un unico gruppo
function catalogGroups(items) {
  if (catalogCurrentType !== "product") return [{ title: "", items }];
  const map = new Map();
  for (const it of items) {
    const c = (it.category || "").trim() || CATALOG_NO_CATEGORY;
    if (!map.has(c)) map.set(c, []);
    map.get(c).push(it);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a === CATALOG_NO_CATEGORY) - (b === CATALOG_NO_CATEGORY) || a.localeCompare(b, "it", { sensitivity: "base" }))
    .map(([title, list]) => ({ title, items: list }));
}

function catalogRowHtml(it, idx, count, canMove) {
  const isProduct = catalogCurrentType === "product";
  const name = escapeHtml(it.name);

  if (String(it.id) === String(catalogEditingId)) {
    return `
      <div class="cat-row editing" data-id="${escapeHtml(String(it.id))}">
        <div class="cat-edit-fields">
          <input class="input" data-edit-name value="${name}" aria-label="Nome" />
          ${isProduct ? `<input class="input" data-edit-category list="catalogCategoryList" placeholder="Categoria" aria-label="Categoria" value="${escapeHtml(it.category || "")}" />` : ""}
        </div>
        <div class="cat-edit-actions">
          <button class="btn small" type="button" data-cat-save>Salva</button>
          <button class="btn small ghost" type="button" data-cat-cancel>Annulla</button>
          <span class="cat-edit-spacer"></span>
          <button class="btn small ghost" type="button" data-cat-toggle>${it.active ? "Nascondi ai dipendenti" : "Mostra ai dipendenti"}</button>
          <button class="btn small danger" type="button" data-cat-delete>Elimina</button>
        </div>
      </div>`;
  }

  return `
    <div class="cat-row${it.active ? "" : " is-hidden"}" data-id="${escapeHtml(String(it.id))}">
      <span class="cat-row-name">${name}${it.active ? "" : ` <span class="pill">nascosto</span>`}</span>
      <div class="cat-row-actions">
        ${canMove ? `
          <button class="btn small icon-btn" type="button" data-cat-move="up" ${idx === 0 ? "disabled" : ""} title="Sposta su" aria-label="Sposta su ${name}">↑</button>
          <button class="btn small icon-btn" type="button" data-cat-move="down" ${idx === count - 1 ? "disabled" : ""} title="Sposta giù" aria-label="Sposta giù ${name}">↓</button>` : ""}
        <button class="btn small icon-btn" type="button" data-cat-edit title="Modifica" aria-label="Modifica ${name}">✏️</button>
      </div>
    </div>`;
}

function renderCatalogList() {
  const isProduct = catalogCurrentType === "product";
  const q = (catalogSearchEl?.value || "").trim().toLowerCase();
  const items = !q
    ? catalogItems
    : catalogItems.filter(it => `${it.name} ${it.category || ""}`.toLowerCase().includes(q));

  if (catalogCountEl) {
    catalogCountEl.textContent = q
      ? `${items.length} di ${catalogItems.length}`
      : `${catalogItems.length} vo${catalogItems.length === 1 ? "ce" : "ci"}`;
  }

  // Categorie già usate, suggerite mentre si scrive (si può comunque scriverne una nuova)
  if (catalogCategoryListEl) {
    catalogCategoryListEl.innerHTML = !isProduct ? "" :
      Array.from(new Set(catalogItems.map(it => (it.category || "").trim()).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }))
        .map(c => `<option value="${escapeHtml(c)}"></option>`)
        .join("");
  }

  if (!catalogItems.length) {
    catalogListEl.innerHTML = `<div class="empty-state">Nessuna voce. Aggiungine una qui sopra.</div>`;
    return;
  }
  if (!items.length) {
    catalogListEl.innerHTML = `<div class="empty-state">Nessuna voce trovata.</div>`;
    return;
  }

  // Durante la ricerca niente frecce: l'ordine si cambia sull'elenco completo
  const canMove = !q;
  catalogListEl.innerHTML = catalogGroups(items).map(g => `
    <section class="cat-group">
      ${g.title ? `<div class="cat-group-head"><span>${escapeHtml(g.title)}</span><span class="muted">${g.items.length}</span></div>` : ""}
      ${g.items.map((it, idx) => catalogRowHtml(it, idx, g.items.length, canMove)).join("")}
    </section>
  `).join("");

  catalogListEl.querySelector(".cat-row.editing [data-edit-name]")?.focus();
}

async function saveCatalogEdit(row, it) {
  const name = (row.querySelector("[data-edit-name]")?.value || "").trim();
  if (!name) { setCatalogMsg("Il nome non può essere vuoto.", "error"); return; }
  const patch = { name };
  const catEl = row.querySelector("[data-edit-category]");
  if (catEl) patch.category = (catEl.value || "").trim() || null;

  const { error } = await supabaseClient.from("catalog_items").update(patch).eq("id", it.id);
  if (error) {
    if (error.code === "23505") setCatalogMsg("Esiste già una voce con questo nome.", "error");
    else { console.error(error); setCatalogMsg("Errore nel salvataggio.", "error"); }
    return;
  }
  catalogEditingId = null;
  setCatalogMsg("Salvato ✅", "ok");
  await loadCatalogAdmin();
}

// Tutti i tasti dell'elenco (un solo ascoltatore, l'elenco viene ridisegnato spesso)
catalogListEl?.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  const row = btn?.closest(".cat-row");
  if (!btn || !row || btn.disabled) return;
  const it = catalogItems.find(x => String(x.id) === row.getAttribute("data-id"));
  if (!it) return;

  if (btn.hasAttribute("data-cat-edit")) {
    catalogEditingId = it.id;
    setCatalogMsg("");
    renderCatalogList();
    return;
  }
  if (btn.hasAttribute("data-cat-cancel")) {
    catalogEditingId = null;
    renderCatalogList();
    return;
  }
  if (btn.hasAttribute("data-cat-save")) {
    btn.disabled = true;
    await saveCatalogEdit(row, it);
    btn.disabled = false;
    return;
  }
  if (btn.hasAttribute("data-cat-toggle")) {
    const { error } = await supabaseClient.from("catalog_items").update({ active: !it.active }).eq("id", it.id);
    if (error) { console.error(error); setCatalogMsg("Errore.", "error"); return; }
    catalogEditingId = null;
    setCatalogMsg(it.active ? "Nascosto ai dipendenti ✅" : "Di nuovo visibile ai dipendenti ✅", "ok");
    await loadCatalogAdmin();
    return;
  }
  if (btn.hasAttribute("data-cat-delete")) {
    if (!confirm(`Eliminare "${it.name}" dal catalogo?\nGli ordini e le ore già registrati NON vengono toccati.`)) return;
    const { error } = await supabaseClient.from("catalog_items").delete().eq("id", it.id);
    if (error) { console.error(error); setCatalogMsg("Errore nell'eliminazione.", "error"); return; }
    catalogEditingId = null;
    setCatalogMsg("Voce eliminata ✅", "ok");
    await loadCatalogAdmin();
    return;
  }
  if (btn.hasAttribute("data-cat-move")) {
    // scambia l'ordine con la voce vicina dello stesso gruppo
    const group = catalogGroups(catalogItems).find(g => g.items.includes(it));
    const idx = group ? group.items.indexOf(it) : -1;
    const other = group?.items[btn.getAttribute("data-cat-move") === "up" ? idx - 1 : idx + 1];
    if (!other) return;
    const { error: e1 } = await supabaseClient.from("catalog_items").update({ sort_order: other.sort_order }).eq("id", it.id);
    const { error: e2 } = await supabaseClient.from("catalog_items").update({ sort_order: it.sort_order }).eq("id", other.id);
    if (e1 || e2) { console.error(e1 || e2); setCatalogMsg("Errore nel riordino.", "error"); return; }
    await loadCatalogAdmin();
  }
});

// In modifica: Invio salva, Esc annulla
catalogListEl?.addEventListener("keydown", (e) => {
  const row = e.target.closest(".cat-row.editing");
  if (!row) return;
  if (e.key === "Enter") { e.preventDefault(); row.querySelector("[data-cat-save]")?.click(); }
  if (e.key === "Escape") { e.preventDefault(); row.querySelector("[data-cat-cancel]")?.click(); }
});

let _catalogSearchTimer = null;
catalogSearchEl?.addEventListener("input", () => {
  clearTimeout(_catalogSearchTimer);
  _catalogSearchTimer = setTimeout(() => renderCatalogList(), 150);
});

// Cambia scheda (Prodotti / Luoghi / Attività)
document.querySelectorAll("[data-catalog-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    catalogCurrentType = btn.getAttribute("data-catalog-tab") || "product";
    document.querySelectorAll("[data-catalog-tab]").forEach((b) => b.classList.toggle("active", b === btn));
    catalogEditingId = null;
    if (catalogSearchEl) catalogSearchEl.value = "";
    setCatalogMsg("");
    updateCatalogAddForm();
    loadCatalogAdmin();
  });
});

// Modulo "Aggiungi": la categoria serve solo per i prodotti
function updateCatalogAddForm() {
  if (catalogNewCategoryEl) catalogNewCategoryEl.hidden = catalogCurrentType !== "product";
  if (catalogNewNameEl) catalogNewNameEl.placeholder = `Nome del nuovo ${CATALOG_LABEL[catalogCurrentType]}`;
}
updateCatalogAddForm();

// Aggiungi nuova voce
catalogAddFormEl?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = (catalogNewNameEl?.value || "").trim();
  const category = catalogCurrentType === "product" ? ((catalogNewCategoryEl?.value || "").trim() || null) : null;
  if (!name) { setCatalogMsg(`Scrivi il nome del ${CATALOG_LABEL[catalogCurrentType]}.`, "error"); return; }
  try {
    // metti la nuova voce in fondo: sort_order = (massimo attuale) + 10
    const { data: maxRow } = await supabaseClient
      .from("catalog_items")
      .select("sort_order")
      .eq("type", catalogCurrentType)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = ((maxRow?.sort_order) || 0) + 10;

    const { error } = await supabaseClient
      .from("catalog_items")
      .insert({ type: catalogCurrentType, name, sort_order: nextOrder, ...(category ? { category } : {}) });

    if (error) {
      if (error.code === "23505") setCatalogMsg("Esiste già una voce con questo nome.", "error");
      else { console.error(error); setCatalogMsg("Errore nell'aggiunta.", "error"); }
      return;
    }
    if (catalogNewNameEl) catalogNewNameEl.value = "";
    setCatalogMsg(`Aggiunto "${name}"${category ? ` in ${category}` : ""} ✅`, "ok");
    await loadCatalogAdmin();
  } catch (e) {
    console.error(e);
    setCatalogMsg("Errore imprevisto.", "error");
  }
});

// Router notifiche (admin): al click su una notifica apre la vista giusta.
window.CameNotifRouter = function (n) {
  const t = n && n.type;
  // ordini (nuovo / annullato) -> Prodotti; richieste (nuova / modificata) -> Richieste
  const view = (t === "order_new" || t === "order_cancelled") ? "products" : "requests";
  showView(view);
  window.scrollTo(0, 0);
};

// Avvio: elenco dipendenti + Panoramica
loadEmployees();
showView("overview");


