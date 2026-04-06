# Operations Notes

Gotchas, footguns, and non-obvious behaviour discovered while running this
stack in production. Read before deploying or debugging "I thought I turned
that off" issues.

## Always pass `--env-file .env` to docker compose

When you invoke compose with an explicit `-f` flag pointing at a file in a
subdirectory, **docker compose looks for `.env` next to the compose file**,
not in the directory you ran the command from. So this:

```bash
docker compose -f compose/default.yml up -d
```

…will look for `compose/.env`, find nothing, and silently fall back to every
`${VAR:-default}` default in `default.yml`. Your real `.env` at the repo root
is ignored. The symptom is "I configured `API_PORT=8891` but it bound to
8890" — and any other "I set this and it didn't take" puzzle.

**Always deploy with:**

```bash
docker compose --env-file .env -f compose/default.yml up -d
```

Or `cd compose && docker compose -f default.yml --env-file ../.env up -d`.
Either works; the explicit `--env-file` is the safer habit.

## The Management UI module toggles do not stop containers

The `/modules` page in the Management UI sets an `enabled` flag in the API.
**This flag is advisory metadata.** It does not stop the underlying Docker
container. The design intent is that each service polls the API and
short-circuits its own work loop when disabled (goes "dormant").

This means:

1. A service must be explicitly wired to read the toggle. If its code does
   not consult the modules API, the toggle does nothing for that service.
2. Containers always stay running. CPU, memory, and any unconditional
   network polls keep happening.
3. If a service is **not listed at all** in the modules API, the UI cannot
   express any opinion about it — it just runs forever.

When in doubt, verify with:

```bash
curl -s http://<host>:${API_PORT}/api/modules | jq '.modules[].id'
```

If the service you want to disable is not in that list, the UI toggle is
not your tool — use a compose profile or stop the container directly.

## OSINT notifier is opt-in via compose profile

`osint-notifier` polls third-party Telegram channels (Mannie Fabian,
חדשות 0404) for missile-launch reports and forwards classified hits to
Pushover. It is **noisy** and historically published at the same Pushover
priority as official Homefront Command alerts, which made third-party
chatter visually indistinguishable from real "event ended" notifications.

It is also **not registered in the modules API**, so the Management UI
toggle cannot reach it (see previous section).

The service is now gated behind a compose profile and **will not start by
default**. To enable it:

```bash
COMPOSE_PROFILES=osint docker compose --env-file .env -f compose/default.yml up -d
```

To stop it again, drop the profile and run `up -d` (compose will not
recreate services outside the active profile set), or stop the container
explicitly:

```bash
docker stop osint-notifier
docker update --restart=no osint-notifier
```

If you re-enable it, **set lower Pushover priorities** for OSINT-sourced
alerts than for official Oref alerts so they are clearly distinguishable on
your phone. The classification path lives in
`backend/osint-notifier/main.py` (`notify_missile`).

## Telegram bot — broadcast endpoint contract

`backend/telegram-bot/bot.py` runs **two things in one process**:

1. A reactive Telegram polling loop (`/status`, `/sitrep`, `/area`, etc.)
2. An aiohttp HTTP server on `${TELEGRAM_BOT_PORT:-8781}` exposing a
   broadcast endpoint that fans out to every subscriber.

This is the **only** process in the stack that holds `TELEGRAM_BOT_TOKEN`
and calls `api.telegram.org`. Any service that wants to push to Telegram
must go through this endpoint — do not add a second token holder.

### Endpoints

**`GET /health`**

Liveness + subscriber count.

```json
{"ok": true, "subscribers": 3}
```

**`POST /api/broadcast`**

Fans out a single message to every subscriber currently in
`data/telegram_subscribers.json`.

Request body:

```json
{
  "text": "<b>SITREP</b>\nbody text...",
  "source": "prompt-runner",
  "parse_mode": "HTML"
}
```

- `text` — required. Empty/whitespace returns 400.
- `source` — optional free-form tag, logged for debugging.
- `parse_mode` — optional, defaults to `HTML`. Set to `""` for plain text.

Response:

```json
{"ok": true, "delivered": 3, "failed": 0, "subscribers": 3}
```

Returns HTTP 200 if every send succeeded, 502 if any failed, 400 on
malformed input. A broadcast with zero subscribers returns 200 with
`delivered: 0` — the endpoint is working, you just have no recipients.

### Subscribers

Subscribers are written to `data/telegram_subscribers.json` (volume-mounted
in the container). A user becomes a subscriber by sending `/start` or
`/subscribe` to the bot in Telegram. They can leave with `/unsubscribe`.
There is no admin-side way to add subscribers; this is intentional — the
bot only delivers to chats that have explicitly opted in.

If `/api/broadcast` returns `delivered: 0` and you expected delivery, the
fix is almost always "open the bot in Telegram and send `/start`."

### Known callers

- `backend/prompt-runner/app.py` — scheduled SITREPs and on-demand template
  runs with `deliver_to: ["telegram"]`.
- `api/src/lib/telegram.ts` — Management UI "send to Telegram" actions.

Both use the same payload shape documented above. If you add a new caller,
match this shape rather than inventing a new one.
