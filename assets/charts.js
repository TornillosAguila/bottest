/* ═══════════════════════════════════════════
   charts.js — Grupo Águila · v3
   ═══════════════════════════════════════════ */
(function () {

  /* ── Defaults globales ─────────────────── */
  Chart.defaults.color                         = '#8b90b0';
  Chart.defaults.font.family                   = "'Segoe UI', system-ui, sans-serif";
  Chart.defaults.font.size                     = 11;
  Chart.defaults.plugins.legend.labels.boxWidth= 10;
  Chart.defaults.plugins.legend.labels.padding = 14;
  Chart.defaults.plugins.legend.labels.font    = { size:11 };
  Chart.defaults.plugins.tooltip.padding       = 10;
  Chart.defaults.plugins.tooltip.cornerRadius  = 8;

  /* ── Constantes de estilo ──────────────── */
  const GRID  = 'rgba(46,51,80,0.5)';
  const MUTED = '#8b90b0';
  const TICK  = { color: MUTED, font:{ size:10 } };
  const fmtK  = v => {
    if (v === null || v === undefined || isNaN(v)) return '';
    const a = Math.abs(v), s = v < 0 ? '-' : '';
    return a >= 1e6 ? s+'$'+(a/1e6).toFixed(1)+'M' : a >= 1e3 ? s+'$'+(a/1e3).toFixed(0)+'K' : s+'$'+a.toFixed(0);
  };
  const fmt  = v => v===null||isNaN(v) ? '—' : (v<0?'-':'')+'$'+Math.abs(Math.round(v)).toLocaleString('es-MX');
  const avg  = arr => { const f=arr.filter(v=>v!==null&&!isNaN(v)); return f.length ? f.reduce((a,b)=>a+b,0)/f.length : 0; };

  /* ── Registro de instancias ────────────── */
  const CH = {};
  function mk(id, cfg) {
    if (CH[id]) { CH[id].destroy(); delete CH[id]; }
    const el = document.getElementById(id);
    if (!el) return null;
    CH[id] = new Chart(el, cfg);
    return CH[id];
  }

  /* ── Opciones base reutilizables ───────── */
  function lineOpts(yFmt='$', extra={}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode:'index', intersect:false },
      plugins: {
        legend: { position:'top' },
        tooltip: { callbacks: { label: c => ' '+(yFmt==='$'?fmt(c.raw):c.raw?.toFixed?.(1)??c.raw) } },
      },
      scales: {
        x: { grid:{color:GRID}, ticks:{...TICK, maxRotation:40, autoSkip:true, maxTicksLimit:10} },
        y: { grid:{color:GRID}, ticks:{...TICK, callback: v => yFmt==='$'?fmtK(v):v+(yFmt==='%'?'%':'')} },
      },
      ...extra
    };
  }

  function barOpts(yFmt='$', extra={}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode:'index', intersect:false },
      plugins: {
        legend: { position:'top' },
        tooltip: { callbacks: { label: c => ' '+(yFmt==='$'?fmt(c.raw):c.raw?.toFixed?.(1)??c.raw) } },
      },
      scales: {
        x: { grid:{display:false}, ticks:{...TICK, maxRotation:40, autoSkip:true, maxTicksLimit:10} },
        y: { grid:{color:GRID}, ticks:{...TICK, callback: v => yFmt==='$'?fmtK(v):v+(yFmt==='%'?'%':'')} },
      },
      ...extra
    };
  }

  /* ── Dataset helpers ───────────────────── */
  function ds_line(label, data, color, opts={}) {
    return { label, data, borderColor:color, backgroundColor:color+'18',
      borderWidth:2, pointRadius:3, pointHoverRadius:5,
      pointBackgroundColor:color, tension:.35, fill:!!opts.fill, ...opts };
  }
  function ds_bar(label, data, color, opts={}) {
    return { label, data, backgroundColor:Array.isArray(color)?color:color+'cc',
      borderColor:Array.isArray(color)?color:color, borderWidth:0,
      borderRadius:5, borderSkipped:false, ...opts };
  }
  function ds_meta(n, meta, color='#f87171') {
    return { label:'Meta', data:Array(n).fill(meta), type:'line',
      borderColor:color+'88', borderWidth:1.5, borderDash:[6,4],
      pointRadius:0, fill:false };
  }

  /* ════════════════════════════════════════
     VENTAS
  ════════════════════════════════════════ */
  function buildVentas() {
    const V  = window.Dash.ventas;
    const LB = V.cortes.map(c => c.label);
    const VT = V.data['VENTAS TOTALES'];
    const MT = V.metas['VENTAS TOTALES'];

    /* Ventas totales por corte */
    mk('chartTotalCortes', { type:'line', data:{ labels:LB,
      datasets:[ ds_line('Ventas Netas', VT, '#4f8ef7', {fill:true}), ds_meta(LB.length, MT) ]},
      options: lineOpts('$') });

    /* Barras por mes */
    const COL = ['#4f8ef7','#22c55e','#f59e0b','#a78bfa','#22d3ee'];
    mk('chartMeses', { type:'bar', data:{
      labels: V.meses.map(m=>m[0]+m.slice(1).toLowerCase()),
      datasets:[
        ds_bar('Ventas', V.meses.map(m=>V.acumuladoMes[m]?.['VENTAS TOTALES']||0), V.meses.map((_,i)=>COL[i%COL.length])),
        { label:'Meta', data:Array(V.meses.length).fill(MT), type:'line',
          borderColor:'#f87171bb', borderWidth:2, borderDash:[5,4],
          pointRadius:5, pointStyle:'crossRot', pointBackgroundColor:'#f87171', fill:false },
      ]}, options: barOpts('$') });

    /* Dona */
    const PROMS = V.canalesVenta.map(c=>avg(V.data[c]));
    const TOT   = PROMS.reduce((s,v)=>s+v,0);
    mk('chartDona', { type:'doughnut', data:{
      labels: V.canalesVenta.map(c=>c[0]+c.slice(1).toLowerCase()),
      datasets:[{ data:PROMS,
        backgroundColor: V.canalesVenta.map(c=>V.canalConfig[c].color),
        borderColor:'#1a1d27', borderWidth:3, hoverOffset:8 }]},
      options:{ responsive:true, maintainAspectRatio:false, cutout:'66%',
        plugins:{ legend:{position:'right', labels:{color:MUTED,font:{size:11}}},
          tooltip:{callbacks:{label:c=>` ${c.label}: ${((c.raw/TOT)*100).toFixed(1)}% · ${fmt(c.raw)}`}} }} });

    /* Cumplimiento */
    const PCTS = V.canalesVenta.map(c=>+((avg(V.data[c])/(V.metas[c]||1))*100).toFixed(1));
    mk('chartCumplimiento', { type:'bar', data:{
      labels: V.canalesVenta.map(c=>c[0]+c.slice(1).toLowerCase()),
      datasets:[
        ds_bar('Cumplimiento %', PCTS, PCTS.map(p=>p>=100?'#22c55e':p>=85?'#f59e0b':'#f87171')),
        { label:'Meta 100%', data:Array(4).fill(100), type:'line',
          borderColor:'rgba(255,255,255,.2)', borderWidth:1.5, borderDash:[4,4], pointRadius:0, fill:false },
      ]}, options: barOpts('%', { scales:{
        x:{grid:{display:false},ticks:TICK},
        y:{grid:{color:GRID},ticks:{...TICK,callback:v=>v+'%'},suggestedMin:60,suggestedMax:120} }}) });
  }

  /* Canal individual con filtro de mes */
  window.buildCanalChart = function(canal, mesFilter) {
    const V  = window.Dash.ventas;
    const ID = {'PUNTO DE VENTA':'chartPV','CALL CENTER':'chartCC','PLATAFORMA':'chartPLAT','ASESORES':'chartASE'}[canal];
    if (!ID) return;
    const idxs = mesFilter==='TODOS'
      ? V.cortes.map((_,i)=>i)
      : V.cortes.map((c,i)=>c.mes===mesFilter?i:-1).filter(i=>i>=0);
    const lb  = idxs.map(i=>V.cortes[i].label);
    const val = idxs.map(i=>V.data[canal][i]);
    const col = V.canalConfig[canal].color;
    mk(ID, { type:'line', data:{ labels:lb, datasets:[
      ds_line('Ventas', val, col, {fill:true}), ds_meta(lb.length, V.metas[canal]) ]},
      options: lineOpts('$') });
  };

  /* Apilado */
  window.buildChartApilado = function() {
    const V = window.Dash.ventas;
    mk('chartApilado', { type:'bar', data:{
      labels: V.cortes.map(c=>c.label),
      datasets: V.canalesVenta.map(c=>({
        label: c[0]+c.slice(1).toLowerCase(),
        data: V.data[c],
        backgroundColor: V.canalConfig[c].color+'cc',
        borderWidth:0, borderRadius:2,
      }))},
      options:{ responsive:true, maintainAspectRatio:false,
        interaction:{mode:'index',intersect:false},
        plugins:{ legend:{position:'top'}, tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${fmt(c.raw)}`}} },
        scales:{
          x:{stacked:true, grid:{color:GRID}, ticks:{...TICK,maxRotation:40,autoSkip:true,maxTicksLimit:10}},
          y:{stacked:true, grid:{color:GRID}, ticks:{...TICK,callback:fmtK}} }} });
  };

  /* Mini-gráfica por mes */
  window.buildMesChart = function(id, mes, color) {
    const V    = window.Dash.ventas;
    const idxs = V.cortes.map((c,i)=>c.mes===mes?i:-1).filter(i=>i>=0);
    mk(id, { type:'bar', data:{
      labels: idxs.map(i=>V.cortes[i].label),
      datasets:[ ds_bar('Ventas', idxs.map(i=>V.data['VENTAS TOTALES'][i]), color),
        ds_meta(idxs.length, V.metas['VENTAS TOTALES']) ]},
      options: barOpts('$') });
  };

  /* ════════════════════════════════════════
     OPERACIONES
  ════════════════════════════════════════ */
  window.buildOpe = function() {
    const O  = window.Dash.ope;
    const LB = O.cortes.map(c=>c.label);

    mk('chartCompras', { type:'line', data:{ labels:LB, datasets:[
      ds_line('Compras', O.data['COMPRA'], '#4f8ef7', {fill:true}),
      ds_meta(LB.length, O.metas['COMPRA']) ]}, options: lineOpts('$') });

    mk('chartDevoluciones', { type:'bar', data:{ labels:LB, datasets:[
      ds_bar('Devoluciones', O.data['DEVOLUCIONES'],
        O.data['DEVOLUCIONES'].map(v=>v!==null&&v<O.metas['DEVOLUCIONES']?'#22c55ecc':'#f87171cc')),
      ds_meta(LB.length, O.metas['DEVOLUCIONES'], '#f59e0b') ]},
      options: barOpts('num') });

    mk('chartNivelServicio', { type:'line', data:{ labels:LB, datasets:[
      ds_line('Nivel Serv. ($)', O.data['NIVEL_SERVICIO'], '#f59e0b', {fill:true}) ]},
      options: lineOpts('$') });

    mk('chartNivelPct', { type:'line', data:{ labels:LB, datasets:[
      ds_line('% Nivel Serv.', O.data['NIVEL_SERVICIO_PCT'], '#22d3ee'),
      { label:'Meta 8.8%', data:Array(LB.length).fill(8.8),
        borderColor:'#f87171aa', borderWidth:1.5, borderDash:[5,4], pointRadius:0, fill:false }]},
      options: lineOpts('%') });

    mk('chartMaquinas', { type:'bar', data:{ labels:LB, datasets:[
      ds_bar('Reparadas', O.data['MAQUINAS'],
        O.data['MAQUINAS'].map(v=>v!==null?'#a78bfacc':'#2e3350')),
      ds_meta(LB.length, O.metas['MAQUINAS'], '#22c55e') ]},
      options: barOpts('num') });

    mk('chartDias', { type:'bar', data:{ labels:LB, datasets:[
      ds_bar('Días', O.data['DIAS_REPARACION'],
        O.data['DIAS_REPARACION'].map(v=>v!==null&&v<=O.metas['DIAS_REPARACION']?'#22c55ecc':'#f87171cc')),
      ds_meta(LB.length, O.metas['DIAS_REPARACION'], '#f59e0b') ]},
      options: barOpts('num') });
  };

  /* ════════════════════════════════════════
     ADMINISTRACIÓN
  ════════════════════════════════════════ */
  window.buildAdmon = function() {
    const A  = window.Dash.admon;
    const LB = A.cortes.map(c=>c.label);

    mk('chartIngresos', { type:'line', data:{ labels:LB, datasets:[
      ds_line('Ingresos', A.data['INGRESOS'], '#4f8ef7', {fill:true}),
      ds_meta(LB.length, A.metas['INGRESOS']) ]}, options: lineOpts('$') });

    mk('chartIngEgr', { type:'bar', data:{ labels:LB, datasets:[
      ds_bar('Ingresos', A.data['INGRESOS'], '#4f8ef7'),
      ds_bar('Egresos',  A.data['EGRESOS'],  '#f87171') ]},
      options: barOpts('$') });

    mk('chartFlujo', { type:'bar', data:{ labels:LB, datasets:[{
      label:'Flujo', data:A.data['FLUJO'],
      backgroundColor: A.data['FLUJO'].map(v=>v!==null&&v>=0?'#22c55e66':'#f8717166'),
      borderColor:     A.data['FLUJO'].map(v=>v!==null&&v>=0?'#22c55e':'#f87171'),
      borderWidth:1, borderRadius:4, borderSkipped:false }]},
      options: barOpts('$') });

    mk('chartGastos', { type:'line', data:{ labels:LB, datasets:[
      ds_line('Gastos', A.data['GASTOS_OPERACION'], '#f87171', {fill:true}),
      ds_meta(LB.length, A.metas['GASTOS_OPERACION'], '#f59e0b') ]},
      options: lineOpts('$') });

    mk('chartPlazoCobro', { type:'bar', data:{ labels:LB, datasets:[
      ds_bar('Días', A.data['PLAZO_COBRO'],
        A.data['PLAZO_COBRO'].map(v=>v!==null&&v<A.metas['PLAZO_COBRO']?'#22c55ecc':'#f87171cc')),
      ds_meta(LB.length, A.metas['PLAZO_COBRO'], '#f59e0b') ]},
      options: barOpts('num') });

    mk('chartRecuperacion', { type:'line', data:{ labels:LB, datasets:[
      ds_line('% Recuperación', A.data['RECUPERACION'].map(v=>v!==null?+(v*100).toFixed(1):null), '#22d3ee'),
      { label:'Meta', data:Array(LB.length).fill(A.metas['RECUPERACION']),
        borderColor:'#f87171aa', borderWidth:1.5, borderDash:[5,4], pointRadius:0, fill:false }]},
      options: lineOpts('%') });
  };

  /* ════════════════════════════════════════
     CONSOLIDADO
  ════════════════════════════════════════ */
  window.buildConsolidado = function() {
    const V = window.Dash.ventas;
    const O = window.Dash.ope;
    const A = window.Dash.admon;

    const VM     = V.meses;
    const vtMes  = VM.map(m=>V.acumuladoMes[m]?.['VENTAS TOTALES']||0);
    const cmpMes = VM.map(m=>{
      const ii=O.cortes.map((c,i)=>c.mes===m?i:-1).filter(i=>i>=0);
      const vv=ii.map(i=>O.data['COMPRA'][i]).filter(v=>v!==null);
      return vv.length?vv[vv.length-1]:null;
    });

    mk('chartConsVtasCmp', { type:'line', data:{
      labels: VM.map(m=>m[0]+m.slice(1).toLowerCase()),
      datasets:[
        ds_line('Ventas',  vtMes,  '#4f8ef7'),
        { ...ds_line('Compras', cmpMes, '#a78bfa'), borderDash:[5,3] },
      ]}, options: lineOpts('$') });

    const AM    = A.meses;
    const ingM  = AM.map(m=>{const ii=A.cortes.map((c,i)=>c.mes===m?i:-1).filter(i=>i>=0);const vv=ii.map(i=>A.data['INGRESOS'][i]).filter(v=>v!==null);return vv.length?avg(vv):null;});
    const egrM  = AM.map(m=>{const ii=A.cortes.map((c,i)=>c.mes===m?i:-1).filter(i=>i>=0);const vv=ii.map(i=>A.data['EGRESOS'][i]).filter(v=>v!==null);return vv.length?avg(vv):null;});

    mk('chartConsIngEgr', { type:'bar', data:{
      labels: AM.map(m=>m[0]+m.slice(1).toLowerCase()),
      datasets:[ ds_bar('Ingresos',ingM,'#4f8ef7'), ds_bar('Egresos',egrM,'#f87171') ]},
      options: barOpts('$') });

    const allM  = [...new Set([...VM,...AM])];
    const vt3   = allM.map(m=>V.acumuladoMes[m]?.['VENTAS TOTALES']||null);
    const cmp3  = allM.map(m=>{const ii=O.cortes.map((c,i)=>c.mes===m?i:-1).filter(i=>i>=0);if(!ii.length)return null;const vv=ii.map(i=>O.data['COMPRA'][i]).filter(v=>v!==null);return vv.length?vv[vv.length-1]:null;});
    const ing3  = allM.map(m=>{const ii=A.cortes.map((c,i)=>c.mes===m?i:-1).filter(i=>i>=0);if(!ii.length)return null;const vv=ii.map(i=>A.data['INGRESOS'][i]).filter(v=>v!==null);return vv.length?vv[vv.length-1]:null;});

    mk('chartConsTendencia', { type:'line', data:{
      labels: allM.map(m=>m[0]+m.slice(1).toLowerCase()),
      datasets:[
        ds_line('Ventas',   vt3,  '#4f8ef7'),
        { ...ds_line('Compras',  cmp3, '#a78bfa'), borderDash:[5,3] },
        { ...ds_line('Ingresos', ing3, '#22c55e'), borderDash:[3,3] },
      ]}, options: lineOpts('$') });
  };

  /* ── Init ──────────────────────────────── */
  document.addEventListener('dashready', buildVentas);
})();
