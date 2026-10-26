import { contextBridge, ipcRenderer } from 'electron';
const api = {
    openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
    saveFile: (filePath, content) => ipcRenderer.invoke('save-file', filePath, content),
    getDirectory: (dirPath) => ipcRenderer.invoke('get-directory', dirPath),
    onFileChange: (callback) => {
        ipcRenderer.on('file-changed', (event, path) => callback(path));
    },
};
contextBridge.exposeInMainWorld('electronAPI', api);
//# sourceMappingURL=preload.js.map