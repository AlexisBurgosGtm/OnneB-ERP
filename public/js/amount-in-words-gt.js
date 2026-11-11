/** Monto en letras (quetzales) — mismo algoritmo que lib/formato-impresion-engine.js */
(function () {
  const UNIDADES_ES = [
    '',
    'UN',
    'DOS',
    'TRES',
    'CUATRO',
    'CINCO',
    'SEIS',
    'SIETE',
    'OCHO',
    'NUEVE',
    'DIEZ',
    'ONCE',
    'DOCE',
    'TRECE',
    'CATORCE',
    'QUINCE',
    'DIECISEIS',
    'DIECISIETE',
    'DIECIOCHO',
    'DIECINUEVE',
    'VEINTE',
    'VEINTIUNO',
    'VEINTIDOS',
    'VEINTITRES',
    'VEINTICUATRO',
    'VEINTICINCO',
    'VEINTISEIS',
    'VEINTISIETE',
    'VEINTIOCHO',
    'VEINTINUEVE',
  ];
  const DECENAS_ES = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const CENTENAS_ES = [
    '',
    'CIENTO',
    'DOSCIENTOS',
    'TRESCIENTOS',
    'CUATROCIENTOS',
    'QUINIENTOS',
    'SEISCIENTOS',
    'SETECIENTOS',
    'OCHOCIENTOS',
    'NOVECIENTOS',
  ];

  function groupToWordsEs(n) {
    const num = Math.floor(Number(n) || 0);
    if (num === 0) return '';
    if (num === 100) return 'CIEN';
    if (num < 30) return UNIDADES_ES[num];
    if (num < 100) {
      const d = Math.floor(num / 10);
      const u = num % 10;
      if (!u) return DECENAS_ES[d];
      return `${DECENAS_ES[d]} Y ${UNIDADES_ES[u]}`;
    }
    const c = Math.floor(num / 100);
    const r = num % 100;
    if (!r) return CENTENAS_ES[c] === 'CIENTO' ? 'CIEN' : CENTENAS_ES[c];
    return `${CENTENAS_ES[c]} ${groupToWordsEs(r)}`.trim();
  }

  function amountInWordsGt(value) {
    const n = Math.round((Number(value) || 0) * 100) / 100;
    const entero = Math.floor(Math.abs(n));
    const centavos = Math.round((Math.abs(n) - entero) * 100);

    function enteroToWords(num) {
      if (num === 0) return 'CERO';
      if (num < 1000) return groupToWordsEs(num);
      if (num < 1000000) {
        const miles = Math.floor(num / 1000);
        const resto = num % 1000;
        const milesWords = miles === 1 ? 'MIL' : `${groupToWordsEs(miles)} MIL`;
        return resto ? `${milesWords} ${groupToWordsEs(resto)}` : milesWords;
      }
      const millones = Math.floor(num / 1000000);
      const resto = num % 1000000;
      const millWords = millones === 1 ? 'UN MILLON' : `${groupToWordsEs(millones)} MILLONES`;
      if (!resto) return millWords;
      return `${millWords} ${enteroToWords(resto)}`;
    }

    const words = enteroToWords(entero);
    const moneda = entero === 1 ? 'QUETZAL' : 'QUETZALES';
    if (centavos > 0) {
      return `${words} ${moneda} CON ${String(centavos).padStart(2, '0')}/100`.replace(/\s+/g, ' ').trim();
    }
    return `${words} ${moneda} EXACTOS`.replace(/\s+/g, ' ').trim();
  }

  const AmountInWordsGt = { amount: amountInWordsGt };
  if (typeof window !== 'undefined') window.AmountInWordsGt = AmountInWordsGt;
  if (typeof F !== 'undefined') F.AmountInWordsGt = AmountInWordsGt;
})();
