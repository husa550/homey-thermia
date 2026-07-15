'use strict';

const Homey = require('homey');

class ThermiaApp extends Homey.App {
  async onInit() {
    this.log('Thermia Online-appen ar igang');
  }
}

module.exports = ThermiaApp;
