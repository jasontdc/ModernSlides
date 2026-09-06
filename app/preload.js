const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),

  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('is-fullscreen'),
  exitFullscreen: () => ipcRenderer.invoke('exit-fullscreen'),

  printToPDF: () => ipcRenderer.invoke('print:pdf'),
  triggerPrint: (options) => ipcRenderer.invoke('trigger-print', options),

  openSpeakerWindow: () => ipcRenderer.invoke('open-speaker-window'),
  updateSpeakerTimer: (timerText) => ipcRenderer.send('update-speaker-timer', timerText),
  
  // Speaker Window specific listeners & actions
  onSpeakerData: (callback) => ipcRenderer.on('speaker:update', (_event, value) => callback(value)),
  onSetSpeakerTimer: (callback) => ipcRenderer.on('set-speaker-timer', (_, text) => callback(text)),
  speakerAction: (action) => ipcRenderer.send('speaker-action', action),
  onSpeakerAction: (callback) => ipcRenderer.on('on-speaker-action', (_, action) => callback(action)),
  syncSpeakerData: (data) => ipcRenderer.send('sync-speaker-data', data),
  onSyncSpeakerData: (callback) => ipcRenderer.on('on-sync-speaker-data', (_, data) => callback(data)),

  syncSpeakerMathStyles: (styles) => ipcRenderer.send('sync-speaker-math-styles', styles),
  onSyncSpeakerMathStyles: (callback) => ipcRenderer.on('on-sync-speaker-math-styles', (_, styles) => callback(styles))  
});