// ==UserScript==
// @name         BeatMods Upload Helper
// @namespace    https://beatmods.com
// @version      1.5.1
// @description  Aims to make BeatMods uploads a little less painful
// @author       Dakari
// @updateURL    https://github.com/Kevga/BeatModsUploadHelper/raw/master/BeatMods%20Upload%20Helper.user.js
// @downloadURL  https://github.com/Kevga/BeatModsUploadHelper/raw/master/BeatMods%20Upload%20Helper.user.js
// @match        https://beatmods.com/*
// @run-at       document-idle
// ==/UserScript==

let debounceTimeout;
let debounceDuration = 300;
let lastEnteredName = "";
let currentlyAvailableMods;
let inputs;
let searchXHR;
let initLoopInterval;

(function () {
    window.addEventListener("hashchange", onLocationChanged, false);
    onLocationChanged();
})();

function onLocationChanged() {
    if (window.location.hash !== '#/mods/upload') {
        return;
    }

    // Chrome has the page ready at the "load" event, but Firefox doesn't.
    // If it's not ready, wait for it to be ready.
    if (isPageReady()) {
        initialize();
    } else {
        initLoopInterval = setInterval(initLoop, 100);
    }
}

function initLoop() {
    if (isPageReady()) {
        clearInterval(initLoopInterval);
        initialize();
    }
}

function isPageReady() {
    return document.querySelector("form.upload") !== null;
}

function initialize() {
    updateInputReferences();
    const nameInput = inputs.name;
    if (!nameInput) {
        console.error("[BeatModsUploadHelper] Failed to find name input field")
        return;
    }

    //Increase default height of description textarea from 2 to 4 lines to fit all 200 allowed characters
    inputs.description.style.height = "100px";

    ["change", "input", "paste"].forEach(function (eventKey) {
        nameInput.addEventListener(eventKey, onNameChanged, false);
    });

    //vv
    inputs.version.addEventListener("paste", (evt) => {
        setTimeout(() => {
            let fixedVersion = evt.target.value.trim();
            if (fixedVersion.startsWith("v")) {
                fixedVersion = fixedVersion.substring(1);
            }
            inputs.version.value = fixedVersion;
        }, 0);
    })

    getCurrentMods();

    console.info("[BeatModsUploadHelper] Initialized")
}

function updateInputReferences() {
    inputs = {
        name: document.querySelector(".input-group:nth-of-type(1) > input:nth-child(2)"),
        version: document.querySelector(".input-group:nth-of-type(2) > input:nth-child(2)"),
        gameVersion: document.querySelector(".input-group:nth-of-type(3) > select:nth-child(2)"),
        dependencies: document.querySelector(".input-group:nth-of-type(4) > input:nth-child(2)"),
        category: document.querySelector(".input-group:nth-of-type(5) > select:nth-child(2)"),
        description: document.querySelector(".input-group:nth-of-type(6) > textarea"),
        link: document.querySelector(".input-group:nth-of-type(7) > input:nth-child(2)"),
        file: document.querySelector(".form-control-file")
    };
}

function onNameChanged(event) {
    let name = event.target.value;
    name = name.trim();

    if (!name) {
        lastEnteredName = "";
        removeButton();
        abortXHR();
        removeSpinner();
        return;
    }

    if (name === lastEnteredName) {
        return;
    }

    abortXHR();
    removeButton();
    addSpinner();
    lastEnteredName = name;
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(debouncedNameChanged.bind(this, name), debounceDuration)
}

function abortXHR() {
    if (searchXHR) {
        searchXHR.abort();
    }

    clearTimeout(debounceTimeout);
}

function debouncedNameChanged(name) {
    let escapedName = encodeURIComponent(name);
    searchXHR = new XMLHttpRequest();
    searchXHR.onload = () => {
        removeSpinner();
        removeButton();
        let mods = JSON.parse(searchXHR.response);

        mods?.sort((a, b) => a.name.length - b.name.length);
        mods = mods?.filter(mod => mod.name.toLowerCase().startsWith(name.toLowerCase()));
        if (!mods?.length) {
            return;
        }

        let mostRecentMod = mods[0];
        addFillSuggestion(mostRecentMod);

        if (mostRecentMod?.status !== "approved") {
            let mostRecentNonDeclinedMod = mods.find(mod => mod.status === "approved");
            if (mostRecentNonDeclinedMod) {
                addFillSuggestion(mostRecentNonDeclinedMod);
            }
        }
    };
    searchXHR.open('GET', 'https://beatmods.com/api/v1/mod?search=' + escapedName + '&sort=uploadDate&sortDirection=-1');
    searchXHR.send();
    addSpinner();
}

