(function () {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const previewSection = document.getElementById('previewSection');
  const previewTable = document.getElementById('previewTable');
  const dataInfo = document.getElementById('dataInfo');
  const chartSection = document.getElementById('chartSection');

  let pirChart = null;

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

  // --- File Handling ---
  function handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => processData(results.data)
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet);
        processData(data);
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

  // --- Data Processing ---
  function processData(rows) {
    if (!rows || rows.length === 0) {
      alert('无有效数据');
      return;
    }

    const headers = Object.keys(rows[0]);
    const distKey = matchField(headers, DISTANCE_KEYS);
    const angleKey = matchField(headers, ANGLE_KEYS);
    const trigKey = matchField(headers, TRIGGER_KEYS);

    if (!distKey || !angleKey) {
      alert('无法识别距离或角度字段。请确保表格包含距离和角度列。\n当前列名: ' + headers.join(', '));
      return;
    }

    const points = rows.map((r) => {
      const dist = parseFloat(r[distKey]);
      const angleDeg = parseFloat(r[angleKey]);
      if (isNaN(dist) || isNaN(angleDeg)) return null;
      const angleRad = (angleDeg * Math.PI) / 180;
      return {
        distance: dist,
        angle: angleDeg,
        triggered: trigKey ? isTrigger(r[trigKey]) : true,
        x: dist * Math.sin(angleRad),
        y: dist * Math.cos(angleRad)
      };
    }).filter(Boolean);

    if (points.length === 0) {
      alert('解析后无有效打点数据。');
      return;
    }

    renderPreview(headers, rows, distKey, angleKey, trigKey);
    renderChart(points);
  }

  // --- Table Preview ---
  function renderPreview(headers, rows, distKey, angleKey, trigKey) {
    const showHeaders = [distKey, angleKey, trigKey].filter(Boolean);
    let html = '<thead><tr>' + showHeaders.map(h => '<th>' + escHtml(h) + '</th>').join('') + '</tr></thead><tbody>';
    const maxRows = Math.min(rows.length, 20);
    for (let i = 0; i < maxRows; i++) {
      html += '<tr>' + showHeaders.map(h => '<td>' + escHtml(String(rows[i][h] ?? '')) + '</td>').join('') + '</tr>';
    }
    if (rows.length > 20) html += '<tr><td colspan="' + showHeaders.length + '">... 共 ' + rows.length + ' 行</td></tr>';
    html += '</tbody>';
    previewTable.innerHTML = html;
    dataInfo.textContent = '共 ' + rows.length + ' 条数据，字段匹配: 距离=' + distKey + ', 角度=' + angleKey + (trigKey ? ', 触发=' + trigKey : '');
    previewSection.hidden = false;
  }

  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // --- Chart ---
  function renderChart(points) {
    chartSection.hidden = false;

    const triggered = points.filter(p => p.triggered);
    const notTriggered = points.filter(p => !p.triggered);

    const maxDist = Math.max(...points.map(p => p.distance)) * 1.2;

    if (pirChart) pirChart.destroy();

    const ctx = document.getElementById('pirChart').getContext('2d');
    pirChart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: '设备（原点）',
            data: [{ x: 0, y: 0 }],
            backgroundColor: '#3498db',
            pointRadius: 10,
            pointStyle: 'rectRot'
          },
          {
            label: '触发',
            data: triggered.map(p => ({ x: round2(p.x), y: round2(p.y), _dist: p.distance, _angle: p.angle, _trig: true })),
            backgroundColor: '#2ecc71',
            pointRadius: 7
          },
          {
            label: '未触发',
            data: notTriggered.map(p => ({ x: round2(p.x), y: round2(p.y), _dist: p.distance, _angle: p.angle, _trig: false })),
            backgroundColor: '#e74c3c',
            pointRadius: 7
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          x: {
            title: { display: true, text: 'X 距离 (m)' },
            min: -maxDist,
            max: maxDist,
            grid: { color: '#eee' }
          },
          y: {
            title: { display: true, text: 'Y 距离 (m)' },
            min: -maxDist * 0.3,
            max: maxDist,
            grid: { color: '#eee' }
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: function (ctx) {
                const p = ctx.raw;
                if (p._dist !== undefined) {
                  return '距离: ' + p._dist + 'm, 角度: ' + p._angle + '°, ' + (p._trig ? '触发' : '未触发');
                }
                return '设备（原点）';
              }
            }
          },
          legend: { display: false }
        }
      }
    });
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }
})();
