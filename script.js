let portfolioData = [];
let viewData = [];              // <-- always reflects what is currently displayed
let lastFileName = "";

let sectorChartInstance = null;
let performanceChartInstance = null;

const columnMap = {
  stock: "Stock Name",
  sector: "Sector Name",
  qty: "Quantity",
  cost: "Value At Cost",
  current: "Valuation at Current Market Price"
};

// ---- DOM
const fileUpload = document.getElementById("fileUpload");
const dropZone = document.getElementById("dropZone");
const openUploadBtn = document.getElementById("openUploadBtn");
const fileStatus = document.getElementById("fileStatus");

const searchInput = document.getElementById("searchInput");
const sectorFilter = document.getElementById("sectorFilter");
const plFilter = document.getElementById("plFilter");
const applyBtn = document.getElementById("applyBtn");
const resetBtn = document.getElementById("resetBtn");

const exportExcelBtn = document.getElementById("exportExcelBtn");
const exportPdfBtn = document.getElementById("exportPdfBtn");

const darkModeBtn = document.getElementById("darkModeBtn");
const themeLightBtn = document.getElementById("themeLightBtn");
const themeDarkBtn = document.getElementById("themeDarkBtn");

const asOfText = document.getElementById("asOfText");
const viewCount = document.getElementById("viewCount");

// Settings
const pdfLayout = document.getElementById("pdfLayout");
const topNInput = document.getElementById("topN");

// ---- Theme
function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
}
(function initTheme(){
  const saved = localStorage.getItem("theme");
  if (saved === "dark" || saved === "light") setTheme(saved);
})();

darkModeBtn?.addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme") || "light";
  setTheme(cur === "dark" ? "light" : "dark");
});
themeLightBtn?.addEventListener("click", () => setTheme("light"));
themeDarkBtn?.addEventListener("click", () => setTheme("dark"));

// ---- Upload handlers
openUploadBtn?.addEventListener("click", () => fileUpload.click());
dropZone?.addEventListener("click", () => fileUpload.click());
fileUpload.addEventListener("change", handleFileUpload);

// Drag & Drop upload
["dragover", "dragenter"].forEach(evt => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });
});
["dragleave", "drop"].forEach(evt => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
  });
});
dropZone.addEventListener("drop", (e) => {
  handleFileUpload({ target: { files: e.dataTransfer.files } });
});

// ---- Filters
applyBtn?.addEventListener("click", applyFilters);
resetBtn?.addEventListener("click", resetFilters);
searchInput?.addEventListener("keyup", applyFilters);
sectorFilter?.addEventListener("change", applyFilters);
plFilter?.addEventListener("change", applyFilters);

// ---- Sorting
let sortState = { key: null, dir: "desc" };
document.querySelectorAll("#portfolioTable thead th[data-sort]").forEach(th => {
  th.addEventListener("click", () => {
    const key = th.getAttribute("data-sort");
    if (!key) return;
    if (sortState.key === key) sortState.dir = (sortState.dir === "asc" ? "desc" : "asc");
    else { sortState.key = key; sortState.dir = "desc"; }
    applyFilters();
  });
});

// ---- Export
exportExcelBtn?.addEventListener("click", exportExcel);
exportPdfBtn?.addEventListener("click", exportPDF);

// ---- Utils
function formatINR(x) {
  const n = Number.isFinite(x) ? x : 0;
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function safeDiv(a, b) {
  return b ? (a / b) : 0;
}
function nowLabel() {
  const d = new Date();
  return d.toLocaleString();
}
function setFileStatus(text) {
  fileStatus.textContent = text;
}
function setViewCount(n) {
  viewCount.textContent = `Showing: ${n} rows`;
}

// ---- Core
function handleFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  lastFileName = file.name;
  setFileStatus(`Loaded: ${lastFileName}`);
  asOfText.textContent = `As of: ${nowLabel()}`;

  const reader = new FileReader();
  reader.onload = function (e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { range: 4, defval: "" });

    const cleaned = json.filter(row =>
      row[columnMap.stock] &&
      !String(row[columnMap.stock]).toLowerCase().includes("total")
    );

    portfolioData = cleaned.map(row => {
      const qty = parseFloat(row[columnMap.qty]) || 0;
      const cost = parseFloat(row[columnMap.cost]) || 0;
      const current = parseFloat(row[columnMap.current]) || 0;

      const avgCost = safeDiv(cost, qty);
      const mktPrice = safeDiv(current, qty);
      const pl = current - cost;
      const plPct = safeDiv(pl, cost) * 100;

      return {
        stock: String(row[columnMap.stock]).trim(),
        sector: String(row[columnMap.sector] || "—").trim(),
        qty,
        cost,
        current,
        avgCost,
        mktPrice,
        pl,
        plPct,
        weight: 0
      };
    });

    // Calculate weights (by current value)
    const totalCur = portfolioData.reduce((s, d) => s + d.current, 0);
    portfolioData.forEach(d => d.weight = safeDiv(d.current, totalCur) * 100);

    fillSectorFilter();
    resetFilters();
  };

  reader.readAsArrayBuffer(file);
}

