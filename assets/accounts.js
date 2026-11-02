/* =========================================================
   accounts*.xlsx を読み込んで、ファイルごとに「別の表」で縦に並べる
   ・統合しない
   ・XLSX_FILES の順に上から表示される
   ・中身が0行のシート（空シート）は表示しない
   ========================================================= */
(function () {
  'use strict';

  /* ===== 上に表示したい順に書く ===== */
  var XLSX_FILES = [
    'data/accounts-2.xlsx',   // ← 一番上
    'data/accounts.xlsx'
  ];

  var IS_FILE = (location.protocol === 'file:');

  var AMOUNT_HINTS = ['破壊', '金額', '額', 'destroy', 'amount', 'usd', 'jpy', '円',
                      'balance', '残高', 'value', 'sum', 'total', '損失'];
  var ID_HINTS     = ['id', 'no', 'no.', 'num', '番号', '#', 'index', 'seq', '順'];

  var uid = 0;
  var state = { sources: [], query: '' };

  var $ = function (id) { return document.getElementById(id); };
  var container = $('tables');
  var summary   = $('summary');
  var notice    = $('notice');
  var dz        = $('dropzone');
  var btnSave   = $('btnSaveJs');

  /* ================= 起動 ================= */

  boot();

  function boot() {
    if (IS_FILE) { bootFallback(); return; }

    Promise.all(XLSX_FILES.map(fetchOne)).then(function (results) {
      var ok = results.filter(Boolean);
      if (!ok.length) { bootFallback(); return; }

      ok.forEach(function (r) {
        (r.wb.SheetNames || []).forEach(function (sheet) {
          addSource(r.file, sheet, sheetToAoa(r.wb.Sheets[sheet]));
        });
      });

      finishLoad('読み込みました：' + ok.map(function (r) { return r.file; }).join('、'));
    }).catch(function () { bootFallback(); });
  }

  function fetchOne(file) {
    return fetch(file, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) { throw new Error('HTTP ' + r.status); }
        return r.arrayBuffer().then(function (b) { return { file: file, buf: b }; });
      })
      .then(function (o) {
        if (!window.XLSX) { throw new Error('no-xlsx-lib'); }
        return {
          file: o.file,
          wb: XLSX.read(new Uint8Array(o.buf), { type: 'array', cellDates: true })
        };
      })
      .catch(function () { return null; });
  }

  function bootFallback() {
    if (window.ACCOUNTS_DATA && loadFromData(window.ACCOUNTS_DATA)) { return; }
    showDropRequired();
  }

  function sheetToAoa(ws) {
    return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
  }

  /* ================= ソース ================= */

  // 中身（データ行）があるものだけを返す
  function liveSources() {
    return state.sources.filter(function (s) {
      return s && s.rows && s.rows.length > 0;
    });
  }

  function addSource(file, sheet, aoa) {
    var key = file + '|' + sheet;
    var i = state.sources.findIndex(function (s) { return s.key === key; });

    var src = buildSource(key, file, sheet, aoa);

    /* ★ 空シートは登録しない（既に登録済みなら取り除く） */
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
      for (var i = 0; i < head.length; i++) {
        out.push(r && r[i] != null ? r[i] : '');
      }
      return out;
    }).filter(function (r) {
      return r.some(function (v) { return String(v).trim() !== ''; });
    });

    var src = {
      id: ++uid,
      key: key,
      file: file,
      sheet: sheet,
      aoa: aoa,
      headers: head,
      rows: rows,
      sortCol: -1,
      sortDir: 1,
      amountCol: -1
    };
    src.amountCol = detectAmountCol(src);
    return src;
  }

  function finishLoad(msg) {
    if (!liveSources().length) { showDropRequired(); return; }
    if (btnSave) { btnSave.hidden = false; }
    if (dz) { dz.classList.remove('need'); }
    renderAll();
    if (msg) { setNotice(msg); }
  }

  function loadFromData(payload) {
    if (!payload) { return false; }
    var added = 0;

    if (payload.files) {
      Object.keys(payload.files).forEach(function (file) {
        var sheets = payload.files[file].sheets || {};
        Object.keys(sheets).forEach(function (sheet) {
          addSource(file, sheet, sheets[sheet]); added++;
        });
      });
    }
    if (!added && payload.sheets) {
      Object.keys(payload.sheets).forEach(function (sheet) {
        addSource('data/accounts.xlsx', sheet, payload.sheets[sheet]); added++;
      });
    }
    if (!liveSources().length) { return false; }

    finishLoad('data/accounts.js から読み込みました'
             + (payload.generated ? '（生成 ' + payload.generated + '）' : '') + '。');
    return true;
  }

  function showDropRequired() {
    container.innerHTML = '<p class="muted">'
      + (IS_FILE
          ? 'file:// で開いているため、自動読み込みが使えません。下の枠に xlsx をドロップしてください。'
          : 'xlsx を読み込めませんでした。下の枠にドロップするか、「xlsx を選択」から読み込んでください。')
      + '</p>';
    if (dz) { dz.classList.add('need'); }
    setNotice(IS_FILE
      ? 'ローカルサーバー（python -m http.server など）で開くと自動読み込みが有効になります。' : '');
  }

  function setNotice(text) {
    if (!notice) { return; }
    if (!text) { notice.hidden = true; return; }
    notice.hidden = false;
    notice.textContent = text;
  }

  /* ================= 合計列の判定（既定＝最後の列） ================= */

  function isIdLike(header) {
    var s = String(header).trim().toLowerCase();
    if (s === '') { return false; }
    for (var i = 0; i < ID_HINTS.length; i++) {
      if (s === ID_HINTS[i]) { return true; }
    }
    return false;
  }

  function numericRatio(src, col) {
    if (!src.rows.length) { return 0; }
    var num = 0, tot = 0;
    for (var i = 0; i < src.rows.length; i++) {
      var v = src.rows[i][col];
      if (String(v).trim() === '') { continue; }
      tot++;
      if (toNumber(v) !== null) { num++; }
    }
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
    var s = String(v)
      .replace(/[,\s　]/g, '')
      .replace(/[円¥￥$]/g, '')
      .replace(/(usd|jpy|円)$/i, '');
    if (s === '' || !/^-?\d+(\.\d+)?$/.test(s)) { return null; }
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  function fmt(n) {
    return n.toLocaleString('ja-JP', { maximumFractionDigits: 2 });
  }

  function sumOf(rows, col) {
    if (col < 0) { return null; }
    var total = 0, max = null, cnt = 0;
    rows.forEach(function (r) {
      var n = toNumber(r[col]);
      if (n === null) { return; }
      total += n; cnt++;
      if (max === null || n > max) { max = n; }
    });
    return cnt ? { total: total, max: max, cnt: cnt } : null;
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
    var list = liveSources();          // ★ 空シートは最初から除外
    container.innerHTML = '';

    if (!list.length) { showDropRequired(); renderIndex(); return; }

    list.forEach(function (src) {
      container.appendChild(buildBlock(src));
    });

    /* ★ 念のための後始末：描画後に空ブロックが残っていたらDOMから消す */
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

    /* ---- 見出し ---- */
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

    /* ---- 表 ---- */
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

  var fi = $('fileInput');
  if (fi) {
    fi.addEventListener('change', function () {
      Array.prototype.forEach.call(fi.files, readFile);
    });
  }

  function readFile(file) {
    if (!window.XLSX) {
      setNotice('xlsx ライブラリが読み込めませんでした。CDNがブロックされている可能性があります。');
      return;
    }
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var wb = XLSX.read(new Uint8Array(fr.result), { type: 'array', cellDates: true });
        var name = 'data/' + file.name;
        (wb.SheetNames || []).forEach(function (sheet) {
          addSource(name, sheet, sheetToAoa(wb.Sheets[sheet]));
        });
        finishLoad('読み込みました：' + name);
      } catch (e) {
        setNotice('解析に失敗しました：' + e.message);
      }
    };
    fr.readAsArrayBuffer(file);
  }

  if (dz) {
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); });
    });
    dz.addEventListener('drop', function (e) {
      Array.prototype.forEach.call(e.dataTransfer.files || [], readFile);
    });
    dz.addEventListener('click', function () { if (fi) { fi.click(); } });
  }

  if (btnSave) {
    btnSave.addEventListener('click', function () {
      var payload = {
        generated: new Date().toISOString().slice(0, 19).replace('T', ' '),
        files: {}
      };
      liveSources().forEach(function (s) {
        payload.files[s.file] = payload.files[s.file] || { sheets: {} };
        payload.files[s.file].sheets[s.sheet] = s.aoa;
      });
      var text = '/* 自動生成 ' + payload.generated + ' */\n'
               + 'window.ACCOUNTS_DATA = ' + JSON.stringify(payload) + ';\n';
      download(text, 'accounts.js', 'text/javascript');
    });
  }

  function download(text, name, mime) {
    var blob = new Blob([text], { type: mime + ';charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ---- CSV：全ファイルを file / sheet 列つきで出力 ---- */
  var bc = $('btnCsv');
  if (bc) {
    bc.addEventListener('click', function () {
      var lines = [];
      var wrote = false;
      liveSources().forEach(function (src) {
        var rows = filterRows(src);
        if (!rows.length) { return; }
        lines.push(csvCell(src.file.replace(/^data\//, '') + ' / ' + src.sheet));
        lines.push(['file', 'sheet'].concat(src.headers).map(csvCell).join(','));
        rows.forEach(function (r) {
          lines.push([src.file.replace(/^data\//, ''), src.sheet]
            .concat(r).map(csvCell).join(','));
        });
        lines.push('');
        wrote = true;
      });
      if (!wrote) { return; }
      download('\uFEFF' + lines.join('\r\n'), 'accounts.csv', 'text/csv');
    });
  }

  function csvCell(v) {
    var s = String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
})();