let portfolioData = [];

const columnMap = {
  stock: "Stock Name",
  sector: "Sector Name",
  qty: "Quantity",
  cost: "Value At Cost",
  current: "Valuation at Current Market Price"
};

document.getElementById("fileUpload").addEventListener("change", handleFileUpload);

// Drag & Drop upload
const dropZone = document.getElementById("dropZone");
["dragover", "dragenter"].forEach(evt => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault(); activeClass();
  });
});
["dragleave", "drop"].forEach(evt => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault(); dropZone.classList.remove("dragover");
  });
});
dropZone.addEventListener("drop", (e) => {
  handleFileUpload({ target: { files: e.dataTransfer.files } });
});

// Dark Mode Toggle
document.getElementById("darkModeBtn").addEventListener("click", () => {
  document.body.classList.toggle("dark-mode");
});

function activeClass() {
  dropZone.classList.add("dragover");
}

function handleFileUpload(event) {
  const file = event.target.files[0];
  const reader = new FileReader();

  reader.onload = function (e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, {
      range: 4, defval: ""
    });

    const cleaned = json.filter(row =>
      row[columnMap.stock] && !String(row[columnMap.stock]).toLowerCase().includes("total")
    );


    portfolioData = cleaned.map(row => ({
      stock: row[columnMap.stock],
      sector: row[columnMap.sector],
      qty: parseFloat(row[columnMap.qty]) || 0,
      cost: parseFloat(row[columnMap.cost]) || 0,
      current: parseFloat(row[columnMap.current]) || 0
    }));

    fillSectorFilter();
    renderDashboard();
  };
  resetFilters();
  reader.readAsArrayBuffer(file);
}

function fillSectorFilter() {
  const filter = document.getElementById("sectorFilter");
  filter.innerHTML = `<option value="">🔽 Filter by Sector</option>`;
  const sectors = [...new Set(portfolioData.map(d => d.sector))];
  sectors.forEach(s => {
    filter.innerHTML += `<option value="${s}">${s}</option>`;
  });
}

