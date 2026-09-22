# Self-Hosting Meterix

This guide explains how to run a complete Meterix instance on your own infrastructure using Docker and Docker Compose.

> **Note**: Meterix is designed to work with **Supabase Cloud** out of the box. Self-hosting is for teams that need to keep all data inside their own VPC or on-premise environment.

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Docker | 24+ |
| Docker Compose | v2 (included with Docker Desktop) |
| Git | any recent version |

---

## 1. Clone the repository

```bash
git clone https://github.com/ismail36-lab/agentmeter.git
cd agentmeter
```

---

## 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in **every REQUIRED variable**. At minimum you need:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL *or* use local Postgres |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous / public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (**server-side only, never expose publicly**) |
| `DATABASE_URL` | Full Postgres connection string for migrations |
| `NEXT_PUBLIC_APP_URL` | Public base URL of your deployment (e.g. `https://metrics.acme.com`) |
| `POSTGRES_PASSWORD` | Strong password for the local Postgres container |

See `.env.example` for a full list of optional variables (email, billing, rate limiting, etc.).

---

## 3. Choose a database backend

### Option A — Supabase Cloud (recommended)

Set `NEXT_PUBLIC_SUPABASE_URL` to your Supabase project URL and provide the matching keys. The local `postgres` service in `docker-compose.yml` will simply be unused.

### Option B — Local PostgreSQL (full self-host)

Use the bundled `postgres` service. The `docker-compose.yml` `migrate` service will automatically apply all SQL files in `supabase/migrations/` in alphabetical order when the stack starts.

Set `DATABASE_URL` to:
```
postgresql://meterix:${POSTGRES_PASSWORD}@postgres:5432/meterix
```

---

## 4. Start the stack

```bash
docker compose up -d
```

Docker will:
1. Build the Next.js app using the multi-stage `Dockerfile` (`deps → builder → runner`).
2. Start the `postgres` service and wait for it to be healthy.
3. Run the `migrate` service, which applies every `supabase/migrations/*.sql` file.
4. Start the `meterix` app once migrations complete.

Check logs:
```bash
docker compose logs -f meterix
docker compose logs migrate      # one-shot, exits after migrations
```

The app will be available at **http://localhost:3000**.

---

## 5. Updating to a new version

```bash
git pull origin main
docker compose build meterix     # rebuild the app image
docker compose up -d meterix     # rolling restart (migrations run automatically)
```

---

## 6. Stopping the stack

```bash
docker compose down              # stop containers (data volume preserved)
docker compose down -v           # stop + delete postgres_data volume (DELETES ALL DATA)
```

---

## 7. Architecture overview

```
+--------------------------------------+
|          Docker Compose stack        |
|                                      |
|  +--------------+   +-------------+  |
|  |   meterix    |-->|  postgres   |  |
|  |  (Next.js)   |   |  (pg 15)   |  |
|  |  port: 3000  |   | port: 5432  |  |
|  +--------------+   +------+------+  |
|          ^                  |        |
|          |           +------v------+  |
|          |           |   migrate   |  |
|          |           | (one-shot)  |  |
|          +-----------+             |  |
|                   meterix_net      |  |
+--------------------------------------+
```

---

## 8. Production hardening checklist

- [ ] Use a **reverse proxy** (nginx, Caddy, or Traefik) in front of port 3000 with TLS termination.
- [ ] Set a strong `POSTGRES_PASSWORD` — never use the default.
- [ ] Do **not** expose port 5432 to the internet (the compose file binds it to `127.0.0.1` by default).
- [ ] Store `.env` in a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.) — never commit it.
- [ ] Enable automated Postgres backups (e.g. `pg_dump` cron or a managed backup service).
- [ ] Set `CRON_SECRET` to a strong random string and configure your cron scheduler to use it.
- [ ] Review `SUPABASE_SERVICE_ROLE_KEY` — this key bypasses Row Level Security; treat it like a root password.

---

## 9. Test ingestion after deployment

```bash
curl -X POST http://localhost:3000/api/v1/ingest/edge \
  -H "Authorization: Bearer mx_live_<your-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "input_tokens": 1200,
    "output_tokens": 350,
    "cost": 0.0042,
    "prompt_version_id": "pv_v1_baseline"
  }'
```

Expected response:
```json
{ "success": true, "log_id": "<uuid>", "user_id": "<uuid>", "is_estimated": false }
```

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `meterix` exits with code 1 | Missing env vars | Check `docker compose logs meterix` |
| `migrate` fails | Postgres not ready | Increase `retries` in healthcheck |
| 401 on `/api/v1/ingest/edge` | Wrong API key | Verify key in Supabase `api_keys` table |
| 500 on ingest | `SUPABASE_SERVICE_ROLE_KEY` not set or anon key used | Set service role key in `.env` |

For further help, open an issue at https://github.com/ismail36-lab/agentmeter/issues
