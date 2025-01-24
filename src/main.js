const { open, write, rename, remove, exists, mkdir, readFile, writeFile, BaseDirectory } = window.__TAURI__.fs;
const { arch, platform, exeExtension } = window.__TAURI__.os;
const { exit, relaunch } = window.__TAURI__.process;
const { message, ask } = window.__TAURI__.dialog;
const { appDataDir } = window.__TAURI__.path;
const { check } = window.__TAURI__.updater;
const { Command } = window.__TAURI__.shell;
const { listen } = window.__TAURI__.event;
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

    { platform: "macos", arch: "x86_64", link: "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz", postfix: ".tgz" },
    { platform: "macos", arch: "aarch64", link: "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz", postfix: ".tgz" },
];

const userSaveData = "data.json";

async function getExePostfix() {
    const exe = await exeExtension();
    return exe != "" ? `.${exe}` : exe;
}

//--

let userData = {
    servers: [],
}

let cloudflaredPath;
let cloudflaredProcess;
let currentScreenIndex = 0;
let isInDeleteMode = false;

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

async function saveUserData() {
    validateUserData();
    const userDataString = JSON.stringify(userData);
    const encoded = new TextEncoder().encode(userDataString);
    await writeFile(userSaveData, encoded, { baseDir: BaseDirectory.AppData });
}

async function loadUserData() {
    if (await exists(userSaveData, { baseDir: BaseDirectory.AppData })) {
        const encoded = await readFile(userSaveData, { baseDir: BaseDirectory.AppData });
        const userDataString = new TextDecoder().decode(encoded);
        userData = JSON.parse(userDataString);
        validateUserData();
    }
}

async function validateUserData() {
    if (userData === undefined) userData = {};
    if (userData.servers === undefined) userData.servers = [];

    for (const server of userData.servers) {
        if (server === undefined) server = {};
        if (server.name === undefined) server.name = "default";
        if (server.source === undefined) server.source = "play.example.com";
        if (server.target === undefined) server.target = "localhost:5050";

        if (server.ip !== undefined) {
            server.source = server.ip;
            server.ip = undefined;
        }
    }
}

//--

async function beginConnectionOnIndex(serverIndex) {
    setScreen("loading-screen");
    let selectedServer = userData.servers[serverIndex];

    let commandName;
    if (await exeExtension() === "exe") {
        commandName = "cloudflared-exe";
    } else {
        commandName = "cloudflared";
    }

    let command = await Command.create(commandName, ["access", "tcp", "--hostname", selectedServer.source, "--url", selectedServer.target]);
    command.on('error', error => console.error(error));
    command.stdout.on('data', line => console.log(line));
    command.stderr.on('data', line => console.log(line));

    const child = await command.spawn();
    cloudflaredProcess = child;

    setScreen("connected-screen");
    document.getElementById("connected-screen-server").innerHTML = selectedServer.target;
}

