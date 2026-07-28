/**
 * Cliente WebAuthn / passkeys (registro tras login y acceso biométrico).
 */
const WebAuthnClient = {
  isSupported() {
    return typeof window !== 'undefined'
      && window.PublicKeyCredential
      && typeof navigator.credentials?.create === 'function'
      && typeof navigator.credentials?.get === 'function';
  },

  bufferToBase64url(buffer) {
    const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer || buffer);
    let str = '';
    bytes.forEach((b) => {
      str += String.fromCharCode(b);
    });
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  },

  base64urlToBuffer(value) {
    const pad = '='.repeat((4 - (String(value).length % 4)) % 4);
    const b64 = String(value).replace(/-/g, '+').replace(/_/g, '/') + pad;
    const raw = atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
    return out.buffer;
  },

  prepareCreateOptions(options) {
    const pub = { ...options };
    pub.challenge = this.base64urlToBuffer(options.challenge);
    if (pub.user?.id) pub.user = { ...pub.user, id: this.base64urlToBuffer(pub.user.id) };
    if (Array.isArray(pub.excludeCredentials)) {
      pub.excludeCredentials = pub.excludeCredentials.map((c) => ({
        ...c,
        id: this.base64urlToBuffer(c.id),
      }));
    }
    return pub;
  },

  prepareGetOptions(options) {
    const pub = { ...options };
    pub.challenge = this.base64urlToBuffer(options.challenge);
    if (Array.isArray(pub.allowCredentials)) {
      pub.allowCredentials = pub.allowCredentials.map((c) => ({
        ...c,
        id: this.base64urlToBuffer(c.id),
      }));
    }
    return pub;
  },

  serializeCredential(cred) {
    if (!cred) return null;
    const response = cred.response;
    const out = {
      id: cred.id,
      rawId: this.bufferToBase64url(cred.rawId),
      type: cred.type,
      clientExtensionResults: cred.getClientExtensionResults?.() || {},
      response: {},
    };
    if (response.clientDataJSON) {
      out.response.clientDataJSON = this.bufferToBase64url(response.clientDataJSON);
    }
    if (response.attestationObject) {
      out.response.attestationObject = this.bufferToBase64url(response.attestationObject);
      out.response.transports = response.getTransports?.() || [];
    }
    if (response.authenticatorData) {
      out.response.authenticatorData = this.bufferToBase64url(response.authenticatorData);
    }
    if (response.signature) {
      out.response.signature = this.bufferToBase64url(response.signature);
    }
    if (response.userHandle) {
      out.response.userHandle = this.bufferToBase64url(response.userHandle);
    }
    return out;
  },

  async offerRegisterAfterLogin(auth) {
    if (!this.isSupported()) return;
    if (auth?.user?.superUser) return;
    if (String(auth?.permiteBiometrico || 'NO').trim().toUpperCase() !== 'SI') return;
    if (!auth?.webauthnRegToken || !auth?.user?.codempleado) return;
    // Si ya tiene passkey, no insistir en cada login
    if (auth.hasPasskey) return;

    const confirm = typeof CatalogosUI !== 'undefined' && CatalogosUI.fireConfirm
      ? await CatalogosUI.fireConfirm({
          title: '¿Registrar huella / passkey?',
          html: '<p class="mb-0 text-start">Podrá iniciar sesión en este dispositivo con Windows Hello, huella o Face ID. Puede omitirlo y seguir usando contraseña.</p>',
          icon: 'question',
          confirmText: 'Registrar',
          confirmClass: 'btn-success',
        })
      : window.confirm('¿Registrar huella / passkey de este dispositivo?');
    if (!confirm) return;

    try {
      await this.register({
        empnit: F.getEmpNit() || auth.empnit,
        codempleado: auth.user.codempleado,
        usuario: auth.user.usuario,
        regToken: auth.webauthnRegToken,
      });
      F.toast('Passkey registrado en este dispositivo', 'success');
    } catch (err) {
      if (err?.name === 'NotAllowedError') {
        F.toast('Registro de passkey cancelado', 'warning');
        return;
      }
      F.toast(err.message || 'No se pudo registrar el passkey', 'error');
    }
  },

  async register({ empnit, codempleado, usuario, regToken }) {
    const start = await F.fetchJson('/api/auth/webauthn/register-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empnit, codempleado, usuario, regToken }),
    });
    const cred = await navigator.credentials.create({
      publicKey: this.prepareCreateOptions(start.options),
    });
    if (!cred) throw new Error('No se obtuvo credencial del dispositivo');
    return F.fetchJson('/api/auth/webauthn/register-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: start.challengeId,
        regToken,
        response: this.serializeCredential(cred),
      }),
    });
  },

  async login({ empnit, usuario }) {
    const start = await F.fetchJson('/api/auth/webauthn/login-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        empnit,
        ...(usuario ? { usuario } : {}),
      }),
    });
    const assertion = await navigator.credentials.get({
      publicKey: this.prepareGetOptions(start.options),
      mediation: 'optional',
    });
    if (!assertion) throw new Error('No se obtuvo autenticación del dispositivo');
    return F.fetchJson('/api/auth/webauthn/login-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: start.challengeId,
        response: this.serializeCredential(assertion),
      }),
    });
  },
};
