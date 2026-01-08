// ==UserScript==
// @name         Overleaf-Bib-Helper
// @namespace    com.Xunjian.overleaf
// @version      1.3
// @description  Enhances Overleaf by allowing article searches and BibTeX retrieval from DBLP and Google Scholar
// @author       Xunjian Yin
// @match        https://www.overleaf.com/project/*
// @match        https://cn.overleaf.com/project*
// @match        https://latex.pku.edu.cn/project/*
// @icon         https://www.overleaf.com/favicon.ico
// @require      https://cdn.jsdelivr.net/npm/@floating-ui/core@1.6.8
// @require      https://cdn.jsdelivr.net/npm/@floating-ui/dom@1.6.12
// @require      https://cdn.jsdelivr.net/npm/simple-notify@1.0.6/dist/simple-notify.min.js
// @resource     notifycss   https://cdn.jsdelivr.net/npm/simple-notify/dist/simple-notify.css
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        GM_getResourceText
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_openInTab
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';
    GM_addStyle(GM_getResourceText('notifycss'));
    injectScript();
    setInterval(() => {
        if (!document.getElementById('toggleIcon')) {
            injectScript();
        }
    }, 2000);
})();

function injectScript() {
    // 实际注入前再检查一遍图标，避免异步注入导致出现两个图标
    waitUtil('div.ol-cm-toolbar-button-group.ol-cm-toolbar-end', el => {
        if (document.getElementById('toggleIcon')) {
            return;
        }

        let iconBox = createToggleIcon();
        el.appendChild(iconBox);

        let popupBox = createBox();
        let oldPopup = document.querySelector("#popup");
        if (oldPopup) {
            popupBox = oldPopup;
        }

        document.body.appendChild(popupBox);
        FloatingUIDOM.autoUpdate(iconBox, popupBox, () => {
            FloatingUIDOM.computePosition(iconBox, popupBox, {
                middleware: [FloatingUICore.shift(), FloatingUICore.flip(), FloatingUICore.offset(6)],
            }).then(({ x, y }) => {
                Object.assign(popupBox.style, {
                    top: `${y}px`,
                    left: `${x}px`
                });
            });
        });

        iconBox.onclick = () => {
            togglePopup(popupBox);
        };

        let searchIcon = document.getElementById('search-word');
        let searchInput = document.querySelector('.search-input');
        searchIcon.onclick = () => {
            queryArticle();
        };
        searchInput.onkeydown = (env) => {
            if (env.key === 'Enter') {
                queryArticle();
            }
        };

        // Global Esc key listener
        document.onkeydown = (env) => {
            if (env.key === 'Escape' && showBox) {
                togglePopup(popupBox);
            }
        };

        let content = document.getElementById("search-content");
        content.onclick = (env) => {
            if (env.target.className == 'scholar-data') {
                let source = document.getElementById("source").value;
                let id = env.target.getAttribute("data-cid");
                if (source === "DBLP") {
                    getBibTexDBLP(id).then(bib => {
                        new Notify({
                            status: 'success',
                            title: 'Copy successfully',
                            text: 'Bib has been copied to clipboard',
                            effect: 'slide',
                            type: 'filled'
                        });
                        GM_setClipboard(bib);
                    }).catch(_ => {
                        new Notify({
                            status: 'error',
                            title: "Copy failed",
                            text: "Failed to get BibTeX from DBLP",
                            effect: "slide",
                            type: "filled"
                        });
                    });
                } else if (source === "GoogleScholar") {
                    getBibTexGoogleScholar(id).then(bib => {
                        new Notify({
                            status: 'success',
                            title: 'Copy successfully',
                            text: 'Bib has been copied to clipboard',
                            effect: 'slide',
                            type: 'filled'
                        });
                        GM_setClipboard(bib);
                    }).catch(_ => {
                        new Notify({
                            status: 'error',
                            title: "Copy failed",
                            text: "Failed to get BibTeX from Google Scholar",
                            effect: "slide",
                            type: "filled"
                        });
                    });
                }
            }
        };
    });
}

