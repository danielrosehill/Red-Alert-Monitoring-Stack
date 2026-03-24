Help the user create a dedicated MQTT user in their Mosquitto broker for the Red Alert stack.

## Steps

### 1. Determine Broker Location
Ask: "Is your Mosquitto broker running as a Docker container, a system service, or on a dedicated device (like a Raspberry Pi)?"

### 2. Create Password File (if not already using one)
If the broker currently uses `allow_anonymous true`:

Explain that we need to:
1. Create a password file with a dedicated `redalert` user
2. Update `mosquitto.conf` to require authentication

**For Docker-based Mosquitto:**
```bash
# Generate password file inside the container
docker exec -it mosquitto mosquitto_passwd -c /mosquitto/config/passwd redalert
# (enter password when prompted)

# If you need to add more users later (without -c to avoid overwriting):
docker exec -it mosquitto mosquitto_passwd /mosquitto/config/passwd <username>
```

**For system Mosquitto:**
```bash
sudo mosquitto_passwd -c /etc/mosquitto/passwd redalert
```

### 3. Update Mosquitto Configuration
The config needs these lines:
```
allow_anonymous false
password_file /mosquitto/config/passwd
```

If using the bundled broker in this stack, update `mosquitto/mosquitto.conf` in this repo.

If using an external broker, guide the user to their broker's config file location.

### 4. Restart the Broker
- Docker: `docker restart mosquitto`
- System: `sudo systemctl restart mosquitto`

### 5. Update .env
Set in `.env`:
```
MQTT_USER=redalert
MQTT_PASSWORD=<the password they chose>
```

### 6. Test Connection
```bash
# If mosquitto-clients is installed:
mosquitto_pub -h <broker-ip> -u redalert -P <password> -t "test/redalert" -m "hello"
mosquitto_sub -h <broker-ip> -u redalert -P <password> -t "test/redalert"
```

### 7. Remind About Other Clients
If the broker was previously open (anonymous), warn that other MQTT clients (Home Assistant, Zigbee2MQTT, etc.) will also need credentials now. Help the user create users for those services too if needed.