function addFillSuggestion(modMetadata) {
    if (!modMetadata) {
        return;
    }

    let nameInput = inputs.name;
    let container = document.createElement('div');
    container.className = "upload-helper-container";
    container.style.display = "flex";
    container.style.flexDirection = "row";
    container.style.marginTop = "8px";
    container.style.border = "1px solid #8ad4ee";
    container.style.borderRadius = "3px";
    container.style.padding = "0.375rem 0.75rem";
    nameInput.insertAdjacentElement("afterend", container);

    let span = document.createElement('span');
    span.innerHTML = modMetadata.name + " " + modMetadata.version + " (" + modMetadata.author.username + ")";
    span.style.width = "50%";
    span.style.display = "inline-flex";
    span.style.alignItems = "center";
    span.style.flexGrow = "1";
    
    container.insertAdjacentElement("beforeend", span);

    let reuploadButton = addButton(container, modMetadata, "Reupload", onReuploadButtonClick)
    if (modMetadata.gameVersion === getCurrentGameVersion()) {
        reuploadButton.onclick = undefined;
        reuploadButton.style.visibility = "hidden";
    }

    addButton(container, modMetadata, "Fill data", onFillButtonClick)
}

function addButton(container, modMetadata, label, callback) {
    let button = document.createElement('button');
    button.innerText = label;
    button.className = "btn";
    button.style.alignSelf = "center";
    button.style.marginLeft = "8px";
    container.insertAdjacentElement("beforeend", button);
    button.classList.add("upload-helper-button");
    button.classList.add(
        modMetadata.status === "approved" ? "btn-success" :
            modMetadata.status === "declined" ? "btn-danger" :
                modMetadata.status === "pending" ? "btn-warning" :
                    "btn-info"
    )
    button.onclick = (event) => callback(event, modMetadata);

    return button;
}

function removeButton() {
    document.querySelectorAll(".upload-helper-container").forEach(element => element.remove());
}

function addSpinner() {
    if (document.getElementById("upload-helper-spinner")) {
        return;
    }

    let nameInput = inputs.name;
    let spinner = document.createElement('div');
    spinner.id = "upload-helper-spinner";
    spinner.className = "spinner-border";
    spinner.setAttribute('style', 'margin-top: 8px; width: 2rem!important');
    nameInput.insertAdjacentElement("afterend", spinner);
}

function removeSpinner() {
    document.getElementById("upload-helper-spinner")?.remove();
}

function onFillButtonClick(event, modMetadata) {
    event.preventDefault();
    event.stopPropagation();
    removeAlert();
    removeButton();
    fillModMetadata(modMetadata);
    inputs.version.focus();
}

function onReuploadButtonClick(event, modMetadata) {
    event.preventDefault();
    event.stopPropagation();
    removeAlert();
    removeButton();
    fillModMetadata(modMetadata);

    const url = modMetadata.downloads.find(d => d.type === "universal").url;

    fetch(url).then(res => {
        res.blob().then(blob => {
            let filename = /\/([^\/]+\.zip)/.exec(url)[1];
            let file = new File([blob], filename, {type:"application/zip", lastModified: modMetadata.uploadDate});
            let container = new DataTransfer();
            container.items.add(file);
            inputs.file.files = container.files;
            inputs.version.value = modMetadata.version;
        })
    })
}

function getCurrentGameVersion() {
    return inputs.gameVersion.querySelector("option:nth-child(1)").value;
}

function getCurrentMods() {
    let version = getCurrentGameVersion();
    let xhr = new XMLHttpRequest();
    xhr.onload = () => {
        let mods = JSON.parse(xhr.response);
        if (!mods?.length) {
            return;
        }
        currentlyAvailableMods = mods;
    };
    xhr.open('GET', 'https://beatmods.com/api/v1/mod?gameVersion=' + version + '&sort=uploadDate&sortDirection=-1&status[]=approved&status[]=pending');
    xhr.send();
}

function fillModMetadata(modMetadata) {
    let nameInput = inputs.name;
    if (nameInput.value !== modMetadata.name) {
        lastEnteredName = modMetadata.name;
        nameInput.value = modMetadata.name;
    }

    inputs.category.value = modMetadata.category;
    inputs.description.value = modMetadata.description;
    inputs.link.value = modMetadata.link;
    inputs.dependencies.value = getDependenciesString(modMetadata) ?? "";
}

function createAlert(text) {
    removeAlert();
    let alertDiv = document.createElement('div');
    alertDiv.id = "upload-helper-alert";
    alertDiv.innerHTML = text;
    alertDiv.className = "alert alert-danger fade show";
    document.querySelector(".upload > hr:nth-child(7)").insertAdjacentElement("afterend", alertDiv);
}

function removeAlert() {
    document.getElementById("upload-helper-alert")?.remove();
}

function getDependenciesString(modMetadata) {
    if (!modMetadata || !currentlyAvailableMods) {
        return;
    }

    let dependencies = [];
    let missingDependencies = [];

    modMetadata.dependencies.forEach(dependency => {
        let matchedDependency = currentlyAvailableMods.filter(mod => mod.name === dependency.name);
        if (!matchedDependency.length) {
            missingDependencies.push(dependency);
        } else {
            dependencies.push(matchedDependency[0]);
        }
    });

    if (missingDependencies.length) {
        createAlert("The following dependencies appear to not have been uploaded for the current game version:<br><br><ul>" +
            missingDependencies.map(dep => "<li>" + dep.name + "</li>").join("")) + "</ul>";
    }

    return dependencies.map(dep => dep.name + "@" + dep.version).join(",");
}
