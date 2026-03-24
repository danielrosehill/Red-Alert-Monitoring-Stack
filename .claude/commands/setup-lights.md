Help the user choose which smart lights to include in Red Alert automations and configure the MQTT topics.

## Steps

### 1. Identify Light Platform
Ask: "What controls your smart lights?"
- **Zigbee2MQTT** — most common for Zigbee bulbs/strips
- **Tasmota** — common for WiFi-based devices
- **Home Assistant MQTT** — if HA publishes light state to MQTT
- **Other** — ask for details

### 2. List Available Lights
Help the user find their light MQTT topics:

**For Zigbee2MQTT:**
```bash
# Subscribe to all Zigbee2MQTT topics to see device names
mosquitto_sub -h <broker-ip> -u <user> -P <pass> -t "zigbee2mqtt/#" -v
```
The user should toggle a light to see which topic fires. Light control topics follow the pattern `zigbee2mqtt/<friendly-name>/set`.

**For Tasmota:**
```bash
mosquitto_sub -h <broker-ip> -u <user> -P <pass> -t "tasmota/#" -v
```
Tasmota typically uses `cmnd/<device-name>/Color` for RGB control.

### 3. Choose Lights for Alerts
Ask the user: "Which lights should change color during alerts? List the rooms or device names."

Recommend:
- Living room / common area lights (visible from most of the home)
- Hallway or corridor lights (visible when moving to shelter)
- Bedroom lights (visible at night)

Advise against:
- Outdoor lights (may not be useful for shelter alerts)
- Lights in the safe room itself (better controlled separately)

### 4. Verify MQTT Payload Format
The actuator sends this JSON payload format:
```json
{"color": {"r": 255, "g": 0, "b": 0}}
```

Check if the user's lights accept this format. For Zigbee2MQTT, this is standard. For Tasmota or other platforms, the user may need to customize the `COLORS` dictionary in `actuator/actuator.py`.

### 5. Configure .env
Build the comma-separated topic list and set it:
```
MQTT_LIGHT_TOPICS=zigbee2mqtt/living_room_bulb/set,zigbee2mqtt/hallway_strip/set,zigbee2mqtt/bedroom_lamp/set
```

### 6. Test
After the stack is running, test with a manual MQTT publish:
```bash
mosquitto_pub -h <broker-ip> -u <user> -P <pass> \
  -t "zigbee2mqtt/<light-name>/set" \
  -m '{"color": {"r": 255, "g": 0, "b": 0}}'
```
The light should turn red. Then send green and off to confirm the full cycle works.

### 7. Note About Customization
If the user wants different colors, timing, or payload formats, they can edit `actuator/actuator.py` directly — the `COLORS` dictionary at the top of the file and the `LIGHT_RESTORE_AFTER` env var control the behavior.
