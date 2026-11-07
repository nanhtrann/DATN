const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

let backendProcess;

function resourcePath(relativePath) {
    const root = app.isPackaged ? process.resourcesPath : app.getAppPath();
    return app.isPackaged
        ? path.join(root, relativePath)
        : path.join(root, relativePath);
}

function waitForBackend(attempt = 0) {
    return new Promise((resolve, reject) => {
        const request = http.get('http://127.0.0.1:5000/health', (response) => {
            response.resume();
            if (response.statusCode === 200) return resolve();
            return reject(new Error(`Backend returned HTTP ${response.statusCode}.`));
        });
        request.on('error', () => {
            if (attempt >= 40) return reject(new Error('Backend did not start within 20 seconds.'));
            setTimeout(() => waitForBackend(attempt + 1).then(resolve).catch(reject), 500);
        });
        request.setTimeout(3000, () => request.destroy(new Error('Backend health check timed out.')));
    });
}

function startBackend() {
    const backendDirectory = resourcePath('backend');
    const serverFile = path.join(backendDirectory, 'server.js');
    if (!fs.existsSync(serverFile)) {
        throw new Error(`Backend entry point not found: ${serverFile}`);
    }

    backendProcess = spawn(process.execPath, [serverFile], {
        cwd: backendDirectory,
        env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1',
            NODE_ENV: 'production',
            FRONTEND_DIR: resourcePath('frontend'),
            PORT: '5000'
        },
        stdio: 'ignore'
    });
    backendProcess.on('error', (error) => console.error('Cannot start backend:', error));
}

async function createWindow() {
    const window = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        autoHideMenuBar: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    await waitForBackend();
    await window.loadURL('http://127.0.0.1:5000/');
}

app.whenReady().then(async () => {
    try {
        startBackend();
        await createWindow();
    } catch (error) {
        dialog.showErrorBox('Không thể khởi động HR Assistant', error.message);
        app.quit();
    }
});

app.on('before-quit', () => {
    if (backendProcess && !backendProcess.killed) backendProcess.kill();
});

app.on('window-all-closed', () => app.quit());
