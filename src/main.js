const { open, write, rename, remove, exists, mkdir, BaseDirectory } = window.__TAURI__.fs;
const { arch, platform, exeExtension } = window.__TAURI__.os;
const { appDataDir } = window.__TAURI__.path;
const { message } = window.__TAURI__.dialog;
const { Command } = window.__TAURI__.shell;
const { listen } = window.__TAURI__.event;
const { exit } = window.__TAURI__.process;
const { invoke } = window.__TAURI__.core;
const { fetch } = window.__TAURI__.http;
const path = window.__TAURI__.path;

const delay = ms => new Promise(res => setTimeout(res, ms));

const screens = {
    0: "main-screen",
    1: "edit-screen",
    2: "loading-screen",
    3: "logging-screen",
    4: "connected-screen",
    5: "un-supported-device",
};

const links = [
    { platform: "windows", arch: "x86_64", link: "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-386.exe", postfix: ".exe" },
    { platform: "windows", arch: "aarch64", link: "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe", postfix: ".exe" },

    { platform: "macos", arch: "aarch64", link: "https://github.com/cloudflare/cloudflared/releases/download/2024.11.1/cloudflared-darwin-arm64.tgz", postfix: ".tgz" },
];

async function getExePostfix() {
    const exe = await exeExtension();
    return exe != "" ? `.${exe}` : exe;
}

//--

let currentScreenIndex = 0;
let servers = [];
let isInDeleteMode = false;
let cloudflaredPath;
let cloudflaredProcess;

function setScreen(newScreen) {
    let newScreenIndex = newScreen;

    if (typeof newScreen === "string") {
        for (const screen in screens) {
            if (screens[screen] === newScreen) {
                newScreenIndex = screen;
                break;
            }
        }
    }

    let new_body = document.getElementById(screens[newScreenIndex]);
    let current_body = document.getElementById(screens[currentScreenIndex]);

    current_body.style.display = "none";
    new_body.style.display = "block";

    currentScreenIndex = newScreenIndex;
}

//--

async function beginConnectionOnIndex(serverIndex) {
    setScreen("loading-screen");
    let selectedServer = servers[serverIndex];
    let localHostPort = Math.floor(25565 + Math.random() * 2000);

    let commandName;
    if (await exeExtension() === "exe") {
        commandName = "cloudflared-exe";
    } else {
        commandName = "cloudflared";
    }

    let command = await Command.create(commandName, ["access", "tcp", "--hostname", selectedServer.ip, "--url", `localhost:${localHostPort}`]);
    command.on('error', error => console.error(error));
    command.stdout.on('data', line => console.log(line));
    command.stderr.on('data', line => console.log(line));

    const child = await command.spawn();
    cloudflaredProcess = child;

    setScreen("connected-screen");
    document.getElementById("connected-screen-server").innerHTML = `localhost:${localHostPort}`;
}

async function closeCurrentConnections() {
    if(cloudflaredProcess != null) {
        await cloudflaredProcess.kill();
    } else {
        await checkAndKillProcess("cloudflared.exe");
    }

    setScreen("main-screen");
    renderServerTable();
}

//--

let logs = [];

function renderLoggingView() {
    let loggingView = document.getElementById("logging-view")

    loggingView.innerHTML = "";

    for (const log of logs) {
        loggingView.innerHTML += `
        <div>${log}</div>
        `;
    }

    loggingView.scrollTop = loggingView.scrollHeight;
}

function LoggingViewReset() {
    logs = [];
    renderLoggingView();
}

function LoggingViewAdd(log) {
    logs.push(log);
    renderLoggingView();
}

function LoggingViewInsert(log, index = 0) {
    logs.splice(logs.length - index, 0, log);
    renderLoggingView();
}

function LoggingViewReplace(log, index = 0) {
    logs[(logs.length - 1) - index] = log
    renderLoggingView();
}

//--

