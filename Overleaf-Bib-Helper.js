// ==UserScript==
// @name         Overleaf-Bib-Helper
// @namespace    com.Xunjian.overleaf
// @version      1.8
// @description  Enhances Overleaf by allowing article searches and BibTeX retrieval from DBLP and Google Scholar
// @author       Xunjian Yin
// @match        https://www.overleaf.com/project/*
// @match        https://cn.overleaf.com/project*
// @match        https://latex.pku.edu.cn/project/*
// @icon         https://www.overleaf.com/favicon.ico
// @require      https://cdn.jsdelivr.net/npm/@floating-ui/core@1.6.8
// @require      https://cdn.jsdelivr.net/npm/@floating-ui/dom@1.6.12
// @require      https://cdn.jsdelivr.net/npm/simple-notify@1.0.6/dist/simple-notify.min.js
// @resource     notifycss   https://cdn.jsdelivr.net/npm/simple-notify@1.0.6/dist/simple-notify.min.css
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        GM_getResourceText
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_openInTab
// @connect      *
// @license      MIT
// ==/UserScript==

let showBox = false;
let injectInProgress = false;
let floatingCleanup = null;
let stylesInjected = false;
let injectScheduled = false;
let injectionWatcherStarted = false;

const TOOLBAR_SELECTOR = 'div.ol-cm-toolbar-button-group.ol-cm-toolbar-end';

const DEFAULT_SCHOLAR_ORIGINS = [
    "https://scholar.google.com",
    "https://scholar.google.com.hk",
    "https://scholar.lanfanshu.cn",
    "https://xs.vygc.top",
];

const FALLBACK_BRAND_RGB = { r: 19, g: 138, b: 7 }; // Overleaf green

function clampByte(value) {
    return Math.min(255, Math.max(0, Math.round(value)));
}

function parseCssColorToRgb(color) {
    const raw = String(color ?? '').trim();
    if (!raw) return null;

    const hexMatch = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
        const hex = hexMatch[1];
        if (hex.length === 3) {
            const r = Number.parseInt(hex[0] + hex[0], 16);
            const g = Number.parseInt(hex[1] + hex[1], 16);
            const b = Number.parseInt(hex[2] + hex[2], 16);
            return { r, g, b };
        }
        const r = Number.parseInt(hex.slice(0, 2), 16);
        const g = Number.parseInt(hex.slice(2, 4), 16);
        const b = Number.parseInt(hex.slice(4, 6), 16);
        return { r, g, b };
    }

    const rgbMatch = raw.match(/^rgba?\(\s*([0-9.]+)[, ]+([0-9.]+)[, ]+([0-9.]+)(?:\s*[,/]\s*([0-9.]+))?\s*\)$/i);
    if (rgbMatch) {
        const r = clampByte(Number.parseFloat(rgbMatch[1]));
        const g = clampByte(Number.parseFloat(rgbMatch[2]));
        const b = clampByte(Number.parseFloat(rgbMatch[3]));
        return { r, g, b };
    }

    const csvMatch = raw.match(/^([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})$/);
    if (csvMatch) {
        const r = clampByte(Number.parseInt(csvMatch[1], 10));
        const g = clampByte(Number.parseInt(csvMatch[2], 10));
        const b = clampByte(Number.parseInt(csvMatch[3], 10));
        return { r, g, b };
    }

    return null;
}

function getOverleafBrandRgb() {
    const rootStyles = getComputedStyle(document.documentElement);
    const varCandidates = [
        '--ol-green',
        '--ol-brand-green',
        '--brand-green',
        '--primary',
        '--primary-color',
        '--accent',
        '--accent-color',
        '--green',
    ];
    for (const varName of varCandidates) {
        const value = rootStyles.getPropertyValue(varName)?.trim();
        const rgb = parseCssColorToRgb(value);
        if (rgb) return rgb;
    }

    const selectorCandidates = [
        'button.btn-primary',
        '.btn-primary',
        '.btn--primary',
        '.ol-button--primary',
        'button[style*="background-color"]',
        'a[style*="background-color"]',
    ];
    for (const selector of selectorCandidates) {
        const el = document.querySelector(selector);
        if (!el) continue;
        const bg = getComputedStyle(el).backgroundColor;
        const rgb = parseCssColorToRgb(bg);
        if (rgb) return rgb;
    }

    return null;
}

