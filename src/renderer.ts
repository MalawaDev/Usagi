//* Variables

// Settings
let draggingSongBar = false;
let numberSongsToLoad = 5000; // Nº of songs to load when updating all the songs. If you have more than 5000 songs, change this- it will take a *lot* of time to load though.
let msToUpdateState = 2500; // Time to update the main process with playing info to queue a Discord update. The main process calls Discord's API every 15000ms.

// Player & state
const player = new Audio();
player.volume = 20 / 100;
let currentState = {
    paused: true,
    time: 0,
    duration: 0,
    title: "Idle",
    author: "",
    favourite: false
};
const video = (document.getElementById("backgroundvid") as HTMLVideoElement);

//* Song player functions

const initSong = (song: any) => {
    player.src = song.songLocation;
    player.preload = "metadata";
    player.play();
    window.api.send("updateDiscordState", currentState);
    document.getElementById("playpause").innerText = "⏸";

    if (song.video) {
        video.src = song.video;
        video.play();
        video.playbackRate = player.playbackRate;
        video.currentTime = player.currentTime;
    } else {
        if (video.src != "") {
            video.src = "";
        }
    }
}

const play = () => {
    if (player.paused) {
        player.play();
        window.api.send("updateDiscordState", currentState);
        document.getElementById("playpause").innerText = "⏸";

        if (video.paused && !video.ended && video.src != "") {
            video.play();
            video.currentTime = player.currentTime;
        }
    }
}

const pause = () => {
    if (!player.paused) {
        player.pause();
        window.api.send("updateDiscordState", currentState);
        document.getElementById("playpause").innerText = "▶";

        if (!video.paused) {
            video.pause();
            video.currentTime = player.currentTime;
        }
    }
}

const togglePause = () => {
    player.paused ? play() : pause();
}

/* Update DOM when updating queue*/
const queue: any[] = [];

const addQueue = (...songs: any[]) => {
    songs.forEach(song => {
        var div = document.createElement("div");
        div.classList.add("queueitem");
        document.getElementById("queueremaining").appendChild(div);

        const h2 = document.createElement("h2");
        h2.innerText = song.title;
        div.appendChild(h2);

        queue.push(song); // Removes 2 from array
    });
    notify(`Queued ${songs[0].title}`);
}

const removeQueue = () => {
    document.getElementById("queueremaining").removeChild(document.getElementById("queueremaining").childNodes[0]);
    queue.shift();
}

//* Player UI functions

// Updates the entire player UI and adds event listeners for the given song
const updatePlayerData = (song: any) => {
    song.isFavourite ? document.getElementById("favbutton").classList.add("favbuttonenabled") : document.getElementById("favbutton").classList.remove("favbuttonenabled");

    // Adds the event listener to update the remaining time element with the new remaining time
    player.addEventListener("loadedmetadata", () => {
        (document.getElementById("songbar") as HTMLInputElement).max = Math.floor(player.duration).toString();
        let s = player.duration;
        document.getElementById("remainingtime").innerText = (s - (s %= 60)) / 60 + (9.5 < s ? ":" : ":0") + s.toFixed(0); // Magic to convert seconds in minutes. //! It says "60" at the minute mark
    });

    // Adds the event listener to update the time element with the new time
    player.addEventListener("timeupdate", () => {
        if (!draggingSongBar) {
            (document.getElementById("songbar") as HTMLInputElement).value = Math.floor(player.currentTime).toString();
        }
        let s = player.currentTime;
        document.getElementById("playtime").innerText = (s - (s %= 60)) / 60 + (9.5 < s ? ":" : ":0") + s.toFixed(0); // Magic to convert seconds in minutes //! It says "60" at the minute mark
    });

    // On most events, updates the current state and queues a Discord update
    ["playing", "pause", "ended", "play", "suspended", "emptied"].forEach((e) => {
        player.addEventListener(e, () => {
            currentState = {
                paused: player.paused || player.ended,
                time: player.currentTime,
                duration: player.duration,
                title: song.title,
                author: song.artist,
                favourite: song.isFavourite
            };
            window.api.send("updateDiscordState", currentState); // Only updates the playing state on the main script
            window.api.invoke("updateDiscordRPC"); // Queues an Discord RPC update with the previously given state
        });
    });

    // Updates the text elements with the song's data
    document.getElementById("songtitle").innerText = song.title;
    document.getElementById("artist").innerText = song.artist;

    // Updates the background and cover with the ones given by the song
    if (`${song.imageLocation}`.indexOf('%') === -1 && `${song.imageLocation}`.indexOf('#') === -1 && `${song.imageLocation}`.indexOf('&') === -1) {
        if (song.imageLocation.endsWith(".png") || song.imageLocation.endsWith(".jpg") || song.imageLocation.endsWith(".jpeg")) {
            (document.getElementById("songcover") as HTMLImageElement).src = song.imageLocation;
            (document.getElementById("background") as HTMLImageElement).src = song.imageLocation;
        }
    }
}

