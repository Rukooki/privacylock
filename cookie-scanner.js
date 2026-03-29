// Import required modules
const fs = require('fs'); // File system operations
const axios = require('axios'); // HTTP requests
const winston = require('winston'); // Logging
const express = require('express'); // Web server
const Docker = require('dockerode'); // Docker API

const app = express();

// Logging setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'cookie-monitor.log' }), // Log to file
    new winston.transports.Console() // Log to console
  ]
});
logger.info('Script started');
console.log('Script started');

// Docker setup (Windows fix)
const docker = new Docker({ socketPath: '\\\\.\\pipe\\docker_engine' });

// Variables to store status
let cookieServerStatus = 'UNKNOWN';
let scannerStatus = 'UNKNOWN';
let snapshotDate = null;
let backupDate = null;
let scannerProcessStatus = 'UNKNOWN';
let runningScannersCount = 0;
let exceptionCount = 0;

// Check Cookie Server health
function checkCookieServer() {
  axios.get('http: //localhost:8080/health')                        
    .then(response => {
      cookieServerStatus = 'RUNNING';
      logger.info('Cookie Server: OK');
    })
    .catch(err => {
      cookieServerStatus = 'DOWN';
      logger.error('Cookie Server: DOWN', err.message);
    });
}

                                  
function checkCookieScanners() {
  docker.listContainers({ all: true }, (err, containers) => {
    if (err) logger.error('Docker error:', err.message);
    else {
      const scanners = containers.filter(c => c.Image.includes('cookie-scanner'));
      runningScannersCount = scanners.length;
      scannerStatus = scanners.length > 0 ? 'RUNNING' : 'STOPPED';
      logger.info(`Cookie Scanners: ${scanners.length} containers`);;
    }
  });
}

                                  
function checkSnapshots() {
  fs.stat('C:/path/to/snapshot', (err, stats) => {
    if (err) logger.error('Snapshot: MISSING');
    else {
      snapshotDate = stats.mtime;
      logger.info('Latest snapshot:', stats.mtime);
    }
  });
  fs.stat('C:/path/to/backup', (err, stats) => {
    if (err) logger.error('Backup: MISSING');
    else {
      backupDate = stats.mtime;
      logger.info('Latest backup:', stats.mtime);
    }
  });
}

                                         
function checkScannerProcess() {
  docker.getContainer('cookie-scanner').exec({ Cmd: ['pgrep', '-f', 'scanner-process'] }, (err, data) => {
    if (err) {
      scannerProcessStatus = 'STOPPED';
      logger.error('Scanner process: STOPPED', err);
    } else {
      scannerProcessStatus = 'RUNNING';
      logger.info('Scanner process: RUNNING');
    }
  });
}

                            
function checkLogs() {
  fs.readFile('C:/path/to/logs', 'utf8', (err, data) => {
    if (err) logger.error('Logs: ERROR');
    else {
      const exceptions = data.match(/exception/g);
      exceptionCount = exceptions ? exceptions.length : 0;
      if (exceptions) logger.warn(`Exceptional events: ${exceptions.length}`);
    }
  });
}

               
app.get('/status', (req, res) => {
  res.json({
    cookieServerStatus,
    scannerStatus,
    latestSnapshot: snapshotDate,
    latestBackup: backupDate,
    scannerProcessStatus,
    runningScanners: runningScannersCount,
    logExceptions: exceptionCount
  });
});

               
app.listen(3000, () => {
  logger.info('Server running on 3000');
  console.log('Server running on 3000');
});

// Run checks every minute
setInterval(() => {
  checkCookieServer();
  checkCookieScanners();
  checkSnapshots();
  checkScannerProcess();
  checkLogs();
}, 60000);

//every minute