(function(){
const TE='att_entries',TU='att_unlocks',TH='att_holidays',PCT=0.3,ACT=['present','hourly'];
const ST={present:['حضور','#1FA971'],hourly:['مرخصی ساعتی','#E08A17'],leave:['مرخصی','#7C5CE0'],weekly_off:['اف هفتگی','#8A94A6'],suspended:['تعلیق','#E0453F']};
const DN=['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'];
const JMF=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const e=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const add=(s,n)=>{const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const wstart=s=>add(s,-((new Date(s+'T00:00:00Z').getUTCDay()+1)%7));
const todayI=()=>{const j=tehranTodayJalali();return jalaliToGregorian(j[0],j[1],j[2])};
const fdate=s=>{const[y,m,d]=s.split('-').map(Number),j=gregorianToJalali(y,m,d);return faDigits(j[2])+' '+JMF[j[1]-1]};
const fyear=s=>{const[y,m,d]=s.split('-').map(Number);return faDigits(gregorianToJalali(y,m,d)[0])};
const A={names:{},host:null,me:null,role:null,week:null,centers:null,sel:null,agents:{},entries:[],unlock:null,pending:[],hol:{},locks:{},lkAll:false,view:'set',body:null,st:{mode:'day',day:null,open:{},data:null}};
const isNext=()=>{const t=todayI();return A.week>t&&A.week<=add(t,7)};
const isCur=()=>{const t=todayI();return A.week<=t&&t<=add(A.week,6)};
const unlocked=()=>!!(A.unlock&&A.unlock.status==='approved');
const sup=()=>A.role==='supervisor';
const ldr=()=>A.role==='leader';
const mgr=()=>sup()||ldr();
const agt=()=>!['center','leader','supervisor','admin'].includes(A.role);
// فقط برای «نمایش وضعیت حضور»: سرگروه همه‌ی سنترها رو می‌بینه (حتی اساین‌نشده‌ها)؛ بقیه‌ی بخش‌ها فقط سنترهای خودش
const SC=()=>(A.role==='leader'&&A.allCenters&&A.allCenters.length)?A.allCenters:(A.centers||[]);
const isOwn=id=>A.role!=='leader'||(A.centers||[]).some(c=>c.id===id);
// فیلتر انتخاب سنتر در «نمایش وضعیت حضور»: A.st.fsel = null یعنی همه‌ی سنترها؛ در غیر این صورت Set از idهای انتخاب‌شده
const FKEY=()=>'att_status_centers_'+(A.me||'');
const fLoad=()=>{try{const v=localStorage.getItem(FKEY());if(!v||v==='all')return null;const arr=JSON.parse(v);return Array.isArray(arr)?new Set(arr):null}catch(_){return null}};
const fSave=()=>{try{localStorage.setItem(FKEY(),A.st.fsel?JSON.stringify([...A.st.fsel]):'all')}catch(_){}};
const VC=()=>{const all=SC(),f=A.st.fsel;return f?all.filter(c=>f.has(c.id)):all};
const cOpen=d=>{const L=A.locks[d];return L?!L.locked:true};
const dayOpen=d=>mgr()?true:(A.role==='center'&&cOpen(d));
const canEdit=()=>mgr()||(A.role==='center'&&DN.some((_,i)=>cOpen(add(A.week,i))));
const REQ=480,SHD={morning:['08:00','16:00'],night:['16:00','00:00']},SHN={morning:'شیفت صبح',night:'شیفت شب'};
const toM=t=>{const[h,m]=t.split(':').map(Number);return h*60+m};
const toE=t=>t==='00:00'?1440:toM(t);
const dur=(a,b)=>{let d=toM(b)-toM(a);if(d<=0)d+=1440;return d};
const HH=Array.from({length:24},(_,i)=>String(i).padStart(2,'0')),MM=Array.from({length:12},(_,i)=>String(i*5).padStart(2,'0'));
function tp(v,attr){const[h,mi]=(v||'08:00').split(':');const ml=(MM.includes(mi)?MM:[...MM,mi].sort());
  return `<span class="tp" ${attr}><select data-u="h">${HH.map(x=>`<option${x===h?' selected':''}>${x}</option>`).join('')}</select>:<select data-u="m">${ml.map(x=>`<option${x===mi?' selected':''}>${x}</option>`).join('')}</select></span>`}
const tpv=el=>el.querySelector('[data-u=h]').value+':'+el.querySelector('[data-u=m]').value;
const chipSub=x=>ST[x.status][0]+((x.periods&&x.periods.length&&(x.status==='present'||x.status==='hourly'))?' · '+(x.status==='hourly'?'حضور ':'')+fmtP(x.periods):'');
const wdays=()=>DN.map((_,i)=>add(A.week,i));
async function setLock(days,locked,all){
  const ids=all?A.centers.map(c=>c.id):[A.sel], at=new Date().toISOString(), rows=[];
  ids.forEach(c=>days.forEach(d=>rows.push({center_id:c,day:d,locked,set_by:A.me,set_at:at})));
  const r=await supabaseClient.from('att_locks').upsert(rows,{onConflict:'center_id,day'});
  if(r.error)toast(/att_locks/.test(r.error.message||'')?'جدول قفل (att_locks) هنوز در دیتابیس ساخته نشده؛ SQL مربوطه را در Supabase اجرا کنید.':'ثبت قفل انجام نشد: '+r.error.message);else toast(locked?'قفل شد':'باز شد');
  await loadWeek();
}
const ags=()=>A.agents[A.sel]||[];
const aname=id=>(ags().find(a=>a.id===id)||{}).name||A.names[id]||'—';
const capped=d=>new Date(d+'T00:00:00Z').getUTCDay()===5||!!A.hol[d];
const cap=()=>Math.max(1,Math.floor(ags().length*PCT));
const dayEn=d=>A.entries.filter(x=>x.day===d);
const actN=(d,skip)=>dayEn(d).filter(x=>ACT.includes(x.status)&&x.agent_id!==skip).length;
const capOk=(d,agent,st)=>!capped(d)||!ACT.includes(st)||actN(d,agent)<cap();
function toast(m){const t=document.createElement('div');t.className='kb-toast';t.textContent=m;t.onclick=()=>t.remove();document.body.appendChild(t);setTimeout(()=>t.remove(),6000)}
const capMsg=n=>`در روز تعطیل/جمعه حداکثر ${faDigits(Math.round(PCT*100))}٪ نفرات (${faDigits(n==null?cap():n)} نفر) می‌توانند فعال باشند؛ برای بقیه مرخصی ثبت کنید.`;
const fmtP=p=>(p||[]).map(x=>faDigits(x[0])+'–'+faDigits(x[1])).join('، ');

async function init(){
  A.me=currentUserId||(await supabaseClient.auth.getSession()).data.session?.user?.id; A.role=currentUserRole;
  if(agt()){A.centers=[];A.sel=null;return}
  let ids=[];
  if(A.role==='center')ids=[A.me];
  else if(A.role==='leader'){const r=await supabaseClient.from('leader_centers').select('center_id').eq('leader_id',A.me);ids=(r.data||[]).map(x=>x.center_id)}
  else{const r=await supabaseClient.from('profiles').select('id').eq('role','center').limit(2000);ids=(r.data||[]).map(x=>x.id)}
  const p=ids.length?await supabaseClient.from('profiles').select('id, full_name, status').in('id',ids):{data:[]};
  A.centers=(p.data||[]).filter(x=>!(A.role==='leader'&&x.status==='disabled')).map(x=>({id:x.id,name:x.full_name||'—'})).sort((a,b)=>a.name.localeCompare(b.name,'fa'));
  A.sel=A.centers[0]&&A.centers[0].id;
}
async function nextCount(ids){
  A.nextN=0; if(!mgr()||!ids||!ids.length||!isCur())return;
  const nw=add(A.week,7), r=await supabaseClient.from(TE).select('id',{count:'exact',head:true}).in('center_id',ids).gte('day',nw).lte('day',add(nw,6));
  A.nextN=r.count||0;
}
const nextBar=()=>A.nextN>0?`<div class="att-req"><span>برای <b>هفته‌ی بعد</b> ${faDigits(A.nextN)} ردیف حضور و غیاب ثبت شده است (سنترها معمولاً هفته‌ی بعد را پر می‌کنند).</span><span class="att-sp"></span><button class="kb-btn" id="a-gonext" type="button">نمایش هفته‌ی بعد</button></div>`:'';
function bindNext(H){const b=H.querySelector('#a-gonext');if(b)b.onclick=()=>{A.week=add(A.week,7);loadWeek()}}
async function loadWeek(){
  if(agt()){await loadAgentWeek();return}
  const h=await supabaseClient.from(TH).select('*'); A.hol={}; (h.data||[]).forEach(x=>A.hol[x.day]=x.title||'تعطیل رسمی');
  const c=A.sel;
  if(c){
    if(!A.agents[c]){
      const l=await fetchAllRows((f,t)=>supabaseClient.from('center_agents').select('agent_id').eq('center_id',c).range(f,t));
      const ids=(l.data||[]).map(x=>x.agent_id).filter(Boolean);
      const p=ids.length?await fetchAllRows((f,t)=>supabaseClient.from('profiles').select('id, full_name, status').in('id',ids).eq('role','agent').range(f,t)):{data:[]};
      A.agents[c]=(p.data||[]).filter(x=>x.status!=='disabled').map(x=>({id:x.id,name:x.full_name||'—'})).sort((a,b)=>a.name.localeCompare(b.name,'fa'));
    }
    const er=await supabaseClient.from(TE).select('*').eq('center_id',c).gte('day',A.week).lte('day',add(A.week,6)); A.entries=er.data||[]; if(er.error)toast('خواندن حضور و غیاب انجام نشد: '+er.error.message);
    A.unlock=null; // قفل فقط دستی است (att_locks)؛ جریان «درخواست باز کردن قفل» حذف شد
    const lr=await supabaseClient.from('att_locks').select('*').eq('center_id',c).gte('day',A.week).lte('day',add(A.week,6)); A.locks={}; (lr.data||[]).forEach(x=>A.locks[x.day]=x);
    // اگه برای کسی ورودی ثبت شده ولی تو لیست نفرات سنتر نیست (مثلاً دسترسی/اساین)، اسمش رو جدا می‌گیریم تا همه‌ی نقش‌ها یکسان ببینن
    const miss=[...new Set(A.entries.map(x=>x.agent_id))].filter(id=>!ags().some(a=>a.id===id)&&!A.names[id]);
    if(miss.length){const pn=await supabaseClient.from('profiles').select('id, full_name').in('id',miss); (pn.data||[]).forEach(x=>A.names[x.id]=x.full_name||'—')}
    // اعمال خودکار چیدمان هفته‌ی قبل (فقط یک بار برای هر سنتر/هفته، وقتی هفته کاملاً خالیه)
    if(A.role==='center'&&!A.entries.length&&A.week>=wstart(todayI())){
      const ck='att_carry|'+c+'|'+A.week; let done=false; try{done=!!localStorage.getItem(ck)}catch(_){}
      if(!done){
        try{localStorage.setItem(ck,'1')}catch(_){}
        const n=await carryWeek(c,A.week,{});
        if(n>0){const er2=await supabaseClient.from(TE).select('*').eq('center_id',c).gte('day',A.week).lte('day',add(A.week,6)); A.entries=er2.data||[]; toast('چیدمان آخرین هفته‌ی ثبت‌شده برای این هفته اعمال شد؛ فقط موارد لازم را جابجا کنید')}
      }
    }
  }
  A.pending=[];
  if(mgr()&&A.view==='status')await loadStatus();
  await nextCount(A.view==='status'?SC().map(c=>c.id):(A.sel?[A.sel]:[]));
  render();
}
function render(){
  const H=A.host; if(!H)return;
  if(!mgr()){A.body=H;renderSet();return}
  H.innerHTML=`<div class="subtabs" style="margin-bottom:14px"><button class="subtab-btn${A.view==='set'?' active':''}" data-av="set" type="button">⚙ تنظیمات حضور و غیاب</button><button class="subtab-btn${A.view==='status'?' active':''}" data-av="status" type="button">📊 نمایش وضعیت حضور</button></div><div id="att-body"></div>`;
  A.body=H.querySelector('#att-body');
  H.querySelectorAll('[data-av]').forEach(b=>b.onclick=async()=>{A.view=b.dataset.av;if(A.view==='status')await loadStatus();render()});
  if(A.view==='status')renderStatus();else renderSet();
}
function renderSet(){
  const H=A.body; if(!H)return;
  const tw=document.querySelector('.topbar-wrap'); if(tw)document.documentElement.style.setProperty('--topbar-h',tw.offsetHeight+'px');
  if(!A.centers.length){H.innerHTML='<div class="att"><div class="empty-state">سنتری برای نمایش وجود ندارد</div></div>';return}
  const ed=canEdit(), w1=add(A.week,6), nm=id=>(A.centers.find(c=>c.id===id)||{}).name||'—';
  let badge='';
  if(A.role==='center'){const nl=DN.filter((_,k)=>!cOpen(add(A.week,k))).length;
    badge=!ed?'<span class="att-badge lock">🔒 قفل (توسط سرگروه/سرپرست)</span>':nl?'<span class="att-badge wait">'+faDigits(nl)+' روز قفل است</span>':'<span class="att-badge open">قابل ویرایش</span>'}
  const canReq=false;
  const reqs=A.pending.map(r=>`<div class="att-req"><span>درخواست باز کردن قفل از <b>${e(nm(r.center_id))}</b> — هفته ${fdate(r.week_start)} تا ${fdate(add(r.week_start,6))}${r.reason?' — '+e(r.reason):''}</span><span class="att-sp"></span><button class="kb-btn" data-ap="${e(r.id)}" type="button">تأیید</button><button class="kb-btn ghost" data-rj="${e(r.id)}" type="button">رد</button></div>`).join('');
  const pool=ed?`<div class="att-pool"><b>${A.role!=='center'?`نیروهای «${e(nm(A.sel))}» (${faDigits(ags().length)} نفر)`:'نیروها'}<br>بکشید و در روز مورد نظر رها کنید</b>${ags().map(a=>`<span class="att-ch pool" data-ag="${e(a.id)}">${e(a.name)}</span>`).join('')||'<span class="kb-empty">نیرویی به این سنتر اساین نشده</span>'}</div>`:'';
  const chip=x=>`<div class="att-ch${(A.role==='center'&&x.status==='suspended')||!dayOpen(x.day)?' nodrag':''}" data-en="${e(x.id)}" style="--c:${ST[x.status][1]}">${e(aname(x.agent_id))}<small>${chipSub(x)}</small></div>`;
  const SH={morning:'☀ صبح',night:'🌙 شب'};
  const lane=(d,sh,list)=>`<div class="att-lane" data-shift="${sh}"><div class="att-ln"><span>${SH[sh]}</span>${dayOpen(d)?`<button type="button" data-all="${d}|${sh}">+ همه</button>`:''}</div><div class="att-lc">${list.filter(x=>(x.shift||'morning')===sh).map(chip).join('')}</div></div>`;
  const cols=DN.map((n,i)=>{const d=add(A.week,i),list=dayEn(d).sort((a,b)=>aname(a.agent_id).localeCompare(aname(b.agent_id),'fa')),cp=capped(d),act=actN(d);
    return `<div class="att-col${A.hol[d]?' hol':''}" data-day="${d}"><div class="att-h"><b>${n}</b><span>${fdate(d)}</span>${A.hol[d]?`<em>${e(A.hol[d])}</em>`:i===6?'<em>جمعه</em>':''}${cp?`<small class="${act>=cap()?'full':''}">${faDigits(act)} از ${faDigits(cap())} فعال</small>`:''}${!cOpen(d)?'<small class="full">🔒 قفل</small>':''}${mgr()?`<button type="button" data-lk="${d}">${cOpen(d)?'🔒 قفل کن':'🔓 باز کن'}</button>`:''}</div><div class="att-chs">${lane(d,'morning',list)}${lane(d,'night',list)}</div></div>`}).join('');
  
  H.innerHTML=`<div class="att">${nextBar()}<div class="att-bar"><div class="att-nav"><button class="kb-btn ghost" id="a-prev" type="button">هفته قبل</button><span>${fdate(A.week)} تا ${fdate(w1)} ${fyear(w1)}</span><button class="kb-btn ghost" id="a-next" type="button">هفته بعد</button></div>${badge}<span class="att-sp"></span>
  ${A.role!=='center'?`<select id="a-c">${A.centers.map(c=>`<option value="${e(c.id)}">${e(c.name)}</option>`).join('')}</select><button class="kb-btn ghost" id="a-sus" type="button">تعلیق کاربر</button>`:''}
  ${sup()?'<button class="kb-btn ghost" id="a-hol" type="button">تعطیلات رسمی</button>':''}${mgr()?`<span class="att-lk"><button class="kb-btn ghost" id="a-lkw" type="button">🔒 قفل هفته</button><button class="kb-btn ghost" id="a-ukw" type="button">🔓 باز کردن هفته</button><label><input type="checkbox" id="a-lkall" ${A.lkAll?'checked':''}> اعمال روی همه سنترها</label></span>`:''}${ed?'<button class="kb-btn ghost" id="a-carry" type="button" title="چیدمان آخرین هفته‌ی ثبت‌شده را روی جاهای خالی این هفته اعمال می‌کند">📋 اعمال چیدمان هفته قبل</button>':''}${canReq?'<button class="kb-btn" id="a-req" type="button">درخواست باز کردن قفل</button>':''}</div>${reqs}<div class="att-wrap${ed?'':' nopool'}">${pool}<div class="att-grid">${cols}</div></div></div>`;
  const q=i=>H.querySelector(i); bindNext(H);
  q('#a-prev').onclick=()=>{A.week=add(A.week,-7);loadWeek()}; q('#a-next').onclick=()=>{A.week=add(A.week,7);loadWeek()};
  if(q('#a-c')){q('#a-c').value=A.sel;q('#a-c').onchange=ev=>{A.sel=ev.target.value;loadWeek()};q('#a-sus').onclick=suspendModal}
  if(q('#a-hol'))q('#a-hol').onclick=holModal;
  if(q('#a-carry'))q('#a-carry').onclick=async()=>{
    if(mgr()&&A.lkAll){await carryAllCenters();return}
    const n=await carryWeek(A.sel,A.week,{});
    toast(n<0?'چیدمانی در ۴ هفته‌ی قبل برای کپی پیدا نشد':n===0?'مورد جدیدی برای اعمال نبود':`${faDigits(n)} ردیف از هفته‌ی قبل اعمال شد`);
    await loadWeek()};
  H.querySelectorAll('[data-lk]').forEach(b=>b.onclick=()=>{const d=b.dataset.lk;setLock([d],cOpen(d),A.lkAll)});
  if(q('#a-lkall'))q('#a-lkall').onchange=ev=>{A.lkAll=ev.target.checked};
  if(q('#a-lkw'))q('#a-lkw').onclick=()=>setLock(wdays(),true,A.lkAll);
  if(q('#a-ukw'))q('#a-ukw').onclick=()=>setLock(wdays(),false,A.lkAll);
  H.querySelectorAll('[data-all]').forEach(b=>b.onclick=()=>{const[d,sh]=b.dataset.all.split('|');addAll(d,sh)});
  H.querySelectorAll('.att-ch').forEach(el=>el.addEventListener('pointerdown',ev=>dragStart(ev,el)));
}

async function loadStatus(){
  if(A.role==='leader'&&!A.allCenters){
    const r=await supabaseClient.from('profiles').select('id, full_name').eq('role','center').limit(2000);
    const own=new Set((A.centers||[]).map(c=>c.id)), m=new Map();
    (A.centers||[]).forEach(c=>m.set(c.id,c));
    (r.data||[]).forEach(x=>{if(!m.has(x.id))m.set(x.id,{id:x.id,name:x.full_name||'—'})});
    A.allCenters=[...m.values()].sort((x,y)=>(own.has(y.id)-own.has(x.id))||x.name.localeCompare(y.name,'fa'));
  }
  const ids=SC().map(c=>c.id), w1=add(A.week,6);
  if(!ids.length){A.st.data={entries:[],locks:{},unl:{}};return}
  const h=await supabaseClient.from(TH).select('*'); A.hol={}; (h.data||[]).forEach(x=>A.hol[x.day]=x.title||'تعطیل رسمی');
  const ca=await fetchAllRows((f,t)=>supabaseClient.from('center_agents').select('center_id, agent_id').in('center_id',ids).order('agent_id').range(f,t));
  const aids=[...new Set((ca.data||[]).map(x=>x.agent_id).filter(Boolean))];
  const pr=aids.length?await fetchAllRows((f,t)=>supabaseClient.from('profiles').select('id, full_name, status').in('id',aids).eq('role','agent').order('id').range(f,t)):{data:[]};
  const pm={}; (pr.data||[]).filter(x=>x.status!=='disabled').forEach(x=>pm[x.id]={id:x.id,name:x.full_name||'—'});
  ids.forEach(c=>{A.agents[c]=(ca.data||[]).filter(x=>x.center_id===c&&pm[x.agent_id]).map(x=>pm[x.agent_id]).sort((a,b)=>a.name.localeCompare(b.name,'fa'))});
  const er=await fetchAllRows((f,t)=>supabaseClient.from(TE).select('*').in('center_id',ids).gte('day',A.week).lte('day',w1).order('id').range(f,t));
  const lr=await supabaseClient.from('att_locks').select('*').in('center_id',ids).gte('day',A.week).lte('day',w1);
  const locks={},unl={}; (lr.data||[]).forEach(x=>locks[x.center_id+'|'+x.day]=x);
  A.st.data={entries:er.data||[],locks,unl}; if(er.error)toast('خواندن حضور و غیاب انجام نشد: '+er.error.message);
  // نفراتی که برای‌شون ورودی ثبت شده ولی تو لیست اساین اون سنتر نیستن هم نمایش داده می‌شن (مثل پنل خود سنتر)
  const ent=er.data||[], have={}; ids.forEach(c=>{have[c]=new Set((A.agents[c]||[]).map(a=>a.id))});
  const miss=[...new Set(ent.filter(x=>!have[x.center_id]||!have[x.center_id].has(x.agent_id)).map(x=>x.agent_id))];
  if(miss.length){
    const pn=await supabaseClient.from('profiles').select('id, full_name, status').in('id',miss).eq('role','agent');
    const nm={}; (pn.data||[]).filter(x=>x.status!=='disabled').forEach(x=>nm[x.id]=x.full_name||'—');
    ent.forEach(x=>{if(nm[x.agent_id]&&have[x.center_id]&&!have[x.center_id].has(x.agent_id)){have[x.center_id].add(x.agent_id);A.agents[x.center_id].push({id:x.agent_id,name:nm[x.agent_id]})}});
    ids.forEach(c=>A.agents[c].sort((a,b)=>a.name.localeCompare(b.name,'fa')));
  }
}
const SS={present:'حاضر',hourly:'ساعتی',leave:'مرخصی',weekly_off:'اف',suspended:'تعلیق'};
function renderStatus(){
  const H=A.body; if(!H)return;
  if(A.st.fsel===undefined)A.st.fsel=fLoad();
  if(!SC().length){H.innerHTML='<div class="att"><div class="empty-state">سنتری برای نمایش وجود ندارد</div></div>';return}
  const D=A.st.data||{entries:[],locks:{},unl:{}}, w1=add(A.week,6), days=wdays(), t=todayI();
  if(!(A.st.day>=A.week&&A.st.day<=w1))A.st.day=(t>=A.week&&t<=w1)?t:A.week;
  const day=A.st.day, wk=A.st.mode==='week';
  const fsel=A.st.fsel, selN=VC().length;
  const filterPanel=`<details class="as-fl" id="as-fl"${A.st.fo?' open':''}><summary class="as-fl-h"><span>🎯 انتخاب سنترها</span><b>${fsel?faDigits(selN)+' از '+faDigits(SC().length)+' سنتر انتخاب شده':'همه‌ی سنترها ('+faDigits(SC().length)+')'}</b><i class="as-sh-ar">▾</i></summary><div class="as-fl-b"><div class="as-fl-t"><input type="search" id="as-fq" placeholder="جستجوی نام سنتر…" value="${e(A.st.fq||'')}" autocomplete="off"><button class="kb-btn ghost" type="button" id="as-fall">انتخاب همه</button><button class="kb-btn ghost" type="button" id="as-fnone">حذف انتخاب</button></div><div class="as-fl-l">${SC().map(c=>`<label class="azki-chk as-fl-i" data-n="${e(c.name)}"><input type="checkbox" data-fc="${e(c.id)}"${!fsel||fsel.has(c.id)?' checked':''}><span>${e(c.name)}</span></label>`).join('')}<div class="as-fl-e" id="as-fl-e" style="display:none">سنتری با این نام پیدا نشد</div></div></div></details>`;
  const agentPanel=`<div class="as-fl as-aq"><div class="as-aq-h"><span>🔎 جستجوی کارشناس</span><input type="search" id="as-aq" placeholder="نام کارشناس (در همه‌ی سنترها)…" value="${e(A.st.aq||'')}" autocomplete="off"></div></div>`;
  const idx={}; D.entries.forEach(x=>{(idx[x.center_id+'|'+x.day]=idx[x.center_id+'|'+x.day]||{})[x.agent_id]=x});
  const stOpen=(c,d)=>{const L=D.locks[c+'|'+d];return L?!L.locked:true};
  const calc=(c,d)=>{const list=A.agents[c]||[],m=idx[c+'|'+d]||{},r={total:list.length,present:0,hourly:0,leave:0,weekly_off:0,suspended:0,none:0,mo:0,ni:0,reg:0};
    list.forEach(a=>{const x=m[a.id]; if(!x){r.none++;return} r.reg++; r[x.status]++; if(ACT.includes(x.status)){if((x.shift||'morning')==='night')r.ni++;else r.mo++}});
    r.act=r.present+r.hourly; r.cap=Math.max(1,Math.floor(r.total*PCT)); r.over=r.total>0&&(new Date(d+'T00:00:00Z').getUTCDay()===5||!!A.hol[d])&&r.act>r.cap; return r};
  const tot={total:0,present:0,hourly:0,leave:0,weekly_off:0,suspended:0,none:0};
  if(!wk)VC().forEach(c=>{const r=calc(c.id,day);Object.keys(tot).forEach(k=>tot[k]+=r[k])});
  const shiftSet={mo:new Map(),ni:new Map()};
  if(!wk)VC().forEach(c=>{(A.agents[c.id]||[]).forEach(a=>{const x=((idx[c.id+'|'+day]||{})[a.id]); if(!x||!ACT.includes(x.status))return;
    const k=(x.shift||'morning')==='night'?'ni':'mo', m=shiftSet[k], cur=m.get(a.id);
    if(cur){cur.centers.push(c.name)} else m.set(a.id,{name:a.name,hourly:x.status==='hourly',periods:x.periods,centers:[c.name]})})});
  const shList=k=>[...shiftSet[k].values()].sort((a,b)=>a.name.localeCompare(b.name,'fa'));
  const shBox=(k,title,color)=>{const l=shList(k);return `<details class="as-sh" data-k="${k}" style="--c:${color}"${(A.st.sh||{})[k]?' open':''}><summary class="as-sh-h"><span>${title}</span><b>${faDigits(l.length)} نفر</b><i class="as-sh-ar">▾</i></summary><div class="as-sh-l">${l.map(p=>`<span class="as-sh-p" title="${e(p.centers.join('، '))}">${e(p.name)}${p.hourly?'<small>ساعتی'+(p.periods&&p.periods.length?' '+fmtP(p.periods):'')+'</small>':''}</span>`).join('')||'<span class="as-sh-e">کسی برای این شیفت ثبت نشده</span>'}</div></details>`};
  const shiftPanel=!wk?`<div class="as-shifts">${shBox('mo','☀ شیفت صبح','#F59E0B')}${shBox('ni','🌙 شیفت شب','#4F46E5')}</div>`:'';
  const cards=!wk?`<div class="as-cards">${[['کل نیروها',tot.total,''],['حاضر',tot.present,'#1FA971'],['☀ شیفت صبح',shiftSet.mo.size,'#F59E0B'],['🌙 شیفت شب',shiftSet.ni.size,'#4F46E5'],['مرخصی ساعتی',tot.hourly,'#E08A17'],['مرخصی',tot.leave,'#7C5CE0'],['اف هفتگی',tot.weekly_off,'#8A94A6'],['تعلیق',tot.suspended,'#E0453F'],['ثبت‌نشده',tot.none,'#B0892B']].map(c=>`<div class="as-card" style="${c[2]?'--c:'+c[2]:''}"><span>${c[0]}</span><b>${faDigits(c[1])}</b></div>`).join('')}</div>`:'';
  const dayBar=!wk?`<div class="as-days">${days.map((d,i)=>`<button type="button" class="subtab-btn${d===day?' active':''}" data-sd="${d}">${DN[i]} ${fdate(d)}${A.hol[d]?' 🎌':''}</button>`).join('')}</div>`:'';
  const pill=(st,x)=>`<span class="as-pill" style="--c:${ST[st][1]}" title="${e(ST[st][0])}${x&&x.periods&&x.periods.length?' · '+fmtP(x.periods):''}">${SS[st]}</span>`;
  const rowsHtml=VC().map(c=>{
    const open=!!A.st.open[c.id], ag=A.agents[c.id]||[];
    let main='',detail='';
    if(!wk){
      const r=calc(c.id,day), pct=r.total?Math.round(r.act*100/r.total):0, lock=!stOpen(c.id,day);
      main=`<td class="as-n"><button type="button" class="as-ex" data-ex="${e(c.id)}">${open?'▾':'▸'}</button> <b${isOwn(c.id)?'':' class="as-other" title="این سنتر به شما اساین نشده؛ فقط مشاهده"'}>${e(c.name)}</b> ${lock?'<span title="قفل">🔒</span>':''}${r.over?`<span class="att-badge lock" title="سقف روز تعطیل/جمعه ${faDigits(r.cap)} نفر">بیش از سقف</span>`:''}${r.total&&!r.reg?'<span class="att-badge wait">ثبت نشده</span>':''}</td>
        <td>${faDigits(r.total)}</td><td style="color:#1FA971;font-weight:700">${faDigits(r.present)}</td><td>${faDigits(r.hourly)}</td><td>${faDigits(r.leave)}</td><td>${faDigits(r.weekly_off)}</td><td>${faDigits(r.suspended)}</td><td>${faDigits(r.none)}</td>
        <td>☀ ${faDigits(r.mo)} · 🌙 ${faDigits(r.ni)}</td><td><div class="as-bar"><i style="width:${pct}%"></i></div><small>${faDigits(r.act)} از ${faDigits(r.total)}</small></td>`;
      if(open)detail=`<tr class="as-d"><td colspan="10"><div class="as-ag">${ag.map(a=>{const x=(idx[c.id+'|'+day]||{})[a.id];return `<div class="as-a"><b>${e(a.name)}</b>${x?`${pill(x.status,x)}<small>${x.shift==='night'?'🌙 شب':'☀ صبح'}${x.periods&&x.periods.length&&(x.status==='present'||x.status==='hourly')?' · '+(x.status==='hourly'?'حضور ':'')+fmtP(x.periods):''}</small>`:'<span class="as-pill" style="--c:#B0892B">ثبت‌نشده</span>'}</div>`}).join('')||'<span class="kb-empty">نیرویی اساین نشده</span>'}</div>${isOwn(c.id)?`<button class="kb-btn ghost" type="button" data-ed="${e(c.id)}">ویرایش چیدمان این سنتر</button>`:''}</td></tr>`;
    }else{
      main=`<td class="as-n"><button type="button" class="as-ex" data-ex="${e(c.id)}">${open?'▾':'▸'}</button> <b${isOwn(c.id)?'':' class="as-other" title="این سنتر به شما اساین نشده؛ فقط مشاهده"'}>${e(c.name)}</b> <small>(${faDigits(ag.length)} نفر)</small></td>`+days.map(d=>{const r=calc(c.id,d);const cls=!r.total?'':r.over?'bad':!r.reg?'none':r.act===0?'warn':'ok';return `<td><span class="as-cell ${cls}" title="${DN[days.indexOf(d)]} ${fdate(d)}">${r.total?faDigits(r.act)+'/'+faDigits(r.total):'—'}${!stOpen(c.id,d)?' 🔒':''}</span></td>`}).join('');
      if(open)detail=`<tr class="as-d"><td colspan="8"><div class="as-w"><table class="as-tbl"><thead><tr><th>کارشناس</th>${days.map((d,i)=>`<th>${DN[i]}<br><small>${fdate(d)}</small></th>`).join('')}</tr></thead><tbody>${ag.map(a=>`<tr><td class="as-n"><b>${e(a.name)}</b></td>${days.map(d=>{const x=(idx[c.id+'|'+d]||{})[a.id];return `<td>${x?pill(x.status,x)+`<small>${x.shift==='night'?'🌙':'☀'}${x.periods&&x.periods.length&&(x.status==='present'||x.status==='hourly')?' '+fmtP(x.periods):''}</small>`:'<span class="as-pill" style="--c:#B0892B">—</span>'}</td>`}).join('')}</tr>`).join('')||`<tr><td colspan="8" class="kb-empty">نیرویی اساین نشده</td></tr>`}</tbody></table></div>${isOwn(c.id)?`<button class="kb-btn ghost" type="button" data-ed="${e(c.id)}">ویرایش چیدمان این سنتر</button>`:''}</td></tr>`;
    }
    return `<tr>${main}</tr>${detail}`}).join('')||`<tr><td colspan="10" class="kb-empty">هیچ سنتری انتخاب نشده؛ از «انتخاب سنترها» سنتر مورد نظر را تیک بزنید</td></tr>`;
  const head=!wk?'<th>سنتر</th><th>کل</th><th>حاضر</th><th>ساعتی</th><th>مرخصی</th><th>اف</th><th>تعلیق</th><th>ثبت‌نشده</th><th>شیفت</th><th>پوشش</th>':'<th>سنتر</th>'+days.map((d,i)=>`<th>${DN[i]}<br><small>${fdate(d)}</small></th>`).join('');
  H.innerHTML=`<div class="att">${nextBar()}<div class="att-bar"><div class="att-nav"><button class="kb-btn ghost" id="s-prev" type="button">هفته قبل</button><span>${fdate(A.week)} تا ${fdate(w1)} ${fyear(w1)}</span><button class="kb-btn ghost" id="s-next" type="button">هفته بعد</button></div><span class="att-sp"></span>
    <div class="subtabs" style="margin:0"><button class="subtab-btn${wk?'':' active'}" data-sm="day" type="button">نمای روزانه</button><button class="subtab-btn${wk?' active':''}" data-sm="week" type="button">نمای هفتگی</button></div>
    <button class="kb-btn ghost" id="s-carry" type="button" title="چیدمان آخرین هفته‌ی ثبت‌شده را روی جاهای خالی این هفته‌ی همه سنترها اعمال می‌کند">📋 اعمال چیدمان هفته قبل روی همه سنترها</button><button class="kb-btn ghost" id="s-all" type="button">باز/بسته کردن همه</button></div><div class="as-frow">${filterPanel}${agentPanel}</div><div class="as-aq-r" id="as-aq-r" style="display:none"></div>${dayBar}${cards}${shiftPanel}${!wk?'<div id="as-pc" class="as-pc"></div>':''}
    <div class="as-w"><table class="as-tbl"><thead><tr>${head}</tr></thead><tbody>${rowsHtml}</tbody></table></div></div>`;
  const q=i=>H.querySelector(i); bindNext(H);
  q('#s-prev').onclick=()=>{A.week=add(A.week,-7);loadWeek()}; q('#s-next').onclick=()=>{A.week=add(A.week,7);loadWeek()};
  H.querySelectorAll('[data-sm]').forEach(b=>b.onclick=()=>{A.st.mode=b.dataset.sm;renderStatus()});
  H.querySelectorAll('[data-sd]').forEach(b=>b.onclick=()=>{A.st.day=b.dataset.sd;renderStatus()});
  H.querySelectorAll('details.as-sh').forEach(d=>d.addEventListener('toggle',()=>{A.st.sh=A.st.sh||{};A.st.sh[d.dataset.k]=d.open}));
  H.querySelectorAll('[data-ex]').forEach(b=>b.onclick=()=>{const c=b.dataset.ex;A.st.open[c]=!A.st.open[c];renderStatus()});
  q('#s-carry').onclick=carryAllCenters;
  q('#s-all').onclick=()=>{const any=VC().some(c=>A.st.open[c.id]);VC().forEach(c=>A.st.open[c.id]=!any);renderStatus()};
  H.querySelectorAll('[data-ed]').forEach(b=>b.onclick=()=>{A.sel=b.dataset.ed;A.view='set';loadWeek()});

  const normQ=s=>String(s||'').replace(/ي/g,'ی').replace(/ك/g,'ک').trim().toLowerCase();
  const visItems=()=>[...H.querySelectorAll('.as-fl-i')].filter(l=>!l.classList.contains('hid'));
  const applyQ=()=>{const t=normQ(A.st.fq);let n=0;H.querySelectorAll('.as-fl-i').forEach(l=>{const ok=!t||normQ(l.dataset.n).includes(t);l.classList.toggle('hid',!ok);if(ok)n++});const em=q('#as-fl-e');if(em)em.style.display=n?'none':''};
  applyQ();
  const fSet=ids=>{const all=SC().map(c=>c.id);A.st.fsel=ids.length>=all.length&&all.every(i=>ids.includes(i))?null:new Set(ids);fSave();A.st.fo=true;renderStatus()};
  const curIds=()=>A.st.fsel?[...A.st.fsel].filter(i=>SC().some(c=>c.id===i)):SC().map(c=>c.id);
  q('#as-fl').addEventListener('toggle',()=>{A.st.fo=q('#as-fl').open});
  q('#as-fq').oninput=ev=>{A.st.fq=ev.target.value;applyQ()};
  H.querySelectorAll('[data-fc]').forEach(cb=>cb.onchange=()=>{const s=new Set(curIds());if(cb.checked)s.add(cb.dataset.fc);else s.delete(cb.dataset.fc);fSet([...s])});
  q('#as-fall').onclick=()=>{const s=new Set(curIds());visItems().forEach(l=>s.add(l.querySelector('input').dataset.fc));fSet([...s])};
  q('#as-fnone').onclick=()=>{const s=new Set(curIds());visItems().forEach(l=>s.delete(l.querySelector('input').dataset.fc));fSet([...s])};
  const fmtC=(cid,aid,d)=>{const x=(idx[cid+'|'+d]||{})[aid];return x?pill(x.status,x)+`<small>${x.shift==='night'?'🌙 شب':'☀ صبح'}${x.periods&&x.periods.length&&(x.status==='present'||x.status==='hourly')?' · '+(x.status==='hourly'?'حضور ':'')+fmtP(x.periods):''}</small>`:'<span class="as-pill" style="--c:#B0892B">ثبت‌نشده</span>'};
  const renderAq=()=>{const box=q('#as-aq-r'),t=normQ(A.st.aq);
    if(!t){box.style.display='none';box.innerHTML='';return}
    const rows=[]; SC().forEach(c=>(A.agents[c.id]||[]).forEach(a=>{if(normQ(a.name).includes(t))rows.push({c,a})}));
    box.style.display='';
    if(!rows.length){box.innerHTML='<div class="as-fl-e">کارشناسی با این نام پیدا نشد</div>';return}
    const cap=40,sh=rows.slice(0,cap),note=`<div class="as-aq-n">${faDigits(rows.length)} نتیجه${rows.length>cap?' (۴۰ مورد اول نمایش داده شد؛ جستجو را دقیق‌تر کنید)':''} — ${wk?'هفته‌ی '+fdate(A.week)+' تا '+fdate(w1):DN[days.indexOf(day)]+' '+fdate(day)}</div>`;
    box.innerHTML=note+(!wk
      ?sh.map(r=>`<div class="as-aq-row"><b>${e(r.a.name)}</b><span class="as-aq-c">${e(r.c.name)}</span>${fmtC(r.c.id,r.a.id,day)}</div>`).join('')
      :`<div class="as-w"><table class="as-tbl"><thead><tr><th>کارشناس</th>${days.map((d,i)=>`<th>${DN[i]}<br><small>${fdate(d)}</small></th>`).join('')}</tr></thead><tbody>${sh.map(r=>`<tr><td class="as-n"><b>${e(r.a.name)}</b><br><small>${e(r.c.name)}</small></td>${days.map(d=>`<td>${fmtC(r.c.id,r.a.id,d)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`)};
  q('#as-aq').oninput=ev=>{A.st.aq=ev.target.value;renderAq()};
  renderAq();

  // ===== کادر «حاضر در شیفت، ولی آنلاین نیست» (مقایسه‌ی حضور و غیاب با وضعیت لحظه‌ای پنل) در بازه‌ی ساعتی =====
  if(!wk){
    const box=q('#as-pc'); if(!box)return;
    const PCN=v=>String(v==null?'':v).normalize('NFKC').replace(/[‌​‍‎‏ _\-]/g,' ').replace(/[ً-ٰٟـ]/g,'').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[ۀە]/g,'ه').replace(/\s+/g,' ').trim();
    const nowH=()=>{try{return +new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tehran',hour:'2-digit',hour12:false}).format(new Date())%24}catch(_){return new Date().getHours()}};
    if(A.st.pf==null||A.st.pDay!==day){const h=(day===t)?nowH():8;A.st.pf=h;A.st.pt=Math.min(24,h+1);A.st.pDay=day}
    const ovl=(per,F,T)=>per.some(r=>{const s0=toM(r[0]);let e0=toE(r[1]);if(e0<=s0)e0+=1440;return s0<T&&e0>F});
    const compute=()=>{
      const F=A.st.pf*60,T=A.st.pt*60, pc=A.st.pc, seen=new Set(), out=[];
      const byName=new Map(); ((pc&&pc.rows)||[]).forEach(r=>{const k=PCN(r.full_name);if(!byName.has(k))byName.set(k,[]);byName.get(k).push(r)});
      VC().forEach(c=>(A.agents[c.id]||[]).forEach(a=>{
        const x=(idx[c.id+'|'+day]||{})[a.id]; if(!x||!ACT.includes(x.status)||seen.has(a.id))return;
        const per=(x.periods&&x.periods.length)?x.periods:[SHD[(x.shift||'morning')==='night'?'night':'morning']];
        if(!ovl(per,F,T))return; seen.add(a.id);
        let st='unk',act=false,cands=byName.get(PCN(a.name))||[];
        if(cands.length>1){const cn=PCN(c.name),m=cands.filter(r=>{const k=PCN(r.center_name);return k&&(cn.includes(k)||k.includes(cn))});if(m.length)cands=m}
        if(cands.length){act=cands.some(r=>r.is_active);st=cands.some(r=>r.is_active_to_issue)?'on':'off'}
        out.push({name:a.name,center:c.name,per,hourly:x.status==='hourly',shift:x.shift,st,act});
      }));
      return out;
    };
    const draw=()=>{
      const pc=A.st.pc, list=compute(), off=list.filter(r=>r.st==='off'), unk=list.filter(r=>r.st==='unk'), on=list.filter(r=>r.st==='on');
      const srt=l=>l.sort((p,q2)=>p.center.localeCompare(q2.center,'fa')||p.name.localeCompare(q2.name,'fa'));
      const chip=r=>`<span class="as-sh-p" title="${e(r.center)}">${e(r.name)}<small>${e(r.center)} · ${fmtP(r.per)}${r.st==='off'&&r.act?' · پنل فعال ولی آنلاین نیست':''}</small></span>`;
      const grp=(title,l,color,open)=>`<details class="as-sh" style="--c:${color}"${open?' open':''}><summary class="as-sh-h"><span>${title}</span><b>${faDigits(l.length)} نفر</b><i class="as-sh-ar">▾</i></summary><div class="as-sh-l">${srt(l.slice()).map(chip).join('')||'<span class="as-sh-e">کسی نیست</span>'}</div></details>`;
      const hs=(sel,from,to,v)=>`<select id="${sel}">${Array.from({length:to-from+1},(_,i)=>from+i).map(h=>`<option value="${h}"${h===v?' selected':''}>${faDigits(String(h).padStart(2,'0'))}:۰۰</option>`).join('')}</select>`;
      const upd=pc&&pc.rows&&pc.rows.length?(()=>{const m=pc.rows.map(r=>r.updated_at).filter(Boolean).sort().pop();return m?new Date(m).toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tehran'}):''})():'';
      const warn=day!==t?'<div class="as-sh-e">وضعیت پنل لحظه‌ای است و برای امروز معتبر است؛ برای روزهای دیگر فقط برنامه‌ی حضور با وضعیت فعلی پنل مقایسه می‌شود.</div>':'';
      box.innerHTML=`<div class="as-pc-h"><b>🟢 حاضرها در بازه‌ی ساعتی و وضعیت پنلشان</b><span class="as-pc-f">از ${hs('pc-f',0,23,A.st.pf)} تا ${hs('pc-t',1,24,A.st.pt)}</span><button class="kb-btn ghost" id="pc-r" type="button">↻ به‌روزرسانی</button>${upd?`<small>آخرین بروزرسانی پنل: ${upd}</small>`:''}</div>${warn}`+
        (!pc?'<div class="as-sh-e">در حال دریافت وضعیت پنل…</div>':pc.err?`<div class="as-sh-e">خطا در دریافت وضعیت پنل: ${e(pc.err.message||'')}</div>`:
        `<div class="as-cards" style="margin-bottom:8px"><div class="as-card"><span>طبق برنامه در این بازه</span><b>${faDigits(list.length)}</b></div><div class="as-card" style="--c:#E0453F"><span>آنلاین نیستند</span><b>${faDigits(off.length)}</b></div><div class="as-card" style="--c:#1FA971"><span>آنلاین هستند</span><b>${faDigits(on.length)}</b></div><div class="as-card" style="--c:#B0892B"><span>پنل پیدا نشد</span><b>${faDigits(unk.length)}</b></div></div><div class="as-shifts">${grp('🔴 حاضر ولی آنلاین نیستند',off,'#E0453F',true)}${grp('🟢 حاضر و آنلاین',on,'#1FA971',false)}</div>${unk.length?grp('⚪ پنل در وضعیت پنل کارشناسان پیدا نشد',unk,'#B0892B',false):''}`);
      const f=box.querySelector('#pc-f'),to=box.querySelector('#pc-t');
      if(f)f.onchange=()=>{A.st.pf=+f.value;if(A.st.pt<=A.st.pf)A.st.pt=Math.min(24,A.st.pf+1);draw()};
      if(to)to.onchange=()=>{A.st.pt=+to.value;if(A.st.pf>=A.st.pt)A.st.pf=Math.max(0,A.st.pt-1);draw()};
      const r=box.querySelector('#pc-r'); if(r)r.onclick=()=>{A.st.pc=null;draw();ld()};
    };
    const ld=async()=>{
      if(!(typeof azkiAllowed==='function'&&azkiAllowed())){box.innerHTML='';return}
      const r=await supabaseClient.from('center_operators_status').select('full_name, center_name, is_active, is_active_to_issue, updated_at');
      A.st.pc={rows:r.data||[],err:r.error,t:Date.now()}; if(A.st.pcTimer)clearTimeout(A.st.pcTimer);
      if(A.body&&A.body.contains(box))draw();
    };
    if(typeof azkiAllowed==='function'&&azkiAllowed()){
      draw();
      if(!A.st.pc||Date.now()-A.st.pc.t>60000){ld()}
    }
  }
}
// کپی چیدمان آخرین هفته‌ی دارای ثبت (حداکثر ۴ هفته قبل) روی هفته‌ی داده‌شده، فقط برای جاهای خالی.
// فقط «حضور» و «اف هفتگی» منتقل می‌شن؛ مرخصی، مرخصی ساعتی و تعلیق موردی‌ان و منتقل نمی‌شن.
// سقف جمعه/تعطیل رعایت می‌شه و روزهای قفل (برای نقش سنتر) رد می‌شن. خروجی: تعداد ردیف ثبت‌شده، یا -1 اگه چیدمانی برای کپی نبود.
async function carryWeek(c,week,opts){
  const ag=A.agents[c]||[], ids=new Set(ag.map(a=>a.id)); if(!ids.size)return -1;
  let src=null,srcEn=[];
  for(let k=1;k<=4&&!srcEn.length;k++){
    const sw=add(week,-7*k);
    const r=await supabaseClient.from(TE).select('*').eq('center_id',c).gte('day',sw).lte('day',add(sw,6));
    const list=(r.data||[]).filter(x=>(x.status==='present'||x.status==='weekly_off')&&ids.has(x.agent_id));
    if(list.length){src=sw;srcEn=list}
  }
  if(!srcEn.length)return -1;
  const cur=await supabaseClient.from(TE).select('agent_id, day, status').eq('center_id',c).gte('day',week).lte('day',add(week,6));
  const taken=new Set((cur.data||[]).map(x=>x.agent_id+'|'+x.day)), actC={};
  (cur.data||[]).forEach(x=>{if(ACT.includes(x.status))actC[x.day]=(actC[x.day]||0)+1});
  const capN=Math.max(1,Math.floor(ids.size*PCT)), rows=[];
  for(const x of srcEn){
    const off=Math.round((new Date(x.day+'T00:00:00Z')-new Date(src+'T00:00:00Z'))/864e5), d=add(week,off);
    if(taken.has(x.agent_id+'|'+d))continue;
    if(!dayOpen(d))continue;
    const isCap=new Date(d+'T00:00:00Z').getUTCDay()===5||!!A.hol[d];
    if(isCap&&ACT.includes(x.status)){if((actC[d]||0)>=capN)continue;actC[d]=(actC[d]||0)+1}
    rows.push({center_id:c,agent_id:x.agent_id,day:d,status:x.status,shift:x.shift||'morning',periods:x.status==='present'?(x.periods||null):null});
  }
  if(rows.length){const r=await supabaseClient.from(TE).upsert(rows,{onConflict:'center_id,agent_id,day',ignoreDuplicates:true}); if(r.error){toast('اعمال چیدمان انجام نشد: '+r.error.message);return 0}}
  return rows.length;
}
async function carryAllCenters(){
  if(!confirm('چیدمان آخرین هفته‌ی ثبت‌شده روی همه‌ی سنترها اعمال شود؟ (فقط جاهای خالیِ این هفته پر می‌شود)'))return;
  await loadStatus(); let tot=0,cn=0;
  for(const c of A.centers){const n=await carryWeek(c.id,A.week,{}); if(n>0){tot+=n;cn++}}
  toast(tot?`چیدمان برای ${faDigits(cn)} سنتر اعمال شد (${faDigits(tot)} ردیف)`:'مورد جدیدی برای اعمال نبود');
  await loadWeek();
}
async function run(p,okMsg){const r=await p;if(r.error)toast(r.error.message);else if(okMsg)toast(okMsg);await loadWeek()}
async function addAll(d,sh){
  if(!dayOpen(d)){toast('این روز قفل است');return}
  const have=new Set(dayEn(d).map(x=>x.agent_id)); let rows=ags().filter(a=>!have.has(a.id)).map(a=>({center_id:A.sel,agent_id:a.id,day:d,status:'present',shift:sh||'morning'}));
  if(capped(d)){const free=cap()-actN(d);if(free<=0){toast(capMsg());return}if(rows.length>free){rows=rows.slice(0,free);toast(capMsg())}}
  if(rows.length)await run(supabaseClient.from(TE).insert(rows))
}
function dragStart(ev,el){
  if(ev.button>0)return;
  const isPool=el.classList.contains('pool'), en=isPool?null:A.entries.find(x=>x.id===el.dataset.en);
  const can=(en?dayOpen(en.day):canEdit())&&!el.classList.contains('nodrag'), sx=ev.clientX, sy=ev.clientY; let g=null,over=null,moved=false;
  const mv=m=>{ if(!can)return; if(!moved&&Math.hypot(m.clientX-sx,m.clientY-sy)<6)return;
    if(!moved){moved=true;const r=el.getBoundingClientRect();g=el.cloneNode(true);g.className='att-ch att-ghost';g.style.width=r.width+'px';document.body.appendChild(g);el.classList.add('drag');g._dx=sx-r.left;g._dy=sy-r.top}
    g.style.left=(m.clientX-g._dx)+'px';g.style.top=(m.clientY-g._dy)+'px';
    const t=document.elementFromPoint(m.clientX,m.clientY),c=t&&t.closest('.att-lane'); g.classList.toggle('out',!c&&!isPool); if(over!==c){if(over)over.classList.remove('over');over=c;if(over)over.classList.add('over')}};
  const up=()=>{document.removeEventListener('pointermove',mv);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',up);
    if(g)g.remove();el.classList.remove('drag');if(over)over.classList.remove('over');
    if(!moved){if(en)entryModal(en);return}
    if(over)drop(isPool?el.dataset.ag:null,en,over.closest('.att-col').dataset.day,over.dataset.shift);
    else if(en&&dayOpen(en.day))run(supabaseClient.from(TE).delete().eq('id',en.id),'از این روز حذف شد')};
  document.addEventListener('pointermove',mv);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',up);
}
function drop(agent,en,day,shift){
  const aid=agent||en.agent_id; shift=shift||'morning';
  if(!dayOpen(day)||(en&&!dayOpen(en.day))){toast('این روز قفل است');return}
  if(en&&en.day===day&&(en.shift||'morning')===shift)return;
  if(A.entries.some(x=>x.agent_id===aid&&x.day===day&&(!en||x.id!==en.id))){toast('این نفر در آن روز قبلاً ثبت شده است');return}
  if(!capOk(day,aid,en?en.status:'present')){toast(capMsg());return}
  if(en)run(supabaseClient.from(TE).update({day,shift}).eq('id',en.id));
  else run(supabaseClient.from(TE).insert({center_id:A.sel,agent_id:aid,day,status:'present',shift}));
}
function overlay(html){const ov=document.createElement('div');ov.className='kb-ov';ov.innerHTML='<div class="att-m">'+html+'</div>';document.body.appendChild(ov);
  const close=()=>ov.remove();ov.onmousedown=ev=>{if(ev.target===ov)close()};return{ov,close,q:i=>ov.querySelector(i)}}
// اعتبارسنجی بازه‌های حضور: «حضور» = مجموع بازه‌ها حداقل ۸ ساعت (می‌تواند چند بازه‌ی جدا باشد، مثلاً ۰۸–۱۲ و ۲۰–۲۴)؛
// «مرخصی ساعتی» = مجموع کمتر از ۸ ساعت. بازه‌ها نباید هم‌پوشانی داشته باشند.
function validPer(st,per){
  if(st!=='present'&&st!=='hourly')return{periods:null};
  const iv=[];
  for(const p of per){
    if(!p[0]||!p[1])continue;
    const s=toM(p[0]); let en=toE(p[1]);
    if(en<=s){if(st==='present')en+=1440;else return{err:'ساعت پایان هر بازه باید بعد از شروع آن باشد (۰۰:۰۰ یعنی پایان شبانه‌روز).'}}
    iv.push({p:p.slice(),s,en});
  }
  if(!iv.length)return{err:'حداقل یک بازه‌ی حضور وارد کنید.'};
  iv.sort((a,b)=>a.s-b.s);
  let tot=0;
  for(let i=0;i<iv.length;i++){if(i&&iv[i].s<iv[i-1].en)return{err:'بازه‌ها نباید هم‌پوشانی داشته باشند.'};tot+=iv[i].en-iv[i].s}
  if(st==='present'&&tot<REQ)return{err:'مجموع ساعت حضور کمتر از ۸ ساعت است؛ برای این حالت «مرخصی ساعتی» ثبت کنید.'};
  if(st==='hourly'&&tot>=REQ)return{err:'مجموع ساعت حضور ۸ ساعت یا بیشتر است؛ وضعیت «حضور» را انتخاب کنید.'};
  return{periods:iv.map(x=>x.p)};
}
const PER_HINT='بازه‌های حضور در این روز (ساعت‌ها ۲۴ ساعته است). «حضور» یعنی مجموع حداقل ۸ ساعت؛ لازم نیست پیوسته باشد (مثلاً ۰۸ تا ۱۲ و ۲۰ تا ۲۴). کمتر از ۸ ساعت «مرخصی ساعتی» است.';
// ویرایشگر بازه‌ها (مشترک بین پنجره‌ی سنتر/سرگروه و پنجره‌ی ایجنت)
function perEditor(m,per,getSt,getSh){
  const rows=()=>{m.q('#x-rows').innerHTML=per.map((p,i)=>`<div class="rw" style="margin-bottom:6px">از ${tp(p[0],`data-i="${i}" data-k="0"`)} تا ${tp(p[1],`data-i="${i}" data-k="1"`)}${per.length>1?`<button class="kb-btn ghost" type="button" data-rm="${i}">✕</button>`:''}</div>`).join('');
    m.q('#x-rows').querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{per.splice(+b.dataset.rm,1);rows()})};
  m.ov.addEventListener('change',ev=>{const t=ev.target.closest&&ev.target.closest('.tp'); if(!t)return; per[+t.dataset.i][+t.dataset.k]=tpv(t)});
  const isDef=(p,a,b)=>p.length===1&&p[0][0]===a[0]&&p[0][1]===a[1];
  const HD=['08:00','12:00'];
  let last=getSt();
  const sync=()=>{const st=getSt();
    if(st!==last){
      if(st==='present'&&isDef(per,HD)){per.length=0;per.push(SHD[getSh()].slice())}
      else if(st==='hourly'&&(isDef(per,SHD.morning)||isDef(per,SHD.night))){per.length=0;per.push(HD.slice())}
      last=st}
    m.q('#x-p').style.display=(st==='present'||st==='hourly')?'':'none';rows()};
  m.ov.querySelectorAll('input[name=x-s]').forEach(i=>i.onchange=sync);
  m.q('#x-add').onclick=()=>{per.push(['14:00','16:00']);rows()};
  sync();
  return{rows,reset:(old)=>{if(per.length===1&&isDef(per,SHD[old])){per.length=0;per.push(SHD[getSh()].slice());rows()}}};
}
function entryModal(en){
  const name=aname(en.agent_id);
  if(A.role==='center'&&en.status==='suspended'){toast('این نفر توسط سرگروه تعلیق شده و فقط سرگروه می‌تواند آن را تغییر دهد');return}
  if(!dayOpen(en.day)){toast('این روز قفل است');return}
  const sh=en.shift||'morning', sts=mgr()?Object.keys(ST):['present','hourly','leave','weekly_off'];
  const m=overlay(`<b>${e(name)} — ${DN[(new Date(en.day+'T00:00:00Z').getUTCDay()+1)%7]} ${fdate(en.day)} · ${SHN[sh]}</b>
   ${sts.map(k=>`<label><input type="radio" name="x-s" value="${k}" ${en.status===k?'checked':''}>${ST[k][0]}</label>`).join('')}
   <div id="x-p" style="display:none"><div style="font-size:12px;color:var(--ink-soft);margin-bottom:6px">${PER_HINT}</div><div id="x-rows"></div><button class="kb-btn ghost" id="x-add" type="button">+ بازه‌ی دیگر</button></div>
   <div class="azki-error" id="x-err"></div>
   <div class="acts"><button class="kb-btn" id="x-ok" type="button">ذخیره</button><button class="kb-btn ghost" id="x-x" type="button">انصراف</button><button class="kb-btn del" id="x-del" type="button">حذف از این روز</button></div>`);
  const per=((en.status==='hourly'||en.status==='present')&&en.periods&&en.periods.length?en.periods:(en.status==='hourly'?[['08:00','12:00']]:[SHD[sh]])).map(x=>x.slice());
  const cur=()=>m.q('input[name=x-s]:checked').value;
  perEditor(m,per,cur,()=>sh);
  m.q('#x-x').onclick=m.close;
  m.q('#x-del').onclick=()=>{m.close();run(supabaseClient.from(TE).delete().eq('id',en.id))};
  m.q('#x-ok').onclick=()=>{
    const st=cur(),fail=t=>{m.q('#x-err').textContent=t;m.q('#x-err').style.display='block'};
    if(!capOk(en.day,en.agent_id,st))return fail(capMsg());
    const v=validPer(st,per); if(v.err)return fail(v.err);
    m.close();run(supabaseClient.from(TE).update({status:st,periods:v.periods}).eq('id',en.id));
  };
}
function suspendModal(){
  const a=ags(); if(!a.length){toast('این سنتر نیرویی ندارد');return}
  const m=overlay(`<b>تعلیق کاربر</b><select id="s-a">${a.map(x=>`<option value="${e(x.id)}">${e(x.name)}</option>`).join('')}</select>
   <div class="days">${DN.map((n,i)=>{const d=add(A.week,i);return `<label><input type="checkbox" value="${d}" ${d>=todayI()?'checked':''}>${n} ${fdate(d)}</label>`}).join('')}</div>
   <div class="acts"><button class="kb-btn del" id="s-ok" type="button">اعمال تعلیق</button><button class="kb-btn ghost" id="s-x" type="button">انصراف</button></div>`);
  m.q('#s-x').onclick=m.close;
  m.q('#s-ok').onclick=()=>{const ag=m.q('#s-a').value,days=[...m.ov.querySelectorAll('.days input:checked')].map(i=>i.value); if(!days.length)return; m.close();
    const rows=days.map(d=>{const x=A.entries.find(y=>y.agent_id===ag&&y.day===d);return Object.assign(x?{id:x.id}:{},{center_id:A.sel,agent_id:ag,day:d,status:'suspended',periods:null})});
    run(supabaseClient.from(TE).upsert(rows,{onConflict:'center_id,agent_id,day'}),'تعلیق ثبت شد')};
}
async function holModal(){
  const r=await supabaseClient.from(TH).select('*').order('day',{ascending:false}), cy=tehranTodayJalali()[0];
  const m=overlay(`<b>تعطیلات رسمی</b><div class="rw"><select id="h-d">${Array.from({length:31},(_,i)=>`<option value="${i+1}">${faDigits(i+1)}</option>`).join('')}</select><select id="h-m">${JMF.map((n,i)=>`<option value="${i+1}">${n}</option>`).join('')}</select><select id="h-y">${[cy-1,cy,cy+1].map(y=>`<option value="${y}" ${y===cy?'selected':''}>${faDigits(y)}</option>`).join('')}</select></div>
   <input id="h-t" placeholder="عنوان تعطیلی (مثلاً نوروز)"><div class="azki-error" id="h-err"></div>
   <div class="acts"><button class="kb-btn" id="h-ok" type="button">افزودن</button><button class="kb-btn ghost" id="h-x" type="button">بستن</button></div>
   <div id="h-l" style="max-height:220px;overflow:auto">${(r.data||[]).map(h=>`<div class="att-hl"><span>${fdate(h.day)} ${fyear(h.day)} — ${e(h.title||'')}</span><button class="kb-btn ghost" data-d="${escHtml(h.day)}" type="button">حذف</button></div>`).join('')||'<div class="kb-empty">موردی ثبت نشده</div>'}</div>`);
  m.q('#h-x').onclick=m.close;
  m.q('#h-ok').onclick=async()=>{const y=+m.q('#h-y').value,mo=+m.q('#h-m').value,d=+m.q('#h-d').value,g=jalaliToGregorian(y,mo,d),[gy,gm,gd]=g.split('-').map(Number),b=gregorianToJalali(gy,gm,gd);
    if(b[1]!==mo||b[2]!==d){m.q('#h-err').textContent='این تاریخ وجود ندارد.';m.q('#h-err').style.display='block';return}
    const x=await supabaseClient.from(TH).upsert({day:g,title:m.q('#h-t').value.trim()||'تعطیل رسمی'});
    if(x.error){m.q('#h-err').textContent=x.error.message;m.q('#h-err').style.display='block';return}
    m.close();await loadWeek();holModal()};
  m.ov.querySelectorAll('[data-d]').forEach(b=>b.onclick=async()=>{await supabaseClient.from(TH).delete().eq('day',b.dataset.d);m.close();await loadWeek();holModal()});
}
// ===== نمای ایجنت: ثبت حضور و غیاب توسط خود کارشناس =====
// قفل روز، سقف جمعه/تعطیل، حداقل ۸ ساعت و تعلیق سمت دیتابیس هم از طریق توابع att_agent_* اعمال می‌شوند (فایل attendance_agent.sql).
const rpcErr=r=>{const m=String((r.error&&r.error.message)||''),c=String((r.error&&r.error.code)||'');return /PGRST202|42883|Could not find the function|schema cache/i.test(c+' '+m)?'امکان ثبت حضور هنوز در دیتابیس فعال نشده؛ فایل attendance_agent.sql را در Supabase اجرا کنید.':m};
async function loadAgentWeek(){
  const r=await supabaseClient.rpc('att_agent_week',{p_week:A.week,p_center:A.sel||null});
  if(r.error){A.ag=null;A.agErr=rpcErr(r)}
  else{A.ag=r.data;A.agErr='';A.centers=(r.data&&r.data.centers)||[];A.sel=(r.data&&r.data.center)||null}
  renderAgent();
}
async function agSet(day,status,shift,periods){
  const r=await supabaseClient.rpc('att_agent_set',{p_center:A.sel,p_day:day,p_status:status,p_shift:shift,p_periods:periods});
  if(r.error)toast(rpcErr(r));else toast('ثبت شد');
  await loadWeek();
}
async function agClear(day){
  if(!confirm('ثبت این روز حذف شود؟'))return;
  const r=await supabaseClient.rpc('att_agent_clear',{p_center:A.sel,p_day:day});
  if(r.error)toast(rpcErr(r));else toast('حذف شد');
  await loadWeek();
}
function renderAgent(){
  const H=A.host; if(!H)return;
  const g=A.ag, w1=add(A.week,6), t=todayI();
  const nav=x=>`<div class="att-bar"><div class="att-nav"><button class="kb-btn ghost" id="g-prev" type="button">هفته قبل</button><span>${fdate(A.week)} تا ${fdate(w1)} ${fyear(w1)}</span><button class="kb-btn ghost" id="g-next" type="button">هفته بعد</button></div>${x||''}</div>`;
  const bindNav=()=>{const p=H.querySelector('#g-prev'),n=H.querySelector('#g-next');if(p)p.onclick=()=>{A.week=add(A.week,-7);loadWeek()};if(n)n.onclick=()=>{A.week=add(A.week,7);loadWeek()}};
  if(!g){H.innerHTML=`<div class="att">${nav('')}<div class="empty-state">${e(A.agErr||'خطا در دریافت اطلاعات حضور و غیاب')}</div></div>`;bindNav();return}
  if(!g.center){H.innerHTML='<div class="att"><div class="empty-state">شما هنوز به هیچ سنتری اساین نشده‌اید؛ با سرگروه خود هماهنگ کنید.</div></div>';return}
  const days=g.days||[], nOpen=days.filter(d=>d.open).length;
  const badge=nOpen===0?'<span class="att-badge lock">🔒 قفل</span>':nOpen<days.length?'<span class="att-badge wait">بعضی روزها قفل است</span>':'<span class="att-badge open">قابل ویرایش</span>';
  const csel=(A.centers||[]).length>1?`<span class="att-sp"></span><select id="g-c">${A.centers.map(c=>`<option value="${e(c.id)}">${e(c.name)}</option>`).join('')}</select>`:'<span class="att-sp"></span>';
  const cnt={}; days.forEach(d=>{if(d.mine)cnt[d.mine.status]=(cnt[d.mine.status]||0)+1});
  const none=days.filter(d=>!d.mine).length;
  const sum=Object.keys(ST).filter(k=>cnt[k]).map(k=>`<span class="as-pill" style="--c:${ST[k][1]}">${ST[k][0]} ${faDigits(cnt[k])}</span>`).join('')+(none?`<span class="as-pill" style="--c:#B0892B">ثبت‌نشده ${faDigits(none)}</span>`:'');
  const rules=`<details class="ag-rules"><summary>قوانین ثبت حضور</summary><ul><li>فقط روزهایی که قفل نیستند قابل ثبت‌اند (روزها به‌صورت پیش‌فرض باز هستند و فقط در صورت قفل‌شدن توسط سرگروه بسته می‌شوند؛ برای باز شدن با سنتر خود هماهنگ کنید).</li><li>در جمعه و تعطیلات رسمی حداکثر ${faDigits(Math.round(PCT*100))}٪ نفرات سنتر (${faDigits(g.cap)} نفر از ${faDigits(g.agents)} نفر) می‌توانند فعال باشند؛ برای بقیه مرخصی ثبت کنید.</li><li>«حضور» یعنی مجموع حداقل ۸ ساعت؛ لازم نیست پیوسته باشد (مثلاً ۰۸ تا ۱۲ و ۲۰ تا ۲۴). کمتر از آن «مرخصی ساعتی» است.</li><li>تعلیق را فقط سرگروه تغییر می‌دهد.</li></ul></details>`;
  const cards=days.map((d,i)=>{
    const m=d.mine, sus=!!m&&m.status==='suspended', myAct=!!m&&ACT.includes(m.status), full=d.capped&&!myAct&&d.active>=g.cap;
    const sh=m?(m.shift||'morning'):'morning';
    const per=m?(m.periods&&m.periods.length?m.periods:(m.status==='present'?[SHD[sh]]:null)):null;
    const st=m?`<span class="as-pill" style="--c:${ST[m.status][1]}">${ST[m.status][0]}</span><span>${sh==='night'?'🌙 شب':'☀ صبح'}${per&&(m.status==='present'||m.status==='hourly')?' · '+(m.status==='hourly'?'حضور ':'')+fmtP(per):''}</span>`:'<span class="as-pill" style="--c:#B0892B">ثبت‌نشده</span>';
    let act='';
    if(sus)act='<span class="ag-note">تعلیق — فقط سرگروه</span>';
    else if(!d.open)act='<span class="ag-note">🔒 قفل</span>';
    else if(!m)act=`<button class="kb-btn ghost" type="button" data-q="${d.day}|morning" ${full?'disabled title="ظرفیت تکمیل است"':''}>☀ صبح</button><button class="kb-btn ghost" type="button" data-q="${d.day}|night" ${full?'disabled title="ظرفیت تکمیل است"':''}>🌙 شب</button><button class="kb-btn ghost" type="button" data-m="${d.day}">سایر</button>`;
    else act=`<button class="kb-btn ghost" type="button" data-m="${d.day}">ویرایش</button><button class="kb-btn del" type="button" data-x="${d.day}">حذف</button>`;
    const hol=d.holiday?`<em>${e(d.holiday)}</em>`:i===6?'<em>جمعه</em>':'';
    const cp=d.capped?`<small class="${d.active>=g.cap?'full':''}">${faDigits(d.active)} از ${faDigits(g.cap)} فعال</small>`:'';
    return `<div class="ag-day${d.holiday?' hol':''}${d.day===t?' today':''}" style="${m?'--c:'+ST[m.status][1]:''}"><div class="ag-d"><b>${DN[i]}</b><span>${fdate(d.day)}</span>${hol}${cp}</div><div class="ag-st">${st}</div><div class="ag-act">${act}</div></div>`;
  }).join('');
  H.innerHTML=`<div class="att">${nav(badge+csel)}<div class="ag-top">${sum}</div>${rules}<div class="ag-list">${cards}</div></div>`;
  bindNav();
  const cs=H.querySelector('#g-c'); if(cs){cs.value=A.sel;cs.onchange=ev=>{A.sel=ev.target.value;loadWeek()}}
  H.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>{const[dd,sh]=b.dataset.q.split('|');agSet(dd,'present',sh,null)});
  H.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>agentModal(b.dataset.m));
  H.querySelectorAll('[data-x]').forEach(b=>b.onclick=()=>agClear(b.dataset.x));
}
function agentModal(day){
  const g=A.ag, di=g.days.findIndex(x=>x.day===day), d=g.days[di], en=d.mine;
  if(!d.open){toast('این روز قفل است');return}
  if(en&&en.status==='suspended'){toast('شما در این روز تعلیق شده‌اید و فقط سرگروه می‌تواند آن را تغییر دهد');return}
  let sh=en?(en.shift||'morning'):'morning';
  const sts=['present','hourly','leave','weekly_off'], myAct=!!en&&ACT.includes(en.status), full=d.capped&&!myAct&&d.active>=g.cap;
  const m=overlay(`<b>${DN[di]} ${fdate(day)}</b>
   <div class="rw"><span>شیفت:</span><label><input type="radio" name="x-sh" value="morning" ${sh==='morning'?'checked':''}>☀ صبح</label><label><input type="radio" name="x-sh" value="night" ${sh==='night'?'checked':''}>🌙 شب</label></div>
   <div class="ag-sts">${sts.map(k=>`<label><input type="radio" name="x-s" value="${k}" ${(en?en.status:'present')===k?'checked':''}>${ST[k][0]}</label>`).join('')}</div>
   <div id="x-p" style="display:none"><div style="font-size:12px;color:var(--ink-soft);margin-bottom:6px">${PER_HINT}</div><div id="x-rows"></div><button class="kb-btn ghost" id="x-add" type="button">+ بازه‌ی دیگر</button></div>
   <div class="azki-error" id="x-err"></div>
   <div class="acts"><button class="kb-btn" id="x-ok" type="button">ذخیره</button><button class="kb-btn ghost" id="x-x" type="button">انصراف</button>${en?'<button class="kb-btn del" id="x-del" type="button">حذف از این روز</button>':''}</div>`);
  const per=((en&&(en.status==='hourly'||en.status==='present')&&en.periods&&en.periods.length)?en.periods:(en&&en.status==='hourly'?[['08:00','12:00']]:[SHD[sh]])).map(x=>x.slice());
  const cur=()=>m.q('input[name=x-s]:checked').value;
  const pe=perEditor(m,per,cur,()=>sh);
  m.ov.querySelectorAll('input[name=x-sh]').forEach(i=>i.onchange=()=>{const old=sh;sh=i.value;pe.reset(old)});
  m.q('#x-x').onclick=m.close;
  if(m.q('#x-del'))m.q('#x-del').onclick=()=>{m.close();agClear(day)};
  m.q('#x-ok').onclick=async()=>{
    const st=cur(), fail=t=>{m.q('#x-err').textContent=t;m.q('#x-err').style.display='block'};
    if(full&&ACT.includes(st))return fail(capMsg(g.cap));
    const v=validPer(st,per); if(v.err)return fail(v.err);
    const b=m.q('#x-ok'); b.disabled=true;
    const r=await supabaseClient.rpc('att_agent_set',{p_center:A.sel,p_day:day,p_status:st,p_shift:sh,p_periods:v.periods});
    if(r.error){b.disabled=false;return fail(rpcErr(r))}
    m.close(); toast('ثبت شد'); loadWeek();
  };
}
window.attOpen=async function(host){
  A.host=host; host.classList.add('att-host'); if(!host.innerHTML.trim())host.innerHTML='<div class="loading-state">در حال بارگذاری...</div>';
  if(!A.centers)await init();
  if(!A.week)A.week=wstart(todayI()); // هفته‌ی جاری برای همه‌ی نقش‌ها (قبلاً سنتر/کارشناس روی هفته‌ی بعد باز می‌شد و هفته‌ی بازشده توسط سرگروه را نمی‌دیدند)
  await loadWeek();
};
})();
