// ==UserScript==
// @name         Overleaf-Bib-Helper
// @namespace    com.Xunjian.overleaf
// @version      2.0.1
// @description  Enhances Overleaf by allowing article searches and BibTeX retrieval from DBLP and Google Scholar
// @author       Xunjian Yin
// @match        https://www.overleaf.com/project/*
// @match        https://overleaf.com/project/*
// @match        https://cn.overleaf.com/project*
// @match        https://latex.pku.edu.cn/project/*
// @icon         https://www.overleaf.com/favicon.ico
// @run-at       document-idle
// @noframes
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @homepageURL  https://github.com/MLNLP-World/Overleaf-Bib-Helper
// @supportURL   https://github.com/MLNLP-World/Overleaf-Bib-Helper/issues
// @downloadURL  https://update.greasyfork.org/scripts/532304/Overleaf-Bib-Helper.user.js
// @updateURL    https://update.greasyfork.org/scripts/532304/Overleaf-Bib-Helper.meta.js
// @connect      *
// @license      MIT
// ==/UserScript==

let showBox = false;
let injectInProgress = false;
let stylesInjected = false;
let injectScheduled = false;
let injectionWatcherStarted = false;
let searchSequence = 0;
let previewSequence = 0;
let copySequence = 0;
let focusBeforePopup = null;
const bibCache = new Map();

// Overleaf's hosted redesign and older/self-hosted editor layouts coexist.
const TOOLBAR_SELECTORS = [
    '.ol-toolbar-layout-right',
    '.ol-cm-toolbar-button-group.ol-cm-toolbar-end',
    '.ide-redesign-toolbar-actions',
];

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
        if (rgbMatch[4] !== undefined && Number.parseFloat(rgbMatch[4]) === 0) return null;
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
        #obh-toggle-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            flex: 0 0 auto;
            height: 28px;
            min-width: 48px;
            margin: 0 4px;
            padding: 0 6px;
            border: 1px solid currentColor;
            border-radius: 4px;
            background: transparent;
            color: inherit;
            font: 12px/1.2 system-ui, sans-serif;
            cursor: pointer;
        }
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
            width: min(600px, calc(100vw - 24px));
            max-height: calc(100vh - 24px);
            overflow: auto;
            padding: 12px;
            background: var(--obh-bg);
            color: var(--obh-fg);
            border: 1px solid var(--obh-border);
            border-radius: 6px;
            font-family: var(--obh-font);
            position: fixed;
            top: 0;
            left: 0;
            display: none;
            z-index: 2147483647;
        }

        .obh-popup[data-theme="dark"] {
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

        .obh-popup * { box-sizing: border-box; }
        .obh-popup [hidden] { display: none !important; }
        .obh-popup button, .obh-popup input, .obh-popup select, .obh-popup textarea { font-family: inherit; }
        .obh-popup input { min-width: 0; }
        .obh-popup button:focus-visible, #obh-toggle-icon:focus-visible, .obh-popup summary:focus-visible {
            outline: 2px solid var(--obh-brand, #138a07);
            outline-offset: 2px;
        }
        .obh-popup .obh-icon-button, .obh-popup .obh-search-input, .obh-popup .obh-primary-button,
        .obh-popup .obh-select, .obh-popup .obh-year-input, .obh-popup .obh-status, .obh-popup .obh-results {
            border-radius: 4px;
        }
        .obh-advanced { margin-top: 10px; font-size: 12px; }
        .obh-advanced summary { cursor: pointer; color: var(--obh-muted); }
        .obh-result-actions { display: flex; flex-wrap: wrap; gap: 6px; }
        .obh-result-title { overflow-wrap: anywhere; }
        .obh-popup .obh-result-action { border-radius: 4px; opacity: 1; line-height: 1.5; font: inherit; font-size: 11px; }
        .obh-preview { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--obh-border); }
        .obh-preview label { display: block; font-size: 12px; margin: 8px 0 4px; }
        .obh-preview textarea {
            display: block; width: 100%; height: 190px; resize: vertical; padding: 8px;
            font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace;
            color: var(--obh-fg); background: var(--obh-input-bg); border: 1px solid var(--obh-border);
        }
        .obh-preview .obh-result-actions { margin-top: 8px; }
        @media (max-width: 440px) {
            .obh-group-header, .obh-result { flex-wrap: wrap; }
            .obh-result-main { flex-basis: 100%; }
        }
        @media (prefers-reduced-motion: reduce) { .obh-status-loading::before { animation: none; } }

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
    injectObhStyles();
    registerGlobalShortcuts();
    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('Open Bib Helper (Alt+Shift+B)', openHelper);
    }
    startInjectionWatcher();
})();

function isVisible(el) {
    if (!el?.isConnected) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
}

function registerGlobalShortcuts() {
    document.addEventListener('keydown', (event) => {
        if (event.isComposing) return;
        if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyB') {
            event.preventDefault();
            event.stopPropagation();
            openHelper();
        } else if (event.key === 'Escape' && showBox) {
            togglePopup(document.getElementById('obh-popup'), false);
            event.preventDefault();
            event.stopPropagation();
        }
    }, true);

    document.addEventListener('pointerdown', (event) => {
        if (!showBox) return;
        const popup = document.getElementById('obh-popup');
        const icon = document.getElementById('obh-toggle-icon');
        if (popup?.contains(event.target) || icon?.contains(event.target)) return;
        togglePopup(popup, false, false);
    }, true);
    window.addEventListener('resize', () => { scheduleEnsureInjected(); positionPopup(); });
    document.addEventListener('scroll', positionPopup, true);
}