async function closeCurrentConnections() {
    if (cloudflaredProcess != null) {
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
    for (const server of userData.servers) {
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
                userData.servers.splice(count, 1);
                saveUserData();
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
    name: {
        placeholder: "server name",
        required: true,
        type: "string"
    },
    source: {
        placeholder: "source ip",
        required: true,
        type: "string"
    },
    target: {
        placeholder: "target ip (random if left empty)",
        required: false,
        generator: () => {
            let port = Math.floor(Math.random() * (49151 - 1024) + 1024);
            return `localhost:${port}`
        },
        type: "string"
    },
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
                <div class="title px18">${key}${EditTableSkeleton[key].required ? `<span style="color: red;">*</span>` : ""}</div>
                 <div class="actions">
                    <input type="text" value="${isEditingExistingItem ? serverToEdit[key] : ""}" placeholder="${EditTableSkeleton[key].placeholder}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"/>
                </div>
            </div>
        `;
    }
}

function fillAndCopyEditTableSkeleton() {
    let editTable = document.getElementById("edit-table");
    let editTableRows = editTable.getElementsByClassName("row");
    let skeletonKeys = Object.keys(EditTableSkeleton);
    let newServer = {};

    skeletonKeys.forEach(key => newServer[key] = "");

    let count = 0;
    for (const row of editTableRows) {
        let input = row.getElementsByTagName("input");
        if (input.length > 0) {
            if (EditTableSkeleton[skeletonKeys[count]].type === "string") {
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
            if (EditTableSkeleton[key].required) {
                message(`"${key}" can not be empty.`, { title: "mineflared", type: "error" });
                return;
            } else if (EditTableSkeleton[key].generator !== undefined) {
                newServer[key] = EditTableSkeleton[key].generator();
            }
        }
    }

    userData.servers.push(newServer);
    saveUserData();
    showMainScreen();
}

function checkAndSaveExistingServer() {
    let newServer = fillAndCopyEditTableSkeleton();

    for (const key in newServer) {
        if (newServer[key] === "") {
            if (EditTableSkeleton[key].required) {
                message(`"${key}" can not be empty.`, { title: "mineflared", type: "error" });
                return;
            } else {
                newServer[key] = EditTableSkeleton[key].generator();
            }
        }
    }

    for (const key in newServer) {
        serverToEdit[key] = newServer[key];
    }

    saveUserData();
    showMainScreen();
}

function enterSettingsOnIndex(index) {
    isEditingExistingItem = true;
    serverToEdit = userData.servers[index];

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

    LoggingViewAdd("checking app for updates . . .");
    const update = await check();

    if (update && update.available) {
        const installUpdateConfirmation = await ask("A new version of mineflared has been found.\nUpdate now?", { title: "Updater", kind: "info" });
        if (installUpdateConfirmation) {
            let totalLength = 0;
            let accumulatedLength = 0;

            await update.downloadAndInstall(async (onEvent) => {
                switch (onEvent.event) {
                    case "Started":
                        LoggingViewAdd("downloading update . . .");
                        totalLength = onEvent.data.contentLength;
                        break;

                    case "Progress":
                        accumulatedLength += onEvent.data.chunkLength;
                        LoggingViewReplace(`downloading update . . . ${Math.round(100 * (accumulatedLength / totalLength))}%`);
                        break;

                    case "Finished":
                        LoggingViewAdd("app update downloaded! restarting . . .");
                        break;
                }
            })
        }
    }
    if (update) await update.close();

    const currentPlatform = await platform();
    const currentArch = await arch();

    let currentLinkSet = null;
    for (const link of links) {
        if (link.arch === currentArch && link.platform === currentPlatform) {
            currentLinkSet = link;
            break;
        }
    }

    if (currentLinkSet == null) {
        setScreen("un-supported-device");
        return;
    }

    const appDataPath = await path.appDataDir();

    const downloadedBinaryFileTmp = "cloudflared-mineflared" + currentLinkSet.postfix + ".tmp"
    const downloadedBinaryFileTmpAbsolute = await path.join(appDataPath, downloadedBinaryFileTmp);

    const executableBinaryFile = "cloudflared-mineflared" + await getExePostfix();

    if (!(await exists(appDataPath))) await mkdir(appDataPath);
    if (!(await exists(executableBinaryFile, { baseDir: BaseDirectory.AppData }))) {

        if (await exists(downloadedBinaryFileTmp, { baseDir: BaseDirectory.AppData }))
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

        const file = open(downloadedBinaryFileTmp, { write: true, create: true, baseDir: BaseDirectory.AppData });
        for (let i = 0; i < data.byteLength; i += chunkSize) {
            const slice = view.slice(i, i + chunkSize);
            await file.write(slice.buffer);

            LoggingViewReplace(`installing cloudflared . . . ${Math.round(100 * (loops / maxLoops))}%`, 0);
            loops += 1;
        }
        file.close();

        if (currentLinkSet.postfix === ".exe") {
            await rename(
                downloadedBinaryFileTmp,
                executableBinaryFile,
                { oldPathBaseDir: BaseDirectory.AppData, newPathBaseDir: BaseDirectory.AppData }
            );
        } else if (currentLinkSet.postfix === ".tgz") {
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

    LoggingViewAdd("loading settings . . .");
    await loadUserData();

    LoggingViewAdd("cleaning old processes . . .");
    await invoke("kill_process", { "processName": executableBinaryFile });

    setScreen("main-screen");
    renderServerTable();
});