function initBrandTheme() {
    const rgb = getOverleafBrandRgb() ?? FALLBACK_BRAND_RGB;
    const brand = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    document.documentElement.style.setProperty('--obh-brand', brand);
    document.documentElement.style.setProperty('--obh-brand-weak', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.18)`);
    document.documentElement.style.setProperty('--obh-brand-hover', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`);
    document.documentElement.style.setProperty('--obh-brand-hover-strong', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`);
}

function injectObhStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    GM_addStyle(`
        .obh-toggle svg { fill: currentColor; }
        .obh-toggle.obh-active { color: var(--obh-brand, rgb(${FALLBACK_BRAND_RGB.r}, ${FALLBACK_BRAND_RGB.g}, ${FALLBACK_BRAND_RGB.b})); }

        .obh-popup {
            --obh-bg: #ffffff;
            --obh-fg: #111827;
            --obh-muted: #6b7280;
            --obh-border: rgba(17, 24, 39, 0.12);
            --obh-shadow: 0 18px 40px rgba(17, 24, 39, 0.18);
            --obh-surface: rgba(17, 24, 39, 0.03);
            --obh-input-bg: rgba(255, 255, 255, 0.95);
            --obh-hover: var(--obh-brand-hover, rgba(${FALLBACK_BRAND_RGB.r}, ${FALLBACK_BRAND_RGB.g}, ${FALLBACK_BRAND_RGB.b}, 0.08));
            --obh-hover-strong: var(--obh-brand-hover-strong, rgba(${FALLBACK_BRAND_RGB.r}, ${FALLBACK_BRAND_RGB.g}, ${FALLBACK_BRAND_RGB.b}, 0.14));
            --obh-accent: var(--obh-brand, rgb(${FALLBACK_BRAND_RGB.r}, ${FALLBACK_BRAND_RGB.g}, ${FALLBACK_BRAND_RGB.b}));
            --obh-accent-weak: var(--obh-brand-weak, rgba(${FALLBACK_BRAND_RGB.r}, ${FALLBACK_BRAND_RGB.g}, ${FALLBACK_BRAND_RGB.b}, 0.18));
            --obh-danger: #b42318;
            --obh-success: #067647;
            --obh-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji",
                "Segoe UI Emoji";

            box-sizing: border-box;
            width: 380px;
            padding: 12px;
            background: var(--obh-bg);
            color: var(--obh-fg);
            border: 1px solid var(--obh-border);
            border-radius: 14px;
            box-shadow: var(--obh-shadow);
            font-family: var(--obh-font);
            position: absolute;
            top: 0;
            left: 0;
            display: none;
            z-index: 2147483647;
        }

        @media (prefers-color-scheme: dark) {
            .obh-popup {
                --obh-bg: #0b1220;
                --obh-fg: #e5e7eb;
                --obh-muted: #9ca3af;
                --obh-border: rgba(229, 231, 235, 0.14);
                --obh-shadow: 0 18px 40px rgba(0, 0, 0, 0.4);
                --obh-surface: rgba(229, 231, 235, 0.06);
                --obh-input-bg: rgba(15, 23, 42, 0.8);
                --obh-danger: #f97066;
                --obh-success: #32d583;
            }
        }

        .obh-popup * { box-sizing: border-box; }

        .obh-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 10px;
        }

        .obh-brand {
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 0;
        }

        .obh-badge {
            width: 28px;
            height: 28px;
            border-radius: 10px;
            background: var(--obh-accent-weak);
            color: var(--obh-accent);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            font-size: 13px;
            flex: 0 0 auto;
        }

        .obh-title {
            font-weight: 650;
            font-size: 13px;
            line-height: 1.2;
        }

        .obh-subtitle {
            font-size: 11px;
            color: var(--obh-muted);
            line-height: 1.2;
            margin-top: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .obh-icon-button {
            width: 30px;
            height: 30px;
            border-radius: 10px;
            border: 1px solid var(--obh-border);
            background: transparent;
            color: var(--obh-fg);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
        }

        .obh-icon-button:hover {
            border-color: var(--obh-accent);
            background: var(--obh-accent-weak);
        }

        .obh-icon-button:active { transform: translateY(1px); }

        .obh-search-row {
            display: flex;
            gap: 8px;
            align-items: center;
        }

        .obh-search-input {
            flex: 1;
            height: 34px;
            border-radius: 12px;
            border: 1px solid var(--obh-border);
            padding: 0 10px;
            font-size: 13px;
            background: var(--obh-input-bg);
            color: var(--obh-fg);
        }

        .obh-search-input::placeholder { color: var(--obh-muted); }

        .obh-search-input:focus {
            outline: none;
            border-color: var(--obh-accent);
            box-shadow: 0 0 0 3px var(--obh-accent-weak);
        }

        .obh-primary-button {
            width: 38px;
            height: 34px;
            border-radius: 12px;
            border: 1px solid transparent;
            background: var(--obh-accent);
            color: white;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .obh-primary-button:hover { filter: brightness(0.98); }
        .obh-primary-button:active { transform: translateY(1px); }
        .obh-primary-button svg { fill: currentColor; }
        .obh-primary-button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }

        .obh-controls {
            margin-top: 10px;
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        .obh-control {
            flex: 1 1 120px;
            min-width: 120px;
        }

        .obh-control label {
            display: block;
            font-size: 11px;
            color: var(--obh-muted);
            margin: 0 0 4px 2px;
        }

        .obh-select {
            width: 100%;
            height: 34px;
            border-radius: 12px;
            border: 1px solid var(--obh-border);
            padding: 0 8px;
            background: var(--obh-input-bg);
            color: var(--obh-fg);
            font-size: 13px;
        }

        .obh-select:focus {
            outline: none;
            border-color: var(--obh-accent);
            box-shadow: 0 0 0 3px var(--obh-accent-weak);
        }

        .obh-year-range {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .obh-year-input {
            flex: 1;
            height: 34px;
            border-radius: 12px;
            border: 1px solid var(--obh-border);
            padding: 0 10px;
            font-size: 13px;
            background: var(--obh-input-bg);
            color: var(--obh-fg);
        }

        .obh-year-input::placeholder { color: var(--obh-muted); }

        .obh-year-input:focus {
            outline: none;
            border-color: var(--obh-accent);
            box-shadow: 0 0 0 3px var(--obh-accent-weak);
        }

        .obh-year-sep {
            color: var(--obh-muted);
            font-size: 12px;
            user-select: none;
        }

        .obh-status {
            margin-top: 10px;
            padding: 8px 10px;
            border-radius: 12px;
            border: 1px solid var(--obh-border);
            background: var(--obh-surface);
            font-size: 12px;
            color: var(--obh-muted);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .obh-status:empty { display: none; }

        @keyframes obh-spin { to { transform: rotate(360deg); } }

        .obh-status-loading::before {
            content: "";
            width: 12px;
            height: 12px;
            border-radius: 999px;
            border: 2px solid rgba(127, 127, 127, 0.35);
            border-top-color: var(--obh-accent);
            display: inline-block;
            animation: obh-spin 0.8s linear infinite;
        }

        .obh-status-error {
            color: var(--obh-danger);
            border-color: rgba(180, 35, 24, 0.28);
            background: rgba(180, 35, 24, 0.06);
        }

        .obh-status-success {
            color: var(--obh-success);
            border-color: rgba(6, 118, 71, 0.28);
            background: rgba(6, 118, 71, 0.06);
        }

        .obh-results {
            margin-top: 10px;
            border: 1px solid var(--obh-border);
            border-radius: 12px;
            overflow: auto;
            max-height: 340px;
            background: var(--obh-surface);
        }
        .obh-results:empty { display: none; }

        .obh-results > * + * { border-top: 1px solid var(--obh-border); }

        .obh-result {
            padding: 9px 10px;
            cursor: pointer;
            display: flex;
            align-items: flex-start;
            gap: 10px;
        }

        .obh-result + .obh-result { border-top: 1px solid var(--obh-border); }
        .obh-result:hover { background: var(--obh-hover); }
        .obh-result:active { background: var(--obh-hover-strong); }

        .obh-result-main { flex: 1; min-width: 0; }

        .obh-result-title {
            font-weight: 650;
            font-size: 12.5px;
            color: var(--obh-fg);
            line-height: 1.25;
        }

        .obh-result-meta {
            margin-top: 3px;
            font-size: 11px;
            color: var(--obh-muted);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .obh-result-action {
            flex: 0 0 auto;
            font-size: 11px;
            color: var(--obh-accent);
            border: 1px solid var(--obh-border);
            padding: 2px 8px;
            border-radius: 999px;
            background: var(--obh-input-bg);
            opacity: 0.75;
            margin-top: 1px;
            cursor: pointer;
            user-select: none;
            white-space: nowrap;
        }

        .obh-result:hover .obh-result-action { opacity: 1; }
        .obh-result.obh-copied { background: rgba(6, 118, 71, 0.12); }
        .obh-group-header.obh-copied { background: rgba(6, 118, 71, 0.12); }

        .obh-group-header {
            padding: 9px 10px;
            cursor: pointer;
            display: flex;
            align-items: flex-start;
            gap: 10px;
        }

        .obh-group-header:hover { background: var(--obh-hover); }
        .obh-group-header:active { background: var(--obh-hover-strong); }

        .obh-group-actions {
            display: flex;
            flex: 0 0 auto;
            gap: 6px;
            align-items: flex-start;
        }

        .obh-versions { display: none; }

        .obh-group.obh-expanded .obh-versions {
            display: block;
            border-top: 1px solid var(--obh-border);
        }

        .obh-versions .obh-result {
            padding-left: 24px;
            background: transparent;
        }

        .obh-footer {
            margin-top: 10px;
            display: flex;
            justify-content: space-between;
            gap: 10px;
            font-size: 11px;
            color: var(--obh-muted);
            user-select: none;
        }
    `);
}

function normalizeOrigin(origin) {
    if (!origin) return null;
    try {
        const url = new URL(origin);
        if (url.protocol !== "https:") return null;
        return `${url.protocol}//${url.host}`;
    } catch {
        return null;
    }
}

function getScholarOrigins() {
    const stored = GM_getValue("origins", []);
    const storedList = Array.isArray(stored) ? stored : [];
    const merged = [...new Set([...DEFAULT_SCHOLAR_ORIGINS, ...storedList].map(normalizeOrigin).filter(Boolean))];
    GM_setValue("origins", merged);
    return merged;
}

function getCurrentScholarOrigin() {
    const raw = GM_getValue("configure.origin", DEFAULT_SCHOLAR_ORIGINS[0]);
    const normalized = normalizeOrigin(raw) ?? DEFAULT_SCHOLAR_ORIGINS[0];
    if (normalized !== raw) GM_setValue("configure.origin", normalized);
    return normalized;
}

function setCurrentScholarOrigin(origin) {
    const normalized = normalizeOrigin(origin);
    if (!normalized) return false;
    GM_setValue("configure.origin", normalized);
    return true;
}

(function () {
    'use strict';
    initBrandTheme();
    const notifyCss = GM_getResourceText('notifycss');
    if (notifyCss) GM_addStyle(notifyCss);
    injectObhStyles();
    registerGlobalShortcuts();
    startInjectionWatcher();
})();

function registerGlobalShortcuts() {
    document.addEventListener('keydown', (env) => {
        if (env.key !== 'Escape' || !showBox) return;
        const popupBox = document.getElementById('obh-popup');
        if (!popupBox) return;
        togglePopup(popupBox);
        env.preventDefault();
        env.stopPropagation();
    }, true);

    document.addEventListener('pointerdown', (env) => {
        if (!showBox) return;
        const popupBox = document.getElementById('obh-popup');
        const iconBox = document.getElementById('obh-toggle-icon');
        if (!popupBox || !iconBox) return;
        const target = env.target;
        if (!(target instanceof Node)) return;
        if (popupBox.contains(target) || iconBox.contains(target)) return;
        togglePopup(popupBox);
    }, true);
}

function startInjectionWatcher() {
    if (injectionWatcherStarted) return;
    if (!document.body) {
        window.addEventListener('DOMContentLoaded', startInjectionWatcher, { once: true });
        return;
    }
    injectionWatcherStarted = true;

    scheduleEnsureInjected();

    const observer = new MutationObserver(() => scheduleEnsureInjected());
    observer.observe(document.body, { childList: true, subtree: true });
}

function scheduleEnsureInjected() {
    if (injectScheduled) return;
    injectScheduled = true;
    setTimeout(() => {
        injectScheduled = false;
        ensureInjected();
    }, 120);
}

function ensureInjected() {
    if (injectInProgress) return;
    const toolbar = document.querySelector(TOOLBAR_SELECTOR);
    if (!toolbar) return;
    if (document.getElementById('obh-toggle-icon')) return;
    injectUi(toolbar);
}

function injectUi(toolbarEl) {
    if (injectInProgress) return;
    injectInProgress = true;
    try {
        initBrandTheme();

        const iconBox = createToggleIcon();
        toolbarEl.appendChild(iconBox);

        let popupBox = document.getElementById('obh-popup');
        if (!popupBox) {
            popupBox = createBox();
        }
        if (!popupBox.isConnected) {
            document.body.appendChild(popupBox);
        }

        floatingCleanup?.();
        floatingCleanup = FloatingUIDOM.autoUpdate(iconBox, popupBox, () => {
            FloatingUIDOM.computePosition(iconBox, popupBox, {
                middleware: [FloatingUICore.shift(), FloatingUICore.flip(), FloatingUICore.offset(6)],
            }).then(({ x, y }) => {
                Object.assign(popupBox.style, { top: `${y}px`, left: `${x}px` });
            });
        });

        iconBox.onclick = () => togglePopup(popupBox);

        const closeButton = popupBox.querySelector('#obh-close');
        if (closeButton) closeButton.onclick = () => togglePopup(popupBox);

        const searchButton = popupBox.querySelector('#obh-search-word');
        const searchInput = popupBox.querySelector('#obh-search-input');
        if (searchButton) searchButton.onclick = () => queryArticle();
        if (searchInput) {
            searchInput.onkeydown = (env) => {
                if (env.key === 'Enter') queryArticle();
            };
        }

        const content = popupBox.querySelector('#obh-search-content');
        if (content) {
            content.onclick = (env) => {
                const target = env.target instanceof Element ? env.target : env.target?.parentElement;
                if (!target) return;

                const actionEl = target.closest?.('[data-obh-action]');
                if (actionEl) {
                    const action = actionEl.getAttribute('data-obh-action');
                    const groupEl = actionEl.closest?.('.obh-group');
                    if (!groupEl) return;

                    if (action === 'toggle-versions') {
                        toggleGroupVersions(groupEl);
                        return;
                    }
                    if (action === 'copy-best') {
                        const source = groupEl.dataset.bestSource;
                        const cid = groupEl.dataset.bestCid;
                        copyBibToClipboard(source, cid, groupEl.querySelector('.obh-group-header'));
                        return;
                    }
                }

                const groupHeader = target.closest?.('.obh-group-header');
                if (groupHeader) {
                    const groupEl = groupHeader.closest?.('.obh-group');
                    if (!groupEl) return;
                    toggleGroupVersions(groupEl);
                    return;
                }

                const item = target.closest?.('.obh-result');
                if (!item) return;
                copyBibToClipboard(item.dataset.source, item.dataset.cid, item);
            };
        }
    } finally {
        injectInProgress = false;
    }
}

function togglePopup(popupBox) {
    showBox = !showBox;
    popupBox.style.display = showBox ? 'block' : 'none';
    document.getElementById('obh-toggle-icon')?.classList.toggle('obh-active', showBox);
    if (showBox) {
        const input = popupBox.querySelector('.obh-search-input');
        input?.focus();
        input?.select?.();
        if (!document.getElementById('obh-search-content')?.children?.length) {
            const source = popupBox.querySelector('#obh-source')?.value ?? 'GoogleScholar';
            setStatus(document.getElementById('obh-status'), 'info', source === 'GoogleScholar'
                ? 'Tip: If Scholar fails, switch mirror or complete CAPTCHA in the opened tab.'
                : 'Tip: Prefer published to avoid arXiv/CoRR versions.');
        }
    }
}

async function queryArticle() {
    const statusEl = document.getElementById("obh-status");
    const resultsEl = document.getElementById("obh-search-content");
    const searchButton = document.getElementById("obh-search-word");
    if (!resultsEl) return;
    resultsEl.replaceChildren();

    const word = (document.getElementById('obh-search-input')?.value ?? "").trim();
    if (!word) {
        setStatus(statusEl, 'info', "Please enter a query.");
        return;
    }
    GM_setValue('lastQuery', word);

    const source = document.getElementById("obh-source")?.value ?? "DBLP";
    const resultCount = Number.parseInt(document.getElementById("obh-resultCount")?.value ?? "5", 10) || 5;
    const versionPref = document.getElementById("obh-versionPref")?.value ?? GM_getValue("versionPref", "published");
    const sortMode = document.getElementById("obh-sort")?.value ?? GM_getValue("sortMode", "relevance");
    let yearFrom = parseYearInput(document.getElementById("obh-yearFrom")?.value);
    let yearTo = parseYearInput(document.getElementById("obh-yearTo")?.value);
    if (yearFrom && yearTo && yearFrom > yearTo) [yearFrom, yearTo] = [yearTo, yearFrom];

    if (searchButton) searchButton.disabled = true;
    setStatus(statusEl, 'loading', source === "GoogleScholar" ? "Searching Google Scholar..." : "Searching DBLP...");

    try {
        const lists = source === "DBLP"
            ? await getArticleIDListDBLP(word, resultCount)
            : await getArticleIDListGoogleScholar(word, resultCount, { yearFrom, yearTo, sortMode });

        if (!lists || lists.length === 0) {
            setStatus(statusEl, 'info', "No results found. Try different keywords.");
            return;
        }

        const filtered = source === 'DBLP' ? filterByYearRange(lists, yearFrom, yearTo) : lists;
        const groups = buildGroupedResults(filtered, source, { versionPref, sortMode });

        if (!groups || groups.length === 0) {
            setStatus(statusEl, 'info', 'No results match your filters.');
            return;
        }

        renderSearchResults(resultsEl, groups);

        const paperCount = groups.length;
        const versionCount = groups.reduce((sum, g) => sum + (g.versions?.length ?? 0), 0);
        const multiVersionCount = groups.filter(g => (g.versions?.length ?? 0) > 1).length;
        const warningCount = groups.filter(g => g.note).length;

        const paperText = `${paperCount} paper${paperCount === 1 ? '' : 's'}`;
        const versionText = `${versionCount} version${versionCount === 1 ? '' : 's'}`;
        const extra = multiVersionCount ? ` • ${multiVersionCount} with versions` : '';
        const warnings = warningCount ? ` • ${warningCount} preprint-only` : '';
        setStatus(statusEl, 'success', `${paperText}${extra} • ${versionText}${warnings} • Copy best or open Versions(n).`);
    } catch (err) {
        console.log("Error:", err);
        if (err && err.shouldOpenTab) {
            setStatus(statusEl, 'error', "Google Scholar requires verification (CAPTCHA). A tab has been opened; complete it and retry.");
            setTimeout(() => GM_openInTab(getCurrentScholarOrigin()), 600);
        } else {
            setStatus(statusEl, 'error', "Request failed. Try another query or mirror.");
        }
        new Notify({
            status: 'error',
            title: 'Request failed',
            text: 'Please check your query or try again later.',
            effect: 'slide',
            type: 'filled'
        });
    } finally {
        if (searchButton) searchButton.disabled = false;
    }
}

function createToggleIcon() {
    const iconBox = document.createElement('div');
    iconBox.className = 'ol-cm-toolbar-button obh-toggle';
    iconBox.style.display = 'flex';
    iconBox.style.justifyContent = 'center';
    iconBox.style.alignItems = 'center';
    iconBox.id = 'obh-toggle-icon';
    iconBox.title = 'Overleaf Bib Helper';
    iconBox.setAttribute('aria-label', 'Overleaf Bib Helper');
    iconBox.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>';
    return iconBox;
}

function createBox() {
    const box = document.createElement('div');
    box.id = 'obh-popup';
    box.className = 'obh-popup';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Overleaf Bib Helper');
    box.innerHTML = `
        <div class="obh-header">
            <div class="obh-brand">
                <div class="obh-badge">B</div>
                <div style="min-width:0;">
                    <div class="obh-title">Bib Helper</div>
                    <div class="obh-subtitle">Search & copy BibTeX in Overleaf</div>
                </div>
            </div>
            <button id="obh-close" class="obh-icon-button" type="button" aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="currentColor" d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7a1 1 0 1 0-1.41 1.42L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.42L12 13.41l4.89 4.9a1 1 0 0 0 1.42-1.41L13.41 12l4.9-4.89a1 1 0 0 0-.01-1.4z"/>
                </svg>
            </button>
        </div>

        <div class="obh-search-row">
            <input id="obh-search-input" class="obh-search-input" placeholder="Title, author, keywords" autocomplete="off" />
            <button id="obh-search-word" class="obh-primary-button" type="button" aria-label="Search">
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                </svg>
            </button>
        </div>

        <div class="obh-controls">
            <div class="obh-control">
                <label for="obh-source">Source</label>
                <select id="obh-source" class="obh-select">
                    <option value="DBLP">DBLP</option>
                    <option value="GoogleScholar">Google Scholar</option>
                </select>
            </div>
            <div id="obh-versionpref-row" class="obh-control">
                <label for="obh-versionPref">Version</label>
                <select id="obh-versionPref" class="obh-select">
                    <option value="published">Published first (Recommended)</option>
                    <option value="hidePreprints">Hide preprints</option>
                    <option value="any">Any</option>
                    <option value="preprint">Preprints first</option>
                </select>
            </div>
            <div id="obh-scholar-origin-row" class="obh-control" style="display:none;">
                <label for="obh-scholar-origin">Mirror</label>
                <select id="obh-scholar-origin" class="obh-select"></select>
            </div>
            <div class="obh-control">
                <label for="obh-sort">Order</label>
                <select id="obh-sort" class="obh-select">
                    <option value="relevance">Relevance</option>
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                </select>
            </div>
            <div class="obh-control" style="flex: 1 1 240px; min-width: 240px;">
                <label>Year range</label>
                <div class="obh-year-range">
                    <input id="obh-yearFrom" class="obh-year-input" inputmode="numeric" placeholder="From" />
                    <span class="obh-year-sep">–</span>
                    <input id="obh-yearTo" class="obh-year-input" inputmode="numeric" placeholder="To" />
                </div>
            </div>
            <div class="obh-control">
                <label for="obh-resultCount">Results</label>
                <select id="obh-resultCount" class="obh-select">
                    <option value="5">5</option>
                    <option value="10">10</option>
                    <option value="20">20</option>
                    <option value="50">50</option>
                </select>
            </div>
        </div>

        <div id="obh-status" class="obh-status"></div>
        <div id="obh-search-content" class="obh-results" role="listbox"></div>

        <div class="obh-footer">
            <span>Enter: search</span>
            <span>Esc: close</span>
        </div>
    `;

    const sourceSelect = box.querySelector('#obh-source');
    const versionRow = box.querySelector('#obh-versionpref-row');
    const versionSelect = box.querySelector('#obh-versionPref');
    const sortSelect = box.querySelector('#obh-sort');
    const yearFromInput = box.querySelector('#obh-yearFrom');
    const yearToInput = box.querySelector('#obh-yearTo');
    const countSelect = box.querySelector('#obh-resultCount');
    const originRow = box.querySelector('#obh-scholar-origin-row');
    const originSelect = box.querySelector('#obh-scholar-origin');
    const searchInput = box.querySelector('#obh-search-input');
    const statusEl = box.querySelector('#obh-status');

    if (!sourceSelect || !versionRow || !versionSelect || !sortSelect || !yearFromInput || !yearToInput || !countSelect || !originRow || !originSelect || !searchInput || !statusEl) {
        return box;
    }

    sourceSelect.value = GM_getValue('searchSource', 'GoogleScholar');
    versionSelect.value = GM_getValue('versionPref', 'published');
    sortSelect.value = GM_getValue('sortMode', 'relevance');
    yearFromInput.value = GM_getValue('yearFrom', '');
    yearToInput.value = GM_getValue('yearTo', '');
    countSelect.value = GM_getValue('resultCount', '5');
    searchInput.value = GM_getValue('lastQuery', '');

    const refreshOrigins = () => {
        const origins = getScholarOrigins();
        const current = getCurrentScholarOrigin();
        const resolvedCurrent = origins.includes(current) ? current : origins[0];
        setCurrentScholarOrigin(resolvedCurrent);

        originSelect.replaceChildren();
        for (const origin of origins) {
            const option = document.createElement("option");
            option.value = origin;
            option.textContent = origin.replace(/^https:\/\//, "");
            originSelect.appendChild(option);
        }
        const custom = document.createElement("option");
        custom.value = "__custom__";
        custom.textContent = "Add custom…";
        originSelect.appendChild(custom);

        originSelect.value = resolvedCurrent;
    };

    const updateControlVisibility = () => {
        const isScholar = sourceSelect.value === 'GoogleScholar';
        originRow.style.display = isScholar ? 'block' : 'none';
        versionRow.style.display = isScholar ? 'none' : 'block';

        const oldestOption = sortSelect.querySelector('option[value="oldest"]');
        if (oldestOption) oldestOption.disabled = isScholar;
        if (isScholar && sortSelect.value === 'oldest') sortSelect.value = 'relevance';
    };

    sourceSelect.addEventListener('change', () => {
        GM_setValue('searchSource', sourceSelect.value);
        updateControlVisibility();
        setStatus(statusEl, 'info', sourceSelect.value === 'GoogleScholar'
            ? 'Tip: If Scholar fails, switch mirror or complete CAPTCHA in the opened tab.'
            : 'Tip: Prefer published to avoid arXiv/CoRR versions.');
    });
    versionSelect.addEventListener('change', () => GM_setValue('versionPref', versionSelect.value));
    sortSelect.addEventListener('change', () => GM_setValue('sortMode', sortSelect.value));
    yearFromInput.addEventListener('change', () => {
        const sanitized = sanitizeYearInput(yearFromInput.value);
        yearFromInput.value = sanitized;
        GM_setValue('yearFrom', sanitized);
    });
    yearToInput.addEventListener('change', () => {
        const sanitized = sanitizeYearInput(yearToInput.value);
        yearToInput.value = sanitized;
        GM_setValue('yearTo', sanitized);
    });
    countSelect.addEventListener('change', () => GM_setValue('resultCount', countSelect.value));

    originSelect.addEventListener('change', () => {
        if (originSelect.value === '__custom__') {
            const proposed = prompt('Enter a Google Scholar mirror origin (https://...):', getCurrentScholarOrigin());
            const normalized = normalizeOrigin((proposed ?? '').trim());
            if (!normalized) {
                new Notify({
                    status: 'error',
                    title: 'Invalid mirror',
                    text: 'Please enter a valid https:// origin (no path).',
                    effect: 'slide',
                    type: 'filled'
                });
                refreshOrigins();
                return;
            }
            const updated = [...new Set([...getScholarOrigins(), normalized])];
            GM_setValue('origins', updated);
            setCurrentScholarOrigin(normalized);
            refreshOrigins();
            return;
        }
        setCurrentScholarOrigin(originSelect.value);
    });

    refreshOrigins();
    updateControlVisibility();
    setStatus(statusEl, 'info', sourceSelect.value === 'GoogleScholar'
        ? 'Tip: If Scholar fails, switch mirror or complete CAPTCHA in the opened tab.'
        : 'Tip: Prefer published to avoid arXiv/CoRR versions.');

    return box;
}

function setStatus(statusEl, kind, text) {
    if (!statusEl) return;
    const base = 'obh-status';
    const variant = kind ? ` obh-status-${kind}` : '';
    statusEl.className = base + variant;
    statusEl.textContent = text ?? '';
}

function markCopied(el) {
    if (!el) return;
    el.classList.add('obh-copied');
    setTimeout(() => el.classList.remove('obh-copied'), 650);
}

function toggleGroupVersions(groupEl) {
    if (!groupEl) return;
    const expanded = groupEl.classList.toggle('obh-expanded');
    const toggleEl = groupEl.querySelector?.('[data-obh-action="toggle-versions"]');
    if (!toggleEl) return;
    const count = groupEl.dataset.versionCount || '';
    toggleEl.textContent = expanded ? 'Hide versions' : `Versions (${count || '…'})`;
}

async function copyBibToClipboard(source, cid, highlightEl) {
    if (!source || !cid) return;
    try {
        const bib = source === 'DBLP'
            ? await getBibTexDBLP(cid)
            : await getBibTexGoogleScholar(cid);
        GM_setClipboard(bib);
        markCopied(highlightEl);
        new Notify({
            status: 'success',
            title: 'Copy successfully',
            text: 'Bib has been copied to clipboard',
            effect: 'slide',
            type: 'filled'
        });
    } catch (err) {
        if (err && err.shouldOpenTab) {
            setTimeout(() => GM_openInTab(getCurrentScholarOrigin()), 600);
        }
        new Notify({
            status: 'error',
            title: "Copy failed",
            text: source === 'DBLP' ? "Failed to get BibTeX from DBLP" : "Failed to get BibTeX from Google Scholar",
            effect: "slide",
            type: "filled"
        });
    }
}

function normalizeKeyText(text) {
    const raw = String(text ?? '').trim();
    if (!raw) return '';
    try {
        return raw
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim()
            .replace(/\s+/g, ' ');
    } catch {
        return raw.toLowerCase().trim().replace(/\s+/g, ' ');
    }
}

function normalizeTitleKey(title) {
    const key = normalizeKeyText(title);
    return key || String(title ?? '').trim().toLowerCase();
}

function getFirstAuthor(authorText) {
    const raw = String(authorText ?? '').trim();
    if (!raw) return '';
    return raw.split(/,| and |\u2026|\.{3}/i)[0]?.trim() ?? '';
}

function makeGroupKey(title, authorText) {
    const titleKey = normalizeTitleKey(title);
    const authorKey = normalizeKeyText(getFirstAuthor(authorText));
    return authorKey ? `${titleKey}::${authorKey}` : titleKey;
}

function groupSearchResults(results, source) {
    const map = new Map();
    const groups = [];
    results.forEach((item, index) => {
        const key = makeGroupKey(item.title, item.author);
        let group = map.get(key);
        if (!group) {
            group = {
                key,
                source,
                title: item.title,
                author: item.author,
                firstIndex: index,
                note: '',
                versions: []
            };
            map.set(key, group);
            groups.push(group);
        }
        group.versions.push(item);
    });
    return groups;
}

function orderDblpVersions(versions, versionPref, sortMode) {
    const isPreprint = (item) => getDblpVersionKind(item) === 'preprint';
    const published = versions.filter(item => !isPreprint(item));
    const preprints = versions.filter(item => isPreprint(item));
    const order = (items) => sortDblpArticles(items, sortMode);

    if (versionPref === 'hidePreprints') {
        const publishedOrdered = order(published);
        if (publishedOrdered.length > 0) return { ordered: publishedOrdered, note: '' };
        const preprintsOrdered = order(preprints);
        return { ordered: preprintsOrdered, note: preprintsOrdered.length ? 'No published versions found; showing preprints.' : '' };
    }
    if (versionPref === 'published') return { ordered: order(published).concat(order(preprints)), note: '' };
    if (versionPref === 'preprint') return { ordered: order(preprints).concat(order(published)), note: '' };
    return { ordered: order(versions), note: '' };
}

function sortGroupsByBestYear(groups, sortMode) {
    if (sortMode !== 'newest' && sortMode !== 'oldest') return groups;
    const desc = sortMode === 'newest';
    return groups
        .map((group, index) => ({ group, index, year: parseArticleYear(group.best?.year) }))
        .sort((a, b) => {
            if (a.year == null && b.year == null) return a.index - b.index;
            if (a.year == null) return 1;
            if (b.year == null) return -1;
            if (a.year !== b.year) return desc ? (b.year - a.year) : (a.year - b.year);
            return a.index - b.index;
        })
        .map(entry => entry.group);
}

function buildGroupedResults(results, source, { versionPref, sortMode } = {}) {
    const groups = groupSearchResults(results, source);

    for (const group of groups) {
        if (source === 'DBLP') {
            const { ordered, note } = orderDblpVersions(group.versions, versionPref ?? 'published', sortMode ?? 'relevance');
            group.versions = ordered;
            group.note = note;
        }
        group.best = group.versions[0] ?? null;
    }

    if (source === 'DBLP') {
        return sortGroupsByBestYear(groups, sortMode ?? 'relevance');
    }

    return groups;
}

function formatVersionMeta(article, source) {
    if (source === 'DBLP') {
        const parts = [];
        if (article.year) parts.push(String(article.year).trim());
        if (article.venue) parts.push(String(article.venue).trim());
        const kind = getDblpVersionKind(article);
        parts.push(kind === 'preprint' ? 'Preprint' : 'Published');
        if (article.author) parts.push(String(article.author).trim());
        return parts.filter(Boolean).join(' • ');
    }
    return String(article.author ?? '').trim();
}

function buildSingleResultRow(article, source) {
    const item = document.createElement("div");
    item.className = "obh-result";
    item.dataset.source = source;
    item.dataset.cid = source === "DBLP" ? article.url : article.id;

    const main = document.createElement("div");
    main.className = "obh-result-main";

    const titleEl = document.createElement("div");
    titleEl.className = "obh-result-title";
    titleEl.textContent = article.title || "(No title)";

    const metaEl = document.createElement("div");
    metaEl.className = "obh-result-meta";
    metaEl.textContent = formatVersionMeta(article, source);

    const action = document.createElement("span");
    action.className = "obh-result-action";
    action.textContent = "Copy";

    main.appendChild(titleEl);
    main.appendChild(metaEl);
    item.appendChild(main);
    item.appendChild(action);
    return item;
}

function buildGroupedResultRow(group) {
    const groupEl = document.createElement("div");
    groupEl.className = "obh-group";
    groupEl.dataset.bestSource = group.source;
    groupEl.dataset.bestCid = group.source === 'DBLP' ? (group.best?.url ?? '') : (group.best?.id ?? '');
    groupEl.dataset.versionCount = String(group.versions.length);

    const header = document.createElement("div");
    header.className = "obh-group-header";

    const main = document.createElement("div");
    main.className = "obh-result-main";

    const titleEl = document.createElement("div");
    titleEl.className = "obh-result-title";
    titleEl.textContent = group.title || "(No title)";

    const metaEl = document.createElement("div");
    metaEl.className = "obh-result-meta";
    metaEl.textContent = group.best ? formatVersionMeta(group.best, group.source) : '';

    main.appendChild(titleEl);
    main.appendChild(metaEl);

    const actions = document.createElement("div");
    actions.className = "obh-group-actions";

    const copyBest = document.createElement("span");
    copyBest.className = "obh-result-action";
    copyBest.textContent = "Copy best";
    copyBest.setAttribute("data-obh-action", "copy-best");

    const toggle = document.createElement("span");
    toggle.className = "obh-result-action";
    toggle.textContent = `Versions (${group.versions.length})`;
    toggle.setAttribute("data-obh-action", "toggle-versions");

    actions.appendChild(copyBest);
    actions.appendChild(toggle);

    header.appendChild(main);
    header.appendChild(actions);
    groupEl.appendChild(header);

    const versions = document.createElement("div");
    versions.className = "obh-versions";
    for (const version of group.versions) {
        versions.appendChild(buildSingleResultRow(version, group.source));
    }
    groupEl.appendChild(versions);
    return groupEl;
}

function renderSearchResults(contentEl, groups) {
    contentEl.replaceChildren();
    for (const group of groups) {
        if (group.versions.length <= 1) {
            contentEl.appendChild(buildSingleResultRow(group.versions[0], group.source));
        } else {
            contentEl.appendChild(buildGroupedResultRow(group));
        }
    }
}

function sanitizeYearInput(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const match = raw.match(/\d{4}/);
    if (!match) return '';
    return match[0];
}

function parseYearInput(value) {
    const sanitized = sanitizeYearInput(value);
    if (!sanitized) return null;
    const year = Number.parseInt(sanitized, 10);
    return Number.isFinite(year) ? year : null;
}

function parseArticleYear(value) {
    const year = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(year) ? year : null;
}

function filterByYearRange(items, yearFrom, yearTo) {
    if (!yearFrom && !yearTo) return items;
    const from = yearFrom ?? -Infinity;
    const to = yearTo ?? Infinity;
    const low = Math.min(from, to);
    const high = Math.max(from, to);
    return items.filter(item => {
        const year = parseArticleYear(item?.year);
        if (!year) return false;
        return year >= low && year <= high;
    });
}

function sortDblpArticles(items, sortMode) {
    if (sortMode !== 'newest' && sortMode !== 'oldest') return items;
    const desc = sortMode === 'newest';
    return items
        .map((article, index) => ({ article, index, year: parseArticleYear(article?.year) }))
        .sort((a, b) => {
            if (a.year == null && b.year == null) return a.index - b.index;
            if (a.year == null) return 1;
            if (b.year == null) return -1;
            if (a.year !== b.year) return desc ? (b.year - a.year) : (a.year - b.year);
            return a.index - b.index;
        })
        .map(entry => entry.article);
}

function getDblpVersionKind(article) {
    const url = String(article?.url ?? '').toLowerCase();
    const venue = String(article?.venue ?? '').toLowerCase();
    const type = String(article?.type ?? '').toLowerCase();
    const title = String(article?.title ?? '').toLowerCase();

    if (url.includes('/journals/corr/') || venue === 'corr') return 'preprint';
    if (venue.includes('arxiv') || title.includes('arxiv')) return 'preprint';
    if (type.includes('informal')) return 'preprint';
    return 'published';
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
                    let title = info.querySelector('title')?.textContent ?? '';
                    let authors = Array.from(info.querySelectorAll('author')).map(a => a.textContent).join(', ');
                    let venue = info.querySelector('venue')?.textContent ?? '';
                    let year = info.querySelector('year')?.textContent ?? '';
                    let type = info.querySelector('type')?.textContent ?? '';
                    let url = info.querySelector('url')?.textContent ?? '';
                    articlesIDs.push({
                        url: url,
                        title: title,
                        author: authors,
                        venue,
                        year,
                        type
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
    const match = String(publicationURL ?? '').match(/\/rec\/(.+?)(?:\.html)?$/);
    if (!match) return null;
    return `${dblpOrigin}/rec/${match[1]}.bib`;
}

function getBibTexDBLP(publicationURL) {
    return new Promise((resolve, reject) => {
        const bibtexURL = getBibTexURLDBLP(publicationURL);
        if (!bibtexURL) {
            reject(new Error("Invalid DBLP publication URL"));
            return;
        }
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
function scholarURLWithStart(query, start, { yearFrom, yearTo, sortMode } = {}) {
    const startValue = Number.isFinite(start) ? Math.max(0, Math.trunc(start)) : 0;
    const params = new URLSearchParams();
    params.set('hl', 'zh-CN');
    params.set('q', query ?? '');
    params.set('start', String(startValue));

    if (Number.isFinite(yearFrom)) params.set('as_ylo', String(yearFrom));
    if (Number.isFinite(yearTo)) params.set('as_yhi', String(yearTo));
    if (sortMode === 'newest') params.set('scisbd', '1');

    return `${getCurrentScholarOrigin()}/scholar?${params.toString()}`;
}

function scholarRefPageURL(id) {
    return `${getCurrentScholarOrigin()}/scholar?q=info:${id}:scholar.google.com/&output=cite&scirp=1&hl=zh-CN`;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isLikelyScholarVerificationPage(html, doc) {
    if (doc?.querySelector?.('form#gs_captcha_f, input[name="captcha"], div#captcha, div.recaptcha')) return true;
    return /unusual traffic|not a robot|verify you are|gs_captcha/i.test(html);
}

function parseGoogleScholarSearchResults(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (isLikelyScholarVerificationPage(html, doc)) {
        const err = new Error("Google Scholar may require verification (CAPTCHA).");
        err.shouldOpenTab = true;
        throw err;
    }

    const searchItems = doc.querySelectorAll('div[data-cid]');
    const results = [];
    for (const article of searchItems) {
        const cid = article.getAttribute('data-cid') || '';
        if (!cid || cid.startsWith('gs')) continue;
        const title = article.querySelector("h3")?.textContent?.trim() ?? '';
        const author = article.querySelector("div.gs_a")?.textContent?.trim() ?? '';
        if (!title) continue;
        results.push({ id: cid, title, author });
    }
    return results;
}

async function fetchScholarSearchPage(query, start, options) {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            url: scholarURLWithStart(query, start, options),
            method: "GET",
            onload: response => resolve(response.responseText),
            onerror: err => reject(err)
        });
    });
}

async function getArticleIDListGoogleScholar(query, resultCount, options) {
    const maxResults = Number.parseInt(resultCount, 10) || 5;
    const desired = Math.max(1, Math.min(maxResults, 50));
    const seen = new Set();
    const collected = [];

    const maxRequests = Math.min(10, Math.ceil(desired / 10) + 2);
    let start = 0;

    for (let requestIndex = 0; requestIndex < maxRequests && collected.length < desired; requestIndex++) {
        const html = await fetchScholarSearchPage(query, start, options);
        const pageResults = parseGoogleScholarSearchResults(html);
        if (pageResults.length === 0) break;

        for (const item of pageResults) {
            if (seen.has(item.id)) continue;
            seen.add(item.id);
            collected.push(item);
            if (collected.length >= desired) break;
        }

        start += 10;
        await sleep(250);
    }

    return collected;
}

function getRefPageGoogleScholar(id) {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            url: scholarRefPageURL(id),
            method: "GET",
            onload: res => {
                resolve(res.responseText);
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
            const doc = new DOMParser().parseFromString(page, "text/html");
            let firstAnchor = doc.querySelector("#gs_citi>a.gs_citi");
            if (!firstAnchor) {
                const err = new Error("Google Scholar may require verification (CAPTCHA).");
                err.shouldOpenTab = true;
                throw err;
            }
            let first = firstAnchor.href;
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
        }).catch((err) => {
            if (err && err.shouldOpenTab) {
                setTimeout(() => {
                    GM_openInTab(getCurrentScholarOrigin());
                }, 1000);
            }
            reject(err);
        });
    });
}