function startInjectionWatcher() {
    if (injectionWatcherStarted) return;
    if (!document.body) {
        window.addEventListener('DOMContentLoaded', startInjectionWatcher, { once: true });
        return;
    }
    injectionWatcherStarted = true;
    scheduleEnsureInjected();
    const observer = new MutationObserver((records) => {
        // Ignore our own result rendering and position updates.
        if (records.some(record => !record.target.closest?.('#obh-popup, #obh-toggle-icon'))) {
            scheduleEnsureInjected();
        }
    });
    observer.observe(document.body, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ['class', 'style', 'hidden'],
    });
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
    if (injectInProgress || !document.body) return;
    let toolbar = null;
    for (const selector of TOOLBAR_SELECTORS) {
        toolbar = Array.from(document.querySelectorAll(selector)).find(isVisible);
        if (toolbar) break;
    }
    if (toolbar) injectUi(toolbar);
    if (showBox) positionPopup();
}

function getPopup() {
    let popup = document.getElementById('obh-popup');
    if (!popup) {
        popup = createBox();
        document.body.appendChild(popup);
        bindPopupEvents(popup);
    }
    return popup;
}

function injectUi(toolbar) {
    injectInProgress = true;
    try {
        let icon = document.getElementById('obh-toggle-icon');
        if (!icon) {
            icon = createToggleIcon();
            // CodeMirror handles bubbled mouse presses as editor selection gestures.
            icon.addEventListener('pointerdown', event => event.stopPropagation());
            icon.addEventListener('mousedown', event => {
                event.preventDefault();
                event.stopPropagation();
            });
            icon.onclick = event => {
                event.stopPropagation();
                togglePopup(getPopup());
            };
        }
        // React may replace or hide its toolbar when switching files/layouts.
        if (icon.parentElement !== toolbar) toolbar.appendChild(icon);
        icon.classList.toggle('obh-active', showBox);
        icon.setAttribute('aria-expanded', String(showBox));
    } finally {
        injectInProgress = false;
    }
}

function bindPopupEvents(popup) {
    popup.querySelector('#obh-close').onclick = () => togglePopup(popup, false);
    popup.querySelector('#obh-search-word').onclick = () => queryArticle();
    popup.querySelector('#obh-search-input').onkeydown = (event) => {
        if (event.key === 'Enter' && !event.isComposing) {
            event.preventDefault();
            queryArticle();
        }
    };
    popup.querySelector('.obh-advanced').ontoggle = positionPopup;
    popup.querySelector('#obh-search-content').onclick = (event) => {
        const target = event.target instanceof Element ? event.target : event.target?.parentElement;
        if (!target || target.closest('a')) return;
        const action = target.closest('[data-obh-action]');
        const group = target.closest('.obh-group');
        const item = target.closest('.obh-result');
        if (action?.dataset.obhAction === 'toggle-versions') {
            toggleGroupVersions(group);
            return;
        }
        if (action) {
            const source = item?.dataset.source ?? group?.dataset.bestSource;
            const cid = item?.dataset.cid ?? group?.dataset.bestCid;
            const origin = item?.dataset.origin ?? group?.dataset.origin;
            if (action.dataset.obhAction === 'preview') {
                previewBib(source, cid, origin);
            } else {
                copyBibToClipboard(source, cid, item ?? group?.querySelector('.obh-group-header'), origin);
            }
        } else if (item) {
            copyBibToClipboard(item.dataset.source, item.dataset.cid, item, item.dataset.origin);
        } else if (target.closest('.obh-group-header')) {
            toggleGroupVersions(group);
        }
    };
    popup.querySelector('#obh-close-preview').onclick = () => {
        previewSequence++;
        popup.querySelector('#obh-preview').hidden = true;
        positionPopup();
    };
    popup.querySelector('#obh-citation-key').onchange = () => {
        try {
            const area = popup.querySelector('#obh-bib-preview');
            area.value = replaceCitationKey(area.value, popup.querySelector('#obh-citation-key').value.trim());
            setStatus(popup.querySelector('#obh-preview-status'), 'success', 'Citation key updated.');
        } catch (error) {
            setStatus(popup.querySelector('#obh-preview-status'), 'error', error.message);
        }
    };
    popup.querySelector('#obh-bib-preview').oninput = () => {
        popup.querySelector('#obh-citation-key').value = citationKey(popup.querySelector('#obh-bib-preview').value);
    };
    for (const mode of ['preview', 'key', 'cite']) {
        popup.querySelector(`#obh-copy-${mode}`).onclick = () => copyPreview(mode);
    }
    popup.querySelector('#obh-download-bib').onclick = downloadPreview;
}

function openHelper() {
    ensureInjected();
    togglePopup(getPopup(), true);
}

