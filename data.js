/*
  DATOS DE EJEMPLO
  Los nombres, IP y totales salen de tus reportes de Power BI.
  El reparto por día, hora y semana de cada equipo se genera en app.js solo para mostrar el diseño.
  En la siguiente etapa este archivo se reemplaza por los datos leídos de tu Excel histórico.

  ticket: null                      -> "Sin ticket"
  ticket: { id: null, estado: ... } -> "Con ticket" (se sabe que existe, no su número)
  ticket: { id: '123', estado: 'Abierto' | 'Asignado' }
*/
window.DATOS = {
  mes: 'noviembre 2026',
  diasConDatos: 24,

  down: {
    etiqueta: 'Puertos down',
    titulo: 'Repetitividad de caída de puertos',
    fuente: 'Datos de ejemplo',
    ticketsCreados: 27,
    semanasGlobal: [['Sem 45', 10765], ['Sem 46', 9493], ['Sem 47', 10501], ['Sem 48', 3565]],
    equipos: [
      { nombre: 'GDL_PEBNG2_7750_CTC', ip: '177241247107', total: 3950, ticket: { id: null, estado: 'Abierto' } },
      { nombre: 'GDL_N9K_TVD_MHE_IRD_MONITOREO', ip: '10.0.57.195', total: 3344, ticket: { id: '12924008', estado: 'Abierto' } },
      { nombre: 'GDL_N9K_TVD_MHE_IRD_RECEPCION', ip: '10.9.124.24', total: 2249, ticket: null },
      { nombre: 'GDL_NX9K_SW01_TVD_HC_DC_LEAF_TOR_RACK_H10_BPK', ip: '10.9.127.36', total: 2087, ticket: { id: '12592019', estado: 'Abierto' } },
      { nombre: 'LMM_NEXUS_9K_VIDEO_01', ip: '10.0.17.252', total: 1665, ticket: null },
      { nombre: 'GDL_NX9K_SW01_TVD_HC_DC_LEAF_TOR_RACK_H09_BPK', ip: '10.9.127.37', total: 1598, ticket: { id: '12520555', estado: 'Asignado' } },
      { nombre: 'GDL_NEXUS_9K_DATOS_02', ip: '10.2.57.181', total: 846, ticket: null },
      { nombre: 'XAL_PE_BNG2_7750_CTC', ip: '177241247121', total: 686, ticket: null },
      { nombre: 'GDL_ASR9912_PE_DIST_02', ip: '189.196.41.166', total: 667, ticket: null },
      { nombre: 'GDL_N9K_TVD_MHE_RACK5_03', ip: '10.9.124.17', total: 571, ticket: null }
    ],
    // Puertos de ejemplo (se muestran para cualquier equipo down mientras no se lea el Excel)
    puertos: [
      { nombre: 'xgei-1/11/1-ACC-P1-TO-NE8KM14-CTC-CLN-GE0/3/7', dias: { 1: 7, 22: 7, 23: 5, 24: 2 }, total: 22 },
      { nombre: 'xgei-1/11/1-ACC-P1-TO-NE8KM14-CTC-TOL-GE0/3/2', dias: { 1: 1, 22: 1, 24: 1 }, total: 3 },
      { nombre: 'xgei-1/11/1-ACC-P1-TO-NE8KM14-HUB-ROUTER-CTC2-GE0/3/4', dias: { 22: 1, 24: 1 }, total: 2 },
      { nombre: 'xgei-1/11/1-ACC-P1-TO-NE8KM14-HUB25-ZAPOPAN-GDL-GE0/3/8', dias: { 23: 1 }, total: 1 },
      { nombre: 'xgei-1/11/1-ACC-P1-TO-NE8KM14-02-BARRANCOS-CLN-GE0/3/4', dias: { 1: 1 }, total: 1 },
      { nombre: 'xgei-1/10/4-ACC-P1-TO-PE-BNG2-NE8KM14-CTC-SILAO-GE0/5/4', dias: { 24: 1 }, total: 1 }
    ]
  },

  nr: {
    etiqueta: 'Not responding',
    titulo: 'Repetitividad de pérdida de comunicación',
    fuente: 'Datos de ejemplo',
    ticketsCreados: 35,
    semanasGlobal: [['Sem 45', 56739], ['Sem 46', 47123], ['Sem 47', 62934], ['Sem 48', 35294]],
    equipos: [
      { nombre: 'LBA_IDRAC_AWS_TVD_CTC_04', ip: '10.11.111.5', total: 16202, ticket: { id: '11373764', estado: 'Abierto' } },
      { nombre: 'CPE_IDRAC_AWS_NGV_ENCODER_03', ip: '10.11.131.9', total: 15945, ticket: { id: '12924111', estado: 'Abierto' } },
      { nombre: 'TAM_DC_ALPHA_CTC_MADERO_A', ip: '10.6.28.243', total: 13227, ticket: null },
      { nombre: 'PCA_IDRAC_AWS_NGV_ENCODER_CTC_04', ip: '10.11.119.15', total: 12908, ticket: null },
      { nombre: 'CPE_IDRAC_AWS_NGV_ENCODER_02', ip: '10.11.131.10', total: 10858, ticket: { id: '12991734', estado: 'Abierto' } },
      { nombre: 'TLN_CAT6K_HUB05', ip: '10.0.242.202', total: 9013, ticket: { id: '13013935', estado: 'Abierto' } },
      { nombre: 'OAX_IDRAC_AWS_NGV_ELEMENTAL_LIFE_03', ip: '10.11.167.4', total: 7495, ticket: null },
      { nombre: 'COR_IDRAC_AWS_NGV_ENCODER_02', ip: '10.11.173.2', total: 6598, ticket: null },
      { nombre: 'TOL_DC_ARGUS_CTC', ip: '10.6.62.243', total: 5524, ticket: { id: null, estado: 'Abierto' } },
      { nombre: 'MZT_CTC_TVD_NGV_HW_IMM_BKS350_02', ip: '10.9.60.136', total: 4722, ticket: null }
    ]
  }
};
