/* خطاهای شیت مغایرت سفارشات (جدول discrepancy_errors) داخل تب «خطاها»
   دسترسی را خود Supabase (RLS) بر اساس نقش کنترل می‌کند: کارشناس ← خودش، سنتر ← کارشناس‌هایش،
   سرگروه ← سنترهایش، سرپرست ← همه. این‌جا فقط نمایش و گروه‌بندی انجام می‌شود. */
(function () {
  'use strict';
  var TABLE = 'discrepancy_errors';
  var STATUSES = ['در انتظار تخفیف', 'در انتظار کسر از حقوق', 'در انتظار تایید آموزش', 'بررسی مجدد - معلق', 'عدم تایید آموزش', 'تخفیف شد - کسر شد', 'پرداخت شد'];
  var PENDING = ['در انتظار تخفیف', 'در انتظار کسر از حقوق'];
  var PILL = { 'در انتظار تخفیف': 'wait', 'در انتظار کسر از حقوق': 'ded', 'تخفیف شد - کسر شد': 'done', 'پرداخت شد': 'done' };
  var S = { rows: [], hier: { byId: {}, agentCenter: {}, centerLeaders: {}, centerByKey: {}, agentByKey: {} }, sel: new Set(PENDING), q: '', loading: false, error: null, syncedAt: null,
            from: null, to: null, calView: { from: [0, 0], to: [0, 0] }, loaded: false };

  var esc = function (v) { return window.escHtml(v); };
  var num = function (v) { return faDigits((Number(v) || 0).toLocaleString('en-US')); };
  var faSort = function (a, b) { return String(a).localeCompare(String(b), 'fa'); };

  function hostId() {
    var r = currentUserRole;
    return r === 'supervisor' ? 'sup-view-bugs' : r === 'leader' ? 'disc-team-list' : r === 'center' ? 'disc-center-list' : 'disc-agent-list';
  }

  /* ---- تاریخ ردیف: متن شمسی (yyyy/mm/dd) یا ISO/میلادی → [jy, jm, jd] ---- */
  var DISC_TZ_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' });
  function rowJ(r) {
    if (r._dj !== undefined) return r._dj;
    var out = null, v = r.report_date;
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      var s = String(v).trim().replace(/[۰-۹]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(d); });
      var m;
      if (/^\d{4}-\d{2}-\d{2}T/.test(s) && /(Z|[+-]\d{2}:?\d{2})$/.test(s) && !isNaN(new Date(s).getTime())) {
        var g = DISC_TZ_FMT.format(new Date(s)).split('-').map(Number);
        out = gregorianToJalali(g[0], g[1], g[2]);
      } else if ((m = /(\d{4})\s*[-\/.]\s*(\d{1,2})\s*[-\/.]\s*(\d{1,2})/.exec(s))) {
        var y = +m[1], mo = +m[2], d = +m[3];
        out = y < 1700 ? [y, mo, d] : gregorianToJalali(y, mo, d);
      }
    }
    r._dj = out;
    return out;
  }
  function jKey(t) { return t[0] * 10000 + t[1] * 100 + t[2]; }
  function jFmt(t) { return faDigits(t[0] + '/' + pad2(t[1]) + '/' + pad2(t[2])); }
  function rowDateText(r) { var j = rowJ(r); return j ? jFmt(j) : (r.report_date ? toJalaliDisplay(r.report_date) : ''); }

  function calHtml(key) {
    var vy = S.calView[key][0], vm = S.calView[key][1];
    var sel = S[key], today = tehranTodayJalali();
    var len = azkiJalaliMonthLength(vy, vm), offset = azkiWeekdayIndex(vy, vm, 1);
    var yMin = Math.min(today[0] - 4, vy), yMax = Math.max(today[0] + 1, vy), yo = '', y, d;
    for (y = yMin; y <= yMax; y++) yo += '<option value="' + y + '"' + (y === vy ? ' selected' : '') + '>' + faDigits(y) + '</option>';
    var mo = JALALI_MONTHS_FA.map(function (n, i) { return '<option value="' + (i + 1) + '"' + (i + 1 === vm ? ' selected' : '') + '>' + n + '</option>'; }).join('');
    var cells = '';
    for (var i = 0; i < offset; i++) cells += '<span></span>';
    for (d = 1; d <= len; d++) {
      var isSel = sel && sel[0] === vy && sel[1] === vm && sel[2] === d;
      var isToday = today[0] === vy && today[1] === vm && today[2] === d;
      cells += '<button type="button" class="azki-cal-day' + (isSel ? ' sel' : '') + (isToday ? ' today' : '') + '" data-day="' + d + '">' + faDigits(d) + '</button>';
    }
    return '<div class="azki-cal-head">' +
        '<button type="button" class="azki-cal-nav" data-nav="-1" aria-label="ماه قبل">‹</button>' +
        '<select data-role="m" aria-label="ماه">' + mo + '</select><select data-role="y" aria-label="سال">' + yo + '</select>' +
        '<button type="button" class="azki-cal-nav" data-nav="1" aria-label="ماه بعد">›</button></div>' +
      '<div class="azki-cal-grid">' + AZKI_WEEKDAYS.map(function (w) { return '<span class="azki-cal-wd">' + w + '</span>'; }).join('') + cells + '</div>' +
      '<div class="azki-pop-foot"><button type="button" class="sm-btn" data-today="1">امروز</button><button type="button" class="sm-btn" data-close="1">بستن</button></div>';
  }
  function dateFld(key, label) {
    return '<div class="azki-fld disc-date-fld"><span class="azki-fld-label">' + label + '</span>' +
      '<button type="button" class="azki-ctl" data-disc-date="' + key + '"><span data-disc-datetext="' + key + '">' + (S[key] ? jFmt(S[key]) : 'همه') + '</span>' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg></button>' +
      '<div class="azki-pop azki-cal" data-disc-cal="' + key + '" hidden></div></div>';
  }
  function setDate(host, key, t) {
    S[key] = t;
    var el = host.querySelector('[data-disc-datetext="' + key + '"]');
    if (el) el.textContent = t ? jFmt(t) : 'همه';
    // اگر «از» بعد از «تا» شد، دیگری هم‌راستا می‌شود
    if (S.from && S.to && jKey(S.from) > jKey(S.to)) {
      var other = key === 'from' ? 'to' : 'from';
      S[other] = t;
      var o = host.querySelector('[data-disc-datetext="' + other + '"]');
      if (o) o.textContent = jFmt(t);
    }
    render();
  }

  /* ---- منوی چندانتخابی وضعیت: برچسب دکمه و تیک‌ها را با S.sel هماهنگ می‌کند ---- */
  function msSync(host) {
    host.querySelectorAll('[data-ms-opt]').forEach(function (c) { c.checked = S.sel.has(c.value); });
    var lb = host.querySelector('.disc-ms-label'); if (!lb) return;
    var n = S.sel.size, isPend = n === PENDING.length && PENDING.every(function (x) { return S.sel.has(x); });
    lb.textContent = (n === 0 || n === STATUSES.length) ? 'همه وضعیت‌ها'
      : isPend ? 'در انتظار (تخفیف / کسر از حقوق)'
      : n === 1 ? Array.from(S.sel)[0]
      : faDigits(String(n)) + ' وضعیت انتخاب شده';
  }

  function shell(host) {
    if (host.dataset.discInit) return host.querySelector('.disc-body');
    host.dataset.discInit = '1';
    host.innerHTML =
      '<div class="disc-wrap">' +
        '<div class="disc-title">خطای صدور</div>' +
        '<div class="disc-sync"></div>' +
        '<div class="disc-bar">' +
          '<div class="disc-ms">' +
            '<button type="button" class="disc-sel disc-ms-btn" data-disc="ms-toggle" aria-haspopup="true"><span class="disc-ms-label"></span><span class="disc-ms-caret">▾</span></button>' +
            '<div class="disc-ms-pop" hidden>' +
              '<div class="disc-ms-quick">' +
                '<button type="button" data-ms-quick="pending">در انتظار</button>' +
                '<button type="button" data-ms-quick="all">همه</button>' +
                '<button type="button" data-ms-quick="none">پاک کردن</button>' +
              '</div>' +
              STATUSES.map(function (s) { return '<label class="disc-ms-opt"><input type="checkbox" data-ms-opt value="' + esc(s) + '"><span>' + esc(s) + '</span></label>'; }).join('') +
            '</div>' +
          '</div>' +
          '<input class="disc-q" data-disc="q" type="search" placeholder="جستجو: کارشناس / شماره سفارش / توضیحات" autocomplete="off">' +
          '<button class="disc-refresh disc-icon-btn" data-disc="refresh" type="button" title="بروزرسانی" aria-label="بروزرسانی">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="disc-bar disc-daterow">' +
          dateFld('from', 'از تاریخ') + dateFld('to', 'تا تاریخ') +
          '<button class="disc-refresh disc-clear-date disc-icon-btn disc-trash" data-disc="clear-date" type="button" title="حذف فیلتر تاریخ" aria-label="حذف فیلتر تاریخ">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>' +
          '</button>' +
          '<span class="disc-range-note"></span>' +
        '</div>' +
        '<div class="disc-body"></div>' +
      '</div>';
    host.addEventListener('change', function (e) {
      if (e.target.matches('[data-ms-opt]')) {
        if (e.target.checked) S.sel.add(e.target.value); else S.sel.delete(e.target.value);
        msSync(host); render();
      }
    });
    host.addEventListener('click', function (e) {
      var tg = e.target.closest('[data-disc="ms-toggle"]');
      var pop = host.querySelector('.disc-ms-pop');
      if (tg) { var open = pop.hidden; azkiClosePops(); pop.hidden = !open; return; }
      var q = e.target.closest('[data-ms-quick]');
      if (q) {
        var k = q.getAttribute('data-ms-quick');
        S.sel = new Set(k === 'pending' ? PENDING : k === 'all' ? STATUSES : []);
        msSync(host); render();
      }
    });
    if (!window.__discMsOutside) {
      window.__discMsOutside = true;
      document.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('.disc-ms')) return;
        document.querySelectorAll('.disc-ms-pop').forEach(function (p) { p.hidden = true; });
      });
    }
    msSync(host);
    host.addEventListener('input', function (e) {
      if (e.target.matches('[data-disc="q"]')) { S.q = e.target.value.trim().toLowerCase(); render(); }
    });
    // ---- انتخاب بازه‌ی تاریخ (تقویم شمسی مثل بقیه‌ی تب‌ها) ----
    host.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-disc-date]');
      if (btn) {
        var key = btn.getAttribute('data-disc-date');
        var pop = host.querySelector('[data-disc-cal="' + key + '"]');
        var willOpen = pop.hidden;
        azkiClosePops();
        if (!willOpen) { pop.hidden = true; return; }
        var cur = S[key] || tehranTodayJalali();
        S.calView[key] = [cur[0], cur[1]];
        pop.innerHTML = calHtml(key);
        pop.hidden = false;
        azkiPlacePop(pop);
        return;
      }
      if (e.target.closest('[data-disc="clear-date"]')) {
        S.from = null; S.to = null;
        ['from', 'to'].forEach(function (k) { var el = host.querySelector('[data-disc-datetext="' + k + '"]'); if (el) el.textContent = 'همه'; });
        render();
        return;
      }
      var pop2 = e.target.closest('[data-disc-cal]');
      if (!pop2) return;
      var k2 = pop2.getAttribute('data-disc-cal');
      var nav = e.target.closest('[data-nav]'), day = e.target.closest('[data-day]');
      if (nav) {
        var vy = S.calView[k2][0], vm = S.calView[k2][1] + parseInt(nav.getAttribute('data-nav'), 10);
        if (vm < 1) { vm = 12; vy--; } else if (vm > 12) { vm = 1; vy++; }
        S.calView[k2] = [vy, vm];
        pop2.innerHTML = calHtml(k2);
      } else if (day) {
        pop2.hidden = true;
        setDate(host, k2, [S.calView[k2][0], S.calView[k2][1], parseInt(day.getAttribute('data-day'), 10)]);
      } else if (e.target.closest('[data-today]')) {
        pop2.hidden = true;
        setDate(host, k2, tehranTodayJalali());
      } else if (e.target.closest('[data-close]')) {
        pop2.hidden = true;
      }
    });
    host.addEventListener('change', function (e) {
      var role = e.target.getAttribute && e.target.getAttribute('data-role');
      var pop = e.target.closest && e.target.closest('[data-disc-cal]');
      if (!role || !pop) return;
      var k = pop.getAttribute('data-disc-cal'), v = parseInt(e.target.value, 10);
      if (role === 'm') S.calView[k][1] = v; else S.calView[k][0] = v;
      pop.innerHTML = calHtml(k);
    });
    return host.querySelector('.disc-body');
  }

  function agentName(r) {
    var p = S.hier.byId[effAgentId(r)];
    if (p) return p.full_name || p.backoffice_id || '—';
    var iu = String(r.issuer_user || ''), i = iu.indexOf('|');
    return (i >= 0 ? iu.slice(i + 1).trim() : iu.trim()) || '—';
  }
  function passes(r) {
    var st = (r.status || '').trim();
    if (S.sel.size && !S.sel.has(st)) return false;     // هیچ تیکی = همه وضعیت‌ها
    if (S.from || S.to) {
      var j = rowJ(r);
      if (!j) return false;               // ردیف بدون تاریخ، وقتی بازه فعال است نمایش داده نمی‌شود
      var k = jKey(j);
      if (S.from && k < jKey(S.from)) return false;
      if (S.to && k > jKey(S.to)) return false;
    }
    if (S.q) {
      var hay = [agentName(r), r.issuer_user, r.order_no, r.description, r.summary].join(' ').toLowerCase();
      if (hay.indexOf(S.q) < 0) return false;
    }
    return true;
  }
  function sumAmt(l) { return l.reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0); }
  function groupBy(list, fn) {
    var m = new Map();
    list.forEach(function (r) { var k = fn(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
    return m;
  }

  function fmtCenter(n) { return (typeof fmtCenterName === 'function') ? fmtCenterName(n) : n; }

  /* ---- شناسایی کارشناسِ ردیف: اول agent_id، اگر خالی بود از روی نام داخل «کاربر صدور» ---- */
  function effAgentId(r) {
    if (r.agent_id) return r.agent_id;
    if (r._aid !== undefined) return r._aid;
    var out = null, map = S.hier.agentByKey || {}, iu = String(r.issuer_user == null ? '' : r.issuer_user);
    var i = iu.indexOf('|');
    var cands = [];
    if (i >= 0) cands.push(compactKey(iu.slice(i + 1)));
    cands.push(compactKey(iu));
    for (var c = 0; c < cands.length && !out; c++) { if (cands[c] && map[cands[c]]) out = map[cands[c]]; }
    if (!out) {
      for (var c2 = 0; c2 < cands.length && !out; c2++) {
        var k = cands[c2]; if (!k || k.length < 4) continue;
        var hits = Object.keys(map).filter(function (m) { return m.length >= 4 && (m.indexOf(k) >= 0 || k.indexOf(m) >= 0); });
        var ids = hits.map(function (h) { return map[h]; }).filter(function (v, ix, arr) { return arr.indexOf(v) === ix; });
        if (ids.length === 1) out = ids[0];
      }
    }
    r._aid = out;
    return out;
  }

  /* مبلغ و تاریخ: هر ردیف خطا مثل ردیف روزِ تب «تعداد صدور» */
  function itemHtml(r) {
    var st = (r.status || '').trim();
    var showDesc = r.description && (currentUserRole === 'leader' || currentUserRole === 'supervisor');
    return '<div class="team-day-row disc-row">' +
      '<span class="team-day-date">' + (rowDateText(r) ? esc(rowDateText(r)) : '<span style="opacity:.6">بدون تاریخ</span>') + '</span>' +
      '<span class="disc-row-mid">' + (r.order_no ? 'سفارش: ' + esc(r.order_no) : '') + '</span>' +
      '<span class="disc-row-side">' +
        '<span class="disc-pill ' + (PILL[st] || '') + '">' + esc(st || '—') + '</span>' +
        (r.salary_deduction ? '<span class="disc-chip">کسر از حقوق: ' + esc(r.salary_deduction) + '</span>' : '') +
        '<span class="team-day-badge disc-amt">' + num(r.amount) + ' ریال</span>' +
      '</span>' +
      (showDesc ? '<div class="bug-desc disc-desc">' + esc(r.description) + '</div>' : '') +
    '</div>';
  }

  function chev(cls) {
    return '<svg class="' + cls + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  }
  function sortRows(rows) {
    return rows.slice().sort(function (a, b) { var ja = rowJ(a), jb = rowJ(b); return (jb ? jKey(jb) : 0) - (ja ? jKey(ja) : 0); });
  }
  /* سطح کارشناس (همان .team-item تب تعداد صدور) */
  function agentBlock(name, rows, open) {
    return '<div class="team-item' + (open ? ' open' : '') + '">' +
      '<button class="team-header" type="button"><div class="team-name-wrap">' + chev('team-chevron') +
        '<span class="team-name">' + esc(name) + '</span></div>' +
        '<div class="team-right"><span class="team-bug-total">' + num(rows.length) + ' خطا</span>' +
        '<span class="team-total disc-sum">' + num(sumAmt(rows)) + ' ریال</span></div></button>' +
      '<div class="team-details"><div class="team-details-inner">' + sortRows(rows).map(itemHtml).join('') + '</div></div></div>';
  }
  function agentBlocks(list, openAll) {
    var g = groupBy(list, function (r) { return effAgentId(r) || ('u:' + (r.issuer_user || '')); }), arr = [];
    g.forEach(function (rows) { arr.push({ name: agentName(rows[0]), rows: rows }); });
    arr.sort(function (a, b) { return faSort(a.name, b.name); });
    return arr.map(function (x) { return agentBlock(x.name, x.rows, openAll || arr.length === 1); }).join('');
  }

  /* کلید فشرده‌ی نام سنتر: بدون «مرکز صدور»، بدون هر نوع فاصله/نیم‌فاصله، ي/ك یکسان → «مرکز صدور  کیانی» = «کیانی» = «کیـانی» */
  function compactKey(name) { return normCenterKey(name).replace(/[\s\u200c\u200b\u200e\u200f\u00a0]+/g, ''); }
  function issuerCenterKey(issuer) {
    var s = String(issuer == null ? '' : issuer);
    var i = s.indexOf('|');
    return compactKey(i >= 0 ? s.slice(0, i) : s);
  }
  /* سنتر ردیف بر اساس نام «مرکز صدور X | کارشناس» داخل کاربر صدور؛ اول تطبیق دقیق، بعد (فقط اگر یکتا بود) شامل‌بودن */
  function centerByIssuer(issuer) {
    var key = issuerCenterKey(issuer);
    if (!key) return null;
    var map = S.hier.centerByKey || {};
    if (map[key]) return map[key];
    var hits = Object.keys(map).filter(function (k) { return k.length >= 3 && (k.indexOf(key) >= 0 || key.indexOf(k) >= 0); });
    return hits.length === 1 ? map[hits[0]] : null;
  }
  function centerOf(r) {
    var aid = effAgentId(r);
    var cid = aid && S.hier.agentCenter[aid];
    if (!cid) cid = centerByIssuer(r.issuer_user);
    var c = cid && S.hier.byId[cid];
    return { id: cid || null, name: c ? (c.full_name || '—') : 'بدون سنتر' };
  }

  /* سنتر ← کارشناس ← خطاها (سرگروه و سرپرست؛ سرپرست همه‌ی سنترها را می‌بیند) */
  function renderCenters(list) {
    var g = groupBy(list, function (r) { return centerOf(r).name; }), arr = [];
    g.forEach(function (rows, name) { arr.push({ name: name, rows: rows }); });
    arr.sort(function (a, b) { return faSort(a.name, b.name); });
    return arr.map(function (c) {
      return '<div class="leader-item' + (arr.length === 1 ? ' open' : '') + '">' +
        '<button class="leader-header" type="button"><div class="leader-name-wrap">' + chev('leader-chevron') +
          '<span class="leader-name">' + esc(fmtCenter(c.name)) + '</span></div>' +
          '<div class="leader-right"><span class="leader-count disc-sum">' + num(sumAmt(c.rows)) + ' ریال</span>' +
          '<span class="leader-total">' + num(c.rows.length) + ' خطا</span></div></button>' +
        '<div class="leader-details"><div class="leader-details-inner">' + agentBlocks(c.rows, false) + '</div></div></div>';
    }).join('');
  }
  function renderLeader(list) { return renderCenters(list); }
  function renderSup(list) { return renderCenters(list); }
  /* سنتر: کارشناس‌های خودش */
  function renderCenter(list) { return agentBlocks(list, false); }
  /* کارشناس: فقط خطاهای خودش */
  function renderAgent(list) { return '<div class="disc-agent-rows">' + sortRows(list).map(itemHtml).join('') + '</div>'; }

  function errHtml(e) {
    var msg = (e && e.message) || String(e || '');
    var missing = /discrepancy_errors|42P01|does not exist|schema cache/i.test(msg);
    return '<div class="empty-state">' + (missing
      ? 'جدول خطاهای مغایرت هنوز ساخته نشده (فایل discrepancy_errors.sql را در Supabase اجرا کنید).'
      : 'خطا در دریافت اطلاعات: ' + esc(msg)) + '</div>';
  }

  function render() {
    var host = document.getElementById(hostId());
    if (!host) return;
    var body = shell(host);
    var syncEl = host.querySelector('.disc-sync');
    if (syncEl) syncEl.textContent = S.syncedAt ? ('آخرین همگام‌سازی شیت: ' + relativeTimeFa(S.syncedAt)) : '';
    if (S.loading && !S.rows.length) { body.innerHTML = '<div class="loading-state">در حال بارگذاری...</div>'; return; }
    if (S.error) { body.innerHTML = errHtml(S.error); return; }
    var list = S.rows.filter(passes);
    var noteEl = host.querySelector('.disc-range-note');
    if (noteEl) {
      var noDate = S.rows.filter(function (x) { return !rowJ(x); }).length;
      noteEl.textContent = (S.from || S.to)
        ? 'بازه: ' + (S.from ? jFmt(S.from) : 'ابتدا') + ' تا ' + (S.to ? jFmt(S.to) : 'امروز') + ' — ' + num(list.length) + ' مورد' + (noDate ? ' (' + num(noDate) + ' مورد بدون تاریخ نمایش داده نمی‌شود)' : '')
        : '';
    }
    if (!list.length) { body.innerHTML = '<div class="empty-state">خطایی با این مشخصات پیدا نشد</div>'; return; }
    var r = currentUserRole;
    body.innerHTML = '<div class="list-card disc-card">' + (r === 'supervisor' ? renderSup(list)
      : r === 'leader' ? renderLeader(list)
      : r === 'center' ? renderCenter(list)
      : renderAgent(list)) + '</div>';
    if (typeof bindExpandableToggles === 'function') bindExpandableToggles(body);
    if (window.refreshGlassReveals) window.refreshGlassReveals(body);
  }

  async function loadHier() {
    var h = { byId: {}, agentCenter: {}, centerLeaders: {}, centerByKey: {}, agentByKey: {} };
    var res = await Promise.all([
      fetchAllRows(function (f, t) { return supabaseClient.from('profiles').select('id, full_name, backoffice_id, role, status').in('role', ['agent', 'center', 'leader']).range(f, t); }),
      fetchAllRows(function (f, t) { return supabaseClient.from('center_agents').select('center_id, agent_id').range(f, t); }),
      fetchAllRows(function (f, t) { return supabaseClient.from('leader_centers').select('leader_id, center_id').range(f, t); })
    ]);
    h.centerByKey = {};
    (res[0].data || []).forEach(function (p) {
      h.byId[p.id] = p;
      if (p.role === 'center') { var k = compactKey(p.full_name); if (k && !h.centerByKey[k]) h.centerByKey[k] = p.id; }
      if (p.role === 'agent') {
        [p.full_name, p.backoffice_id].forEach(function (nm) {
          var ak = compactKey(nm); if (ak && !h.agentByKey[ak]) h.agentByKey[ak] = p.id;
        });
      }
    });
    (res[1].data || []).forEach(function (l) { if (!h.agentCenter[l.agent_id]) h.agentCenter[l.agent_id] = l.center_id; });
    (res[2].data || []).forEach(function (l) { (h.centerLeaders[l.center_id] = h.centerLeaders[l.center_id] || []).push(l.leader_id); });
    // اگر کارشناس چند سنتر داره، سنتی که این کاربر بهش دسترسی داره اولویت داره (RLS خودش فیلتر می‌کنه)
    return h;
  }

  async function load() {
    if (S.loading) return;
    S.loading = true; S.error = null;
    render();
    try {
      var r = await fetchAllRows(function (f, t) {
        return supabaseClient.from(TABLE).select('*').order('sheet_id', { ascending: false }).range(f, t);
      });
      if (r.error) throw r.error;
      S.rows = r.data || [];
      S.syncedAt = S.rows.reduce(function (m, x) { return (x.synced_at && (!m || x.synced_at > m)) ? x.synced_at : m; }, null);
      if (currentUserRole === 'supervisor' || currentUserRole === 'leader' || currentUserRole === 'center') {
        try { S.hier = await loadHier(); } catch (e) { console.warn('[disc] hierarchy', e); }
      }
      S.loaded = true;
    } catch (e) { S.error = e; S.rows = []; }
    S.loading = false;
    render();
    refreshBadges();
  }

  /* ---- عدد «خطا» کارت‌های کشویی تب صدور: تعداد خطاهای هر کارشناس (بدون فیلتر وضعیت/تاریخ تب خطا) ---- */
  var countCache = null;
  function counts() {
    if (countCache) return countCache;
    var m = {};
    S.rows.forEach(function (r) { var id = effAgentId(r); if (id) m[id] = (m[id] || 0) + 1; });
    return (countCache = m);
  }
  function refreshBadges() {
    countCache = null;
    if (!S.loaded) return;
    var c = counts();
    document.querySelectorAll('[data-disc-agent]').forEach(function (el) {
      el.textContent = num(c[el.getAttribute('data-disc-agent')] || 0) + ' خطا';
    });
  }
  function ensure() { if (S.loaded) refreshBadges(); else if (!S.loading) load(); }
  function countFor(id) { return S.loaded ? (counts()[id] || 0) : 0; }

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-disc="refresh"]')) { load(); return; }
    if (e.target.closest('[data-tab="bugs"],[data-team-tab="team-bugs"],[data-center-tab="center-bugs"],[data-sup-tab="bugs"]')) load();
  });
  window.DISC = { load: load, ensure: ensure, countFor: countFor, refreshBadges: refreshBadges };
})();
