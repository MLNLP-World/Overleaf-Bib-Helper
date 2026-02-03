<<<<<<< HEAD
# Repository Migration Notice
This repository has been migrated to the MLNLP community. The new repository address is: [https://github.com/MLNLP-World/Overleaf-Bib-Helper](https://github.com/MLNLP-World/Overleaf-Bib-Helper).

Please visit the new repository to obtain the latest code updates, submit issues, and contribute code. Thank you for your support and understanding! 
=======
<div align="center">
  <img src="figure/logo-v2.svg" width="50" />
  <h1>Overleaf-Bib-Helper</h1>
</div>

<p align="center">
  A UserScript to enhance Overleaf by allowing article searches and BibTeX retrieval from DBLP and Google Scholar directly within the Overleaf editor.
</p>

<p align="center">
  <a href="https://greasyfork.org/zh-CN/scripts/532304-overleaf-bib-helper">
    <img alt="Install from Greasy Fork" src="https://img.shields.io/badge/Install-Greasy_Fork-blue" />
  </a>
  <a href="https://github.com/MLNLP-World/Overleaf-Bib-Helper/releases">
    <img alt="Version" src="https://img.shields.io/badge/Version-1.8-blue" />
  </a>
  <a href="https://github.com/MLNLP-World/Overleaf-Bib-Helper/blob/main/LICENSE.md">
    <img alt="License" src="https://img.shields.io/badge/License-MIT-blue" />
  </a>
  <a href="https://github.com/MLNLP-World/Overleaf-Bib-Helper/stargazers">
    <img alt="Stars" src="https://img.shields.io/github/stars/MLNLP-World/Overleaf-Bib-Helper" />
  </a>
  <a href="https://github.com/MLNLP-World/Overleaf-Bib-Helper/network/members">
    <img alt="Forks" src="https://img.shields.io/github/forks/MLNLP-World/Overleaf-Bib-Helper" />
  </a>
  <a href="https://github.com/MLNLP-World/Overleaf-Bib-Helper/issues">
    <img alt="Issues" src="https://img.shields.io/github/issues/MLNLP-World/Overleaf-Bib-Helper" />
  </a>
  <a href="https://github.com/MLNLP-World/Overleaf-Bib-Helper/pulls">
    <img alt="PRs Welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square" />
  </a>
</p>

---

<div>
<p align="center">
      <a href="README-ZH.md">中文文档</a> •
      <a href="#Installation">Installation</a> •
      <a href="#Usage">Usage</a> •
      <a href="#Supported-Sources">Supported Sources</a> •
      <a href="#Troubleshooting">Troubleshooting</a> •
      <a href="#Disclaimer">Disclaimer</a> •
      <a href="#Changelog">Changelog</a> •
      <a href="#License">License</a> •
      <a href="#Contributing">Contributing</a> •
      <a href="#Contact">Contact</a> •
      <a href="#Organizers">Organizers</a> •
      <a href="#Contributors">Contributors</a> •
      <a href="#Acknowledgments">Acknowledgments</a>
    </p>
</div>




## Motivation
Writing LaTeX documents often requires including numerous academic references. Manually searching for and formatting BibTeX entries can be time-consuming. Overleaf-Bib-Helper streamlines this process by integrating search functionality from DBLP and Google Scholar right into the Overleaf interface, allowing users to quickly find and copy BibTeX entries with minimal effort.

## Features
- Search for academic articles from DBLP or Google Scholar within Overleaf.
- Retrieve and copy BibTeX entries with a single click.
- Group same-title results into “Versions (n)” with “Copy best”.
- Prefer conference/journal (“Published”) vs arXiv/CoRR (“Preprint”) BibTeX on DBLP.
- Year-range filter and ordering controls (relevance/newest/oldest, depending on source).
- Configurable result counts (5, 10, 20, or 50 results).
- Scrollable results list for easy browsing.
- Keyboard shortcuts: Enter to search, Esc to close the popup.
- Supports multiple Google Scholar mirrors for accessibility.

## Installation
### Step 1: Install Tampermonkey
Tampermonkey is a browser extension required to run UserScripts like Overleaf-Bib-Helper. Follow these steps:
1. **Download Tampermonkey**:
   - **Chrome**: [Chrome Web Store](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - **Firefox**: [Mozilla Add-ons](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
   - **Edge**: [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/%E7%AF%A1%E6%94%B9%E7%8C%B4/iikmkjmpaadaobahmlepeloendndfphd)
   - **Safari**: [App Store](https://apps.apple.com/us/app/tampermonkey/id1482490089) (requires macOS)
2. **Enable Tampermonkey**:
   - After installation, click the Tampermonkey icon in your browser’s toolbar and ensure it’s enabled.
   - Note: 
3. **Enable Developer Mode for the Extension**:
   - For Chrome, go to the extensions page (`chrome://extensions/`) and enable Developer mode.

### Step 2: Install Overleaf-Bib-Helper
You can install the script in one of two ways:

#### Option 1: Install from Greasy Fork (Recommended)
1. Visit the [Greasy Fork page](https://greasyfork.org/zh-CN/scripts/532304-overleaf-bib-helper).
2. Click the **"Install this script"** button.
3. Tampermonkey will open a confirmation window. Click **"Install"** to add the script.
4. The script will automatically activate on Overleaf project pages (`https://www.overleaf.com/project/*`).
5. To keep the script updated, enable auto-updates in Tampermonkey settings.

#### Option 2: Install from GitHub
1. Go to the [GitHub repository](https://github.com/MLNLP-World/Overleaf-Bib-Helper).
2. Open the `Overleaf-Bib-Helper.js` file in the repository.
3. Copy the entire script content.
4. In your browser, click the Tampermonkey icon > **"Create a new script"**.
5. Paste the copied code into the editor, replacing the default template.
6. Click **File > Save** in the Tampermonkey editor.
7. The script will be active on Overleaf project pages.
8. **Note:** For manual installations from GitHub, please check the repository periodically for updates and reinstall as needed.

## Usage
### Opening the Tool
1. Open an Overleaf project in your browser (`https://www.overleaf.com/project/*`).
2. Look for a new icon in the Overleaf toolbar (a small document-like icon).
3. Click the icon to open the search popup.

<div align="center">
<img src="figure/instruction.png" width="180" />
</div>

### Searching for Articles
1. **Enter a Query**: Type your search term (e.g., article title, author, or keywords) into the input field.
2. **Select Source**: Choose "DBLP" or "Google Scholar" from the "Source" dropdown.
   - **DBLP**: Best for computer science literature with structured data.
   - **Google Scholar**: Broader coverage across various fields but may require CAPTCHA verification.
3. **Set Result Count**: Select 5, 10, 20, or 50 results from the "Results" dropdown.
4. **Start Search**:
   - Press the **Enter** key or click the magnifying glass icon.
5. Results will appear in a scrollable list below the input field.

### Copying BibTeX
1. Click on any result in the list (e.g., "Title@Author").
2. The BibTeX entry will be copied to your clipboard.
3. A notification will confirm success ("Copy successfully") or report an error ("Copy failed").

<div align="center">
<img src="figure/result.png" width="280" />
</div>

### Closing the Popup
- Press **Esc** or click the toolbar icon again.

## Supported Sources
- **DBLP**: A comprehensive computer science bibliography providing reliable BibTeX entries.
- **Google Scholar**: A broader academic search engine that may include more recent or interdisciplinary works but might require user verification (e.g., CAPTCHA).

## Troubleshooting
- **Script Not Working?**
  - Ensure your browser has **developer mode** enabled for extensions.
  - Ensure Tampermonkey is enabled and the script is active.
  - Verify you’re on an Overleaf project page.
  - Reload or reinstall from Greasy Fork.
- **No Results?**
  - Check your query for typos.
  - Ensure you have granted the plugin search permissions.
  - Try switching between DBLP and Google Scholar.
- **Google Scholar Issues?**
  - If CAPTCHA blocks access, complete it in the opened tab and retry.

## Disclaimer
While Overleaf-Bib-Helper aims to provide a seamless experience, please note that it relies on external services (DBLP and Google Scholar) which may change their APIs or require user verification (e.g., CAPTCHA). Use this tool at your own discretion and always verify retrieved BibTeX entries before including them in your documents.

## Changelog
- **2026-02-03**: Code cleanup, MutationObserver-based injection, expanded `@connect` for custom Scholar mirrors (v1.8).
- **2026-02-03**: Overleaf-themed UI, Google Scholar as default, grouped “Versions (n)” results, mirror selector + pagination, plus ordering & year-range filters and DBLP version preference (v1.7).
- **2025-04-10**: Added support for cn.overleaf.com and cn.overleaf.com domains (v1.2).
- **2025-04-09**: Initial release with basic functionality for DBLP and Google Scholar (v1.1).

## License
This project is licensed under the MIT License - see [LICENSE.md](https://github.com/MLNLP-World/Overleaf-Bib-Helper/blob/main/LICENSE.md) for details.

## Contributing
Feel free to fork the [GitHub repository](https://github.com/MLNLP-World/Overleaf-Bib-Helper), submit issues, or create pull requests with improvements! 

## Contact
Please email [Xunjian Yin](mailto:xjyin@pku.edu.cn) or create Github issues here if you have any questions or suggestions. 

## Organizers
<a href="https://github.com/Arvid-pku">  <img src="https://avatars.githubusercontent.com/u/53811705?s=96&v=4"  width="55" > </a> 

## Contributors
<a href="https://github.com/Arvid-pku">  <img src="https://avatars.githubusercontent.com/u/53811705?s=96&v=4"  width="55" > </a> 

## Acknowledgments
Inspired by similar tools and the academic community’s need for efficient reference management.
>>>>>>> adfe436 (Release v1.8: cleanup + new assets)