function renderServerTable() {
    let serverTable = document.getElementById("connection-table");

    serverTable.innerHTML = "";

    serverTable.innerHTML = `
    <div class="row">
        <div class="title px22">Servers</div>
        <div class="actions">
            ${isInDeleteMode == false
            ? `
            <button onclick="showEditScreen()">
                <img class="medium-svg" src="/assets/add-icon.svg" />
            </button>
            <button onclick="toggleRemoveServers()">
                <img class="medium-svg" src="/assets/minus-icon.svg" />
            </button>
            `
            : `
            <button onclick="removeAllSelectedServers()">
                <img class="large-svg" src="/assets/check-icon.svg" />
            </button>
            <button onclick="toggleRemoveServers()">
                <img class="medium-svg" src="/assets/close-icon.svg" />
            </button>
            `
        }
        </div>
    </div>
    `;

    let count = 0;
    for (const server of servers) {
        serverTable.innerHTML += `
        <div class="row">
            <div class="title px18">${server.name}</div>
            <div class="actions">
                ${isInDeleteMode == false
                ? `
                <button onclick="beginConnectionOnIndex(${count})">
                    <img class="medium-svg" src="/assets/play-icon.svg" />
                </button>
                <button onclick="enterSettingsOnIndex(${count})">
                    <img class="medium-svg" src="/assets/settings-icon.svg" />
                </button>
                `
                : `<input type="checkbox" />`
            }
            </div>
        </div>
        `;
        count++;
    }
}

function toggleRemoveServers() {
    isInDeleteMode = !isInDeleteMode;
    renderServerTable();
}

function removeAllSelectedServers() {
    let serverTable = document.getElementById("connection-table");
    let serverTableRows = serverTable.getElementsByClassName("row");

    let count = 0;
    for (const row of serverTableRows) {
        let checkbox = row.querySelectorAll('input[type="checkbox"]');
        if (checkbox.length > 0) {
            if (checkbox[0].checked) {
                servers.splice(count, 1);
                count -= 1;
            }
            count++;
        }
    }

    toggleRemoveServers();
}

function showMainScreen() {
    setScreen("main-screen");
    renderServerTable();
}

//--

let isEditingExistingItem = false;
let serverToEdit;

const EditTableSkeleton = {
    name: "",
    ip: "",
};

function renderEditTable() {
    let editTable = document.getElementById("edit-table");

    editTable.innerHTML = "";

    editTable.innerHTML = `
    <div class="row">
        <div class="title px22">${isEditingExistingItem ? "Editing" : "New"}</div>
        <div class="actions">
            <button onclick=${isEditingExistingItem ? "checkAndSaveExistingServer()" : "checkAndSaveNewServer()"}>
                <img class="large-svg" src="/assets/check-icon.svg" />
            </button>
            <button onclick="showMainScreen()">
                <img class="medium-svg" src="/assets/close-icon.svg" />
            </button>
        </div>
    </div>`;

    for (const key of Object.keys(EditTableSkeleton)) {
        editTable.innerHTML += `
            <div class="row">
                <div class="title px18">${key}</div>
                 <div class="actions">
                    <input type="text" value="${isEditingExistingItem ? serverToEdit[key] : ""}"/>
                </div>
            </div>
        `;
    }
}

function fillAndCopyEditTableSkeleton() {
    let editTable = document.getElementById("edit-table");
    let editTableRows = editTable.getElementsByClassName("row");
    let skeletonKeys = Object.keys(EditTableSkeleton);
    let newServer = JSON.parse(JSON.stringify(EditTableSkeleton));

    let count = 0;
    for (const row of editTableRows) {
        let input = row.getElementsByTagName("input");
        if (input.length > 0) {
            if (typeof EditTableSkeleton[skeletonKeys[count]] === "string") {
                newServer[skeletonKeys[count]] = input[0].value.trim();
            }
            count++;
        }
    }

    return newServer;
}

function checkAndSaveNewServer() {
    let newServer = fillAndCopyEditTableSkeleton();

    for (const key in newServer) {
        if (newServer[key] === "") {
            message(`"${key}" can not be empty.`, { title: "mineflared", type: "error" });
            return;
        }
    }

    servers.push(newServer);
    showMainScreen();
}

function checkAndSaveExistingServer() {
    let newServer = fillAndCopyEditTableSkeleton();

    for (const key in newServer) {
        if (newServer[key] === "") {
            message(`"${key}" can not be empty.`, { title: "mineflared", type: "error" });
            return;
        }
    }

    for (const key in newServer) {
        serverToEdit[key] = newServer[key];
    }

    showMainScreen();
}

