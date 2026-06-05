/* ═══════════════════════════════════════════════════════════════
   ui.js — KPIs, navegación, tablas, filtros + Sistema Admin
   Depende de: window.Dash (parser.js)
   ═══════════════════════════════════════════════════════════════ */
(function () {

  /* ── Formateo ─────────────────────────────────────────────── */
  const fmt  = v => { if(v===null||isNaN(v)) return '—'; return (v<0?'-':'')+'$'+Math.abs(Math.round(v)).toLocaleString('es-MX'); };
  const fmtK = v => { if(v===null||isNaN(v)) return '—'; const a=Math.abs(v), s=v<0?'-':''; return a>=1e6?s+'$'+(a/1e6).toFixed(2)+'M':s+'$'+(a/1e3).toFixed(0)+'K'; };
  const avg  = arr => { const f=arr.filter(v=>v!==null&&!isNaN(v)); return f.length?f.reduce((s,v)=>s+v,0)/f.length:0; };

  /* ══════════════════════════════════════════════════════════
     SISTEMA DE ADMINISTRACIÓN — Multi-usuario con roles
     Roles:  'ventas' | 'ope' | 'admon'
     Permisos: cada usuario solo edita la tabla de su departamento.
     Credenciales hasheadas (PBKDF2) en data/users.json
  ══════════════════════════════════════════════════════════ */

  const ROLE_LABEL = {
    ventas:'Ventas',
    ope:'Operaciones',
    admon:'Administración',
    super:'Super Administrador'
  };
  const ROLE_PAGE  = { ventas:'tabla-v', ope:'tabla-o', admon:'tabla-a' };  // 'super' no auto-navega

  /* Helpers que dependen de window.Auth */
  function adminLogged()       { return window.Auth?.isLogged() === true; }
  function currentRole()       { return window.Auth?.role() || null; }
  function canEditSection(sec) { return window.Auth?.canEdit(sec) === true; }

  /* Toast de notificación */
  function toast(msg, type='success', ms=3000) {
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity='0'; t.style.transition='opacity .3s'; setTimeout(()=>t.remove(), 350); }, ms);
  }

  /* Crear overlay modal genérico */
  function createOverlay(content) {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = content;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if(e.target === ov) ov.remove(); });
    return ov;
  }

  /* Escape HTML básico para mostrar texto controlado por el usuario */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  /* Modal de Login (multi-usuario) */
  function showLoginModal() {
    const ov = createOverlay(`
      <div class="modal" id="modal-login">
        <div class="modal-title">🔐 Acceso por Departamento</div>
        <div class="modal-sub">Solo podrás editar la tabla de tu departamento</div>
        <label>Usuario</label>
        <input type="text" id="adm-user" placeholder="b3t0 / ventas / operaciones / administracion" autocomplete="username" autocapitalize="off" spellcheck="false">
        <label>Contraseña</label>
        <input type="password" id="adm-pass" placeholder="••••••••" autocomplete="current-password">
        <div class="modal-error" id="adm-error">❌ Usuario o contraseña incorrectos</div>
        <div class="modal-actions">
          <button class="btn-secondary" id="adm-cancel">Cancelar</button>
          <button class="btn-primary"   id="adm-submit">Entrar</button>
        </div>
      </div>`);

    const errEl  = ov.querySelector('#adm-error');
    const btn    = ov.querySelector('#adm-submit');
    const userEl = ov.querySelector('#adm-user');
    const passEl = ov.querySelector('#adm-pass');

    function showError(text) {
      errEl.textContent = text;
      errEl.classList.add('show');
      passEl.value = '';
      passEl.focus();
    }

    const doLogin = async () => {
      if (btn.disabled) return;
      errEl.classList.remove('show');
      btn.disabled = true;
      btn.textContent = 'Verificando…';
      try {
        const res = await window.Auth.login(userEl.value, passEl.value);
        if (res.ok) {
          ov.remove();
          activateAdminMode();
          const s = res.session;
          toast(`✅ Sesión iniciada — ${ROLE_LABEL[s.role]||s.role}`);
        } else if (res.reason === 'locked') {
          showError(`🔒 Demasiados intentos. Espera ${res.minutes} min.`);
        } else if (res.reason === 'no_users') {
          showError('⚠️ No se pudo cargar el catálogo de usuarios.');
        } else if (res.reason === 'empty') {
          showError('Completa usuario y contraseña.');
        } else {
          const left = (typeof res.remaining === 'number') ? ` · ${res.remaining} intento(s) restantes` : '';
          showError('❌ Credenciales inválidas' + left);
        }
      } catch (e) {
        showError('⚠️ Error: ' + (e.message||e));
      } finally {
        btn.disabled = false;
        btn.textContent = 'Entrar';
      }
    };

    btn.addEventListener('click', doLogin);
    ov.querySelector('#adm-cancel').addEventListener('click', () => ov.remove());
    passEl.addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
    userEl.addEventListener('keydown', e => { if(e.key==='Enter') passEl.focus(); });
    setTimeout(() => userEl.focus(), 50);
  }

  /* Modal cambio de contraseña */
  function showChangePasswordModal() {
    if (!adminLogged()) return;
    const u = window.Auth.user();
    const ov = createOverlay(`
      <div class="modal">
        <div class="modal-title">🔑 Cambiar mi contraseña</div>
        <div class="modal-sub">Usuario: <strong>${esc(u.username)}</strong> — mín. 8 caracteres</div>
        <label>Contraseña actual</label>
        <input type="password" id="cp-cur" autocomplete="current-password">
        <label>Contraseña nueva</label>
        <input type="password" id="cp-new" autocomplete="new-password">
        <label>Repetir contraseña nueva</label>
        <input type="password" id="cp-new2" autocomplete="new-password">
        <div class="modal-error" id="cp-err"></div>
        <div class="modal-actions">
          <button class="btn-secondary" id="cp-cancel">Cancelar</button>
          <button class="btn-primary"   id="cp-save">Guardar</button>
        </div>
      </div>`);
    const err = ov.querySelector('#cp-err');
    const showErr = (m) => { err.textContent = m; err.classList.add('show'); };

    ov.querySelector('#cp-cancel').addEventListener('click', () => ov.remove());
    ov.querySelector('#cp-save').addEventListener('click', async () => {
      err.classList.remove('show');
      const cur = ov.querySelector('#cp-cur').value;
      const n1  = ov.querySelector('#cp-new').value;
      const n2  = ov.querySelector('#cp-new2').value;
      if (n1 !== n2)     return showErr('Las contraseñas nuevas no coinciden');
      if (n1.length < 8) return showErr('Mínimo 8 caracteres');
      const res = await window.Auth.changeMyPassword(cur, n1);
      if (!res.ok) {
        if (res.reason === 'wrong_current') return showErr('Contraseña actual incorrecta');
        return showErr(res.message || 'No se pudo cambiar la contraseña');
      }
      // Descargar nuevo users.json para que el admin lo suba al repo
      const blob = new Blob([JSON.stringify(res.updatedDoc, null, 2)],{type:'application/json'});
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = 'users.json';
      a.click(); URL.revokeObjectURL(url);
      ov.remove();
      toast('🔑 users.json descargado — súbelo a data/ en GitHub', 'info', 6000);
    });
    setTimeout(() => ov.querySelector('#cp-cur').focus(), 50);
  }

  /* Activa modo admin en el DOM */
  function activateAdminMode() {
    document.body.classList.add('admin-mode');
    document.body.dataset.role = currentRole() || '';
    const btn = document.getElementById('btn-admin-login');
    btn.textContent = '🔓';
    btn.title = 'Cerrar sesión';
    btn.classList.add('active');
    const badge = document.getElementById('badge-admin');
    const u = window.Auth.user();
    if (badge) {
      badge.style.display = 'flex';
      badge.textContent = `⚡ ${u.name || ROLE_LABEL[u.role] || u.role}`;
      badge.title = `Usuario: ${u.username} · Rol: ${u.role}`;
    }
    // Re-render tablas en modo editable (si ya están construidas)
    ['tabla-v','tabla-o','tabla-a'].forEach(id => {
      if (builtPages[id]) {
        builtPages[id] = false;
        if (document.getElementById('page-' + id)?.classList.contains('active')) {
          showPage(id, null);
        }
      }
    });
    // Auto-navegar a la tabla del rol si estamos en una vista neutra
    const role = currentRole();
    if (role && ROLE_PAGE[role]) {
      const targetId = ROLE_PAGE[role];
      const targetTab = document.querySelector(`.tab[onclick*="'${targetId}'"]`);
      if (targetTab && !document.getElementById('page-'+targetId)?.classList.contains('active')) {
        showPage(targetId, targetTab);
      }
    }
  }

  function deactivateAdminMode() {
    window.Auth.logout();
    document.body.classList.remove('admin-mode');
    delete document.body.dataset.role;
    const btn = document.getElementById('btn-admin-login');
    btn.textContent = '🔒';
    btn.title = 'Acceso administrador';
    btn.classList.remove('active');
    const badge = document.getElementById('badge-admin');
    if (badge) { badge.style.display = 'none'; badge.textContent = '⚡ Modo Admin'; }
    // Re-render tablas para quitar editables
    ['tabla-v','tabla-o','tabla-a'].forEach(id => {
      if (builtPages[id]) {
        builtPages[id] = false;
        if (document.getElementById('page-' + id)?.classList.contains('active')) {
          showPage(id, null);
        }
      }
    });
    toast('Sesión cerrada', 'info');
  }

  /* Botón admin (ícono en header) */
  function initAdminButton() {
    const btn = document.getElementById('btn-admin-login');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (adminLogged()) {
        if (confirm('¿Cerrar sesión?')) deactivateAdminMode();
      } else {
        showLoginModal();
      }
    });
    // Restaurar sesión existente (sessionStorage) si la pestaña se recargó
    if (adminLogged()) activateAdminMode();
  }

  /* ── Secciones que el usuario actual puede editar ──────────── */
  // 'ventas'|'ope'|'admon' → solo esa; 'super' → las tres.
  function ownedSections() {
    const r = currentRole();
    if (r === 'super') return ['ventas','ope','admon'];
    if (['ventas','ope','admon'].includes(r)) return [r];
    return [];
  }

  /* ── Guardar cambios (localStorage) ────────────────────────── */
  // El override local SOLO conserva la(s) sección(es) propia(s). Así este
  // navegador nunca vuelve a aplicar (ni a subir) datos viejos de otros
  // departamentos sobre lo que ellos ya guardaron en el repo.
  function saveToLocalStorage() {
    const raw  = window.DashRaw;
    const secs = ownedSections();
    const payload = { _meta: raw._meta, _sections: secs };
    secs.forEach(s => {
      payload[s] = { cortes: raw[s].cortes, data: raw[s].data, metas: raw[s].metas };
    });
    localStorage.setItem('dashOverride', JSON.stringify(payload));
    toast('💾 Cambios guardados localmente');
  }

  /* ── Exportar JSON ─────────────────────────────────────────── */
  function exportJSON() {
    const raw = window.DashRaw;
    const blob = new Blob([JSON.stringify(raw, null, 2)], {type:'application/json'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'dash.json';
    a.click(); URL.revokeObjectURL(url);
    toast('📥 dash.json descargado — sube el archivo a tu repo de GitHub', 'info', 5000);
  }

  /* ════════════════════════════════════════════════════════════
     GUARDAR EN GITHUB — commit directo de dash.json al repositorio
     ════════════════════════════════════════════════════════════ */
  const GH_CONFIG = {
    owner:  'TornillosAguila',
    repo:   'bottest',
    branch: 'main',
    path:   'data/dash.json',
  };

  /* El token se guarda SOLO en sessionStorage (se borra al cerrar la pestaña)
     o en memoria. Nunca en localStorage ni en el repo. */
  function getGhToken() {
    try { return sessionStorage.getItem('ghToken') || window.__ghTokenMem || null; }
    catch(e) { return window.__ghTokenMem || null; }
  }
  function clearGhToken() {
    try { sessionStorage.removeItem('ghToken'); } catch(e){}
    window.__ghTokenMem = null;
  }

  /* Codifica UTF-8 → base64 (maneja acentos como "Águila" correctamente) */
  function toBase64Utf8(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin);
  }
  /* Decodifica base64 (con saltos de línea, como lo devuelve GitHub) → UTF-8 */
  function fromBase64Utf8(b64) {
    const bin   = atob(String(b64 || '').replace(/\s/g, ''));
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function showGitHubTokenModal(onReady) {
    const ov = createOverlay(`
      <div class="modal">
        <div class="modal-title">☁️ Conectar con GitHub</div>
        <div class="modal-sub">Pega tu <strong>token fine-grained</strong> con permiso <em>Contents: Read and write</em> sobre <strong>${GH_CONFIG.owner}/${GH_CONFIG.repo}</strong>.</div>
        <label>Token de acceso</label>
        <input type="password" id="gh-token" autocomplete="off" placeholder="github_pat_...">
        <label style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:12px;font-weight:400">
          <input type="checkbox" id="gh-remember" checked style="width:auto"> Recordar mientras esta pestaña esté abierta
        </label>
        <div style="font-size:11px;color:var(--muted);margin-top:12px;line-height:1.7">
          🔒 Crea uno en <strong>github.com/settings/personal-access-tokens</strong> → Fine-grained · Repository access: solo <strong>${GH_CONFIG.repo}</strong> · Permissions → <strong>Contents: Read and write</strong>.<br>
          ⚠️ Es una credencial de escritura: nunca la subas al repo ni la compartas.
        </div>
        <div class="modal-error" id="gh-err"></div>
        <div class="modal-actions">
          <button class="btn-secondary" id="gh-cancel">Cancelar</button>
          <button class="btn-primary"   id="gh-ok">Conectar</button>
        </div>
      </div>`);
    ov.querySelector('#gh-cancel').addEventListener('click', () => ov.remove());
    ov.querySelector('#gh-ok').addEventListener('click', () => {
      const tk  = ov.querySelector('#gh-token').value.trim();
      const err = ov.querySelector('#gh-err');
      if (!tk) { err.textContent = 'Pega un token válido'; err.classList.add('show'); return; }
      if (ov.querySelector('#gh-remember').checked) {
        try { sessionStorage.setItem('ghToken', tk); } catch(e) { window.__ghTokenMem = tk; }
      } else { window.__ghTokenMem = tk; }
      ov.remove();
      if (onReady) onReady();
    });
    setTimeout(() => ov.querySelector('#gh-token').focus(), 50);
  }

  async function commitToGitHub() {
    if (!adminLogged()) { toast('🔒 Inicia sesión de administrador', 'error'); return; }
    const token = getGhToken();
    if (!token) { showGitHubTokenModal(() => commitToGitHub()); return; }

    const secs = ownedSections();
    if (!secs.length) { toast('🔒 Tu usuario no tiene una sección para guardar', 'error'); return; }

    // Persistir localmente (solo la sección propia) para consistencia de esta sesión
    saveToLocalStorage();

    const base = `https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/contents/${GH_CONFIG.path}`;
    const headers = {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    toast('☁️ Guardando en GitHub…', 'info', 8000);

    // Read-modify-write con reintentos: leemos SIEMPRE la copia más reciente
    // del repo y mezclamos ÚNICAMENTE nuestra(s) sección(es). Las de los otros
    // departamentos se respetan tal cual están en el servidor.
    const MAX_TRIES = 4;
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      try {
        // 1) Leer contenido + SHA actuales del repo
        let sha, serverObj = null;
        const getRes = await fetch(base + '?ref=' + GH_CONFIG.branch +
                                   '&t=' + Date.now(), { headers, cache:'no-store' });
        if (getRes.status === 200) {
          const j = await getRes.json();
          sha = j.sha;
          try { serverObj = JSON.parse(fromBase64Utf8(j.content)); }
          catch(e) { serverObj = null; }   // si está corrupto, lo regeneramos
        } else if (getRes.status === 404) {
          sha = undefined;                 // aún no existe → se creará completo
        } else if (getRes.status === 401) {
          clearGhToken();
          toast('❌ Token inválido o expirado. Vuelve a conectar.', 'error', 6000);
          return;
        } else {
          toast('❌ No se pudo leer el repo (HTTP ' + getRes.status + ')', 'error', 6000);
          return;
        }

        // 2) Base = copia del servidor; sobre ella montamos SOLO lo nuestro
        const merged = serverObj
          ? JSON.parse(JSON.stringify(serverObj))
          : JSON.parse(JSON.stringify(window.DashRaw));
        secs.forEach(s => { merged[s] = window.DashRaw[s]; });
        merged._meta = window.DashRaw._meta || merged._meta;

        // 3) PUT con el SHA recién leído
        const content = JSON.stringify(merged, null, 2);
        const stamp   = new Date().toISOString().slice(0,16).replace('T', ' ');
        const body = {
          message: `Dashboard: ${secs.join('+')} (${stamp})`,
          content: toBase64Utf8(content),
          branch:  GH_CONFIG.branch,
        };
        if (sha) body.sha = sha;

        const putRes = await fetch(base, { method:'PUT', headers, body: JSON.stringify(body) });

        if (putRes.status === 200 || putRes.status === 201) {
          // Éxito: el override local ya no hace falta y podría re-aplicar datos
          // viejos en el próximo load, así que lo limpiamos.
          try { localStorage.removeItem('dashOverride'); } catch(e){}
          // Reflejar en memoria lo que realmente quedó en el repo
          window.DashRaw = merged;
          if (typeof rebuildDash === 'function') rebuildDash();
          toast('✅ Guardado en GitHub (' + secs.join(', ') +
                '). Visible en ~1-2 min.', 'success', 7000);
          return;
        } else if (putRes.status === 409) {
          // El archivo cambió entre el GET y el PUT (otro depto guardó a la vez).
          // Reintentamos el ciclo completo con el SHA nuevo.
          if (attempt < MAX_TRIES) {
            await new Promise(r => setTimeout(r, 400 * attempt));
            continue;
          }
          toast('⚠️ Conflicto persistente. Recarga la página y reintenta.', 'error', 7000);
          return;
        } else if (putRes.status === 401 || putRes.status === 403) {
          toast('❌ Sin permiso de escritura. El token necesita Contents: Read and write.', 'error', 8000);
          return;
        } else {
          const t = await putRes.text();
          console.error('GitHub PUT error', putRes.status, t);
          toast('❌ Error al guardar (HTTP ' + putRes.status + ')', 'error', 6000);
          return;
        }
      } catch (e) {
        console.error('GitHub commit error', e);
        if (attempt < MAX_TRIES) { await new Promise(r => setTimeout(r, 400 * attempt)); continue; }
        toast('❌ Error de red al contactar GitHub', 'error', 6000);
        return;
      }
    }
  }

  /* ── Limpiar override ──────────────────────────────────────── */
  function clearOverride() {
    if (!confirm('¿Eliminar cambios locales y volver a los datos del servidor?')) return;
    localStorage.removeItem('dashOverride');
    toast('🗑️ Caché limpiado — recargando…', 'info');
    setTimeout(() => location.reload(), 1200);
  }

  /* ── Modal "Nueva Semana de Corte" ─────────────────────────── */
  const MES_OPTIONS = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
                       'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  const MES_ABR = {ENERO:'Ene',FEBRERO:'Feb',MARZO:'Mar',ABRIL:'Abr',
                   MAYO:'May',JUNIO:'Jun',JULIO:'Jul',AGOSTO:'Ago',
                   SEPTIEMBRE:'Sep',OCTUBRE:'Oct',NOVIEMBRE:'Nov',DICIEMBRE:'Dic'};

  function showNewCorteModal(seccion) {
    if (!canEditSection(seccion)) {
      toast('🔒 Tu usuario no puede agregar cortes en esta sección', 'error', 4000);
      return;
    }
    const rawSec = window.DashRaw[seccion];
    const lastMes = rawSec.cortes.length ? rawSec.cortes[rawSec.cortes.length-1].mes : 'ENERO';

    let fieldRows = '';
    if (seccion === 'ventas') {
      fieldRows = `
        <div class="field-group">
          <div><label>Punto de Venta ($)</label><input type="number" id="nv-pv" placeholder="0" style="width:100%;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;margin-bottom:10px"></div>
          <div><label>Call Center ($)</label><input type="number" id="nv-cc" placeholder="0" style="width:100%;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;margin-bottom:10px"></div>
          <div><label>Plataforma ($)</label><input type="number" id="nv-plat" placeholder="0" style="width:100%;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;margin-bottom:10px"></div>
          <div><label>Asesores ($)</label><input type="number" id="nv-ase" placeholder="0" style="width:100%;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;margin-bottom:10px"></div>
        </div>`;
    } else if (seccion === 'ope') {
      fieldRows = `
        <div class="field-group">
          <div><label>Compras ($)</label><input type="number" id="no-compra" placeholder="0" style="width:100%;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;margin-bottom:10px"></div>
          <div><label>Devoluciones</label><input type="number" id="no-dev" placeholder="0" style="width:100%;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;margin-bottom:10px"></div>
          <div><label>Nivel Servicio ($)</label><input type="number" id="no-ns" placeholder="0" style="width:100%;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;margin-bottom:10px"></div>
          <div><label>Nivel Servicio (%)</label><input type="number" id="no-nspct" placeholder="0" step="0.1" style="width:100%;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;margin-bottom:10px"></div>
          <div><label>Máquinas Reparadas</label><input type="number" id="no-maq" placeholder="0" style="width:100%;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;margin-bottom:10px"></div>
          <div><label>Días Prom. Reparación</label><input type="number" id="no-dias" placeholder="0" step="0.1" style="width:100%;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;margin-bottom:10px"></div>
        </div>`;
    } else { // admon
      fieldRows = `
        <div class="field-group">
          <div><label>Ingresos ($)</label><input type="number" id="na-ing" placeholder="0" style="width:100%;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;margin-bottom:10px"></div>
          <div><label>Egresos ($)</label><input type="number" id="na-egr" placeholder="0" style="width:100%;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;margin-bottom:10px"></div>
          <div><label>Plazo de Cobro (días)</label><input type="number" id="na-cobro" placeholder="0" step="0.1" style="width:100%;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;margin-bottom:10px"></div>
          <div><label>% Recuperación</label><input type="number" id="na-rec" placeholder="0.30" step="0.001" style="width:100%;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;margin-bottom:10px"></div>
          <div><label>Gastos Operación ($)</label><input type="number" id="na-gas" placeholder="0" style="width:100%;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;margin-bottom:10px"></div>
          <div><label>Cartera Vigente ($)</label><input type="number" id="na-cvig" placeholder="0" style="width:100%;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;margin-bottom:10px"></div>
          <div><label>Cartera Vencida ($)</label><input type="number" id="na-cven" placeholder="0" style="width:100%;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;margin-bottom:10px"></div>
        </div>`;
    }

    const mesOptions = MES_OPTIONS.map(m =>
      `<option value="${m}" ${m===lastMes?'selected':''}>${m[0]+m.slice(1).toLowerCase()}</option>`
    ).join('');

    const ov = createOverlay(`
      <div class="modal wide">
        <div class="modal-title">➕ Nueva Semana de Corte — ${seccion.toUpperCase()}</div>
        <div class="modal-sub">Agrega los datos del nuevo corte semanal</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px">
          <div>
            <label>Mes</label>
            <select id="nc-mes" style="width:100%;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;margin-bottom:14px">${mesOptions}</select>
          </div>
          <div>
            <label>Día del corte</label>
            <input type="number" id="nc-dia" min="1" max="31" placeholder="ej: 22" style="width:100%;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;margin-bottom:14px">
          </div>
        </div>
        ${fieldRows}
        <div class="modal-actions">
          <button class="btn-secondary" id="nc-cancel">Cancelar</button>
          <button class="btn-primary"   id="nc-save">➕ Agregar corte</button>
        </div>
      </div>`);

    ov.querySelector('#nc-cancel').addEventListener('click', () => ov.remove());
    ov.querySelector('#nc-save').addEventListener('click', () => {
      const mes = ov.querySelector('#nc-mes').value;
      const dia = parseInt(ov.querySelector('#nc-dia').value) || 1;
      const abr = MES_ABR[mes] || mes.slice(0,3);
      const label = `${abr}/${String(dia).padStart(2,'0')}`;

      rawSec.cortes.push({ mes, label });

      if (seccion === 'ventas') {
        const pv   = parseFloat(ov.querySelector('#nv-pv').value)   || 0;
        const cc   = parseFloat(ov.querySelector('#nv-cc').value)   || 0;
        const plat = parseFloat(ov.querySelector('#nv-plat').value) || 0;
        const ase  = parseFloat(ov.querySelector('#nv-ase').value)  || 0;
        rawSec.data['PUNTO DE VENTA'].push(pv);
        rawSec.data['CALL CENTER'].push(cc);
        rawSec.data['PLATAFORMA'].push(plat);
        rawSec.data['ASESORES'].push(ase);
        rawSec.data['VENTAS TOTALES'].push(pv+cc+plat+ase);
      } else if (seccion === 'ope') {
        rawSec.data['COMPRA'].push(parseFloat(ov.querySelector('#no-compra').value)||null);
        rawSec.data['DEVOLUCIONES'].push(parseFloat(ov.querySelector('#no-dev').value)||null);
        rawSec.data['NIVEL_SERVICIO'].push(parseFloat(ov.querySelector('#no-ns').value)||null);
        rawSec.data['NIVEL_SERVICIO_PCT'].push(parseFloat(ov.querySelector('#no-nspct').value)||null);
        rawSec.data['MAQUINAS'].push(parseFloat(ov.querySelector('#no-maq').value)||null);
        rawSec.data['DIAS_REPARACION'].push(parseFloat(ov.querySelector('#no-dias').value)||null);
      } else {
        const ing = parseFloat(ov.querySelector('#na-ing').value)||null;
        const egr = parseFloat(ov.querySelector('#na-egr').value)||null;
        const gas = parseFloat(ov.querySelector('#na-gas').value)||null;
        const cvig= parseFloat(ov.querySelector('#na-cvig').value);
        const cven= parseFloat(ov.querySelector('#na-cven').value);
        rawSec.data['INGRESOS'].push(ing);
        rawSec.data['EGRESOS'].push(egr);
        rawSec.data['PLAZO_COBRO'].push(parseFloat(ov.querySelector('#na-cobro').value)||null);
        rawSec.data['RECUPERACION'].push(parseFloat(ov.querySelector('#na-rec').value)||null);
        rawSec.data['GASTOS_OPERACION'].push(gas);
        rawSec.data['FLUJO'].push((ing&&egr)?(ing-egr-(gas||0)):null);
        if (!Array.isArray(rawSec.data['CARTERA_VIGENTE'])) rawSec.data['CARTERA_VIGENTE'] = [];
        if (!Array.isArray(rawSec.data['CARTERA_VENCIDA'])) rawSec.data['CARTERA_VENCIDA'] = [];
        rawSec.data['CARTERA_VIGENTE'].push(isNaN(cvig)?null:cvig);
        rawSec.data['CARTERA_VENCIDA'].push(isNaN(cven)?null:cven);
      }

      // Reconstruir window.Dash desde raw actualizado
      rebuildDash();
      ov.remove();
      toast(`✅ Corte ${label} agregado — guardando…`);
      saveToLocalStorage();

      // Forzar rebuild de la página activa
      const pageId = seccion==='ventas'?'tabla-v':seccion==='ope'?'tabla-o':'tabla-a';
      builtPages[pageId] = false;
      showPage(pageId, document.querySelector('.tab.active'));
    });

    setTimeout(() => ov.querySelector('#nc-dia').focus(), 50);
  }

  /* Reconstruir window.Dash desde DashRaw */
  // Recalcula el acumulado mensual (último corte de cada mes) — réplica de parser.calcAcumulado
  function calcAcumuladoLocal(cortes, data) {
    const meses = [...new Set(cortes.map(c => c.mes))];
    const acu = {};
    meses.forEach(mes => {
      const idx  = cortes.map((c,i) => c.mes === mes ? i : -1).filter(i => i >= 0);
      const last = idx[idx.length - 1];
      acu[mes] = {};
      Object.keys(data).forEach(k => { acu[mes][k] = data[k]?.[last] || 0; });
    });
    return acu;
  }

  function rebuildDash() {
    const raw = window.DashRaw;
    // Recalcula totales y flujo
    const canales = ['PUNTO DE VENTA','CALL CENTER','PLATAFORMA','ASESORES'];
    raw.ventas.data['VENTAS TOTALES'] = raw.ventas.cortes.map((_,i) =>
      canales.reduce((s,c) => s+(raw.ventas.data[c]?.[i]||0), 0)
    );
    raw.admon.data['FLUJO'] = raw.admon.cortes.map((_,i) => {
      const ing = raw.admon.data['INGRESOS']?.[i];
      const egr = raw.admon.data['EGRESOS']?.[i];
      const gas = raw.admon.data['GASTOS_OPERACION']?.[i];
      return ing!=null?ing-(egr||0)-(gas||0):null;
    });

    // ── Refrescar las "fotos fijas" que el parser calculó una sola vez ──
    // (window.Dash.X.data es la misma referencia que raw.X.data, pero meses
    //  y acumuladoMes son snapshots separados que hay que recalcular)
    const D = window.Dash;
    if (D) {
      ['ventas','ope','admon'].forEach(sec => {
        if (D[sec] && D[sec].cortes) {
          D[sec].meses = [...new Set(D[sec].cortes.map(c => c.mes))];
          D[sec].acumuladoMes = calcAcumuladoLocal(D[sec].cortes, D[sec].data);
        }
      });
    }

    document.dispatchEvent(new Event('dashrebuilt'));
  }

  /* ── Toolbar admin para una sección de tabla ────────────────── */
  function buildAdminToolbar(seccion, containerId) {
    const div = document.createElement('div');
    div.className = 'admin-toolbar';
    div.dataset.section = seccion;

    if (canEditSection(seccion)) {
      const esSuper = window.Auth?.isSuper() === true;

      if (esSuper) {
        // ── SUPER ADMIN (b3t0): control total con los 7 botones ──
        div.innerHTML = `
        <button class="btn-admin add"    id="atb-add-${seccion}">➕ Nueva semana</button>
        <button class="btn-admin save"   id="atb-save-${seccion}">💾 Guardar cambios</button>
        <button class="btn-admin github" id="atb-github-${seccion}" title="Hacer commit de dash.json directo a tu repositorio" style="background:rgba(34,197,94,.18);border-color:rgba(34,197,94,.55);color:#22c55e;font-weight:700">☁️ Guardar en GitHub</button>
        <button class="btn-admin refresh" id="atb-refresh-${seccion}" title="Recalcular y refrescar todas las gráficas" style="background:rgba(34,211,238,.15);border-color:rgba(34,211,238,.5);color:#22d3ee">🔄 Actualizar</button>
        <button class="btn-admin export" id="atb-export-${seccion}">📥 Exportar JSON</button>
        <button class="btn-admin clear"  id="atb-clear-${seccion}">🗑️ Limpiar caché</button>
        <button class="btn-admin pwd"    id="atb-pwd-${seccion}" title="Cambiar mi contraseña">🔑 Contraseña</button>`;
        div.querySelector(`#atb-add-${seccion}`).addEventListener('click', () => showNewCorteModal(seccion));
        div.querySelector(`#atb-save-${seccion}`).addEventListener('click', () => {
          saveToLocalStorage();
          document.dispatchEvent(new Event('dashrebuilt'));   // refresca todas las vistas
        });
        div.querySelector(`#atb-github-${seccion}`).addEventListener('click', commitToGitHub);
        div.querySelector(`#atb-refresh-${seccion}`).addEventListener('click', () => {
          rebuildDash();                          // recalcula totales/flujo/meses y refresca todo
          toast('🔄 Dashboards actualizados');
        });
        div.querySelector(`#atb-export-${seccion}`).addEventListener('click', exportJSON);
        div.querySelector(`#atb-clear-${seccion}`).addEventListener('click', clearOverride);
        div.querySelector(`#atb-pwd-${seccion}`).addEventListener('click', showChangePasswordModal);

      } else {
        // ── USUARIO DE DEPARTAMENTO (ventas, ope, admon): solo lo esencial ──
        // Sin Guardar local, Actualizar, Exportar JSON ni Limpiar caché para evitar errores
        div.innerHTML = `
        <button class="btn-admin add"    id="atb-add-${seccion}">➕ Nueva semana</button>
        <button class="btn-admin github" id="atb-github-${seccion}" title="Guardar los datos directo en el repositorio" style="background:rgba(34,197,94,.18);border-color:rgba(34,197,94,.55);color:#22c55e;font-weight:700">☁️ Guardar en GitHub</button>
        <button class="btn-admin pwd"    id="atb-pwd-${seccion}" title="Cambiar mi contraseña">🔑 Contraseña</button>`;
        div.querySelector(`#atb-add-${seccion}`).addEventListener('click', () => showNewCorteModal(seccion));
        div.querySelector(`#atb-github-${seccion}`).addEventListener('click', commitToGitHub);
        div.querySelector(`#atb-pwd-${seccion}`).addEventListener('click', showChangePasswordModal);
      }
    } else if (adminLogged()) {
      // Logged in pero con rol distinto → muestra aviso de solo lectura
      const u   = window.Auth.user();
      const own = ROLE_LABEL[u.role] || u.role;
      const need= ROLE_LABEL[seccion] || seccion;
      div.classList.add('readonly-notice');
      div.innerHTML = `<span class="ro-tag">🔒 Solo lectura</span>
        <span class="ro-text">Tu usuario (<strong>${esc(u.username)}</strong> · ${esc(own)})
        no puede editar esta sección. Para editar <strong>${esc(need)}</strong>,
        inicia sesión con el usuario de ese departamento.</span>`;
    }

    const container = document.getElementById(containerId);
    if (container) container.parentNode.insertBefore(div, container);
    return div;
  }

  /* ── Hacer celda de tabla editable ─────────────────────────── */
  function makeEditable(td, seccion, onchange) {
    td.classList.add('editable');
    const allow = canEditSection(seccion);
    td.setAttribute('contenteditable', allow ? 'true' : 'false');
    if (!allow) return;
    td.addEventListener('focus', () => window.Auth?.touch?.());
    td.addEventListener('blur', () => {
      const raw = td.textContent.replace(/[$,K M\s]/g,'').trim();
      const n = parseFloat(raw);
      if (!isNaN(n)) {
        td.classList.add('modified');
        onchange(n);
      }
    });
    td.addEventListener('keydown', e => { if(e.key==='Enter') { e.preventDefault(); td.blur(); } });
  }

  /* ══════════════════════════════════════════════════════════
     HEADER
  ══════════════════════════════════════════════════════════ */
  function buildHeader() {
    const V = window.Dash.ventas;
    const O = window.Dash.ope;
    const A = window.Dash.admon;
    const allMeses = [...new Set([...V.meses,...O.meses,...A.meses])];
    const MABRV    = {ENERO:'Ene',FEBRERO:'Feb',MARZO:'Mar',ABRIL:'Abr',MAYO:'May',JUNIO:'Jun'};
    const first    = MABRV[allMeses[0]] || allMeses[0];
    const last     = MABRV[allMeses[allMeses.length-1]] || allMeses[allMeses.length-1];
    document.getElementById('hdr-periodo').innerHTML  = `Período: <span>${first}–${last} 2026</span>`;
    document.getElementById('hdr-cortes').innerHTML   = `Cortes ventas: <span>${V.cortes.length}</span>`;
    document.getElementById('hdr-canales').innerHTML  = `Departamentos: <span>3</span>`;
  }

  /* ══════════════════════════════════════════════════════════
     KPIs
  ══════════════════════════════════════════════════════════ */
  function buildKPIsVentas() {
    const V    = window.Dash.ventas;
    const grid = document.getElementById('kpi-grid-ventas');
    if (!grid) return;
    grid.innerHTML = '';
    [...V.canalesVenta, 'VENTAS TOTALES'].forEach(canal => {
      const cfg  = V.canalConfig[canal];
      const vals = V.data[canal] || [];
      const meta = V.metas[canal] || 1;
      const prom = avg(vals);
      const diff = ((prom-meta)/meta*100).toFixed(1);
      const pctV = Math.min((prom/meta)*100,150);
      const bCls = diff>=0?'up':diff>=-10?'warn':'down';
      grid.innerHTML += `
        <div class="kpi-card ${cfg.cls}">
          <div class="kpi-label">${cfg.icon} ${canal}</div>
          <div class="kpi-value">${fmtK(prom)}</div>
          <div class="kpi-sub">Promedio por corte</div>
          <div class="kpi-badge ${bCls}">${diff>=0?'▲':'▼'} ${Math.abs(diff)}% vs meta</div>
          <div class="kpi-meta">Meta: ${fmt(meta)}</div>
          <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(pctV,100)}%;background:${cfg.color}"></div></div>
        </div>`;
    });
  }

  function buildKPIsOpe() {
    const O    = window.Dash.ope;
    const grid = document.getElementById('kpi-grid-ope');
    if (!grid) return;
    grid.innerHTML = '';
    const cfg = [
      {key:'COMPRA',         icon:'📦', cls:'blue',   label:'Compras',         tipo:'$'},
      {key:'DEVOLUCIONES',   icon:'↩️', cls:'green',  label:'Devoluciones',    tipo:'num', metaOp:'<'},
      {key:'MAQUINAS',       icon:'🔧', cls:'purple', label:'Máqs. Reparadas', tipo:'num'},
      {key:'DIAS_REPARACION',icon:'⏱️', cls:'amber',  label:'Días Reparación', tipo:'num', metaOp:'<='},
    ];
    cfg.forEach(c => {
      const vals = O.data[c.key]||[];
      const meta = O.metas[c.key]||1;
      const prom = avg(vals);
      const diff = ((prom-meta)/meta*100).toFixed(1);
      const ok   = c.metaOp==='<'||c.metaOp==='<='?prom<meta:prom>=meta;
      const bCls = ok?'up':Math.abs(diff)<=15?'warn':'down';
      const valFmt = c.tipo==='$'?fmtK(prom):prom.toFixed(1);
      grid.innerHTML += `
        <div class="kpi-card ${c.cls}">
          <div class="kpi-label">${c.icon} ${c.label}</div>
          <div class="kpi-value">${valFmt}</div>
          <div class="kpi-sub">Promedio por corte</div>
          <div class="kpi-badge ${bCls}">${ok?'✓':'▼'} Meta: ${c.tipo==='$'?fmtK(meta):meta}</div>
          <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(Math.abs(+diff)+70,100)}%;background:${ok?'#22c55e':'#f87171'}"></div></div>
        </div>`;
    });
  }

  function buildKPIsAdmon() {
    const A    = window.Dash.admon;
    const grid = document.getElementById('kpi-grid-admon');
    if (!grid) return;
    grid.innerHTML = '';
    const cfg = [
      {key:'INGRESOS',        icon:'💵', cls:'blue',   label:'Ingresos',       tipo:'$',   metaOp:'>='},
      {key:'PLAZO_COBRO',     icon:'📅', cls:'green',  label:'Plazo Cobro',    tipo:'dias', metaOp:'<'},
      {key:'RECUPERACION',    icon:'📈', cls:'amber',  label:'% Recuperación', tipo:'pct', metaOp:'<'},
      {key:'EGRESOS',         icon:'💸', cls:'purple', label:'Egresos',        tipo:'$',   metaOp:'<='},
      {key:'GASTOS_OPERACION',icon:'⚙️', cls:'red',    label:'Gastos Oper.',   tipo:'$',   metaOp:'<='},
      {key:'FLUJO',           icon:'🌊', cls:'blue',   label:'Flujo Efectivo', tipo:'$',   metaOp:'>0'},
      {key:'CARTERA_VIGENTE', icon:'💼', cls:'green',  label:'Cartera Vigente',tipo:'$',   metaOp:'>='},
      {key:'CARTERA_VENCIDA', icon:'⚠️', cls:'red',    label:'Cartera Vencida',tipo:'$',   metaOp:'<='},
    ];
    cfg.forEach(c => {
      const vals = A.data[c.key]||[];
      const meta = A.metas[c.key]||0;
      const prom = avg(vals);
      const ok   = c.metaOp==='>0'?prom>0:(c.metaOp==='<'||c.metaOp==='<='?prom<=(meta||Infinity):prom>=(meta||0));
      const bCls = ok?'up':c.key==='FLUJO'&&prom<0?'down':'warn';
      let valFmt  = c.tipo==='$'?fmtK(prom):c.tipo==='pct'?(prom*100).toFixed(1)+'%':prom.toFixed(1);
      let metaFmt = c.tipo==='$'?fmtK(meta):meta||'—';
      grid.innerHTML += `
        <div class="kpi-card ${c.cls}">
          <div class="kpi-label">${c.icon} ${c.label}</div>
          <div class="kpi-value">${valFmt}</div>
          <div class="kpi-sub">Promedio por corte</div>
          <div class="kpi-badge ${bCls}">${ok?'✓':'⚠'} Meta: ${metaFmt}</div>
          <div class="progress-bar"><div class="progress-fill" style="width:${ok?80:45}%;background:${ok?'#22c55e':'#f59e0b'}"></div></div>
        </div>`;
    });
  }

  /* ══════════════════════════════════════════════════════════
     SEMÁFORO CONSOLIDADO
  ══════════════════════════════════════════════════════════ */
  function buildSemaforo() {
    const V = window.Dash.ventas;
    const O = window.Dash.ope;
    const A = window.Dash.admon;
    const el = document.getElementById('semaforo-list');
    if (!el) return;
    const items = [
      {label:'Ventas Totales',  val:avg(V.data['VENTAS TOTALES']),                 meta:V.metas['VENTAS TOTALES'], tipo:'$',   op:'>='},
      {label:'Call Center',     val:avg(V.data['CALL CENTER']),                    meta:V.metas['CALL CENTER'],    tipo:'$',   op:'>='},
      {label:'Asesores',        val:avg(V.data['ASESORES']),                       meta:V.metas['ASESORES'],       tipo:'$',   op:'>='},
      {label:'Compras',         val:avg(O.data['COMPRA'].filter(v=>v!==null)),     meta:O.metas['COMPRA'],         tipo:'$',   op:'>='},
      {label:'Devoluciones',    val:avg(O.data['DEVOLUCIONES'].filter(v=>v!==null)),meta:O.metas['DEVOLUCIONES'], tipo:'num', op:'<'},
      {label:'Máqs. Reparadas', val:avg(O.data['MAQUINAS'].filter(v=>v!==null)),   meta:O.metas['MAQUINAS'],       tipo:'num', op:'>='},
      {label:'Días Reparación', val:avg(O.data['DIAS_REPARACION'].filter(v=>v!==null)),meta:O.metas['DIAS_REPARACION'],tipo:'num',op:'<='},
      {label:'Ingresos Admon',  val:avg(A.data['INGRESOS'].filter(v=>v!==null)),   meta:A.metas['INGRESOS'],       tipo:'$',   op:'>='},
      {label:'Plazo de Cobro',  val:avg(A.data['PLAZO_COBRO'].filter(v=>v!==null)),meta:A.metas['PLAZO_COBRO'],   tipo:'dias',op:'<'},
      {label:'Flujo de Efectivo',val:avg(A.data['FLUJO'].filter(v=>v!==null)),     meta:0,                         tipo:'$',   op:'>0'},
      {label:'Cartera Vigente', val:avg((A.data['CARTERA_VIGENTE']||[]).filter(v=>v!==null)), meta:A.metas['CARTERA_VIGENTE']||0, tipo:'$', op:'>='},
      {label:'Cartera Vencida', val:avg((A.data['CARTERA_VENCIDA']||[]).filter(v=>v!==null)), meta:A.metas['CARTERA_VENCIDA']||0, tipo:'$', op:'<='},
    ];
    el.innerHTML = items.map(it => {
      const ok   = it.op==='>0'?it.val>0:(it.op==='<'||it.op==='<='?it.val<=it.meta:it.val>=it.meta);
      const warn = !ok && Math.abs((it.val-it.meta)/(it.meta||1))*100 < 15;
      const dot  = ok?'🟢':warn?'🟡':'🔴';
      const vF   = it.tipo==='$'?fmtK(it.val):it.tipo==='pct'?(it.val*100).toFixed(1)+'%':it.val.toFixed(1);
      const mF   = it.tipo==='$'?fmtK(it.meta):it.meta||'—';
      const dPct = it.meta?((it.val-it.meta)/it.meta*100).toFixed(1):null;
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(46,51,80,.5)">
        <span style="color:var(--muted);font-size:12px">${dot} ${it.label}</span>
        <span style="font-size:12px;font-weight:600;color:${ok?'#22c55e':warn?'#f59e0b':'#f87171'}">${vF} <span style="font-size:10px;color:var(--muted);font-weight:400">/ meta ${mF}${dPct?` (${dPct>0?'+':''}${dPct}%)`:''}</span></span>
      </div>`;
    }).join('');
  }

  /* ══════════════════════════════════════════════════════════
     FILTROS DE MES (CANALES)
  ══════════════════════════════════════════════════════════ */
  function buildMonthFilters() {
    const V   = window.Dash.ventas;
    const row = document.getElementById('month-filter-row');
    if (!row) return;
    const MABRV = {ENERO:'Enero',FEBRERO:'Febrero',MARZO:'Marzo',ABRIL:'Abril',MAYO:'Mayo',JUNIO:'Junio'};
    row.innerHTML = `<span class="filter-label">Mes:</span>
      <button class="month-btn active" onclick="filterCanal('TODOS',this)">Todos</button>`;
    V.meses.forEach(mes => {
      row.innerHTML += `<button class="month-btn" onclick="filterCanal('${mes}',this)">${MABRV[mes]||mes}</button>`;
    });
  }

  /* ══════════════════════════════════════════════════════════
     SECCIÓN GRÁFICAS POR MES (CORTES)
  ══════════════════════════════════════════════════════════ */
  function buildMesSection() {
    const V    = window.Dash.ventas;
    const cont = document.getElementById('mes-charts-container');
    if (!cont) return;
    const colors = ['#4f8ef7','#22c55e','#f59e0b','#a78bfa','#22d3ee','#f87171'];
    cont.innerHTML = `
      <div class="charts-row cols-1" style="margin-bottom:16px">
        <div class="panel">
          <div class="panel-title">Canales Apilados por Corte</div>
          <div class="panel-sub">Composición de cada corte por canal de venta</div>
          <div style="position:relative;width:100%;height:220px">
            <canvas id="chartApilado" role="img" aria-label="Barras apiladas"></canvas>
          </div>
        </div>
      </div>`;
    const cls = V.meses.length <= 3 ? 'cols-3' : 'cols-mes';
    let rows = '<div class="charts-row ' + cls + '">';
    V.meses.forEach((mes, i) => {
      const nC  = V.cortes.filter(c => c.mes === mes).length;
      const lbl = mes[0] + mes.slice(1).toLowerCase();
      const col = colors[i % colors.length];
      rows += '<div class="panel panel-mes">'
        + '<div class="panel-title" style="font-size:12px">' + lbl
        + '<span style="font-size:10px;color:var(--muted);font-weight:400;margin-left:6px">' + nC + ' corte' + (nC!==1?'s':'') + '</span></div>'
        + '<div style="position:relative;width:100%;height:160px">'
        + '<canvas id="chartMes_' + mes + '" data-mes="' + mes + '" data-color="' + col + '" role="img"></canvas>'
        + '</div></div>';
    });
    rows += '</div>';
    cont.innerHTML += rows;
  }

  /* ══════════════════════════════════════════════════════════
     TABLAS DETALLE (con edición admin)
  ══════════════════════════════════════════════════════════ */

  /* VENTAS */
  function buildTablaVentas() {
    const V   = window.Dash.ventas;
    const raw = window.DashRaw.ventas;
    const div = document.getElementById('tabla-ventas');
    if (!div) return;

    // Toolbar admin
    if (!div.previousElementSibling?.classList.contains('admin-toolbar')) {
      buildAdminToolbar('ventas', 'tabla-ventas');
    }

    let h = '<table><thead><tr><th>Canal</th>';
    V.cortes.forEach((c,i) => {
      const isNew = i >= (V.cortes.length - 1) && V.cortes.length > window.DashRaw.ventas.cortes.length - 1;
      h += `<th${isNew?' class="new-col"':''}>${c.label}</th>`;
    });
    h += '<th>Promedio</th><th>vs Meta</th></tr></thead><tbody>';

    [...V.canalesVenta,'VENTAS TOTALES'].forEach((canal,ri) => {
      const cfg  = V.canalConfig[canal];
      const vals = V.data[canal]||[];
      const meta = V.metas[canal]||1;
      const prom = avg(vals);
      const diff = ((prom-meta)/meta*100).toFixed(1);
      const pCls = diff>=0?'green':diff>=-10?'amber':'red';
      h += `<tr><td><span class="dot" style="background:${cfg.color}"></span>${canal}</td>`;
      vals.forEach((v,ci) => {
        h += `<td class="editable" data-canal="${canal}" data-ci="${ci}">${fmtK(v)}</td>`;
      });
      h += `<td><strong>${fmtK(prom)}</strong></td>`;
      h += `<td><span class="pill ${pCls}">${diff>=0?'▲':'▼'}${Math.abs(diff)}%</span></td></tr>`;
    });
    h += '</tbody></table>';
    div.innerHTML = h;

    // Hacer editables las celdas SOLO si el usuario es de Ventas
    if (canEditSection('ventas')) {
      div.querySelectorAll('td.editable').forEach(td => {
        const canal = td.dataset.canal;
        const ci    = parseInt(td.dataset.ci);
        td.setAttribute('contenteditable','true');
        makeEditable(td, 'ventas', n => {
          raw.data[canal][ci] = n;
          // Recalcular totales
          if (canal !== 'VENTAS TOTALES') {
            const canales = ['PUNTO DE VENTA','CALL CENTER','PLATAFORMA','ASESORES'];
            raw.data['VENTAS TOTALES'][ci] = canales.reduce((s,c)=>s+(raw.data[c]?.[ci]||0),0);
          }
        });
      });
    }
  }

  /* OPERACIONES */
  function buildTablaOpe() {
    const O   = window.Dash.ope;
    const raw = window.DashRaw.ope;
    const div = document.getElementById('tabla-ope');
    if (!div) return;

    if (!div.previousElementSibling?.classList.contains('admin-toolbar')) {
      buildAdminToolbar('ope', 'tabla-ope');
    }

    const INDS = O.indicadores||[];
    let h = '<table><thead><tr><th>Indicador</th>';
    O.cortes.forEach(c => { h += `<th>${c.label}</th>`; });
    h += '<th>Promedio</th><th>Meta</th></tr></thead><tbody>';
    INDS.forEach(ind => {
      const vals = O.data[ind.key]||[];
      const prom = avg(vals.filter(v=>v!==null));
      const meta = O.metas[ind.key];
      const ok   = ind.metaOp==='<'||ind.metaOp==='<='?prom<=meta:prom>=meta;
      const pCls = ok?'green':'red';
      const fv   = ind.tipo==='$'?fmtK:v=>v!==null?v.toFixed(1):'—';
      h += `<tr><td><span class="dot" style="background:${ind.color}"></span>${ind.label}</td>`;
      vals.forEach((v,ci) => {
        h += `<td class="editable" data-key="${ind.key}" data-ci="${ci}">${fv(v)}</td>`;
      });
      h += `<td><strong>${fv(prom)}</strong></td>`;
      h += `<td><span class="pill ${pCls}">${ind.tipo==='$'?fmtK(meta):meta}</span></td></tr>`;
    });
    h += '</tbody></table>';
    div.innerHTML = h;

    if (canEditSection('ope')) {
      div.querySelectorAll('td.editable').forEach(td => {
        const key = td.dataset.key;
        const ci  = parseInt(td.dataset.ci);
        td.setAttribute('contenteditable','true');
        makeEditable(td, 'ope', n => { raw.data[key][ci] = n; });
      });
    }
  }

  /* ADMINISTRACIÓN */
  function buildTablaAdmon() {
    const A   = window.Dash.admon;
    const raw = window.DashRaw.admon;
    const div = document.getElementById('tabla-admon');
    if (!div) return;

    if (!div.previousElementSibling?.classList.contains('admin-toolbar')) {
      buildAdminToolbar('admon', 'tabla-admon');
    }

    const INDS = A.indicadores||[];
    let h = '<table><thead><tr><th>Indicador</th>';
    A.cortes.forEach(c => { h += `<th>${c.label}</th>`; });
    h += '<th>Promedio</th><th>Meta</th></tr></thead><tbody>';
    INDS.forEach(ind => {
      const vals = A.data[ind.key]||[];
      const prom = avg(vals.filter(v=>v!==null));
      const meta = A.metas[ind.key];
      const ok   = ind.metaOp==='>0'?prom>0:(ind.metaOp==='<'||ind.metaOp==='<='?prom<=meta:prom>=meta);
      const pCls = ok?'green':Math.abs((prom-meta)/(meta||1))*100<15?'amber':'red';
      const fv   = ind.tipo==='$'?fmtK:ind.tipo==='pct'?v=>v!==null?(v*100).toFixed(1)+'%':'—':v=>v!==null?v.toFixed(1):'—';
      const fm   = ind.tipo==='$'?fmtK(meta):ind.tipo==='pct'?meta+'%':meta;
      h += `<tr><td><span class="dot" style="background:${ind.color}"></span>${ind.label}</td>`;
      vals.forEach((v,ci) => {
        h += `<td class="editable" data-key="${ind.key}" data-ci="${ci}">${fv(v)}</td>`;
      });
      h += `<td><strong>${fv(prom)}</strong></td>`;
      h += `<td><span class="pill ${pCls}">${fm||'—'}</span></td></tr>`;
    });
    h += '</tbody></table>';
    div.innerHTML = h;

    if (canEditSection('admon')) {
      div.querySelectorAll('td.editable').forEach(td => {
        const key = td.dataset.key;
        const ci  = parseInt(td.dataset.ci);
        td.setAttribute('contenteditable','true');
        makeEditable(td, 'admon', n => {
          raw.data[key][ci] = n;
          // Recalcular flujo cuando cambian componentes clásicos
          if (key === 'INGRESOS' || key === 'EGRESOS' || key === 'GASTOS_OPERACION') {
            const ing = raw.data['INGRESOS']?.[ci];
            const egr = raw.data['EGRESOS']?.[ci];
            const gas = raw.data['GASTOS_OPERACION']?.[ci];
            if (ing != null) raw.data['FLUJO'][ci] = ing - (egr||0) - (gas||0);
          }
        });
      });
    }
  }

  /* ══════════════════════════════════════════════════════════
     RESUMEN EMPRESA — KPIs anuales
  ══════════════════════════════════════════════════════════ */
  function buildResumenEmpresa() {
    const V = window.Dash.ventas;
    const O = window.Dash.ope;
    const A = window.Dash.admon;
    const sumNN = a => a.filter(v => v!=null && !isNaN(v)).reduce((s,v)=>s+v, 0);
    const avgNN = a => { const f=a.filter(v=>v!=null&&!isNaN(v)); return f.length?f.reduce((s,v)=>s+v,0)/f.length:0; };

    /* ── Totales anuales ── */
    // Ventas
    const totV = sumNN(V.data['VENTAS TOTALES']);
    const totPV  = sumNN(V.data['PUNTO DE VENTA']);
    const totCC  = sumNN(V.data['CALL CENTER']);
    const totPL  = sumNN(V.data['PLATAFORMA']);
    const totAS  = sumNN(V.data['ASESORES']);
    // Ope
    const totCompras = sumNN(O.data['COMPRA']);
    const totDev     = sumNN(O.data['DEVOLUCIONES']);
    const totNS      = sumNN(O.data['NIVEL_SERVICIO']);
    const totMaq     = sumNN(O.data['MAQUINAS']);
    const avgDias    = avgNN(O.data['DIAS_REPARACION']);
    // Admon
    const totIng = sumNN(A.data['INGRESOS']);
    const totEgr = sumNN(A.data['EGRESOS']);
    const totGas = sumNN(A.data['GASTOS_OPERACION']);
    const totFlu = sumNN(A.data['FLUJO']);
    const avgCob = avgNN(A.data['PLAZO_COBRO']);
    const avgRec = avgNN(A.data['RECUPERACION']);
    // Cartera (vigente = ingreso x rotar / vencida = riesgo)
    const carteraVig = A.data['CARTERA_VIGENTE'] || [];
    const carteraVen = A.data['CARTERA_VENCIDA'] || [];
    const avgCarteraVig  = avgNN(carteraVig);   // promedio = saldo típico vigente
    const avgCarteraVen  = avgNN(carteraVen);
    // Ingreso esperado por rotación de cartera = saldo vigente promedio × % recuperación.
    // (El saldo vigente YA es un promedio por corte; multiplicarlo por nº de cortes lo
    //  sumaba 21 veces e inflaba el resultado ~21x. Es un cobro esperado, una sola vez.)
    const recRate        = avgRec > 0 ? avgRec : (A.metas['RECUPERACION'] || 0.33);
    const ingresoEsperadoCartera = avgCarteraVig * recRate;

    /* ── Rentabilidad (Margen Operativo) ── */
    const margenOperativo = totV > 0 ? ((totV - totCompras - totGas) / totV * 100) : 0;
    const margenBruto     = totV > 0 ? ((totV - totCompras) / totV * 100) : 0;
    // Margen Neto clásico (contable)
    const margenNeto      = totIng > 0 ? (totFlu / totIng * 100) : 0;
    // Margen Neto Proyectado: flujo neto + ingreso esperado por cobro de cartera vigente,
    // medido sobre los INGRESOS REALES. (Antes se sumaba el ingreso esperado también al
    //  denominador (Flujo+X)/(Ingresos+X), lo que arrastraba el % hacia 100% siempre.)
    const margenNetoProy  = totIng > 0 ? ((totFlu + ingresoEsperadoCartera) / totIng * 100) : 0;
    // La tarjeta está etiquetada "Proyectado": mostramos el proyectado; el contable va en el subtítulo.
    const margenNetoMostrado = margenNetoProy;

    /* ── HERO ── */
    document.getElementById('hero-rent-value').textContent = margenOperativo.toFixed(1) + '%';
    document.getElementById('hero-rent-sub').textContent = 'Margen operativo · Año 2026';
    document.getElementById('hero-rent-breakdown').innerHTML = `
      <div class="hero-metric">
        <div class="hero-metric-label">💰 Margen Bruto</div>
        <div class="hero-metric-value">${margenBruto.toFixed(1)}%</div>
        <div class="hero-metric-sub">(Ventas − Compras) ÷ Ventas</div>
      </div>
      <div class="hero-metric">
        <div class="hero-metric-label">📊 Margen Operativo</div>
        <div class="hero-metric-value">${margenOperativo.toFixed(1)}%</div>
        <div class="hero-metric-sub">descontando gastos operación</div>
      </div>`;

    /* ── KPIs VENTAS ── */
    const gV = document.getElementById('kpi-empresa-ventas');
    gV.innerHTML = `
      <div class="kpi-card blue"><div class="kpi-label">🏪 Punto de Venta</div><div class="kpi-value">${fmtK(totPV)}</div><div class="kpi-sub">Anual · 19 cortes</div></div>
      <div class="kpi-card green"><div class="kpi-label">📞 Call Center</div><div class="kpi-value">${fmtK(totCC)}</div><div class="kpi-sub">Anual · 19 cortes</div></div>
      <div class="kpi-card amber"><div class="kpi-label">💻 Plataforma</div><div class="kpi-value">${fmtK(totPL)}</div><div class="kpi-sub">Anual · 19 cortes</div></div>
      <div class="kpi-card purple"><div class="kpi-label">👥 Asesores</div><div class="kpi-value">${fmtK(totAS)}</div><div class="kpi-sub">Anual · 19 cortes</div></div>
      <div class="kpi-card red"><div class="kpi-label">💰 Ventas Totales</div><div class="kpi-value">${fmtK(totV)}</div><div class="kpi-sub">Suma anual real</div></div>`;

    /* ── KPIs OPERACIONES ── */
    const gO = document.getElementById('kpi-empresa-ope');
    gO.innerHTML = `
      <div class="kpi-card blue"><div class="kpi-label">📦 Compras</div><div class="kpi-value">${fmtK(totCompras)}</div><div class="kpi-sub">Anual · ${O.cortes.length} cortes</div></div>
      <div class="kpi-card green"><div class="kpi-label">↩️ Devoluciones</div><div class="kpi-value">${Math.round(totDev)}</div><div class="kpi-sub">Total anual</div></div>
      <div class="kpi-card amber"><div class="kpi-label">📊 Nivel Servicio</div><div class="kpi-value">${fmtK(totNS)}</div><div class="kpi-sub">Suma anual</div></div>
      <div class="kpi-card purple"><div class="kpi-label">🔧 Máqs. Reparadas</div><div class="kpi-value">${Math.round(totMaq)}</div><div class="kpi-sub">Total anual</div></div>
      <div class="kpi-card red"><div class="kpi-label">⏱️ Días Prom. Reparación</div><div class="kpi-value">${avgDias.toFixed(1)}</div><div class="kpi-sub">Promedio anual</div></div>`;

    /* ── KPIs ADMINISTRACIÓN ── */
    const gA = document.getElementById('kpi-empresa-admon');
    gA.innerHTML = `
      <div class="kpi-card blue"><div class="kpi-label">💵 Ingresos</div><div class="kpi-value">${fmtK(totIng)}</div><div class="kpi-sub">Anual · ${A.cortes.length} cortes</div></div>
      <div class="kpi-card purple"><div class="kpi-label">💸 Egresos</div><div class="kpi-value">${fmtK(totEgr)}</div><div class="kpi-sub">Anual</div></div>
      <div class="kpi-card red"><div class="kpi-label">⚙️ Gastos Operación</div><div class="kpi-value">${fmtK(totGas)}</div><div class="kpi-sub">Anual</div></div>
      <div class="kpi-card ${totFlu>=0?'green':'red'}"><div class="kpi-label">🌊 Flujo Acumulado</div><div class="kpi-value" style="color:${totFlu>=0?'#22c55e':'#f87171'}">${fmtK(totFlu)}</div><div class="kpi-sub">${totFlu>=0?'Positivo ✓':'Negativo ⚠'}</div></div>
      <div class="kpi-card amber"><div class="kpi-label">📅 Plazo Cobro</div><div class="kpi-value">${avgCob.toFixed(1)}d</div><div class="kpi-sub">Promedio · meta &lt;35</div></div>
      <div class="kpi-card green"><div class="kpi-label">📈 % Recuperación</div><div class="kpi-value">${(avgRec*100).toFixed(1)}%</div><div class="kpi-sub">Promedio · meta &lt;33%</div></div>
      <div class="kpi-card green"><div class="kpi-label">💼 Cartera Vigente</div><div class="kpi-value">${fmtK(avgCarteraVig)}</div><div class="kpi-sub">Promedio por corte · meta ${fmtK(A.metas['CARTERA_VIGENTE']||0)}</div></div>
      <div class="kpi-card red"><div class="kpi-label">⚠️ Cartera Vencida</div><div class="kpi-value">${fmtK(avgCarteraVen)}</div><div class="kpi-sub">Promedio por corte · meta &lt;${fmtK(A.metas['CARTERA_VENCIDA']||0)}</div></div>
      <div class="kpi-card blue"><div class="kpi-label">🔄 Ingreso esperado x cartera</div><div class="kpi-value">${fmtK(ingresoEsperadoCartera)}</div><div class="kpi-sub">% Recup. × Cartera vigente</div></div>
      <div class="kpi-card amber"><div class="kpi-label">🛡️ Margen Neto Proyectado</div><div class="kpi-value" style="color:${margenNetoMostrado>=0?'#22c55e':'#f87171'}">${margenNetoMostrado.toFixed(1)}%</div><div class="kpi-sub">amortizando cartera vigente</div></div>`;
  }

  /* ══════════════════════════════════════════════════════════
     NAVEGACIÓN
  ══════════════════════════════════════════════════════════ */
  const builtPages = {};

  window.filterCanal = function(mes, btn) {
    document.querySelectorAll('.month-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    window.Dash.ventas.canalesVenta.forEach(c => window.buildCanalChart(c, mes));
  };

  window.showPage = function(id, tabEl) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('page-'+id)?.classList.add('active');
    if (tabEl) tabEl.classList.add('active');

    if (!builtPages[id]) {
      builtPages[id] = true;
      const V = window.Dash.ventas;

      if (id==='resumen')     { buildKPIsVentas(); if(window.buildVentas) window.buildVentas(); }
      if (id==='canales') {
        buildMonthFilters();
        V.canalesVenta.forEach(c => window.buildCanalChart(c,'TODOS'));
      }
      if (id==='cortes') {
        buildMesSection();
        setTimeout(() => {
          window.buildChartApilado();
          const colors = ['#4f8ef7','#22c55e','#f59e0b','#a78bfa','#22d3ee','#f87171'];
          V.meses.forEach((mes,i) => window.buildMesChart('chartMes_'+mes, mes, colors[i%colors.length]));
        }, 60);
      }
      if (id==='tabla-v') buildTablaVentas();
      if (id==='ope')     { buildKPIsOpe(); window.buildOpe(); }
      if (id==='tabla-o') buildTablaOpe();
      if (id==='admon')   { buildKPIsAdmon(); window.buildAdmon(); }
      if (id==='tabla-a') buildTablaAdmon();
      if (id==='consolidado') { buildSemaforo(); window.buildConsolidado(); }
      if (id==='empresa')     { buildResumenEmpresa(); window.buildEmpresa(); }
    }
  };

  /* ── Init ─────────────────────────────────────────────────── */
  document.addEventListener('dashready', () => {
    buildHeader();
    buildKPIsVentas();
    builtPages.resumen = true;
    initAdminButton();
  });

  // Si el admin reconstruyó datos, refrescar TODAS las vistas
  document.addEventListener('dashrebuilt', () => {
    buildHeader();

    // Invalidar TODA la caché de páginas (incluido resumen) para que se
    // reconstruyan con datos frescos la próxima vez que se visiten
    Object.keys(builtPages).forEach(k => builtPages[k] = false);

    // Reconstruir SOLO la página visible ahora mismo (evita dibujar en
    // canvas ocultos de tamaño 0). Las demás se reconstruyen al navegar.
    const activePage = document.querySelector('.page.active');
    if (activePage) {
      const id = activePage.id.replace('page-', '');
      showPage(id, document.querySelector('.tab.active'));
    } else {
      // Si por alguna razón no hay página activa, al menos refrescar KPIs
      buildKPIsVentas();
      if (window.buildVentas) window.buildVentas();
    }
  });

})();