function fillSectorFilter() {
  sectorFilter.innerHTML = `<option value="">Filter by Sector</option>`;
  const sectors = [...new Set(portfolioData.map(d => d.sector))].sort();
  sectors.forEach(s => {
    sectorFilter.innerHTML += `<option value="${s}">${s}</option>`;
  });
}

function applyFilters() {
  const q = (searchInput.value || "").toLowerCase().trim();
  const sector = sectorFilter.value || "";
  const plMode = plFilter.value || "all";

  let filtered = [...portfolioData];

  if (q) {
    filtered = filtered.filter(d =>
      d.stock.toLowerCase().includes(q) ||
      d.sector.toLowerCase().includes(q)
    );
  }

  if (sector) {
    filtered = filtered.filter(d => d.sector === sector);
  }

  if (plMode === "gainers") filtered = filtered.filter(d => d.pl > 0);
  if (plMode === "losers") filtered = filtered.filter(d => d.pl < 0);

  // Sort
  if (sortState.key) {
    const { key, dir } = sortState;
    const mult = dir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      const av = a[key], bv = b[key];
      // string vs number
      if (typeof av === "string") return av.localeCompare(bv) * mult;
      return ((av || 0) - (bv || 0)) * mult;
    });
  }

  renderAll(filtered);
}

function resetFilters() {
  searchInput.value = "";
  sectorFilter.value = "";
  plFilter.value = "all";
  sortState = { key: null, dir: "desc" };
  renderAll([...portfolioData]);
}

function renderAll(data) {
  viewData = [...data];
  setViewCount(viewData.length);

  displaySummary(viewData);
  displayTable(viewData);
  updateSectorChart(viewData);
  updatePerformanceChart(viewData);
  updateSectorSummaryTable(viewData);
}

function displaySummary(data) {
  let totalCost = 0, totalValuation = 0;
  data.forEach(d => { totalCost += d.cost; totalValuation += d.current; });
  const pl = totalValuation - totalCost;
  const ret = safeDiv(pl, totalCost) * 100;

  document.getElementById("totalCost").textContent = formatINR(totalCost);
  document.getElementById("totalValuation").textContent = formatINR(totalValuation);
  document.getElementById("totalPL").textContent = formatINR(pl);
  document.getElementById("returnPct").textContent = `${ret.toFixed(2)}%`;

  const sectors = new Set(data.map(d => d.sector));
  document.getElementById("kpiHoldings").textContent = `Holdings: ${data.length}`;
  document.getElementById("kpiSectors").textContent = `Sectors: ${sectors.size}`;

  const plBadge = document.getElementById("plBadge");
  plBadge.classList.remove("good","bad","neutral");
  if (pl > 0) plBadge.classList.add("good");
  else if (pl < 0) plBadge.classList.add("bad");
  else plBadge.classList.add("neutral");
}

