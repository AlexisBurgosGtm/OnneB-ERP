const RetencionesIsrRecibidasView = createRetencionesDocView({
  prefix: 'rir',
  apiPath: '/api/retenciones-isr-recibidas',
  title: 'Retenciones ISR Recibidas',
  labelSingular: 'retención ISR recibida',
  labelNueva: 'Retención ISR recibida',
  setupCode: 'RIR',
  formatoCon: 'RIRCON',
  formatoCre: 'RIRCRE',
  kind: 'isr',
  side: 'recibida',
  baseLabel: 'Base imponible',
  retencionLabel: 'Monto retención ISR',
});
