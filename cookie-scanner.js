// Import required modules
const fs = require('fs').promises; // Using promises API for cleaner async/await
const axios = require('axios'); // For HTTP health checks to cookie server
const winston = require('winston'); // Structured logging to file + console
const express = require('express'); // Lightweight web server for /status endpoint
const { exec } = require('child_process'); // Run shell commands like pgrep/tasklist
const util = require('util');
const execPromise = util.promisify(exec); // Convert exec callback to promise

// =============== CONFIG - UPDATE THESE VALUES ===============
const CONFIG = {
  // File paths to monitor - change these to your real paths
  snapshotPath: 'C:/Users/hp/privacylock/data/snapshot.json',
  backupPath: 'C:/Users/hp/privacylock/data/backup.json',
  logPath: 'C:/Users/hp/privacylock/logs/app.log',
  
  // Cookie server health check URL
  cookieServerUrl: 'http://localhost:8080/health',
  cookieServerTimeout: 5000, // 5 second timeout for health check
  
  // Process name to look for - check Task Manager > Details tab
  // Use 'node' if your scanner runs as node.exe, or 'scanner.exe' if it's compiled
  scannerProcessName: 'node',
  
  // Server settings
  monitorPort: 3000, // Port for this monitoring dashboard
  checkInterval: 60000 // How often to run checks, in ms. 60000 = 1 minute
};
// ============================================================

const app = express();

// Setup Winston logger: logs JSON to file + readable logs to console
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'cookie-monitor.log' }),
    new winston.transports.Console({
      format: winston.format.simple() // Makes console logs easier to read
    })
  ]
});

logger.info('Cookie monitor script started');

// Variables to store latest status - these get updated every minute
let cookieServerStatus = 'UNKNOWN';
let scannerStatus = 'UNKNOWN';
let snapshotDate = null;
let backupDate = null;
let scannerProcessStatus = 'UNKNOWN';
let runningScannersCount = 0;
let exceptionCount = 0;
let lastCheckedTime = null;

/**
 * Check if the main Cookie Server is responding
 * Hits the /health endpoint and updates cookieServerStatus
 */
async function checkCookieServer() {
  try {
    await axios.get(CONFIG.cookieServerUrl, { timeout: CONFIG.cookieServerTimeout });
    cookieServerStatus = 'RUNNING';
    logger.info('Cookie Server: OK');
  } catch (err) {
    cookieServerStatus = 'DOWN';
    // ECONNREFUSED means server is down. ETIMEDOUT means it's slow/not responding
    logger.error('Cookie Server: DOWN', { error: err.message, code: err.code });
  }
}

/**
 * Check how many cookie scanner processes are running
 * Uses pgrep on Linux/Mac, tasklist on Windows
 */
async function checkCookieScanners() {
  try {
    // Different command for Windows vs Linux/Mac
    const cmd = process.platform === 'win32' 
      ? `tasklist /FI "IMAGENAME eq ${CONFIG.scannerProcessName}" /NH` 
      : `pgrep -f ${CONFIG.scannerProcessName}`;
    
    const { stdout } = await execPromise(cmd);
    
    // Parse output: count lines that actually contain the process name
    if (process.platform === 'win32') {
      const lines = stdout.split('\n').filter(line => line.includes(CONFIG.scannerProcessName));
     runningScannersCount = lines.length;
    } else {
      // pgrep returns one PID per line
      runningScannersCount = stdout.trim() ? stdout.trim().split('\n').length : 0;
    }
    
    scannerStatus = runningScannersCount > 0 ? 'RUNNING' : 'STOPPED';
    logger.info(`Cookie Scanners: ${runningScannersCount} processes found`);
  } catch (err) {
    // pgrep exits with code 1 when no processes found - that's not an error
    if (err.code === 1) {
      runningScannersCount = 0;
      scannerStatus = 'STOPPED';
      logger.info('Cookie Scanners: 0 processes');
    } else {
      scannerStatus = 'ERROR';
      runningScannersCount = 0;
      logger.error('Scanner check failed', { error: err.message });
    }
  }
}