// Lists every song given
const showSongs = (songs: any) => {
    document.getElementById("songs").innerHTML = ""; // Clears every previous song from the list

    if (!songs || songs.length == 0) {
        return;
    }

    if (document.getElementById("settings").style.display === "flex") { // Removes the settings div if it's open
        document.getElementById("settings").style.display = "none";
    }

    songs = songs.sort((a: any, b: any) => a.title.localeCompare(b.title)); // Sorts by alphabetical order
    songs = songs.sort((a: any, b: any) => Number(b.isFavourite) - Number(a.isFavourite)); // Sorts by favourite condition

    // Creates a div for each song and poputates it with the song's data
    // Also adds event listeners to play and queue the song 
    songs.forEach((song: any) => {
        const container = document.createElement("div");
        container.classList.add("song");
        container.addEventListener("click", () => {
            initSong(song);
            updatePlayerData(song);
        });

        container.addEventListener("contextmenu", (ev) => {
            if (player.ended || player.src == "") {
                initSong(song);
                updatePlayerData(song);
                return;
            }
            addQueue(song);
        });

        const songImage = document.createElement("img");
        if (`${song.imageLocation}`.indexOf('%') === -1 && `${song.imageLocation}`.indexOf('#') === -1 && `${song.imageLocation}`.indexOf('&') === -1) {
            if (song.imageLocation.endsWith(".png") || song.imageLocation.endsWith(".jpg") || song.imageLocation.endsWith(".jpeg")) {
                songImage.src = `${song.imageLocation}`;
            }
        }
        songImage.classList.add("songimage");

        const songTitle = document.createElement("p");
        songTitle.innerText = song.title;

        if (song.isFavourite) {
            songTitle.innerText = `${song.title} 🌟`;
            songImage.style.filter = "drop-shadow(2px 4px 6px black)";
            container.style.boxShadow = "0px 0px 4px 0px var(--fav-color)";
        }

        container.appendChild(songImage);
        container.appendChild(songTitle);
        document.getElementById("songs").appendChild(container);
    });
}

//* Player UI event bindings

document.getElementById("playpause").addEventListener("click", () => {
    togglePause();
});

document.getElementById("loop").addEventListener("click", () => {
    if (player.loop) {
        player.loop = false;
        video.loop = false;
        document.getElementById("loop").classList.remove("songbarbuttonenabled");
    } else {
        player.loop = true;
        video.loop = true;
        document.getElementById("loop").classList.add("songbarbuttonenabled");
    }
});

document.getElementById("songbar").addEventListener("input", () => {
    draggingSongBar = true;
    player.currentTime = Number.parseInt((document.getElementById("songbar") as HTMLInputElement).value);
    video.currentTime = player.currentTime;
});

document.getElementById("songbar").addEventListener("mouseup", () => {
    draggingSongBar = false;
    if ((player.paused || player.ended) && player.src !== "") {
        play();
    }
});

document.getElementById("volumebar").addEventListener("input", () => {
    player.volume = Number.parseInt((document.getElementById("volumebar") as HTMLInputElement).value) / 100;
});

document.getElementById("searchbox").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        window.api.send("searchSongData", (document.getElementById("searchbox") as HTMLInputElement).value);
        window.scrollTo(0, 0);
    }
});

//* API Bindings and calls

window.api.receive("onSongData", (songs: any) => {
    showSongs(songs);
});

window.api.receive("requestSongReload", () => {
    window.api.send("getSongData", 0, numberSongsToLoad);
});

window.api.receive("onTheme", (path: string) => {
    var css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = path;
    document.getElementsByTagName("head")[0].appendChild(css);
});

document.getElementById("favbutton").addEventListener("click", () => {
    if (!player.src) { return; }
    window.api.send("favouriteSong", player.src);
});

document.getElementById("searchbutton").addEventListener("click", () => {
    window.api.send("searchSongData", (document.getElementById("searchbox") as HTMLInputElement).value);
    window.scrollTo(0, 0);
});

