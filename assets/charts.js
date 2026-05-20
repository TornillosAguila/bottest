/* ═══════════════════════════════════════════
   charts.js — Grupo Águila · v3.2
   + Gráficas consolidadas por mes (Resumen, Ope, Admon)
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
  const COLS  = ['#4f8ef7','#22c55e','#f59e0b','#a78bfa','#22d3ee','#f87171'];
  const fmtK  = v => {
    if (v === null || v === undefined || isNaN(v)) return '';
    const a = Math.abs(v), s = v < 0 ? '-' : '';
    return a >= 1e6 ? s+'$'+(a/1e6).toFixed(1)+'M' : a >= 1e3 ? s+'$'+(a/1e3).toFixed(0)+'K' : s+'$'+a.toFixed(0);
  };
  const fmt  = v => v===null||isNaN(v) ? '—' : (v<0?'-':'')+'$'+Math.abs(Math.round(v)).toLocaleString('es-MX');
  const avg  = arr => { const f=arr.filter(v=>v!==null&&!isNaN(v)); return f.length ? f.reduce((a,b)=>a+b,0)/f.length : 0; };
  const capMes = m => m[0] + m.slice(1).toLowerCase();

  /* ── Registro de instancias ────────────── */
  const CH = {};
  function mk(id, cfg) {
    if (CH[id]) { CH[id].destroy(); delete CH[id]; }
    const el = document.getElementById(id);
    if (!el) return null;
    CH[id] = new Chart(el, cfg);
    return CH[id];
  }

  /* ── Opciones base ─────────────────────── */
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
  function ds_metaArr(arr, color='#f87171') {
    return { label:'Meta Mensual', data:arr, type:'line',
      borderColor:color+'aa', borderWidth:1.5, borderDash:[6,4],
      pointRadius:0, fill:false };
  }

  /* ════════════════════════════════════════
     HELPER: agregar valores por mes
     op = 'sum' (default) | 'avg'
  ════════════════════════════════════════ */
  function porMes(cortes, valores, op='sum') {
    const meses = [...new Set(cortes.map(c => c.mes))];
    const buckets = {};
    meses.forEach(m => buckets[m] = []);
    cortes.forEach((c,i) => {
      const v = valores[i];
      if (v != null && !isNaN(v)) buckets[c.mes].push(v);
    });
    const valoresMes = meses.map(m => {
      const a = buckets[m];
      if (!a.length) return null;
      return op === 'avg' ? a.reduce((s,v)=>s+v,0)/a.length : a.reduce((s,v)=>s+v,0);
    });
    const conteoMes = meses.map(m => buckets[m].length);
    return { meses, valoresMes, conteoMes, labels: meses.map(capMes) };
  }

  /* ════════════════════════════════════════
     VENTAS — Resumen
  ════════════════════════════════════════ */
  function buildVentas() {
    const V  = window.Dash.ventas;
    const LB = V.cortes.map(c => c.label);
    const VT = V.data['VENTAS TOTALES'];
    const MT = V.metas['VENTAS TOTALES'];

    /* (Original) Ventas totales por corte — línea con 19 puntos */
    mk('chartTotalCortes', { type:'line', data:{ labels:LB,
      datasets:[ ds_line('Ventas Netas', VT, '#4f8ef7', {fill:true}), ds_meta(LB.length, MT) ]},
      options: lineOpts('$') });

    /* (Original) Ventas por Mes — Último Corte */
    mk('chartMeses', { type:'bar', data:{
      labels: V.meses.map(capMes),
      datasets:[
        ds_bar('Ventas (último corte)', V.meses.map(m=>V.acumuladoMes[m]?.['VENTAS TOTALES']||0), V.meses.map((_,i)=>COLS[i%COLS.length])),
        { label:'Meta semanal', data:Array(V.meses.length).fill(MT), type:'line',
          borderColor:'#f87171bb', borderWidth:2, borderDash:[5,4],
          pointRadius:5, pointStyle:'crossRot', pointBackgroundColor:'#f87171', fill:false },
      ]}, options: barOpts('$') });

    /* (NUEVO) Ventas Totales por Mes — consolidado de cortes */
    const ag = porMes(V.cortes, VT, 'sum');
    const metaMensual = ag.conteoMes.map(n => MT * n);

    mk('chartMesTotalLinea', { type:'line', data:{ labels: ag.labels,
      datasets:[
        ds_line('Ventas Netas Mensuales', ag.valoresMes, '#22d3ee', {fill:true}),
        ds_metaArr(metaMensual),
      ]},
      options: lineOpts('$') });

    mk('chartMesTotalBarra', { type:'bar', data:{
      labels: ag.labels,
      datasets:[
        ds_bar('Ventas', ag.valoresMes, ag.meses.map((_,i)=>COLS[i%COLS.length])),
        { label:'Meta Mensual', data: metaMensual, type:'line',
          borderColor:'#f87171bb', borderWidth:2, borderDash:[5,4],
          pointRadius:5, pointStyle:'crossRot', pointBackgroundColor:'#f87171', fill:false },
      ]}, options: barOpts('$') });

    /* Dona */
    const PROMS = V.canalesVenta.map(c=>avg(V.data[c]));
    const TOT   = PROMS.reduce((s,v)=>s+v,0);
    mk('chartDona', { type:'doughnut', data:{
      labels: V.canalesVenta.map(capMes),
      datasets:[{ data:PROMS,
        backgroundColor: V.canalesVenta.map(c=>V.canalConfig[c].color),
        borderColor:'#1a1d27', borderWidth:3, hoverOffset:8 }]},
      options:{ responsive:true, maintainAspectRatio:false, cutout:'66%',
        plugins:{ legend:{position:'right', labels:{color:MUTED,font:{size:11}}},
          tooltip:{callbacks:{label:c=>` ${c.label}: ${((c.raw/TOT)*100).toFixed(1)}% · ${fmt(c.raw)}`}} }} });

    /* Cumplimiento */
    const PCTS = V.canalesVenta.map(c=>+((avg(V.data[c])/(V.metas[c]||1))*100).toFixed(1));
    mk('chartCumplimiento', { type:'bar', data:{
      labels: V.canalesVenta.map(capMes),
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
        label: capMes(c),
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

    /* ── ORIGINALES (por corte) ── */
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

    /* ── NUEVAS (consolidadas por mes) ── */
    const compraMes = porMes(O.cortes, O.data['COMPRA'], 'sum');
    mk('chartComprasMes', { type:'bar', data:{ labels: compraMes.labels, datasets:[
      ds_bar('Compras', compraMes.valoresMes, compraMes.meses.map((_,i)=>COLS[i%COLS.length])),
      ds_metaArr(compraMes.conteoMes.map(n => O.metas['COMPRA'] * n)),
    ]}, options: barOpts('$') });

    const devMes = porMes(O.cortes, O.data['DEVOLUCIONES'], 'sum');
    mk('chartDevolucionesMes', { type:'bar', data:{ labels: devMes.labels, datasets:[
      ds_bar('Devoluciones', devMes.valoresMes,
        devMes.valoresMes.map((v,i)=> v!=null && v < O.metas['DEVOLUCIONES']*devMes.conteoMes[i] ? '#22c55ecc':'#f87171cc')),
      ds_metaArr(devMes.conteoMes.map(n => O.metas['DEVOLUCIONES'] * n), '#f59e0b'),
    ]}, options: barOpts('num') });

    const nsMes = porMes(O.cortes, O.data['NIVEL_SERVICIO'], 'sum');
    mk('chartNivelServicioMes', { type:'line', data:{ labels: nsMes.labels, datasets:[
      ds_line('Nivel Servicio Mensual', nsMes.valoresMes, '#f59e0b', {fill:true}),
      ds_metaArr(nsMes.conteoMes.map(n => O.metas['NIVEL_SERVICIO'] * n)),
    ]}, options: lineOpts('$') });

    const maqMes = porMes(O.cortes, O.data['MAQUINAS'], 'sum');
    mk('chartMaquinasMes', { type:'bar', data:{ labels: maqMes.labels, datasets:[
      ds_bar('Reparadas', maqMes.valoresMes, maqMes.meses.map((_,i)=>COLS[i%COLS.length])),
      ds_metaArr(maqMes.conteoMes.map(n => O.metas['MAQUINAS'] * n), '#22c55e'),
    ]}, options: barOpts('num') });
  };

  /* ════════════════════════════════════════
     ADMINISTRACIÓN
  ════════════════════════════════════════ */
  window.buildAdmon = function() {
    const A  = window.Dash.admon;
    const LB = A.cortes.map(c=>c.label);

    /* ── ORIGINALES (por corte) ── */
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

    /* ── NUEVAS (consolidadas por mes) ── */
    const ingMes = porMes(A.cortes, A.data['INGRESOS'], 'sum');
    mk('chartIngresosMes', { type:'bar', data:{ labels: ingMes.labels, datasets:[
      ds_bar('Ingresos', ingMes.valoresMes, ingMes.meses.map((_,i)=>COLS[i%COLS.length])),
      ds_metaArr(ingMes.conteoMes.map(n => A.metas['INGRESOS'] * n)),
    ]}, options: barOpts('$') });

    const egrMes = porMes(A.cortes, A.data['EGRESOS'], 'sum');
    mk('chartIngEgrMes', { type:'bar', data:{ labels: ingMes.labels, datasets:[
      ds_bar('Ingresos', ingMes.valoresMes, '#4f8ef7'),
      ds_bar('Egresos',  egrMes.valoresMes, '#f87171'),
    ]}, options: barOpts('$') });

    const flujoMes = porMes(A.cortes, A.data['FLUJO'], 'sum');
    mk('chartFlujoMes', { type:'bar', data:{ labels: flujoMes.labels, datasets:[{
      label:'Flujo mensual', data: flujoMes.valoresMes,
      backgroundColor: flujoMes.valoresMes.map(v=>v!=null && v>=0?'#22c55e66':'#f8717166'),
      borderColor:     flujoMes.valoresMes.map(v=>v!=null && v>=0?'#22c55e':'#f87171'),
      borderWidth:1, borderRadius:5, borderSkipped:false,
    }]}, options: barOpts('$') });

    const gasMes = porMes(A.cortes, A.data['GASTOS_OPERACION'], 'sum');
    mk('chartGastosMes', { type:'line', data:{ labels: gasMes.labels, datasets:[
      ds_line('Gastos Mensuales', gasMes.valoresMes, '#f87171', {fill:true}),
      ds_metaArr(gasMes.conteoMes.map(n => A.metas['GASTOS_OPERACION'] * n), '#f59e0b'),
    ]}, options: lineOpts('$') });

    /* Promedios para Plazo de Cobro y % Recuperación */
    const cobroMes = porMes(A.cortes, A.data['PLAZO_COBRO'], 'avg');
    mk('chartPlazoCobroMes', { type:'bar', data:{ labels: cobroMes.labels, datasets:[
      ds_bar('Días promedio', cobroMes.valoresMes,
        cobroMes.valoresMes.map(v=>v!=null && v < A.metas['PLAZO_COBRO']?'#22c55ecc':'#f87171cc')),
      { label:'Meta '+A.metas['PLAZO_COBRO']+' días',
        data: Array(cobroMes.labels.length).fill(A.metas['PLAZO_COBRO']),
        type:'line', borderColor:'#f87171aa', borderWidth:1.5, borderDash:[5,4], pointRadius:0, fill:false },
    ]}, options: barOpts('num') });

    const recMes = porMes(A.cortes, A.data['RECUPERACION'], 'avg');
    mk('chartRecuperacionMes', { type:'line', data:{ labels: recMes.labels, datasets:[
      ds_line('% Recuperación promedio', recMes.valoresMes.map(v=>v!=null?+(v*100).toFixed(1):null), '#22d3ee', {fill:true}),
      { label:'Meta <'+A.metas['RECUPERACION']+'%',
        data: Array(recMes.labels.length).fill(A.metas['RECUPERACION']),
        type:'line', borderColor:'#f87171aa', borderWidth:1.5, borderDash:[5,4], pointRadius:0, fill:false },
    ]}, options: lineOpts('%') });
  };

  /* ════════════════════════════════════════
     RESUMEN EMPRESA — Gráficas anuales y KPI rentabilidad
  ════════════════════════════════════════ */
  window.buildEmpresa = function() {
    const V = window.Dash.ventas;
    const O = window.Dash.ope;
    const A = window.Dash.admon;
    const sumNN = a => a.filter(v => v!=null && !isNaN(v)).reduce((s,v)=>s+v, 0);

    /* ── Chart 1: Ventas anuales por canal ── */
    const canalLabels = V.canalesVenta.map(capMes);
    const canalVals   = V.canalesVenta.map(c => sumNN(V.data[c]));
    const canalCols   = V.canalesVenta.map(c => V.canalConfig[c].color);
    mk('chartEmpVentasCanales', { type:'bar', data:{
      labels: [...canalLabels, 'Total'],
      datasets:[
        ds_bar('Total anual', [...canalVals, sumNN(V.data['VENTAS TOTALES'])], [...canalCols, '#f87171']),
      ]},
      options: barOpts('$') });

    /* ── Chart 2: Ventas totales por mes ── */
    const vMes = porMes(V.cortes, V.data['VENTAS TOTALES'], 'sum');
    mk('chartEmpVentasMes', { type:'line', data:{
      labels: vMes.labels,
      datasets:[
        ds_line('Ventas Mensuales', vMes.valoresMes, '#22d3ee', {fill:true}),
        ds_metaArr(vMes.conteoMes.map(n => V.metas['VENTAS TOTALES'] * n)),
      ]},
      options: lineOpts('$') });

    /* ── Chart 3: Compras vs Nivel Servicio mensual (operaciones) ── */
    const cMes  = porMes(O.cortes, O.data['COMPRA'],         'sum');
    const nsMes = porMes(O.cortes, O.data['NIVEL_SERVICIO'], 'sum');
    mk('chartEmpOpeFlujo', { type:'bar', data:{
      labels: cMes.labels,
      datasets:[
        ds_bar('Compras',         cMes.valoresMes,  '#4f8ef7'),
        ds_bar('Nivel Servicio',  nsMes.valoresMes, '#f59e0b'),
      ]},
      options: barOpts('$') });

    /* ── Chart 4: Devoluciones y Máquinas (operaciones) ── */
    const dMes   = porMes(O.cortes, O.data['DEVOLUCIONES'], 'sum');
    const mqMes  = porMes(O.cortes, O.data['MAQUINAS'],     'sum');
    mk('chartEmpOpeCalidad', { type:'bar', data:{
      labels: dMes.labels,
      datasets:[
        ds_bar('Devoluciones',    dMes.valoresMes,  '#22c55e'),
        ds_bar('Máqs. Reparadas', mqMes.valoresMes, '#a78bfa'),
      ]},
      options: barOpts('num') });

    /* ── Chart 5: Ingresos/Egresos/Gastos mensual (admon) ── */
    const ingMes = porMes(A.cortes, A.data['INGRESOS'],         'sum');
    const egrMes = porMes(A.cortes, A.data['EGRESOS'],          'sum');
    const gasMes = porMes(A.cortes, A.data['GASTOS_OPERACION'], 'sum');
    mk('chartEmpAdmonFinanzas', { type:'bar', data:{
      labels: ingMes.labels,
      datasets:[
        ds_bar('Ingresos', ingMes.valoresMes, '#4f8ef7'),
        ds_bar('Egresos',  egrMes.valoresMes, '#f87171'),
        ds_bar('Gastos',   gasMes.valoresMes, '#f59e0b'),
      ]},
      options: barOpts('$') });

    /* ── Chart 6: Flujo de Efectivo acumulado ── */
    const fluMes = porMes(A.cortes, A.data['FLUJO'], 'sum');
    // Acumulado
    let acum = 0;
    const acumArr = fluMes.valoresMes.map(v => { acum += (v||0); return acum; });
    mk('chartEmpAdmonFlujo', { type:'line', data:{
      labels: fluMes.labels,
      datasets:[
        ds_line('Flujo Mensual',     fluMes.valoresMes, '#22d3ee'),
        ds_line('Flujo Acumulado',   acumArr,           '#a78bfa', {fill:true}),
      ]},
      options: lineOpts('$') });

    /* ── Chart 7: Rentabilidad mensual (KPI principal) ── */
    // Margen Operativo por mes = (VentasMes - ComprasMes - GastosMes) / VentasMes * 100
    const allMeses = [...new Set([...V.meses, ...O.meses, ...A.meses])];

    function sumMonthValues(cortes, valores, mes) {
      let s = 0, has = false;
      cortes.forEach((c,i) => {
        if (c.mes === mes && valores[i] != null && !isNaN(valores[i])) {
          s += valores[i]; has = true;
        }
      });
      return has ? s : null;
    }

    const ventasPorMes  = allMeses.map(m => sumMonthValues(V.cortes, V.data['VENTAS TOTALES'], m));
    const comprasPorMes = allMeses.map(m => sumMonthValues(O.cortes, O.data['COMPRA'], m));
    const gastosPorMes  = allMeses.map(m => sumMonthValues(A.cortes, A.data['GASTOS_OPERACION'], m));

    const rentMes = allMeses.map((m,i) => {
      const v = ventasPorMes[i];
      const c = comprasPorMes[i] || 0;
      const g = gastosPorMes[i]  || 0;
      if (v == null || v === 0) return null;
      return +(((v - c - g) / v) * 100).toFixed(1);
    });

    // Total anual rentabilidad para línea de referencia
    const totV = sumNN(V.data['VENTAS TOTALES']);
    const totC = sumNN(O.data['COMPRA']);
    const totG = sumNN(A.data['GASTOS_OPERACION']);
    const rentAnual = totV > 0 ? +(((totV - totC - totG) / totV) * 100).toFixed(1) : 0;

    mk('chartRentabilidadMes', { type:'line', data:{
      labels: allMeses.map(capMes),
      datasets:[
        { label:'Rentabilidad mensual %', data: rentMes,
          borderColor:'#22d3ee', backgroundColor:'rgba(34,211,238,.15)',
          borderWidth:3, pointRadius:6, pointHoverRadius:8,
          pointBackgroundColor: rentMes.map(v => v == null ? '#2e3350' : v >= rentAnual ? '#22c55e' : v >= 20 ? '#f59e0b' : '#f87171'),
          pointBorderColor:'#fff', pointBorderWidth:2, tension:.35, fill:true },
        { label:`Promedio anual (${rentAnual}%)`, data: Array(allMeses.length).fill(rentAnual),
          type:'line', borderColor:'#f87171bb', borderWidth:2, borderDash:[8,5],
          pointRadius:0, fill:false },
      ]},
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode:'index', intersect:false },
        plugins: {
          legend: { position:'top' },
          tooltip: { callbacks: { label: c => ' '+(c.raw==null ? 'sin datos' : c.raw.toFixed(1)+'%') } },
        },
        scales: {
          x: { grid:{color:GRID}, ticks:{...TICK} },
          y: { grid:{color:GRID}, ticks:{...TICK, callback: v => v+'%'},
               suggestedMin: Math.min(0, ...rentMes.filter(v=>v!=null)) - 5,
               suggestedMax: Math.max(...rentMes.filter(v=>v!=null), rentAnual) + 5 },
        },
      }
    });
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
      labels: VM.map(capMes),
      datasets:[
        ds_line('Ventas',  vtMes,  '#4f8ef7'),
        { ...ds_line('Compras', cmpMes, '#a78bfa'), borderDash:[5,3] },
      ]}, options: lineOpts('$') });

    const AM    = A.meses;
    const ingM  = AM.map(m=>{const ii=A.cortes.map((c,i)=>c.mes===m?i:-1).filter(i=>i>=0);const vv=ii.map(i=>A.data['INGRESOS'][i]).filter(v=>v!==null);return vv.length?avg(vv):null;});
    const egrM  = AM.map(m=>{const ii=A.cortes.map((c,i)=>c.mes===m?i:-1).filter(i=>i>=0);const vv=ii.map(i=>A.data['EGRESOS'][i]).filter(v=>v!==null);return vv.length?avg(vv):null;});

    mk('chartConsIngEgr', { type:'bar', data:{
      labels: AM.map(capMes),
      datasets:[ ds_bar('Ingresos',ingM,'#4f8ef7'), ds_bar('Egresos',egrM,'#f87171') ]},
      options: barOpts('$') });

    const allM  = [...new Set([...VM,...AM])];
    const vt3   = allM.map(m=>V.acumuladoMes[m]?.['VENTAS TOTALES']||null);
    const cmp3  = allM.map(m=>{const ii=O.cortes.map((c,i)=>c.mes===m?i:-1).filter(i=>i>=0);if(!ii.length)return null;const vv=ii.map(i=>O.data['COMPRA'][i]).filter(v=>v!==null);return vv.length?vv[vv.length-1]:null;});
    const ing3  = allM.map(m=>{const ii=A.cortes.map((c,i)=>c.mes===m?i:-1).filter(i=>i>=0);if(!ii.length)return null;const vv=ii.map(i=>A.data['INGRESOS'][i]).filter(v=>v!==null);return vv.length?vv[vv.length-1]:null;});

    mk('chartConsTendencia', { type:'line', data:{
      labels: allM.map(capMes),
      datasets:[
        ds_line('Ventas',   vt3,  '#4f8ef7'),
        { ...ds_line('Compras',  cmp3, '#a78bfa'), borderDash:[5,3] },
        { ...ds_line('Ingresos', ing3, '#22c55e'), borderDash:[3,3] },
      ]}, options: lineOpts('$') });
  };

  /* ── Init ──────────────────────────────── */
  document.addEventListener('dashready', buildVentas);
})();
