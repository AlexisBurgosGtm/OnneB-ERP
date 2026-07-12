const RetencionesIsrView = createRetencionesDocView({
  prefix: 'rti',
  apiPath: '/api/retenciones-isr',
  title: 'Retenciones ISR',
  labelSingular: 'retención ISR',
  labelNueva: 'Retención ISR',
  setupCode: 'RTI',
  formatoCon: 'RTICON',
  formatoCre: 'RTICRE',
  baseLabel: 'Base imponible',
  retencionLabel: 'Monto retención ISR',
});
