# Home Assistant Integration

The actuator sets an `input_select` entity in Home Assistant to reflect the
current alert state. HA automations then handle all physical actuation — lights,
sirens, TTS, etc.

## Setup

### 1. Create the input_select entity

Add to your HA `configuration.yaml`:

```yaml
input_select:
  red_alert_state:
    name: Red Alert State
    options:
      - idle
      - warning
      - active
      - clear
      - threshold_50
      - threshold_100
      - threshold_200
      - threshold_300
      - threshold_400
      - threshold_500
      - threshold_600
      - threshold_700
      - threshold_800
      - threshold_900
      - threshold_1000
    initial: idle
```

### 2. Create a long-lived access token

In HA: Profile → Long-Lived Access Tokens → Create Token

Set it as `HASS_TOKEN` in your `.env`.

### 3. Configure the actuator

```env
HASS_HOST=http://10.0.0.3:8123
HASS_TOKEN=your_long_lived_token_here
HASS_ENTITY=input_select.red_alert_state   # default, can be customized
```

### 4. Write automations

See `example_automations.yaml` for a template you can adapt. All entity IDs,
device names, and area names should be replaced with your own.

## States

| State | Meaning | Typical HA Response |
|-------|---------|-------------------|
| `idle` | No alerts, normal operation | Restore lights to previous state |
| `warning` | Early warning for local area (cat 14) | Flash lights orange, sirens on, TTS announcement |
| `active` | Active alert for local area (cats 1-12) | Flash lights red, sirens on, TTS "seek shelter" |
| `clear` | All-clear for local area (cat 13) | Lights green, sirens off, TTS "all clear" |
| `threshold_N` | N+ areas under alert nationwide | TTS informational announcement |

The actuator automatically returns to `idle` after 2 minutes of no activity.
