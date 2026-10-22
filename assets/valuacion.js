/* ═══════════════════════════════════════════════════════════════
   valuacion.js — Módulo "Valuación Mensual" · Grupo Águila
   ---------------------------------------------------------------
   · Sub-bloques: Global · Trimestres · cada mes completo.
   · Botón "Calcular por":
       📅 Por cortes     → cada corte semanal cuenta completo en el
                           mes que tiene asignado (igual que el dash).
       🗓️ Mes calendario → cada corte = 7 días que terminan en su
                           fecha; se prorratea por día al mes real
                           (ej. Oct/02 = 26-Sep..02-Oct → 5/7 a Sep,
                           2/7 a Oct). Opcional: proyectar días sin
                           corte capturado.
   · Integra el gasto fijo mensual (dash.json → gastos) con Ventas,
     Operaciones y Administración: estado de resultados, KPIs,
     gráficas, tabla por concepto, hallazgos y calidad de datos.
   Depende de: Chart.js, window.Dash / window.DashRaw (parser.js),
               window.DashAdmin (ui.js) para importar/guardar.
   ═══════════════════════════════════════════════════════════════ */
(function () {

  /* ── Constantes ─────────────────────────────────────────────── */
  const MES     = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  const MES_ABR = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const ABR2I   = Object.fromEntries(MES_ABR.map((a,i) => [a.toLowerCase(), i]));
  const CANALES = ['PUNTO DE VENTA','CALL CENTER','PLATAFORMA','ASESORES'];
  const CAN_LBL = {'PUNTO DE VENTA':'Punto de Venta','CALL CENTER':'Call Center','PLATAFORMA':'Plataforma','ASESORES':'Asesores'};
  const CAN_COL = {'PUNTO DE VENTA':'#38bdf8','CALL CENTER':'#34d399','PLATAFORMA':'#fbbf24','ASESORES':'#a78bfa'};
  const CAT_COL = {
    'CAPITAL HUMANO':'#38bdf8', 'FLOTA Y LOGISTICA':'#fb7185', 'OBLIGACIONES FISCALES':'#fbbf24',
    'FINANCIERO Y CORPORATIVO':'#a78bfa', 'OPERACION Y ADMINISTRACION':'#2dd4bf', 'INSTALACIONES Y SERVICIOS':'#34d399',
  };
  const PALETTE = ['#38bdf8','#fb7185','#fbbf24','#a78bfa','#2dd4bf','#34d399','#ff6a13','#f472b6','#94a3b8'];
  const catColor = (c, i) => CAT_COL[c] || PALETTE[i % PALETTE.length];

  const GRID  = 'rgba(255,255,255,0.05)';
  const MUTED = '#a8998a';
  const TICK  = { color: MUTED, font: { size: 10 } };

  /* ── Estado (periodo + modo) — preferencia por navegador ────── */
  const ST = { period: 'GLOBAL', mode: 'cortes', proyectar: false };
  try {
    const s = JSON.parse(localStorage.getItem('vmState') || '{}');
    if (s.mode === 'cortes' || s.mode === 'calendario') ST.mode = s.mode;
    if (typeof s.period === 'string') ST.period = s.period;
    ST.proyectar = !!s.proyectar;
  } catch (e) { /* almacenamiento no disponible: se usan valores por defecto */ }
  function saveState() { try { localStorage.setItem('vmState', JSON.stringify(ST)); } catch (e) {} }

  /* ── Formato ────────────────────────────────────────────────── */
  const isNum = v => v !== null && v !== undefined && !isNaN(v) && isFinite(v);
  const fmt   = v => !isNum(v) ? '—' : (v < 0 ? '-' : '') + '$' + Math.abs(Math.round(v)).toLocaleString('es-MX');
  const fmtM  = v => {
    if (!isNum(v)) return '—';
    const a = Math.abs(v), s = v < 0 ? '-' : '';
    return a >= 1e6 ? s + '$' + (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? s + '$' + (a / 1e3).toFixed(0) + 'K' : s + '$' + a.toFixed(0);
  };
  const fmtAx = v => {
    if (!isNum(v)) return '';
    const a = Math.abs(v), s = v < 0 ? '-' : '';
    return a >= 1e6 ? s + '$' + (a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? s + '$' + (a / 1e3).toFixed(0) + 'K' : s + '$' + a.toFixed(0);
  };
  const pct   = (v, d = 1) => isNum(v) ? (v * 100).toFixed(d) + '%' : '—';
  const sgnP  = (v, d = 1) => isNum(v) ? (v > 0 ? '+' : '') + (v * 100).toFixed(d) + '%' : '—';
  const sgnPP = (v, d = 1) => isNum(v) ? (v > 0 ? '+' : '') + (v * 100).toFixed(d) + ' pp' : '—';
  const num   = (v, d = 0) => isNum(v) ? (+v).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
  const cap   = m => m ? m[0] + m.slice(1).toLowerCase() : '';
  const div   = (a, b) => (isNum(a) && isNum(b) && b !== 0) ? a / b : null;
  const esc   = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  /* ── Calendario ─────────────────────────────────────────────── */
  function year() {
    const g = window.DashRaw && window.DashRaw.gastos;
    return (g && +g.anio) || 2026;
  }
  const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
  /* "Sep/04", "Oct/02*" → Date fin del corte */
  function corteEnd(label) {
    const mt = String(label || '').match(/([A-Za-zÁÉÍÓÚáéíóú]{3})\D*(\d{1,2})/);
    if (!mt) return null;
    const mi = ABR2I[mt[1].toLowerCase()];
    if (mi === undefined) return null;
    return new Date(year(), mi, +mt[2]);
  }
  const fmtDay = d => String(d.getDate()).padStart(2, '0') + '-' + MES_ABR[d.getMonth()];

  /* Meses calendario COMPLETOS con algún dato (ventas/ope/admon/gastos) */
  function completeMonths() {
    const y = year(), today = new Date();
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let lastData = -1;
    ['ventas','ope','admon'].forEach(s => {
      const S = window.Dash && window.Dash[s];
      if (!S) return;
      S.cortes.forEach(c => { const i = MES.indexOf(c.mes); if (i > lastData) lastData = i; });
    });
    const G = window.DashRaw && window.DashRaw.gastos;
    if (G && G.meses) G.meses.forEach(m => { const i = MES.indexOf(m); if (i > lastData) lastData = i; });
    const out = [];
    for (let m = 0; m <= Math.min(11, lastData); m++) {
      const finMes = new Date(y, m + 1, 1);       // día siguiente al último del mes
      if (y < t0.getFullYear() || finMes <= t0) out.push(m);
    }
    return out;
  }

  /* ════════════════════════════════════════════════════════════
     MOTOR DE AGREGACIÓN
     Devuelve, para un indicador y un conjunto de meses, el valor
     agregado según el modo:
       sum → flujos ($, piezas, pedidos)       avg → saldos / tasas / días
  ════════════════════════════════════════════════════════════ */
  function cortesTouching(sec, months, mode) {
    const S = window.Dash[sec];
    const out = [];
    S.cortes.forEach((c, i) => {
      const end = corteEnd(c.label);
      const days = [];
      if (end) for (let k = 6; k >= 0; k--) {
        const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - k);
        if (d.getFullYear() === year() && months.includes(d.getMonth())) days.push(d);
      }
      let w;
      if (mode === 'cortes') w = months.includes(MES.indexOf(c.mes)) ? 1 : 0;
      else w = days.length / 7;
      if (w > 0 || (mode === 'cortes' && days.length)) out.push({ i, c, w, days, end });
    });
    return out;
  }

  function totalDays(months) { const y = year(); return months.reduce((s, m) => s + daysIn(y, m), 0); }

  function agg(sec, key, months, op = 'sum', modeOverride) {
    const mode = modeOverride || ST.mode;
    const S = window.Dash[sec];
    const vals = (S && S.data[key]) || [];
    const T = totalDays(months);
    let sum = 0, wsum = 0, n = 0;
    const covered = new Set();
    cortesTouching(sec, months, mode).forEach(t => {
      if (t.w <= 0) return;
      const v = vals[t.i];
      if (!isNum(v)) return;
      sum += v * t.w; wsum += t.w; n++;
      t.days.forEach(d => covered.add(d.getMonth() * 100 + d.getDate()));
    });
    const cov = T ? covered.size / T : 0;
    if (!n) return { value: null, n: 0, cov, coveredDays: covered.size, T, metaFactor: 0 };
    let value = op === 'avg' ? sum / wsum : sum;
    let projected = false;
    if (op === 'sum' && mode === 'calendario' && ST.proyectar && cov > 0 && cov < 1) {
      value = value / cov; projected = true;
    }
    const metaFactor = mode === 'cortes' ? n : (projected ? T : covered.size) / 7;
    return { value, n, cov, coveredDays: covered.size, T, metaFactor, projected };
  }
  const val = r => (r && isNum(r.value)) ? r.value : null;

  /* ── Gasto fijo (mensual calendario: no depende de cortes) ──── */
  function gastoData() { return (window.DashRaw && window.DashRaw.gastos) || null; }
  function gastos(months) {
    const G = gastoData();
    const res = { total: null, byCat: {}, byConcept: {}, cat: {}, monthsWith: [], monthsMissing: [] };
    if (!G) { res.monthsMissing = months.slice(); return res; }
    const idx = months.map(m => G.meses.indexOf(MES[m]));
    months.forEach((m, k) => (idx[k] >= 0 ? res.monthsWith : res.monthsMissing).push(m));
    if (!res.monthsWith.length) return res;
    let tot = 0;
    G.conceptos.forEach(c => {
      let s = 0;
      idx.forEach(j => { if (j >= 0 && isNum(c.valores[j])) s += +c.valores[j]; });
      res.byConcept[c.concepto] = (res.byConcept[c.concepto] || 0) + s;
      res.cat[c.concepto] = c.categoria;
      res.byCat[c.categoria] = (res.byCat[c.categoria] || 0) + s;
      tot += s;
    });
    res.total = tot;
    return res;
  }

  /* ════════════════════════════════════════════════════════════
     MODELO DEL PERIODO — todo lo que se muestra sale de aquí
  ════════════════════════════════════════════════════════════ */
  function model(months) {
    const D = window.Dash;
    const M = { months, nM: months.length, T: totalDays(months) };
    const V = D.ventas.metas, O = D.ope.metas, A = D.admon.metas;

    /* Ventas */
    M.v = {};
    CANALES.forEach(c => { M.v[c] = agg('ventas', c, months); });
    M.v.total = agg('ventas', 'VENTAS TOTALES', months);
    M.vMeta = (V['VENTAS TOTALES'] || 0) * M.v.total.metaFactor;
    M.vMetaCanal = {};
    CANALES.forEach(c => { M.vMetaCanal[c] = (V[c] || 0) * M.v[c].metaFactor; });

    /* Operaciones */
    M.o = {
      compra: agg('ope','COMPRA',months), dev: agg('ope','DEVOLUCIONES',months),
      ns: agg('ope','NIVEL_SERVICIO',months), nsPct: agg('ope','NIVEL_SERVICIO_PCT',months,'avg'),
      maq: agg('ope','MAQUINAS',months), dias: agg('ope','DIAS_REPARACION',months,'avg'),
      rl: agg('ope','REPARTO_LOCAL',months), rf: agg('ope','REPARTO_FORANEO',months),
      pe: agg('ope','ALM_PEDIDOS',months), pa: agg('ope','ALM_PARTIDAS',months),
    };
    M.oMeta = {
      compra: (O['COMPRA'] || 0) * M.o.compra.metaFactor,
      dev: (O['DEVOLUCIONES'] || 0) * M.o.dev.metaFactor,
      maq: (O['MAQUINAS'] || 0) * M.o.maq.metaFactor,
      dias: O['DIAS_REPARACION'],
    };

    /* Administración */
    M.a = {
      ing: agg('admon','INGRESOS',months), egr: agg('admon','EGRESOS',months),
      gop: agg('admon','GASTOS_OPERACION',months), flujo: agg('admon','FLUJO',months),
      plazo: agg('admon','PLAZO_COBRO',months,'avg'), rec: agg('admon','RECUPERACION',months,'avg'),
      cvig: agg('admon','CARTERA_VIGENTE',months,'avg'), cven: agg('admon','CARTERA_VENCIDA',months,'avg'),
    };
    M.aMeta = { ing: (A['INGRESOS'] || 0) * M.a.ing.metaFactor, gop: (A['GASTOS_OPERACION'] || 0) * M.a.gop.metaFactor };

    /* Gasto fijo */
    M.g = gastos(months);

    /* Estado de resultados */
    const vt = val(M.v.total), cp = val(M.o.compra), gf = M.g.total;
    M.pl = {
      ventas: vt, compras: cp,
      ub: isNum(vt) && isNum(cp) ? vt - cp : null,
      gf,
    };
    M.pl.mb  = div(M.pl.ub, vt);
    M.pl.uo  = isNum(M.pl.ub) && isNum(gf) ? M.pl.ub - gf : null;
    M.pl.mo  = div(M.pl.uo, vt);
    M.pl.gfv = div(gf, vt);
    M.pl.gfub= div(gf, M.pl.ub);
    M.pl.cv  = div(cp, vt);                          // compras / ventas
    M.pl.pe  = (isNum(gf) && isNum(M.pl.mb) && M.pl.mb > 0) ? gf / M.pl.mb : null;   // punto de equilibrio
    M.pl.hol = div(vt, M.pl.pe); if (isNum(M.pl.hol)) M.pl.hol -= 1;
    M.pl.cob = div(val(M.a.ing), vt);                // cobranza / ventas
    return M;
  }

  /* ── Periodos disponibles ───────────────────────────────────── */
  function periods() {
    const cm = completeMonths();
    const list = [];
    if (cm.length) list.push({ id: 'GLOBAL', label: 'Global', sub: MES_ABR[cm[0]] + '–' + MES_ABR[cm[cm.length - 1]], months: cm.slice(), kind: 'global' });
    [0,1,2,3].forEach(q => {
      const ms = [q*3, q*3+1, q*3+2];
      if (ms.every(m => cm.includes(m))) list.push({ id: 'T' + (q+1), label: (q+1) + 'T', sub: MES_ABR[ms[0]] + '–' + MES_ABR[ms[2]], months: ms, kind: 'quarter' });
    });
    cm.forEach(m => list.push({ id: 'M' + m, label: MES_ABR[m], sub: '', months: [m], kind: 'month' }));
    return list;
  }
  function prevOf(p, all) {
    if (p.kind === 'month') { const m = p.months[0]; return all.find(x => x.id === 'M' + (m - 1)) || null; }
    if (p.kind === 'quarter') { const q = +p.id.slice(1); return all.find(x => x.id === 'T' + (q - 1)) || null; }
    return null;
  }
  const periodName = p => p.kind === 'month' ? cap(MES[p.months[0]]) + ' ' + year()
                       : p.kind === 'quarter' ? p.label + ' ' + year() + ' (' + p.sub + ')'
                       : 'Global ' + p.sub + ' ' + year();

  /* ── Registro de gráficas ───────────────────────────────────── */
  const CH = {};
  function mk(id, cfg) {
    if (CH[id]) { CH[id].destroy(); delete CH[id]; }
    const el = document.getElementById(id);
    if (!el) return null;
    CH[id] = new Chart(el, cfg);
    return CH[id];
  }
  function destroyAll() { Object.keys(CH).forEach(k => { CH[k].destroy(); delete CH[k]; }); }
  const tipMoney = { callbacks: { label: c => ' ' + c.dataset.label + ': ' + fmt(c.raw) } };
  /* Leyenda con color pleno aunque las barras usen colores atenuados por mes */
  const legendLabels = {
    generateLabels: chart => Chart.defaults.plugins.legend.labels.generateLabels(chart).map(l => {
      const ds = chart.data.datasets[l.datasetIndex];
      if (ds && Array.isArray(ds.backgroundColor)) {
        const c = String(ds.backgroundColor[0] || '').slice(0, 7);
        l.fillStyle = c + 'dd'; l.strokeStyle = c;
      }
      return l;
    }),
  };
  function baseOpts(extra = {}) {
    if (extra.plugins && extra.plugins.legend && extra.plugins.legend.display !== false) {
      extra.plugins.legend.labels = Object.assign({}, legendLabels, extra.plugins.legend.labels || {});
    }
    return Object.assign({
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'top', labels: legendLabels }, tooltip: tipMoney },
      scales: {
        x: { grid: { display: false }, ticks: TICK },
        y: { grid: { color: GRID }, ticks: { ...TICK, callback: fmtAx } },
      },
    }, extra);
  }
  /* color resaltado para meses dentro del periodo seleccionado */
  const hi = (months, sel, col) => months.map(m => sel.includes(m) ? col + 'dd' : col + '30');

  /* ════════════════════════════════════════════════════════════
     CALIDAD DE DATOS — valores atípicos y cobertura
  ════════════════════════════════════════════════════════════ */
  const SEC_LBL = { ventas: 'Ventas', ope: 'Operaciones', admon: 'Administración' };
  const KEY_LBL = {
    'PUNTO DE VENTA':'Punto de Venta','CALL CENTER':'Call Center','PLATAFORMA':'Plataforma','ASESORES':'Asesores','VENTAS TOTALES':'Ventas Totales',
    COMPRA:'Compras',DEVOLUCIONES:'Devoluciones',NIVEL_SERVICIO:'Nivel de Servicio $',NIVEL_SERVICIO_PCT:'Nivel de Servicio %',MAQUINAS:'Máquinas',
    DIAS_REPARACION:'Días reparación',REPARTO_LOCAL:'Reparto local',REPARTO_FORANEO:'Reparto foráneo',ALM_PEDIDOS:'Pedidos almacén',ALM_PARTIDAS:'Partidas almacén',
    INGRESOS:'Ingresos',EGRESOS:'Egresos',GASTOS_OPERACION:'Gastos operación',FLUJO:'Flujo',PLAZO_COBRO:'Plazo cobro',RECUPERACION:'% Recuperación',
    CARTERA_VIGENTE:'Cartera vigente',CARTERA_VENCIDA:'Cartera vencida',
  };
  function anomalies(months) {
    const out = [];
    ['ventas','ope','admon'].forEach(sec => {
      const S = window.Dash[sec];
      Object.keys(S.data).forEach(key => {
        if (key === 'FLUJO' || key === 'VENTAS TOTALES') return;
        const arr = S.data[key];
        if (!Array.isArray(arr)) return;
        const nn = arr.filter(isNum).map(Math.abs).sort((a, b) => a - b);
        if (nn.length < 5) return;
        const med = nn[Math.floor(nn.length / 2)];
        if (!(med > 0)) return;
        arr.forEach((v, i) => {
          if (!isNum(v)) return;
          const c = S.cortes[i];
          const r = Math.abs(v) / med;
          if (r > 20 || (r < 1 / 20 && Math.abs(v) > 0)) {
            const end = corteEnd(c.label);
            const inP = months.includes(MES.indexOf(c.mes)) || (end && months.includes(end.getMonth()));
            if (inP) out.push({ sec, key, label: c.label, v, med });
          }
        });
      });
    });
    return out;
  }

  /* ════════════════════════════════════════════════════════════
     HALLAZGOS AUTOMÁTICOS (para la junta)
  ════════════════════════════════════════════════════════════ */
  function insights(p, M, P, monthly, cm) {
    const H = [];
    const add = (t, html) => H.push({ t, html });
    const avgMO = (() => { const g = model(cm); return g.pl.mo; })();

    /* Rentabilidad */
    if (isNum(M.pl.mo)) {
      const vsP = P && isNum(P.pl.mo) ? ` · ${sgnPP(M.pl.mo - P.pl.mo)} vs periodo anterior` : '';
      const vsG = p.kind !== 'global' && isNum(avgMO) ? ` · promedio del año ${pct(avgMO)}` : '';
      add(M.pl.mo >= (avgMO || 0) ? 'good' : M.pl.mo >= 0.15 ? 'warn' : 'bad',
        `<b>Margen operativo ${pct(M.pl.mo)}</b> (${fmtM(M.pl.uo)} de utilidad operativa sobre ${fmtM(M.pl.ventas)} de ventas)${vsP}${vsG}.`);
    }
    if (isNum(M.pl.mb) && P && isNum(P.pl.mb) && Math.abs(M.pl.mb - P.pl.mb) >= 0.05) {
      add(M.pl.mb > P.pl.mb ? 'good' : 'warn',
        `Margen bruto ${pct(M.pl.mb)} (${sgnPP(M.pl.mb - P.pl.mb)}): compras ${fmtM(M.pl.compras)} = ${pct(M.pl.cv)} de las ventas. ` +
        (M.pl.cv > 0.6 ? 'Compras altas vs venta: revisar si es reposición/inventario o costo real.' : 'Relación compra/venta favorable.'));
    }
    if (isNum(M.pl.cv) && M.pl.cv > 0.65 && !(P && isNum(P.pl.mb))) {
      add('warn', `Compras = ${pct(M.pl.cv)} de las ventas del periodo; el margen bruto puede estar castigado por compras de inventario.`);
    }

    /* Gasto fijo */
    if (isNum(M.g.total)) {
      const prom = (() => { const g = gastos(cm); return g.monthsWith.length ? g.total / g.monthsWith.length : null; })();
      const porMes = M.g.total / Math.max(1, M.g.monthsWith.length);
      let txt = `<b>Gasto fijo ${fmtM(M.g.total)}</b> = ${pct(M.pl.gfv)} de las ventas`;
      if (p.kind !== 'global' && isNum(prom)) txt += ` · ${sgnP(porMes / prom - 1)} vs promedio mensual (${fmtM(prom)})`;
      add(M.pl.gfv > 0.2 ? 'bad' : M.pl.gfv > 0.18 ? 'warn' : 'good', txt + '.');
      if (P && isNum(P.g.total)) {
        const d = M.g.total - P.g.total;
        const drivers = Object.keys(M.g.byConcept).map(k => ({ k, d: (M.g.byConcept[k] || 0) - (P.g.byConcept[k] || 0) }))
          .sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 3).filter(x => Math.abs(x.d) > 1000);
        add(d > 0 ? 'warn' : 'good',
          `Gasto fijo ${d > 0 ? 'subió' : 'bajó'} ${fmtM(Math.abs(d))} (${sgnP(div(d, P.g.total))}) vs periodo anterior. Principales movimientos: ` +
          drivers.map(x => `${esc(cap(x.k))} ${x.d > 0 ? '+' : '−'}${fmtM(Math.abs(x.d))}`).join(' · ') + '.');
      }
      /* Conceptos atípicos (solo mes) */
      if (p.kind === 'month') {
        const G = gastoData(); const all = gastos(cm);
        const nAll = Math.max(1, all.monthsWith.length);
        const atip = Object.keys(M.g.byConcept).map(k => ({ k, v: M.g.byConcept[k], avg: (all.byConcept[k] || 0) / nAll }))
          .filter(x => x.v > 20000 && x.v > Math.max(1.5 * x.avg, x.avg + 25000)).sort((a, b) => (b.v - b.avg) - (a.v - a.avg)).slice(0, 4);
        if (atip.length && G) add('warn', 'Conceptos fuera de patrón: ' +
          atip.map(x => `<b>${esc(cap(x.k))}</b> ${fmtM(x.v)} vs prom. ${fmtM(x.avg)}${x.avg > 0 ? ' (' + (x.v / x.avg).toFixed(1) + '×)' : ' (no recurrente)'}`).join(' · ') + '.');
      }
      if (isNum(M.pl.pe)) {
        const peMes = M.pl.pe / Math.max(1, M.nM);
        add(M.pl.hol > 1 ? 'good' : M.pl.hol > 0.3 ? 'warn' : 'bad',
          `Punto de equilibrio ${M.nM > 1 ? 'mensual promedio ' : ''}${fmtM(peMes)} en ventas; las ventas lo superan en ${pct(M.pl.hol, 0)}.`);
      }
      const gop = val(M.a.gop);
      if (isNum(gop) && Math.abs(gop - M.g.total) / M.g.total > 0.15) {
        add('info', `Conciliación: Gastos de Operación capturados en cortes de Administración = ${fmtM(gop)} vs gasto fijo detallado ${fmtM(M.g.total)} (diferencia ${fmtM(gop - M.g.total)}). Conviene validar criterio entre ambas fuentes.`);
      }
    } else if (M.g.monthsMissing.length) {
      add('bad', `Sin gasto fijo cargado para ${M.g.monthsMissing.map(m => cap(MES[m])).join(', ')}: el estado de resultados queda incompleto. Carga el Excel de gastos.`);
    }

    /* Ventas */
    const vt = val(M.v.total);
    if (isNum(vt) && M.vMeta > 0) {
      const c = vt / M.vMeta;
      const peor = CANALES.map(k => ({ k, c: div(val(M.v[k]), M.vMetaCanal[k]) })).filter(x => isNum(x.c)).sort((a, b) => a.c - b.c)[0];
      add(c >= 1 ? 'good' : c >= 0.9 ? 'warn' : 'bad',
        `Ventas al ${pct(c, 0)} de la meta (${fmtM(vt)} vs ${fmtM(M.vMeta)}).` + (peor ? ` Canal más rezagado: ${CAN_LBL[peor.k]} (${pct(peor.c, 0)}).` : ''));
    }

    /* Flujo y cartera */
    const fl = val(M.a.flujo);
    if (isNum(fl)) add(fl >= 0 ? 'good' : 'bad', `Flujo de efectivo (cortes Admón) ${fmtM(fl)}: ingresos ${fmtM(val(M.a.ing))} − egresos ${fmtM(val(M.a.egr))} − gastos op. ${fmtM(val(M.a.gop))}.`);
    const cven = val(M.a.cven), metaVen = window.Dash.admon.metas['CARTERA_VENCIDA'];
    if (isNum(cven) && metaVen) add(cven <= metaVen ? 'good' : 'bad', `Cartera vencida promedio ${fmtM(cven)} vs meta ${fmtM(metaVen)} (${sgnP(cven / metaVen - 1, 0)}).`);

    /* Global: mejor / peor mes */
    if (p.kind !== 'month' && monthly.length > 1) {
      const rows = monthly.filter(x => p.months.includes(x.m) && isNum(x.M.pl.mo));
      if (rows.length > 1) {
        const best = rows.reduce((a, b) => b.M.pl.mo > a.M.pl.mo ? b : a);
        const worst = rows.reduce((a, b) => b.M.pl.mo < a.M.pl.mo ? b : a);
        add('info', `Mejor mes: <b>${cap(MES[best.m])}</b> (MO ${pct(best.M.pl.mo)}). Mes más débil: <b>${cap(MES[worst.m])}</b> (MO ${pct(worst.M.pl.mo)}, gasto/ventas ${pct(worst.M.pl.gfv)}, compras/ventas ${pct(worst.M.pl.cv)}).`);
      }
    }

    /* Cobertura de datos */
    ['ventas','ope','admon'].forEach(sec => {
      const key = sec === 'ventas' ? 'VENTAS TOTALES' : sec === 'ope' ? 'COMPRA' : 'INGRESOS';
      const r = agg(sec, key, p.months, 'sum', 'calendario');
      if (r.T && r.cov < 0.85) add('warn', `${SEC_LBL[sec]}: solo ${r.coveredDays} de ${r.T} días del periodo tienen corte capturado (${pct(r.cov, 0)}). ` +
        (ST.mode === 'calendario' && !ST.proyectar ? 'Activa «Proyectar días sin corte» para estimar el mes completo.' : 'Leer con cautela.'));
    });
    return H;
  }

  /* ════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════ */
  function kpi(cls, icon, label, value, sub, badge, bCls) {
    return `<div class="kpi-card ${cls}"><div class="kpi-label">${icon} ${label}</div>
      <div class="kpi-value">${value}</div><div class="kpi-sub">${sub || ''}</div>
      ${badge ? `<div class="kpi-badge ${bCls || 'up'}">${badge}</div>` : ''}</div>`;
  }
  const vsBadge = (cur, ref, lowerIsBetter, lbl) => {
    if (!isNum(cur) || !isNum(ref) || ref === 0) return ['', ''];
    const d = cur / ref - 1;
    const good = lowerIsBetter ? d <= 0 : d >= 0;
    return [`${d >= 0 ? '▲' : '▼'} ${sgnP(d)} ${lbl}`, good ? 'up' : Math.abs(d) < 0.1 ? 'warn' : 'down'];
  };
  const panel = (title, sub, id, h) => `<div class="panel"><div class="panel-title">${title}</div><div class="panel-sub">${sub}</div>
      <div class="chart-box" style="min-height:${h || 240}px"><canvas id="${id}" role="img" aria-label="${esc(title)}"></canvas></div></div>`;

  function covPill(sec, key, months) {
    const r = agg(sec, key, months);
    const rc = agg(sec, key, months, 'sum', 'calendario');
    const txt = ST.mode === 'cortes'
      ? `${r.n} corte${r.n !== 1 ? 's' : ''}`
      : `${rc.coveredDays}/${rc.T} días${ST.proyectar && rc.cov < 1 && rc.cov > 0 ? ' · proyectado' : ''}`;
    const cls = rc.cov >= 0.95 ? 'ok' : rc.cov >= 0.85 ? 'mid' : 'low';
    return `<span class="vm-pill ${cls}" title="Días del periodo cubiertos por cortes: ${rc.coveredDays} de ${rc.T}">${SEC_LBL[sec]}: ${txt}</span>`;
  }

  /* Cortes que cruzan el límite del mes (explica la diferencia entre modos) */
  function boundaryNote(p) {
    if (p.kind !== 'month') return '';
    const m = p.months[0];
    const list = cortesTouching('ventas', [m], 'calendario').filter(t => t.days.length > 0 && t.days.length < 7);
    if (!list.length) return '';
    return 'Cortes de ventas que cruzan el mes: ' + list.map(t => {
      const ini = new Date(t.end.getFullYear(), t.end.getMonth(), t.end.getDate() - 6);
      const asign = cap(t.c.mes);
      return `<b>${esc(t.c.label)}</b> (${fmtDay(ini)} a ${fmtDay(t.end)}): ${t.days.length}/7 días en ${cap(MES[m])} · por cortes se asigna a ${asign}`;
    }).join(' · ');
  }

  function buildToolbar(all, p) {
    const chips = all.map(x => {
      const sep = (x.kind === 'quarter' && x.id === 'T1') || (x.kind === 'month' && x.id === 'M' + all.find(y => y.kind === 'month').months[0]) ? '<span class="vm-chip-sep"></span>' : '';
      return `${sep}<button class="vm-chip ${x.id === p.id ? 'active' : ''} ${x.kind}" data-period="${x.id}">${x.label}${x.sub ? `<small>${x.sub}</small>` : ''}</button>`;
    }).join('');
    const G = gastoData();
    return `
      <div class="vm-toolbar">
        <div class="vm-title-wrap">
          <div class="vm-title">📆 Valuación Mensual</div>
          <div class="vm-subtitle">Resumen empresa + gasto fijo · para juntas mensuales con gerencia y asesores externos</div>
        </div>
        <div class="vm-actions">
          <span class="vm-calc-label">Calcular por:</span>
          <div class="vm-seg" role="group" aria-label="Modo de cálculo">
            <button data-mode="cortes" class="${ST.mode === 'cortes' ? 'active' : ''}" title="Cada corte semanal cuenta completo en el mes asignado (igual que el dashboard)">📅 Cortes semanales</button>
            <button data-mode="calendario" class="${ST.mode === 'calendario' ? 'active' : ''}" title="Prorratea cada corte por días al mes calendario real">🗓️ Mes calendario</button>
          </div>
          <label class="vm-check ${ST.mode !== 'calendario' ? 'disabled' : ''}" title="Escala los flujos a los días del mes que no tienen corte capturado">
            <input type="checkbox" id="vm-proy" ${ST.proyectar ? 'checked' : ''} ${ST.mode !== 'calendario' ? 'disabled' : ''}> Proyectar días sin corte
          </label>
          <button class="vm-btn" id="vm-print" title="Imprimir o guardar como PDF para la junta">🖨️ Imprimir / PDF</button>
          <button class="vm-btn vm-admin-only" id="vm-import" title="Actualizar el gasto fijo desde el Excel (hoja DATOS)">📥 Cargar Excel de gastos</button>
        </div>
      </div>
      <div class="vm-periods" role="tablist">${chips}</div>
      <div class="vm-modenote">
        <div>${ST.mode === 'cortes'
          ? '<b>Por cortes:</b> cada corte semanal suma completo al mes que tiene asignado (misma lógica del dashboard).'
          : '<b>Mes calendario:</b> cada corte cubre 7 días que terminan en su fecha y se reparte por día entre los meses que toca' + (ST.proyectar ? '; los días sin corte se proyectan con el promedio diario.' : '.')}
          Gasto fijo: siempre mes calendario${G ? ` · fuente ${esc(G.fuente || '')}${G.actualizado ? ' (' + esc(G.actualizado) + ')' : ''}` : ''}.</div>
        <div class="vm-pills">${covPill('ventas','VENTAS TOTALES',p.months)}${covPill('ope','COMPRA',p.months)}${covPill('admon','INGRESOS',p.months)}
          <span class="vm-pill ${gastos(p.months).monthsMissing.length ? 'low' : 'ok'}">Gasto fijo: ${gastos(p.months).monthsWith.length}/${p.months.length} mes(es)</span></div>
        ${boundaryNote(p) ? `<div class="vm-boundary">${boundaryNote(p)}</div>` : ''}
      </div>`;
  }

  /* ── Estado de resultados (tabla) ───────────────────────────── */
  function plTable(cols, showPctVentas) {
    const cats = (() => {
      const set = {}; cols.forEach(c => Object.keys(c.M.g.byCat).forEach(k => { set[k] = (set[k] || 0) + c.M.g.byCat[k]; }));
      return Object.keys(set).sort((a, b) => set[b] - set[a]);
    })();
    const rows = [
      { l: 'Ventas', f: M => M.pl.ventas, cls: 'vm-row-strong' },
      { l: '(−) Compras / costo de ventas', f: M => M.pl.compras },
      { l: 'Utilidad bruta', f: M => M.pl.ub, cls: 'vm-row-strong' },
      { l: 'Margen bruto %', f: M => M.pl.mb, t: '%' },
      { l: '(−) Gasto fijo', f: M => M.pl.gf, cls: 'vm-row-strong' },
      ...cats.map(k => ({ l: '· ' + cap(k), f: M => M.g.total == null ? null : (M.g.byCat[k] || 0), cls: 'vm-row-sub', dot: catColor(k, cats.indexOf(k)) })),
      { l: 'Gasto fijo / ventas', f: M => M.pl.gfv, t: '%' },
      { l: 'Utilidad operativa', f: M => M.pl.uo, cls: 'vm-row-total' },
      { l: 'Margen operativo %', f: M => M.pl.mo, t: '%', cls: 'vm-row-total' },
      { l: 'Punto de equilibrio (ventas/mes)', f: M => isNum(M.pl.pe) ? M.pl.pe / Math.max(1, M.nM) : null },
      { sep: 'Flujo de efectivo · cortes de Administración' },
      { l: 'Ingresos (cobranza)', f: M => val(M.a.ing) },
      { l: '(−) Egresos', f: M => val(M.a.egr) },
      { l: '(−) Gastos de operación (cortes)', f: M => val(M.a.gop) },
      { l: 'Flujo de efectivo', f: M => val(M.a.flujo), cls: 'vm-row-strong', color: true },
      { l: 'Cobranza / ventas', f: M => M.pl.cob, t: '%' },
    ];
    let h = '<table class="vm-table"><thead><tr><th>Concepto</th>' + cols.map(c => `<th class="${c.hl ? 'vm-col-hl' : ''}">${c.label}</th>`).join('') +
      (showPctVentas ? '<th>% ventas</th>' : '') + '</tr></thead><tbody>';
    rows.forEach(r => {
      if (r.sep) { h += `<tr class="vm-row-sep"><td colspan="${cols.length + 1 + (showPctVentas ? 1 : 0)}">${r.sep}</td></tr>`; return; }
      h += `<tr class="${r.cls || ''}"><td>${r.dot ? `<span class="dot" style="background:${r.dot}"></span>` : ''}${r.l}</td>`;
      cols.forEach(c => {
        const v = c.f ? c.f(r) : r.f(c.M);
        const txt = c.f ? v : (r.t === '%' ? pct(v) : fmt(v));
        const col = r.color && isNum(v) ? (v >= 0 ? 'color:var(--green)' : 'color:var(--red)') : (r.t === '%' && /margen operativo/i.test(r.l) && isNum(v) ? (v >= 0.25 ? 'color:var(--green)' : v >= 0.15 ? 'color:var(--amber)' : 'color:var(--red)') : '');
        h += `<td class="${c.hl ? 'vm-col-hl' : ''}" style="${col}">${txt}</td>`;
      });
      if (showPctVentas) {
        const M0 = cols[0].M;
        const v = r.t === '%' ? null : r.f(M0);
        h += `<td class="vm-muted">${r.t === '%' ? '' : pct(div(v, M0.pl.ventas))}</td>`;
      }
      h += '</tr>';
    });
    return h + '</tbody></table>';
  }

  /* ── Tabla de gasto por concepto ────────────────────────────── */
  function gastoTable(p, M, P, cm) {
    const all = gastos(cm), nAll = Math.max(1, all.monthsWith.length);
    const nP = Math.max(1, M.g.monthsWith.length);
    if (!isNum(M.g.total)) return '<div class="vm-empty">Sin gasto fijo cargado para este periodo.</div>';
    const cats = Object.keys(M.g.byCat).sort((a, b) => M.g.byCat[b] - M.g.byCat[a]);
    let h = `<table class="vm-table vm-gastos"><thead><tr><th>Concepto</th><th>Monto periodo</th><th>% part.</th>
      <th>${p.kind === 'month' ? 'Mes anterior' : 'Periodo anterior'}</th><th>Var. vs anterior</th>
      <th>Prom. mensual ${MES_ABR[cm[0]]}–${MES_ABR[cm[cm.length - 1]]}</th><th>${nP > 1 ? 'Prom. mes periodo' : 'Mes'} vs prom.</th><th>Semáforo</th></tr></thead><tbody>`;
    cats.forEach((k, ci) => {
      const ct = M.g.byCat[k];
      const cp = P && isNum(P.g.total) ? (P.g.byCat[k] || 0) : null;
      h += `<tr class="vm-row-cat"><td><span class="dot" style="background:${catColor(k, ci)}"></span>${esc(cap(k))}</td><td>${fmt(ct)}</td><td>${pct(div(ct, M.g.total))}</td>
        <td>${fmt(cp)}</td><td>${sgnP(div(ct - cp, cp))}</td><td>${fmt((all.byCat[k] || 0) / nAll)}</td><td>${sgnP(div(ct / nP, (all.byCat[k] || 0) / nAll) - 1)}</td><td></td></tr>`;
      Object.keys(M.g.byConcept).filter(c => M.g.cat[c] === k && (M.g.byConcept[c] || (P && P.g.byConcept[c]) || all.byConcept[c]))
        .sort((a, b) => M.g.byConcept[b] - M.g.byConcept[a]).forEach(c => {
          const v = M.g.byConcept[c] || 0;
          const pv = P && isNum(P.g.total) ? (P.g.byConcept[c] || 0) : null;
          const avg = (all.byConcept[c] || 0) / nAll;
          const r = avg > 0 ? (v / nP) / avg : (v > 0 ? Infinity : 1);
          const sem = !v ? '<span class="pill" style="color:var(--muted)">sin mov.</span>'
            : r > 1.5 && v / nP - avg > 15000 ? '<span class="pill red">Alto</span>'
            : r > 1.15 ? '<span class="pill amber">Arriba</span>'
            : '<span class="pill green">Normal</span>';
          h += `<tr class="vm-row-sub"><td>${esc(cap(c))}</td><td>${fmt(v)}</td><td>${pct(div(v, M.g.total))}</td><td>${fmt(pv)}</td>
            <td>${isNum(pv) && pv > 0 ? sgnP(v / pv - 1) : (isNum(pv) && v > 0 ? 'nuevo' : '—')}</td><td>${fmt(avg)}</td>
            <td>${isFinite(r) && avg > 0 ? sgnP(r - 1) : '—'}</td><td>${sem}</td></tr>`;
        });
    });
    h += `<tr class="vm-row-total"><td>Total gasto fijo</td><td>${fmt(M.g.total)}</td><td>100%</td><td>${fmt(P ? P.g.total : null)}</td>
      <td>${P && isNum(P.g.total) ? sgnP(M.g.total / P.g.total - 1) : '—'}</td><td>${fmt(all.total / nAll)}</td><td>${sgnP(div(M.g.total / nP, all.total / nAll) - 1)}</td><td></td></tr>`;
    return h + '</tbody></table>';
  }

  /* ── Página completa ────────────────────────────────────────── */
  function render() {
    const root = document.getElementById('vm-root');
    if (!root || !window.Dash) return;
    destroyAll();
    const all = periods();
    if (!all.length) { root.innerHTML = '<div class="vm-empty">Aún no hay meses completos con datos.</div>'; return; }
    let p = all.find(x => x.id === ST.period);
    if (!p) { p = all[0]; ST.period = p.id; }
    const cm = completeMonths();
    const prev = prevOf(p, all);
    const M = model(p.months);
    const P = prev ? model(prev.months) : null;
    const monthly = cm.map(m => ({ m, M: model([m]) }));
    const anom = anomalies(p.months);
    const H = insights(p, M, P, monthly, cm);
    const name = periodName(p);
    const prevName = prev ? periodName(prev) : '';

    /* — KPIs — */
    const [bV, cV] = vsBadge(val(M.v.total), M.vMeta, false, 'vs meta');
    const vMix = CANALES.map(c => val(M.v[c]));
    const vtot = val(M.v.total);
    const kV = CANALES.map(c => {
      const [b, cl] = vsBadge(val(M.v[c]), M.vMetaCanal[c], false, 'vs meta');
      const ic = { 'PUNTO DE VENTA':'🏪','CALL CENTER':'📞','PLATAFORMA':'💻','ASESORES':'👥' }[c];
      const cls = { 'PUNTO DE VENTA':'blue','CALL CENTER':'green','PLATAFORMA':'amber','ASESORES':'purple' }[c];
      return kpi(cls, ic, CAN_LBL[c], fmtM(val(M.v[c])), `${pct(div(val(M.v[c]), vtot))} del total`, b, cl);
    }).join('') + kpi('orange', '💰', 'Ventas totales', fmtM(vtot), P ? `${sgnP(div(vtot, val(P.v.total)) - 1)} vs ${prev.label}` : `Meta ${fmtM(M.vMeta)}`, bV, cV);

    const o = M.o, oM = M.oMeta;
    const rep = (val(o.rl) || 0) + (val(o.rf) || 0);
    const kO = [
      kpi('blue','📦','Compras', fmtM(val(o.compra)), `${pct(M.pl.cv)} de las ventas`, ...vsBadge(val(o.compra), oM.compra, false, 'vs meta')),
      kpi('green','↩️','Devoluciones', num(val(o.dev)), `Meta ≤ ${num(oM.dev)}`, ...(isNum(val(o.dev)) ? [val(o.dev) <= oM.dev ? '✓ En meta' : '▲ Sobre meta', val(o.dev) <= oM.dev ? 'up' : 'down'] : ['', ''])),
      kpi('amber','📊','Nivel de servicio', fmtM(val(o.ns)), `Mercancía negada · ${isNum(val(o.nsPct)) ? val(o.nsPct).toFixed(1) + '%' : '—'} prom.`),
      kpi('purple','🔧','Máqs. reparadas', num(val(o.maq)), `Meta ${num(oM.maq)}`, ...vsBadge(val(o.maq), oM.maq, false, 'vs meta')),
      kpi('teal','⏱️','Días reparación', isNum(val(o.dias)) ? val(o.dias).toFixed(1) : '—', `Promedio · meta ≤ ${oM.dias}`, ...(isNum(val(o.dias)) ? [val(o.dias) <= oM.dias ? '✓ En meta' : '⚠ Revisar dato', val(o.dias) <= oM.dias ? 'up' : 'down'] : ['', ''])),
      kpi('blue','🚚','Reparto total', rep ? num(rep) : '—', `Local ${num(val(o.rl))} · Foráneo ${num(val(o.rf))}`),
      kpi('red','🌎','% Foráneo', rep ? pct(div(val(o.rf), rep)) : '—', 'Del total repartido'),
      kpi('green','📑','Partidas / pedido', isNum(div(val(o.pa), val(o.pe))) ? div(val(o.pa), val(o.pe)).toFixed(1) : '—', isNum(val(o.pe)) ? `${num(val(o.pe))} pedidos almacén` : 'Sin dato de almacén en el periodo'),
    ].join('');

    const a = M.a, metaA = window.Dash.admon.metas;
    const kA = [
      kpi('blue','💵','Ingresos (cobranza)', fmtM(val(a.ing)), `${pct(M.pl.cob)} de las ventas`, ...vsBadge(val(a.ing), M.aMeta.ing, false, 'vs meta')),
      kpi('purple','💸','Egresos', fmtM(val(a.egr)), 'Pagos del periodo'),
      kpi('red','⚙️','Gastos op. (cortes)', fmtM(val(a.gop)), 'Capturado por Admón.', ...vsBadge(val(a.gop), M.aMeta.gop, true, 'vs meta')),
      kpi(isNum(val(a.flujo)) && val(a.flujo) < 0 ? 'red' : 'green','🌊','Flujo de efectivo', fmtM(val(a.flujo)), 'Ingresos − egresos − gastos op.'),
      kpi('amber','📅','Plazo de cobro', isNum(val(a.plazo)) ? val(a.plazo).toFixed(1) + 'd' : '—', `Promedio · meta < ${metaA['PLAZO_COBRO']}`, ...(isNum(val(a.plazo)) ? [val(a.plazo) < metaA['PLAZO_COBRO'] ? '✓ En meta' : '▲ Sobre meta', val(a.plazo) < metaA['PLAZO_COBRO'] ? 'up' : 'down'] : ['', ''])),
      kpi('teal','📈','% Recuperación', pct(val(a.rec)), `Promedio · meta < ${pct(metaA['RECUPERACION'], 0)}`),
      kpi('green','💼','Cartera vigente', fmtM(val(a.cvig)), `Saldo promedio · meta ${fmtM(metaA['CARTERA_VIGENTE'])}`, ...vsBadge(val(a.cvig), metaA['CARTERA_VIGENTE'], false, 'vs meta')),
      kpi('red','⚠️','Cartera vencida', fmtM(val(a.cven)), `Saldo promedio · meta ${fmtM(metaA['CARTERA_VENCIDA'])}`, ...vsBadge(val(a.cven), metaA['CARTERA_VENCIDA'], true, 'vs meta')),
    ].join('');

    /* KPIs gasto */
    const gAll = gastos(cm), nAll = Math.max(1, gAll.monthsWith.length);
    const promG = gAll.total != null ? gAll.total / nAll : null;
    const nP = Math.max(1, M.g.monthsWith.length);
    const topC = Object.keys(M.g.byConcept).sort((x, y) => M.g.byConcept[y] - M.g.byConcept[x])[0];
    const topCat = Object.keys(M.g.byCat).sort((x, y) => M.g.byCat[y] - M.g.byCat[x])[0];
    const nConc = Object.keys(M.g.byConcept).filter(k => M.g.byConcept[k] > 0).length;
    const kG = [
      kpi('orange','💸','Gasto fijo', fmtM(M.g.total), `${nP} mes(es) · ${fmtM(div(M.g.total, M.T))}/día`, ...(P && isNum(P.g.total) ? vsBadge(M.g.total, P.g.total, true, 'vs ' + prev.label) : vsBadge(M.g.total / nP, promG, true, 'vs prom.'))),
      kpi(M.pl.gfv > 0.2 ? 'red' : M.pl.gfv > 0.18 ? 'amber' : 'green','📉','Gasto fijo / ventas', pct(M.pl.gfv), `Año: ${pct(model(cm).pl.gfv)}`),
      kpi('purple','🧮','Gasto fijo / util. bruta', pct(M.pl.gfub), 'Cuánto de la utilidad bruta absorbe'),
      kpi('blue','⚖️','Punto de equilibrio', fmtM(isNum(M.pl.pe) ? M.pl.pe / Math.max(1, M.nM) : null), `Ventas/mes necesarias · holgura ${pct(M.pl.hol, 0)}`),
      kpi('teal','🏷️','Mayor rubro', topC ? esc(cap(topC)) : '—', topC ? `${fmtM(M.g.byConcept[topC])} · ${pct(div(M.g.byConcept[topC], M.g.total))}` : ''),
      kpi('amber','🗂️','Categoría principal', topCat ? esc(cap(topCat)) : '—', topCat ? `${fmtM(M.g.byCat[topCat])} · ${pct(div(M.g.byCat[topCat], M.g.total))}` : ''),
      kpi('green','📋','Conceptos con gasto', String(nConc), `de ${gastoData() ? gastoData().conceptos.length : 0} en catálogo`),
      kpi('red','🔁','Conciliación gasto op.', fmtM(isNum(val(a.gop)) && isNum(M.g.total) ? val(a.gop) - M.g.total : null), 'Cortes Admón − gasto fijo detallado'),
    ].join('');

    /* Hallazgos y calidad */
    const ICON = { good: '🟢', warn: '🟡', bad: '🔴', info: '🔵' };
    const hHTML = H.map(x => `<li class="vm-ins ${x.t}"><span>${ICON[x.t]}</span><div>${x.html}</div></li>`).join('');
    const qHTML = anom.length
      ? anom.map(x => `<li><b>${SEC_LBL[x.sec]} · ${KEY_LBL[x.key] || x.key} · ${esc(x.label)}</b>: valor ${num(x.v, x.v < 10 ? 2 : 0)} vs mediana ${num(x.med, x.med < 10 ? 2 : 0)} — posible error de captura (punto decimal / unidades). Se usa tal cual; corrige en la tabla de detalle si aplica.</li>`).join('')
      : '<li>Sin valores atípicos detectados en el periodo.</li>';

    /* P&L columnas */
    let plCols, plTitle;
    if (p.kind === 'month') {
      const g = model(cm);
      const avgM = { nM: 1, pl: {}, g: { byCat: {}, total: null }, a: {} };
      // promedio mensual: flujos ÷ meses; razones recalculadas
      const n = cm.length;
      ['ventas','compras','ub','gf','uo'].forEach(k => { avgM.pl[k] = isNum(g.pl[k]) ? g.pl[k] / n : null; });
      avgM.pl.mb = g.pl.mb; avgM.pl.mo = g.pl.mo; avgM.pl.gfv = g.pl.gfv; avgM.pl.pe = isNum(g.pl.pe) ? g.pl.pe / n : null; avgM.pl.cob = g.pl.cob;
      avgM.g.total = isNum(g.g.total) ? g.g.total / Math.max(1, g.g.monthsWith.length) : null;
      Object.keys(g.g.byCat).forEach(k => { avgM.g.byCat[k] = g.g.byCat[k] / Math.max(1, g.g.monthsWith.length); });
      ['ing','egr','gop','flujo'].forEach(k => { avgM.a[k] = { value: isNum(val(g.a[k])) ? val(g.a[k]) / n : null }; });
      plCols = [{ label: cap(MES[p.months[0]]), M, hl: true }];
      if (P) plCols.push({ label: cap(MES[prev.months[0]]), M: P });
      plCols.push({ label: 'Prom. mensual ' + MES_ABR[cm[0]] + '–' + MES_ABR[cm[cm.length - 1]], M: avgM });
      plTitle = `Estado de resultados — ${name}`;
    } else {
      plCols = p.months.map(m => ({ label: MES_ABR[m], M: monthly.find(x => x.m === m).M }));
      plCols.push({ label: 'Total ' + p.label, M, hl: true });
      plTitle = `Estado de resultados mensual — ${name}`;
    }

    root.innerHTML = buildToolbar(all, p) + `
      <div class="hero-rent vm-hero">
        <div class="hero-left">
          <div class="hero-label">🎯 UTILIDAD OPERATIVA · ${esc(name.toUpperCase())}</div>
          <div class="hero-value">${fmtM(M.pl.uo)}</div>
          <div class="hero-sub">Margen operativo <b style="color:${isNum(M.pl.mo) && M.pl.mo >= 0.25 ? 'var(--green)' : isNum(M.pl.mo) && M.pl.mo >= 0.15 ? 'var(--amber)' : 'var(--red)'}">${pct(M.pl.mo)}</b> · (Ventas − Compras − Gasto fijo) ÷ Ventas${P && isNum(P.pl.mo) ? ` · ${sgnPP(M.pl.mo - P.pl.mo)} vs ${esc(prev.label)}` : ''}</div>
        </div>
        <div class="hero-right vm-hero-right">
          <div class="hero-metric"><div class="hero-metric-label">💰 Ventas</div><div class="hero-metric-value">${fmtM(M.pl.ventas)}</div><div class="hero-metric-sub">${M.vMeta ? pct(div(M.pl.ventas, M.vMeta), 0) + ' de la meta' : ''}</div></div>
          <div class="hero-metric"><div class="hero-metric-label">📦 Utilidad bruta</div><div class="hero-metric-value">${fmtM(M.pl.ub)}</div><div class="hero-metric-sub">Margen bruto ${pct(M.pl.mb)}</div></div>
          <div class="hero-metric"><div class="hero-metric-label">💸 Gasto fijo</div><div class="hero-metric-value">${fmtM(M.pl.gf)}</div><div class="hero-metric-sub">${pct(M.pl.gfv)} de las ventas</div></div>
          <div class="hero-metric"><div class="hero-metric-label">⚖️ Punto de equilibrio</div><div class="hero-metric-value">${fmtM(isNum(M.pl.pe) ? M.pl.pe / Math.max(1, M.nM) : null)}</div><div class="hero-metric-sub">ventas/mes · holgura ${pct(M.pl.hol, 0)}</div></div>
          <div class="hero-metric"><div class="hero-metric-label">🌊 Flujo de efectivo</div><div class="hero-metric-value" style="color:${isNum(val(M.a.flujo)) && val(M.a.flujo) < 0 ? 'var(--red)' : 'var(--gold)'}">${fmtM(val(M.a.flujo))}</div><div class="hero-metric-sub">cortes Administración</div></div>
          <div class="hero-metric"><div class="hero-metric-label">🔄 Cobranza / ventas</div><div class="hero-metric-value">${pct(M.pl.cob)}</div><div class="hero-metric-sub">Ingresos ${fmtM(val(M.a.ing))}</div></div>
        </div>
      </div>

      <div class="charts-row vm-cols-ins">
        <div class="panel"><div class="panel-title">🧠 Hallazgos para la junta</div><div class="panel-sub">Generados automáticamente con los datos del periodo · ${esc(name)}${prev ? ' vs ' + esc(prevName) : ''}</div><ul class="vm-ins-list">${hHTML}</ul></div>
        ${panel('🪜 Cascada de resultados', 'Ventas → compras → utilidad bruta → gasto fijo por categoría → utilidad operativa', 'vmWaterfall', 300)}
      </div>

      <div class="empresa-section-title">🧾 ${plTitle}</div>
      <div class="panel vm-table-panel"><div class="table-wrap">${plTable(plCols, p.kind === 'month')}</div></div>
      <div class="charts-row cols-2e">
        ${panel('Ventas · Compras · Gasto fijo por mes', 'Barras resaltadas = periodo seleccionado · línea = margen operativo % (eje derecho)', 'vmTrendPL', 280)}
        ${panel('Márgenes por mes', 'Margen bruto %, gasto fijo / ventas % y margen operativo %', 'vmMargins', 280)}
      </div>

      <div class="empresa-section-title">🛒 Ventas — ${esc(name)}</div>
      <div class="kpi-grid vm-grid-5">${kV}</div>
      <div class="charts-row cols-2e">
        ${p.kind === 'month'
          ? panel('Ventas por corte dentro del mes', ST.mode === 'calendario' ? 'Parte de cada corte que cae en el mes (prorrateo por días) · línea = meta proporcional' : 'Cortes asignados al mes · línea = meta semanal', 'vmVentasDet', 260)
          : panel('Ventas por mes vs meta', 'Total mensual del periodo · línea = meta acumulada', 'vmVentasDet', 260)}
        ${panel('Mix de canales', 'Participación % de cada canal en el periodo', 'vmVentasMix', 260)}
      </div>

      <div class="empresa-section-title">⚙️ Operaciones — ${esc(name)}</div>
      <div class="kpi-grid vm-grid-4">${kO}</div>
      <div class="charts-row cols-2e">
        ${panel('Compras vs Ventas por mes', 'Relación compra / venta · barras resaltadas = periodo', 'vmOpeCompras', 250)}
        ${panel('Reparto local vs foráneo por mes', 'Pedidos entregados · apilado', 'vmOpeRep', 250)}
      </div>

      <div class="empresa-section-title">💼 Administración — ${esc(name)}</div>
      <div class="kpi-grid vm-grid-4">${kA}</div>
      <div class="charts-row cols-2e">
        ${panel('Ingresos · Egresos · Gastos op. por mes', 'Flujo financiero (cortes de Administración)', 'vmAdmFin', 250)}
        ${panel('Cartera vigente vs vencida por mes', 'Saldos promedio · línea = meta de vencida', 'vmAdmCart', 250)}
      </div>

      <div class="empresa-section-title">💸 Gasto fijo — ${esc(name)}</div>
      <div class="kpi-grid vm-grid-4">${kG}</div>
      <div class="charts-row cols-2e">
        ${panel('Gasto por categoría', 'Participación % en el periodo', 'vmGasCat', 270)}
        ${panel('Pareto · Top 10 conceptos', 'Monto del periodo · línea = % acumulado (eje derecho)', 'vmGasPareto', 270)}
      </div>
      <div class="charts-row cols-2e">
        ${panel('Gasto fijo por categoría y mes', 'Apilado · resaltado = periodo seleccionado · línea = promedio mensual', 'vmGasTrend', 270)}
        ${panel('Top conceptos: periodo vs promedio mensual', p.kind === 'month' ? 'Mes seleccionado vs su promedio ' + MES_ABR[cm[0]] + '–' + MES_ABR[cm[cm.length - 1]] : 'Promedio mensual del periodo vs promedio del año', 'vmGasVsProm', 270)}
      </div>
      <div class="panel vm-table-panel"><div class="panel-title">Detalle por concepto</div>
        <div class="panel-sub">Agrupado por categoría · semáforo: Alto = >1.5× su promedio mensual y +$15K · Arriba = >15% sobre promedio</div>
        <div class="table-wrap">${gastoTable(p, M, P, cm)}</div></div>

      <div class="panel vm-quality"><div class="panel-title">🩺 Calidad de datos del periodo</div>
        <div class="panel-sub">Valores que difieren más de 20× de la mediana del indicador · se reportan, no se corrigen automáticamente</div>
        <ul class="vm-q-list">${qHTML}</ul></div>
      <div class="vm-footnote">Fórmulas: Utilidad bruta = Ventas − Compras · Utilidad operativa = Utilidad bruta − Gasto fijo · Punto de equilibrio = Gasto fijo ÷ Margen bruto % · Flujo = Ingresos − Egresos − Gastos de operación (cortes). Ventas, compras e ingresos provienen de los cortes semanales; gasto fijo del reporte mensual de gastos.</div>`;

    wireToolbar();
    requestAnimationFrame(() => drawCharts(p, M, monthly, cm));
  }

  /* ── Gráficas ───────────────────────────────────────────────── */
  function drawCharts(p, M, monthly, cm) {
    const L = cm.map(m => MES_ABR[m]);
    const sel = p.months;
    const ser = f => monthly.map(x => f(x.M));

    /* Cascada */
    (() => {
      const V = M.pl.ventas, C = M.pl.compras, UB = M.pl.ub;
      if (!isNum(V)) return;
      const cats = Object.keys(M.g.byCat).sort((a, b) => M.g.byCat[b] - M.g.byCat[a]);
      const lbl = ['Ventas', 'Compras', 'Utilidad bruta'], data = [[0, V], [V - (C || 0), V], [0, UB]];
      const col = ['#38bdf8', '#fb7185', '#34d399'];
      let run = UB;
      if (isNum(M.g.total)) {
        cats.forEach((k, i) => { const g = M.g.byCat[k]; lbl.push(cap(k)); data.push([run - g, run]); col.push(catColor(k, i)); run -= g; });
        lbl.push('Utilidad operativa'); data.push([Math.min(0, run), Math.max(0, run)]); col.push(run >= 0 ? '#ff6a13' : '#ef4444');
      }
      mk('vmWaterfall', { type: 'bar', data: { labels: lbl, datasets: [{ label: 'Monto', data, backgroundColor: col.map(c => c + 'bb'), borderColor: col, borderWidth: 1, borderRadius: 4, borderSkipped: false }] },
        options: baseOpts({ plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + fmt(c.raw[1] - c.raw[0]) + (isNum(V) ? ' · ' + pct((c.raw[1] - c.raw[0]) / V) + ' de ventas' : '') } } },
          scales: { x: { grid: { display: false }, ticks: { ...TICK, maxRotation: 40, autoSkip: false } }, y: { grid: { color: GRID }, ticks: { ...TICK, callback: fmtAx }, beginAtZero: true } } }) });
    })();

    /* Tendencia P&L */
    mk('vmTrendPL', { type: 'bar', data: { labels: L, datasets: [
      { label: 'Ventas', data: ser(m => m.pl.ventas), backgroundColor: hi(cm, sel, '#38bdf8'), borderRadius: 4 },
      { label: 'Compras', data: ser(m => m.pl.compras), backgroundColor: hi(cm, sel, '#a78bfa'), borderRadius: 4 },
      { label: 'Gasto fijo', data: ser(m => m.pl.gf), backgroundColor: hi(cm, sel, '#fbbf24'), borderRadius: 4 },
      { label: 'Margen operativo %', data: ser(m => isNum(m.pl.mo) ? +(m.pl.mo * 100).toFixed(1) : null), type: 'line', yAxisID: 'y2', borderColor: '#ff6a13', backgroundColor: '#ff6a13', pointRadius: cm.map(m => sel.includes(m) ? 6 : 3), tension: .3 },
    ] }, options: baseOpts({
      plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + (c.dataset.yAxisID === 'y2' ? c.raw + '%' : fmt(c.raw)) } } },
      scales: { x: { grid: { display: false }, ticks: TICK }, y: { grid: { color: GRID }, ticks: { ...TICK, callback: fmtAx } },
        y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: { ...TICK, callback: v => v + '%' } } } }) });

    mk('vmMargins', { type: 'line', data: { labels: L, datasets: [
      { label: 'Margen bruto %', data: ser(m => isNum(m.pl.mb) ? +(m.pl.mb * 100).toFixed(1) : null), borderColor: '#34d399', backgroundColor: '#34d39922', tension: .3, pointRadius: cm.map(m => sel.includes(m) ? 6 : 3) },
      { label: 'Gasto fijo / ventas %', data: ser(m => isNum(m.pl.gfv) ? +(m.pl.gfv * 100).toFixed(1) : null), borderColor: '#fbbf24', tension: .3, pointRadius: cm.map(m => sel.includes(m) ? 6 : 3) },
      { label: 'Margen operativo %', data: ser(m => isNum(m.pl.mo) ? +(m.pl.mo * 100).toFixed(1) : null), borderColor: '#ff6a13', backgroundColor: '#ff6a1322', fill: true, tension: .3, pointRadius: cm.map(m => sel.includes(m) ? 6 : 3) },
    ] }, options: baseOpts({ plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + c.raw + '%' } } },
      scales: { x: { grid: { color: GRID }, ticks: TICK }, y: { grid: { color: GRID }, ticks: { ...TICK, callback: v => v + '%' } } } }) });

    /* Ventas detalle */
    if (p.kind === 'month') {
      const m = p.months[0];
      const D = window.Dash.ventas;
      const t = cortesTouching('ventas', [m], ST.mode).filter(x => x.w > 0);
      const metaW = D.metas['VENTAS TOTALES'] || 0;
      mk('vmVentasDet', { type: 'bar', data: { labels: t.map(x => x.c.label + (x.w < 1 ? ` (${x.days.length}/7)` : '')), datasets: [
        ...CANALES.map(c => ({ label: CAN_LBL[c], data: t.map(x => isNum(D.data[c][x.i]) ? D.data[c][x.i] * x.w : null), backgroundColor: CAN_COL[c] + 'cc', borderRadius: 2, stack: 's' })),
        { label: 'Meta', data: t.map(x => metaW * x.w), type: 'line', borderColor: '#f87171aa', borderDash: [6, 4], pointRadius: 3, fill: false },
      ] }, options: baseOpts({ scales: { x: { stacked: true, grid: { display: false }, ticks: TICK }, y: { stacked: true, grid: { color: GRID }, ticks: { ...TICK, callback: fmtAx } } } }) });
    } else {
      const ms = p.months;
      const rows = ms.map(m => monthly.find(x => x.m === m).M);
      mk('vmVentasDet', { type: 'bar', data: { labels: ms.map(m => MES_ABR[m]), datasets: [
        ...CANALES.map(c => ({ label: CAN_LBL[c], data: rows.map(r => val(r.v[c])), backgroundColor: CAN_COL[c] + 'cc', borderRadius: 2, stack: 's' })),
        { label: 'Meta', data: rows.map(r => r.vMeta), type: 'line', borderColor: '#f87171aa', borderDash: [6, 4], pointRadius: 3, fill: false },
      ] }, options: baseOpts({ scales: { x: { stacked: true, grid: { display: false }, ticks: TICK }, y: { stacked: true, grid: { color: GRID }, ticks: { ...TICK, callback: fmtAx } } } }) });
    }
    const vt = val(M.v.total) || 1;
    mk('vmVentasMix', { type: 'doughnut', data: { labels: CANALES.map(c => CAN_LBL[c]), datasets: [{ data: CANALES.map(c => val(M.v[c])), backgroundColor: CANALES.map(c => CAN_COL[c]), borderColor: '#130e08', borderWidth: 3, hoverOffset: 8 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'right', labels: { color: MUTED } }, tooltip: { callbacks: { label: c => ` ${c.label}: ${pct(c.raw / vt)} · ${fmt(c.raw)}` } } } } });

    /* Operaciones */
    mk('vmOpeCompras', { type: 'bar', data: { labels: L, datasets: [
      { label: 'Ventas', data: ser(m => m.pl.ventas), backgroundColor: hi(cm, sel, '#38bdf8'), borderRadius: 4 },
      { label: 'Compras', data: ser(m => m.pl.compras), backgroundColor: hi(cm, sel, '#a78bfa'), borderRadius: 4 },
      { label: 'Compras / ventas %', data: ser(m => isNum(m.pl.cv) ? +(m.pl.cv * 100).toFixed(1) : null), type: 'line', yAxisID: 'y2', borderColor: '#fb7185', pointRadius: cm.map(m => sel.includes(m) ? 6 : 3), tension: .3 },
    ] }, options: baseOpts({ plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + (c.dataset.yAxisID === 'y2' ? c.raw + '%' : fmt(c.raw)) } } },
      scales: { x: { grid: { display: false }, ticks: TICK }, y: { grid: { color: GRID }, ticks: { ...TICK, callback: fmtAx } }, y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: { ...TICK, callback: v => v + '%' } } } }) });
    mk('vmOpeRep', { type: 'bar', data: { labels: L, datasets: [
      { label: 'Local', data: ser(m => val(m.o.rl)), backgroundColor: hi(cm, sel, '#38bdf8'), stack: 'r', borderRadius: 3 },
      { label: 'Foráneo', data: ser(m => val(m.o.rf)), backgroundColor: hi(cm, sel, '#fb7185'), stack: 'r', borderRadius: 3 },
    ] }, options: baseOpts({ plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + num(c.raw) } } },
      scales: { x: { stacked: true, grid: { display: false }, ticks: TICK }, y: { stacked: true, grid: { color: GRID }, ticks: TICK } } }) });

    /* Administración */
    mk('vmAdmFin', { type: 'bar', data: { labels: L, datasets: [
      { label: 'Ingresos', data: ser(m => val(m.a.ing)), backgroundColor: hi(cm, sel, '#38bdf8'), borderRadius: 4 },
      { label: 'Egresos', data: ser(m => val(m.a.egr)), backgroundColor: hi(cm, sel, '#fb7185'), borderRadius: 4 },
      { label: 'Gastos op.', data: ser(m => val(m.a.gop)), backgroundColor: hi(cm, sel, '#fbbf24'), borderRadius: 4 },
      { label: 'Flujo', data: ser(m => val(m.a.flujo)), type: 'line', borderColor: '#2dd4bf', pointRadius: cm.map(m => sel.includes(m) ? 6 : 3), tension: .3 },
    ] }, options: baseOpts() });
    mk('vmAdmCart', { type: 'bar', data: { labels: L, datasets: [
      { label: 'Vigente', data: ser(m => val(m.a.cvig)), backgroundColor: hi(cm, sel, '#34d399'), borderRadius: 4 },
      { label: 'Vencida', data: ser(m => val(m.a.cven)), backgroundColor: hi(cm, sel, '#fb7185'), borderRadius: 4 },
      { label: 'Meta vencida', data: L.map(() => window.Dash.admon.metas['CARTERA_VENCIDA'] || null), type: 'line', borderColor: '#fbbf24aa', borderDash: [6, 4], pointRadius: 0 },
    ] }, options: baseOpts() });

    /* Gasto fijo */
    if (isNum(M.g.total)) {
      const cats = Object.keys(M.g.byCat).sort((a, b) => M.g.byCat[b] - M.g.byCat[a]);
      mk('vmGasCat', { type: 'doughnut', data: { labels: cats.map(cap), datasets: [{ data: cats.map(k => M.g.byCat[k]), backgroundColor: cats.map(catColor), borderColor: '#130e08', borderWidth: 3, hoverOffset: 8 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'right', labels: { color: MUTED, font: { size: 10 } } }, tooltip: { callbacks: { label: c => ` ${c.label}: ${pct(c.raw / M.g.total)} · ${fmt(c.raw)}` } } } } });

      const top = Object.keys(M.g.byConcept).filter(k => M.g.byConcept[k] > 0).sort((a, b) => M.g.byConcept[b] - M.g.byConcept[a]).slice(0, 10);
      let acc = 0;
      const cum = top.map(k => { acc += M.g.byConcept[k]; return +(acc / M.g.total * 100).toFixed(1); });
      mk('vmGasPareto', { type: 'bar', data: { labels: top.map(cap), datasets: [
        { label: 'Monto', data: top.map(k => M.g.byConcept[k]), backgroundColor: top.map(k => catColor(M.g.cat[k], Object.keys(CAT_COL).indexOf(M.g.cat[k])) + 'bb'), borderRadius: 4 },
        { label: '% acumulado', data: cum, type: 'line', yAxisID: 'y2', borderColor: '#ff6a13', pointRadius: 3, tension: .2 },
      ] }, options: baseOpts({ plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + (c.dataset.yAxisID === 'y2' ? c.raw + '%' : fmt(c.raw)) } } },
        scales: { x: { grid: { display: false }, ticks: { ...TICK, maxRotation: 50, autoSkip: false } }, y: { grid: { color: GRID }, ticks: { ...TICK, callback: fmtAx } },
          y2: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, ticks: { ...TICK, callback: v => v + '%' } } } }) });

      const all = gastos(cm);
      const catsAll = Object.keys(all.byCat).sort((a, b) => all.byCat[b] - all.byCat[a]);
      const promG = all.total / Math.max(1, all.monthsWith.length);
      mk('vmGasTrend', { type: 'bar', data: { labels: L, datasets: [
        ...catsAll.map((k, i) => ({ label: cap(k), data: monthly.map(x => isNum(x.M.g.total) ? (x.M.g.byCat[k] || 0) : null), backgroundColor: hi(cm, sel, catColor(k, i)), stack: 'g', borderRadius: 2 })),
        { label: 'Promedio mensual', data: L.map(() => promG), type: 'line', borderColor: '#f6f1e8aa', borderDash: [6, 4], pointRadius: 0 },
      ] }, options: baseOpts({ plugins: { legend: { position: 'top', labels: { font: { size: 10 }, boxWidth: 8 } }, tooltip: tipMoney },
        scales: { x: { stacked: true, grid: { display: false }, ticks: TICK }, y: { stacked: true, grid: { color: GRID }, ticks: { ...TICK, callback: fmtAx } } } }) });

      const nP = Math.max(1, M.g.monthsWith.length), nA = Math.max(1, all.monthsWith.length);
      const top8 = Object.keys(all.byConcept).sort((a, b) => Math.max(M.g.byConcept[b] / nP, all.byConcept[b] / nA) - Math.max(M.g.byConcept[a] / nP, all.byConcept[a] / nA)).slice(0, 10);
      mk('vmGasVsProm', { type: 'bar', data: { labels: top8.map(cap), datasets: [
        { label: p.kind === 'month' ? cap(MES[p.months[0]]) : 'Prom. mensual ' + p.label, data: top8.map(k => (M.g.byConcept[k] || 0) / nP), backgroundColor: '#ff6a13bb', borderRadius: 4 },
        { label: 'Promedio mensual año', data: top8.map(k => (all.byConcept[k] || 0) / nA), backgroundColor: '#94a3b866', borderRadius: 4 },
      ] }, options: baseOpts({ indexAxis: 'y', scales: { x: { grid: { color: GRID }, ticks: { ...TICK, callback: fmtAx } }, y: { grid: { display: false }, ticks: { ...TICK, autoSkip: false } } },
        plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + fmt(c.raw) } } } }) });
    }
  }

  /* ── Eventos ────────────────────────────────────────────────── */
  function wireToolbar() {
    const root = document.getElementById('vm-root');
    root.querySelectorAll('.vm-chip').forEach(b => b.addEventListener('click', () => { ST.period = b.dataset.period; saveState(); render(); }));
    root.querySelectorAll('.vm-seg button').forEach(b => b.addEventListener('click', () => {
      if (ST.mode === b.dataset.mode) return;
      ST.mode = b.dataset.mode; saveState(); render();
    }));
    const pr = root.querySelector('#vm-proy');
    if (pr) pr.addEventListener('change', () => { ST.proyectar = pr.checked; saveState(); render(); });
    root.querySelector('#vm-print')?.addEventListener('click', () => {
      document.body.classList.add('vm-printing');
      setTimeout(() => { window.print(); document.body.classList.remove('vm-printing'); }, 60);
    });
    root.querySelector('#vm-import')?.addEventListener('click', startImport);
  }

  /* ════════════════════════════════════════════════════════════
     IMPORTADOR DE EXCEL DE GASTOS (hoja DATOS)
     Columnas: CONCEPTO · CATEGORIA · MES · N° MES · MONTO
  ════════════════════════════════════════════════════════════ */
  function loadSheetJS() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = () => res(window.XLSX);
      s.onerror = () => rej(new Error('No se pudo cargar el lector de Excel (SheetJS)'));
      document.head.appendChild(s);
    });
  }
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase().replace(/\s+/g, ' ');

  function parseGastosWorkbook(wb) {
    const names = wb.SheetNames;
    let sheetName = names.find(n => norm(n) === 'DATOS');
    let rows = null, hdrRow = -1, cols = null;
    const tryFind = n => {
      const r = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null });
      for (let i = 0; i < Math.min(15, r.length); i++) {
        const h = (r[i] || []).map(norm);
        const ci = { c: h.indexOf('CONCEPTO'), k: h.findIndex(x => x.startsWith('CATEGOR')), m: h.indexOf('MES'), v: h.indexOf('MONTO') };
        if (ci.c >= 0 && ci.m >= 0 && ci.v >= 0) { rows = r; hdrRow = i; cols = ci; return true; }
      }
      return false;
    };
    if (!(sheetName && tryFind(sheetName))) sheetName = names.find(n => tryFind(n));
    if (!rows) throw new Error('No encontré una hoja con columnas CONCEPTO · CATEGORIA · MES · MONTO (normalmente la hoja DATOS).');
    const errs = [], data = {}, order = [], cat = {};
    let maxM = -1;
    for (let i = hdrRow + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const c = norm(r[cols.c]);
      if (!c) continue;
      const mi = MES.indexOf(norm(r[cols.m]));
      const v = typeof r[cols.v] === 'number' ? r[cols.v] : parseFloat(String(r[cols.v]).replace(/[$,\s]/g, ''));
      if (mi < 0) { errs.push(`Fila ${i + 1}: mes «${r[cols.m]}» no reconocido`); continue; }
      if (!isNum(v)) { errs.push(`Fila ${i + 1}: monto «${r[cols.v]}» no numérico (${c})`); continue; }
      if (!data[c]) { data[c] = {}; order.push(c); }
      if (cols.k >= 0 && norm(r[cols.k])) cat[c] = norm(r[cols.k]);
      data[c][mi] = Math.round(((data[c][mi] || 0) + v) * 100) / 100;
      if (mi > maxM) maxM = mi;
    }
    if (maxM < 0) throw new Error('La hoja no tiene renglones de gasto válidos.');
    const meses = MES.slice(0, maxM + 1);
    const conceptos = order.map(c => ({ concepto: c, categoria: cat[c] || 'SIN CATEGORIA', valores: meses.map((_, i) => data[c][i] || 0) }));
    return { sheetName, meses, conceptos, errs };
  }

  async function startImport() {
    const A = window.DashAdmin;
    if (!A || !A.canEditGastos()) { A && A.toast('🔒 Solo Super Admin o Administración pueden cargar gastos', 'error', 4000); return; }
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.xlsx,.xlsm,.xls';
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      try {
        A.toast('📖 Leyendo ' + f.name + '…', 'info', 2500);
        await loadSheetJS();
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
        const res = parseGastosWorkbook(wb);
        showImportPreview(res, f.name);
      } catch (e) {
        console.error(e);
        A.toast('❌ ' + (e.message || e), 'error', 7000);
      }
    });
    inp.click();
  }

  function showImportPreview(res, fileName) {
    const A = window.DashAdmin;
    const cur = gastoData();
    const totNew = res.meses.map((_, i) => res.conceptos.reduce((s, c) => s + (c.valores[i] || 0), 0));
    const totOld = res.meses.map(m => {
      if (!cur) return null;
      const j = cur.meses.indexOf(m); if (j < 0) return null;
      return cur.conceptos.reduce((s, c) => s + (+c.valores[j] || 0), 0);
    });
    const rows = res.meses.map((m, i) => {
      const d = isNum(totOld[i]) ? totNew[i] - totOld[i] : null;
      return `<tr><td>${cap(m)}</td><td>${fmt(totOld[i])}</td><td>${fmt(totNew[i])}</td>
        <td style="color:${!isNum(d) ? 'var(--green)' : Math.abs(d) < 0.5 ? 'var(--muted)' : 'var(--amber)'}">${!isNum(d) ? 'nuevo' : Math.abs(d) < 0.5 ? 'sin cambio' : (d > 0 ? '+' : '') + fmt(d)}</td></tr>`;
    }).join('');
    const ov = A.createOverlay(`
      <div class="modal vm-modal">
        <div class="modal-title">📥 Cargar gasto fijo</div>
        <div class="modal-sub">${esc(fileName)} · hoja <b>${esc(res.sheetName)}</b> · ${res.conceptos.length} conceptos · ${res.meses.length} meses</div>
        <div class="table-wrap" style="max-height:300px;overflow:auto"><table class="vm-table"><thead><tr><th>Mes</th><th>Actual</th><th>Nuevo</th><th>Diferencia</th></tr></thead>
          <tbody>${rows}<tr class="vm-row-total"><td>Total</td><td>${fmt(totOld.reduce((s, v) => s + (v || 0), 0))}</td><td>${fmt(totNew.reduce((s, v) => s + v, 0))}</td><td></td></tr></tbody></table></div>
        ${res.errs.length ? `<div class="vm-import-err">⚠️ ${res.errs.length} renglón(es) omitido(s):<br>${res.errs.slice(0, 8).map(esc).join('<br>')}${res.errs.length > 8 ? '<br>…' : ''}</div>` : ''}
        <div class="modal-sub" style="margin:12px 0 0">«Aplicar» actualiza la vista en este navegador. «Aplicar y guardar» además sube <b>solo la sección de gastos</b> a dash.json en GitHub (no toca Ventas/Ope/Admón).</div>
        <div class="modal-actions">
          <button class="btn-secondary" id="vmi-cancel">Cancelar</button>
          <button class="btn-secondary" id="vmi-apply">Aplicar</button>
          <button class="btn-primary" id="vmi-save">☁️ Aplicar y guardar</button>
        </div>
      </div>`);
    const apply = () => {
      const prev = gastoData() || {};
      window.DashRaw.gastos = {
        anio: prev.anio || year(), fuente: fileName + ' · hoja ' + res.sheetName,
        actualizado: new Date().toISOString().slice(0, 10), meses: res.meses, conceptos: res.conceptos,
      };
      if (window.Dash) window.Dash.gastos = window.DashRaw.gastos;
      ov.remove();
      render();
    };
    ov.querySelector('#vmi-cancel').addEventListener('click', () => ov.remove());
    ov.querySelector('#vmi-apply').addEventListener('click', () => { apply(); A.toast('✅ Gasto fijo aplicado (solo en esta sesión)', 'success', 4000); });
    ov.querySelector('#vmi-save').addEventListener('click', () => { apply(); A.commitSections(['gastos']); });
  }

  /* ── API pública ────────────────────────────────────────────── */
  window.buildValuacion = render;
  window.Valuacion = { model, agg, periods, completeMonths, state: ST };   // útil para depurar desde consola
})();
