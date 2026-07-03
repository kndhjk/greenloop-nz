# GreenLoop NZ

Live prototype: [https://4.155.227.179/](https://4.155.227.179/)

Public HTTPS now terminates on the standard `443` entrypoint and proxies to the GreenLoop app running only on internal `127.0.0.1:5001`.

GreenLoop NZ is a student-first circular commerce MVP for New Zealand campuses. The product combines a second-hand marketplace, reservation and chat flows, lightweight operations support, campus opportunities, external NZ jobs discovery, resume matching, and admin moderation in one Node.js application.

This repository reflects the current MVP shape more accurately than the earlier GitHub copy:

- the marketplace, auth, chat, community, services, opportunity, support, and admin flows live in this repo
- the external NZ jobs feed is cache-bound inside this repo
- the crawler that refreshes that jobs cache runs separately

Direct LinkedIn scraping is not part of the current checked-in implementation. The active jobs experience in GreenLoop now reads a cached NZ jobs feed and exposes it through `/api/jobs`.

## What is in this repo

- Express server in `server.js`
- static frontend pages in `public/`
- MySQL-backed auth, marketplace, admin, and workflow data
- PDF resume upload and resume-to-job ranking
- admin inboxes for verification, operations, support, and opportunity applications

## Current product scope

### Identity and trust

- student email allowlist via `ALLOWED_STUDENT_DOMAINS`
- registration verification code flow
- JWT-based authentication
- admin bootstrap account support
- seller verification status shown across the product
- activity logging for key user and admin actions

### Marketplace

- create listings with price, condition, pickup windows, delivery options, images, and optional video
- browse and filter listings by keyword, category, location, price, and condition
- seller pages, item pages, and related listing suggestions
- reserve, confirm, complete, or cancel item pickup flows

### Messaging and engagement

- buyer-seller chat with unread counts and image messages
- dashboard summary for listings, reservations, and notifications
- community posting
- membership upgrade flow

### Services and circular operations

- delivery request submission
- service request submission
- room design recommendation flow
- donation routing flow
- support request form that writes directly into the admin workflow

### Opportunities and jobs

- campus opportunities posted and managed by admins
- student applications to opportunities with optional PDF CV upload
- external NZ jobs feed exposed through `/api/jobs`
- `/api/jobs/refresh` starts the external scraper process configured by `JOB_SCRAPER_DIR`
- resume parsing with `pdf-parse`
- heuristic resume-to-job ranking and suggestions through `/api/jobs/match`

### Admin

- verification queue
- user create, update, delete, and verification actions
- marketplace listing moderation
- operations inbox for reservations, delivery, service, and donation requests
- support inbox
- opportunity creation, editing, deletion, and application review
- activity log

## Important implementation changes

These are the changes that now matter most for anyone reading the repo:

- Jobs are no longer described as an in-process scraper inside `server.js`. The app reads a cache file from `JOB_CACHE_FILE`.
- The active external jobs pipeline is cache-bound and Seek-oriented. It is not a direct LinkedIn integration.
- Opportunity posting is now admin-only.
- Opportunity applications are stored separately and surfaced in the admin hiring inbox.
- Resume uploads are authenticated, PDF-only, and capped at 10 MB.
- General uploads are restricted to common image and video types instead of accepting broad MIME groups.
- Help, privacy, trust, and terms pages are first-class routes in the Express app.
- The GitHub Actions workflow now runs repository checks instead of pretending the app is a static GitHub Pages site.

## Security and hardening reflected in the repo

- `x-powered-by` is disabled
- basic response hardening headers are set:
  - `Content-Security-Policy`
  - `Permissions-Policy`
  - `Referrer-Policy`
  - `X-Content-Type-Options`
  - `X-Frame-Options`
- the app can bind to `HOST=127.0.0.1` so public traffic is expected to come through nginx or Caddy instead of hitting Express directly
- the public deployment path is `80/443` only; port `5001` should stay private behind the reverse proxy and firewall
- resume uploads require authentication
- upload validation is stricter for both media and resumes
- admin-only routes are enforced for user moderation and opportunity management

## Jobs architecture

GreenLoop's jobs UI and GreenLoop's jobs crawler are intentionally separated.

Inside this repo:

- `GET /api/jobs` reads `JOB_CACHE_FILE`
- `POST /api/jobs/refresh` starts the configured scraper entrypoint in `JOB_SCRAPER_DIR`
- `POST /api/jobs/match` ranks cached jobs against an uploaded PDF resume

Outside this repo:

- the actual crawler process refreshes `jobs.json`
- that crawler can change independently when external sites change markup, route shape, or anti-bot behavior

This split exists because the external jobs source proved too unstable to treat as a normal in-process fetch.

## Environment variables

The repository includes `.env.example`. The most important variables are:

| Variable | Purpose |
| --- | --- |
| `PORT` | Express port |
| `HOST` | Express bind address. Use `127.0.0.1` behind a reverse proxy. |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | MySQL connection |
| `JWT_SECRET` | JWT signing secret |
| `ALLOWED_STUDENT_DOMAINS` | student email allowlist |
| `REGISTRATION_CODE_TTL_MINUTES` | verification code lifetime |
| `ADMIN_EMAILS` | users treated as admins |
| `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD`, `ADMIN_BOOTSTRAP_NAME` | bootstrap admin account |
| `EXPOSE_RESET_LINKS` | exposes reset links in API responses for development |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME` | outbound email config |
| `SUPPORT_EMAIL` | support contact returned by `/api/support` |
| `PUBLIC_BASE_URL` | origin used in generated links |
| `JOB_CACHE_FILE` | path to the cached external jobs JSON file |
| `JOB_SCRAPER_DIR` | directory containing the external scraper |
| `JOB_SCRAPER_ENTRY` | scraper entry file, usually `app.py` |
| `JOB_SCRAPER_LOCK_MAX_AGE_MS` | stale lock timeout for background refreshes |

## Local development

### Prerequisites

- Node.js 18+ recommended
- MySQL 8+ recommended
- writable `uploads/` directory
- SMTP credentials if you want real email delivery
- optional separate jobs scraper checkout if you want `/api/jobs/refresh` to work end-to-end

### Run locally

1. Copy `.env.example` to `.env`.
2. Fill in database, JWT, and email values.
3. If you want jobs refresh to work, point `JOB_CACHE_FILE` and `JOB_SCRAPER_DIR` at your external scraper checkout.
4. Install dependencies:

```bash
npm install
```

5. Run syntax checks:

```bash
npm run check
```

6. Start the server:

```bash
npm start
```

7. Open `http://localhost:5001`

## Production deployment notes

For a public deployment, GreenLoop is meant to sit behind a reverse proxy instead of exposing the Node port directly.

- set `HOST=127.0.0.1`
- set `PUBLIC_BASE_URL` to your public `https://` origin
- terminate TLS at nginx or Caddy on `443` and proxy to `http://127.0.0.1:5001`
- leave only `80/443` reachable from the public internet and keep `5001` firewalled off
- if you deploy on a raw public IP instead of a DNS name, plan for an IP-capable ACME issuance flow and shorter certificate renewal windows

## Repository structure

```text
.
|- .github/workflows/       GitHub Actions checks
|- public/                  Static frontend pages and client scripts
|- uploads/                 Runtime upload directory
|- server.js                Main Express app and API surface
|- package.json             Runtime dependencies and scripts
|- package-lock.json
|- .env.example
`- README.md
```

## Challenges encountered

These are the real implementation problems that affected the product and the repository:

### 1. External jobs sources were unstable

The hardest recent issue was the jobs pipeline. External NZ jobs pages changed route patterns and began returning anti-bot responses, including Cloudflare-style `403` behavior for the old fetch path. That made the original lightweight scraping approach unreliable.

Result:

- GreenLoop had to move to a cache-bound jobs model
- the crawler had to become a separate concern
- the README needed to stop implying that jobs data was just a simple in-app fetch

### 2. Repo drift happened as features grew

The frontend expanded faster than the single `server.js` backend file. Over time, pages for support, opportunity applications, and admin workflows expected APIs that were not clearly documented or fully reflected in the repository snapshot.

Result:

- the GitHub copy fell behind the actual intended product behavior
- some flows looked present in the UI but were under-documented or incomplete server-side

### 3. MVP speed created operational debt

GreenLoop covers a lot of product surface:

- marketplace
- messaging
- ops requests
- support
- jobs
- resume matching
- admin tooling

That breadth is useful for demonstrating the concept, but it also means the project still carries MVP tradeoffs:

- no formal migration framework
- no containerized deployment path
- no automated test suite beyond basic repo checks
- a single large application file instead of deeper modularization

### 4. Security and product trust had to be tightened after the fact

As support pages, uploads, and admin tools became more real, the repository needed better upload controls, route protection, and documentation about what is actually protected versus what is still prototype-grade.

### 5. IP-only HTTPS deployment needed extra operational work

Running the live prototype directly on a public server IP instead of a normal hostname made HTTPS and service exposure less forgiving. The Node app needed to move behind a reverse proxy, generated links needed an explicit public base URL, and certificate renewal assumptions had to be documented more clearly.

Result:

- the public entrypoint is now `https://4.155.227.179/` on `443`
- the Express app should stay bound to `127.0.0.1:5001`
- deployment docs now distinguish the public HTTPS edge from the internal application port

## Current status

GreenLoop NZ is a working vertical prototype with real breadth, not a production-hardened marketplace. The repository now better reflects that reality:

- broad end-to-end product coverage exists
- the jobs stack is explicitly split between app and crawler
- admin/support/opportunity flows are clearer
- GitHub documentation is aligned more closely with the current implementation

## Next sensible improvements

- split `server.js` into modules
- add migrations
- add real integration tests
- add a dedicated deployment workflow for the Node app
- document the external jobs scraper repository alongside this one
