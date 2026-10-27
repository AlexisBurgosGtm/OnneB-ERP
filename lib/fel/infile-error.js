const { parseInfileErrorBody } = require('./parse-response');

function attachInfileMeta(err, meta = {}) {
  const e = err instanceof Error ? err : new Error(String(err));
  const src = meta instanceof Error ? meta : meta;
  if (src.statusCode != null && e.statusCode == null) e.statusCode = src.statusCode;
  if (src.infileBody != null && e.infileBody == null) e.infileBody = src.infileBody;
  if (src.infileBodySecondary != null && e.infileBodySecondary == null) {
    e.infileBodySecondary = src.infileBodySecondary;
  }
  if (src.infileAttempts != null && e.infileAttempts == null) e.infileAttempts = src.infileAttempts;
  if (src.infileUrl != null && e.infileUrl == null) e.infileUrl = src.infileUrl;
  if (src.infileStep != null && e.infileStep == null) e.infileStep = src.infileStep;
  if (src.causeCode != null && e.causeCode == null) e.causeCode = src.causeCode;
  if (src.causeMessage != null && e.causeMessage == null) e.causeMessage = src.causeMessage;
  return e;
}

function summarizeInfileDetails(details) {
  if (!details || typeof details !== 'object') return '';
  const parsed = details.infileParsed;
  if (parsed && typeof parsed === 'object') {
    const parts = [];
    const codigo = String(parsed.codigo ?? parsed.codigo_error ?? '').trim();
    if (codigo && codigo !== '0') parts.push(`Código ${codigo}`);
    for (const key of ['mensaje', 'descripcion', 'Descripcion', 'error']) {
      const v = String(parsed[key] ?? '').trim();
      if (v) parts.push(v);
    }
    if (Array.isArray(parsed.descripcion_errores) && parsed.descripcion_errores.length) {
      const msgs = parsed.descripcion_errores
        .map((item) =>
          typeof item === 'object' && item
            ? String(item.mensaje_error || item.mensaje || '').trim()
            : String(item || '').trim()
        )
        .filter(Boolean);
      if (msgs.length) parts.push(msgs.join('; '));
    }
    if (parts.length) return parts.join(' — ');
  }
  const body = String(details.infileBody || '').trim();
  if (body) return body.length > 600 ? `${body.slice(0, 600)}…` : body;
  if (details.infileNetworkCode) {
    return `Red hacia Infile (${details.infileNetworkCode}${details.infileNetworkDetail ? `: ${details.infileNetworkDetail}` : ''})`;
  }
  return '';
}

function wrapInfileFetchError(fetchErr, url, step) {
  const cause = fetchErr?.cause;
  const causeCode = cause?.code || fetchErr?.code || null;
  const causeMessage = cause?.message || null;
  let message = fetchErr?.message || 'fetch failed';
  if (causeCode) {
    message = `${message} (${causeCode}${causeMessage ? `: ${causeMessage}` : ''})`;
  }
  return attachInfileMeta(new Error(message), {
    statusCode: 502,
    infileUrl: url,
    infileStep: step,
    causeCode,
    causeMessage,
  });
}

function httpInfileError(bodyText, statusCode, step) {
  const err = attachInfileMeta(new Error(parseInfileErrorBody(bodyText)), {
    statusCode: statusCode >= 400 && statusCode < 600 ? statusCode : 502,
    infileBody: bodyText,
    infileStep: step,
  });
  return err;
}

function bodyInfileError(bodyText, message, statusCode, step) {
  return attachInfileMeta(new Error(message || parseInfileErrorBody(bodyText)), {
    statusCode: statusCode ?? 502,
    infileBody: bodyText,
    infileStep: step,
  });
}

function mergeInfileErrors(primary, secondary) {
  if (!secondary) return primary;
  if (!primary) return secondary;
  const attempts = [];
  const pushAttempt = (err) => {
    if (!err) return;
    attempts.push({
      step: err.infileStep || null,
      message: err.message || null,
      statusCode: err.statusCode ?? null,
      infileUrl: err.infileUrl || null,
      causeCode: err.causeCode || null,
      infileBody: err.infileBody ? String(err.infileBody).slice(0, 8000) : null,
    });
  };
  pushAttempt(secondary);
  pushAttempt(primary);
  if (primary.infileBody == null && secondary.infileBody != null) {
    primary.infileBody = secondary.infileBody;
  }
  if (secondary.infileBody && primary.infileBody && secondary.infileBody !== primary.infileBody) {
    primary.infileBodySecondary = String(secondary.infileBody).slice(0, 8000);
  }
  primary.infileAttempts = attempts;
  return primary;
}

function buildFelApiErrorDetails(err, coddoc, correlativo) {
  const details = {
    statusCode: err.statusCode || 500,
    coddoc,
    correlativo,
  };
  const body = err.infileBody != null ? String(err.infileBody) : '';
  if (body) {
    details.infileBody = body.slice(0, 12000);
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === 'object') details.infileParsed = parsed;
    } catch {
      /* texto / XML */
    }
  }
  if (err.infileBodySecondary) details.infileBodySecondary = String(err.infileBodySecondary).slice(0, 12000);
  if (err.infileAttempts) details.infileAttempts = err.infileAttempts;
  if (err.infileUrl) details.infileUrl = err.infileUrl;
  if (err.infileStep) details.infileStep = err.infileStep;
  if (err.causeCode) details.infileNetworkCode = err.causeCode;
  if (err.causeMessage) details.infileNetworkDetail = err.causeMessage;
  return details;
}

module.exports = {
  attachInfileMeta,
  wrapInfileFetchError,
  httpInfileError,
  bodyInfileError,
  mergeInfileErrors,
  buildFelApiErrorDetails,
  summarizeInfileDetails,
};