function displayTable(data) {
  const tbody = document.querySelector("#portfolioTable tbody");
  tbody.innerHTML = "";

  data.forEach(d => {
    const plClass = d.pl > 0 ? "good" : (d.pl < 0 ? "bad" : "neutral");
    const plIcon = d.pl > 0 ? "bi-arrow-up-right" : (d.pl < 0 ? "bi-arrow-down-right" : "bi-dash");

    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="fw-semibold">${escapeHtml(d.stock)}</td>
      <td class="text-muted">${escapeHtml(d.sector)}</td>

      <td class="text-end">${formatINR(d.qty)}</td>
      <td class="text-end">₹${formatINR(d.avgCost)}</td>
      <td class="text-end">₹${formatINR(d.cost)}</td>
      <td class="text-end">₹${formatINR(d.mktPrice)}</td>
      <td class="text-end">₹${formatINR(d.current)}</td>

      <td class="text-end">
        <span class="badge-pl ${plClass}">
          <i class="bi ${plIcon}"></i> ₹${formatINR(d.pl)}
        </span>
      </td>
      <td class="text-end">${Number.isFinite(d.plPct) ? d.plPct.toFixed(2) : "0.00"}%</td>
      <td class="text-end">${Number.isFinite(d.weight) ? d.weight.toFixed(2) : "0.00"}%</td>
    `;
    tbody.appendChild(row);
  });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function updateSectorChart(data) {
  const sectors = {};
  data.forEach(d => {
    sectors[d.sector] = (sectors[d.sector] || 0) + d.current;
  });

  const labels = Object.keys(sectors);
  const values = labels.map(l => sectors[l]);

  if (sectorChartInstance) sectorChartInstance.destroy();

  const ctx = document.getElementById("sectorChart").getContext("2d");
  sectorChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data: values }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" },
        title: { display: true, text: "Sector Allocation (Current Value)" }
      }
    }
  });
}

function updatePerformanceChart(data) {
  const n = Math.max(3, Math.min(20, parseInt(topNInput?.value || "5", 10)));

  const perf = data
    .map(d => ({ name: d.stock, profit: d.pl }))
    .sort((a, b) => Math.abs(b.profit) - Math.abs(a.profit));

  const top = perf.slice(0, n);

  if (performanceChartInstance) performanceChartInstance.destroy();

  const ctx2 = document.getElementById("performanceChart").getContext("2d");
  performanceChartInstance = new Chart(ctx2, {
    type: "bar",
    data: {
      labels: top.map(d => d.name),
      datasets: [{ label: "Unrealized P/L", data: top.map(d => d.profit) }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true },
        title: { display: true, text: `Top ${n} Movers (Absolute P/L)` }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

function updateSectorSummaryTable(data) {
  const tbody = document.querySelector("#sectorSummaryTable tbody");
  tbody.innerHTML = "";

  const summary = {};
  data.forEach(d => {
    if (!summary[d.sector]) summary[d.sector] = { cost: 0, current: 0 };
    summary[d.sector].cost += d.cost;
    summary[d.sector].current += d.current;
  });

  const totalPortfolio = data.reduce((sum, d) => sum + d.current, 0);

  Object.keys(summary).sort().forEach(sector => {
    const cost = summary[sector].cost;
    const current = summary[sector].current;
    const pl = current - cost;
    const pct = totalPortfolio ? ((current / totalPortfolio) * 100) : 0;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="fw-semibold">${escapeHtml(sector)}</td>
      <td class="text-end">₹${formatINR(cost)}</td>
      <td class="text-end">₹${formatINR(current)}</td>
      <td class="text-end ${pl >= 0 ? "text-success" : "text-danger"}">₹${formatINR(pl)}</td>
      <td class="text-end">${pct.toFixed(2)}%</td>
    `;
    tbody.appendChild(tr);
  });
}

