// js/projectReport.js
// Genera un PDF di documentazione del progetto CAME (frontend + Supabase).

(function () {
  const msgEl = document.getElementById("msg");
  const btn = document.getElementById("downloadPdfBtn");

  function setMsg(t, type = "info") {
    if (!msgEl) return;
    msgEl.textContent = t || "";
    msgEl.className = `msg ${type}`;
  }

  function fmtDateTimeIT(d) {
    return new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(d);
  }

  function safeFilename(name) {
    return (name || "export")
      .replace(/[^\w\-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function addSectionTitle(doc, title, y) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(title, 40, y);
    doc.setFont("helvetica", "normal");
    return y + 10;
  }

  function addParagraph(doc, text, y) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(text, 515);
    doc.text(lines, 40, y);
    return y + lines.length * 12;
  }

  function generatePdf() {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("jsPDF non disponibile.");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

    const now = new Date();
    const genStr = fmtDateTimeIT(now);

    // --- Copertina ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("CAME – Documentazione progetto", 40, 60);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`Generato il: ${genStr}`, 40, 82);
    doc.setFontSize(10);
    doc.text("Progetto Supabase: came 2 (ref: uiebrgppvpukrrdyccgf)", 40, 102);
    doc.text("Base URL: https://uiebrgppvpukrrdyccgf.supabase.co", 40, 118);

    let y = 150;

    // --- Cosa fa (alto livello) ---
    y = addSectionTitle(doc, "1) Cosa fa l’app", y);
    y = addParagraph(
      doc,
      "L’app CAME è una web app semplice (HTML/JS/CSS) con login Supabase (email+password). " +
        "Un utente con ruolo 'employee' può registrare le ore di lavoro e vedere il proprio archivio mensile, " +
        "con export in Excel/PDF. Un utente con ruolo 'admin' può vedere tutte le registrazioni ore (filtrate per mese), " +
        "con totali e export Excel.",
      y
    );

    // --- Struttura file ---
    y += 8;
    y = addSectionTitle(doc, "2) Struttura del progetto (file)", y);
    doc.autoTable({
      startY: y,
      head: [["Percorso", "Descrizione"]],
      body: [
        ["login.html", "Pagina login (email/password)"],
        ["employee.html", "Dashboard Dipendente: inserimento ore + archivio + export"],
        ["admin.html", "Dashboard Admin: ore (mese) + totali + export"],
        ["report.html", "Generatore PDF di documentazione (questo report)"],
        ["css/style.css", "Stile moderno dark UI + layout (admin/employee) + fix select"],
        ["js/supabaseClient.js", "Inizializza Supabase e espone supabaseClient + getCurrentUser/getMyProfile"],
        ["js/auth.js", "Login: signInWithPassword + redirectByRole (admin/employee)"],
        ["js/guard.js", "Guard: requireRole('admin'/'employee') usando profiles.role"],
        ["js/employee.js", "Logica dipendente (ore, archivio, export)"],
        ["js/admin.js", "Logica admin (ore mese, totali, export)"],
        ["js/export.js", "Export Excel elegante + PDF helper (jsPDF/autoTable)"],
        ["js/projectReport.js", "Genera questo PDF in browser (jsPDF/autoTable)"],
      ],
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [15, 26, 46] },
      theme: "grid",
      margin: { left: 40, right: 40 },
    });
    y = doc.lastAutoTable.finalY + 18;

    // --- Flussi utente ---
    y = addSectionTitle(doc, "3) Flussi principali", y);
    doc.autoTable({
      startY: y,
      head: [["Flusso", "Dettaglio"]],
      body: [
        ["Login", "login.html → Supabase Auth signInWithPassword → legge profiles.role → redirect admin.html/employee.html"],
        ["Guard pagine", "admin.html/employee.html chiamano requireRole('admin'/'employee') (js/guard.js)"],
        ["Dipendente: invio ore", "employee.html form → insert su public.work_logs con user_id, data, orari, luogo, attività"],
        ["Dipendente: archivio", "query work_logs per mese → raggruppa per giorno → totali mese/oggi → export"],
        ["Admin: ore", "query work_logs per mese (tutti) + join profiles(full_name) → raggruppa per giorno → totali → export"],
      ],
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [15, 26, 46] },
      theme: "grid",
      margin: { left: 40, right: 40 },
    });
    y = doc.lastAutoTable.finalY + 18;

    // --- Supabase: tabelle public ---
    y = addSectionTitle(doc, "4) Supabase – Database (schema public)", y);
    doc.autoTable({
      startY: y,
      head: [["Tabella", "Campi principali", "Note"]],
      body: [
        [
          "profiles",
          "id (uuid, PK, = auth.users.id), full_name, role(admin/employee), created_at",
          "Ruolo applicazione + nome. RLS ON.",
        ],
        [
          "work_logs",
          "id (bigint PK), user_id (FK→profiles.id), work_date, start/end, break, location, activity, created_at",
          "Registrazioni ore. RLS ON.",
        ],
        [
          "requests",
          "id, user_id, type(ferie/permesso/entrata_posticipata), start/end_date, time, status, note, created_at",
          "Richieste (struttura pronta). RLS ON.",
        ],
        [
          "product_orders",
          "id, user_id, place, product_name, quantity>0, created_at",
          "Ordini prodotti (struttura pronta). RLS ON.",
        ],
      ],
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [15, 26, 46] },
      theme: "grid",
      margin: { left: 40, right: 40 },
    });
    y = doc.lastAutoTable.finalY + 18;

    // --- Supabase: RLS policies (riassunto) ---
    y = addSectionTitle(doc, "5) Sicurezza – RLS (riassunto policy)", y);
    y = addParagraph(
      doc,
      "Le policy sono impostate per utenti 'authenticated'. In generale: il dipendente può inserire e vedere solo i propri dati; " +
        "l’admin può vedere/modificare anche i dati degli altri (own_or_admin).",
      y
    );
    doc.autoTable({
      startY: y,
      head: [["Tabella", "SELECT", "INSERT", "UPDATE", "DELETE"]],
      body: [
        ["profiles", "own_or_admin", "-", "own_or_admin", "-"],
        ["work_logs", "own_or_admin", "own", "own_or_admin", "own_or_admin"],
        ["requests", "own_or_admin", "own", "own_or_admin", "own_or_admin"],
        ["product_orders", "own_or_admin", "own", "own_or_admin", "own_or_admin"],
      ],
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [15, 26, 46] },
      theme: "grid",
      margin: { left: 40, right: 40 },
    });
    y = doc.lastAutoTable.finalY + 18;

    // --- Storage / Edge Functions ---
    y = addSectionTitle(doc, "6) Storage / Edge Functions / Realtime", y);
    y = addParagraph(
      doc,
      "Storage: schema storage presente, ma al momento non risultano bucket creati (nessun file). " +
        "Edge Functions: nessuna. Realtime: disponibile come servizio, non obbligatorio per le funzioni attuali.",
      y
    );

    // --- Export ---
    y += 8;
    y = addSectionTitle(doc, "7) Export (Excel/PDF)", y);
    y = addParagraph(
      doc,
      "Dipendente: export Excel 'elegante' con foglio principale + foglio Riepilogo (mese/oggi/per giorno). " +
        "Export PDF multi-tabella: dettaglio + riepilogo giornaliero. Admin: export Excel elegante con riepilogo per giorno.",
      y
    );

    // Footer pagine
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.setTextColor(140);
      doc.text(`CAME – Report progetto • Pagina ${i}/${pageCount}`, 40, 820);
      doc.setTextColor(0);
    }

    doc.save(safeFilename(`CAME_Report_Progetto_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}.pdf`));
  }

  btn?.addEventListener("click", async () => {
    try {
      setMsg("Generazione PDF in corso...");
      btn.disabled = true;
      generatePdf();
      setMsg("PDF scaricato.", "ok");
    } catch (e) {
      console.error(e);
      setMsg("Errore durante la generazione del PDF. Controlla la console.", "error");
    } finally {
      btn.disabled = false;
    }
  });
})();




