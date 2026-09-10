const { app, BrowserWindow, ipcMain, dialog } = require('electron');
app.setName('jUPiter QDA');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

let mainWindow;
let backendProcess;
let backendPort = 8000;

function getWindowIcon() {
  if (process.platform === 'darwin') return path.join(__dirname, 'build', 'logo.icns');
  if (process.platform === 'linux') return path.join(__dirname, 'build', 'logo.png');
  return path.join(__dirname, 'build', 'logo.ico');
}

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: getWindowIcon(),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      additionalArguments: [`--backendPort=${backendPort}`],
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.maximize();
  mainWindow.removeMenu();
  
  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, 'frontend', 'dist', 'index.html'));
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }
}

const fs = require('fs');
const logPath = path.join(app.getPath('userData'), 'backend.log');
function log(msg) {
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
}

function getBackendExecutableName() {
  return process.platform === 'win32' ? 'jupiter-backend.exe' : 'jupiter-backend';
}

// Pick the port the backend sidecar will listen on: prefer 8000 so the
// common single-instance case is unchanged, fall back to an OS-assigned
// ephemeral port when another instance (or anything else) already holds it.
function pickBackendPort() {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => {
      const ephemeral = net.createServer();
      ephemeral.once('error', () => resolve(8000)); // last resort; the spawn below will fail loudly
      ephemeral.listen(0, '127.0.0.1', () => {
        const port = ephemeral.address().port;
        ephemeral.close(() => resolve(port));
      });
    });
    probe.listen(8000, '127.0.0.1', () => probe.close(() => resolve(8000)));
  });
}

// Function to start the FastAPI sidecar
function startBackend() {
  if (app.isPackaged) {
    const backendPath = path.join(process.resourcesPath, 'backend', 'jupiter-backend', getBackendExecutableName());
    const userDataPath = app.getPath('userData');

    if (process.platform !== 'win32' && fs.existsSync(backendPath)) {
      try {
        fs.chmodSync(backendPath, 0o755);
      } catch (err) {
        log(`Failed to chmod backend binary: ${err.message}`);
      }
    } 
    
    backendProcess = spawn(backendPath, [], {
      cwd: path.join(process.resourcesPath, 'backend'),
      env: { ...process.env, JUPITER_DATA_DIR: userDataPath, JUPITER_PORT: String(backendPort) }
    });

    backendProcess.on('error', (err) => console.error(`Failed to start backend: ${err.message}`));
    backendProcess.on('exit', (code, signal) => console.error(`Backend exited: code=${code} signal=${signal}`));
  } else {
    console.log("Running in dev mode. Ensure your FastAPI server is running on port 8000.");
  }

  if (backendProcess) {
    backendProcess.stdout.on('data', (data) => console.log(`Backend: ${data}`));
    backendProcess.stderr.on('data', (data) => console.error(`Backend Error: ${data}`));
  }
}

ipcMain.handle('dialog:openDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: "Select Project Destination"
  });
  return canceled ? null : filePaths[0];
});

ipcMain.handle('system:getDefaultPath', () => {
  return path.join(app.getPath('documents'), 'jUPiter_Projects');
});

function waitForBackend(url, timeoutMs = 15000, intervalMs = 300) {
  const http = require('http');
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      http.get(url, (res) => {
        resolve(true);
      }).on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error('Backend did not start in time'));
        } else {
          setTimeout(check, intervalMs);
        }
      });
    };
    check();
  });
}

app.whenReady().then(async() => {
  if (app.isPackaged) {
    backendPort = await pickBackendPort();
    log(`Selected backend port: ${backendPort}`);
  }
  startBackend();

   if (app.isPackaged) {
    try {
      await waitForBackend(`http://127.0.0.1:${backendPort}/`);
      log('Backend is ready.');
    } catch (err) {
      log(`Backend failed to start in time: ${err.message}`);
    }
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});