# CMI CAMEROUN — Dynamic Website Starter

This project is a full-stack starter for CMI CAMEROUN with:

- Responsive landing page
- Product categories
- Customer order / quote form
- SQLite customer database
- Order database
- AI customer-support endpoint
- Admin dashboard
- AI-generated customer emails
- SMTP email sending when configured
- Customer/message/email logs
- Google review section with rating, public review excerpts and a Leave a Review button
- Google Maps link for the Akwa location

## 1. Install

Install Node.js 20+.

```bash
npm install
```

Copy `.env.example` to `.env` and set:

- `SESSION_SECRET`
- `ADMIN_PASSWORD`

For AI support:
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

For actual email sending:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `MAIL_FROM`

## 2. Run

```bash
npm start
```

Open:

- Public website: http://localhost:3000
- Admin: http://localhost:3000/admin.html

## 3. Important production notes

1. Use HTTPS.
2. Set a strong random session secret and admin password.
3. Do not put API keys in browser JavaScript.
4. Use a real production session store instead of the default memory store.
5. Configure SMTP before expecting AI emails to actually leave the server.
6. Add rate limiting, CSRF protection, validation, audit logging and backups before production use.
7. Connect the product table to the real CMI inventory/catalogue before showing prices or stock.
8. The AI is instructed not to invent stock, prices or delivery promises.

## Business details used

CMI CAMEROUN publicly describes itself as a supplier of cables and electrical equipment, with categories including electrical cables, power-supply equipment, panels/components and lighting/appliances.

The site currently uses public contact information for the Akwa agency and other published agency information. Verify all contact details before production deployment.