function togglePopup(popup, visible = !showBox, restoreFocus = true) {
    if (!popup) return;
    const opening = visible && !showBox;
    if (opening) {
        focusBeforePopup = document.activeElement;
        const selection = window.getSelection()?.toString().trim();
        if (selection && selection.length <= 500 && !popup.contains(document.activeElement)) {
            popup.querySelector('#obh-search-input').value = selection;
        }
    }
    showBox = visible;
    popup.style.display = visible ? 'block' : 'none';
    const icon = document.getElementById('obh-toggle-icon');
    icon?.classList.toggle('obh-active', visible);
    icon?.setAttribute('aria-expanded', String(visible));
    if (visible) {
        initBrandTheme();
        const editor = Array.from(document.querySelectorAll('.cm-editor')).find(isVisible);
        const background = editor ? parseCssColorToRgb(getComputedStyle(editor).backgroundColor) : null;
        popup.dataset.theme = background && (background.r * 0.299 + background.g * 0.587 + background.b * 0.114) < 128 ? 'dark' : 'light';
        positionPopup();
        const input = popup.querySelector('#obh-search-input');
        input.focus();
        input.select();
    } else if (restoreFocus && isVisible(focusBeforePopup)) {
        focusBeforePopup.focus();
    }
}

function positionPopup() {
    const popup = document.getElementById('obh-popup');
    if (!showBox || !popup) return;
    const icon = document.getElementById('obh-toggle-icon');
    const rect = isVisible(icon) ? icon.getBoundingClientRect() : null;
    const width = popup.offsetWidth;
    const height = popup.offsetHeight;
    const margin = 12;
    const x = rect ? rect.right - width : (window.innerWidth - width) / 2;
    let y = rect ? rect.bottom + 6 : margin;
    if (rect && y + height > window.innerHeight - margin && rect.top - height - 6 >= margin) {
        y = rect.top - height - 6;
    }
    popup.style.left = `${Math.max(margin, Math.min(x, window.innerWidth - width - margin))}px`;
    popup.style.top = `${Math.max(margin, Math.min(y, window.innerHeight - height - margin))}px`;
}

async function queryArticle() {
    const sequence = ++searchSequence;
    copySequence++;
    previewSequence++;
    const preview = document.getElementById('obh-preview');
    if (preview) preview.hidden = true;
    const statusEl = document.getElementById("obh-status");
    const resultsEl = document.getElementById("obh-search-content");
    const searchButton = document.getElementById("obh-search-word");
    if (!resultsEl) return;
    resultsEl.replaceChildren();

    const word = (document.getElementById('obh-search-input')?.value ?? "").trim();
    if (!word) {
        if (searchButton) searchButton.disabled = false;
        setStatus(statusEl, 'info', "Please enter a query.");
        return;
    }
    GM_setValue('lastQuery', word);
    rememberQuery(word);

    const source = document.getElementById("obh-source")?.value ?? "DBLP";
    const resultCount = Number.parseInt(document.getElementById("obh-resultCount")?.value ?? "5", 10) || 5;
    const versionPref = document.getElementById("obh-versionPref")?.value ?? GM_getValue("versionPref", "published");
    const sortMode = document.getElementById("obh-sort")?.value ?? GM_getValue("sortMode", "relevance");
    let yearFrom = parseYearInput(document.getElementById("obh-yearFrom")?.value);
    let yearTo = parseYearInput(document.getElementById("obh-yearTo")?.value);
    if (yearFrom && yearTo && yearFrom > yearTo) [yearFrom, yearTo] = [yearTo, yearFrom];
    const origin = getCurrentScholarOrigin();

    if (searchButton) searchButton.disabled = true;
    setStatus(statusEl, 'loading', source === "GoogleScholar" ? "Searching Google Scholar..." : "Searching DBLP...");

    try {
        const lists = source === "DBLP"
            ? await getArticleIDListDBLP(word, resultCount)
            : await getArticleIDListGoogleScholar(word, resultCount, { yearFrom, yearTo, sortMode, origin });
        if (sequence !== searchSequence) return;

        if (!lists || lists.length === 0) {
            setStatus(statusEl, 'info', "No results found. Try different keywords.");
            return;
        }

        const filtered = source === 'DBLP' ? filterByYearRange(lists, yearFrom, yearTo) : lists;
        const groups = buildGroupedResults(filtered, source, { versionPref, sortMode }).slice(0, resultCount);

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
        setStatus(statusEl, 'success', `${paperText}${extra} • ${versionText}${warnings}. Preview to edit the citation key or copy a citation.`);
    } catch (err) {
        if (sequence !== searchSequence) return;
        showRequestError(err, source, statusEl);
    } finally {
        if (sequence === searchSequence) {
            if (searchButton) searchButton.disabled = false;
            positionPopup();
        }
    }
}

