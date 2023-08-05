import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  send: (channel: string, ...data: any) => {
    //? This may be redundant
    if (["updateDiscordState", "searchSongData", "favouriteSong", "getSongData"].indexOf(channel) == -1) return;
    ipcRenderer.send(channel, ...data);
  },

  receive: (channel: string, callback: Function) => {
    //? This may be redundant
    if (["onSongData", "onTheme", "requestSongReload"].indexOf(channel) == -1) return;
    ipcRenderer.on(channel, (event, ...data) => { callback(...data) });
  },

  invoke: (channel: string) => {
    //? This may be redundant
    if (["minimize", "maximize", "toggleConsole", "updateDiscordRPC", "getTheme", "updateSongsPath", "openDiscordLink"].indexOf(channel) == -1) return;
    ipcRenderer.invoke(channel);
  }
});