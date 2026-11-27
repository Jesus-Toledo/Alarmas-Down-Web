(function () {
  'use strict';

  var SAMPLE = window.DATOS;       // datos de ejemplo (data.js), solo si no hay servidor
  var P = window.PLANTILLAS;

  var TITULOS = {
    down: 'Repetitividad de caída de puertos',
    nr: 'Repetitividad de pérdida de comunicación'
  };
  var MAX_LISTA = 200;
  var N_COLS = 6, N_ROWS = 5, PASO_X = 68, PASO_Y = 30;

  var FONT = "'Segoe UI', Arial, sans-serif";
  var MONO = "Consolas, 'Courier New', monospace";
  var AZUL = '#267D8F';
  var AMBAR = '#F9B641';

  var modelo = null;   // { modo: 'excel' | 'ejemplo', archivo, leido, tickets, tipos: { down, nr } }
  var estado = { tipo: 'down', filtro: 'todos', busqueda: '', mes: { down: 0, nr: 0 }, sel: { down: null, nr: null }, puerto: 0, manual: {} };
  var tokenDetalle = 0;

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
  function lbl(d) { return typeof d === 'string' ? d : 'Día ' + d; }
  function rangoDias(dias) {
    if (!dias.length) return '';
    if (typeof dias[0] === 'string') return dias.length === 1 ? dias[0] : 'del ' + dias[0] + ' al ' + dias[dias.length - 1];
    return dias.length === 1 ? 'día ' + dias[0] : 'días ' + dias[0] + ' al ' + dias[dias.length - 1];
  }

  /* ---------- datos de ejemplo (solo cuando no hay servidor) ---------- */
  var BASE = [7480, 7016, 7222, 8402, 7738, 10366, 8515, 8000, 8100, 8300, 8300, 7500, 7400, 7300, 7200, 8000, 8900, 10400, 9000, 9900, 9800, 10800, 11000, 13500];

  function detalleEjemplo(eq, rep, tipo) {
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
    var dias = []; for (var i = 1; i <= 24; i++) dias.push(i);
    return { dias: dias, diario: diario, matriz: matriz, semanas: semanas, puertos: tipo === 'down' ? rep.puertos : [] };
  }

  function modeloEjemplo() {
    var m = { modo: 'ejemplo', archivo: 'Datos de ejemplo', leido: '', tickets: true, tipos: {} };
    var dias = []; for (var i = 1; i <= 24; i++) dias.push(i);
    ['down', 'nr'].forEach(function (t) {
      var rep = SAMPLE[t];
      var equipos = rep.equipos.map(function (e) {
        var eq = { id: e.nombre + '|' + e.ip, nombre: e.nombre, ip: e.ip, total: e.total, ticket: e.ticket };
        eq._d = detalleEjemplo(eq, rep, t);
        return eq;
      });
      m.tipos[t] = {
        ticketsCreados: rep.ticketsCreados,
        meses: [{ clave: '2026-11', etiqueta: SAMPLE.mes, dias: dias, equipos: equipos }]
      };
    });
    return m;
  }

  function modeloExcel(j) {
    var m = { modo: 'excel', archivo: j.archivo, leido: j.leido, tickets: !!(j.tickets && !j.tickets.error), infoTickets: j.tickets || null, tipos: {} };
    ['down', 'nr'].forEach(function (t) {
      var info = j.datos[t] || { meses: [] };
      m.tipos[t] = {
        error: info.error,
        ticketsCreados: null,
        meses: (info.meses || []).map(function (mes) {
          
          return mes;
        })
      };
    });
    return m;
  }

  function avisar(msg) {
    var a = $('#aviso-datos');
    if (!a) return;
    a.textContent = msg || '';
    a.hidden = !msg;
  }

  function cargar(forzar) {
    if (location.protocol === 'file:') {
      modelo = modeloEjemplo();
      avisar('Estás viendo datos de ejemplo porque abriste el archivo directamente. Para leer tu Excel abre iniciar.bat.');
      return Promise.resolve();
    }
    return fetch('/api/resumen' + (forzar ? '?forzar=1' : ''), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.error) throw new Error(j.error);
        modelo = modeloExcel(j);
        avisar(j.depuracion || '');
      })
      .catch(function (err) {
        modelo = modeloEjemplo();
        avisar((err && err.message ? err.message + ' ' : '') + 'Mientras tanto se muestran datos de ejemplo.');
      });
  }

  function asegurarSeleccion() {
    ['down', 'nr'].forEach(function (t) {
      var info = modelo.tipos[t];
      var i = estado.mes[t];
      if (i >= info.meses.length) i = estado.mes[t] = Math.max(0, info.meses.length - 1);
      var mes = info.meses[i];
      if (!mes || !mes.equipos.length) { estado.sel[t] = null; return; }
      var ok = mes.equipos.some(function (e) { return e.id === estado.sel[t]; });
      if (!ok) estado.sel[t] = mes.equipos[0].id;
    });
  }

  /* ---------- acceso al modelo ---------- */
  function info() { return modelo.tipos[estado.tipo]; }
  function mesActual() { return info().meses[estado.mes[estado.tipo]] || null; }
  function eqSel() {
    var mes = mesActual();
    if (!mes) return null;
    for (var i = 0; i < mes.equipos.length; i++) if (mes.equipos[i].id === estado.sel[estado.tipo]) return mes.equipos[i];
    return null;
  }
  function obtenerDetalle(eq) {
    if (eq._d) return Promise.resolve(eq._d);
    var url = '/api/equipo?tipo=' + estado.tipo + '&mes=' + encodeURIComponent(mesActual().clave) + '&id=' + encodeURIComponent(eq.id);
    return fetch(url, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.error) throw new Error(j.error);
      eq._d = j;
      return j;
    });
  }
  /* Puertos que van al ticket y a la imagen.
     Por defecto: los que caen de forma recurrente (al menos 3 caídas y 10 % o más de las del puerto que más cae; máximo 4).
     El usuario puede marcar o desmarcar puertos en la tabla. */
  function claveSel(eq) { return estado.tipo + '|' + mesActual().clave + '|' + eq.id; }
  function autoPuertos(pu) {
    if (!pu.length) return [];
    var top = pu[0].total, out = [0];
    for (var i = 1; i < pu.length && out.length < 4; i++) {
      if (pu[i].total >= 3 && pu[i].total >= top * 0.1) out.push(i);
    }
    return out;
  }
  function idxPuertos(eq) {
    if (estado.tipo !== 'down' || !eq || !eq._d) return [];
    var m = estado.manual[claveSel(eq)];
    return m ? m.filter(function (i) { return i < eq._d.puertos.length; }) : autoPuertos(eq._d.puertos);
  }
  function puertosSel(eq) {
    return idxPuertos(eq).sort(function (a, b) { return a - b; }).map(function (i) { return eq._d.puertos[i]; });
  }

  /* ---------- tickets ---------- */
  function badge(eq) {
    if (!modelo.tickets) return null;
    if (!eq.ticket) return { cls: 'rojo', txt: 'Sin ticket', previo: eq.previo || null };
    var cls = eq.ticket.estado === 'Asignado' ? 'morado' : 'verde';
    var txt = eq.ticket.id ? '#' + eq.ticket.id + ' · ' + eq.ticket.estado : 'Con ticket';
    if (eq.ticket.n > 1) txt += ' (+' + (eq.ticket.n - 1) + ')';
    return { cls: cls, txt: txt };
  }

  /* ---------- fragmentos SVG ---------- */
  function niceTop(max) {
    if (max <= 0) return 4;
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
    return (Math.round(v * 10) / 10).toString();
  }

  function lineChart(serie, dias, x, y, w, h) {
    var top = niceTop(Math.max.apply(null, serie));
    y = y + 18; h = h - 18; // espacio arriba para el número del día pico
    var padL = 56, padB = 22;
    var pw = w - padL, ph = h - padB, n = serie.length;
    var out = '';
    for (var i = 0; i <= 4; i++) {
      var yy = y + ph - ph * i / 4;
      out += '<line x1="' + (x + padL) + '" y1="' + yy + '" x2="' + (x + w) + '" y2="' + yy + '" stroke="' + (i === 0 ? '#C9D2DC' : '#EEF1F5') + '"/>';
      out += '<text x="' + (x + padL - 8) + '" y="' + (yy + 4) + '" font-size="11" fill="#5B6773" text-anchor="end" font-family="' + FONT + '">' + fmtEje(top * i / 4) + '</text>';
    }
    var coords = serie.map(function (v, k) {
      return [x + padL + (k + 0.5) * pw / n, y + ph - (v / top) * ph];
    });
    var pts = coords.map(function (c) { return c[0].toFixed(1) + ',' + c[1].toFixed(1); });
    var base = y + ph;
    if (n > 1) {
      out += '<polygon points="' + coords[0][0].toFixed(1) + ',' + base + ' ' + pts.join(' ') + ' ' + coords[n - 1][0].toFixed(1) + ',' + base + '" fill="' + AZUL + '" fill-opacity="0.14"/>';
      out += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + AZUL + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
    }
    var pico = Math.max.apply(null, serie) > 0 ? argmax(serie) : -1;
    coords.forEach(function (c, k) {
      if (k === pico) return;
      if (n <= 15) {
        out += '<circle cx="' + c[0].toFixed(1) + '" cy="' + c[1].toFixed(1) + '" r="3.5" fill="' + AZUL + '" stroke="#FFFFFF" stroke-width="1.5"/>';
      }
    });
    if (pico >= 0) {
      var pc = coords[pico];
      var arriba = true;
      var ty = arriba ? pc[1] - 12 : pc[1] + 4;
      var tx = arriba ? pc[0] : pc[0] + 11;
      out += '<circle cx="' + pc[0].toFixed(1) + '" cy="' + pc[1].toFixed(1) + '" r="6" fill="' + AMBAR + '" stroke="#FFFFFF" stroke-width="2"/>';
      out += txt(tx.toFixed(1), ty.toFixed(1), fmt(serie[pico]), 12, '#8A5A00', 700, arriba ? 'middle' : 'start');
    }
    var paso = Math.max(1, Math.ceil(n / 8));
    coords.forEach(function (c, k) {
      if (k % paso === 0 || k === n - 1) {
        out += '<text x="' + c[0].toFixed(1) + '" y="' + (y + ph + 16) + '" font-size="11" fill="#5B6773" text-anchor="middle" font-family="' + FONT + '">' + dias[k] + '</text>';
      }
    });
    return out;
  }

  function txt(x, y, s, size, fill, weight, anchor, family) {
    return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" fill="' + fill + '"' +
      (weight ? ' font-weight="' + weight + '"' : '') +
      (anchor ? ' text-anchor="' + anchor + '"' : '') +
      ' font-family="' + (family || FONT) + '">' + esc(s) + '</text>';
  }

  function maxMatriz(matriz) {
    var max = 1;
    matriz.forEach(function (r) { r.forEach(function (v) { if (v > max) max = v; }); });
    return max;
  }

  /* Ventana de la tabla fecha x hora que se copia en la imagen (6 fechas x 5 horas) */
  function heatVentana(matriz, dias, x, y, c0, r0) {
    var max = maxMatriz(matriz);
    var LW = 44, CW = 64, CH = 26, GAP = 4, out = '';
    var nv = Math.min(N_COLS, dias.length);
    out += txt(x + LW - 8, y + 16, 'Hora', 11, '#5B6773', null, 'end');
    for (var c = 0; c < nv; c++) {
      out += txt(x + LW + c * (CW + GAP) + CW / 2, y + 16, lbl(dias[c0 + c]), 11, '#5B6773', null, 'middle');
    }
    for (var r = 0; r < N_ROWS; r++) {
      var ry = y + 26 + r * (CH + GAP);
      out += txt(x + LW - 8, ry + 17, String(r0 + r), 11, '#5B6773', null, 'end');
      for (var k = 0; k < nv; k++) {
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
  function heatTabla(matriz, dias, chico) {
    var max = maxMatriz(matriz);
    var h = '<div class="heat-scroll' + (chico ? ' chico' : '') + '"><div class="heat-grid" role="table" aria-label="Caídas por fecha y hora" style="grid-template-columns:44px repeat(' + dias.length + ',' + (chico ? 64 : 52) + 'px)">';
    h += '<div class="heat-corner">Hora</div>';
    dias.forEach(function (d) { h += '<div class="heat-h">' + esc(lbl(d)) + '</div>'; });
    matriz.forEach(function (fila, i) {
      h += '<div class="heat-hora">' + i + '</div>';
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

  /* ---------- imagen para el ticket (un solo SVG) ---------- */
  // opts.copia = true: incluye la fila inferior (tabla fecha x hora en la ventana c0, r0 + barras por semana) y el borde.
  // Sin opts: solo la parte de arriba; la fila inferior se arma en pantalla, con la tabla desplazable.
  function evidenciaSVG(tipo, eq, puerto, opts) {
    var W = 1000, y = 24, o = '';
    var d = eq._d, mes = mesActual();
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

    // Puertos específicos (solo down): uno por renglón, con sus caídas a la derecha
    if (tipo === 'down' && puerto && puerto.length) {
      var MAXP = 6, mostrar = puerto.slice(0, MAXP), extra = puerto.length - mostrar.length;
      var hb = 18 + mostrar.length * 26 + (extra > 0 ? 22 : 0);
      o += '<rect x="24" y="' + y + '" width="952" height="' + hb + '" rx="4" fill="#FDF3E3"/>';
      o += txt(40, y + 28, puerto.length > 1 ? 'Puertos específicos' : 'Puerto específico', 12, '#8A5A00', 700);
      mostrar.forEach(function (p, i) {
        var py = y + 28 + i * 26;
        o += txt(190, py, p.nombre, 12, '#14202B', 700, null, MONO);
        o += txt(960, py, fmt(p.total) + (p.total === 1 ? ' caída' : ' caídas'), 12, '#8A5A00', 600, 'end');
      });
      if (extra > 0) o += txt(190, y + 28 + mostrar.length * 26, '+ ' + extra + ' puerto' + (extra > 1 ? 's' : '') + ' más', 12, '#5B6773');
      y += hb + 14;
    }

    var semVals = d.semanas.map(function (s) { return s.valor; });

    // Gráfica de líneas a todo el ancho
    o += txt(24, y + 14, 'Caídas por día', 14, '#14202B', 700);
    o += lineChart(d.diario, d.dias, 24, y + 28, 952, 220);
    y += 28 + 220 + 28;

    if (copia) {
      var c0 = Math.max(0, Math.min(opts.c0, d.dias.length - N_COLS));
      var r0 = Math.max(0, Math.min(opts.r0, 24 - N_ROWS));
      var nv = Math.min(N_COLS, d.dias.length);
      // Izquierda: tabla fecha x hora (ventana visible)
      o += txt(24, y + 14, 'Cuándo caen · fecha × hora', 14, '#14202B', 700);
      o += txt(476, y + 14, 'Fechas ' + d.dias[c0] + ' al ' + d.dias[c0 + nv - 1] + ' · horas ' + r0 + ' a ' + (r0 + N_ROWS - 1), 11, '#5B6773', null, 'end');
      var hv = heatVentana(d.matriz, d.dias, 24, y + 26, c0, r0);
      o += hv.svg;
      // Derecha: caídas por semana
      o += txt(520, y + 14, 'Caídas por semana', 14, '#14202B', 700);
      var smax = Math.max.apply(null, semVals.concat([1]));
      d.semanas.forEach(function (s, i) {
        var ry = y + 34 + i * 40;
        o += txt(520, ry + 15, s.label, 12, '#5B6773');
        o += '<rect x="574" y="' + ry + '" width="316" height="20" rx="2" fill="#EEF1F5"/>';
        o += '<rect x="574" y="' + ry + '" width="' + Math.max(2, 316 * s.valor / smax).toFixed(1) + '" height="20" rx="2" fill="' + (s.valor === smax ? AMBAR : '#92C4CE') + '"/>';
        o += txt(976, ry + 15, fmt(s.valor), 12, '#14202B', 700, 'end');
      });
      y += Math.max(26 + hv.h, 34 + d.semanas.length * 40) + 24;
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
  function renderEncabezado() {
    $('#titulo').textContent = TITULOS[estado.tipo];
    if (modelo.modo === 'excel') {
      $('#subtitulo').textContent = 'Datos de ' + modelo.archivo + (modelo.leido ? ' · leído el ' + modelo.leido : '');
      $('#fuente').textContent = modelo.archivo;
    } else {
      $('#subtitulo').textContent = 'Datos de ejemplo · nombres, IP y totales tomados de tus reportes de Power BI';
      $('#fuente').textContent = 'Datos de ejemplo';
    }
    var meses = info().meses;
    var cont = $('#mes');
    if (meses.length > 1) {
      cont.innerHTML = '<select id="sel-mes" aria-label="Mes">' + meses.map(function (m, i) {
        return '<option value="' + i + '"' + (i === estado.mes[estado.tipo] ? ' selected' : '') + '>' + esc(m.etiqueta) + '</option>';
      }).join('') + '</select>';
    } else {
      cont.textContent = meses.length ? meses[0].etiqueta : '—';
    }
    $('#tab-down').className = estado.tipo === 'down' ? 'activo' : '';
    $('#tab-nr').className = estado.tipo === 'nr' ? 'activo' : '';
    $('#tab-down').setAttribute('aria-selected', estado.tipo === 'down');
    $('#tab-nr').setAttribute('aria-selected', estado.tipo === 'nr');
    $('#filtros').hidden = !modelo.tickets;
  }

  function kpi(label, valor, color, extra, sub) {
    return '<div class="kpi ' + extra + '"><span class="kpi-label">' + label + '</span><span class="kpi-valor ' + color + '">' + valor + '</span>' +
      (sub ? '<span class="kpi-sub">' + sub + '</span>' : '') + '</div>';
  }

  function renderKpis() {
    var mes = mesActual();
    var n = mes ? mes.equipos.length : 0;
    var alarmas = mes ? mes.total || sum(mes.equipos.map(function (e) { return e.total; })) : 0;
    if (modelo.tickets) {
      var con = mes.equipos.filter(function (e) { return e.ticket; }).length;
      var it = modelo.infoTickets;
      $('#kpis').innerHTML =
        kpi('Equipos con caídas', fmt(n), '', '', '') +
        kpi('Alarmas en el periodo', fmt(alarmas), '', '', mes ? esc(rangoDias(mes.dias)) : '') +
        kpi('Con ticket', fmt(con), 'verde', '', 'Abierto, asignado o en proceso') +
        kpi('Sin ticket (por atender)', fmt(n - con), 'naranja', 'alerta', it ? 'Tickets leídos: ' + fmt(it.total) : '');
    } else {
      $('#kpis').innerHTML =
        kpi('Equipos con caídas', fmt(n), '', '', '') +
        kpi('Alarmas en el periodo', fmt(alarmas), 'verde', '', mes ? esc(rangoDias(mes.dias)) : '') +
        kpi('Con ticket', '—', '', '', 'Falta puertos_down.csv en la carpeta datos') +
        kpi('Sin ticket', '—', '', '', '');
    }
  }

  function renderLista() {
    var mes = mesActual();
    if (!mes) { $('#lista').innerHTML = '<div class="vacio">No hay datos para este reporte.</div>'; $('#nota-lista').textContent = ''; return; }
    var max = mes.equipos.length ? mes.equipos[0].total : 1;
    var q = estado.busqueda.trim().toLowerCase();
    var html = '', coinciden = 0, mostrados = 0;
    mes.equipos.forEach(function (eq) {
      if (estado.filtro === 'sin' && eq.ticket) return;
      if (estado.filtro === 'con' && !eq.ticket) return;
      if (q && eq.nombre.toLowerCase().indexOf(q) < 0 && eq.ip.toLowerCase().indexOf(q) < 0) return;
      coinciden++;
      if (mostrados >= MAX_LISTA) return;
      mostrados++;
      var b = badge(eq);
      html += '<button type="button" class="fila' + (eq.id === estado.sel[estado.tipo] ? ' sel' : '') + '" data-id="' + esc(eq.id) + '">' +
        '<div class="fila-top"><div class="fila-nombre"><span class="nombre">' + esc(eq.nombre) + '</span><span class="ip">' + esc(eq.ip) + '</span></div>' +
        '<div class="fila-der"><span class="total">' + fmt(eq.total) + '</span>' + (b ? '<span class="badge ' + b.cls + '">' + esc(b.txt) + '</span>' : '') + '</div></div>' +
        '<div class="barra"><span style="width:' + Math.max(1, Math.round(eq.total / max * 100)) + '%"></span></div></button>';
    });
    $('#lista').innerHTML = html || '<div class="vacio">No hay equipos con ese filtro.</div>';
    $('#nota-lista').textContent = coinciden > mostrados
      ? 'Mostrando los primeros ' + mostrados + ' de ' + fmt(coinciden) + ' equipos · usa el buscador para encontrar otros'
      : 'Mostrando ' + mostrados + ' de ' + fmt(mes.equipos.length) + ' equipos';
  }

  function habilitarAcciones(si) {
    $('#btn-homologar').disabled = !si;
    $('#btn-grafico').disabled = !si;
  }

  function renderDetalle() {
    var eq = eqSel();
    var cont = $('#detalle');
    if (!eq) { cont.innerHTML = '<div class="vacio">Selecciona un equipo.</div>'; habilitarAcciones(false); return; }
    var mi = ++tokenDetalle;
    habilitarAcciones(false);
    if (!eq._d) cont.innerHTML = '<div class="vacio">Cargando el detalle de ' + esc(eq.nombre) + '…</div>';
    obtenerDetalle(eq).then(function () {
      if (mi !== tokenDetalle) return;
      pintarDetalle(eq);
      habilitarAcciones(true);
    }).catch(function (err) {
      if (mi !== tokenDetalle) return;
      cont.innerHTML = '<div class="vacio">No pude cargar el detalle: ' + esc(err.message || err) + '</div>';
    });
  }

  function pintarDetalle(eq) {
    var d = eq._d, b = badge(eq);
    var semVals = d.semanas.map(function (s) { return s.valor; });
    var smax = Math.max.apply(null, semVals.concat([1]));

    var html = '<div class="det-head"><div><span class="pequeno">Equipo seleccionado</span><div class="det-nombre">' + esc(eq.nombre) + '</div>' +
      '<div class="det-info">' + esc(eq.ip) + ' · ' + fmt(eq.total) + ' caídas en el periodo' +
      (b && b.previo ? ' · último ticket #' + esc(b.previo.id) + ' ' + esc(b.previo.estado.toLowerCase()) + ' (' + esc(b.previo.fecha) + ')' : '') + '</div></div>' +
      (b ? '<span class="badge ' + b.cls + '">' + esc(b.txt) + '</span>' : '') + '</div>';

    html += '<div class="det-grid"><div class="col-sem"><h3>Caídas por semana</h3>';
    d.semanas.forEach(function (s) {
      html += '<div class="sem-fila"><span class="sem-label">' + esc(s.label) + '</span><div class="sem-barra"><span style="width:' + Math.round(s.valor / smax * 100) + '%;background:' + (s.valor === smax ? '#F9B641' : '#267D8F') + '"></span></div><span class="sem-valor">' + fmt(s.valor) + '</span></div>';
    });
    html += '</div>';

    html += '<div class="col-heat"><h3>Cuándo caen · fecha × hora</h3>' + heatTabla(d.matriz, d.dias, false) +
      '<span class="nota">Desliza para ver más fechas y horas</span></div></div>';

    if (estado.tipo === 'down') {
      var pu = d.puertos;
      var dias = {};
      pu.forEach(function (p) { Object.keys(p.dias).forEach(function (k) { dias[k] = 1; }); });
      var lista = d.dias.map(String).filter(function (k) { return dias[k]; });
      var cols = 'grid-template-columns:minmax(0,1fr) repeat(' + lista.length + ',' + (typeof d.dias[0] === 'string' ? 60 : 48) + 'px) 56px';
      html += '<div class="seccion"><h3>Puertos que más caen · caídas por día</h3><div class="tabla-puertos"><div class="tp">';
      html += '<div class="tp-fila tp-head" style="' + cols + '"><span>Puerto</span>' + lista.map(function (k) { return '<span style="text-align:center">' + esc(lbl(/^\d+$/.test(k) ? Number(k) : k)) + '</span>'; }).join('') + '<span style="text-align:right">Total</span></div>';
      var marcados = idxPuertos(eq);
      pu.forEach(function (p, i) {
        html += '<button type="button" class="tp-fila' + (marcados.indexOf(i) >= 0 ? ' sel' : '') + '" data-p="' + i + '" aria-pressed="' + (marcados.indexOf(i) >= 0) + '" style="' + cols + '"><span class="tp-nombre"><span class="tp-check">' + (marcados.indexOf(i) >= 0 ? '✓' : '') + '</span>' + esc(p.nombre) + '</span>';
        lista.forEach(function (k) {
          var v = p.dias[k] || 0;
          var st = v > 0
            ? 'background:rgba(38,125,143,' + Math.min(0.9, 0.15 + v * 0.1).toFixed(2) + ');color:' + (v >= 5 ? '#FFFFFF' : '#14202B')
            : 'background:#F4F6F9;color:#5B6773';
          html += '<span class="tp-celda" style="' + st + '">' + (v > 0 ? v : '') + '</span>';
        });
        html += '<span class="tp-total">' + p.total + '</span></button>';
      });
      html += '</div></div><span class="nota">Los puertos con ✓ van al ticket y a la imagen: se marcan solos los que caen de forma recurrente. Haz clic para agregar o quitar uno.</span></div>';
    } else {
      html += '<div class="seccion"><h3>Pérdida de comunicación por día</h3><svg viewBox="0 0 640 220" role="img" aria-label="Pérdida de comunicación por día" style="width:100%;height:auto">' + lineChart(d.diario, d.dias, 0, 0, 640, 220) + '</svg></div>';
    }
    $('#detalle').innerHTML = html;
  }

  function renderTodo() {
    asegurarSeleccion();
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

  function abrirHomologar() {
    var eq = eqSel();
    if (!eq || !eq._d) return;
    var pl = P[estado.tipo];
    var pn = puertosSel(eq).map(function (p) { return p.nombre; });
    $('#mh-t').textContent = pl.titulo(eq, pn);
    $('#mh-c').textContent = pl.cuerpo(eq, pn);
    abrir('#modal-homologar');
  }

  function abrirGrafico() {
    var eq = eqSel();
    if (!eq || !eq._d) return;
    var arriba = evidenciaSVG(estado.tipo, eq, puertosSel(eq));
    var leyenda = '<span class="leyenda">Menos' +
      [0.1, 0.4, 0.75, 1].map(function (a) { return '<i style="background:rgba(38,125,143,' + a + ')"></i>'; }).join('') + 'Más</span>';
    var sems = eq._d.semanas;
    var smax = Math.max.apply(null, sems.map(function (s) { return s.valor; }).concat([1]));
    var semHtml = '<div class="evid-sem"><h3>Caídas por semana</h3>' + sems.map(function (s) {
      return '<div class="sem-fila"><span class="sem-label">' + esc(s.label) + '</span><div class="sem-barra"><span style="width:' +
        Math.round(s.valor / smax * 100) + '%;background:' + (s.valor === smax ? '#F9B641' : '#92C4CE') + '"></span></div><span class="sem-valor">' + fmt(s.valor) + '</span></div>';
    }).join('') + '</div>';
    $('#mg-imagen').innerHTML = '<div class="evid">' + arriba.svg +
      '<div class="evid-fila"><div class="evid-heat"><div class="evid-heat-top"><h3>Cuándo caen · fecha × hora</h3>' + leyenda + '</div>' +
      heatTabla(eq._d.matriz, eq._d.dias, true) +
      '<span class="nota">Se copia exactamente lo que ves aquí. Desplaza la tabla para elegir otras fechas y horas.</span></div>' + semHtml + '</div></div>';
    $('#mg-aviso').textContent = '';
    abrir('#modal-grafico');
    var box = document.querySelector('#mg-imagen .heat-scroll');
    if (box) { box.scrollLeft = Math.max(0, eq._d.dias.length - N_COLS) * PASO_X; box.scrollTop = 0; }
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
    var eq = eqSel();
    if (!eq || !eq._d) return;
    if (!(navigator.clipboard && window.ClipboardItem)) {
      aviso.textContent = 'Este navegador no permite copiar imágenes. Usa Chrome o Edge.';
      return;
    }
    var box = document.querySelector('#mg-imagen .heat-scroll');
    var c0 = box ? Math.round(box.scrollLeft / PASO_X) : 0;
    var r0 = box ? Math.round(box.scrollTop / PASO_Y) : 0;
    var img = evidenciaSVG(estado.tipo, eq, puertosSel(eq), { copia: true, c0: c0, r0: r0 });
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
    var b = ev.target.closest('button[data-id]');
    if (!b) return;
    estado.sel[estado.tipo] = b.getAttribute('data-id');
    estado.puerto = 0;
    renderLista();
    renderDetalle();
  });

  $('#detalle').addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-p]');
    if (!b) return;
    var eq = eqSel();
    if (!eq || !eq._d) return;
    var i = Number(b.getAttribute('data-p'));
    var act = idxPuertos(eq).slice();
    var pos = act.indexOf(i);
    if (pos >= 0) { if (act.length > 1) act.splice(pos, 1); } else act.push(i);
    estado.manual[claveSel(eq)] = act;
    pintarDetalle(eq);
  });

  $('#mes').addEventListener('change', function (ev) {
    if (!ev.target || ev.target.id !== 'sel-mes') return;
    estado.mes[estado.tipo] = Number(ev.target.value);
    estado.sel[estado.tipo] = null;
    estado.puerto = 0;
    renderTodo();
  });

  $('#btn-recargar').addEventListener('click', function () {
    var b = $('#btn-recargar');
    b.disabled = true;
    b.textContent = 'Leyendo…';
    cargar(true).then(function () {
      renderTodo();
      b.disabled = false;
      b.textContent = 'Recargar';
    });
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

  /* ---------- inicio ---------- */
  habilitarAcciones(false);
  $('#titulo').textContent = TITULOS[estado.tipo];
  $('#subtitulo').textContent = 'Leyendo datos…';
  cargar(false).then(renderTodo);
})();
