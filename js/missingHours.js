// js/missingHours.js
// Giorni lavorativi senza ore registrate (solo lato admin, Panoramica).
// - contano solo lunedì–venerdì: sabato e domenica si lavora solo a volte
// - oggi non conta (le ore si inseriscono spesso a fine giornata)
// - non contano i giorni prima della creazione dell'account
// - non contano ferie e permessi giornalieri (inviati o approvati)

(function () {
  function isoOf(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function addDays(iso, n) {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + n);
    return isoOf(d);
  }

  function lastDayOfMonth(ym) {
    const d = new Date(ym + "-01T00:00:00");
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
    return isoOf(d);
  }

  // Periodo da controllare per un mese "YYYY-MM": { from, to } oppure null se vuoto
  function range(ym, createdAt) {
    let from = `${ym}-01`;
    let to = lastDayOfMonth(ym);
    const yesterday = addDays(isoOf(new Date()), -1);
    if (to > yesterday) to = yesterday;
    const created = String(createdAt || "").slice(0, 10);
    if (created && created > from) from = created;
    return from <= to ? { from, to } : null;
  }

  // Giorni coperti da ferie / permesso giornaliero
  function absenceDays(requests) {
    const days = new Set();
    for (const r of (requests || [])) {
      if (!r || r.status === "rifiutata" || !r.start_date) continue;
      if (r.type !== "ferie" && r.type !== "permesso_giornaliero") continue;
      const end = r.type === "ferie" ? (r.end_date || r.start_date) : r.start_date;
      for (let d = r.start_date; d <= end; d = addDays(d, 1)) days.add(d);
    }
    return days;
  }

  // Elenco ISO dei giorni lun–ven nel periodo senza ore e senza assenze
  function missingWeekdays({ from, to, loggedDates, requests }) {
    const logged = loggedDates instanceof Set ? loggedDates : new Set(loggedDates || []);
    const absent = absenceDays(requests);
    const out = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const wd = new Date(d + "T00:00:00").getDay(); // 0=dom, 6=sab
      if (wd === 0 || wd === 6) continue;
      if (logged.has(d) || absent.has(d)) continue;
      out.push(d);
    }
    return out;
  }

  // Numero per wa.me: solo cifre con prefisso internazionale (cellulari italiani senza prefisso -> 39)
  function waNumber(phone) {
    let n = String(phone || "").trim();
    const plus = n.startsWith("+");
    n = n.replace(/\D/g, "");
    if (!plus && n.startsWith("00")) n = n.slice(2);
    else if (!plus && n.length === 10 && n.startsWith("3")) n = "39" + n;
    return n.length >= 8 ? n : "";
  }

  window.missingHours = { range, missingWeekdays, waNumber };
})();
