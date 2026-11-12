// فقط کلید F12 و میانبرهای devtools (Ctrl/Cmd + Shift + I/J/C) بسته‌ان
document.addEventListener('keydown', e => {
  const k = e.key ? e.key.toLowerCase() : '';
  if (e.key === 'F12') { e.preventDefault(); return; }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c'].includes(k)) { e.preventDefault(); }
});

const SUPABASE_URL = "https://paokcjakxxjqtulibegi.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Us07X7VRGQ4q3jSIPzeT0g_8-qkLTeO";

const USERNAME_EMAIL_DOMAIN = "bimename.com";

const TABLE_TARGETS = "daily_targets";
const TABLE_BUGS = "bug_reports";
function isMissingObjError(e) {
  return !!e && (e.code === 'PGRST205' || e.code === 'PGRST202' || e.status === 404 || /schema cache|does not exist|could not find/i.test(e.message || ''));
}
// دریافت خطاهای نیروها؛ اگه جدول bug_reports تو سوپابیس نباشه، همون بار اول متوقف می‌شه و دیگه درخواستی نمی‌ره
// پرچم «جدول bug_reports وجود نداره» تا ۱۲ ساعت تو مرورگر می‌مونه تا هر بار باز کردن پنل یه درخواست ۴۰۴ نره
try { const t = +localStorage.getItem('azki_bugs_off'); if (t && Date.now() - t < 12 * 3600 * 1000) window.__bugsDisabled = true; } catch (e) { }
function markBugsOff() { window.__bugsDisabled = true; try { localStorage.setItem('azki_bugs_off', String(Date.now())); } catch (e) { } }
async function fetchBugRowsSafe(builder) {
  if (window.__bugsDisabled) return { data: [], error: null };
  const r = await fetchAllRows(builder);
  if (r && r.error && isMissingObjError(r.error)) { markBugsOff(); return { data: [], error: null }; }
  return r;
}
const TABLE_PROFILES = "profiles";
const TABLE_TEAM_ASSIGNMENTS = "team_assignments";
const TABLE_META = "app_meta";
const TABLE_AZKI_PERIOD = "azki_center_period_report";
const TABLE_AZKI_BREAKDOWN = "azki_center_breakdown_report";
const TABLE_AZKI_SHIFT = "azki_center_shift_report";
const AZKI_COMPANIES = ["آرمان", "آسیا", "البرز", "ایران", "پارسیان", "پردیس", "تجارت نو", "تعاون", "حکمت", "دی", "رازی", "سامان", "سینا", "کوثر", "ما", "معلم", "نوین", "هوشمند فردا"];
const TABLE_LEADER_CENTERS = "leader_centers";
const TABLE_CENTER_AGENTS = "center_agents";
const TABLE_SELLER_LOCATIONS = "seller_locations";
// نسخه‌ی ساخت (فقط برای مرجع؛ رفرش خودکار تب‌ها بر اساس version.txt برداشته شد تا بعد از هر انتشار موج درخواست ایجاد نشود)
const APP_BUILD = '20261109-2';
// ============================================================
// کش درخواست‌های Supabase (سطح fetch): داده‌ی گزارش‌ها فقط وقتی n8n آپدیت کنه عوض می‌شه (ساعتی)،
// پس تا وقتی «آخرین آپدیت» (app_meta) عوض نشده همون پاسخِ ذخیره‌شده نشون داده می‌شه و select به Supabase نمی‌ره.
// کش تو localStorage هم نگه داشته می‌شه (با بستن/باز کردن تب هم می‌مونه) و با خروج از حساب پاک می‌شه.
// مستثنی (همیشه زنده): وضعیت پنل کارشناسان، حضورغیاب، تنظیمات، app_meta و همه‌ی نوشتن‌ها/RPCها.
// ============================================================
const FC_TABLES = new Set(['daily_targets', 'bug_reports', 'discrepancy_errors', 'azki_center_period_report', 'azki_center_breakdown_report',
  'azki_center_shift_report', 'azki_center_agent_company', 'center_sla_report', 'seller_locations', 'profiles', 'center_agents', 'leader_centers', 'team_assignments']);
const FC_TTL = 90 * 60 * 1000;            // سقف اطمینان؛ اصل کار با تغییر «آخرین آپدیت» باطل شدنه
const FC_LS = 'azki_fc_v2_';
const FC_MAX_BYTES = 4200000;
const FC = { mem: new Map(), inflight: new Map(), loadedFor: null, ver: '', timer: null };
function fcUid() { try { return (typeof currentUserId !== 'undefined' && currentUserId) || null; } catch (e) { return null; } }
function fcTable(u) { const m = /\/rest\/v1\/([a-z_]+)(?:\?|$)/.exec(u); return m ? m[1] : null; }
function fcVer() { const lu = window.__lastUpdateData; return lu && (lu.targets || lu.reports) ? JSON.stringify(lu) : ''; }
function fcClear() {
  FC.mem.clear(); FC.inflight.clear();
  try { const u = fcUid(); if (u) localStorage.removeItem(FC_LS + u); } catch (e) { }
}
window.__clearReportCache = fcClear;
function fcLoad(uid, ver) {
  if (FC.loadedFor === uid + '|' + ver) return;
  FC.loadedFor = uid + '|' + ver; FC.mem.clear();
  try {
    const o = JSON.parse(localStorage.getItem(FC_LS + uid) || 'null');
    if (!o || o.ver !== ver) { localStorage.removeItem(FC_LS + uid); return; }
    const now = Date.now();
    for (const [k, v] of o.items) if (now - v.t < FC_TTL) FC.mem.set(k, v);
  } catch (e) { }
}
function fcSave(uid, ver) {
  clearTimeout(FC.timer);
  FC.timer = setTimeout(() => {
    try {
      let items = [...FC.mem.entries()];
      let txt = JSON.stringify({ ver, items });
      while (txt.length > FC_MAX_BYTES && items.length) { items.sort((a, b) => a[1].t - b[1].t); items.shift(); txt = JSON.stringify({ ver, items }); }
      localStorage.setItem(FC_LS + uid, txt);
    } catch (e) { }
  }, 1000);
}
async function cachedFetch(input, init) {
  let method = 'GET', url = '';
  try {
    method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    url = String((input && input.url) || input || '');
  } catch (e) { return fetch(input, init); }
  const t = fcTable(url);
  if (method === 'HEAD') return fetch(input, init);
  if (method !== 'GET') {
    if (t && FC_TABLES.has(t) || (/\/functions\/v1\//.test(url) && !/"action"\s*:\s*"(list|get_[a-z_]+)"/.test(String((init && init.body) || '')))) { const r = fetch(input, init); r.then(() => fcClear(), () => { }); fcClear(); return r; }
    return fetch(input, init);
  }
  if (!t || !FC_TABLES.has(t)) return fetch(input, init);
  const uid = fcUid();
  if (!uid) return fetch(input, init);
  if (!fcVer() && window.__luPending) { try { await Promise.race([window.__luPending, new Promise(r => setTimeout(r, 4000))]); } catch (e) { } }
  const ver = fcVer();
  if (!ver) return fetch(input, init);
  fcLoad(uid, ver);
  let hk = '';
  try { const h = new Headers((init && init.headers) || (input && input.headers) || {}); hk = ['accept', 'range', 'prefer', 'range-unit'].map(n => h.get(n) || '').join('~'); } catch (e) { }
  const key = url + '|' + hk;
  const hit = FC.mem.get(key);
  const mk = (v) => new Response(v.b, { status: v.s, headers: v.h });
  if (hit && Date.now() - hit.t < FC_TTL) return mk(hit);
  const pend = FC.inflight.get(key + '|' + ver);
  if (pend) { const v = await pend; if (v) return mk(v); }
  const job = (async () => {
    const res = await fetch(input, init);
    if (!res.ok) return { res };
    const body = await res.clone().text();
    const h = {};
    ['content-type', 'content-range'].forEach(n => { const x = res.headers.get(n); if (x) h[n] = x; });
    const v = { t: Date.now(), s: res.status, h, b: body };
    if (fcVer() === ver) { FC.mem.set(key, v); fcSave(uid, ver); }
    return { res, v };
  })();
  const shared = job.then(r => r.v || null, () => null);
  FC.inflight.set(key + '|' + ver, shared);
  try { const r = await job; return r.res; } finally { FC.inflight.delete(key + '|' + ver); }
}
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { fetch: cachedFetch } });
supabaseClient.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { try { Object.keys(localStorage).filter(k => k.indexOf(FC_LS) === 0).forEach(k => localStorage.removeItem(k)); } catch (e) { } FC.mem.clear(); FC.loadedFor = null; } });

const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginBtn = document.getElementById('login-btn');
function stripSpaces(el) {
  el.addEventListener('input', () => {
    const cleaned = el.value.replace(/\s+/g, '');
    if (cleaned !== el.value) el.value = cleaned;
  });
}
stripSpaces(document.getElementById('username'));
stripSpaces(document.getElementById('password'));

function usernameToEmail(u) {
  return u.trim() + '@' + USERNAME_EMAIL_DOMAIN;
}

function showError(msg) {
  loginError.textContent = msg;
  loginError.style.display = 'block';
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.style.display = 'none';
  loginBtn.disabled = true;
  loginBtn.textContent = 'در حال ورود...';

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: usernameToEmail(username),
    password
  });

  loginBtn.disabled = false;
  loginBtn.textContent = 'ورود';

  if (error) {
    showError(/network|fetch|failed to/i.test(error.message || '') ? 'اتصال به سرور برقرار نشد؛ اینترنت را بررسی کنید و دوباره تلاش کنید' : 'نام کاربری یا رمز عبور اشتباه است');
    return;
  }
  enterApp(data.user);
});

// ── تغییر رمز از صفحه‌ی ورود: با رمز فعلی وارد می‌شود، رمز را عوض می‌کند و بلافاصله خارج می‌شود ──
(function () {
  const chForm = document.getElementById('chpw-form');
  const okEl = document.getElementById('login-ok');
  const toggle = (showCh) => {
    chForm.style.display = showCh ? '' : 'none';
    loginForm.style.display = showCh ? 'none' : '';
    document.getElementById('chpw-open').parentElement.style.display = showCh ? 'none' : '';
    loginError.style.display = 'none';
    if (showCh) okEl.style.display = 'none';
  };
  document.getElementById('chpw-open').addEventListener('click', (e) => { e.preventDefault(); toggle(true); });
  document.getElementById('chpw-back').addEventListener('click', (e) => { e.preventDefault(); toggle(false); });
  ['chpw-user', 'chpw-old', 'chpw-new', 'chpw-new2'].forEach((id) => stripSpaces(document.getElementById(id)));
  const pwOk = (p) => p.length >= 8 && /^[\x21-\x7E]+$/.test(p) && /[a-z]/.test(p) && /[A-Z]/.test(p) && /[0-9]/.test(p) && /[^A-Za-z0-9]/.test(p);
  chForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none'; okEl.style.display = 'none';
    const u = document.getElementById('chpw-user').value;
    const oldP = document.getElementById('chpw-old').value;
    const newP = document.getElementById('chpw-new').value;
    const newP2 = document.getElementById('chpw-new2').value;
    if (newP !== newP2) { showError('رمز جدید و تکرار آن یکسان نیست'); return; }
    if (!pwOk(newP)) { showError('رمز جدید باید حداقل ۸ کاراکتر و شامل حرف کوچک، حرف بزرگ، عدد و یک علامت (انگلیسی، بدون فاصله) باشد'); return; }
    if (newP === oldP) { showError('رمز جدید باید با رمز فعلی فرق داشته باشد'); return; }
    const btn = document.getElementById('chpw-btn');
    btn.disabled = true; btn.textContent = 'در حال تغییر...';
    try {
      const si = await supabaseClient.auth.signInWithPassword({ email: usernameToEmail(u), password: oldP });
      if (si.error) { showError(/network|fetch|failed to/i.test(si.error.message || '') ? 'اتصال به سرور برقرار نشد؛ دوباره تلاش کنید' : 'نام کاربری یا رمز فعلی اشتباه است'); return; }
      const up = await supabaseClient.auth.updateUser({ password: newP });
      await supabaseClient.auth.signOut();
      if (up.error) { showError('تغییر رمز انجام نشد: ' + (up.error.message || '')); return; }
      chForm.reset(); toggle(false);
      okEl.textContent = 'رمز عبور تغییر کرد. با رمز جدید وارد شوید.'; okEl.style.display = 'block';
    } catch (err) {
      showError('خطا در تغییر رمز؛ دوباره تلاش کنید');
    } finally {
      btn.disabled = false; btn.textContent = 'تغییر رمز';
    }
  });
})();

document.getElementById('logout-btn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  location.reload();
});

document.querySelectorAll('#main-tabs .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#main-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('panel-targets').classList.remove('active');
    document.getElementById('panel-bugs').classList.remove('active');
    document.getElementById('panel-agent-attendance').classList.remove('active');
    document.getElementById('panel-training').classList.remove('active');
    document.getElementById('panel-agent-perf').classList.remove('active');
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    // فیلتر تاریخ «تارگت روزانه» برای تب «بررسی عملکرد» هم استفاده می‌شه؛ همون المنت بین دو پنل جابه‌جا می‌شه
    const agentFilterEl = document.getElementById('agent-filter');
    if (agentFilterEl && (btn.dataset.tab === 'agent-perf' || btn.dataset.tab === 'targets')) {
      const dest = document.getElementById(btn.dataset.tab === 'agent-perf' ? 'panel-agent-perf' : 'panel-targets');
      if (dest && agentFilterEl.parentNode !== dest) dest.insertBefore(agentFilterEl, dest.firstChild);
    }
    if (btn.dataset.tab === 'agent-perf') renderAgentPerf();
    if (btn.dataset.tab === 'agent-attendance') attOpen(document.getElementById('panel-agent-attendance'));
    if (btn.dataset.tab === 'training') { trMount(document.getElementById('panel-training')); trainingOpen(); }
    if (btn.dataset.tab === 'bugs') {
      markBugsSeen(lastBugsKeys);
    }
    if (window.refreshGlassReveals) window.refreshGlassReveals();
  });
});

window.teamCurrentTab = 'team';
const TEAM_REPORT_TABS = ['azki-shifts', 'azki-compare', 'azki-oct', 'azki-chart'];
let teamLastReportTab = 'azki-compare';
window.leaderHiddenTabs = new Set(); // تب‌هایی که سرپرست برای سرگروه‌ها مخفی کرده
function teamShowTab(tab) {
  if (window.leaderHiddenTabs.has(tab)) return;
  window.teamCurrentTab = tab;
  const isReport = TEAM_REPORT_TABS.includes(tab);
  if (window.setLastUpdateMode) window.setLastUpdateMode(isReport);
  if (isReport) teamLastReportTab = tab;
  document.querySelectorAll('#team-tabs .tab-btn').forEach(b => {
    const key = b.dataset.teamGroup || b.dataset.teamTab;
    b.classList.toggle('active', isReport ? key === 'report' : key === tab);
  });
  const subBar = document.getElementById('team-subtabs');
  if (subBar) {
    subBar.style.display = isReport ? '' : 'none';
    subBar.querySelectorAll('.subtab-btn').forEach(b => b.classList.toggle('active', b.dataset.teamTab === tab));
  }
  document.getElementById('panel-team').classList.remove('active');
  document.getElementById('panel-team-bugs').classList.remove('active'); document.getElementById('panel-team-perf').classList.remove('active');
  ['panel-azki-compare', 'panel-azki-oct', 'panel-azki-chart', 'panel-azki-shifts', 'panel-azki-active', 'panel-azki-payroll', 'panel-attendance', 'panel-users', 'panel-team-training'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  const panelEl = document.getElementById(tab === 'training' ? 'panel-team-training' : 'panel-' + tab);
  panelEl.classList.add('active');
  // فیلتر تاریخ «تعداد صدور تیم» برای تب «بررسی عملکرد» هم استفاده می‌شه؛ همون المنت بین دو پنل جابه‌جا می‌شه
  const teamFilterEl = document.getElementById('team-filter');
  if (teamFilterEl) {
    const dest = document.getElementById(tab === 'team-perf' ? 'panel-team-perf' : 'panel-team');
    if (dest && teamFilterEl.parentNode !== dest) dest.insertBefore(teamFilterEl, dest.firstChild);
    const exBtn = document.getElementById('team-export-btn');
    if (exBtn) exBtn.style.display = tab === 'team-perf' ? 'none' : '';
  }
  if (tab === 'team-perf') renderTeamPerf();
  const azkiFilterEl = document.getElementById('azki-filter');
  // وضعیت پنل کارشناسان بازه‌ی تاریخی نداره، پس فیلتر تاریخ/شرکت براش نشون داده نمیشه
  const isAzki = tab.startsWith('azki-') && tab !== 'azki-active';
  // فیلتر تاریخ/شرکت یکی بیشتر نیست؛ هر بار بالای پنل azki فعال جابه‌جا می‌شه
  if (azkiFilterEl && isAzki && panelEl.firstChild !== azkiFilterEl) panelEl.insertBefore(azkiFilterEl, panelEl.firstChild);
  if (azkiFilterEl) azkiFilterEl.style.display = isAzki ? '' : 'none';
  if (tab === 'azki-compare' && !azkiState.compare.loaded) loadAzkiCompareView();
  if (tab === 'azki-oct') { if (azkiState.oct.loaded) renderAzkiOctView(); else loadAzkiOctView(); }
  if (tab === 'azki-chart') { azkiEnsureChartDefaultRange(); azkiChartEnsure(); }
  azkiSyncFilterForTab(tab);
  if (tab === 'azki-shifts' && !azkiState.shifts.loaded) loadAzkiShiftsView();
  if (tab === 'azki-active' && !azkiState.activeStatus.loaded) loadAzkiActiveStatusView();
  if (tab === 'azki-active') loadAgentTokenBanner();
  if (tab === 'azki-payroll' && !azkiState.payroll.loaded) loadAzkiPayrollView();
  if (tab === 'attendance') attOpen(document.getElementById('panel-attendance'));
  if (tab === 'users') usersOpen(document.getElementById('panel-users'));
  if (tab === 'training') { trMount(panelEl); trainingOpen(); }
  if (window.refreshGlassReveals) window.refreshGlassReveals();
}
document.querySelectorAll('#team-tabs .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    teamShowTab(btn.dataset.teamGroup === 'report' ? teamLastReportTab : btn.dataset.teamTab);
  });
});
document.querySelectorAll('#team-subtabs .subtab-btn').forEach(btn => {
  btn.addEventListener('click', () => teamShowTab(btn.dataset.teamTab));
});

document.querySelectorAll('#center-tabs .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#center-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('panel-center').classList.remove('active');
    document.getElementById('panel-center-bugs').classList.remove('active');
    document.getElementById('panel-center-payroll').classList.remove('active');
    document.getElementById('panel-center-perf').classList.remove('active');
    document.getElementById('panel-attendance').classList.remove('active');
    document.getElementById('panel-center-training').classList.remove('active');
    btn.classList.add('active');
    const centerPanel = document.getElementById(btn.dataset.centerTab === 'training' ? 'panel-center-training' : 'panel-' + btn.dataset.centerTab);
    centerPanel.classList.add('active');
    // تب حضور و غیاب فیلتر تاریخ نمی‌خواد (خودش ناوبری هفته داره)
    document.getElementById('center-filter').style.display = (btn.dataset.centerTab === 'attendance' || btn.dataset.centerTab === 'training') ? 'none' : '';
    if (btn.dataset.centerTab === 'center-payroll' && !centerPayrollState.loaded) loadCenterPayroll();
    if (btn.dataset.centerTab === 'center-perf' && !centerPerfState.loaded) loadCenterPerf();
    if (btn.dataset.centerTab === 'attendance') attOpen(document.getElementById('panel-attendance'));
    if (btn.dataset.centerTab === 'training') { trMount(centerPanel); trainingOpen(); }
    if (window.refreshGlassReveals) window.refreshGlassReveals();
  });
});

(function () {
  const LIB_CSS = [
    'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
    'https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/MarkerCluster.css'
  ];
  const LIB_JS = [
    'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
    'https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js'
  ];
  const LOW_ZOOM = 9;
  const IRAN_BOUNDS = [[25.0, 43.9], [39.8, 63.4]];

  const PROVINCES = ['آذربایجان شرقی', 'آذربایجان غربی', 'اردبیل', 'اصفهان', 'البرز', 'ایلام', 'بوشهر', 'تهران', 'چهارمحال و بختیاری', 'خراسان جنوبی', 'خراسان رضوی', 'خراسان شمالی', 'خوزستان', 'زنجان', 'سمنان', 'سیستان و بلوچستان', 'فارس', 'قزوین', 'قم', 'کردستان', 'کرمان', 'کرمانشاه', 'کهگیلویه و بویراحمد', 'گلستان', 'گیلان', 'لرستان', 'مازندران', 'مرکزی', 'هرمزگان', 'همدان', 'یزد'];
  const STATE_ALIAS = { 'آذربایجان': 'آذربایجان غربی' };

  const S = { map: null, cluster: null, markers: new Map(), rows: [], activeId: null, busy: false, libs: null, green: new Set(), unmatched: [], city: '', openProv: new Set() };
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s == null ? '' : s)
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک').toLowerCase();
  function canonState(s) {
    const raw = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(), n = norm(raw);
    const hit = PROVINCES.find(p => norm(p) === n);
    if (hit) return hit;
    const al = Object.keys(STATE_ALIAS).find(a => norm(a) === n);
    return al ? STATE_ALIAS[al] : raw;
  }
  const faNum = n => Number(n).toLocaleString('fa-IR');

  function setStatus(msg, isErr) {
    const el = $('sm-status');
    el.textContent = msg || '';
    el.classList.toggle('err', !!isErr);
    el.style.display = msg ? 'flex' : 'none';
  }

  const SRI = {
    "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css": "sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H",
    "https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/MarkerCluster.css": "sha384-pmjIAcz2bAn0xukfxADbZIb3t8oRT9Sv0rvO+BR5Csr6Dhqq+nZs59P0pPKQJkEV",
    "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js": "sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH",
    "https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js": "sha384-eXVCORTRlv4FUUgS/xmOyr66XBVraen8ATNLMESp92FKXLAMiKkerixTiBvXriZr",
    "https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js": "sha384-OUW9euuUyxyHcAhTqbhI+Iyb8LMssXt/cpz0yXhs9UWG2/R/uaWdakx/4cfww7Vb"
  };
  function loadCss(href) {
    return new Promise(res => {
      if (document.querySelector('link[href="' + href + '"]')) return res();
      const l = document.createElement('link');
      l.rel = 'stylesheet'; if (SRI[href]) { l.integrity = SRI[href]; l.crossOrigin = 'anonymous'; } l.href = href; l.onload = res; l.onerror = res;
      document.head.appendChild(l);
    });
  }
  function loadJs(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      if (SRI[src]) { s.integrity = SRI[src]; s.crossOrigin = 'anonymous'; } s.src = src; s.onload = res; s.onerror = () => rej(new Error('load failed: ' + src));
      document.head.appendChild(s);
    });
  }
  function ensureLibs() {
    if (window.L && window.L.markerClusterGroup) return Promise.resolve();
    if (!S.libs) {
      S.libs = (async () => {
        await Promise.all(LIB_CSS.map(loadCss));
        for (const src of LIB_JS) await loadJs(src);
      })();
      S.libs.catch(() => { S.libs = null; });
    }
    return S.libs;
  }

  function centerKey(s) {
    return norm(s)
      .replace(/[\s\u200c\u200b\u200e\u200f\u00a0\-_.,،؛:()\[\]\/|]+/g, '')
      .replace(/^(ازکیسنتر|سنتر|مرکزصدور|مرکز|شعبه|آقای|خانم|جنابآقای|سرکارخانم|دکتر|مهندس)+/, '');
  }

  const CENTER_MANUAL_MATCH = {};

  function computeGreen() {
    const targets = window.supTargetCenters || [];
    S.green = new Set();
    S.unmatched = [];
    S.unmatchedManualMiss = [];
    const byKey = new Map();
    S.rows.forEach(c => {
      const k = centerKey(c.name);
      if (!k) return;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(c);
    });
    targets.forEach(t => {
      if (Object.prototype.hasOwnProperty.call(CENTER_MANUAL_MATCH, t.name)) {
        const target = CENTER_MANUAL_MATCH[t.name];
        const byId = S.rows.find(c => String(c.id) === String(target));
        if (byId) { S.green.add(byId.id); return; }
        const mk = centerKey(target);
        const byName = mk ? S.rows.filter(c => centerKey(c.name) === mk) : [];
        if (byName.length) { byName.forEach(c => S.green.add(c.id)); return; }
        S.unmatchedManualMiss.push(t.name);
        S.unmatched.push(t.name);
        return;
      }
      const k = centerKey(t.name);
      let hits = k && byKey.has(k) ? byKey.get(k) : [];
      if (!hits.length && k.length >= 5) {
        const soft = S.rows.filter(c => { const ck = centerKey(c.name); return ck.length >= 5 && (ck.includes(k) || k.includes(ck)); });
        if (soft.length && soft.length <= 3) hits = soft;
      }
      if (hits.length) hits.forEach(c => S.green.add(c.id));
      else S.unmatched.push(t.name);
    });
    if (S.unmatched.length) {
      console.log('[نقشه سنتر] سنترهای تارگت‌دار که روی نقشه پیدا نشدن (' + S.unmatched.length + ' مورد):');
      console.table(S.unmatched.map(name => ({ 'اسم در تب تارگت‌ها': name })));
      if (S.unmatchedManualMiss.length) {
        console.warn('[نقشه سنتر] این موارد تو CENTER_MANUAL_MATCH override دارن ولی آیدی/اسمِ نوشته‌شده در seller_locations پیدا نشد، مقدارشون رو چک کن:', S.unmatchedManualMiss);
      }
    }
  }

  function updateGreenInfo() {
    const el = $('sm-green-info');
    if (!el) return;
    const targets = window.supTargetCenters;
    if (!targets) { el.textContent = ''; el.classList.remove('warn'); return; }
    const found = targets.length - S.unmatched.length;
    let txt = 'سبز: ' + faNum(found) + ' از ' + faNum(targets.length) + ' سنتر تارگت‌دار روی نقشه پیدا شد.';
    if (S.unmatched.length) {
      txt += ' پیدا نشد: ' + S.unmatched.join('، ') + ' (لیست کامل در Console مرورگر هم چاپ شده)';
    }
    el.textContent = txt;
    el.title = S.unmatched.length ? 'برای اضافه کردن این‌ها به نقشه یا اصلاح اسمشون، به تابع CENTER_MANUAL_MATCH در کد مراجعه کن.' : '';
    el.classList.toggle('warn', S.unmatched.length > 0);
  }

  function popupHtml(c) {
    const phones = (norm(c.phone).match(/\d{10,11}/g) || [])
      .filter(p => /^0?9\d{9}$/.test(p)).map(p => p[0] === '0' ? p : '0' + p);
    const phoneHtml = phones.length
      ? phones.map(p => '<a class="num" href="tel:' + p + '">' + p + '</a>').join(' ، ')
      : esc(c.phone || '—');
    const link = /^https?:\/\//i.test(c.location_link || '') ? c.location_link : '';
    const ownLink = link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener">لینک ثبت‌شده</a>' : '';
    const g = 'https://www.google.com/maps/search/?api=1&query=' + c.lat + ',' + c.lng;
    const b = 'https://balad.ir/location?latitude=' + c.lat + '&longitude=' + c.lng + '&zoom=17';
    return '<div class="sm-pop">'
      + '<h3>' + esc(c.name) + '</h3>'
      + (S.green.has(c.id) ? '<div class="row"><span class="k">تارگت:</span> سنتر دارای تارگت</div>' : '')
      + '<div class="row"><span class="k">کد:</span> <span class="num">' + esc(c.id) + '</span></div>'
      + '<div class="row"><span class="k">تلفن:</span> ' + phoneHtml + '</div>'
      + '<div class="row"><span class="k">استان / شهر:</span> ' + esc(c.state) + ' / ' + esc(c.city) + '</div>'
      + '<div class="row"><span class="k">آدرس:</span> ' + esc(c.address) + '</div>'
      + (c.area ? '<div class="row"><span class="k">متراژ:</span> ' + esc(c.area) + '</div>' : '')
      + (c.is_approx
        ? '<div class="warn">مختصات دقیق این سنتر ثبت نشده؛ نشانگر روی حدود مرکز شهر است.' + (link ? ' برای موقعیت دقیق «لینک ثبت‌شده» را باز کنید.' : '') + '</div>'
        : '<div class="row"><span class="k">مختصات:</span> <span class="num">' + Number(c.lat).toFixed(6) + ', ' + Number(c.lng).toFixed(6) + '</span></div>')
      + '<div class="acts">'
      + (c.is_approx ? ownLink : '<a href="' + g + '" target="_blank" rel="noopener">گوگل‌مپ</a><a href="' + b + '" target="_blank" rel="noopener">بلد</a>' + ownLink)
      + '</div></div>';
  }

  function iconFor(c) {
    return L.divIcon({
      className: 'sm-pinwrap', iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -10],
      html: '<span class="sm-pin' + (S.green.has(c.id) ? ' green' : '') + (c.is_approx ? ' approx' : '') + '"><i class="ring"></i><i class="core"></i><b class="badge"><u>1</u></b></span>'
    });
  }

  function makeMarker(c) {
    const m = L.marker([c.lat, c.lng], { icon: iconFor(c), riseOnHover: true, title: c.name });
    m.bindPopup(popupHtml(c), { maxWidth: 300 });
    m.on('click', () => setActive(c.id));
    m.on('add', () => {
      if (c.id === S.activeId && m.getElement()) {
        const p = m.getElement().querySelector('.sm-pin'); if (p) p.classList.add('active');
      }
    });
    return m;
  }

  function setActive(id) {
    S.activeId = id;
    document.querySelectorAll('#sm-map .sm-pin.active').forEach(p => p.classList.remove('active'));
    const mk = S.markers.get(id), el = mk && mk.getElement && mk.getElement();
    if (el) { const p = el.querySelector('.sm-pin'); if (p) p.classList.add('active'); }
    document.querySelectorAll('#sm-list .sm-item').forEach(b => b.classList.toggle('active', b.dataset.id === String(id)));
    const item = document.querySelector('#sm-list .sm-item[data-id="' + id + '"]');
    if (item) item.scrollIntoView({ block: 'nearest' });
  }

  function applyZoomStyle() {
    if (S.map) $('sm-map').classList.toggle('sm-low', S.map.getZoom() < LOW_ZOOM);
  }

  function initMap() {
    const isWeb = location.protocol === 'http:' || location.protocol === 'https:';
    const layers = {};
    if (isWeb) layers['OpenStreetMap'] = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
    layers['نقشه خیابانی (Esri)'] = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles © Esri' });
    layers['ماهواره'] = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles © Esri' });
    S.map = L.map('sm-map', { layers: [isWeb ? layers['OpenStreetMap'] : layers['نقشه خیابانی (Esri)']], scrollWheelZoom: true, minZoom: 4, zoomSnap: 0.5, maxBounds: [[15, 30], [45, 75]] });
    S.map.fitBounds(IRAN_BOUNDS);
    L.control.layers(layers, null, { position: 'topleft' }).addTo(S.map);
    L.control.scale({ imperial: false }).addTo(S.map);
    S.cluster = L.markerClusterGroup({
      showCoverageOnHover: false, maxClusterRadius: 45, spiderfyOnMaxZoom: true, disableClusteringAtZoom: 16,
      iconCreateFunction: cl => {
        const n = cl.getChildCount(), s = n < 10 ? 40 : n < 30 ? 46 : 54;
        return L.divIcon({ html: '<div>' + n + '</div>', className: 'sm-cl', iconSize: [s, s] });
      }
    }).addTo(S.map);
    S.map.on('zoomend', applyZoomStyle);
    applyZoomStyle();
  }

  function renderProvinces() {
    const counts = new Map();
    S.rows.forEach(c => counts.set(c.state, (counts.get(c.state) || 0) + 1));
    const withC = PROVINCES.filter(p => counts.get(p)).sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b, 'fa'));
    const without = PROVINCES.filter(p => !counts.get(p)).sort((a, b) => a.localeCompare(b, 'fa'));
    const others = [...counts.keys()].filter(k => !PROVINCES.includes(k));
    const max = Math.max(1, ...withC.map(p => counts.get(p)));
    const cityMap = new Map();
    S.rows.forEach(c => {
      const raw = String(c.city == null ? '' : c.city).replace(/\s+/g, ' ').trim();
      const label = raw || 'نامشخص', k = norm(label);
      if (!cityMap.has(c.state)) cityMap.set(c.state, new Map());
      const m = cityMap.get(c.state);
      if (!m.has(k)) m.set(k, { label, raw, n: 0 });
      m.get(k).n++;
    });
    const citiesOf = p => [...(cityMap.get(p) || new Map()).values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'fa'));
    const row = p => {
      const cs = citiesOf(p), open = S.openProv.has(p);
      return '<div class="sm-pwrap' + (open ? ' open' : '') + '" data-pw="' + esc(p) + '"><div class="sm-phead">'
        + '<button type="button" class="sm-prow" data-p="' + esc(p) + '"><span class="pn">' + esc(p) + '</span><span class="pc">' + faNum(counts.get(p)) + '</span>'
        + '<i class="bar"><u style="width:' + Math.max(4, Math.round(counts.get(p) / max * 100)) + '%"></u></i></button>'
        + '<button type="button" class="sm-ptog" data-tog="' + esc(p) + '" title="نمایش شهرها"><span>' + faNum(cs.length) + ' شهر</span><i>▼</i></button></div>'
        + '<div class="sm-cities">' + cs.map(ct => '<button type="button" class="sm-city' + (S.city === ct.raw && $('sm-state').value === p ? ' active' : '') + '" data-cp="' + esc(p) + '" data-cc="' + esc(ct.raw) + '">' + esc(ct.label) + '<b>' + faNum(ct.n) + '</b></button>').join('') + '</div></div>';
    };
    const zero = p => '<div class="sm-prow zero"><span class="pn">' + esc(p) + '</span><span class="pc">۰</span></div>';
    $('sm-prov').innerHTML =
      '<div class="sm-sum"><div><b>' + faNum(S.rows.length) + '</b><span>کل سنترها</span></div>'
      + '<div><b>' + faNum(withC.length) + '</b><span>استان دارای سنتر</span></div>'
      + '<div class="bad"><b>' + faNum(without.length) + '</b><span>استان بدون سنتر</span></div></div>'
      + '<div class="sm-prov-h">استان‌های دارای سنتر (از ' + faNum(PROVINCES.length) + ' استان)</div>' + withC.map(row).join('')
      + (without.length ? '<div class="sm-prov-h bad">استان‌های بدون سنتر</div>' + without.map(zero).join('') : '')
      + (others.length ? '<div class="sm-prov-h bad">نام استان نامعتبر در داده</div>' + others.map(p => '<div class="sm-prow zero"><span class="pn">' + esc(p || '—') + '</span><span class="pc">' + faNum(counts.get(p)) + '</span></div>').join('') : '');
  }

  // آمار شهرها: هر شهر (به همراه استانش) با تعداد سنتر، مستقل از تب استان‌ها
  function cityStats() {
    const m = new Map();
    S.rows.forEach(c => {
      const raw = String(c.city == null ? '' : c.city).replace(/\s+/g, ' ').trim();
      const label = raw || 'نامشخص', key = norm(c.state) + '|' + norm(label);
      if (!m.has(key)) m.set(key, { state: c.state, raw, label, n: 0 });
      m.get(key).n++;
    });
    return [...m.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'fa') || String(a.state).localeCompare(String(b.state), 'fa'));
  }
  function renderCityList() {
    const box = $('sm-clist'); if (!box) return;
    const q = norm(S.cityQ || '').trim(), st = $('sm-state').value;
    const all = S.cityAll || [];
    const list = q ? all.filter(c => norm(c.label + ' ' + c.state).includes(q)) : all;
    const max = Math.max(1, ...all.map(c => c.n));
    box.innerHTML = list.length ? list.map(c =>
      '<button type="button" class="sm-prow sm-crow' + (S.city && S.city === c.raw && st === c.state ? ' active' : '') + '" data-cp="' + esc(c.state) + '" data-cc="' + esc(c.raw) + '">'
      + '<span class="pn">' + esc(c.label) + '<small>' + esc(c.state || '—') + '</small></span><span class="pc">' + faNum(c.n) + '</span>'
      + '<i class="bar"><u style="width:' + Math.max(4, Math.round(c.n / max * 100)) + '%"></u></i></button>').join('')
      : '<div class="sm-empty">شهری پیدا نشد</div>';
  }
  function renderCities() {
    const all = cityStats(); S.cityAll = all;
    const prov = new Set(S.rows.map(c => c.state).filter(Boolean));
    $('sm-city').innerHTML =
      '<div class="sm-sum"><div><b>' + faNum(S.rows.length) + '</b><span>کل سنترها</span></div>'
      + '<div><b>' + faNum(all.length) + '</b><span>شهر دارای سنتر</span></div>'
      + '<div><b>' + faNum(prov.size) + '</b><span>استان</span></div></div>'
      + '<div class="sm-cq"><input id="sm-cq" type="search" placeholder="جستجوی شهر یا استان" autocomplete="off" value="' + esc(S.cityQ || '') + '"></div>'
      + '<div id="sm-clist"></div>';
    $('sm-cq').addEventListener('input', e => { S.cityQ = e.target.value; renderCityList(); });
    renderCityList();
  }

  function render(fit) {
    const q = norm($('sm-q').value.trim()), st = $('sm-state').value;
    const onlyGreen = $('sm-only-green').checked;
    if (!st) S.city = '';
    const rows = S.rows.filter(c => (!st || c.state === st) && (!S.city || String(c.city == null ? '' : c.city).replace(/\s+/g, ' ').trim() === S.city) && (!q || c._h.includes(q)) && (!onlyGreen || S.green.has(c.id)));
    S.cluster.clearLayers();
    S.cluster.addLayers(rows.map(c => S.markers.get(c.id)));
    document.querySelectorAll('#sm-prov .sm-prow[data-p]').forEach(b => b.classList.toggle('active', b.dataset.p === st));
    document.querySelectorAll('#sm-prov .sm-city').forEach(b => b.classList.toggle('active', !!S.city && b.dataset.cc === S.city && b.dataset.cp === st));
    document.querySelectorAll('#sm-clist .sm-crow').forEach(b => b.classList.toggle('active', !!S.city && b.dataset.cc === S.city && b.dataset.cp === st));
    $('sm-list').innerHTML = rows.length ? rows.map(c =>
      '<button type="button" class="sm-item' + (c.id === S.activeId ? ' active' : '') + '" data-id="' + esc(c.id) + '">'
      + '<div class="n"><i class="sm-dot' + (S.green.has(c.id) ? ' green' : (c.is_approx ? ' approx' : '')) + '" style="margin:0"></i>' + esc(c.name) + '</div>'
      + '<div class="m">' + esc(c.state) + ' · ' + esc(c.city) + '</div></button>').join('')
      : '<div class="sm-empty">' + (onlyGreen && !window.supTargetCenters ? 'لیست سنترهای تارگت‌دار هنوز آماده نیست...' : 'موردی پیدا نشد') + '</div>';
    $('sm-count').textContent = faNum(rows.length) + ' سنتر از ' + faNum(S.rows.length);
    if (fit && rows.length) S.map.fitBounds(L.latLngBounds(rows.map(c => [c.lat, c.lng])).pad(0.15), { maxZoom: 13 });
  }

  async function fetchRows() {
    setStatus('در حال دریافت اطلاعات سنترها...');
    const { data, error } = await fetchAllRows((from, to) =>
      supabaseClient
        .from(TABLE_SELLER_LOCATIONS)
        .select('id, name, phone, state, city, address, area, lat, lng, is_approx, location_link')
        .order('id', { ascending: true })
        .range(from, to)
    );
    if (error) { setStatus('خطا در دریافت اطلاعات: ' + (error.message || 'نامشخص'), true); return; }
    const rows = (data || []).filter(r => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng)))
      .map(r => Object.assign({}, r, { lat: Number(r.lat), lng: Number(r.lng), state: canonState(r.state) }));
    if (!rows.length) { setStatus('اطلاعاتی برای نمایش نیست (یا دسترسی این حساب به جدول مجاز نیست).', true); return; }
    rows.forEach(c => { c._h = norm([c.name, c.id, c.city, c.state, c.address, c.phone].join(' ')); });
    S.rows = rows;
    computeGreen();
    S.cluster.clearLayers();
    S.markers = new Map(rows.map(c => [c.id, makeMarker(c)]));
    const sel = $('sm-state'), keep = sel.value;
    sel.innerHTML = '<option value="">همه استان‌ها</option>' + [...new Set(rows.map(c => c.state).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'fa')).map(s => '<option value="' + esc(s) + '">' + esc(s) + '</option>').join('');
    sel.value = keep;
    setStatus('');
    renderProvinces();
    renderCities();
    render(!keep && !$('sm-q').value);
    updateGreenInfo();
    S.map.invalidateSize();
  }

  document.addEventListener('sup-target-centers', () => {
    if (!S.map || !S.rows.length) return;
    computeGreen();
    S.rows.forEach(c => {
      const mk = S.markers.get(c.id);
      if (mk) { mk.setIcon(iconFor(c)); mk.setPopupContent(popupHtml(c)); }
    });
    render($('sm-only-green').checked);
    updateGreenInfo();
  });

  async function openMap() {
    if (S.map) { setTimeout(() => S.map.invalidateSize(), 50); return; }
    if (S.busy) return;
    S.busy = true;
    setStatus('در حال بارگذاری نقشه...');
    try { await ensureLibs(); }
    catch (e) { setStatus('بارگذاری کتابخانه‌ی نقشه ناموفق بود. اتصال اینترنت را بررسی کنید و دوباره تب را باز کنید.', true); S.busy = false; return; }
    initMap();
    await fetchRows();
    S.busy = false;
  }

  window.supCurrentTab = 'targets';
  const SUP_REPORT_TABS = ['azki-period', 'azki-centers', 'azki-shifts', 'azki-compare', 'azki-oct', 'azki-chart'];
  let supLastReportTab = 'azki-period';
  window.supHiddenTabs = new Set(); // تب‌هایی که خود سرپرست از تنظیمات مخفی کرده
  function supShowTab(which) {
    if (window.supHiddenTabs.has(which)) return;
    window.supCurrentTab = which;
    const isReport = SUP_REPORT_TABS.includes(which);
    if (window.setLastUpdateMode) window.setLastUpdateMode(isReport);
    if (isReport) supLastReportTab = which;
    document.querySelectorAll('#supervisor-tabs .tab-btn').forEach(b => {
      const key = b.dataset.supGroup || b.dataset.supTab;
      b.classList.toggle('active', isReport ? key === 'report' : key === which);
    });
    $('supervisor-subtabs').style.display = isReport ? '' : 'none';
    document.querySelectorAll('#supervisor-subtabs .subtab-btn').forEach(b => b.classList.toggle('active', b.dataset.supTab === which));
    $('sup-view-targets').style.display = which === 'targets' ? '' : 'none';
    $('sup-view-map').style.display = which === 'map' ? '' : 'none';
    $('sup-view-sup-perf').style.display = which === 'sup-perf' ? '' : 'none';
    // فیلتر تاریخ تب «صدور» برای تب «بررسی عملکرد» هم استفاده می‌شه؛ همون المنت بین دو نما جابه‌جا می‌شه
    const supFilterEl = $('sup-filter');
    if (supFilterEl && (which === 'sup-perf' || which === 'targets')) {
      const dest = $(which === 'sup-perf' ? 'sup-view-sup-perf' : 'sup-view-targets');
      if (supFilterEl.parentNode !== dest) dest.insertBefore(supFilterEl, dest.firstChild);
      const exFld = $('sup-export-btn') && $('sup-export-btn').closest('.azki-fld');
      if (exFld) exFld.style.display = which === 'sup-perf' ? 'none' : '';
    }
    if (which === 'sup-perf') renderSupPerf();
    $('sup-view-azki-period').style.display = which === 'azki-period' ? '' : 'none';
    $('sup-view-azki-centers').style.display = which === 'azki-centers' ? '' : 'none';
    $('sup-view-azki-shifts').style.display = which === 'azki-shifts' ? '' : 'none';
    $('sup-view-azki-compare').style.display = which === 'azki-compare' ? '' : 'none';
    $('sup-view-azki-oct').style.display = which === 'azki-oct' ? '' : 'none';
    $('sup-view-azki-chart').style.display = which === 'azki-chart' ? '' : 'none';
    $('sup-view-azki-payroll').style.display = which === 'azki-payroll' ? '' : 'none';
    $('sup-view-azki-active').style.display = which === 'azki-active' ? '' : 'none';
    $('sup-view-bugs').style.display = which === 'bugs' ? '' : 'none';
    $('sup-view-attendance').style.display = which === 'attendance' ? '' : 'none';
    $('sup-view-users').style.display = which === 'users' ? '' : 'none';
    $('sup-view-run-history').style.display = which === 'run-history' ? '' : 'none';
    $('sup-view-settings').style.display = which === 'settings' ? '' : 'none';
    $('sup-view-training').style.display = which === 'training' ? '' : 'none';
    // وضعیت پنل کارشناسان بازه‌ی تاریخی نداره، پس فیلتر تاریخ/شرکت براش نشون داده نمیشه
    $('azki-filter').style.display = (which.startsWith('azki-') && which !== 'azki-active') ? '' : 'none';
    document.querySelector('main').classList.toggle('sm-wide', which === 'map');
    if (which === 'map') { openMap(); setTimeout(() => S.map && S.map.invalidateSize(), 60); }
    if (which === 'azki-period' && !azkiState.period.loaded) loadAzkiPeriodView();
    if (which === 'azki-centers' && !azkiState.centers.loaded) loadAzkiCentersView();
    if (which === 'azki-shifts' && !azkiState.shifts.loaded) loadAzkiShiftsView();
    if (which === 'azki-compare' && !azkiState.compare.loaded) loadAzkiCompareView();
    if (which === 'azki-oct') { if (azkiState.oct.loaded) renderAzkiOctView(); else loadAzkiOctView(); }
    if (which === 'azki-chart') { azkiEnsureChartDefaultRange(); azkiChartEnsure(); }
    azkiSyncFilterForTab(which);
    if (which === 'azki-payroll' && !azkiState.payroll.loaded) loadAzkiPayrollView();
    if (which === 'azki-active' && !azkiState.activeStatus.loaded) loadAzkiActiveStatusView();
    if (which === 'azki-active') loadAgentTokenBanner();
    if (which === 'attendance') attOpen($('sup-view-attendance'));
    if (which === 'users') usersOpen($('sup-view-users'));
    if (which === 'run-history') runHistoryOpen($('sup-view-run-history'));
    if (which === 'settings') settingsOpen($('sup-view-settings'));
    if (which === 'training') { trMount($('sup-view-training')); trainingOpen(); }
    if (window.refreshGlassReveals) window.refreshGlassReveals();
  }
  window.supShowTab = supShowTab;
  document.querySelectorAll('#supervisor-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      let t = btn.dataset.supGroup === 'report' ? supLastReportTab : btn.dataset.supTab;
      if (window.supHiddenTabs.has(t)) {
        const f = [...document.querySelectorAll('#supervisor-subtabs .subtab-btn')].find(b => !window.supHiddenTabs.has(b.dataset.supTab));
        if (f) t = f.dataset.supTab;
      }
      supShowTab(t);
    });
  });
  document.querySelectorAll('#supervisor-subtabs .subtab-btn').forEach(btn => {
    btn.addEventListener('click', () => supShowTab(btn.dataset.supTab));
  });

  document.querySelectorAll('.sm-stab[data-side]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.sm-stab[data-side]').forEach(x => x.classList.toggle('active', x === b));
    $('sm-list').style.display = b.dataset.side === 'list' ? '' : 'none';
    $('sm-prov').style.display = b.dataset.side === 'prov' ? '' : 'none';
    $('sm-city').style.display = b.dataset.side === 'city' ? '' : 'none';
  }));
  $('sm-city').addEventListener('click', e => {
    const ct = e.target.closest('.sm-crow[data-cc]'); if (!ct || !S.map) return;
    const sel = $('sm-state'), same = sel.value === ct.dataset.cp && S.city === ct.dataset.cc;
    sel.value = same ? '' : ct.dataset.cp; S.city = same ? '' : ct.dataset.cc;
    render(true);
  });
  $('sm-prov').addEventListener('click', e => {
    const tg = e.target.closest('.sm-ptog[data-tog]');
    if (tg) {
      const p = tg.dataset.tog, w = tg.closest('.sm-pwrap');
      if (S.openProv.has(p)) S.openProv.delete(p); else S.openProv.add(p);
      if (w) w.classList.toggle('open', S.openProv.has(p));
      return;
    }
    const ct = e.target.closest('.sm-city[data-cc]');
    if (ct) {
      if (!S.map) return;
      const sel = $('sm-state'), same = sel.value === ct.dataset.cp && S.city === ct.dataset.cc;
      sel.value = ct.dataset.cp; S.city = same ? '' : ct.dataset.cc;
      render(true);
      return;
    }
    const b = e.target.closest('.sm-prow[data-p]'); if (!b || !S.map) return;
    const sel = $('sm-state');
    sel.value = sel.value === b.dataset.p ? '' : b.dataset.p;
    S.city = '';
    render(true);
  });
  const fsBtn = $('sm-full');
  if (!document.documentElement.requestFullscreen) fsBtn.style.display = 'none';
  fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.querySelector('.sm-wrap').requestFullscreen().catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => { if (S.map) setTimeout(() => S.map.invalidateSize(), 150); });

  let t;
  $('sm-q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => S.map && S.rows.length && render(true), 150); });
  $('sm-state').addEventListener('change', () => { S.city = ''; if (S.map && S.rows.length) render(true); });
  $('sm-only-green').addEventListener('change', () => S.map && S.rows.length && render(true));
  $('sm-refresh').addEventListener('click', () => { if (S.map) fetchRows(); else openMap(); });
  $('sm-list').addEventListener('click', e => {
    const el = e.target.closest('.sm-item'); if (!el) return;
    const c = S.rows.find(r => String(r.id) === el.dataset.id); if (!c) return;
    const m = S.markers.get(c.id); setActive(c.id);
    S.cluster.zoomToShowLayer(m, () => { S.map.flyTo(m.getLatLng(), Math.max(S.map.getZoom(), 15), { duration: .8 }); m.openPopup(); setActive(c.id); });
  });
})();

let agentSlaMap = null;
let agentSlaPeriodLabel = '';

function periodLabelFromStartSort(startSort) {
  const jy = Math.floor(startSort / 10000), jm = Math.floor(startSort / 100) % 100;
  const ey = jm < 12 ? jy : jy + 1, em = jm < 12 ? jm + 1 : 1;
  return `${jy}/${String(jm).padStart(2, '0')}/21 تا ${ey}/${String(em).padStart(2, '0')}/20`;
}

function periodStartSortOfJalali(jy, jm, jd) {
  if (jd >= 21) return jy * 10000 + jm * 100 + 21;
  return jm > 1 ? jy * 10000 + (jm - 1) * 100 + 21 : (jy - 1) * 10000 + 12 * 100 + 21;
}

function buildSlaMapFromRows(rows, periodStartSort) {
  if (!rows || !rows.some(r => Object.prototype.hasOwnProperty.call(r, 'avg_issuance_minutes'))) return null;
  const best = {};
  rows.forEach(r => {
    if (r.avg_issuance_minutes == null) return;
    const s = Number(r.report_date_sort) || 0;
    const cur = best[r.agent_id];
    if (!cur || s > cur.s) best[r.agent_id] = { s, v: Number(r.avg_issuance_minutes) };
  });
  const map = {};
  Object.keys(best).forEach(id => { map[id] = best[id].v; });
  agentSlaPeriodLabel = periodLabelFromStartSort(periodStartSort);
  return map;
}

function jalaliRowSortKey(r) {
  const s = String(r.report_date_jalali || '')
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (m) return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
  return Number(r.report_date_sort) || 0;
}
function sortRowsByDateAsc(rows) {
  return [...(rows || [])].sort((a, b) => jalaliRowSortKey(a) - jalaliRowSortKey(b));
}

function toJalaliDisplay(jalaliText) {
  return jalaliText ? faDigits(jalaliText) : '—';
}

function formatNumber(n) {
  const num = Number(n) || 0;
  const rounded = Math.round(num * 10) / 10;
  return rounded.toLocaleString('fa-IR', { maximumFractionDigits: 1, minimumFractionDigits: 0 }).replace(/٫/g, '.');
}

// Supabase/PostgREST caps a single response at 1000 rows by default.
// Any query whose result could plausibly exceed that (many users × many days)
// must page through with .range() instead of relying on the default limit,
// or the tail of the (ascending-sorted) results gets silently dropped.
// کش درخواست‌های سنگین گزارش (فقط جدول‌هایی که n8n پرشون می‌کنه): تا «آخرین آپدیت» عوض نشده
// و تا حداکثر ۲۰ دقیقه، همون پاسخ دوباره از حافظه داده می‌شه و به Supabase درخواست نمی‌ره.
// (کش قبلیِ سطح fetchAllRows حذف شد؛ کش حالا یک لایه پایین‌تر و روی همه‌ی درخواست‌های Supabase است — بالای supabaseClient)
const __REPORT_CACHE = { ver: '', map: new Map() };
const __REPORT_CACHE_TTL = 0;
function __reportCacheKey() { return null; }
function __rcSave() { }
async function fetchAllRows(buildQuery) {
  const pageSize = 1000;
  let allRows = [];
  let from = 0;
  while (true) {
    const q = buildQuery(from, from + pageSize - 1);
    const ck = __reportCacheKey(q);
    const hit = ck && __REPORT_CACHE.map.get(ck);
    let res;
    if (hit && Date.now() - hit.t < __REPORT_CACHE_TTL) res = { data: hit.data.slice(), error: null };
    else {
      res = await q;
      if (ck && !res.error && Array.isArray(res.data)) { __REPORT_CACHE.map.set(ck, { t: Date.now(), data: res.data.slice() }); __rcSave(); }
    }
    const { data, error } = res;
    if (error) return { data: null, error };
    allRows = allRows.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return { data: allRows, error: null };
}

function pad2(n) { return String(n).padStart(2, '0'); }

function gregorianToJalali(gy, gm, gd) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy;
  if (gy > 1600) { jy = 979; gy -= 1600; } else { jy = 0; gy -= 621; }
  const gy2 = (gm > 2) ? (gy + 1) : gy;
  let days = (365 * gy) + (Math.floor((gy2 + 3) / 4)) - (Math.floor((gy2 + 99) / 100)) + (Math.floor((gy2 + 399) / 400)) - 80 + gd + g_d_m[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let jm, jd;
  if (days < 186) {
    jm = 1 + Math.floor(days / 31);
    jd = 1 + (days % 31);
  } else {
    jm = 7 + Math.floor((days - 186) / 30);
    jd = 1 + ((days - 186) % 30);
  }
  return [jy, jm, jd];
}

function tehranTodayJalali() {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' });
  const [gy, gm, gd] = fmt.format(new Date()).split('-').map(Number);
  return gregorianToJalali(gy, gm, gd);
}

function currentPeriodBounds() {
  const [jy, jm, jd] = tehranTodayJalali();
  let startJy, startJm, endJy, endJm;
  if (jd >= 21) {
    startJy = jy; startJm = jm;
    endJy = (jm < 12) ? jy : jy + 1;
    endJm = (jm < 12) ? jm + 1 : 1;
  } else {
    startJy = (jm > 1) ? jy : jy - 1;
    startJm = (jm > 1) ? jm - 1 : 12;
    endJy = jy; endJm = jm;
  }
  return {
    startSort: startJy * 10000 + startJm * 100 + 21,
    endSort: endJy * 10000 + endJm * 100 + 20,
    startLabel: `${startJy}/${pad2(startJm)}/21`,
    endLabel: `${endJy}/${pad2(endJm)}/20`
  };
}

// ============================================================
// ============================================================
const JALALI_MONTHS_FA = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];

let currentUserRole = null;
function azkiAllowed() { return currentUserRole === 'supervisor' || currentUserRole === 'leader'; }

const azkiState = {
  granularity: 'daily',
  bounds: null,
  companies: { all: true, selected: new Set() },
  period:  { loaded: false, rows: [] },
  centers: { loaded: false, rows: [] },
  shifts:  { loaded: false, rows: [], mode: 'date' },
  compare: { loaded: false, byScope: {}, list: [], hideEmpty: true },
  oct: { loaded: false, rows: [], error: '' },
  payroll: { loaded: false, rows: [], slaByCenterKey: {} },
  activeStatus: { loaded: false, rows: [] },
  chart: { report: 'pct', metric: 'count', sel: { pct: new Set(['__all']), shift: new Set(['morning', 'evening']), period: new Set(['total', 'center']), oct: new Set(['__oct']) }, gen: 0 },
};

function faDigits(v) { return String(v).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]); }

function azkiActiveScopes() {
  const c = azkiState.companies;
  return c.all ? ['کل'] : AZKI_COMPANIES.filter(n => c.selected.has(n));
}
function azkiCompareCompanies() {
  const c = azkiState.companies;
  return c.all ? AZKI_COMPANIES.slice() : AZKI_COMPANIES.filter(n => c.selected.has(n));
}

function getAzkiBounds() {
  if (!azkiState.bounds) {
    const [jy, jm, jd] = tehranTodayJalali();
    const label = `${jy}/${pad2(jm)}/${pad2(jd)}`;
    const g = jalaliToGregorian(jy, jm, jd);
    azkiState.bounds = { startDate: g, endDate: g, startLabel: label, endLabel: label };
  }
  return azkiState.bounds;
}
// هفته‌ی جاری (شنبه تا جمعه) به‌صورت [[jy,jm,jd],[jy,jm,jd]]
function azkiCurrentWeekRange() {
  const [jy, jm, jd] = tehranTodayJalali();
  const idx = azkiWeekdayIndex(jy, jm, jd);   // شنبه = ۰ ... جمعه = ۶
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd).split('-').map(Number);
  const at = k => { const d = new Date(Date.UTC(gy, gm - 1, gd - idx + k)); return gregorianToJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); };
  return [at(0), at(6)];
}

// ۷ روز اخیر: از «امروز منهای ۷ روز» تا امروز (مثلاً امروز ۱۱ام → از ۴ام تا ۱۱ام)؛ هر روز یک روز جلو می‌آید
function azkiLast7DaysRange() {
  const [jy, jm, jd] = tehranTodayJalali();
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd).split('-').map(Number);
  const from = new Date(Date.UTC(gy, gm - 1, gd - 7));
  return [gregorianToJalali(from.getUTCFullYear(), from.getUTCMonth() + 1, from.getUTCDate()), [jy, jm, jd]];
}

// اولین ورود به تب نمودار: بازه‌ی پیش‌فرض = ۷ روز اخیر؛ بعد از آن هرچه کاربر انتخاب کند می‌ماند
function azkiEnsureChartDefaultRange() {
  if (azkiState.chartRangeInit) return;
  azkiState.chartRangeInit = true;
  const [a, b] = azkiLast7DaysRange();
  azkiSetDate('from', a); azkiSetDate('to', b);
  azkiState.bounds = azkiReadBounds();
  ['period', 'centers', 'shifts', 'compare', 'oct', 'payroll'].forEach(k => { azkiState[k].loaded = false; });
}

function azkiRangeText(b) { return `بازه‌ی نمایش: ${faDigits(b.startLabel)} تا ${faDigits(b.endLabel)}`; }

function round2(x) { return (x === null || x === undefined || isNaN(x)) ? null : Math.round(x * 100) / 100; }

function jalaliToGregorian(jy, jm, jd) {
  jy += 1595;
  let days = -355668 + (365 * jy) + (Math.floor(jy / 33) * 8) + Math.floor(((jy % 33) + 3) / 4) + jd +
    ((jm < 7) ? (jm - 1) * 31 : (((jm - 7) * 30) + 186));
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const isLeap = (gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0);
  const monthDays = [0, 31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm;
  for (gm = 1; gm <= 12; gm++) {
    if (gd <= monthDays[gm]) break;
    gd -= monthDays[gm];
  }
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}

function jalaliToGregorianDate(jy, jm, jd) {
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd).split('-').map(Number);
  return new Date(Date.UTC(gy, gm - 1, gd));
}

function parseJalaliParts(jalaliStr) {
  const [jy, jm, jd] = String(jalaliStr).trim().split('/').map(Number);
  return { jy, jm, jd };
}

function jalaliWeekOfYear(jy, jm, jd) {
  const gDate = jalaliToGregorianDate(jy, jm, jd);
  const gNewYear = jalaliToGregorianDate(jy, 1, 1);
  const dayOfYear = Math.round((gDate - gNewYear) / 86400000) + 1;
  return Math.floor((dayOfYear - 1) / 7) + 1;
}

function azkiPeriodDateBounds() {
  const [jy, jm, jd] = tehranTodayJalali();
  let startJy, startJm, endJy, endJm;
  if (jd >= 21) {
    startJy = jy; startJm = jm;
    endJy = (jm < 12) ? jy : jy + 1;
    endJm = (jm < 12) ? jm + 1 : 1;
  } else {
    startJy = (jm > 1) ? jy : jy - 1;
    startJm = (jm > 1) ? jm - 1 : 12;
    endJy = jy; endJm = jm;
  }
  return {
    startDate: jalaliToGregorian(startJy, startJm, 21),
    endDate: jalaliToGregorian(endJy, endJm, 20),
    startLabel: `${startJy}/${pad2(startJm)}/21`,
    endLabel: `${endJy}/${pad2(endJm)}/20`,
  };
}

function azkiPeriodGroupKey(jy, jm, jd, granularity) {
  if (granularity === 'monthly') return { key: `${jy}-${pad2(jm)}`, label: faDigits(`${JALALI_MONTHS_FA[jm - 1]} ${jy}`) };
  if (granularity === 'weekly') {
    const week = jalaliWeekOfYear(jy, jm, jd);
    return { key: `${jy}-W${week}`, label: faDigits(`هفته ${week} (${jy})`) };
  }
  return { key: `${jy}/${pad2(jm)}/${pad2(jd)}`, label: faDigits(`${jy}/${pad2(jm)}/${pad2(jd)}`) };
}

function groupAzkiPeriodRows(rows, granularity) {
  const groups = {};
  for (const r of rows) {
    const { jy, jm, jd } = parseJalaliParts(r.report_date_jalali);
    const { key, label } = azkiPeriodGroupKey(jy, jm, jd, granularity);
    if (!groups[key]) {
      groups[key] = {
        key, label, sortKey: jy * 10000 + jm * 100 + jd,
        total: 0, center: 0,
        octSum: 0, octN: 0, centerOctSum: 0, centerOctN: 0,
        oct1Sum: 0, oct1N: 0, oct3Sum: 0, oct3N: 0,
      };
    }
    const g = groups[key];
    g.total += r.total_orders || 0;
    g.center += r.center_orders || 0;
    g.octSum += Number(r.oct_sum_hours) || 0;
    g.octN += r.oct_n || 0;
    g.centerOctSum += Number(r.center_oct_sum_hours) || 0;
    g.centerOctN += r.center_oct_n || 0;
    g.oct1Sum += Number(r.oct_lt_1h_sum_hours) || 0;
    g.oct1N += r.oct_lt_1h_n || 0;
    g.oct3Sum += Number(r.oct_lt_3h_sum_hours) || 0;
    g.oct3N += r.oct_lt_3h_n || 0;
  }
  return Object.values(groups).sort((a, b) => a.sortKey - b.sortKey);
}

function groupAzkiBreakdownRows(rows, granularity) {
  const groups = {}; // key: periodKey|centerName
  for (const r of rows) {
    const { jy, jm, jd } = parseJalaliParts(r.report_date_jalali);
    const { key, label } = azkiPeriodGroupKey(jy, jm, jd, granularity);
    const gkey = `${key}|${r.center_name}`;
    if (!groups[gkey]) {
      groups[gkey] = {
        periodKey: key, label, centerName: r.center_name,
        sortKey: jy * 10000 + jm * 100 + jd,
        count: 0, octSum: 0, octN: 0,
      };
    }
    const g = groups[gkey];
    g.count += r.orders_count || 0;
    g.octSum += Number(r.oct_sum_hours) || 0;
    g.octN += r.oct_n || 0;
  }
  return Object.values(groups).sort((a, b) => a.sortKey - b.sortKey);
}

async function fetchAzkiPeriodRows(scopes, bounds) {
  return fetchAllRows((from, to) =>
    supabaseClient
      .from(TABLE_AZKI_PERIOD)
      .select('*')
      .in('company_scope', scopes)
      .gte('report_date', bounds.startDate)
      .lte('report_date', bounds.endDate)
      .order('report_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
  );
}

async function fetchAzkiBreakdownRows(scopes, bounds) {
  return fetchAllRows((from, to) =>
    supabaseClient
      .from(TABLE_AZKI_BREAKDOWN)
      .select('*')
      .in('company_scope', scopes)
      .gte('report_date', bounds.startDate)
      .lte('report_date', bounds.endDate)
      .order('report_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
  );
}

async function loadAzkiPeriodView() {
  if (!azkiAllowed()) return;
  const bounds = getAzkiBounds();
  document.getElementById('azki-period-label').textContent = azkiRangeText(bounds);

  const { data, error } = await fetchAzkiPeriodRows(azkiActiveScopes(), bounds);
  if (bounds !== azkiState.bounds) return;
  if (error) {
    document.getElementById('azki-period-list').innerHTML = `<div class="empty-state">خطا در دریافت گزارش: ${escHtml(error.message)}</div>`;
    return;
  }
  azkiState.period.rows = data || [];
  azkiState.period.loaded = true;
  renderAzkiPeriodView();
}

function renderAzkiPeriodView() {
  const rows = azkiState.period.rows;
  const container = document.getElementById('azki-period-list');
  if (!rows.length) {
    container.innerHTML = '<div class="empty-state">ردیفی برای این بازه پیدا نشد</div>';
    document.getElementById('azki-period-total').textContent = '۰';
    document.getElementById('azki-period-center').textContent = '۰';
    document.getElementById('azki-period-pct').textContent = '—';
    return;
  }

  const groups = groupAzkiPeriodRows(rows, azkiState.granularity);

  const grandTotal = groups.reduce((s, g) => s + g.total, 0);
  const grandCenter = groups.reduce((s, g) => s + g.center, 0);
  document.getElementById('azki-period-total').textContent = formatNumber(grandTotal);
  document.getElementById('azki-period-center').textContent = formatNumber(grandCenter);
  document.getElementById('azki-period-pct').textContent = grandTotal ? `${formatNumber(grandCenter / grandTotal * 100)}٪` : '—';

  container.innerHTML = groups.map(g => {
    const pct = g.total ? round2(g.center / g.total * 100) : 0;
    return `
      <div class="row-item">
        <div class="row-date">${g.label}</div>
        ${azkiMiniStatsHtml(g.total, g.center)}
        <div class="row-badge">${formatNumber(pct)}٪</div>
      </div>`;
  }).join('');
}

async function loadAzkiCentersView() {
  if (!azkiAllowed()) return;
  const bounds = getAzkiBounds();
  document.getElementById('azki-centers-label').textContent = azkiRangeText(bounds);

  const { data, error } = await fetchAzkiBreakdownRows(azkiActiveScopes(), bounds);
  if (bounds !== azkiState.bounds) return;
  if (error) {
    document.getElementById('azki-centers-list').innerHTML = `<div class="empty-state">خطا در دریافت گزارش: ${escHtml(error.message)}</div>`;
    return;
  }
  azkiState.centers.rows = data || [];
  azkiState.centers.loaded = true;
  renderAzkiCentersView();
}

function renderAzkiCentersView() {
  const rows = azkiState.centers.rows;
  const container = document.getElementById('azki-centers-list');
  if (!rows.length) {
    container.innerHTML = '<div class="empty-state">ردیفی برای این بازه پیدا نشد</div>';
    return;
  }

  const groups = groupAzkiBreakdownRows(rows, azkiState.granularity);

  const totalsByCenter = {};
  groups.forEach(g => { totalsByCenter[g.centerName] = (totalsByCenter[g.centerName] || 0) + g.count; });
  const orderedCenters = Object.keys(totalsByCenter).sort((a, b) => totalsByCenter[b] - totalsByCenter[a]);

  container.innerHTML = orderedCenters.map(centerName => {
    const centerGroups = groups.filter(g => g.centerName === centerName).sort((a, b) => a.sortKey - b.sortKey);
    const rowsHtml = centerGroups.map(g => {
      return `
        <div class="row-item">
          <div class="row-date">${g.label}</div>
          <div class="row-badge">${formatNumber(g.count)}</div>
        </div>`;
    }).join('');
    return `
      <div class="leader-item">
        <button class="leader-header" type="button">
          <div class="leader-name-wrap">
            <svg class="leader-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            <span class="leader-name">${escHtml(fmtCenterName(centerName))}</span>
          </div>
          <div class="leader-right">
            <span class="leader-total">${formatNumber(totalsByCenter[centerName])}</span>
          </div>
        </button>
        <div class="leader-details"><div class="leader-details-inner">${rowsHtml}</div></div>
      </div>`;
  }).join('');

  bindExpandableToggles(container);
}

// ============================================================
// تب «وضعیت پنل کارشناسان»: وضعیت لحظه‌ای فعال/غیرفعال کاربرانی که با فرمت
// «مرکز صدور X | Y» ثبت شدن (از جدول center_operators_status که ورک‌فلوی n8n پر می‌کنه).
// این تب بازه‌ی تاریخی نداره — همیشه آخرین وضعیت ثبت‌شده رو نشون می‌ده.
// ============================================================
// ---- توکن ازکی‌ایجنت: اگه منقضی شده (یا نزدیکه) هشدار بده و سرپرست بتونه توکن تازه رو paste کنه ----
async function loadAgentTokenBanner() {
  const box = document.getElementById('agent-token-banner');
  if (!box || !azkiAllowed()) return;
  let st = null;
  try {
    const r = await supabaseClient.rpc('agent_token_status');
    if (r.error) throw r.error;
    st = r.data;
  } catch (e) { box.style.display = 'none'; return; }
  const expMs = st && st.exp ? new Date(st.exp).getTime() : 0;
  const left = expMs - Date.now();
  const soon = left > 0 && left < 3 * 3600 * 1000;
  if (!(st.expired || soon)) { box.style.display = 'none'; box.innerHTML = ''; return; }
  const msg = !st.exists
    ? 'توکن ازکی‌ایجنت ثبت نشده است.'
    : st.expired
      ? 'توکن ازکی‌ایجنت منقضی شده است؛ تا توکن تازه ثبت نشود، این تب به‌روز نمی‌شود.'
      : `توکن ازکی‌ایجنت حدود ${faDigits(Math.max(1, Math.round(left / 60000)))} دقیقه‌ی دیگر منقضی می‌شود.`;
  box.style.cssText = 'display:block;margin:0 0 12px;padding:12px 14px;border-radius:10px;background:var(--danger-soft);border:1px solid var(--danger);font-size:13px;line-height:1.7;';
  box.innerHTML = `<b>⚠ ${msg}</b><div style="margin-top:6px;opacity:.85;">در پنل ازکی‌ایجنت لاگین کن و در اکستنشن «آپدیت توکن» را بزن.</div>`;
}

async function loadAzkiActiveStatusView() {
  if (!azkiAllowed()) return;
  const { data, error } = await supabaseClient
    .from('center_operators_status')
    .select('*')
    .order('center_name', { ascending: true });

  if (error) {
    document.getElementById('azki-active-list').innerHTML = `<div class="empty-state">خطا در دریافت وضعیت: ${escHtml(error.message)}</div>`;
    return;
  }
  // فقط کارشناسان مرکز صدور (هر ردیفی که «مرکز صدور» تو هرکدوم از فیلدهای متنی‌ش باشه) نشون داده بشن.
  // نرمال‌سازی: حروف عربی/فارسی، نیم‌فاصله، کشیده، اعراب و فاصله‌های نامرئی یکی می‌شن.
  const normFa = (v) => String(v == null ? '' : v)
    .normalize('NFKC')
    .replace(/[\u200c\u200b\u200d\u200e\u200f\u202a-\u202e\u2060\ufeff\u00a0_\-]/g, ' ')
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[ۀە]/g, 'ه')
    .replace(/\s+/g, ' ');
  const isIssuanceCenterUser = (r) => Object.values(r).some(v =>
    typeof v === 'string' && /مرکز ?صدور/.test(normFa(v))
  );
  azkiState.activeStatus.rawCount = (data || []).length;
  azkiState.activeStatus.sample = (data || []).slice(0, 3);
  azkiState.activeStatus.rows = (data || []).filter(isIssuanceCenterUser);
  azkiState.activeStatus.loaded = true;

  renderAzkiActiveStatusView();
}

// لیست اسم کارشناس‌های «فعال و در حال صدور» شرکتی که روی چیپش کلیک شده
function renderAzkiActiveCompanyPeople() {
  const box = document.getElementById('azki-active-company-people');
  if (!box) return;
  const st = azkiState.activeStatus;
  const comp = st.selCompany;
  const people = comp && st.peopleByCompany ? st.peopleByCompany[comp] : null;
  if (!people || !people.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
  const sorted = people.slice().sort((a, b) =>
    String(a.center_name || '').localeCompare(String(b.center_name || ''), 'fa') ||
    String(a.full_name || '').localeCompare(String(b.full_name || ''), 'fa'));
  box.innerHTML = `
    <div class="acp-head">
      <span><b>${formatNumber(sorted.length)}</b> کارشناس فعال و در حال صدور — ${escHtml(comp)}</span>
      <button type="button" class="acp-close" data-acp-close title="بستن">✕</button>
    </div>
    <div class="acp-list">${sorted.map(m => `
      <div class="acp-item">
        <span class="admin-status-dot online"></span>
        <span class="acp-name">${escHtml(m.full_name || '—')}</span>
        <span class="acp-center">${escHtml(fmtCenterName(m.center_name || ''))}</span>
      </div>`).join('')}
    </div>`;
  box.style.display = '';
}

function azkiNormQ(v) {
  return String(v == null ? '' : v).normalize('NFKC')
    .replace(/[\u200c\u200b\u200d\u200e\u200f\u202a-\u202e\u2060\ufeff\u00a0_\-]/g, ' ')
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[ۀە]/g, 'ه')
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776))
    .replace(/\s+/g, ' ').trim().toLowerCase();
}
function renderAzkiActiveStatusView() {
  const rows = azkiState.activeStatus.rows;
  const container = document.getElementById('azki-active-list');

  if (!rows.length) {
    const raw = azkiState.activeStatus.rawCount || 0;
    const why = raw === 0
      ? 'سوپابیس هیچ ردیفی برنگردوند (اگه جدول داده داره، احتمالاً سیاست RLS اجازه‌ی خوندن به این کاربر نمیده)'
      : `${faDigits(raw)} ردیف از سوپابیس اومد ولی هیچ‌کدوم «مرکز صدور» تو متن‌شون نداشت. نمونه‌ی نام‌ها: ` +
        (azkiState.activeStatus.sample || []).map(r => `«${escHtml(r.full_name || '—')}» / «${escHtml(r.center_name || '—')}»`).join(' ، ');
    container.innerHTML = '<div class="empty-state">هنوز داده‌ای برای وضعیت فعال ثبت نشده<div style="margin-top:8px;font-size:12px;opacity:.75;">' + why + '</div></div>';
    document.getElementById('azki-active-total-active').textContent = '۰';
    document.getElementById('azki-active-total-online').textContent = '۰';
    document.getElementById('azki-active-by-company').textContent = '—';
    document.getElementById('azki-active-pct').textContent = '۰٪';
    return;
  }

  const groupsMap = new Map();
  rows.forEach(r => {
    const key = r.center_name || 'بدون سنتر';
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key).push(r);
  });

  // is_active = پنل کارشناس فعاله | is_active_to_issue = کارشناس در حال صدوره (آنلاین)
  let totalActive = 0, totalOnline = 0;
  const centerSummaries = Array.from(groupsMap.entries()).map(([centerName, members]) => {
    const sorted = members.slice().sort((a, b) => {
      const aOn = !!a.is_active_to_issue, bOn = !!b.is_active_to_issue;
      if (aOn !== bOn) return aOn ? -1 : 1;
      const aAct = !!a.is_active, bAct = !!b.is_active;
      if (aAct !== bAct) return aAct ? -1 : 1;
      return (a.full_name || '').localeCompare(b.full_name || '', 'fa');
    });
    const activeCount = sorted.filter(m => m.is_active).length;
    const onlineCount = sorted.filter(m => m.is_active_to_issue).length;
    totalActive += activeCount;
    totalOnline += onlineCount;
    return { centerName, members: sorted, activeCount, onlineCount, total: sorted.length };
  }).sort((a, b) => (b.onlineCount - a.onlineCount) || (b.activeCount - a.activeCount));

  document.getElementById('azki-active-total-active').textContent = formatNumber(totalActive);
  document.getElementById('azki-active-total-online').textContent = formatNumber(totalOnline);
  // تعداد کارشناسانی که هم پنلشون فعاله هم آنلاین (در حال صدور) هستن، به تفکیک شرکت
  {
    const byComp = {};
    const peopleByComp = {};
    rows.forEach(r => {
      if (!(r.is_active && r.is_active_to_issue)) return;
      String(r.companies || r.all_companies || '').split(/[،,]/).map(x => x.trim()).filter(Boolean)
        .forEach(c => { byComp[c] = (byComp[c] || 0) + 1; (peopleByComp[c] = peopleByComp[c] || []).push(r); });
    });
    const st = azkiState.activeStatus;
    st.peopleByCompany = peopleByComp;
    if (st.selCompany && !peopleByComp[st.selCompany]) st.selCompany = '';
    const entries = Object.entries(byComp).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fa'));
    const byCompEl = document.getElementById('azki-active-by-company');
    byCompEl.innerHTML = entries.length
      ? entries.map(([c, n]) => `<button type="button" class="admin-company-count${c === st.selCompany ? ' sel' : ''}" data-company="${escHtml(c)}" title="نمایش کارشناس‌های فعال ${escHtml(c)}"><b>${formatNumber(n)}</b> ${escHtml(c)}</button>`).join('')
      : '<span class="admin-company-empty">—</span>';
    if (!byCompEl.dataset.bound) {
      byCompEl.dataset.bound = '1';
      byCompEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-company]');
        if (!b) return;
        const s2 = azkiState.activeStatus;
        s2.selCompany = (s2.selCompany === b.dataset.company) ? '' : b.dataset.company;
        byCompEl.querySelectorAll('[data-company]').forEach(x => x.classList.toggle('sel', x.dataset.company === s2.selCompany));
        renderAzkiActiveCompanyPeople();
      });
      document.getElementById('azki-active-company-people').addEventListener('click', (e) => {
        if (!e.target.closest('[data-acp-close]')) return;
        azkiState.activeStatus.selCompany = '';
        byCompEl.querySelectorAll('[data-company]').forEach(x => x.classList.remove('sel'));
        renderAzkiActiveCompanyPeople();
      });
    }
    renderAzkiActiveCompanyPeople();
  }
  document.getElementById('azki-active-pct').textContent =
    faDigits(rows.length ? round2(totalActive / rows.length * 100) : 0) + '٪';

  const sInp = document.getElementById('azki-active-search');
  if (sInp && !sInp.dataset.bound) {
    sInp.dataset.bound = '1';
    let tm = null;
    sInp.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(renderAzkiActiveStatusView, 120); });
  }
  const q = azkiNormQ(sInp ? sInp.value : '');
  const shownGroups = q ? centerSummaries.map(g => {
    const byCenter = azkiNormQ(fmtCenterName(g.centerName)).includes(q);
    const ms = byCenter ? g.members : g.members.filter(m => azkiNormQ(m.full_name).includes(q));
    return { ...g, members: ms, activeCount: ms.filter(m => m.is_active).length, onlineCount: ms.filter(m => m.is_active_to_issue).length, total: ms.length };
  }).filter(g => g.members.length) : centerSummaries;
  container.innerHTML = !shownGroups.length ? '<div class="empty-state">کارشناسی با این نام پیدا نشد</div>' : shownGroups.map(g => {
    const rowsHtml = g.members.map(m => {
      const panelOn = !!m.is_active;
      const online = !!m.is_active_to_issue;
      // شرکت‌های فعال: فقط وقتی کارشناس فعاله (پنل فعال + در حال صدور) شرکت‌هاش نشون داده می‌شه
      const compList = String(m.companies || m.all_companies || '')
        .split(/[،,]/).map(x => x.trim()).filter(Boolean);
      const companiesHtml = (panelOn && online && compList.length)
        ? compList.map(c => `<span class="admin-company-chip">${escHtml(c)}</span>`).join('')
        : '<span class="admin-company-empty">—</span>';
      return `
        <div class="row-item">
          <div class="admin-row-name-wrap">
            <span class="admin-status-dot ${online ? 'online' : ''}"></span>
            <div class="admin-row-info">
              <span class="admin-row-name">${escHtml(m.full_name || '—')}</span>
            </div>
          </div>
          <div class="admin-companies-col" title="شرکت‌های فعال">${companiesHtml}</div>
          <div style="display:flex; gap:8px; align-items:center; justify-content:flex-end;">
            <span class="admin-status-badge ${panelOn ? 'online' : ''}" title="وضعیت پنل کارشناس">${panelOn ? 'فعال' : 'غیرفعال'}</span>
            <span class="admin-status-badge ${online ? 'online' : ''}" title="در حال صدور">${online ? 'آنلاین' : 'آفلاین'}</span>
          </div>
        </div>`;
    }).join('');
    return `
      <div class="leader-item${q ? ' open' : ''}">
        <button class="leader-header" type="button">
          <div class="leader-name-wrap">
            <svg class="leader-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            <span class="leader-name">${escHtml(fmtCenterName(g.centerName))}</span>
          </div>
          <div class="leader-right">
            <span class="leader-total">${formatNumber(g.activeCount)} فعال · ${formatNumber(g.onlineCount)} آنلاین از ${formatNumber(g.total)}</span>
          </div>
        </button>
        <div class="leader-details"><div class="leader-details-inner">${rowsHtml}</div></div>
      </div>`;
  }).join('');

  bindExpandableToggles(container);
}

// ============================================================
// تب «درصد صدور به تفکیک شیفت»: صدور ازکی سنترها به تفکیک شیفت بامداد (۰ تا ۸)، صبح (۸ تا ۱۶) و شب (۱۶ تا ۲۴)
// بر اساس ساعتِ «تاریخ صدور - میلادی» سفارش (کلید other در جدول = بامداد، evening = شب). داده از جدول azki_center_shift_report:
//   center_name = '__ALL__' → total_orders (کل صدور شیفت) + center_orders (صدور همه‌ی سنترها)
//   center_name = نام مرکز   → center_orders همون مرکز
// ============================================================
const AZKI_SHIFT_ALL = '__ALL__';
const AZKI_SHIFTS = [
  { key: 'other', title: 'شیفت بامداد', short: 'بامداد', hours: 'ساعت ۰ تا ۸',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 18a5 5 0 0 0-10 0"/><path d="M12 2v7M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1"/><polyline points="8 6 12 2 16 6"/></svg>' },
  { key: 'morning', title: 'شیفت صبح', short: 'صبح', hours: 'ساعت ۸ تا ۱۶',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>' },
  { key: 'evening', title: 'شیفت شب', short: 'شب', hours: 'ساعت ۱۶ تا ۲۴',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>' },
];

function azkiShiftEsc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function azkiPct(part, whole) { return whole ? round2(part / whole * 100) : 0; }
// درصد صدور «پایان شیفت»: تجمعی از ابتدای روز تا پایان همان شیفت (بامداد تا ساعت ۸، صبح تا ۱۶، شب تا ۲۴)
// = صدور ازکی سنتر تا پایان شیفت ÷ کل صدور تا پایان همان شیفت (ترتیب شیفت‌ها: بامداد ← صبح ← شب؛ روی بازه‌ی چندروزه جمع روزها)
const AZKI_SHIFT_END_LABEL = { other: 'تا ساعت ۸', morning: 'تا ساعت ۱۶', evening: 'تا ساعت ۲۴ (۰۰:۰۰)' };
function azkiShiftCumulative(g) {
  const out = {}; let c = 0, t = 0;
  AZKI_SHIFTS.forEach(sh => { c += g[sh.key].center; t += g[sh.key].total; out[sh.key] = { center: c, total: t }; });
  return out;
}
function emptyShiftBucket() {
  return { morning: { total: 0, center: 0 }, evening: { total: 0, center: 0 }, other: { total: 0, center: 0 } };
}

async function fetchAzkiShiftRows(scopes, bounds) {
  return fetchAllRows((from, to) =>
    supabaseClient
      .from(TABLE_AZKI_SHIFT)
      .select('*')
      .in('company_scope', scopes)
      .gte('report_date', bounds.startDate)
      .lte('report_date', bounds.endDate)
      .order('report_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
  );
}

// همه‌ی ردیف‌ها رو یک‌جا تجمیع می‌کنه: جمع کل بازه، به تفکیک دوره (روز/هفته/ماه) و به تفکیک مرکز
function aggregateAzkiShiftRows(rows, granularity) {
  const grand = emptyShiftBucket();
  const periods = {};   // periodKey -> { label, sortKey, all: bucket, centers: { name: bucket } }
  const centers = {};   // centerName -> bucket
  for (const r of rows) {
    const shift = r.shift;
    if (!grand[shift]) continue;
    const { jy, jm, jd } = parseJalaliParts(r.report_date_jalali);
    const { key, label } = azkiPeriodGroupKey(jy, jm, jd, granularity);
    if (!periods[key]) periods[key] = { key, label, sortKey: jy * 10000 + jm * 100 + jd, all: emptyShiftBucket(), centers: {} };
    const p = periods[key];
    p.sortKey = Math.min(p.sortKey, jy * 10000 + jm * 100 + jd);
    const center = Number(r.center_orders) || 0;
    if (r.center_name === AZKI_SHIFT_ALL) {
      const total = Number(r.total_orders) || 0;
      grand[shift].total += total; grand[shift].center += center;
      p.all[shift].total += total; p.all[shift].center += center;
    } else {
      if (!p.centers[r.center_name]) p.centers[r.center_name] = emptyShiftBucket();
      p.centers[r.center_name][shift].center += center;
      if (!centers[r.center_name]) centers[r.center_name] = emptyShiftBucket();
      centers[r.center_name][shift].center += center;
    }
  }
  return { grand, periods: Object.values(periods).sort((a, b) => a.sortKey - b.sortKey), centers };
}

function shiftCenterSum(b) { return b.morning.center + b.evening.center + b.other.center; }

function shiftTotalAll(b) { return b.morning.total + b.evening.total + b.other.total; }

function azkiShiftSplitBar(b) {
  const sum = shiftCenterSum(b);
  if (!sum) return '<div class="shift-split"></div>';
  const w = k => (b[k].center / sum * 100).toFixed(2);
  return `<div class="shift-split" title="بامداد ${faDigits(azkiPct(b.other.center, sum))}٪ — صبح ${faDigits(azkiPct(b.morning.center, sum))}٪ — شب ${faDigits(azkiPct(b.evening.center, sum))}٪">
    <span class="o" style="width:${w('other')}%"></span><span class="m" style="width:${w('morning')}%"></span><span class="e" style="width:${w('evening')}%"></span>
  </div>`;
}

// آخرین روزی که برای شیفت‌ها دیتا نوشته شده (مستقل از بازه و شرکت)؛ برای اینکه خالی بودن تب گنگ نباشه
async function fetchAzkiShiftLatest() {
  try {
    const { data, error } = await supabaseClient
      .from(TABLE_AZKI_SHIFT)
      .select('report_date, report_date_jalali')
      .order('report_date', { ascending: false })
      .limit(1);
    if (error || !data || !data.length) return null;
    return data[0];
  } catch (_) { return null; }
}

async function loadAzkiShiftsView() {
  if (!azkiAllowed()) return;
  const bounds = getAzkiBounds();
  document.getElementById('azki-shifts-label').textContent = azkiRangeText(bounds);

  const [{ data, error }, latest] = await Promise.all([
    fetchAzkiShiftRows(azkiActiveScopes(), bounds),
    fetchAzkiShiftLatest(),
  ]);
  if (bounds !== azkiState.bounds) return;
  if (error) {
    document.getElementById('azki-shifts-fresh').innerHTML = '';
    document.getElementById('azki-shifts-cards').innerHTML = '';
    document.getElementById('azki-shifts-list').innerHTML = `<div class="empty-state">خطا در دریافت گزارش: ${azkiShiftEsc(error.message)}</div>`;
    return;
  }
  azkiState.shifts.rows = data || [];
  azkiState.shifts.latest = latest;
  azkiState.shifts.loaded = true;
  renderAzkiShiftsView();
}

// اگه آخر بازه‌ی انتخابی از آخرین دیتای ثبت‌شده جلوتره، بنر هشدار + دکمه‌ی رفتن به آخرین روز دارای دیتا
function renderAzkiShiftsFresh() {
  const el = document.getElementById('azki-shifts-fresh');
  if (!el) return;
  const latest = azkiState.shifts.latest;
  const bounds = azkiState.bounds;
  if (!latest || !bounds || latest.report_date >= bounds.endDate) { el.innerHTML = ''; return; }
  const lbl = faDigits(latest.report_date_jalali);
  const empty = !azkiState.shifts.rows.length;
  el.innerHTML = `<div class="shift-stale">
    <div>${empty ? 'برای این بازه دیتایی در گزارش شیفت‌ها نیست. ' : ''}دیتای شیفت‌ها فقط تا <b>${lbl}</b> ثبت شده و بعد از آن به‌روزرسانی نشده؛ پس اعداد روزهای بعد از این تاریخ خالی یا ناقص نمایش داده می‌شن.</div>
    <button type="button" id="azki-shifts-goto-latest">نمایش ${lbl}</button>
  </div>`;
  const btn = document.getElementById('azki-shifts-goto-latest');
  if (btn) btn.onclick = () => {
    const { jy, jm, jd } = parseJalaliParts(latest.report_date_jalali);
    azkiSetDate('from', [jy, jm, jd]);
    azkiSetDate('to', [jy, jm, jd]);
    azkiApplyRange();
  };
}

function renderAzkiShiftsView() {
  renderAzkiShiftsFresh();
  const rows = azkiState.shifts.rows;
  const cardsEl = document.getElementById('azki-shifts-cards');
  const container = document.getElementById('azki-shifts-list');
  const agg = aggregateAzkiShiftRows(rows, azkiState.granularity);
  const g = agg.grand;
  const centerAll = shiftCenterSum(g);
  const totalAll = shiftTotalAll(g);

  // ---------- کارت‌های بالای صفحه ----------
  // «تأثیر روی درصد صدور» = صدور ازکی سنتر در این شیفت ÷ کل صدور (همه‌ی شیفت‌ها)؛ جمع سه شیفت = درصد صدور کل بازه
  const summary = rows.length
    ? `<div class="shift-summary">جمع تأثیر شیفت‌ها = درصد صدور کل بازه: <b>${formatNumber(azkiPct(centerAll, totalAll))}٪</b> (${formatNumber(centerAll)} از ${formatNumber(totalAll)} صدور)</div>`
    : '';
  const cum = azkiShiftCumulative(g);
  cardsEl.innerHTML = summary + AZKI_SHIFTS.map(sh => {
    const b = g[sh.key];
    const endPct = azkiPct(cum[sh.key].center, cum[sh.key].total);   // درصد صدور تا پایان این شیفت
    const impact = azkiPct(b.center, totalAll);          // چند درصد از کل صدور را در این شیفت زدیم
    const pctOfShift = azkiPct(b.center, b.total);       // درصد صدور خودِ این شیفت
    const pctOfCenters = azkiPct(b.center, centerAll);   // سهم این شیفت از صدور ازکی سنتر
    return `
      <div class="shift-card">
        <div class="shift-card-head">
          <span class="shift-card-title">${sh.icon}${sh.title}</span>
          <span class="shift-card-hours">${sh.hours}</span>
        </div>
        <div class="shift-card-count">${formatNumber(b.center)}<small>صدور ازکی سنتر</small></div>
        <div class="shift-card-metrics">
          <div class="shift-metric">
            <div class="shift-metric-row"><span>درصد تأثیرگذاری (از کل صدور ${formatNumber(totalAll)})</span><b>${formatNumber(impact)}٪</b></div>
            <div class="shift-bar"><i style="width:${Math.min(100, impact)}%"></i></div>
          </div>
          <div class="shift-metric">
            <div class="shift-metric-row"><span>سهم از صدور ازکی سنتر (${formatNumber(centerAll)})</span><b>${formatNumber(pctOfCenters)}٪</b></div>
            <div class="shift-bar"><i style="width:${Math.min(100, pctOfCenters)}%"></i></div>
          </div>
          <div class="shift-metric">
            <div class="shift-metric-row"><span>درصد صدور همین شیفت (از ${formatNumber(b.total)})</span><b>${formatNumber(pctOfShift)}٪</b></div>
            <div class="shift-bar"><i style="width:${Math.min(100, pctOfShift)}%"></i></div>
          </div>
          <div class="shift-metric">
            <div class="shift-metric-row"><span>درصد صدور پایان شیفت (${AZKI_SHIFT_END_LABEL[sh.key]}؛ ${formatNumber(cum[sh.key].center)} از ${formatNumber(cum[sh.key].total)})</span><b>${formatNumber(endPct)}٪</b></div>
            <div class="shift-bar"><i style="width:${Math.min(100, endPct)}%"></i></div>
          </div>
        </div>
      </div>`;
  }).join('');

  if (!rows.length) {
    container.innerHTML = '<div class="empty-state">ردیفی برای این بازه پیدا نشد</div>';
    return;
  }

  if (azkiState.shifts.mode === 'center') {
    const names = Object.keys(agg.centers).sort((a, b) => shiftCenterSum(agg.centers[b]) - shiftCenterSum(agg.centers[a]));
    if (!names.length) { container.innerHTML = '<div class="empty-state">صدوری از مراکز در این بازه ثبت نشده</div>'; return; }
    container.innerHTML = names.map(name => {
      const b = agg.centers[name];
      const sum = shiftCenterSum(b);
      const parts = AZKI_SHIFTS.map(sh => `${sh.short}: ${formatNumber(b[sh.key].center)} (${formatNumber(azkiPct(b[sh.key].center, sum))}٪)`).join(' — ');
      return `
        <div class="row-item shift-center-row">
          <div class="row-date">${azkiShiftEsc(fmtCenterName(name))}</div>
          <div class="row-main">
            <span>${parts}</span>
            ${azkiShiftSplitBar(b)}
          </div>
          <div class="row-badge">${formatNumber(sum)}</div>
        </div>`;
    }).join('');
    return;
  }

  // ---------- حالت «بر اساس تاریخ»: هر دوره قابل باز شدن به تفکیک مرکز ----------
  const periodsHtml = agg.periods.slice().reverse().map(p => {
    const pTotal = shiftTotalAll(p.all), pCenter = shiftCenterSum(p.all);
    const cNames = Object.keys(p.centers).sort((a, b) => shiftCenterSum(p.centers[b]) - shiftCenterSum(p.centers[a]));
    const inner = cNames.length ? cNames.map(name => {
      const b = p.centers[name];
      return `
        <div class="row-item">
          <div class="row-date">${azkiShiftEsc(fmtCenterName(name))}</div>
          <div class="row-main">${AZKI_SHIFTS.map(sh => `${sh.short}: ${formatNumber(b[sh.key].center)}`).join(' — ')}</div>
          <div class="row-badge">${formatNumber(shiftCenterSum(b))}</div>
        </div>`;
    }).join('') : '<div class="empty-state">صدوری از مراکز ثبت نشده</div>';
    const stats = AZKI_SHIFTS.map(sh =>
      `<div class="azki-stat"><span class="k">${sh.short} (تعداد · تأثیر)</span><span class="v">${formatNumber(p.all[sh.key].center)} · ${formatNumber(azkiPct(p.all[sh.key].center, pTotal))}٪</span></div>`
    ).join('');
    return `
      <div class="leader-item">
        <button class="leader-header azki-head" type="button">
          <div class="leader-name-wrap">
            <svg class="leader-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            <span class="leader-name">${azkiShiftEsc(p.label)}</span>
          </div>
          <div class="azki-stats">
            ${stats}
            <div class="azki-stat pct"><span class="k">درصد صدور (جمع)</span><span class="v">${formatNumber(azkiPct(pCenter, pTotal))}٪</span></div>
          </div>
        </button>
        <div class="leader-details"><div class="leader-details-inner">${inner}</div></div>
      </div>`;
  }).join('');

  container.innerHTML = periodsHtml;
  bindExpandableToggles(container);
}

document.querySelectorAll('#azki-shifts-mode .sm-stab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#azki-shifts-mode .sm-stab').forEach(b => b.classList.toggle('active', b === btn));
    azkiState.shifts.mode = btn.dataset.shiftMode;
    if (azkiState.shifts.loaded) renderAzkiShiftsView();
  });
});

// Payroll rate tiers based on each center's average issuance time (minutes).
// A center's average time below the first tier's minimum still uses the first
// (best) rate, and an average above the last tier's maximum still uses the
// last (lowest) rate — every center gets exactly one rate.
const AZKI_PAYROLL_RATE_TIERS = [
  { min: 20, max: 40,  rate: 400000 },
  { min: 40, max: 90,  rate: 300000 },
  { min: 90, max: 180, rate: 200000 },
];
function azkiPayrollRateForAvgMinutes(avgMin) {
  // مرکزی که میانگین زمان صدور (SLA) نداره نرخ صفر می‌گیره و مبلغی براش حساب نمی‌شه
  if (avgMin == null) return 0;
  for (const t of AZKI_PAYROLL_RATE_TIERS) {
    if (avgMin <= t.max) return t.rate;
  }
  return AZKI_PAYROLL_RATE_TIERS[AZKI_PAYROLL_RATE_TIERS.length - 1].rate;
}
function renderAzkiRateRows() {
  const el = document.getElementById('azki-rate-rows');
  if (!el) return;
  el.innerHTML = AZKI_PAYROLL_RATE_TIERS.map(t => `
    <div class="azki-rate-row">
      <span class="azki-rate-range">صدور با میانگین زمانی از ${faDigits(t.min)} دقیقه تا حداکثر ${faDigits(t.max)} دقیقه</span>
      <span class="azki-rate-amount">${formatNumber(t.rate)} ریال</span>
    </div>`).join('');
}

// نام مرکز رو برای match کردن یکسان می‌کنه: «مرکز صدور کیانی» و «کیانی» و «مرکز‌صدور  كياني» همه یک کلید می‌شن.
// (اسم مرکز تو گزارش تفکیک مراکز همیشه با پیشوند «مرکز صدور» میاد ولی full_name پروفایل سنتر ممکنه بدون پیشوند باشه)
function normCenterKey(name) {
  return String(name == null ? '' : name)
    .replace(/[‌​‎‏ ]/g, ' ')
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
    .replace(/مرکز\s*صدور/g, ' ')
    .replace(/[|()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// میانگین زمان صدور (OCT) هر مرکز فقط از گزارش «SLA اپراتورها» (کارت ۲۰۵۱۶ متابیس →
// daily_targets.avg_issuance_minutes) خونده می‌شه. دیگه از زمان خرید/بستنِ گزارش مالی ازکی ایجنت
// (oct_sum_hours جدول تفکیک مراکز) به‌عنوان جایگزین استفاده نمی‌شه؛ اگه SLA نبود «—» نشون داده می‌شه.
function computeAzkiPayrollCenterData(rows, slaByCenterKey) {
  const byCenter = {};
  rows.forEach(r => {
    const name = r.center_name || 'نامشخص';
    if (!byCenter[name]) byCenter[name] = { count: 0 };
    byCenter[name].count += r.orders_count || 0;
  });
  return Object.keys(byCenter)
    .map(name => {
      const c = byCenter[name];
      const key = normCenterKey(name);
      const avgMin = (slaByCenterKey && slaByCenterKey[key] != null) ? slaByCenterKey[key] : null;
      const rate = azkiPayrollRateForAvgMinutes(avgMin);
      return { name, count: c.count, avgMin, hasSla: avgMin != null, rate, amount: rate * c.count };
    })
    .sort((a, b) => b.count - a.count);
}

// { normCenterKey(نام مرکز): میانگین زمان صدور به دقیقه } برای دوره‌ی ۲۱ تا ۲۰ که تاریخ شروعِ فیلتر داخلشه.
// منبع اصلی: جدول center_sla_report که n8n مستقیم از گزارش SLA اپراتورها (کارت ۲۰۵۱۶) پر می‌کنه
// (ردیف‌های «مرکز صدور X | کارشناس» → میانگین وزنی مرکز X). برای مرکزی که اونجا نبود، از SLA
// کارشناس‌های اساین‌شده به اون سنتر (daily_targets.avg_issuance_minutes از طریق center_agents) استفاده می‌شه.
// SLA برای کل دوره حساب می‌شه، پس فیلتر «فقط امروز» هم همون عدد دوره رو نشون می‌ده.
const TABLE_CENTER_SLA = 'center_sla_report';

async function fetchAzkiPayrollCenterSla(bounds) {
  const s = parseJalaliParts(bounds.startLabel);
  const pStart = periodStartSortOfJalali(s.jy, s.jm, s.jd);
  const pStartY = Math.floor(pStart / 10000), pStartM = Math.floor(pStart / 100) % 100;
  const pEnd = pStartM < 12 ? pStartY * 10000 + (pStartM + 1) * 100 + 20 : (pStartY + 1) * 10000 + 100 + 20;

  const byCenterKey = {};
  let firstError = null;

  // ۱) SLA مستقیم مراکز
  const { data: centerSlaRows, error: centerSlaErr } = await supabaseClient
    .from(TABLE_CENTER_SLA)
    .select('center_key, center_name, avg_issuance_minutes')
    .eq('period_start_sort', pStart);
  if (centerSlaErr) {
    console.warn('جدول center_sla_report در دسترس نیست (SQL مهاجرت اجرا شده؟):', centerSlaErr.message);
  } else {
    (centerSlaRows || []).forEach(r => {
      const key = normCenterKey(r.center_key || r.center_name);
      const v = Number(r.avg_issuance_minutes);
      if (key && r.avg_issuance_minutes != null && isFinite(v)) byCenterKey[key] = round2(v);
    });
  }

  // ۲) جایگزین: میانگین SLA کارشناس‌های اساین‌شده به هر سنتر
  const { data: centerProfiles, error: centersErr } = await fetchAllRows((from, to) =>
    supabaseClient.from(TABLE_PROFILES).select('id, full_name').eq('role', 'center').range(from, to)
  );
  if (centersErr) return { byCenterKey, error: centersErr };
  const centerKeyById = {};
  (centerProfiles || []).forEach(c => { centerKeyById[c.id] = normCenterKey(c.full_name); });

  const { data: links, error: linksErr } = await fetchAllRows((from, to) =>
    supabaseClient.from(TABLE_CENTER_AGENTS).select('center_id, agent_id').range(from, to)
  );
  if (linksErr) return { byCenterKey, error: linksErr };

  const validLinks = (links || []).filter(l => centerKeyById[l.center_id] && byCenterKey[centerKeyById[l.center_id]] == null);
  const agentIds = [...new Set(validLinks.map(l => l.agent_id).filter(Boolean))];
  if (agentIds.length) {
    const { data: slaRows, error: slaErr } = await fetchAllRows((from, to) =>
      supabaseClient
        .from(TABLE_TARGETS)
        .select('agent_id, report_date_sort, avg_issuance_minutes')
        .in('agent_id', agentIds)
        .gte('report_date_sort', pStart)
        .lte('report_date_sort', pEnd)
        .order('report_date_sort', { ascending: true })
        .range(from, to)
    );
    if (slaErr) firstError = slaErr;
    const agentSla = buildSlaMapFromRows(slaRows || [], pStart) || {};
    const sumByCenter = {};
    validLinks.forEach(l => {
      const v = agentSla[l.agent_id];
      if (v == null) return;
      const key = centerKeyById[l.center_id];
      if (!sumByCenter[key]) sumByCenter[key] = { sum: 0, n: 0 };
      sumByCenter[key].sum += v;
      sumByCenter[key].n += 1;
    });
    Object.keys(sumByCenter).forEach(key => {
      byCenterKey[key] = round2(sumByCenter[key].sum / sumByCenter[key].n);
    });
  }
  return { byCenterKey, error: firstError };
}

// نمایش نام سنتر: پیش‌فرض با پیشوند «مرکز صدور» (اگه خودش با این عبارت شروع شده باشه دوباره اضافه نمی‌شه)
function fmtCenterName(name) {
  const n = String(name == null ? '' : name).trim();
  if (!n || n === 'بدون سنتر' || n === 'نامشخص' || n === '—' || n === '__ALL__') return n;
  return /^مرکز\s*صدور/.test(n.replace(/[\u200c]/g, ' ')) ? n : 'مرکز صدور ' + n;
}

// سنترهای اساین‌شده به سرگروه (کلید نرمال‌شده‌ی نام) برای محدود کردن محاسبه‌ی «فقط تعداد»
async function fetchLeaderCenterKeys() {
  const leaderId = window.teamLeaderId;
  if (!leaderId) return new Set();
  const { data: links, error: e1 } = await fetchAllRows((from, to) =>
    supabaseClient.from(TABLE_LEADER_CENTERS).select('center_id').eq('leader_id', leaderId).range(from, to));
  if (e1) throw new Error(e1.message);
  const ids = (links || []).map(l => l.center_id).filter(Boolean);
  if (!ids.length) return new Set();
  const { data: profs, error: e2 } = await fetchAllRows((from, to) =>
    supabaseClient.from(TABLE_PROFILES).select('id, full_name, status').in('id', ids).range(from, to));
  if (e2) throw new Error(e2.message);
  return new Set((profs || []).filter(c => c.status !== 'disabled').map(c => normCenterKey(c.full_name)).filter(Boolean));
}

async function loadAzkiPayrollView() {
  if (!azkiAllowed()) return;
  const bounds = getAzkiBounds();
  document.getElementById('azki-payroll-label').textContent = azkiRangeText(bounds);
  renderAzkiRateRows();

  const isLeader = currentUserRole === 'leader';
  let leaderKeys = null;
  if (isLeader) {
    try { leaderKeys = await fetchLeaderCenterKeys(); }
    catch (e) {
      document.getElementById('azki-payroll-list').innerHTML = `<div class="empty-state">خطا در دریافت سنترهای شما: ${escHtml(e.message)}</div>`;
      return;
    }
  }
  const [breakdownRes, slaRes] = await Promise.all([
    fetchAzkiBreakdownRows(azkiActiveScopes(), bounds),
    isLeader ? Promise.resolve({ byCenterKey: {}, error: null }) : fetchAzkiPayrollCenterSla(bounds),
  ]);
  if (bounds !== azkiState.bounds) return;
  if (breakdownRes.error) {
    document.getElementById('azki-payroll-list').innerHTML = `<div class="empty-state">خطا در دریافت گزارش: ${escHtml(breakdownRes.error.message)}</div>`;
    return;
  }
  if (slaRes.error) console.error('خطا در دریافت گزارش SLA اپراتورها:', slaRes.error.message);
  azkiState.payroll.leaderKeys = leaderKeys;
  const rawRows = breakdownRes.data || [];
  // تطبیق نام سنتر: برابری کامل کلید نرمال‌شده، یا شامل بودن یکی در دیگری (مثلاً «رضوانی» و «رضوانی شعبه ۲»)
  const keyMatchesLeader = name => {
    if (!leaderKeys) return true;
    const k = normCenterKey(name);
    if (!k) return false;
    if (leaderKeys.has(k)) return true;
    for (const lk of leaderKeys) { if (lk.length >= 3 && k.length >= 3 && (k.includes(lk) || lk.includes(k))) return true; }
    return false;
  };
  azkiState.payroll.rawCount = rawRows.length;
  azkiState.payroll.rawNames = [...new Set(rawRows.map(r => r.center_name).filter(Boolean))].slice(0, 5);
  azkiState.payroll.rows = rawRows.filter(r => keyMatchesLeader(r.center_name));

  azkiState.payroll.slaByCenterKey = slaRes.byCenterKey || {};
  azkiState.payroll.loaded = true;
  renderAzkiPayrollView();
}

function renderAzkiPayrollView() {
  renderAzkiRateRows();
  const rows = azkiState.payroll.rows;
  const container = document.getElementById('azki-payroll-list');
  if (!rows.length) {
    let why = '';
    if (currentUserRole === 'leader') {
      const st = azkiState.payroll, lk = st.leaderKeys ? [...st.leaderKeys] : [];
      if (!lk.length) why = 'هیچ سنتری به شما اساین نشده (یا دسترسی خواندن جدول leader_centers/profiles بسته است).';
      else if (!st.rawCount) why = 'برای این بازه و شرکت‌های انتخاب‌شده گزارشی در سیستم ثبت نشده.';
      else why = `${faDigits(st.rawCount)} ردیف گزارش هست ولی نام هیچ‌کدوم با سنترهای شما (${lk.slice(0, 3).join('، ')}) نمی‌خونه. نمونه‌ی نام‌ها در گزارش: ${(st.rawNames || []).join('، ')}`;
    }
    container.innerHTML = '<div class="empty-state">ردیفی برای این بازه پیدا نشد' + (why ? `<div style="margin-top:8px;font-size:12px;opacity:.75;">${why}</div>` : '') + '</div>';
    document.getElementById('azki-payroll-center-count').textContent = '۰';
    document.getElementById('azki-payroll-total').textContent = '۰';
    document.getElementById('azki-payroll-amount').textContent = '۰';
    return;
  }

  const centerData = computeAzkiPayrollCenterData(rows, azkiState.payroll.slaByCenterKey);
  const grandCount = centerData.reduce((s, c) => s + c.count, 0);
  const grandAmount = centerData.reduce((s, c) => s + c.amount, 0);

  if (currentUserRole === 'leader') {
    document.getElementById('azki-payroll-center-count').textContent = formatNumber(centerData.length);
    document.getElementById('azki-payroll-total').textContent = formatNumber(grandCount);
    container.innerHTML = centerData.map(c => `
      <div class="row-item">
        <div class="pay-name">${escHtml(c.name)}</div>
        <div class="row-badge">${formatNumber(c.count)}</div>
      </div>`).join('');
    return;
  }

  document.getElementById('azki-payroll-center-count').textContent = formatNumber(centerData.length);
  document.getElementById('azki-payroll-total').textContent = formatNumber(grandCount);
  document.getElementById('azki-payroll-amount').innerHTML = `${formatNumber(grandAmount)}<span class="unit">ریال</span>`;

  container.innerHTML = centerData.map(c => `
    <div class="row-item azki-payroll-row">
      <div class="pay-name">${escHtml(c.name)}</div>
      <div class="pay-metrics">
        <div class="pay-metric"><span class="k">تعداد صدور</span><span class="v">${formatNumber(c.count)}</span></div>
        <div class="pay-metric${c.hasSla ? '' : ' is-missing'}" title="منبع: گزارش SLA اپراتورها">
          <span class="k">میانگین زمان صدور (SLA)</span>
          <span class="v">${c.hasSla ? `${formatNumber(c.avgMin)}<small>دقیقه</small>` : 'ثبت نشده'}</span>
        </div>
        <div class="pay-metric"><span class="k">نرخ هر صدور</span><span class="v">${formatNumber(c.rate)}<small>ریال</small></span></div>
      </div>
      <div class="row-badge pay-amount">${formatNumber(c.amount)}<small>ریال</small></div>
    </div>`).join('');
}

let xlsxLibPromise = null;
function ensureXlsxLib() {
  // xlsx-js-style: a drop-in fork of SheetJS that keeps the same XLSX.* API
  // but also honors per-cell `s` (style) objects — the plain "xlsx" build
  // used before ignores styling entirely.
  if (window.XLSX && window.XLSX.__hasStyleSupport) return Promise.resolve();
  if (!xlsxLibPromise) {
    xlsxLibPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.integrity = 'sha384-OUW9euuUyxyHcAhTqbhI+Iyb8LMssXt/cpz0yXhs9UWG2/R/uaWdakx/4cfww7Vb'; s.crossOrigin = 'anonymous';
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
      s.onload = () => { if (window.XLSX) window.XLSX.__hasStyleSupport = true; resolve(); };
      s.onerror = () => reject(new Error('load failed: xlsx lib'));
      document.head.appendChild(s);
    });
    xlsxLibPromise.catch(() => { xlsxLibPromise = null; });
  }
  return xlsxLibPromise;
}

// «انتقالی» = تعداد سفارش‌های «انتقال تخفیفی = بله» (daily_targets.discount_transfer_count). فقط نمایشیه؛
// هیچ نقشی تو محاسبه‌ی نرخ و مبلغ حقوق نداره. null = n8n هنوز مقدارش رو برای اون روز ننوشته.
function payTransferOf(r) {
  if (r.discount_transfer_count == null) return null;
  return Math.min(Number(r.target_count) || 0, Math.max(0, Number(r.discount_transfer_count) || 0));
}
// مقدار سلول اکسل/نمایش برای مجموع انتقالیِ یک کارشناس: اگه همه‌ی روزهاش ثبت‌نشده بود «—»
function payTransferCell(a) {
  if (a.synthetic) return '';
  if (a.transferUnknown > 0 && a.transfer === 0 && a.transferUnknown >= a.count) return '—';
  return a.transfer;
}
// ریز صدور تک‌تک کارشناس‌ها در بازه‌ی محاسبه حقوق (از daily_targets).
// کارشناسی که از سنتر حذف شده هم اگه ردیف صدور داشته باشه میاد و با وضعیت «از سنتر حذف شده» مشخص می‌شه.
async function fetchAzkiPayrollAgentDetail(bounds, centerData) {
  const s0 = parseJalaliParts(bounds.startLabel), e0 = parseJalaliParts(bounds.endLabel);
  const startSort = s0.jy * 10000 + s0.jm * 100 + s0.jd;
  const endSort = e0.jy * 10000 + e0.jm * 100 + e0.jd;

  const { data: rows, error: rowsErr } = await fetchAllRows((from, to) =>
    supabaseClient.from(TABLE_TARGETS).select('agent_id,report_date,report_date_jalali,report_date_sort,target_count,avg_issuance_minutes,discount_transfer_count')
      .gte('report_date_sort', startSort).lte('report_date_sort', endSort)
      .order('report_date_sort', { ascending: true }).order('agent_id', { ascending: true })
      .range(from, to));
  if (rowsErr) throw new Error('دریافت ریز صدور کارشناس‌ها: ' + rowsErr.message);

  const agentIds = [...new Set((rows || []).map(r => r.agent_id).filter(Boolean))];
  if (!agentIds.length) return { agents: [], days: [] };

  const [{ data: profs }, { data: links }, { data: centers }] = await Promise.all([
    fetchAllRows((from, to) => supabaseClient.from(TABLE_PROFILES).select('id, full_name, backoffice_id, role, status').in('id', agentIds).range(from, to)),
    fetchAllRows((from, to) => supabaseClient.from(TABLE_CENTER_AGENTS).select('center_id, agent_id').in('agent_id', agentIds).range(from, to)),
    fetchAllRows((from, to) => supabaseClient.from(TABLE_PROFILES).select('id, full_name').eq('role', 'center').range(from, to)),
  ]);
  const profById = {}; (profs || []).forEach(p0 => { profById[p0.id] = p0; });
  const centerNameById = {}; (centers || []).forEach(c => { centerNameById[c.id] = c.full_name || ''; });
  const centerByAgent = {};
  (links || []).forEach(l => { if (centerNameById[l.center_id] != null) centerByAgent[l.agent_id] = centerNameById[l.center_id]; });

  const rateByCenterKey = {};
  centerData.forEach(c => { rateByCenterKey[normCenterKey(c.name)] = { rate: c.rate, avgMin: c.avgMin }; });

  const slaMap = buildSlaMapFromRows(rows, startSort) || {};
  const byAgent = {};
  const days = [];
  (rows || []).forEach(r => {
    const id = r.agent_id;
    if (!byAgent[id]) byAgent[id] = { id, count: 0, daysCount: 0, transfer: 0, unknown: 0 };
    const c = Number(r.target_count) || 0;
    const tr = payTransferOf(r);
    byAgent[id].count += c;
    byAgent[id].daysCount += 1;
    if (tr == null) byAgent[id].unknown += c; else byAgent[id].transfer += tr;
    days.push({ id, date: toJalaliDisplay(r.report_date_jalali), sort: Number(r.report_date_sort) || 0, count: c, transfer: tr });
  });

  const agents = Object.values(byAgent).map(a => {
    const pr = profById[a.id];
    const centerName = centerByAgent[a.id] || '';
    // نام سنتر در پروفایل کامله («امیرحسین خوش سیرت») ولی کلید گزارش مالی کوتاهه («خوش سیرت»)؛
    // اول تطبیق دقیق، بعد فقط اگه دقیقاً یک کلید به‌صورت کلمه‌ی کامل داخل نام باشه.
    let info = null, payKey = '';
    if (centerName) {
      const ck = normCenterKey(centerName);
      if (rateByCenterKey[ck]) { info = rateByCenterKey[ck]; payKey = ck; }
      else {
        const hits = Object.keys(rateByCenterKey).filter(k => k && (' ' + ck + ' ').includes(' ' + k + ' '));
        if (hits.length === 1) { info = rateByCenterKey[hits[0]]; payKey = hits[0]; }
      }
    }
    const rate = info ? info.rate : 0;
    return {
      id: a.id,
      name: pr ? (pr.full_name || pr.backoffice_id || '—') : 'کاربر حذف‌شده / نامشخص',
      backoffice: pr ? (pr.backoffice_id || '') : '',
      centerName: centerName || 'بدون سنتر', payKey,
      status: pr && pr.status === 'disabled' ? 'غیرفعال' : (centerName ? 'در سنتر' : 'از سنتر حذف شده'),
      count: a.count, daysCount: a.daysCount, transfer: a.transfer, transferUnknown: a.unknown,
      sla: slaMap[a.id] != null ? round2(Number(slaMap[a.id])) : null,
      rate, amount: rate * a.count,
    };
  }).sort((a, b) => a.centerName.localeCompare(b.centerName, 'fa') || b.count - a.count);

  // اختلافِ «تعداد صدور سنتر» (گزارش مالی) با جمعِ کارشناس‌ها (daily_targets): کارشناس‌های حذف‌شده از سیستم،
  // پنل‌های «آموزش» و کسی که بین دو سنتر مشترکه ریز روزانه ندارن. این ردیف باقی‌مونده رو اضافه می‌کنیم تا
  // جمع ریز کارشناس‌ها با جمع سنتر بخونه. (فقط وقتی مثبته؛ اگه منفی بود یعنی کارشناس مشترک بین دو سنتره.)
  const sumByKey = {};
  agents.forEach(a => { if (a.payKey) sumByKey[a.payKey] = (sumByKey[a.payKey] || 0) + a.count; });
  const dispByKey = {};
  agents.forEach(a => { if (a.payKey && !dispByKey[a.payKey]) dispByKey[a.payKey] = a.centerName; });
  centerData.forEach(c => {
    const k = normCenterKey(c.name);
    const rest = c.count - (sumByKey[k] || 0);
    if (rest > 0) agents.push({
      id: '__rest__' + k, name: 'سایر (کارشناس حذف‌شده / پنل آموزش / ثبت‌نشده)', backoffice: '',
      centerName: dispByKey[k] || c.name, payKey: k, synthetic: true,
      status: 'باقی‌مانده نسبت به جمع سنتر', count: rest, daysCount: '', transfer: 0, transferUnknown: 0, sla: null,
      rate: c.rate, amount: c.rate * rest,
    });
  });
  agents.sort((a, b) => a.centerName.localeCompare(b.centerName, 'fa') || (a.synthetic ? 1 : 0) - (b.synthetic ? 1 : 0) || b.count - a.count);

  const nameById = {}; agents.forEach(a => { nameById[a.id] = a; });
  const dayRows = days.map(d => ({ ...d, agent: nameById[d.id] })).sort((a, b) =>
    a.agent.centerName.localeCompare(b.agent.centerName, 'fa') || a.agent.name.localeCompare(b.agent.name, 'fa') || a.sort - b.sort);
  return { agents, days: dayRows };
}

// جمع انتقالیِ هر سنتر از روی ریز کارشناس‌ها (کلید = normCenterKey(نام سنتر در گزارش مالی)).
// کارشناس‌های حذف‌شده/ثبت‌نشده (ردیف «سایر») ریز ندارن و تو این جمع نمیان.
function azkiCenterTransferMap(detail) {
  const m = {};
  ((detail && detail.agents) || []).forEach(a => {
    if (a.synthetic || !a.payKey) return;
    const o = m[a.payKey] || (m[a.payKey] = { transfer: 0, unknown: 0, count: 0 });
    o.transfer += a.transfer || 0; o.unknown += a.transferUnknown || 0; o.count += a.count || 0;
  });
  return m;
}
function azkiCenterTransferCell(map, centerName) {
  const o = map[normCenterKey(centerName)];
  if (!o) return '—';
  return (o.unknown >= o.count && o.count > 0 && o.transfer === 0) ? '—' : o.transfer;
}

// فقط برای خروجی اکسل: نام کوتاه/فامیلیِ مرکز در گزارش مالی («رضوانی») رو به نام کاملِ پروفایل سنتر
// («مرکز صدور مجید رضوانی») تبدیل می‌کنه. محاسبه‌ها (SLA، نرخ، جمع) هنوز با همون نام قبلی انجام می‌شن؛
// این فقط برچسبِ نمایشی ستون «نام سنتر» رو عوض می‌کنه. اگه نام با هیچ پروفایلی نخونه یا با بیش از یک
// پروفایل جدا بخونه (مثلاً دو سنتر هم‌فامیل)، همون نام قبلی می‌مونه تا اشتباه نشه.
async function azkiResolveCenterDisplayNames(centerData) {
  const out = {};
  try {
    const { data: centers } = await fetchAllRows((from, to) =>
      supabaseClient.from(TABLE_PROFILES).select('id, full_name').eq('role', 'center').range(from, to));
    const list = (centers || [])
      .map(c => ({ full: String(c.full_name || '').trim(), key: normCenterKey(c.full_name) }))
      .filter(c => c.full && c.key);
    centerData.forEach(c => {
      const k = normCenterKey(c.name);
      if (!k) return;
      let m = list.filter(x => x.key === k);
      if (!m.length) m = list.filter(x => (' ' + x.key + ' ').includes(' ' + k + ' '));
      const uniq = [...new Set(m.map(x => x.full))];
      if (uniq.length === 1) out[c.name] = uniq[0];
    });
  } catch (e) {
    console.warn('نام کامل سنترها برای اکسل دریافت نشد، نام قبلی استفاده می‌شه:', e);
  }
  return out;
}

async function exportAzkiPayrollExcel() {
  const btn = document.getElementById('azki-export-btn');
  if (!azkiState.payroll.loaded || !azkiState.payroll.rows.length) return;
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'در حال آماده‌سازی...';
  try {
    await ensureXlsxLib();
    const centerData = computeAzkiPayrollCenterData(azkiState.payroll.rows, azkiState.payroll.slaByCenterKey);
    const grandCount = centerData.reduce((s, c) => s + c.count, 0);
    const grandAmount = centerData.reduce((s, c) => s + c.amount, 0);
    const dispNames = await azkiResolveCenterDisplayNames(centerData);
    const dn = c => dispNames[c.name] || c.name;

    if (currentUserRole === 'leader') {
      // سرگروه: فقط تعداد صدور (بدون نرخ و مبلغ)
      const lb = azkiState.bounds;
      const meta2 = `فقط تعداد صدور   |   شرکت: ${azkiState.companies.all ? 'همه شرکت‌ها' : azkiActiveScopes().join('، ')}`;
      // ریز کارشناس‌ها قبل از شیت اصلی گرفته می‌شه تا «انتقالی» هر سنتر هم تو شیت اصلی بیاد (فقط نمایشی)
      let det = null, detErr = null;
      try { det = await fetchAzkiPayrollAgentDetail(lb, centerData); } catch (e0) { detErr = e0; }
      const trMap = azkiCenterTransferMap(det);
      const trTotal = Object.values(trMap).reduce((s0, o) => s0 + o.transfer, 0);
      const centersWs = azkiXlsxSheet({
        title: 'صدور سنترها', bounds: lb, metaLine2: meta2,
        headers: ['ردیف', 'نام سنتر', 'تعداد صدور', 'از این تعداد انتقالی'],
        rows: centerData.map((c, i) => [i + 1, dn(c), c.count, azkiCenterTransferCell(trMap, c.name)]),
        total: ['', 'جمع کل', grandCount, trTotal],
        widths: [8, 36, 16, 20], fmts: ['int', 'text', 'int', 'int'],
      });
      const lwb = XLSX.utils.book_new();
      lwb.Workbook = { Views: [{ RTL: true }] };
      XLSX.utils.book_append_sheet(lwb, centersWs, 'صدور سنترها');
      try {
        const keys = azkiState.payroll.leaderKeys;
        if (detErr) throw detErr;
        // کارشناس‌های سنترهای این سرگروه + همه‌ی کسانی که از سنتر حذف شدن (با وضعیت مشخص)
        const agents = det.agents.filter(a => a.synthetic ? (keys && [...keys].some(lk => (' ' + lk + ' ').includes(' ' + a.payKey + ' '))) : (a.status === 'از سنتر حذف شده' || (keys && keys.has(normCenterKey(a.centerName)))));
        const okIds = new Set(agents.map(a => a.id));
        const days = det.days.filter(d => okIds.has(d.id));
        if (agents.length) {
          const tot = agents.reduce((s0, a) => s0 + a.count, 0);
          XLSX.utils.book_append_sheet(lwb, azkiXlsxSheet({
            title: 'ریز صدور کارشناس‌ها', bounds: lb, metaLine2: meta2,
            headers: ['نام سنتر', 'نام کارشناس', 'یوزر بک‌آفیس', 'وضعیت', 'تعداد روز', 'تعداد صدور', 'از این تعداد انتقالی'],
            rows: agents.map(a => [a.centerName, a.name, a.backoffice, a.status, a.daysCount, a.count, payTransferCell(a)]),
            total: ['جمع کل', '', '', '', '', tot, agents.reduce((s0, a) => s0 + (a.synthetic ? 0 : (a.transfer || 0)), 0)],
            widths: [32, 28, 18, 18, 12, 14, 20], fmts: ['text', 'text', 'text', 'text', 'int', 'int', 'int'],
          }), 'ریز کارشناس‌ها');
          XLSX.utils.book_append_sheet(lwb, azkiXlsxSheet({
            title: 'جزئیات روزانه کارشناس‌ها', bounds: lb, metaLine2: meta2,
            headers: ['نام سنتر', 'نام کارشناس', 'وضعیت', 'تاریخ', 'تعداد صدور', 'از این تعداد انتقالی'],
            rows: days.map(d => [d.agent.centerName, d.agent.name, d.agent.status, d.date, d.count, d.transfer == null ? '—' : d.transfer]),
            total: ['جمع کل', '', '', '', days.reduce((s0, d) => s0 + d.count, 0), days.reduce((s0, d) => s0 + (d.transfer || 0), 0)],
            widths: [32, 28, 18, 16, 14, 20], fmts: ['text', 'text', 'text', 'text', 'int', 'int'],
          }), 'جزئیات روزانه');
        }
      } catch (detailErr) {
        console.error('ریز کارشناس‌ها به اکسل اضافه نشد:', detailErr);
        alert('اکسل اصلی ساخته شد ولی ریز کارشناس‌ها دریافت نشد: ' + detailErr.message);
      }
      XLSX.writeFile(lwb, `صدور-سنترها_${lb.startLabel.replace(/\//g, '-')}_تا_${lb.endLabel.replace(/\//g, '-')}.xlsx`);
      return;
    }

    const bounds = azkiState.bounds;
    // ریز کارشناس‌ها یک بار گرفته می‌شه؛ هم برای ستون «انتقالی» شیت اصلی و هم شیت‌های ریز (اگه خطا بده، اکسل اصلی بدون انتقالی ساخته می‌شه)
    let detail = null, detailFail = null;
    try { detail = await fetchAzkiPayrollAgentDetail(bounds, centerData); } catch (e0) { detailFail = e0; }
    const trMap = azkiCenterTransferMap(detail);
    const trTotal = Object.values(trMap).reduce((s0, o) => s0 + o.transfer, 0);
    const aoa = [
      ['نام سنتر', 'تعداد صدور', 'از این تعداد انتقالی', 'میانگین زمان صدور (دقیقه)', 'نرخ هر صدور (ریال)', 'مبلغ قابل پرداخت (ریال)'],
      ...centerData.map(c => [dn(c), c.count, azkiCenterTransferCell(trMap, c.name), c.avgMin != null ? c.avgMin : '—', c.rate, c.amount]),
      ['جمع کل', grandCount, trTotal, '', '', grandAmount],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 32 }, { wch: 14 }, { wch: 20 }, { wch: 22 }, { wch: 18 }, { wch: 22 }];

    const FONT_NAME = 'B Nazanin';
    const thinBorder = { style: 'thin', color: { rgb: 'FF999999' } };
    const border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
    const totalRowIdx = aoa.length - 1; // last row = جمع کل
    const range = XLSX.utils.decode_range(ws['!ref']);

    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[addr]) ws[addr] = { t: 's', v: '' };
        const isHeader = R === 0;
        const isTotalRow = R === totalRowIdx;
        const isFirstCol = C === 0;
        ws[addr].s = {
          font: {
            name: FONT_NAME,
            bold: isHeader || isFirstCol || isTotalRow,
            sz: isTotalRow ? 14 : 11,
          },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border,
          fill: isTotalRow ? { patternType: 'solid', fgColor: { rgb: 'FFD9D9D9' } } : undefined,
        };
        // جداکننده‌ی سه‌رقمی (۱,۲۳۴,۵۶۷) برای همه‌ی ستون‌های عددی؛ میانگین زمان با دو رقم اعشار
        if (!isHeader && typeof ws[addr].v === 'number') ws[addr].z = C === 3 ? '#,##0.00' : '#,##0';
      }
    }

    const wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, 'محاسبه حقوق');

    // شیت‌های ریز کارشناس‌ها (اگه دریافتش با خطا مواجه بشه، اکسل اصلی همچنان ساخته می‌شه)
    try {
      if (detailFail) throw detailFail;
      const meta2 = 'مبلغ هر کارشناس = تعداد صدور او × نرخ هر صدور سنتر (برآورد)   |   ستون «انتقالی» فقط نمایشی است و در مبلغ نقشی ندارد';
      if (detail.agents.length) {
        const totCount = detail.agents.reduce((s0, a) => s0 + a.count, 0);
        const totAmount = detail.agents.reduce((s0, a) => s0 + a.amount, 0);
        const agentsWs = azkiXlsxSheet({
          title: 'محاسبه حقوق — ریز صدور کارشناس‌ها', bounds, metaLine2: meta2,
          headers: ['نام سنتر', 'نام کارشناس', 'یوزر بک‌آفیس', 'وضعیت', 'تعداد روز', 'تعداد صدور', 'از این تعداد انتقالی', 'میانگین زمان صدور (دقیقه)', 'نرخ هر صدور سنتر (ریال)', 'مبلغ برآوردی (ریال)'],
          rows: detail.agents.map(a => [a.centerName, a.name, a.backoffice, a.status, a.daysCount, a.count, payTransferCell(a), a.sla != null ? a.sla : '', a.rate, a.amount]),
          total: ['جمع کل', '', '', '', '', totCount, detail.agents.reduce((s0, a) => s0 + (a.synthetic ? 0 : (a.transfer || 0)), 0), '', '', totAmount],
          widths: [32, 28, 18, 18, 12, 14, 20, 22, 22, 22], fmts: ['text', 'text', 'text', 'text', 'int', 'int', 'int', 'pct', 'int', 'int'],
        });
        XLSX.utils.book_append_sheet(wb, agentsWs, 'ریز کارشناس‌ها');
        const daysWs = azkiXlsxSheet({
          title: 'محاسبه حقوق — جزئیات روزانه کارشناس‌ها', bounds, metaLine2: meta2,
          headers: ['نام سنتر', 'نام کارشناس', 'وضعیت', 'تاریخ', 'تعداد صدور', 'از این تعداد انتقالی'],
          rows: detail.days.map(d => [d.agent.centerName, d.agent.name, d.agent.status, d.date, d.count, d.transfer == null ? '—' : d.transfer]),
          total: ['جمع کل', '', '', '', detail.days.reduce((s0, d) => s0 + d.count, 0), detail.days.reduce((s0, d) => s0 + (d.transfer || 0), 0)],
          widths: [32, 28, 18, 16, 14, 20], fmts: ['text', 'text', 'text', 'text', 'int', 'int'],
        });
        XLSX.utils.book_append_sheet(wb, daysWs, 'جزئیات روزانه');
      }
    } catch (detailErr) {
      console.error('ریز کارشناس‌ها به اکسل اضافه نشد:', detailErr);
      alert('اکسل اصلی ساخته شد ولی ریز کارشناس‌ها دریافت نشد: ' + detailErr.message);
    }

    const fname = `محاسبه-حقوق_${bounds.startLabel.replace(/\//g, '-')}_تا_${bounds.endLabel.replace(/\//g, '-')}.xlsx`;
    XLSX.writeFile(wb, fname);
  } catch (e) {
    alert('خروجی اکسل با خطا مواجه شد: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// ============================================================
// خروجی اکسل تب‌های «گزارش» (گزارش دوره‌ای، به تفکیک مرکز، تفکیک شیفت، مقایسه درصد صدور)
// خروجی همیشه با همون بازه، شرکت‌ها و حالت نمایش (روزانه/هفتگی/ماهانه) فیلتر فعلی ساخته می‌شه.
// ============================================================
const AZKI_GRAN_FA = { daily: 'روزانه', weekly: 'هفتگی', monthly: 'ماهانه' };

// یک شیت مرتب می‌سازه: عنوان + توضیح بازه، هدر رنگی، ردیف‌ها، ردیف جمع کل
// fmts: برای هر ستون 'text' | 'int' | 'pct'
function azkiXlsxSheet({ title, headers, rows, total, widths, fmts, bounds, metaLine2 }) {
  const b = bounds || azkiState.bounds;
  const cols = headers.length;
  const meta1 = `بازه‌ی گزارش: ${b.startLabel} تا ${b.endLabel}`;
  const meta2 = metaLine2 !== undefined ? metaLine2 : `حالت نمایش: ${AZKI_GRAN_FA[azkiState.granularity] || ''}   |   شرکت: ${azkiState.companies.all ? 'همه شرکت‌ها' : azkiActiveScopes().join('، ')}`;
  const HEAD_ROW = 4;
  const aoa = [[title], [meta1], [meta2], [], headers, ...rows];
  if (total) aoa.push(total);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = widths.map(w => ({ wch: w }));
  ws['!merges'] = [0, 1, 2].map(r => ({ s: { r, c: 0 }, e: { r, c: cols - 1 } }));
  ws['!rows'] = [{ hpt: 28 }, { hpt: 20 }, { hpt: 20 }, { hpt: 8 }, { hpt: 26 }];
  const lastRow = aoa.length - 1;
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: HEAD_ROW, c: 0 }, e: { r: total ? lastRow - 1 : lastRow, c: cols - 1 } }) };

  const FONT = 'B Nazanin';
  const thin = { style: 'thin', color: { rgb: 'FFB7C3D6' } };
  const border = { top: thin, bottom: thin, left: thin, right: thin };
  for (let R = 0; R <= lastRow; R++) {
    for (let C = 0; C < cols; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      const cell = ws[addr];
      const center = { horizontal: 'center', vertical: 'center', wrapText: true };
      if (R === 0) {
        cell.s = { font: { name: FONT, bold: true, sz: 16, color: { rgb: 'FF0F3D91' } }, alignment: center };
      } else if (R === 1 || R === 2) {
        cell.s = { font: { name: FONT, sz: 11, color: { rgb: 'FF4A5B78' } }, alignment: center };
      } else if (R === 3) {
        cell.s = {};
      } else if (R === HEAD_ROW) {
        cell.s = { font: { name: FONT, bold: true, sz: 12, color: { rgb: 'FFFFFFFF' } }, alignment: center, border,
          fill: { patternType: 'solid', fgColor: { rgb: 'FF1F5FBF' } } };
      } else {
        const isTotal = total && R === lastRow;
        const zebra = !isTotal && (R - HEAD_ROW) % 2 === 0;
        cell.s = {
          font: { name: FONT, sz: isTotal ? 13 : 11, bold: isTotal || C === 0 },
          alignment: center, border,
          fill: isTotal ? { patternType: 'solid', fgColor: { rgb: 'FFD9E4F5' } }
              : zebra ? { patternType: 'solid', fgColor: { rgb: 'FFF4F7FC' } } : undefined,
        };
        if (typeof cell.v === 'number') cell.z = fmts[C] === 'pct' ? '0.00' : '#,##0';
      }
    }
  }
  return ws;
}

function azkiXlsxSave(sheets, fileLabel, bounds) {
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  sheets.forEach(([name, ws]) => XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31)));
  const b = bounds || azkiState.bounds;
  const fname = `${fileLabel}_${b.startLabel.replace(/\//g, '-')}_تا_${b.endLabel.replace(/\//g, '-')}.xlsx`;
  XLSX.writeFile(wb, fname);
}

const azkiPctNum = (part, whole) => whole ? round2(part / whole * 100) : 0;

function azkiBuildPeriodExport() {
  const groups = groupAzkiPeriodRows(azkiState.period.rows, azkiState.granularity);
  const tot = groups.reduce((s, g) => s + g.total, 0), cen = groups.reduce((s, g) => s + g.center, 0);
  const ws = azkiXlsxSheet({
    title: 'گزارش دوره‌ای صدور ازکی سنتر',
    headers: ['دوره', 'کل صدور', 'صدور ازکی سنترها', 'درصد ازکی سنتر (٪)'],
    rows: groups.map(g => [g.label, g.total, g.center, azkiPctNum(g.center, g.total)]),
    total: ['جمع کل', tot, cen, azkiPctNum(cen, tot)],
    widths: [26, 16, 20, 22], fmts: ['text', 'int', 'int', 'pct'],
  });
  return { sheets: [['گزارش دوره‌ای', ws]], label: 'گزارش-دوره‌ای' };
}

function azkiBuildCentersExport() {
  const groups = groupAzkiBreakdownRows(azkiState.centers.rows, azkiState.granularity);
  const totals = {};
  groups.forEach(g => { totals[g.centerName] = (totals[g.centerName] || 0) + g.count; });
  const names = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
  const grand = names.reduce((s, n) => s + totals[n], 0);
  const summary = azkiXlsxSheet({
    title: 'صدور به تفکیک نام مرکز — خلاصه',
    headers: ['ردیف', 'نام مرکز', 'جمع صدور', 'سهم از کل (٪)'],
    rows: names.map((n, i) => [i + 1, fmtCenterName(n), totals[n], azkiPctNum(totals[n], grand)]),
    total: ['', 'جمع کل', grand, names.length ? 100 : 0],
    widths: [8, 36, 16, 18], fmts: ['int', 'text', 'int', 'pct'],
  });
  const detailRows = [];
  names.forEach(n => groups.filter(g => g.centerName === n).sort((a, b) => a.sortKey - b.sortKey)
    .forEach(g => detailRows.push([fmtCenterName(n), g.label, g.count])));
  const detail = azkiXlsxSheet({
    title: 'صدور به تفکیک نام مرکز — جزئیات دوره',
    headers: ['نام مرکز', 'دوره', 'تعداد صدور'],
    rows: detailRows,
    total: ['جمع کل', '', grand],
    widths: [36, 26, 16], fmts: ['text', 'text', 'int'],
  });
  return { sheets: [['خلاصه مراکز', summary], ['جزئیات دوره', detail]], label: 'گزارش-به-تفکیک-مرکز' };
}

// بازه‌ی واقعی تاریخ (از/تا) هر دوره (روز/هفته/ماه) از روی خود ردیف‌ها
function azkiPeriodDateRanges(rows, granularity) {
  const map = {};
  for (const r of rows) {
    const { jy, jm, jd } = parseJalaliParts(r.report_date_jalali);
    const { key } = azkiPeriodGroupKey(jy, jm, jd, granularity);
    const n = jy * 10000 + jm * 100 + jd;
    const txt = faDigits(`${jy}/${pad2(jm)}/${pad2(jd)}`);
    if (!map[key]) map[key] = { minN: n, maxN: n, from: txt, to: txt };
    if (n < map[key].minN) { map[key].minN = n; map[key].from = txt; }
    if (n > map[key].maxN) { map[key].maxN = n; map[key].to = txt; }
  }
  return map;
}

function azkiBuildShiftsExport() {
  const gran = azkiState.granularity;
  const agg = aggregateAzkiShiftRows(azkiState.shifts.rows, gran);
  const g = agg.grand;
  const centerAll = shiftCenterSum(g), totalAll = shiftTotalAll(g);
  const ranges = azkiPeriodDateRanges(azkiState.shifts.rows, gran);
  const isDaily = gran === 'daily';
  const periodColName = isDaily ? 'تاریخ' : (gran === 'weekly' ? 'هفته' : 'ماه');
  const rangeCells = p => isDaily ? [] : [(ranges[p.key] || {}).from || '', (ranges[p.key] || {}).to || ''];
  const rangeHeads = isDaily ? [] : ['از تاریخ', 'تا تاریخ'];
  const rangeWidths = isDaily ? [] : [16, 16];
  const rangeFmts = isDaily ? [] : ['text', 'text'];
  const rangeBlank = isDaily ? [] : ['', ''];
  const S = AZKI_SHIFTS;

  // ۱) به تفکیک تاریخ: تعداد و تأثیر هر شیفت روی درصد صدور
  const shiftHeads = S.flatMap(sh => [sh.short + ': سنتر', sh.short + ': تأثیر (٪)']);
  const shiftWidths = S.flatMap(() => [14, 16]);
  const shiftFmts = S.flatMap(() => ['int', 'pct']);
  const shiftCells = (b, tot) => S.flatMap(sh => [b[sh.key].center, azkiPctNum(b[sh.key].center, tot)]);
  const byDate = azkiXlsxSheet({
    title: 'درصد صدور به تفکیک شیفت — به تفکیک ' + periodColName,
    headers: [periodColName, ...rangeHeads, ...shiftHeads, 'جمع سنتر', 'کل صدور', 'درصد صدور (٪)'],
    rows: agg.periods.map(p => { const t = shiftTotalAll(p.all), c = shiftCenterSum(p.all);
      return [p.label, ...rangeCells(p), ...shiftCells(p.all, t), c, t, azkiPctNum(c, t)]; }),
    total: ['جمع کل', ...rangeBlank, ...shiftCells(g, totalAll), centerAll, totalAll, azkiPctNum(centerAll, totalAll)],
    widths: [26, ...rangeWidths, ...shiftWidths, 14, 14, 16], fmts: ['text', ...rangeFmts, ...shiftFmts, 'int', 'int', 'pct'],
  });

  // ۲) خلاصه‌ی کل بازه
  const summary = azkiXlsxSheet({
    title: 'درصد صدور به تفکیک شیفت — خلاصه کل بازه',
    headers: ['شیفت', 'ساعت', 'صدور ازکی سنتر', 'کل صدور شیفت', 'تأثیر روی درصد صدور (٪)', 'درصد صدور شیفت (٪)', 'درصد صدور پایان شیفت (٪)', 'سهم از صدور سنترها (٪)'],
    rows: S.map(sh => { const cu = azkiShiftCumulative(g)[sh.key]; return [sh.title, sh.hours, g[sh.key].center, g[sh.key].total,
      azkiPctNum(g[sh.key].center, totalAll), azkiPctNum(g[sh.key].center, g[sh.key].total), azkiPctNum(cu.center, cu.total), azkiPctNum(g[sh.key].center, centerAll)]; }),
    total: ['جمع', '', centerAll, totalAll, azkiPctNum(centerAll, totalAll), azkiPctNum(centerAll, totalAll), azkiPctNum(centerAll, totalAll), azkiPctNum(centerAll, centerAll)],
    widths: [16, 18, 18, 18, 26, 22, 24, 24], fmts: ['text', 'text', 'int', 'int', 'pct', 'pct', 'pct', 'pct'],
  });

  // ۳) هر مرکز در کل بازه
  const names = Object.keys(agg.centers).sort((a, b) => shiftCenterSum(agg.centers[b]) - shiftCenterSum(agg.centers[a]));
  const byCenter = azkiXlsxSheet({
    title: 'درصد صدور به تفکیک شیفت — به تفکیک مرکز (کل بازه)',
    headers: ['نام مرکز', 'بامداد', 'صبح', 'شب', 'جمع', 'درصد بامداد (٪)', 'درصد صبح (٪)', 'درصد شب (٪)'],
    rows: names.map(n => { const b = agg.centers[n], sum = shiftCenterSum(b);
      return [fmtCenterName(n), b.other.center, b.morning.center, b.evening.center, sum,
        azkiPctNum(b.other.center, sum), azkiPctNum(b.morning.center, sum), azkiPctNum(b.evening.center, sum)]; }),
    total: ['جمع کل', g.other.center, g.morning.center, g.evening.center, centerAll,
      azkiPctNum(g.other.center, centerAll), azkiPctNum(g.morning.center, centerAll), azkiPctNum(g.evening.center, centerAll)],
    widths: [36, 12, 12, 12, 12, 16, 16, 16], fmts: ['text', 'int', 'int', 'int', 'int', 'pct', 'pct', 'pct'],
  });

  // ۴) هر مرکز به تفکیک تاریخ/هفته/ماه
  const detailRows = [];
  names.forEach(n => agg.periods.forEach(p => {
    const b = p.centers[n];
    if (!b) return;
    const sum = shiftCenterSum(b);
    detailRows.push([fmtCenterName(n), p.label, ...rangeCells(p), b.other.center, b.morning.center, b.evening.center, sum,
      azkiPctNum(b.other.center, sum), azkiPctNum(b.morning.center, sum), azkiPctNum(b.evening.center, sum)]);
  }));
  const centerByDate = azkiXlsxSheet({
    title: 'درصد صدور به تفکیک شیفت — مرکز به تفکیک ' + periodColName,
    headers: ['نام مرکز', periodColName, ...rangeHeads, 'بامداد', 'صبح', 'شب', 'جمع', 'درصد بامداد (٪)', 'درصد صبح (٪)', 'درصد شب (٪)'],
    rows: detailRows,
    total: ['جمع کل', '', ...rangeBlank, g.other.center, g.morning.center, g.evening.center, centerAll,
      azkiPctNum(g.other.center, centerAll), azkiPctNum(g.morning.center, centerAll), azkiPctNum(g.evening.center, centerAll)],
    widths: [36, 26, ...rangeWidths, 12, 12, 12, 12, 16, 16, 16], fmts: ['text', 'text', ...rangeFmts, 'int', 'int', 'int', 'int', 'pct', 'pct', 'pct'],
  });

  return {
    sheets: [['به تفکیک ' + periodColName, byDate], ['خلاصه کل بازه', summary], ['مرکز (کل بازه)', byCenter], ['مرکز به تفکیک ' + periodColName, centerByDate]],
    label: 'درصد-صدور-به-تفکیک-شیفت',
  };
}

function azkiBuildCompareExport() {
  const list = azkiState.compare.list;
  const summaries = list.map(company => {
    const groups = groupAzkiPeriodRows(azkiState.compare.byScope[company] || [], azkiState.granularity);
    return { company, groups, total: groups.reduce((s, x) => s + x.total, 0), center: groups.reduce((s, x) => s + x.center, 0) };
  }).filter(x => !azkiState.compare.hideEmpty || x.total > 0).sort((a, b) => b.total - a.total);
  const gt = summaries.reduce((s, x) => s + x.total, 0), gc = summaries.reduce((s, x) => s + x.center, 0);
  const summary = azkiXlsxSheet({
    title: 'مقایسه درصد صدور — خلاصه شرکت‌ها',
    headers: ['شرکت بیمه', 'کل صدور', 'تعداد صدور ازکی سنتر', 'درصد صدور ازکی سنتر (٪)'],
    rows: summaries.map(x => [x.company, x.total, x.center, azkiPctNum(x.center, x.total)]),
    total: ['جمع کل', gt, gc, azkiPctNum(gc, gt)],
    widths: [28, 16, 24, 26], fmts: ['text', 'int', 'int', 'pct'],
  });
  const detailRows = [];
  summaries.forEach(x => x.groups.forEach(g => detailRows.push([x.company, g.label, g.total, g.center, azkiPctNum(g.center, g.total)])));
  const detail = azkiXlsxSheet({
    title: 'مقایسه درصد صدور — جزئیات دوره',
    headers: ['شرکت بیمه', 'دوره', 'کل صدور', 'صدور ازکی سنتر', 'درصد (٪)'],
    rows: detailRows,
    total: ['جمع کل', '', gt, gc, azkiPctNum(gc, gt)],
    widths: [28, 26, 14, 18, 14], fmts: ['text', 'text', 'int', 'int', 'pct'],
  });
  return { sheets: [['خلاصه شرکت‌ها', summary], ['جزئیات دوره', detail]], label: 'گزارش-مقایسه-درصد-صدور' };
}

async function exportAzkiReportExcel() {
  let tab = azkiActiveTab();
  if (tab === 'azki-payroll') return exportAzkiPayrollExcel();
  if (tab === 'azki-chart') tab = { pct: 'azki-compare', shift: 'azki-shifts', period: 'azki-period', oct: 'azki-oct' }[azkiState.chart.report];
  const btn = document.getElementById('azki-export-btn');
  const cfg = {
    'azki-period':  { st: azkiState.period,  has: () => azkiState.period.rows.length,  build: azkiBuildPeriodExport },
    'azki-centers': { st: azkiState.centers, has: () => azkiState.centers.rows.length, build: azkiBuildCentersExport },
    'azki-shifts':  { st: azkiState.shifts,  has: () => azkiState.shifts.rows.length,  build: azkiBuildShiftsExport },
    'azki-compare': { st: azkiState.compare, has: () => azkiState.compare.list.some(c => (azkiState.compare.byScope[c] || []).length), build: azkiBuildCompareExport },
    'azki-oct': { st: azkiState.oct, has: () => azkiState.oct.rows.length, build: azkiBuildOctExport },
  }[tab];
  if (!cfg) return;
  if (!cfg.st.loaded) { alert('گزارش هنوز بارگذاری نشده؛ چند لحظه صبر کنید و دوباره تلاش کنید.'); return; }
  if (!cfg.has()) { alert('برای این بازه داده‌ای وجود نداره که خروجی گرفته بشه.'); return; }
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'در حال آماده‌سازی...';
  try {
    await ensureXlsxLib();
    const out = cfg.build();
    azkiXlsxSave(out.sheets, out.label);
  } catch (e) {
    alert('خروجی اکسل با خطا مواجه شد: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}
document.getElementById('azki-export-btn').addEventListener('click', exportAzkiReportExcel);

async function loadAzkiCompareView() {
  if (!azkiAllowed()) return;
  const bounds = getAzkiBounds();
  document.getElementById('azki-compare-label').textContent = azkiRangeText(bounds);
  const container = document.getElementById('azki-compare-list');

  const companies = azkiCompareCompanies();
  const { data, error } = await fetchAzkiPeriodRows(companies, bounds);
  if (bounds !== azkiState.bounds) return;
  if (error) {
    container.innerHTML = `<div class="empty-state">خطا در دریافت گزارش: ${escHtml(error.message)}</div>`;
    return;
  }

  const byScope = {};
  companies.forEach(c => { byScope[c] = []; });
  (data || []).forEach(r => { if (byScope[r.company_scope]) byScope[r.company_scope].push(r); });
  azkiState.compare.byScope = byScope;
  azkiState.compare.list = companies;
  azkiState.compare.hideEmpty = azkiState.companies.all;
  azkiState.compare.loaded = true;
  renderAzkiCompareView();
}

function azkiMiniStatsHtml(total, center) {
  return `
        <div class="row-main row-stats">
          <span class="mini-stat"><span class="k">کل صدور</span><b>${formatNumber(total)}</b></span>
          <span class="mini-stat"><span class="k">ازکی سنتر</span><b>${formatNumber(center)}</b></span>
        </div>`;
}

function azkiPeriodRowHtml(g) {
  const pct = g.total ? round2(g.center / g.total * 100) : 0;
  return `
    <div class="row-item">
      <div class="row-date">${g.label}</div>
      ${azkiMiniStatsHtml(g.total, g.center)}
      <div class="row-badge">${formatNumber(pct)}٪</div>
    </div>`;
}


// ───────── نمودار روند درصد صدور (تب مقایسه درصد صدور) ─────────
const AZKI_TREND_COLORS = ['#F59E0B', '#7C5CE0', '#1FA971', '#E0453F', '#0EA5E9', '#DB2777', '#65A30D', '#0D9488', '#9333EA', '#EA580C'];

function azkiBuildTrendData(summaries) {
  const map = new Map();
  summaries.forEach(s => s.groups.forEach(g => {
    let p = map.get(g.key);
    if (!p) { p = { key: g.key, label: g.label, sortKey: g.sortKey, total: 0, center: 0, by: {} }; map.set(g.key, p); }
    p.sortKey = Math.min(p.sortKey, g.sortKey);
    p.total += g.total;
    p.center += g.center;
    p.by[s.company] = { total: g.total, center: g.center };
  }));
  return [...map.values()].sort((a, b) => a.sortKey - b.sortKey);
}

// ───────── تب «نمودار»: انتخاب گزارش و رسم روند آن روی بازه‌ی انتخاب‌شده ─────────
const AZC_REPORTS = [
  { id: 'pct', label: 'درصد صدور' },
  { id: 'period', label: 'تعداد صدور' },
];
const AZC_SHIFT_DEFS = [
  { id: 'morning', name: 'شیفت صبح', color: '#1656F5' },
  { id: 'evening', name: 'شیفت عصر', color: '#F59E0B' },
  { id: 'other', name: 'خارج از شیفت (۰ تا ۸)', color: '#9AA5B8' },
];

// گام خطوط محور درصد: ۵ تا ۴۰٪، سپس ۱۰ و ۲۰ (مضرب ۵ تا شلوغ نشود)
function azcPctStep(top) { return top <= 40 ? 5 : top <= 80 ? 10 : 20; }

function azcNiceTop(mx, pct) {
  if (pct) {
    if (mx <= 5) return Math.max(1, Math.ceil(mx * 1.2));
    const raw = Math.min(100, Math.ceil(mx * 1.15 / 5) * 5);
    const stp = azcPctStep(raw);
    return Math.min(100, Math.ceil(raw / stp) * stp);
  }
  if (mx <= 0) return 4;
  const mag = Math.pow(10, Math.floor(Math.log10(mx)));
  const f = mx / mag;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * mag;
}

// سقف محور ساعت (۴ بازه‌ی مساوی با گام‌های ۰٫۲۵، ۰٫۵، ۱، ۲، ۵، ...)
function azcHourTop(mx) {
  if (mx <= 0) return 4;
  const steps = [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100];
  const s = steps.find(x => mx * 1.1 / 4 <= x) || 100;
  return s * 4;
}

function azcXLabel(p) { return p.short || (azkiState.granularity === 'daily' ? faDigits(String(p.key).slice(5)) : p.label); }

// خروجی: { points:[{key,label}], series:[{id,name,color,vals:[],sub:[]}], pct:bool, empty:bool, allSeries:[...] }
function azcBuildModel() {
  const st = azkiState.chart;
  if (st.report === 'pct') {
    const c = azkiState.compare;
    const summaries = c.list.map(company => {
      const groups = groupAzkiPeriodRows(c.byScope[company] || [], azkiState.granularity);
      return { company, groups, total: groups.reduce((a, g) => a + g.total, 0) };
    }).filter(x => !c.hideEmpty || x.total > 0).sort((a, b) => b.total - a.total);
    const data = azkiBuildTrendData(summaries);
    const mk = (id, name, color, pick) => {
      const vals = data.map(p => { const x = pick(p); return x && x.total ? x.center / x.total * 100 : null; });
      const sub = data.map(p => { const x = pick(p); return x ? `${formatNumber(x.center)} از ${formatNumber(x.total)}` : ''; });
      return { id, name, color, vals, sub };
    };
    const all = [mk('__all', 'مجموع شرکت‌ها', 'var(--accent-deep)', p => p)];
    summaries.forEach(sm => {
      const idx = Math.max(0, c.list.indexOf(sm.company));
      all.push(mk(sm.company, sm.company, AZKI_TREND_COLORS[idx % AZKI_TREND_COLORS.length], p => p.by[sm.company]));
    });
    // OCT ازکی سنتر (میانگین ساعت) هم‌بازه با درصد صدور؛ روی محور راست، به‌صورت خط ساده مثل خط درصد
    if ((azkiState.oct.rows || []).length) {
      const octByKey = {};
      azkiOctGroups(azkiState.oct.rows, azkiState.granularity).forEach(g => { octByKey[g.key] = g; });
      all.push(azkiOctSeries(data.map(p => octByKey[p.key] || null)));
    }
    return { points: data, all, pct: true, empty: !data.length, selKey: 'pct', title: 'روند درصد صدور ازکی سنتر', areaId: '__all' };
  }

  if (st.report === 'oct') {
    const og = azkiOctGroups(azkiState.oct.rows, azkiState.granularity);
    return { points: og.map(g => ({ key: g.key, label: g.label })), all: [azkiOctSeries(og)], pct: true, empty: !og.length,
      selKey: 'oct', title: 'روند OCT ازکی سنتر (میانگین ساعت)', areaId: '__oct' };
  }

  if (st.report === 'shift') {
    const agg = aggregateAzkiShiftRows(azkiState.shifts.rows, azkiState.granularity);
    const pts = agg.periods;
    const asPct = st.metric === 'pct';
    const defs = asPct ? AZC_SHIFT_DEFS.slice(0, 2) : AZC_SHIFT_DEFS;
    const all = defs.map(d => {
      const vals = pts.map(p => { const b = p.all[d.id]; return asPct ? (b.total ? b.center / b.total * 100 : null) : b.center; });
      const sub = pts.map(p => {
        const b = p.all[d.id];
        return asPct ? `${formatNumber(b.center)} از ${formatNumber(b.total)}` : `از کل صدور شیفت: ${formatNumber(b.total)}`;
      });
      return { id: d.id, name: d.name, color: d.color, vals, sub };
    });
    return { points: pts, all, pct: asPct, empty: !pts.length, selKey: 'shift',
      title: asPct ? 'روند درصد صدور ازکی سنتر به تفکیک شیفت' : 'روند تعداد صدور ازکی سنتر به تفکیک شیفت', areaId: null };
  }

  // period: کل صدور و صدور ازکی سنتر
  const groups = groupAzkiPeriodRows(azkiState.period.rows, azkiState.granularity);
  const pts = groups.map(g => ({ key: g.key, label: g.label }));
  const all = [
    { id: 'total', name: 'کل صدور', color: '#7C5CE0', vals: groups.map(g => g.total), sub: groups.map(() => '') },
    { id: 'center', name: 'صدور ازکی سنتر', color: 'var(--accent-deep)', vals: groups.map(g => g.center),
      sub: groups.map(g => g.total ? `${formatNumber(round2(g.center / g.total * 100))}٪ از کل` : '') },
  ];
  return { points: pts, all, pct: false, empty: !groups.length, selKey: 'period', title: 'روند تعداد صدور (کل و ازکی سنتر)', areaId: 'center' };
}

function azcFmtVal(v, pct, m) {
  if (m && m.fmt) return m.fmt(v);
  return pct ? `${formatNumber(round2(v))}٪` : formatNumber(Math.round(v));
}

function azcPlotBuild(m, defs, pfx) {
  const n = m.points.length;
  const rightDefs = defs.filter(d => d.axis === 'right');
  const leftDefs = defs.filter(d => d.axis !== 'right');
  const onlyR = rightDefs.length > 0 && !leftDefs.length;
  const W = 900, H = 300, L = m.pct ? 46 : 58, R = (rightDefs.length && leftDefs.length) ? 46 : 14, T = 14, B = 34;
  const pw = W - L - R, ph = H - T - B;
  const X = i => (n > 1 ? L + pw * i / (n - 1) : L + pw / 2);   // یک نقطه: وسط نمودار
  let mx = 0;
  leftDefs.forEach(d => d.vals.forEach(v => { if (v !== null && v > mx) mx = v; }));
  const top = azcNiceTop(mx, m.pct);
  const Y = v => T + ph * (1 - v / top);
  // محور راست با مقیاس جدا (مثلاً OCT به ساعت)
  let mxR = 0;
  rightDefs.forEach(d => d.vals.forEach(v => { if (v !== null && v > mxR) mxR = v; }));
  let topR = azcHourTop(mxR);
  // OCT (محور راست) همیشه باید زیر خط درصد صدور (خط آبی) بماند و هیچ‌وقت روی آن نیفتد:
  // سقف محور ساعت را (در گام‌های «خوش‌خوان») بالا می‌بریم تا در هر نقطه، OCT حداقل GAP پیکسل پایین‌تر از خط درصد باشد.
  if (rightDefs.length && leftDefs.length) {
    const refDef = leftDefs.find(d => d.id === m.areaId);            // خط آبی «مجموع شرکت‌ها»
    const GAP = 26;                                                   // فاصله‌ی امن (جا برای برچسب عدد OCT بین دو خط)
    const refPy = i => {
      if (refDef) return refDef.vals[i] === null || refDef.vals[i] === undefined ? null : Y(refDef.vals[i]);
      let lowest = null;                                              // اگر خط آبی خاموش بود: پایین‌ترین خط درصد
      leftDefs.forEach(d => { const v = d.vals[i]; if (v !== null && v !== undefined) { const y = Y(v); if (lowest === null || y > lowest) lowest = y; } });
      return lowest;
    };
    const refYs = []; for (let i = 0; i < n; i++) refYs.push(refPy(i));
    const fits = t => rightDefs.every(d => d.vals.every((v, i) => {
      if (v === null || v === undefined || refYs[i] === null) return true;
      return (T + ph * (1 - v / t)) - refYs[i] >= GAP;
    }));
    const stepsH = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 250, 500, 1000];
    const cands = stepsH.map(x => x * 4).filter(t => t >= topR);
    const hit = cands.find(fits);
    topR = hit !== undefined ? hit : (cands.length ? cands[cands.length - 1] : topR);
  }
  const YR = v => T + ph * (1 - v / topR);
  const yOf = d => (d.axis === 'right' ? YR : Y);
  const rColor = rightDefs.length ? rightDefs[0].color : '#888';

  let grid = '';
  if (onlyR) {
    for (let k = 0; k <= 4; k++) {
      const v = topR * k / 4, y = YR(v);
      grid += `<line class="azki-trend-grid" x1="${L}" x2="${W - R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/>`
            + `<text class="azc-ax" x="${L - 6}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" style="fill:${rColor}">${faDigits(round2(v))}</text>`;
    }
    grid += `<text class="azc-ax" x="${L - 6}" y="${T - 3}" text-anchor="end" style="fill:${rColor}">ساعت</text>`;
  } else {
    const ticks = [];
    if (m.pct && top >= 10) { const stp = azcPctStep(top); for (let v = 0; v <= top + 1e-9; v += stp) ticks.push(v); }
    else { for (let k = 0; k <= 4; k++) ticks.push(top * k / 4); }
    ticks.forEach(v => {
      const y = Y(v);
      grid += `<line class="azki-trend-grid" x1="${L}" x2="${W - R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/>`
            + `<text class="azc-ax" x="${L - 6}" y="${(y + 3.5).toFixed(1)}" text-anchor="end">${m.pct ? faDigits(round2(v)) + '٪' : (m.short ? m.short(v) : formatNumber(Math.round(v)))}</text>`;
    });
    if (rightDefs.length) {
      for (let k = 0; k <= 4; k++) {
        const v = topR * k / 4;
        grid += `<text class="azc-ax" x="${W - R + 6}" y="${(YR(v) + 3.5).toFixed(1)}" text-anchor="start" style="fill:${rColor}">${faDigits(round2(v))}</text>`;
      }
      grid += `<text class="azc-ax" x="${W - R + 6}" y="${T - 3}" text-anchor="start" style="fill:${rColor}">ساعت</text>`;
    }
  }
  const step = Math.ceil(n / 8);
  let xl = '';
  m.points.forEach((p, i) => { if (i % step === 0) xl += `<text x="${X(i).toFixed(1)}" y="${H - 10}" text-anchor="middle">${azcXLabel(p)}</text>`; });

  let paths = '';
  defs.forEach(d => {
    const segs = []; let cur = null;
    d.vals.forEach((v, i) => {
      if (v === null) { cur = null; return; }
      if (!cur) { cur = []; segs.push(cur); }
      cur.push([X(i), yOf(d)(v)]);
    });
    const line = segs.map(sg => 'M' + sg.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' L')).join(' ');
    if (d.id === m.areaId) {
      const base = (T + ph).toFixed(1);
      const area = segs.filter(sg => sg.length > 1).map(sg =>
        `M${sg[0][0].toFixed(1)} ${base} L` + sg.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' L') + ` L${sg[sg.length - 1][0].toFixed(1)} ${base} Z`).join(' ');
      paths += `<path d="${area}" style="fill:${d.color}" opacity=".10"/>`;
    }
    paths += `<path d="${line}" fill="none" style="stroke:${d.color}" stroke-width="${d.id === m.areaId ? 2.8 : 2}" stroke-linejoin="round" stroke-linecap="round"${d.dash ? ' stroke-dasharray="6 4"' : ''}/>`;
    if (n <= 45) d.vals.forEach((v, i) => { if (v !== null) paths += `<circle cx="${X(i).toFixed(1)}" cy="${yOf(d)(v).toFixed(1)}" r="${n === 1 ? 5.5 : 3}" style="fill:${d.color}"/>`; });
  });

  // مقدار هر نقطه بالای آن نوشته می‌شود (درصد یا تعداد، بسته به گزارش).
  // اگر نقاط شلوغ باشند، برچسب‌هایی که روی هم می‌افتند حذف می‌شوند (مقدار دقیق همه‌ی نقاط در هاور/لمس هست).
  // سری اصلی (ناحیه‌دار) اولویت دارد.
  const placed = [];
  let labels = '';
  const ordered = defs.slice().sort((a, b) => (b.id === m.areaId) - (a.id === m.areaId));
  ordered.forEach(d => d.vals.forEach((v, i) => {
    if (v === null) return;
    const txt = d.lbl ? d.lbl(v) : (m.short ? m.short(v) : azcFmtVal(v, m.pct));
    const w = txt.length * 6.8 + 6;
    const px = X(i), py = yOf(d)(v);
    let ly = py - 9;                       // خط‌پایه‌ی متن، بالای نقطه
    if (ly - 10 < 2) ly = py + 19;         // اگر نقطه به سقف نمودار چسبیده، زیر نقطه بنویس
    const cx = Math.min(Math.max(px, L + w / 2 + 1), W - R - w / 2 + 2);
    const r = { x1: cx - w / 2 - 3, x2: cx + w / 2 + 3, y1: ly - 11, y2: ly + 3 };
    if (placed.some(q => r.x1 < q.x2 && r.x2 > q.x1 && r.y1 < q.y2 && r.y2 > q.y1)) return;
    placed.push(r);
    labels += `<text class="azc-lbl" x="${cx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" style="fill:${d.color}">${txt}</text>`;
  }));

  const html = `
        <div class="azki-trend-plot azc" id="${pfx}plot">
          <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escHtml(m.title)}">
            ${grid}${xl}${paths}${labels}
            <line class="azki-trend-guide" id="${pfx}guide" y1="${T}" y2="${T + ph}" style="display:none"/>
            <g id="${pfx}hover"></g>
            <rect id="${pfx}hit" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/>
          </svg>
          <div class="azki-trend-tip" id="${pfx}tip"></div>
        </div>`;
  return { html, g: { W, L, pw, T, ph, n, X, Y, YR, m, defs, pfx } };
}

function azkiChartRender() {
  const root = document.getElementById('azki-chart-root');
  if (!root) return;
  const st = azkiState.chart;
  document.getElementById('azki-chart-label').textContent = azkiRangeText(getAzkiBounds());

  const tabsHtml = `
    <div class="azc-tools">
      <div class="azki-fld">
        <span class="azki-fld-label">گزارش</span>
        <div class="azki-seg" id="azc-report">
          ${AZC_REPORTS.map(r => `<button type="button" class="azki-seg-btn${st.report === r.id ? ' active' : ''}" data-report="${r.id}">${r.label}</button>`).join('')}
        </div>
      </div>
      ${st.report === 'shift' ? `
      <div class="azki-fld">
        <span class="azki-fld-label">مقدار</span>
        <div class="azki-seg" id="azc-metric">
          <button type="button" class="azki-seg-btn${st.metric === 'count' ? ' active' : ''}" data-metric="count">تعداد صدور</button>
          <button type="button" class="azki-seg-btn${st.metric === 'pct' ? ' active' : ''}" data-metric="pct">درصد صدور</button>
        </div>
      </div>` : ''}
    </div>`;

  const m = azcBuildModel();
  let inner;
  if (m.empty) {
    inner = '<div class="azki-trend"><div class="azki-trend-note">ردیفی برای این بازه پیدا نشد</div></div>';
  } else {
    const sel = st.sel[m.selKey];
    const defs = m.all.filter(d => sel.has(d.id));
    const n = m.points.length;

    const chipSeries = m.all.filter(d => d.id !== '__oct');   // OCT بالای نمودار کنار عنوان است، نه بین چیپ‌ها
    const octSeries = m.all.find(d => d.id === '__oct');
    const octBtn = octSeries
      ? `<button type="button" class="azki-trend-chip azc-oct-toggle${sel.has('__oct') ? ' on' : ''}" data-id="__oct" style="--c:${octSeries.color}"><i></i>نمایش OCT ازکی سنتر (ساعت) روی نمودار</button>`
      : '';
    const chips = chipSeries.length > 1 ? `
      <div class="azki-trend-chips">
        ${chipSeries.map(d => `<button type="button" class="azki-trend-chip${sel.has(d.id) ? ' on' : ''}" data-id="${d.id}" style="--c:${d.color}"><i></i>${escHtml(d.name)}</button>`).join('')}
      </div>` : '';

    // آمار روی اولین سری انتخاب‌شده
    let stats = '';
    const ref = defs[0];
    if (ref) {
      let best = -1, worst = -1;
      ref.vals.forEach((v, i) => {
        if (v === null) return;
        if (best < 0 || v > ref.vals[best]) best = i;
        if (worst < 0 || v < ref.vals[worst]) worst = i;
      });
      if (best >= 0) stats = `<div class="azki-trend-stats">
        <span class="azki-trend-stat">${n > 1 ? 'بیشترین' : 'مقدار'} ${ref.name} (${azcXLabel(m.points[best])})<b>${ref.fmt ? ref.fmt(ref.vals[best]) : azcFmtVal(ref.vals[best], m.pct, m)}</b></span>
        ${n > 1 ? `<span class="azki-trend-stat">کمترین (${azcXLabel(m.points[worst])})<b>${ref.fmt ? ref.fmt(ref.vals[worst]) : azcFmtVal(ref.vals[worst], m.pct, m)}</b></span>` : ''}</div>`;
    }
    const head = `<div class="azki-trend-head"><div class="azki-trend-titlebar"><div class="azki-trend-title">${m.title} (${m.granLabel || AZKI_GRAN_FA[azkiState.granularity] || ''})</div>${octBtn}</div>${stats}</div>${chips}`;

    let body;
    if (!defs.length) {
      body = '<div class="azki-trend-note">حداقل یک مورد را برای نمایش روی نمودار انتخاب کنید.</div>';
    } else {
      const pb = azcPlotBuild(m, defs, 'azc-');
      body = pb.html;
      root.innerHTML = tabsHtml + `<div class="azki-trend">${head}${body}</div>`;
      azcBindHover(pb.g);
      azcBindControls(root, m);
      return;
    }
    inner = `<div class="azki-trend">${head}${body}</div>`;
    root.innerHTML = tabsHtml + inner;
    azcBindControls(root, m);
    return;
  }
  root.innerHTML = tabsHtml + inner;
  azcBindControls(root, null);
}

function azcBindControls(root, m) {
  root.querySelectorAll('#azc-report .azki-seg-btn').forEach(b => b.addEventListener('click', () => {
    azkiState.chart.report = b.dataset.report;
    azkiChartEnsure();
  }));
  root.querySelectorAll('#azc-metric .azki-seg-btn').forEach(b => b.addEventListener('click', () => {
    azkiState.chart.metric = b.dataset.metric;
    azkiChartRender();
  }));
  if (m) root.querySelectorAll('.azki-trend-chip').forEach(btn => btn.addEventListener('click', () => {
    const sel = azkiState.chart.sel[m.selKey], id = btn.dataset.id;
    if (sel.has(id)) sel.delete(id); else sel.add(id);
    azkiChartRender();
  }));
}

function azcBindHover(g) {
  const P = g.pfx || 'azc-';
  const wrap = document.getElementById(P + 'plot');
  const hit = document.getElementById(P + 'hit');
  const guide = document.getElementById(P + 'guide');
  const hov = document.getElementById(P + 'hover');
  const tip = document.getElementById(P + 'tip');
  if (!wrap || !hit) return;
  const svg = wrap.querySelector('svg');

  function show(clientX) {
    const r = svg.getBoundingClientRect();
    if (!r.width) return;
    const vx = (clientX - r.left) * (g.W / r.width);
    const i = g.n < 2 ? 0 : Math.max(0, Math.min(g.n - 1, Math.round((vx - g.L) / g.pw * (g.n - 1))));
    const x = g.X(i), p = g.m.points[i];
    guide.setAttribute('x1', x.toFixed(1)); guide.setAttribute('x2', x.toFixed(1)); guide.style.display = '';
    let dots = '', rows = '';
    g.defs.forEach(d => {
      const v = d.vals[i];
      if (v === null) return;
      dots += `<circle cx="${x.toFixed(1)}" cy="${((d.axis === 'right' && g.YR) ? g.YR : g.Y)(v).toFixed(1)}" r="5" style="fill:${d.color};stroke:#fff" stroke-width="2"/>`;
      rows += `<div class="t-r"><i style="background:${d.color}"></i><span>${escHtml(d.name)}</span><b>${d.fmt ? d.fmt(v) : azcFmtVal(v, g.m.pct, g.m)}</b>${d.sub[i] ? `<small>${escHtml(d.sub[i])}</small>` : ''}</div>`;
    });
    hov.innerHTML = dots;
    tip.innerHTML = `<div class="t-h">${escHtml(p.label)}</div>${rows || '<div class="t-r"><span>بدون داده در این دوره</span></div>'}`;
    tip.style.display = 'block';
    const px = x / g.W * r.width;
    if (px > r.width / 2) { tip.style.left = 'auto'; tip.style.right = (r.width - px + 12) + 'px'; }
    else { tip.style.right = 'auto'; tip.style.left = (px + 12) + 'px'; }
  }
  function hide() { guide.style.display = 'none'; hov.innerHTML = ''; tip.style.display = 'none'; }
  hit.addEventListener('mousemove', e => show(e.clientX));
  hit.addEventListener('mouseleave', hide);
  hit.addEventListener('touchstart', e => { if (e.touches[0]) show(e.touches[0].clientX); }, { passive: true });
  hit.addEventListener('touchmove', e => { if (e.touches[0]) show(e.touches[0].clientX); }, { passive: true });
  hit.addEventListener('touchend', hide);
}

// گروه‌بندی OCT (روزانه/هفتگی/ماهانه): میانگین وزنی با وزن «تعداد صدور ازکی سنتر» هر روز؛ اگر وزن نبود میانگین ساده
function azkiOctGroups(rows, gran) {
  const map = new Map();
  (rows || []).forEach(r => {
    const { jy, jm, jd } = parseJalaliParts(r.report_date_jalali);
    const k = azkiPeriodGroupKey(jy, jm, jd, gran);
    let g = map.get(k.key);
    if (!g) { g = { key: k.key, label: k.label, sortKey: jy * 10000 + jm * 100 + jd, sw: 0, s: 0, s1: 0, n1: 0, orders: 0 }; map.set(k.key, g); }
    const v = Number(r.oct_avg_hours), w = Number(r.center_orders) > 0 ? Number(r.center_orders) : 0;
    g.sw += w; g.s += v * w; g.s1 += v; g.n1 += 1; g.orders += w;
    g.sortKey = Math.min(g.sortKey, jy * 10000 + jm * 100 + jd);
  });
  return [...map.values()].map(g => ({ ...g, avg: g.sw > 0 ? g.s / g.sw : g.s1 / g.n1 })).sort((a, b) => a.sortKey - b.sortKey);
}

// سری نمودار OCT (محور راست، ساعت)؛ gs هم‌طول نقاط نمودار است (null = بدون داده)
function azkiOctSeries(gs) {
  return {
    id: '__oct', name: 'OCT ازکی سنتر (ساعت)', color: '#D946EF', axis: 'right',
    vals: gs.map(g => (g ? g.avg : null)),
    sub: gs.map(g => (g && g.orders ? `صدور ازکی سنتر: ${formatNumber(g.orders)}` : '')),
    fmt: v => `${faDigits(round2(v))} ساعت`, lbl: v => faDigits(round2(v)),
  };
}

// تب «OCT» (فقط سرپرست): جدول OCT ازکی سنتر در روزهای مختلف
async function loadAzkiOctView() {
  if (!azkiAllowed()) return;
  const bounds = getAzkiBounds();
  document.getElementById('azki-oct-label').textContent = azkiRangeText(bounds);
  await loadAzkiOctRows();
  if (bounds !== azkiState.bounds) return;
  renderAzkiOctView();
}

function renderAzkiOctView() {
  const container = document.getElementById('azki-oct-list');
  if (!container) return;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  document.getElementById('azki-oct-label').textContent = azkiRangeText(getAzkiBounds());
  const rows = azkiState.oct.rows || [];
  if (azkiState.oct.error) {
    container.innerHTML = `<div class="empty-state">خطا در دریافت گزارش: ${escHtml(azkiState.oct.error)}</div>`;
    return;
  }
  if (!rows.length) {
    container.innerHTML = '<div class="empty-state">برای این بازه هنوز OCT ثبت نشده است</div>';
    ['azki-oct-avg', 'azki-oct-min', 'azki-oct-max'].forEach(id => set(id, '—'));
    set('azki-oct-min-l', 'کمترین OCT'); set('azki-oct-max-l', 'بیشترین OCT');
    return;
  }
  const groups = azkiOctGroups(rows, azkiState.granularity);
  const sw = groups.reduce((a, g) => a + g.sw, 0), sv = groups.reduce((a, g) => a + g.s, 0);
  const overall = sw > 0 ? sv / sw : groups.reduce((a, g) => a + g.avg, 0) / groups.length;
  const lo = groups.reduce((a, g) => (g.avg < a.avg ? g : a)), hi = groups.reduce((a, g) => (g.avg > a.avg ? g : a));
  set('azki-oct-avg', `${formatNumber(round2(overall))} ساعت`);
  set('azki-oct-min', `${formatNumber(round2(lo.avg))} ساعت`); set('azki-oct-min-l', `کمترین OCT (${lo.label})`);
  set('azki-oct-max', `${formatNumber(round2(hi.avg))} ساعت`); set('azki-oct-max-l', `بیشترین OCT (${hi.label})`);
  container.innerHTML = groups.map(g => `
    <div class="row-item">
      <div class="row-date">${g.label}</div>
      <div class="row-main row-stats">
        <span class="mini-stat"><span class="k">صدور ازکی سنتر</span><b>${g.orders ? formatNumber(g.orders) : '—'}</b></span>
      </div>
      <div class="row-badge">${formatNumber(round2(g.avg))} ساعت</div>
    </div>`).join('');
}

function azkiBuildOctExport() {
  const groups = azkiOctGroups(azkiState.oct.rows, azkiState.granularity);
  const sw = groups.reduce((a, g) => a + g.sw, 0), sv = groups.reduce((a, g) => a + g.s, 0);
  const overall = sw > 0 ? sv / sw : (groups.length ? groups.reduce((a, g) => a + g.avg, 0) / groups.length : 0);
  const orders = groups.reduce((a, g) => a + g.orders, 0);
  const ws = azkiXlsxSheet({
    title: 'OCT ازکی سنتر (میانگین ساعت)',
    headers: ['دوره', 'OCT (ساعت)', 'صدور ازکی سنتر'],
    rows: groups.map(g => [g.label, round2(g.avg), g.orders]),
    total: ['میانگین بازه', round2(overall), orders],
    widths: [26, 16, 18], fmts: ['text', 'pct', 'int'],
    metaLine2: `حالت نمایش: ${AZKI_GRAN_FA[azkiState.granularity] || ''}   |   OCT کل ازکی سنتر (بدون تفکیک شرکت)`,
  });
  return { sheets: [['OCT', ws]], label: 'OCT-ازکی-سنتر' };
}

// میانگین روزانه‌ی OCT ازکی سنتر (کارت 23653 متابیس) از ردیف‌های «کل» جدول گزارش دوره‌ای؛ برای هم‌نمایی با درصد صدور
async function loadAzkiOctRows() {
  const bounds = getAzkiBounds();
  const { data, error } = await fetchAllRows((from, to) =>
    supabaseClient
      .from(TABLE_AZKI_PERIOD)
      .select('report_date, report_date_jalali, center_orders, oct_avg_hours')
      .eq('company_scope', 'کل')
      .not('oct_avg_hours', 'is', null)
      .gte('report_date', bounds.startDate)
      .lte('report_date', bounds.endDate)
      .order('report_date', { ascending: true })
      .range(from, to)
  );
  if (bounds !== azkiState.bounds) return;
  azkiState.oct.rows = error ? [] : (data || []);
  azkiState.oct.error = error ? error.message : '';
  azkiState.oct.loaded = true;
}

// داده‌ی گزارش انتخاب‌شده را (اگر لازم باشد) می‌گیرد و بعد نمودار را می‌کشد
async function azkiChartEnsure() {
  if (!azkiAllowed()) return;
  const st = azkiState.chart;
  const root = document.getElementById('azki-chart-root');
  if (!root) return;
  const gen = ++st.gen;
  azkiSyncFilterForTab('azki-chart');
  if (st.report === 'oct') {
    if (!azkiState.oct.loaded) {
      root.innerHTML = '<div class="loading-state">در حال بارگذاری...</div>';
      await loadAzkiOctRows();
      if (gen !== st.gen) return;
    }
    azkiChartRender();
    return;
  }
  const key = { pct: 'compare', shift: 'shifts', period: 'period' }[st.report];
  if (!azkiState[key].loaded) {
    root.innerHTML = '<div class="loading-state">در حال بارگذاری...</div>';
    const loader = { compare: loadAzkiCompareView, shifts: loadAzkiShiftsView, period: loadAzkiPeriodView }[key];
    await loader();
    if (gen !== st.gen) return;
    if (!azkiState[key].loaded) {
      if (!root.querySelector('.empty-state')) root.innerHTML = '<div class="empty-state">خطا در دریافت گزارش؛ دوباره تلاش کنید.</div>';
      return;
    }
  }
  if (st.report === 'pct' && !azkiState.oct.loaded) {
    await loadAzkiOctRows();
    if (gen !== st.gen) return;
  }
  azkiChartRender();
}

function renderAzkiCompareView() {
  const container = document.getElementById('azki-compare-list');
  const list = azkiState.compare.list;
  const anyRows = list.some(c => (azkiState.compare.byScope[c] || []).length);
  if (!anyRows) {
    container.innerHTML = '<div class="empty-state">ردیفی برای این بازه پیدا نشد</div>';
    return;
  }

  const summaries = list.map(company => {
    const groups = groupAzkiPeriodRows(azkiState.compare.byScope[company] || [], azkiState.granularity);
    const total = groups.reduce((s, g) => s + g.total, 0);
    const center = groups.reduce((s, g) => s + g.center, 0);
    return { company, groups, total, center };
  }).filter(x => !azkiState.compare.hideEmpty || x.total > 0).sort((a, b) => b.total - a.total);


  const grandTotal = summaries.reduce((s, x) => s + x.total, 0);
  const grandCenter = summaries.reduce((s, x) => s + x.center, 0);
  const grandPct = grandTotal ? round2(grandCenter / grandTotal * 100) : 0;

  const grandHtml = `
    <div class="row-item">
      <div class="row-date"><strong>جمع کل</strong></div>
      ${azkiMiniStatsHtml(grandTotal, grandCenter)}
      <div class="row-badge">${formatNumber(grandPct)}٪</div>
    </div>`;

  const companiesHtml = summaries.map(s => {
    const pct = s.total ? round2(s.center / s.total * 100) : 0;
    const inner = s.groups.length
      ? s.groups.map(azkiPeriodRowHtml).join('')
      : '<div class="empty-state">ردیفی برای این شرکت پیدا نشد</div>';
    return `
      <div class="leader-item">
        <button class="leader-header azki-head" type="button">
          <div class="leader-name-wrap">
            <svg class="leader-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            <span class="leader-name">${escHtml(s.company)}</span>
          </div>
          <div class="azki-stats">
            <div class="azki-stat"><span class="k">کل صدور</span><span class="v">${formatNumber(s.total)}</span></div>
            <div class="azki-stat"><span class="k">تعداد صدور ازکی سنتر</span><span class="v">${formatNumber(s.center)}</span></div>
            <div class="azki-stat pct"><span class="k">درصد صدور ازکی سنتر</span><span class="v">${formatNumber(pct)}٪</span></div>
          </div>
        </button>
        <div class="leader-details"><div class="leader-details-inner">${inner}</div></div>
      </div>`;
  }).join('');

  container.innerHTML = grandHtml + companiesHtml;
  bindExpandableToggles(container);
}

const AZKI_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
const azkiFilterState = { from: null, to: null };   // [jy, jm, jd]
const azkiCalView = { from: [0, 0], to: [0, 0] };

function azkiJalaliMonthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  const [gy, gm, gd] = jalaliToGregorian(jy, 12, 30).split('-').map(Number);
  const back = gregorianToJalali(gy, gm, gd);
  return (back[0] === jy && back[1] === 12 && back[2] === 30) ? 30 : 29;
}

function azkiWeekdayIndex(jy, jm, jd) {
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd).split('-').map(Number);
  return (new Date(Date.UTC(gy, gm - 1, gd)).getUTCDay() + 1) % 7;
}

function azkiFmtDate(t) { return faDigits(`${t[0]}/${pad2(t[1])}/${pad2(t[2])}`); }

function azkiReadBounds() {
  const [fy, fm, fd] = azkiFilterState.from;
  const [ty, tm, td] = azkiFilterState.to;
  return {
    startDate: jalaliToGregorian(fy, fm, fd),
    endDate: jalaliToGregorian(ty, tm, td),
    startLabel: `${fy}/${pad2(fm)}/${pad2(fd)}`,
    endLabel: `${ty}/${pad2(tm)}/${pad2(td)}`,
  };
}

function azkiActiveTab() {
  if (currentUserRole === 'leader') {
    return window.teamCurrentTab || null;
  }
  return window.supCurrentTab || null;
}

// (فیلتر همه‌ی تب‌ها یکسانه؛ چیزی برای مخفی/نمایش کردن نمونده)
function azkiSyncFilterForTab(tab) {
  const show = id => { const el = document.getElementById(id); const f = el && el.closest('.azki-fld'); if (f) f.style.display = ''; };
  show('azki-gran'); show('azki-comp-btn');
  // OCT کارت متابیس برای کل ازکی سنتر است و به شرکت بیمه وابسته نیست
  const octOnly = tab === 'azki-oct' || (tab === 'azki-chart' && azkiState.chart.report === 'oct');
  const cb = document.getElementById('azki-comp-btn'), cf = cb && cb.closest('.azki-fld');
  if (cf) cf.style.display = octOnly ? 'none' : '';
}

function azkiRenderLoadedViews() {
  if (azkiState.period.loaded) renderAzkiPeriodView();
  if (azkiState.centers.loaded) renderAzkiCentersView();
  if (azkiState.shifts.loaded) renderAzkiShiftsView();
  if (azkiState.compare.loaded) renderAzkiCompareView();
  if (azkiState.payroll.loaded) renderAzkiPayrollView();
  if (azkiState.oct.loaded && azkiActiveTab() === 'azki-oct') renderAzkiOctView();
  if (azkiActiveTab() === 'azki-chart') azkiChartEnsure();
}

function azkiApplyRange() {
  if (!azkiAllowed()) return;
  const errEl = document.getElementById('azki-filter-error');
  const b = azkiReadBounds();
  if (b.startDate > b.endDate) {
    errEl.textContent = 'تاریخ شروع نباید بعد از تاریخ پایان باشد.';
    return;
  }
  const days = (Date.parse(b.endDate) - Date.parse(b.startDate)) / 86400000 + 1;
  if (days > 366) {
    errEl.textContent = 'حداکثر بازه‌ی قابل نمایش یک سال است.';
    return;
  }
  if (!azkiActiveScopes().length) {
    errEl.textContent = 'حداقل یک شرکت را انتخاب کنید.';
    return;
  }
  errEl.textContent = '';

  azkiState.bounds = b;
  azkiState.period.loaded = false;
  azkiState.centers.loaded = false;
  azkiState.shifts.loaded = false;
  azkiState.compare.loaded = false;
  azkiState.oct.loaded = false;
  azkiState.payroll.loaded = false;
  ['azki-period-list', 'azki-centers-list', 'azki-shifts-list', 'azki-compare-list', 'azki-payroll-list', 'azki-oct-list'].forEach(id => {
    const el = document.getElementById(id); if (el) el.innerHTML = '<div class="loading-state">در حال بارگذاری...</div>';
  });

  const tab = azkiActiveTab();
  if (tab === 'azki-period') loadAzkiPeriodView();
  else if (tab === 'azki-centers') loadAzkiCentersView();
  else if (tab === 'azki-shifts') loadAzkiShiftsView();
  else if (tab === 'azki-compare') loadAzkiCompareView();
  else if (tab === 'azki-oct') loadAzkiOctView();
  else if (tab === 'azki-chart') azkiChartEnsure();
  else if (tab === 'azki-payroll') loadAzkiPayrollView();
}

let azkiApplyTimer = null;
function azkiApplySoon() {
  clearTimeout(azkiApplyTimer);
  azkiApplyTimer = setTimeout(azkiApplyRange, 300);
}

function azkiCalRender(key) {
  const pop = document.getElementById(`azki-${key}-cal`);
  let [vy, vm] = azkiCalView[key];
  const sel = azkiFilterState[key];
  const today = tehranTodayJalali();
  const len = azkiJalaliMonthLength(vy, vm);
  const offset = azkiWeekdayIndex(vy, vm, 1);

  const yMin = Math.min(today[0] - 4, vy), yMax = Math.max(today[0] + 1, vy);
  let yearOpts = '';
  for (let y = yMin; y <= yMax; y++) yearOpts += `<option value="${y}"${y === vy ? ' selected' : ''}>${faDigits(y)}</option>`;
  const monthOpts = JALALI_MONTHS_FA.map((n, i) => `<option value="${i + 1}"${i + 1 === vm ? ' selected' : ''}>${n}</option>`).join('');

  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<span></span>';
  for (let d = 1; d <= len; d++) {
    const isSel = sel && sel[0] === vy && sel[1] === vm && sel[2] === d;
    const isToday = today[0] === vy && today[1] === vm && today[2] === d;
    cells += `<button type="button" class="azki-cal-day${isSel ? ' sel' : ''}${isToday ? ' today' : ''}" data-day="${d}">${faDigits(d)}</button>`;
  }

  pop.innerHTML = `
    <div class="azki-cal-head">
      <button type="button" class="azki-cal-nav" data-nav="-1" aria-label="ماه قبل"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg></button>
      <select data-role="m" aria-label="ماه">${monthOpts}</select>
      <select data-role="y" aria-label="سال">${yearOpts}</select>
      <button type="button" class="azki-cal-nav" data-nav="1" aria-label="ماه بعد"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 6 9 12 15 18"/></svg></button>
    </div>
    <div class="azki-cal-grid">
      ${AZKI_WEEKDAYS.map(w => `<span class="azki-cal-wd">${w}</span>`).join('')}
      ${cells}
    </div>
    <div class="azki-pop-foot">
      <button type="button" class="sm-btn" data-today="1">امروز</button>
      <button type="button" class="sm-btn" data-close="1">بستن</button>
    </div>`;
}

function azkiPlacePop(pop) {
  pop.style.transform = '';
  const r = pop.getBoundingClientRect();
  const vw = document.documentElement.clientWidth || window.innerWidth;
  let dx = 0;
  if (r.left < 8) dx = 8 - r.left;
  else if (r.right > vw - 8) dx = (vw - 8) - r.right;
  if (dx) pop.style.transform = `translateX(${dx}px)`;
}

function azkiClosePops(exceptId) {
  document.querySelectorAll('.azki-pop').forEach(p => { if (p.id !== exceptId) p.hidden = true; });
}

function azkiSetDate(key, t) {
  azkiFilterState[key] = t;
  document.getElementById(`azki-${key}-text`).textContent = azkiFmtDate(t);
}

function azkiOpenCal(key) {
  const pop = document.getElementById(`azki-${key}-cal`);
  const willOpen = pop.hidden;
  azkiClosePops(pop.id);
  if (!willOpen) { pop.hidden = true; return; }
  const cur = azkiFilterState[key] || tehranTodayJalali();
  azkiCalView[key] = [cur[0], cur[1]];
  azkiCalRender(key);
  pop.hidden = false;
  azkiPlacePop(pop);
}

function azkiBindCal(key) {
  const pop = document.getElementById(`azki-${key}-cal`);
  document.getElementById(`azki-${key}-btn`).addEventListener('click', () => azkiOpenCal(key));

  pop.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    const day = e.target.closest('[data-day]');
    if (nav) {
      let [vy, vm] = azkiCalView[key];
      vm += parseInt(nav.dataset.nav, 10);
      if (vm < 1) { vm = 12; vy--; } else if (vm > 12) { vm = 1; vy++; }
      azkiCalView[key] = [vy, vm];
      azkiCalRender(key);
    } else if (day) {
      const [vy, vm] = azkiCalView[key];
      azkiSetDate(key, [vy, vm, parseInt(day.dataset.day, 10)]);
      pop.hidden = true;
      azkiApplyRange();
    } else if (e.target.closest('[data-today]')) {
      azkiSetDate(key, tehranTodayJalali());
      pop.hidden = true;
      azkiApplyRange();
    } else if (e.target.closest('[data-close]')) {
      pop.hidden = true;
    }
  });
  pop.addEventListener('change', e => {
    const role = e.target.dataset.role;
    if (!role) return;
    const v = parseInt(e.target.value, 10);
    if (role === 'm') azkiCalView[key][1] = v; else azkiCalView[key][0] = v;
    azkiCalRender(key);
  });
}

function azkiCompanySummary() {
  const c = azkiState.companies;
  if (c.all) return 'همه شرکت‌ها';
  const sel = AZKI_COMPANIES.filter(n => c.selected.has(n));
  if (!sel.length) return 'هیچ شرکتی انتخاب نشده';
  if (sel.length <= 2) return sel.join('، ');
  return `${faDigits(sel.length)} شرکت انتخاب‌شده`;
}

function azkiRenderCompanyFilter() {
  const c = azkiState.companies;
  document.getElementById('azki-comp-all').checked = c.all;
  document.getElementById('azki-comp-list').innerHTML = AZKI_COMPANIES.map((n, i) =>
    `<label class="azki-chk"><input type="checkbox" data-comp="${i}"${(!c.all && c.selected.has(n)) ? ' checked' : ''}><span>${n}</span></label>`
  ).join('');
  document.getElementById('azki-comp-summary').textContent = azkiCompanySummary();
}

function azkiBindCompanyFilter() {
  const c = azkiState.companies;
  const pop = document.getElementById('azki-comp-pop');

  document.getElementById('azki-comp-btn').addEventListener('click', () => {
    const willOpen = pop.hidden;
    azkiClosePops(pop.id);
    pop.hidden = !willOpen;
    if (willOpen) azkiPlacePop(pop);
  });

  document.getElementById('azki-comp-all').addEventListener('change', e => {
    if (e.target.checked) { c.all = true; c.selected = new Set(); }
    else { c.all = false; c.selected = new Set(AZKI_COMPANIES); }
    azkiRenderCompanyFilter();
    azkiApplySoon();
  });

  document.getElementById('azki-comp-list').addEventListener('change', e => {
    const idx = e.target.dataset.comp;
    if (idx === undefined) return;
    const name = AZKI_COMPANIES[parseInt(idx, 10)];
    if (c.all) { c.all = false; c.selected = new Set([name]); }
    else if (e.target.checked) c.selected.add(name);
    else c.selected.delete(name);
    azkiRenderCompanyFilter();
    azkiApplySoon();
  });

  document.getElementById('azki-comp-clear').addEventListener('click', () => {
    c.all = false; c.selected = new Set();
    azkiRenderCompanyFilter();
    azkiApplySoon();
  });
  document.getElementById('azki-comp-close').addEventListener('click', () => { pop.hidden = true; });
}

function initAzkiFilter() {
  const def = getAzkiBounds();
  const st = parseJalaliParts(def.startLabel), en = parseJalaliParts(def.endLabel);
  azkiSetDate('from', [st.jy, st.jm, st.jd]);
  azkiSetDate('to', [en.jy, en.jm, en.jd]);

  azkiBindCal('from');
  azkiBindCal('to');
  azkiRenderCompanyFilter();
  azkiBindCompanyFilter();

  document.querySelectorAll('#azki-gran .azki-seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#azki-gran .azki-seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      azkiState.granularity = btn.dataset.gran;
      azkiRenderLoadedViews();
    });
  });

  document.addEventListener('click', e => {
    const path = e.composedPath ? e.composedPath() : [];
    if (!path.some(n => n.classList && n.classList.contains('azki-fld'))) azkiClosePops();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') azkiClosePops(); });
}
initAzkiFilter();

// آخرین آپدیت: روی تب‌های عادی «آخرین آپدیت تارگت‌ها» و روی تب‌های گروه «گزارش» «آخرین آپدیت گزارش‌ها»
window.__lastUpdateData = { targets: null, reports: null };
window.__lastUpdateMode = 'targets';
function renderLastUpdateBar() {
  const bar = document.getElementById('last-update-bar');
  if (!bar) return;
  const d = window.__lastUpdateData || {};
  const label = window.__lastUpdateMode === 'reports' ? d.reports : d.targets;
  if (!label) { delete bar.dataset.label; bar.style.display = 'none'; return; }
  if (bar.dataset.label === label && bar.firstElementChild) { bar.style.display = 'flex'; return; }
  bar.dataset.label = label;
  bar.innerHTML = `
    <span class="last-update-card">
      <span class="last-update-dot"></span>
      <span>${escHtml(label)}</span>
    </span>
  `;
  bar.style.display = 'flex';
}
window.setLastUpdateMode = function (isReport) {
  const mode = isReport ? 'reports' : 'targets';
  if (window.__lastUpdateMode === mode) return;
  window.__lastUpdateMode = mode;
  renderLastUpdateBar();
};

async function loadLastUpdate() {
  let { data, error } = await supabaseClient
    .from(TABLE_META)
    .select('updated_label, reports_updated_label')
    .eq('id', 1)
    .single();

  if (error) {
    // اگه ستون reports_updated_label هنوز ساخته نشده، حداقل آپدیت تارگت‌ها نمایش داده بشه
    const fb = await supabaseClient.from(TABLE_META).select('updated_label').eq('id', 1).single();
    data = fb.data;
    error = fb.error;
  }
  if (error) console.error('خطا در دریافت آخرین آپدیت:', error.message, error);

  const __prevLu = JSON.stringify(window.__lastUpdateData || {});
  window.__lastUpdateData = {
    targets: (data && data.updated_label) || null,
    reports: (data && data.reports_updated_label) || null
  };
  if (!error) {
    const had = window.__luCheckedAt;
    window.__luCheckedAt = Date.now();
    if (window.__luNoteChecked) window.__luNoteChecked(!!had && __prevLu !== JSON.stringify(window.__lastUpdateData));
  }
  renderLastUpdateBar();
}

async function enterApp(user) {
  loginScreen.style.display = 'none';
  document.getElementById('user-label').textContent = '';

  currentUserId = user.id;
  window.__lastUpdateMode = 'targets';
  window.__luPending = loadLastUpdate();
  // (تایمر جدای ۲ دقیقه‌ای حذف شد: softRefresh هر ۳ دقیقه خودش loadLastUpdate رو صدا می‌زنه)

  const { data: profile, error: profileError } = await supabaseClient
    .from(TABLE_PROFILES)
    .select('role, full_name')
    .eq('id', user.id)
    .single();

  const isCenter = !profileError && profile && profile.role === 'center';
  const isLeader = !profileError && profile && profile.role === 'leader';
  const isSupervisor = !profileError && profile && profile.role === 'supervisor';
  currentUserRole = (!profileError && profile) ? profile.role : null;
  document.getElementById('user-label').textContent = (profile && profile.full_name && profile.full_name.trim()) || user.email.split('@')[0];
  document.documentElement.classList.toggle('allow-select', currentUserRole === 'supervisor');
  // فونت IRANSansX فقط برای سرپرست و اپراتور (اپراتور = نقش agent یا هر نقش ناشناخته‌ای که به پنل تارگت روزانه می‌ره)
  const knownOtherRoles = ['admin', 'center', 'leader'];
  document.documentElement.classList.toggle('font-iransans', !knownOtherRoles.includes(currentUserRole));

  if (isCenter) {
    document.getElementById('main-tabs').style.display = 'none';
    document.getElementById('panel-targets').classList.remove('active');
    document.getElementById('panel-bugs').classList.remove('active');
    document.getElementById('team-tabs').style.display = 'none';
    document.getElementById('panel-team').classList.remove('active');
    document.getElementById('panel-team-bugs').classList.remove('active'); document.getElementById('panel-team-perf').classList.remove('active');
    document.getElementById('center-tabs').style.display = 'flex';
    document.getElementById('panel-center').classList.add('active');
    document.getElementById('center-filter').style.display = '';
    // پنل حضور و غیاب باید بعد از تب‌ها و فیلتر بیاد، نه بالاشون
    document.getElementById('center-filter').after(document.getElementById('panel-attendance'));
    document.getElementById('panel-center-bugs').classList.remove('active');
    document.getElementById('panel-supervisor').classList.remove('active');
    loadCenterView(user.id);
    loadCenterHiddenTabs();
  } else if (isLeader) {
    document.getElementById('main-tabs').style.display = 'none';
    document.getElementById('panel-targets').classList.remove('active');
    document.getElementById('panel-bugs').classList.remove('active');
    document.getElementById('team-tabs').style.display = 'flex';
    document.querySelector('main').classList.add('wide-nav');
    document.getElementById('panel-team').classList.add('active');
    document.getElementById('panel-team-bugs').classList.remove('active'); document.getElementById('panel-team-perf').classList.remove('active');
    document.getElementById('center-tabs').style.display = 'none';
    document.getElementById('panel-center').classList.remove('active');
    document.getElementById('panel-center-bugs').classList.remove('active');
    document.getElementById('panel-supervisor').classList.remove('active');
    (function relocateAzkiViewsForLeader() {
      const filterEl = document.getElementById('azki-filter');
      [['panel-azki-compare', 'sup-view-azki-compare'], ['panel-azki-oct', 'sup-view-azki-oct'], ['panel-azki-chart', 'sup-view-azki-chart'], ['panel-azki-shifts', 'sup-view-azki-shifts'], ['panel-azki-active', 'sup-view-azki-active'], ['panel-azki-payroll', 'sup-view-azki-payroll']].forEach(([hostId, viewId]) => {
        const host = document.getElementById(hostId);
        const viewEl = document.getElementById(viewId);
        if (host && viewEl && !host.contains(viewEl)) {
          host.appendChild(viewEl);
          viewEl.style.display = '';
        }
      });
      const compareHost = document.getElementById('panel-azki-compare');
      if (filterEl && compareHost && !compareHost.contains(filterEl)) compareHost.insertBefore(filterEl, compareHost.firstChild);
    })();
    loadTeamView(user.id);
    loadLeaderHiddenTabs();
  } else if (isSupervisor) {
    document.getElementById('main-tabs').style.display = 'none';
    document.getElementById('panel-targets').classList.remove('active');
    document.getElementById('panel-bugs').classList.remove('active');
    document.getElementById('team-tabs').style.display = 'none';
    document.getElementById('panel-team').classList.remove('active');
    document.getElementById('panel-team-bugs').classList.remove('active'); document.getElementById('panel-team-perf').classList.remove('active');
    document.getElementById('center-tabs').style.display = 'none';
    document.getElementById('panel-center').classList.remove('active');
    document.getElementById('panel-center-bugs').classList.remove('active');
    document.getElementById('panel-supervisor').classList.add('active');
    document.querySelector('main').classList.add('wide-nav');
    loadSupervisorView();
    loadSupHiddenTabs();
  } else {
    loadTargets(user.id);
    loadBugs(user.id, true);
    loadAgentHiddenTabs();
  }

  appScreen.style.display = 'block';
  document.documentElement.classList.remove('auth-pending');

  if (isLeader || isSupervisor) kbNotifyStart();

  if (window.refreshGlassReveals) window.refreshGlassReveals();
}

function relativeTimeFa(dateStr) {
  if (!dateStr) return 'هیچ‌وقت وارد نشده';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'همین الان';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} دقیقه پیش`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} ساعت پیش`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay} روز پیش`;
}

function tehranDateKey(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function tehranJalaliParts(date) {
  const [gy, gm, gd] = tehranDateKey(date).split('-').map(Number);
  const [jy, jm, jd] = gregorianToJalali(gy, gm, gd);
  return { jy, jm: pad2(jm), jd: pad2(jd) };
}

function tehranJalaliKey(date) {
  const { jy, jm, jd } = tehranJalaliParts(date);
  return `${jy}/${jm}/${jd}`;
}

// پنل آموزش هر سنتر: نام پروفایل به «| آموزش» ختم می‌شه (مثلا «مرکز صدور قادری | آموزش»)
function isTrainingPanel(m) { return /\|\s*آموزش\s*$/.test((m && m.full_name) || ''); }

// عدد «خطا» کنار صدور هر کارشناس = تعداد ردیف‌های همون کارشناس تو جدول discrepancy_errors (همون داده‌ی تب «خطای صدور»)
function discAgentBadgeText(agentId) {
  const n = (window.DISC && window.DISC.countFor) ? window.DISC.countFor(agentId) : 0;
  return `${faDigits(formatNumber(n))} خطا`;
}
let _discBadgeTimer = null;
function discScheduleBadges() {   // بعد از ساخته‌شدن لیست: اگه خطاها هنوز دریافت نشدن می‌گیره، وگرنه فقط عددها رو به‌روز می‌کنه
  if (_discBadgeTimer) return;
  _discBadgeTimer = setTimeout(() => { _discBadgeTimer = null; if (window.DISC && window.DISC.ensure) window.DISC.ensure(); }, 0);
}

function buildMemberItemsHtml(membersWithTotals) {
  discScheduleBadges();
  return membersWithTotals.map(({ m, myRows, myBugs, myTotal }) => {
    const displayName = m.full_name || m.backoffice_id || '—';

    const slaMin = agentSlaMap ? agentSlaMap[m.id] : undefined;
    const slaHtml = agentSlaMap
      ? `<span class="team-sla" title="میانگین کل دوره‌ی ${agentSlaPeriodLabel}">میانگین زمان صدور: <b>${slaMin != null ? formatNumber(slaMin) + ' دقیقه' : '—'}</b></span>`
      : '';

    const daysHtml = myRows.length
      ? sortRowsByDateAsc(myRows).map(r => `
          <div class="team-day-row">
            <span class="team-day-date">${toJalaliDisplay(r.report_date_jalali)}</span>
            <span class="team-day-badge">${r.target_count != null ? formatNumber(r.target_count) : '—'}</span>
          </div>
        `).join('')
      : '<div class="team-empty-days">هنوز تارگتی برای این بازه ثبت نشده است</div>';

    return `
      <div class="team-item${m.status === 'disabled' ? ' is-disabled' : ''}" data-member="${m.id}">
        <button class="team-header" type="button">
          <div class="team-name-wrap">
            <svg class="team-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            <span class="team-name">${escHtml(displayName)}</span>${isTrainingPanel(m) ? '<span class="team-edu-badge" title="پنل آموزش این سنتر">پنل آموزش</span>' : ''}${m.status === 'disabled' ? '<span class="team-disabled-badge" title="دیگر با ما همکاری ندارد؛ فقط آمار صدورش در این بازه حفظ شده">غیرفعال</span>' : ''}
          </div>
          <div class="team-right">
            ${slaHtml}
            <span class="team-bug-total" data-disc-agent="${m.id}">${discAgentBadgeText(m.id)}</span>
            <span class="team-total">${formatNumber(myTotal)}</span>
          </div>
        </button>
        <div class="team-details">
          <div class="team-details-inner">${daysHtml}</div>
        </div>
      </div>
    `;
  }).join('');
}

function buildGroupedMemberItemsHtml(membersWithTotals) {
  const groupsMap = new Map();
  membersWithTotals.forEach(item => {
    const centerName = item.m.centerName || 'بدون سنتر';
    if (!groupsMap.has(centerName)) groupsMap.set(centerName, []);
    groupsMap.get(centerName).push(item);
  });

  const groups = Array.from(groupsMap.entries()).map(([centerName, items]) => {
    const total = items.reduce((sum, it) => sum + it.myTotal, 0);
    return { centerName, items, total };
  });

  groups.sort((a, b) => b.total - a.total);

  return groups.map(g => `
    <div class="leader-item">
      <button class="leader-header" type="button">
        <div class="leader-name-wrap">
          <svg class="leader-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          <span class="leader-name">${escHtml(fmtCenterName(g.centerName))}</span>
        </div>
        <div class="leader-right">
          <span class="leader-count">${formatNumber(g.items.length)} نفر</span>
          <span class="leader-total">${formatNumber(g.total)}</span>
        </div>
      </button>
      <div class="leader-details">
        <div class="leader-details-inner">${g.items.map(it => buildMemberItemsHtml([it])).join('')}</div>
      </div>
    </div>
  `).join('');
}

function bindExpandableToggles(container) {
  container.querySelectorAll('.leader-item').forEach(litem => {
    const header = litem.querySelector(':scope > .leader-header');
    if (header) {
      header.addEventListener('click', () => {
        litem.classList.toggle('open');
        if (window.refreshGlassReveals) window.refreshGlassReveals(litem);
      });
    }
  });
  container.querySelectorAll('.team-item').forEach(item => {
    const header = item.querySelector('.team-header');
    if (header) {
      header.addEventListener('click', () => {
        item.classList.toggle('open');
        if (window.refreshGlassReveals) window.refreshGlassReveals(item);
      });
    }
  });
}

// ============================================================
// فیلتر تاریخ تب «تعداد صدور تیم» سرگروه (پیش‌فرض: ۲۱ تا ۲۰ ماه بعد؛ قابل تغییر دستی) + خروجی اکسل
// ============================================================
const teamTargetsFilter = { from: null, to: null, custom: false };   // [jy, jm, jd]
const teamCalView = { from: [0, 0], to: [0, 0] };
let teamLoadToken = 0;

const teamSortKey = t => t[0] * 10000 + t[1] * 100 + t[2];
const teamLabel = t => `${t[0]}/${pad2(t[1])}/${pad2(t[2])}`;

function teamTargetsPeriod() {
  if (!teamTargetsFilter.from || !teamTargetsFilter.to) return currentPeriodBounds();
  const f = teamTargetsFilter.from, t = teamTargetsFilter.to;
  return { startSort: teamSortKey(f), endSort: teamSortKey(t), startLabel: teamLabel(f), endLabel: teamLabel(t) };
}

function teamSetDate(key, t) {
  teamTargetsFilter[key] = t;
  document.getElementById(`team-${key}-text`).textContent = faDigits(teamLabel(t));
}

function teamSetDefaultRange() {
  const d = currentPeriodBounds();
  const s0 = parseJalaliParts(d.startLabel), e0 = parseJalaliParts(d.endLabel);
  teamSetDate('from', [s0.jy, s0.jm, s0.jd]);
  teamSetDate('to', [e0.jy, e0.jm, e0.jd]);
  teamTargetsFilter.custom = false;
}

function teamCalRender(key) {
  const pop = document.getElementById(`team-${key}-cal`);
  let [vy, vm] = teamCalView[key];
  const sel = teamTargetsFilter[key];
  const today = tehranTodayJalali();
  const len = azkiJalaliMonthLength(vy, vm);
  const offset = azkiWeekdayIndex(vy, vm, 1);
  const yMin = Math.min(today[0] - 4, vy), yMax = Math.max(today[0] + 1, vy);
  let yearOpts = '';
  for (let y = yMin; y <= yMax; y++) yearOpts += `<option value="${y}"${y === vy ? ' selected' : ''}>${faDigits(y)}</option>`;
  const monthOpts = JALALI_MONTHS_FA.map((n, i) => `<option value="${i + 1}"${i + 1 === vm ? ' selected' : ''}>${n}</option>`).join('');
  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<span></span>';
  for (let d = 1; d <= len; d++) {
    const isSel = sel && sel[0] === vy && sel[1] === vm && sel[2] === d;
    const isToday = today[0] === vy && today[1] === vm && today[2] === d;
    cells += `<button type="button" class="azki-cal-day${isSel ? ' sel' : ''}${isToday ? ' today' : ''}" data-day="${d}">${faDigits(d)}</button>`;
  }
  const chev = pts => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="${pts}"/></svg>`;
  pop.innerHTML = `
    <div class="azki-cal-head">
      <button type="button" class="azki-cal-nav" data-nav="-1" aria-label="ماه قبل">${chev('9 6 15 12 9 18')}</button>
      <select data-role="m" aria-label="ماه">${monthOpts}</select>
      <select data-role="y" aria-label="سال">${yearOpts}</select>
      <button type="button" class="azki-cal-nav" data-nav="1" aria-label="ماه بعد">${chev('15 6 9 12 15 18')}</button>
    </div>
    <div class="azki-cal-grid">
      ${AZKI_WEEKDAYS.map(w => `<span class="azki-cal-wd">${w}</span>`).join('')}
      ${cells}
    </div>
    <div class="azki-pop-foot">
      <button type="button" class="sm-btn" data-today="1">امروز</button>
      <button type="button" class="sm-btn" data-close="1">بستن</button>
    </div>`;
}

function teamOpenCal(key) {
  const pop = document.getElementById(`team-${key}-cal`);
  const willOpen = pop.hidden;
  azkiClosePops(pop.id);
  if (!willOpen) { pop.hidden = true; return; }
  const cur = teamTargetsFilter[key] || tehranTodayJalali();
  teamCalView[key] = [cur[0], cur[1]];
  teamCalRender(key);
  pop.hidden = false;
  azkiPlacePop(pop);
}

function teamBindCal(key) {
  const pop = document.getElementById(`team-${key}-cal`);
  document.getElementById(`team-${key}-btn`).addEventListener('click', () => teamOpenCal(key));
  pop.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    const day = e.target.closest('[data-day]');
    if (nav) {
      let [vy, vm] = teamCalView[key];
      vm += parseInt(nav.dataset.nav, 10);
      if (vm < 1) { vm = 12; vy--; } else if (vm > 12) { vm = 1; vy++; }
      teamCalView[key] = [vy, vm];
      teamCalRender(key);
    } else if (day) {
      const [vy, vm] = teamCalView[key];
      teamSetDate(key, [vy, vm, parseInt(day.dataset.day, 10)]);
      pop.hidden = true;
      teamApplyRange();
    } else if (e.target.closest('[data-today]')) {
      teamSetDate(key, tehranTodayJalali());
      pop.hidden = true;
      teamApplyRange();
    } else if (e.target.closest('[data-close]')) {
      pop.hidden = true;
    }
  });
  pop.addEventListener('change', e => {
    const role = e.target.dataset.role;
    if (!role) return;
    const v = parseInt(e.target.value, 10);
    if (role === 'm') teamCalView[key][1] = v; else teamCalView[key][0] = v;
    teamCalRender(key);
  });
}

function teamReload() {
  if (!window.teamLeaderId) return;
  document.getElementById('team-list').innerHTML = '<div class="loading-state">در حال بارگذاری...</div>';
  loadTeamView(window.teamLeaderId);
}

function teamApplyRange() {
  const errEl = document.getElementById('team-filter-error');
  const f = teamTargetsFilter.from, t = teamTargetsFilter.to;
  if (!f || !t) return;
  if (teamSortKey(f) > teamSortKey(t)) { errEl.textContent = 'تاریخ شروع نباید بعد از تاریخ پایان باشد.'; return; }
  const days = (Date.parse(jalaliToGregorian(t[0], t[1], t[2])) - Date.parse(jalaliToGregorian(f[0], f[1], f[2]))) / 86400000 + 1;
  if (days > 366) { errEl.textContent = 'حداکثر بازه‌ی قابل نمایش یک سال است.'; return; }
  errEl.textContent = '';
  teamTargetsFilter.custom = true;
  teamReload();
}

function initTeamTargetsFilter() {
  teamSetDefaultRange();
  teamBindCal('from');
  teamBindCal('to');
  document.getElementById('team-export-btn').addEventListener('click', exportTeamTargetsExcel);
}
initTeamTargetsFilter();

async function loadTeamView(leaderId) {
  const container = document.getElementById('team-list');
  window.teamLeaderId = leaderId;
  const token = ++teamLoadToken;
  const perfEl = document.getElementById('team-perf-list');
  const firstLoad = !(perfEl && perfEl.children.length);   // رفرش‌های بعدی بدون چشمک «در حال بارگذاری»
  if (perfEl && firstLoad) perfEl.innerHTML = '<div class="loading-state">در حال بارگذاری...</div>';
  if (firstLoad) document.getElementById('team-with-target-count').textContent = '—';
  const period = teamTargetsPeriod();
  document.getElementById('team-period-label').textContent = faDigits(`${teamTargetsFilter.custom ? 'بازه‌ی نمایش' : 'بازه‌ی جاری'}: ${period.startLabel} تا ${period.endLabel}`);

  const { data: myCenterLinks, error: myCenterLinksError } = await fetchAllRows((from, to) =>
    supabaseClient
      .from(TABLE_LEADER_CENTERS)
      .select('center_id')
      .eq('leader_id', leaderId)
      .range(from, to)
  );

  let myCenterIds = (myCenterLinks || []).map(l => l.center_id).filter(Boolean);

  // سنتر غیرفعال در پنل سرگروه نمایش داده نمی‌شود (تا دوباره فعال شود)
  let allMyCentersOff = false;
  if (!myCenterLinksError && myCenterIds.length) {
    const { data: stRows } = await fetchAllRows((from, to) =>
      supabaseClient.from(TABLE_PROFILES).select('id, status').in('id', myCenterIds).range(from, to));
    const offIds = new Set((stRows || []).filter(c => c.status === 'disabled').map(c => c.id));
    if (offIds.size) {
      myCenterIds = myCenterIds.filter(id => !offIds.has(id));
      allMyCentersOff = myCenterIds.length === 0;
    }
  }

  if (myCenterLinksError || myCenterIds.length === 0) {
    container.innerHTML = allMyCentersOff
      ? '<div class="empty-state">همه‌ی سنترهای شما غیرفعال هستند</div>'
      : '<div class="empty-state">هنوز سنتری به شما اساین نشده است</div>';
    document.getElementById('team-period-total').textContent = '۰';
    document.getElementById('team-with-target-count').textContent = '۰';
    document.getElementById('team-agent-count').textContent = '۰';
    return;
  }

  // پروفایل سنترها و لینک نیروها مستقل‌اند؛ هم‌زمان گرفته می‌شوند
  const centerProfilesP = fetchAllRows((from, to) =>
    supabaseClient
      .from(TABLE_PROFILES)
      .select('id, full_name')
      .in('id', myCenterIds)
      .range(from, to)
  );
  const centerAgentLinksP = fetchAllRows((from, to) =>
    supabaseClient
      .from(TABLE_CENTER_AGENTS)
      .select('center_id, agent_id')
      .in('center_id', myCenterIds)
      .range(from, to)
  );
  [centerProfilesP, centerAgentLinksP].forEach(p => p.catch(() => {}));
  const { data: centerProfiles, error: centerProfilesError } = await centerProfilesP;

  const centerNameById = {};
  (centerProfiles || []).forEach(c => { centerNameById[c.id] = c.full_name || 'بدون سنتر'; });

  const { data: centerAgentLinks, error: centerAgentLinksError } = await centerAgentLinksP;

  if (centerAgentLinksError) {
    container.innerHTML = `<div class="empty-state">خطا در دریافت اساین نیروها: ${escHtml(centerAgentLinksError.message)}</div>`;
    document.getElementById('team-period-total').textContent = '—';
    document.getElementById('team-agent-count').textContent = '—';
    return;
  }

  const centerNameByAgentId = {};
  (centerAgentLinks || []).forEach(l => {
    centerNameByAgentId[l.agent_id] = centerNameById[l.center_id] || 'بدون سنتر';
  });

  const memberIdsFromLinks = Object.keys(centerNameByAgentId);

  if (memberIdsFromLinks.length === 0) {
    container.innerHTML = '<div class="empty-state">هنوز نیرویی به شما اساین نشده است</div>';
    document.getElementById('team-period-total').textContent = '۰';
    document.getElementById('team-agent-count').textContent = '۰';
    return;
  }

  const { data: allMembers, error: membersError } = await fetchAllRows((from, to) =>
    supabaseClient
      .from(TABLE_PROFILES)
      .select('id, backoffice_id, full_name, role, status')
      .in('id', memberIdsFromLinks)
      .eq('role', 'agent')
      .range(from, to)
  );

  if (membersError) {
    container.innerHTML = `<div class="empty-state">خطا در دریافت پروفایل نیروها: ${escHtml(membersError.message)}</div>`;
    document.getElementById('team-period-total').textContent = '—';
    document.getElementById('team-agent-count').textContent = '—';
    return;
  }
  if (!allMembers || allMembers.length === 0) {
    container.innerHTML = '<div class="empty-state">هنوز نیرویی به شما اساین نشده است</div>';
    document.getElementById('team-period-total').textContent = '۰';
    document.getElementById('team-agent-count').textContent = '۰';
    return;
  }

  allMembers.forEach(m => { m.centerName = centerNameByAgentId[m.id] || 'بدون سنتر'; });
  let members = allMembers;

  if (members.length === 0) {
    container.innerHTML = '<div class="empty-state">هنوز نیرویی به شما اساین نشده است</div>';
    document.getElementById('team-period-total').textContent = '۰';
    teamBugsFlat = [];
    renderTeamBugsList(teamBugsFlat);
    return;
  }

  const memberIds = allMembers.map(m => m.id);

  // تارگت‌ها و خطاها فقط به memberIds نیاز دارند؛ هم‌زمان گرفته می‌شوند
  const rowsP = fetchAllRows((from, to) =>
    supabaseClient
      .from(TABLE_TARGETS)
      .select('agent_id,report_date,report_date_jalali,report_date_sort,target_count,avg_issuance_minutes,discount_transfer_count')
      .in('agent_id', memberIds)
      .gte('report_date_sort', period.startSort)
      .lte('report_date_sort', period.endSort)
      .order('report_date_sort', { ascending: true })
      .order('agent_id', { ascending: true })
      .range(from, to)
  );
  const bugRowsP = fetchBugRowsSafe((from, to) =>
    supabaseClient
      .from(TABLE_BUGS)
      .select('*')
      .in('user_id', memberIds)
      .order('check_date_sort', { ascending: false })
      .range(from, to)
  );
  [rowsP, bugRowsP].forEach(p => p.catch(() => {}));
  const { data: rows, error: rowsError } = await rowsP;

  if (token !== teamLoadToken) return;
  if (rowsError) {
    container.innerHTML = `<div class="empty-state">خطا در دریافت تارگت‌ها: ${escHtml(rowsError.message)}</div>`;
    document.getElementById('team-period-total').textContent = '—';
    return;
  }

  const { data: bugRows, error: bugRowsError } = await bugRowsP;

  if (bugRowsError) {
    console.error('خطا در دریافت خطاهای نیروها:', bugRowsError.message);
  }

  const rowsByUser = {};
  for (const r of (rows || [])) {
    if (!rowsByUser[r.agent_id]) rowsByUser[r.agent_id] = [];
    rowsByUser[r.agent_id].push(r);
  }

  const bugsByUser = {};
  for (const b of (bugRows || [])) {
    if (!bugsByUser[b.user_id]) bugsByUser[b.user_id] = [];
    bugsByUser[b.user_id].push(b);
  }

  // کارشناس غیرفعال فقط وقتی نمایش داده می‌شه که تو بازه‌ی انتخابی صدور داشته باشه
  members = allMembers.filter(m => m.status !== 'disabled' || (rowsByUser[m.id] || []).length > 0);
  document.getElementById('team-agent-count').textContent = formatNumber(members.filter(m => m.status !== 'disabled' && !isTrainingPanel(m)).length);

  let teamTotal = 0;
  const membersWithTotals = members.map(m => {
    const myRows = rowsByUser[m.id] || [];
    const myBugs = bugsByUser[m.id] || [];
    const myTotal = myRows.reduce((sum, r) => sum + (Number(r.target_count) || 0), 0);
    teamTotal += myTotal;
    return { m, myRows, myBugs, myTotal };
  });

  membersWithTotals.sort((a, b) => b.myTotal - a.myTotal);

  agentSlaMap = buildSlaMapFromRows(rows, period.startSort);
  if (agentSlaMap && teamTargetsFilter.custom) agentSlaPeriodLabel = faDigits(`${period.startLabel} تا ${period.endLabel}`);
  window.teamTargetsData = { items: membersWithTotals, period, slaMap: agentSlaMap };
  const memberBlocks = buildGroupedMemberItemsHtml(membersWithTotals);

  container.innerHTML = memberBlocks || '<div class="empty-state">هنوز نیرویی به شما اساین نشده است</div>';
  renderTeamPerf();
  document.getElementById('team-period-total').textContent = formatNumber(teamTotal);
  document.getElementById('team-with-target-count').textContent = formatNumber(membersWithTotals.filter(x => x.myRows.length > 0).length);

  teamBugsFlat = [];
  for (const m of members) {
    const displayName = m.full_name || m.backoffice_id || '—';
    for (const b of (bugsByUser[m.id] || [])) {
      teamBugsFlat.push({ ...b, _memberName: displayName });
    }
  }
  teamBugsFlat.sort((a, b) => (Number(b.check_date_sort) || 0) - (Number(a.check_date_sort) || 0));

  renderTeamBugsList(teamBugsFlat);

  bindExpandableToggles(container);
}

// تب «بررسی عملکرد» سرگروه: همون داده‌ی تب «تعداد صدور تیم» (همون فیلتر تاریخ) ولی فقط جمع هر کارشناس، گروه‌بندی‌شده به تفکیک سنتر
function renderTeamPerf() {
  const el = document.getElementById('team-perf-list'), lb = document.getElementById('team-perf-label');
  if (!el) return;
  const pl = document.getElementById('team-period-label');
  if (lb && pl) lb.textContent = pl.textContent;
  const td = window.teamTargetsData;
  if (!td || !td.items) {
    const tl = document.getElementById('team-list');
    el.innerHTML = tl && tl.querySelector('.empty-state') ? tl.innerHTML : '<div class="loading-state">در حال بارگذاری...</div>';
    return;
  }
  const byCenter = new Map();
  td.items.forEach(it => {
    const c = fmtCenterName(it.m.centerName || 'بدون سنتر');
    if (!byCenter.has(c)) byCenter.set(c, []);
    byCenter.get(c).push({ name: it.m.full_name || it.m.backoffice_id || '—', rows: it.myRows });
  });
  if (!byCenter.size) { el.innerHTML = '<div class="empty-state">هنوز نیرویی به شما اساین نشده است</div>'; return; }
  el.innerHTML = issuanceSplitHtml(issuanceSplitModel([...byCenter.entries()].map(([title, items]) => ({ title, items }))));
  bindExpandableToggles(el);
}

// تب «بررسی عملکرد» سرپرست: همون داده‌ی تب «صدور» (همون فیلتر تاریخ) ولی فقط جمع هر کارشناس به تفکیک غیرانتقالی/انتقال تخفیفی، گروه‌بندی‌شده به تفکیک سنتر
function renderSupPerf() {
  const el = document.getElementById('sup-perf-list'), lb = document.getElementById('sup-perf-label');
  if (!el) return;
  const pl = document.getElementById('supervisor-period-label');
  if (lb && pl) lb.textContent = pl.textContent;
  const td = window.supTargetsData;
  if (!td || !td.items) {
    const sl = document.getElementById('supervisor-list');
    el.innerHTML = sl && sl.querySelector('.empty-state') ? sl.innerHTML : '<div class="loading-state">در حال بارگذاری...</div>';
    return;
  }
  const byCenter = new Map();
  td.items.filter(it => !it.m.centerDisabled).forEach(it => {
    const c = fmtCenterName(it.m.centerName || 'بدون سنتر');
    if (!byCenter.has(c)) byCenter.set(c, []);
    byCenter.get(c).push({ name: it.m.full_name || it.m.backoffice_id || '—', rows: it.myRows });
  });
  if (!byCenter.size) { el.innerHTML = '<div class="empty-state">هنوز نیرویی به هیچ سنتری اساین نشده است</div>'; return; }
  el.innerHTML = issuanceSplitHtml(issuanceSplitModel([...byCenter.entries()].map(([title, items]) => ({ title, items }))));
  bindExpandableToggles(el);
}

function buildSupervisorLeadersHtml(leaderGroups) {
  return leaderGroups.map(lg => `
    <div class="leader-item">
      <button class="leader-header" type="button">
        <div class="leader-name-wrap">
          <svg class="leader-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          <span class="leader-name">${escHtml(lg.leaderName)}</span>
        </div>
        <div class="leader-right">
          <span class="leader-count">${formatNumber(lg.items.length)} نفر</span>
          <span class="leader-total">${formatNumber(lg.total)}</span>
        </div>
      </button>
      <div class="leader-details">
        <div class="leader-details-inner">${buildGroupedMemberItemsHtml(lg.items)}</div>
      </div>
    </div>
  `).join('');
}

function publishSupTargetCenters(list) {
  window.supTargetCenters = list;
  document.dispatchEvent(new CustomEvent('sup-target-centers'));
}

// ============================================================
// فیلتر تاریخ تب «صدور» سرپرست (پیش‌فرض: بازه‌ی ۲۱ تا ۲۰ ماه بعد؛ قابل تغییر دستی) + خروجی اکسل
// ============================================================
const supTargetsFilter = { from: null, to: null, custom: false };   // [jy, jm, jd]
const supCalView = { from: [0, 0], to: [0, 0] };
let supLoadToken = 0;

const supSortKey = t => t[0] * 10000 + t[1] * 100 + t[2];
const supLabel = t => `${t[0]}/${pad2(t[1])}/${pad2(t[2])}`;

function supTargetsPeriod() {
  if (!supTargetsFilter.from || !supTargetsFilter.to) return currentPeriodBounds();
  const f = supTargetsFilter.from, t = supTargetsFilter.to;
  return { startSort: supSortKey(f), endSort: supSortKey(t), startLabel: supLabel(f), endLabel: supLabel(t) };
}

function supSetDate(key, t) {
  supTargetsFilter[key] = t;
  document.getElementById(`sup-${key}-text`).textContent = faDigits(supLabel(t));
}

function supSetDefaultRange() {
  const d = currentPeriodBounds();
  const s0 = parseJalaliParts(d.startLabel), e0 = parseJalaliParts(d.endLabel);
  supSetDate('from', [s0.jy, s0.jm, s0.jd]);
  supSetDate('to', [e0.jy, e0.jm, e0.jd]);
  supTargetsFilter.custom = false;
}

function supCalRender(key) {
  const pop = document.getElementById(`sup-${key}-cal`);
  let [vy, vm] = supCalView[key];
  const sel = supTargetsFilter[key];
  const today = tehranTodayJalali();
  const len = azkiJalaliMonthLength(vy, vm);
  const offset = azkiWeekdayIndex(vy, vm, 1);
  const yMin = Math.min(today[0] - 4, vy), yMax = Math.max(today[0] + 1, vy);
  let yearOpts = '';
  for (let y = yMin; y <= yMax; y++) yearOpts += `<option value="${y}"${y === vy ? ' selected' : ''}>${faDigits(y)}</option>`;
  const monthOpts = JALALI_MONTHS_FA.map((n, i) => `<option value="${i + 1}"${i + 1 === vm ? ' selected' : ''}>${n}</option>`).join('');
  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<span></span>';
  for (let d = 1; d <= len; d++) {
    const isSel = sel && sel[0] === vy && sel[1] === vm && sel[2] === d;
    const isToday = today[0] === vy && today[1] === vm && today[2] === d;
    cells += `<button type="button" class="azki-cal-day${isSel ? ' sel' : ''}${isToday ? ' today' : ''}" data-day="${d}">${faDigits(d)}</button>`;
  }
  const chev = pts => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="${pts}"/></svg>`;
  pop.innerHTML = `
    <div class="azki-cal-head">
      <button type="button" class="azki-cal-nav" data-nav="-1" aria-label="ماه قبل">${chev('9 6 15 12 9 18')}</button>
      <select data-role="m" aria-label="ماه">${monthOpts}</select>
      <select data-role="y" aria-label="سال">${yearOpts}</select>
      <button type="button" class="azki-cal-nav" data-nav="1" aria-label="ماه بعد">${chev('15 6 9 12 15 18')}</button>
    </div>
    <div class="azki-cal-grid">
      ${AZKI_WEEKDAYS.map(w => `<span class="azki-cal-wd">${w}</span>`).join('')}
      ${cells}
    </div>
    <div class="azki-pop-foot">
      <button type="button" class="sm-btn" data-today="1">امروز</button>
      <button type="button" class="sm-btn" data-close="1">بستن</button>
    </div>`;
}

function supOpenCal(key) {
  const pop = document.getElementById(`sup-${key}-cal`);
  const willOpen = pop.hidden;
  azkiClosePops(pop.id);
  if (!willOpen) { pop.hidden = true; return; }
  const cur = supTargetsFilter[key] || tehranTodayJalali();
  supCalView[key] = [cur[0], cur[1]];
  supCalRender(key);
  pop.hidden = false;
  azkiPlacePop(pop);
}

function supBindCal(key) {
  const pop = document.getElementById(`sup-${key}-cal`);
  document.getElementById(`sup-${key}-btn`).addEventListener('click', () => supOpenCal(key));
  pop.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    const day = e.target.closest('[data-day]');
    if (nav) {
      let [vy, vm] = supCalView[key];
      vm += parseInt(nav.dataset.nav, 10);
      if (vm < 1) { vm = 12; vy--; } else if (vm > 12) { vm = 1; vy++; }
      supCalView[key] = [vy, vm];
      supCalRender(key);
    } else if (day) {
      const [vy, vm] = supCalView[key];
      supSetDate(key, [vy, vm, parseInt(day.dataset.day, 10)]);
      pop.hidden = true;
      supApplyRange();
    } else if (e.target.closest('[data-today]')) {
      supSetDate(key, tehranTodayJalali());
      pop.hidden = true;
      supApplyRange();
    } else if (e.target.closest('[data-close]')) {
      pop.hidden = true;
    }
  });
  pop.addEventListener('change', e => {
    const role = e.target.dataset.role;
    if (!role) return;
    const v = parseInt(e.target.value, 10);
    if (role === 'm') supCalView[key][1] = v; else supCalView[key][0] = v;
    supCalRender(key);
  });
}

function supApplyRange() {
  const errEl = document.getElementById('sup-filter-error');
  const f = supTargetsFilter.from, t = supTargetsFilter.to;
  if (!f || !t) return;
  if (supSortKey(f) > supSortKey(t)) { errEl.textContent = 'تاریخ شروع نباید بعد از تاریخ پایان باشد.'; return; }
  const days = (Date.parse(jalaliToGregorian(t[0], t[1], t[2])) - Date.parse(jalaliToGregorian(f[0], f[1], f[2]))) / 86400000 + 1;
  if (days > 366) { errEl.textContent = 'حداکثر بازه‌ی قابل نمایش یک سال است.'; return; }
  errEl.textContent = '';
  supTargetsFilter.custom = true;
  document.getElementById('supervisor-list').innerHTML = '<div class="loading-state">در حال بارگذاری...</div>';
  const spl = document.getElementById('sup-perf-list'); if (spl) spl.innerHTML = '<div class="loading-state">در حال بارگذاری...</div>';
  loadSupervisorView();
}

function initSupTargetsFilter() {
  supSetDefaultRange();
  supBindCal('from');
  supBindCal('to');
  document.getElementById('sup-export-btn').addEventListener('click', exportSupTargetsExcel);
}
initSupTargetsFilter();

function exportSupTargetsExcel() { return exportTargetsExcelFrom(window.supTargetsData, 'sup-export-btn'); }
function exportTeamTargetsExcel() { return exportTargetsExcelFrom(window.teamTargetsData, 'team-export-btn'); }

async function exportTargetsExcelFrom(d, btnId) {
  if (!d || !d.items || !d.items.length) { alert('داده‌ای برای خروجی گرفتن وجود نداره؛ صبر کنید تا بارگذاری تموم بشه.'); return; }
  const btn = document.getElementById(btnId);
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'در حال آماده‌سازی...';
  try {
    await ensureXlsxLib();
    const bounds = { startLabel: d.period.startLabel, endLabel: d.period.endLabel };
    const meta2 = 'تعداد صدور روزانه کارشناس‌ها به تفکیک سنتر';
    const hasSla = !!d.slaMap;

    const byCenter = new Map();
    d.items.forEach(it => {
      const c = fmtCenterName(it.m.centerName || 'بدون سنتر') + (it.m.centerDisabled ? ' (غیرفعال)' : '');
      if (!byCenter.has(c)) byCenter.set(c, []);
      byCenter.get(c).push(it);
    });
    const centers = [...byCenter.entries()].map(([name, items]) => ({
      name, items: items.slice().sort((a, b) => b.myTotal - a.myTotal),
      total: items.reduce((s0, it) => s0 + it.myTotal, 0),
      withTarget: items.filter(it => it.myRows.length > 0).length,
    })).sort((a, b) => b.total - a.total);

    const grandTotal = centers.reduce((s0, c) => s0 + c.total, 0);
    const grandAgents = d.items.length;
    const grandWith = centers.reduce((s0, c) => s0 + c.withTarget, 0);

    const summary = azkiXlsxSheet({
      title: 'صدور — خلاصه به تفکیک سنتر', bounds, metaLine2: meta2,
      headers: ['نام سنتر', 'تعداد کارشناس', 'کارشناس‌های دارای صدور', 'جمع صدور', 'میانگین صدور هر کارشناس'],
      rows: centers.map(c => [c.name, c.items.length, c.withTarget, c.total, c.items.length ? round2(c.total / c.items.length) : 0]),
      total: ['جمع کل', grandAgents, grandWith, grandTotal, grandAgents ? round2(grandTotal / grandAgents) : 0],
      widths: [36, 16, 24, 16, 24], fmts: ['text', 'int', 'int', 'int', 'pct'],
    });

    const agentHeads = ['نام سنتر', 'نام کارشناس', 'یوزر بک‌آفیس', 'تعداد روز ثبت‌شده', 'جمع صدور'];
    if (hasSla) agentHeads.push('میانگین زمان صدور (دقیقه)');
    const agentRows = [];
    centers.forEach(c => c.items.forEach(it => {
      const row = [c.name, (it.m.full_name || '—') + (it.m.status === 'disabled' ? ' (غیرفعال)' : ''), it.m.backoffice_id || '', it.myRows.length, it.myTotal];
      if (hasSla) { const v = d.slaMap[it.m.id]; row.push(v != null ? round2(Number(v)) : ''); }
      agentRows.push(row);
    }));
    const agentTotal = ['جمع کل', '', '', '', grandTotal];
    if (hasSla) agentTotal.push('');
    const agents = azkiXlsxSheet({
      title: 'صدور — به تفکیک کارشناس', bounds, metaLine2: meta2,
      headers: agentHeads, rows: agentRows, total: agentTotal,
      widths: [34, 28, 20, 18, 14, ...(hasSla ? [24] : [])],
      fmts: ['text', 'text', 'text', 'int', 'int', ...(hasSla ? ['pct'] : [])],
    });

    const dayRows = [];
    centers.forEach(c => c.items.forEach(it => sortRowsByDateAsc(it.myRows).forEach(r => {
      dayRows.push([c.name, it.m.full_name || '—', toJalaliDisplay(r.report_date_jalali), r.target_count != null ? Number(r.target_count) : '']);
    })));
    const daily = azkiXlsxSheet({
      title: 'صدور — جزئیات روزانه', bounds, metaLine2: meta2,
      headers: ['نام سنتر', 'نام کارشناس', 'تاریخ', 'تعداد صدور'],
      rows: dayRows, total: ['جمع کل', '', '', grandTotal],
      widths: [34, 28, 18, 14], fmts: ['text', 'text', 'text', 'int'],
    });

    azkiXlsxSave([['خلاصه سنترها', summary], ['کارشناس‌ها', agents], ['جزئیات روزانه', daily]], 'گزارش-صدور', bounds);
  } catch (e) {
    alert('خروجی اکسل با خطا مواجه شد: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

async function loadSupervisorView() {
  const container = document.getElementById('supervisor-list');
  const token = ++supLoadToken;
  const period = supTargetsPeriod();
  document.getElementById('supervisor-period-label').textContent = faDigits(`${supTargetsFilter.custom ? 'بازه‌ی نمایش' : 'بازه‌ی جاری'}: ${period.startLabel} تا ${period.endLabel}`);

  const setTotals = (totalText, countText, withTargetText) => {
    document.getElementById('supervisor-total').textContent = totalText;
    document.getElementById('supervisor-agent-count').textContent = countText;
    document.getElementById('supervisor-agent-with-target-count').textContent = withTargetText;
  };

  // دو درخواست مستقل هم‌زمان (قبلاً پشت‌سرهم بودند)
  const [centersRes, linksRes] = await Promise.all([
    fetchAllRows((from, to) =>
      supabaseClient
        .from(TABLE_PROFILES)
        .select('id, full_name, status')
        .eq('role', 'center')
        .order('full_name', { ascending: true })
        .range(from, to)
    ),
    fetchAllRows((from, to) =>
      supabaseClient
        .from(TABLE_CENTER_AGENTS)
        .select('center_id, agent_id')
        .range(from, to)
    ),
  ]);
  const { data: centers, error: centersError } = centersRes;
  const { data: centerAgentLinks, error: centerAgentLinksError } = linksRes;

  if (centersError) {
    container.innerHTML = `<div class="empty-state">خطا در دریافت سنترها: ${escHtml(centersError.message)}</div>`;
    setTotals('—', '—', '—');
    return;
  }

  const centerNameById = {};
  const centerDisabledById = {};
  (centers || []).forEach(c => { centerNameById[c.id] = c.full_name || 'بدون سنتر'; if (c.status === 'disabled') centerDisabledById[c.id] = true; });

  if (centerAgentLinksError) {
    container.innerHTML = `<div class="empty-state">خطا در دریافت اساین نیروها: ${escHtml(centerAgentLinksError.message)}</div>`;
    setTotals('—', '—', '—');
    return;
  }

  const centerNameByAgentId = {};
  const centerOffByAgentId = {};
  (centerAgentLinks || []).forEach(l => {
    centerNameByAgentId[l.agent_id] = centerNameById[l.center_id] || 'بدون سنتر';
    if (centerDisabledById[l.center_id]) centerOffByAgentId[l.agent_id] = true;
  });

  const allAgentIds = [...new Set((centerAgentLinks || []).map(l => l.agent_id).filter(Boolean))];

  if (allAgentIds.length === 0) {
    container.innerHTML = '<div class="empty-state">هنوز نیرویی به هیچ سنتری اساین نشده است</div>';
    setTotals('۰', '۰', '۰');
    publishSupTargetCenters([]);
    return;
  }

  // پروفایل‌ها، تارگت‌ها و خطاها فقط به allAgentIds نیاز دارند؛ هم‌زمان شروع می‌شوند (قبلاً سه مرحله‌ی پشت‌سرهم بود)
  const agentProfilesP = fetchAllRows((from, to) =>
    supabaseClient
      .from(TABLE_PROFILES)
      .select('id, backoffice_id, full_name, role, status')
      .in('id', allAgentIds)
      .eq('role', 'agent')
      .range(from, to)
  );
  const rowsP = fetchAllRows((from, to) =>
    supabaseClient
      .from(TABLE_TARGETS)
      .select('agent_id,report_date,report_date_jalali,report_date_sort,target_count,avg_issuance_minutes,discount_transfer_count')
      .in('agent_id', allAgentIds)
      .gte('report_date_sort', period.startSort)
      .lte('report_date_sort', period.endSort)
      .order('report_date_sort', { ascending: true })
      .order('agent_id', { ascending: true })
      .range(from, to)
  );
  const bugRowsP = fetchBugRowsSafe((from, to) =>
    supabaseClient
      .from(TABLE_BUGS)
      .select('user_id, check_date_sort')
      .in('user_id', allAgentIds)
      .range(from, to)
  );
  [agentProfilesP, rowsP, bugRowsP].forEach(p => p.catch(() => {}));

  const { data: agentProfiles, error: agentProfilesError } = await agentProfilesP;

  if (agentProfilesError) {
    container.innerHTML = `<div class="empty-state">خطا در دریافت پروفایل کارشناس‌ها: ${escHtml(agentProfilesError.message)}</div>`;
    setTotals('—', '—', '—');
    return;
  }

  const agentProfileById = {};
  (agentProfiles || []).forEach(a => { agentProfileById[a.id] = a; });

  const { data: rows, error: rowsError } = await rowsP;

  if (token !== supLoadToken) return;
  if (rowsError) {
    container.innerHTML = `<div class="empty-state">خطا در دریافت تارگت‌ها: ${escHtml(rowsError.message)}</div>`;
    setTotals('—', '—', '—');
    return;
  }

  const rowsByAgent = {};
  (rows || []).forEach(r => {
    if (!rowsByAgent[r.agent_id]) rowsByAgent[r.agent_id] = [];
    rowsByAgent[r.agent_id].push(r);
  });

  const { data: bugRows, error: bugRowsError } = await bugRowsP;

  if (token !== supLoadToken) return;
  if (bugRowsError) console.error('خطا در دریافت خطاهای نیروها:', bugRowsError.message);

  const bugsByAgent = {};
  (bugRows || []).forEach(b => {
    if (!bugsByAgent[b.user_id]) bugsByAgent[b.user_id] = [];
    bugsByAgent[b.user_id].push(b);
  });

  let items = allAgentIds.map(agentId => {
    const m = agentProfileById[agentId];
    if (!m) return null;
    const myRows = rowsByAgent[agentId] || [];
    const myBugs = bugsByAgent[agentId] || [];
    const myTotal = myRows.reduce((sum, r) => sum + (Number(r.target_count) || 0), 0);
    return { m: { ...m, centerName: centerNameByAgentId[agentId] || 'بدون سنتر', centerDisabled: !!centerOffByAgentId[agentId] }, myRows, myBugs, myTotal };
  }).filter(it => it && (it.m.status !== 'disabled' || it.myRows.length > 0)
                     && (!it.m.centerDisabled || it.myRows.length > 0));   // غیرفعال فقط اگه تو بازه صدور داشته باشه

  // سنتر غیرفعال: تو تب صدور نمایش داده نمی‌شه تا فعال بشه؛ ولی (اگه تو بازه صدور داشته) تو خروجی اکسل/حقوق می‌آید
  const allItems = items;
  items = allItems.filter(it => !it.m.centerDisabled);

  const shownAgentIds = new Set(items.map(it => it.m.id));
  const targetCenterIds = new Set((centerAgentLinks || [])
    .filter(l => shownAgentIds.has(l.agent_id) && centerNameById[l.center_id])
    .map(l => l.center_id));
  publishSupTargetCenters([...targetCenterIds].map(id => ({ id, name: centerNameById[id] })));

  const grandTotal = items.reduce((sum, it) => sum + it.myTotal, 0);
  const grandAgentCount = items.filter(it => it.m.status !== 'disabled' && !isTrainingPanel(it.m)).length;
  const grandAgentWithTargetCount = items.filter(it => it.myRows.length > 0).length;

  agentSlaMap = buildSlaMapFromRows(rows, period.startSort);
  if (agentSlaMap && supTargetsFilter.custom) agentSlaPeriodLabel = faDigits(`${period.startLabel} تا ${period.endLabel}`);
  window.supTargetsData = { items: allItems, period, slaMap: agentSlaMap };
  container.innerHTML = items.length
    ? buildGroupedMemberItemsHtml(items)
    : '<div class="empty-state">هنوز نیرویی به هیچ سنتری اساین نشده است</div>';
  setTotals(formatNumber(grandTotal), formatNumber(grandAgentCount), formatNumber(grandAgentWithTargetCount));

  bindExpandableToggles(container);
  renderSupPerf();
}

function renderTeamPerformance(membersWithTotals, allTeamRows) {
  const listEl = document.getElementById('team-performance-list');
  const avgEl = document.getElementById('team-performance-average');

  if (!membersWithTotals || membersWithTotals.length === 0) {
    avgEl.textContent = '—';
    listEl.innerHTML = '<div class="empty-state">نیرویی برای بررسی وجود ندارد</div>';
    return;
  }

  const teamTotal = membersWithTotals.reduce((sum, x) => sum + x.myTotal, 0);
  const teamAvg = teamTotal / membersWithTotals.length;
  avgEl.textContent = formatNumber(teamAvg);

  const allTeamDatesMap = new Map();
  for (const r of allTeamRows) {
    if (r.report_date_jalali && !allTeamDatesMap.has(r.report_date_jalali)) {
      allTeamDatesMap.set(r.report_date_jalali, Number(r.report_date_sort) || 0);
    }
  }
  const allTeamDatesSorted = [...allTeamDatesMap.entries()].sort((a, b) => a[1] - b[1]);

  const belowAvgMembers = membersWithTotals
    .filter(x => x.myTotal < teamAvg)
    .sort((a, b) => a.myTotal - b.myTotal);
  const aboveAvgMembers = membersWithTotals
    .filter(x => x.myTotal >= teamAvg)
    .sort((a, b) => b.myTotal - a.myTotal);

  function buildPerfItem({ m, myRows, myTotal }, isBelow) {
    const displayName = m.full_name || m.backoffice_id || '—';
    const ownAvg = myRows.length ? myTotal / myRows.length : 0;
    const sharePercent = teamTotal > 0 ? (myTotal / teamTotal) * 100 : 0;

    const goodDays = myRows
      .filter(r => (Number(r.target_count) || 0) > ownAvg)
      .sort((a, b) => (Number(b.target_count) || 0) - (Number(a.target_count) || 0));

    const myDatesSet = new Set(myRows.map(r => r.report_date_jalali));
    const missingDays = allTeamDatesSorted.filter(([date]) => !myDatesSet.has(date));

    const goodDaysHtml = goodDays.length
      ? goodDays.map(r => `
          <div class="team-day-row">
            <span class="team-day-date">${toJalaliDisplay(r.report_date_jalali)}</span>
            <span class="perf-day-badge-good">${formatNumber(r.target_count)}</span>
          </div>
        `).join('')
      : '<div class="team-empty-days">روز پرکاری (بالاتر از میانگین خودش) ثبت نشده</div>';

    const missingDaysHtml = missingDays.length
      ? missingDays.map(([date]) => `
          <div class="team-day-row">
            <span class="team-day-date">${toJalaliDisplay(date)}</span>
            <span class="perf-day-badge-missing">بدون صدور</span>
          </div>
        `).join('')
      : '<div class="team-empty-days">روز بدون صدوری ثبت نشده</div>';

    return `
      <div class="team-item${m.status === 'disabled' ? ' is-disabled' : ''}" data-member="${m.id}">
        <button class="team-header" type="button">
          <div class="team-name-wrap">
            <svg class="team-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            <span class="team-name">${escHtml(displayName)}</span>${isTrainingPanel(m) ? '<span class="team-edu-badge" title="پنل آموزش این سنتر">پنل آموزش</span>' : ''}${m.status === 'disabled' ? '<span class="team-disabled-badge" title="دیگر با ما همکاری ندارد؛ فقط آمار صدورش در این بازه حفظ شده">غیرفعال</span>' : ''}
          </div>
          <div class="team-right">
            <span class="${isBelow ? 'perf-below-badge' : 'perf-above-badge'}">${isBelow ? 'زیر' : 'بالای'} میانگین</span>
            <span class="perf-share-badge">${formatNumber(sharePercent)}٪ از تیم</span>
            <span class="team-total">${formatNumber(myTotal)}</span>
          </div>
        </button>
        <div class="team-details">
          <div class="team-details-inner">
            <div class="team-section-title">روزهای پرکار (بالاتر از میانگین خودش)</div>
            ${goodDaysHtml}
            <div class="team-section-title">روزهای بدون صدور</div>
            ${missingDaysHtml}
          </div>
        </div>
      </div>
    `;
  }

  const belowHtml = belowAvgMembers.length
    ? belowAvgMembers.map(x => buildPerfItem(x, true)).join('')
    : '<div class="perf-group-empty">هیچ نیرویی زیر میانگین تیم نیست 🎉</div>';

  const aboveHtml = aboveAvgMembers.length
    ? aboveAvgMembers.map(x => buildPerfItem(x, false)).join('')
    : '<div class="perf-group-empty">هیچ نیرویی بالای میانگین تیم نیست</div>';

  listEl.innerHTML = `
    <div class="perf-group-header is-below">
      زیر میانگین تیم
      <span class="perf-group-count">${belowAvgMembers.length} نفر</span>
    </div>
    ${belowHtml}
    <div class="perf-group-divider"></div>
    <div class="perf-group-header is-above">
      بالای میانگین تیم
      <span class="perf-group-count">${aboveAvgMembers.length} نفر</span>
    </div>
    ${aboveHtml}
  `;

  bindExpandableToggles(listEl);
}

let centerMyFields = [];

let centerNormalAgentsAll = [];
let centerTargetRowsAll = [];
let centerBugRowsAll = [];
let centerBugsFlat = [];
let centerViewName = '';
let centerViewId = null;
let centerLoadSeq = 0;
const centerFilterState = { from: null, to: null };   // [jy, jm, jd]
const centerCalView = { from: [0, 0], to: [0, 0] };

function centerFmtDate(t) { return `${t[0]}/${pad2(t[1])}/${pad2(t[2])}`; }
function centerSortKey(t) { return t[0] * 10000 + t[1] * 100 + t[2]; }

function centerSetDate(key, t) {
  centerFilterState[key] = t;
  document.getElementById(`center-${key}-text`).textContent = faDigits(centerFmtDate(t));
}

function centerCalRender(key) {
  const pop = document.getElementById(`center-${key}-cal`);
  let [vy, vm] = centerCalView[key];
  const sel = centerFilterState[key];
  const today = tehranTodayJalali();
  const len = azkiJalaliMonthLength(vy, vm);
  const offset = azkiWeekdayIndex(vy, vm, 1);

  const yMin = Math.min(today[0] - 4, vy), yMax = Math.max(today[0] + 1, vy);
  let yearOpts = '';
  for (let y = yMin; y <= yMax; y++) yearOpts += `<option value="${y}"${y === vy ? ' selected' : ''}>${faDigits(y)}</option>`;
  const monthOpts = JALALI_MONTHS_FA.map((n, i) => `<option value="${i + 1}"${i + 1 === vm ? ' selected' : ''}>${n}</option>`).join('');

  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<span></span>';
  for (let d = 1; d <= len; d++) {
    const isSel = sel && sel[0] === vy && sel[1] === vm && sel[2] === d;
    const isToday = today[0] === vy && today[1] === vm && today[2] === d;
    cells += `<button type="button" class="azki-cal-day${isSel ? ' sel' : ''}${isToday ? ' today' : ''}" data-day="${d}">${faDigits(d)}</button>`;
  }

  pop.innerHTML = `
    <div class="azki-cal-head">
      <button type="button" class="azki-cal-nav" data-nav="-1" aria-label="ماه قبل"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg></button>
      <select data-role="m" aria-label="ماه">${monthOpts}</select>
      <select data-role="y" aria-label="سال">${yearOpts}</select>
      <button type="button" class="azki-cal-nav" data-nav="1" aria-label="ماه بعد"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 6 9 12 15 18"/></svg></button>
    </div>
    <div class="azki-cal-grid">
      ${AZKI_WEEKDAYS.map(w => `<span class="azki-cal-wd">${w}</span>`).join('')}
      ${cells}
    </div>
    <div class="azki-pop-foot">
      <button type="button" class="sm-btn" data-today="1">امروز</button>
      <button type="button" class="sm-btn" data-close="1">بستن</button>
    </div>`;
}

function centerOpenCal(key) {
  const pop = document.getElementById(`center-${key}-cal`);
  const willOpen = pop.hidden;
  azkiClosePops(pop.id);
  if (!willOpen) { pop.hidden = true; return; }
  const cur = centerFilterState[key] || tehranTodayJalali();
  centerCalView[key] = [cur[0], cur[1]];
  centerCalRender(key);
  pop.hidden = false;
  azkiPlacePop(pop);
}

function centerBindCal(key) {
  const pop = document.getElementById(`center-${key}-cal`);
  document.getElementById(`center-${key}-btn`).addEventListener('click', () => centerOpenCal(key));

  pop.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    const day = e.target.closest('[data-day]');
    if (nav) {
      let [vy, vm] = centerCalView[key];
      vm += parseInt(nav.dataset.nav, 10);
      if (vm < 1) { vm = 12; vy--; } else if (vm > 12) { vm = 1; vy++; }
      centerCalView[key] = [vy, vm];
      centerCalRender(key);
    } else if (day) {
      const [vy, vm] = centerCalView[key];
      centerSetDate(key, [vy, vm, parseInt(day.dataset.day, 10)]);
      pop.hidden = true;
      centerApplyRange();
    } else if (e.target.closest('[data-today]')) {
      centerSetDate(key, tehranTodayJalali());
      pop.hidden = true;
      centerApplyRange();
    } else if (e.target.closest('[data-close]')) {
      pop.hidden = true;
    }
  });
  pop.addEventListener('change', e => {
    const role = e.target.dataset.role;
    if (!role) return;
    const v = parseInt(e.target.value, 10);
    if (role === 'm') centerCalView[key][1] = v; else centerCalView[key][0] = v;
    centerCalRender(key);
  });
}

function centerApplyRange() {
  const errEl = document.getElementById('center-filter-error');
  const f = centerFilterState.from, to = centerFilterState.to;
  if (!f || !to) return;
  if (centerSortKey(f) > centerSortKey(to)) {
    errEl.textContent = 'تاریخ شروع نباید بعد از تاریخ پایان باشد.';
    return;
  }
  const days = (Date.parse(jalaliToGregorian(to[0], to[1], to[2])) - Date.parse(jalaliToGregorian(f[0], f[1], f[2]))) / 86400000 + 1;
  if (days > 366) {
    errEl.textContent = 'حداکثر بازه‌ی قابل نمایش یک سال است.';
    return;
  }
  errEl.textContent = '';
  if (centerViewId) loadCenterData();
  // تب محاسبه حقوق هم از همین بازه استفاده می‌کنه
  centerPayrollState.loaded = false;
  if (centerViewId && document.getElementById('panel-center-payroll').classList.contains('active')) loadCenterPayroll();
  centerPerfState.loaded = false;
  if (centerViewId && document.getElementById('panel-center-perf').classList.contains('active')) loadCenterPerf();
}

function initCenterFilter() {
  const def = currentPeriodBounds();
  const st = parseJalaliParts(def.startLabel), en = parseJalaliParts(def.endLabel);
  centerSetDate('from', [st.jy, st.jm, st.jd]);
  centerSetDate('to', [en.jy, en.jm, en.jd]);
  centerBindCal('from');
  centerBindCal('to');
}

initCenterFilter();

function centerAgentDisplayName(m) { return m.full_name || m.backoffice_id || '—'; }

function renderCenterTargets() {
  const listEl = document.getElementById('center-list');
  if (!listEl) return;
  renderCenterPerfSplit();
  const rowsByUser = {};
  centerTargetRowsAll.forEach(r => { (rowsByUser[r.agent_id] = rowsByUser[r.agent_id] || []).push(r); });

  // کارشناس غیرفعال فقط وقتی نمایش داده می‌شه که تو بازه‌ی انتخابی صدور داشته باشه
  const agents = centerNormalAgentsAll.filter(m => m.status !== 'disabled' || (rowsByUser[m.id] || []).length > 0);

  if (!agents.length) {
    listEl.innerHTML = '<div class="empty-state">هنوز نیرویی به شما اساین نشده است</div>';
    document.getElementById('center-period-total').textContent = '۰';
    document.getElementById('center-agent-count').textContent = '۰';
    return;
  }
  const bugsByUser = {};
  centerBugRowsAll.forEach(b => { (bugsByUser[b.user_id] = bugsByUser[b.user_id] || []).push(b); });

  let total = 0;
  const items = agents.map(m => {
    const myRows = sortRowsByDateAsc(rowsByUser[m.id] || []);
    const myBugs = bugsByUser[m.id] || [];
    const myTotal = myRows.reduce((sum, r) => sum + (Number(r.target_count) || 0), 0);
    total += myTotal;
    return { m, myRows, myBugs, myTotal };
  });
  items.sort((a, b) => b.myTotal - a.myTotal || centerAgentDisplayName(a.m).localeCompare(centerAgentDisplayName(b.m), 'fa'));

  document.getElementById('center-period-total').textContent = formatNumber(total);
  document.getElementById('center-agent-count').textContent = formatNumber(agents.filter(m => m.status !== 'disabled' && !isTrainingPanel(m)).length);

  listEl.innerHTML = items.length
    ? buildMemberItemsHtml(items)
    : '<div class="empty-state">کارشناسی با این مشخصات پیدا نشد</div>';
  bindExpandableToggles(listEl);
}

function renderCenterBugs() {
  const listEl = document.getElementById('center-bugs-list');
  if (!listEl) return;
  const byId = {};
  centerNormalAgentsAll.forEach(m => { byId[m.id] = m; });

  centerBugsFlat = centerBugRowsAll.map(b => {
    const m = byId[b.user_id];
    return { ...b, _memberName: m ? centerAgentDisplayName(m) : '—', _memberUser: m ? (m.backoffice_id || '') : '' };
  });
  centerBugsFlat.sort((a, b) => (Number(b.check_date_sort) || 0) - (Number(a.check_date_sort) || 0));

  renderTeamBugsList(centerBugsFlat, 'center-bugs-list');
}

async function loadCenterData() {
  const seq = ++centerLoadSeq;
  const listEl = document.getElementById('center-list');
  const bugsListEl = document.getElementById('center-bugs-list');
  const f = centerFilterState.from, to = centerFilterState.to;
  if (!f || !to) return;
  const startSort = centerSortKey(f), endSort = centerSortKey(to);

  const label = `${centerViewName ? `سنتر: ${centerViewName} — ` : ''}بازه‌ی انتخابی: ${faDigits(centerFmtDate(f))} تا ${faDigits(centerFmtDate(to))}`;
  document.getElementById('center-period-label').textContent = label;
  document.getElementById('center-bugs-period-label').textContent = label;

  const spansPeriods = periodStartSortOfJalali(f[0], f[1], f[2]) !== periodStartSortOfJalali(to[0], to[1], to[2]);
  document.getElementById('center-period-label').textContent = label + (spansPeriods ? ' — میانگین زمان صدور فقط برای بازه‌ای داخل یک دوره‌ی ۲۱ تا ۲۰ نمایش داده می‌شود' : '');

  const agentIds = centerNormalAgentsAll.map(a => a.id);
  if (agentIds.length === 0) {
    centerTargetRowsAll = [];
    centerBugRowsAll = [];
    renderCenterTargets();
    renderCenterBugs();
    return;
  }

  const loading = '<div class="loading-state">در حال بارگذاری...</div>';
  listEl.innerHTML = loading;
  bugsListEl.innerHTML = loading;
  const splitEl = document.getElementById('center-perf-split');
  if (splitEl) splitEl.innerHTML = loading;

  const [targetsRes, bugsRes] = await Promise.all([
    fetchAllRows((from, toIdx) =>
      supabaseClient
        .from(TABLE_TARGETS)
        .select('agent_id,report_date,report_date_jalali,report_date_sort,target_count,avg_issuance_minutes,discount_transfer_count')
        .in('agent_id', agentIds)
        .gte('report_date_sort', startSort)
        .lte('report_date_sort', endSort)
        .order('report_date_sort', { ascending: true })
        .order('agent_id', { ascending: true })
        .range(from, toIdx)
    ),
    fetchBugRowsSafe((from, toIdx) =>
      supabaseClient
        .from(TABLE_BUGS)
        .select('*')
        .in('user_id', agentIds)
        .gte('check_date_sort', startSort)
        .lte('check_date_sort', endSort)
        .order('check_date_sort', { ascending: false })
        .order('user_id', { ascending: true })
        .range(from, toIdx)
    )
  ]);

  if (seq !== centerLoadSeq) return;

  const slaStart = periodStartSortOfJalali(f[0], f[1], f[2]);
  const slaSamePeriod = slaStart === periodStartSortOfJalali(to[0], to[1], to[2]);
  agentSlaMap = (!targetsRes.error && slaSamePeriod) ? buildSlaMapFromRows(targetsRes.data || [], slaStart) : null;
  loadCenterSla(slaStart, slaSamePeriod, seq);

  if (targetsRes.error) {
    listEl.innerHTML = `<div class="empty-state">خطا در دریافت تارگت‌ها: ${escHtml(targetsRes.error.message)}</div>`;
    document.getElementById('center-period-total').textContent = '—';
  } else {
    centerTargetRowsAll = targetsRes.data || [];
  }

  if (bugsRes.error) {
    bugsListEl.innerHTML = `<div class="empty-state">خطا در دریافت خطاها: ${escHtml(bugsRes.error.message)}</div>`;
    centerBugRowsAll = [];
  } else {
    centerBugRowsAll = bugsRes.data || [];
    renderCenterBugs();
  }

  if (!targetsRes.error) renderCenterTargets();
}

// میانگین زمان صدور کل سنتر برای دوره‌ی ۲۱ تا ۲۰ ای که فیلتر داخلشه.
// اول از center_sla_report (SLA مستقیم مرکز از گزارش SLA اپراتورها)، وگرنه میانگین SLA کارشناس‌های همین سنتر.
async function loadCenterSla(periodStartSort, samePeriod, seq) {
  const valEl = document.getElementById('center-sla-avg');
  const noteEl = document.getElementById('center-sla-note');
  if (!valEl) return;
  const show = (v, note) => {
    valEl.innerHTML = v != null ? `${formatNumber(v)}<span class="unit">دقیقه</span>` : '—';
    noteEl.textContent = note || '';
  };
  if (!samePeriod) { show(null, 'بازه باید داخل یک دوره‌ی ۲۱ تا ۲۰ باشد'); return; }
  valEl.textContent = '…';

  let value = null;
  const key = normCenterKey(centerViewName);
  if (key) {
    const { data, error } = await supabaseClient
      .from(TABLE_CENTER_SLA)
      .select('center_key, avg_issuance_minutes')
      .eq('period_start_sort', periodStartSort)
      .eq('center_key', key);
    if (seq !== centerLoadSeq) return;
    if (error) console.warn('خطا در دریافت SLA سنتر:', error.message);
    const row = (data || []).find(r => r.avg_issuance_minutes != null);
    if (row && isFinite(Number(row.avg_issuance_minutes))) value = round2(Number(row.avg_issuance_minutes));
  }
  if (value == null && agentSlaMap) {
    const vals = centerNormalAgentsAll.map(a => agentSlaMap[a.id]).filter(v => v != null && isFinite(v));
    if (vals.length) value = round2(vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  const pY = Math.floor(periodStartSort / 10000), pM = Math.floor(periodStartSort / 100) % 100;
  show(value, value != null ? `دوره‌ی ۲۱ ${JALALI_MONTHS_FA[pM - 1]} ${faDigits(pY)}` : 'هنوز SLA ثبت نشده');
}

async function loadCenterView(centerId) {
  if (centerViewId !== centerId) {
    // سنتر عوض شده → داده‌ی کش‌شده‌ی حقوق و عملکرد برای سنتر قبلی بود
    centerPayrollState.loaded = false;
    centerPerfState.loaded = false;
    centerOtherKeysCache.id = null;
  }
  centerViewId = centerId;
  const listEl = document.getElementById('center-list');
  const bugsListEl = document.getElementById('center-bugs-list');

  // نام سنتر و لیست نیروها مستقل‌اند؛ هم‌زمان گرفته می‌شوند
  const [profRes, linksRes] = await Promise.all([
    supabaseClient.from(TABLE_PROFILES).select('full_name').eq('id', centerId).single(),
    fetchAllRows((from, to) =>
      supabaseClient
        .from(TABLE_CENTER_AGENTS)
        .select('agent_id')
        .eq('center_id', centerId)
        .range(from, to)
    ),
  ]);
  const { data: myProfile } = profRes;
  centerViewName = myProfile ? (myProfile.full_name || '') : '';
  const { data: myAgentLinks, error: myAgentLinksError } = linksRes;

  const myAgentIds = (myAgentLinks || []).map(l => l.agent_id).filter(Boolean);

  if (myAgentLinksError || myAgentIds.length === 0) {
    const msg = '<div class="empty-state">هنوز نیرویی به شما اساین نشده است</div>';
    const label = centerViewName ? `سنتر: ${centerViewName}` : '';
    document.getElementById('center-period-label').textContent = label;
    document.getElementById('center-bugs-period-label').textContent = label;
    document.getElementById('center-period-total').textContent = '۰';
    document.getElementById('center-agent-count').textContent = '۰';
    listEl.innerHTML = msg;
    bugsListEl.innerHTML = msg;
    return;
  }

  const { data: allAssignedMembers, error: agentsError } = await fetchAllRows((from, to) =>
    supabaseClient
      .from(TABLE_PROFILES)
      .select('id, backoffice_id, full_name, role, status')
      .in('id', myAgentIds)
      .eq('role', 'agent')
      .range(from, to)
  );

  if (agentsError) {
    const msg = `<div class="empty-state">خطا در دریافت کارشناسان: ${escHtml(agentsError.message)}</div>`;
    listEl.innerHTML = msg;
    bugsListEl.innerHTML = msg;
    return;
  }

  centerNormalAgentsAll = (allAssignedMembers || []).filter(m => m.role === 'agent');
  loadCenterData();
}


// ============================================================
// تب «محاسبه حقوق» پنل سنتر — فقط داده‌ی خود همون سنتر
// منطق مثل محاسبه حقوق سرپرست/سرگروهه ولی ردیف‌ها با نام سنتر خودش فیلتر می‌شن و ریز کارشناس‌ها فقط
// کارشناس‌های اساین‌شده به همین سنتره. کارشناس حذف‌شده / پنل آموزش اسم و ریز روزانه ندارن و داخل ردیف
// «سایر» میان (جمع سنتر در گزارش مالی منهای جمع کارشناس‌های فعلی) تا جمع اکسل با جمع سنتر بخونه.
// ============================================================
const centerPayrollState = { loaded: false, seq: 0, bounds: null, name: '', center: null, agents: [], rest: null, days: [], error: null };

function centerPayrollBounds() {
  const f = centerFilterState.from, t = centerFilterState.to;
  if (!f || !t) return null;
  return {
    startDate: jalaliToGregorian(f[0], f[1], f[2]),
    endDate: jalaliToGregorian(t[0], t[1], t[2]),
    startLabel: centerFmtDate(f),
    endLabel: centerFmtDate(t),
  };
}

function renderCenterRateRows() {
  const el = document.getElementById('center-rate-rows');
  if (!el) return;
  el.innerHTML = AZKI_PAYROLL_RATE_TIERS.map(t => `
    <div class="azki-rate-row">
      <span class="azki-rate-range">صدور با میانگین زمانی از ${faDigits(t.min)} دقیقه تا حداکثر ${faDigits(t.max)} دقیقه</span>
      <span class="azki-rate-amount">${formatNumber(t.rate)} ریال</span>
    </div>`).join('');
}

// ردیف‌های گزارش مالی که مال همین سنترن. سه حالت تطبیق (روی کلید نرمال‌شده‌ی نام):
//  ۱) برابری کامل؛ ۲) کلید ردیف («رضوانی») به‌صورت کلمه‌ی کامل داخل نام پروفایل («مجید رضوانی») باشه؛
//  ۳) برعکس: نام پروفایل به‌صورت کلمه‌ی کامل داخل کلید ردیف باشه («رضوانی» داخل «رضوانی شعبه ۲»).
// اگه سنتر دیگه‌ای هم همین ردیف رو ادعا کنه (و برابر کامل نباشه) مبهمه و ردیف رد می‌شه تا داده‌ی سنتر دیگه‌ای قاطی نشه.
// نگاشت صریح «نام پروفایل سنتر» → «کلید ردیف در گزارش مالی». برای سنترهایی که نامشون تو گزارش مالی کوتاه‌شده
// و تطبیق خودکار مبهم می‌شه (مثلاً چند سنتر هم‌فامیل). با این نگاشت پنل سنتر دقیقاً همون ردیفی رو می‌خونه که پنل سرپرست می‌خونه.
const CENTER_REPORT_KEY_ALIASES = {
  'ثریا کیانی بیگدلی': 'کیانی',
};
function centerPayrollMatchRows(rawRows, ownName, otherKeys) {
  const own = normCenterKey(ownName);
  if (!own) return [];
  const aliasKey = CENTER_REPORT_KEY_ALIASES[own] ? normCenterKey(CENTER_REPORT_KEY_ALIASES[own]) : '';
  if (aliasKey) return rawRows.filter(r => normCenterKey(r.center_name) === aliasKey);
  const has = (hay, needle) => (' ' + hay + ' ').includes(' ' + needle + ' ');
  return rawRows.filter(r => {
    const k = normCenterKey(r.center_name);
    if (!k) return false;
    if (k === own) return true;
    if (otherKeys.some(o => o && o !== own && o === k)) return false;       // دقیقاً مال سنتر دیگه‌ایه
    if (has(own, k)) return !otherKeys.some(o => o && o !== own && has(o, k));
    if (has(k, own)) return !otherKeys.some(o => o && o !== own && has(k, o));
    return false;
  });
}

// نام سایر سنترها (فقط برای تشخیص ردیف مبهم). اگه دسترسی نبود لیست خالی برمی‌گرده و نادیده گرفته می‌شه.
const centerOtherKeysCache = { id: null, keys: [] };
async function centerGetOtherKeys() {
  if (centerOtherKeysCache.id === centerViewId && centerViewId) return centerOtherKeysCache.keys;
  const { data } = await fetchAllRows((from, to) => supabaseClient.from(TABLE_PROFILES).select('id, full_name').eq('role', 'center').range(from, to));
  const keys = (data || []).filter(c => c.id !== centerViewId).map(c => normCenterKey(c.full_name)).filter(Boolean);
  centerOtherKeysCache.id = centerViewId; centerOtherKeysCache.keys = keys;
  return keys;
}

// میانگین زمان صدور سنتر برای دوره‌ی ۲۱ تا ۲۰ که تاریخ شروع فیلتر داخلشه (همون منطق سرپرست):
// اول center_sla_report، وگرنه میانگین SLA کارشناس‌های همین سنتر
async function fetchCenterPayrollSla(bounds, keys, agentIds) {
  const s = parseJalaliParts(bounds.startLabel);
  const pStart = periodStartSortOfJalali(s.jy, s.jm, s.jd);
  const pY = Math.floor(pStart / 10000), pM = Math.floor(pStart / 100) % 100;
  const pEnd = pM < 12 ? pY * 10000 + (pM + 1) * 100 + 20 : (pY + 1) * 10000 + 100 + 20;

  const { data, error } = await supabaseClient
    .from(TABLE_CENTER_SLA)
    .select('center_key, center_name, avg_issuance_minutes')
    .eq('period_start_sort', pStart);
  if (error) console.warn('خطا در دریافت SLA سنتر:', error.message);
  const byKey = {};
  (data || []).forEach(r => {
    const k = normCenterKey(r.center_key || r.center_name);
    const v = Number(r.avg_issuance_minutes);
    if (k && r.avg_issuance_minutes != null && isFinite(v)) byKey[k] = round2(v);
  });
  for (const k of keys) { if (k && byKey[k] != null) return byKey[k]; }

  if (!agentIds.length) return null;
  const { data: tRows, error: tErr } = await fetchAllRows((from, to) =>
    supabaseClient.from(TABLE_TARGETS)
      .select('agent_id, report_date_sort, avg_issuance_minutes')
      .in('agent_id', agentIds)
      .gte('report_date_sort', pStart).lte('report_date_sort', pEnd)
      .order('report_date_sort', { ascending: true })
      .range(from, to));
  if (tErr) { console.warn('خطا در دریافت SLA کارشناس‌ها:', tErr.message); return null; }
  const m = buildSlaMapFromRows(tRows || [], pStart) || {};
  const vals = agentIds.map(id => m[id]).filter(v => v != null && isFinite(v));
  return vals.length ? round2(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
}

// وضعیت کارشناس برای نمایش: فعال / پنل آموزش / غیرفعال
function centerAgentStatus(p) {
  const disabled = !!p && p.status === 'disabled';
  const training = !!p && isTrainingPanel(p);
  return { disabled, training, label: disabled ? 'غیرفعال' : (training ? 'پنل آموزش' : 'فعال') };
}

async function loadCenterPayroll() {
  const seq = ++centerPayrollState.seq;
  const listEl = document.getElementById('center-payroll-list');
  const noteEl = document.getElementById('center-payroll-note');
  const bounds = centerPayrollBounds();
  renderCenterRateRows();
  if (!bounds || !centerViewId) { listEl.innerHTML = '<div class="loading-state">در حال بارگذاری...</div>'; return; }
  centerPayrollState.loaded = false;
  centerPayrollState.error = null;
  const ownName = centerViewName || '';
  document.getElementById('center-payroll-label').textContent =
    `${ownName ? `سنتر: ${ownName} — ` : ''}بازه‌ی انتخابی: ${faDigits(bounds.startLabel)} تا ${faDigits(bounds.endLabel)}`;
  noteEl.textContent = '';
  listEl.innerHTML = '<div class="loading-state">در حال بارگذاری...</div>';

  const fail = msg => { listEl.innerHTML = `<div class="empty-state">${msg}</div>`; ['total', 'avg', 'amount'].forEach(k => { document.getElementById('center-payroll-' + k).textContent = '—'; }); };

  try {
    // همه‌ی کارشناس‌های اساین‌شده به این سنتر (فعال، غیرفعال، پنل آموزش)
    const { data: links, error: lErr } = await fetchAllRows((from, to) =>
      supabaseClient.from(TABLE_CENTER_AGENTS).select('agent_id').eq('center_id', centerViewId).range(from, to));
    if (lErr) throw new Error(lErr.message);
    const ids = [...new Set((links || []).map(l => l.agent_id).filter(Boolean))];
    let agentProfiles = [];
    if (ids.length) {
      const { data: profs, error: pErr } = await fetchAllRows((from, to) =>
        supabaseClient.from(TABLE_PROFILES).select('id, full_name, backoffice_id, role, status').in('id', ids).eq('role', 'agent').range(from, to));
      if (pErr) throw new Error(pErr.message);
      agentProfiles = profs || [];
    }
    const agentIds = agentProfiles.map(a => a.id);
    const startSort = centerSortKey(centerFilterState.from), endSort = centerSortKey(centerFilterState.to);

    // گزارش مالی + نام سایر سنترها + ریز روزانه‌ی کارشناس‌ها (daily_targets) هم‌زمان
    const [breakdownRes, otherKeys, targetsRes] = await Promise.all([
      fetchAzkiBreakdownRows(['کل'], bounds),
      centerGetOtherKeys().catch(() => []),
      agentIds.length
        ? fetchAllRows((from, to) =>
            supabaseClient.from(TABLE_TARGETS).select('agent_id,report_date,report_date_jalali,report_date_sort,target_count,avg_issuance_minutes,discount_transfer_count')
              .in('agent_id', agentIds)
              .gte('report_date_sort', startSort).lte('report_date_sort', endSort)
              .order('report_date_sort', { ascending: true }).order('agent_id', { ascending: true })
              .range(from, to))
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (seq !== centerPayrollState.seq) return;
    if (breakdownRes.error) throw new Error('دریافت گزارش صدور: ' + breakdownRes.error.message);
    if (targetsRes.error) throw new Error('دریافت ریز صدور کارشناس‌ها: ' + targetsRes.error.message);
    const rows = targetsRes.data || [];

    // جمع صدور هر کارشناس
    const byAgent = {};
    const days = [];
    rows.forEach(r => {
      const a = byAgent[r.agent_id] || (byAgent[r.agent_id] = { count: 0, daysCount: 0, transfer: 0, unknown: 0 });
      const c = Number(r.target_count) || 0;
      const tr = payTransferOf(r);
      a.count += c; a.daysCount += 1;
      if (tr == null) a.unknown += c; else a.transfer += tr;
      days.push({ id: r.agent_id, date: toJalaliDisplay(r.report_date_jalali), sort: Number(r.report_date_sort) || 0, count: c, transfer: tr });
    });
    const sumAgents = Object.values(byAgent).reduce((s0, a) => s0 + a.count, 0);

    // تعداد صدور سنتر: از گزارش مالی؛ اگه ردیفی با نام سنتر نخورد از جمع کارشناس‌ها
    const matched = centerPayrollMatchRows(breakdownRes.data || [], ownName, otherKeys);
    // محاسبه دقیقاً مثل داشبورد سرپرست: همان SLA مراکز (fetchAzkiPayrollCenterSla) و همان computeAzkiPayrollCenterData
    // روی ردیف‌های گزارش مالی همین سنتر؛ جمع تعداد و مبلغ همه‌ی ردیف‌های متعلق به سنتر.
    let count, rate, sla = null, amount, fromReport = matched.length > 0;
    if (fromReport) {
      const slaRes = await fetchAzkiPayrollCenterSla(bounds).catch(() => ({ byCenterKey: {} }));
      if (seq !== centerPayrollState.seq) return;
      const centerData = computeAzkiPayrollCenterData(matched, slaRes.byCenterKey || {});
      count = centerData.reduce((s0, c) => s0 + c.count, 0);
      amount = centerData.reduce((s0, c) => s0 + c.amount, 0);
      rate = count ? Math.round(amount / count) : (centerData[0] ? centerData[0].rate : 0);
      const withSla = centerData.filter(c => c.hasSla && c.count > 0);
      const wSum = withSla.reduce((s0, c) => s0 + c.count, 0);
      sla = wSum ? round2(withSla.reduce((s0, c) => s0 + c.avgMin * c.count, 0) / wSum) : null;
    } else {
      // ردیفی با نام سنتر در گزارش مالی نیست: از جمع صدور کارشناس‌ها
      sla = await fetchCenterPayrollSla(bounds, [normCenterKey(ownName)], agentIds);
      if (seq !== centerPayrollState.seq) return;
      count = sumAgents;
      rate = azkiPayrollRateForAvgMinutes(sla);
      amount = rate * count;
    }
    const center = { count, amount, rate, avgMin: sla, hasSla: sla != null, fromReport };

    // ریز کارشناس‌ها: فعال‌ها و پنل آموزش همیشه (حتی با صدور صفر)، غیرفعال فقط اگه تو بازه صدور داشته باشه
    const agents = agentProfiles.map(p => {
      const st = centerAgentStatus(p);
      const a = byAgent[p.id] || { count: 0, daysCount: 0, transfer: 0, unknown: 0 };
      return { id: p.id, name: p.full_name || p.backoffice_id || '—', backoffice: p.backoffice_id || '',
        disabled: st.disabled, training: st.training, status: st.label, count: a.count, daysCount: a.daysCount,
        transfer: a.transfer, transferUnknown: a.unknown,
        rate, amount: rate * a.count };
    }).filter(a => !a.disabled || a.count > 0)
      .sort((x, y) => (x.disabled - y.disabled) || (x.training - y.training) || y.count - x.count || x.name.localeCompare(y.name, 'fa'));
    const byId = {}; agents.forEach(a => { byId[a.id] = a; });
    const dayRows = days.filter(d => byId[d.id]).map(d => ({ ...d, agent: byId[d.id] }))
      .sort((a, b) => a.agent.name.localeCompare(b.agent.name, 'fa') || a.sort - b.sort);

    // اختلاف جمع سنتر (گزارش مالی) با جمع کارشناس‌ها: کارشناس حذف‌شده از سیستم / ثبت‌نشده (فقط وقتی مثبته)
    const restCount = fromReport ? count - sumAgents : 0;
    const rest = restCount > 0 ? { count: restCount, rate, amount: rate * restCount } : null;
    // «انتقالی» خود سنتر = جمع انتقالیِ کارشناس‌هاش (فقط نمایشی). «سایر» (کارشناس حذف‌شده/ثبت‌نشده) ریز ندارد.
    const allAg = Object.values(byAgent);
    center.transfer = allAg.reduce((s0, a) => s0 + a.transfer, 0);
    center.transferUnknown = allAg.reduce((s0, a) => s0 + a.unknown, 0);
    center.transferPartial = !!rest || center.transferUnknown > 0;

    if (!fromReport && count === 0 && !agents.length) {
      Object.assign(centerPayrollState, { bounds, name: ownName, center: null, agents: [], rest: null, days: [], loaded: true });
      fail('برای این بازه گزارش صدوری برای سنتر شما ثبت نشده است.');
      return;
    }
    noteEl.textContent = '';

    Object.assign(centerPayrollState, { bounds, name: ownName, center, agents, rest, days: dayRows, loaded: true });
    renderCenterPayroll();
  } catch (e) {
    if (seq !== centerPayrollState.seq) return;
    centerPayrollState.error = e;
    fail('خطا در دریافت اطلاعات: ' + e.message);
  }
}

function renderCenterPayroll() {
  const st = centerPayrollState;
  const listEl = document.getElementById('center-payroll-list');
  const c = st.center;
  if (!c) return;
  document.getElementById('center-payroll-total').textContent = formatNumber(c.count);
  const trEl = document.getElementById('center-payroll-transfer');
  if (trEl) trEl.textContent = `از این تعداد انتقالی: ${formatNumber(c.transfer || 0)}`;
  document.getElementById('center-payroll-avg').innerHTML = c.hasSla ? `${formatNumber(c.avgMin)}<span class="unit">دقیقه</span>` : '—';
  document.getElementById('center-payroll-amount').innerHTML = `${formatNumber(c.amount)}<span class="unit">ریال</span>`;

  const head = `
    <div class="row-item azki-payroll-row">
      <div class="pay-name">${escHtml(st.name || 'سنتر شما')}</div>
      <div class="pay-metrics">
        <div class="pay-metric"><span class="k">تعداد صدور</span><span class="v">${formatNumber(c.count)}</span></div>
        <div class="pay-metric"${c.transferPartial ? ' title="جمع انتقالی کارشناس‌های ثبت‌شده؛ صدور «سایر» و روزهای ثبت‌نشده در آن نیست"' : ''}><span class="k">از این تعداد انتقالی</span><span class="v">${formatNumber(c.transfer || 0)}</span></div>
        <div class="pay-metric${c.hasSla ? '' : ' is-missing'}"><span class="k">میانگین زمان صدور (SLA)</span><span class="v">${c.hasSla ? `${formatNumber(c.avgMin)}<small>دقیقه</small>` : 'ثبت نشده'}</span></div>
        <div class="pay-metric"><span class="k">نرخ هر صدور</span><span class="v">${formatNumber(c.rate)}<small>ریال</small></span></div>
      </div>
      <div class="row-badge pay-amount">${formatNumber(c.amount)}<small>ریال</small></div>
    </div>`;

  const agentRow = a => `
    <div class="row-item azki-payroll-row">
      <div class="pay-name">
        <span>${escHtml(a.name)}</span>${a.training ? '<span class="team-edu-badge" title="پنل آموزش این سنتر">پنل آموزش</span>' : ''}${a.disabled ? '<span class="team-disabled-badge" title="دیگر با ما همکاری ندارد؛ فقط آمار صدورش در این بازه حفظ شده">غیرفعال</span>' : ''}
        ${a.backoffice ? `<div style="font-size:11px;font-weight:500;opacity:.7;margin-top:2px;">${escHtml(a.backoffice)}</div>` : ''}
      </div>
      <div class="pay-metrics">
        <div class="pay-metric"><span class="k">تعداد صدور</span><span class="v">${formatNumber(a.count)}</span></div>
        <div class="pay-metric"><span class="k">از این تعداد انتقالی</span><span class="v">${payTransferCell(a) === '—' ? '—' : formatNumber(a.transfer)}</span></div>
        <div class="pay-metric"><span class="k">تعداد روز</span><span class="v">${formatNumber(a.daysCount)}</span></div>
        <div class="pay-metric"><span class="k">نرخ هر صدور</span><span class="v">${formatNumber(a.rate)}<small>ریال</small></span></div>
      </div>
      <div class="row-badge pay-amount">${formatNumber(a.amount)}<small>ریال</small></div>
    </div>`;
  const restRow = r => `
    <div class="row-item azki-payroll-row">
      <div class="pay-name">سایر (کارشناس حذف‌شده / ثبت‌نشده)</div>
      <div class="pay-metrics"><div class="pay-metric"><span class="k">تعداد صدور</span><span class="v">${formatNumber(r.count)}</span></div></div>
      <div class="row-badge pay-amount">${formatNumber(r.amount)}<small>ریال</small></div>
    </div>`;

  const body = st.agents.map(agentRow).join('') + (st.rest ? restRow(st.rest) : '');
  listEl.innerHTML = head + body;
}

async function exportCenterPayrollExcel() {
  const st = centerPayrollState;
  const btn = document.getElementById('center-payroll-export');
  if (!st.loaded || !st.center) { alert('اطلاعاتی برای خروجی گرفتن وجود نداره.'); return; }
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'در حال آماده‌سازی...';
  try {
    await ensureXlsxLib();
    const { bounds, center: c, agents, rest, days } = st;
    const name = st.name || 'سنتر';
    const meta = `سنتر: ${name}`;
    const note = 'مبلغ هر کارشناس = تعداد صدور او × نرخ هر صدور سنتر (برآورد)   |   ستون «انتقالی» فقط نمایشی است و در مبلغ نقشی ندارد';

    const sheets = [];
    sheets.push(['محاسبه حقوق', azkiXlsxSheet({
      title: 'محاسبه حقوق', bounds, metaLine2: meta,
      headers: ['نام سنتر', 'تعداد صدور', 'از این تعداد انتقالی', 'میانگین زمان صدور (دقیقه)', 'نرخ هر صدور (ریال)', 'مبلغ قابل پرداخت (ریال)'],
      rows: [[name, c.count, c.transfer || 0, c.hasSla ? c.avgMin : '—', c.rate, c.amount]],
      total: ['جمع کل', c.count, c.transfer || 0, '', '', c.amount],
      widths: [32, 14, 20, 22, 18, 22], fmts: ['text', 'int', 'int', 'pct', 'int', 'int'],
    })]);

    const agentRows = agents.map(a => [name, a.name, a.backoffice, a.status, a.daysCount, a.count, payTransferCell(a), a.rate, a.amount]);
    if (rest) agentRows.push([name, 'سایر (کارشناس حذف‌شده / ثبت‌نشده)', '', 'باقی‌مانده نسبت به جمع سنتر', '', rest.count, '', rest.rate, rest.amount]);
    if (agentRows.length) {
      sheets.push(['ریز کارشناس‌ها', azkiXlsxSheet({
        title: 'محاسبه حقوق — ریز صدور کارشناس‌ها', bounds, metaLine2: `${meta}   |   ${note}`,
        headers: ['نام سنتر', 'نام کارشناس', 'یوزر بک‌آفیس', 'وضعیت', 'تعداد روز', 'تعداد صدور', 'از این تعداد انتقالی', 'نرخ هر صدور سنتر (ریال)', 'مبلغ برآوردی (ریال)'],
        rows: agentRows,
        total: ['جمع کل', '', '', '', '', agentRows.reduce((s0, r) => s0 + r[5], 0), agents.reduce((s0, a) => s0 + (a.transfer || 0), 0), '', agentRows.reduce((s0, r) => s0 + r[8], 0)],
        widths: [32, 28, 18, 24, 12, 14, 20, 22, 22], fmts: ['text', 'text', 'text', 'text', 'int', 'int', 'int', 'int', 'int'],
      })]);
    }
    if (days.length) {
      sheets.push(['جزئیات روزانه', azkiXlsxSheet({
        title: 'محاسبه حقوق — جزئیات روزانه کارشناس‌ها', bounds, metaLine2: meta,
        headers: ['نام سنتر', 'نام کارشناس', 'وضعیت', 'تاریخ', 'تعداد صدور', 'از این تعداد انتقالی'],
        rows: days.map(d => [name, d.agent.name, d.agent.status, d.date, d.count, d.transfer == null ? '—' : d.transfer]),
        total: ['جمع کل', '', '', '', days.reduce((s0, d) => s0 + d.count, 0), days.reduce((s0, d) => s0 + (d.transfer || 0), 0)],
        widths: [32, 28, 18, 16, 14, 20], fmts: ['text', 'text', 'text', 'text', 'int', 'int'],
      })]);
    }
    azkiXlsxSave(sheets, 'محاسبه-حقوق', bounds);
  } catch (e) {
    alert('خروجی اکسل با خطا مواجه شد: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}
document.getElementById('center-payroll-export').addEventListener('click', exportCenterPayrollExcel);

// ============================================================
// تب «بررسی عملکرد» پنل سنتر — تعداد صدور سنتر به تفکیک شرکت بیمه (روزانه / هفتگی / ماهانه)
// منبع: azki_center_breakdown_report (همون گزارشی که محاسبه حقوق ازش خونده می‌شه)؛ ردیف‌های scope هر شرکت
// + scope «کل». اختلاف «کل» با جمع شرکت‌ها (اگه شرکتی تو لیست فیلتر نباشه) به‌صورت ستون «سایر» میاد.
// ============================================================
const centerPerfState = { loaded: false, seq: 0, gran: 'daily', rows: [], agentRows: null, agentErr: '', bounds: null, name: '', model: null, agentModel: null, split: null };

// ============================================================
// تقسیم صدور هر کارشناس به «غیرانتقالی» و «انتقال تخفیفی» (فقط تعداد کل بازه)
// منبع: daily_targets.target_count (صدور کل) و daily_targets.discount_transfer_count (سفارش‌های «انتقال تخفیفی = بله»، از ورک‌فلوی n8n).
// غیرانتقالی = کل − انتقال تخفیفی؛ یعنی جمع دو ستون همیشه برابر صدور کل کارشناسه.
// روزهایی که n8n هنوز مقدار انتقال تخفیفی‌شون رو ننوشته (null) جدا به‌صورت «نامشخص» شمرده می‌شن تا عدد غلط نشون داده نشه.
// ============================================================
function issuanceSplitOf(rows) {
  let total = 0, transfer = 0, unknown = 0;
  (rows || []).forEach(r => {
    const n = Number(r.target_count) || 0;
    total += n;
    if (r.discount_transfer_count == null) unknown += n;
    else transfer += Math.min(n, Math.max(0, Number(r.discount_transfer_count) || 0));
  });
  return { total, transfer, unknown, normal: total - transfer - unknown };
}

// groups: [{ title|null, items: [{ name, rows }] }]  →  { groups: [{ title, list, gs }], sum }
function issuanceSplitModel(groups) {
  const sum = { total: 0, normal: 0, transfer: 0, unknown: 0 };
  const add = (s, x) => { s.total += x.total; s.normal += x.normal; s.transfer += x.transfer; s.unknown += x.unknown; return s; };
  const prepared = groups.map(g => {
    const list = g.items.map(it => ({ name: it.name, ...issuanceSplitOf(it.rows) }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'fa'));
    const gs = list.reduce(add, { total: 0, normal: 0, transfer: 0, unknown: 0 });
    add(sum, gs);
    return { title: g.title, list, gs };
  }).sort((a, b) => b.gs.total - a.gs.total);
  return { groups: prepared, sum };
}

function issuanceSplitHtml(model) {
  const { groups, sum } = model;
  const hasUnknown = sum.unknown > 0;
  const grouped = groups.some(g => g.title != null);
  const cell = v => `<td class="${v ? '' : 'is-zero'}">${v ? formatNumber(v) : '—'}</td>`;
  const cells = x => `${cell(x.normal)}${cell(x.transfer)}${hasUnknown ? cell(x.unknown) : ''}<td class="is-total">${formatNumber(x.total)}</td>`;
  const card = (label, v) => `<div class="summary-card"><div class="label">${label}</div><div class="value">${formatNumber(v)}</div></div>`;
  const pct = sum.total > 0 ? (sum.transfer / sum.total) * 100 : null;
  const pctCard = `<div class="summary-card"><div class="label">درصد سفارشات انتقالی</div><div class="value">${pct == null ? '—' : formatNumber(pct) + '٪'}</div></div>`;
  const head = `
    <div class="cp-split-title">تعداد صدور کارشناس‌ها: غیرانتقالی و انتقالی <small>(کل بازه‌ی انتخابی)</small></div>
    <div class="summary-row">${card('صدور کل', sum.total)}${card('غیرانتقالی', sum.normal)}${card('انتقالی', sum.transfer)}${pctCard}</div>`;
  const note = hasUnknown ? `<div class="cp-note">برای ${formatNumber(sum.unknown)} صدور، تقسیم انتقالی هنوز ثبت نشده (روزهایی که قبل از فعال‌شدن این گزارش بوده‌اند). این‌ها در ستون «نامشخص» جدا شده‌اند تا جمع هر ردیف همچنان برابر صدور کل بماند.</div>` : '';

  if (grouped) {
    // مثل تب «صدور»: هر سنتر یک کارت بازشونده؛ داخلش ردیف هر کارشناس
    const m = (label, v) => `<span class="cp-m">${label} <b>${v ? formatNumber(v) : '—'}</b></span>`;
    const agentRow = x => `
        <div class="team-day-row cp-agent-row">
          <span class="team-day-date cp-agent-name">${escHtml(x.name)}</span>
          <span class="cp-agent-m">${m('غیرانتقالی', x.normal)}${m('انتقالی', x.transfer)}${hasUnknown ? m('نامشخص', x.unknown) : ''}<span class="team-day-badge">${formatNumber(x.total)}</span></span>
        </div>`;
    const cards = groups.map(g => `
      <div class="leader-item">
        <button class="leader-header" type="button">
          <div class="leader-name-wrap">
            <svg class="leader-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            <span class="leader-name">${escHtml(g.title != null ? g.title : '—')}</span>
          </div>
          <div class="leader-right">
            <span class="cp-hdr-m">غیرانتقالی <b>${formatNumber(g.gs.normal)}</b></span>
            <span class="cp-hdr-m">انتقالی <b>${formatNumber(g.gs.transfer)}</b></span>
            <span class="leader-count">${formatNumber(g.list.length)} نفر</span>
            <span class="leader-total">${formatNumber(g.gs.total)}</span>
          </div>
        </button>
        <div class="leader-details">
          <div class="leader-details-inner">${g.list.map(agentRow).join('')}</div>
        </div>
      </div>`).join('');
    return `${head}<div class="list-card">${cards}</div>${note}`;
  }

  const body = groups.map(g => g.list.map(x => `<tr><td>${escHtml(x.name)}</td>${cells(x)}</tr>`).join('')).join('');
  return `${head}
    <div class="list-card"><div class="center-perf-scroll">
      <table class="center-perf-table">
        <thead><tr><th>کارشناس</th><th>غیرانتقالی</th><th>انتقالی</th>${hasUnknown ? '<th>نامشخص</th>' : ''}<th class="is-total">صدور کل</th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><td>جمع کل</td><td>${formatNumber(sum.normal)}</td><td>${formatNumber(sum.transfer)}</td>${hasUnknown ? `<td>${formatNumber(sum.unknown)}</td>` : ''}<td>${formatNumber(sum.total)}</td></tr></tfoot>
      </table>
    </div></div>
    ${note}`;
}

function renderCenterPerfSplit() {
  const el = document.getElementById('center-perf-split');
  if (!el) return;
  const lbEl = document.getElementById('center-perf-label'), bnd = centerPayrollBounds();
  if (lbEl && bnd) lbEl.textContent = `${centerViewName ? `سنتر: ${centerViewName} — ` : ''}بازه‌ی انتخابی: ${faDigits(bnd.startLabel)} تا ${faDigits(bnd.endLabel)}`;
  const rowsByUser = {};
  centerTargetRowsAll.forEach(r => { (rowsByUser[r.agent_id] = rowsByUser[r.agent_id] || []).push(r); });
  const agents = centerNormalAgentsAll.filter(m => m.status !== 'disabled' || (rowsByUser[m.id] || []).length > 0);
  if (!agents.length) { centerPerfState.split = null; el.innerHTML = '<div class="empty-state">هنوز نیرویی به شما اساین نشده است</div>'; return; }
  const model = issuanceSplitModel([{ title: null, items: agents.map(m => ({ name: centerAgentDisplayName(m), rows: rowsByUser[m.id] || [] })) }]);
  centerPerfState.split = model;
  el.innerHTML = issuanceSplitHtml(model);
}
const TABLE_AZKI_AGENT_COMPANY = 'azki_center_agent_company'; // صدور هر کارشناس به تفکیک شرکت بیمه (از ورک‌فلوی n8n)

async function fetchCenterAgentCompanyRows(bounds) {
  return fetchAllRows((from, to) =>
    supabaseClient.from(TABLE_AZKI_AGENT_COMPANY).select('*')
      .gte('report_date', bounds.startDate).lte('report_date', bounds.endDate)
      .order('report_date', { ascending: true }).order('id', { ascending: true }).range(from, to));
}

// کارشناس × شرکت روی کل بازه‌ی انتخابی
function buildCenterPerfAgentModel(rows) {
  const ag = {}, comp = {};
  rows.forEach(r => {
    const n = Number(r.orders_count) || 0, a = String(r.agent_name || '—'), c = String(r.company || 'نامشخص');
    const o = ag[a] || (ag[a] = { name: a, by: {}, total: 0 });
    o.by[c] = (o.by[c] || 0) + n; o.total += n; comp[c] = (comp[c] || 0) + n;
  });
  const companies = Object.keys(comp).filter(k => comp[k] > 0).sort((a, b) => comp[b] - comp[a] || a.localeCompare(b, 'fa'));
  const agents = Object.values(ag).filter(x => x.total > 0).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'fa'));
  return { agents, companies, compTotals: comp, grand: agents.reduce((t, x) => t + x.total, 0) };
}

function buildCenterPerfModel(rows, gran) {
  const comp = {};                 // نام شرکت -> جمع کل بازه
  const per = {};                  // کلید دوره -> { label, sortKey, by: {شرکت: n}, all: n }
  rows.forEach(r => {
    const n = Number(r.orders_count) || 0;
    const scope = r.company_scope;
    const { jy, jm, jd } = parseJalaliParts(r.report_date_jalali);
    const { key, label } = azkiPeriodGroupKey(jy, jm, jd, gran);
    const sortKey = jy * 10000 + jm * 100 + jd;
    const p = per[key] || (per[key] = { key, label, sortKey, by: {}, all: 0 });
    p.sortKey = Math.min(p.sortKey, sortKey);
    if (scope === 'کل') { p.all += n; return; }
    p.by[scope] = (p.by[scope] || 0) + n;
    comp[scope] = (comp[scope] || 0) + n;
  });
  const periods = Object.values(per).sort((a, b) => a.sortKey - b.sortKey);
  // «سایر» = کل − جمع شرکت‌ها در هر دوره (فقط وقتی مثبته)
  let otherTotal = 0;
  periods.forEach(p => {
    const sum = Object.values(p.by).reduce((x, y) => x + y, 0);
    p.other = Math.max(0, p.all - sum);
    p.total = Math.max(p.all, sum);
    otherTotal += p.other;
  });
  const companies = Object.keys(comp).filter(k => comp[k] > 0).sort((a, b) => comp[b] - comp[a] || a.localeCompare(b, 'fa'));
  const grand = periods.reduce((s0, p) => s0 + p.total, 0);
  return { periods, companies, compTotals: comp, otherTotal, grand };
}

// تب «بررسی عملکرد» سنتر: فقط جدول غیرانتقالی/انتقال تخفیفی؛ از همون داده‌ی تب «صدور» (centerTargetRowsAll) ساخته می‌شه و درخواست جدا نداره
function loadCenterPerf() {
  centerPerfState.loaded = true;
  renderCenterPerfSplit();
}

async function exportCenterPerfExcel() {
  const sp = centerPerfState.split;
  const btn = document.getElementById('center-perf-export');
  if (!sp || !sp.groups.length || !sp.groups[0].list.length) { alert('اطلاعاتی برای خروجی گرفتن وجود نداره.'); return; }
  const bounds = centerPayrollBounds();
  if (!bounds) { alert('بازه‌ی تاریخ مشخص نیست.'); return; }
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'در حال آماده‌سازی...';
  try {
    await ensureXlsxLib();
    const hasU = sp.sum.unknown > 0, S = sp.sum;
    const h3 = ['کارشناس', 'غیرانتقالی', 'انتقالی', ...(hasU ? ['نامشخص'] : []), 'صدور کل'];
    const ws = azkiXlsxSheet({
      title: 'بررسی عملکرد — صدور کارشناس‌ها: غیرانتقالی / انتقالی', bounds,
      metaLine2: `سنتر: ${centerViewName || ''}   |   کل بازه`,
      headers: h3, rows: sp.groups[0].list.map(x => [x.name, x.normal, x.transfer, ...(hasU ? [x.unknown] : []), x.total]),
      total: ['جمع کل', S.normal, S.transfer, ...(hasU ? [S.unknown] : []), S.total],
      widths: h3.map((h, i) => i === 0 ? 24 : 14), fmts: h3.map((h, i) => i === 0 ? 'text' : 'int'),
    });
    azkiXlsxSave([['انتقالی و غیرانتقالی', ws]], 'بررسی-عملکرد', bounds);
  } catch (e) {
    alert('خروجی اکسل با خطا مواجه شد: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}
document.getElementById('center-perf-export').addEventListener('click', exportCenterPerfExcel);

function renderTeamBugsList(list, containerId = 'team-bugs-list') {
  const teamBugsContainer = document.getElementById(containerId);
  if (!list || list.length === 0) {
    teamBugsContainer.innerHTML = '<div class="empty-state">خطایی با این مشخصات پیدا نشد</div>';
    return;
  }
  teamBugsContainer.innerHTML = list.map(r => `
    <div class="bug-item">
      <div class="bug-top">
        <span class="bug-kind">${r.kind_of_bug ?? ''}</span>
        <span class="bug-date">${toJalaliDisplay(r.check_date_jalali)}</span>
      </div>
      <div class="bug-agent">کارشناس: ${escHtml(r._memberName)}</div>
      <div class="bug-order">شماره سفارش: ${r.order_number ? `<a class="bug-order-link" href="https://backoffice.azki.com/panels/tracking-panel/${encodeURIComponent(r.order_number)}" target="_blank" rel="noopener noreferrer">${escHtml(r.order_number)}</a>` : '—'}</div>
      ${r.description ? `<div class="bug-desc">${escHtml(r.description)}</div>` : ''}
      ${r.price_rial ? `<span class="bug-price">${Number(r.price_rial).toLocaleString('en-US')} ریال</span>` : ''}
    </div>
  `).join('');
}

document.getElementById('team-bugs-search').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) {
    renderTeamBugsList(teamBugsFlat);
    return;
  }
  const filtered = teamBugsFlat.filter(r => (r._memberName || '').toLowerCase().includes(q));
  renderTeamBugsList(filtered);
});

// ============================================================
// پنل کارشناس: فیلتر بازه‌ی تاریخی + میانگین زمان صدور خود کارشناس
// avg_issuance_minutes در daily_targets برای هر دوره‌ی ۲۱ تا ۲۰ ثبت می‌شود (آخرین ردیف دوره = میانگین کل دوره).
// اگر بازه چند دوره را پوشش دهد، میانگین هر دوره با وزن «تعداد صدور همان دوره در بازه» ترکیب می‌شود.
// ============================================================
const agentFilter = { from: null, to: null, custom: false };   // [jy, jm, jd]
const agentCalView = { from: [0, 0], to: [0, 0] };
let agentFilterUserId = null;
let agentLoadToken = 0;

const agentSortKey = t => t[0] * 10000 + t[1] * 100 + t[2];
const agentLabel = t => `${t[0]}/${pad2(t[1])}/${pad2(t[2])}`;

function agentPeriod() {
  if (!agentFilter.from || !agentFilter.to) return currentPeriodBounds();
  const f = agentFilter.from, t = agentFilter.to;
  return { startSort: agentSortKey(f), endSort: agentSortKey(t), startLabel: agentLabel(f), endLabel: agentLabel(t) };
}

function agentSetDate(key, t) {
  agentFilter[key] = t;
  document.getElementById(`agent-${key}-text`).textContent = faDigits(agentLabel(t));
}

function agentSetDefaultRange() {
  const d = currentPeriodBounds();
  const s0 = parseJalaliParts(d.startLabel), e0 = parseJalaliParts(d.endLabel);
  agentSetDate('from', [s0.jy, s0.jm, s0.jd]);
  agentSetDate('to', [e0.jy, e0.jm, e0.jd]);
  agentFilter.custom = false;
}

function agentCalRender(key) {
  const pop = document.getElementById(`agent-${key}-cal`);
  let [vy, vm] = agentCalView[key];
  const sel = agentFilter[key];
  const today = tehranTodayJalali();
  const len = azkiJalaliMonthLength(vy, vm);
  const offset = azkiWeekdayIndex(vy, vm, 1);
  const yMin = Math.min(today[0] - 4, vy), yMax = Math.max(today[0] + 1, vy);
  let yearOpts = '';
  for (let y = yMin; y <= yMax; y++) yearOpts += `<option value="${y}"${y === vy ? ' selected' : ''}>${faDigits(y)}</option>`;
  const monthOpts = JALALI_MONTHS_FA.map((n, i) => `<option value="${i + 1}"${i + 1 === vm ? ' selected' : ''}>${n}</option>`).join('');
  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<span></span>';
  for (let d = 1; d <= len; d++) {
    const isSel = sel && sel[0] === vy && sel[1] === vm && sel[2] === d;
    const isToday = today[0] === vy && today[1] === vm && today[2] === d;
    cells += `<button type="button" class="azki-cal-day${isSel ? ' sel' : ''}${isToday ? ' today' : ''}" data-day="${d}">${faDigits(d)}</button>`;
  }
  const chev = pts => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="${pts}"/></svg>`;
  pop.innerHTML = `
    <div class="azki-cal-head">
      <button type="button" class="azki-cal-nav" data-nav="-1" aria-label="ماه قبل">${chev('9 6 15 12 9 18')}</button>
      <select data-role="m" aria-label="ماه">${monthOpts}</select>
      <select data-role="y" aria-label="سال">${yearOpts}</select>
      <button type="button" class="azki-cal-nav" data-nav="1" aria-label="ماه بعد">${chev('15 6 9 12 15 18')}</button>
    </div>
    <div class="azki-cal-grid">
      ${AZKI_WEEKDAYS.map(w => `<span class="azki-cal-wd">${w}</span>`).join('')}
      ${cells}
    </div>
    <div class="azki-pop-foot">
      <button type="button" class="sm-btn" data-today="1">امروز</button>
      <button type="button" class="sm-btn" data-close="1">بستن</button>
    </div>`;
}

function agentOpenCal(key) {
  const pop = document.getElementById(`agent-${key}-cal`);
  const willOpen = pop.hidden;
  azkiClosePops(pop.id);
  if (!willOpen) { pop.hidden = true; return; }
  const cur = agentFilter[key] || tehranTodayJalali();
  agentCalView[key] = [cur[0], cur[1]];
  agentCalRender(key);
  pop.hidden = false;
  azkiPlacePop(pop);
}

function agentBindCal(key) {
  const pop = document.getElementById(`agent-${key}-cal`);
  document.getElementById(`agent-${key}-btn`).addEventListener('click', () => agentOpenCal(key));
  pop.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    const day = e.target.closest('[data-day]');
    if (nav) {
      let [vy, vm] = agentCalView[key];
      vm += parseInt(nav.dataset.nav, 10);
      if (vm < 1) { vm = 12; vy--; } else if (vm > 12) { vm = 1; vy++; }
      agentCalView[key] = [vy, vm];
      agentCalRender(key);
    } else if (day) {
      const [vy, vm] = agentCalView[key];
      agentSetDate(key, [vy, vm, parseInt(day.dataset.day, 10)]);
      pop.hidden = true;
      agentApplyRange();
    } else if (e.target.closest('[data-today]')) {
      agentSetDate(key, tehranTodayJalali());
      pop.hidden = true;
      agentApplyRange();
    } else if (e.target.closest('[data-close]')) {
      pop.hidden = true;
    }
  });
  pop.addEventListener('change', e => {
    const role = e.target.dataset.role;
    if (!role) return;
    const v = parseInt(e.target.value, 10);
    if (role === 'm') agentCalView[key][1] = v; else agentCalView[key][0] = v;
    agentCalRender(key);
  });
}

function agentApplyRange() {
  const errEl = document.getElementById('agent-filter-error');
  const f = agentFilter.from, t = agentFilter.to;
  if (!f || !t) return;
  if (agentSortKey(f) > agentSortKey(t)) { errEl.textContent = 'تاریخ شروع نباید بعد از تاریخ پایان باشد.'; return; }
  const days = (Date.parse(jalaliToGregorian(t[0], t[1], t[2])) - Date.parse(jalaliToGregorian(f[0], f[1], f[2]))) / 86400000 + 1;
  if (days > 366) { errEl.textContent = 'حداکثر بازه‌ی قابل نمایش یک سال است.'; return; }
  errEl.textContent = '';
  const d = currentPeriodBounds();
  agentFilter.custom = !(agentSortKey(f) === d.startSort && agentSortKey(t) === d.endSort);
  if (agentFilterUserId) loadTargets(agentFilterUserId);
}

function initAgentFilter() {
  agentSetDefaultRange();
  agentBindCal('from');
  agentBindCal('to');
  document.getElementById('agent-reset-btn').addEventListener('click', () => {
    agentSetDefaultRange();
    document.getElementById('agent-filter-error').textContent = '';
    if (agentFilterUserId) loadTargets(agentFilterUserId);
  });
}
initAgentFilter();

// میانگین زمان صدور کارشناس برای بازه: { minutes, periods } یا null اگر داده‌ای نبود
function agentComputeOct(rows) {
  const per = {};
  const psOf = sk => periodStartSortOfJalali(Math.floor(sk / 10000), Math.floor(sk / 100) % 100, sk % 100);
  rows.forEach(r => {
    if (r.avg_issuance_minutes == null) return;
    const v = Number(r.avg_issuance_minutes);
    if (!isFinite(v)) return;
    const sk = Number(r.report_date_sort) || 0;
    const ps = psOf(sk);
    const p = per[ps] || (per[ps] = { v, sk, w: 0 });
    if (sk >= p.sk) { p.v = v; p.sk = sk; }
  });
  rows.forEach(r => {
    const p = per[psOf(Number(r.report_date_sort) || 0)];
    if (p) p.w += Number(r.target_count) || 0;
  });
  const items = Object.values(per);
  if (!items.length) return null;
  const wSum = items.reduce((a, x) => a + x.w, 0);
  const minutes = wSum > 0 ? items.reduce((a, x) => a + x.v * x.w, 0) / wSum : items.reduce((a, x) => a + x.v, 0) / items.length;
  return { minutes: round2(minutes), periods: items.length };
}

function agentFmtOct(min) {
  if (min == null) return '—';
  const base = `${formatNumber(min)} دقیقه`;
  if (min < 60) return base;
  const h = Math.floor(min / 60), m = Math.round(min - h * 60);
  return `${base} (${faDigits(h)} ساعت${m ? ' و ' + faDigits(m) + ' دقیقه' : ''})`;
}

// تب «بررسی عملکرد» کارشناس: صدور خود کارشناس به تفکیک غیرانتقالی / انتقال تخفیفی؛ از همون داده‌ی تب «تارگت روزانه» (همون فیلتر تاریخ)
const agentPerfState = { rows: null, err: '', label: '' };
function renderAgentPerf() {
  const el = document.getElementById('agent-perf-body');
  const lb = document.getElementById('agent-perf-label');
  if (!el) return;
  if (lb) lb.textContent = agentPerfState.label;
  if (agentPerfState.rows == null) { el.innerHTML = '<div class="loading-state">در حال بارگذاری...</div>'; return; }
  if (agentPerfState.err) { el.innerHTML = `<div class="empty-state">خطا در دریافت اطلاعات: ${escHtml(agentPerfState.err)}</div>`; return; }
  const rows = sortRowsByDateAsc(agentPerfState.rows);
  if (!rows.length) { el.innerHTML = '<div class="empty-state">هنوز اطلاعاتی برای این بازه ثبت نشده است</div>'; return; }
  const sum = issuanceSplitOf(rows);
  const hasUnknown = sum.unknown > 0;
  const card = (label, v) => `<div class="summary-card"><div class="label">${label}</div><div class="value">${formatNumber(v)}</div></div>`;
  const pct = sum.total > 0 ? (sum.transfer / sum.total) * 100 : null;
  const pctCard = `<div class="summary-card"><div class="label">درصد سفارشات انتقالی</div><div class="value">${pct == null ? '—' : formatNumber(pct) + '٪'}</div></div>`;
  const cell = v => `<td class="${v ? '' : 'is-zero'}">${v ? formatNumber(v) : '—'}</td>`;
  const body = rows.map(r => {
    const x = issuanceSplitOf([r]);
    return `<tr><td>${toJalaliDisplay(r.report_date_jalali)}</td>${cell(x.normal)}${cell(x.transfer)}${hasUnknown ? cell(x.unknown) : ''}<td class="is-total">${formatNumber(x.total)}</td></tr>`;
  }).join('');
  const note = hasUnknown ? `<div class="cp-note">برای ${formatNumber(sum.unknown)} صدور، تقسیم انتقالی هنوز ثبت نشده (روزهایی که قبل از فعال‌شدن این گزارش بوده‌اند). این‌ها در ستون «نامشخص» جدا شده‌اند تا جمع هر ردیف همچنان برابر صدور کل باشد.</div>` : '';
  el.innerHTML = `
    <div class="cp-split-title">تعداد صدور من: غیرانتقالی و انتقالی <small>(کل بازه‌ی انتخابی)</small></div>
    <div class="summary-row">${card('صدور کل', sum.total)}${card('غیرانتقالی', sum.normal)}${card('انتقالی', sum.transfer)}${pctCard}</div>
    <div class="list-card"><div class="center-perf-scroll">
      <table class="center-perf-table">
        <thead><tr><th>تاریخ</th><th>غیرانتقالی</th><th>انتقالی</th>${hasUnknown ? '<th>نامشخص</th>' : ''}<th class="is-total">صدور کل</th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><td>جمع کل</td><td>${formatNumber(sum.normal)}</td><td>${formatNumber(sum.transfer)}</td>${hasUnknown ? `<td>${formatNumber(sum.unknown)}</td>` : ''}<td>${formatNumber(sum.total)}</td></tr></tfoot>
      </table>
    </div></div>
    ${note}`;
}

async function loadTargets(userId) {
  agentFilterUserId = userId;
  const token = ++agentLoadToken;
  const container = document.getElementById('targets-list');
  const period = agentPeriod();
  agentPerfState.label = faDigits(`${agentFilter.custom ? 'بازه‌ی نمایش' : 'بازه‌ی جاری'}: ${period.startLabel} تا ${period.endLabel}`);
  agentPerfState.rows = null; agentPerfState.err = '';
  document.getElementById('period-label').textContent = faDigits(`${agentFilter.custom ? 'بازه‌ی نمایش' : 'بازه‌ی جاری'}: ${period.startLabel} تا ${period.endLabel}`);
  const avgVal = document.getElementById('agent-avg-val');
  const avgSub = document.getElementById('agent-avg-sub');

  const { data, error } = await supabaseClient
    .from(TABLE_TARGETS)
    .select('agent_id,report_date,report_date_jalali,report_date_sort,target_count,avg_issuance_minutes,discount_transfer_count')
    .eq('agent_id', userId)
    .gte('report_date_sort', period.startSort)
    .lte('report_date_sort', period.endSort)
    .order('report_date_sort', { ascending: true });

  if (token !== agentLoadToken) return;
  currentPeriodKey = period.startLabel;
  agentPerfState.rows = error ? [] : (data || []);
  agentPerfState.err = error ? error.message : '';
  renderAgentPerf();

  if (error) {
    container.innerHTML = `<div class="empty-state">خطا در دریافت اطلاعات: ${escHtml(error.message)}</div>`;
    document.getElementById('period-total').textContent = '—';
    avgVal.textContent = '—'; avgSub.textContent = '';
    return;
  }
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="empty-state">هنوز تارگتی برای این بازه ثبت نشده است</div>';
    document.getElementById('period-total').textContent = '۰';
    avgVal.textContent = '—'; avgSub.textContent = 'برای این بازه داده‌ای ثبت نشده';
    return;
  }

  const periodTotal = data.reduce((sum, r) => sum + (Number(r.target_count) || 0), 0);
  document.getElementById('period-total').textContent = formatNumber(periodTotal);

  const oct = agentComputeOct(data);
  if (oct) {
    avgVal.textContent = agentFmtOct(oct.minutes);
    avgSub.textContent = oct.periods > 1
      ? `میانگین وزنی ${faDigits(oct.periods)} دوره‌ی ۲۱ تا ۲۰`
      : 'میانگین دوره‌ی ۲۱ تا ۲۰ مربوط به این بازه';
  } else {
    avgVal.textContent = '—';
    avgSub.textContent = 'میانگین زمان صدور برای این بازه هنوز ثبت نشده';
  }

  container.innerHTML = sortRowsByDateAsc(data).map(r => `
    <div class="row-item">
      <div class="row-date">${toJalaliDisplay(r.report_date_jalali)}</div>
      <div class="row-badge">${r.target_count != null ? formatNumber(r.target_count) : '—'}</div>
    </div>
  `).join('');
}

// ============================================================
// تب «آموزش»: چت‌بات پرسش‌وپاسخ روی شیت «قوانین ثالث /center»
// داده از Google Sheets (گزارش عمومیِ gviz) خوانده می‌شود و کاملاً داخل مرورگر جستجو می‌شود (بدون کلید/سرور).
// اگر نام یکی از برگه‌ها در شیت عوض شد، فقط همین فهرست را به‌روز کنید.
// ============================================================
const TRAIN_SHEET_ID = '1zLzuthsCORGAnBM0MT3b_H0xZ-C4Zr-vtPkGxzkpRwk';
// لیست برگه‌ها دیگه ثابت نیست: هر برگه‌ی (قابل‌مشاهده) شیت خودکار یک موضوع می‌شود. نام برگه‌ها از وب‌اپ Apps Script (action=sheets) گرفته می‌شود.
// اگر خواستی برای برگه‌ای عنوان نمایشی یا دسته‌ی جدا بگذاری، اینجا اضافه کن: { name: 'نام دسته', sheets: [['نام برگه در شیت', 'عنوان نمایشی']] }
const TRAIN_GROUPS = [];
const TRAIN_LABELS = new Map(TRAIN_GROUPS.flatMap(g => [...g.sheets, ...(g.subs || []).flatMap(sg => sg.sheets)]));
function trLabel(sheet) { return TRAIN_LABELS.get(sheet) || sheet; }
const TRAIN_CACHE_KEY = 'trainingSheetCache_v2';
const TRAIN_CACHE_TTL = 5 * 60 * 1000;
const trainState = { chunks: [], sheets: [], failed: [], loaded: false, loading: null, scope: '__all', idf: {}, avgLen: 1, bound: false, fetchedAt: 0 };

const TR_STOP = new Set(('و در به از که این را با است برای آن یک هم چی چیه چیست چه چطور چطوری چگونه کجا کی آیا باید می شود میشه میشود هست نیست بود شد کنم کنیم کنید کرد دارد دارم داره دارن دارند دارید داری رو من ما شما تو اگه اگر یا ولی اما تا بعد قبل بین هر همه کدوم کدام بگو بگید بگین بده بدید توضیح درباره میخوام میخواد خواهد بشه باشه کنه کنن کنند کند کنی میکنه میکنن میکنند میکند میکنید میکنم میکنی میکنیم بیمه نامه چنده چقدره چقدر چند چندتا چنتا کدومه میدونی بلدی').split(' '));
// مترادف‌های گفتاری سوال ← کلماتی که توی متن شیت هست (کلید = ریشه‌ی کلمه‌ی سوال)
const TR_SYN = { 'میزنه': ['صدور', 'صادر'], 'میزنن': ['صدور', 'صادر'], 'میزنند': ['صدور', 'صادر'], 'میزنید': ['صدور', 'صادر'], 'میزنی': ['صدور', 'صادر'], 'بزنیم': ['صدور', 'صادر'], 'بزنم': ['صدور', 'صادر'], 'بزنن': ['صدور', 'صادر'], 'صادر': ['صدور'], 'صدور': ['صادر'], 'جلو': ['زود'], 'زود': ['جلو'], 'شماره': ['کد'], 'کد': ['شماره'] };
const TR_SUF = ['هایی', 'ترین', 'های', 'ها', 'ان', 'ات', 'تر', 'ی'];

function trNorm(s) {
  return String(s == null ? '' : s)
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[ۀة]/g, 'ه').replace(/[أإآ]/g, 'ا').replace(/ئ/g, 'ی').replace(/ؤ/g, 'و')
    .replace(/[\u200c\u200f\u200e]/g, ' ')
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .toLowerCase();
}
function trWords(s) { return trNorm(s).replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(Boolean); }
function trStem(w) {
  if (w.length <= 3) return w;
  for (const s of TR_SUF) if (w.length - s.length >= 3 && w.endsWith(s)) return w.slice(0, -s.length);
  return w;
}
function trTokens(s) { return trWords(s).filter(w => !TR_STOP.has(w)).map(trStem); }

function trParseCsv(t) {
  t = String(t).replace(/^\uFEFF/, '');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

async function trFetchSheet(name, gid) {
  const base = `https://docs.google.com/spreadsheets/d/${TRAIN_SHEET_ID}/gviz/tq?tqx=out:csv;reqId:${Date.now()}&headers=0`;
  const url = (gid != null ? `${base}&gid=${gid}` : `${base}&sheet=${encodeURIComponent(name)}`) + `&_t=${Date.now()}`;   // کش‌شکن: هر بار نسخه‌ی تازه
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(url, { signal: ctl.signal, credentials: 'omit', cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const txt = await res.text();
    if (/^\s*<(!doctype|html)/i.test(txt)) throw new Error('دسترسی به شیت ممکن نیست (باید «هر کسی با لینک» می‌تواند ببیند باشد)');
    return txt;
  } finally { clearTimeout(timer); }
}

// سوال/جواب‌هایی که چند جدول کنار هم دارند (ستون‌های «سوال | راه حل | سوال | پاسخ») هر کدام یک رکورد جدا می‌شوند؛
// وقتی عنوان یک ستون در همان ردیف تکرار شد یعنی رکورد بعدی شروع شده. ستونِ «سوال» جدا نگه داشته می‌شود تا در جواب تکرار نشود.
const TR_Q_LABEL = /سوال|پرسش/;
function trPushRow(out, sheet, title, fields, hasHeader, row) {
  const segs = []; let cur = [], seen = new Set();
  fields.forEach(f => {
    if (hasHeader && f.k && seen.has(f.k) && cur.length) { segs.push(cur); cur = []; seen = new Set(); }
    cur.push(f); if (f.k) seen.add(f.k);
  });
  if (cur.length) segs.push(cur);
  segs.forEach(seg => {
    const chunk = { sheet, title, kind: 'row', fields: seg, row };
    const qi = seg.findIndex(f => TR_Q_LABEL.test(f.k));
    if (qi >= 0 && seg.length > 1) { chunk.q = seg[qi].v; chunk.qi = qi; }
    out.push(chunk);
  });
}

// ساخت تکه‌های دانش از یک برگه: جدول → هر ردیف یک تکه (با عنوان ستون‌ها)، متن آزاد → بلوک‌های پشت‌سرهم
// لینکِ داخل سلول‌ها (متن لینک‌دار یا =HYPERLINK) تو خروجی CSV گوگل نمی‌آد و فقط متن نمایشی می‌رسه؛ وب‌اپ Apps Script (تابع links_) آدرس‌ها رو جدا می‌ده:
//   فرمت فعلی اسکریپت: links = [[ردیف (از ۱)، ستون (از ۰)، آدرس], ...]  ← نسبت به گوشه‌ی بالا-چپِ محدوده‌ی داده (همون شروع خروجی CSV)
//   فرمت کامل‌تر (اختیاری): links = { o: [ردیفِ اولِ محدوده، ستونِ اول], c: [[ردیف، ستون (از ۱)، آدرس یا [{t, u}]، متن سلول], ...] }
// تو فرمت کامل، لینک فقط وقتی وصل می‌شه که متنِ همون خونه با متنِ سلولِ لینک‌دار بخونه.
function trLinkLookup(grid, links) {
  const map = new Map();
  if (Array.isArray(links)) {
    links.forEach(e => {
      if (!Array.isArray(e) || e.length < 3) return;
      const r = Number(e[0]) - 1, c = Number(e[1]);
      if (r >= 0 && c >= 0 && String((grid[r] || [])[c] == null ? '' : grid[r][c]).trim()) map.set(r + ',' + c, e[2]);
    });
    return (r, c) => map.get(r + ',' + c) || null;
  }
  const cells = links && Array.isArray(links.c) ? links.c : [];
  const o = links && Array.isArray(links.o) ? links.o : [1, 1];
  const txt = (r, c) => { const v = (grid[r] || [])[c]; return String(v == null ? '' : v).trim(); };
  cells.forEach(e => {
    if (!Array.isArray(e)) return;
    const [row, col, u, text] = e, want = String(text == null ? '' : text).trim();
    const hit = [[row - 1, col - 1], [row - o[0], col - o[1]]].find(([r, c]) => r >= 0 && c >= 0 && txt(r, c) === want);
    if (hit) map.set(hit[0] + ',' + hit[1], u);
  });
  return (r, c) => map.get(r + ',' + c) || null;
}

function trBuildChunks(sheet, grid, links) {
  const linkAt = trLinkLookup(grid, links);
  const out = [];
  let title = '', header = null, block = [], blockRow = 0;
  const cellsOf = r => (r || []).map((c, i) => ({ i, v: String(c == null ? '' : c).trim() })).filter(x => x.v);
  const flush = () => {
    if (!block.length) return;
    out.push({ sheet, title, kind: 'text', row: blockRow, fields: block.map(v => ({ k: '', v })) });
    block = [];
  };
  const headerLike = cells => cells.length >= 2 && cells.every(c => c.v.length <= 40 && !/[؟?]/.test(c.v));
  for (let r = 0; r < grid.length; r++) {
    const cells = cellsOf(grid[r]);
    if (!cells.length) { flush(); header = null; continue; }
    const next = cellsOf(grid[r + 1]);
    if (cells.length === 1) {
      const v = cells[0].v;
      if (header) { out.push({ sheet, title, kind: 'row', row: r + 1, fields: [{ k: header[cells[0].i] || '', v, u: linkAt(r, cells[0].i) }] }); continue; }
      const prevBlank = r === 0 || !cellsOf(grid[r - 1]).length;
      // خط کوتاهِ حاوی عدد/کد یا جمله‌ی کامل (مثل «کد صندوق 1395») عنوان نیست، یک خبر است و باید قابل جستجو باشد
      const factLike = !next.length && (/[0-9۰-۹]/.test(v) || v.split(/\s+/).length >= 5);
      if (prevBlank && v.length < 60 && (!next.length || next.length >= 2) && !factLike) { flush(); title = v; continue; }
      if (!block.length) blockRow = r + 1;
      block.push(v);
      if (block.length >= 8 || block.join(' ').length > 900) flush();
      continue;
    }
    flush();
    if (!header && headerLike(cells) && next.length >= 2) {
      header = {}; cells.forEach(c => { header[c.i] = c.v; });
      // اگر سطر اول در واقع عنوان ستون نبود و داده بود، همچنان قابل جستجو بماند (با امتیاز کمتر)
      out.push({ sheet, title, kind: 'row', isHeader: true, row: r + 1, fields: cells.map(c => ({ k: '', v: c.v })) });
      continue;
    }
    trPushRow(out, sheet, title, cells.map(c => ({ k: header ? (header[c.i] || '') : '', v: c.v, u: linkAt(r, c.i) })), !!header, r + 1);
  }
  flush();
  return out;
}

function trIndex(chunks) {
  const df = {}; let total = 0;
  chunks.forEach(c => {
    const parts = [c.sheet, c.title, ...c.fields.map(f => f.k), ...c.fields.map(f => f.v), ...(c.q ? [c.q, c.q] : [])];
    c.text = trNorm(parts.join(' '));
    c.tf = {};
    c.tokens = trTokens(parts.join(' '));
    c.tokens.forEach(t => { c.tf[t] = (c.tf[t] || 0) + 1; });
    c.cells = new Set(c.fields.map(f => trWords(f.v).join(' ')).filter(Boolean));
    c.qSet = c.q ? new Set(trTokens(c.q)) : null;
    c.qKey = c.q ? trWords(c.q).filter(w => !TR_STOP.has(w)).join(' ') : '';
    Object.keys(c.tf).forEach(t => { df[t] = (df[t] || 0) + 1; });
    total += c.tokens.length;
  });
  const N = Math.max(chunks.length, 1);
  const idf = {};
  Object.keys(df).forEach(t => { idf[t] = Math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5)); });
  trainState.idf = idf;
  trainState.vocab = Object.keys(idf);
  trainState.avgLen = Math.max(total / N, 1);
}

// ---- غلط املایی: کلمه‌ی سوال که عیناً تو هیچ جای شیت نیست، با نزدیک‌ترین کلمه‌ی شیت (فاصله‌ی ویرایشی ۱ یا ۲) تطبیق داده می‌شه ----
// کلمه‌های ≤۴ حرفی تصحیح نمی‌شن (احتمال اشتباه بالاست)؛ ۵ تا ۷ حرف: یک غلط؛ ۸ حرف و بیشتر: دو غلط. جابه‌جایی دو حرف کنار هم یک غلط حساب می‌شه.
function trEditLimit(len) { return len >= 8 ? 2 : len >= 5 ? 1 : 0; }
function trEditDist(a, b, max) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let pp = null, pr = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const cur = [i]; let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      let v = Math.min(pr[j] + 1, cur[j - 1] + 1, pr[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (pp && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, pp[j - 2] + 1);
      cur[j] = v; if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    pp = pr; pr = cur;
  }
  return pr[lb];
}
function trFuzzyVariants(t) {
  const lim = trEditLimit(t.length);
  if (!lim || trainState.idf[t] || !trainState.vocab) return null;
  const out = [];
  trainState.vocab.forEach(v => { const d = trEditDist(t, v, lim); if (d <= lim) out.push([d, v]); });
  out.sort((x, y) => x[0] - y[0]);
  return out.length ? out.slice(0, 6).map(x => x[1]) : null;
}

function trSearch(question, scope) {
  const words = trWords(question).filter(w => !TR_STOP.has(w));
  const qTok = words.filter(w => w.length > 1).map(trStem);
  const single = words.filter(w => w.length === 1);
  if (!qTok.length && !single.length) return [];
  const k1 = 1.4, b = 0.75, avg = trainState.avgLen;
  const phrase = words.join(' ');
  const fz = {};
  qTok.forEach(t => { const v = trFuzzyVariants(t); if (v) fz[t] = v; });
  const res = [];
  trainState.chunks.forEach(c => {
    if (scope !== '__all' && c.sheet !== scope) return;
    let score = 0, hit = 0;
    const miss = [];
    qTok.forEach(t => {
      let tf = c.tf[t] || 0;
      if (!tf && TR_SYN[t]) { for (const sy of TR_SYN[t]) { if (c.tf[sy]) { tf = c.tf[sy] * 0.7; break; } } }
      if (!tf && t.length >= 4) { for (const k in c.tf) { if (k.length >= 4 && (k.startsWith(t) || t.startsWith(k))) { tf = c.tf[k] * 0.6; break; } } }
      if (!tf && fz[t]) { for (const v of fz[t]) { if (c.tf[v]) { tf = c.tf[v] * 0.5; break; } } }   // غلط املایی
      if (!tf) { miss.push(t); return; }
      hit++;
      const idf = trainState.idf[t] || 1;
      score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * c.tokens.length / avg));
      if (c.cells.has(t)) score += 1.5;
      if (c.qSet && c.qSet.has(t)) score += 1.2;
    });
    single.forEach(t => { if (c.cells.has(t)) { score += 6; hit++; } });
    if (qTok.length > 1 && c.text.includes(phrase)) score += 3;
    if (c.qKey && c.qKey === phrase) score += 25;
    const total = qTok.length + single.length;
    if (!hit || hit < Math.ceil(0.75 * total)) return; // جواب فقط وقتی که تقریباً همه‌ی کلمات سوال تو یک رکورد باشه
    const cover = hit / total;
    score *= 0.5 + 0.5 * cover;
    if (c.isHeader) score *= 0.35;
    res.push({ c, score, miss });
  });
  res.sort((a, b) => b.score - a.score);
  return res.slice(0, 4);
}

function trSafeUrl(u) { u = String(u || '').trim(); return /^(https?:\/\/|mailto:|tel:)/i.test(u) ? u : ''; }
function trAnchor(text, u) { return `<a href="${escHtml(u)}" target="_blank" rel="noopener noreferrer">${escHtml(text)}</a>`; }
// محتوای یک سلول: اگه لینک پنهان داشت (f.u) همون متن به‌صورت لینک نشون داده می‌شه؛ وگرنه مثل قبل
function trFieldHtml(f, qt, focus) {
  const u = f.u;
  if (typeof u === 'string') { const su = trSafeUrl(u); if (su) return trAnchor(f.v, su); }
  else if (Array.isArray(u) && u.length) {   // چند لینک تو یک سلول: متنِ هر لینک همون‌جا لینک می‌شه
    let html = escHtml(f.v).replace(/\n/g, '<br>');
    u.forEach(x => {
      const su = trSafeUrl(x && x.u), tx = x && x.t ? escHtml(String(x.t)) : '';
      if (su && tx && html.includes(tx)) html = html.replace(tx, () => trAnchor(x.t, su));
    });
    return html;
  }
  return focus ? trFocusLines(f.v, qt) : trLines(f.v);
}
function trLines(v) {
  return escHtml(v).replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}
// سلولِ چندخطی (مثلاً قرارداد + کد صندوق در یک سلول): فقط خط‌هایی که به سوال می‌خورند نشان داده می‌شوند، بقیه زیر «نمایش بقیه»
function trFocusLines(v, qt) {
  const lines = String(v).split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  if (!qt || !qt.length || lines.length < 3) return trLines(v);
  const w = t => trainState.idf[t] || 1;
  const sc = lines.map(l => { const tk = new Set(trTokens(l)); return qt.reduce((n, x) => n + (tk.has(x) ? w(x) : 0), 0); });
  const best = Math.max(...sc);
  if (best <= 0) return trLines(v);
  const main = lines.filter((l, i) => sc[i] >= best - 1e-9), rest = lines.filter((l, i) => sc[i] < best - 1e-9);
  if (!rest.length) return trLines(v);
  return main.map(l => `<div>${trLines(l)}</div>`).join('') +
    `<details class="tr-more"><summary>نمایش بقیه‌ی متن این سلول</summary>${rest.map(l => `<div class="tr-alt">${trLines(l)}</div>`).join('')}</details>`;
}
// ---- جواب بله/خیر: اگه یکی از سلول‌های ردیفِ جواب یک حکم بود («امکان صدور هست»، «نمیشه»)، فقط همون با «بله/خیر» نشان داده می‌شه ----
// عنوان ستون‌ها (ردیف اول = سوال) نمایش داده نمی‌شن و بقیه‌ی سلول‌های ردیف نشان داده نمی‌شن.
const TR_NEG = /(نیست|نمی ?(شود|شه|باشد|توان|تواند|تونه)|نمیشه|ندارد|ندارن|ندارند|ممنوع|غیر ?مجاز)/;
const TR_POS = /(هست|هستند|دارد|دارن|دارند|می ?(شود|شه|باشد)|میشه|مجاز|امکان ?پذیر)/;
const TR_WH = new Set(['چرا', 'چطور', 'چطوری', 'چگونه', 'چیه', 'چی', 'چیست', 'چه', 'کدوم', 'کدام', 'کجا', 'کی', 'چقدر', 'چقدره', 'چند', 'چنده', 'چندتا', 'چجوری']);
function trIsYesNo(q) { return !trWords(q).some(w => TR_WH.has(w)); }
function trVerdict(v) {
  const t = trNorm(v).replace(/\s+/g, ' ').trim();
  if (!t || t.length > 80) return null;
  if (/^(خیر|نه)(?![\p{L}])/u.test(t)) return { kind: 'no', explicit: true };
  if (/^(بله|آره|اره)(?![\p{L}])/u.test(t)) return { kind: 'yes', explicit: true };
  if (TR_NEG.test(t)) return { kind: 'no', explicit: false };
  if (TR_POS.test(t)) return { kind: 'yes', explicit: false };
  return null;
}
function trVerdictHtml(c, qt, yn) {
  if (!yn || c.kind !== 'row' || c.isHeader || c.q != null || !c.fields.some(f => f.k)) return null;
  const cand = c.fields.map((f, i) => ({ f, i, vd: trVerdict(f.v) })).filter(x => x.vd);
  if (!cand.length) return null;
  const sc = x => { const tk = new Set(trTokens(x.f.k)); return (qt || []).filter(t => tk.has(t)).length; };
  let best = cand[0]; cand.forEach(x => { if (sc(x) > sc(best)) best = x; });
  const val = String(best.f.v).replace(/[.\s]+$/, '');
  const txt = best.vd.explicit ? val : (best.vd.kind === 'yes' ? 'بله، ' : 'خیر، ') + val;
  return `<div class="tr-ans">${trLines(txt)}</div>`;   // فقط حکم بله/خیر؛ بقیه‌ی سلول‌های ردیف (که ربطی به سوال ندارن) نمایش داده نمی‌شن
}
function trRenderChunk(c, qt, yn) {
  const rowTag = (c.row && (currentUserRole === 'admin' || currentUserRole === 'supervisor')) ? ' • ردیف ' + faDigits(c.row) : '';
  const src = `<div class="tr-src">${escHtml(trLabel(c.sheet))}${c.title && c.title !== c.sheet ? ' • ' + escHtml(c.title) : ''}${rowTag}</div>`;
  const vh = trVerdictHtml(c, qt, yn);
  if (vh) return src + vh;
  if (c.q != null) {
    // فقط پاسخ؛ خود سوال دوباره نشان داده نمی‌شود
    const ans = c.fields.filter((f, i) => i !== c.qi);
    const multi = ans.length > 1;
    return src + ans.map(f => `<div class="tr-ans">${multi && f.k ? `<b class="tr-ans-k">${escHtml(f.k)}:</b> ` : ''}${trFieldHtml(f)}</div>`).join('');
  }
  if (c.kind === 'row' && c.fields.some(f => f.k)) {
    return src + '<dl class="tr-dl">' + c.fields.map(f => `<div><dt>${escHtml(f.k || '—')}</dt><dd>${trFieldHtml(f, qt, true)}</dd></div>`).join('') + '</dl>';
  }
  if (c.kind === 'row') {
    const [first, ...rest] = c.fields;
    return src + `<div class="tr-main">${trFieldHtml(first, qt, true)}</div>` + rest.map(f => `<div>${trFieldHtml(f, qt, true)}</div>`).join('');
  }
  if (qt && qt.length && c.fields.length > 3) {
    // متن بلند: فقط خط‌هایی که بیشترین تطابق با سوال را دارند نشان بده، بقیه‌ی متن در «نمایش بقیه» بماند
    const sc = c.fields.map(f => { const tk = new Set(trTokens(f.v)); return qt.filter(x => tk.has(x)).length; });
    const best = Math.max(...sc);
    if (best > 0) {
      const main = c.fields.filter((f, i) => sc[i] === best), rest = c.fields.filter((f, i) => sc[i] !== best);
      return src + main.map(f => `<div>${trLines(f.v)}</div>`).join('') +
        (rest.length ? `<details class="tr-more"><summary>نمایش بقیه‌ی متن این بخش</summary>${rest.map(f => `<div class="tr-alt">${trLines(f.v)}</div>`).join('')}</details>` : '');
    }
  }
  return src + c.fields.map(f => `<div>${trFieldHtml(f, qt, true)}</div>`).join('');
}

// ---- لاگ سوال و جواب‌ها در گوگل شیت (از طریق وب‌اپ Apps Script؛ فایل apps-script-training-log.gs) ----
// تا وقتی TRAIN_LOG_URL خالی باشه هیچ لاگی ارسال نمی‌شه.
const TRAIN_LOG_URL = 'https://script.google.com/macros/s/AKfycbxY5HOCZLawpLEllim_g2v68xf8C0nLWRkxIbB5Kx_VaCK0T_ih2higiCHVvK7GUgzB/exec';   // آدرس وب‌اپ Apps Script (…/exec)
const TRAIN_LOG_TOKEN = '887520hhfaofwooh696gfjyf'; // همان TOKEN داخل اسکریپت
function trPlain(c) {
  if (!c) return '';
  const f = c.q != null ? c.fields.filter((x, i) => i !== c.qi) : c.fields;
  return f.map(x => x.v).join('\n').slice(0, 3000);
}
function trLog(method, question, status, c) {
  if (!TRAIN_LOG_URL) return;
  try {
    const label = document.getElementById('user-label');
    fetch(TRAIN_LOG_URL, {
      method: 'POST', mode: 'no-cors', keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        token: TRAIN_LOG_TOKEN,
        user: label ? label.textContent.trim() : '',
        role: (typeof currentUserRole !== 'undefined' && currentUserRole) || '',
        method, question: String(question || '').slice(0, 1000), status,
        source: c ? trLabel(c.sheet) + (c.title && c.title !== c.sheet ? ' • ' + c.title : '') : '',
        answer: trPlain(c)
      })
    }).catch(() => { });
  } catch (e) { }
}

function trAddMsg(who, html, scopeTag) {
  const chat = document.getElementById('tr-chat');
  const prev = chat.lastElementChild;
  if (prev && prev.classList.contains('tr-msg') && prev.classList.contains(who)) prev.classList.remove('tail');
  const el = document.createElement('div');
  el.className = 'tr-msg ' + who + ' tail';
  el.innerHTML = (scopeTag ? `<div class="tr-scope-tag">${escHtml(scopeTag)}</div>` : '') + html;
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
  return el;
}
function trTyping(on) {
  const chat = document.getElementById('tr-chat');
  const old = chat.querySelector('.tr-typing');
  if (old) old.remove();
  if (!on) return;
  const el = trAddMsg('bot', '<i></i><i></i><i></i>');
  el.classList.add('tr-typing');
}
function trGreet() {
  const chat = document.getElementById('tr-chat');
  chat.innerHTML = '';
  trAddMsg('bot', 'سلام، چطوری می‌تونم کمکت کنم؟');
}

let trActiveId = null, trSignature = '', trPollTimer = null;
const trOpenKeys = new Set();

function trShort(s, n) { s = String(s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function trItemLabel(c) {
  if (c.q) return trShort(c.q, 70);
  const f = c.fields; if (!f.length) return '';
  let l = f[0].v;
  if (c.kind === 'row' && f.length > 1 && l.length <= 4) l += ' — ' + f[1].v;
  return trShort(l, 70);
}
function trFolderHtml(key, name, body, lvl, count) {
  const open = trOpenKeys.has(key);
  return `<div class="tr-folder lvl${lvl}${open ? ' open' : ''}"><button type="button" class="tr-folder-h" data-key="${escHtml(key)}"><svg class="tr-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 6 9 12 15 18"/></svg><span class="tr-folder-n">${escHtml(name)}</span><small>${faDigits(count)}</small></button><div class="tr-folder-b">${body}</div></div>`;
}
let trTreeSeeded = false;
function trRenderTree() {
  const host = document.getElementById('tr-tree');
  if (!host) return;
  const keepTop = host.scrollTop;
  const bySheet = new Map();
  trainState.chunks.forEach(c => { if (c.isHeader) return; if (!bySheet.has(c.sheet)) bySheet.set(c.sheet, []); bySheet.get(c.sheet).push(c); });
  const item = c => `<button type="button" class="tr-node-item${c.id === trActiveId ? ' on' : ''}" data-id="${c.id}">${escHtml(trItemLabel(c))}</button>`;
  const sheetHtml = (path, sheet, lvl) => {
    const list = bySheet.get(sheet);
    const key = path + '||' + sheet;
    const titles = [...new Set(list.map(c => c.title).filter(Boolean))];
    let body;
    if (titles.length >= 2) {
      body = titles.map(ti => { const sub = list.filter(c => c.title === ti); return trFolderHtml(key + '||' + ti, ti, sub.map(item).join(''), lvl + 1, sub.length); }).join('')
        + list.filter(c => !c.title).map(item).join('');
    } else body = list.map(item).join('');
    return trFolderHtml(key, trLabel(sheet), body, lvl, list.length);
  };
  const countOf = shs => shs.reduce((n, sh) => n + bySheet.get(sh).length, 0);
  const groups = TRAIN_GROUPS.map(g => ({
    name: g.name,
    sheets: g.sheets.map(x => x[0]).filter(sh => bySheet.has(sh)),
    subs: (g.subs || []).map(sg => ({ name: sg.name, sheets: sg.sheets.map(x => x[0]).filter(sh => bySheet.has(sh)) })).filter(sg => sg.sheets.length)
  }));
  const known = new Set(TRAIN_LABELS.keys());
  const rest = [...bySheet.keys()].filter(sh => !known.has(sh));
  if (rest.length) groups.push({ name: 'موضوعات', sheets: rest, subs: [] });
  const shown = groups.filter(g => g.sheets.length || g.subs.length);
  if (!trTreeSeeded && shown.length) { trOpenKeys.add(shown[0].name); trTreeSeeded = true; }
  const html = shown.map(g => {
    const body = g.sheets.map(sh => sheetHtml(g.name, sh, 2)).join('')
      + g.subs.map(sg => trFolderHtml(g.name + '||' + sg.name, sg.name, sg.sheets.map(sh => sheetHtml(g.name + '||' + sg.name, sh, 3)).join(''), 2, countOf(sg.sheets))).join('');
    return trFolderHtml(g.name, g.name, body, 1, countOf(g.sheets) + g.subs.reduce((n, sg) => n + countOf(sg.sheets), 0));
  }).join('');
  host.innerHTML = html || '<div class="tr-empty">موضوعی برای نمایش نیست</div>';
  host.scrollTop = keepTop;
}
function trTreeMsg(msg) {
  const host = document.getElementById('tr-tree');
  if (host && !trainState.loaded) host.innerHTML = `<div class="tr-empty">${escHtml(msg)}</div>`;
}
function trRenderStatus() {
  const up = document.getElementById('tr-updated');
  if (up) up.textContent = trainState.fetchedAt ? new Date(trainState.fetchedAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : '';
  const fail = document.getElementById('tr-fail');
  if (!fail) return;
  if (trainState.loaded && trainState.failed.length) { fail.hidden = false; fail.textContent = 'این برگه‌ها خوانده نشد: ' + trainState.failed.join('، '); } else fail.hidden = true;
}

function trShowChunk(id) {
  const c = trainState.chunks.find(x => x.id === id);
  if (!c) return;
  trActiveId = id;
  document.querySelectorAll('#tr-tree .tr-node-item').forEach(b => b.classList.toggle('on', Number(b.dataset.id) === id));
  trAddMsg('user', escHtml(c.q || trItemLabel(c)));
  trAddMsg('bot', trRenderChunk(c, null));
  trLog('منو', c.q || trItemLabel(c), 'پاسخ داده شد', c);
}

function trApplyData(sheetsData, failed, fetchedAt) {
  const chunks = [], names = [];
  sheetsData.forEach(s => {
    const part = trBuildChunks(s.name, trParseCsv(s.csv), s.links);
    if (part.length) { names.push(s.name); chunks.push(...part); }
  });
  chunks.forEach((c, i) => { c.id = i; });
  trainState.chunks = chunks; trainState.sheets = names; trainState.failed = failed; trainState.fetchedAt = fetchedAt; trainState.loaded = true;
  trIndex(chunks);
  trRenderTree(); trRenderStatus();
}

// امضای یک برگه برای تشخیص تغییر: متن + آدرس لینک‌های داخل سلول‌ها
function trSheetSig(s) { return s.name + '\u0001' + s.csv + '\u0003' + (s.links ? JSON.stringify(s.links) : ''); }
let trSheetList = null, trSheetListAt = 0;
async function trListSheets() {
  if (trSheetList && Date.now() - trSheetListAt < 60000) return trSheetList;   // فهرست برگه‌ها حداکثر هر ۶۰ ثانیه یک‌بار پرسیده می‌شود
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(TRAIN_LOG_URL + '?action=sheets&token=' + encodeURIComponent(TRAIN_LOG_TOKEN) + '&_t=' + Date.now(), { signal: ctl.signal, credentials: 'omit', cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    if (!j || !j.ok || !Array.isArray(j.sheets)) throw new Error((j && j.error) || 'پاسخ نامعتبر از اسکریپت');
    trSheetList = j.sheets; trSheetListAt = Date.now();
    return trSheetList;
  } catch (e) {
    if (trSheetList) return trSheetList;   // اگر قبلاً گرفته بودیم همان را نگه می‌داریم
    throw e;
  } finally { clearTimeout(timer); }
}

async function trFetchAll() {
  let list;
  try { list = await trListSheets(); } catch (e) { return { ok: [], failed: [], firstErr: new Error('فهرست برگه‌ها از اسکریپت گرفته نشد (' + (e.message || e) + ')') }; }
  const res = await Promise.allSettled(list.map(sh => trFetchSheet(sh.name, sh.gid).then(csv => ({ name: sh.name, csv, links: sh.links || null }))));
  const ok = [], failed = []; let firstErr = null;
  res.forEach((r, i) => {
    if (r.status === 'fulfilled') ok.push(r.value);
    else { failed.push(list[i].name); if (!firstErr) firstErr = r.reason; }
  });
  return { ok, failed, firstErr };
}

// هر بار فراخوانی = یک بار بررسی شیت؛ فقط اگر محتوا عوض شده باشد درخت و ایندکس به‌روز می‌شود
async function trLoad() {
  if (trainState.loading) return trainState.loading;
  trainState.loading = (async () => {
    if (!trainState.loaded) {
      let cache = null;
      try { cache = JSON.parse(localStorage.getItem(TRAIN_CACHE_KEY) || 'null'); } catch (e) { }
      if (cache && cache.sheets && cache.sheets.length && Date.now() - (cache.t || 0) < TRAIN_CACHE_TTL) {   // کش قدیمی‌تر از TTL استفاده نمی‌شود
        trSignature = cache.sheets.map(trSheetSig).join('\u0002');
        trApplyData(cache.sheets, cache.failed || [], cache.t);
      } else trTreeMsg('در حال دریافت…');
    }
    const r = await trFetchAll();
    if (!r.ok.length) {
      trTreeMsg('دریافت ناموفق: ' + (r.firstErr ? r.firstErr.message : 'نامشخص'));
      return;
    }
    const sig = r.ok.map(trSheetSig).join('\u0002');
    const now = Date.now();
    if (sig !== trSignature || !trainState.loaded) {
      trSignature = sig;
      trApplyData(r.ok, r.failed, now);
      try { localStorage.setItem(TRAIN_CACHE_KEY, JSON.stringify({ t: now, sheets: r.ok, failed: r.failed })); } catch (e) { }
    } else {
      trainState.fetchedAt = now; trainState.failed = r.failed; trRenderStatus();
    }
  })().finally(() => { trainState.loading = null; });
  return trainState.loading;
}

// دریافت اجباری از شیت: کش پاک می‌شه و منو/ایندکس حتماً دوباره ساخته می‌شن
async function trForceReload(btn) {
  if (btn) btn.classList.add('spin');
  try {
    try { localStorage.removeItem(TRAIN_CACHE_KEY); } catch (e) { }
    if (trainState.loading) { try { await trainState.loading; } catch (e) { } }
    trSignature = '';
    await trLoad();
  } finally { if (btn) btn.classList.remove('spin'); }
}
const TRAIN_POLL_MS = 20000;
function trPanelActive() { const l = document.querySelector('.tr-layout'); return !!l && l.offsetParent !== null && document.visibilityState === 'visible'; }
// یک نمونه‌ی آموزش بین پنل کارشناس / سنتر / سرگروه / سرپرست جابه‌جا می‌شود
function trMount(host) { const l = document.querySelector('.tr-layout'); if (l && host && l.parentElement !== host) host.appendChild(l); }
function trPollStart() {
  if (trPollTimer) return;
  trPollTimer = setInterval(() => { if (trPanelActive()) trLoad(); }, TRAIN_POLL_MS);
  document.addEventListener('visibilitychange', () => { if (trPanelActive()) trLoad(); });
}

// ---- احوال‌پرسی و حرف‌های روزمره (بدون جستجو در شیت) ----
const TR_CHAT_RULES = [
  ['bye', ['خداحافظ', 'خدافظ', 'خدانگهدار', 'بای بای', 'بای', 'شب خوش', 'روز خوش']],
  ['fine', ['ممنون خوبم', 'مرسی خوبم', 'من خوبم', 'خوبم', 'عالیم', 'سلامتم']],
  ['how', ['حال و احوال', 'احوال شما', 'حال شما', 'حالت چطوره', 'حالتون چطوره', 'حالت خوبه', 'حالتون خوبه', 'احوالت', 'احوال', 'چطوری', 'چطورین', 'چطورید', 'خوبی', 'خخوبی', 'خوبین', 'چه خبر', 'چخبر']],
  ['thanks', ['دستتون درد نکنه', 'دستت درد نکنه', 'خسته نباشید', 'خسته نباشی', 'دمت گرم', 'متشکرم', 'ممنون', 'مرسی', 'تشکر', 'سپاس', 'thanks', 'thank you']],
  ['hello', ['سلام علیکم', 'علیک سلام', 'صبح بخیر', 'ظهر بخیر', 'عصر بخیر', 'شب بخیر', 'روز بخیر', 'وقت بخیر', 'سلام', 'درود', 'hello', 'hi', 'hey']],
  ['filler', ['داداش', 'عزیزم', 'ربات', 'بات', 'لطفا', 'ببخشید', 'خب', 'راستی', 'ببین', 'هستی', 'هستید']]
];
const TR_CHAT_RULES_FLAT = TR_CHAT_RULES.flatMap(([k, ps]) => ps.map(p => [k, trWords(p).join(' ')])).sort((a, b) => b[1].length - a[1].length);
// خروجی: null (احوال‌پرسی نبود) | { reply } (فقط حرف روزمره بود) | { rest } (سلام + سوال واقعی؛ فقط بخش سوال جستجو می‌شود)
function trSmallTalk(q) {
  let t = ' ' + trWords(String(q).replace(/(\p{L})\1{2,}/gu, '$1')).join(' ') + ' ';
  const found = {}; let hello = '';
  TR_CHAT_RULES_FLAT.forEach(([k, p]) => {
    const src = ' ' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?= )';
    if (!new RegExp(src).test(t)) return;
    if (k !== 'filler') { found[k] = true; if (k === 'hello' && !hello) hello = p; }
    t = t.replace(new RegExp(src, 'g'), ' ');
  });
  if (!Object.keys(found).length) return null;
  if (t.split(' ').some(w => w && !TR_STOP.has(w))) return { rest: t.trim() };
  const g = ['صبح بخیر', 'ظهر بخیر', 'عصر بخیر', 'شب بخیر', 'روز بخیر', 'وقت بخیر', 'درود'].includes(hello) ? hello : 'سلام';
  const ask = 'هر سوالی درباره‌ی صدور، شرکت‌ها یا خطاها داشتی بپرس.';
  const pre = found.hello ? g + '، ' : '';
  let reply;
  if (found.bye) reply = 'موفق باشی، هر وقت سوالی داشتی اینجا هستم.';
  else if (found.fine) reply = pre + 'خوشحالم. ' + ask;
  else if (found.how) reply = pre + 'ممنون، خوبم. تو چطوری؟ ' + ask;
  else if (found.thanks) reply = 'خواهش می‌کنم. اگه سوال دیگه‌ای داشتی بپرس.';
  else reply = g + '، چطوری می‌تونم کمکت کنم؟';
  return { reply };
}

// ---- وقتی فقط اسم شرکت نوشته شده: به‌جای فرستادن کل متن، موضوع‌ها را برای انتخاب نشان بده ----
const TR_COMPANY_SHEETS = { 'رازی': 'شرکت رازی', 'سینا': 'شرکت سینا', 'تعاون': 'شرکت تعاون' };
function trCompanyOnly(q) {
  const skip = new Set(['شرکت', 'بیمه', 'سهامی', 'ی']);
  const w = trWords(q).filter(x => !skip.has(x) && !TR_STOP.has(x));
  return w.length === 1 && TR_COMPANY_SHEETS[w[0]] ? { name: w[0], sheet: TR_COMPANY_SHEETS[w[0]] } : null;
}
function trCompanyMenu(comp) {
  const list = trainState.chunks.filter(c => c.sheet === comp.sheet && !c.isHeader);
  if (!list.length) return false;
  const titles = [...new Set(list.map(c => c.title).filter(Boolean))];
  const MAX = 14;
  let chips, more;
  if (titles.length >= 2) {
    chips = titles.slice(0, MAX).map(t => `<button type="button" class="tr-chip" data-sheet="${escHtml(comp.sheet)}" data-title="${escHtml(t)}">${escHtml(trShort(t, 40))}</button>`);
    more = titles.length > MAX;
  } else {
    chips = list.slice(0, MAX).map(c => `<button type="button" class="tr-chip" data-id="${c.id}">${escHtml(trItemLabel(c))}</button>`);
    more = list.length > MAX;
  }
  trAddMsg('bot', `<div>درباره‌ی «${escHtml(comp.name)}» دقیقاً چی می‌خوای بدونی؟ یکی از موضوع‌ها رو انتخاب کن یا سوالت رو کامل‌تر بنویس.</div>` +
    `<div class="tr-chips" style="margin-top:8px">${chips.join('')}</div>` +
    (more ? '<div class="tr-alt" style="margin-top:6px">موضوع‌های بیشتر توی منوی کنار صفحه هست.</div>' : ''));
  return true;
}
function trShowTitle(sheet, title) {
  const list = trainState.chunks.filter(c => c.sheet === sheet && c.title === title && !c.isHeader);
  if (!list.length) return;
  trAddMsg('user', escHtml(title));
  trAddMsg('bot', list.map(c => trRenderChunk(c, null)).join('<div style="height:8px"></div>'));
  trLog('منو', title, 'پاسخ داده شد', list[0]);
}

// ============================================================
// سوال‌های شخصی در چت آموزش: اسم/نقش/سنتر/سرگروه و تعداد صدورِ روزها و دوره‌ها
// این جواب‌ها از خود داشبورد (profiles / daily_targets / center_agents / leader_centers) خوانده می‌شود، نه از شیت.
// اگه سوال شخصی نبود، همون مسیر قبلی (جستجو در شیت) اجرا می‌شه.
// ============================================================
const TR_ROLE_FA = { agent: 'کارشناس', leader: 'سرگروه', center: 'سنتر', supervisor: 'سرپرست', admin: 'ادمین' };
const TR_MONTHS_N = JALALI_MONTHS_FA.map(m => trWords(m).join(' '));
const TR_PERSONAL_CACHE = {};
const trSortKey = t => t[0] * 10000 + t[1] * 100 + t[2];
const trFmtDate = t => faDigits(`${t[0]}/${pad2(t[1])}/${pad2(t[2])}`);
function trMyName() { const el = document.getElementById('user-label'); return el ? el.textContent.trim() : ''; }
function trMyRoleKind() { return ['admin', 'center', 'leader', 'supervisor'].includes(currentUserRole) ? currentUserRole : 'agent'; }
function trJalaliShift(days) {
  const [jy, jm, jd] = tehranTodayJalali();
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd).split('-').map(Number);
  const d = new Date(Date.UTC(gy, gm - 1, gd + days));
  return gregorianToJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
function trMonthLen(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  const [gy, gm, gd] = jalaliToGregorian(jy, 12, 30).split('-').map(Number);
  const b = gregorianToJalali(gy, gm, gd);
  return (b[0] === jy && b[1] === 12 && b[2] === 30) ? 30 : 29;
}
// تشخیص بازه‌ی زمانی از متن سوال؛ null یعنی تاریخی ذکر نشده
function trParseRange(q) {
  const t = ' ' + trWords(q).join(' ') + ' ';
  const today = tehranTodayJalali();
  const one = (tt, label) => ({ start: trSortKey(tt), end: trSortKey(tt), label: label || ('روز ' + trFmtDate(tt)), single: true });
  let m;
  // تاریخ کامل: 1405/07/21 (یا میلادی 2026/10/13)
  if ((m = t.match(/ (\d{4}) (\d{1,2}) (\d{1,2}) /))) {
    let y = +m[1], mo = +m[2], d = +m[3];
    if (y > 1700) [y, mo, d] = gregorianToJalali(y, mo, d);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return one([y, mo, d]);
  }
  // «21 مهر» (سال اختیاری)
  for (let i = 0; i < 12; i++) {
    if ((m = t.match(new RegExp(' (\\d{1,2}) ' + TR_MONTHS_N[i] + '(?: (\\d{4}))? ')))) {
      let tt = [m[2] ? +m[2] : today[0], i + 1, +m[1]];
      if (!m[2] && trSortKey(tt) > trSortKey(today)) tt = [tt[0] - 1, tt[1], tt[2]];
      return one(tt);
    }
  }
  if (/ پریروز /.test(t)) { const d = trJalaliShift(-2); return one(d, 'پریروز (' + trFmtDate(d) + ')'); }
  if (/ دیروز /.test(t)) { const d = trJalaliShift(-1); return one(d, 'دیروز (' + trFmtDate(d) + ')'); }
  if (/ امروز /.test(t)) return one(today, 'امروز (' + trFmtDate(today) + ')');
  if ((m = t.match(/ (\d{1,2}) روز (?:پیش|قبل|گذشته) /))) { const d = trJalaliShift(-(+m[1])); return one(d, faDigits(m[1]) + ' روز پیش (' + trFmtDate(d) + ')'); }
  // هفته (از شنبه تا جمعه)
  const wk = / هفته /.test(t);
  if (wk) {
    const [jy, jm, jd] = today;
    const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd).split('-').map(Number);
    const sinceSat = (new Date(Date.UTC(gy, gm - 1, gd)).getUTCDay() + 1) % 7;
    const prev = / (?:پیش|قبل|گذشته) /.test(t);
    const s = trJalaliShift(-sinceSat - (prev ? 7 : 0)), e = prev ? trJalaliShift(-sinceSat - 1) : today;
    return { start: trSortKey(s), end: trSortKey(e), label: (prev ? 'هفته‌ی قبل' : 'این هفته') + ` (${trFmtDate(s)} تا ${trFmtDate(e)})`, single: false };
  }
  // دوره‌ی ۲۱ تا ۲۰ (همان که داشبورد استفاده می‌کند)
  const per = currentPeriodBounds();
  if (/ (?:ماه|دوره) (?:قبل|پیش|گذشته) /.test(t)) {
    const sy = Math.floor(per.startSort / 10000), sm = Math.floor(per.startSort / 100) % 100;
    const py = sm > 1 ? sy : sy - 1, pm = sm > 1 ? sm - 1 : 12;
    const s = [py, pm, 21], e = [sy, sm, 20];
    return { start: trSortKey(s), end: trSortKey(e), label: `دوره‌ی قبل (${trFmtDate(s)} تا ${trFmtDate(e)})`, single: false };
  }
  if (/ (?:این ماه|ماه جاری|دوره جاری|این دوره|دوره) /.test(t)) {
    return { start: per.startSort, end: per.endSort, label: `دوره‌ی جاری (${faDigits(per.startLabel)} تا ${faDigits(per.endLabel)})`, single: false };
  }
  // اسم ماه به‌تنهایی: کل همان ماه تقویمی
  for (let i = 0; i < 12; i++) {
    if (t.includes(' ' + TR_MONTHS_N[i] + ' ')) {
      const y = (i + 1 > today[1]) ? today[0] - 1 : today[0];
      return { start: trSortKey([y, i + 1, 1]), end: trSortKey([y, i + 1, trMonthLen(y, i + 1)]), label: `${JALALI_MONTHS_FA[i]} ${faDigits(y)}`, single: false };
    }
  }
  return null;
}
// آیا سوال درباره‌ی تعداد صدورِ خودِ کاربره؟
function trIsMyIssuanceQ(q) {
  const t = ' ' + trWords(q).join(' ') + ' ';
  const issue = /(صدور|صادر|تارگت|سفارش|بیمه نامه|زدم|زدیم)/.test(t);
  if (!issue) return false;
  if (/ چند (روز|ماه|ساعت|سال|درصد|تومان|تومن|هزار|دقیقه|بار) /.test(t)) return false;
  const countw = / (چند|چندتا|چنتا|چند تا|تعداد|مجموع|جمع|میانگین|بیشترین|کمترین|آمار) /.test(t);
  const personal = / (من|منو|داشتم|زدم|کردم|دارم|داشتیم|هام|ام|ما) /.test(t) || /(صدور|صدورها|تارگت|سفارش|سفارشها)(م|ام|هام) /.test(t);
  return personal && (countw || !!trParseRange(q));
}
async function trMyIssuance(q) {
  const title = 'تعداد صدور من';
  if (!currentUserId) return { title, html: 'برای دیدن آمار صدورت باید وارد حسابت باشی.' };
  const per = currentPeriodBounds();
  const asked = trParseRange(q);
  const rng = asked || { start: per.startSort, end: per.endSort, label: `دوره‌ی جاری (${faDigits(per.startLabel)} تا ${faDigits(per.endLabel)})`, single: false };
  const { data, error } = await supabaseClient.from(TABLE_TARGETS)
    .select('report_date_sort, report_date_jalali, target_count')
    .eq('agent_id', currentUserId).gte('report_date_sort', rng.start).lte('report_date_sort', rng.end)
    .order('report_date_sort', { ascending: true });
  if (error) return { title, html: 'نتونستم آمار صدورت رو از سیستم بخونم، چند لحظه بعد دوباره امتحان کن.' };
  const days = new Map();
  (data || []).forEach(r => { const k = jalaliRowSortKey(r); days.set(k, (days.get(k) || 0) + (Number(r.target_count) || 0)); });
  const keyTxt = k => trFmtDate([Math.floor(k / 10000), Math.floor(k / 100) % 100, k % 100]);
  if (!days.size) {
    const why = trMyRoleKind() === 'agent' ? 'ممکنه اون روز صدوری نداشتی یا هنوز داده‌اش نیومده باشه.' : 'برای نقش تو آمار صدور شخصی ثبت نمی‌شه؛ آمار رو از تب «تعداد صدور» ببین.';
    return { title, html: `برای ${escHtml(rng.label)} چیزی ثبت نشده. ${why}` };
  }
  const total = [...days.values()].reduce((a, b) => a + b, 0);
  if (rng.single) {
    return { title, html: `${escHtml(rng.label)} تعداد <b>${formatNumber(total)}</b> صدور داشتی.` };
  }
  const active = [...days.entries()].filter(([, v]) => v > 0);
  const best = active.length ? active.reduce((a, b) => (b[1] > a[1] ? b : a)) : null;
  const todayKey = trSortKey(tehranTodayJalali());
  let html = '';
  if (!asked && days.has(todayKey)) html += `امروز <b>${formatNumber(days.get(todayKey))}</b> صدور داشتی.<br>`;
  html += `${escHtml(rng.label)}: مجموع <b>${formatNumber(total)}</b> صدور در ${formatNumber(active.length)} روز فعال` +
    (active.length ? ` (میانگین ${formatNumber(total / active.length)} در روز)` : '') + '.';
  if (best) html += `<br>بیشترین صدور: ${keyTxt(best[0])} با ${formatNumber(best[1])} صدور.`;
  if (days.size <= 40) {
    html += `<details class="tr-more"><summary>ریز روزها</summary>${[...days.entries()].map(([k, v]) => `<div class="tr-alt">${keyTxt(k)}: ${formatNumber(v)}</div>`).join('')}</details>`;
  }
  return { title, html };
}
// سنتر و سرگروه کاربر (کش‌شده)
async function trLoadMyOrg() {
  if (TR_PERSONAL_CACHE.uid === currentUserId && TR_PERSONAL_CACHE.org) return TR_PERSONAL_CACHE.org;
  const names = async ids => {
    if (!ids.length) return [];
    const { data } = await supabaseClient.from(TABLE_PROFILES).select('id, full_name').in('id', ids);
    return (data || []).map(p => (p.full_name || '').trim()).filter(Boolean);
  };
  const org = { ok: true, centers: [], leaders: [] };
  try {
    const kind = trMyRoleKind();
    let centerIds = [];
    if (kind === 'agent') {
      const r = await supabaseClient.from(TABLE_CENTER_AGENTS).select('center_id').eq('agent_id', currentUserId);
      if (r.error) throw r.error;
      centerIds = (r.data || []).map(x => x.center_id).filter(Boolean);
    } else if (kind === 'center') centerIds = [currentUserId];
    else if (kind === 'leader') {
      const r = await supabaseClient.from(TABLE_LEADER_CENTERS).select('center_id').eq('leader_id', currentUserId);
      if (r.error) throw r.error;
      centerIds = (r.data || []).map(x => x.center_id).filter(Boolean);
      org.leaders = [trMyName()];
    }
    org.centers = await names(centerIds);
    if ((kind === 'agent' || kind === 'center') && centerIds.length) {
      const r = await supabaseClient.from(TABLE_LEADER_CENTERS).select('leader_id').in('center_id', centerIds);
      if (r.error) throw r.error;
      org.leaders = await names([...new Set((r.data || []).map(x => x.leader_id).filter(Boolean))]);
    }
  } catch (e) { org.ok = false; }
  TR_PERSONAL_CACHE.uid = currentUserId; TR_PERSONAL_CACHE.org = org;
  return org;
}
const trJoin = a => a.map(x => `<b>${escHtml(x)}</b>`).join(' و ');
// خروجی: null (سوال شخصی نبود) | { title, html }
async function trPersonal(q) {
  const raw = String(q || '').trim();
  const t = ' ' + trWords(raw).join(' ') + ' ';
  const has = re => re.test(t);
  const name = trMyName(), role = TR_ROLE_FA[currentUserRole] || TR_ROLE_FA.agent;
  // فقط ایموجی / علامت
  if (raw && !/[\p{L}\p{N}]/u.test(raw)) {
    return { title: 'گپ', html: /^[.\s،؟?!…]+$/.test(raw) ? 'بپرس، گوش می‌دم.' : '😊 هر سوالی داشتی بپرس.' };
  }
  // درباره‌ی خود ربات
  if (has(/ (اسمت|نامت|اسم تو|نام تو|کی هستی|هوش مصنوعی هستی|ربات هستی|معرفی خودت|خودتو معرفی) /)) {
    return { title: 'معرفی ربات', html: 'من دستیار آموزش همین پنلم. جواب قوانین شرکت‌ها، انتقال تخفیف، سررسید و خطاها رو از شیت «قوانین ثالث» پیدا می‌کنم و درباره‌ی خودت (اسم، سنتر، سرگروه، تعداد صدور) از اطلاعات داشبوردت جواب می‌دم.' };
  }
  // چی بلدی؟
  if (has(/ (چی بلدی|چه کاری بلدی|چیکار می کنی|چیکار میکنی|چه کارایی|چه کارهایی|پس چی می دونی|پس چی میدونی|چی می دونی|چی میدونی|راهنما) /)) {
    return { title: 'راهنما', html: 'می‌تونی بپرسی:<br>• قوانین صدور رازی، سینا و تعاون (صندوق، سررسید، مالک و بیمه‌گذار، اتباع و …)<br>• انتقال تخفیف و کاربری‌ها<br>• خطاها و ارورها و مجوزی‌ها<br>• اسم و نقش خودت، سنترت، سرگروهت<br>• «دیروز چندتا صدور داشتم؟»، «۲۱ مهر چند صدور داشتم؟»، «این ماه چندتا زدم؟»' };
  }
  // اسم من
  if (has(/ (اسمم|نامم|اسم من|نام من|اسم منو|من کیم|من کی هستم|من کی ام|منو می شناسی|منو میشناسی) /)) {
    if (!name) return null;
    const remember = has(/ (یادت باشه|یادت نره|یاد بگیر|یاد بگیری) /);
    return { title: 'اسم من', html: (remember ? 'لازم نیست یادم بسپاری، اسمت رو خودم از پروفایل داشبورد می‌خونم. ' : '') + `طبق پروفایلت اسمت <b>${escHtml(name)}</b> و نقشت <b>${escHtml(role)}</b> هست.` };
  }
  if (has(/ (نقش من|نقشم|سمتم|سمت من) /)) {
    return { title: 'نقش من', html: `نقشت توی داشبورد <b>${escHtml(role)}</b> هست.` };
  }
  // سرگروه / سنتر
  const askLeader = has(/ (سر ?گروه(م| من| ما)|لیدر(م| من)) /);
  const askCenter = has(/ (سنترم|سنتر من|سنتر ما|مرکزم|مرکز من) /);
  if (askLeader || askCenter) {
    const kind = trMyRoleKind();
    if (kind === 'supervisor' || kind === 'admin') return { title: 'سنتر و سرگروه', html: 'برای نقش تو سنتر یا سرگروه مشخصی تعریف نشده.' };
    const org = await trLoadMyOrg();
    if (!org.ok) return { title: 'سنتر و سرگروه', html: 'نتونستم اطلاعات سنتر و سرگروهت رو از سیستم بخونم، بعداً دوباره امتحان کن.' };
    if (askLeader) {
      if (kind === 'leader') return { title: 'سرگروه من', html: `خودت سرگروهی: <b>${escHtml(name)}</b>.` };
      return { title: 'سرگروه من', html: org.leaders.length ? `سرگروهت ${trJoin(org.leaders)} هست.` : 'توی سیستم سرگروهی برات ثبت نشده، از سرپرست بپرس.' };
    }
    if (kind === 'center') return { title: 'سنتر من', html: `سنتر تو <b>${escHtml(name)}</b> هست.` };
    return { title: 'سنتر من', html: org.centers.length ? `${org.centers.length > 1 ? 'سنترهات' : 'سنترت'} ${trJoin(org.centers)} هست.` : 'توی سیستم سنتری برات ثبت نشده، از سرگروهت بپرس.' };
  }
  // تعداد صدور خودم
  if (trIsMyIssuanceQ(raw)) return await trMyIssuance(raw);
  return null;
}

// پیام‌های خطای سیستم یه کدِ متغیر دارن («… - کد داخلی بیمه نامه 10431888») که هر بار عوض می‌شه و تو شیت نیست؛
// قبل از جستجو پیشوند «آیتم جدید :»، برچسب+کد و هر عدد ۵ رقمی یا بیشتر حذف می‌شه تا فقط متن ثابتِ خطا جستجو بشه.
// اگه بعد از پاک‌سازی چیزی از سوال نمونه، همون سوالِ اصلی جستجو می‌شه. (عددهای کوتاه مثل «کد صندوق 1395» دست نمی‌خورن.)
function trCleanQuery(q) {
  const n = trNorm(q);
  const cleaned = n
    .replace(/^\s*[آا]?ی?ت?م\s*جدید\s*[:\-–—]?\s*/, '')
    .replace(/(?:\s*[-–—،,:]\s*)?(?:کد|شماره|شناسه)(?:\s+[^\d\s:\-–—]+){0,5}\s*[:#]?\s*\d{5,}/g, ' ')
    .replace(/\d{5,}/g, ' ')
    .replace(/\s*[-–—:،,]+\s*$/, '')
    .replace(/\s+/g, ' ').trim();
  return trTokens(cleaned).length ? cleaned : q;
}

async function trAsk(q) {
  q = String(q || '').trim();
  if (!q) return;
  trAddMsg('user', escHtml(q));
  trTyping(true);
  const st = trSmallTalk(q);
  const t0 = Date.now();
  // سوال‌های شخصی (اسم، سنتر، سرگروه، تعداد صدور خودش) قبل از جستجو در شیت از روی داده‌ی داشبورد جواب داده می‌شن
  let pr = null;
  if (!(st && st.reply)) { try { pr = await trPersonal(st && st.rest ? st.rest : q); } catch (e) { pr = null; } }
  if (!pr && !(st && st.reply)) {
    if (!trainState.loaded) await trLoad();
    // اگر آخرین دریافت شیت از چند ثانیه پیش است، قبل از جواب دادن یک بار دیگر بگیر تا حذف/ویرایش‌های لحظه‌ی قبل هم اعمال شود
    else if (Date.now() - trainState.fetchedAt > 8000) { try { await Promise.race([trLoad(), new Promise(r => setTimeout(r, 6000))]); } catch (e) { } }
  }
  const wait = 500 - (Date.now() - t0);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  trTyping(false);
  if (st && st.reply) { trAddMsg('bot', escHtml(st.reply)); trLog('سوال', q, 'احوال‌پرسی', null); return; }
  if (pr) {
    trAddMsg('bot', pr.html);
    const plain = pr.html.replace(/<\/(div|summary)>|<br>/g, '\n').replace(/<[^>]+>/g, '').trim();
    trLog('سوال', q, 'پاسخ داده شد', { sheet: 'داشبورد', title: pr.title, fields: [{ k: '', v: plain }] });
    return;
  }
  if (!trainState.loaded) { trAddMsg('bot', 'هنوز داده‌ها از شیت نیامده. اینترنت را چک کن و چند لحظه بعد دوباره امتحان کن.'); return; }
  const qs = trCleanQuery(st && st.rest ? st.rest : q);   // اگه اول جمله سلام بود، فقط بقیه‌ی جمله جستجو می‌شه؛ کدهای متغیرِ پیام خطا هم حذف می‌شن
  const comp = trCompanyOnly(qs);
  if (comp && trCompanyMenu(comp)) { trLog('سوال', q, 'انتخاب موضوع', null); return; }
  const res = trSearch(qs, '__all');
  if (!res.length || res[0].score < 1) {
    trAddMsg('bot', 'متاسفانه منم این رو نمی‌دونم، منم باید برم یاد بگیرمش. فعلاً از سرگروه بپرس.');
    trLog('سوال', q, 'نامشخص', null);
    return;
  }
  const top = res[0].c;
  // جواب خیلی کوتاه («خیر.») بدون دیدن سوالِ مربوطه گمراه‌کننده است؛ اگه سوال دقیقاً یکی نبود، سوال نزدیک رو هم نشان بده
  const exact = top.q != null && top.qKey === trWords(qs).filter(w => !TR_STOP.has(w)).join(' ');
  const near = (top.q != null && !exact && trPlain(top).length <= 15) ? `<div class="tr-alt" style="margin-bottom:4px">نزدیک‌ترین سوال: «${escHtml(top.q)}»</div>` : '';
  const ageMs = Date.now() - trainState.fetchedAt;
  // کلمه‌ای از سوال که تو هیچ جای شیت نیست (مثلاً اسم شرکتی که تو شیت نداریم) ولی بقیه‌ی کلمه‌ها به یه رکورد خوردن:
  // جواب ممکنه مربوط به چیز دیگه‌ای باشه، پس صریح هشدار می‌دیم.
  const stemWord = {}; trWords(qs).forEach(w => { stemWord[trStem(w)] = w; });
  const unknownWords = (res[0].miss || []).filter(x => x.length >= 3 && !trainState.idf[x]).map(x => stemWord[x] || x);
  const missNote = unknownWords.length ? `<div class="tr-alt" style="margin-top:6px">⚠ «${escHtml(unknownWords.join('، '))}» تو شیت پیدا نشد؛ این جواب ممکنه مربوط به سوالت نباشه. اگه مطمئن نیستی از سرگروه بپرس.</div>` : '';
  const staleNote = ageMs > 90000 ? `<div class="tr-alt" style="margin-top:6px">⚠ نسخه‌ی تازه‌ی شیت گرفته نشد؛ این جواب از نسخه‌ی ${faDigits(Math.max(1, Math.round(ageMs / 60000)))} دقیقه پیش است.</div>` : '';
  trAddMsg('bot', near + trRenderChunk(top, trTokens(qs), trIsYesNo(qs)) + missNote + staleNote);
  trLog('سوال', q, 'پاسخ داده شد', top);
}

function trBind() {
  if (trainState.bound) return;
  trainState.bound = true;
  const input = document.getElementById('tr-q');
  const send = () => { const v = input.value; input.value = ''; trAsk(v); };
  document.getElementById('tr-send').addEventListener('click', send);
  const rf = document.getElementById('tr-refresh');
  if (rf) rf.addEventListener('click', () => trForceReload(rf));
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); send(); } });
  document.getElementById('tr-chat').addEventListener('click', e => {
    const b = e.target.closest('.tr-chip');
    if (!b) return;
    if (b.dataset.id) trShowChunk(Number(b.dataset.id));
    else if (b.dataset.title) trShowTitle(b.dataset.sheet, b.dataset.title);
  });
  document.getElementById('tr-tree').addEventListener('click', e => {
    const h = e.target.closest('.tr-folder-h');
    if (h) {
      const key = h.dataset.key, box = h.parentElement;
      if (trOpenKeys.has(key)) trOpenKeys.delete(key); else trOpenKeys.add(key);
      box.classList.toggle('open', trOpenKeys.has(key));
      return;
    }
    const it = e.target.closest('.tr-node-item');
    if (it) trShowChunk(Number(it.dataset.id));
  });
  trPollStart();
}

function trainingOpen() {
  trBind();
  if (!document.getElementById('tr-chat').children.length) trGreet();
  trLoad();
}

let currentUserId = null;
let currentPeriodKey = null;

const TICKET_BONUS_TIERS = [
  { tickets: 300,  amount: 10000000 },
  { tickets: 450,  amount: 25000000 },
  { tickets: 600,  amount: 35000000 },
  { tickets: 800,  amount: 45000000 },
  { tickets: 1100, amount: 60000000 },
];

const TICKET_BONUS_TIERS_BODY = [
  { tickets: 300,  amount: 10000000 },
  { tickets: 450,  amount: 25000000 },
  { tickets: 600,  amount: 35000000 },
  { tickets: 800,  amount: 45000000 },
  { tickets: 1100, amount: 60000000 },
];

function tierTableForInsureType(insureType) {
  return insureType === 'بدنه' ? TICKET_BONUS_TIERS_BODY : TICKET_BONUS_TIERS;
}

function ticketBonusForTotal(ticketTotal, tiers = TICKET_BONUS_TIERS) {
  let reached = null;
  for (const tier of tiers) {
    if (ticketTotal >= tier.tickets) reached = tier;
  }
  return reached;
}

function nextTicketBonusTier(ticketTotal, tiers = TICKET_BONUS_TIERS) {
  for (const tier of tiers) {
    if (ticketTotal < tier.tickets) return tier;
  }
  return null;
}
let teamBugsFlat = [];
let lastBugsKeys = [];
let lastRenderedBugsKeysStr = '';

function bugKey(r) {
  return `${r.check_date_sort}_${r.order_number}_${r.kind_of_bug}`;
}

function isBugsTabActive() {
  const panel = document.getElementById('panel-bugs');
  return !!(panel && panel.classList.contains('active'));
}

function bugsSeenStorageKey() {
  return `bugs_seen_${currentUserId || 'guest'}`;
}

function markBugsSeen(keys) {
  try { localStorage.setItem(bugsSeenStorageKey(), JSON.stringify(keys || [])); } catch (e) { }
  document.querySelectorAll('.bugs-dot').forEach(dot => { dot.style.display = 'none'; });
}

function updateBugsNotification(currentKeys) {
  lastBugsKeys = currentKeys;
  let stored = null;
  try {
    const raw = localStorage.getItem(bugsSeenStorageKey());
    stored = raw ? JSON.parse(raw) : null;
  } catch (e) { stored = null; }

  if (isBugsTabActive()) {
    markBugsSeen(currentKeys);
    return;
  }

  if (stored === null) {
    markBugsSeen(currentKeys);
    return;
  }

  const hasNew = currentKeys.some(k => !stored.includes(k));
  document.querySelectorAll('.bugs-dot').forEach(dot => { dot.style.display = hasNew ? 'inline-block' : 'none'; });
}

// حداقل فاصله‌ی دو بار دریافت خطاها: ۱ ساعت (برای کم‌کردن حجم درخواست‌ها).
// ورود اولیه و رفرش دستی (force) همیشه دریافت می‌کنند.
const BUGS_MIN_INTERVAL_MS = 60 * 60 * 1000;
let bugsLastFetchAt = 0;
let bugsLastFetchUser = null;
async function loadBugs(userId, force) {
  if (window.__bugsDisabled) return;      // جدول bug_reports وجود نداره → تو همین نشست دیگه درخواست نده
  if (!force && bugsLastFetchUser === userId && Date.now() - bugsLastFetchAt < BUGS_MIN_INTERVAL_MS) return;
  bugsLastFetchAt = Date.now();
  bugsLastFetchUser = userId;
  const container = document.getElementById('bugs-list');
  const { data, error } = await supabaseClient
    .from(TABLE_BUGS)
    .select('*')
    .eq('user_id', userId)
    .order('check_date_sort', { ascending: false });

  if (error) {
    if ((e => !!e && (e.code === 'PGRST205' || e.code === 'PGRST202' || e.status === 404 || /schema cache|does not exist|could not find/i.test(e.message || '')))(error)) markBugsOff();
    if (!lastRenderedBugsKeysStr) {
      container.innerHTML = `<div class="empty-state">خطا در دریافت اطلاعات: ${escHtml(error.message)}</div>`;
    }
    return;
  }
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="empty-state">خطایی برای شما ثبت نشده است</div>';
    updateBugsNotification([]);
    lastRenderedBugsKeysStr = '[]';
    return;
  }

  const keys = data.map(bugKey);
  const keysStr = JSON.stringify(keys);

  if (keysStr !== lastRenderedBugsKeysStr) {
    container.innerHTML = data.map(r => `
      <div class="bug-item">
        <div class="bug-top">
          <span class="bug-kind">یک خطا برای شما ثبت شده</span>
          <span class="bug-date">${toJalaliDisplay(r.check_date_jalali)}</span>
        </div>
        <div class="bug-contact-note">جهت بررسی به سرگروهت پیام بده</div>
      </div>
    `).join('');
    lastRenderedBugsKeysStr = keysStr;
  }

  updateBugsNotification(keys);
}

(async () => {
  const done = () => document.documentElement.classList.remove('auth-pending');
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) enterApp(session.user).catch(done);
    else done();                       // نشست نداریم → فرم لاگین نشون داده بشه
  } catch (e) { done(); }
})();

setInterval(() => {
  if (currentUserId && document.visibilityState === 'visible') {
    loadBugs(currentUserId);
  }
}, BUGS_MIN_INTERVAL_MS);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentUserId) {
    loadBugs(currentUserId);
  }
});

// رندر بی‌صدا: وقتی رفرش خودکار لیست‌ها رو دوباره می‌سازه، انیمیشن ورود کارت‌ها دوباره پخش نشه
window.__silentRender = 0;
window.silentRun = async function (fn) {
  window.__silentRender++;
  try { return await fn(); }
  finally { setTimeout(function () { window.__silentRender = Math.max(0, window.__silentRender - 1); }, 700); }
};

(function () {
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var revealSelector = [
    '.summary-card', '.list-card', '.admin-group-card', '.admin-login-chart-card',
    '.ticket-primary-card', '.ticket-hero-card', '.ticket-report-item',
    '.row-item', '.bug-item', '.team-item', '.leader-item', '.last-update-card'
  ].join(',');

  if (reduceMotion) {
    window.refreshGlassReveals = function () {};
    return;
  }

  var enterBatchCounter = 0;
  var enterBatchResetTimer = null;

  var REVEAL_MARGIN = 24;

  function revealNow(el) {
    el.style.transitionDelay = '0ms';
    el.classList.add('glass-in');
  }

  function isRoughlyInViewport(el) {
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    var vh = window.innerHeight || document.documentElement.clientHeight || 0;
    return rect.top < (vh - REVEAL_MARGIN) && rect.bottom > REVEAL_MARGIN;
  }

  function forceCheck(root) {
    var scope = (root && root.querySelectorAll) ? root : document;
    var nodes = scope.querySelectorAll('.glass-reveal:not(.glass-in)');
    nodes.forEach(function (el) {
      if (isRoughlyInViewport(el)) revealNow(el);
    });
    if (scope.matches && scope.matches('.glass-reveal:not(.glass-in)') && isRoughlyInViewport(scope)) {
      revealNow(scope);
    }
  }

  window.refreshGlassReveals = function (root) {
    requestAnimationFrame(function () { forceCheck(root); });
    setTimeout(function () { forceCheck(root); }, 320);
  };

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var el = entry.target;

      if (entry.isIntersecting) {
        var delay = (enterBatchCounter % 6) * 25;
        enterBatchCounter++;
        clearTimeout(enterBatchResetTimer);
        enterBatchResetTimer = setTimeout(function () { enterBatchCounter = 0; }, 180);

        el.style.transitionDelay = delay + 'ms';
        requestAnimationFrame(function () {
          el.classList.add('glass-in');
          setTimeout(function () { el.style.transitionDelay = ''; }, 700);
        });
        // یک‌بار نمایش؛ دیگه با هر اسکرول کلاس برداشته/گذاشته نشه (باعث کندی و پرش می‌شد)
        io.unobserve(el);
      } else if (!el.classList.contains('glass-in')) {
        var exitedAbove = entry.boundingClientRect.top < 0;
        el.style.setProperty('--reveal-offset', exitedAbove ? '-38px' : '38px');
      }
    });
  }, { threshold: 0, rootMargin: '0px 0px -' + REVEAL_MARGIN + 'px 0px' });

  function prepareAndObserve(el) {
    if (el.dataset.glassObserved) return;
    el.dataset.glassObserved = '1';
    if (window.__silentRender > 0) { el.classList.add('glass-reveal', 'glass-in'); return; }
    el.classList.add('glass-reveal');
    io.observe(el);
    requestAnimationFrame(function () {
      if (!el.classList.contains('glass-in') && isRoughlyInViewport(el)) revealNow(el);
    });
  }

  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll(revealSelector).forEach(prepareAndObserve);
    if (root.matches && root.matches(revealSelector)) prepareAndObserve(root);
  }

  scan(document);

  var moQueued = false, moRoots = [];
  var mo = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      m.addedNodes.forEach(function (node) {
        if (node.nodeType === 1) moRoots.push(node);
      });
    });
    if (moQueued) return;
    moQueued = true;
    requestAnimationFrame(function () {
      moQueued = false;
      var roots = moRoots; moRoots = [];
      roots.forEach(function (n) { if (n.isConnected) scan(n); });
      forceCheck(document);
    });
  });
  mo.observe(document.body, { childList: true, subtree: true });
})();

(function () {
  var accentBar = document.querySelector('.header-accent-bar');
  var updBar = document.getElementById('last-update-bar');
  if (!accentBar) return;

  var ticking = false;

  function onScroll() {
    var currentY = window.scrollY || window.pageYOffset || 0;

    // هیسترزیس: اینجوری نزدیک مرز تند تند باز و بسته نمیشه
    if (currentY <= 4) {
      accentBar.classList.remove('is-compact');
      if (updBar) updBar.classList.remove('is-faded');
    } else if (currentY > 24) {
      accentBar.classList.add('is-compact');
      if (updBar) updBar.classList.add('is-faded');
    }

    ticking = false;
  }

  window.addEventListener('scroll', function () {
    if (!ticking) {
      requestAnimationFrame(onScroll);
      ticking = true;
    }
  }, { passive: true });
})();