function togglePopup(popupBox) {
    showBox = !showBox;
    popupBox.style.display = showBox ? 'block' : 'none';
    if (showBox) {
        document.querySelector('.search-input').focus(); // Optional: Focus input when popup opens
    }
}

function queryArticle() {
    let content = document.getElementById("search-content");
    content.innerHTML = "Loading......";
    let word = document.querySelector('input.search-input').value;
    let source = document.getElementById("source").value;
    let resultCount = document.getElementById("resultCount").value;
    if (source === "DBLP") {
        getArticleIDListDBLP(word, resultCount).then(lists => {
            if (lists.length === 0) {
                content.innerHTML = "No articles found.";
                throw new Error("No articles found");
            }
            let searchText = "";
            lists.forEach(article => {
                searchText += scholarContent(`${article.title}@${article.author}`, article.url);
            });
            content.innerHTML = searchText;
        }).catch(err => {
            console.log("Error:", err);
            if (content.innerHTML !== "No articles found.") {
                content.innerHTML = "Failed to load articles.";
            }
            new Notify({
                status: 'error',
                title: 'Request failed',
                text: 'Please check your query or try again later.',
                effect: 'slide',
                type: 'filled'
            });
        });
    } else if (source === "GoogleScholar") {
        let yearFrom = document.getElementById("yearFrom").value;
        let yearTo = document.getElementById("yearTo").value;
        let sortBy = document.getElementById("sortBy").value;
        getArticleIDListGoogleScholar(word, resultCount, yearFrom, yearTo, sortBy).then(lists => {
            if (lists.length === 0) {
                content.innerHTML = "No articles found.";
                throw new Error("No articles found");
            }
            let searchText = "";
            lists.forEach(article => {
                searchText += scholarContent(`${article.title}@${article.author}`, article.id);
            });
            content.innerHTML = searchText;
        }).catch(err => {
            console.log("Error:", err);
            if (content.innerHTML !== "No articles found.") {
                content.innerHTML = "Failed to load articles.";
            }
            new Notify({
                status: 'error',
                title: 'Request failed',
                text: 'Please check your query or try again later.',
                effect: 'slide',
                type: 'filled'
            });
        });
    }
}

function waitUtil(el, callback, timeout = 6000) {
    let query = setInterval(() => {
        let target = document.querySelector(el);
        if (target) {
            clearInterval(query);
            callback(target);
        }
    });
    setTimeout(() => {
        clearInterval(query);
    }, timeout);
}

function createToggleIcon() {
    let iconBox = document.createElement('div');
    iconBox.className = 'ol-cm-toolbar-button';
    iconBox.style.display = 'flex';
    iconBox.style.justifyContent = 'center';
    iconBox.style.alignItems = 'center';
    iconBox.id = "toggleIcon";
    iconBox.title = "Overleaf Bib Helper (点击打开/关闭搜索)";
    iconBox.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" style="fill: currentColor;"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>';
    return iconBox;
}

