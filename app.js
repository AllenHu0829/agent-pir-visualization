(function () {
  /* ======== DOM ======== */
  var dropZone = document.getElementById('dropZone');
  var fileInput = document.getElementById('fileInput');
  var dataBody = document.getElementById('dataBody');
  var dataInfo = document.getElementById('dataInfo');
  var addRowBtn = document.getElementById('addRowBtn');
  var clearBtn = document.getElementById('clearBtn');
  var placeholder = document.getElementById('placeholder');
  var chartBox = document.getElementById('chartBox');
  var canvas = document.getElementById('pirChart');
  var tooltip = document.getElementById('tooltip');
  var ctx = canvas.getContext('2d');

  /* ======== State ======== */
  var rows = [];
  var chartCfg = null; // cached after draw for hover detection

  /* ======== Colors for trigger levels 0-5 (customizable, persisted) ======== */
  var DEFAULT_COLORS = ['#4A8FE7', '#5CC5EF', '#FFCC02', '#FF8C00', '#FF3B30', '#CC0000'];
  var COLORS = loadColors();
  var legendEl = document.getElementById('legend');

  function loadColors() {
    try {
      var saved = localStorage.getItem('pir_colors');
      if (saved) {
        var arr = JSON.parse(saved);
        if (arr && arr.length === 6) return arr;
      }
    } catch (e) {}
    return DEFAULT_COLORS.slice();
  }

  function saveColors() {
    try { localStorage.setItem('pir_colors', JSON.stringify(COLORS)); } catch (e) {}
  }

  function renderLegend() {
    var html = '';
    for (var c = 0; c <= 5; c++) {
      html +=
        '<span class="lg" title="点击修改颜色">' +
        '<i class="dot" style="background:' + COLORS[c] + '" data-c="' + c + '"></i>' +
        '<input type="color" value="' + COLORS[c] + '" data-c="' + c + '" />' +
        c + '次</span>';
    }
    legendEl.innerHTML = html;
  }

  legendEl.addEventListener('input', function (e) {
    if (e.target.type !== 'color') return;
    var c = parseInt(e.target.getAttribute('data-c'), 10);
    if (isNaN(c) || c < 0 || c > 5) return;
    COLORS[c] = e.target.value;
    e.target.previousElementSibling.style.background = e.target.value;
    saveColors();
    renderTable();
    drawChart();
  });

  renderLegend();

  /* ======== File Upload ======== */
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
    rows.push({ distance: 3, angle: 0, count: 5 });
    renderTable();
    drawChart();
    var inputs = dataBody.querySelectorAll('input[data-field="distance"]');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  clearBtn.addEventListener('click', function () {
    rows = [];
    renderTable();
    drawChart();
  });

  function handleFile(file) {
    var ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'csv') {
      Papa.parse(file, { header: true, skipEmptyLines: true, complete: function (r) { importData(r.data); } });
    } else if (ext === 'xlsx' || ext === 'xls') {
      var reader = new FileReader();
      reader.onload = function (e) {
        var wb = XLSX.read(e.target.result, { type: 'array' });
        importData(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]));
      };
      reader.readAsArrayBuffer(file);
    } else {
      alert('不支持的文件格式');
    }
  }

  /* ======== Field matching ======== */
  var DIST_K = ['距离', 'distance', 'dist', '距离(m)', '距离（m）', 'range'];
  var ANGLE_K = ['角度', 'angle', '角度(°)', '角度（°）', '角度(度)', 'deg'];
  var COUNT_K = ['触发次数', '触发', 'count', 'triggered', 'trigger', '是否触发', 'times', 'result'];

  function matchKey(headers, keys) {
    var i, j;
    for (i = 0; i < keys.length; i++)
      for (j = 0; j < headers.length; j++)
        if (headers[j].trim().toLowerCase() === keys[i].toLowerCase()) return headers[j];
    for (i = 0; i < keys.length; i++)
      for (j = 0; j < headers.length; j++)
        if (headers[j].trim().toLowerCase().indexOf(keys[i].toLowerCase()) !== -1) return headers[j];
    return null;
  }

  function parseCount(v) {
    if (v == null) return 0;
    var s = String(v).trim().toLowerCase();
    var n = parseInt(s, 10);
    if (!isNaN(n)) return Math.max(0, Math.min(5, n));
    if (['是', 'yes', 'true', 'triggered', '触发', 'pass'].indexOf(s) !== -1) return 5;
    return 0;
  }

  function importData(raw) {
    if (!raw || !raw.length) { alert('无有效数据'); return; }
    var h = Object.keys(raw[0]);
    var dk = matchKey(h, DIST_K), ak = matchKey(h, ANGLE_K), ck = matchKey(h, COUNT_K);
    if (!dk || !ak) { alert('无法识别距离或角度字段。\n列名: ' + h.join(', ')); return; }
    rows = [];
    for (var i = 0; i < raw.length; i++) {
      var d = parseFloat(raw[i][dk]), a = parseFloat(raw[i][ak]);
      if (!isNaN(d) && !isNaN(a)) {
        rows.push({ distance: d, angle: a, count: ck ? parseCount(raw[i][ck]) : 5 });
      }
    }
    if (!rows.length) { alert('解析后无有效数据。'); return; }
    renderTable();
    drawChart();
  }

  /* ======== Editable Table ======== */
  function renderTable() {
    dataInfo.textContent = rows.length ? rows.length + ' 条' : '';
    if (!rows.length) {
      dataBody.innerHTML = '<tr class="empty-row"><td colspan="5">暂无数据</td></tr>';
      return;
    }
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var opts = '';
      for (var c = 0; c <= 5; c++) {
        opts += '<option value="' + c + '"' + (r.count === c ? ' selected' : '') +
          ' style="color:' + COLORS[c] + '">' + c + '/5</option>';
      }
      html +=
        '<tr>' +
        '<td style="color:#bbb;font-size:.78rem">' + (i + 1) + '</td>' +
        '<td><input type="number" step="any" value="' + r.distance + '" data-i="' + i + '" data-field="distance"></td>' +
        '<td><input type="number" step="any" value="' + r.angle + '" data-i="' + i + '" data-field="angle"></td>' +
        '<td><select data-i="' + i + '" data-field="count" style="color:' + COLORS[r.count] + ';font-weight:600">' + opts + '</select></td>' +
        '<td><button class="btn-del" data-i="' + i + '">×</button></td>' +
        '</tr>';
    }
    dataBody.innerHTML = html;
  }

  dataBody.addEventListener('input', function (e) {
    var el = e.target, i = parseInt(el.getAttribute('data-i')), f = el.getAttribute('data-field');
    if (isNaN(i) || !f || !rows[i]) return;
    if (f === 'distance' || f === 'angle') rows[i][f] = parseFloat(el.value) || 0;
    drawChart();
  });

  dataBody.addEventListener('change', function (e) {
    var el = e.target, i = parseInt(el.getAttribute('data-i')), f = el.getAttribute('data-field');
    if (isNaN(i) || !f || !rows[i]) return;
    if (f === 'count') {
      rows[i].count = parseInt(el.value, 10) || 0;
      el.style.color = COLORS[rows[i].count];
    }
    drawChart();
  });

  dataBody.addEventListener('click', function (e) {
    if (!e.target.classList || !e.target.classList.contains('btn-del')) return;
    var i = parseInt(e.target.getAttribute('data-i'));
    if (isNaN(i)) return;
    rows.splice(i, 1);
    renderTable();
    drawChart();
  });

  /* ======== Canvas Chart (polar grid) ======== */
  function drawChart() {
    var dpr = window.devicePixelRatio || 1;
    var rect = chartBox.getBoundingClientRect();
    var W = rect.width, H = rect.height;
    if (W < 10 || H < 10) return;

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var valid = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!isNaN(r.distance) && !isNaN(r.angle)) valid.push(r);
    }

    if (!valid.length) {
      placeholder.classList.remove('hidden');
      ctx.clearRect(0, 0, W, H);
      chartCfg = null;
      return;
    }
    placeholder.classList.add('hidden');

    // Auto-compute grid range
    var maxDist = 1;
    var maxAngleDeg = 45;
    for (i = 0; i < valid.length; i++) {
      if (valid[i].distance > maxDist) maxDist = valid[i].distance;
      if (Math.abs(valid[i].angle) > maxAngleDeg) maxAngleDeg = Math.abs(valid[i].angle);
    }
    maxAngleDeg = Math.min(Math.ceil(maxAngleDeg / 5) * 5 + 10, 90);

    var distStep;
    if (maxDist <= 3) distStep = 0.5;
    else if (maxDist <= 8) distStep = 0.5;
    else if (maxDist <= 15) distStep = 1;
    else distStep = 2;
    maxDist = Math.ceil(maxDist / distStep) * distStep + distStep;

    var maxAngleRad = maxAngleDeg * Math.PI / 180;

    // Layout
    var PAD_T = 20, PAD_B = 24, PAD_L = 20, PAD_R = 48;
    var originX = W / 2;
    var originY = H - PAD_B;

    var scaleY = (H - PAD_T - PAD_B) / maxDist;
    var halfW = maxDist * Math.sin(maxAngleRad);
    var scaleX = (W - PAD_L - PAD_R) / (2 * halfW);
    var scale = Math.min(scaleX, scaleY);

    // Save config for hover detection
    chartCfg = { originX: originX, originY: originY, scale: scale, W: W, H: H };

    ctx.clearRect(0, 0, W, H);
    ctx.save();

    // --- Draw distance arcs ---
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = '#d0d0d0';
    ctx.fillStyle = '#999';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (var d = distStep; d <= maxDist; d = Math.round((d + distStep) * 100) / 100) {
      var r = d * scale;
      var sa = -Math.PI / 2 + (-maxAngleRad);
      var ea = -Math.PI / 2 + maxAngleRad;
      ctx.beginPath();
      ctx.arc(originX, originY, r, sa, ea, false);
      ctx.stroke();

      // Distance label on the right edge
      var labelX = originX + r * Math.cos(ea) + 4;
      var labelY = originY + r * Math.sin(ea);
      var labelText = (d % 1 === 0) ? d + 'm' : d.toFixed(1) + 'm';
      ctx.fillText(labelText, labelX, labelY);
    }

    // --- Draw angle lines ---
    var angleStep = 5;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    for (var a = -maxAngleDeg; a <= maxAngleDeg; a += angleStep) {
      var aRad = a * Math.PI / 180;
      var endX = originX + maxDist * scale * Math.sin(aRad);
      var endY = originY - maxDist * scale * Math.cos(aRad);

      // Line style: 0° center line thicker
      if (a === 0) {
        ctx.strokeStyle = '#bbb';
        ctx.lineWidth = 1;
      } else if (a % 10 === 0) {
        ctx.strokeStyle = '#d0d0d0';
        ctx.lineWidth = 0.6;
      } else {
        ctx.strokeStyle = '#e8e8e8';
        ctx.lineWidth = 0.4;
      }

      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Angle label at every 10°
      if (a !== 0 && a % 10 === 0) {
        ctx.fillStyle = '#999';
        ctx.font = '9px sans-serif';
        var lblDist = maxDist * scale + 2;
        var lx = originX + lblDist * Math.sin(aRad);
        var ly = originY - lblDist * Math.cos(aRad);
        ctx.fillText(a + '°', lx, ly);
      }
    }

    // 0° label
    ctx.fillStyle = '#888';
    ctx.font = '9px sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillText('0°', originX, originY - maxDist * scale - 4);

    // Device icon at origin
    ctx.fillStyle = '#3498db';
    ctx.beginPath();
    var ds = 6;
    ctx.moveTo(originX, originY - ds);
    ctx.lineTo(originX + ds, originY + ds * 0.6);
    ctx.lineTo(originX - ds, originY + ds * 0.6);
    ctx.closePath();
    ctx.fill();

    // --- Draw data points ---
    for (i = 0; i < valid.length; i++) {
      var pt = valid[i];
      var ptRad = pt.angle * Math.PI / 180;
      var px = originX + pt.distance * Math.sin(ptRad) * scale;
      var py = originY - pt.distance * Math.cos(ptRad) * scale;
      var clr = COLORS[Math.max(0, Math.min(5, pt.count))];

      ctx.beginPath();
      ctx.arc(px, py, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = clr;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    ctx.restore();
  }

  /* ======== Hover Tooltip ======== */
  canvas.addEventListener('mousemove', function (e) {
    if (!chartCfg || !rows.length) { tooltip.style.display = 'none'; return; }
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;

    var closest = null, minD = 12;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (isNaN(r.distance) || isNaN(r.angle)) continue;
      var rad = r.angle * Math.PI / 180;
      var px = chartCfg.originX + r.distance * Math.sin(rad) * chartCfg.scale;
      var py = chartCfg.originY - r.distance * Math.cos(rad) * chartCfg.scale;
      var dd = Math.sqrt((mx - px) * (mx - px) + (my - py) * (my - py));
      if (dd < minD) { minD = dd; closest = r; }
    }

    if (closest) {
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX + 14) + 'px';
      tooltip.style.top = (e.clientY - 12) + 'px';
      tooltip.innerHTML = '距离 <b>' + closest.distance + 'm</b> &nbsp; 角度 <b>' + closest.angle +
        '°</b> &nbsp; 触发 <b style="color:' + COLORS[closest.count] + '">' + closest.count + '/5</b>';
    } else {
      tooltip.style.display = 'none';
    }
  });

  canvas.addEventListener('mouseleave', function () { tooltip.style.display = 'none'; });

  /* ======== Resize ======== */
  var resizeTimer = null;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawChart, 80);
  }
  if (window.ResizeObserver) {
    new ResizeObserver(onResize).observe(chartBox);
  } else {
    window.addEventListener('resize', onResize);
  }

  /* ======== Export PNG ======== */
  document.getElementById('exportPngBtn').addEventListener('click', function () {
    if (!rows.length) { alert('暂无数据可导出'); return; }

    var dpr = window.devicePixelRatio || 1;
    var w = canvas.width / dpr;
    var h = canvas.height / dpr;

    // Create a temp canvas with white background at export resolution
    var expCanvas = document.createElement('canvas');
    var expScale = 2; // export at 2x for crisp image
    expCanvas.width = w * expScale;
    expCanvas.height = h * expScale;
    var expCtx = expCanvas.getContext('2d');
    expCtx.scale(expScale, expScale);

    // White background
    expCtx.fillStyle = '#ffffff';
    expCtx.fillRect(0, 0, w, h);

    // Draw the current chart onto it (source is HiDPI canvas)
    expCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, w, h);

    // Trigger download
    var link = document.createElement('a');
    link.download = 'PIR_visualization_' + timestamp() + '.png';
    link.href = expCanvas.toDataURL('image/png');
    link.click();
  });

  /* ======== Export Excel ======== */
  document.getElementById('exportExcelBtn').addEventListener('click', function () {
    if (!rows.length) { alert('暂无数据可导出'); return; }

    var data = [['#', '距离(m)', '角度(°)', '触发次数(/5)']];
    for (var i = 0; i < rows.length; i++) {
      data.push([i + 1, rows[i].distance, rows[i].angle, rows[i].count]);
    }

    var ws = XLSX.utils.aoa_to_sheet(data);

    // Column widths
    ws['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 10 }, { wch: 14 }];

    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PIR数据');
    XLSX.writeFile(wb, 'PIR_data_' + timestamp() + '.xlsx');
  });

  function timestamp() {
    var d = new Date();
    return d.getFullYear() +
      ('0' + (d.getMonth() + 1)).slice(-2) +
      ('0' + d.getDate()).slice(-2) + '_' +
      ('0' + d.getHours()).slice(-2) +
      ('0' + d.getMinutes()).slice(-2);
  }

  /* ======== Init ======== */
  renderTable();
  drawChart();
})();
