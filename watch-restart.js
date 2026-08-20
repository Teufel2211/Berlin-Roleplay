const chokidar = require('chokidar');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;
const QUIET_TIME = 30_000;
const IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/logs/**',
  '**/data/**',
  '**/*.log',
  '**/watch-restart.js',
];

let botProcess = null;
let restartTimer = null;
let lastChangeAt = 0;
let restarting = false;
let shuttingDown = false;

function startBot() {
  if (shuttingDown) return;

  console.log('[Watcher] Starte Bot...');
  botProcess = spawn(process.execPath, [path.join(ROOT, 'src', 'index.js')], {
    cwd: ROOT,
    stdio: 'inherit',
    windowsHide: false,
  });

  botProcess.on('error', (error) => {
    console.error('[Watcher] Bot-Prozess konnte nicht gestartet werden:', error);
  });

  botProcess.on('exit', (code, signal) => {
    botProcess = null;
    console.log(`[Watcher] Bot beendet. Code=${code ?? 'null'} Signal=${signal ?? 'null'}`);

    if (shuttingDown || restarting) return;

    console.log('[Watcher] Unerwarteter Bot-Abbruch → Neustart in 3 Sekunden.');
    setTimeout(() => {
      if (!botProcess && !shuttingDown) startBot();
    }, 3000);
  });
}

function restartBot() {
  if (restarting || shuttingDown) return;
  restarting = true;

  console.log('[Watcher] 30 Sekunden ohne Dateiänderung.');
  console.log('[Watcher] Starte Bot neu...');

  if (!botProcess) {
    restarting = false;
    startBot();
    return;
  }

  const processToStop = botProcess;

  const forceKillTimer = setTimeout(() => {
    if (botProcess === processToStop) {
      console.log('[Watcher] Prozess reagiert nicht → erzwinge Beenden.');
      processToStop.kill('SIGKILL');
    }
  }, 5000);

  processToStop.once('exit', () => {
    clearTimeout(forceKillTimer);
    if (botProcess === processToStop) botProcess = null;
    restarting = false;
    startBot();
  });

  processToStop.kill('SIGTERM');
}

function scheduleRestart() {
  lastChangeAt = Date.now();
  clearTimeout(restartTimer);

  restartTimer = setTimeout(() => {
    const elapsed = Date.now() - lastChangeAt;
    if (elapsed >= QUIET_TIME) {
      restartBot();
      return;
    }
    scheduleRestart();
  }, QUIET_TIME);
}

const watcher = chokidar.watch(ROOT, {
  ignored: IGNORE,
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 500,
    pollInterval: 100,
  },
});

watcher.on('all', (event, filePath) => {
  const relativePath = path.relative(ROOT, filePath);
  console.log(`[Watcher] Änderung erkannt: ${event} → ${relativePath}`);
  scheduleRestart();
});

watcher.on('error', (error) => {
  console.error('[Watcher] Watcher-Fehler:', error);
});

console.log('[Watcher] Überwachung aktiv. Neustart nach 30 Sekunden ohne Änderungen.');
startBot();

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(restartTimer);

  console.log('[Watcher] Beende...');
  await watcher.close();

  if (botProcess) {
    const processToStop = botProcess;
    processToStop.kill('SIGTERM');

    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (botProcess === processToStop) processToStop.kill('SIGKILL');
        resolve();
      }, 5000);
      processToStop.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
