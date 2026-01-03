// js/export.js (NO MODULE) - Excel elegante + PDF helper

function safeFilename(name) {
  const raw = String(name || "export").trim() || "export";
  const lastDot = raw.lastIndexOf(".");
  const hasExt = lastDot > 0 && lastDot < raw.length - 1;

  const base = hasExt ? raw.slice(0, lastDot) : raw;
  const ext = hasExt ? raw.slice(lastDot + 1) : "";

  const clean = (s) => String(s || "")
    .replace(/[^\w\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  const cleanBase = clean(base) || "export";
  const cleanExt = clean(ext);
  return cleanExt ? `${cleanBase}.${cleanExt}` : cleanBase;
}

function downloadBlob(blob, filename) {
  const safe = safeFilename(filename);
  const url = URL.createObjectURL(blob);

  // iOS/Safari e alcuni browser mobile non rispettano sempre "download".
  // Fallback: apri il blob URL in nuova scheda (l’utente poi può condividere/salvare).
  const ua = navigator.userAgent || "";
  const isIOS = /iP(ad|hone|od)/.test(ua);

  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = safe;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();

    // se iOS, spesso l'azione migliore è aprire direttamente
    if (isIOS) {
      try { window.open(url, "_blank", "noopener"); } catch (_) {}
    }
  } catch (e) {
    // ultimo fallback
    try { window.open(url, "_blank", "noopener"); } catch (_) { window.location.href = url; }
  }

  // Non revocare subito: su mobile serve tempo per completare l'apertura/download
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function formatDateIT(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return new Intl.DateTimeFormat("it-IT").format(d); // dd/mm/yyyy
}

function formatHM(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function safeSheetName(name) {
  // Excel constraints:
  // - max 31 chars
  // - cannot contain: : \ / ? * [ ]
  // - cannot be empty
  let s = String(name || "").trim();
  s = s.replace(/[:\\\/\?\*\[\]]/g, "-"); // replace forbidden chars
  s = s.replace(/\s+/g, " ").trim();
  if (!s) s = "Dati";
  if (s.length > 31) s = s.slice(0, 31);
  // avoid trailing/leading apostrophe issues
  s = s.replace(/^'+|'+$/g, "");
  if (!s) s = "Dati";
  return s;
}

function minutesBetween(start, end) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

function netMinutes(log) {
  let total = minutesBetween(log.start_time, log.end_time);
  if (log.break_start && log.break_end) total -= minutesBetween(log.break_start, log.break_end);
  return Math.max(0, total);
}

// ---------- EXCEL ELEGANTE ----------
function setRangeStyle(ws, range, style) {
  const XLSX = window.XLSX;
  const { s: start, e: end } = XLSX.utils.decode_range(range);

  for (let r = start.r; r <= end.r; r++) {
    for (let c = start.c; c <= end.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) continue;
      ws[addr].s = { ...(ws[addr].s || {}), ...style };
    }
  }
}

function autoFitColumns(ws, data, minW = 10, maxW = 45) {
  // data = array di array (righe) oppure array di oggetti
  const XLSX = window.XLSX;
  const rows = Array.isArray(data[0]) ? data : [
    Object.keys(data[0] || {}),
    ...data.map(o => Object.values(o))
  ];

  const colCount = rows[0]?.length || 0;
  const widths = Array.from({ length: colCount }, () => minW);

  for (const row of rows) {
    row.forEach((v, i) => {
      const str = (v === null || v === undefined) ? "" : String(v);
      widths[i] = Math.max(widths[i], Math.min(maxW, str.length + 2));
    });
  }

  ws["!cols"] = widths.map(wch => ({ wch }));
}

function addTitleRow(ws, title, colCount) {
  const XLSX = window.XLSX;

  // Inserisco riga titolo in A1 e sposto tutto giù di 1 riga
  XLSX.utils.sheet_add_aoa(ws, [[title]], { origin: "A1" });

  // Merge titolo su tutte le colonne
  ws["!merges"] = ws["!merges"] || [];
  ws["!merges"].push({
    s: { r: 0, c: 0 },
    e: { r: 0, c: Math.max(0, colCount - 1) }
  });

  // Stile titolo
  const titleCell = ws["A1"];
  if (titleCell) {
    titleCell.s = {
      font: { bold: true, sz: 16, color: { rgb: "FFFFFF" } },
      alignment: { vertical: "center", horizontal: "center" },
      fill: { fgColor: { rgb: "0F1A2E" } },
    };
  }

  // Riga "Generato il" in A2 (sposteremo poi header a riga 3)
  const generated = new Date();
  const genStr = new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(generated);

  XLSX.utils.sheet_add_aoa(ws, [[`Generato il: ${genStr}`]], { origin: "A2" });

  ws["!merges"] = ws["!merges"] || [];
  ws["!merges"].push({
    s: { r: 1, c: 0 },
    e: { r: 1, c: Math.max(0, colCount - 1) }
  });

  const genCell = ws["A2"];
  if (genCell) {
    genCell.s = {
      font: { italic: true, sz: 10, color: { rgb: "9FB0D0" } },
      alignment: { vertical: "center", horizontal: "center" },
      fill: { fgColor: { rgb: "0B1730" } },
    };
  }

  // Altezza riga titolo
  ws["!rows"] = ws["!rows"] || [];
  ws["!rows"][0] = { hpt: 26 };
  ws["!rows"][1] = { hpt: 18 };
}

function exportToExcelElegant({
  filename = "export.xlsx",
  sheetName = "Dati",
  title = "CAME",
  columns = [],           // array di header in ordine
  rows = [],              // array di oggetti (chiavi = columns) oppure array di array
  summary = null          // opzionale: { title: "...", rows: [{...}] } crea foglio riepilogo
}) {
  if (!window.XLSX) throw new Error("XLSX non disponibile (CDN non caricato).");

  const XLSX = window.XLSX;
  const safeMainSheetName = safeSheetName(sheetName || "Dati");

  // Normalizza dati in array di oggetti con chiavi = columns
  let dataObjects;
  if (rows.length === 0) dataObjects = [];
  else if (Array.isArray(rows[0])) {
    // rows array di array => converti in oggetti usando columns
    dataObjects = rows.map(arr => {
      const o = {};
      columns.forEach((k, i) => (o[k] = arr[i] ?? ""));
      return o;
    });
  } else {
    dataObjects = rows;
  }

  const wb = XLSX.utils.book_new();

  // Crea sheet dai dati a partire da A3 (A1 titolo, A2 "Generato il")
  const ws = XLSX.utils.json_to_sheet(dataObjects, { header: columns, origin: "A3" });

  // Titolo
  addTitleRow(ws, title, columns.length);

  // Header range (riga 3)
  const headerRange = XLSX.utils.encode_range({
    s: { r: 2, c: 0 },
    e: { r: 2, c: columns.length - 1 }
  });

  // Stile header
  setRangeStyle(ws, headerRange, {
    font: { bold: true, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "center", vertical: "center" },
    fill: { fgColor: { rgb: "1A2F55" } },
    border: {
      top: { style: "thin", color: { rgb: "334155" } },
      bottom: { style: "thin", color: { rgb: "334155" } },
      left: { style: "thin", color: { rgb: "334155" } },
      right: { style: "thin", color: { rgb: "334155" } },
    },
  });

  // Zebra + bordi per il corpo (da riga 4 in poi)
  const bodyStartRow = 3; // 0-based: 0 titolo, 1 gen, 2 header, 3 prima riga dati
  const lastRow = bodyStartRow + Math.max(0, dataObjects.length - 1);
  const bodyRange = XLSX.utils.encode_range({
    s: { r: bodyStartRow, c: 0 },
    e: { r: Math.max(bodyStartRow, lastRow), c: columns.length - 1 }
  });

  // Applica bordi a tutto il corpo
  setRangeStyle(ws, bodyRange, {
    alignment: { vertical: "top", wrapText: true },
    border: {
      top: { style: "thin", color: { rgb: "334155" } },
      bottom: { style: "thin", color: { rgb: "334155" } },
      left: { style: "thin", color: { rgb: "334155" } },
      right: { style: "thin", color: { rgb: "334155" } },
    },
  });

  // Centra la colonna "Ore" se esiste
  const oreIndex = columns.indexOf("Ore");
  if (oreIndex >= 0) {
    const XLSX = window.XLSX;
    for (let r = bodyStartRow; r <= lastRow; r++) {
      const addr = XLSX.utils.encode_cell({ r, c: oreIndex });
      if (ws[addr]) {
        ws[addr].s = ws[addr].s || {};
        ws[addr].s.alignment = { ...(ws[addr].s.alignment || {}), horizontal: "center" };
      }
    }
  }

  // Zebra: coloro righe pari
  for (let r = bodyStartRow; r <= lastRow; r++) {
    const isEven = ((r - bodyStartRow) % 2 === 1);
    if (!isEven) continue;
    const rowRange = XLSX.utils.encode_range({
      s: { r, c: 0 },
      e: { r, c: columns.length - 1 }
    });
    setRangeStyle(ws, rowRange, {
      fill: { fgColor: { rgb: "0B1730" } }, // leggermente diverso
    });
  }

  // Auto-fit colonne
  autoFitColumns(ws, [columns, ...dataObjects.map(o => columns.map(k => o[k]))], 10, 48);

  // Filtro su header (riga 3)
  ws["!autofilter"] = {
    ref: XLSX.utils.encode_range({ s: { r: 2, c: 0 }, e: { r: 2, c: columns.length - 1 } })
  };

  // Freeze: titolo + "Generato il" + header
  ws["!freeze"] = { xSplit: 0, ySplit: 3 };

  XLSX.utils.book_append_sheet(wb, ws, safeMainSheetName);

  // Foglio riepilogo opzionale
  if (summary && summary.rows && summary.rows.length) {
    const sumCols = Object.keys(summary.rows[0]);
    const ws2 = XLSX.utils.json_to_sheet(summary.rows, { header: sumCols, origin: "A3" });
    addTitleRow(ws2, summary.title || "Riepilogo", sumCols.length);

    const headerRange2 = XLSX.utils.encode_range({
      s: { r: 2, c: 0 }, e: { r: 2, c: sumCols.length - 1 }
    });
    setRangeStyle(ws2, headerRange2, {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center" },
      fill: { fgColor: { rgb: "1A2F55" } },
      border: {
        top: { style: "thin", color: { rgb: "334155" } },
        bottom: { style: "thin", color: { rgb: "334155" } },
        left: { style: "thin", color: { rgb: "334155" } },
        right: { style: "thin", color: { rgb: "334155" } },
      },
    });

    autoFitColumns(ws2, [sumCols, ...summary.rows.map(o => sumCols.map(k => o[k]))], 10, 48);
    ws2["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 2, c: 0 }, e: { r: 2, c: sumCols.length - 1 } }) };
    ws2["!freeze"] = { xSplit: 0, ySplit: 3 };

    // evita nomi non validi anche qui (e il limite 31 char)
    XLSX.utils.book_append_sheet(wb, ws2, safeSheetName("Riepilogo"));
  }

  // Metodo più compatibile su browser desktop: writeFile() (trigger download diretto)
  if (typeof XLSX.writeFile === "function") {
    XLSX.writeFile(wb, safeFilename(filename), { bookType: "xlsx", cellStyles: true });
    return;
  }

  // Fallback: blob download
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array", cellStyles: true });
  const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  downloadBlob(blob, safeFilename(filename));
}

// Compatibilità: il progetto attuale usa exportToExcel({ rows, filename, sheetName })
function exportToExcel({ rows, filename = "export.xlsx", sheetName = "Dati", title = "" }) {
  const columns = rows && rows.length ? Object.keys(rows[0]) : [];
  exportToExcelElegant({
    filename,
    sheetName,
    title: title || sheetName || "CAME",
    columns,
    rows,
  });
}

// ---------- PDF helper (come già usavi) ----------
function exportToPdfTable({ columns, rows, filename = "export.pdf", title = "" }) {
  if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("jsPDF non disponibile (CDN non caricato).");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  if (title) {
    doc.setFontSize(14);
    doc.text(title, 40, 40);
  }

  const startY = title ? 60 : 40;

  doc.autoTable({
    startY,
    head: [columns],
    body: rows,
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [15, 26, 46] },
    theme: "grid",
    margin: { left: 40, right: 40 },
  });

  // Salvataggio robusto (mobile friendly)
  const blob = doc.output("blob");
  downloadBlob(blob, safeFilename(filename));
}


