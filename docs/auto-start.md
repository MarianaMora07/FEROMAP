# Arranque automático al boot (EC2 stop/start)

**Objetivo:** tras un `stop`/`start` de la instancia EC2 (EventBridge/Lambda), el stack FEROMAP sube solo sin SSH manual.

**Mecanismo:** unidad **systemd** `feromap.service` → `scripts/boot-stack.sh` → `scripts/compose.sh up -d`.

---

## Respuestas de inspección del repo (EC2 Debian 13)

| # | Pregunta | Respuesta |
|---|----------|-----------|
| 1 | ¿Podman o Docker? | **Podman** es el runtime documentado y preferido (`scripts/compose.sh` prueba `podman compose` primero). Docker Compose también funciona si está instalado. En esta máquina de desarrollo: Podman 5.x. |
| 2 | ¿Ruta del proyecto y compose? | Raíz del clone (ej. `/home/<user>/FEROMAP`). Archivos: `compose.yml` + `compose.prod.yml` (prod) vía `COMPOSE_ENV=prod`. |
| 3 | ¿Usuario del servicio? | **Usuario de deploy** (no root): quien posee el repo y ejecuta `just`/`compose.sh`. El instalador usa `$SUDO_USER` por defecto. Rootless Podman requiere `loginctl enable-linger` (el instalador lo hace). |
| 4 | ¿`.env`, volúmenes, migraciones? | **`.env`** obligatorio en la raíz (`cp .env.ec2.example .env`). **Volúmenes:** `postgres_data/`, `data/` persisten en disco — no se pierden en stop/start. **Migraciones:** `alembic upgrade head` en cada arranque (idempotente, seguro). **No** ejecutar `seed` en cada boot (solo primera vez con `just setup-prod`). |
| 5 | ¿Comando canónico? | Producción: `COMPOSE_ENV=prod ./scripts/compose.sh up -d` o `just up-prod`. El servicio systemd usa `scripts/boot-stack.sh start` (wrap + health + migrate). |

---

## Qué hace `boot-stack.sh start`

1. Espera a que `podman compose` / `docker compose` responda (reintentos).
2. `compose.sh up -d` (respeta `restart: unless-stopped` de los servicios).
3. Espera PostgreSQL (`pg_isready`).
4. `alembic upgrade head` en el contenedor API (opcional con `BOOT_SKIP_MIGRATE=1`).
5. Healthcheck HTTP: `http://127.0.0.1:${API_PORT}/health` y UI en `${FRONTEND_PORT}`.

**No hace:** `seed`, `rebuild`, `git pull` (eso sigue siendo deploy manual: `just deploy`).

---

## Instalación en la EC2 (una vez)

Prerrequisitos en la instancia:

- Clone del repo con `.env` de producción ya configurado.
- Primera puesta en marcha completada: `just setup-prod` (o equivalente).
- Podman + `podman compose` (o Docker Compose).
- `curl`, `just` opcional (el boot **no** depende de `just`).

```bash
cd /ruta/a/FEROMAP

# Ajustar si el repo no está en el home del usuario que hace deploy
export FEROMAP_ROOT=/home/debian/FEROMAP   # opcional
export FEROMAP_USER=debian                  # opcional (default: quien ejecuta sudo)

sudo bash deploy/systemd/install-auto-start.sh
```

Habilita y deja listo:

- `/etc/systemd/system/feromap.service`
- `/etc/default/feromap`
- `systemctl enable feroomap`

---

## Comandos operativos

```bash
# Estado del servicio
sudo systemctl status feroomap

# Arranque manual (misma lógica que el boot)
sudo systemctl start feroomap

# Parada ordenada (compose stop, conserva volúmenes)
sudo systemctl stop feroomap

# Logs del último boot
journalctl -u feroomap -b -n 100 --no-pager

# Seguimiento en vivo
journalctl -u feroomap -f

# Probar script sin systemd
COMPOSE_ENV=prod ./scripts/boot-stack.sh start
./scripts/boot-stack.sh health
```

