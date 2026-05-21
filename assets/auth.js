/* ═══════════════════════════════════════════════════════════════
   auth.js — Sistema de autenticación seguro multi-usuario
   ───────────────────────────────────────────────────────────────
   • Contraseñas hasheadas con PBKDF2-HMAC-SHA256 (100k iters, salt 16B)
   • Verificación con comparación de tiempo constante
   • Bloqueo por intentos fallidos (5 intentos → 5 min de espera)
   • Sesión en sessionStorage con expiración (60 min)
   • Roles: 'ventas' | 'ope' | 'admon'  →  permisos por sección
   ═══════════════════════════════════════════════════════════════ */
(function () {

  const CFG = {
    ITERATIONS:        100000,           // debe coincidir con users.json
    KEY_BITS:          256,
    SESSION_MIN:       60,                // sesión expira en N minutos
    LOCKOUT_TRIES:     5,                 // intentos antes de bloquear
    LOCKOUT_MIN:       5,                 // minutos de bloqueo
    SESSION_KEY:       'dashSession',     // sessionStorage
    ATTEMPTS_KEY:      'dashLoginAttempts', // localStorage
    USERS_URL:         './data/users.json',
  };

  /* ── Estado interno ─────────────────────────────────────────── */
  let usersDoc = null;       // contenido de users.json
  let cachedSession = null;  // descodificada, lectura O(1)

  /* ── Hex utils ──────────────────────────────────────────────── */
  function hexToBytes(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(hex.substr(i*2, 2), 16);
    }
    return out;
  }
  function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  /* ── PBKDF2 ─────────────────────────────────────────────────── */
  async function pbkdf2(password, saltHex, iterations, keyBits) {
    if (!window.crypto || !crypto.subtle) {
      throw new Error('Web Crypto API no disponible. Usa HTTPS o localhost.');
    }
    const enc  = new TextEncoder();
    const salt = hexToBytes(saltHex);
    const km   = await crypto.subtle.importKey(
      'raw', enc.encode(password),
      { name: 'PBKDF2' }, false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      km, keyBits
    );
    return bytesToHex(new Uint8Array(bits));
  }

  /* ── Comparación de tiempo constante (anti-timing) ──────────── */
  function constantTimeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  /* ── Sanitización de username (anti-XSS / injection) ────────── */
  function sanitizeUsername(u) {
    return String(u || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.@-]/g, '')   // solo alfanuméricos + algunos símbolos
      .slice(0, 64);
  }

  /* ── Bloqueo por intentos fallidos ──────────────────────────── */
  function getAttempts() {
    try {
      const raw = localStorage.getItem(CFG.ATTEMPTS_KEY);
      if (!raw) return { count: 0, until: 0 };
      const o = JSON.parse(raw);
      return { count: o.count|0, until: o.until|0 };
    } catch { return { count: 0, until: 0 }; }
  }
  function recordFailedAttempt() {
    const a = getAttempts();
    a.count += 1;
    if (a.count >= CFG.LOCKOUT_TRIES) {
      a.until = Date.now() + CFG.LOCKOUT_MIN * 60 * 1000;
      a.count = 0;
    }
    localStorage.setItem(CFG.ATTEMPTS_KEY, JSON.stringify(a));
  }
  function clearAttempts() {
    localStorage.removeItem(CFG.ATTEMPTS_KEY);
  }
  function isLockedNow() {
    const a = getAttempts();
    return a.until > Date.now();
  }
  function minutesLeftLock() {
    const a = getAttempts();
    return Math.max(0, Math.ceil((a.until - Date.now()) / 60000));
  }

  /* ── Sesión ─────────────────────────────────────────────────── */
  function readSession() {
    try {
      const raw = sessionStorage.getItem(CFG.SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.username || !s.role || !s.expiresAt) return null;
      if (Date.now() > s.expiresAt) {
        sessionStorage.removeItem(CFG.SESSION_KEY);
        return null;
      }
      return s;
    } catch { return null; }
  }
  function writeSession(user) {
    const s = {
      username:   user.username,
      role:       user.role,
      name:       user.name || user.username,
      issuedAt:   Date.now(),
      expiresAt:  Date.now() + CFG.SESSION_MIN * 60 * 1000,
    };
    sessionStorage.setItem(CFG.SESSION_KEY, JSON.stringify(s));
    cachedSession = s;
    return s;
  }
  function clearSession() {
    sessionStorage.removeItem(CFG.SESSION_KEY);
    cachedSession = null;
  }
  function touchSession() {
    // Renueva expiración tras actividad
    const s = cachedSession || readSession();
    if (!s) return;
    s.expiresAt = Date.now() + CFG.SESSION_MIN * 60 * 1000;
    sessionStorage.setItem(CFG.SESSION_KEY, JSON.stringify(s));
    cachedSession = s;
  }

  /* ── Carga del catálogo de usuarios ─────────────────────────── */
  async function loadUsers() {
    if (usersDoc) return usersDoc;
    const resp = await fetch(CFG.USERS_URL + '?v=' + Date.now(), { cache: 'no-store' });
    if (!resp.ok) throw new Error('No se pudo cargar users.json (HTTP '+resp.status+')');
    const doc = await resp.json();
    if (!doc || !Array.isArray(doc.users)) throw new Error('users.json inválido');
    // Usa la configuración del archivo si está presente (permite migrar parámetros)
    if (doc._meta?.iterations) CFG.ITERATIONS = doc._meta.iterations;
    if (doc._meta?.keyLengthBits) CFG.KEY_BITS = doc._meta.keyLengthBits;
    usersDoc = doc;
    return doc;
  }

  /* ── Login principal ────────────────────────────────────────── */
  async function login(usernameInput, passwordInput) {
    if (isLockedNow()) {
      return { ok:false, reason:'locked', minutes: minutesLeftLock() };
    }
    const username = sanitizeUsername(usernameInput);
    const password = String(passwordInput || '');
    if (!username || !password) {
      return { ok:false, reason:'empty' };
    }
    let doc;
    try { doc = await loadUsers(); }
    catch (e) { return { ok:false, reason:'no_users', error: e.message }; }

    const user = doc.users.find(u => sanitizeUsername(u.username) === username);

    // Compute hash incluso si el usuario no existe → evita timing-attack
    const targetSalt = user ? user.salt : '0000000000000000000000000000000000';
    const hash = await pbkdf2(password, targetSalt, CFG.ITERATIONS, CFG.KEY_BITS);

    if (!user || !constantTimeEqual(hash, user.hash)) {
      recordFailedAttempt();
      const a = getAttempts();
      return {
        ok: false,
        reason: 'bad_credentials',
        remaining: Math.max(0, CFG.LOCKOUT_TRIES - a.count),
      };
    }
    clearAttempts();
    const session = writeSession(user);
    return { ok:true, session };
  }

  /* ── Permisos por rol ───────────────────────────────────────── */
  // Sección DOM ('ventas'|'ope'|'admon') → rol que puede editar
  // 'super' puede editar TODAS las secciones.
  function canEdit(seccion) {
    const s = cachedSession || readSession();
    if (!s) return false;
    if (s.role === 'super') return true;
    return s.role === seccion;
  }
  function role() {
    const s = cachedSession || readSession();
    return s ? s.role : null;
  }
  function user() {
    const s = cachedSession || readSession();
    return s ? { username: s.username, role: s.role, name: s.name } : null;
  }
  function isLogged() {
    return !!(cachedSession || readSession());
  }
  function isSuper() {
    const s = cachedSession || readSession();
    return !!s && s.role === 'super';
  }

  /* ── Cambio de contraseña (genera nuevo salt/hash) ──────────── */
  async function generateHash(password) {
    const saltBytes = new Uint8Array(16);
    crypto.getRandomValues(saltBytes);
    const saltHex = bytesToHex(saltBytes);
    const hashHex = await pbkdf2(password, saltHex, CFG.ITERATIONS, CFG.KEY_BITS);
    return { salt: saltHex, hash: hashHex };
  }
  async function changeMyPassword(currentPwd, newPwd) {
    const s = cachedSession || readSession();
    if (!s) return { ok:false, reason:'no_session' };
    const doc = await loadUsers();
    const u = doc.users.find(x => sanitizeUsername(x.username) === s.username);
    if (!u) return { ok:false, reason:'user_not_found' };

    const currentHash = await pbkdf2(currentPwd, u.salt, CFG.ITERATIONS, CFG.KEY_BITS);
    if (!constantTimeEqual(currentHash, u.hash)) {
      return { ok:false, reason:'wrong_current' };
    }
    if (!newPwd || newPwd.length < 8) {
      return { ok:false, reason:'weak', message:'La contraseña debe tener al menos 8 caracteres' };
    }
    const { salt, hash } = await generateHash(newPwd);
    u.salt = salt;
    u.hash = hash;
    // Guardamos solo en memoria + permitimos exportar el nuevo users.json
    return { ok:true, updatedDoc: doc };
  }

  /* ── API pública ────────────────────────────────────────────── */
  window.Auth = {
    login,
    logout()       { clearSession(); },
    isLogged,
    isSuper,
    user,
    role,
    canEdit,
    touch:         touchSession,
    generateHash,
    changeMyPassword,
    isLockedNow,
    minutesLeftLock,
    _config: () => ({ ...CFG }),
  };

  // Cargar el catálogo en background para tener todo listo cuando el usuario abra el modal
  loadUsers().catch(e => console.warn('[Auth] users.json no cargado:', e.message));

})();
