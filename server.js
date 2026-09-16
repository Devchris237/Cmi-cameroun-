import express from "express";
import session from "express-session";
import Database from "better-sqlite3";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

const db = new Database(path.join(__dirname, "cmi.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  city TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  order_type TEXT NOT NULL DEFAULT 'quote',
  items_json TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(customer_id) REFERENCES customers(id)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  role TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS email_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "dev-only-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax" }
}));
app.use(express.static(path.join(__dirname, "public")));

const products = [
  { id: "cables", name: "Câbles électriques", category: "Câbles électriques", description: "Câbles basse et moyenne tension pour installations domestiques et professionnelles." },
  { id: "conduits", name: "Gaines & conduits", category: "Panneaux et composants", description: "Gaines annelées et solutions de protection pour vos installations." },
  { id: "switches", name: "Appareillage", category: "Éclairage et appareils", description: "Interrupteurs, prises, commandes et accessoires électriques." },
  { id: "lighting", name: "Éclairage", category: "Éclairage et appareils", description: "Solutions d'éclairage pour maisons, bureaux, commerces et chantiers." },
  { id: "generators", name: "Groupes électrogènes", category: "Appareils d’alimentation", description: "Solutions d'alimentation de secours adaptées aux besoins professionnels." }
];

function requireAdmin(req, res, next) {
  if (req.session?.admin) return next();
  res.status(401).json({ error: "Non autorisé" });
}

function findOrCreateCustomer({ name, email, phone, company, city }) {
  const normalizedEmail = (email || "").trim().toLowerCase();
  if (normalizedEmail) {
    const existing = db.prepare("SELECT * FROM customers WHERE email = ?").get(normalizedEmail);
    if (existing) return existing.id;
  }
  const result = db.prepare(`
    INSERT INTO customers (name,email,phone,company,city)
    VALUES (?,?,?,?,?)
  `).run(name.trim(), normalizedEmail || null, phone?.trim() || null, company?.trim() || null, city?.trim() || null);
  return result.lastInsertRowid;
}

