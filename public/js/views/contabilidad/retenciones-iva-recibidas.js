const RetencionesIvaRecibidasView = createRetencionesDocView({
  prefix: 'rvr',
  apiPath: '/api/retenciones-iva-recibidas',
  title: 'Retenciones IVA Recibidas',
  labelSingular: 'retención IVA recibida',
  labelNueva: 'Retención IVA recibida',
  setupCode: 'RVR',
  formatoCon: 'RVRCON',
  formatoCre: 'RVRCRE',
  kind: 'iva',
  side: 'recibida',
  baseLabel: 'Base imponible',
  retencionLabel: 'Monto retención IVA',
});
