// Import required modules
const fs = require('fs').promises; // Using promises API - cleaner
const axios = require('axios'); // HTTP requests
const winston = require('winston'); // Logging
const express = require('express'); // Web server
const { exec } = require('child_process'); // Run shell commands
const util = require('util');
const execPromise = util.promisify(exec); // Promise version of exec

const app = express();

// Logging setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'cookie-monitor.log' }),
    new winston.transports.Console()
  ]
});
logger.info('Script started');

// Variables to store status
let cookieServerStatus = 'UNKNOWN';
let scannerStatus = 'UNKNOWN';
let snapshotDate = null;
let backupDate = null;
let scannerProcessStatus = 'UNKNOWN';
let runningScannersCount = 0;
let exceptionCount = 0;

// Check Cookie Server health
async function checkCookieServer() {
  try {
    await axios.get('http://localhost:8080/health', { timeout: 5000 });
    cookieServerStatus = 'RUNNING';
    logger.info('Cookie Server: OK');
  } catch (err) {
    cookieServerStatus = 'DOWN';
    logger.error('Cookie Server: DOWN', { error: err.message });
  }
}

// Check Cookie Scanners - looks for running processes instead of containers
async function checkCookieScanners() {
  try {
    // On Windows: tasklist /FI "IMAGENAME eq scanner.exe"
    // On Linux/Mac: pgrep -f cookie-scanner | wc -l
    const cmd = process.platform === 'win32' 
      ? `tasklist /FI "IMAGENAME eq scanner.exe" /NH` 
      : `pgrep -f cookie-scanner`;
    
    const { stdout } = await execPromise(cmd);
    
    if (process.platform === 'win32') {
      runningScannersCount = stdout.includes('scanner.exe') ? stdout.split('\n').filter(Boolean).length : 0;
    } else {
      runningScannersCount = stdout.trim() ? stdout.trim().split('\n').length : 0;
    }
    
    scannerStatus = runningScannersCount > 0 ? 'RUNNING' : 'STOPPED';
    logger.info(`Cookie Scanners: ${runningScannersCount} processes`);
  } catch (err) {
    // pgrep returns exit code 1 if no processes found - not really an error
    if (err.code === 1) {
      runningScannersCount = 0;
      scannerStatus = 'STOPPED';
      logger.info('Cookie Scanners: 0 processes');
    } else {
      scannerStatus = 'ERROR';
      runningScannersCount = 0;
      logger.error('Scanner check error:', { error: err.message });
    }
  }
}

// Check if specific scanner process is running
async function checkScannerProcess() {
  try {
    const cmd = process.platform === 'win32'
      ? `tasklist /FI "IMAGENAME eq scanner-process.exe" /NH`
      : `pgrep -f scanner-process`;
      
    await execPromise(cmd);
    scannerProcessStatus = 'RUNNING';
    logger.info('Scanner process: RUNNING');
  } catch (err) {
    scannerProcessStatus = 'STOPPED';
    logger.info('Scanner process: STOPPED');
  }
}

async function checkSnapshots() {
  try {
    const stats = await fs.stat('C:/path/to/snapshot');
    snapshotDate = stats.mtime;
    logger.info('Latest snapshot:', { date: stats.mtime });
  } catch (err) {
    logger.error('Snapshot: MISSING', { error: err.message });
    snapshotDate = null;
  }

  try {
    const stats = await fs.stat('C:/path/to/backup');
    backupDate = stats.mtime;
    logger.info('Latest backup:', { date: stats.mtime });
  } catch (err) {
    logger.error('Backup: MISSING', { error: err.message });
    backupDate = null;
  }
}

async function checkLogs() {
  try {
    const data = await fs.readFile('C:/path/to/logs', 'utf8');
    const exceptions = data.match(/exception/gi);
    exceptionCount = exceptions ? exceptions.length : 0;
    if (exceptions) logger.warn(`Exceptional events: ${exceptions.length}`);
  } catch (err) {
    logger.error('Logs: ERROR', { error: err.message });
    exceptionCount = 0;
  }
}

app.get('/status', (req, res) => {
  res.json({
    cookieServerStatus,
    scannerStatus,
    latestSnapshot: snapshotDate,
    latestBackup: backupDate,
    scannerProcessStatus,
    runningScanners: runningScannersCount,
    logExceptions: exceptionCount,
    lastChecked: new Date().toISOString()
  });
});

app.listen(3000, () => {
  logger.info('Server running on 3000');
});

async function runAllChecks() {
  await Promise.allSettled([
    checkCookieServer(),
    checkCookieScanners(),
    checkSnapshots(),
    checkScannerProcess(),
    checkLogs()
  ]);
}

// Run checks on startup, then every minute
runAllChecks();
setInterval(runAllChecks, 60000);