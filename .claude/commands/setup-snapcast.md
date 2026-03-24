Help the user configure Snapcast whole-house audio for TTS alert announcements.

## Steps

### 1. Check for Existing Snapcast Server
Ask: "Do you already have a Snapcast server running on your network? If so, what's its IP address?"

If no existing server, explain:
- Snapcast is a multi-room synchronous audio solution
- The server receives audio (via a FIFO pipe) and streams to Snapcast clients
- Clients can be phones (Android app), Raspberry Pis, or desktop apps
- Installation: https://github.com/badaix/snapcast

### 2. Identify FIFO Pipe Path
The actuator writes raw PCM audio to a FIFO pipe that Snapcast reads from.

**Default path:** `/tmp/snapfifo`

Ask: "Where is your Snapcast FIFO pipe? The default is `/tmp/snapfifo`."

If the user doesn't know, check:
```bash
# Look for the pipe
ls -la /tmp/snapfifo
# Or check Snapcast server config
cat /etc/snapserver.conf | grep source
```

The Snapcast server config should have a source like:
```
source = pipe:///tmp/snapfifo?name=RedAlert&sampleformat=48000:16:1
```

### 3. Configure Snapcast Source (if needed)
If the user needs to add a new source for Red Alert, add to `/etc/snapserver.conf`:
```
[stream]
source = pipe:///tmp/snapfifo?name=Red Alert&sampleformat=24000:16:1
```

Then restart: `sudo systemctl restart snapserver`

**Note:** The TTS audio from OpenAI (tts-1 model, WAV format) is 24000 Hz, 16-bit, mono. The sample format in the Snapcast source must match.

### 4. Choose Snapcast Speakers
Ask: "Which Snapcast clients/speakers should play the alert announcements?"

The user can configure which clients receive the Red Alert stream via:
- Snapcast Android app (group management)
- Snapcast web interface (if running snapweb)
- `snapclient` CLI on each device

Recommend:
- All indoor speakers for maximum coverage
- Particularly speakers near bedrooms (for night alerts)
- Consider volume levels — alerts should be audible but not startling at night

### 5. Generate TTS Audio Files
The actuator uses pre-recorded WAV files (not live TTS). Generate them once:

```bash
OPENAI_API_KEY=<your-key> python actuator/generate_audio.py
```

This creates WAV files in `actuator/audio/`:
- `red_alert.wav` — "Red alert. Active threat detected. Seek shelter immediately."
- `early_warning.wav` — "Early warning. Alerts are expected shortly..."
- `all_clear.wav` — "All clear. The event has ended..."
- `threshold_100.wav` through `threshold_1000.wav` — Nationwide alerts

If the user doesn't have an OpenAI API key, they can record their own WAV files (24000 Hz, 16-bit, mono PCM) and place them in `actuator/audio/`.

### 6. Update .env
```
SNAPCAST_FIFO=/tmp/snapfifo
TTS_ENABLED=true
TTS_COOLDOWN=60
```

`TTS_COOLDOWN` prevents the same message from repeating within N seconds.

### 7. Test
After starting the stack:
```bash
# Write a test tone to the FIFO
dd if=/dev/urandom bs=48000 count=2 > /tmp/snapfifo
```
You should hear white noise from the Snapcast speakers. If not, check:
- The FIFO pipe exists and is writable
- The Snapcast server is reading from the correct source
- The clients are connected to the correct group

### 8. Docker Volume Mount
The actuator container mounts the FIFO from the host:
```yaml
volumes:
  - ${SNAPCAST_FIFO:-/tmp/snapfifo}:/tmp/snapfifo
```
The host path is set by `SNAPCAST_FIFO` in `.env`. The Snapcast server must be running on the same host (or the pipe must be accessible from the Docker host).
