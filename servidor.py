#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Servidor local del Monitor de caídas.

- Lee el Excel que está en la carpeta "datos" (hojas DOWN y NOT RESPONDING).
- Calcula los totales y los entrega a la página.
- No necesita instalar nada: solo usa Python.

Uso: doble clic en iniciar.bat (o: python servidor.py)
"""
import datetime as dt
import json
import os
import re
import shutil
import sys
import tempfile
import threading
import webbrowser
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

CARPETA = os.path.dirname(os.path.abspath(__file__))
CARPETA_DATOS = os.path.join(CARPETA, 'datos')
PUERTO_BASE = 8765

HOJAS = {'down': 'DOWN', 'nr': 'NOT RESPONDING'}
COLUMNAS = {
    'nombre': 'Element name',
    'ip': 'Polling IP',
    'param_key': 'Parameter key',
    'param_desc': 'Parameter description',
    'tiempo': 'Time',
}
MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
         'septiembre', 'octubre', 'noviembre', 'diciembre']
MAX_PUERTOS = 15
MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
MESES_RETENCION = 3   # se conservan solo los últimos 3 meses; lo anterior se descarta y se borra del Excel
MAX_RESPALDOS = 2     # copias de seguridad que se guardan en datos\respaldo

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
NS_REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
NS_PKG = '{http://schemas.openxmlformats.org/package/2006/relationships}'

ARCHIVOS_WEB = {
    '/': ('index.html', 'text/html; charset=utf-8'),
    '/index.html': ('index.html', 'text/html; charset=utf-8'),
    '/styles.css': ('styles.css', 'text/css; charset=utf-8'),
    '/app.js': ('app.js', 'application/javascript; charset=utf-8'),
    '/data.js': ('data.js', 'application/javascript; charset=utf-8'),
    '/plantillas.js': ('plantillas.js', 'application/javascript; charset=utf-8'),
}


# ----------------------------------------------------------------------------
# Lectura del Excel (solo biblioteca estándar)
# ----------------------------------------------------------------------------
def _norm(nombre):
    return re.sub(r'\s+', ' ', re.sub(r'[_\-]', ' ', nombre)).strip().upper()


def _leer_compartidas(zf):
    try:
        f = zf.open('xl/sharedStrings.xml')
    except KeyError:
        return []
    salida = []
    for _, el in ET.iterparse(f, events=('end',)):
        if el.tag == NS + 'si':
            partes = []
            for ch in el:
                if ch.tag == NS + 't':
                    partes.append(ch.text or '')
                elif ch.tag == NS + 'r':
                    t = ch.find(NS + 't')
                    if t is not None:
                        partes.append(t.text or '')
            salida.append(''.join(partes))
            el.clear()
    return salida


def _rutas_hojas(zf):
    """Devuelve {nombre_normalizado: ruta_xml} de cada hoja del libro."""
    libro = ET.parse(zf.open('xl/workbook.xml')).getroot()
    rels = ET.parse(zf.open('xl/_rels/workbook.xml.rels')).getroot()
    destino = {r.get('Id'): r.get('Target') for r in rels.iter(NS_PKG + 'Relationship')}
    salida = {}
    hojas = libro.find(NS + 'sheets')
    for h in hojas:
        rid = h.get(NS_REL + 'id')
        ruta = destino.get(rid, '')
        ruta = ruta.lstrip('/')
        if not ruta.startswith('xl/'):
            ruta = 'xl/' + ruta
        salida[_norm(h.get('name'))] = ruta
    return salida


_cache_col = {}


def _col(ref):
    letras = ref.rstrip('0123456789')
    n = _cache_col.get(letras)
    if n is None:
        n = 0
        for ch in letras:
            n = n * 26 + ord(ch) - 64
        n -= 1
        _cache_col[letras] = n
    return n


def _filas(zf, ruta, compartidas, necesarias):
    """Genera un dict {clave: valor} por fila, con solo las columnas necesarias."""
    mapa = None  # clave -> índice de columna
    buscadas = {v: k for k, v in necesarias.items()}
    for _, row in ET.iterparse(zf.open(ruta), events=('end',)):
        if row.tag != NS + 'row':
            continue
        vals = {}
        for c in row:
            ref = c.get('r')
            if not ref:
                continue
            idx = _col(ref)
            t = c.get('t')
            if t == 'inlineStr':
                is_ = c.find(NS + 'is')
                val = ''.join((x.text or '') for x in is_.iter(NS + 't')) if is_ is not None else None
            else:
                v = c.find(NS + 'v')
                if v is None or v.text is None:
                    continue
                txt = v.text
                if t == 's':
                    val = compartidas[int(txt)]
                elif t in ('str', 'e'):
                    val = txt
                elif t == 'b':
                    val = (txt == '1')
                else:
                    try:
                        val = float(txt)
                    except ValueError:
                        val = txt
            vals[idx] = val
        row.clear()
        if mapa is None:
            if not vals:
                continue
            mapa = {}
            for idx, val in vals.items():
                if isinstance(val, str) and val.strip() in buscadas:
                    mapa[buscadas[val.strip()]] = idx
            faltan = [n for n in necesarias if n not in mapa]
            if faltan:
                raise ValueError('Faltan columnas en la hoja: ' +
                                 ', '.join(necesarias[n] for n in faltan))
            continue
        yield {k: vals.get(i) for k, i in mapa.items()}


_BASE = dt.datetime(1899, 12, 30)


def _fecha(v):
    if isinstance(v, (int, float)):
        return _BASE + dt.timedelta(seconds=round(v * 86400))
    if isinstance(v, str):
        s = v.strip().replace('T', ' ')
        for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M', '%d/%m/%Y %H:%M:%S', '%d/%m/%Y %H:%M', '%Y-%m-%d'):
            try:
                return dt.datetime.strptime(s, fmt)
            except ValueError:
                pass
    return None


# ----------------------------------------------------------------------------
# Agregación
# ----------------------------------------------------------------------------
def _nuevo_equipo():
    return {'total': 0, 'dias': Counter(), 'hm': Counter(), 'puertos': defaultdict(Counter)}


def _restar_meses(d, n):
    m = d.year * 12 + d.month - 1 - n
    anio, mes = divmod(m, 12)
    mes += 1
    ultimo = (dt.date(anio + (mes == 12), mes % 12 + 1, 1) - dt.timedelta(days=1)).day
    return dt.date(anio, mes, min(d.day, ultimo))


def _fecha_corte():
    """Primer día que se conserva (hoy menos 3 meses). MONITOR_CORTE=AAAA-MM-DD solo sirve para pruebas."""
    prueba = os.environ.get('MONITOR_CORTE')
    if prueba:
        return dt.datetime.strptime(prueba, '%Y-%m-%d').date()
    return _restar_meses(dt.date.today(), MESES_RETENCION)


def _agregar_hoja(zf, ruta, compartidas, es_down, corte):
    # meses[(año, mes)][(nombre, ip)] -> acumulados
    meses = defaultdict(dict)
    leidas = 0
    omitidas = 0
    viejas = 0
    for f in _filas(zf, ruta, compartidas, COLUMNAS):
        leidas += 1
        t = _fecha(f['tiempo'])
        nombre = f['nombre']
        if t is None or not nombre:
            omitidas += 1
            continue
        if t.date() < corte:
            viejas += 1
            continue
        nombre = str(nombre).strip()
        ip = str(f['ip']).strip() if f['ip'] is not None else ''
        d = t.date()
        eq = meses[(t.year, t.month)].setdefault((nombre, ip), _nuevo_equipo())
        eq['total'] += 1
        eq['dias'][d] += 1
        eq['hm'][(d, t.hour)] += 1
        if es_down:
            p = f['param_key'] or f['param_desc'] or '(sin puerto)'
            eq['puertos'][str(p).strip()][d] += 1
    return meses, leidas, omitidas, viejas


def _leer_excel(ruta_xlsx):
    # Se trabaja sobre una copia por si el Excel está abierto
    tmp = tempfile.mkdtemp(prefix='monitor_')
    copia = os.path.join(tmp, 'datos.xlsx')
    try:
        shutil.copyfile(ruta_xlsx, copia)
        resultado = {}
        corte = _fecha_corte()
        with zipfile.ZipFile(copia) as zf:
            compartidas = _leer_compartidas(zf)
            rutas = _rutas_hojas(zf)
            for tipo, nombre_hoja in HOJAS.items():
                ruta = rutas.get(_norm(nombre_hoja))
                if not ruta:
                    resultado[tipo] = {'error': 'No encontré la hoja "%s".' % nombre_hoja, 'meses': {}}
                    continue
                meses, leidas, omitidas, viejas = _agregar_hoja(zf, ruta, compartidas, tipo == 'down', corte)
                resultado[tipo] = {'meses': meses, 'filas': leidas, 'omitidas': omitidas, 'viejas': viejas}
        return resultado
    finally:
        shutil.rmtree(tmp, ignore_errors=True)



# ----------------------------------------------------------------------------
# Depuración: borra del Excel las filas con más de 3 meses
# ----------------------------------------------------------------------------
_RE_FILA = re.compile(r'<row\b[^>]*?(?:/>|>.*?</row>)', re.S)
_RE_CELDA = re.compile(r'<c\b([^>]*?)(?:/>|>(.*?)</c>)', re.S)
_RE_REF = re.compile(r'\br="([A-Z]*)(\d+)"')


def _valor_celda(attrs, interior, compartidas):
    if not interior:
        return None
    t = re.search(r'\bt="(\w+)"', attrs)
    t = t.group(1) if t else None
    if t == 'inlineStr':
        return ''.join(re.findall(r'<t[^>]*>(.*?)</t>', interior, re.S))
    v = re.search(r'<v>(.*?)</v>', interior, re.S)
    if not v:
        return None
    txt = v.group(1)
    if t == 's':
        return compartidas[int(txt)]
    if t in ('str', 'e', 'b'):
        return txt
    try:
        return float(txt)
    except ValueError:
        return txt


def _depurar_hoja(xml, compartidas, corte):
    """Devuelve (xml_nuevo, quitadas, conservadas) o None si no hay nada que quitar / no es seguro."""
    for marca in ('<mergeCell', '<autoFilter', '<conditionalFormatting', '<tableParts', '<f>', '<f '):
        if marca in xml:
            raise ValueError('la hoja tiene %s y no es seguro reescribirla' % marca.strip('<'))
    i0 = xml.index('<sheetData>') + len('<sheetData>')
    i1 = xml.index('</sheetData>')
    filas = _RE_FILA.findall(xml[i0:i1])
    if not filas:
        return None
    # Encabezado: columna "Time"
    col_t = None
    for m in _RE_CELDA.finditer(filas[0]):
        ref = re.search(r'\br="([A-Z]+)\d+"', m.group(1))
        if ref and _valor_celda(m.group(1), m.group(2), compartidas) == COLUMNAS['tiempo']:
            col_t = ref.group(1)
            break
    if col_t is None:
        raise ValueError('no encontré la columna "%s"' % COLUMNAS['tiempo'])
    patron = re.compile(r'<c\b([^>]*\br="%s\d+"[^>]*?)(?:/>|>(.*?)</c>)' % col_t, re.S)
    quedan = [filas[0]]
    quitadas = 0
    for fila in filas[1:]:
        m = patron.search(fila)
        t = _fecha(_valor_celda(m.group(1), m.group(2), compartidas)) if m else None
        if t is not None and t.date() < corte:
            quitadas += 1
        else:
            quedan.append(fila)
    if not quitadas:
        return None
    if len(quedan) <= 1:
        raise ValueError('todas las filas son anteriores a %s; no se borra nada' % corte)
    nuevas = []
    for n, fila in enumerate(quedan, start=1):
        nuevas.append(_RE_REF.sub(lambda m, n=n: 'r="%s%d"' % (m.group(1), n), fila))
    xml2 = xml[:i0] + ''.join(nuevas) + xml[i1:]
    xml2 = re.sub(r'(<dimension ref="[A-Z]+\d+:[A-Z]+)\d+(")', lambda m: '%s%d%s' % (m.group(1), len(nuevas), m.group(2)), xml2, count=1)
    return xml2, quitadas, len(quedan) - 1


def _depurar_excel(ruta):
    """Quita las filas anteriores a 3 meses de cada hoja. Deja un respaldo en datos\\respaldo.
    Devuelve un texto para mostrar al usuario, o None si no hubo nada que hacer."""
    carpeta = os.path.dirname(ruta)
    if os.path.exists(os.path.join(carpeta, '~$' + os.path.basename(ruta))):
        return 'No se depuró el Excel porque está abierto. Ciérralo y pulsa Recargar.'
    corte = _fecha_corte()
    cambios = {}
    resumen = []
    with zipfile.ZipFile(ruta) as zf:
        compartidas = _leer_compartidas(zf)
        rutas = _rutas_hojas(zf)
        for tipo, nombre_hoja in HOJAS.items():
            r = rutas.get(_norm(nombre_hoja))
            if not r:
                continue
            res = _depurar_hoja(zf.read(r).decode('utf-8'), compartidas, corte)
            if res:
                cambios[r] = res[0].encode('utf-8')
                resumen.append('%s: %s filas' % (nombre_hoja, format(res[1], ',')))
        if not cambios:
            return None
        respaldo_dir = os.path.join(carpeta, 'respaldo')
        os.makedirs(respaldo_dir, exist_ok=True)
        base = os.path.splitext(os.path.basename(ruta))[0]
        respaldo = os.path.join(respaldo_dir, '%s_%s.xlsx' % (base, dt.datetime.now().strftime('%Y%m%d_%H%M%S')))
        shutil.copyfile(ruta, respaldo)
        viejos = sorted(f for f in os.listdir(respaldo_dir) if f.startswith(base + '_') and f.endswith('.xlsx'))
        for f in viejos[:-MAX_RESPALDOS]:
            try:
                os.remove(os.path.join(respaldo_dir, f))
            except OSError:
                pass
        nuevo = ruta + '.tmp'
        with zipfile.ZipFile(nuevo, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as out:
            for item in zf.infolist():
                out.writestr(item, cambios.get(item.filename) or zf.read(item.filename))
    os.replace(nuevo, ruta)
    return 'Se borraron del Excel los datos anteriores al %s (%s).' % (corte.strftime('%d/%m/%Y'), ', '.join(resumen))


# ----------------------------------------------------------------------------
# Tickets (archivo descargado de Databricks, carpeta "datos", nombre puertos_down*.csv)
# ----------------------------------------------------------------------------
ACTIVOS = ('abierto', 'asignado', 'en proceso')
_RE_TITULO = re.compile(r'LIMPIEZA\s+DE\s+RED\s*[.,]\s*(IRR|IM-CORE)\s*,\s*(.+)', re.I)


def _buscar_tickets():
    if not os.path.isdir(CARPETA_DATOS):
        return None
    c = [os.path.join(CARPETA_DATOS, f) for f in os.listdir(CARPETA_DATOS)
         if f.lower().startswith('puertos_down') and f.lower().endswith('.csv') and not f.startswith('~$')]
    return max(c, key=os.path.getmtime) if c else None


def _leer_tickets(ruta):
    """Devuelve {'down': {NOMBRE: [tickets]}, 'nr': {...}, 'total': n, 'sin_formato': n}.
    El equipo sale del título: LIMPIEZA DE RED, IRR|IM-CORE, <equipo> - <puerto o IP>."""
    import csv
    res = {'down': defaultdict(list), 'nr': defaultdict(list), 'total': 0, 'sin_formato': 0}
    with open(ruta, encoding='utf-8-sig', newline='') as f:
        for fila in csv.DictReader(f):
            res['total'] += 1
            m = _RE_TITULO.search(fila.get('descripcioncorta') or '')
            if not m:
                res['sin_formato'] += 1
                continue
            tipo = 'down' if m.group(1).upper() == 'IRR' else 'nr'
            resto = m.group(2).strip()
            nombre, _, detalle = resto.partition(' - ')
            estado = (fila.get('status') or '').strip()
            res[tipo][_norm(nombre.strip())].append({
                'id': (fila.get('incidentid') or '').strip(),
                'estado': estado,
                'activo': estado.lower() in ACTIVOS,
                'fecha': (fila.get('createddatetime') or '')[:10],
                'detalle': detalle.strip(),
            })
    return res


def _ticket_de(tickets, tipo, nombre):
    """Ticket vigente (abierto/asignado/en proceso) más reciente; si no hay, el último resuelto como referencia."""
    lst = tickets[tipo].get(_norm(nombre)) if tickets else None
    if not lst:
        return None, None
    lst = sorted(lst, key=lambda t: t['fecha'], reverse=True)
    act = [t for t in lst if t['activo']]
    previo = [t for t in lst if not t['activo']]
    vig = None
    if act:
        t = act[0]
        vig = {'id': t['id'], 'estado': t['estado'], 'fecha': t['fecha'], 'n': len(act)}
    pre = None
    if previo:
        t = previo[0]
        pre = {'id': t['id'], 'estado': t['estado'], 'fecha': t['fecha']}
    return vig, pre


def _etq(d, varios_meses):
    return '%d %s' % (d.day, MESES_CORTOS[d.month - 1]) if varios_meses else d.day


def _construir_resumen(agg, tickets=None):
    """Lista de meses con sus equipos (sin el detalle pesado)."""
    salida = {}
    for tipo, info in agg.items():
        lista = []
        for (anio, mes), equipos in sorted(info['meses'].items()):
            fechas = [d for e in equipos.values() for d in e['dias']]
            primero, ultimo = min(fechas), max(fechas)
            n = (ultimo - primero).days + 1
            dias = [(primero + dt.timedelta(days=i)).day for i in range(n)]
            filas = []
            for (nombre, ip), e in equipos.items():
                vig, pre = _ticket_de(tickets, tipo, nombre)
                filas.append({'id': nombre + '|' + ip, 'nombre': nombre, 'ip': ip, 'total': e['total'],
                              'ticket': vig, 'previo': pre})
            filas.sort(key=lambda x: (-x['total'], x['nombre']))
            lista.append({
                'clave': '%04d-%02d' % (anio, mes),
                'etiqueta': '%s %d' % (MESES[mes - 1], anio),
                'dias': dias,
                'total': sum(x['total'] for x in filas),
                'equipos': filas,
            })
        if len(lista) > 1:
            todos = {}
            fechas_t = []
            for (anio, mes), equipos in info['meses'].items():
                for (nombre, ip), e in equipos.items():
                    todos[(nombre, ip)] = todos.get((nombre, ip), 0) + e['total']
                fechas_t.extend(d for x in equipos.values() for d in x['dias'])
            primero, ultimo = min(fechas_t), max(fechas_t)
            dias_t = [_etq(primero + dt.timedelta(days=i), True) for i in range((ultimo - primero).days + 1)]
            filas = []
            for (nombre, ip), total in todos.items():
                vig, pre = _ticket_de(tickets, tipo, nombre)
                filas.append({'id': nombre + '|' + ip, 'nombre': nombre, 'ip': ip, 'total': total,
                              'ticket': vig, 'previo': pre})
            filas.sort(key=lambda x: (-x['total'], x['nombre']))
            claves = sorted(info['meses'])
            etq = 'Todos los meses (%s – %s)' % (MESES_CORTOS[claves[0][1] - 1], MESES_CORTOS[claves[-1][1] - 1])
            lista.insert(0, {'clave': 'todos', 'etiqueta': etq, 'dias': dias_t,
                             'total': sum(x['total'] for x in filas), 'equipos': filas})
        salida[tipo] = {'meses': lista, 'filas': info.get('filas', 0), 'omitidas': info.get('omitidas', 0)}
        if info.get('error'):
            salida[tipo]['error'] = info['error']
    return salida


def _detalle(agg, tipo, clave_mes, eq_id):
    info = agg.get(tipo)
    if not info:
        return None
    if clave_mes == 'todos':
        grupos = list(info['meses'].values())
    else:
        anio, mes = [int(x) for x in clave_mes.split('-')]
        g = info['meses'].get((anio, mes))
        grupos = [g] if g else []
    if not grupos:
        return None
    varios = clave_mes == 'todos'
    nombre, _, ip = eq_id.rpartition('|')
    e = {'total': 0, 'dias': Counter(), 'hm': Counter(), 'puertos': defaultdict(Counter)}
    encontrado = False
    for g in grupos:
        x = g.get((nombre, ip))
        if x is None:
            continue
        encontrado = True
        e['total'] += x['total']
        e['dias'].update(x['dias'])
        e['hm'].update(x['hm'])
        for p, c in x['puertos'].items():
            e['puertos'][p].update(c)
    if not encontrado:
        return None
    fechas = [d for g in grupos for x in g.values() for d in x['dias']]
    primero, ultimo = min(fechas), max(fechas)
    lista = [primero + dt.timedelta(days=i) for i in range((ultimo - primero).days + 1)]

    diario = [e['dias'].get(d, 0) for d in lista]
    matriz = [[e['hm'].get((d, h), 0) for d in lista] for h in range(24)]

    semanas = Counter()
    for d, n in e['dias'].items():
        semanas[(d.isocalendar()[0], d.isocalendar()[1])] += n
    sem = [{'label': 'Sem %d' % s[1], 'valor': semanas[s]} for s in sorted(semanas)]

    puertos = []
    for p, c in sorted(e['puertos'].items(), key=lambda kv: -sum(kv[1].values()))[:MAX_PUERTOS]:
        puertos.append({
            'nombre': p,
            'dias': {str(_etq(d, varios)): n for d, n in sorted(c.items())},
            'total': sum(c.values()),
        })
    return {
        'dias': [_etq(d, varios) for d in lista],
        'diario': diario,
        'matriz': matriz,
        'semanas': sem,
        'puertos': puertos,
    }


# ----------------------------------------------------------------------------
# Estado compartido
# ----------------------------------------------------------------------------
_lock = threading.Lock()
_estado = {'ruta': None, 'mtime': None, 'agg': None, 'resumen': None, 'error': None, 'leido': None,
           'ruta_t': None, 'mtime_t': None, 'tickets_info': None, 'depuracion': None}


def _buscar_excel():
    if not os.path.isdir(CARPETA_DATOS):
        return None
    candidatos = []
    for n in os.listdir(CARPETA_DATOS):
        if n.lower().endswith('.xlsx') and not n.startswith('~$'):
            p = os.path.join(CARPETA_DATOS, n)
            candidatos.append((os.path.getmtime(p), p))
    if not candidatos:
        return None
    return max(candidatos)[1]


def cargar(forzar=False):
    with _lock:
        ruta = _buscar_excel()
        if not ruta:
            _estado.update(error='No encontré ningún archivo .xlsx en la carpeta "datos".', resumen=None, agg=None)
            return
        mtime = os.path.getmtime(ruta)
        ruta_t = _buscar_tickets()
        mtime_t = os.path.getmtime(ruta_t) if ruta_t else None
        igual = (_estado['ruta'] == ruta and _estado['mtime'] == mtime and _estado['agg'] is not None)
        if not forzar and igual and _estado['ruta_t'] == ruta_t and _estado['mtime_t'] == mtime_t:
            return
        try:
            agg = _estado['agg'] if (igual and not forzar) else _leer_excel(ruta)
            aviso_dep = _estado.get('depuracion')
            if not (igual and not forzar):
                aviso_dep = None
                if any(i.get('viejas') for i in agg.values()):
                    try:
                        aviso_dep = _depurar_excel(ruta)
                        mtime = os.path.getmtime(ruta)
                    except PermissionError:
                        aviso_dep = 'No se depuró el Excel porque está abierto. Ciérralo y pulsa Recargar.'
                    except Exception as ex:  # noqa: BLE001
                        aviso_dep = 'No se pudo depurar el Excel (%s). Los datos viejos se ignoran al leer.' % ex
            tickets, info_t = None, None
            if ruta_t:
                try:
                    tickets = _leer_tickets(ruta_t)
                    info_t = {'archivo': os.path.basename(ruta_t), 'total': tickets['total'],
                              'sin_formato': tickets['sin_formato']}
                except Exception as ex:  # noqa: BLE001
                    info_t = {'archivo': os.path.basename(ruta_t), 'error': 'No pude leer los tickets: %s' % ex}
            _estado.update(ruta=ruta, mtime=mtime, agg=agg, resumen=_construir_resumen(agg, tickets), error=None,
                           ruta_t=ruta_t, mtime_t=mtime_t, tickets_info=info_t, depuracion=aviso_dep,
                           leido=dt.datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
        except PermissionError:
            _estado.update(error='No pude abrir el Excel. Ciérralo si lo tienes abierto e intenta de nuevo.')
        except Exception as ex:  # noqa: BLE001
            _estado.update(error='No pude leer el Excel: %s' % ex)


# ----------------------------------------------------------------------------
# Servidor HTTP
# ----------------------------------------------------------------------------
class Manejador(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # silencioso
        pass

    def _json(self, obj, codigo=200):
        cuerpo = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(codigo)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_GET(self):  # noqa: N802
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path == '/api/resumen':
            cargar(forzar=q.get('forzar', ['0'])[0] == '1')
            if _estado['error'] or not _estado['resumen']:
                return self._json({'error': _estado['error'] or 'Sin datos'}, 200)
            return self._json({
                'archivo': os.path.basename(_estado['ruta']),
                'leido': _estado['leido'],
                'tickets': _estado['tickets_info'],
                'depuracion': _estado['depuracion'],
                'datos': _estado['resumen'],
            })
        if u.path == '/api/equipo':
            cargar()
            if not _estado['agg']:
                return self._json({'error': _estado['error'] or 'Sin datos'}, 200)
            d = _detalle(_estado['agg'], q.get('tipo', [''])[0], q.get('mes', [''])[0], q.get('id', [''])[0])
            if d is None:
                return self._json({'error': 'Equipo no encontrado'}, 404)
            return self._json(d)
        if u.path in ARCHIVOS_WEB:
            nombre, tipo = ARCHIVOS_WEB[u.path]
            ruta = os.path.join(CARPETA, nombre)
            if not os.path.isfile(ruta):
                self.send_error(404)
                return
            with open(ruta, 'rb') as f:
                cuerpo = f.read()
            self.send_response(200)
            self.send_header('Content-Type', tipo)
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(cuerpo)))
            self.end_headers()
            self.wfile.write(cuerpo)
            return
        self.send_error(404)


def main():
    servidor = None
    puerto = PUERTO_BASE
    for p in range(PUERTO_BASE, PUERTO_BASE + 10):
        try:
            servidor = ThreadingHTTPServer(('127.0.0.1', p), Manejador)
            puerto = p
            break
        except OSError:
            continue
    if servidor is None:
        print('No pude abrir ningún puerto libre entre %d y %d.' % (PUERTO_BASE, PUERTO_BASE + 9))
        sys.exit(1)

    url = 'http://localhost:%d/' % puerto
    print('Monitor de caídas')
    print('Leyendo el Excel de la carpeta "datos"...')
    cargar(forzar=True)
    if _estado['error']:
        print('AVISO:', _estado['error'])
    else:
        print('Listo: %s' % os.path.basename(_estado['ruta']))
    print()
    print('Abre esta dirección en Chrome o Edge:  ' + url)
    print('Para cerrar el programa, cierra esta ventana (o Ctrl + C).')
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
