# Thermia Online for Homey

Monitor and control your **Thermia heat pump** directly from [Homey](https://homey.app),
using your Thermia Online account (the same login as the Thermia Online app and
[online.thermia.se](https://online.thermia.se)). **No extra hardware or gateway required.**

> ⚠️ Unofficial, community-built app. Not affiliated with or endorsed by Thermia / Danfoss.

## Features

- **Live readings:** outdoor, supply line, return line, brine in, brine out and hot water temperature
- **Operational status** and operation mode
- **Set the room temperature** (heat curve offset)
- **Turn hot water** production and **hot water boost** on/off
- **Flow cards:**
  - Trigger: operational status changed
  - Trigger: compressor / hot water hours exceed a chosen value (service reminders)
  - Conditions: operational status is / hot water is on
  - Actions: set room temperature, turn hot water / boost on/off

## Supported models

Developed and tested with **Thermia Atlas (NCP 1033)** on the classic Thermia Online
platform. Other Thermia models available in Thermia Online should work too, but are
not yet verified. If you have another model, testing and feedback are very welcome.

## Installation

Available in the Homey App Store (pending certification). For development:

```bash
git clone https://github.com/husa550/homey-thermia.git
cd homey-thermia
npm install
homey app run
```

Then add the device in Homey and sign in with your Thermia Online email and password.

## How it works

The app authenticates against Thermia Online (Azure AD B2C) and polls the heat pump
every 5 minutes, mapping the register values to Homey capabilities. Control writes go
back to the same API.

## Privacy

Your Thermia credentials are stored on your Homey and used only to authenticate against
Thermia Online. Nothing is sent anywhere else.

## Credits

Authentication flow ported to Node.js from the excellent
[python-thermia-online-api](https://github.com/klejejs/python-thermia-online-api)
by klejejs.

## License

[MIT](LICENSE)
