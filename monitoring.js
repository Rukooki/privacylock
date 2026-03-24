// monitoring.js
const fs = require('fs');
const axios = require('axios');
const winston = require('winston');
const express = require('express');
const app = express();
const Docker = require('dockerode');

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
console.log('Script started');

const docker = new Docker({ socketPath: '//./pipe/docker_engine' }); // Windows path

// Cookie Server checks
function checkCookieServer() {
  axios.get('http://localhost:8080/health')
    .then(response => logger.info('Cookie Server: OK'))
    .catch(err => logger.error('Cookie Server: DOWN', err.message));
}

// Cookie Scanner container checks
function checkCookieScanners() {
  docker.listContainers({ all: true }, (err, containers) => {
    if (err) logger.error('Docker error:', err.message);
    else {
      const scanners = containers.filter(c => c.Image.includes('cookie-scanner'));
      logger.info(`Cookie Scanners: ${scanners.length} containers`);
      scanners.forEach(c => {
        logger.info(`Scanner ${c.Id}: ${c.Status}`);
      });
    }
  });
}

// Snapshot/Backup checks
function checkSnapshots() {
  fs.stat('path/to/snapshot', (err, stats) => {
    if (err) logger.error('Snapshot: MISSING');
    else logger.info('Latest snapshot:', stats.mtime);
  });
  fs.stat('path/to/backup', (err, stats) => {
    if (err) logger.error('Backup: MISSING');
    else logger.info('Latest backup:', stats.mtime);
  });
}

// Scanner status inside container
function checkScannerProcess() {
  docker.getContainer('cookie-scanner').exec({
    Cmd: ['pgrep', '-f', 'scanner-process']
  }, (err, data) => {
    if (err) logger.error('Scanner process: STOPPED', err);
    else logger.info('Scanner process: RUNNING');
  });
}

// Exceptional events in logs
function checkLogs() {
  fs.readFile('path/to/logs', 'utf8', (err, data) => {
    if (err) logger.error('Logs: ERROR');
    else {
      const exceptions = data.match(/exception/g);
      if (exceptions) logger.warn(`Exceptional events: ${exceptions.length}`);
    }
  });
}

// Express.js API
app.get('/status', (req, res) => {
  res.json({
    serverStatus: 'OK/ERROR',
    scannerContainers: 'running/stopped',
    snapshotDate: 'date',
    backupDate: 'date',
    scannerProcess: 'running/stopped',
    scannersRunning: 'count',
    logExceptions: 'count'
  });
});

app.listen(3000, () => {
  logger.info('Server running on 3000');
  console.log('Server running on 3000');
});

// Run checks
setInterval(() => {
  checkCookieServer();
  checkCookieScanners();
  checkSnapshots();
  checkScannerProcess();
  checkLogs();
}, 60000); 

// every minute