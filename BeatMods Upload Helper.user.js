// ==UserScript==
// @name         BeatMods Upload Helper
// @namespace    https://beatmods.com
// @version      1.1.0
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
let modMetadata;
let currentlyAvailableMods;
let inputs = {};
let isOnUploadsPage = false;
let searchXHR;

(function () {
    'use strict';

    window.addEventListener("load", () => {
        //Form is not yet ready after page load
        setInterval(loop, 500);
    });
})();

function loop() {
    let form = document.querySelector("form.upload");
    if (!form) {
        isOnUploadsPage = false;
        return;
    }

    if (isOnUploadsPage) {
        return;
    }

    isOnUploadsPage = true;
    init();
}

function init() {
    getInputReferences();

    const nameInput = inputs.name;
    if (!nameInput) {
        return;
    }

    ["change", "input", "paste"].forEach(function (e) {
        nameInput.addEventListener(e, onNameChanged, false);
    });

    getCurrentMods();

    console.info("BeatModsUploadHelper initialized")
}

function getInputReferences() {
    inputs.name = document.querySelector(".input-group:nth-of-type(1) > input:nth-child(2)");
    inputs.version = document.querySelector(".input-group:nth-of-type(2) > input:nth-child(2)");
    inputs.gameVersion = document.querySelector(".input-group:nth-of-type(3) > select:nth-child(2)");
    inputs.dependencies = document.querySelector(".input-group:nth-of-type(4) > input:nth-child(2)");
    inputs.category = document.querySelector(".input-group:nth-of-type(5) > select:nth-child(2)");
    inputs.description = document.querySelector(".input-group:nth-of-type(6) > textarea");
    inputs.link = document.querySelector(".input-group:nth-of-type(7) > input:nth-child(2)");
}

function onNameChanged(event) {
    let name = event.target.value;
    name = name.trim();

    if (!name) {
        lastEnteredName = "";
        abortXHR();
        return;
    }

    if (name === lastEnteredName) {
        return;
    }

    abortXHR();
    removeButton();
    lastEnteredName = name;
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(debouncedNameChanged.bind(this, name), debounceDuration)
}

function abortXHR() {
    if (searchXHR) {
        searchXHR.abort();
    }

    removeSpinner();
}

function debouncedNameChanged(name) {
    let escapedName = encodeURIComponent(name);
    searchXHR = new XMLHttpRequest();
    searchXHR.onload = () => {
        removeSpinner();
        let mods = JSON.parse(searchXHR.response);

        mods = mods?.filter(mod => mod.name.toLowerCase().startsWith(name.toLowerCase()));
        if (!mods?.length) {
            return;
        }

        modMetadata = mods[0];
        addButton();
    };
    searchXHR.open('GET', 'https://beatmods.com/api/v1/mod?search=' + escapedName + '&sort=uploadDate&sortDirection=-1');
    searchXHR.send();
    addSpinner();
}

function addButton() {
    removeSpinner();

    if (!modMetadata) {
        return;
    }

    removeButton();

    let nameInput = inputs.name;
    let button = document.createElement('button');
    button.id = "upload-helper-button";
    button.innerText = "Fill data from " + modMetadata.name + " " + modMetadata.version;
    button.className = "btn btn-info btn-block";
    button.style.marginTop = "8px";
    button.onclick = onButtonClick;
    nameInput.insertAdjacentElement("afterend", button);
}

function removeButton() {
    document.getElementById("upload-helper-button")?.remove();
}

function addSpinner() {
    removeSpinner();

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

function onButtonClick(event) {
    event.preventDefault();
    event.stopPropagation();
    removeAlert();
    fillModMetadata();
    inputs.version.focus();
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

function fillModMetadata() {
    let nameInput = inputs.name;
    if (nameInput.value !== modMetadata.name) {
        lastEnteredName = modMetadata.name;
        nameInput.value = modMetadata.name;
    }

    inputs.category.value = modMetadata.category;
    inputs.description.value = modMetadata.description;
    inputs.link.value = modMetadata.link;
    inputs.dependencies.value = getDependenciesString() ?? "";
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

function getDependenciesString() {
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