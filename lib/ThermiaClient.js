'use strict';

/**
 * ThermiaClient — Node-klient for Thermia Online (Azure B2C, PKCE).
 * Portad fran klejejs/python-thermia-online-api. Verifierad mot Thermia Atlas / NCP 1033.
 * Ingen tredjepartsberoende — anvander Node global fetch + crypto (Node 18.14+).
 */

const crypto = require('crypto');

// Homey Pro (2019) kor Node 12 utan global fetch -> fall tillbaka pa node-fetch.
const fetch = global.fetch || require('node-fetch');

const THERMIA_CONFIG_URL = 'https://online.thermia.se/api/configuration';
const AUTH = 'https://thermialogin.b2clogin.com/thermialogin.onmicrosoft.com/b2c_1a_signuporsigninonline';
const CLIENT_ID = '09ea4903-9e95-45fe-ae1f-e3b7d32fa385';
const REDIRECT_URI = 'https://online.thermia.se/login';
const POLICY = 'B2C_1A_SignUpOrSigninOnline';
const AUTHORIZE_URL = AUTH + '/oauth2/v2.0/authorize';
const TOKEN_URL = AUTH + '/oauth2/v2.0/token';
const SELF_ASSERTED_URL = AUTH + '/SelfAsserted';
const CONFIRM_URL = AUTH + '/api/CombinedSigninAndSignup/confirmed';

// Registernamn -> nyckel i vart data-objekt
const TEMP_MAP = {
  REG_OUTDOOR_TEMPERATURE: 'outdoor',
  REG_SUPPLY_LINE: 'supply',
  REG_OPER_DATA_RETURN: 'return',
  REG_BRINE_IN: 'brine_in',
  REG_BRINE_OUT: 'brine_out',
  REG_HOT_WATER_TEMPERATURE: 'hotwater',
};

class CookieJar {
  constructor() { this.jar = {}; }
  store(res) {
    let list = [];
    if (typeof res.headers.getSetCookie === 'function') list = res.headers.getSetCookie();  // Node 18+
    else if (typeof res.headers.raw === 'function') list = res.headers.raw()['set-cookie'] || [];  // node-fetch v2
    else { const h = res.headers.get('set-cookie'); if (h) list = [h]; }
    for (const c of list) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      if (i > -1) this.jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
    }
  }
  header() { return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; '); }
}

function base64Url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomVerifier(len) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

class ThermiaClient {
  constructor(email, password) {
    this.email = email;
    this.password = password;
    this.token = null;
    this.tokenValidTo = 0;
    this.apiBase = null;
  }

  async _ensureAuth() {
    if (this.token && Date.now() / 1000 < this.tokenValidTo - 60) return;
    if (!this.apiBase) {
      const cfg = await (await fetch(THERMIA_CONFIG_URL)).json();
      this.apiBase = cfg.apiBaseUrl;
    }
    await this._authenticate();
  }

  async _authenticate() {
    const jar = new CookieJar();
    const verifier = randomVerifier(43);
    const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());

    const authParams = new URLSearchParams({
      client_id: CLIENT_ID, scope: CLIENT_ID, redirect_uri: REDIRECT_URI,
      response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256',
    });
    const authRes = await fetch(`${AUTHORIZE_URL}?${authParams}`, { redirect: 'manual' });
    jar.store(authRes);
    const html = await authRes.text();
    const raw = html.split('var SETTINGS = ')[1];
    if (!raw) throw new Error('Thermia: kunde inte lasa inloggningssidan (status ' + authRes.status + ')');
    const settings = JSON.parse(raw.split('};')[0] + '}');
    const state = String(settings.transId).split('=')[1];
    const csrf = settings.csrf;