### Desinstalar

```bash
sudo bash deploy/systemd/uninstall-auto-start.sh
```

---

## Pruebas

### 1. Reinicio lógico del servicio (sin reboot de VM)

```bash
sudo systemctl restart feroomap
sudo systemctl status feroomap
curl -sf http://127.0.0.1:8000/health
curl -sf -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/
```

Respuesta esperada API: `{"status":"ok",...}` · UI: `200`.

### 2. Simular fallo y reintentos

```bash
sudo systemctl stop feroomap
# Detener podman a propósito y start — debe fallar con límite StartLimitBurst=3
journalctl -u feroomap -n 30
```

### 3. Stop/start real de EC2 (AWS)

1. Consola AWS → EC2 → **Stop instance** (no Terminate).
2. Esperar estado `stopped`.
3. **Start instance**.
4. SSH (o Session Manager) tras ~2–5 min:

```bash
sudo systemctl status feroomap
journalctl -u feroomap -b -n 80 --no-pager
curl -sf http://127.0.0.1:8080/health    # vía Nginx prod
curl -sf http://127.0.0.1:8000/health    # API directa
```

5. Desde fuera: `http://<IP_PUBLICA>:8080/` (security group debe permitir 8080).

---

## Checklist post-reboot / post-start EC2

- [ ] `systemctl is-enabled feroomap` → `enabled`
- [ ] `systemctl status feroomap` → `active (exited)` y `ExecStart` exitoso
- [ ] `podman ps` (o `docker ps`) → `feromap-db`, `feromap-api`, `feromap-frontend` **Up**
- [ ] `curl http://127.0.0.1:8000/health` → OK
- [ ] `curl http://127.0.0.1:8080/` → 200
- [ ] Login demo en `/login` funciona
- [ ] `journalctl -u feroomap -b` sin `ERROR` en healthcheck

---

## Troubleshooting

| Síntoma | Causa probable | Acción |
|---------|----------------|--------|
| `failed` al instante | Sin `.env` o `DB_PASSWORD` vacío | Crear/editar `.env`, `sudo systemctl start feroomap` |
| Timeout en PostgreSQL | Disco lento / primera vez tras cold start | Aumentar `BOOT_DB_WAIT_ATTEMPTS` en `/etc/default/feromap` |
| Podman rootless: `cannot connect` | Sin linger o sin socket | `sudo loginctl enable-linger <user>`; reloguear; reinstalar unidad |
| Health API falla | API aún migrando o puerto distinto | Revisar `API_PORT` en `.env`; `podman logs feroomap-api` |
| UI falla, API OK | Nginx frontend | `podman logs feroomap-frontend` |
| Bucle de reinicios | App rota | `StartLimitBurst=3` para el servicio; revisar `journalctl -u feroomap` |

### Variables opcionales (`/etc/default/feromap`)

```bash
BOOT_SKIP_MIGRATE=1              # omitir alembic en cada boot
BOOT_RUNTIME_WAIT_ATTEMPTS=45
BOOT_DB_WAIT_ATTEMPTS=60
BOOT_HEALTH_ATTEMPTS=40
```

Tras cambios: `sudo systemctl daemon-reload && sudo systemctl restart feroomap`.

---

## Unidad systemd final (plantilla)

Ver `deploy/systemd/feromap.service`. Tras instalar, inspeccionar la versión renderizada:

```bash
systemctl cat feroomap
```

---

## Relación con deploy manual

| Acción | Comando habitual | ¿En boot automático? |
|--------|------------------|----------------------|
| Levantar stack | `just up-prod` | Sí (`up -d`) |
| Migrar | `just migrate` | Sí |
| Seed | `just seed` | **No** (solo setup inicial) |
| Rebuild imágenes | `just deploy` / `rebuild-prod` | **No** |
| Health | `just health` | Sí (curl en boot-stack) |

El flujo manual de deploy **no cambia**; systemd solo garantiza que tras un encendido de la VM el stack vuelva a estar arriba.
