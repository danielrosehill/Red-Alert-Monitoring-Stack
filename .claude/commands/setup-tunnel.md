Help the user set up a Cloudflare Tunnel for secure remote access to the Red Alert stack.

## Why Cloudflare Tunnel?

The stack exposes several web UIs (Geodash :8083, Management :8888, InfluxDB :8086, MCP :8786) that are only accessible on the local network by default. Cloudflare Tunnel provides:

- **Secure remote access** without opening ports on your router
- **Authentication** via Cloudflare Access (email OTP, Google, GitHub, etc.)
- **HTTPS** with automatic TLS certificates
- **DDoS protection** included
- **Free tier** covers personal use

## Steps

### 1. Prerequisites
- A Cloudflare account (free: https://dash.cloudflare.com/sign-up)
- A domain name added to Cloudflare (can be any domain you own)
- `cloudflared` CLI installed on the Docker host

Ask: "Do you have a Cloudflare account and a domain managed by Cloudflare? If not, I'll help you set that up first."

### 2. Install cloudflared

**Ubuntu/Debian:**
```bash
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
```

**Or via Docker** (can be added to docker-compose):
```bash
docker pull cloudflare/cloudflared:latest
```

### 3. Authenticate
```bash
cloudflared tunnel login
```
This opens a browser to authorize cloudflared with your Cloudflare account.

### 4. Create the Tunnel
```bash
cloudflared tunnel create red-alert
```
Note the tunnel ID and credentials file path from the output.

### 5. Configure Routes
Ask the user which services they want accessible remotely. Recommended setup:

Create `cloudflared/config.yml`:
```yaml
tunnel: <tunnel-id>
credentials-file: /root/.cloudflared/<tunnel-id>.json

ingress:
  # Management UI
  - hostname: redalert.yourdomain.com
    service: http://localhost:8888
  # Geodash dashboard
  - hostname: redalertdash.yourdomain.com
    service: http://localhost:8083
  # MCP Server (for remote AI agent access)
  - hostname: redalertmcp.yourdomain.com
    service: http://localhost:8786
  # Catch-all (required)
  - service: http_status:404
```

Ask the user for their domain name and confirm the subdomain pattern above (redalert / redalertdash / redalertmcp).

### 6. Create DNS Records
```bash
cloudflared tunnel route dns red-alert redalert.yourdomain.com
cloudflared tunnel route dns red-alert redalertdash.yourdomain.com
cloudflared tunnel route dns red-alert redalertmcp.yourdomain.com
```

### 7. Set Up Cloudflare Access (Authentication)
This is the critical security step. Go to the Cloudflare Zero Trust dashboard:
1. **Access** > **Applications** > **Add an application**
2. Choose "Self-hosted"
3. Set the application domain (e.g., `redalert.yourdomain.com`)
4. Add an access policy:
   - **Policy name:** "Red Alert Users"
   - **Action:** Allow
   - **Include rule:** Emails ending in `@yourdomain.com` (or specific email addresses)
5. Repeat for each subdomain

Recommended auth methods:
- **One-time PIN (email)** — simplest, no third-party dependency
- **Google/GitHub OAuth** — convenient if the user already uses these
- **IP-based bypass** — optionally allow the home network through without auth

### 8. Run the Tunnel

**As a system service (recommended):**
```bash
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

**Or add to docker-compose** — the user can add this to their compose file:
```yaml
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared
    restart: unless-stopped
    command: tunnel run
    volumes:
      - ./cloudflared:/etc/cloudflared:ro
    networks:
      - redalert
```

### 9. Verify
```bash
cloudflared tunnel info red-alert
```
Then visit `https://redalert.yourdomain.com` — should show Cloudflare Access login, then the management UI.

### 10. Security Notes
- **Never expose InfluxDB** publicly unless behind Access — it has default credentials in dev mode
- The **MCP server** has no built-in auth — Cloudflare Access protects it
- Consider setting up **service tokens** if you want automated/API access through the tunnel
- Review Access audit logs periodically in the Zero Trust dashboard
