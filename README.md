# SUHARA Returns Desk

[![CI](https://github.com/pradip2608/suhara-returns/actions/workflows/ci.yml/badge.svg)](https://github.com/pradip2608/suhara-returns/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/express-5-000000?logo=express)
![MongoDB](https://img.shields.io/badge/mongodb-7-47A248?logo=mongodb&logoColor=white)
![Docker](https://img.shields.io/badge/docker-ready-2496ED?logo=docker&logoColor=white)
![Kubernetes](https://img.shields.io/badge/kubernetes-manifests-326CE5?logo=kubernetes&logoColor=white)

A returns and exchange REST API for the **SUHARA** online store (suharawears.com). Orders are synced from Shopify via webhooks; customers file return or exchange requests with photos; staff review them and move them through a strict status workflow.

Built as a microservice with a container-first workflow: Docker, Docker Compose, Kubernetes manifests and a GitHub Actions pipeline that tests and publishes the image to Docker Hub.

## Features

- **Shopify webhook ingestion**: HMAC-verified, idempotent order sync.
- **Customer returns portal API**: look up an order by number and email, then file a *return* or *exchange* for a line item, with photo evidence (up to 5 MB per photo).
- **Enforced status workflow**: illegal transitions are rejected, and every change is recorded in the request history.
- **Role-based access control**: `admin` and `ops` staff roles, authenticated with JWT.
- **Return window**: configurable number of days after purchase (default 7).
- **Duplicate protection**: one open request per order line item.
- **Analytics**: returns grouped by SKU and reason.
- **Interactive API docs**: Swagger UI at `/docs` (OpenAPI 3).
- **Production hardening**: Helmet, request-size limits, non-root container, `tini` as PID 1, health and readiness probes.

## Tech stack

| Layer | Choice |
| --- | --- |
| Runtime | Node.js 22, Express 5 |
| Database | MongoDB 7 via Mongoose |
| Validation | Zod |
| Auth | JWT, bcryptjs |
| Uploads | Multer (stored on a volume or PVC) |
| Docs | swagger-ui-express, OpenAPI 3 |
| Tests | Jest, Supertest, mongodb-memory-server |
| Delivery | Docker (multi-stage), Docker Compose, Kubernetes, GitHub Actions |

## Return lifecycle

```
requested ──► approved ──► picked_up ──► received ──► refunded     (type: return)
    │                                          └────► exchanged    (type: exchange)
    └──────► rejected
```

Reasons: `size_too_small`, `size_too_large`, `color_mismatch`, `damaged`, `not_as_described`, `other`. An `exchange` request must include an `exchangeSize`.

## API overview

Base path: `/api/v1`. Full schemas are in Swagger UI at `/docs` and in [src/docs/openapi.yaml](src/docs/openapi.yaml).

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/healthz` | public | Liveness probe |
| GET | `/readyz` | public | Readiness probe (checks MongoDB) |
| POST | `/webhooks/shopify/orders` | Shopify HMAC | Ingest or update an order |
| GET | `/orders/:orderNumber` | customer (email must match) | Look up an order |
| POST | `/returns` | customer (multipart, photos) | File a return or exchange |
| POST | `/auth/login` | public | Get a JWT |
| GET | `/auth/me` | staff | Current user |
| POST | `/auth/users` | admin | Create a staff user |
| GET | `/returns` | admin, ops | Paginated list |
| GET | `/returns/:id` | admin, ops | Return detail and history |
| PATCH | `/returns/:id/status` | admin, ops | Advance the workflow |
| GET | `/analytics/returns-by-sku` | admin, ops | Return statistics |
| GET | `/uploads/*` | staff | Download return photos |

## Quick start

### Option 1: Docker Compose (recommended)

```bash
cp .env.example .env          # then edit the secrets
docker compose up -d --build
docker compose run --rm seed  # first run only: syncs indexes, creates the admin
```

- API: http://localhost:3000
- Swagger UI: http://localhost:3000/docs
- Optional DB browser: `docker compose --profile tools up -d mongo-express` (http://localhost:8081)

For hot reload during development:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

### Option 2: Run locally

Requires Node.js 20+ and a running MongoDB.

```bash
npm install
export MONGO_URI=mongodb://localhost:27017/suhara
export JWT_SECRET=some-long-random-string
export UPLOAD_DIR=./uploads
export ADMIN_EMAIL=admin@suhara.local ADMIN_PASSWORD=admin12345
npm run seed
npm run dev        # http://localhost:8001
```

`npm start` and `npm run dev` also load a `.env` file automatically if one exists.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `MONGO_URI` | required | MongoDB connection string |
| `JWT_SECRET` | required | Secret used to sign tokens |
| `JWT_EXPIRES_IN` | `8h` | Token lifetime |
| `SHOPIFY_WEBHOOK_SECRET` | empty | Shared secret for webhook HMAC verification |
| `PORT` | `8001` (`3000` in the container) | HTTP port |
| `UPLOAD_DIR` | `/app/uploads` | Where return photos are stored |
| `MAX_PHOTO_MB` | `5` | Max size per photo |
| `RETURN_WINDOW_DAYS` | `7` | Days after purchase a return may be filed |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | none | Used by the seed script |

See [.env.example](.env.example) for the Compose variables. `.env` is git-ignored, so never commit real secrets.

## Example: staff workflow

[token.sh](token.sh) logs in against a local API and exports `TOKEN` and `RID` (the first return's id):

```bash
source token.sh

curl -X PATCH "$API/api/v1/returns/$RID/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"approved"}'
```

## Testing

```bash
npm test
```

The suite uses an in-memory MongoDB and covers health checks, auth and RBAC, webhook signature checking and idempotency, the full returns lifecycle, validation, pagination, analytics, and photo access control.

## Kubernetes

Manifests live in [k8s/](k8s/) and are numbered in apply order: namespace, config, secret, MongoDB, uploads PVC, API, ingress, seed job, and an HPA.

```bash
kind create cluster --config k8s/kind-config.yaml
cp k8s/02-secret.example.yaml k8s/02-secret.yaml   # fill in real values (git-ignored)
kubectl apply -f k8s/
```

## CI/CD

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs on every push and pull request to `main`:

1. **test**: `npm ci` and `npm test` against a MongoDB service container.
2. **docker**: builds the image. Pull requests only build; pushes to `main` and `v*.*.*` tags also push to Docker Hub (`:latest`, `:sha-<short>`, `:<version>`).

Required repository secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`.

## Project structure

```
.
├── src/
│   ├── app.js, server.js, config.js, db.js
│   ├── routes/        auth, orders, returns, analytics, webhooks, health
│   ├── middleware/    auth (JWT + RBAC), upload, error handling
│   ├── models/        users, order, return
│   ├── scripts/seed.js
│   └── docs/openapi.yaml
├── tests/api.test.js
├── k8s/               Kubernetes manifests
├── Dockerfile         multi-stage, non-root, tini
├── docker-compose.yml / docker-compose.dev.yml
└── .github/workflows/ci.yml
```

## License

ISC