function createToggleIcon() {
    const iconBox = document.createElement('button');
    iconBox.type = 'button';
    iconBox.className = 'ol-cm-toolbar-button obh-toggle';
    iconBox.style.display = 'flex';
    iconBox.style.justifyContent = 'center';
    iconBox.style.alignItems = 'center';
    iconBox.id = 'obh-toggle-icon';
    iconBox.title = 'Overleaf Bib Helper (Alt+Shift+B)';
    iconBox.setAttribute('aria-label', 'Overleaf Bib Helper');
    iconBox.setAttribute('aria-controls', 'obh-popup');
    iconBox.setAttribute('aria-expanded', String(showBox));
    iconBox.setAttribute('aria-haspopup', 'dialog');
    iconBox.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>';
    iconBox.querySelector('svg').setAttribute('aria-hidden', 'true');
    iconBox.append(document.createTextNode('Bib'));
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
            <input id="obh-search-input" class="obh-search-input" aria-label="Search papers" placeholder="Title, author, keywords" autocomplete="off" list="obh-recent-queries" />
            <datalist id="obh-recent-queries"></datalist>
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
        </div>
        <details class="obh-advanced">
            <summary>Search options: versions, years, mirror, result count</summary>
            <div class="obh-controls">
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
                    <input id="obh-yearFrom" class="obh-year-input" aria-label="From year" inputmode="numeric" placeholder="From" />
                    <span class="obh-year-sep">–</span>
                    <input id="obh-yearTo" class="obh-year-input" aria-label="To year" inputmode="numeric" placeholder="To" />
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
        </details>

        <div id="obh-status" class="obh-status" role="status" aria-live="polite"></div>
        <div id="obh-search-content" class="obh-results" aria-label="Search results"></div>

        <section id="obh-preview" class="obh-preview" aria-label="BibTeX preview" hidden>
            <div class="obh-header">
                <strong class="obh-title">BibTeX preview</strong>
                <button id="obh-close-preview" class="obh-result-action" type="button">Close preview</button>
            </div>
            <label for="obh-citation-key">Citation key</label>
            <input id="obh-citation-key" class="obh-search-input" autocomplete="off" />
            <label for="obh-bib-preview">BibTeX (editable)</label>
            <textarea id="obh-bib-preview" spellcheck="false"></textarea>
            <div class="obh-result-actions">
                <button id="obh-copy-preview" class="obh-result-action" type="button">Copy BibTeX</button>
                <button id="obh-copy-key" class="obh-result-action" type="button">Copy key</button>
                <button id="obh-copy-cite" class="obh-result-action" type="button">Copy \\cite{key}</button>
                <button id="obh-download-bib" class="obh-result-action" type="button">Download .bib</button>
            </div>
            <div id="obh-preview-status" class="obh-status" role="status" aria-live="polite"></div>
        </section>

        <div class="obh-footer">
            <span>Alt+Shift+B: open · Enter: search</span>
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

    sourceSelect.value = GM_getValue('searchSource', 'DBLP');
    versionSelect.value = GM_getValue('versionPref', 'published');
    sortSelect.value = GM_getValue('sortMode', 'relevance');
    yearFromInput.value = GM_getValue('yearFrom', '');
    yearToInput.value = GM_getValue('yearTo', '');
    countSelect.value = GM_getValue('resultCount', '10');
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
        invalidateSearch(box);
        GM_setValue('searchSource', sourceSelect.value);
        updateControlVisibility();
        setStatus(statusEl, 'info', sourceSelect.value === 'GoogleScholar'
            ? 'Scholar may require verification. Use the verification link on errors, or switch to DBLP.'
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
                if (proposed !== null) setStatus(statusEl, 'error', 'Please enter a valid https:// mirror origin.');
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
    refreshRecentQueries(box);
    setStatus(statusEl, 'info', sourceSelect.value === 'GoogleScholar'
        ? 'Scholar may require verification. Use the verification link on errors, or switch to DBLP.'
        : 'Tip: Prefer published to avoid arXiv/CoRR versions.');

    return box;
}

function setStatus(statusEl, kind, text) {
    if (!statusEl) return;
    const base = 'obh-status';
    const variant = kind ? ` obh-status-${kind}` : '';
    statusEl.className = base + variant;
    statusEl.textContent = text ?? '';
    positionPopup();
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
    toggleEl.setAttribute('aria-expanded', String(expanded));
    positionPopup();
}

function invalidateSearch(popup) {
    searchSequence++;
    copySequence++;
    previewSequence++;
    popup.querySelector('#obh-search-content').replaceChildren();
    popup.querySelector('#obh-search-word').disabled = false;
    popup.querySelector('#obh-preview').hidden = true;
}

function refreshRecentQueries(root = document) {
    const list = root.querySelector('#obh-recent-queries');
    if (!list) return;
    const history = GM_getValue('recentQueries', []);
    list.replaceChildren();
    for (const query of (Array.isArray(history) ? history : []).filter(q => typeof q === 'string').slice(0, 10)) {
        const option = document.createElement('option');
        option.value = query;
        list.appendChild(option);
    }
}

function rememberQuery(query) {
    const history = GM_getValue('recentQueries', []);
    GM_setValue('recentQueries', [...new Set([query, ...(Array.isArray(history) ? history : [])])].slice(0, 10));
    refreshRecentQueries();
}

function showRequestError(error, source, status = document.getElementById('obh-status')) {
    setStatus(status, 'error', error?.message || 'Request failed. Please retry.');
    const verificationUrl = normalizeOrigin(error?.verificationUrl) ? error.verificationUrl : null;
    if (verificationUrl) {
        const verify = document.createElement('button');
        verify.type = 'button';
        verify.className = 'obh-result-action';
        verify.textContent = 'Open verification page';
        verify.onclick = () => GM_openInTab(verificationUrl, { active: true, insert: true });
        status.appendChild(verify);
    }
    if (source === 'GoogleScholar') {
        const fallback = document.createElement('button');
        fallback.type = 'button';
        fallback.className = 'obh-result-action';
        fallback.textContent = 'Search DBLP instead';
        fallback.onclick = () => {
            const select = document.getElementById('obh-source');
            select.value = 'DBLP';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            queryArticle();
        };
        status.appendChild(fallback);
    }
    positionPopup();
}

function fetchBib(source, cid, origin) {
    if (!cid || !['DBLP', 'GoogleScholar'].includes(source)) return Promise.reject(new Error('Invalid paper.'));
    const key = JSON.stringify([source, origin || '', cid]);
    if (bibCache.has(key)) return bibCache.get(key);
    const pending = Promise.resolve().then(() => source === 'DBLP'
        ? getBibTexDBLP(cid)
        : getBibTexGoogleScholar(cid, origin || getCurrentScholarOrigin()))
        .then(validateBibTeX).catch(error => {
            if (bibCache.get(key) === pending) bibCache.delete(key);
            throw error;
        });
    bibCache.set(key, pending);
    if (bibCache.size > 50) bibCache.delete(bibCache.keys().next().value);
    return pending;
}

async function copyBibToClipboard(source, cid, highlightEl, origin) {
    if (!source || !cid) return;
    const sequence = ++copySequence;
    const status = document.getElementById('obh-status');
    setStatus(status, 'loading', 'Fetching BibTeX…');
    try {
        const bib = await fetchBib(source, cid, origin);
        if (sequence !== copySequence) return;
        await GM_setClipboard(bib, 'text');
        markCopied(highlightEl);
        setStatus(status, 'success', 'BibTeX copied. Paste it into your .bib file.');
    } catch (error) {
        if (sequence === copySequence) showRequestError(error, source, status);
    }
}

function citationKey(bib) {
    try {
        const { records } = parseBibTeXRecords(bib);
        return records.length === 1 ? records[0].key : '';
    } catch { return ''; }
}

function replaceCitationKey(bib, key) {
    if (!/^[\p{L}\p{N}_:.+\-/]+$/u.test(key)) {
        throw new Error('Use letters, numbers, _, :, ., +, -, or / in the citation key.');
    }
    const parsed = parseBibTeXRecords(bib);
    if (parsed.records.length !== 1) throw new Error('Preview supports one BibTeX entry at a time.');
    const record = parsed.records[0];
    return parsed.bib.slice(0, record.keyStart) + key + parsed.bib.slice(record.keyEnd);
}

async function previewBib(source, cid, origin) {
    const sequence = ++previewSequence;
    const previewTrigger = document.activeElement;
    const preview = document.getElementById('obh-preview');
    const status = document.getElementById('obh-preview-status');
    const area = document.getElementById('obh-bib-preview');
    const keyInput = document.getElementById('obh-citation-key');
    preview.hidden = false;
    area.value = '';
    keyInput.value = '';
    const actions = preview.querySelectorAll('input, textarea, .obh-result-actions button');
    actions.forEach(el => { el.disabled = true; });
    setStatus(status, 'loading', 'Loading BibTeX preview…');
    positionPopup();
    try {
        const bib = await fetchBib(source, cid, origin);
        if (sequence !== previewSequence) return;
        if (parseBibTeXRecords(bib).records.length !== 1) throw new Error('Preview supports one BibTeX entry at a time.');
        area.value = bib;
        keyInput.value = citationKey(bib);
        actions.forEach(el => { el.disabled = false; });
        setStatus(status, 'info', 'Edit the key or BibTeX before copying. Add the entry to your .bib file before using its citation.');
        if (showBox && document.activeElement === previewTrigger) {
            keyInput.focus();
            keyInput.scrollIntoView({ block: 'nearest' });
        }
    } catch (error) {
        if (sequence === previewSequence) showRequestError(error, source, status);
    } finally {
        if (sequence === previewSequence) positionPopup();
    }
}

function currentPreviewBib() {
    const area = document.getElementById('obh-bib-preview');
    const key = document.getElementById('obh-citation-key').value.trim();
    const bib = replaceCitationKey(validateBibTeX(area.value), key);
    area.value = bib;
    return bib;
}

async function copyPreview(mode) {
    const sequence = ++copySequence;
    const status = document.getElementById('obh-preview-status');
    try {
        const bib = currentPreviewBib();
        const key = citationKey(bib);
        const text = mode === 'cite' ? `\\cite{${key}}` : mode === 'key' ? key : bib;
        await GM_setClipboard(text, 'text');
        if (sequence === copySequence) setStatus(status, 'success', mode === 'preview' ? 'BibTeX copied.' : mode === 'key' ? 'Citation key copied.' : 'Citation command copied.');
    } catch (error) {
        setStatus(status, 'error', error.message || 'Copy failed.');
    }
}

function downloadPreview() {
    const status = document.getElementById('obh-preview-status');
    try {
        const bib = currentPreviewBib();
        const url = URL.createObjectURL(new Blob([bib + '\n'], { type: 'application/x-bibtex;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = citationKey(bib).replace(/[^a-z0-9_.-]/gi, '_') + '.bib';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatus(status, 'success', 'BibTeX file downloaded.');
    } catch (error) {
        setStatus(status, 'error', error.message);
    }
}

function normalizeKeyText(text) {
    const raw = String(text ?? '').trim();
    if (!raw) return '';
    try {
        return raw
            .toLowerCase()
            .normalize('NFKD')
            .replace(/\p{M}/gu, '')
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
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
        return { ordered: order(published), note: '' };
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

    const nonemptyGroups = groups.filter(group => group.best);
    if (source === 'DBLP') {
        return sortGroupsByBestYear(nonemptyGroups, sortMode ?? 'relevance');
    }

    return nonemptyGroups;
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
    item.dataset.origin = article.origin || '';

    const main = document.createElement("div");
    main.className = "obh-result-main";

    const titleEl = document.createElement("div");
    titleEl.className = "obh-result-title";
    titleEl.textContent = article.title || "(No title)";

    const metaEl = document.createElement("div");
    metaEl.className = "obh-result-meta";
    metaEl.textContent = formatVersionMeta(article, source);

    const actions = document.createElement('div');
    actions.className = 'obh-result-actions';
    const action = document.createElement("button");
    action.type = 'button';
    action.dataset.obhAction = 'copy';
    action.className = "obh-result-action";
    action.textContent = "Copy";
    const preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'obh-result-action';
    preview.dataset.obhAction = 'preview';
    preview.textContent = 'Preview';
    actions.append(action, preview);
    appendSourceLink(actions, article, source);

    main.appendChild(titleEl);
    main.appendChild(metaEl);
    item.appendChild(main);
    item.appendChild(actions);
    return item;
}

function buildGroupedResultRow(group) {
    const groupEl = document.createElement("div");
    groupEl.className = "obh-group";
    groupEl.dataset.bestSource = group.source;
    groupEl.dataset.bestCid = group.source === 'DBLP' ? (group.best?.url ?? '') : (group.best?.id ?? '');
    groupEl.dataset.versionCount = String(group.versions.length);
    groupEl.dataset.origin = group.best?.origin || '';

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

    const copyBest = document.createElement("button");
    copyBest.type = 'button';
    copyBest.className = "obh-result-action";
    copyBest.textContent = "Copy best";
    copyBest.setAttribute("data-obh-action", "copy-best");

    const toggle = document.createElement("button");
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.className = "obh-result-action";
    toggle.textContent = `Versions (${group.versions.length})`;
    toggle.setAttribute("data-obh-action", "toggle-versions");

    actions.appendChild(copyBest);
    const preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'obh-result-action';
    preview.dataset.obhAction = 'preview';
    preview.textContent = 'Preview';
    actions.appendChild(preview);
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

function appendSourceLink(container, article, source) {
    const raw = article.url;
    if (!raw) return;
    try {
        const url = new URL(raw);
        if (!['https:', 'http:'].includes(url.protocol)) return;
        const link = document.createElement('a');
        link.className = 'obh-result-action';
        link.href = url.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Source';
        container.appendChild(link);
    } catch { /* Some Scholar citation-only records have no source link. */ }
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

    if (url.includes('/journals/corr/') || venue === 'corr') return 'preprint';
    if (venue.includes('arxiv')) return 'preprint';
    if (type.includes('informal')) return 'preprint';
    return 'published';
}

// DBLP Functions
const dblpOrigin = "https://dblp.org";

// All providers share bounded requests. Verification stays an explicit UI action.
function requestText(url, { timeout = 20000, verificationUrl = '', provider = 'Google Scholar' } = {}) {
    return new Promise((resolve, reject) => {
        const fail = (message, needsVerification = false, status = null) => {
            const error = new Error(message);
            error.requestUrl = url;
            if (status != null) error.httpStatus = status;
            if (needsVerification && verificationUrl) error.verificationUrl = verificationUrl;
            reject(error);
        };
        try {
            GM_xmlhttpRequest({
                url,
                method: 'GET',
                timeout,
                onload: response => {
                    const status = Number(response.status);
                    const text = String(response.responseText ?? '');
                    const needsVerification = Boolean(verificationUrl) &&
                        (status === 403 || status === 429 || isLikelyScholarVerificationPage(text) ||
                            /id=["']anubis_challenge|id=["']challenge-form|cf-chl-/i.test(text));
                    if (needsVerification) {
                        fail(provider + ' requires verification or is limiting requests. Open the verification page, then retry.', true, status);
                        return;
                    }
                    if (!Number.isFinite(status) || status < 200 || status >= 300) {
                        fail('Request failed (HTTP ' + (Number.isFinite(status) ? status : 'unknown') + ').', false, status);
                        return;
                    }
                    resolve(text);
                },
                ontimeout: () => fail('Request timed out. Please retry or choose another source.'),
                onabort: () => fail('Request was cancelled.'),
                onerror: () => fail('Network request failed. Check your connection or choose another source.')
            });
        } catch (error) {
            reject(error);
        }
    });
}

// Offsets refer to the trimmed bib string, so key edits preserve every other byte.
// Auxiliary records and percent comments are never treated as citation entries.
function parseBibTeXRecords(text) {
    const bib = String(text ?? '').trim();
    let cursor = 0;
    const records = [];
    const invalid = () => new Error('The source did not return a complete BibTeX entry.');
    const skipTrivia = () => {
        while (cursor < bib.length) {
            if (/\s/.test(bib[cursor])) {
                cursor++;
            } else if (bib[cursor] === '%') {
                const newline = bib.indexOf('\n', cursor);
                cursor = newline === -1 ? bib.length : newline + 1;
            } else {
                break;
            }
        }
    };

    skipTrivia();
    while (cursor < bib.length) {
        const recordStart = cursor;
        const header = /^@([a-z][a-z0-9_-]*)\s*([{(])/i.exec(bib.slice(cursor));
        if (!header) throw invalid();
        const type = header[1].toLowerCase();
        const opening = header[2];
        const bodyStart = cursor + header[0].length;
        cursor = bodyStart;
        let depth = 1;
        let braceDepth = 0;
        let quoted = false;
        let escaped = false;

        for (; cursor < bib.length; cursor++) {
            const char = bib[cursor];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === '\\') {
                escaped = true;
                continue;
            }
            if (opening === '{') {
                if (char === '"' && depth === 1 && type !== 'comment') quoted = !quoted;
                if (char === '{') depth++;
                if (char === '}') depth--;
            } else {
                if (char === '{') braceDepth++;
                if (char === '}') {
                    braceDepth--;
                    if (braceDepth < 0) throw invalid();
                }
                if (char === '"' && braceDepth === 0 && type !== 'comment') quoted = !quoted;
                if (!quoted && braceDepth === 0) {
                    if (char === '(') depth++;
                    if (char === ')') depth--;
                }
            }
            if (depth === 0) break;
        }

        if (depth !== 0 || braceDepth !== 0 || quoted || escaped) throw invalid();
        const body = bib.slice(bodyStart, cursor);
        if (!['comment', 'preamble', 'string'].includes(type)) {
            const keyMatch = /^\s*([^,\s{}()]+)\s*,/.exec(body);
            if (!keyMatch || !/\b[a-z][a-z0-9_-]*\s*=/i.test(body.slice(keyMatch[0].length))) throw invalid();
            const key = keyMatch[1];
            const keyStart = bodyStart + keyMatch[0].indexOf(key);
            records.push({ type, key, keyStart, keyEnd: keyStart + key.length, start: recordStart, end: cursor + 1 });
        }
        cursor++;
        skipTrivia();
    }
    if (!records.length) throw invalid();
    return { bib, records };
}

// Reject HTML/error responses and incomplete records before caching or copying.
function validateBibTeX(text) {
    return parseBibTeXRecords(text).bib;
}

async function getArticleIDListDBLP(query, resultCount) {
    // Filter and group a bounded candidate set before the UI applies its result limit.
    const requested = Number.parseInt(resultCount, 10) || 5;
    const candidateCount = Math.max(40, Math.min(200, requested * 4));
    const url = dblpOrigin + '/search/publ/api?q=' + encodeURIComponent(query) + '&h=' + candidateCount;
    const xml = await requestText(url, { verificationUrl: url, provider: 'DBLP' });
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror') || doc.documentElement?.localName !== 'result' || !doc.querySelector('hits')) {
        throw new Error('DBLP returned an invalid search response. Please retry.');
    }

    const articles = [];
    for (const hit of doc.querySelectorAll('hit')) {
        const info = hit.querySelector('info');
        if (!info) throw new Error('DBLP returned an incomplete publication record.');
        const title = info.querySelector('title')?.textContent?.trim() ?? '';
        const publicationURL = info.querySelector('url')?.textContent?.trim() ?? '';
        if (!title || !getBibTexURLDBLP(publicationURL)) continue;
        articles.push({
            url: publicationURL,
            title,
            author: Array.from(info.querySelectorAll('author')).map(author => author.textContent?.trim() ?? '').filter(Boolean).join(', '),
            venue: info.querySelector('venue')?.textContent?.trim() ?? '',
            year: info.querySelector('year')?.textContent?.trim() ?? '',
            type: info.querySelector('type')?.textContent?.trim() ?? ''
        });
    }
    return articles;
}

function getBibTexURLDBLP(publicationURL) {
    try {
        const url = new URL(String(publicationURL ?? ''), dblpOrigin);
        if (!/^https?:$/.test(url.protocol) || !/^(?:www\.)?dblp\.(?:org|uni-trier\.de)$/i.test(url.hostname)) return null;
        const record = url.pathname.match(/^\/rec\/(.+?)(?:\.(?:html|bib))?$/i)?.[1];
        if (!record || record.endsWith('/')) return null;
        return dblpOrigin + '/rec/' + record + '.bib';
    } catch {
        return null;
    }
}

async function getBibTexDBLP(publicationURL) {
    const bibtexURL = getBibTexURLDBLP(publicationURL);
    if (!bibtexURL) throw new Error('Invalid DBLP publication URL.');
    return validateBibTeX(await requestText(bibtexURL, { verificationUrl: bibtexURL, provider: 'DBLP' }));
}

// Google Scholar Functions
function scholarURLWithStart(query, start, { yearFrom, yearTo, sortMode, origin = getCurrentScholarOrigin() } = {}) {
    const resolvedOrigin = normalizeOrigin(origin);
    if (!resolvedOrigin) throw new Error('Invalid Google Scholar mirror origin.');
    const startValue = Number.isFinite(start) ? Math.max(0, Math.trunc(start)) : 0;
    const params = new URLSearchParams();
    params.set('hl', 'zh-CN');
    params.set('q', query ?? '');
    params.set('start', String(startValue));

    if (Number.isFinite(yearFrom)) params.set('as_ylo', String(yearFrom));
    if (Number.isFinite(yearTo)) params.set('as_yhi', String(yearTo));
    if (sortMode === 'newest') params.set('scisbd', '1');

    return resolvedOrigin + '/scholar?' + params.toString();
}

function scholarRefPageURL(id, origin = getCurrentScholarOrigin()) {
    const resolvedOrigin = normalizeOrigin(origin);
    if (!resolvedOrigin) throw new Error('Invalid Google Scholar mirror origin.');
    const params = new URLSearchParams({
        q: 'info:' + id + ':scholar.google.com/',
        output: 'cite',
        scirp: '1',
        hl: 'zh-CN'
    });
    return resolvedOrigin + '/scholar?' + params.toString();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isLikelyScholarVerificationPage(html, doc) {
    if (doc?.querySelector?.('form#gs_captcha_f, input[name="captcha"], #captcha, .recaptcha, .g-recaptcha')) return true;
    return /unusual traffic|not a robot|verify you are|gs_captcha|g-recaptcha/i.test(html);
}

function scholarVerificationError(verificationUrl) {
    const error = new Error('Google Scholar requires verification. Open the verification link, then retry.');
    error.verificationUrl = verificationUrl;
    return error;
}

function parseGoogleScholarSearchResults(html, origin = getCurrentScholarOrigin()) {
    const resolvedOrigin = normalizeOrigin(origin);
    if (!resolvedOrigin) throw new Error('Invalid Google Scholar mirror origin.');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (isLikelyScholarVerificationPage(html, doc)) {
        throw scholarVerificationError(resolvedOrigin);
    }

    const results = [];
    for (const article of doc.querySelectorAll('div[data-cid]')) {
        const cid = article.getAttribute('data-cid') || '';
        if (!cid) continue;
        const heading = article.querySelector('h3');
        const title = heading?.textContent?.trim().replace(/^\[(?:PDF|HTML|BOOK|CITATION)\]\s*/i, '') ?? '';
        const author = article.querySelector('div.gs_a')?.textContent?.trim() ?? '';
        if (!title) continue;
        let publicationURL = '';
        const href = heading?.querySelector('a[href]')?.getAttribute('href');
        if (href) {
            try {
                const url = new URL(href, resolvedOrigin);
                if (/^https?:$/.test(url.protocol)) publicationURL = url.href;
            } catch {
                // A malformed optional publication link does not invalidate the result.
            }
        }
        results.push({ id: cid, title, author, url: publicationURL, origin: resolvedOrigin });
    }
    return results;
}

async function fetchScholarSearchPage(query, start, options = {}) {
    const url = scholarURLWithStart(query, start, options);
    return requestText(url, { verificationUrl: url });
}

async function getArticleIDListGoogleScholar(query, resultCount, options = {}) {
    const maxResults = Number.parseInt(resultCount, 10) || 5;
    const desired = Math.max(1, Math.min(maxResults, 50));
    // A later mirror selection must not change pagination or these results' export source.
    const origin = normalizeOrigin(options.origin ?? getCurrentScholarOrigin());
    if (!origin) throw new Error('Invalid Google Scholar mirror origin.');
    const searchOptions = { ...options, origin };
    const seen = new Set();
    const collected = [];

    const maxRequests = Math.min(10, Math.ceil(desired / 10) + 2);
    let start = 0;
    for (let requestIndex = 0; requestIndex < maxRequests && collected.length < desired; requestIndex++) {
        const html = await fetchScholarSearchPage(query, start, searchOptions);
        const pageResults = parseGoogleScholarSearchResults(html, origin);
        if (pageResults.length === 0) break;

        let added = 0;
        for (const item of pageResults) {
            if (seen.has(item.id)) continue;
            seen.add(item.id);
            collected.push(item);
            added++;
            if (collected.length >= desired) break;
        }
        if (!added || collected.length >= desired) break;
        start += 10;
        await sleep(300);
    }
    return collected;
}

async function getRefPageGoogleScholar(id, origin = getCurrentScholarOrigin()) {
    const url = scholarRefPageURL(id, origin);
    return requestText(url, { verificationUrl: url });
}

async function getBibTexGoogleScholar(id, origin = getCurrentScholarOrigin()) {
    const resolvedOrigin = normalizeOrigin(origin);
    if (!resolvedOrigin) throw new Error('Invalid Google Scholar mirror origin.');
    const citeURL = scholarRefPageURL(id, resolvedOrigin);
    const page = await getRefPageGoogleScholar(id, resolvedOrigin);
    const doc = new DOMParser().parseFromString(page, 'text/html');
    if (isLikelyScholarVerificationPage(page, doc)) throw scholarVerificationError(citeURL);

    const bibtexAnchor = Array.from(doc.querySelectorAll('a.gs_citi, a[href*="scholar.bib"]')).find(anchor =>
        /\bBibTeX\b/i.test(anchor.textContent ?? '') || /\/scholar\.bib(?:[?#]|$)/i.test(anchor.getAttribute('href') ?? '')
    );
    if (!bibtexAnchor) {
        throw new Error('Google Scholar did not provide a BibTeX export link. Try another result or mirror.');
    }
    const bibtexURL = new URL(bibtexAnchor.getAttribute('href'), citeURL);
    if (bibtexURL.protocol !== 'https:') throw new Error('Google Scholar returned an invalid BibTeX export URL.');
    return validateBibTeX(await requestText(bibtexURL.href, { verificationUrl: citeURL }));
}