function createBox() {
    let box = document.createElement('div');
    box.id = "popup";
    box.style = 'width:300px;background:#eef;padding:10px;border:1px solid #ccc;border-radius:5px;position:absolute;display:none;top:0px;left:0px';
    box.innerHTML = `
    <style>
        .popup-footer-hint {
            margin-top: 10px;
            font-size: 10px;
            color: var(--ol-foreground-secondary, #888);
            text-align: center;
            width: 100%;
        }
        .popup-form {
            display: flex;
            flex-direction: column;
            gap: 8px;
            font-family: 'Segoe UI', Arial, sans-serif;
        }
        .popup-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom:8px;
        }
        .popup-row label {
            min-width: 50px;
            font-size: 12px;
            color: #444;
        }
        .popup-row input,
        .popup-row select {
            padding: 4px 6px;
            border: 1px solid #ccc;
            border-radius: 4px;
            font-size: 12px;
            background-color: #fff;
        }
        .search-input {
            flex: 1;
            padding: 6px 8px;
            border: 1.5px solid #aaa;
            border-radius: 6px;
            font-size: 13px;
            margin-right: 5px;
        }
        .search-icon {
            cursor: pointer;
            padding: 5px;
            border-radius: 4px;
            transition: background 0.2s;
        }
        .search-icon:hover {
            background: #dbeafe;
        }
        #search-content {
            max-height: 260px;
            overflow-y: auto;
            margin-top: 8px;
            background: #fff;
            border-radius: 5px;
            border: 1px solid #eee;
            padding: 4px;
            font-size: 12px;
        }
        .scholar-data {
            border-bottom: 1px solid #e5e7eb;
            cursor: pointer;
            font-size: 12px;
            padding: 6px 4px;
            transition: background 0.1s;
        }
        .scholar-data:hover {
            background: #e0e7ff;
        }
        .scholar-data:last-child {
            border-bottom: none;
        }
        #gs-options {
            display: none;
        }
    </style>
    <div class="popup-form">
        <div class="popup-row">
            <input class="search-input" placeholder="Search..." />
            <div class="search-icon" id="search-word">
                <svg width="16" height="16" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            </div>
        </div>
        <div class="popup-row">
            <label for="source">Source:</label>
            <select id="source" style="flex: 1">
                <option value="DBLP">DBLP</option>
                <option value="GoogleScholar">Google Scholar</option>
            </select>
        </div>
        <div class="popup-row">
            <label for="resultCount">Results:</label>
            <select id="resultCount">
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
            </select>
        </div>
        <div id="gs-options">
            <div class="popup-row">
                <label for="sortBy">Sort by:</label>
                <select id="sortBy" style="flex: 1">
                    <option value="relevance">Relevance</option>
                    <option value="date">Date</option>
                </select>
            </div>
            <div class="popup-row">
                <label for="yearFrom">Year:</label>
                <input id="yearFrom" type="text" placeholder="From" style="width:60px">
                <span style="margin:0 2px">-</span>
                <input id="yearTo" type="text" placeholder="To" style="width:60px">
            </div>
        </div>
        <div id="search-content"></div>
        <div class="popup-footer-hint">提示：按 ESC 键或点击图标可快速关闭</div>
    </div>
`;


    let sourceSelect = box.querySelector("#source");
    let countSelect = box.querySelector("#resultCount");
    let gsOptions = box.querySelector("#gs-options");

    sourceSelect.value = GM_getValue("searchSource", "DBLP");
    countSelect.value = GM_getValue("resultCount", "5");
    // Show/hide Google Scholar options based on source selection
    if (sourceSelect.value === "GoogleScholar") {
        gsOptions.style.display = "block";
    }

    sourceSelect.addEventListener("change", () => {
        GM_setValue("searchSource", sourceSelect.value);
        // Show/hide Google Scholar options
        gsOptions.style.display = sourceSelect.value === "GoogleScholar" ? "block" : "none";
    });

    countSelect.addEventListener("change", () => GM_setValue("resultCount", countSelect.value));

    return box;
}

function scholarContent(ref, cid) {
    return `<div class="scholar-data" data-cid="${cid}">${ref}</div>`;
}

// DBLP Functions
const dblpOrigin = "https://dblp.org";
function getArticleIDListDBLP(query, resultCount) {
    return new Promise((resolve, reject) => {
        let url = `https://dblp.org/search/publ/api?q=${encodeURIComponent(query)}&h=${resultCount}`;
        GM_xmlhttpRequest({
            url: url,
            method: "GET",
            onload: response => {
                let parser = new DOMParser();
                let doc = parser.parseFromString(response.responseText, 'text/xml');
                let hits = doc.querySelectorAll('hit');
                let articlesIDs = [];
                hits.forEach(hit => {
                    let info = hit.querySelector('info');
                    let title = info.querySelector('title').textContent;
                    let authors = Array.from(info.querySelectorAll('author')).map(a => a.textContent).join(', ');
                    let url = info.querySelector('url').textContent;
                    articlesIDs.push({
                        url: url,
                        title: title,
                        author: authors
                    });
                });
                resolve(articlesIDs);
            },
            onerror: err => {
                reject(err);
            }
        });
    });
}

