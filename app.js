(function () {
  var dropZone = document.getElementById('dropZone');
  var fileInput = document.getElementById('fileInput');
  var dataBody = document.getElementById('dataBody');
  var dataInfo = document.getElementById('dataInfo');
  var addRowBtn = document.getElementById('addRowBtn');
  var clearBtn = document.getElementById('clearBtn');
  var placeholder = document.getElementById('placeholder');
  var chartBox = document.getElementById('chartBox');

  var pirChart = null;
  var rows = [];

  dropZone.addEventListener('dragover', function (e) { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('dragover'); });
  dropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', function () {
    if (fileInput.files.length) handleFile(fileInput.files[0]);
  });

  addRowBtn.addEventListener('click', function () {
    rows.push({ distance: 0, angle: 0, triggered: true });
    renderTable();
    syncChart();
    var inputs = dataBody.querySelectorAll('input[data-field="distance"]');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  clearBtn.addEventListener('click', function () {
    rows = [];
    renderTable();
    syncChart();
  });

  function handleFile(file) {
    var ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function (r) { importData(r.data); }
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      var reader = new FileReader();
      reader.onload = function (e) {
        var wb = XLSX.read(e.target.result, { type: 'array' });
        var sheet = wb.Sheets[wb.SheetNames[0]];
        importData(XLSX.utils.sheet_to_json(sheet));
      };
      reader.readAsArrayBuffer(file);
    } else {
      alert('不支持的文件格式，请上传 CSV 或 Excel 文件。');
    }
  }

  var DIST = ['距离', 'distance', 'dist', '距离(m)', '距离（m）', 'range'];
  var ANGLE = ['角度', 'angle', '角度(°)', '角度（°）', '角度(度)', 'deg'];
  var TRIG = ['触发', 'triggered', 'trigger', '是否触发', 'status', 'result'];

  function matchKey(headers, keys) {
    var i, j, h;
    for (i = 0; i < keys.length; i++) {
      for (j = 0; j < headers.length; j++) {
        if (headers[j].trim().toLowerCase() === keys[i].toLowerCase()) return headers[j];
      }
    }
    for (i = 0; i < keys.length; i++) {
      for (j = 0; j < headers.length; j++) {
        if (headers[j].trim().toLowerCase().indexOf(keys[i].toLowerCase()) !== -1) return headers[j];
      }
    }
    return null;
  }

  function isTrig(v) {
    if (v == null) return false;
    var s = String(v).trim().toLowerCase();
    return ['是', 'yes', 'true', '1', 'triggered', '触发', 'pass'].indexOf(s) !== -1;
  }

  function importData(raw) {
    if (!raw || !raw.length) { alert('无有效数据'); return; }
    var h = Object.keys(raw[0]);
    var dk = matchKey(h, DIST), ak = matchKey(h, ANGLE), tk = matchKey(h, TRIG);
    if (!dk || !ak) {
      alert('无法识别距离或角度字段。\n列名: ' + h.join(', '));
      return;
    }
    rows = [];
    for (var i = 0; i < raw.length; i++) {
      var d = parseFloat(raw[i][dk]), a = parseFloat(raw[i][ak]);
      if (!isNaN(d) && !isNaN(a)) {
        rows.push({ distance: d, angle: a, triggered: tk ? isTrig(raw[i][tk]) : true });
      }
    }
    if (!rows.length) { alert('解析后无有效数据。'); return; }
    renderTable();
    syncChart();
  }

  function renderTable() {
    dataInfo.textContent = rows.length ? rows.length + ' 条' : '';
    if (!rows.length) {
      dataBody.innerHTML = '<tr class="empty-row"><td colspan="5">暂无数据</td></tr>';
      return;
    }
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var cls = r.triggered ? 'row-yes' : 'row-no';
      html +=
        '<tr class="' + cls + '">' +
        '<td style="color:#bbb;font-size:.78rem">' + (i + 1) + '</td>' +
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

  dataBody.addEventListener('input', function (e) {
    var el = e.target, i = parseInt(el.getAttribute('data-i')), f = el.getAttribute('data-field');
    if (isNaN(i) || !f || !rows[i]) return;
    if (f === 'distance' || f === 'angle') {
      rows[i][f] = parseFloat(el.value) || 0;
    }
    syncChart();
  });

  dataBody.addEventListener('change', function (e) {
    var el = e.target, i = parseInt(el.getAttribute('data-i')), f = el.getAttribute('data-field');
    if (isNaN(i) || !f || !rows[i]) return;
    if (f === 'triggered') {
      rows[i].triggered = el.value === '1';
      var tr = el.closest('tr');
      if (tr) tr.className = rows[i].triggered ? 'row-yes' : 'row-no';
    }
    syncChart();
  });

  dataBody.addEventListener('click', function (e) {
    var btn = e.target;
    if (!btn.classList || !btn.classList.contains('btn-del')) return;
    var i = parseInt(btn.getAttribute('data-i'));
    if (isNaN(i)) return;
    rows.splice(i, 1);
    renderTable();
    syncChart();
  });

  function syncChart() {
    var valid = [];
    for (var i = 0; i < rows.length; i++) {
      if (!isNaN(rows[i].distance) && !isNaN(rows[i].angle)) valid.push(rows[i]);
    }

    if (!valid.length) {
      if (pirChart) { pirChart.destroy(); pirChart = null; }
      placeholder.classList.remove('hidden');
      return;
    }
    placeholder.classList.add('hidden');

    var yes = [], no = [], maxD = 1;
    for (var j = 0; j < valid.length; j++) {
      var r = valid[j];
      var rad = r.angle * Math.PI / 180;
      var pt = {
        x: rd(r.distance * Math.sin(rad)),
        y: rd(r.distance * Math.cos(rad)),
        _d: r.distance,
        _a: r.angle,
        _t: r.triggered
      };
      if (r.triggered) yes.push(pt); else no.push(pt);
      if (r.distance > maxD) maxD = r.distance;
    }
    maxD = maxD * 1.25;

    var datasets = [
      { label: '设备', data: [{ x: 0, y: 0 }], backgroundColor: '#3498db', pointRadius: 10, pointStyle: 'rectRot' },
      { label: '触发', data: yes, backgroundColor: 'rgba(46,204,113,0.85)', pointRadius: 7, pointHoverRadius: 10 },
      { label: '未触发', data: no, backgroundColor: 'rgba(231,76,60,0.85)', pointRadius: 7, pointHoverRadius: 10 }
    ];

    if (pirChart) {
      pirChart.data.datasets = datasets;
      pirChart.options.scales.x.min = -maxD;
      pirChart.options.scales.x.max = maxD;
      pirChart.options.scales.y.min = -maxD * 0.3;
      pirChart.options.scales.y.max = maxD;
      pirChart.update('none');
    } else {
      var canvas = document.getElementById('pirChart');
      pirChart = new Chart(canvas, {
        type: 'scatter',
        data: { datasets: datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          scales: {
            x: { title: { display: true, text: 'X 距离 (m)' }, min: -maxD, max: maxD, grid: { color: '#f0f0f0' } },
            y: { title: { display: true, text: 'Y 距离 (m)' }, min: -maxD * 0.3, max: maxD, grid: { color: '#f0f0f0' } }
          },
          plugins: {
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  var p = ctx.raw;
                  if (p._d != null) return '距离: ' + p._d + 'm  角度: ' + p._a + '°  ' + (p._t ? '✓触发' : '✗未触发');
                  return '设备（原点）';
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
