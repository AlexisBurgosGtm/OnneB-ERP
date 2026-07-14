const NominaInternaView = createNominaDocView({
  prefix: 'nomina-interna',
  apiPath: '/api/nomina/interna',
  title: 'Nómina interna',
  printTitle: 'Planilla de nómina interna',
  reciboTitle: 'Recibo de nómina interna',
  showIgssExport: false,
  showPatronal: false,
});

const NominaIgssView = createNominaDocView({
  prefix: 'nomina-igss',
  apiPath: '/api/nomina/igss',
  title: 'Planilla IGSS',
  printTitle: 'Planilla IGSS — Guatemala',
  reciboTitle: 'Detalle empleado — IGSS',
  showIgssExport: true,
  showPatronal: true,
});