async function askAI(prompt, context = "") {
  if (!process.env.OPENAI_API_KEY) {
    return "AI mode is not configured yet. Please contact CMI CAMEROUN directly at +237 690 380 214 or e-commerce@cmi-cameroun.com.";
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      input: [
        {
          role: "system",
          content: `You are the customer support assistant for CMI CAMEROUN, a Cameroon-based electrical equipment supplier.
Use only the business context supplied below. Do not invent prices, stock, warranties, delivery times, technical specifications, or policies.
If a customer needs an exact quote or stock confirmation, collect their details and tell them a human sales agent should confirm it.
Business context:
${context}`
        },
        { role: "user", content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(err);
    return "I’m unable to access AI support right now. Please contact our sales team directly.";
  }

  const data = await response.json();
  if (data.output_text) return data.output_text;

  const parts = [];
  for (const item of (data.output || [])) {
    for (const content of (item.content || [])) {
      if (content.text) parts.push(content.text);
    }
  }
  return parts.join("\n") || "Please contact our team for assistance.";
}

function getBusinessContext() {
  return `
CMI CAMEROUN SARL specializes in cables and electrical equipment, including low- and medium-voltage cables and industrial/domestic corrugated conduits.
Categories: power supply equipment, electrical cables, panels/components, lighting/appliances.
Known agencies: Akwa/Douala, Sable/Douala, Intendance/Yaoundé, Kribi, plus other listed locations.
Akwa contact: +237 690 380 214; e-commerce@cmi-cameroun.com; direction@cmi-cameroun.com.
General contact address: BP 9368 Douala, Cameroon. Akwa: Carrefour Porte Jaune / Imm. Facop.
General published hours: Mon-Fri 07:30-17:30; Sat 08:00-13:00.
The website should encourage customers to request a quote when an exact price or stock level is unknown.
`;
}

app.get("/api/products", (req, res) => res.json(products));

app.post("/api/orders", (req, res) => {
  const { name, email, phone, company, city, orderType = "quote", items = [], notes = "" } = req.body;
  if (!name || (!email && !phone)) {
    return res.status(400).json({ error: "Name and at least one contact method are required." });
  }

  const customerId = findOrCreateCustomer({ name, email, phone, company, city });
  const result = db.prepare(`
    INSERT INTO orders (customer_id, order_type, items_json, notes)
    VALUES (?,?,?,?)
  `).run(customerId, orderType, JSON.stringify(items), notes);

  res.json({ ok: true, orderId: result.lastInsertRowid });
});

app.post("/api/support", async (req, res) => {
  try {
    const { name = "Website visitor", email = "", phone = "", message } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required." });

    let customerId = null;
    if (name !== "Website visitor" || email || phone) {
      customerId = findOrCreateCustomer({ name, email, phone });
    }

    if (customerId) {
      db.prepare("INSERT INTO messages (customer_id,role,message) VALUES (?,?,?)")
        .run(customerId, "customer", message);
    }

    const answer = await askAI(message, getBusinessContext());

    if (customerId) {
      db.prepare("INSERT INTO messages (customer_id,role,message) VALUES (?,?,?)")
        .run(customerId, "assistant", answer);
    }

    res.json({ answer });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Support service unavailable." });
  }
});

app.post("/api/admin/login", (req, res) => {
  if (!process.env.ADMIN_PASSWORD || req.body.password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid password." });
  }
  req.session.admin = true;
  res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/admin/stats", requireAdmin, (req, res) => {
  const customers = db.prepare("SELECT COUNT(*) AS n FROM customers").get().n;
  const orders = db.prepare("SELECT COUNT(*) AS n FROM orders").get().n;
  const newOrders = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status='new'").get().n;
  const emails = db.prepare("SELECT COUNT(*) AS n FROM email_logs").get().n;
  res.json({ customers, orders, newOrders, emails });
});

app.get("/api/admin/orders", requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT o.*, c.name, c.email, c.phone, c.company, c.city
    FROM orders o LEFT JOIN customers c ON c.id=o.customer_id
    ORDER BY o.created_at DESC LIMIT 100
  `).all();
  res.json(rows);
});

app.get("/api/admin/customers", requireAdmin, (req, res) => {
  res.json(db.prepare("SELECT * FROM customers ORDER BY created_at DESC LIMIT 200").all());
});

function makeTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

app.post("/api/admin/ai-email", requireAdmin, async (req, res) => {
  try {
    const { customerId, goal } = req.body;
    const customer = db.prepare("SELECT * FROM customers WHERE id=?").get(customerId);
    if (!customer?.email) return res.status(400).json({ error: "Customer has no email." });

    const prompt = `Create a concise professional customer email for ${customer.name}.
Goal: ${goal || "follow up on their request"}.
Customer data: ${JSON.stringify(customer)}
Write a subject and body. Do not invent prices, stock, dates, promises, or policies.`;

    const generated = await askAI(prompt, getBusinessContext());
    let subject = "CMI CAMEROUN — Suite à votre demande";
    let body = generated;
    const match = generated.match(/subject\s*:\s*(.+?)(?:\n|$)/i);
    if (match) {
      subject = match[1].trim();
      body = generated.replace(match[0], "").trim();
    }

    const transporter = makeTransporter();
    if (!transporter) {
      const log = db.prepare(`
        INSERT INTO email_logs (customer_id,recipient,subject,body,status)
        VALUES (?,?,?,?,?)
      `).run(customer.id, customer.email, subject, body, "draft");
      return res.json({ ok: true, status: "draft", emailId: log.lastInsertRowid, subject, body });
    }

    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: customer.email,
      subject,
      text: body
    });

    const log = db.prepare(`
      INSERT INTO email_logs (customer_id,recipient,subject,body,status)
      VALUES (?,?,?,?,?)
    `).run(customer.id, customer.email, subject, body, "sent");

    res.json({ ok: true, status: "sent", emailId: log.lastInsertRowid, subject, body });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "AI email failed." });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`CMI site running on http://localhost:${PORT}`));
