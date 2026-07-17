// Client app - bilingual FR/AR
(function(){
  const state = { lang: localStorage.getItem('lang') || 'fr', user: null };

  // ---------- i18n ----------
  function applyLang(){
    document.body.classList.toggle('rtl', state.lang === 'ar');
    document.documentElement.lang = state.lang;
    document.querySelectorAll('[data-fr]').forEach(el => {
      const t = el.getAttribute('data-' + state.lang);
      if (t) el.textContent = t;
    });
    document.getElementById('langBtn').textContent = state.lang === 'fr' ? 'العربية' : 'Français';
    localStorage.setItem('lang', state.lang);
  }
  document.getElementById('langBtn').addEventListener('click', () => {
    state.lang = state.lang === 'fr' ? 'ar' : 'fr';
    applyLang();
  });

  // ---------- Tabs ----------
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const view = tab.dataset.view;
      document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
      document.getElementById('view-' + view).classList.remove('hidden');
      if (view === 'feed') loadFeed();
      if (view === 'winner') loadWinner();
      if (view === 'me') loadMe();
      if (view === 'post') refreshAuthUI();
    });
  });

  // ---------- Messages ----------
  function msg(text, type='ok'){
    const box = document.getElementById('msg');
    box.innerHTML = `<div class="alert ${type==='err'?'err':'ok'}">${text}</div>`;
    setTimeout(()=>{ box.innerHTML=''; }, 5000);
  }
  const T = {
    login_ok:   {fr:'Connecté !', ar:'تم الدخول!'},
    register_ok:{fr:'Compte créé !', ar:'تم إنشاء الحساب!'},
    post_ok:    {fr:'Publication envoyée, en attente de validation.', ar:'تم النشر، بانتظار المراجعة.'},
    vote_ok:    {fr:'Vote enregistré !', ar:'تم التصويت!'},
    err_generic:{fr:'Erreur, réessaie.', ar:'خطأ، حاول مرة أخرى.'},
    err_login:  {fr:'Pseudo ou mot de passe incorrect', ar:'اسم المستخدم أو كلمة السر خاطئة'},
    err_taken:  {fr:'Ce pseudo est déjà pris', ar:'اسم المستخدم مأخوذ'},
    err_email:  {fr:'Cet email est déjà utilisé', ar:'هذا البريد الإلكتروني مستخدم بالفعل'},
    err_device: {fr:'Un compte existe déjà sur cet appareil', ar:'يوجد حساب على هذا الجهاز'},
    err_invalid:{fr:'Vérifie tes informations (email valide, pseudo ≥ 3, mot de passe ≥ 4)', ar:'تحقق من المعلومات (بريد صالح، اسم ≥ 3، كلمة سر ≥ 4)'},
    err_auth:   {fr:'Connecte-toi d\'abord', ar:'سجّل الدخول أولاً'},
    err_voted:  {fr:'Tu as déjà voté pour cette publication', ar:'صوّت مسبقاً على هذا المنشور'},
    err_own:    {fr:'Tu ne peux pas voter sur ta propre publication', ar:'لا يمكنك التصويت على منشورك'},
    err_month:  {fr:'Tu as déjà une publication ce mois-ci (1 seule par mois autorisée)', ar:'لديك منشور هذا الشهر بالفعل (منشور واحد في الشهر فقط)'},
    err_rate:   {fr:'Trop de tentatives. Réessaie dans quelques minutes.', ar:'محاولات كثيرة. انتظر قليلاً.'},
    voted:      {fr:'✓ Voté', ar:'✓ تم'},
    vote:       {fr:'♥ Voter', ar:'♥ صوّت'},
    pts:        {fr:'pts', ar:'نقطة'},
    votes:      {fr:'votes', ar:'صوت'},
    my_posts:   {fr:'Mes publications', ar:'منشوراتي'},
    status_pending: {fr:'En attente', ar:'قيد المراجعة'},
    status_approved:{fr:'Approuvé', ar:'موافق'},
    status_rejected:{fr:'Rejeté', ar:'مرفوض'},
    status_winner:  {fr:'🏆 Gagnant', ar:'🏆 الفائز'},
    logout:     {fr:'Se déconnecter', ar:'خروج'},
    hello:      {fr:'Salut', ar:'مرحبا'},
    no_posts:   {fr:'Tu n\'as encore rien publié.', ar:'لم تنشر بعد.'},
  };
  const t = k => (T[k] && T[k][state.lang]) || k;

  // ---------- Device ID (léger anti-triche côté client) ----------
  function deviceId(){
    let d = localStorage.getItem('device_id');
    if (!d) { d = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('device_id', d); }
    return d;
  }

  // ---------- API ----------
  async function api(url, opts={}){
    const res = await fetch(url, { credentials:'same-origin', ...opts });
    const data = await res.json().catch(()=>({}));
    return { ok: res.ok, status: res.status, data };
  }

  // ---------- Session ----------
  async function loadMeUser(){
    const r = await api('/api/me');
    state.user = r.data.user;
    refreshAuthUI();
  }
  function refreshAuthUI(){
    const auth = document.getElementById('authBlock');
    const form = document.getElementById('postFormBlock');
    if (state.user){ auth.classList.add('hidden'); form.classList.remove('hidden'); }
    else { auth.classList.remove('hidden'); form.classList.add('hidden'); }
  }

  document.getElementById('btnRegister').addEventListener('click', async () => {
    const pseudo = document.getElementById('authPseudo').value.trim();
    const email = (document.getElementById('authEmail').value || '').trim();
    const password = document.getElementById('authPass').value;
    const r = await api('/api/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ pseudo, email, password, deviceId: deviceId() }) });
    if (r.ok){ state.user = { pseudo }; refreshAuthUI(); msg(t('register_ok')); }
    else if (r.data.error === 'pseudo_taken') msg(t('err_taken'), 'err');
    else if (r.data.error === 'email_taken') msg(t('err_email'), 'err');
    else if (r.data.error === 'device_already_registered') msg(t('err_device'), 'err');
    else if (r.data.error === 'invalid_input') msg(t('err_invalid'), 'err');
    else if (r.data.error === 'too_many_requests') msg(t('err_rate'), 'err');
    else msg(t('err_generic'), 'err');
  });

  document.getElementById('btnLogin').addEventListener('click', async () => {
    const pseudo = document.getElementById('authPseudo').value.trim();
    const password = document.getElementById('authPass').value;
    const r = await api('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ pseudo, password }) });
    if (r.ok){ state.user = r.data; refreshAuthUI(); msg(t('login_ok')); }
    else if (r.data.error === 'too_many_requests') msg(t('err_rate'), 'err');
    else msg(t('err_login'), 'err');
  });

  // ---------- File inputs preview ----------
  document.querySelectorAll('.file-input input').forEach(inp => {
    inp.addEventListener('change', e => {
      const label = inp.closest('.file-input');
      const file = e.target.files[0];
      if (!file) return;
      label.classList.add('has-file');
      const existing = label.querySelector('img.file-preview');
      if (existing) existing.remove();
      const img = document.createElement('img');
      img.className = 'file-preview';
      img.src = URL.createObjectURL(file);
      label.appendChild(img);
    });
  });

  // ---------- Post form ----------
  document.getElementById('postForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = '...';
    const res = await fetch('/api/posts', { method:'POST', body: fd, credentials:'same-origin' });
    const data = await res.json().catch(()=>({}));
    btn.disabled = false; btn.textContent = state.lang==='fr' ? 'Publier' : 'نشر';
    if (res.ok){
      msg(t('post_ok'));
      e.target.reset();
      document.querySelectorAll('.file-input').forEach(l=>{ l.classList.remove('has-file'); const img=l.querySelector('img.file-preview'); if(img) img.remove(); });
    } else if (data.error === 'auth_required') msg(t('err_auth'), 'err');
    else if (data.error === 'already_posted_this_month') msg(t('err_month'), 'err');
    else msg(t('err_generic'), 'err');
  });

  // ---------- Feed ----------
  async function loadFeed(){
    const r = await api('/api/posts');
    const list = document.getElementById('postsList');
    const empty = document.getElementById('emptyFeed');
    list.innerHTML = '';
    if (!r.data.posts || r.data.posts.length === 0){
      empty.classList.remove('hidden'); return;
    }
    empty.classList.add('hidden');
    for (const p of r.data.posts){
      list.appendChild(renderPost(p));
    }
  }

  function renderPost(p){
    const div = document.createElement('div');
    div.className = 'post';
    const initial = (p.pseudo || '?')[0].toUpperCase();
    const text = state.lang === 'ar' ? (p.text_ar || p.text_fr || '') : (p.text_fr || p.text_ar || '');
    const date = new Date(p.created_at + 'Z').toLocaleDateString(state.lang==='ar'?'ar':'fr');
    const pointsPct = Math.min(100, (p.votes_count || 0) * 2);
    const voted = p.has_voted;
    const own = state.user && state.user.pseudo === p.pseudo;
    div.innerHTML = `
      <div class="post-head">
        <div class="avatar">${initial}</div>
        <div class="who">
          <div class="name">${escapeHtml(p.pseudo)}</div>
          <div class="date">${date}</div>
        </div>
        <div class="points-badge">${pointsPct} ${t('pts')}</div>
      </div>
      <div class="post-photos">
        <img class="p1" src="${p.photo1}" alt="">
        <img src="${p.photo2}" alt="">
        <div class="selfie-tag"><img src="${p.selfie}" alt="selfie" style="width:100%;height:100%;object-fit:cover;border-radius:10px"></div>
      </div>
      ${text ? `<div class="post-text">${escapeHtml(text)}</div>` : ''}
      <div class="progress"><div style="width:${pointsPct}%"></div></div>
      <div class="post-actions">
        <span class="votes-count">${p.votes_count} ${t('votes')}</span>
        <button class="vote-btn ${voted?'voted':''}" data-id="${p.id}" ${voted||own?'disabled':''}>
          ${voted ? t('voted') : t('vote')}
        </button>
      </div>
    `;
    div.querySelector('.vote-btn').addEventListener('click', () => vote(p.id, div));
    return div;
  }

  async function vote(id, div){
    if (!state.user){ msg(t('err_auth'), 'err'); return; }
    const r = await api('/api/posts/'+id+'/vote', { method:'POST' });
    if (r.ok){ msg(t('vote_ok')); loadFeed(); }
    else if (r.data.error === 'already_voted') msg(t('err_voted'), 'err');
    else if (r.data.error === 'cannot_vote_own') msg(t('err_own'), 'err');
    else if (r.data.error === 'auth_required') msg(t('err_auth'), 'err');
    else if (r.data.error === 'too_many_requests') msg(t('err_rate'), 'err');
    else msg(t('err_generic'), 'err');
  }

  // ---------- Winner ----------
  async function loadWinner(){
    const r = await api('/api/winner');
    const box = document.getElementById('winnerBox');
    const w = r.data.winner;
    if (!w){
      box.innerHTML = `<div class="card" style="text-align:center"><p>${state.lang==='fr'?'Pas encore de gagnant ce mois-ci.':'لا يوجد فائز حتى الآن.'}</p></div>`;
      return;
    }
    const pointsPct = Math.min(100, (w.votes_count||0)*2);
    box.innerHTML = `
      <div class="winner-card">
        <div class="crown">👑</div>
        <h3>${state.lang==='fr'?"Écologiste du mois":'بيئي الشهر'}</h3>
        <div class="win-name">${escapeHtml(w.pseudo)}</div>
        <div style="margin:10px 0">
          <img src="${w.selfie}" style="width:100px;height:100px;border-radius:50%;object-fit:cover;border:3px solid var(--gold);margin:0 auto">
        </div>
        <div style="font-size:22px;font-weight:700;color:var(--green-1)">${pointsPct}/100 ${t('pts')}</div>
        <p style="margin-top:8px;font-size:13px">${escapeHtml(state.lang==='ar'?(w.text_ar||w.text_fr||''):(w.text_fr||w.text_ar||''))}</p>
      </div>
    `;
  }

  // ---------- Me ----------
  async function loadMe(){
    const box = document.getElementById('meBlock');
    if (!state.user){
      box.innerHTML = `<div class="card"><p>${t('err_auth')}</p></div>`;
      return;
    }
    const r = await api('/api/posts/mine');
    let html = `
      <div class="card">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="avatar" style="width:48px;height:48px;font-size:20px">${(state.user.pseudo||'?')[0].toUpperCase()}</div>
          <div style="flex:1">
            <div style="font-weight:700;color:var(--green-1);font-size:18px">${escapeHtml(state.user.pseudo)}</div>
            <div style="font-size:12px;color:#777">${t('hello')} 👋</div>
          </div>
          <button class="btn-secondary" id="btnLogout">${t('logout')}</button>
        </div>
      </div>
      <div class="card"><h2>${t('my_posts')}</h2>
    `;
    if (!r.data.posts || r.data.posts.length===0){
      html += `<p>${t('no_posts')}</p>`;
    } else {
      for (const p of r.data.posts){
        const pct = Math.min(100,(p.votes_count||0)*2);
        html += `
          <div style="border-top:1px solid #eee;padding:10px 0">
            <div style="display:flex;gap:8px;align-items:center">
              <img src="${p.selfie}" style="width:44px;height:44px;object-fit:cover;border-radius:8px">
              <div style="flex:1">
                <div style="font-size:13px">${escapeHtml((state.lang==='ar'?p.text_ar:p.text_fr)||'').slice(0,80)}</div>
                <div style="font-size:11px;color:#777">${t('status_'+p.status)} · ${p.votes_count} ${t('votes')} · ${pct}/100</div>
              </div>
            </div>
          </div>`;
      }
    }
    html += `</div>`;
    box.innerHTML = html;
    document.getElementById('btnLogout').addEventListener('click', async ()=>{
      await api('/api/logout', {method:'POST'});
      state.user = null;
      refreshAuthUI();
      loadMe();
    });
  }

  function escapeHtml(s){
    return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ---------- Init ----------
  applyLang();
  loadMeUser().then(loadFeed);
})();
