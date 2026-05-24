# GreenLoop

GreenLoop is a New Zealand student-first second-hand marketplace inspired by the convenience loops of Xianyu, but localized for campus life: student verification, pickup scheduling, delivery add-ons, cleaning/repair requests, donation routing, and a jobs/volunteer board.

## Stack

- Frontend: static SPA in `public/`
- Backend: `Express`
- Database: `MySQL`
- Auth: email/password + JWT
- Uploads: local disk via `multer`

## Core modules

- Student identity verification at signup
- Item publishing, search, filter, and reservation
- Pickup scheduling with notification records
- Large-item delivery requests
- Cleaning and light-repair service requests
- AI-style room design recommendations from uploaded room photos
- Donation routing to partner organizations
- Internship / volunteer board
- Premium membership upgrades

## Local run

1. Copy `.env.example` to `.env`
2. Create the MySQL database and user
3. Run `npm install`
4. Run `npm start`
5. Open `http://localhost:5001`

## Server isolation

This project is designed to run independently on port `5001` with:

- its own folder
- its own MySQL database
- its own MySQL user
- its own upload directory

That keeps existing services untouched.