function enterSettingsOnIndex(index) {
    isEditingExistingItem = true;
    serverToEdit = servers[index];

    setScreen("edit-screen");
    renderEditTable();
}

function showEditScreen() {
    isEditingExistingItem = false;
    serverToEdit = null;

    setScreen("edit-screen");
    renderEditTable();
}

//--

window.addEventListener("DOMContentLoaded", async () => {
    window.showMainScreen = showMainScreen;
    window.showEditScreen = showEditScreen;

    window.beginConnectionOnIndex = beginConnectionOnIndex;

    window.enterSettingsOnIndex = enterSettingsOnIndex;
    window.toggleRemoveServers = toggleRemoveServers;
    window.removeAllSelectedServers = removeAllSelectedServers;

    window.renderEditTable = renderEditTable;
    window.checkAndSaveNewServer = checkAndSaveNewServer;
    window.checkAndSaveExistingServer = checkAndSaveExistingServer;

    window.closeCurrentConnections = closeCurrentConnections;

    await listen("tauri://destroyed", async () => {
        await cloudflaredProcess.kill();
    });

    //--

    setScreen("logging-screen");

    const currentPlatform = await platform();
    const currentArch = await arch();

    let currentLinkSet;
    for (const iterator of links) {
        if (iterator.arch === currentArch && iterator.platform === currentPlatform) {
            currentLinkSet = iterator;
            break;
        }
    }

    if (currentLinkSet == null) {
        setScreen("un-supported-device");
        exit(1);
    }

    const appDataPath = await path.appDataDir();

    const downloadedBinaryFileTmp = "cloudflared-mineflared" + currentLinkSet.postfix + ".tmp"
    const downloadedBinaryFileTmpAbsolute = await path.join(appDataPath, downloadedBinaryFileTmp);

    const executableBinaryFile = "cloudflared-mineflared" + await getExePostfix();

    if (!(await exists(appDataPath))) await mkdir(appDataPath);
    if (!(await exists(executableBinaryFile, { baseDir: BaseDirectory.AppData }))) {

        if(await exists(downloadedBinaryFileTmp, { baseDir: BaseDirectory.AppData }))
            await remove(downloadedBinaryFileTmp, { baseDir: BaseDirectory.AppData });

        LoggingViewReset();
        LoggingViewAdd("downloading cloudflared . . .");

        const response = await fetch(currentLinkSet.link, { method: 'GET' });
        const blob = await response.blob();
        const data = await blob.arrayBuffer();

        const chunkSize = 100000;
        const view = new Uint8Array(data);

        let loops = 0;
        const maxLoops = Math.ceil(data.byteLength / chunkSize);
        LoggingViewAdd("installing cloudflared . . . ");

        const file = await open(downloadedBinaryFileTmp, { write: true, create: true, baseDir: BaseDirectory.AppData });
        for (let i = 0; i < data.byteLength; i += chunkSize) {
            const slice = view.slice(i, i + chunkSize);
            await file.write(slice.buffer);

            LoggingViewReplace(`installing cloudflared . . . ${Math.round(100 * (loops / maxLoops))}%`, 0);
            loops += 1;
        }
        await file.close();

        if (currentLinkSet.postfix === ".exe") {
            await rename(
                downloadedBinaryFileTmp,
                executableBinaryFile,
                { oldPathBaseDir: BaseDirectory.AppData, newPathBaseDir: BaseDirectory.AppData }
            );
        } else if(currentLinkSet.postfix === ".tgz") {
            await invoke("uncompress_tarball", { "path": downloadedBinaryFileTmpAbsolute });
            await rename(
                "cloudflared",
                executableBinaryFile,
                { oldPathBaseDir: BaseDirectory.AppData, newPathBaseDir: BaseDirectory.AppData }
            );
            await remove(downloadedBinaryFileTmp, { baseDir: BaseDirectory.AppData });
        }
    }

    cloudflaredPath = await path.join(appDataPath, executableBinaryFile);

    LoggingViewAdd("cleaning old processes . . .");
    await invoke("kill_process", { "processName": executableBinaryFile });

    setScreen("main-screen");
    renderServerTable();
});