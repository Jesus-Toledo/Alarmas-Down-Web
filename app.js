(function () {
  'use strict';

  var D = window.DATOS;
  var P = window.PLANTILLAS;

  var estado = { tipo: 'down', filtro: 'todos', busqueda: '', sel: { down: 0, nr: 0 }, puerto: 0 };

  var FONT = "'Segoe UI', Arial, sans-serif";
  var MONO = "Consolas, 'Courier New', monospace";
  var AZUL = '#267D8F';
  var AMBAR = '#F9B641';

  /* ---------- utilidades ---------- */
  function $(s) { return document.querySelector(s); }
  function add(a, b) { return a + b; }
  function sum(arr) { return arr.reduce(add, 0); }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function argmax(arr) { return arr.indexOf(Math.max.apply(null, arr)); }

  /* ---------- datos derivados (solo para el ejemplo) ---------- */
  var BASE = [7480, 7016, 7222, 8402, 7738, 10366, 8515, 8000, 8100, 8300, 8300, 7500, 7400, 7300, 7200, 8000, 8900, 10400, 9000, 9900, 9800, 10800, 11000, 13500];

  function derivar(eq, rep) {
    var rnd = mulberry(hash(eq.nombre));
    var d = BASE.map(function (v) { return v * (0.85 + rnd() * 0.3); });
    var s = sum(d);
    var diario = d.map(function (v) { return Math.round(v * eq.total / s); });
    diario[argmax(diario)] += eq.total - sum(diario);

    var hw = [];
    for (var h = 0; h < 24; h++) hw.push(0.5 + rnd() + (h < 4 ? 0.6 : 0));
    var shw = sum(hw);
    var matriz = hw.map(function (w) {
      return diario.map(function (dia) { return Math.round(dia * w / shw); });
    });

    var g = sum(rep.semanasGlobal.map(function (x) { return x[1]; }));
    var semanas = rep.semanasGlobal.map(function (x) {
      return { label: x[0], valor: Math.round(x[1] * eq.total / g) };
    });
    eq._d = { diario: diario, matriz: matriz, semanas: semanas };
  }

  ['down', 'nr'].forEach(function (t) {
    D[t].equipos.forEach(function (eq) { derivar(eq, D[t]); });
  });

  /* ---------- tickets ---------- */
  function badge(eq) {
    if (!eq.ticket) return { cls: 'rojo', txt: 'Sin ticket' };
    var cls = eq.ticket.estado === 'Asignado' ? 'morado' : 'verde';
    var txt = eq.ticket.id ? '#' + eq.ticket.id + ' · ' + eq.ticket.estado : 'Con ticket';
    return { cls: cls, txt: txt };
  }

  /* ---------- fragmentos SVG ---------- */
  function niceTop(max) {
    var raw = max / 4;
    var p = Math.pow(10, Math.floor(Math.log10(raw)));
    var ms = [1, 1.5, 2, 2.5, 3, 4, 5, 10];
    for (var i = 0; i < ms.length; i++) {
      if (ms[i] * p * 4 >= max) return ms[i] * p * 4;
    }
    return 10 * p * 4;
  }
  function fmtEje(v) {
    if (v >= 1000) return (Math.round(v / 100) / 10).toString().replace(/\.0$/, '') + ' mil';
    return String(Math.round(v));
  }

  function lineChart(serie, x, y, w, h) {
    var top = niceTop(Math.max.apply(null, serie));
    var padL = 56, padB = 22;
    var pw = w - padL, ph = h - padB, n = serie.length;
    var out = '';
    for (var i = 0; i <= 4; i++) {
      var yy = y + ph - ph * i / 4;
      out += '<line x1="' + (x + padL) + '" y1="' + yy + '" x2="' + (x + w) + '" y2="' + yy + '" stroke="' + (i === 0 ? '#C9D2DC' : '#EEF1F5') + '"/>';
      out += '<text x="' + (x + padL - 8) + '" y="' + (yy + 4) + '" font-size="11" fill="#5B6773" text-anchor="end" font-family="' + FONT + '">' + fmtEje(top * i / 4) + '</text>';
    }
    var pts = serie.map(function (v, k) {
      var px = x + padL + (k + 0.5) * pw / n;
      var py = y + ph - (v / top) * ph;
      return px.toFixed(1) + ',' + py.toFixed(1);
    });
    var x0 = pts[0].split(',')[0], x1 = pts[n - 1].split(',')[0], base = y + ph;
    out += '<polygon points="' + x0 + ',' + base + ' ' + pts.join(' ') + ' ' + x1 + ',' + base + '" fill="' + AZUL + '" fill-opacity="0.14"/>';
    out += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + AZUL + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
    [1, 5, 10, 15, 20, 24].forEach(function (d) {
      if (d > n) return;
      var px = x + padL + (d - 0.5) * pw / n;
      out += '<text x="' + px.toFixed(1) + '" y="' + (y + ph + 16) + '" font-size="11" fill="#5B6773" text-anchor="middle" font-family="' + FONT + '">' + d + '</text>';
    });
    return out;
  }

  /* Ventana de la tabla fecha x hora que se copia en la imagen (6 fechas x 5 horas) */
  var N_COLS = 6, N_ROWS = 5, PASO_X = 68, PASO_Y = 30;
  function heatVentana(matriz, x, y, c0, r0) {
    var max = 1;
    matriz.forEach(function (r) { r.forEach(function (v) { if (v > max) max = v; }); });
    var LW = 44, CW = 64, CH = 26, GAP = 4, out = '';
    out += txt(x + LW - 8, y + 16, 'Hora', 11, '#5B6773', null, 'end');
    for (var c = 0; c < N_COLS; c++) {
      out += txt(x + LW + c * (CW + GAP) + CW / 2, y + 16, 'Día ' + (c0 + c + 1), 11, '#5B6773', null, 'middle');
    }
    for (var r = 0; r < N_ROWS; r++) {
      var ry = y + 26 + r * (CH + GAP);
      out += txt(x + LW - 8, ry + 17, String(r0 + r + 1), 11, '#5B6773', null, 'end');
      for (var k = 0; k < N_COLS; k++) {
        var v = matriz[r0 + r][c0 + k];
        var cx = x + LW + k * (CW + GAP);
        if (v > 0) {
          var a = 0.1 + 0.8 * Math.pow(v / max, 0.8);
          out += '<rect x="' + cx + '" y="' + ry + '" width="' + CW + '" height="' + CH + '" rx="2" fill="' + AZUL + '" fill-opacity="' + a.toFixed(2) + '"/>';
          out += txt(cx + CW / 2, ry + 17, String(v), 12, a > 0.5 ? '#FFFFFF' : '#14202B', 600, 'middle');
        } else {
          out += '<rect x="' + cx + '" y="' + ry + '" width="' + CW + '" height="' + CH + '" rx="2" fill="#F4F6F9"/>';
        }
      }
    }
    return { svg: out, h: 26 + N_ROWS * (CH + GAP) };
  }

  /* Tabla con números por fecha y hora, con barras de desplazamiento */
  function heatTabla(matriz, chico) {
    var max = 1;
    matriz.forEach(function (r) { r.forEach(function (v) { if (v > max) max = v; }); });
    var cols = matriz[0].length;
    var h = '<div class="heat-scroll' + (chico ? ' chico' : '') + '"><div class="heat-grid" role="table" aria-label="Caídas por fecha y hora">';
    h += '<div class="heat-corner">Hora</div>';
    for (var d = 1; d <= cols; d++) h += '<div class="heat-h">Día ' + d + '</div>';
    matriz.forEach(function (fila, i) {
      h += '<div class="heat-hora">' + (i + 1) + '</div>';
      fila.forEach(function (v) {
        var a = 0.1 + 0.8 * Math.pow(v / max, 0.8);
        var st = v > 0
          ? 'background:rgba(38,125,143,' + a.toFixed(2) + ');color:' + (a > 0.5 ? '#FFFFFF' : '#14202B')
          : 'background:#F4F6F9;color:#5B6773';
        h += '<div class="heat-c" style="' + st + '">' + (v > 0 ? v : '') + '</div>';
      });
    });
    return h + '</div></div>';
  }

  function txt(x, y, s, size, fill, weight, anchor, family) {
    return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" fill="' + fill + '"' +
      (weight ? ' font-weight="' + weight + '"' : '') +
      (anchor ? ' text-anchor="' + anchor + '"' : '') +
      ' font-family="' + (family || FONT) + '">' + esc(s) + '</text>';
  }

  /* ---------- imagen para el ticket (un solo SVG) ---------- */
  // opts.copia = true: incluye la fila inferior (tabla fecha x hora en la ventana c0, r0 + barras por semana) y el borde.
  // Sin opts: solo la parte de arriba; la fila inferior se arma en pantalla, con la tabla desplazable.
  function evidenciaSVG(tipo, eq, puerto, opts) {
    var W = 1000, y = 24, o = '';
    var d = eq._d;
    var copia = !!(opts && opts.copia);

    // Encabezado
    o += '<rect x="24" y="' + y + '" width="548" height="68" rx="4" fill="#F4F6F9"/>';
    o += txt(40, y + 22, 'Elemento de red', 12, '#5B6773');
    o += txt(40, y + 50, eq.nombre, 17, '#14202B', 700, null, MONO);
    o += '<rect x="584" y="' + y + '" width="180" height="68" rx="4" fill="#F4F6F9"/>';
    o += txt(600, y + 22, 'IP', 12, '#5B6773');
    o += txt(600, y + 50, eq.ip, 17, '#14202B', 700, null, MONO);
    o += '<rect x="776" y="' + y + '" width="200" height="68" rx="4" fill="#E3F1F4"/>';
    o += txt(792, y + 22, 'Caídas totales', 12, '#5B6773');
    o += txt(792, y + 54, fmt(eq.total), 28, AZUL, 700);
    y += 68 + 14;

    // Puerto específico (solo down) con sus caídas por día a la derecha
    if (tipo === 'down' && puerto) {
      o += '<rect x="24" y="' + y + '" width="952" height="46" rx="4" fill="#FDF3E3"/>';
      o += txt(40, y + 28, 'Puerto específico', 12, '#8A5A00', 700);
      o += txt(150, y + 28, puerto.nombre, 12, '#14202B', 700, null, MONO);
      var dias = Object.keys(puerto.dias).map(Number).sort(function (a, b) { return a - b; }).slice(-4);
      var cw = 86, gp = 6, tot = dias.length * cw + (dias.length - 1) * gp, sx = 964 - tot;
      dias.forEach(function (dia, i) {
        var v = puerto.dias[dia], a = Math.min(0.9, 0.15 + v * 0.1), cx = sx + i * (cw + gp);
        var col = a > 0.5 ? '#FFFFFF' : '#14202B';
        o += '<rect x="' + cx + '" y="' + (y + 8) + '" width="' + cw + '" height="30" rx="3" fill="' + AZUL + '" fill-opacity="' + a.toFixed(2) + '"/>';
        o += txt(cx + 10, y + 27, 'Día ' + dia, 11, col);
        o += txt(cx + cw - 10, y + 28, String(v), 14, col, 700, 'end');
      });
      y += 46 + 14;
    }

    // Resumen
    var diaPico = argmax(d.diario) + 1;
    var semPico = d.semanas[argmax(d.semanas.map(function (s) { return s.valor; }))].label.replace('Sem ', 'semana ');
    o += '<text x="24" y="' + (y + 14) + '" font-size="13" fill="#5B6773" font-family="' + FONT + '">Periodo: ' +
      '<tspan font-weight="700" fill="#14202B">' + esc(D.mes) + ', días 1 al ' + D.diasConDatos + '</tspan>' +
      '<tspan dx="28">Día con más caídas: </tspan><tspan font-weight="700" fill="#14202B">día ' + diaPico + '</tspan>' +
      '<tspan dx="28">Semana con más caídas: </tspan><tspan font-weight="700" fill="#14202B">' + esc(semPico) + '</tspan></text>';
    y += 14 + 26;

    // Gráfica de líneas a todo el ancho
    o += txt(24, y + 14, 'Caídas por día', 14, '#14202B', 700);
    o += lineChart(d.diario, 24, y + 28, 952, 220);
    y += 28 + 220 + 28;

    if (copia) {
      var c0 = Math.max(0, Math.min(opts.c0, d.matriz[0].length - N_COLS));
      var r0 = Math.max(0, Math.min(opts.r0, d.matriz.length - N_ROWS));
      // Izquierda: tabla fecha x hora (ventana visible)
      o += txt(24, y + 14, 'Cuándo caen · fecha × hora', 14, '#14202B', 700);
      o += txt(476, y + 14, 'Días ' + (c0 + 1) + ' al ' + (c0 + N_COLS) + ' · horas ' + (r0 + 1) + ' a ' + (r0 + N_ROWS), 11, '#5B6773', null, 'end');
      var hv = heatVentana(d.matriz, 24, y + 26, c0, r0);
      o += hv.svg;
      // Derecha: caídas por semana
      o += txt(520, y + 14, 'Caídas por semana', 14, '#14202B', 700);
      var smax = Math.max.apply(null, d.semanas.map(function (s) { return s.valor; }));
      d.semanas.forEach(function (s, i) {
        var ry = y + 34 + i * 40;
        o += txt(520, ry + 15, s.label, 12, '#5B6773');
        o += '<rect x="574" y="' + ry + '" width="316" height="20" rx="2" fill="#EEF1F5"/>';
        o += '<rect x="574" y="' + ry + '" width="' + Math.max(2, 316 * s.valor / smax).toFixed(1) + '" height="20" rx="2" fill="' + (s.valor === smax ? AMBAR : '#92C4CE') + '"/>';
        o += txt(976, ry + 15, fmt(s.valor), 12, '#14202B', 700, 'end');
      });
      y += 26 + hv.h + 24;
    } else {
      y -= 12;
    }

    var H = y;
    var borde = copia
      ? '<rect x="0.5" y="0.5" width="' + (W - 1) + '" height="' + (H - 1) + '" rx="6" fill="none" stroke="#C9D2DC"/>'
      : '';
    return {
      w: W, h: H,
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
        '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#FFFFFF"/>' + borde + o + '</svg>'
    };
  }

  /* ---------- render ---------- */
  function rep() { return D[estado.tipo]; }
  function eqSel() { return rep().equipos[estado.sel[estado.tipo]]; }

  function renderEncabezado() {
    var r = rep();
    $('#titulo').textContent = r.titulo;
    $('#subtitulo').textContent = 'Primera versión con datos de ejemplo · nombres, IP y totales tomados de tus reportes';
    $('#fuente').textContent = r.fuente;
    $('#mes').textContent = D.mes;
    $('#tab-down').className = estado.tipo === 'down' ? 'activo' : '';
    $('#tab-nr').className = estado.tipo === 'nr' ? 'activo' : '';
    $('#tab-down').setAttribute('aria-selected', estado.tipo === 'down');
    $('#tab-nr').setAttribute('aria-selected', estado.tipo === 'nr');
  }

  function renderKpis() {
    var r = rep();
    var con = r.equipos.filter(function (e) { return e.ticket; }).length;
    var sin = r.equipos.length - con;
    $('#kpis').innerHTML =
      kpi('Equipos con caídas', r.equipos.length, '', '') +
      kpi('Con ticket', con, 'verde', '') +
      kpi('Sin ticket (por atender)', sin, 'naranja', 'alerta') +
      kpi('Tickets creados', r.ticketsCreados, '', '');
  }
  function kpi(label, valor, color, extra) {
    return '<div class="kpi ' + extra + '"><span class="kpi-label">' + label + '</span><span class="kpi-valor ' + color + '">' + valor + '</span></div>';
  }

  function renderLista() {
    var r = rep();
    var max = r.equipos[0].total;
    var q = estado.busqueda.trim().toLowerCase();
    var html = '', n = 0;
    r.equipos.forEach(function (eq, i) {
      if (estado.filtro === 'sin' && eq.ticket) return;
      if (estado.filtro === 'con' && !eq.ticket) return;
      if (q && eq.nombre.toLowerCase().indexOf(q) < 0 && eq.ip.toLowerCase().indexOf(q) < 0) return;
      n++;
      var b = badge(eq);
      html += '<button type="button" class="fila' + (i === estado.sel[estado.tipo] ? ' sel' : '') + '" data-i="' + i + '">' +
        '<div class="fila-top"><div class="fila-nombre"><span class="nombre">' + esc(eq.nombre) + '</span><span class="ip">' + esc(eq.ip) + '</span></div>' +
        '<div class="fila-der"><span class="total">' + fmt(eq.total) + '</span><span class="badge ' + b.cls + '">' + esc(b.txt) + '</span></div></div>' +
        '<div class="barra"><span style="width:' + Math.round(eq.total / max * 100) + '%"></span></div></button>';
    });
    $('#lista').innerHTML = html || '<div class="vacio">No hay equipos con ese filtro.</div>';
    $('#nota-lista').textContent = 'Mostrando ' + n + ' de ' + r.equipos.length + ' equipos del ejemplo';
  }

  function renderDetalle() {
    var r = rep(), eq = eqSel(), d = eq._d, b = badge(eq);
    var smax = Math.max.apply(null, d.semanas.map(function (s) { return s.valor; }));

    var html = '<div class="det-head"><div><span class="pequeno">Equipo seleccionado</span><div class="det-nombre">' + esc(eq.nombre) + '</div>' +
      '<div class="det-info">' + esc(eq.ip) + ' · ' + fmt(eq.total) + ' caídas en el mes</div></div>' +
      '<span class="badge ' + b.cls + '">' + esc(b.txt) + '</span></div>';

    html += '<div class="det-grid"><div class="col-sem"><h3>Caídas por semana</h3>';
    d.semanas.forEach(function (s) {
      html += '<div class="sem-fila"><span class="sem-label">' + s.label + '</span><div class="sem-barra"><span style="width:' + Math.round(s.valor / smax * 100) + '%;background:' + (s.valor === smax ? '#F9B641' : '#267D8F') + '"></span></div><span class="sem-valor">' + fmt(s.valor) + '</span></div>';
    });
    html += '<span class="nota">Reparto de ejemplo</span></div>';

    html += '<div class="col-heat"><h3>Cuándo caen · fecha × hora</h3>' + heatTabla(d.matriz) +
      '<span class="nota">Desliza para ver más fechas y horas</span></div></div>';

    if (estado.tipo === 'down') {
      var pu = r.puertos;
      var dias = {};
      pu.forEach(function (p) { Object.keys(p.dias).forEach(function (k) { dias[k] = 1; }); });
      var lista = Object.keys(dias).map(Number).sort(function (a, b2) { return a - b2; });
      var cols = 'grid-template-columns:minmax(0,1fr) repeat(' + lista.length + ',48px) 56px';
      html += '<div class="seccion"><h3>Puertos que más caen · caídas por día</h3><div class="tabla-puertos"><div class="tp">';
      html += '<div class="tp-fila tp-head" style="' + cols + '"><span>Puerto</span>' + lista.map(function (k) { return '<span style="text-align:center">Día ' + k + '</span>'; }).join('') + '<span style="text-align:right">Total</span></div>';
      pu.forEach(function (p, i) {
        html += '<button type="button" class="tp-fila' + (i === estado.puerto ? ' sel' : '') + '" data-p="' + i + '" style="' + cols + '"><span class="tp-nombre">' + esc(p.nombre) + '</span>';
        lista.forEach(function (k) {
          var v = p.dias[k] || 0;
          var st = v > 0
            ? 'background:rgba(38,125,143,' + Math.min(0.9, 0.15 + v * 0.1).toFixed(2) + ');color:' + (v >= 5 ? '#FFFFFF' : '#14202B')
            : 'background:#F4F6F9;color:#5B6773';
          html += '<span class="tp-celda" style="' + st + '">' + (v > 0 ? v : '') + '</span>';
        });
        html += '<span class="tp-total">' + p.total + '</span></button>';
      });
      html += '</div></div><span class="nota">Puertos de ejemplo. Haz clic en uno para usarlo en el ticket y en el gráfico.</span></div>';
    } else {
      html += '<div class="seccion"><h3>Pérdida de comunicación por día</h3><svg viewBox="0 0 640 220" role="img" aria-label="Pérdida de comunicación por día" style="width:100%;height:auto">' + lineChart(d.diario, 0, 0, 640, 220) + '</svg></div>';
    }
    $('#detalle').innerHTML = html;
  }

  function renderTodo() {
    renderEncabezado();
    renderKpis();
    renderLista();
    renderDetalle();
  }

  /* ---------- modales ---------- */
  var abierto = null;

  function abrir(id) {
    var m = $(id);
    m.hidden = false;
    abierto = m;
    var b = m.querySelector('button');
    if (b) b.focus();
  }
  function cerrar() {
    if (abierto) { abierto.hidden = true; abierto = null; }
  }

  function puertoSel() { return estado.tipo === 'down' ? rep().puertos[estado.puerto] : null; }

  function abrirHomologar() {
    var eq = eqSel(), pl = P[estado.tipo], p = puertoSel();
    var pn = p ? p.nombre : '';
    $('#mh-t').textContent = pl.titulo(eq, pn);
    $('#mh-c').textContent = pl.cuerpo(eq, pn);
    abrir('#modal-homologar');
  }

  function abrirGrafico() {
    var eq = eqSel();
    var arriba = evidenciaSVG(estado.tipo, eq, puertoSel());
    var leyenda = '<span class="leyenda">Menos' +
      [0.1, 0.4, 0.75, 1].map(function (a) { return '<i style="background:rgba(38,125,143,' + a + ')"></i>'; }).join('') + 'Más</span>';
    var sems = eq._d.semanas;
    var smax = Math.max.apply(null, sems.map(function (s) { return s.valor; }));
    var semHtml = '<div class="evid-sem"><h3>Caídas por semana</h3>' + sems.map(function (s) {
      return '<div class="sem-fila"><span class="sem-label">' + s.label + '</span><div class="sem-barra"><span style="width:' +
        Math.round(s.valor / smax * 100) + '%;background:' + (s.valor === smax ? '#F9B641' : '#92C4CE') + '"></span></div><span class="sem-valor">' + fmt(s.valor) + '</span></div>';
    }).join('') + '</div>';
    $('#mg-imagen').innerHTML = '<div class="evid">' + arriba.svg +
      '<div class="evid-fila"><div class="evid-heat"><div class="evid-heat-top"><h3>Cuándo caen · fecha × hora</h3>' + leyenda + '</div>' +
      heatTabla(eq._d.matriz, true) +
      '<span class="nota">Se copia exactamente lo que ves aquí. Desplaza la tabla para elegir otras fechas y horas.</span></div>' + semHtml + '</div></div>';
    $('#mg-aviso').textContent = '';
    abrir('#modal-grafico');
    var box = document.querySelector('#mg-imagen .heat-scroll');
    if (box) { box.scrollLeft = box.scrollWidth; box.scrollTop = 0; }
  }

  /* ---------- portapapeles ---------- */
  function copiarTexto(texto) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(texto).catch(function () { return copiarViejo(texto); });
    }
    return copiarViejo(texto);
  }
  function copiarViejo(texto) {
    return new Promise(function (ok, fallo) {
      var t = document.createElement('textarea');
      t.value = texto;
      t.style.position = 'fixed';
      t.style.opacity = '0';
      document.body.appendChild(t);
      t.select();
      var res = false;
      try { res = document.execCommand('copy'); } catch (e) { res = false; }
      document.body.removeChild(t);
      res ? ok() : fallo(new Error('No se pudo copiar'));
    });
  }
  function destello(btn, texto) {
    var original = btn.textContent;
    btn.textContent = texto;
    setTimeout(function () { btn.textContent = original; }, 1500);
  }

  function copiarImagen() {
    var aviso = $('#mg-aviso');
    var box = document.querySelector('#mg-imagen .heat-scroll');
    var c0 = box ? Math.round(box.scrollLeft / PASO_X) : 0;
    var r0 = box ? Math.round(box.scrollTop / PASO_Y) : 0;
    var img = evidenciaSVG(estado.tipo, eqSel(), puertoSel(), { copia: true, c0: c0, r0: r0 });
    if (!(navigator.clipboard && window.ClipboardItem)) {
      aviso.textContent = 'Este navegador no permite copiar imágenes. Usa Chrome o Edge.';
      return;
    }
    var scale = 2;
    var blob = new Blob([img.svg], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var im = new Image();
    im.onload = function () {
      var c = document.createElement('canvas');
      c.width = img.w * scale;
      c.height = img.h * scale;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(function (png) {
        navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]).then(function () {
          destello($('#mg-copiar'), '¡Imagen copiada!');
          aviso.textContent = 'Lista para pegar en el ticket (Ctrl + V).';
        }).catch(function () {
          aviso.textContent = 'No se pudo copiar la imagen. Revisa los permisos del navegador.';
        });
      }, 'image/png');
    };
    im.onerror = function () { aviso.textContent = 'No se pudo generar la imagen.'; };
    im.src = url;
  }

  /* ---------- eventos ---------- */
  $('#tab-down').addEventListener('click', function () { estado.tipo = 'down'; estado.puerto = 0; renderTodo(); });
  $('#tab-nr').addEventListener('click', function () { estado.tipo = 'nr'; renderTodo(); });

  $('#filtros').addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-f]');
    if (!b) return;
    estado.filtro = b.getAttribute('data-f');
    var bs = $('#filtros').querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) bs[i].className = bs[i] === b ? 'activo' : '';
    renderLista();
  });

  $('#buscar').addEventListener('input', function (ev) {
    estado.busqueda = ev.target.value;
    renderLista();
  });

  $('#lista').addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-i]');
    if (!b) return;
    estado.sel[estado.tipo] = Number(b.getAttribute('data-i'));
    estado.puerto = 0;
    renderLista();
    renderDetalle();
  });

  $('#detalle').addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-p]');
    if (!b) return;
    estado.puerto = Number(b.getAttribute('data-p'));
    renderDetalle();
  });

  $('#btn-homologar').addEventListener('click', abrirHomologar);
  $('#btn-grafico').addEventListener('click', abrirGrafico);
  $('#mg-copiar').addEventListener('click', copiarImagen);

  document.addEventListener('click', function (ev) {
    var c = ev.target.closest('[data-copiar]');
    if (c) {
      var texto = $('#' + c.getAttribute('data-copiar')).textContent;
      copiarTexto(texto).then(function () { destello(c, '¡Copiado!'); }).catch(function () { destello(c, 'No se pudo'); });
      return;
    }
    if (ev.target.closest('[data-cerrar]')) { cerrar(); return; }
    if (ev.target.classList && ev.target.classList.contains('scrim')) cerrar();
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') cerrar();
  });

  renderTodo();
})();
