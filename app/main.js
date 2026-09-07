const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { pathToFileURL } = require('url');

// Register privileges BEFORE the app is ready.
// Marking standard, secure, and supportFetch prevents CORS/CSP issues with font files.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

let mainWindow = null; // Reference to the main app window
let speakerWindow = null;

ipcMain.handle('dialog:openFile', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: 'Open ModernSlides Deck',
    properties: ['openFile'],
    filters: [
      { name: 'ModernSlides Deck', extensions: ['json', 'txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const content = await fs.readFile(filePath, 'utf-8');

  return { filePath, content };
});

ipcMain.handle('toggle-fullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return false;
  
  const isFullScreen = win.isFullScreen();
  win.setFullScreen(!isFullScreen);
  return !isFullScreen;
});

ipcMain.handle('dialog:saveFile', async (event, { content, defaultName, filePath }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  let targetPath = filePath;

  // If no file path exists yet, prompt the user with OS Save Dialog
  if (!targetPath) {
    const result = await dialog.showSaveDialog(win, {
      title: 'Save ModernSlides Deck',
      defaultPath: defaultName || 'presentation.json',
      filters: [
        { name: 'ModernSlides JSON', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return null; // User canceled save
    }
    targetPath = result.filePath;
  }

  // Write content directly to the file system
  await fs.writeFile(targetPath, content, 'utf-8');
  
  return { 
    filePath: targetPath, 
    filename: path.basename(targetPath) 
  };
});

ipcMain.handle('is-fullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? win.isFullScreen() : false;
});

ipcMain.handle('exit-fullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && win.isFullScreen()) win.setFullScreen(false);
});

ipcMain.handle('trigger-print', async (event, options = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return false;

  return new Promise((resolve) => {
    win.webContents.print(
      {
        silent: false, // Opens native OS print dialog box
        printBackground: true, // Ensures slide background styles and colors are rendered
        deviceName: ''
      },
      (success, failureReason) => {
        resolve({ success, failureReason });
      }
    );
  });
});

ipcMain.handle('open-speaker-window', (event) => {
  if (speakerWindow && !speakerWindow.isDestroyed()) {
    if (speakerWindow.isMinimized()) speakerWindow.restore();
    speakerWindow.focus();
    return;
  }

  speakerWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Speaker View',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Load the html file directly
  speakerWindow.loadURL('app://local/speaker.html');

  speakerWindow.on('closed', () => {
    speakerWindow = null;
  });
});

// Relay actions (previous, next, resetTimer) from speaker window to main window
ipcMain.on('speaker-action', (event, action) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('on-speaker-action', action);
  }
});

ipcMain.on('update-speaker-timer', (event, timerText) => {
  if (speakerWindow && !speakerWindow.isDestroyed()) {
    speakerWindow.webContents.send('set-speaker-timer', timerText);
  }
});

// Relay speaker data from main window to speaker window
ipcMain.on('sync-speaker-data', (event, data) => {
  if (speakerWindow && !speakerWindow.isDestroyed()) {
    speakerWindow.webContents.send('on-sync-speaker-data', data);
  }
});

// Relay math styles from main window to speaker window
ipcMain.on('sync-speaker-math-styles', (event, styles) => {
  if (speakerWindow && !speakerWindow.isDestroyed()) {
    speakerWindow.webContents.send('on-sync-speaker-math-styles', styles);
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Intercept new window requests (target="_blank" or window.open)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Check if the link is an external web link
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url); // Open in OS default browser
      return { action: 'deny' }; // Prevent Electron from spawning an app window
    }
    
    // Internal local relative links -> Allow Electron to open as a native child window
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 1000,
        height: 700,
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          nodeIntegration: false,
          contextIsolation: true
        }
      }
    };
  });

  // Load the window using custom app protocol instead of file://
  mainWindow.loadURL('app://local/index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Handle 'app://local/...' requests
  protocol.handle('app', (request) => {
    // Parse out the relative path from 'app://local/'
    const url = new URL(request.url);
    let relativePath = url.pathname; // e.g. "/index.html" or "/vendor/fonts/..."

    // Strip leading slash for path joining
    if (relativePath.startsWith('/')) {
      relativePath = relativePath.slice(1);
    }

    // Resolve absolute path on disk
    const absolutePath = path.join(__dirname, relativePath);

    return net.fetch(pathToFileURL(absolutePath).toString());
  });

  createWindow();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});