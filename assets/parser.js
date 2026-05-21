/* ═══════════════════════════════════════════════════════════════
   parser.js — Lee data/dash.json y expone window.Dash
   Misma interfaz que antes (ventas / ope / admon)
   ═══════════════════════════════════════════════════════════════ */
(function () {

  const MES_ABR = {
    ENERO:'Ene',FEBRERO:'Feb',MARZO:'Mar',ABRIL:'Abr',
    MAYO:'May',JUNIO:'Jun',JULIO:'Jul',AGOSTO:'Ago',
    SEPTIEMBRE:'Sep',OCTUBRE:'Oct',NOVIEMBRE:'Nov',DICIEMBRE:'Dic'
  };

  /* Calcula acumuladoMes: último valor de cada canal por mes */
  function calcAcumulado(cortes, data) {
    const meses = [...new Set(cortes.map(c => c.mes))];
    const acu   = {};
    meses.forEach(mes => {
      const idx = cortes.map((c,i) => c.mes === mes ? i : -1).filter(i => i >= 0);
      const last = idx[idx.length - 1];
      acu[mes] = {};
      Object.keys(data).forEach(k => { acu[mes][k] = data[k][last] || 0; });
    });
    return acu;
  }

  /* Procesa el JSON crudo → estructura window.Dash */
  function buildDash(raw) {
    /* — VENTAS — */
    const V = raw.ventas;
    const vMeses = [...new Set(V.cortes.map(c => c.mes))];
    // Recalcula VENTAS TOTALES por si el admin editó canales
    const canales = ['PUNTO DE VENTA','CALL CENTER','PLATAFORMA','ASESORES'];
    V.data['VENTAS TOTALES'] = V.cortes.map((_,i) =>
      canales.reduce((s,c) => s + (V.data[c]?.[i] || 0), 0)
    );

    const ventas = {
      cortes:      V.cortes,
      meses:       vMeses,
      data:        V.data,
      metas:       V.metas,
      pedidos:     V.pedidos || {},
      acumuladoMes: calcAcumulado(V.cortes, V.data),
      canalesVenta: canales,
      canalConfig: {
        'PUNTO DE VENTA':{ color:'#4f8ef7', cls:'blue',   icon:'🏪' },
        'CALL CENTER':   { color:'#22c55e', cls:'green',  icon:'📞' },
        'PLATAFORMA':    { color:'#f59e0b', cls:'amber',  icon:'💻' },
        'ASESORES':      { color:'#a78bfa', cls:'purple', icon:'👥' },
        'VENTAS TOTALES':{ color:'#f87171', cls:'red',    icon:'💰' },
      },
    };

    /* — OPE — */
    const O = raw.ope;
    const oMeses = [...new Set(O.cortes.map(c => c.mes))];
    const ope = {
      cortes:    O.cortes,
      meses:     oMeses,
      data:      O.data,
      metas:     O.metas,
      indicadores: [
        {key:'COMPRA',            row:2, label:'Compras ($)',            tipo:'$',   metaOp:'>=', color:'#4f8ef7'},
        {key:'DEVOLUCIONES',      row:3, label:'Devoluciones',          tipo:'num', metaOp:'<',  color:'#22c55e'},
        {key:'NIVEL_SERVICIO',    row:6, label:'Nivel de Servicio ($)', tipo:'$',   metaOp:'>=', color:'#f59e0b'},
        {key:'MAQUINAS',          row:7, label:'Máquinas Reparadas',    tipo:'num', metaOp:'>=', color:'#a78bfa'},
        {key:'DIAS_REPARACION',   row:8, label:'Días Prom. Reparación', tipo:'num', metaOp:'<=', color:'#f87171'},
      ],
    };

    /* — ADMON — */
    const A = raw.admon;
    const aMeses = [...new Set(A.cortes.map(c => c.mes))];
    /* Asegura existencia de arrays nuevos (CARTERA_*) por si dash.json es antiguo */
    if (!Array.isArray(A.data['CARTERA_VIGENTE'])) {
      A.data['CARTERA_VIGENTE'] = A.cortes.map(() => null);
    }
    if (!Array.isArray(A.data['CARTERA_VENCIDA'])) {
      A.data['CARTERA_VENCIDA'] = A.cortes.map(() => null);
    }
    /* Defaults razonables para metas si faltan */
    if (A.metas['CARTERA_VIGENTE'] == null) A.metas['CARTERA_VIGENTE'] = 2200000;
    if (A.metas['CARTERA_VENCIDA'] == null) A.metas['CARTERA_VENCIDA'] = 250000;

    /* Preservar FLUJO explícito del JSON si existe; calcular sólo cuando falte */
    const flujoExistente = A.data['FLUJO'] || [];
    A.data['FLUJO'] = A.cortes.map((_,i) => {
      // Si ya viene un valor explícito en el JSON, respetarlo
      if (flujoExistente[i] != null && !isNaN(flujoExistente[i])) {
        return flujoExistente[i];
      }
      // Si no, calcularlo (tratando null como 0 para Ing/Egr/Gas)
      const ing = A.data['INGRESOS']?.[i];
      const egr = A.data['EGRESOS']?.[i];
      const gas = A.data['GASTOS_OPERACION']?.[i];
      if (ing == null && egr == null && gas == null) return null;
      return (ing || 0) - (egr || 0) - (gas || 0);
    });

    const admon = {
      cortes:    A.cortes,
      meses:     aMeses,
      data:      A.data,
      metas:     A.metas,
      indicadores: [
        {key:'INGRESOS',        row:5,  label:'Ingresos ($)',          tipo:'$',    metaOp:'>=', color:'#4f8ef7'},
        {key:'PLAZO_COBRO',     row:6,  label:'Plazo de Cobro (días)', tipo:'dias', metaOp:'<',  color:'#22c55e'},
        {key:'RECUPERACION',    row:7,  label:'% Recuperación',        tipo:'pct',  metaOp:'<',  color:'#f59e0b'},
        {key:'EGRESOS',         row:8,  label:'Egresos ($)',           tipo:'$',    metaOp:'<=', color:'#a78bfa'},
        {key:'GASTOS_OPERACION',row:9,  label:'Gastos Operación ($)',  tipo:'$',    metaOp:'<=', color:'#f87171'},
        {key:'FLUJO',           row:10, label:'Flujo de Efectivo',     tipo:'$',    metaOp:'>0', color:'#22d3ee'},
        {key:'CARTERA_VIGENTE', row:11, label:'Cartera Vigente ($)',   tipo:'$',    metaOp:'>=', color:'#10b981'},
        {key:'CARTERA_VENCIDA', row:12, label:'Cartera Vencida ($)',   tipo:'$',    metaOp:'<=', color:'#ef4444'},
      ],
    };

    return { ventas, ope, admon, _raw: raw };
  }

  /* Carga dash.json (primero revisa override en localStorage) */
  async function loadDash() {
    const loader  = document.getElementById('loader');
    const loaderP = loader.querySelector('p');
    try {
      loaderP.textContent = 'Cargando base de datos…';
      const resp = await fetch('./data/dash.json?v=' + Date.now());
      if (!resp.ok) throw new Error('No se pudo cargar data/dash.json (HTTP ' + resp.status + ')');
      const raw = await resp.json();

      /* Si existe override de admin en localStorage, mezclarlo */
      const overStr = localStorage.getItem('dashOverride');
      if (overStr) {
        try {
          const over = JSON.parse(overStr);
          if (over._meta?.version === raw._meta?.version) {
            if (over.ventas) Object.assign(raw.ventas, over.ventas);
            if (over.ope)    Object.assign(raw.ope,    over.ope);
            if (over.admon)  Object.assign(raw.admon,  over.admon);
            console.info('[Admin] Override de localStorage aplicado');
          }
        } catch(e) { console.warn('[Admin] Override inválido, ignorado', e); }
      }

      window.Dash     = buildDash(raw);
      window.DashRaw  = raw;   // guardamos raw para edición admin

      await new Promise(r => setTimeout(r, 150));
      loader.style.display = 'none';
      document.getElementById('app').style.display = 'block';
      document.dispatchEvent(new Event('dashready'));

    } catch (err) {
      loaderP.textContent = '';
      const d = document.createElement('div');
      d.className = 'err';
      const isHttp = /HTTP\s*4\d\d/.test(err.message);
      d.innerHTML = '<strong>⚠️ Error al cargar datos del dashboard</strong><br><br>' +
        '<code style="background:rgba(0,0,0,.3);padding:2px 6px;border-radius:4px">' +
        (err.message || err) + '</code><br><br>' +
        (isHttp
          ? '<em>El archivo <code>data/dash.json</code> no existe o no es accesible. ' +
            'Verifica que esté subido al repositorio de GitHub en la ruta correcta.</em>'
          : '<em>Si abriste el archivo directamente (file://) NO funcionará. ' +
            'Usa GitHub Pages, Live Server o <code>python -m http.server</code>.</em>') +
        '<br><br><small style="color:#8b90b0">Ruta esperada: <code>' +
        location.origin + location.pathname.replace(/[^/]+$/, '') + 'data/dash.json</code></small>';
      loader.appendChild(d);
      console.error('[Dash] Error fatal:', err);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadDash);
  else loadDash();
})();
