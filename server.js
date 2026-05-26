require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");
const nodemailer = require("nodemailer");
const pdfParse = require("pdf-parse");

const app = express();
const PORT = Number(process.env.PORT || 5001);
const JWT_SECRET = process.env.JWT_SECRET || "change-me";
const ALLOWED_STUDENT_DOMAINS = String(process.env.ALLOWED_STUDENT_DOMAINS || "aucklanduni.ac.nz,auckland.ac.nz")
  .split(",")
  .map((v) => v.trim().toLowerCase())
  .filter(Boolean);
const REGISTRATION_CODE_TTL_MINUTES = Number(process.env.REGISTRATION_CODE_TTL_MINUTES || 10);
const ADMIN_BOOTSTRAP_EMAIL = String(process.env.ADMIN_BOOTSTRAP_EMAIL || "").trim().toLowerCase();
const ADMIN_EMAILS = Array.from(new Set(`${process.env.ADMIN_EMAILS || ""},${ADMIN_BOOTSTRAP_EMAIL}`
  .split(",")
  .map((v) => v.trim().toLowerCase())
  .filter(Boolean)));
const ADMIN_BOOTSTRAP_PASSWORD = String(process.env.ADMIN_BOOTSTRAP_PASSWORD || "");
const ADMIN_BOOTSTRAP_NAME = String(process.env.ADMIN_BOOTSTRAP_NAME || "GreenLoop Admin").trim();
const EXPOSE_RESET_LINKS = String(process.env.EXPOSE_RESET_LINKS || "0") === "1";
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${PORT}`).replace(/\/$/, "");
const normalizeOrigin = (value) => {
  try {
    return new URL(String(value || "").trim()).origin;
  } catch {
    return null;
  }
};
const PUBLIC_ORIGIN = normalizeOrigin(PUBLIC_BASE_URL);
const LOCAL_ORIGINS = [`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`];
const CORS_ALLOWED_ORIGINS = Array.from(
  new Set(
    [PUBLIC_ORIGIN, ...LOCAL_ORIGINS,
      ...String(process.env.CORS_ALLOWED_ORIGINS || "")
        .split(",")
        .map((v) => normalizeOrigin(v))
        .filter(Boolean),
    ].filter(Boolean)
  )
);
const shouldExposeQaResetLink = EXPOSE_RESET_LINKS && /^(http:\/\/localhost|http:\/\/127\.0\.0\.1)(:\d+)?$/i.test(PUBLIC_BASE_URL);
const SMTP_HOST = process.env.SMTP_HOST || "mail.mixport.co.nz";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "1") === "1";
const SMTP_USER = process.env.SMTP_USER || "noreply@mixport.co.nz";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || "GreenLoop NZ";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "mzha585@aucklanduni.ac.nz";
const JOB_CACHE_FILE = process.env.JOB_CACHE_FILE || "/home/destiny/will-have-job/jobs.json";
const JOB_SCRAPER_DIR = process.env.JOB_SCRAPER_DIR || "/home/destiny/will-have-job";
const JOB_SCRAPER_ENTRY = process.env.JOB_SCRAPER_ENTRY || "app.py";
const JOB_SCRAPER_LOCK = path.join(JOB_SCRAPER_DIR, "scrape.lock");
const JOB_SCRAPER_LOCK_MAX_AGE_MS = Number(process.env.JOB_SCRAPER_LOCK_MAX_AGE_MS || 30 * 60 * 1000);
const CHAT_ONLINE_WINDOW_SECONDS = Number(process.env.CHAT_ONLINE_WINDOW_SECONDS || 60);
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);
const ALLOWED_UPLOAD_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf"]);

const uploadsDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "greenloop_app",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "greenloop",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${path.extname(file.originalname || "")}`;
      cb(null, safe);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(String(file.mimetype || "").toLowerCase()) || !ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
      return cb(new Error("Only JPG, PNG, GIF, WebP, or PDF files are allowed."));
    }
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.disable("x-powered-by");
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || !CORS_ALLOWED_ORIGINS.length || CORS_ALLOWED_ORIGINS.includes(origin)) {
        return cb(null, true);
      }
      return cb(null, false);
    },
    optionsSuccessStatus: 204,
  })
);
app.use((req, res, next) => {
  res.vary("Origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self' https: data: blob:; img-src 'self' https: data: blob:; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline' https:; connect-src 'self' https:; font-src 'self' https: data:; frame-ancestors 'self'; base-uri 'self'; form-action 'self';"
  );
  const noIndexPrefixes = ["/api/", "/admin", "/dashboard", "/chat", "/login", "/register", "/forgot-password", "/reset-password"];
  if (noIndexPrefixes.some((prefix) => req.path === prefix || req.path.startsWith(prefix))) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
  }
  next();
});
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(uploadsDir));
app.use(express.static(path.join(__dirname, "public")));

const mailer =
  SMTP_HOST && SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
        tls: {
          rejectUnauthorized: false,
        },
      })
    : null;

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const rateLimitBuckets = new Map();
const createRateLimiter = ({ windowMs, max, message, keyFn }) => (req, res, next) => {
  const bucketKey = keyFn ? keyFn(req) : `${req.ip}:${req.path}`;
  const now = Date.now();
  const current = rateLimitBuckets.get(bucketKey);
  if (!current || now > current.resetAt) {
    rateLimitBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return next();
  }
  if (current.count >= max) {
    return res.status(429).json({ error: message || "Too many requests. Please try again later." });
  }
  current.count += 1;
  next();
};

const normalizeList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [value];
    } catch {
      return value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    }
  }
  return [];
};

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
const isAllowedStudentEmail = (value) => {
  const email = String(value || "").trim().toLowerCase();
  return ALLOWED_STUDENT_DOMAINS.some((domain) => email.endsWith(`@${domain}`));
};

const isStrongPassword = (value) => {
  const password = String(value || "");
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
};

const cleanText = (value, max = 255) => String(value || "").trim().slice(0, max);
const createToken = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
const createVerificationCode = () => String(Math.floor(100000 + Math.random() * 900000));
const isAdminEmail = (value) => ADMIN_EMAILS.includes(String(value || "").trim().toLowerCase());
const buildAbsoluteUrl = (targetPath) => `${PUBLIC_BASE_URL}${targetPath.startsWith("/") ? targetPath : `/${targetPath}`}`;
const sendPublicPage = (res, file, status = 200) => res.status(status).sendFile(path.join(__dirname, "public", file));
const formatJoinDate = (value) =>
  new Date(value).toLocaleDateString("en-NZ", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

const saveDataUrlImage = (dataUrl, prefix = "avatar") => {
  const value = String(dataUrl || "");
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Unsupported avatar image format.");
  }
  const mimeType = match[1].toLowerCase();
  const extensionMap = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };
  const extension = extensionMap[mimeType];
  if (!extension) {
    throw new Error("Avatar must be a JPG, PNG, GIF, or WebP image.");
  }
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > 4 * 1024 * 1024) {
    throw new Error("Avatar image is too large.");
  }
  const filename = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extension}`;
  fs.writeFileSync(path.join(uploadsDir, filename), buffer);
  return `/uploads/${filename}`;
};

const parseJobsFile = () => {
  try {
    if (!fs.existsSync(JOB_CACHE_FILE)) return [];
    const raw = fs.readFileSync(JOB_CACHE_FILE, "utf8").trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed.jobs) ? parsed.jobs : [];
  } catch (error) {
    console.error("Failed to read jobs cache:", error.message);
    return [];
  }
};

const MATCH_STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "your", "you", "are", "our", "has", "have",
  "will", "into", "about", "their", "them", "they", "but", "not", "all", "any", "can", "may", "per",
  "job", "role", "work", "team", "new", "nz", "newzealand", "aotearoa", "experience", "skills",
  "skill", "using", "used", "who", "what", "when", "where", "how", "able", "required", "preferred",
  "including", "across", "within", "through", "need", "needs", "want", "wants", "good", "strong",
  "well", "one", "two", "three", "four", "five", "day", "days", "week", "weeks", "month", "months",
]);

const tokenizeText = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#./ -]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !MATCH_STOPWORDS.has(token));

const uniqueTokens = (value) => Array.from(new Set(tokenizeText(value)));

const resolveUploadPath = (uploadUrl) => {
  const relative = String(uploadUrl || "").trim();
  if (!relative.startsWith("/uploads/")) {
    throw new Error("Resume must be uploaded to GreenLoop first.");
  }
  const filePath = path.normalize(path.join(__dirname, relative.replace(/^\/+/, "")));
  if (!filePath.startsWith(uploadsDir + path.sep) && filePath !== uploadsDir) {
    throw new Error("Invalid upload path.");
  }
  if (!fs.existsSync(filePath)) {
    throw new Error("Uploaded resume file was not found.");
  }
  if (path.extname(filePath).toLowerCase() !== ".pdf") {
    throw new Error("Only PDF resumes are supported for match analysis.");
  }
  return filePath;
};

const extractResumeText = async (uploadUrl) => {
  const filePath = resolveUploadPath(uploadUrl);
  const buffer = fs.readFileSync(filePath);
  const parsed = await pdfParse(buffer);
  const text = String(parsed.text || "").replace(/\s+/g, " ").trim();
  if (!text) {
    throw new Error("Could not read text from that PDF resume.");
  }
  return text.slice(0, 40000);
};

const buildResumeProfile = (resumeText) => {
  const resumeTokens = uniqueTokens(resumeText);
  const resumeSet = new Set(resumeTokens);
  return { resumeTokens, resumeSet };
};

const scoreJobMatch = (job, resumeProfile) => {
  const titleTokens = uniqueTokens(job.title);
  const companyTokens = uniqueTokens(job.company);
  const locationTokens = uniqueTokens(job.location);
  const descTokens = uniqueTokens(job.description);
  const combined = Array.from(new Set([...titleTokens, ...companyTokens, ...locationTokens, ...descTokens]));

  const matchedTitle = titleTokens.filter((token) => resumeProfile.resumeSet.has(token));
  const matchedCompany = companyTokens.filter((token) => resumeProfile.resumeSet.has(token));
  const matchedLocation = locationTokens.filter((token) => resumeProfile.resumeSet.has(token));
  const matchedDesc = descTokens.filter((token) => resumeProfile.resumeSet.has(token));
  const matchedAll = combined.filter((token) => resumeProfile.resumeSet.has(token));

  let rawScore = 0;
  rawScore += matchedTitle.length * 16;
  rawScore += matchedDesc.length * 5;
  rawScore += matchedLocation.length * 4;
  rawScore += matchedCompany.length * 2;
  rawScore += Math.min(matchedAll.length, 12) * 2;

  const denominator = Math.max(titleTokens.length * 16 + Math.min(descTokens.length, 20) * 5 + locationTokens.length * 4, 40);
  const normalizedScore = Math.min(100, Math.max(0, Math.round((rawScore / denominator) * 100)));

  return {
    score: normalizedScore,
    matchedKeywords: Array.from(new Set([...matchedTitle, ...matchedLocation, ...matchedDesc])).slice(0, 10),
    matchReasons: [
      matchedTitle.length ? `${matchedTitle.length} title keyword${matchedTitle.length > 1 ? "s" : ""}` : "",
      matchedDesc.length ? `${matchedDesc.length} description keyword${matchedDesc.length > 1 ? "s" : ""}` : "",
      matchedLocation.length ? `${matchedLocation.length} location keyword${matchedLocation.length > 1 ? "s" : ""}` : "",
    ].filter(Boolean),
  };
};

const filterJobs = (jobs, query) => {
  let result = [...jobs];
  const q = cleanText(query.q, 120).toLowerCase();
  const location = cleanText(query.location, 120).toLowerCase().replace(/\s+/g, "-");
  const workType = cleanText(query.type, 40);
  const limit = Math.min(Math.max(Number(query.limit || 100), 1), 500);

  if (q) {
    result = result.filter((job) =>
      [job.title, job.company, job.description].some((value) => String(value || "").toLowerCase().includes(q))
    );
  }

  if (location) {
    result = result.filter((job) => String(job.location || "").toLowerCase().replace(/\s+/g, "-").includes(location));
  }

  if (workType) {
    result = result.filter((job) => String(job.workType || "") === workType);
  }

  return {
    jobs: result.slice(0, limit),
    total: result.length,
    limit,
  };
};

const sortJobsByResumeMatch = (jobs, resumeText) => {
  const resumeProfile = buildResumeProfile(resumeText);
  return jobs
    .map((job) => {
      const match = scoreJobMatch(job, resumeProfile);
      return {
        ...job,
        matchScore: match.score,
        matchedKeywords: match.matchedKeywords,
        matchReasons: match.matchReasons,
      };
    })
    .sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return new Date(b.listedAt || 0) - new Date(a.listedAt || 0);
    });
};

const triggerJobsRefresh = () => {
  try {
    if (fs.existsSync(JOB_SCRAPER_LOCK)) {
      const ageMs = Date.now() - fs.statSync(JOB_SCRAPER_LOCK).mtimeMs;
      if (ageMs < JOB_SCRAPER_LOCK_MAX_AGE_MS) {
        return { started: false, reason: "refresh already in progress" };
      }
      fs.rmSync(JOB_SCRAPER_LOCK, { force: true });
    }
  } catch (error) {
    console.error("Failed to inspect scrape lock:", error.message);
  }

  const child = spawn("python3", [JOB_SCRAPER_ENTRY, "scrape"], {
    cwd: JOB_SCRAPER_DIR,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return { started: true };
};

const signToken = (user) =>
  jwt.sign(
    {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      verificationStatus: user.verification_status,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

const sanitizeUser = (user) => ({
  id: user.id,
  fullName: user.full_name,
  email: user.email,
  schoolName: user.school_name,
  studentId: user.student_id,
  verificationStatus: user.verification_status,
  isPremium: !!user.is_premium,
  isAdmin: isAdminEmail(user.email),
  avatarUrl: user.avatar_url || "",
  createdAt: user.created_at,
});

const logUserActivity = async (req, userId, action, entityType = "", entityId = null, metadata = null) => {
  if (!userId || !action) return;
  const ipAddress = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")
    .split(",")[0]
    .trim()
    .slice(0, 120);
  const userAgent = cleanText(req.headers["user-agent"] || "", 255);
  const metadataJson = metadata ? JSON.stringify(metadata).slice(0, 4000) : null;
  await pool.execute(
    `INSERT INTO user_activity_logs (user_id, action, entity_type, entity_id, metadata_json, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, cleanText(action, 120), cleanText(entityType, 120), entityId || null, metadataJson, ipAddress || null, userAgent || null]
  );
};

