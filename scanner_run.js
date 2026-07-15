// ============================================
// NODE.JS CODE - INTEGRATION + BACKUPS
// ONE FILE FOR ALL 5 STEPS
// ============================================

import express from "express";
import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";
import { exec } from "child_process";
import { promisify } from "util";
import fetch from "node-fetch";

const execAsync = promisify(exec);
dotenv.config();

const app = express();
app.use(express.json());

const cookiesDB = new Pool({ connectionString: process.env.DB1_URL }); // REPLACE THIS WITH YOUR COOKIES_DB URL IN.env
const cookiegoDB = new Pool({ connectionString: process.env.DB2_URL }); // REPLACE THIS WITH YOUR COOKIEGO_DB URL IN.env

// STEP 1: MAP THE DATA - ENSURE BOTH DBS HAVE THE SAME COOKIES TABLE SCHEMA
async function isValidType(type) {
  const res = await cookiegoDB.query("SELECT 1 FROM taxonomy WHERE type = $1", [type]);
  return res.rowCount > 0;
}

// STEP 2: SINGLE PIPELINE - TIGHT INTEGRATION. WRITE TO BOTH DBS IN 1 TRANSACTION OR ROLLBACK BOTH
app.post("/api/scan-cookie", async (req, res) => {
  const { domain, name, value, expiry, type, page_url, pixel_info } = req.body;

  // STEP 3: SHARED TAXONOMY - CHECK TYPE AGAINST COOKIEGO DB TAXONOMY TABLE BEFORE INSERT
  if (!await isValidType(type)) {
    return res.status(400).json({ error: `Invalid type. Must be: Essential, Marketing, Analytics, Functional` });
  }

  const client1 = await cookiesDB.connect();
  const client2 = await cookiegoDB.connect();

  try {
    await client1.query("BEGIN");
    await client2.query("BEGIN");

    const sql = `INSERT INTO cookies (domain, name, value, expiry, type, page_url, pixel_info) VALUES ($1,$2,$3,$4,$5,$6,$7)`;
    const vals = [domain, name, value, expiry, type, page_url, pixel_info];

    await client1.query(sql, vals);
    await client2.query(sql, vals);

    await client1.query("COMMIT");
    await client2.query("COMMIT");

    res.json({ ok: true });
  } catch (e) {
    await client1.query("ROLLBACK");
    await client2.query("ROLLBACK");
    res.status(500).json({ error: e.message });
  } finally {
    client1.release();
    client2.release();
  }
});

// STEP 4: SYNC CHECK - COUNT ROWS IN BOTH DBS AND ALERT IF THEY DO NOT MATCH
async function runSyncCheck() {
  const [res1, res2] = await Promise.all([
    cookiesDB.query("SELECT COUNT(*) FROM cookies"),
    cookiegoDB.query("SELECT COUNT(*) FROM cookies")
  ]);

  const count1 = parseInt(res1.rows[0].count);
  const count2 = parseInt(res2.rows[0].count);

  if (count1!== count2) {
    console.error(`MISMATCH! ${count1} vs ${count2}`);
    process.exit(1);
  } else {
    console.log(`SYNCED: ${count1}`);
    process.exit(0);
  }
}

// STEP 5: TEST + OFF-MACHINE BACKUPS - RUN TEST INSERT AND CREATE OFF-MACHINE BACKUPS
async function runTest() {
  const testCookie = {
    domain: "testsite.com", // REPLACE THIS WITH YOUR TEST DOMAIN
    name: "ga_id", // REPLACE THIS WITH YOUR TEST COOKIE NAME
    value: "123", // REPLACE THIS WITH YOUR TEST VALUE
    expiry: "2026-12-31T23:59:59Z",
    type: "Analytics",
    page_url: "https://testsite.com",
    pixel_info: { pixel: "GA4" }
  };

  const res = await fetch(`http://localhost:${process.env.PORT}/api/scan-cookie`, { // REPLACE THIS PORT IN.env IF NOT 3000
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(testCookie)
  });
  console.log(await res.json());
}

async function runBackup() {
  const date = new Date().toISOString().split('T')[0];
  const BACKUP_FOLDER = "/backups"; // REPLACE THIS WITH YOUR BACKUP FOLDER PATH

  await execAsync(`pg_dump ${process.env.DB1_URL} > ${BACKUP_FOLDER}/cookies_${date}.sql`);
  await execAsync(`pg_dump ${process.env.DB2_URL} > ${BACKUP_FOLDER}/cookiego_${date}.sql`);
  await execAsync(`rclone copy ${BACKUP_FOLDER}/ remote-b2:cookie-backups/`); // REPLACE THIS WITH YOUR RCLONE REMOTE NAME
  console.log(`Backup done ${date}`);
}

// ROUTER - PICK STEP TO RUN FROM TERMINAL
const [,, cmd] = process.argv;

if (cmd === "sync") runSyncCheck();
else if (cmd === "test") runTest();
else if (cmd === "backup") runBackup();
else app.listen(process.env.PORT || 3000); // REPLACE THIS PORT IN.env IF NOT 3000