function formatINR(x) {
  return x.toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

function renderDashboard() {
  displayTable(portfolioData);
  displaySummary(portfolioData);
  updateSectorChart(portfolioData);
  updatePerformanceChart(portfolioData);
  updateSectorSummaryTable(portfolioData);
  renderSectorChart();
  renderPerformanceChart();
}

function displaySummary(data) {
  let totalCost = 0, totalValuation = 0;
  data.forEach(d => { totalCost += d.cost; totalValuation += d.current; });

  document.getElementById("totalCost").textContent = formatINR(totalCost);
  document.getElementById("totalValuation").textContent = formatINR(totalValuation);
  document.getElementById("totalPL").textContent = formatINR(totalValuation - totalCost);
}

function displayTable(data) {
  const tbody = document.querySelector("#portfolioTable tbody");
  tbody.innerHTML = "";

  data.forEach(d => {
    const pl = d.current - d.cost;
    let row = `<tr class="${pl>=0 ? "table-success" : "table-danger"}">
      <td>${d.stock}</td>
      <td>${d.sector}</td>
      <td>${d.qty}</td>
      <td>₹${formatINR(d.cost/d.qty)}</td>
      <td>₹${formatINR(d.cost)}</td>
      <td>₹${formatINR(d.current/d.qty)}</td>
      <td>₹${formatINR(d.current)}</td>
      <td>₹${formatINR(pl)}</td>
    </tr>`;
    tbody.innerHTML += row;
  });
}

document.getElementById("searchInput").addEventListener("keyup", (e) => {
  const val = e.target.value.toLowerCase();
  const filtered = portfolioData.filter(d =>
    d.stock.toLowerCase().includes(val) ||
    d.sector.toLowerCase().includes(val)
  );
  displayTable(filtered);
});

document.getElementById("sectorFilter").addEventListener("change", (e) => {
  const val = e.target.value;
  const filtered = val
    ? portfolioData.filter(d => d.sector === val)
    : portfolioData;
  displayTable(filtered);
});

// Simple table sort
function sortTable(n) {
  const table = document.getElementById("portfolioTable");
  let rows, switching, i, x, y, shouldSwitch, dir = "asc";
  switching = true;

  while (switching) {
    switching = false;
    rows = table.rows;

    for (i = 1; i < (rows.length - 1); i++) {
      shouldSwitch = false;
      x = rows[i].getElementsByTagName("TD")[n];
      y = rows[i + 1].getElementsByTagName("TD")[n];

      if (dir == "asc") {
        if (x.innerHTML.toLowerCase() > y.innerHTML.toLowerCase()) {
          shouldSwitch = true; break;
        }
      } else {
        if (x.innerHTML.toLowerCase() < y.innerHTML.toLowerCase()) {
          shouldSwitch = true; break;
        }
      }
    }
    if (shouldSwitch) {
      rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
      switching = true;
    } else if (dir == "asc") {
      dir = "desc";
      switching = true;
    }
  }
}

document.getElementById("exportExcelBtn").addEventListener("click", () => {
  if (!portfolioData || !portfolioData.length) return;

  // Prepare sheet
  const wsData = [
    ["Stock", "Sector", "Qty", "Avg Cost", "Cost Value", "Market Price", "Current Value", "Unrealized P/L"]
  ];

  portfolioData.forEach(d => {
    const pl = d.current - d.cost;
    wsData.push([
      d.stock, d.sector, d.qty,
      (d.cost / d.qty).toFixed(2),
      d.cost.toFixed(2),
      (d.current / d.qty).toFixed(2),
      d.current.toFixed(2),
      pl.toFixed(2)
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, "Portfolio");

  XLSX.writeFile(wb, "portfolio_export.xlsx");
});

document.getElementById("exportPdfBtn").addEventListener("click", () => {
  if (!portfolioData || !portfolioData.length) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const tableData = portfolioData.map(d => {
    const pl = d.current - d.cost;
    return [
      d.stock,
      d.sector,
      d.qty,
      (d.cost / d.qty).toFixed(2),
      d.cost.toFixed(2),
      (d.current / d.qty).toFixed(2),
      d.current.toFixed(2),
      pl.toFixed(2)
    ];
  });

  doc.autoTable({
    head: [["Stock","Sector","Qty","Avg Cost","Cost Value","Market Price","Current Value","P/L"]],
    body: tableData,
    theme: "striped",
    styles: { fontSize: 8 },
    headStyles: { fillColor: [52, 58, 64] }
  });

  doc.save("portfolio_export.pdf");
});

function resetFilters() {
  document.getElementById("searchInput").value = "";
  document.getElementById("sectorFilter").value = "";
  displayTable(portfolioData);
  displaySummary(portfolioData);
  updateSectorChart(portfolioData);
  updatePerformanceChart(portfolioData);
  updateSectorSummaryTable(portfolioData);
}

document.getElementById("searchInput").addEventListener("keyup", (e) => {
  const val = e.target.value.toLowerCase();
  const filtered = portfolioData.filter(d =>
    d.stock.toLowerCase().includes(val) ||
    d.sector.toLowerCase().includes(val)
  );
  renderFilteredData(filtered);
});

document.getElementById("sectorFilter").addEventListener("change", (e) => {
  const val = e.target.value;
  const filtered = val
    ? portfolioData.filter(d => d.sector === val)
    : portfolioData;
  renderFilteredData(filtered);
});

function renderFilteredData(filtered) {
  displayTable(filtered);
  displaySummary(filtered);
  updateSectorChart(filtered);
  updatePerformanceChart(filtered);
  updateSectorSummaryTable(filtered);
}

let sectorChartInstance, performanceChartInstance;

function updateSectorChart(data) {
  const sectors = {};
  let totalValue = 0;
  data.forEach(d => {
    sectors[d.sector] = (sectors[d.sector] || 0) + d.current;
    totalValue += d.current;
  });

  const labels = Object.keys(sectors);
  const values = labels.map(l => sectors[l]);

  if (sectorChartInstance) sectorChartInstance.destroy();

  const ctx = document.getElementById("sectorChart").getContext("2d");
  sectorChartInstance = new Chart(ctx, {
    type: "pie",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [
          "#007bff","#28a745","#ffc107","#dc3545","#6f42c1","#17a2b8","#fd7e14"
        ]
      }]
    },
    options: {
      plugins: {
        title: { display: true, text: "Sector Allocation (%)" }
      }
    }
  });
}

function updatePerformanceChart(data) {
  const perf = data.map(d => ({
    name: d.stock,
    profit: d.current - d.cost
  })).sort((a, b) => Math.abs(b.profit) - Math.abs(a.profit));
  
  const top = perf.slice(0, 5);

  if (performanceChartInstance) performanceChartInstance.destroy();

  const ctx2 = document.getElementById("performanceChart").getContext("2d");
  performanceChartInstance = new Chart(ctx2, {
    type: "bar",
    data: {
      labels: top.map(d => d.name),
      datasets: [{
        label: "Unrealized P/L",
        data: top.map(d => d.profit),
        backgroundColor: top.map(p => p.profit >= 0 ? "green" : "red")
      }]
    },
    options: {
      plugins: {
        title: { display: true, text: "Top 5 Gain/Loss" }
      },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function updateSectorSummaryTable(data) {
  const tbody = document.querySelector("#sectorSummaryTable tbody");
  tbody.innerHTML = "";

  const summary = {};

  data.forEach(d => {
    if (!summary[d.sector]) {
      summary[d.sector] = { cost: 0, current: 0 };
    }
    summary[d.sector].cost += d.cost;
    summary[d.sector].current += d.current;
  });

  const totalPortfolio = data.reduce((sum, d) => sum + d.current, 0);

  Object.keys(summary).forEach(sector => {
    const cost = summary[sector].cost;
    const current = summary[sector].current;
    const pl = current - cost;
    const pct = totalPortfolio ? ((current / totalPortfolio) * 100).toFixed(2) : 0;

    tbody.innerHTML += `
      <tr>
        <td>${sector}</td>
        <td>₹${formatINR(cost)}</td>
        <td>₹${formatINR(current)}</td>
        <td style="color:${pl>=0?'green':'red'}">₹${formatINR(pl)}</td>
        <td>${pct}%</td>
      </tr>
    `;
  });
}