const authRequired = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const [rows] = await pool.execute("SELECT * FROM users WHERE id = ? LIMIT 1", [payload.id]);
    if (!rows[0]) {
      return res.status(401).json({ error: "User not found." });
    }
    req.user = rows[0];
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
});

const authRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 12,
  message: "Too many auth requests. Please wait a few minutes and try again.",
  keyFn: (req) => `auth:${req.ip}:${req.path}`,
});

const uploadRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: "Upload limit reached. Please wait before uploading more files.",
  keyFn: (req) => `upload:${req.ip}:${req.user?.id || "guest"}`,
});

const supportRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 6,
  message: "Too many support submissions. Please wait before sending another request.",
  keyFn: (req) => `support:${req.ip}`,
});

const verifiedRequired = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "Authentication required." });
  if (req.user.verification_status !== "verified") {
    return res.status(403).json({ error: "Student verification required for this action." });
  }
  next();
};

const adminRequired = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "Authentication required." });
  if (!isAdminEmail(req.user.email)) {
    return res.status(403).json({ error: "Administrator access required." });
  }
  next();
};

const estimateDeliveryFee = (deliveryType, fromLocation, toLocation) => {
  const distanceScore = String(fromLocation || toLocation || "").toLowerCase().includes("auckland") ? 18 : 28;
  return deliveryType === "budget" ? distanceScore : distanceScore + 17;
};

const buildRoomRecommendations = (items, stylePreference, budget) => {
  const lowerStyle = String(stylePreference || "").toLowerCase();
  const targetCategories = lowerStyle.includes("study")
    ? ["desk", "chair", "storage"]
    : lowerStyle.includes("minimal")
      ? ["furniture", "decor", "lighting"]
      : ["furniture", "decor", "desk", "chair"];
  const cap = Number(budget || 0) || Number.MAX_SAFE_INTEGER;
  const picks = items
    .filter((item) => targetCategories.includes(item.category) || item.category === "furniture")
    .filter((item) => Number(item.price) <= cap)
    .slice(0, 4);

  return {
    picks,
    layoutNotes: [
      "Keep the largest furniture against the longest wall to preserve walking space.",
      "Use one anchor piece first, then layer lighting or decor around it.",
      "Prefer storage that doubles as seating if the room is a shared flat or dorm.",
    ],
    styleSummary: lowerStyle.includes("minimal")
      ? "Minimal student setup: fewer pieces, cleaner lines, easier to keep tidy."
      : lowerStyle.includes("study")
        ? "Study-first layout: desk positioning, lamp placement, and quiet storage matter most."
        : "Balanced shared-space setup: practical furniture with a few warm accents.",
  };
};

const createNotification = async (userId, type, message, scheduledFor = null) => {
  await pool.execute(
    "INSERT INTO notifications (user_id, type, message, scheduled_for, status) VALUES (?, ?, ?, ?, 'pending')",
    [userId, type, message, scheduledFor]
  );
};

const getAdminUserIds = async () => {
  if (!ADMIN_EMAILS.length) return [];
  const placeholders = ADMIN_EMAILS.map(() => "?").join(",");
  const [rows] = await pool.execute(
    `SELECT id
     FROM users
     WHERE LOWER(email) IN (${placeholders})`,
    ADMIN_EMAILS
  );
  return rows.map((row) => Number(row.id)).filter(Boolean);
};

const notifyAdmins = async (type, message, skipUserId = null) => {
  const adminIds = await getAdminUserIds();
  const uniqueIds = Array.from(new Set(adminIds)).filter((userId) => Number(userId) !== Number(skipUserId || 0));
  if (!uniqueIds.length) return 0;
  await Promise.all(uniqueIds.map((userId) => createNotification(userId, type, message)));
  return uniqueIds.length;
};

const mapConversationRow = (row, currentUserId) => {
  const isBuyer = Number(row.buyer_id) === Number(currentUserId);
  const otherLastSeen = isBuyer ? row.seller_last_seen : row.buyer_last_seen;
  const otherIsOnline = isBuyer ? row.seller_is_online : row.buyer_is_online;
  return {
    id: row.id,
    itemId: row.item_id,
    itemTitle: row.item_title,
    itemImage: normalizeList(row.images_json)[0] || "",
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    otherUser: {
      id: isBuyer ? row.seller_id : row.buyer_id,
      fullName: isBuyer ? row.seller_name : row.buyer_name,
      avatarUrl: isBuyer ? row.seller_avatar_url || "" : row.buyer_avatar_url || "",
      schoolName: isBuyer ? row.seller_school : row.buyer_school,
      verificationStatus: isBuyer ? row.seller_verification : row.buyer_verification,
      isOnline: !!otherIsOnline,
      lastSeenAt: otherLastSeen,
    },
    lastMessage: row.last_message || "",
    lastMessageAt: row.last_message_at,
    unreadCount: Number(row.unread_count || 0),
    createdAt: row.created_at,
  };
};

const sendEmail = async ({ to, subject, html, text }) => {
  if (!mailer) {
    console.warn("SMTP disabled: missing mailer config.");
    return { skipped: true };
  }
  return mailer.sendMail({
    from: `"${SMTP_FROM_NAME}" <${SMTP_USER}>`,
    to,
    subject,
    text,
    html,
  });
};

const sendWelcomeEmail = async (user) => {
  const dashboardUrl = buildAbsoluteUrl("/dashboard");
  const marketplaceUrl = buildAbsoluteUrl("/marketplace");
  const statusLabel = user.verification_status === "verified" ? "Your verified student access is now live." : "Your verification is pending review.";
  return sendEmail({
    to: user.email,
    subject: "Congratulations, your GreenLoop account is ready",
    text: `Hi ${user.full_name},\n\nCongratulations. Your GreenLoop account has been created successfully.\n${statusLabel}\nDashboard: ${dashboardUrl}\nMarketplace: ${marketplaceUrl}\n\n- GreenLoop NZ`,
    html: `
      <div style="font-family:Segoe UI,Helvetica Neue,sans-serif;color:#2b2b2b;line-height:1.6">
        <h2 style="margin:0 0 12px;color:#6d2f2d">Congratulations, your GreenLoop account is ready</h2>
        <p style="margin:0 0 10px">Hi ${user.full_name},</p>
        <p style="margin:0 0 10px">Your account has been created successfully. ${statusLabel}</p>
        <p style="margin:0 0 14px">
          <a href="${dashboardUrl}" style="display:inline-block;padding:10px 16px;border-radius:12px;background:#b45e54;color:#fff;text-decoration:none;font-weight:700">Open dashboard</a>
        </p>
        <p style="margin:0 0 10px">Or browse current listings here:</p>
        <p style="margin:0"><a href="${marketplaceUrl}">${marketplaceUrl}</a></p>
      </div>
    `,
  });
};

const ensureBootstrapAdmin = async () => {
  if (!ADMIN_BOOTSTRAP_EMAIL || !ADMIN_BOOTSTRAP_PASSWORD) return;
  const [rows] = await pool.execute("SELECT id FROM users WHERE email = ? LIMIT 1", [ADMIN_BOOTSTRAP_EMAIL]);
  if (rows[0]) return;
  const passwordHash = await bcrypt.hash(ADMIN_BOOTSTRAP_PASSWORD, 10);
  await pool.execute(
    `INSERT INTO users (full_name, email, password_hash, school_name, student_id, verification_status)
     VALUES (?, ?, ?, ?, ?, 'verified')`,
    [ADMIN_BOOTSTRAP_NAME, ADMIN_BOOTSTRAP_EMAIL, passwordHash, "University of Auckland", "ADMIN-0001"]
  );
  console.log(`Bootstrapped admin account: ${ADMIN_BOOTSTRAP_EMAIL}`);
};

const sendPasswordResetEmail = async ({ user, resetToken }) => {
  const resetUrl = buildAbsoluteUrl(`/reset-password?token=${encodeURIComponent(resetToken)}`);
  return sendEmail({
    to: user.email,
    subject: "Reset your GreenLoop password",
    text: `Hi ${user.full_name},\n\nUse this link within 30 minutes to reset your password:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.\n\n- GreenLoop NZ`,
    html: `
      <div style="font-family:Segoe UI,Helvetica Neue,sans-serif;color:#2b2b2b;line-height:1.6">
        <h2 style="margin:0 0 12px;color:#6d2f2d">Reset your GreenLoop password</h2>
        <p style="margin:0 0 10px">Hi ${user.full_name},</p>
        <p style="margin:0 0 14px">Use the secure link below within 30 minutes.</p>
        <p style="margin:0 0 14px">
          <a href="${resetUrl}" style="display:inline-block;padding:10px 16px;border-radius:12px;background:#b45e54;color:#fff;text-decoration:none;font-weight:700">Reset password</a>
        </p>
        <p style="margin:0 0 10px">If the button doesn't open, paste this link into your browser:</p>
        <p style="margin:0"><a href="${resetUrl}">${resetUrl}</a></p>
      </div>
    `,
  });
};

const sendRegistrationCodeEmail = async ({ fullName, email, code }) => {
  return sendEmail({
    to: email,
    subject: "Your GreenLoop verification code",
    text: `Hi ${fullName},\n\nYour GreenLoop verification code is ${code}.\nIt expires in ${REGISTRATION_CODE_TTL_MINUTES} minutes.\n\nIf you did not start this registration, you can ignore this email.\n\n- GreenLoop NZ`,
    html: `
      <div style="font-family:Segoe UI,Helvetica Neue,sans-serif;color:#2b2b2b;line-height:1.6">
        <h2 style="margin:0 0 12px;color:#c33235">Verify your GreenLoop registration</h2>
        <p style="margin:0 0 10px">Hi ${fullName},</p>
        <p style="margin:0 0 14px">Use the code below to finish creating your account.</p>
        <div style="display:inline-block;padding:14px 18px;border-radius:16px;background:#fff3f2;border:1px solid #ffd5d1;font-size:28px;font-weight:900;letter-spacing:0.18em;color:#c33235">${code}</div>
        <p style="margin:14px 0 0">This code expires in ${REGISTRATION_CODE_TTL_MINUTES} minutes.</p>
      </div>
    `,
  });
};

