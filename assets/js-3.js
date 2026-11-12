// ============================================================
// تب «مدیریت کاربران» (افزودن سنتر / افزودن کاربر / لیست کشویی کاربران هر سنتر) برای سرگروه و سرپرست
//  - سرگروه: سنتر جدید (خودکار به خودش اساین می‌شود) و کارشناس به سنترهای خودش اضافه می‌کند و فعال/غیرفعال می‌کند
//  - سرپرست: همین‌ها برای همه‌ی سنترها + تعیین سرگروه هر سنتر
// همه‌ی داده‌ها در جدول‌های Supabase ذخیره می‌شود (profiles / leader_centers / center_agents)
// و عملیات از طریق Edge Function «leader-users» انجام می‌شود (ساخت کاربر Auth فقط با service role ممکن است).
// ============================================================
const UM = { host: null, centers: [], agents: [], leaders: [], q: '', open: new Set() };
const umEsc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const umIsSup = () => currentUserRole === 'supervisor';
// ---- دسترسی‌های نقش‌ها (سرپرست همیشه همه‌چیز را دارد؛ سرگروه طبق تنظیمات تب «تنظیمات» سرپرست) ----
const UM_PERM_DEFS = [['delete_agent', 'حذف کامل کاربر (کارشناس)'], ['rename_agent', 'تغییر نام کاربر (کارشناس)'], ['rename_center', 'تغییر نام سنتر']];
const UM_PERM_DEFAULT = { leader: { delete_agent: true, rename_agent: true, rename_center: true } };
function umPermsMerge(d) {
  const out = { leader: Object.assign({}, UM_PERM_DEFAULT.leader) };
  const l = d && d.leader;
  if (l && typeof l === 'object') UM_PERM_DEFS.forEach(([k]) => { if (typeof l[k] === 'boolean') out.leader[k] = l[k]; });
  return out;
}
async function umLoadPerms() {
  try {
    const r = await supabaseClient.rpc('role_permissions_get');
    if (r.error) throw r.error;
    UM.perms = umPermsMerge(r.data);
  } catch (e) { if (!UM.perms) UM.perms = umPermsMerge(null); }
}
function umCan(action) {
  if (umIsSup()) return true;
  const p = (UM.perms || UM_PERM_DEFAULT)[currentUserRole];
  return !!(p && p[action]);
}
function umToast(m) {
  const t = document.createElement('div'); t.className = 'kb-toast'; t.textContent = m; t.onclick = () => t.remove();
  document.body.appendChild(t); setTimeout(() => t.remove(), 6000);
}

function usersOpen(host) {
  if (!host) return;
  UM.host = host;
  if (!host.dataset.umInit) {
    host.dataset.umInit = '1';
    host.innerHTML = `
      <div class="um-bar">
        <div class="um-btns">
          <button class="um-btn" id="um-add" type="button">➕ افزودن کاربر</button>
          <button class="um-btn ghost" id="um-add-center" type="button">🏢 افزودن سنتر</button>
          <input class="um-search" id="um-search" type="search" placeholder="جستجو…" title="جستجوی نام کارشناس / نام کاربری / سنتر / سرگروه" autocomplete="off">
        </div>
      </div>
      <div id="um-list"></div>`;
    host.querySelector('#um-add').onclick = umAddModal;
    host.querySelector('#um-add-center').onclick = umCenterModal;
    let umT; host.querySelector('#um-search').addEventListener('input', e => { const v = e.target.value.trim(); clearTimeout(umT); umT = setTimeout(() => { UM.q = v; umRender(); }, 150); });
    const lst = host.querySelector('#um-list');
    lst.addEventListener('click', umListClick);
    lst.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-um-head]')) { e.preventDefault(); umListClick(e); } });
  }
  if (UM.loaded) umRender();
  umLoad();
}

