// =============================================================
// Covers: Scanner, 2 DBs tight sync, Dashboard, Taxonomy,
// Pixels, Analytics, Backup off-machine, Sandbox Customer Report
// RUN: node cookie_scanner.js a server
// =============================================================
import express from "express";
import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

const execFileAsync = promisify(execFile);
dotenv.config();
const app = express();
app.use(express.json({ limit: "10mb" }));

// -------------------------------------------------------------
// REPLACE HERE WITH XEON2 postgres details 
// -------------------------------------------------------------
const DB_CONFIG = {
  host: "localhost", // REPLACE HERE WITH XEON2 postgres host - localhost if same machine
  port: 5432, // REPLACE HERE WITH postgres port - usually 5432
  user: "postgres", // REPLACE HERE WITH postgres user on XEON2
  password: "password123" // REPLACE HERE WITH postgres password on XEON2
};

const cookiesDB = new Pool({...DB_CONFIG, database: "cookiesdb" }); // REPLACE HERE WITH db name cookiesdb
const cookiegoDB = new Pool({...DB_CONFIG, database: "cookiego" }); // REPLACE HERE WITH db name cookiego

// =============================================================
// Point 1: Scanner and Cookies Databases tightly integrated
// =============================================================
app.post("/api/scan-cookie", async (req, res) => {
  // Scanner must send these 5 fields
  const { platform, cookie_name, category, domain, description, page_url, pixel_info } = req.body;
  if (!platform ||!cookie_name ||!category ||!domain) return res.status(400).json({ error: "Missing 5 fields" });

  const client = await cookiesDB.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO cookies (platform, cookie_name, category, domain, description, page_url, pixel_info)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (domain, cookie_name, platform) DO UPDATE SET category=$3, description=$5, pixel_info=$7`,
      [platform, cookie_name, category, domain, description || "", page_url || "", JSON.stringify(pixel_info || {})]
    );
    // Guarantees every cookie in both DBs - outbox pattern
    await client.query("INSERT INTO sync_outbox (payload) VALUES ($1)", [JSON.stringify(req.body)]);
    await client.query("COMMIT");
    res.json({ ok: true, message: "Saved to cookiesdb + queued for cookiego - tight integration" });
  } catch (e) {
    await client.query("ROLLBACK").catch(()=>{});
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// =============================================================
// POINT 2: Dashboard
// =============================================================
app.get("/api/cookies", async (req,res) => {
  const r = await cookiesDB.query("SELECT * FROM cookies ORDER BY created_at DESC LIMIT 200");
  res.json(r.rows);
});

// POINT 3: Cookie Metadata + Taxonomy - Classification
app.get("/api/taxonomy", async (req,res) => {
  const r = await cookiesDB.query("SELECT * FROM taxonomy");
  res.json(r.rows);
});

app.post("/api/taxonomy", async (req,res) => {
  const { type, description, color } = req.body; // Dashboard creates this
  const sql = `INSERT INTO taxonomy (type, description, color) VALUES ($1,$2,$3) ON CONFLICT (type) DO UPDATE SET description=$2, color=$3`;
  await cookiesDB.query(sql, [type, description, color]);
  await cookiegoDB.query(sql, [type, description, color]);
  res.json({ ok: true, message: "Taxonomy added to both DBs" });
});

// =============================================================
// POINT 4: Pixel Metadata - where pixel is, x,y, in image?
// =============================================================
app.get("/api/pixels", async (req,res) => {
  const r = await cookiesDB.query("SELECT cookie_name, domain, page_url, pixel_info FROM cookies WHERE pixel_info IS NOT NULL");
  res.json(r.rows.map(row => ({
    cookie: row.cookie_name,
    domain: row.domain,
    page_url: row.page_url,
    pixel_url: row.pixel_info?.pixel_url,
    location_selector: row.pixel_info?.location_selector,
    x: row.pixel_info?.x,
    y: row.pixel_info?.y,
    is_in_image: row.pixel_info?.is_in_image,
    meta: row.pixel_info?.meta
  })));
});

// =============================================================
// POINT 5: Analytics - Ed wants reports
// =============================================================
app.get("/api/analytics", async (req,res) => {
  const [byTaxonomy, prevalence, pages, pixelAvg] = await Promise.all([
    cookiesDB.query("SELECT category, COUNT(*) as count FROM cookies GROUP BY category"),
    cookiesDB.query(`SELECT category, ROUND(AVG(cnt),2) as avg_per_page FROM (SELECT page_url, category, COUNT(*) as cnt FROM cookies WHERE page_url IS NOT NULL GROUP BY page_url, category) t GROUP BY category`),
    cookiesDB.query("SELECT COUNT(DISTINCT page_url) as total_pages, COUNT(*) as total_cookies FROM cookies"),
    cookiesDB.query("SELECT COUNT(*) FILTER (WHERE pixel_info IS NOT NULL) as pages_with_pixels FROM cookies")
  ]);
  res.json({
    taxonomy_count: byTaxonomy.rows, // How many cookies per taxonomy type
    prevalence_per_page: prevalence.rows, // Average per page
    total_stats: pages.rows[0],
    pixel_prevalence: pixelAvg.rows[0] // How prevalent tracking pixels are
  });
});

// =============================================================
// POINT 6: Sandbox to find all cookies + report for customer
// =============================================================
app.post("/api/sandbox-scan", async (req,res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "url required" });

  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const pixels = [];

    await page.setRequestInterception(true);
    page.on('request', req => {
      if (req.url().match(/pixel|track|beacon|collect|1x1|\.gif.*\?/i)) {
        pixels.push({ pixel_url: req.url(), meta: { type: "network_pixel" } });
      }
      req.continue();
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    const domData = await page.evaluate(() => {
      const cookies = document.cookie.split(';').map(c => c.trim());
      const imgs = Array.from(document.querySelectorAll('img')).filter(img => img.width <= 2 || img.src.includes('pixel') || img.src.includes('track')).map(img => {
        const rect = img.getBoundingClientRect();
        return { pixel_url: img.src, location_selector: `img[src="${img.src}"]`, x: rect.x, y: rect.y, is_in_image: true, meta: { width: img.width, height: img.height } };
      });
      return { cookies, pixels: imgs };
    });

    const allCookies = await page.cookies();
    const allPixels = [...pixels,...domData.pixels];

    // Save for analytics
    await cookiesDB.query(`INSERT INTO page_scans (page_url, total_cookies, total_pixels, scan_result) VALUES ($1,$2,$3,$4)`,
      [url, allCookies.length, allPixels.length, JSON.stringify({ cookies: allCookies, pixels: allPixels })]);

    // Customer report
    res.json({
      customer_report: {
        scanned_url: url,
        scanned_at: new Date().toISOString(),
        security_summary: { total_cookies: allCookies.length, total_tracking_pixels: allPixels.length, risk_level: allPixels.length > 5? "HIGH" : allPixels.length > 2? "MEDIUM" : "LOW" },
        taxonomy_breakdown: allCookies.reduce((a,c) => { const cat = c.name.startsWith('_ga')? 'Analytics' : 'Marketing'; a[cat]=(a[cat]||0)+1; return a; }, {}),
        cookies_found: allCookies.map(c => ({ name: c.name, domain: c.domain })),
        tracking_pixels_detailed: allPixels,
        recommendation: allPixels.length > 0? "Tracking pixels detected - may share data with 3rd parties" : "No tracking pixels"
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { if (browser) await browser.close(); }
});

// =============================================================
// POINT 7: Worker + Backup + Restore + Sync Check
// =============================================================
async function worker() {
  const { rows } = await cookiesDB.query("SELECT * FROM sync_outbox WHERE processed=false ORDER BY id LIMIT 100");
  for (const row of rows) {
    const p = row.payload;
    try {
      await cookiegoDB.query(`INSERT INTO cookies (platform, cookie_name, category, domain, description, page_url, pixel_info) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (domain, cookie_name, platform) DO UPDATE SET category=$3`,
        [p.platform, p.cookie_name, p.category, p.domain, p.description, p.page_url, JSON.stringify(p.pixel_info||{})]);
      await cookiesDB.query("UPDATE sync_outbox SET processed=true WHERE id=$1", [row.id]);
    } catch (e) { await cookiesDB.query("UPDATE sync_outbox SET retries=retries+1 WHERE id=$1", [row.id]); }
  }
}

async function backup() {
  const date = new Date().toISOString().split('T')[0];
  const tmp = "/tmp/cookie-backup"; // REPLACE HERE WITH temp folder - must be /tmp
  if (!fs.existsSync(tmp)) fs.mkdirSync(tmp, { recursive: true });
  const file1 = path.join(tmp, `cookiesdb_${date}.sql`);
  const file2 = path.join(tmp, `cookiego_${date}.sql`);

  await execFileAsync("pg_dump", ["-h", DB_CONFIG.host, "-U", DB_CONFIG.user, "-d", "cookiesdb", "-F", "p", "-f", file1]);
  await execFileAsync("pg_dump", ["-h", DB_CONFIG.host, "-U", DB_CONFIG.user, "-d", "cookiego", "-F", "p", "-f", file2]);

  const REMOTE = "b2-pentaprivacy"; // REPLACE HERE WITH your rclone remote name - MUST be off-machine
  // REPLACE HERE WITH bucket path Ed wants
  await execFileAsync("rclone", ["copy", file1, `${REMOTE}:pentaprivacy-backups/xeon2/`]);
  await execFileAsync("rclone", ["copy", file2, `${REMOTE}:pentaprivacy-backups/xeon2/`]);

  fs.unlinkSync(file1); // REPLACE HERE - DO NOT REMOVE - must delete local backup
  fs.unlinkSync(file2);
  console.log("Backup off-machine DONE");
}

async function syncCheck() {
  const [a,b,c] = await Promise.all([
    cookiesDB.query("SELECT COUNT(*) FROM cookies"),
    cookiegoDB.query("SELECT COUNT(*) FROM cookies"),
    cookiesDB.query("SELECT COUNT(*) FROM sync_outbox WHERE processed=false")
  ]);
  console.log(`cookiesdb: ${a.rows[0].count} | cookiego: ${b.rows[0].count} | pending: ${c.rows[0].count} | SYNCED: ${a.rows[0].count==b.rows[0].count && c.rows[0].count==0}`);
}

// START
const cmd = process.argv[2] || "server";
if (cmd === "server") {
  setInterval(worker, 10000); // REPLACE HERE WITH sync interval - 10000 = 10 sec
  app.listen(3000, () => console.log("Ed Complete running on 3000 - ALL POINTS COVERED")); // REPLACE HERE WITH port
} else if (cmd === "backup") { backup().then(()=>process.exit(0)); }
else if (cmd === "sync") { syncCheck().then(()=>process.exit(0)); }