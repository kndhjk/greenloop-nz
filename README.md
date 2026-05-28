# GreenLoop NZ

GreenLoop NZ is a full-stack student-first circular commerce platform for New Zealand campuses. The core idea is simple: students should be able to buy, sell, reserve, chat, arrange pickup, request support services, and even explore jobs without bouncing across multiple disconnected tools.

This repository currently reflects a working MVP focused on the University of Auckland flow. Registration is restricted by allowed student email domains, trust signals are built into listings and chat, and the product combines marketplace behavior with logistics, community, and opportunity discovery.

## Product positioning

GreenLoop is designed around common student pain points:

- moving into or out of accommodation
- buying and selling second-hand furniture, desks, chairs, electronics, and kitchen items
- reducing trust friction between strangers
- arranging pickup, delivery, and lightweight support services
- keeping useful campus-side features such as community posts and job discovery in the same product

In practice, GreenLoop sits between:

- a campus marketplace
- a trust and verification layer
- a lightweight service coordination tool
- a student opportunities board

## Main user flows

1. Register with a student email, verify the account by code, and sign in.
2. Browse listings or publish an item with images, videos, condition, pickup windows, and delivery options.
3. Open an item page, review seller trust signals, then reserve the item or start a chat.
4. Manage reservations, complete or cancel them, and keep all listing-related messages in one place.
5. Request delivery, cleaning, repair, room design suggestions, or donation routing when needed.
6. Explore jobs and internships, upload a PDF resume, and get a resume-to-job matching result.
7. Use admin pages to manage verification status, users, and audit activity.

## Core features

### 1. Identity and trust

- student email restriction via `ALLOWED_STUDENT_DOMAINS`
- email verification code flow for new registrations
- JWT-based authenticated sessions
- seller verification state shown across listings, seller pages, and chat
- activity logging for key user and admin actions

### 2. Marketplace

- listing creation with title, description, category, price, location, condition, media, pickup windows, and delivery options
- marketplace filtering by keyword, category, location, price range, and condition
- item detail pages with related listings
- seller profile pages with listing and completion stats

### 3. Reservation and messaging

- reserve an available item with pickup time and note
- state transitions for reservations: `pending`, `confirmed`, `completed`, `cancelled`
- one conversation per buyer-item pair
- per-thread unread counts and presence indicators
- image messages in chat
- conversation deletion

### 4. Services and circular add-ons

- delivery request submission with fee estimation
- service request submission for operational support
- room design recommendation flow based on uploaded room image and budget/style preference
- donation routing for items that should be given to partner organizations instead of sold

### 5. Community and engagement

- campus community posts with optional topic and image
- dashboard summary with listings, reservations, notifications, and membership state
- premium membership upgrade flow

### 6. Jobs and resume matching

- opportunities board for internships, volunteer work, and other openings
- cached jobs feed exposed through `/api/jobs`
- PDF resume upload
- resume parsing via `pdf-parse`
- heuristic resume-to-job matching and improvement suggestions

### 7. Admin operations

- verification queue for pending users
- user search, create, update, and delete
- verification approval/rejection
- activity log inspection
- platform summary totals

## Frontend pages

The app is served as static pages from `public/` by the Express server. The main routes include:

- `/` home page
- `/marketplace` listings browser
- `/item` item detail page
- `/seller` seller profile
- `/sell` create listing flow
- `/chat` buyer-seller messaging
- `/dashboard` signed-in user overview
- `/services` service requests
- `/opportunities` jobs and internships
- `/community` campus feed
- `/login`, `/register`, `/forgot-password`, `/reset-password`
- `/admin` and `/admin/verifications`

## Backend API overview

The backend is a single Express app in `server.js`. Major route groups include:

- Auth:
  - `/api/auth/register/start`
  - `/api/auth/register/verify`
  - `/api/auth/login`
  - `/api/auth/forgot-password`
  - `/api/auth/reset-password`
  - `/api/auth/me`

- Marketplace and trust:
  - `/api/items`
  - `/api/items/:id`
  - `/api/sellers/:id`
  - `/api/reservations`
  - `/api/reservations/mine`
  - `/api/reservations/:id/status`

- Chat:
  - `/api/chats/start`
  - `/api/chats`
  - `/api/chats/presence`
  - `/api/chats/:id/messages`
  - `/api/chats/:id`

- Services and circular flows:
  - `/api/deliveries`
  - `/api/services`
  - `/api/room-design`
  - `/api/donations`

- Community and dashboard:
  - `/api/dashboard`
  - `/api/community/posts`
  - `/api/activity/track`

- Jobs and analytics:
  - `/api/opportunities`
  - `/api/jobs`
  - `/api/jobs/match`
  - `/api/jobs/refresh`
  - `/api/stats`

- Admin:
  - `/api/admin/summary`
  - `/api/admin/verification-queue`
  - `/api/admin/users`
  - `/api/admin/users/:id`
  - `/api/admin/users/:id/verification`
  - `/api/admin/activity`

## Tech stack

- Frontend: vanilla HTML, CSS, and JavaScript
- Backend: Node.js + Express
- Database: MySQL
- Authentication: JWT + `bcryptjs`
- File uploads: `multer`
- Email: `nodemailer`
- Resume parsing: `pdf-parse`

There is no frontend build step. The server renders static files directly and exposes JSON APIs from the same process.

## Repository structure

```text
.
|- public/                 Frontend pages, styles, and client scripts
|- uploads/                Runtime upload directory (tracked only with .gitkeep)
|- server.js               Main Express server and API surface
|- package.json            Runtime dependencies and start script
|- package-lock.json
|- .env.example            Required environment variables
`- README.md
```

## Environment variables

The repository includes `.env.example`. Key variables are:

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port for the Express app |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | MySQL connection |
| `JWT_SECRET` | JWT signing secret |
| `ALLOWED_STUDENT_DOMAINS` | student email allowlist |
| `REGISTRATION_CODE_TTL_MINUTES` | registration code lifetime |
| `ADMIN_EMAILS` | emails treated as admin accounts |
| `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD`, `ADMIN_BOOTSTRAP_NAME` | bootstrap admin configuration |
| `EXPOSE_RESET_LINKS` | whether password-reset links are returned in API responses |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME` | outbound email configuration |
| `PUBLIC_BASE_URL` | public origin used in generated links |

## Local development

### Prerequisites

- Node.js 18+ recommended
- MySQL 8+ recommended
- a writable local `uploads/` directory
- SMTP credentials if you want real email delivery

### Run locally

1. Copy `.env.example` to `.env`
2. Fill in the database, JWT, and SMTP values
3. Install dependencies:

```bash
npm install
```

4. Start the app:

```bash
npm start
```

5. Open:

```text
http://localhost:5001
```

## Deployment notes

- GreenLoop is currently structured as a single-service Node application.
- Static frontend pages and API routes are served by the same Express process.
- User uploads are stored on local disk under `uploads/`.
- The app is designed to run on its own port and its own MySQL database/user rather than being mixed into another service.

## Current project status

This repository is best understood as a vertical prototype / MVP with real product breadth:

- marketplace
- trust and verification
- buyer-seller messaging
- logistics/service requests
- community
- jobs and resume matching
- admin tooling

It is feature-rich at the product level, but still pragmatic in engineering shape. For example, the current repository does not yet include a formal migration system, Docker setup, or automated test suite. The focus so far has been delivering a working end-to-end product.

## Summary

GreenLoop NZ is not just a second-hand listings site. It is a campus-focused circular commerce platform that combines marketplace transactions, trust, logistics, lightweight services, and opportunities into a single student workflow.
