// ============================================
// NODE.JS CODE - FOR XEON2 CONTAINERS + cookiesdb.pentaprivacy.org
// ED'S 5 STEPS: DB SETUP, API, SYNC, BACKUP, TEST
// ============================================

import express from "express";
import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";
import { exec } from "child_process";
import { promisify } from "util";
import fetch from "node-fetch";
import path from "path";
import fs from "fs";

const execAsync = promisify(exec);
dotenv.config();

const app = express();
app.use(express.json());

// ============================================
// STEP 1: DATABASE CONNECTIONS
// REPLACE IN.env: DB1_URL = cookiesdb container IP on xeon2
// REPLACE IN.env: DB2_URL = cookiego container IP on xeon2
// ============================================
const cookiesDB = new Pool({ connectionString: process.env.DB1_URL }); // COOKIES_DB
const cookiegoDB = new Pool({ connectionString: process.env.DB2_URL }); // COOKIEGO_DB

// ============================================
// STEP 1B: VALIDATE COOKIE TYPE
// CHECKS cookiegoDB.taxonomy TABLE BEFORE INSERT
// ============================================
async function isValidType(type) {
  const res = await cookiegoDB.query("SELECT 1 FROM taxonomy WHERE type = $1", [type]);
  return res.rowCount > 0;
}

// ============================================
// STEP 2 + 3: API ENDPOINT
// THIS IS WHAT https://cookiesdb.pentaprivacy.org/ WILL CALL
// WRITES TO BOTH DBs IN 1 TRANSACTION
// ============================================
app.post("/api/scan-cookie", async (req, res) => {
  const { domain, name, value, expiry, type, page_url, pixel_info } = req.body;

  // VALIDATE: Must be Essential, Marketing, Analytics, Functional
  if (!await isValidType(type)) {
    return res.status(400).json({ error: `Invalid type. Must be: Essential, Marketing, Analytics, Functional` });
  }

  let client1, client2;
  try {
    client1 = await cookiesDB.connect();
    client2 = await cookiegoDB.connect();

    // START TRANSACTION ON BOTH DBs
    await client1.query("BEGIN");
    await client2.query("BEGIN");

    // INSERT INTO BOTH DBs
    const sql = `INSERT INTO cookies (domain, name, value, expiry, type, page_url, pixel_info) VALUES ($1,$2,$3,$4,$5,$6,$7)`;
    const vals = [domain, name, value, expiry, type, page_url, JSON.stringify(pixel_info)];

    await client1.query(sql, vals);
    await client2.query(sql, vals);

    // COMMIT BOTH
    await client1.query("COMMIT");
    await client2.query("COMMIT");

    res.json({ ok: true });
  } catch (e) {
    // ROLLBACK BOTH IF ERROR
    if (client1) await client1.query("ROLLBACK").catch(()=>{});
    if (client2) await client2.query("ROLLBACK").catch(()=>{});
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally {
    if (client1) client1.release();
    if (client2) client2.release();
  }
});

// ============================================
// STEP 4: SYNC CHECK
// RUN: node app.js sync
// COMPARES ROW COUNT IN BOTH DBs ON XEON2
// ============================================
async function runSyncCheck() {
  try {
    const [res1, res2] = await Promise.all([
      cookiesDB.query("SELECT COUNT(*) FROM cookies"),
      cookiegoDB.query("SELECT COUNT(*) FROM cookies")
    ]);
    const count1 = parseInt(res1.rows[0].count);
    const count2 = parseInt(res2.rows[0].count);

    if (count1!== count2) {
      console.error(`MISMATCH ON XEON2! cookiesDB: ${count1} vs cookiegoDB: ${count2}`);
      process.exit(1);
    } else {
      console.log(`XEON2 SYNCED: ${count1}`);
      process.exit(0);
    }
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}

// ============================================
// STEP 5A: TEST FUNCTION
// RUN: node app.js test
// SENDS 1 TEST COOKIE TO LOCAL API
// REPLACE DATA WITH REAL DATA FROM YOUR SITE
// ============================================
async function runTest() {
  const testCookie = {
    domain: "cookiesdb.pentaprivacy.org", // REPLACE THIS
    name: "test_cookie", // REPLACE THIS
    value: "test123", // REPLACE THIS
    expiry: "2026-12-31T23:59:59Z",
    type: "Analytics", // REPLACE THIS - MUST BE IN taxonomy
    page_url: "https://cookiesdb.pentaprivacy.org/test", // REPLACE THIS
    pixel_info: { pixel: "GA4" } // REPLACE THIS
  };

  const port = process.env.PORT || 3000; // REPLACE IN.env IF NOT 3000
  const res = await fetch(`http://localhost:${port}/api/scan-cookie`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(testCookie)
  });
  console.log(await res.json());
}

// ============================================
// STEP 5B: OFF-MACHINE BACKUP
// RUN: node app.js backup
// pg_dump BOTH DBs + RCLONE TO B2/GDRIVE
// ============================================
async function runBackup() {
  const date = new Date().toISOString().split('T')[0];

  // REPLACE IN.env: BACKUP_FOLDER. On xeon2 use mounted folder /mnt/backups
  const BACKUP_FOLDER = process.env.BACKUP_FOLDER || "/mnt/backups";

  if (!fs.existsSync(BACKUP_FOLDER)) fs.mkdirSync(BACKUP_FOLDER, { recursive: true });

  try {
    // BACKUP DB1
    await execAsync(`pg_dump -d '${process.env.DB1_URL}' -F p > ${path.join(BACKUP_FOLDER, `cookies_${date}.sql`)}`);
    // BACKUP DB2
    await execAsync(`pg_dump -d '${process.env.DB2_URL}' -F p > ${path.join(BACKUP_FOLDER, `cookiego_${date}.sql`)}`);

    // REPLACE IN.env: RCLONE_REMOTE with your rclone remote name
    await execAsync(`rclone copy ${BACKUP_FOLDER}/ ${process.env.RCLONE_REMOTE}:cookie-backups/xeon2/`);
    console.log(`XEON2 Backup done ${date}`);
  } catch(e) {
    console.error("Backup failed:", e);
    process.exit(1);
  }
}

// ============================================
// ROUTER: CHOOSE WHAT TO RUN
// node app.js = Start API Server
// node app.js test = Run Test
// node app.js sync = Run Sync Check
// node app.js backup = Run Backup
// ============================================
const [,, cmd] = process.argv;
if (cmd === "sync") runSyncCheck();
else if (cmd === "test") runTest();
else if (cmd === "backup") runBackup();
else app.listen(process.env.PORT || 3000, () => console.log(`API running on xeon2 port ${process.env.PORT || 3000}`));