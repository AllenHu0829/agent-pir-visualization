(function () {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const dataBody = document.getElementById('dataBody');
  const dataInfo = document.getElementById('dataInfo');
  const addRowBtn = document.getElementById('addRowBtn');
  const clearBtn = document.getElementById('clearBtn');
  const chartHint = document.getElementById('chartHint');

  let pirChart = null;
  let dataRows = [];

  // --- Drag & Drop ---
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) handleFile(fileInput.files[0]);
  });

  addRowBtn.addEventListener('click', () => {
    dataRows.push({ distance: 0, angle: 0, triggered: true });
    renderTable();
    syncChart();
    const inputs = dataBody.querySelectorAll('input[data-field="distance"]');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  clearBtn.addEventListener('click', () => {
    dataRows = [];
    renderTable();
    syncChart();
  });

  // --- File Handling ---
  function handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => importData(results.data)
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet);
        importData(data);
      };
      reader.readAsArrayBuffer(file);
    } else {
      alert('不支持的文件格式，请上传 CSV 或 Excel 文件。');
    }
  }

  // --- Field Matching ---
  const DISTANCE_KEYS = ['距离', 'distance', 'dist', '距离(m)', '距离（m）', 'range'];
  const ANGLE_KEYS = ['角度', 'angle', '角度(°)', '角度（°）', '角度(度)', 'deg'];
  const TRIGGER_KEYS = ['触发', 'triggered', 'trigger', '是否触发', 'status', 'result'];

  function matchField(headers, candidates) {
    for (const c of candidates) {
      const found = headers.find(h => h.trim().toLowerCase() === c.toLowerCase());
      if (found) return found;
    }
    for (const c of candidates) {
      const found = headers.find(h => h.trim().toLowerCase().includes(c.toLowerCase()));
      if (found) return found;
    }
    return null;
  }

  function isTrigger(val) {
    if (val === undefined || val === null) return false;
    const s = String(val).trim().toLowerCase();
    return ['是', 'yes', 'true', '1', 'triggered', '触发', 'pass'].includes(s);
  }

  // --- Import file data into editable rows ---
  function importData(rows) {
    if (!rows || rows.length === 0) { alert('无有效数据'); return; }

    const headers = Object.keys(rows[0]);
    const distKey = matchField(headers, DISTANCE_KEYS);
    const angleKey = matchField(headers, ANGLE_KEYS);
    const trigKey = matchField(headers, TRIGGER_KEYS);

    if (!distKey || !angleKey) {
      alert('无法识别距离或角度字段。\n当前列名: ' + headers.join(', '));
      return;
    }

    dataRows = rows.map((r) => {
      const dist = parseFloat(r[distKey]);
      const angleDeg = parseFloat(r[angleKey]);
      if (isNaN(dist) || isNaN(angleDeg)) return null;
      return {
        distance: dist,
        angle: angleDeg,
        triggered: trigKey ? isTrigger(r[trigKey]) : true
      };
    }).filter(Boolean);

    if (dataRows.length === 0) { alert('解析后无有效数据。'); return; }

    renderTable();
    syncChart();
  }

  // --- Editable Table ---
  function renderTable() {
    dataInfo.textContent = dataRows.length ? '共 ' + dataRows.length + ' 条数据' : '';

    if (dataRows.length === 0) {
      dataBody.innerHTML = '<tr><td colspan="5" style="color:#bbb;padding:2rem">暂无数据，上传文件或点击"添加行"</td></tr>';
      return;
    }

    let html = '';
    dataRows.forEach((row, i) => {
      const cls = row.triggered ? 'row-triggered' : 'row-not-triggered';
      html += '<tr class="' + cls + '">' +
        '<td class="col-idx">' + (i + 1) + '</td>' +
        '<td><input type="number" step="any" value="' + row.distance + '" data-idx="' + i + '" data-field="distance" /></td>' +
        '<td><input type="number" step="any" value="' + row.angle + '" data-idx="' + i + '" data-field="angle" /></td>' +
        '<td><select data-idx="' + i + '" data-field="triggered">' +
          '<option value="1"' + (row.triggered ? ' selected' : '') + '>是</option>' +
          '<option value="0"' + (!row.triggered ? ' selected' : '') + '>否</option>' +
        '</select></td>' +
        '<td class="col-action"><button class="btn-del" data-idx="' + i + '" title="删除">×</button></td>' +
        '</tr>';
    });
    dataBody.innerHTML = html;
  }

  // --- Delegate events on table body for real-time sync ---
  dataBody.addEventListener('input', (e) => {
    const el = e.target;
    const idx = parseInt(el.dataset.idx);
    const field = el.dataset.field;
    if (isNaN(idx) || !field || !dataRows[idx]) return;

    if (field === 'distance' || field === 'angle') {
      dataRows[idx][field] = parseFloat(el.value) || 0;
    }
    syncChart();
  });

  dataBody.addEventListener('change', (e) => {
    const el = e.target;
    const idx = parseInt(el.dataset.idx);
    const field = el.dataset.field;
    if (isNaN(idx) || !field || !dataRows[idx]) return;

    if (field === 'triggered') {
      dataRows[idx].triggered = el.value === '1';
      const tr = el.closest('tr');
      tr.className = dataRows[idx].triggered ? 'row-triggered' : 'row-not-triggered';
    }
    syncChart();
  });

  dataBody.addEventListener('click', (e) => {
    if (!e.target.classList.contains('btn-del')) return;
    const idx = parseInt(e.target.dataset.idx);
    if (isNaN(idx)) return;
    dataRows.splice(idx, 1);
    renderTable();
    syncChart();
  });

  // --- Chart (real-time sync) ---
  function syncChart() {
    const valid = dataRows.filter(r => !isNaN(r.distance) && !isNaN(r.angle));

    if (valid.length === 0) {
      if (pirChart) { pirChart.destroy(); pirChart = null; }
      chartHint.hidden = false;
      return;
    }
    chartHint.hidden = true;

    const points = valid.map(r => {
      const rad = (r.angle * Math.PI) / 180;
      return {
        x: round2(r.distance * Math.sin(rad)),
        y: round2(r.distance * Math.cos(rad)),
        _dist: r.distance,
        _angle: r.angle,
        _trig: r.triggered
      };
    });

    const triggered = points.filter(p => p._trig);
    const notTriggered = points.filter(p => !p._trig);
    const maxDist = Math.max(...valid.map(r => r.distance), 1) * 1.25;

    const datasets = [
      {
        label: '设备',
        data: [{ x: 0, y: 0 }],
        backgroundColor: '#3498db',
        pointRadius: 10,
        pointStyle: 'rectRot'
      },
      {
        label: '触发',
        data: triggered,
        backgroundColor: 'rgba(46,204,113,0.85)',
        pointRadius: 7,
        pointHoverRadius: 10
      },
      {
        label: '未触发',
        data: notTriggered,
        backgroundColor: 'rgba(231,76,60,0.85)',
        pointRadius: 7,
        pointHoverRadius: 10
      }
    ];

    const chartOpts = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 200 },
      scales: {
        x: {
          title: { display: true, text: 'X 距离 (m)', font: { size: 12 } },
          min: -maxDist,
          max: maxDist,
          grid: { color: '#f0f0f0' },
          ticks: { font: { size: 11 } }
        },
        y: {
          title: { display: true, text: 'Y 距离 (m)', font: { size: 12 } },
          min: -maxDist * 0.3,
          max: maxDist,
          grid: { color: '#f0f0f0' },
          ticks: { font: { size: 11 } }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: function (ctx) {
              const p = ctx.raw;
              if (p._dist !== undefined) {
                return '距离: ' + p._dist + 'm  角度: ' + p._angle + '°  ' + (p._trig ? '✓ 触发' : '✗ 未触发');
              }
              return '设备（原点）';
            }
          }
        },
        legend: { display: false }
      }
    };

    if (pirChart) {
      pirChart.data.datasets = datasets;
      pirChart.options.scales.x.min = -maxDist;
      pirChart.options.scales.x.max = maxDist;
      pirChart.options.scales.y.min = -maxDist * 0.3;
      pirChart.options.scales.y.max = maxDist;
      pirChart.update();
    } else {
      const ctx = document.getElementById('pirChart').getContext('2d');
      pirChart = new Chart(ctx, { type: 'scatter', data: { datasets }, options: chartOpts });
    }
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }
})();