const ensureSchema = async () => {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(120) NOT NULL,
      email VARCHAR(190) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      school_name VARCHAR(190) NOT NULL,
      student_id VARCHAR(120) NOT NULL,
      avatar_url TEXT DEFAULT NULL,
      verification_status ENUM('pending', 'verified', 'rejected') NOT NULL DEFAULT 'pending',
      is_premium TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS registration_verifications (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(120) NOT NULL,
      email VARCHAR(190) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      school_name VARCHAR(190) NOT NULL,
      student_id VARCHAR(120) NOT NULL,
      avatar_url TEXT DEFAULT NULL,
      verification_code VARCHAR(6) NOT NULL,
      expires_at DATETIME NOT NULL,
      consumed_at DATETIME DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_registration_email (email),
      KEY idx_registration_active (email, consumed_at, expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS items (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      seller_id INT NOT NULL,
      title VARCHAR(180) NOT NULL,
      description TEXT NOT NULL,
      category VARCHAR(80) NOT NULL,
      location VARCHAR(180) NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      condition_status VARCHAR(80) NOT NULL,
      pickup_windows TEXT,
      images_json JSON,
      delivery_options_json JSON,
      donation_available TINYINT(1) NOT NULL DEFAULT 0,
      status ENUM('available', 'reserved', 'donated', 'completed') NOT NULL DEFAULT 'available',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_items_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS reservations (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      item_id INT NOT NULL,
      buyer_id INT NOT NULL,
      seller_id INT NOT NULL,
      pickup_time DATETIME NOT NULL,
      note TEXT,
      status ENUM('pending', 'confirmed', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_res_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      CONSTRAINT fk_res_buyer FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_res_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS conversations (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      item_id INT NOT NULL,
      buyer_id INT NOT NULL,
      seller_id INT NOT NULL,
      last_message TEXT DEFAULT NULL,
      last_message_at DATETIME DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_conversation_item_buyer (item_id, buyer_id),
      CONSTRAINT fk_conversation_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      CONSTRAINT fk_conversation_buyer FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_conversation_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS conversation_messages (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      conversation_id INT NOT NULL,
      sender_id INT NOT NULL,
      body TEXT DEFAULT NULL,
      image_url TEXT DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      read_at DATETIME DEFAULT NULL,
      CONSTRAINT fk_message_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      CONSTRAINT fk_message_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS user_presence (
      user_id INT NOT NULL PRIMARY KEY,
      last_seen_at DATETIME NOT NULL,
      is_online TINYINT(1) NOT NULL DEFAULT 1,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_presence_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS delivery_requests (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      item_id INT DEFAULT NULL,
      user_id INT NOT NULL,
      delivery_type ENUM('standard', 'budget') NOT NULL,
      from_location VARCHAR(180) NOT NULL,
      to_location VARCHAR(180) NOT NULL,
      fee_estimate DECIMAL(10,2) NOT NULL,
      notes TEXT,
      status ENUM('requested', 'scheduled', 'completed') NOT NULL DEFAULT 'requested',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_delivery_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS service_requests (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      item_id INT DEFAULT NULL,
      user_id INT NOT NULL,
      service_type ENUM('cleaning', 'repair') NOT NULL,
      notes TEXT,
      status ENUM('requested', 'in_progress', 'completed') NOT NULL DEFAULT 'requested',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_service_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS room_design_requests (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      room_image_url TEXT,
      style_preference VARCHAR(120),
      budget DECIMAL(10,2) DEFAULT NULL,
      notes TEXT,
      recommendations_json JSON,
      status ENUM('generated', 'saved') NOT NULL DEFAULT 'generated',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_room_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS donations (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      item_id INT DEFAULT NULL,
      user_id INT NOT NULL,
      org_name VARCHAR(180) NOT NULL,
      notes TEXT,
      status ENUM('submitted', 'accepted', 'completed') NOT NULL DEFAULT 'submitted',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_donation_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS opportunities (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(180) NOT NULL,
      org_name VARCHAR(180) NOT NULL,
      opportunity_type ENUM('internship', 'volunteer') NOT NULL,
      location VARCHAR(180) NOT NULL,
      skills_json JSON,
      summary TEXT NOT NULL,
      apply_url TEXT,
      created_by INT DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS opportunity_applications (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      opportunity_id INT NOT NULL,
      user_id INT NOT NULL,
      applicant_name VARCHAR(180) NOT NULL,
      applicant_email VARCHAR(180) NOT NULL,
      applicant_phone VARCHAR(80) DEFAULT NULL,
      cover_message TEXT,
      cv_url TEXT DEFAULT NULL,
      status ENUM('submitted', 'reviewed', 'rejected') NOT NULL DEFAULT 'submitted',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_opp_application_opportunity FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE,
      CONSTRAINT fk_opp_application_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS memberships (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      plan_name ENUM('basic', 'plus', 'priority') NOT NULL DEFAULT 'basic',
      status ENUM('active', 'expired') NOT NULL DEFAULT 'active',
      priority_delivery TINYINT(1) NOT NULL DEFAULT 0,
      extended_reservation_hours INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_membership_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      type VARCHAR(80) NOT NULL,
      message TEXT NOT NULL,
      scheduled_for DATETIME DEFAULT NULL,
      status ENUM('pending', 'sent') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS support_requests (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id INT DEFAULT NULL,
      full_name VARCHAR(180) NOT NULL,
      email VARCHAR(190) NOT NULL,
      category VARCHAR(80) NOT NULL,
      page_url VARCHAR(255) DEFAULT NULL,
      message TEXT NOT NULL,
      status ENUM('open', 'reviewing', 'resolved') NOT NULL DEFAULT 'open',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_support_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS community_posts (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      body TEXT NOT NULL,
      image_url TEXT DEFAULT NULL,
      topic VARCHAR(120) DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_post_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS user_activity_logs (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id INT DEFAULT NULL,
      action VARCHAR(120) NOT NULL,
      entity_type VARCHAR(120) DEFAULT NULL,
      entity_id INT DEFAULT NULL,
      metadata_json TEXT DEFAULT NULL,
      ip_address VARCHAR(120) DEFAULT NULL,
      user_agent VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      KEY idx_activity_created (created_at),
      KEY idx_activity_user (user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS password_resets (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      reset_token VARCHAR(255) NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used_at DATETIME DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ];

  for (const statement of statements) {
    await pool.execute(statement);
  }

  await pool.execute("ALTER TABLE conversation_messages MODIFY body TEXT NULL");

  const ensureColumn = async (tableName, columnName, definition) => {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
       LIMIT 1`,
      [tableName, columnName]
    );
    if (!rows[0]) {
      await pool.execute(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
    }
  };

  await ensureColumn("users", "avatar_url", "avatar_url TEXT NULL AFTER student_id");
  await ensureColumn("conversation_messages", "image_url", "image_url TEXT NULL AFTER body");
  await ensureColumn("user_presence", "is_online", "is_online TINYINT(1) NOT NULL DEFAULT 1 AFTER last_seen_at");
  await ensureColumn("opportunities", "apply_url", "apply_url TEXT NULL AFTER summary");
  await ensureBootstrapAdmin();

  const [countRows] = await pool.execute("SELECT COUNT(*) AS count FROM opportunities");
  if (countRows[0].count === 0) {
    await pool.execute(
      `INSERT INTO opportunities
        (title, org_name, opportunity_type, location, skills_json, summary, apply_url)
       VALUES
        (?, ?, ?, ?, ?, ?, ?),
        (?, ?, ?, ?, ?, ?, ?),
        (?, ?, ?, ?, ?, ?, ?)`,
      [
        "Campus Reuse Logistics Intern",
        "GreenLoop Student Ops",
        "internship",
        "Auckland",
        JSON.stringify(["operations", "customer support", "logistics"]),
        "Coordinate pickup windows, student verification flows, and sustainability reporting.",
        "https://example.com/greenloop-intern",
        "Community Furniture Repair Volunteer",
        "Auckland Reuse Hub",
        "volunteer",
        "Auckland Central",
        JSON.stringify(["DIY", "repair", "community"]),
        "Help clean, repair, and prepare donated furniture for student housing.",
        "https://example.com/reuse-volunteer",
        "Student Housing Content Creator",
        "Flatlife NZ",
        "internship",
        "Remote",
        JSON.stringify(["social media", "video", "student marketing"]),
        "Create short-form content around student moves, second-hand finds, and room setups.",
        "https://example.com/flatlife-content"
      ]
    );
  }
};

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", app: "GreenLoop", port: PORT });
});

app.post(
  "/api/uploads",
  authRequired,
  uploadRateLimit,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "File is required." });
    res.json({ url: `/uploads/${req.file.filename}` });
  })
);

app.post(
  "/api/auth/register/start",
  authRateLimit,
  asyncHandler(async (req, res) => {
    const { fullName, email, password, schoolName, studentId, avatarDataUrl } = req.body;
    if (!fullName || !email || !password || !schoolName || !studentId) {
      return res.status(400).json({ error: "All registration fields are required." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedFullName = cleanText(fullName, 120);
    const normalizedSchoolName = cleanText(schoolName, 190);
    const normalizedStudentId = cleanText(studentId, 120);

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (!isAllowedStudentEmail(normalizedEmail)) {
      return res.status(400).json({ error: "Use a University of Auckland email ending in @aucklanduni.ac.nz or @auckland.ac.nz." });
    }
    if (normalizedFullName.length < 2) {
      return res.status(400).json({ error: "Full name must be at least 2 characters." });
    }
    if (normalizedSchoolName.length < 2) {
      return res.status(400).json({ error: "School name is too short." });
    }
    if (normalizedStudentId.length < 4) {
      return res.status(400).json({ error: "Student ID is too short." });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({ error: "Password must be at least 8 characters and include letters and numbers." });
    }

    const [existing] = await pool.execute("SELECT id FROM users WHERE email = ? LIMIT 1", [normalizedEmail]);
    if (existing[0]) {
      return res.status(409).json({ error: "Email already registered." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const verificationCode = createVerificationCode();
    const expiresAt = new Date(Date.now() + REGISTRATION_CODE_TTL_MINUTES * 60 * 1000);
    const avatarUrl = avatarDataUrl ? saveDataUrlImage(avatarDataUrl, "register-avatar") : null;

    await pool.execute("DELETE FROM registration_verifications WHERE email = ?", [normalizedEmail]);
    await pool.execute(
      `INSERT INTO registration_verifications
        (full_name, email, password_hash, school_name, student_id, avatar_url, verification_code, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [normalizedFullName, normalizedEmail, passwordHash, normalizedSchoolName, normalizedStudentId, avatarUrl, verificationCode, expiresAt]
    );
    await sendRegistrationCodeEmail({ fullName: normalizedFullName, email: normalizedEmail, code: verificationCode });

    res.status(201).json({
      ok: true,
      email: normalizedEmail,
      message: `Verification code sent to ${normalizedEmail}.`,
    });
  })
);

app.post(
  "/api/auth/register/verify",
  authRateLimit,
  asyncHandler(async (req, res) => {
    const normalizedEmail = String(req.body.email || "").trim().toLowerCase();
    const normalizedCode = String(req.body.code || "").trim();
    if (!normalizedEmail || !normalizedCode) {
      return res.status(400).json({ error: "Email and verification code are required." });
    }

    const [pendingRows] = await pool.execute(
      `SELECT *
       FROM registration_verifications
       WHERE email = ? AND consumed_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [normalizedEmail]
    );
    const pending = pendingRows[0];
    if (!pending) {
      return res.status(400).json({ error: "Verification code is invalid or expired. Please register again." });
    }
    if (pending.verification_code !== normalizedCode) {
      return res.status(400).json({ error: "Verification code does not match." });
    }

    const [existing] = await pool.execute("SELECT id FROM users WHERE email = ? LIMIT 1", [normalizedEmail]);
    if (existing[0]) {
      await pool.execute("UPDATE registration_verifications SET consumed_at = NOW() WHERE id = ?", [pending.id]);
      return res.status(409).json({ error: "Email already registered." });
    }

    const [result] = await pool.execute(
      `INSERT INTO users (full_name, email, password_hash, school_name, student_id, avatar_url, verification_status)
       VALUES (?, ?, ?, ?, ?, ?, 'verified')`,
      [pending.full_name, pending.email, pending.password_hash, pending.school_name, pending.student_id, pending.avatar_url]
    );
    await pool.execute("UPDATE registration_verifications SET consumed_at = NOW() WHERE id = ?", [pending.id]);

    const [rows] = await pool.execute("SELECT * FROM users WHERE id = ? LIMIT 1", [result.insertId]);
    const user = rows[0];
    await createNotification(user.id, "verification", "Student verification completed successfully by email code.");
    await sendWelcomeEmail(user);
    await logUserActivity(req, user.id, "register_verified", "user", user.id, { email: user.email });

    res.status(201).json({ token: signToken(user), user: sanitizeUser(user) });
  })
);

app.post(
  "/api/auth/login",
  authRateLimit,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }
    const [rows] = await pool.execute("SELECT * FROM users WHERE email = ? LIMIT 1", [normalizedEmail]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: "Invalid email or password." });

    const ok = await bcrypt.compare(password || "", user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid email or password." });

    await logUserActivity(req, user.id, "login", "user", user.id);
    res.json({ token: signToken(user), user: sanitizeUser(user) });
  })
);

app.post(
  "/api/auth/forgot-password",
  authRateLimit,
  asyncHandler(async (req, res) => {
    const normalizedEmail = String(req.body.email || "").trim().toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({ error: "Email is required." });
    }
    const [rows] = await pool.execute("SELECT * FROM users WHERE email = ? LIMIT 1", [normalizedEmail]);
    const user = rows[0];
    if (!user) {
      return res.json({ ok: true, message: "If that email exists, a reset link has been prepared." });
    }

    const resetToken = createToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30);
    await pool.execute(
      "INSERT INTO password_resets (user_id, reset_token, expires_at) VALUES (?, ?, ?)",
      [user.id, resetToken, expiresAt]
    );
    await createNotification(user.id, "password-reset", "A password reset request was created for your account.");
    await sendPasswordResetEmail({ user, resetToken });

    const response = { ok: true, message: "Password reset email sent." };
    if (shouldExposeQaResetLink) {
      response.resetUrl = `/reset-password?token=${encodeURIComponent(resetToken)}`;
    }
    res.json(response);
  })
);

app.post(
  "/api/auth/reset-password",
  authRateLimit,
  asyncHandler(async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: "Reset token and new password are required." });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({ error: "Password must be at least 8 characters and include letters and numbers." });
    }

    const [rows] = await pool.execute(
      `SELECT pr.*, u.email
       FROM password_resets pr
       JOIN users u ON u.id = pr.user_id
       WHERE pr.reset_token = ? AND pr.used_at IS NULL AND pr.expires_at > NOW()
       LIMIT 1`,
      [token]
    );
    const reset = rows[0];
    if (!reset) {
      return res.status(400).json({ error: "Reset link is invalid or expired." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await pool.execute("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, reset.user_id]);
    await pool.execute("UPDATE password_resets SET used_at = NOW() WHERE id = ?", [reset.id]);
    await createNotification(reset.user_id, "password-reset", "Your password was changed successfully.");
    res.json({ ok: true });
  })
);

app.get(
  "/api/auth/me",
  authRequired,
  asyncHandler(async (req, res) => {
    res.json({ user: sanitizeUser(req.user) });
  })
);

app.post(
  "/api/support",
  supportRateLimit,
  asyncHandler(async (req, res) => {
    const fullName = cleanText(req.body.fullName || req.user?.full_name, 180);
    const email = String(req.body.email || req.user?.email || "").trim().toLowerCase();
    const category = cleanText(req.body.category, 80) || "general";
    const pageUrl = cleanText(req.body.pageUrl, 255);
    const message = cleanText(req.body.message, 4000);

    if (!fullName || !email || !message) {
      return res.status(400).json({ error: "Name, email, and message are required." });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Enter a valid support email address." });
    }
    if (message.length < 12) {
      return res.status(400).json({ error: "Support message is too short." });
    }

    const [result] = await pool.execute(
      `INSERT INTO support_requests (user_id, full_name, email, category, page_url, message)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user?.id || null, fullName, email, category, pageUrl || null, message]
    );
    await notifyAdmins("support", `${fullName} submitted a ${category} support request.`, req.user?.id || null);
    if (req.user?.id) {
      await createNotification(req.user.id, "support", "Your support request was received.");
      await logUserActivity(req, req.user.id, "support_request_create", "support_request", result.insertId, { category, pageUrl });
    }
    res.status(201).json({ ok: true, id: result.insertId, supportEmail: SUPPORT_EMAIL });
  })
);

app.get(
  "/api/dashboard",
  authRequired,
  asyncHandler(async (req, res) => {
    const [[userItems], [reservations], [notifications], [memberships]] = await Promise.all([
      pool.execute("SELECT COUNT(*) AS count FROM items WHERE seller_id = ?", [req.user.id]),
      pool.execute(
        `SELECT r.id, r.status, r.pickup_time, i.title, i.seller_id
         FROM reservations r
         JOIN items i ON i.id = r.item_id
         WHERE r.buyer_id = ? OR r.seller_id = ?
         ORDER BY r.created_at DESC
         LIMIT 5`,
        [req.user.id, req.user.id]
      ),
      pool.execute(
        `SELECT id, type, message, scheduled_for, status, created_at
         FROM notifications
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 6`,
        [req.user.id]
      ),
      pool.execute(
        "SELECT plan_name, status, priority_delivery, extended_reservation_hours, created_at FROM memberships WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
        [req.user.id]
      ),
    ]);

    res.json({
      user: sanitizeUser(req.user),
      summary: {
        listings: userItems[0].count,
        premiumPlan: memberships[0]?.plan_name || "basic",
        reservations,
        notifications,
      },
    });
  })
);

app.post(
  "/api/activity/track",
  authRequired,
  asyncHandler(async (req, res) => {
    const action = cleanText(req.body.action, 120);
    const entityType = cleanText(req.body.entityType, 120);
    const entityId = req.body.entityId ? Number(req.body.entityId) : null;
    if (!action) {
      return res.status(400).json({ error: "Action is required." });
    }
    await logUserActivity(req, req.user.id, action, entityType, entityId, req.body.metadata || null);
    res.json({ ok: true });
  })
);

app.get(
  "/api/community/posts",
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.execute(
      `SELECT
         p.*,
         u.full_name,
         u.email,
         u.school_name,
         u.avatar_url,
         u.verification_status
       FROM community_posts p
       JOIN users u ON u.id = p.user_id
       ORDER BY p.created_at DESC
       LIMIT 100`
    );
    res.json({
      posts: rows.map((row) => ({
        id: row.id,
        body: row.body,
        imageUrl: row.image_url || "",
        topic: row.topic || "",
        createdAt: row.created_at,
        author: {
          id: row.user_id,
          fullName: row.full_name,
          email: row.email,
          schoolName: row.school_name,
          avatarUrl: row.avatar_url || "",
          verificationStatus: row.verification_status,
        },
      })),
    });
  })
);

app.post(
  "/api/community/posts",
  authRequired,
  asyncHandler(async (req, res) => {
    const body = cleanText(req.body.body, 3000);
    const topic = cleanText(req.body.topic, 120);
    const imageUrl = cleanText(req.body.imageUrl, 2000);
    if (!body) {
      return res.status(400).json({ error: "Post content is required." });
    }
    const [result] = await pool.execute(
      `INSERT INTO community_posts (user_id, body, image_url, topic)
       VALUES (?, ?, ?, ?)`,
      [req.user.id, body, imageUrl || null, topic || null]
    );
    await createNotification(req.user.id, "community", "Your campus post is now live.");
    await logUserActivity(req, req.user.id, "community_post_create", "community_post", result.insertId, { topic });
    res.status(201).json({ id: result.insertId });
  })
);

app.delete(
  "/api/community/posts/:id",
  authRequired,
  asyncHandler(async (req, res) => {
    const postId = Number(req.params.id);
    const [rows] = await pool.execute("SELECT * FROM community_posts WHERE id = ? LIMIT 1", [postId]);
    const post = rows[0];
    if (!post) return res.status(404).json({ error: "Post not found." });
    if (Number(post.user_id) !== Number(req.user.id) && !isAdminEmail(req.user.email)) {
      return res.status(403).json({ error: "Not allowed." });
    }
    await pool.execute("DELETE FROM community_posts WHERE id = ?", [postId]);
    await logUserActivity(req, req.user.id, "community_post_delete", "community_post", postId);
    res.json({ ok: true });
  })
);

app.get(
  "/api/admin/verification-queue",
  authRequired,
  adminRequired,
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.execute(
      `SELECT id, full_name, email, school_name, student_id, verification_status, created_at
       FROM users
       WHERE verification_status = 'pending'
       ORDER BY created_at ASC`
    );
    res.json({ users: rows.map(sanitizeUser) });
  })
);

app.get(
  "/api/admin/summary",
  authRequired,
  adminRequired,
  asyncHandler(async (_req, res) => {
    const [userRows, postRows, activityRows, pendingRows, opsRows, applicationRows, supportRows] = await Promise.all([
      pool.execute("SELECT COUNT(*) AS count FROM users"),
      pool.execute("SELECT COUNT(*) AS count FROM community_posts"),
      pool.execute("SELECT COUNT(*) AS count FROM user_activity_logs"),
      pool.execute("SELECT COUNT(*) AS count FROM users WHERE verification_status = 'pending'"),
      pool.execute(
        `SELECT
           (
             (SELECT COUNT(*) FROM reservations) +
             (SELECT COUNT(*) FROM delivery_requests) +
             (SELECT COUNT(*) FROM service_requests) +
             (SELECT COUNT(*) FROM donations)
           ) AS count`
      ),
      pool.execute("SELECT COUNT(*) AS count FROM opportunity_applications"),
      pool.execute("SELECT COUNT(*) AS count FROM support_requests"),
    ]);
    res.json({
      totals: {
        users: Number(userRows[0][0]?.count || 0),
        posts: Number(postRows[0][0]?.count || 0),
        activity: Number(activityRows[0][0]?.count || 0),
        pendingVerifications: Number(pendingRows[0][0]?.count || 0),
        opsRequests: Number(opsRows[0][0]?.count || 0),
        applications: Number(applicationRows[0][0]?.count || 0),
        supportRequests: Number(supportRows[0][0]?.count || 0),
      },
    });
  })
);

app.get(
  "/api/admin/support-requests",
  authRequired,
  adminRequired,
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.execute(
      `SELECT *
       FROM support_requests
       ORDER BY created_at DESC
       LIMIT 200`
    );
    res.json({
      requests: rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        fullName: row.full_name,
        email: row.email,
        category: row.category,
        pageUrl: row.page_url || "",
        message: row.message,
        status: row.status,
        createdAt: row.created_at,
      })),
    });
  })
);

app.post(
  "/api/admin/support-requests/:id/status",
  authRequired,
  adminRequired,
  asyncHandler(async (req, res) => {
    const supportRequestId = Number(req.params.id);
    const status = cleanText(req.body.status, 40);
    if (!["open", "reviewing", "resolved"].includes(status)) {
      return res.status(400).json({ error: "Unsupported support status." });
    }
    const [rows] = await pool.execute("SELECT * FROM support_requests WHERE id = ? LIMIT 1", [supportRequestId]);
    const supportRequest = rows[0];
    if (!supportRequest) {
      return res.status(404).json({ error: "Support request not found." });
    }
    await pool.execute("UPDATE support_requests SET status = ? WHERE id = ?", [status, supportRequestId]);
    if (supportRequest.user_id) {
      await createNotification(supportRequest.user_id, "support", `Your support request is now ${status}.`);
    }
    await logUserActivity(req, req.user.id, "admin_support_status_update", "support_request", supportRequestId, { status });
    res.json({ ok: true });
  })
);

app.get(
  "/api/admin/users",
  authRequired,
  adminRequired,
  asyncHandler(async (req, res) => {
    const query = cleanText(req.query.q || "", 120);
    const filters = [];
    const params = [];
    if (query) {
      filters.push("(full_name LIKE ? OR email LIKE ? OR student_id LIKE ?)");
      params.push(`%${query}%`, `%${query}%`, `%${query}%`);
    }
    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const [rows] = await pool.execute(
      `SELECT id, full_name, email, school_name, student_id, avatar_url, verification_status, is_premium, created_at
       FROM users
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT 200`,
      params
    );
    res.json({ users: rows.map(sanitizeUser) });
  })
);

app.post(
  "/api/admin/users",
  authRequired,
  adminRequired,
  asyncHandler(async (req, res) => {
    const fullName = cleanText(req.body.fullName, 120);
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const schoolName = cleanText(req.body.schoolName, 190) || "University of Auckland";
    const studentId = cleanText(req.body.studentId, 120) || `ADMIN-${Date.now()}`;
    const verificationStatus = ["pending", "verified", "rejected"].includes(String(req.body.verificationStatus || ""))
      ? String(req.body.verificationStatus)
      : "verified";

    if (!fullName || !isValidEmail(email) || !password) {
      return res.status(400).json({ error: "Full name, valid email, and password are required." });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({ error: "Password must be at least 8 characters and include letters and numbers." });
    }

    const [existing] = await pool.execute("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    if (existing[0]) {
      return res.status(409).json({ error: "Email already registered." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      `INSERT INTO users (full_name, email, password_hash, school_name, student_id, verification_status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [fullName, email, passwordHash, schoolName, studentId, verificationStatus]
    );
    const [rows] = await pool.execute("SELECT * FROM users WHERE id = ? LIMIT 1", [result.insertId]);
    await logUserActivity(req, req.user.id, "admin_user_create", "user", result.insertId, { email, verificationStatus });
    res.status(201).json({ user: sanitizeUser(rows[0]) });
  })
);

app.patch(
  "/api/admin/users/:id",
  authRequired,
  adminRequired,
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.id);
    const [rows] = await pool.execute("SELECT * FROM users WHERE id = ? LIMIT 1", [userId]);
    const existing = rows[0];
    if (!existing) return res.status(404).json({ error: "User not found." });

    const fullName = cleanText(req.body.fullName, 120) || existing.full_name;
    const schoolName = cleanText(req.body.schoolName, 190) || existing.school_name;
    const studentId = cleanText(req.body.studentId, 120) || existing.student_id;
    const verificationStatus = ["pending", "verified", "rejected"].includes(String(req.body.verificationStatus || ""))
      ? String(req.body.verificationStatus)
      : existing.verification_status;
    const isPremium = req.body.isPremium == null ? existing.is_premium : req.body.isPremium ? 1 : 0;

    await pool.execute(
      `UPDATE users
       SET full_name = ?, school_name = ?, student_id = ?, verification_status = ?, is_premium = ?
       WHERE id = ?`,
      [fullName, schoolName, studentId, verificationStatus, isPremium, userId]
    );
    const [updatedRows] = await pool.execute("SELECT * FROM users WHERE id = ? LIMIT 1", [userId]);
    await logUserActivity(req, req.user.id, "admin_user_update", "user", userId, { verificationStatus, isPremium: !!isPremium });
    res.json({ user: sanitizeUser(updatedRows[0]) });
  })
);

app.delete(
  "/api/admin/users/:id",
  authRequired,
  adminRequired,
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.id);
    if (!userId) return res.status(400).json({ error: "Invalid user id." });
    if (userId === req.user.id) return res.status(400).json({ error: "You cannot delete the currently signed-in admin account." });

    const [rows] = await pool.execute("SELECT * FROM users WHERE id = ? LIMIT 1", [userId]);
    const existing = rows[0];
    if (!existing) return res.status(404).json({ error: "User not found." });

    await pool.execute("DELETE FROM users WHERE id = ?", [userId]);
    await logUserActivity(req, req.user.id, "admin_user_delete", "user", userId, { email: existing.email });
    res.json({ ok: true });
  })
);

app.get(
  "/api/admin/activity",
  authRequired,
  adminRequired,
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.execute(
      `SELECT
         a.id,
         a.action,
         a.entity_type,
         a.entity_id,
         a.metadata_json,
         a.ip_address,
         a.user_agent,
         a.created_at,
         u.full_name,
         u.email
       FROM user_activity_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC
       LIMIT 200`
    );
    res.json({
      logs: rows.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entity_type || "",
        entityId: row.entity_id,
        metadata: (() => {
          if (!row.metadata_json) return null;
          try {
            return JSON.parse(row.metadata_json);
          } catch {
            return { raw: row.metadata_json };
          }
        })(),
        ipAddress: row.ip_address || "",
        userAgent: row.user_agent || "",
        createdAt: row.created_at,
        actor: row.full_name ? { fullName: row.full_name, email: row.email } : null,
      })),
    });
  })
);

app.get(
  "/api/admin/ops-requests",
  authRequired,
  adminRequired,
  asyncHandler(async (_req, res) => {
    const [reservationRows, deliveryRows, serviceRows, donationRows] = await Promise.all([
      pool.execute(
        `SELECT
           'reservation' AS request_type,
           r.id,
           r.status,
           r.note AS details,
           r.created_at,
           r.pickup_time AS requested_time,
           i.id AS item_id,
           i.title AS item_title,
           buyer.full_name AS requester_name,
           buyer.email AS requester_email
         FROM reservations r
         JOIN items i ON i.id = r.item_id
         JOIN users buyer ON buyer.id = r.buyer_id
         ORDER BY r.created_at DESC
         LIMIT 100`
      ),
      pool.execute(
        `SELECT
           'delivery' AS request_type,
           d.id,
           d.status,
           CONCAT(d.delivery_type, ' · ', d.from_location, ' → ', d.to_location, IFNULL(CONCAT(' · ', d.notes), '')) AS details,
           d.created_at,
           NULL AS requested_time,
           d.item_id,
           i.title AS item_title,
           u.full_name AS requester_name,
           u.email AS requester_email
         FROM delivery_requests d
         LEFT JOIN items i ON i.id = d.item_id
         JOIN users u ON u.id = d.user_id
         ORDER BY d.created_at DESC
         LIMIT 100`
      ),
      pool.execute(
        `SELECT
           'service' AS request_type,
           s.id,
           s.status,
           CONCAT(s.service_type, IFNULL(CONCAT(' · ', s.notes), '')) AS details,
           s.created_at,
           NULL AS requested_time,
           s.item_id,
           i.title AS item_title,
           u.full_name AS requester_name,
           u.email AS requester_email
         FROM service_requests s
         LEFT JOIN items i ON i.id = s.item_id
         JOIN users u ON u.id = s.user_id
         ORDER BY s.created_at DESC
         LIMIT 100`
      ),
      pool.execute(
        `SELECT
           'donation' AS request_type,
           d.id,
           d.status,
           CONCAT(d.org_name, IFNULL(CONCAT(' · ', d.notes), '')) AS details,
           d.created_at,
           NULL AS requested_time,
           d.item_id,
           i.title AS item_title,
           u.full_name AS requester_name,
           u.email AS requester_email
         FROM donations d
         LEFT JOIN items i ON i.id = d.item_id
         JOIN users u ON u.id = d.user_id
         ORDER BY d.created_at DESC
         LIMIT 100`
      ),
    ]);

    const requests = [
      ...reservationRows[0],
      ...deliveryRows[0],
      ...serviceRows[0],
      ...donationRows[0],
    ]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 200)
      .map((row) => ({
        id: row.id,
        type: row.request_type,
        status: row.status,
        details: row.details || "",
        createdAt: row.created_at,
        requestedTime: row.requested_time,
        itemId: row.item_id,
        itemTitle: row.item_title || "",
        requesterName: row.requester_name || "",
        requesterEmail: row.requester_email || "",
      }));

    res.json({ requests });
  })
);

app.post(
  "/api/admin/ops-requests/:type/:id/status",
  authRequired,
  adminRequired,
  asyncHandler(async (req, res) => {
    const requestType = String(req.params.type || "").trim().toLowerCase();
    const requestId = Number(req.params.id);
    const nextStatus = String(req.body.status || "").trim();

    const configMap = {
      reservation: {
        table: "reservations",
        allowed: ["pending", "confirmed", "completed", "cancelled"],
        selectSql: `SELECT r.*, i.title AS item_title
          FROM reservations r
          JOIN items i ON i.id = r.item_id
          WHERE r.id = ?
          LIMIT 1`,
        applyStatus: async (entry) => {
          await pool.execute("UPDATE reservations SET status = ? WHERE id = ?", [nextStatus, requestId]);
          if (nextStatus === "cancelled") {
            await pool.execute("UPDATE items SET status = 'available' WHERE id = ?", [entry.item_id]);
          } else if (nextStatus === "completed") {
            await pool.execute("UPDATE items SET status = 'completed' WHERE id = ?", [entry.item_id]);
          } else {
            await pool.execute("UPDATE items SET status = 'reserved' WHERE id = ?", [entry.item_id]);
          }
          await createNotification(entry.buyer_id, "pickup-status", `Reservation for "${entry.item_title}" is now ${nextStatus}.`);
          await createNotification(entry.seller_id, "pickup-status", `Reservation for "${entry.item_title}" is now ${nextStatus}.`);
        },
      },
      delivery: {
        table: "delivery_requests",
        allowed: ["requested", "scheduled", "completed"],
        selectSql: "SELECT * FROM delivery_requests WHERE id = ? LIMIT 1",
        applyStatus: async (entry) => {
          await pool.execute("UPDATE delivery_requests SET status = ? WHERE id = ?", [nextStatus, requestId]);
          await createNotification(entry.user_id, "delivery-status", `Delivery request is now ${nextStatus}.`);
        },
      },
      service: {
        table: "service_requests",
        allowed: ["requested", "in_progress", "completed"],
        selectSql: "SELECT * FROM service_requests WHERE id = ? LIMIT 1",
        applyStatus: async (entry) => {
          await pool.execute("UPDATE service_requests SET status = ? WHERE id = ?", [nextStatus, requestId]);
          await createNotification(entry.user_id, "service-status", `Service request is now ${nextStatus}.`);
        },
      },
      donation: {
        table: "donations",
        allowed: ["submitted", "accepted", "completed"],
        selectSql: "SELECT * FROM donations WHERE id = ? LIMIT 1",
        applyStatus: async (entry) => {
          await pool.execute("UPDATE donations SET status = ? WHERE id = ?", [nextStatus, requestId]);
          await createNotification(entry.user_id, "donation-status", `Donation request is now ${nextStatus}.`);
        },
      },
    };

    const config = configMap[requestType];
    if (!config || !requestId) {
      return res.status(400).json({ error: "Unsupported operations request." });
    }
    if (!config.allowed.includes(nextStatus)) {
      return res.status(400).json({ error: "Unsupported status for this request type." });
    }

    const [rows] = await pool.execute(config.selectSql, [requestId]);
    const entry = rows[0];
    if (!entry) {
      return res.status(404).json({ error: "Operations request not found." });
    }

    await config.applyStatus(entry);
    await logUserActivity(req, req.user.id, "admin_ops_status_update", config.table, requestId, {
      requestType,
      status: nextStatus,
    });
    res.json({ ok: true });
  })
);

app.get(
  "/api/admin/items",
  authRequired,
  adminRequired,
  asyncHandler(async (req, res) => {
    const query = cleanText(req.query.q, 120);
    const filters = ["1=1"];
    const params = [];
    if (query) {
      filters.push("(i.title LIKE ? OR i.location LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)");
      params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
    }
    const [rows] = await pool.execute(
      `SELECT
         i.*,
         u.full_name AS seller_name,
         u.email AS seller_email
       FROM items i
       JOIN users u ON u.id = i.seller_id
       WHERE ${filters.join(" AND ")}
       ORDER BY i.created_at DESC
       LIMIT 200`,
      params
    );
    res.json({
      items: rows.map((row) => ({
        id: row.id,
        sellerId: row.seller_id,
        sellerName: row.seller_name,
        sellerEmail: row.seller_email,
        title: row.title,
        description: row.description,
        category: row.category,
        location: row.location,
        price: Number(row.price || 0),
        conditionStatus: row.condition_status,
        pickupWindows: row.pickup_windows || "",
        images: normalizeList(row.images_json),
        deliveryOptions: normalizeList(row.delivery_options_json),
        donationAvailable: !!row.donation_available,
        status: row.status,
        createdAt: row.created_at,
      })),
    });
  })
);

app.patch(
  "/api/admin/items/:id",
  authRequired,
  adminRequired,
  asyncHandler(async (req, res) => {
    const itemId = Number(req.params.id);
    const [rows] = await pool.execute("SELECT * FROM items WHERE id = ? LIMIT 1", [itemId]);
    const item = rows[0];
    if (!item) return res.status(404).json({ error: "Item not found." });

    const title = cleanText(req.body.title, 180) || item.title;
    const description = cleanText(req.body.description, 4000) || item.description;
    const category = cleanText(req.body.category, 80) || item.category;
    const location = cleanText(req.body.location, 180) || item.location;
    const conditionStatus = cleanText(req.body.conditionStatus, 80) || item.condition_status;
    const pickupWindows = cleanText(req.body.pickupWindows, 255) || "";
    const status = cleanText(req.body.status, 40) || item.status;
    const price = req.body.price == null || req.body.price === "" ? Number(item.price) : Number(req.body.price);
    const images = normalizeList(req.body.images);
    const deliveryOptions = normalizeList(req.body.deliveryOptions);
    const donationAvailable = req.body.donationAvailable ? 1 : 0;

    if (!["available", "reserved", "donated", "completed"].includes(status)) {
      return res.status(400).json({ error: "Unsupported item status." });
    }
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ error: "Price must be zero or higher." });
    }

    await pool.execute(
      `UPDATE items
       SET title = ?, description = ?, category = ?, location = ?, price = ?, condition_status = ?, pickup_windows = ?,
           images_json = ?, delivery_options_json = ?, donation_available = ?, status = ?
       WHERE id = ?`,
      [
        title,
        description,
        category,
        location,
        price,
        conditionStatus,
        pickupWindows,
        JSON.stringify(images),
        JSON.stringify(deliveryOptions),
        donationAvailable,
        status,
        itemId,
      ]
    );
    await logUserActivity(req, req.user.id, "admin_item_update", "item", itemId, { status, price });
    res.json({ ok: true });
  })
);

app.delete(
  "/api/admin/items/:id",
  authRequired,
  adminRequired,
  asyncHandler(async (req, res) => {
    const itemId = Number(req.params.id);
    const [rows] = await pool.execute("SELECT title, seller_id FROM items WHERE id = ? LIMIT 1", [itemId]);
    const item = rows[0];
    if (!item) return res.status(404).json({ error: "Item not found." });
    await pool.execute("DELETE FROM items WHERE id = ?", [itemId]);
    await createNotification(item.seller_id, "listing", `Your listing "${item.title}" was removed by admin.`);
    await logUserActivity(req, req.user.id, "admin_item_delete", "item", itemId, { title: item.title });
    res.json({ ok: true });
  })
);

app.get(
  "/api/admin/opportunities",
  authRequired,
  adminRequired,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT
         o.*,
         u.full_name AS creator_name,
         u.email AS creator_email,
         COUNT(oa.id) AS application_count
       FROM opportunities o
       LEFT JOIN users u ON u.id = o.created_by
       LEFT JOIN opportunity_applications oa ON oa.opportunity_id = o.id
       GROUP BY o.id
       ORDER BY o.created_at DESC
       LIMIT 200`
    );
    res.json({
      opportunities: rows.map((row) => ({
        id: row.id,
        title: row.title,
        orgName: row.org_name,
        opportunityType: row.opportunity_type,
        location: row.location,
        skills: normalizeList(row.skills_json),
        summary: row.summary,
        applyUrl: row.apply_url || "",
        creatorName: row.creator_name || "",
        creatorEmail: row.creator_email || "",
        applicationCount: Number(row.application_count || 0),
        createdAt: row.created_at,
      })),
    });
  })
);

app.patch(
  "/api/admin/opportunities/:id",
  authRequired,
  adminRequired,
  asyncHandler(async (req, res) => {
    const opportunityId = Number(req.params.id);
    const [rows] = await pool.execute("SELECT * FROM opportunities WHERE id = ? LIMIT 1", [opportunityId]);
    const existing = rows[0];
    if (!existing) return res.status(404).json({ error: "Opportunity not found." });

    const title = cleanText(req.body.title, 180) || existing.title;
    const orgName = cleanText(req.body.orgName, 180) || existing.org_name;
    const opportunityType = cleanText(req.body.opportunityType, 40) || existing.opportunity_type;
    const location = cleanText(req.body.location, 180) || existing.location;
    const summary = cleanText(req.body.summary, 4000) || existing.summary;
    const applyUrl = cleanText(req.body.applyUrl, 2000);
    const skills = normalizeList(req.body.skills);

    if (!["internship", "volunteer"].includes(opportunityType)) {
      return res.status(400).json({ error: "Unsupported opportunity type." });
    }

    await pool.execute(
      `UPDATE opportunities
       SET title = ?, org_name = ?, opportunity_type = ?, location = ?, skills_json = ?, summary = ?, apply_url = ?
       WHERE id = ?`,
      [title, orgName, opportunityType, location, JSON.stringify(skills), summary, applyUrl || "", opportunityId]
    );
    await logUserActivity(req, req.user.id, "admin_opportunity_update", "opportunity", opportunityId, { opportunityType, orgName });
    res.json({ ok: true });
  })
);

app.delete(
  "/api/admin/opportunities/:id",
  authRequired,
  adminRequired,
  asyncHandler(async (req, res) => {
    const opportunityId = Number(req.params.id);
    const [rows] = await pool.execute("SELECT title FROM opportunities WHERE id = ? LIMIT 1", [opportunityId]);
    const opportunity = rows[0];
    if (!opportunity) return res.status(404).json({ error: "Opportunity not found." });
    await pool.execute("DELETE FROM opportunities WHERE id = ?", [opportunityId]);
    await logUserActivity(req, req.user.id, "admin_opportunity_delete", "opportunity", opportunityId, { title: opportunity.title });
    res.json({ ok: true });
  })
);

app.get(
  "/api/admin/opportunity-applications",
  authRequired,
  adminRequired,
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.execute(
      `SELECT
         oa.*,
         o.title AS opportunity_title,
         o.org_name,
         u.full_name AS user_full_name,
         u.email AS user_email
       FROM opportunity_applications oa
       JOIN opportunities o ON o.id = oa.opportunity_id
       JOIN users u ON u.id = oa.user_id
       ORDER BY oa.created_at DESC
       LIMIT 200`
    );
    res.json({
      applications: rows.map((row) => ({
        id: row.id,
        opportunityId: row.opportunity_id,
        opportunityTitle: row.opportunity_title,
        orgName: row.org_name,
        applicantName: row.applicant_name,
        applicantEmail: row.applicant_email,
        applicantPhone: row.applicant_phone || "",
        coverMessage: row.cover_message || "",
        cvUrl: row.cv_url || "",
        status: row.status,
        createdAt: row.created_at,
        user: {
          fullName: row.user_full_name,
          email: row.user_email,
        },
      })),
    });
  })
);

app.post(
  "/api/admin/opportunity-applications/:id/status",
  authRequired,
  adminRequired,
  asyncHandler(async (req, res) => {
    const applicationId = Number(req.params.id);
    const status = String(req.body.status || "");
    if (!["submitted", "reviewed", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Unsupported application status." });
    }
    const [rows] = await pool.execute("SELECT * FROM opportunity_applications WHERE id = ? LIMIT 1", [applicationId]);
    const application = rows[0];
    if (!application) {
      return res.status(404).json({ error: "Application not found." });
    }
    await pool.execute("UPDATE opportunity_applications SET status = ? WHERE id = ?", [status, applicationId]);
    await createNotification(application.user_id, "job-application", `Your application status is now ${status}.`);
    await logUserActivity(req, req.user.id, "opportunity_application_status", "opportunity_application", applicationId, { status });
    res.json({ ok: true });
  })
);

app.post(
  "/api/admin/users/:id/verification",
  authRequired,
  adminRequired,
  asyncHandler(async (req, res) => {
    const nextStatus = String(req.body.status || "");
    if (!["verified", "rejected"].includes(nextStatus)) {
      return res.status(400).json({ error: "Unsupported verification status." });
    }
    const userId = Number(req.params.id);
    await pool.execute("UPDATE users SET verification_status = ? WHERE id = ?", [nextStatus, userId]);
    await createNotification(userId, "verification", `Your student verification status is now ${nextStatus}.`);
    await logUserActivity(req, req.user.id, "admin_verification_update", "user", userId, { status: nextStatus });
    res.json({ ok: true });
  })
);

app.get(
  "/api/items",
  asyncHandler(async (req, res) => {
    const { q, category, location, minPrice, maxPrice, conditionStatus } = req.query;
    const filters = ["1=1"];
    const params = [];

    if (q) {
      filters.push("(i.title LIKE ? OR i.description LIKE ?)");
      params.push(`%${q}%`, `%${q}%`);
    }
    if (category) {
      filters.push("i.category = ?");
      params.push(category);
    }
    if (location) {
      filters.push("i.location LIKE ?");
      params.push(`%${location}%`);
    }
    if (minPrice) {
      filters.push("i.price >= ?");
      params.push(Number(minPrice));
    }
    if (maxPrice) {
      filters.push("i.price <= ?");
      params.push(Number(maxPrice));
    }
    if (conditionStatus) {
      filters.push("i.condition_status = ?");
      params.push(conditionStatus);
    }

    const [rows] = await pool.execute(
      `SELECT
         i.*,
         u.full_name AS seller_name,
         u.school_name AS seller_school,
         u.verification_status AS seller_verification
       FROM items i
       JOIN users u ON u.id = i.seller_id
       WHERE ${filters.join(" AND ")}
       ORDER BY i.created_at DESC`,
      params
    );

    res.json({
      items: rows.map((row) => ({
        ...row,
        images: normalizeList(row.images_json),
        deliveryOptions: normalizeList(row.delivery_options_json),
        donationAvailable: !!row.donation_available,
      })),
    });
  })
);

app.get(
  "/api/items/:id",
  asyncHandler(async (req, res) => {
    const itemId = Number(req.params.id);
    const [rows] = await pool.execute(
      `SELECT
         i.*,
         u.full_name AS seller_name,
         u.school_name AS seller_school,
         u.verification_status AS seller_verification,
         u.created_at AS seller_created_at
       FROM items i
       JOIN users u ON u.id = i.seller_id
       WHERE i.id = ?
       LIMIT 1`,
      [itemId]
    );
    const row = rows[0];
    if (!row) {
      return res.status(404).json({ error: "Item not found." });
    }
    const [relatedRows] = await pool.execute(
      `SELECT
         i.*,
         u.full_name AS seller_name,
         u.school_name AS seller_school,
         u.verification_status AS seller_verification
       FROM items i
       JOIN users u ON u.id = i.seller_id
       WHERE i.id <> ? AND (i.category = ? OR i.seller_id = ?) AND i.status IN ('available', 'reserved', 'completed')
       ORDER BY i.created_at DESC
       LIMIT 4`,
      [itemId, row.category, row.seller_id]
    );

    res.json({
      item: {
        ...row,
        images: normalizeList(row.images_json),
        deliveryOptions: normalizeList(row.delivery_options_json),
        donationAvailable: !!row.donation_available,
      },
      related: relatedRows.map((related) => ({
        ...related,
        images: normalizeList(related.images_json),
        deliveryOptions: normalizeList(related.delivery_options_json),
        donationAvailable: !!related.donation_available,
      })),
    });
  })
);

app.post(
  "/api/items",
  authRequired,
  asyncHandler(async (req, res) => {
    const {
      title,
      description,
      category,
      location,
      price,
      conditionStatus,
      pickupWindows,
      images,
      deliveryOptions,
      donationAvailable,
    } = req.body;

    if (!title || !description || !category || !location || price == null || !conditionStatus) {
      return res.status(400).json({ error: "Missing required item fields." });
    }
    if (Number(price) < 0) {
      return res.status(400).json({ error: "Price must be zero or higher." });
    }

    const [result] = await pool.execute(
      `INSERT INTO items
        (seller_id, title, description, category, location, price, condition_status, pickup_windows, images_json, delivery_options_json, donation_available)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        title,
        description,
        category,
        location,
        Number(price),
        conditionStatus,
        pickupWindows || "",
        JSON.stringify(normalizeList(images)),
        JSON.stringify(normalizeList(deliveryOptions)),
        donationAvailable ? 1 : 0,
      ]
    );

    await logUserActivity(req, req.user.id, "item_create", "item", result.insertId, { category, price: Number(price) });
    res.status(201).json({ id: result.insertId });
  })
);

// DELETE /api/items/:id — owner or admin only
app.delete(
  "/api/items/:id",
  authRequired,
  asyncHandler(async (req, res) => {
    const itemId = Number(req.params.id);
    const userId = req.user.id;
    const isAdmin = req.user.isAdmin;
    const [[item]] = await pool.query("SELECT id, seller_id FROM items WHERE id = ?", [itemId]);
    if (!item) return res.status(404).json({ error: "Item not found." });
    if (Number(item.seller_id) !== userId && !isAdmin) {
      return res.status(403).json({ error: "Only the seller or admin can delete this item." });
    }
    await pool.query("DELETE FROM items WHERE id = ?", [itemId]);
    res.json({ success: true });
  })
);

app.post(
  "/api/reservations",
  authRequired,
  verifiedRequired,
  asyncHandler(async (req, res) => {
    const { itemId, pickupTime, note } = req.body;
    if (!itemId || !pickupTime) {
      return res.status(400).json({ error: "Item and pickup time are required." });
    }

    const [items] = await pool.execute("SELECT * FROM items WHERE id = ? LIMIT 1", [itemId]);
    const item = items[0];
    if (!item) return res.status(404).json({ error: "Item not found." });
    if (item.status !== "available") {
      return res.status(409).json({ error: "Item is no longer available." });
    }
    if (item.seller_id === req.user.id) {
      return res.status(400).json({ error: "You cannot reserve your own item." });
    }

    const [result] = await pool.execute(
      `INSERT INTO reservations (item_id, buyer_id, seller_id, pickup_time, note)
       VALUES (?, ?, ?, ?, ?)`,
      [itemId, req.user.id, item.seller_id, pickupTime, note || ""]
    );

    await pool.execute("UPDATE items SET status = 'reserved' WHERE id = ?", [itemId]);
    await createNotification(item.seller_id, "pickup-booked", `Pickup requested for "${item.title}" on ${pickupTime}.`);
    await createNotification(req.user.id, "pickup-confirmed", `Reservation placed for "${item.title}".`);
    await notifyAdmins("ops-request", `${req.user.full_name} reserved "${item.title}" for ${pickupTime}.`, req.user.id);
    await logUserActivity(req, req.user.id, "reservation_create", "reservation", result.insertId, { itemId: Number(itemId) });

    res.status(201).json({ id: result.insertId });
  })
);

app.post(
  "/api/chats/start",
  authRequired,
  asyncHandler(async (req, res) => {
    const itemId = Number(req.body.itemId);
    if (!itemId) {
      return res.status(400).json({ error: "Item is required." });
    }

    const [items] = await pool.execute(
      `SELECT
         i.id,
         i.title,
         i.seller_id,
         i.images_json,
         u.full_name AS seller_name,
         u.school_name AS seller_school,
         u.verification_status AS seller_verification
       FROM items i
       JOIN users u ON u.id = i.seller_id
       WHERE i.id = ?
       LIMIT 1`,
      [itemId]
    );
    const item = items[0];
    if (!item) return res.status(404).json({ error: "Item not found." });
    if (Number(item.seller_id) === Number(req.user.id)) {
      return res.status(400).json({ error: "You cannot chat with yourself about your own listing." });
    }

    let conversationId = null;
    const [existing] = await pool.execute(
      "SELECT id FROM conversations WHERE item_id = ? AND buyer_id = ? LIMIT 1",
      [itemId, req.user.id]
    );
    if (existing[0]) {
      conversationId = existing[0].id;
    } else {
      const [created] = await pool.execute(
        `INSERT INTO conversations (item_id, buyer_id, seller_id)
         VALUES (?, ?, ?)`,
        [itemId, req.user.id, item.seller_id]
      );
      conversationId = created.insertId;
      await createNotification(item.seller_id, "chat", `${req.user.full_name} opened a chat about "${item.title}".`);
    }

    await logUserActivity(req, req.user.id, "chat_open", "conversation", conversationId, { itemId });
    res.status(201).json({ id: conversationId, itemId });
  })
);

app.get(
  "/api/chats",
  authRequired,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT
         c.*,
         i.title AS item_title,
         i.images_json,
         buyer.full_name AS buyer_name,
         buyer.avatar_url AS buyer_avatar_url,
         buyer.school_name AS buyer_school,
         buyer.verification_status AS buyer_verification,
         seller.full_name AS seller_name,
         seller.avatar_url AS seller_avatar_url,
         seller.school_name AS seller_school,
         seller.verification_status AS seller_verification,
         buyer_presence.last_seen_at AS buyer_last_seen,
         seller_presence.last_seen_at AS seller_last_seen,
         (buyer_presence.is_online = 1 AND buyer_presence.last_seen_at >= DATE_SUB(NOW(), INTERVAL ? SECOND)) AS buyer_is_online,
         (seller_presence.is_online = 1 AND seller_presence.last_seen_at >= DATE_SUB(NOW(), INTERVAL ? SECOND)) AS seller_is_online,
         SUM(CASE WHEN m.read_at IS NULL AND m.sender_id <> ? THEN 1 ELSE 0 END) AS unread_count
       FROM conversations c
       JOIN items i ON i.id = c.item_id
       JOIN users buyer ON buyer.id = c.buyer_id
       JOIN users seller ON seller.id = c.seller_id
       LEFT JOIN user_presence buyer_presence ON buyer_presence.user_id = buyer.id
       LEFT JOIN user_presence seller_presence ON seller_presence.user_id = seller.id
       LEFT JOIN conversation_messages m ON m.conversation_id = c.id
       WHERE c.buyer_id = ? OR c.seller_id = ?
       GROUP BY c.id
       ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`,
      [CHAT_ONLINE_WINDOW_SECONDS, CHAT_ONLINE_WINDOW_SECONDS, req.user.id, req.user.id, req.user.id]
    );
    res.json({ conversations: rows.map((row) => mapConversationRow(row, req.user.id)) });
  })
);

app.post(
  "/api/chats/presence",
  authRequired,
  asyncHandler(async (req, res) => {
    const requestedOnline = req.body.online === false ? 0 : 1;
    await pool.execute(
      `INSERT INTO user_presence (user_id, last_seen_at, is_online)
       VALUES (?, NOW(), ?)
       ON DUPLICATE KEY UPDATE last_seen_at = NOW(), is_online = VALUES(is_online)`,
      [req.user.id, requestedOnline]
    );
    res.json({ ok: true, online: !!requestedOnline });
  })
);

app.get(
  "/api/chats/:id/messages",
  authRequired,
  asyncHandler(async (req, res) => {
    const conversationId = Number(req.params.id);
    const afterId = Number(req.query.afterId || 0);
    const beforeId = Number(req.query.beforeId || 0);
    const [conversations] = await pool.execute("SELECT * FROM conversations WHERE id = ? LIMIT 1", [conversationId]);
    const conversation = conversations[0];
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    if (![conversation.buyer_id, conversation.seller_id].includes(req.user.id)) {
      return res.status(403).json({ error: "Not allowed." });
    }

    let messages = [];
    if (beforeId > 0) {
      const [olderRows] = await pool.execute(
        `SELECT
           m.*,
           u.full_name AS sender_name,
           u.avatar_url AS sender_avatar_url
         FROM conversation_messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.conversation_id = ? AND m.id < ?
         ORDER BY m.id DESC
         LIMIT 200`,
        [conversationId, beforeId]
      );
      messages = olderRows.reverse();
    } else {
      const [newerRows] = await pool.execute(
        `SELECT
           m.*,
           u.full_name AS sender_name,
           u.avatar_url AS sender_avatar_url
         FROM conversation_messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.conversation_id = ? AND m.id > ?
         ORDER BY m.id ASC
         LIMIT 200`,
        [conversationId, afterId]
      );
      messages = newerRows;
    }

    await pool.execute(
      `UPDATE conversation_messages
       SET read_at = NOW()
       WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL`,
      [conversationId, req.user.id]
    );

    res.json({
      messages: messages.map((message) => ({
        id: message.id,
        senderId: message.sender_id,
        senderName: message.sender_name,
        senderAvatarUrl: message.sender_avatar_url || "",
        body: message.body,
        imageUrl: message.image_url || "",
        createdAt: message.created_at,
        readAt: message.read_at,
      })),
    });
  })
);

app.post(
  "/api/chats/:id/messages",
  authRequired,
  asyncHandler(async (req, res) => {
    const conversationId = Number(req.params.id);
    const body = cleanText(req.body.body, 4000);
    const imageUrl = cleanText(req.body.imageUrl, 2000);
    if (!body && !imageUrl) {
      return res.status(400).json({ error: "Message cannot be empty." });
    }

    const [conversations] = await pool.execute(
      `SELECT c.*, i.title AS item_title
       FROM conversations c
       JOIN items i ON i.id = c.item_id
       WHERE c.id = ?
       LIMIT 1`,
      [conversationId]
    );
    const conversation = conversations[0];
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    if (![conversation.buyer_id, conversation.seller_id].includes(req.user.id)) {
      return res.status(403).json({ error: "Not allowed." });
    }

    const [result] = await pool.execute(
      `INSERT INTO conversation_messages (conversation_id, sender_id, body, image_url)
       VALUES (?, ?, ?, ?)`,
      [conversationId, req.user.id, body || null, imageUrl || null]
    );

    const lastMessagePreview = imageUrl && !body ? "Photo" : body;
    await pool.execute(
      `UPDATE conversations
       SET last_message = ?, last_message_at = NOW()
       WHERE id = ?`,
      [lastMessagePreview, conversationId]
    );

    const recipientId = Number(conversation.buyer_id) === Number(req.user.id) ? conversation.seller_id : conversation.buyer_id;
    await createNotification(recipientId, "chat", `${req.user.full_name}: ${String(lastMessagePreview || "").slice(0, 80)}`);
    await logUserActivity(req, req.user.id, "chat_message_send", "conversation", conversationId, {
      messageId: result.insertId,
      hasImage: !!imageUrl,
    });

    res.status(201).json({
      id: result.insertId,
      body,
      imageUrl,
      createdAt: new Date().toISOString(),
    });
  })
);

app.get(
  "/api/reservations/mine",
  authRequired,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT r.*, i.title, i.location
       FROM reservations r
       JOIN items i ON i.id = r.item_id
       WHERE r.buyer_id = ? OR r.seller_id = ?
       ORDER BY r.created_at DESC`,
      [req.user.id, req.user.id]
    );
    res.json({ reservations: rows });
  })
);

app.post(
  "/api/reservations/:id/status",
  authRequired,
  asyncHandler(async (req, res) => {
    const reservationId = Number(req.params.id);
    const nextStatus = String(req.body.status || "");
    if (!["confirmed", "completed", "cancelled"].includes(nextStatus)) {
      return res.status(400).json({ error: "Unsupported reservation status." });
    }

    const [rows] = await pool.execute(
      `SELECT r.*, i.title
       FROM reservations r
       JOIN items i ON i.id = r.item_id
       WHERE r.id = ?
       LIMIT 1`,
      [reservationId]
    );
    const reservation = rows[0];
    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found." });
    }
    if (![reservation.buyer_id, reservation.seller_id].includes(req.user.id)) {
      return res.status(403).json({ error: "You cannot update this reservation." });
    }

    const allowed =
      (reservation.status === "pending" && ["confirmed", "cancelled"].includes(nextStatus)) ||
      (reservation.status === "confirmed" && ["completed", "cancelled"].includes(nextStatus));
    if (!allowed) {
      return res.status(409).json({ error: "Reservation cannot move to that state." });
    }

    await pool.execute("UPDATE reservations SET status = ? WHERE id = ?", [nextStatus, reservationId]);
    if (nextStatus === "cancelled") {
      await pool.execute("UPDATE items SET status = 'available' WHERE id = ?", [reservation.item_id]);
    }
    if (nextStatus === "completed") {
      await pool.execute("UPDATE items SET status = 'completed' WHERE id = ?", [reservation.item_id]);
    }
    if (nextStatus === "confirmed") {
      await createNotification(reservation.buyer_id, "pickup-confirmed", `Reservation for "${reservation.title}" was confirmed.`);
    }
    res.json({ ok: true });
  })
);

app.post(
  "/api/deliveries",
  authRequired,
  asyncHandler(async (req, res) => {
    const { itemId, deliveryType, fromLocation, toLocation, notes } = req.body;
    if (!deliveryType || !fromLocation || !toLocation) {
      return res.status(400).json({ error: "Delivery type and locations are required." });
    }
    const feeEstimate = estimateDeliveryFee(deliveryType, fromLocation, toLocation);
    const [result] = await pool.execute(
      `INSERT INTO delivery_requests (item_id, user_id, delivery_type, from_location, to_location, fee_estimate, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [itemId || null, req.user.id, deliveryType, fromLocation, toLocation, feeEstimate, notes || ""]
    );

    await createNotification(req.user.id, "delivery", `Delivery request submitted. Estimated fee: NZ$${feeEstimate}.`);
    await notifyAdmins(
      "ops-request",
      `${req.user.full_name} requested ${deliveryType} delivery from ${fromLocation} to ${toLocation}.`,
      req.user.id
    );
    await logUserActivity(req, req.user.id, "delivery_request_create", "delivery_request", result.insertId, {
      itemId: itemId ? Number(itemId) : null,
      deliveryType,
    });
    res.status(201).json({ id: result.insertId, feeEstimate });
  })
);

app.post(
  "/api/services",
  authRequired,
  asyncHandler(async (req, res) => {
    const { itemId, serviceType, notes } = req.body;
    if (!serviceType) {
      return res.status(400).json({ error: "Service type is required." });
    }
    const [result] = await pool.execute(
      `INSERT INTO service_requests (item_id, user_id, service_type, notes)
       VALUES (?, ?, ?, ?)`,
      [itemId || null, req.user.id, serviceType, notes || ""]
    );
    await createNotification(req.user.id, "service", `${serviceType} request submitted.`);
    await notifyAdmins("ops-request", `${req.user.full_name} requested ${serviceType} service.`, req.user.id);
    await logUserActivity(req, req.user.id, "service_request_create", "service_request", result.insertId, {
      itemId: itemId ? Number(itemId) : null,
      serviceType,
    });
    res.status(201).json({ id: result.insertId });
  })
);

app.post(
  "/api/room-design",
  authRequired,
  asyncHandler(async (req, res) => {
    const { roomImageUrl, stylePreference, budget, notes } = req.body;
    const [items] = await pool.execute(
      "SELECT id, title, category, price, location, images_json FROM items WHERE status = 'available' ORDER BY created_at DESC LIMIT 20"
    );
    const recommendations = buildRoomRecommendations(
      items.map((row) => ({
        ...row,
        images: normalizeList(row.images_json),
      })),
      stylePreference,
      budget
    );

    const [result] = await pool.execute(
      `INSERT INTO room_design_requests (user_id, room_image_url, style_preference, budget, notes, recommendations_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, roomImageUrl || "", stylePreference || "", budget || null, notes || "", JSON.stringify(recommendations)]
    );

    res.status(201).json({ id: result.insertId, recommendations });
  })
);

app.post(
  "/api/donations",
  authRequired,
  asyncHandler(async (req, res) => {
    const { itemId, orgName, notes } = req.body;
    if (!orgName) {
      return res.status(400).json({ error: "Partner organization is required." });
    }
    const [result] = await pool.execute(
      `INSERT INTO donations (item_id, user_id, org_name, notes)
       VALUES (?, ?, ?, ?)`,
      [itemId || null, req.user.id, orgName, notes || ""]
    );

    if (itemId) {
      await pool.execute("UPDATE items SET status = 'donated' WHERE id = ? AND seller_id = ?", [itemId, req.user.id]);
    }

    await createNotification(req.user.id, "donation", `Donation request submitted to ${orgName}.`);
    await notifyAdmins("ops-request", `${req.user.full_name} submitted a donation request to ${orgName}.`, req.user.id);
    await logUserActivity(req, req.user.id, "donation_request_create", "donation", result.insertId, {
      itemId: itemId ? Number(itemId) : null,
      orgName,
    });
    res.status(201).json({ id: result.insertId });
  })
);

app.get(
  "/api/opportunities",
  asyncHandler(async (req, res) => {
    const { q, type, skill } = req.query;
    const filters = ["1=1"];
    const params = [];
    if (q) {
      filters.push("(title LIKE ? OR org_name LIKE ? OR summary LIKE ?)");
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (type) {
      filters.push("opportunity_type = ?");
      params.push(type);
    }
    if (skill) {
      filters.push("JSON_SEARCH(skills_json, 'one', ?) IS NOT NULL");
      params.push(skill);
    }
    const [rows] = await pool.execute(
      `SELECT * FROM opportunities WHERE ${filters.join(" AND ")} ORDER BY created_at DESC`,
      params
    );
    res.json({ opportunities: rows.map((row) => ({ ...row, skills: normalizeList(row.skills_json) })) });
  })
);

app.get(
  "/api/sellers/:id",
  asyncHandler(async (req, res) => {
    const sellerId = Number(req.params.id);
    const [users] = await pool.execute(
      `SELECT id, full_name, school_name, avatar_url, verification_status, created_at
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [sellerId]
    );
    const seller = users[0];
    if (!seller) {
      return res.status(404).json({ error: "Seller not found." });
    }
    const [items] = await pool.execute(
      `SELECT *
       FROM items
       WHERE seller_id = ? AND status IN ('available', 'reserved', 'completed')
       ORDER BY created_at DESC`,
      [sellerId]
    );
    const [statsRows] = await pool.execute(
      `SELECT
         COUNT(*) AS listing_count,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
         SUM(CASE WHEN status = 'reserved' THEN 1 ELSE 0 END) AS reserved_count
       FROM items
       WHERE seller_id = ?`,
      [sellerId]
    );
    const stats = statsRows[0] || { listing_count: 0, completed_count: 0, reserved_count: 0 };
    res.json({
      seller: {
        id: seller.id,
        fullName: seller.full_name,
        schoolName: seller.school_name,
        avatarUrl: seller.avatar_url || "",
        verificationStatus: seller.verification_status,
        createdAt: seller.created_at,
        joinedLabel: formatJoinDate(seller.created_at),
        stats: {
          listings: Number(stats.listing_count || 0),
          completed: Number(stats.completed_count || 0),
          reserved: Number(stats.reserved_count || 0),
        },
      },
      items: items.map((row) => ({
        ...row,
        images: normalizeList(row.images_json),
        deliveryOptions: normalizeList(row.delivery_options_json),
        donationAvailable: !!row.donation_available,
      })),
    });
  })
);

app.post(
  "/api/opportunities",
  authRequired,
  adminRequired,
  asyncHandler(async (req, res) => {
    const { title, orgName, opportunityType, location, skills, summary, applyUrl } = req.body;
    if (!title || !orgName || !opportunityType || !location || !summary) {
      return res.status(400).json({ error: "Missing required opportunity fields." });
    }
    const [result] = await pool.execute(
      `INSERT INTO opportunities
        (title, org_name, opportunity_type, location, skills_json, summary, apply_url, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, orgName, opportunityType, location, JSON.stringify(normalizeList(skills)), summary, applyUrl || "", req.user.id]
    );
    await notifyAdmins("job-post", `${req.user.full_name} posted a new opportunity: ${title}.`, req.user.id);
    await logUserActivity(req, req.user.id, "opportunity_create", "opportunity", result.insertId, { opportunityType, orgName });
    res.status(201).json({ id: result.insertId });
  })
);

app.post(
  "/api/opportunity-applications",
  authRequired,
  asyncHandler(async (req, res) => {
    const opportunityId = Number(req.body.opportunityId);
    const applicantName = cleanText(req.body.applicantName, 180) || cleanText(req.user.full_name, 180);
    const applicantEmail = String(req.body.applicantEmail || req.user.email || "").trim().toLowerCase();
    const applicantPhone = cleanText(req.body.applicantPhone, 80);
    const coverMessage = cleanText(req.body.coverMessage, 4000);
    const cvUrl = cleanText(req.body.cvUrl, 2000);

    if (!opportunityId || !applicantName || !applicantEmail) {
      return res.status(400).json({ error: "Opportunity, name, and email are required." });
    }
    if (!isValidEmail(applicantEmail)) {
      return res.status(400).json({ error: "A valid email is required." });
    }

    const [opportunityRows] = await pool.execute("SELECT id, title, org_name FROM opportunities WHERE id = ? LIMIT 1", [opportunityId]);
    const opportunity = opportunityRows[0];
    if (!opportunity) {
      return res.status(404).json({ error: "Opportunity not found." });
    }

    const [result] = await pool.execute(
      `INSERT INTO opportunity_applications
        (opportunity_id, user_id, applicant_name, applicant_email, applicant_phone, cover_message, cv_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [opportunityId, req.user.id, applicantName, applicantEmail, applicantPhone || "", coverMessage || "", cvUrl || ""]
    );

    await createNotification(req.user.id, "job-application", `Application submitted for "${opportunity.title}".`);
    await notifyAdmins(
      "job-application",
      `${applicantName} applied for "${opportunity.title}" at ${opportunity.org_name}.`,
      req.user.id
    );
    await logUserActivity(req, req.user.id, "opportunity_application_create", "opportunity_application", result.insertId, {
      opportunityId,
      hasCv: !!cvUrl,
    });

    res.status(201).json({ id: result.insertId });
  })
);

const pageRoutes = {
  "/": "index.html",
  "/chat": "chat.html",
  "/community": "community.html",
  "/marketplace": "marketplace.html",
  "/login": "login.html",
  "/register": "register.html",
  "/forgot-password": "forgot-password.html",
  "/reset-password": "reset-password.html",
  "/help": "help.html",
  "/privacy": "privacy.html",
  "/terms": "terms.html",
  "/trust": "trust.html",
  "/item": "item.html",
  "/dashboard": "dashboard.html",
  "/sell": "sell.html",
  "/services": "services.html",
  "/opportunities": "opportunities.html",
  "/seek": "opportunities.html",
  "/seller": "seller.html",
  "/admin": "admin.html",
  "/admin/verifications": "admin-verifications.html",
};

const sitemapRoutes = [
  "/",
  "/marketplace",
  "/services",
  "/opportunities",
  "/community",
  "/help",
  "/trust",
  "/privacy",
  "/terms",
];

app.get("/robots.txt", (_req, res) => {
  res.type("text/plain").send(
    [
      "User-agent: *",
      "Allow: /",
      "Disallow: /api/",
      "Disallow: /admin",
      "Disallow: /dashboard",
      "Disallow: /chat",
      "Disallow: /login",
      "Disallow: /register",
      "Disallow: /forgot-password",
      "Disallow: /reset-password",
      `Sitemap: ${buildAbsoluteUrl("/sitemap.xml")}`,
    ].join("\n")
  );
});

app.get("/sitemap.xml", (_req, res) => {
  const now = new Date().toISOString();
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...sitemapRoutes.map((route) => `  <url><loc>${buildAbsoluteUrl(route)}</loc><lastmod>${now}</lastmod></url>`),
    "</urlset>",
  ].join("\n");
  res.type("application/xml").send(xml);
});

app.get("/favicon.ico", (_req, res) => {
  sendPublicPage(res, "favicon.svg");
});

for (const [route, file] of Object.entries(pageRoutes)) {
  app.get(route, (_req, res) => {
    sendPublicPage(res, file);
  });
}

app.post(
  "/api/membership/upgrade",
  authRequired,
  asyncHandler(async (req, res) => {
    const { planName } = req.body;
    const config = {
      plus: { priorityDelivery: 0, extendedReservationHours: 24 },
      priority: { priorityDelivery: 1, extendedReservationHours: 48 },
    }[planName];

    if (!config) {
      return res.status(400).json({ error: "Unsupported membership plan." });
    }

    await pool.execute("UPDATE users SET is_premium = 1 WHERE id = ?", [req.user.id]);
    const [result] = await pool.execute(
      `INSERT INTO memberships (user_id, plan_name, status, priority_delivery, extended_reservation_hours)
       VALUES (?, ?, 'active', ?, ?)`,
      [req.user.id, planName, config.priorityDelivery, config.extendedReservationHours]
    );
    await createNotification(req.user.id, "membership", `Membership upgraded to ${planName}.`);
    res.status(201).json({ id: result.insertId });
  })
);


app.get("/api/jobs", (req, res) => {
  const jobs = parseJobsFile();
  const filtered = filterJobs(jobs, req.query || {});
  res.json({
    jobs: filtered.jobs,
    total: filtered.total,
    source: "greenloop-bound-cache",
  });
});

app.post(
  "/api/jobs/match",
  asyncHandler(async (req, res) => {
    const cvUrl = cleanText(req.body.cvUrl, 2000);
    if (!cvUrl) {
      return res.status(400).json({ error: "Upload a PDF resume first." });
    }

    const resumeText = await extractResumeText(cvUrl);
    const jobs = parseJobsFile();
    const filtered = filterJobs(jobs, req.body || req.query || {});
    const rankedJobs = sortJobsByResumeMatch(filtered.jobs, resumeText);

    res.json({
      jobs: rankedJobs,
      total: filtered.total,
      source: "greenloop-resume-match",
      resumePreview: resumeText.slice(0, 280),
    });
  })
);

app.post("/api/jobs/refresh", (_req, res) => {
  const result = triggerJobsRefresh();
  res.status(result.started ? 202 : 200).json({
    ok: true,
    ...result,
  });
});

app.get("/api/stats", (_req, res) => {
  const jobs = parseJobsFile();
  const workTypes = {};
  const locations = {};
  const companies = {};

  for (const job of jobs) {
    const type = job.workType || "unknown";
    const location = job.location || "unknown";
    const company = job.company || "unknown";
    workTypes[type] = (workTypes[type] || 0) + 1;
    locations[location] = (locations[location] || 0) + 1;
    companies[company] = (companies[company] || 0) + 1;
  }

  res.json({
    total: jobs.length,
    work_types: workTypes,
    top_locations: Object.entries(locations)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([location, count]) => ({ location, count })),
    top_companies: Object.entries(companies)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([company, count]) => ({ company, count })),
  });
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Route not found." });
  }
  if ((req.method === "GET" || req.method === "HEAD") && !path.extname(req.path)) {
    return sendPublicPage(res, "404.html", 404);
  }
  return res.status(404).type("text/plain").send("Not found.");
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Internal server error." });
});

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`GreenLoop running on http://0.0.0.0:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start GreenLoop:", error);
    process.exit(1);
  });
