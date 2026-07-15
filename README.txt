Thermia Online for Homey

Monitor and control your Thermia heat pump directly from Homey, using your
Thermia Online account (the same login as the Thermia Online app and
online.thermia.se). No extra hardware or gateway required.

This is an unofficial, community-built app and is not affiliated with or
endorsed by Thermia / Danfoss.

Features
- Live readings: outdoor, supply line, return line, brine in, brine out and
  hot water temperature.
- Operational status and operation mode.
- Set the room temperature (heat curve offset).
- Turn hot water production and hot water boost on/off.
- Flow cards: trigger on operational status change, service reminders when
  compressor or hot water hours exceed a chosen value, conditions for status
  and hot water, and actions to set temperature and hot water.

Supported models
Developed and tested with Thermia Atlas (NCP 1033) on the classic Thermia
Online platform. Other Thermia models that work with Thermia Online should
work too, but are not yet verified.

Setup
Add the device in Homey and sign in with your Thermia Online email and
password. The heat pump is polled every 5 minutes.

Privacy
Your Thermia credentials are stored on your Homey and used only to
authenticate against Thermia Online. Nothing is sent anywhere else.