// ---- Export Excel (exports CURRENT VIEW)
function exportExcel() {
  if (!viewData?.length) return;

  const wsData = [
    ["Stock","Sector","Qty","Avg Cost","Cost Value","Market Price","Current Value","P/L","P/L %","Weight %"]
  ];

  viewData.forEach(d => {
    wsData.push([
      d.stock,
      d.sector,
      d.qty,
      d.avgCost,
      d.cost,
      d.mktPrice,
      d.current,
      d.pl,
      d.plPct,
      d.weight
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, "Portfolio View");

  const name = (lastFileName ? lastFileName.replace(/\.[^/.]+$/, "") : "portfolio");
  XLSX.writeFile(wb, `${name}_view_export.xlsx`);
}

// ---- Export PDF (exports CURRENT VIEW + charts + sector summary)
async function exportPDF() {
  if (!viewData?.length) return;

  const { jsPDF } = window.jspdf;

  const layout = (pdfLayout?.value || "landscape");
  const doc = new jsPDF({ orientation: layout, unit: "pt", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  let y = 44;

  // Use INR label instead of ₹ (fixes jsPDF font rendering issues with ₹)
  const money = (n) => `INR ${formatINR(Number(n) || 0)}`;
  const num2 = (n) => (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct2 = (n) => `${(Number(n) || 0).toFixed(2)}%`;

  const title = "Portfolio Dashboard Export";
  const subtitle = `File: ${lastFileName || "—"}   •   Generated: ${nowLabel()}   •   Rows: ${viewData.length}`;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, margin, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  y += 18;
  doc.text(subtitle, margin, y);

  // Summary (formatted)
  y += 18;
  const totals = viewData.reduce((acc, d) => {
    acc.cost += Number(d.cost) || 0;
    acc.current += Number(d.current) || 0;
    return acc;
  }, { cost: 0, current: 0 });

  const pl = totals.current - totals.cost;
  const ret = safeDiv(pl, totals.cost) * 100;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Summary", margin, y);

  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    `Total Invested: ${money(totals.cost)}   |   Current Value: ${money(totals.current)}   |   P/L: ${money(pl)}   |   Return: ${pct2(ret)}`,
    margin,
    y
  );

  // Charts
  y += 18;
  const sectorCanvas = document.getElementById("sectorChart");
  const perfCanvas = document.getElementById("performanceChart");

  const chartH = layout === "landscape" ? 190 : 160;
  const chartW = (pageWidth - margin * 2 - 12) / 2;

  if (sectorCanvas && perfCanvas) {
    const sectorImg = sectorCanvas.toDataURL("image/png", 1.0);
    const perfImg = perfCanvas.toDataURL("image/png", 1.0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Charts", margin, y);
    y += 8;

    doc.addImage(sectorImg, "PNG", margin, y, chartW, chartH);
    doc.addImage(perfImg, "PNG", margin + chartW + 12, y, chartW, chartH);

    y += chartH + 18;
  }

  // Sector Summary Table (formatted + INR label)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Sector Summary", margin, y);
  y += 8;

  const sectorAgg = {};
  viewData.forEach(d => {
    const s = d.sector || "—";
    if (!sectorAgg[s]) sectorAgg[s] = { cost: 0, current: 0 };
    sectorAgg[s].cost += Number(d.cost) || 0;
    sectorAgg[s].current += Number(d.current) || 0;
  });

  const totalCur = viewData.reduce((s, d) => s + (Number(d.current) || 0), 0);

  const sectorRows = Object.keys(sectorAgg).sort().map(sector => {
    const cost = sectorAgg[sector].cost;
    const cur = sectorAgg[sector].current;
    const plv = cur - cost;
    const pct = totalCur ? (cur / totalCur) * 100 : 0;
    return [
      sector,
      money(cost),
      money(cur),
      money(plv),
      pct2(pct)
    ];
  });

  doc.autoTable({
    startY: y,
    head: [["Sector", "Total Cost", "Total Current", "Total P/L", "% Port"]],
    body: sectorRows,
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [30, 41, 59] },
    margin: { left: margin, right: margin },
    columnStyles: {
      0: { cellWidth: 160 }, // Sector
      1: { cellWidth: 110 },
      2: { cellWidth: 120 },
      3: { cellWidth: 110 },
      4: { cellWidth: 70 }
    }
  });

  y = doc.lastAutoTable.finalY + 18;

  // New page if too low
  if (y > pageHeight - 120) {
    doc.addPage();
    y = 44;
  }

  // Holdings Table (formatted + tighter columns)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Holdings (Filtered View)", margin, y);
  y += 8;

  const holdingsRows = viewData.map(d => ([
    d.stock || "—",
    d.sector || "—",
    num2(d.qty),
    money(d.avgCost),
    money(d.cost),
    money(d.mktPrice),
    money(d.current),
    money(d.pl),
    pct2(d.plPct),
    pct2(d.weight)
  ]));

  doc.autoTable({
    startY: y,
    head: [[
      "Stock", "Sector", "Qty", "Avg", "Cost", "Mkt", "Cur", "P/L", "P/L%", "Wt%"
    ]],
    body: holdingsRows,
    styles: {
      fontSize: 8,
      cellPadding: 3,
      overflow: "linebreak"
    },
    headStyles: { fillColor: [30, 41, 59] },
    margin: { left: margin, right: margin },
    columnStyles: {
      0: { cellWidth: 120 }, // Stock
      1: { cellWidth: 110 }, // Sector
      2: { cellWidth: 45, halign: "right" },
      3: { cellWidth: 72, halign: "right" },
      4: { cellWidth: 72, halign: "right" },
      5: { cellWidth: 72, halign: "right" },
      6: { cellWidth: 76, halign: "right" },
      7: { cellWidth: 70, halign: "right" },
      8: { cellWidth: 50, halign: "right" },
      9: { cellWidth: 46, halign: "right" }
    },
    didDrawPage: () => {
      const page = doc.internal.getNumberOfPages();
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(`Page ${page}`, pageWidth - margin, pageHeight - 18, { align: "right" });
    }
  });

  const name = (lastFileName ? lastFileName.replace(/\.[^/.]+$/, "") : "portfolio");
  doc.save(`${name}_view_export.pdf`);
}

