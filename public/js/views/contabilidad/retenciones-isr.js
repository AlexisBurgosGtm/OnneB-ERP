const RetencionesIsrView = createRetencionesDocView({
  prefix: 'rti',
  apiPath: '/api/retenciones-isr',
  title: 'Retenciones Emitidas ISR',
  labelSingular: 'retención ISR emitida',
  labelNueva: 'Retención ISR emitida',
  setupCode: 'RTI',
  formatoCon: 'RTICON',
  formatoCre: 'RTICRE',
  kind: 'isr',
  baseLabel: 'Base imponible',
  retencionLabel: 'Monto retención ISR',
});
