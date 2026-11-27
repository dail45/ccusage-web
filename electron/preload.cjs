"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ccusageDesktop", {
  getUpdateState: () => ipcRenderer.invoke("updater:get-state"),
  checkForUpdates: () => ipcRenderer.invoke("updater:check"),
  downloadUpdate: () => ipcRenderer.invoke("updater:download"),
  installUpdate: () => ipcRenderer.invoke("updater:install"),
  openReleasesPage: () => ipcRenderer.invoke("updater:open-releases"),
  onUpdateState: (listener) => {
    const wrapped = (_event, state) => listener(state);
    ipcRenderer.on("updater:state", wrapped);
    return () => ipcRenderer.removeListener("updater:state", wrapped);
  },
});
