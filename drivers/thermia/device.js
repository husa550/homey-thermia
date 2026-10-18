'use strict';

const Homey = require('homey');
const ThermiaClient = require('../../lib/ThermiaClient');

const POLL_INTERVAL = 5 * 60 * 1000; // 5 min

class ThermiaDevice extends Homey.Device {
  async onInit() {
    const { email, password } = this.getStore();
    this.client = new ThermiaClient(email, password);
    this.deviceId = this.getData().id;
    this._control = {};
    this._setpointRegisterId = null;
    this._lastStatus = null;
    this._lastHours = { compressor: null, hotwater: null };
    this._statusTrigger = this.homey.flow.getDeviceTriggerCard('operational_status_changed');
    this._compHoursTrigger = this.homey.flow.getDeviceTriggerCard('compressor_hours_above');
    this._hwHoursTrigger = this.homey.flow.getDeviceTriggerCard('hotwater_hours_above');

    // Styrning
    if (this.hasCapability('target_temperature')) {
      this.registerCapabilityListener('target_temperature', (v) => this.setRoomTemperature(v));
    }
    this.registerCapabilityListener('hotwater_status', (v) => this._setSwitch('hotwater_status', v));
    this.registerCapabilityListener('hotwater_boost', (v) => this._setSwitch('hotwater_boost', v));

    await this._poll();
    this._timer = this.homey.setInterval(() => this._poll().catch((e) => this.error(e)), POLL_INTERVAL);
  }

  async _poll() {
    let d;
    try {
      d = await this.client.getMeasurements(this.deviceId);
    } catch (e) {
      this.error('Poll misslyckades:', e.message);
      await this.setUnavailable(e.message).catch(() => {});
      return;
    }

    const set = async (cap, val) => {
      if (val != null && this.hasCapability(cap)) {
        await this.setCapabilityValue(cap, val).catch((e) => this.error(cap, e.message));
      }
    };

    const t = d.temperatures || {};
    await set('measure_temperature', t.outdoor);
    await set('measure_temperature.supply', t.supply);
    await set('measure_temperature.return', t.return);
    await set('measure_temperature.brine_in', t.brine_in);
    await set('measure_temperature.brine_out', t.brine_out);
    await set('measure_temperature.hotwater', t.hotwater);
    await set('thermia_status', d.status);
    if (d.status != null) {
      if (this._lastStatus !== null && d.status !== this._lastStatus) {
        this._statusTrigger.trigger(this, { status: d.status }).catch((e) => this.error(e));
      }
      this._lastStatus = d.status;
    }
    await set('thermia_opmode', d.operationMode);

    const hrs = d.hours || {};
    this._checkHours(this._compHoursTrigger, 'compressor', hrs.compressor);
    this._checkHours(this._hwHoursTrigger, 'hotwater', hrs.hotwater);

    if (d.setpoint) {
      this._setpointRegisterId = d.setpoint.registerId;
      await set('target_temperature', d.setpoint.value);
    }

    this._control = d.control || {};
    if (this._control.hotwater_status) await set('hotwater_status', this._control.hotwater_status.value);
    if (this._control.hotwater_boost) await set('hotwater_boost', this._control.hotwater_boost.value);

    if (!this.getAvailable()) await this.setAvailable().catch(() => {});
  }

  _checkHours(card, key, value) {
    if (value == null) return;
    const prev = this._lastHours[key];
    this._lastHours[key] = value;
    if (prev != null && value > prev) {
      card.trigger(this, { hours: value }, { value, previous: prev }).catch((e) => this.error(e));
    }
  }

  async setRoomTemperature(value) {
    if (this._setpointRegisterId == null) throw new Error('Borvarde stods inte av pumpen.');
    const v = Math.round(value);
    await this.client.setRegister(this.deviceId, this._setpointRegisterId, v);
    if (this.hasCapability('target_temperature')) await this.setCapabilityValue('target_temperature', v).catch(() => {});
  }

  async setHotwater(on) { return this._setSwitch('hotwater_status', on); }

  async setHotwaterBoost(on) { return this._setSwitch('hotwater_boost', on); }

  async _setSwitch(key, value) {
    const c = this._control && this._control[key];
    if (!c) throw new Error('Reglaget stods inte av pumpen.');
    await this.client.setRegister(this.deviceId, c.registerId, value ? 1 : 0);
    if (this.hasCapability(key)) await this.setCapabilityValue(key, !!value).catch(() => {});
  }

  onDeleted() {
    if (this._timer) this.homey.clearInterval(this._timer);
  }
}

module.exports = ThermiaDevice;
