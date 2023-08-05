import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import * as fs from "fs";
import * as path from "path";
import * as discord from "discord-rpc";
import * as regedit from "regedit";

const favsPath = path.join(app.getPath("appData"), "Usagi", "favs.rbt");
const themePath = path.join(app.getPath("appData"), "Usagi", "theme.css");
const configPath = path.join(app.getPath("appData"), "Usagi", "config.rbt");
const searchRegex = /([^a-zA-Z0-9 ])+/g; // RegEx used to parse the user input on the song search input
const discordClientID = "1062894819145416805"; // This is a public key, anyone can get this ID using Discord's API

let songsPath = "";
let favSongs: string[] = [];
let mainWindow: BrowserWindow;
let currentState: any;
let queuedRPCUpdate = false;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      sandbox: true
    },
    width: 1400,
    minWidth: 600,
    minHeight: 400,
    frame: false
  });

  mainWindow.loadFile(path.join(__dirname, "../index.html"));
}

//* File handling

const assertFolder = () => {
  if (!fs.existsSync(path.join(app.getPath("appData"), "Usagi"))) {
    fs.mkdirSync(path.join(app.getPath("appData"), "Usagi"));
  }
}

const loadFavs = () => {
  if (fs.existsSync(favsPath)) {
    if (fs.statSync(favsPath).isFile()) {
      favSongs = JSON.parse(fs.readFileSync(favsPath).toString());
    }
  }
}

const loadTheme = (event: any) => {
  // Check if theme exist
  if (fs.existsSync(themePath)) {
    if (fs.statSync(themePath).isFile()) {
      event.sender.send("onTheme", themePath);
    }
  }
}

const loadConfig = async () => {
  if (fs.existsSync(configPath)) {
    if (fs.statSync(configPath).isFile()) {
      const config = JSON.parse(fs.readFileSync(configPath).toString());
      songsPath = config.songsPath;
    }
  } else {
    await tryLoadSongsFolder().then((sPath) => {
      songsPath = sPath;
      fs.writeFile(configPath, JSON.stringify({
        songsPath: songsPath
      }), () => { });
      return;
    }).catch(() => {
      dialog.showOpenDialog({
        title: "Setup your osu's \"Songs\" folder",
        properties: [
          "openDirectory"
        ],
      }).then((res) => {
        if (res.canceled) {
          return;
        }

        songsPath = res.filePaths[0];
        fs.writeFile(configPath, JSON.stringify({
          songsPath: songsPath
        }), () => { });
        mainWindow.webContents.send("requestSongReload");
      });
    });
  }
}

