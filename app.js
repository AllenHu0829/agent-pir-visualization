(function () {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const dataBody = document.getElementById('dataBody');
  const dataInfo = document.getElementById('dataInfo');
  const addRowBtn = document.getElementById('addRowBtn');
  const clearBtn = document.getElementById('clearBtn');
  const emptyMsg = document.getElementById('emptyMsg');

  let pirChart = null;
  let rows = [];

  // --- Drag & Drop ---
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
    rows.push({ distance: 0, angle: 0, triggered: true });
    renderTable();
    syncChart();
    const inputs = dataBody.querySelectorAll('input[data-field="distance"]');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  clearBtn.addEventListener('click', () => {
    rows = [];
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
        complete: (r) => importData(r.data)
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        importData(XLSX.utils.sheet_to_json(sheet));
      };
      reader.readAsArrayBuffer(file);
    } else {
      alert('不支持的文件格式，请上传 CSV 或 Excel 文件。');
    }
  }

  // --- Field Matching ---
  const DIST = ['距离', 'distance', 'dist', '距离(m)', '距离（m）', 'range'];
  const ANGLE = ['角度', 'angle', '角度(°)', '角度（°）', '角度(度)', 'deg'];
  const TRIG = ['触发', 'triggered', 'trigger', '是否触发', 'status', 'result'];

  function match(headers, keys) {
    for (const k of keys) {
      const f = headers.find(h => h.trim().toLowerCase() === k.toLowerCase());
      if (f) return f;
    }
    for (const k of keys) {
      const f = headers.find(h => h.trim().toLowerCase().includes(k.toLowerCase()));
      if (f) return f;
    }
    return null;
  }

  function isTrig(v) {
    if (v == null) return false;
    const s = String(v).trim().toLowerCase();
    return ['是', 'yes', 'true', '1', 'triggered', '触发', 'pass'].includes(s);
  }

  function importData(raw) {
    if (!raw || !raw.length) { alert('无有效数据'); return; }
    const h = Object.keys(raw[0]);
    const dk = match(h, DIST), ak = match(h, ANGLE), tk = match(h, TRIG);
    if (!dk || !ak) {
      alert('无法识别距离或角度字段。\n列名: ' + h.join(', '));
      return;
    }
    rows = raw.map(r => {
      const d = parseFloat(r[dk]), a = parseFloat(r[ak]);
      if (isNaN(d) || isNaN(a)) return null;
      return { distance: d, angle: a, triggered: tk ? isTrig(r[tk]) : true };
    }).filter(Boolean);
    if (!rows.length) { alert('解析后无有效数据。'); return; }
    renderTable();
    syncChart();
  }

  // --- Editable Table ---
  function renderTable() {
    dataInfo.textContent = rows.length ? rows.length + ' 条' : '';
    if (!rows.length) {
      dataBody.innerHTML = '<tr class="empty-row"><td colspan="5">暂无数据</td></tr>';
      return;
    }
    let html = '';
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const cls = r.triggered ? 'row-trig' : 'row-no-trig';
      html +=
        '<tr class="' + cls + '">' +
        '<td style="color:#bbb;font-size:0.78rem">' + (i + 1) + '</td>' +
        '<td><input type="number" step="any" value="' + r.distance + '" data-i="' + i + '" data-field="distance"></td>' +
        '<td><input type="number" step="any" value="' + r.angle + '" data-i="' + i + '" data-field="angle"></td>' +
        '<td><select data-i="' + i + '" data-field="triggered">' +
        '<option value="1"' + (r.triggered ? ' selected' : '') + '>是</option>' +
        '<option value="0"' + (!r.triggered ? ' selected' : '') + '>否</option>' +
        '</select></td>' +
        '<td><button class="btn-del" data-i="' + i + '">×</button></td>' +
        '</tr>';
    }
    dataBody.innerHTML = html;
  }

  dataBody.addEventListener('input', (e) => {
    const el = e.target, i = +el.dataset.i, f = el.dataset.field;
    if (isNaN(i) || !f || !rows[i]) return;
    if (f === 'distance' || f === 'angle') rows[i][f] = parseFloat(el.value) || 0;
    syncChart();
  });

  dataBody.addEventListener('change', (e) => {
    const el = e.target, i = +el.dataset.i, f = el.dataset.field;
    if (isNaN(i) || !f || !rows[i]) return;
    if (f === 'triggered') {
      rows[i].triggered = el.value === '1';
      const tr = el.closest('tr');
      tr.className = rows[i].triggered ? 'row-trig' : 'row-no-trig';
    }
    syncChart();
  });

  dataBody.addEventListener('click', (e) => {
    if (!e.target.classList.contains('btn-del')) return;
    const i = +e.target.dataset.i;
    if (isNaN(i)) return;
    rows.splice(i, 1);
    renderTable();
    syncChart();
  });

  // --- Chart ---
  function syncChart() {
    const valid = rows.filter(r => !isNaN(r.distance) && !isNaN(r.angle));
    if (!valid.length) {
      if (pirChart) { pirChart.destroy(); pirChart = null; }
      emptyMsg.style.display = '';
      return;
    }
    emptyMsg.style.display = 'none';

    const pts = valid.map(r => {
      const rad = (r.angle * Math.PI) / 180;
      return {
        x: rd(r.distance * Math.sin(rad)),
        y: rd(r.distance * Math.cos(rad)),
        _d: r.distance, _a: r.angle, _t: r.triggered
      };
    });

    const yes = pts.filter(p => p._t);
    const no = pts.filter(p => !p._t);
    const mx = Math.max(...valid.map(r => r.distance), 1) * 1.25;

    const ds = [
      { label: '设备', data: [{ x: 0, y: 0 }], backgroundColor: '#3498db', pointRadius: 10, pointStyle: 'rectRot' },
      { label: '触发', data: yes, backgroundColor: 'rgba(46,204,113,0.85)', pointRadius: 7, pointHoverRadius: 10 },
      { label: '未触发', data: no, backgroundColor: 'rgba(231,76,60,0.85)', pointRadius: 7, pointHoverRadius: 10 }
    ];

    if (pirChart) {
      pirChart.data.datasets = ds;
      pirChart.options.scales.x.min = -mx;
      pirChart.options.scales.x.max = mx;
      pirChart.options.scales.y.min = -mx * 0.3;
      pirChart.options.scales.y.max = mx;
      pirChart.update('none');
    } else {
      pirChart = new Chart(document.getElementById('pirChart').getContext('2d'), {
        type: 'scatter',
        data: { datasets: ds },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          scales: {
            x: { title: { display: true, text: 'X 距离 (m)' }, min: -mx, max: mx, grid: { color: '#f0f0f0' } },
            y: { title: { display: true, text: 'Y 距离 (m)' }, min: -mx * 0.3, max: mx, grid: { color: '#f0f0f0' } }
          },
          plugins: {
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  const p = ctx.raw;
                  return p._d != null
                    ? '距离: ' + p._d + 'm  角度: ' + p._a + '°  ' + (p._t ? '✓触发' : '✗未触发')
                    : '设备（原点）';
                }
              }
            },
            legend: { display: false }
          }
        }
      });
    }
  }

  function rd(n) { return Math.round(n * 100) / 100; }

  renderTable();
})();
