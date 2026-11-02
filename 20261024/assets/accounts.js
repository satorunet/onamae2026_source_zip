/* =========================================================
   PHPが埋め込んだ JSON を描画するだけ
   ・解析はバックエンド（lib/xlsx.php）
   ・ファイルごとに別の表で縦に並べる（統合しない）
   ・中身が0行のシートは出さない
   ========================================================= */
(function () {
  'use strict';

  var AMOUNT_HINTS = ['破壊', '金額', '額', 'destroy', 'amount', 'usd', 'jpy', '円',
                      'balance', '残高', 'value', 'sum', 'total', '損失'];
  var ID_HINTS     = ['id', 'no', 'no.', 'num', '番号', '#', 'index', 'seq', '順'];

  var uid = 0;
  var state = { sources: [], query: '' };

  var $ = function (id) { return document.getElementById(id); };
  var container = $('tables');
  var summary   = $('summary');
  var notice    = $('notice');

  boot();

  function boot() {
    var el = $('accounts-data');
    var payload = null;
    if (el) {
      try { payload = JSON.parse(el.textContent); } catch (e) { payload = null; }
    }
    if (!payload || !payload.files) { showEmpty(); return; }

    Object.keys(payload.files).forEach(function (file) {
      var sheets = (payload.files[file] || {}).sheets || {};
      Object.keys(sheets).forEach(function (sheet) {
        addSource(file, sheet, sheets[sheet]);
      });
    });

    if (!liveSources().length) { showEmpty(); return; }

    if (payload.generated) { setNotice('解析：サーバー側 ／ ' + payload.generated); }
    renderAll();
  }

  function showEmpty() {
    container.innerHTML = '<p class="muted">表示できるデータがありません。</p>';
  }

  function setNotice(t) {
    if (!notice) { return; }
    notice.hidden = !t;
    notice.textContent = t || '';
  }

  /* ================= ソース ================= */

  function liveSources() {
    return state.sources.filter(function (s) { return s && s.rows && s.rows.length > 0; });
  }

  function addSource(file, sheet, aoa) {
    var key = file + '|' + sheet;
    var i = state.sources.findIndex(function (s) { return s.key === key; });

    var src = buildSource(key, file, sheet, aoa);
    if (!src.rows.length) {
      if (i >= 0) { state.sources.splice(i, 1); }
      return null;
    }
    if (i >= 0) { state.sources[i] = src; } else { state.sources.push(src); }
    return src;
  }

  function buildSource(key, file, sheet, aoa) {
    var head = ((aoa && aoa[0]) || []).map(function (v, i) {
      var s = String(v == null ? '' : v).trim();
      return s !== '' ? s : '列' + (i + 1);
    });

    var rows = (aoa || []).slice(1).map(function (r) {
      var out = [];
      for (var i = 0; i < head.length; i++) { out.push(r && r[i] != null ? r[i] : ''); }
      return out;
    }).filter(function (r) {
      return r.some(function (v) { return String(v).trim() !== ''; });
    });

    var src = {
      id: ++uid, key: key, file: file, sheet: sheet,
      headers: head, rows: rows, sortCol: -1, sortDir: 1, amountCol: -1
    };
    src.amountCol = detectAmountCol(src);
    return src;
  }

  /* ================= 合計列（既定＝最後の列） ================= */

  function isIdLike(h) {
    var s = String(h).trim().toLowerCase();
    if (s === '') { return false; }
    return ID_HINTS.indexOf(s) !== -1;
  }

  function numericRatio(src, col) {
    if (!src.rows.length) { return 0; }
    var num = 0, tot = 0;
    src.rows.forEach(function (r) {
      var v = r[col];
      if (String(v).trim() === '') { return; }
      tot++;
      if (toNumber(v) !== null) { num++; }
    });
    return tot ? num / tot : 0;
  }

  function detectAmountCol(src) {
    var n = src.headers.length;
    if (!n) { return -1; }

    var byHint = -1;
    for (var c = 0; c < n; c++) {
      if (isIdLike(src.headers[c])) { continue; }
      var h = src.headers[c].toLowerCase();
      for (var k = 0; k < AMOUNT_HINTS.length; k++) {
        if (h.indexOf(AMOUNT_HINTS[k].toLowerCase()) !== -1) { byHint = c; }
      }
    }
    if (byHint >= 0) { return byHint; }

    for (var c2 = n - 1; c2 >= 0; c2--) {
      if (isIdLike(src.headers[c2])) { continue; }
      if (numericRatio(src, c2) >= 0.5) { return c2; }
    }
    return n - 1;
  }

  /* ================= 数値 ================= */

  function toNumber(v) {
    if (typeof v === 'number' && isFinite(v)) { return v; }
    var s = String(v).replace(/[,\s　]/g, '').replace(/[円¥￥$]/g, '').replace(/(usd|jpy|円)$/i, '');
    if (s === '' || !/^-?\d+(\.\d+)?$/.test(s)) { return null; }
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  function fmt(n) { return n.toLocaleString('ja-JP', { maximumFractionDigits: 2 }); }

  function sumOf(rows, col) {
    if (col < 0) { return null; }
    var total = 0, cnt = 0;
    rows.forEach(function (r) {
      var n = toNumber(r[col]);
      if (n === null) { return; }
      total += n; cnt++;
    });
    return cnt ? { total: total, cnt: cnt } : null;
  }

  function filterRows(src) {
    var q = state.query.trim().toLowerCase();
    var rows = src.rows;
    if (q) {
      rows = rows.filter(function (r) {
        return r.some(function (v) { return String(v).toLowerCase().indexOf(q) !== -1; });
      });
    }
    if (src.sortCol >= 0) {
      var c = src.sortCol, d = src.sortDir;
      rows = rows.slice().sort(function (a, b) {
        var na = toNumber(a[c]), nb = toNumber(b[c]);
        if (na !== null && nb !== null) { return (na - nb) * d; }
        return String(a[c]).localeCompare(String(b[c]), 'ja') * d;
      });
    }
    return rows;
  }

  /* ================= 描画 ================= */

  function renderAll() {
    var list = liveSources();
    container.innerHTML = '';
    if (!list.length) { showEmpty(); renderIndex(); return; }

    list.forEach(function (src) { container.appendChild(buildBlock(src)); });

    Array.prototype.slice.call(container.querySelectorAll('section.src')).forEach(function (sec) {
      var body = sec.querySelector('tbody');
      if (body && body.children.length === 0) { sec.remove(); }
    });

    renderIndex();
  }

  function renderIndex() {
    if (!summary) { return; }
    summary.innerHTML = '';

    var list = liveSources();
    var grand = 0, grandCnt = 0, has = false;

    list.forEach(function (src) {
      var rows = filterRows(src);
      var s = sumOf(rows, src.amountCol);

      var a = document.createElement('a');
      a.href = '#src-' + src.id;
      a.innerHTML = src.file.replace(/^data\//, '') + '： <b>' + fmt(rows.length) + '</b>件'
                  + (s ? ' ／ <b>' + fmt(s.total) + '</b>' : '');
      summary.appendChild(a);

      if (s) { grand += s.total; has = true; }
      grandCnt += rows.length;
    });

    if (list.length > 1) {
      var tot = document.createElement('span');
      tot.className = 'tot';
      tot.innerHTML = '全体： <b>' + fmt(grandCnt) + '</b>件' + (has ? ' ／ <b>' + fmt(grand) + '</b>' : '');
      summary.appendChild(tot);
    }
  }

  function buildBlock(src) {
    var sec = document.createElement('section');
    sec.className = 'src';
    sec.id = 'src-' + src.id;

    var head = document.createElement('div');
    head.className = 'src-head';

    var h = document.createElement('h2');
    h.className = 'src-title';
    h.textContent = src.file.replace(/^data\//, '');
    if (src.sheet) {
      var sp = document.createElement('span');
      sp.className = 'sheet';
      sp.textContent = ' / ' + src.sheet;
      h.appendChild(sp);
    }
    head.appendChild(h);

    var rows = filterRows(src);

    var meta = document.createElement('div');
    meta.className = 'src-meta';

    var cnt = document.createElement('span');
    cnt.innerHTML = '件数： <b>' + fmt(rows.length) + '</b>'
                  + (rows.length !== src.rows.length ? ' / ' + fmt(src.rows.length) : '');
    meta.appendChild(cnt);

    var s = sumOf(rows, src.amountCol);
    if (s) {
      var sum = document.createElement('span');
      sum.innerHTML = '合計： <b>' + fmt(s.total) + '</b>';
      meta.appendChild(sum);
    }

    var pick = document.createElement('label');
    pick.className = 'pick';
    pick.appendChild(document.createTextNode('合計列'));
    var sel = document.createElement('select');
    sel.appendChild(new Option('（合計しない）', '-1'));
    src.headers.forEach(function (hh, i) {
      var o = new Option(hh, String(i));
      if (i === src.amountCol) { o.selected = true; }
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      src.amountCol = parseInt(sel.value, 10);
      renderAll();
    });
    pick.appendChild(sel);
    meta.appendChild(pick);

    head.appendChild(meta);
    sec.appendChild(head);

    var tw = document.createElement('div');
    tw.className = 'table-wrap';
    if (!rows.length) {
      tw.innerHTML = '<p class="muted">検索条件に一致する行がありません。</p>';
    } else {
      tw.appendChild(buildTable(src, rows));
    }
    sec.appendChild(tw);

    return sec;
  }

  function buildTable(src, rows) {
    var t = document.createElement('table');
    t.className = 'data';

    var thead = document.createElement('thead');
    var trh = document.createElement('tr');

    src.headers.forEach(function (h, i) {
      var th = document.createElement('th');
      th.textContent = h;
      if (i === src.amountCol) { th.classList.add('is-amount'); }
      if (i === src.sortCol) {
        var a = document.createElement('span');
        a.className = 'arrow';
        a.textContent = src.sortDir > 0 ? ' ▲' : ' ▼';
        th.appendChild(a);
      }
      th.addEventListener('click', function () {
        if (src.sortCol === i) { src.sortDir *= -1; }
        else { src.sortCol = i; src.sortDir = 1; }
        renderAll();
      });
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    t.appendChild(thead);

    var tbody = document.createElement('tbody');
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      r.forEach(function (v, i) {
        var td = document.createElement('td');
        if (i === src.amountCol) {
          var n = toNumber(v);
          td.className = 'num';
          td.textContent = (n !== null) ? fmt(n) : String(v);
        } else {
          td.textContent = String(v);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    t.appendChild(tbody);
    return t;
  }

  /* ================= 操作 ================= */

  var q = $('q');
  if (q) {
    var timer = null;
    q.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { state.query = q.value; renderAll(); }, 120);
    });
  }

  var bc = $('btnCsv');
  if (bc) {
    bc.addEventListener('click', function () {
      var lines = [], wrote = false;
      liveSources().forEach(function (src) {
        var rows = filterRows(src);
        if (!rows.length) { return; }
        lines.push(csvCell(src.file.replace(/^data\//, '') + ' / ' + src.sheet));
        lines.push(['file', 'sheet'].concat(src.headers).map(csvCell).join(','));
        rows.forEach(function (r) {
          lines.push([src.file.replace(/^data\//, ''), src.sheet].concat(r).map(csvCell).join(','));
        });
        lines.push('');
        wrote = true;
      });
      if (!wrote) { return; }

      var blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'accounts.csv';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
  }

  function csvCell(v) {
    var s = String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
})();