//Auto-detect Docker. Does ALL 8 requirements.
const fs = require('fs').promises;
const axios = require('axios');
const winston = require('winston');
const express = require('express');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const path = require('path');

// FIX 1: Force Docker to use WSL Unix socket, not Windows pipe
let docker = null;
try {
  const Docker = require('dockerode');
  // If running on Windows with WSL Docker, use the Unix socket
  const dockerOpts = process.platform === 'win32' && process.env.WSL_DISTRO_NAME
   ? { socketPath: '/var/run/docker.sock' }
    : process.platform === 'win32'
   ? { socketPath: '//./pipe/docker_engine' } // fallback to Desktop
    : { socketPath: '/var/run/docker.sock' }; // Linux/Mac default

  docker = new Docker(dockerOpts);
} catch {
  // dockerode not installed or Docker not running - we'll use HOST mode
}

const CONFIG = {
  snapshotPath: path.join(__dirname, 'data', 'snapshot.json'),
  backupPath: path.join(__dirname, 'data', 'backup.json'),
  logPath: path.join(__dirname, 'logs', 'app.log'),
  cookieServerUrl: 'http://localhost:8080/health',
  cookieServerTimeout: 5000,
  scannerProcessName: 'scanner.js', // Process name to find on HOST or INSIDE container
  scannerContainerFilter: 'scanner', // Container name must contain this word
  monitorPort: 3000,
  checkInterval: 60000,
  monitorToken: process.env.MONITOR_TOKEN || 'dev-token'
};

const app = express();
app.use('/status', (req, res, next) => {
  if (req.headers['x-monitor-token']!== CONFIG.monitorToken) return res.status(403).json({ error: 'Forbidden' });
  next();
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: 'cookie-monitor.log' }), new winston.transports.Console({ format: winston.format.simple() })]
});

let state = {
  mode: 'UNKNOWN', // 'DOCKER' or 'HOST'
  cookieServerStatus: 'UNKNOWN',
  snapshotDate: null,
  backupDate: null,
  hostLogExceptions: 0,
  // Docker-specific
  totalScannerContainers: 0,
  runningScannerContainers: 0,
  scannersWithProcessRunning: 0,
  containerDetails: [],
  containerLogExceptions: 0,
  // Host-specific
  scannerStatus: 'UNKNOWN',
  runningScannersCount: 0,
  lastCheckedTime: null
};

// === FUNCTION 1: Cookie Server status ===
async function checkCookieServer() {
  try {
    await axios.get(CONFIG.cookieServerUrl, { timeout: CONFIG.cookieServerTimeout });
    if (state.cookieServerStatus!== 'RUNNING') logger.info('Cookie Server: RECOVERED');
    state.cookieServerStatus = 'RUNNING';
  } catch {
    if (state.cookieServerStatus!== 'DOWN') logger.error('Cookie Server: DOWN');
    state.cookieServerStatus = 'DOWN';
  }
}

// === FUNCTIONS 2,4,5,6,7: DOCKER MODE ===
async function runDockerChecks() {
  if (!docker) throw new Error('dockerode not installed');
  await docker.ping(); // Throws if Docker daemon not running

  const allContainers = await docker.listContainers({ all: true, filters: { name: [CONFIG.scannerContainerFilter] } });

  state.mode = 'DOCKER';
  state.totalScannerContainers = allContainers.length;
  state.runningScannerContainers = 0;
  state.scannersWithProcessRunning = 0;
  state.containerDetails = [];
  state.containerLogExceptions = 0;

  for (const cInfo of allContainers) {
    const container = docker.getContainer(cInfo.Id);
    const isRunning = cInfo.State === 'running'; // FUNCTION 2: Container status
    if (isRunning) state.runningScannerContainers++;

    let processRunning = false; // FUNCTION 5: Inside container, is scanner running
    let exceptionsInContainer = 0; // FUNCTION 7: Logs inside container

    if (isRunning) {
      try {
        const exec = await container.exec({ Cmd: ['pgrep', '-f', CONFIG.scannerProcessName], AttachStdout: true });
        const stream = await exec.start();
        const output = await new Promise(r => { let d=''; stream.on('data',c=>d+=c); stream.on('end',()=>r(d.trim())); });
        processRunning = output.length > 0;
        if (processRunning) state.scannersWithProcessRunning++;
      } catch {}

      try {
        const logs = (await container.logs({ stdout: true, stderr: true, tail: 1000 })).toString('utf8');
        exceptionsInContainer = (logs.match(/exception/gi) || []).length;
        state.containerLogExceptions += exceptionsInContainer;
      } catch {}
    }

    state.containerDetails.push({
      name: cInfo.Names[0].replace('/', ''),
      id: cInfo.Id.slice(0, 12),
      containerState: cInfo.State, // FUNCTION 2
      scannerProcessRunning: processRunning, // FUNCTION 5
      logExceptions: exceptionsInContainer // FUNCTION 7
    });
  }
}