const tryLoadSongsFolder = async (): Promise<string> => {
  return new Promise<string>((res, rej) => {
    // Try to get the Songs folder location on Windows using the osu registry keys
    if (process.platform == "win32") {
      regedit.list(["HKLM\\SOFTWARE\\Classes\\osu!\\shell\\open\\command"], (err, list) => {
        if (err) {
          console.error(err);
          rej();
          return;
        }

        if (!list["HKLM\\SOFTWARE\\Classes\\osu!\\shell\\open\\command"].exists) {
          console.error("Osu isn't registred");
          rej();
          return;
        }

        const values = (list["HKLM\\SOFTWARE\\Classes\\osu!\\shell\\open\\command"].values[''].value as string);
        const sPath = path.join(values.split(' ')[0].replace("\\osu!.exe", ''), "Songs").replace(/["]]/g, '');
        const regex = /["]/g;

        res(sPath.replace(regex, ''));
        return;
      });
    } else {
      console.log("Not on windows");
      rej();
      return;
    }
  });
}

const sendSongData = (event: Electron.IpcMainInvokeEvent, index: any, quantity: any, searchQuery?: any) => {
  if (!fs.existsSync(songsPath)) { return; }
  let dirs = fs.readdirSync(songsPath, { withFileTypes: true }).sort().slice(index, index + quantity); // Only get the songs basedon the index and quantity

  dirs = dirs.filter(d => d.isDirectory());

  const songs: any[] = [];
  var i = 0;

  // For each song dir in the songs folder
  dirs.forEach((dir) => {

    // Get stats from url to check if it's a folder, not a file
    const stat = fs.lstatSync(path.join(songsPath, dir.name));
    if (!stat.isDirectory) {
      return;
    }

    const dirFiles = fs.readdirSync(path.join(songsPath, dir.name));

    // Check there's a .osu file
    if (!dirFiles.filter(f => f.endsWith(".osu"))[0]) {
      return;
    }

    const osuVideoFiles = dirFiles.filter(f => f.endsWith(".mp4"));
    var osuVideoFile: string = undefined;
    if (osuVideoFiles.length > 0) {
      osuVideoFile = path.join(songsPath, dir.name, osuVideoFiles[0]);
    }

    const osuFilePath = path.join(songsPath, dir.name, dirFiles.filter(f => f.endsWith(".osu"))[0])
    fs.readFile(osuFilePath, (err, data) => {
      if (err) {
        console.error(err);
        return;
      }

      const osuData = data.toString();
      const fileName = osuData.split('\n')[3].replace("AudioFilename: ", '').replace('\r', '');
      const imgIndex = osuData.split('\n').findIndex(l => l.indexOf("//Background and Video events") != -1) + 1;
      const imageLine = osuData.split('\n')[imgIndex].replace('\r', '');

      if (imageLine.split('"')[1]) { // Avoid this being undefined, as path.join throws an error when it happens
        var imageURL = path.join(songsPath, dir.name, imageLine.split('"')[1]);
      }
      if (!fs.existsSync(imageURL)) {
        imageURL = '';
      }

      const id = dir.name.split(' ')[0];

      const titleIndex = osuData.split('\n').findIndex(l => l.indexOf("Title:") != -1);
      const title = osuData.split('\n')[titleIndex].replace("Title:", '').replace('\r', '');

      const artistIndex = osuData.split('\n').findIndex(l => l.indexOf("Artist:") != -1);
      const artist = osuData.split('\n')[artistIndex].replace("Artist:", '').replace('\r', '');

      const isFavourite = favSongs.includes(id);

      if (searchQuery !== undefined && searchQuery !== "") {
        const query = `${searchQuery}`.replace(searchRegex, '').toLowerCase().split(' ').filter(w => w !== " ");
        const validWords = `${title} ${artist}`.replace(searchRegex, '').toLowerCase().split(' ').filter(w => w !== " ");
        if (query.every(w => validWords.includes(w))) {
          songs.push({
            title: title,
            artist: artist,
            isFavourite: isFavourite,
            songLocation: `file:///${path.join(songsPath, dir.name, fileName)}`,
            imageLocation: `file:///${imageURL}`,
            video: osuVideoFile ? `file:///${osuVideoFile}` : undefined
          });
        }
      } else {
        songs.push({
          title: title,
          artist: artist,
          isFavourite: isFavourite,
          songLocation: `file:///${path.join(songsPath, dir.name, fileName)}`,
          imageLocation: `file:///${imageURL}`,
          video: osuVideoFile ? `file:///${osuVideoFile}` : undefined
        });
      }

      i++;
      if (i === dirs.length - 1) {
        if (dirs.length === 0) {
          console.error("No dirs found");
          return;
        }
        event.sender.send("onSongData", songs);
      }
    });
  });
}

//* App event bindings

app.whenReady().then(() => {
  // Window Handling
  ipcMain.handle("minimize", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window.minimize();
  });

  ipcMain.handle("maximize", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window.isMaximized() ? window.unmaximize() : window.maximize();
  });

  // General
  ipcMain.handle("toggleConsole", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window.webContents.isDevToolsOpened() ? window.webContents.closeDevTools() : window.webContents.openDevTools();
  });

  ipcMain.on("updateDiscordState", (event, state) => {
    currentState = state;
  });

  ipcMain.handle("updateDiscordRPC", (event) => {
    queuedRPCUpdate = true;
    setActivity();
  });

  ipcMain.handle("openDiscordLink", (event) => {
    shell.openExternal("https://discord.com/invite/cZJJzbqp9A");
  });

  ipcMain.on("searchSongData", (event, name) => {
    sendSongData(event, 0, 5000, name);
  });

  ipcMain.on("favouriteSong", (event, songPath) => {
    songPath = songPath.replaceAll('%20', ' ').replace("file:///", '');
    const normalizedPath = path.normalize(songPath);
    const id = normalizedPath.split('\\')[normalizedPath.split('\\').length - 2].split(' ')[0];
    if (favSongs.includes(id)) {
      favSongs = favSongs.filter(s => s !== id);
    } else {
      favSongs.push(id);
    }
    fs.writeFile(favsPath, JSON.stringify(favSongs), () => { });
    sendSongData(event, 0, 5000);
  });

  ipcMain.on("getSongData", (event, index, quantity) => {
    sendSongData(event, index, quantity);
  });

  ipcMain.handle("getTheme", (event) => {
    loadTheme(event);
  });

  ipcMain.handle("updateSongsPath", (event) => {
    dialog.showOpenDialog({
      title: "Select your osu's \"Songs\" folder",
      properties: [
        "openDirectory"
      ],
    }).then((res) => {
      if (res.canceled) {
        sendSongData(event, 0, 5000);
        return;
      }
      songsPath = res.filePaths[0];
      fs.writeFile(configPath, JSON.stringify({
        songsPath: songsPath
      }), () => { });
      sendSongData(event, 0, 5000);
    });
  });

  // Ensure the usagi folder exists
  assertFolder();

  // Load the files
  loadConfig();
  loadFavs();

  // Create the window
  createWindow();
});

// Only on Mac
app.on("activate", () => {
  // Mac recreates windows in the dock if there isn't any
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// When every window is closed, the app doesn't terminate by itself
app.on("window-all-closed", () => {
  // Mac doesn't quit apps when there's no windows open
  if (process.platform !== "darwin") {
    // Terminate the aplication
    app.quit();
  }
});

//* Discord RPC 

let timer = Date.now(); // setActivity() can be called from multiple locations, to prevent API spam we use a timer
const rpc = new discord.Client({ transport: "ipc" });
const setActivity = () => {
  if (!rpc || !mainWindow || !currentState) {
    return;
  }

  // Activity can only be set every 15 seconds
  if ((Date.now() - timer) > 15000) {
    if (!queuedRPCUpdate) { return; }
    rpc.setActivity({
      details: `🎵 → ${currentState.paused ? "Idle" : currentState.title}`,
      state: `👥 → ${currentState.paused ? "Usagi" : currentState.author}`,
      startTimestamp: currentState.paused ? undefined : Date.now() - Math.ceil(currentState.time) * 1000,
      endTimestamp: currentState.paused ? undefined : Date.now() - Math.ceil(currentState.time) * 1000 + (Math.ceil(currentState.duration) * 1000)
    }).catch(console.error);
    timer = Date.now();
    queuedRPCUpdate = false;
  }
}

rpc.on("ready", () => {
  queuedRPCUpdate = true;
  setActivity();

  // Call setActivity every 15 sec, but don't queue anything
  setInterval(() => {
    setActivity();
  }, 15000);
});

//* Code executed on init

rpc.login({ clientId: discordClientID }).catch(console.error);