const { invoke } = window.__TAURI__.tauri;
const { message } = window.__TAURI__.dialog;

const screens = {
    0: "main-screen",
    1: "edit-screen",
};

let currentScreenIndex = 0;
let servers = [{ name: "Miles' Server", ip: "play.mimja156.com" }];
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

function renderServerTable() {
    let serverTable = document.getElementById("connection-table");

    serverTable.innerHTML = "";

    serverTable.innerHTML = `
    <div class="row">
        <div class="title px22">Servers</div>
        <div class="actions">
            ${
                isInDeleteMode == false
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
                ${
                    isInDeleteMode == false
                        ? `
                <button>
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

window.addEventListener("DOMContentLoaded", () => {
    window.showMainScreen = showMainScreen;
    window.showEditScreen = showEditScreen;

    window.enterSettingsOnIndex = enterSettingsOnIndex;
    window.toggleRemoveServers = toggleRemoveServers;
    window.removeAllSelectedServers = removeAllSelectedServers;

    window.renderEditTable = renderEditTable;
    window.checkAndSaveNewServer = checkAndSaveNewServer;
    window.checkAndSaveExistingServer = checkAndSaveExistingServer;

    setScreen("main-screen");
    renderServerTable();
});