// === FUNCTION 6: HOST MODE - how many scanners running ===
async function runHostChecks() {
  state.mode = 'HOST';
  try {
    // FIX 2: If we're in WSL, use Linux commands even on Windows host
    const isWSL =!!process.env.WSL_DISTRO_NAME;
    const cmd = process.platform === 'win32' &&!isWSL
     ? `wmic process where "name='node.exe'" get CommandLine`
      : `pgrep -f ${CONFIG.scannerProcessName}`;

    const { stdout } = await execPromise(cmd);
    state.runningScannersCount = process.platform === 'win32' &&!isWSL
     ? stdout.split('\n').filter(l => l.includes(CONFIG.scannerProcessName)).length
      : stdout.trim()? stdout.trim().split('\n').length : 0;
    state.scannerStatus = state.runningScannersCount > 0? 'RUNNING' : 'STOPPED';
  } catch (err) {
    state.runningScannersCount = 0;
    state.scannerStatus = err.code === 1? 'STOPPED' : 'ERROR';
  }
}

// === FUNCTIONS 3,4,7: Host files ===
async function checkHostFiles() {
  try { state.snapshotDate = (await fs.stat(CONFIG.snapshotPath)).mtime; } catch { state.snapshotDate = null; } // FUNCTION 3
  try { state.backupDate = (await fs.stat(CONFIG.backupPath)).mtime; } catch { state.backupDate = null; } // FUNCTION 4
  try {
    const data = await fs.readFile(CONFIG.logPath, 'utf8');
    state.hostLogExceptions = (data.match(/exception/gi) || []).length; // FUNCTION 7 for host
  } catch { state.hostLogExceptions = 0; }
}

function isStale(date, hours = 24) {
  if (!date) return true;
  return (Date.now() - new Date(date).getTime()) > hours * 3600 * 1000;
}

// === FUNCTION 8: Data analysis + API ===
app.get('/status', (req, res) => {
  let status = 'HEALTHY';
  if (state.cookieServerStatus!== 'RUNNING') status = 'CRITICAL';
  else if (state.mode === 'DOCKER' && (state.runningScannerContainers === 0 || state.scannersWithProcessRunning < state.runningScannerContainers)) status = 'DEGRADED';
  else if (state.mode === 'HOST' && state.scannerStatus!== 'RUNNING') status = 'DEGRADED';
  else if (isStale(state.snapshotDate, 24)) status = 'DEGRADED'; // FUNCTION 8: Analysis

  const base = {
    status,
    mode: state.mode,
    cookieServer: state.cookieServerStatus, // FUNCTION 1
    snapshotDate: state.snapshotDate, // FUNCTION 3
    snapshotStale: isStale(state.snapshotDate, 24), // FUNCTION 8
    backupDate: state.backupDate, // FUNCTION 4
    backupStale: isStale(state.backupDate, 168), // FUNCTION 8
    lastChecked: state.lastCheckedTime
  };

  if (state.mode === 'DOCKER') {
    res.json({
     ...base,
      scanners: {
        totalContainers: state.totalScannerContainers, // FUNCTION 2
        runningContainers: state.runningScannerContainers, // FUNCTION 2 + 6
        withScannerProcessRunning: state.scannersWithProcessRunning, // FUNCTION 5
        details: state.containerDetails // FUNCTIONS 2,5,7 per container
      },
      exceptions: {
        hostLog: state.hostLogExceptions, // FUNCTION 7
        containerLogs: state.containerLogExceptions, // FUNCTION 7
        total: state.hostLogExceptions + state.containerLogExceptions // FUNCTION 8
      }
    });
  } else {
    res.json({
     ...base,
      scanner: state.scannerStatus, // FUNCTION 5 + 6 for host
      runningScanners: state.runningScannersCount, // FUNCTION 6
      exceptions: { hostLog: state.hostLogExceptions, total: state.hostLogExceptions } // FUNCTION 7
    });
  }
});

const server = app.listen(CONFIG.monitorPort, () => logger.info(`Monitor ready in ${state.mode} mode: http://localhost:${CONFIG.monitorPort}/status`));
server.on('error', err => { logger.error('Port bind failed', { error: err.message }); process.exit(1); });

async function runAllChecks() {
  await Promise.allSettled([checkCookieServer(), checkHostFiles()]);
  // Try Docker mode first. If it fails for ANY reason, use host mode.
  try {
    await runDockerChecks();
  } catch (err) {
    logger.info('Using HOST mode', { reason: err.message });
    await runHostChecks();
  }
  state.lastCheckedTime = new Date().toISOString();
}

runAllChecks();
const intervalId = setInterval(runAllChecks, CONFIG.checkInterval);
process.on('SIGINT', () => { clearInterval(intervalId); process.exit(0); });