async function umCall(body, fn) {
  const { data, error } = await supabaseClient.functions.invoke(fn || 'leader-users', { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (_) {}
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

async function umLoad() {
  const list = UM.host.querySelector('#um-list');
  if (!UM.loaded) list.innerHTML = '<div class="loading-state">در حال بارگذاری...</div>';
  try {
    const [d] = await Promise.all([umCall({ action: 'list' }), umLoadPerms()]);
    UM.loaded = true;
    UM.leaders = (d.leaders || []).map(l => ({ id: l.id, name: l.full_name || '—' })).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    UM.centers = (d.centers || []).map(c => ({ id: c.id, name: c.full_name || '—', leaderIds: c.leader_ids || [] })).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    UM.agents = d.agents || [];
    try {   // وضعیت فعال/غیرفعال سنترها
      const cs = await supabaseClient.from('profiles').select('id, status').eq('role', 'center').limit(2000);
      UM.cstatus = {}; (cs.data || []).forEach(x => { UM.cstatus[x.id] = x.status; });
    } catch (_) { UM.cstatus = UM.cstatus || {}; }
    umRender();
  } catch (e) {
    if (!UM.loaded) list.innerHTML = '<div class="empty-state">خطا در دریافت اطلاعات: ' + umEsc(e.message) + '</div>';
  }
}

const umLeaderNames = (c) => (c.leaderIds || []).map(id => (UM.leaders.find(l => l.id === id) || {}).name).filter(Boolean);

function umRender() {
  const list = UM.host.querySelector('#um-list');
  if (!UM.centers.length) {
    list.innerHTML = '<div class="empty-state">' + (umIsSup() ? 'هنوز سنتری تعریف نشده است' : 'هنوز سنتری به شما اساین نشده است؛ با «افزودن سنتر» یک سنتر بسازید یا از سرپرست بخواهید سنتر را به شما اساین کند') + '</div>';
    return;
  }
  const q = UM.q.toLowerCase();
  const byCenter = new Map();
  for (const a of UM.agents) { let arr = byCenter.get(a.center_id); if (!arr) byCenter.set(a.center_id, arr = []); arr.push(a); }
  const html = UM.centers.map(c => {
    const all = byCenter.get(c.id) || [];
    const lnames = umLeaderNames(c);
    const centerHit = q && (c.name.toLowerCase().includes(q) || lnames.some(n => n.toLowerCase().includes(q)));
    const ags = all.filter(a => !q || centerHit || String(a.full_name || '').toLowerCase().includes(q) || String(a.backoffice_id || '').toLowerCase().includes(q))
      .sort((a, b) => (a.status === 'disabled') - (b.status === 'disabled') || String(a.full_name).localeCompare(String(b.full_name), 'fa'));
    if (q && !ags.length && !centerHit) return '';
    const active = all.filter(a => a.status !== 'disabled').length;
    const rows = ags.map(a => {
      const off = a.status === 'disabled';
      return `<div class="um-row${off ? ' off' : ''}">
        <span class="um-name">${umEsc(a.full_name || '—')}</span>
        <span class="um-user">${umEsc(a.backoffice_id || '')}</span>
        <span class="um-badge">${off ? 'غیرفعال' : 'فعال'}</span>
        <button class="um-btn ghost sm" type="button" data-um-pass="${a.id}">🔑 تغییر رمز</button>
        <button class="um-btn sm ${off ? '' : 'ghost'}" type="button" data-um-toggle="${a.id}" data-um-to="${off ? 'active' : 'disabled'}">${off ? 'فعال کردن' : 'غیرفعال کردن'}</button>
        ${umCan('rename_agent') ? `<button class="um-btn ghost sm" type="button" data-um-rename="${a.id}">✏️ تغییر نام</button>` : ''}
        ${umCan('delete_agent') ? `<button class="um-btn ghost sm danger" type="button" data-um-del="${a.id}">حذف کامل</button>` : ''}
      </div>`;
    }).join('') || '<div class="empty-state">نیرویی در این سنتر نیست</div>';
    const lead = lnames.length ? `<div class="um-lead">سرگروه: ${lnames.map(umEsc).join('، ')}</div>` : `<div class="um-lead none">سرگروه: تعیین نشده</div>`;
    const open = UM.open.has(c.id) || (q && ags.length);
    const cOff = (UM.cstatus || {})[c.id] === 'disabled';
    return `<div class="um-center list-card${open ? ' open' : ''}${cOff ? ' off' : ''}" data-um-c="${c.id}"><div class="um-center-h" data-um-head="${c.id}" role="button" tabindex="0" aria-expanded="${open ? 'true' : 'false'}">
        <div class="um-cwrap"><span class="um-caret"></span><div><div class="um-cname">${umEsc(c.name)}${cOff ? ' <span class="um-badge">غیرفعال</span>' : ''}</div>${lead}</div></div>
        <div class="um-ch-end"><small>${faDigits(active)} فعال از ${faDigits(all.length)}</small>
        <button class="um-btn sm ${cOff ? '' : 'ghost'}" type="button" data-um-ctoggle="${c.id}" data-um-to="${cOff ? 'active' : 'disabled'}">${cOff ? 'فعال کردن سنتر' : 'غیرفعال کردن سنتر'}</button>
        <button class="um-btn ghost sm" type="button" data-um-pass="${c.id}" data-um-kind="center">🔑 رمز سنتر</button>
        ${umCan('rename_center') ? `<button class="um-btn ghost sm" type="button" data-um-rename="${c.id}" data-um-kind="center">✏️ تغییر نام</button>` : ''}
        ${umIsSup() ? `<button class="um-btn ghost sm" type="button" data-um-lead="${c.id}">تغییر سرگروه</button>` : ''}</div>
      </div><div class="um-body">${rows}</div></div>`;
  }).join('');
  list.innerHTML = html || '<div class="empty-state">موردی پیدا نشد</div>';
}

function umListClick(e) {
  const t = e.target.closest('[data-um-ctoggle],[data-um-toggle],[data-um-del],[data-um-lead],[data-um-pass],[data-um-rename],[data-um-head]');
  if (!t) return;
  if (t.dataset.umPass) return umPassModal(t.dataset.umPass, t.dataset.umKind === 'center');
  if (t.dataset.umRename) return umRenameModal(t.dataset.umRename, t.dataset.umKind === 'center');
  if (t.dataset.umCtoggle) return umToggleCenter(t.dataset.umCtoggle, t.dataset.umTo, t);
  if (t.dataset.umToggle) return umToggle(t.dataset.umToggle, t.dataset.umTo, t);
  if (t.dataset.umDel) return umDelete(t.dataset.umDel, t);
  if (t.dataset.umLead) return umLeadersModal(t.dataset.umLead);
  const id = t.dataset.umHead, card = t.closest('.um-center');
  if (UM.open.has(id)) UM.open.delete(id); else UM.open.add(id);
  card.classList.toggle('open', UM.open.has(id));
  t.setAttribute('aria-expanded', UM.open.has(id) ? 'true' : 'false');
}

async function umToggle(id, to, btn) {
  const name = (UM.agents.find(a => a.id === id) || {}).full_name || '';
  if (!confirm(to === 'disabled' ? `«${name}» غیرفعال شود؟` : `«${name}» فعال شود؟`)) return;
  btn.disabled = true;
  try { await umCall({ action: 'set_status', agent_id: id, status: to }); umToast(to === 'disabled' ? 'کاربر غیرفعال شد' : 'کاربر فعال شد'); await umLoad(); }
  catch (e) { btn.disabled = false; umToast('انجام نشد: ' + e.message); }
}

// فعال / غیرفعال کردن سنتر (Edge Function: center-status)
async function umSetCenterStatus(id, to) { return umCall({ center_id: id, status: to }, 'center-status'); }
async function umToggleCenter(id, to, btn) {
  const name = ((UM.centers || []).find(c => c.id === id) || {}).name || '';
  if (!confirm(to === 'disabled'
    ? `سنتر «${name}» غیرفعال شود؟\n\nتا وقتی دوباره فعال نشود در تب صدور نمایش داده نمی‌شود؛ ولی اگر در بازه‌ی گزارش صدوری داشته باشد در خروجی حقوق می‌آید.`
    : `سنتر «${name}» فعال شود؟`)) return;
  btn.disabled = true;
  try { await umSetCenterStatus(id, to); umToast(to === 'disabled' ? 'سنتر غیرفعال شد' : 'سنتر فعال شد'); await umLoad(); }
  catch (e) { btn.disabled = false; umToast('انجام نشد: ' + e.message); }
}

async function umDelete(id, btn) {
  const a = UM.agents.find(x => x.id === id) || {};
  if (!confirm(`«${a.full_name || ''}» برای همیشه حذف شود؟\n\nاکانت، پروفایل و داده‌های تارگت/خطا/لاگین این کاربر از سوپابیس پاک می‌شود و قابل بازگشت نیست.`)) return;
  btn.disabled = true;
  try { await umCall({ action: 'delete_agent', agent_id: id }); umToast('کاربر کامل حذف شد'); await umLoad(); }
  catch (e) { btn.disabled = false; umToast('حذف نشد: ' + e.message); }
}

function umRenameModal(id, isCenter) {
  const who = isCenter ? (UM.centers.find(c => c.id === id) || {}) : (UM.agents.find(a => a.id === id) || {});
  const cur = who.full_name || who.name || '';
  const m = umModal(`
    <div class="um-title">تغییر نام ${isCenter ? 'سنتر' : 'کاربر'}</div>
    <div style="font-size:13px;color:var(--ink-soft);margin-bottom:10px">نام فعلی: <b>${umEsc(cur || '—')}</b>${who.backoffice_id ? ' — ' + umEsc(who.backoffice_id) : ''}</div>
    <label>نام جدید<input id="um-rn" autocomplete="off" value="${umEsc(cur)}"></label>
    <div style="font-size:12px;color:var(--ink-soft);margin:-4px 0 8px">توجه: ورک‌فلو گزارش، کارشناس‌ها را با نام به پروفایل وصل می‌کند؛ نام جدید باید با نام در فایل/گزارش یکی باشد. نام کاربری (ورود) تغییر نمی‌کند.</div>
    <div class="azki-error" id="um-rne" style="display:none"></div>
    <div class="um-actions"><button class="um-btn ghost" id="um-x" type="button">انصراف</button><button class="um-btn" id="um-ok" type="button">ثبت نام جدید</button></div>`);
  const q = s => m.querySelector(s);
  q('#um-rn').focus(); q('#um-rn').select();
  q('#um-ok').onclick = async () => {
    const nm = q('#um-rn').value.replace(/\s+/g, ' ').trim(), err = q('#um-rne');
    if (!nm) { err.textContent = 'نام نمی‌تواند خالی باشد'; err.style.display = 'block'; return; }
    if (nm === cur) { m.remove(); return; }
    const b = q('#um-ok'); b.disabled = true;
    try { await umCall({ action: 'rename_user', user_id: id, full_name: nm }); m.remove(); umToast('نام تغییر کرد'); await umLoad(); }
    catch (e) { b.disabled = false; err.textContent = 'انجام نشد: ' + e.message; err.style.display = 'block'; }
  };
}

// قانون رمز جدید: حداقل ۸ کاراکتر، حرف کوچک و بزرگ انگلیسی، عدد و یک علامت؛ بدون فاصله و فقط کاراکترهای انگلیسی
function umPassErr(pw) {
  if (pw.length < 8) return 'رمز باید حداقل ۸ کاراکتر باشد';
  if (!/^[\x21-\x7E]+$/.test(pw)) return 'رمز فقط از حروف و علامت‌های انگلیسی تشکیل شود (بدون فاصله و حروف فارسی)';
  if (!/[a-z]/.test(pw)) return 'رمز باید حداقل یک حرف کوچک انگلیسی داشته باشد';
  if (!/[A-Z]/.test(pw)) return 'رمز باید حداقل یک حرف بزرگ انگلیسی داشته باشد';
  if (!/[0-9]/.test(pw)) return 'رمز باید حداقل یک عدد داشته باشد';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'رمز باید حداقل یک علامت داشته باشد (مثل ! @ # $ % & *)';
  return '';
}

function umPassModal(id, isCenter) {
  const who = isCenter ? (UM.centers.find(c => c.id === id) || {}) : (UM.agents.find(a => a.id === id) || {});
  const m = umModal(`
    <div class="um-title">تغییر رمز عبور</div>
    <div style="font-size:13px;color:var(--ink-soft);margin-bottom:10px">${isCenter ? 'سنتر' : 'کاربر'}: <b>${umEsc(who.full_name || who.name || '—')}</b>${who.backoffice_id ? ' — ' + umEsc(who.backoffice_id) : ''}</div>
    <label>رمز عبور جدید<input id="um-np" class="ltr" type="text" autocomplete="off"></label>
    <div style="font-size:12px;color:var(--ink-soft);margin:-4px 0 8px">حداقل ۸ کاراکتر، شامل حرف کوچک و بزرگ انگلیسی، عدد و یک علامت (مثل ! @ # $ % & *)</div>
    <div class="azki-error" id="um-ne" style="display:none"></div>
    <div class="um-actions"><button class="um-btn ghost" id="um-x" type="button">انصراف</button><button class="um-btn" id="um-ok" type="button">ثبت رمز جدید</button></div>`);
  const q = s => m.querySelector(s);
  q('#um-np').addEventListener('input', e => { e.target.value = e.target.value.replace(/\s/g, ''); });
  q('#um-ok').onclick = async () => {
    const pw = q('#um-np').value, err = q('#um-ne');
    const pe = umPassErr(pw);
    if (pe) { err.textContent = pe; err.style.display = 'block'; return; }
    const b = q('#um-ok'); b.disabled = true;
    try { await umCall({ action: 'set_password', user_id: id, password: pw }); m.remove(); umToast('رمز عبور تغییر کرد'); }
    catch (e) { b.disabled = false; err.textContent = 'انجام نشد: ' + e.message; err.style.display = 'block'; }
  };
  q('#um-np').focus();
}

function umModal(inner) {
  const m = document.createElement('div'); m.className = 'um-modal';
  m.innerHTML = `<div class="um-box">${inner}</div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  m.querySelector('#um-x').onclick = () => m.remove();
  return m;
}
const umCenterOpts = (sel) => UM.centers.map(c => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${umEsc(c.name)}</option>`).join('');

function umAddModal() {
  if (!UM.centers.length) { umToast(umIsSup() ? 'ابتدا یک سنتر تعریف کنید' : 'سنتری به شما اساین نشده است؛ ابتدا یک سنتر تعریف کنید'); return; }
  const m = umModal(`
    <div class="um-title">افزودن کاربر جدید</div>
    <label>سنتر<select id="um-c">${umCenterOpts()}</select></label>
    <label>نام و نام خانوادگی<input id="um-n" autocomplete="off"></label>
    <div style="font-size:12px;color:var(--ink-soft);margin:-4px 0 8px">نام را دقیقاً مطابق نام کارشناس در بک‌آفیس (ستون «نام اپراتور») وارد کنید؛ صدور بر اساس همین نام به کارشناس وصل می‌شود.</div>
    <label>نام کاربری (انگلیسی)<input id="um-u" class="ltr" autocomplete="off"></label>
    <label>رمز عبور (حداقل ۶ کاراکتر)<input id="um-p" class="ltr" type="text" autocomplete="off"></label>
    <div class="um-actions"><button class="um-btn ghost" id="um-x" type="button">انصراف</button><button class="um-btn" id="um-ok" type="button">ثبت کاربر</button></div>`);
  const q = s => m.querySelector(s);
  q('#um-u').addEventListener('input', e => { e.target.value = e.target.value.split('@')[0].replace(/[^A-Za-z0-9._-]/g, ''); });
  q('#um-ok').onclick = async () => {
    const body = { action: 'create', center_id: q('#um-c').value, full_name: q('#um-n').value.trim(), username: q('#um-u').value.trim(), password: q('#um-p').value };
    if (!body.full_name || !body.username || body.password.length < 6) { umToast('نام، نام کاربری و رمز (حداقل ۶ کاراکتر) را کامل وارد کنید'); return; }
    // جلوگیری از پروفایل هم‌نام: صدور بر اساس نام به پروفایل وصل می‌شود و نام تکراری باعث ۰ ماندن یکی از آن‌ها می‌شود
    const nk = x => String(x || '').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    const dup = UM.agents.filter(a => nk(a.full_name) === nk(body.full_name));
    const dupHere = dup.find(a => a.center_id === body.center_id);
    if (dupHere) { umToast('کاربری با همین نام قبلاً در این سنتر ثبت شده' + (dupHere.status === 'disabled' ? ' (غیرفعال است؛ آن را فعال کنید)' : '') + '؛ کاربر تکراری ساخته نمی‌شود'); return; }
    if (dup.length) {
      const where = dup.map(a => ((UM.centers.find(c => c.id === a.center_id) || {}).name || '—')).join('، ');
      if (!confirm('کاربری با همین نام در سنتر «' + where + '» وجود دارد.\nاگر این یک نفر دیگر با همان نام است ادامه دهید؛ اگر همان فرد است، به‌جای ساخت کاربر جدید او را جابه‌جا/فعال کنید.\n\nادامه می‌دهید؟')) return;
    }
    q('#um-ok').disabled = true;
    try { await umCall(body); m.remove(); umToast('کاربر ساخته شد'); await umLoad(); }
    catch (e) { q('#um-ok').disabled = false; umToast('ثبت نشد: ' + e.message); }
  };
}

function umCenterModal() {
  const sup = umIsSup();
  const m = umModal(`
    <div class="um-title">تعریف سنتر جدید</div>
    <label>نام سنتر<input id="um-n" autocomplete="off"></label>
    <label>نام کاربری سنتر (انگلیسی)<input id="um-u" class="ltr" autocomplete="off"></label>
    <label>رمز عبور (حداقل ۶ کاراکتر)<input id="um-p" class="ltr" type="text" autocomplete="off"></label>
    ${sup ? `<label>اساین به سرگروه (اختیاری)<select id="um-l"><option value="">— بدون سرگروه —</option>${UM.leaders.map(l => `<option value="${l.id}">${umEsc(l.name)}</option>`).join('')}</select></label>`
          : `<div style="font-size:12px;color:var(--ink-soft)">این سنتر خودکار به شما اساین می‌شود.</div>`}
    <div class="um-actions"><button class="um-btn ghost" id="um-x" type="button">انصراف</button><button class="um-btn" id="um-ok" type="button">ثبت سنتر</button></div>`);
  const q = s => m.querySelector(s);
  q('#um-u').addEventListener('input', e => { e.target.value = e.target.value.split('@')[0].replace(/[^A-Za-z0-9._-]/g, ''); });
  q('#um-ok').onclick = async () => {
    const body = { action: 'create_center', full_name: q('#um-n').value.trim(), username: q('#um-u').value.trim(), password: q('#um-p').value, leader_id: sup ? q('#um-l').value : '' };
    if (!body.full_name || !body.username || body.password.length < 6) { umToast('نام، نام کاربری و رمز (حداقل ۶ کاراکتر) را کامل وارد کنید'); return; }
    q('#um-ok').disabled = true;
    try { await umCall(body); m.remove(); umToast('سنتر ساخته شد'); await umLoad(); }
    catch (e) { q('#um-ok').disabled = false; umToast('ثبت نشد: ' + e.message); }
  };
}

function umLeadersModal(centerId) {
  const c = UM.centers.find(x => x.id === centerId); if (!c) return;
  const m = umModal(`
    <div class="um-title">سرگروه‌های «${umEsc(c.name)}»</div>
    <div class="um-checks">${UM.leaders.length ? UM.leaders.map(l => `<label><input type="checkbox" value="${l.id}"${(c.leaderIds || []).includes(l.id) ? ' checked' : ''}>${umEsc(l.name)}</label>`).join('') : '<div class="empty-state">سرگروهی در سیستم نیست</div>'}</div>
    <div class="um-actions"><button class="um-btn ghost" id="um-x" type="button">انصراف</button><button class="um-btn" id="um-ok" type="button">ذخیره</button></div>`);
  m.querySelector('#um-ok').onclick = async () => {
    const ids = [...m.querySelectorAll('.um-checks input:checked')].map(i => i.value);
    m.querySelector('#um-ok').disabled = true;
    try { await umCall({ action: 'set_center_leaders', center_id: centerId, leader_ids: ids }); m.remove(); umToast('سرگروه سنتر ذخیره شد'); await umLoad(); }
    catch (e) { m.querySelector('#um-ok').disabled = false; umToast('انجام نشد: ' + e.message); }
  };
}

// ============================================================
// تب‌های قابل مخفی‌سازی برای سرگروه‌ها (تنظیم توسط سرپرست، ذخیره در Supabase: جدول app_settings)
// کلیدها همان data-team-tab تب‌های پنل سرگروه هستند؛ «report» یعنی کل گروه گزارش
// ============================================================
const LEADER_TAB_DEFS = [
  ['team', 'تعداد صدور تیم'], ['team-bugs', 'خطای صدور'], ['team-perf', 'بررسی عملکرد'], ['report', 'گزارش (کل گروه)'],
  ['azki-shifts', 'گزارش ← درصد صدور به تفکیک شیفت', 1],
  ['azki-compare', 'گزارش ← مقایسه درصد صدور', 1],
  ['azki-oct', 'گزارش ← OCT', 1],
  ['azki-chart', 'گزارش ← نمودار', 1],
  ['azki-active', 'وضعیت پنل کارشناسان'], ['azki-payroll', 'محاسبه حقوق'],
  ['attendance', 'حضور و غیاب'], ['training', 'آموزش'], ['users', 'مدیریت کاربران']
];

function applyLeaderHiddenTabs(hiddenList) {
  const hidden = new Set(hiddenList || []);
  window.leaderHiddenTabs = hidden;
  const subs = [...document.querySelectorAll('#team-subtabs .subtab-btn')];
  subs.forEach(b => { b.style.display = hidden.has(b.dataset.teamTab) ? 'none' : ''; });
  const brk = document.querySelector('#team-subtabs .subtab-break'); if (brk) brk.style.display = hidden.has('azki-chart') ? 'none' : '';
  const visibleSubs = subs.filter(b => !hidden.has(b.dataset.teamTab));
  if (!visibleSubs.length) hidden.add('report');
  if (visibleSubs.length && hidden.has(teamLastReportTab)) teamLastReportTab = visibleSubs[0].dataset.teamTab;
  const tabBtns = [...document.querySelectorAll('#team-tabs .tab-btn')];
  tabBtns.forEach(b => { b.style.display = hidden.has(b.dataset.teamGroup || b.dataset.teamTab) ? 'none' : ''; });
  // اگه تب فعلی مخفی شده، برو اولین تب قابل‌نمایش
  const cur = window.teamCurrentTab;
  const curKey = TEAM_REPORT_TABS.includes(cur) ? (hidden.has('report') ? 'report' : cur) : cur;
  if (hidden.has(curKey)) {
    const first = tabBtns.find(b => b.style.display !== 'none');
    if (first) teamShowTab(first.dataset.teamGroup === 'report' ? teamLastReportTab : first.dataset.teamTab);
    else {
      ['panel-team', 'panel-team-bugs', 'panel-team-perf'].forEach(id => document.getElementById(id).classList.remove('active'));
    }
  }
}

async function loadLeaderHiddenTabs() {
  try {
    const d = await umCall({ action: 'get_tab_settings' });
    applyLeaderHiddenTabs(d.hidden || []);
  } catch (e) { console.warn('خواندن تنظیمات تب‌های سرگروه ناموفق بود:', e.message); }
}


// ============================================================
// تب «تاریخچه گزارش» (سرپرست): نام‌هایی که ورک‌فلو در هر اجرا نتوانسته به پروفایل وصل کند
// داده از جدول report_run_log (فایل report_run_log.sql) — هر اجرای ورک‌فلو یک ردیف
// ============================================================
const RH_REASONS = { no_profile: 'پروفایلی با این نام پیدا نشد', no_center_prefix: 'بدون پیشوند «مرکز صدور»', disabled_with_targets: 'غیرفعال است ولی صدور ثبت شده' };

function rhFmtTime(iso) {
  try { return new Date(iso).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran', dateStyle: 'short', timeStyle: 'short' }); }
  catch (_) { return iso || '—'; }
}

// فقط ردیف‌های «مرکز صدور X | نام» (دارای نام سنتر)؛ ردیف‌های بدون پیشوند نمایش داده نمی‌شوند
function rhOnlyCenters(details) {
  return (details || []).filter(d => d && d.reason !== 'no_center_prefix' && d.center);
}

function rhTable(details) {
  details = rhOnlyCenters(details);
  if (!details || !details.length) return '<div class="rh-meta" style="margin-top:8px">همه‌ی اسم‌ها وصل شدند.</div>';
  const rows = details.slice().sort((a, b) => (b.count || 0) - (a.count || 0)).map(d => `<tr>
      <td>${umEsc(d.date || '—')}</td>
      <td>${umEsc(d.agent || '—')}</td>
      <td>${umEsc(d.center || '—')}</td>
      <td>${umEsc(d.count != null ? d.count : '—')}</td>
      <td>${umEsc(RH_REASONS[d.reason] || d.reason || '')}</td>
    </tr>`).join('');
  return `<div class="rh-wrap"><table class="rh-tbl"><thead><tr><th>تاریخ</th><th>نام کارشناس</th><th>نام سنتر</th><th>تعداد صدور</th><th>علت</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// دو کارت پایش در تب تاریخچه گزارش (از daily_targets):
//  ۱) «غیرفعال ولی صدور ثبت‌شده»: کارشناس غیرفعال که در RH_DISABLED_DAYS روز اخیر target_count > 0 دارد
//  ۲) «فعال ولی بدون صدور»: کارشناس فعال که در RH_IDLE_DAYS روز اخیر هیچ صدوری ندارد (حساب‌های «آموزش» حساب نمی‌شوند)
const RH_DISABLED_DAYS = 7;    // «غیرفعال ولی صدور ثبت‌شده» (کارشناس) — ۷ روزه
const RH_CENTER_DAYS = 14;     // «سنتر غیرفعال ولی صدور ثبت‌شده» — بدون تغییر
const RH_IDLE_DAYS = 7;
RH_REASONS.active_no_issuance = 'فعال است ولی صدوری ثبت نشده';
RH_REASONS.disabled_center_with_targets = 'غیرفعال است و سنترش هم غیرفعال است؛ ولی صدور ثبت شده';
RH_REASONS.active_new_no_issuance = 'فعال است؛ حساب تازه ساخته شده و هنوز صدوری ثبت نشده';

const rhIso = d => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

async function rhWatchData() {
  const since = rhIso(Math.max(RH_DISABLED_DAYS, RH_CENTER_DAYS, RH_IDLE_DAYS));
  const sinceIdle = rhIso(RH_IDLE_DAYS);
  const [pr, ca, tg] = await Promise.all([
    fetchAllRows((f, t) => supabaseClient.from('profiles').select('id, full_name, role, status, created_at').in('role', ['agent', 'center']).range(f, t)),
    fetchAllRows((f, t) => supabaseClient.from('center_agents').select('center_id, agent_id').range(f, t)),
    fetchAllRows((f, t) => supabaseClient.from(TABLE_TARGETS).select('agent_id, report_date, report_date_jalali, report_date_sort, target_count')
      .gte('report_date', since).gt('target_count', 0)
      .order('report_date_sort', { ascending: false }).order('agent_id', { ascending: true }).range(f, t)),
  ]);
  for (const r of [pr, ca, tg]) if (r.error) throw r.error;
  const byId = {};
  (pr.data || []).forEach(p => { byId[p.id] = p; });
  const centerOf = {};
  (ca.data || []).forEach(l => { if (!centerOf[l.agent_id]) centerOf[l.agent_id] = l.center_id; });
  const centerName = id => { const c = byId[centerOf[id]]; return c ? c.full_name : '—'; };
  const centerOff = id => { const c = byId[centerOf[id]]; return !!c && c.status === 'disabled'; };
  const offCenters = {};   // سنتر غیرفعالی که کارشناس‌هایش در بازه صدور داشته‌اند

  // ۱) غیرفعال ولی صدور ثبت‌شده
  const disabled = [];
  const issuedIdle = new Set(); // کارشناس‌هایی که در بازه‌ی «بی‌صدوری» صدور داشته‌اند
  const lastSeen = {};          // آخرین روزِ دارای صدور هر کارشناس (در ۱۴ روز اخیر؛ tg از جدیدترین به قدیمی‌ترین مرتب است)
  (tg.data || []).forEach(r => {
    const p = byId[r.agent_id];
    if (!p || p.role !== 'agent') return;
    if (!lastSeen[r.agent_id]) lastSeen[r.agent_id] = { iso: r.report_date, jal: r.report_date_jalali || r.report_date, sort: r.report_date_sort || 0 };
    if (r.report_date >= sinceIdle) issuedIdle.add(r.agent_id);
    if (r.report_date >= rhIso(RH_CENTER_DAYS) && centerOff(r.agent_id)) {
      const cid = centerOf[r.agent_id];
      const o = offCenters[cid] || (offCenters[cid] = { id: cid, name: centerName(r.agent_id), agents: new Set(), total: 0, last: '', lastSort: 0 });
      o.agents.add(r.agent_id); o.total += Number(r.target_count) || 0;
      if ((r.report_date_sort || 0) > o.lastSort) { o.lastSort = r.report_date_sort || 0; o.last = r.report_date_jalali || r.report_date; }
    }
    if (p.status === 'active' || r.report_date < rhIso(RH_DISABLED_DAYS)) return;
    disabled.push({ date: r.report_date_jalali || r.report_date, iso: r.report_date, sort: r.report_date_sort || 0, agent: p.full_name,
      center: centerName(r.agent_id) + (centerOff(r.agent_id) ? ' (سنتر غیرفعال)' : ''), count: Number(r.target_count) || 0,
      reason: centerOff(r.agent_id) ? 'disabled_center_with_targets' : 'disabled_with_targets' });
  });
  disabled.sort((a, b) => (b.sort - a.sort) || (b.count - a.count));

  // ۲) فعال ولی بدون صدور
  // همه‌ی کارشناس‌های فعال (غیر آموزش)؛ فیلتر «چند روز بدون صدور» در رابط کاربری انجام می‌شود
  const activeAgents = (pr.data || []).filter(p => p.role === 'agent' && p.status === 'active' && !/آموزش/.test(p.full_name || ''));
  const noRecent = activeAgents.filter(p => !lastSeen[p.id]);   // در ۱۴ روز اخیر هیچ صدوری ندارند → آخرین صدورشان را جدا می‌خوانیم
  const last = {};
  if (noRecent.length) {
    const ids = noRecent.map(p => p.id);
    for (let i = 0; i < ids.length; i += 40) {
      const chunk = ids.slice(i, i + 40);
      const lr = await fetchAllRows((f, t) => supabaseClient.from(TABLE_TARGETS).select('agent_id, report_date, report_date_jalali, report_date_sort')
        .in('agent_id', chunk).gt('target_count', 0).order('report_date_sort', { ascending: false }).range(f, t));
      if (lr.error) throw lr.error;
      (lr.data || []).forEach(r => { if (!last[r.agent_id]) last[r.agent_id] = { iso: r.report_date, jal: r.report_date_jalali || r.report_date, sort: r.report_date_sort || 0 }; });
    }
  }
  const idle = activeAgents.map(p => {
    const l = lastSeen[p.id] || last[p.id];
    const fresh = p.created_at && p.created_at.slice(0, 10) >= sinceIdle;
    return { date: l ? l.jal : '—', iso: l ? l.iso : '', sort: l ? l.sort : 0, agent: p.full_name,
      center: centerName(p.id), count: 0, reason: fresh && !l ? 'active_new_no_issuance' : 'active_no_issuance' };
  });
  idle.sort((a, b) => (a.sort - b.sort) || String(a.agent).localeCompare(String(b.agent), 'fa')); // بدون هیچ صدور اول، بعد قدیمی‌ترین
  const offList = Object.values(offCenters).map(o => ({ id: o.id, name: o.name, agents: o.agents.size, total: o.total, last: o.last, lastSort: o.lastSort }))
    .sort((a, b) => b.total - a.total);
  return { disabled, idle, offCenters: offList };
}

function rhWatchCard(title, note, rows, badPill, emptyMsg, dateHead, err) {
  if (err) return `<div class="list-card rh-run"><div style="font-weight:700">${umEsc(title)}</div><div class="rh-meta" style="margin-top:8px">خواندن انجام نشد: ${umEsc(err.message || err)}</div></div>`;
  const body = rows.length
    ? `<div class="rh-wrap"><table class="rh-tbl"><thead><tr><th>${dateHead}</th><th>نام کارشناس</th><th>نام سنتر</th><th>تعداد صدور</th><th>علت</th></tr></thead><tbody>${rows.map(d => `<tr>
      <td>${umEsc(d.date || '—')}</td>
      <td>${umEsc(d.agent || '—')}</td>
      <td>${umEsc(d.center || '—')}</td>
      <td>${umEsc(d.count)}</td>
      <td>${umEsc(RH_REASONS[d.reason] || d.reason || '')}</td>
    </tr>`).join('')}</tbody></table></div>`
    : `<div class="rh-meta" style="margin-top:8px">${umEsc(emptyMsg)}</div>`;
  return `<div class="list-card rh-run">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-weight:700">
        <span>${umEsc(title)}</span>${rows.length ? `<span class="rh-pill bad">${badPill}</span>` : '<span class="rh-pill ok">موردی نیست</span>'}
      </div>
      <div class="rh-meta">${umEsc(note)}</div>
      ${body}
    </div>`;
}

// کارت «سنتر غیرفعال ولی صدور ثبت‌شده» با دکمه‌ی فعال‌سازی سنتر
function rhCenterCard(rows, err) {
  const title = 'سنتر غیرفعال ولی صدور ثبت‌شده';
  if (err) return `<div class="list-card rh-run"><div style="font-weight:700">${umEsc(title)}</div><div class="rh-meta" style="margin-top:8px">خواندن انجام نشد: ${umEsc(err.message || err)}</div></div>`;
  const body = rows.length
    ? `<div class="rh-wrap"><table class="rh-tbl"><thead><tr><th>آخرین صدور</th><th>نام سنتر</th><th>کارشناس‌های دارای صدور</th><th>جمع صدور</th><th>اقدام</th></tr></thead><tbody>${rows.map(o => `<tr>
      <td>${umEsc(o.last || '—')}</td><td>${umEsc(o.name)}</td><td>${umEsc(o.agents)}</td><td>${umEsc(o.total)}</td>
      <td><button class="um-btn sm" type="button" data-rh-center-on="${umEsc(o.id)}" data-rh-center-name="${umEsc(o.name)}">فعال کردن سنتر</button></td>
    </tr>`).join('')}</tbody></table></div>`
    : `<div class="rh-meta" style="margin-top:8px">در ${RH_CENTER_DAYS} روز اخیر برای هیچ سنتر غیرفعالی صدور ثبت نشده است.</div>`;
  return `<div class="list-card rh-run">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-weight:700">
        <span>${umEsc(title)}</span>${rows.length ? `<span class="rh-pill bad">${rows.length} سنتر</span>` : '<span class="rh-pill ok">موردی نیست</span>'}
      </div>
      <div class="rh-meta">${RH_CENTER_DAYS} روز اخیر؛ سنترهایی که غیرفعال هستند ولی کارشناس‌هایشان صدور دارند (تا فعال نشوند در تب صدور نمایش داده نمی‌شوند)</div>
      ${body}
    </div>`;
}

// ---- کارت «غیرفعال ولی صدور ثبت‌شده»: لیست کشویی + فیلتر روز ----
const rhDis = { open: false, filter: 'all', rows: [] };   // وضعیت باز/بسته و فیلتر بعد از هر رفرش حفظ می‌شود
const RH_DIS_FILTERS = [['today', 'امروز'], ['yesterday', 'دیروز'], ['3d', '۳ روز اخیر'], ['all', 'کل ' + RH_DISABLED_DAYS + ' روز']];

function rhDisFiltered(rows, f) {
  if (f === 'all') return rows;
  const day = n => tehranDateKey(new Date(Date.now() - n * 86400000));
  if (f === 'today') return rows.filter(r => r.iso === day(0));
  if (f === 'yesterday') return rows.filter(r => r.iso === day(1));
  if (f === '3d') return rows.filter(r => r.iso >= day(2));
  return rows;
}

function rhDisChipsHtml() {
  return RH_DIS_FILTERS.map(([k, n]) => {
    const people = new Set(rhDisFiltered(rhDis.rows, k).map(x => x.agent)).size;
    return `<button type="button" class="${rhDis.filter === k ? 'on' : ''}" data-rh-dis-filter="${k}">${n} (${people})</button>`;
  }).join('');
}

function rhDisBodyHtml() {
  const rows = rhDisFiltered(rhDis.rows, rhDis.filter);
  if (!rows.length) {
    const msg = rhDis.filter === 'all'
      ? `در ${RH_DISABLED_DAYS} روز اخیر برای هیچ کارشناس غیرفعالی صدور ثبت نشده است.`
      : 'در این بازه کارشناس غیرفعالی با صدور ثبت‌شده نداریم.';
    return `<div class="rh-meta" style="margin-top:8px">${umEsc(msg)}</div>`;
  }
  return `<div class="rh-wrap"><table class="rh-tbl"><thead><tr><th>تاریخ</th><th>نام کارشناس</th><th>نام سنتر</th><th>تعداد صدور</th><th>علت</th></tr></thead><tbody>${rows.map(d => `<tr>
      <td>${umEsc(d.date || '—')}</td>
      <td>${umEsc(d.agent || '—')}</td>
      <td>${umEsc(d.center || '—')}</td>
      <td>${umEsc(d.count)}</td>
      <td>${umEsc(RH_REASONS[d.reason] || d.reason || '')}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function rhDisabledCard(rows, err) {
  const title = 'غیرفعال ولی صدور ثبت‌شده';
  if (err) return rhWatchCard(title, '', [], '', '', '', err);
  rhDis.rows = rows || [];
  const people = new Set(rhDis.rows.map(x => x.agent)).size, tot = rhDis.rows.reduce((s, x) => s + x.count, 0);
  return `<details class="list-card rh-run rh-dis" id="rh-dis-card"${rhDis.open ? ' open' : ''}>
      <summary>
        <span>${umEsc(title)}<span class="rh-chev">▾</span></span>${rhDis.rows.length ? `<span class="rh-pill bad">${people} نفر · ${rhDis.rows.length} روز · ${tot} صدور</span>` : '<span class="rh-pill ok">موردی نیست</span>'}
      </summary>
      <div class="rh-meta" style="margin-top:6px">${RH_DISABLED_DAYS} روز اخیر؛ کارشناس‌هایی که در پنل غیرفعال هستند ولی تارگتشان ثبت شده است</div>
      <div class="st-chips" id="rh-dis-chips">${rhDisChipsHtml()}</div>
      <div id="rh-dis-body">${rhDisBodyHtml()}</div>
    </details>`;
}

function rhBindDisabledActions(host) {
  if (!host || host.dataset.rhDisBound) return;
  host.dataset.rhDisBound = '1';
  // toggle بابل نمی‌شود → با capture گوش می‌دهیم تا باز/بسته‌بودن بعد از رفرش حفظ شود
  host.addEventListener('toggle', e => {
    if (!e.target) return;
    if (e.target.id === 'rh-dis-card') rhDis.open = e.target.open;
    if (e.target.id === 'rh-idle-card') rhIdle.open = e.target.open;
  }, true);
  host.addEventListener('click', e => {
    const b = e.target.closest('[data-rh-dis-filter]');
    if (b) {
      rhDis.filter = b.dataset.rhDisFilter;
      const chips = host.querySelector('#rh-dis-chips'), body = host.querySelector('#rh-dis-body');
      if (chips) chips.innerHTML = rhDisChipsHtml();
      if (body) body.innerHTML = rhDisBodyHtml();
      return;
    }
    const bi = e.target.closest('[data-rh-idle-filter]');
    if (!bi) return;
    rhIdle.filter = bi.dataset.rhIdleFilter === 'all' ? 'all' : +bi.dataset.rhIdleFilter;
    const chips2 = host.querySelector('#rh-idle-chips'), body2 = host.querySelector('#rh-idle-body');
    if (chips2) chips2.innerHTML = rhIdleChipsHtml();
    if (body2) body2.innerHTML = rhIdleBodyHtml();
  });
}

// ---- کارت «فعال ولی بدون صدور»: لیست کشویی + فیلتر «چند روز اخیر بدون صدور» ----
const rhIdle = { open: false, filter: 'all', rows: [] };
const RH_IDLE_FILTERS = [[1, 'امروز'], [2, '۲ روز اخیر'], [3, '۳ روز اخیر'], ['all', 'کل ' + RH_IDLE_DAYS + ' روز']];

function rhIdleFiltered(rows, f) {
  const n = f === 'all' ? RH_IDLE_DAYS : f;
  const since = tehranDateKey(new Date(Date.now() - (n - 1) * 86400000));   // بدون هیچ صدوری از این روز تا امروز
  return rows.filter(r => !r.iso || r.iso < since);
}

function rhIdleChipsHtml() {
  return RH_IDLE_FILTERS.map(([k, n]) =>
    `<button type="button" class="${String(rhIdle.filter) === String(k) ? 'on' : ''}" data-rh-idle-filter="${k}">${n} (${rhIdleFiltered(rhIdle.rows, k).length})</button>`).join('');
}

function rhIdleBodyHtml() {
  const rows = rhIdleFiltered(rhIdle.rows, rhIdle.filter);
  if (!rows.length) return `<div class="rh-meta" style="margin-top:8px">در این بازه همه‌ی کارشناس‌های فعال صدور داشته‌اند.</div>`;
  return `<div class="rh-wrap"><table class="rh-tbl"><thead><tr><th>آخرین صدور</th><th>نام کارشناس</th><th>نام سنتر</th><th>علت</th></tr></thead><tbody>${rows.map(d => `<tr>
      <td>${umEsc(d.date || '—')}</td>
      <td>${umEsc(d.agent || '—')}</td>
      <td>${umEsc(d.center || '—')}</td>
      <td>${umEsc(RH_REASONS[d.reason] || d.reason || '')}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function rhIdleCard(rows, err) {
  const title = 'فعال ولی بدون صدور';
  if (err) return rhWatchCard(title, '', [], '', '', '', err);
  rhIdle.rows = rows || [];
  const bad = rhIdleFiltered(rhIdle.rows, 'all').length;
  return `<details class="list-card rh-run rh-dis" id="rh-idle-card"${rhIdle.open ? ' open' : ''}>
      <summary>
        <span>${umEsc(title)}<span class="rh-chev">▾</span></span>${bad ? `<span class="rh-pill bad">${bad} نفر</span>` : '<span class="rh-pill ok">موردی نیست</span>'}
      </summary>
      <div class="rh-meta" style="margin-top:6px">کارشناس‌های فعال در پنل که در بازه‌ی انتخابی هیچ صدوری ندارند (ستون تاریخ = آخرین صدور ثبت‌شده)</div>
      <div class="st-chips" id="rh-idle-chips">${rhIdleChipsHtml()}</div>
      <div id="rh-idle-body">${rhIdleBodyHtml()}</div>
    </details>`;
}

function rhWatchCards(data, err) {
  const d = data || { disabled: [], idle: [], offCenters: [] };
  return rhCenterCard(d.offCenters || [], err)
    + rhDisabledCard(d.disabled, err)
    + rhIdleCard(d.idle, err);
}

async function runHistoryOpen(host) {
  if (!host) return;
  host.innerHTML = '<div class="loading-state">در حال بارگذاری...</div>';
  let runs = [];
  try {
    const r = await supabaseClient.from('report_run_log').select('*').order('run_at', { ascending: false }).limit(60);
    if (r.error) throw r.error;
    runs = r.data || [];
  } catch (e) {
    host.innerHTML = '<div class="empty-state">خواندن تاریخچه انجام نشد: ' + umEsc(e.message) + '</div>';
    return;
  }
  let disHtml = '';
  try { disHtml = rhWatchCards(await rhWatchData()); }
  catch (e) { disHtml = rhWatchCards(null, e); }
  if (!runs.length) {
    host.innerHTML = disHtml + '<div class="empty-state">هنوز هیچ اجرایی ثبت نشده است. بعد از اولین اجرای ورک‌فلو اینجا نمایش داده می‌شود.</div>';
    const rf0 = host.querySelector('#rh-refresh'); if (rf0) rf0.onclick = () => runHistoryOpen(host);
    rhBindCenterActions(host); rhBindDisabledActions(host);
    return;
  }
  const pill = r => {
    const det = rhOnlyCenters(r.details);
    const cnt = det.length, tot = det.reduce((s, x) => s + (x.count || 0), 0);
    return cnt > 0
    ? `<span class="rh-pill bad">${cnt} مورد وصل نشد · ${tot} صدور</span>`
    : '<span class="rh-pill ok">همه وصل شد</span>';
  };
  const [latest, ...older] = runs;
  host.innerHTML = `
    <div class="rh-head">
      <div class="um-title">تاریخچه گزارش — آخرین اجرا: ${umEsc(rhFmtTime(latest.run_at))}</div>
      <button class="um-btn" id="rh-refresh" type="button">بروزرسانی</button>
    </div>
    ${disHtml}
    <div class="list-card rh-run">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-weight:700">
        <span>آخرین اجرا</span>${pill(latest)}
      </div>
      <div class="rh-meta">ردیف ثبت‌شده: ${umEsc(latest.matched_rows)}</div>
      ${rhTable(latest.details)}
    </div>
    ${older.length ? '<div class="rh-meta" style="margin:14px 0 8px">اجراهای قبلی</div>' : ''}
    ${older.map(r => `<details class="list-card rh-run">
      <summary><span>${umEsc(rhFmtTime(r.run_at))}</span>${pill(r)}</summary>
      <div class="rh-meta">ردیف ثبت‌شده: ${umEsc(r.matched_rows)}</div>
      ${rhTable(r.details)}
    </details>`).join('')}`;
  const rf = host.querySelector('#rh-refresh');
  if (rf) rf.onclick = () => runHistoryOpen(host);
  rhBindCenterActions(host); rhBindDisabledActions(host);
}

function rhBindCenterActions(host) {
  if (!host || host.dataset.rhCenterBound) return;
  host.dataset.rhCenterBound = '1';
  host.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rh-center-on]');
    if (!b) return;
    const name = b.dataset.rhCenterName || '';
    if (!confirm(`سنتر «${name}» فعال شود؟`)) return;
    b.disabled = true;
    try { await umSetCenterStatus(b.dataset.rhCenterOn, 'active'); umToast('سنتر فعال شد'); await runHistoryOpen(host); }
    catch (err) { b.disabled = false; umToast('انجام نشد: ' + err.message); }
  });
}

// ============================================================
// تب «تنظیمات»: دو بخش جدا — «تب‌های قابل‌نمایش» (با منوی نقش‌ها) و «دسترسی نقش‌ها»
// ============================================================
const ST_STATE = { group: 'tabs', role: 'sup' };
const ST_GROUPS = [['tabs', 'تب‌های قابل‌نمایش'], ['perms', 'دسترسی نقش‌ها']];
const ST_ROLES = [['sup', 'سرپرست'], ['leader', 'سرگروه'], ['agent', 'کارشناس'], ['center', 'سنتر']];

function settingsOpen(host) {
  if (!host) return;
  host.innerHTML = `<div class="st-nav">
      <div class="st-seg" id="st-groups">${ST_GROUPS.map(([k, n]) => `<button type="button" data-g="${k}">${n}</button>`).join('')}</div>
      <div class="st-chips" id="st-roles">${ST_ROLES.map(([k, n]) => `<button type="button" data-r="${k}">${n}</button>`).join('')}</div>
    </div><div id="st-pane"></div>`;
  host.querySelector('#st-groups').onclick = e => { const b = e.target.closest('[data-g]'); if (!b) return; ST_STATE.group = b.dataset.g; stRenderPane(host); };
  host.querySelector('#st-roles').onclick = e => { const b = e.target.closest('[data-r]'); if (!b) return; ST_STATE.role = b.dataset.r; stRenderPane(host); };
  stRenderPane(host);
}

function stRenderPane(host) {
  host.querySelectorAll('#st-groups [data-g]').forEach(b => b.classList.toggle('on', b.dataset.g === ST_STATE.group));
  host.querySelector('#st-roles').style.display = ST_STATE.group === 'tabs' ? '' : 'none';
  host.querySelectorAll('#st-roles [data-r]').forEach(b => b.classList.toggle('on', b.dataset.r === ST_STATE.role));
  const slot = document.createElement('div'); // هر بار یک ظرف تازه؛ نتیجه‌ی دیرهنگامِ درخواست قبلی جایی نمی‌نشیند
  host.querySelector('#st-pane').replaceChildren(slot);
  if (ST_STATE.group === 'perms') return permSettingsRender(slot);
  ({ sup: supTabsSettingsRender, leader: leaderTabsSettingsRender, agent: agentSettingsRender, center: centerSettingsRender })[ST_STATE.role](slot);
}

function stCard(host, id) {
  const card = document.createElement('div');
  card.className = 'um-settings list-card';
  card.id = id;
  card.style.cssText = 'padding:18px';
  card.innerHTML = '<div class="loading-state">در حال بارگذاری...</div>';
  host.appendChild(card);
  return card;
}
const stMissing = e => /PGRST202|42883|Could not find the function|schema cache/i.test(String((e && (e.code || '')) + ' ' + (e && e.message || '')));

// ---- تب‌های سرگروه ----
async function leaderTabsSettingsRender(host) {
  const card = stCard(host, 'st-leader');
  let hidden = [];
  try { hidden = (await umCall({ action: 'get_tab_settings' })).hidden || []; }
  catch (e) { card.innerHTML = '<div class="empty-state">خواندن تنظیمات انجام نشد: ' + umEsc(e.message) + '</div>'; return; }
  const hs = new Set(hidden);
  card.innerHTML = `<div class="um-title">تب‌های قابل‌نمایش برای سرگروه‌ها</div>
    <div style="font-size:12px;color:var(--ink-soft)">تیک = نمایش داده شود. تب‌های بدون تیک برای همه‌ی سرگروه‌ها مخفی می‌شود.</div>
    <div class="um-checks">${LEADER_TAB_DEFS.map(([k, n, sub]) => `<label style="${sub ? 'margin-right:18px' : ''}"><input type="checkbox" value="${k}"${hs.has(k) ? '' : ' checked'}>${umEsc(n)}</label>`).join('')}</div>
    <div class="um-actions"><button class="um-btn" id="st-save" type="button">ذخیره</button></div>`;
  const save = card.querySelector('#st-save');
  save.onclick = async () => {
    const off = [...card.querySelectorAll('.um-checks input:not(:checked)')].map(i => i.value);
    save.disabled = true;
    try { await umCall({ action: 'set_tab_settings', hidden: off }); umToast('تنظیمات ذخیره شد؛ سرگروه‌ها با ورود/رفرش بعدی تغییر را می‌بینند'); }
    catch (e) { umToast('ذخیره نشد: ' + e.message); }
    save.disabled = false;
  };
}

// ---- تب‌های سرپرست (خود سرپرست) ----
// کلیدها همان data-sup-tab / data-sup-group دکمه‌های #supervisor-tabs و #supervisor-subtabs هستند؛ «تنظیمات» همیشه نمایش داده می‌شود
const SUP_TAB_DEFS = [
  ['targets', 'صدور'], ['map', 'نقشه سنتر'], ['sup-perf', 'بررسی عملکرد'], ['bugs', 'خطای صدور'], ['report', 'گزارش (کل گروه)'],
  ['azki-period', 'گزارش ← گزارش دوره‌ای', 1], ['azki-centers', 'گزارش ← به تفکیک نام مرکز', 1], ['azki-shifts', 'گزارش ← درصد صدور به تفکیک شیفت', 1],
  ['azki-compare', 'گزارش ← مقایسه درصد صدور', 1], ['azki-oct', 'گزارش ← OCT', 1], ['azki-chart', 'گزارش ← نمودار', 1],
  ['azki-active', 'وضعیت پنل کارشناسان'], ['azki-payroll', 'محاسبه حقوق'],
  ['attendance', 'حضور و غیاب'], ['training', 'آموزش'], ['users', 'مدیریت کاربران'], ['run-history', 'تاریخچه گزارش']
];
const SUP_REPORT_KEYS = ['azki-period', 'azki-centers', 'azki-shifts', 'azki-compare', 'azki-oct', 'azki-chart'];

function applySupHiddenTabs(hiddenList) {
  const hidden = new Set((hiddenList || []).filter(k => k !== 'settings'));
  window.supHiddenTabs = hidden;
  const subs = [...document.querySelectorAll('#supervisor-subtabs .subtab-btn')];
  subs.forEach(b => { b.style.display = hidden.has(b.dataset.supTab) ? 'none' : ''; });
  const brk = document.querySelector('#supervisor-subtabs .subtab-break'); if (brk) brk.style.display = hidden.has('azki-chart') ? 'none' : '';
  const visSubs = subs.filter(b => !hidden.has(b.dataset.supTab));
  if (!visSubs.length) hidden.add('report');
  const btns = [...document.querySelectorAll('#supervisor-tabs .tab-btn')];
  btns.forEach(b => { b.style.display = hidden.has(b.dataset.supGroup || b.dataset.supTab) ? 'none' : ''; });
  const cur = window.supCurrentTab, isRep = SUP_REPORT_KEYS.includes(cur);
  const curKey = isRep ? (hidden.has('report') ? 'report' : cur) : cur;
  if (hidden.has(curKey) && window.supShowTab) {
    if (isRep && !hidden.has('report') && visSubs.length) return window.supShowTab(visSubs[0].dataset.supTab);
    const first = btns.find(b => b.style.display !== 'none');
    if (first) window.supShowTab(first.dataset.supGroup === 'report' ? visSubs[0].dataset.supTab : first.dataset.supTab);
  }
}

async function loadSupHiddenTabs() {
  try {
    const r = await supabaseClient.rpc('supervisor_tab_settings_get');
    if (r.error) throw r.error;
    applySupHiddenTabs(Array.isArray(r.data) ? r.data : []);
  } catch (e) { console.warn('خواندن تنظیمات تب‌های سرپرست ناموفق بود:', e.message); }
}

async function supTabsSettingsRender(host) {
  const card = stCard(host, 'st-sup');
  let hidden = [];
  try {
    const r = await supabaseClient.rpc('supervisor_tab_settings_get');
    if (r.error) throw r.error;
    hidden = Array.isArray(r.data) ? r.data : [];
  } catch (e) {
    card.innerHTML = '<div class="empty-state">' + (stMissing(e) ? 'تنظیمات تب سرپرست هنوز در دیتابیس فعال نشده؛ فایل supervisor_tab_settings.sql را در Supabase اجرا کنید.' : 'خواندن تنظیمات سرپرست انجام نشد: ' + umEsc(e.message)) + '</div>';
    return;
  }
  const hs = new Set(hidden);
  card.innerHTML = `<div class="um-title">تب‌های قابل‌نمایش برای سرپرست</div>
    <div style="font-size:12px;color:var(--ink-soft)">تیک = نمایش داده شود. تب «تنظیمات» همیشه نمایش داده می‌شود. این تنظیم برای همه‌ی سرپرست‌ها یکسان است و بلافاصله اعمال می‌شود.</div>
    <div class="um-checks">${SUP_TAB_DEFS.map(([k, n, sub]) => `<label style="${sub ? 'margin-right:18px' : ''}"><input type="checkbox" value="${k}"${hs.has(k) ? '' : ' checked'}>${umEsc(n)}</label>`).join('')}</div>
    <div class="um-actions"><button class="um-btn" id="st-save" type="button">ذخیره</button></div>`;
  const save = card.querySelector('#st-save');
  save.onclick = async () => {
    const off = [...card.querySelectorAll('.um-checks input:not(:checked)')].map(i => i.value);
    save.disabled = true;
    try {
      const r = await supabaseClient.rpc('supervisor_tab_settings_set', { p_hidden: off });
      if (r.error) throw r.error;
      applySupHiddenTabs(off);
      umToast('تنظیمات ذخیره شد');
    } catch (e) { umToast('ذخیره نشد: ' + e.message); }
    save.disabled = false;
  };
}

// ============================================================
// دسترسی‌های نقش‌ها (حذف / تغییر نام) — تنظیم توسط سرپرست
// ذخیره از طریق توابع role_permissions_get/set (فایل role_permissions.sql)؛ اعمال سمت سرور در edge function ‏leader-users
// ============================================================
async function permSettingsRender(host) {
  const card = document.createElement('div');
  card.className = 'um-settings list-card';
  card.id = 'st-perms';
  card.style.cssText = 'padding:18px';
  card.innerHTML = '<div class="loading-state">در حال بارگذاری...</div>';
  host.appendChild(card);
  let perms;
  try {
    const r = await supabaseClient.rpc('role_permissions_get');
    if (r.error) throw r.error;
    perms = umPermsMerge(r.data);
  } catch (e) {
    const missing = /PGRST202|42883|Could not find the function|schema cache/i.test(String((e && (e.code || '')) + ' ' + (e && e.message || '')));
    card.innerHTML = '<div class="empty-state">' + (missing ? 'دسترسی نقش‌ها هنوز در دیتابیس فعال نشده؛ فایل role_permissions.sql را در Supabase اجرا کنید.' : 'خواندن دسترسی‌ها انجام نشد: ' + umEsc(e.message)) + '</div>';
    return;
  }
  card.innerHTML = `<div class="um-title">دسترسی نقش‌ها (مدیریت کاربران)</div>
    <div style="font-size:12px;color:var(--ink-soft)">تیک = مجاز. سرپرست همیشه همه‌ی دسترسی‌ها را دارد. سرگروه‌ها فقط روی کاربران و سنترهای اساین‌شده به خودشان اعمال می‌کنند.</div>
    <div style="overflow-x:auto"><table class="rh-tbl" style="margin-top:10px;width:100%">
      <thead><tr><th style="text-align:right">دسترسی</th><th>سرپرست</th><th>سرگروه</th></tr></thead>
      <tbody>${UM_PERM_DEFS.map(([k, n]) => `<tr><td style="text-align:right">${umEsc(n)}</td>
        <td style="text-align:center"><input type="checkbox" checked disabled title="سرپرست همیشه دسترسی دارد"></td>
        <td style="text-align:center"><input type="checkbox" data-perm="${k}"${perms.leader[k] ? ' checked' : ''}></td></tr>`).join('')}</tbody>
    </table></div>
    <div class="um-actions"><button class="um-btn" id="st-perms-save" type="button">ذخیره</button></div>`;
  const btn = card.querySelector('#st-perms-save');
  btn.onclick = async () => {
    const leader = {};
    card.querySelectorAll('input[data-perm]').forEach(i => { leader[i.dataset.perm] = i.checked; });
    btn.disabled = true;
    try {
      const r = await supabaseClient.rpc('role_permissions_set', { p_perms: { leader } });
      if (r.error) throw r.error;
      umToast('دسترسی‌ها ذخیره شد؛ سرگروه‌ها با باز کردن/رفرش بعدی تغییر را می‌بینند');
    } catch (e) { umToast('ذخیره نشد: ' + e.message); }
    btn.disabled = false;
  };
}

// ============================================================
// تب‌های قابل‌نمایش برای کارشناس‌ها (ایجنت‌ها) — تنظیم توسط سرپرست
// ذخیره در جدول agent_tab_settings از طریق توابع agent_tab_settings_get/set (فایل agent_tab_settings.sql)
// کلیدها همان data-tab دکمه‌های #main-tabs هستند
// ============================================================
const AGENT_TAB_DEFS = [['targets', 'تارگت روزانه'], ['bugs', 'خطای صدور'], ['agent-perf', 'بررسی عملکرد'], ['agent-attendance', 'حضور و غیاب'], ['training', 'آموزش']];

function applyAgentHiddenTabs(hiddenList) {
  const hidden = new Set(hiddenList || []);
  const btns = [...document.querySelectorAll('#main-tabs .tab-btn')];
  if (btns.length && btns.every(b => hidden.has(b.dataset.tab))) hidden.clear(); // حداقل یک تب باید بماند
  btns.forEach(b => { b.style.display = hidden.has(b.dataset.tab) ? 'none' : ''; });
  const cur = btns.find(b => b.classList.contains('active'));
  if (!cur || hidden.has(cur.dataset.tab)) {
    const first = btns.find(b => !hidden.has(b.dataset.tab));
    if (first) first.click();
  }
}

async function loadAgentHiddenTabs() {
  try {
    const r = await supabaseClient.rpc('agent_tab_settings_get');
    if (r.error) throw r.error;
    applyAgentHiddenTabs(r.data || []);
  } catch (e) { console.warn('خواندن تنظیمات تب‌های کارشناس ناموفق بود:', e.message); }
}

async function agentSettingsRender(host) {
  const card = document.createElement('div');
  card.className = 'um-settings list-card';
  card.id = 'st-agent';
  card.style.cssText = 'padding:18px';
  card.innerHTML = '<div class="loading-state">در حال بارگذاری...</div>';
  host.appendChild(card);
  let hidden = [];
  try {
    const r = await supabaseClient.rpc('agent_tab_settings_get');
    if (r.error) throw r.error;
    hidden = r.data || [];
  } catch (e) { card.innerHTML = '<div class="empty-state">خواندن تنظیمات کارشناس‌ها انجام نشد: ' + umEsc(e.message) + '</div>'; return; }
  const hs = new Set(hidden);
  card.innerHTML = `<div class="um-title">تب‌های قابل‌نمایش برای کارشناس‌ها</div>
    <div style="font-size:12px;color:var(--ink-soft)">تیک = نمایش داده شود. تب‌های بدون تیک برای همه‌ی کارشناس‌ها مخفی می‌شود (حداقل یک تب باید فعال بماند).</div>
    <div class="um-checks">${AGENT_TAB_DEFS.map(([k, n]) => `<label><input type="checkbox" value="${k}"${hs.has(k) ? '' : ' checked'}>${umEsc(n)}</label>`).join('')}</div>
    <div class="um-actions"><button class="um-btn" id="st-agent-save" type="button">ذخیره</button></div>`;
  const btn = card.querySelector('#st-agent-save');
  btn.onclick = async () => {
    const off = [...card.querySelectorAll('.um-checks input:not(:checked)')].map(i => i.value);
    if (off.length >= AGENT_TAB_DEFS.length) { umToast('حداقل یک تب باید فعال بماند'); return; }
    btn.disabled = true;
    try {
      const r = await supabaseClient.rpc('agent_tab_settings_set', { p_hidden: off });
      if (r.error) throw r.error;
      umToast('تنظیمات ذخیره شد؛ کارشناس‌ها با ورود/رفرش بعدی تغییر را می‌بینند');
    } catch (e) { umToast('ذخیره نشد: ' + e.message); }
    btn.disabled = false;
  };
}

// ============================================================
// تب‌های قابل‌نمایش برای سنترها — تنظیم توسط سرپرست
// ذخیره در جدول center_tab_settings از طریق توابع center_tab_settings_get/set (فایل center_tab_settings.sql)
// کلیدها همان data-center-tab دکمه‌های #center-tabs هستند
// ============================================================
const CENTER_TAB_DEFS = [['center', 'تعداد صدور'], ['center-bugs', 'خطای صدور'], ['attendance', 'حضور و غیاب'], ['center-payroll', 'محاسبه حقوق'], ['center-perf', 'بررسی عملکرد'], ['training', 'آموزش']];

function applyCenterHiddenTabs(hiddenList) {
  const hidden = new Set(hiddenList || []);
  const btns = [...document.querySelectorAll('#center-tabs .tab-btn')];
  if (btns.length && btns.every(b => hidden.has(b.dataset.centerTab))) hidden.clear(); // حداقل یک تب باید بماند
  btns.forEach(b => { b.style.display = hidden.has(b.dataset.centerTab) ? 'none' : ''; });
  const cur = btns.find(b => b.classList.contains('active'));
  if (!cur || hidden.has(cur.dataset.centerTab)) {
    const first = btns.find(b => !hidden.has(b.dataset.centerTab));
    if (first) first.click();
  }
}

async function loadCenterHiddenTabs() {
  try {
    const r = await supabaseClient.rpc('center_tab_settings_get');
    if (r.error) throw r.error;
    applyCenterHiddenTabs(r.data || []);
  } catch (e) { console.warn('خواندن تنظیمات تب‌های سنتر ناموفق بود:', e.message); }
}

async function centerSettingsRender(host) {
  const card = document.createElement('div');
  card.className = 'um-settings list-card';
  card.id = 'st-center';
  card.style.cssText = 'padding:18px';
  card.innerHTML = '<div class="loading-state">در حال بارگذاری...</div>';
  host.appendChild(card);
  let hidden = [];
  try {
    const r = await supabaseClient.rpc('center_tab_settings_get');
    if (r.error) throw r.error;
    hidden = r.data || [];
  } catch (e) {
    const missing = /PGRST202|42883|Could not find the function|schema cache/i.test(String((e && (e.code || '')) + ' ' + (e && e.message || '')));
    card.innerHTML = '<div class="empty-state">' + (missing ? 'تنظیمات تب سنترها هنوز در دیتابیس فعال نشده؛ فایل center_tab_settings.sql را در Supabase اجرا کنید.' : 'خواندن تنظیمات سنترها انجام نشد: ' + umEsc(e.message)) + '</div>';
    return;
  }
  const hs = new Set(hidden);
  card.innerHTML = `<div class="um-title">تب‌های قابل‌نمایش برای سنترها</div>
    <div style="font-size:12px;color:var(--ink-soft)">تیک = نمایش داده شود. تب‌های بدون تیک برای همه‌ی سنترها مخفی می‌شود (حداقل یک تب باید فعال بماند).</div>
    <div class="um-checks">${CENTER_TAB_DEFS.map(([k, n]) => `<label><input type="checkbox" value="${k}"${hs.has(k) ? '' : ' checked'}>${umEsc(n)}</label>`).join('')}</div>
    <div class="um-actions"><button class="um-btn" id="st-center-save" type="button">ذخیره</button></div>`;
  const btn = card.querySelector('#st-center-save');
  btn.onclick = async () => {
    const off = [...card.querySelectorAll('.um-checks input:not(:checked)')].map(i => i.value);
    if (off.length >= CENTER_TAB_DEFS.length) { umToast('حداقل یک تب باید فعال بماند'); return; }
    btn.disabled = true;
    try {
      const r = await supabaseClient.rpc('center_tab_settings_set', { p_hidden: off });
      if (r.error) throw r.error;
      umToast('تنظیمات ذخیره شد؛ سنترها با ورود/رفرش بعدی تغییر را می‌بینند');
    } catch (e) { umToast('ذخیره نشد: ' + e.message); }
    btn.disabled = false;
  };
}
