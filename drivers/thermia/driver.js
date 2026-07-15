'use strict';

const Homey = require('homey');
const ThermiaClient = require('../../lib/ThermiaClient');

class ThermiaDriver extends Homey.Driver {
  async onInit() {
    this.log('Thermia-driver initierad');
    const flow = this.homey.flow;

    const hoursCrossed = async (args, state) => (
      state.value >= args.hours && (state.previous == null || state.previous < args.hours)
    );
    flow.getDeviceTriggerCard('compressor_hours_above').registerRunListener(hoursCrossed);
    flow.getDeviceTriggerCard('hotwater_hours_above').registerRunListener(hoursCrossed);

    flow.getConditionCard('operational_status_is').registerRunListener(async (args) => {
      const current = args.device.getCapabilityValue('thermia_status') || '';
      return current.toLowerCase().trim() === String(args.status || '').toLowerCase().trim();
    });

    flow.getConditionCard('hotwater_is_on').registerRunListener(async (args) => {
      return args.device.getCapabilityValue('hotwater_status') === true;
    });

    flow.getActionCard('set_room_temperature').registerRunListener(async (args) => {
      await args.device.setRoomTemperature(args.temperature);
    });

    flow.getActionCard('set_hotwater').registerRunListener(async (args) => {
      await args.device.setHotwater(args.mode === 'on');
    });

    flow.getActionCard('set_hotwater_boost').registerRunListener(async (args) => {
      await args.device.setHotwaterBoost(args.mode === 'on');
    });
  }

  onPair(session) {
    let creds = null;

    session.setHandler('login', async ({ username, password }) => {
      const client = new ThermiaClient(username, password);
      // Kastar om inloggningen misslyckas -> visas for anvandaren
      await client.getDevices();
      creds = { username, password };
      return true;
    });

    session.setHandler('list_devices', async () => {
      const client = new ThermiaClient(creds.username, creds.password);
      const devices = await client.getDevices();
      return devices.map((d) => ({
        name: 'Thermia ' + (d.name || d.model || d.id),
        data: { id: String(d.id) },
        store: { email: creds.username, password: creds.password },
      }));
    });
  }
}

module.exports = ThermiaDriver;
