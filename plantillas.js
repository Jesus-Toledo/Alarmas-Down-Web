/*
  PLANTILLAS DE TICKET
  Edita aquí los textos. Cada plantilla recibe:
    e = { nombre, ip, total }     (el equipo seleccionado)
    puerto = nombre del puerto    (solo en reportes de puertos down)
  Los números se escriben con coma de miles, por ejemplo 1,245.
*/
function _n(v) { return Number(v).toLocaleString('en-US'); }

window.PLANTILLAS = {
  // NOT-RESPONDING: tomada del ejemplo que enviaste
  nr: {
    titulo: function (e) {
      return 'LIMPIEZA DE RED, IM-CORE, ' + e.nombre + ' - ' + e.ip;
    },
    cuerpo: function (e) {
      return [
        'BUEN DÍA EQUIPO,',
        '',
        'SOLICITAMOS SU APOYO CON LA REVISIÓN DEL SIGUIENTE ELEMENTO DE RED:',
        '',
        'SE HA PRESENTADO ' + _n(e.total) + ' ALARMAS EN LAS ÚLTIMAS SEMANAS.',
        '',
        'DURANTE LA ALARMA SE PIERDE VISIBILIDAD DEL EQUIPO COMPLETO, POR LO QUE NO SE IDENTIFICA PUERTO / PUNTA ESPECIFICA.',
        'SE SOLICITA REVISION Y CERTIFICACIÓN DEL CABLEADO DEL EQUIPO PARA DESCARTAR UNA AFECTACIÓN FÍSICA.'
      ].join('\n');
    }
  },

  // DOWN: BORRADOR. Falta que me pases tu plantilla real; ajusta estos textos.
  down: {
    titulo: function (e, puerto) {
      return 'LIMPIEZA DE RED, IRR, ' + e.nombre + ' - ' + puerto;
    },
    cuerpo: function (e, puerto) {
      return [
        'BUEN DÍA EQUIPO,',
        '',
        'SOLICITAMOS SU APOYO CON LA REVISIÓN DEL SIGUIENTE ELEMENTO DE RED:',
        '',
        e.nombre + ' - ' + e.ip,
        'PUERTO: ' + puerto,
        '',
        'SE HA PRESENTADO ' + _n(e.total) + ' ALARMAS EN LAS ÚLTIMAS SEMANAS.',
        '',
        'SE SOLICITA REVISION Y CERTIFICACIÓN DEL CABLEADO DEL PUERTO PARA DESCARTAR UNA AFECTACIÓN FÍSICA.'
      ].join('\n');
    }
  }
};