/**
 * Check for a specific scanner process
 * Same as above but could be used for a different process name if needed
 */
async function checkScannerProcess() {
  try {
    const cmd = process.platform === 'win32'
      ? `tasklist /FI "IMAGENAME eq ${CONFIG.scannerProcessName}" /NH`
      : `pgrep -f ${CONFIG.scannerProcessName}`;
      
    await execPromise(cmd);
    scannerProcessStatus = 'RUNNING';
    logger.info('Scanner process: RUNNING');
  } catch (err) {
    scannerProcessStatus = 'STOPPED';
    logger.info('Scanner process: STOPPED');
  }
}

/**
 * Check last modified time of snapshot and backup files
 * ENOENT = file doesn't exist yet, which is fine - we just log a warning
 */
async function checkSnapshots() {
  // Check snapshot file
  try {
    const stats = await fs.stat(CONFIG.snapshotPath);
    snapshotDate = stats.mtime;
    logger.info('Latest snapshot found', { date: stats.mtime, path: CONFIG.snapshotPath });
  } catch (err) {
    snapshotDate = null;
    if (err.code === 'ENOENT') {
      logger.warn('Snapshot file not found', { path: CONFIG.snapshotPath });
    } else {
      logger.error('Snapshot check failed', { error: err.message });
    }
  }

  // Check backup file
  try {
    const stats = await fs.stat(CONFIG.backupPath);
    backupDate = stats.mtime;
    logger.info('Latest backup found', { date: stats.mtime, path: CONFIG.backupPath });
  } catch (err) {
    backupDate = null;
    if (err.code === 'ENOENT') {
      logger.warn('Backup file not found', { path: CONFIG.backupPath });
    } else {
      logger.error('Backup check failed', { error: err.message });
    }
  }
}

/**
 * Scan log file for exceptions
 * Counts occurrences of the word 'exception' case-insensitive
 */
async function checkLogs() {
  try {
    const data = await fs.readFile(CONFIG.logPath, 'utf8');
    const exceptions = data.match(/exception/gi); // g = global, i = case-insensitive
    exceptionCount = exceptions ? exceptions.length : 0;
    
    if (exceptionCount > 0) {
      logger.warn(`Found ${exceptionCount} exceptions in logs`);
    } else {
      logger.info('No exceptions found in logs');
    }
  } catch (err) {
    exceptionCount = 0;
    if (err.code === 'ENOENT') {
      logger.warn('Log file not found', { path: CONFIG.logPath });
    } else {
      logger.error('Log check failed', { error: err.message });
    }
  }
}

/**
 * Express route - returns all current status as JSON
 * Access this at http://localhost:3000/status
 */
app.get('/status', (req, res) => {
  res.json({
    status: cookieServerStatus === 'RUNNING' && scannerStatus === 'RUNNING' ? 'HEALTHY' : 'DEGRADED',
    cookieServerStatus,
    scannerStatus,
    latestSnapshot: snapshotDate,
    latestBackup: backupDate,
    scannerProcessStatus,
    runningScanners: runningScannersCount,
    logExceptions: exceptionCount,
    lastChecked: lastCheckedTime
  });
});

// Start the Express server
app.listen(CONFIG.monitorPort, () => {
  logger.info(`Monitor dashboard running on http://localhost:${CONFIG.monitorPort}/status`);
});

/**
 * Run all checks in parallel
 * Promise.allSettled means one failure won't stop the others
 */
async function runAllChecks() {
  logger.info('Running health checks...');
  await Promise.allSettled([
    checkCookieServer(),
    checkCookieScanners(),
    checkSnapshots(),
    checkScannerProcess(),
    checkLogs()
  ]);
  lastCheckedTime = new Date().toISOString();
  logger.info('Health checks complete');
}

// Run checks immediately on startup, then repeat on interval
runAllChecks();
setInterval(runAllChecks, CONFIG.checkInterval);