    const saParams = new URLSearchParams({ tx: 'StateProperties=' + state, p: POLICY });
    const saRes = await fetch(`${SELF_ASSERTED_URL}?${saParams}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Csrf-Token': csrf, Cookie: jar.header(),
      },
      body: new URLSearchParams({ request_type: 'RESPONSE', signInName: this.email, password: this.password }),
    });
    jar.store(saRes);
    const saText = await saRes.text();
    if (saRes.status !== 200 || saText.includes('"status":"400"')) {
      throw new Error('Thermia: fel email eller losenord.');
    }

    const cParams = new URLSearchParams({ csrf_token: csrf, tx: 'StateProperties=' + state, p: POLICY });
    const cRes = await fetch(`${CONFIRM_URL}?${cParams}`, { headers: { Cookie: jar.header() }, redirect: 'manual' });
    const loc = cRes.headers.get('location');
    const code = loc ? new URL(loc).searchParams.get('code') : null;
    if (!code) throw new Error('Thermia: fick ingen authorization code.');

    const tRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: new URLSearchParams({
        client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, scope: CLIENT_ID,
        code, code_verifier: verifier, grant_type: 'authorization_code',
      }),
    });
    const td = await tRes.json();
    if (!td.access_token) throw new Error('Thermia: ingen access_token (' + JSON.stringify(td) + ')');
    this.token = td.access_token;
    this.tokenValidTo = Number(td.expires_on) || (Date.now() / 1000 + 3600);
  }

  async _get(pathname) {
    await this._ensureAuth();
    const res = await fetch(this.apiBase + pathname, {
      headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' },
    });
    if (res.status === 401) { this.token = null; await this._ensureAuth(); return this._get(pathname); }
    if (res.status !== 200) throw new Error(`Thermia GET ${pathname} -> ${res.status}`);
    return res.json();
  }

  async getDevices() {
    const info = await this._get('/api/v1/installationsInfo');
    return info.items || [];
  }

  async getStatus(deviceId) {
    try {
      return await this._get(`/api/v1/installationstatus/${deviceId}/status`);
    } catch (e) { return {}; }
  }

  async _group(deviceId, group) {
    try {
      const r = await this._get(`/api/v1/Registers/Installations/${deviceId}/Groups/${group}`);
      return Array.isArray(r) ? r : [];
    } catch (e) { return []; }
  }

  static _decode(reg) {
    if (!reg) return null;
    const names = reg.valueNames || [];
    const match = names.find((n) => n.value === reg.registerValue);
    if (match && match.name) {
      return match.name.replace(/^REG_VALUE_/, '').replace(/^STATUS_/, '').replace(/_/g, ' ').toLowerCase();
    }
    return null;
  }

  /** Hamtar alla matvarden + borvarde + styrbara switchar for en enhet. */
  async getMeasurements(deviceId) {
    const [temps, opstatus, times, hotwater, status] = await Promise.all([
      this._group(deviceId, 'REG_GROUP_TEMPERATURES'),
      this._group(deviceId, 'REG_GROUP_OPERATIONAL_STATUS'),
      this._group(deviceId, 'REG_GROUP_OPERATIONAL_TIME'),
      this._group(deviceId, 'REG_GROUP_HOT_WATER'),
      this.getStatus(deviceId),
    ]);
    const byName = (list, name) => list.find((r) => r.registerName === name);

    const data = { temperatures: {}, hours: {}, control: {} };
    for (const r of temps) {
      if (TEMP_MAP[r.registerName]) data.temperatures[TEMP_MAP[r.registerName]] = r.registerValue;
    }
    // Status-endpoint ger palitligast ute-/varmvattentemp samt borvarde (heatingEffect)
    if (status.outdoorTemperature != null) data.temperatures.outdoor = status.outdoorTemperature;
    if (status.hotWaterTemperature != null) data.temperatures.hotwater = status.hotWaterTemperature;
    data.hotwaterActive = status.isHotWaterActive ?? status.isHotwaterActive ?? null;

    // Borvarde (kurv-offset). Skrivbart register = heatingEffectRegisters[1].
    const setpointReg = Array.isArray(status.heatingEffectRegisters) ? status.heatingEffectRegisters[1] : null;
    if (status.heatingEffect != null && setpointReg != null) {
      data.setpoint = { value: status.heatingEffect, registerId: setpointReg };
    }

    const opmode = byName(opstatus, 'REG_OPERATIONMODE');
    const stat = byName(opstatus, 'REG_OPERATIONAL_STATUS_PRIORITY_BITMASK');
    data.operationMode = ThermiaClient._decode(opmode) || (opmode ? String(opmode.registerValue) : null);
    data.status = ThermiaClient._decode(stat) || (stat ? String(stat.registerValue) : null);

    const comp = byName(times, 'REG_OPER_TIME_COMPRESSOR');
    const hw = byName(times, 'REG_OPER_TIME_HOT_WATER');
    if (comp) data.hours.compressor = comp.registerValue;
    if (hw) data.hours.hotwater = hw.registerValue;

    const hwStatus = byName(hotwater, 'REG_HOT_WATER_STATUS');
    const hwBoost = byName(hotwater, 'REG_HOT_WATER_BOOST');
    if (hwStatus) data.control.hotwater_status = { value: hwStatus.registerValue === 1, registerId: hwStatus.registerId };
    if (hwBoost) data.control.hotwater_boost = { value: hwBoost.registerValue === 1, registerId: hwBoost.registerId };

    return data;
  }

  async setRegister(deviceId, registerId, value) {
    await this._ensureAuth();
    const res = await fetch(`${this.apiBase}/api/v1/Registers/Installations/${deviceId}/Registers`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ registerSpecificationId: registerId, registerValue: value, clientUuid: 'homey-thermia' }),
    });
    if (res.status !== 200) throw new Error(`Thermia: kunde inte skriva register ${registerId} (${res.status})`);
  }
}

module.exports = ThermiaClient;