document.getElementById("settingssongsdir").addEventListener("click", () => {
    window.api.invoke("updateSongsPath");
});

document.getElementById("discordlink").addEventListener("click", () => {
    window.api.invoke("openDiscordLink");
});

//* Player event bindings

player.addEventListener("play", () => {
    document.getElementById("speed").innerText = "DT"
    document.getElementById("speed").classList.remove("songbarbuttonenabled");
    player.playbackRate = 1;
    //@ts-ignore, it now exists on chromium 
    player.preservesPitch = true;
});

//* Queue processing

player.addEventListener("ended", () => {
    if (queue.length > 0) {
        initSong(queue[0]);
        updatePlayerData(queue[0]);
        removeQueue();
    }
});

//* DT / NC modes

document.getElementById("speed").addEventListener("click", () => {
    if (player.playbackRate === 1) {
        document.getElementById("speed").classList.add("songbarbuttonenabled");
        player.playbackRate = 1.5;
        //@ts-ignore, it now exists on chromium 
        player.preservesPitch = true;
        //@ts-ignore
    } else if (player.preservesPitch) {
        document.getElementById("speed").innerText = "NC"
        //@ts-ignore
        player.preservesPitch = false;
    } else {
        document.getElementById("speed").innerText = "DT"
        document.getElementById("speed").classList.remove("songbarbuttonenabled");
        player.playbackRate = 1;
        //@ts-ignore
        player.preservesPitch = true;
    }

    video.playbackRate = player.playbackRate;
});

//* Winbar buttons

document.getElementById("minimizebutton").addEventListener("click", () => window.api.invoke("minimize"));
document.getElementById("maximizebutton").addEventListener("click", () => window.api.invoke("maximize"));
document.getElementById("closebutton").addEventListener("click", () => window.close());

//* Notifications

var notificationEnabled = false;
const notify = (text: string) => {
    if (notificationEnabled) { return; }
    notificationEnabled = true;
    document.getElementById("notification").style.animationName = "popout";
    document.getElementById("notification").style.display = "flex";
    document.getElementById("notification").style.left = "0";
    document.getElementById("notificationtext").innerText = text;
    setTimeout(() => {
        document.getElementById("notification").style.animationName = "popin";
        setTimeout(() => {
            document.getElementById("notification").style.left = "-100vw";
            notificationEnabled = false;
        }, 530);
    }, 2000);
}

//* Div toggle functions

let lastY = 0;
const toggleSongs = () => {
    if (document.getElementById("songs").style.display === "none") {
        document.getElementById("songs").style.display = "flex";
        window.scroll(0, lastY);
    } else {
        lastY = window.scrollY;
        document.getElementById("songs").style.display = "none";
    }
}

const toggleQueue = () => {
    if (document.getElementById("queue").style.display != "flex") {
        document.getElementById("queue").style.display = "flex";
    } else {
        document.getElementById("queue").style.display = "none";
    }
}

const toggleSettings = () => {
    if (document.getElementById("settings").style.display != "flex") {
        document.getElementById("settings").style.display = "flex";
    } else {
        document.getElementById("settings").style.display = "none";
    }
}

//* Div toggle event bindings

document.getElementById("cmdbutton").addEventListener("click", () => {
    window.api.invoke("toggleConsole");
});

document.getElementById("settingsbutton").addEventListener("click", () => {
    toggleSettings();
});

document.getElementById("songtogglebutton").addEventListener("click", () => {
    toggleSongs();
});

document.getElementById("queuetogglebutton").addEventListener("click", () => {
    toggleQueue();
});

//* Media keybinds

navigator.mediaSession.setActionHandler("play", () => {
    play();
});

navigator.mediaSession.setActionHandler("pause", () => {
    pause();
});

navigator.mediaSession.setActionHandler("nexttrack", () => {
    if (queue.length <= 0) { return; }
    player.currentTime = player.duration;
});

//* Application initialization

// Currently loading every song at same time, TODO: Load just some
window.api.send("getSongData", 0, numberSongsToLoad);

// Requests theme.css if it exists
window.api.invoke("getTheme");

setInterval(() => {
    currentState = {
        paused: player.paused || player.ended,
        time: player.currentTime,
        duration: player.duration,
        title: currentState.title,
        author: currentState.author,
        favourite: currentState.favourite
    };
    window.api.send("updateDiscordState", currentState);
}, msToUpdateState);

video.muted = true;