function getBibTexURLDBLP(publicationURL) {
    let path = publicationURL.split("/rec/")[1].split(".html")[0];
    return `${dblpOrigin}/rec/${path}.bib`;
}

function getBibTexDBLP(publicationURL) {
    return new Promise((resolve, reject) => {
        let bibtexURL = getBibTexURLDBLP(publicationURL);
        GM_xmlhttpRequest({
            url: bibtexURL,
            method: "GET",
            onload: response => {
                if (response.status === 200) {
                    resolve(response.responseText);
                } else {
                    reject(new Error("Failed to fetch BibTeX from DBLP"));
                }
            },
            onerror: err => {
                reject(err);
            }
        });
    });
}

// Google Scholar Functions
const origins = ["https://scholar.google.com.hk", "https://scholar.lanfanshu.cn", "https://xs.vygc.top"];
let oldOrigins = GM_getValue("origins", []);
const mergedArray = [...new Set([...origins, ...oldOrigins])];
GM_setValue("origins", mergedArray);
let currentOrigin = () => GM_getValue("configure.origin", "https://scholar.google.com.hk");

function scholarURL(query, yearFrom, yearTo, sortBy) {
    let base = `${currentOrigin()}/scholar?hl=zh-CN&q=${encodeURIComponent(query)}&oq=a`;
    if (yearFrom) base += `&as_ylo=${yearFrom}`;
    if (yearTo) base += `&as_yhi=${yearTo}`;
    if (sortBy === 'date') base += `&scisbd=1`;
    return base;
}

//let scholarURL = query => `${currentOrigin()}/scholar?hl=zh-CN5&q=${query}&oq=a`;
let scholarRefPageURL = id => `${currentOrigin()}/scholar?q=info:${id}:scholar.google.com/&output=cite&scirp=1&hl=zh-CN`;

function getArticleIDListGoogleScholar(query, resultCount, yearFrom, yearTo, sortBy) {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            url: scholarURL(query, yearFrom, yearTo, sortBy),
            method: "GET",
            onload: response => {
                let parser = new DOMParser();
                let doc = parser.parseFromString(response.responseText, 'text/html');
                let searchItems = doc.querySelectorAll('div[data-cid]');
                let articlesIDs = [];
                searchItems.forEach((article, key) => {
                    let cid = article.getAttribute('data-cid');
                    try {
                        let title = article.querySelector("h3").textContent;
                        let author = article.querySelector("div.gs_a").textContent;
                        if (!cid.startsWith("gs") && key < resultCount) {
                            articlesIDs.push({
                                id: cid,
                                title: title,
                                author: author
                            });
                        }
                    } catch (err) {
                        console.log(err);
                    }
                });
                resolve(articlesIDs);
            },
            onerror: err => {
                new Notify({
                    status: 'error',
                    title: 'Request failed',
                    text: 'Please verify your identification',
                    effect: 'slide',
                    type: 'filled'
                });
                reject(err);
            }
        });
    });
}

function getRefPageGoogleScholar(id) {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            url: scholarRefPageURL(id),
            method: "GET",
            onload: res => {
                resolve(res.response);
            },
            onerror: err => {
                reject(err);
            }
        });
    });
}

function getBibTexGoogleScholar(id) {
    return new Promise((resolve, reject) => {
        getRefPageGoogleScholar(id).then(page => {
            let dom = document.createElement("div");
            dom.innerHTML = page;
            let first = dom.querySelector("#gs_citi>a.gs_citi").href;
            return GM_xmlhttpRequest({
                url: first,
                method: "GET",
                onload: (res) => {
                    resolve(res.responseText);
                },
                onerror: err => {
                    reject(err);
                }
            });
        }).catch(() => {
            new Notify({
                status: 'error',
                title: 'Request failed',
                text: 'Please verify your identification.',
                effect: 'slide',
                type: 'filled'
            });
            setTimeout(() => {
                GM_openInTab(currentOrigin());
            }, 1000);
            throw new Error("Not find BibTeX");
        });
    });
}

let showBox = false;
