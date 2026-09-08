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
    <img alt="Version" src="https://img.shields.io/badge/Version-2.2.1-blue" />
  </a>
  <a href="LICENSE">
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
      <a href="#installation">Installation</a> •
      <a href="#usage">Usage</a> •
      <a href="#supported-sources">Supported Sources</a> •
      <a href="#troubleshooting">Troubleshooting</a> •
      <a href="#disclaimer">Disclaimer</a> •
      <a href="#changelog">Changelog</a> •
      <a href="#license">License</a> •
      <a href="#contributing">Contributing</a> •
      <a href="#contact">Contact</a> •
      <a href="#organizers">Organizers</a> •
      <a href="#acknowledgments">Acknowledgments</a>
    </p>
</div>

## Motivation
Writing LaTeX documents often requires including numerous academic references. Manually searching for and formatting BibTeX entries can be time-consuming. Overleaf-Bib-Helper streamlines this process by integrating search functionality from DBLP and Google Scholar right into the Overleaf interface, allowing users to quickly find and copy BibTeX entries with minimal effort.

## Features
- Original official BibTeX across AI, ML, NLP, and CV: NeurIPS, PMLR, ACL Anthology, OpenReview, CVF, ECVA/Springer, BMVC, AAAI, IJCAI, KR, ACM, and IEEE, with visible citation provenance and an explicit DBLP fallback.
- Current and legacy Overleaf toolbar support, including recovery after file and layout changes.
- Open with **Alt+Shift+B** or the Tampermonkey menu; selected text can prefill the search.
- Editable BibTeX preview, citation-key editing, copy key or `\cite{key}`, and `.bib` download.
- Ten recent queries and an in-session cache of validated BibTeX. DBLP is the default for new users; existing source preferences are preserved.
- Collapsible search options, a viewport-sized panel, and the Overleaf editor’s light/dark theme.
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
3. **Allow userscripts to run**:
   - On Chrome 138+, enable **Allow User Scripts** in Tampermonkey’s extension settings, or enable extension Developer Mode. See the [official Tampermonkey instructions](https://www.tampermonkey.net/faq.php?q=Q209).

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
8. This script includes the canonical Greasy Fork update URLs, so manually installed copies can receive updates through Tampermonkey.

## Usage
### Opening the Tool
1. Open an Overleaf project in your browser (`https://www.overleaf.com/project/*`).
2. Click **Bib** on the right of the editor toolbar. When the editor toolbar is hidden, the helper uses the project toolbar.
3. You can also press **Alt+Shift+B** or select **Open Bib Helper** from the Tampermonkey menu. Select a paper title before opening to prefill the search.


### Searching for Articles
1. **Enter a Query**: Type your search term (e.g., article title, author, or keywords) into the input field.
2. **Select Search**: Choose "DBLP" or "Google Scholar" from the "Search" dropdown.
   - **DBLP**: Best for computer science literature with structured data.
   - **Google Scholar**: Broader coverage across various fields but may require CAPTCHA verification.
   - With DBLP, **BibTeX → Official venue when available** retrieves the original export from supported official publication links. Choose **DBLP** to use DBLP's export instead.
3. **Set Result Count**: Select 5, 10, 20, or 50 results from the "Results" dropdown.
4. **Start Search**:
   - Press the **Enter** key or click the magnifying glass icon.
   - Expand **Search options** for versions, years, mirror, ordering, and result count. DBLP filtering and ordering apply to a bounded set of up to 200 candidates, not the entire database.
5. Results will appear in a scrollable list below the input field.

### Copying BibTeX
1. Click **Copy** to copy an entry, or **Preview** to inspect and edit its BibTeX.
2. In Preview, change the citation key, copy the BibTeX/key/`\cite{key}`, or download a `.bib` file.
3. Add the entry to your project’s `.bib` file before pasting its citation command into LaTeX. The helper does not automatically modify project files.
4. Copy and download validate the edited BibTeX; network errors and verification pages leave the clipboard unchanged.
5. Each result and preview identifies the BibTeX source. Official exports retain their original keys and fields. A failed official request offers **Use DBLP BibTeX**, which switches the preference and searches again; it does not silently replace or copy the citation.
6. **Open ACM preview / Open ACM & copy** opens the publisher's citation dialog in a separate tab. The helper returns the official dialog's BibTeX to Overleaf. Allow that tab to finish loading, and complete any site verification if prompted. Closing it cancels the request so you can retry.

<div align="center">
<img src="figure/ui-v2.png" width="600" alt="Bib Helper search and editable BibTeX preview" />
</div>

### Closing the Popup
- Press **Esc** or click the toolbar icon again.

## Supported Sources
- **DBLP**: Searches across venues and supplies publication links. Search results remain limited to what DBLP has indexed; this is not a full-text search of each conference website.
- **Google Scholar**: A broader academic search engine that may include more recent or interdisciplinary works but might require user verification (e.g., CAPTCHA).

For DBLP results, the default BibTeX preference reads these official exports:

| Official source | Examples | Export |
| --- | --- | --- |
| [NeurIPS proceedings](https://proceedings.neurips.cc/) | NeurIPS / NIPS | The paper page's Bibtex link, including older proceedings and newer tracks |
| [PMLR](https://proceedings.mlr.press/) | ICML, AISTATS, COLT, UAI, CoRL | Original BibTeX embedded in the paper page |
| [ACL Anthology](https://aclanthology.org/info/ids/) | ACL, EMNLP, NAACL, EACL, COLING, IJCNLP, LREC, Findings | Official `.bib` export, including legacy IDs |
| [OpenReview](https://github.com/openreview/openreview-web/blob/master/components/forum/ForumNote.js) | ICLR, COLM, and other indexed proceedings | The official API's `_bibtex`; publication status is checked |
| [CVF Open Access](https://openaccess.thecvf.com/) | CVPR, ICCV, WACV, ACCV, their workshops, ECCV 2018 | Original BibTeX block; modern and historical paper/PDF links |
| [ECVA](https://www.ecva.net/papers.php) / [Springer](https://link.springer.com/) | ECCV, ACCV, MICCAI, ECML PKDD and other Springer proceedings | Publisher BibTeX export; ECVA resolves the paper's actual Springer link |
| [BMVA / BMVC](https://www.bmva.org/bmvc) | BMVC 2023–2025 and archived 2015–2017 proceedings | Original citation block on verified paper pages |
| [AAAI OJS](https://ojs.aaai.org/) | AAAI, ICAPS, ICWSM, AIIDE, AIES, HCOMP, SoCS, AAAI-SS | The paper's actual BibTeX download link; migrated legacy pages resolve through their official DOI |
| [IJCAI](https://www.ijcai.org/proceedings/) | IJCAI proceedings from 2017 | Original per-paper BibTeX export |
| [KR](https://proceedings.kr.org/) | KR proceedings | The official paper's BibTeX link |
| [ACM Digital Library](https://dl.acm.org/) | KDD, WWW, SIGIR, CIKM, WSDM, ACM MM, AAMAS papers with ACM links | Reads the official citation dialog in a temporary publisher tab |
| [IEEE Xplore](https://ieeexplore.ieee.org/) | ICDM, ICASSP, ICIP, IJCNN, ICDE and other IEEE proceedings | Original BibTeX download; subject to publisher verification/access |

Coverage follows the publication link and available official export, not just a venue name: it does not guarantee every year, track, or paper. DOI links are recognized for supported publishers. CVF is preferred over IEEE when both identify the same result. Unsupported links, PDF-only historical proceedings, and preprints use DBLP and are labeled accordingly. BMVC years outside the verified list and pre-2017 IJCAI currently use DBLP unless another supported publisher link is available.

The helper preserves the publisher's keys, fields, and publication year, including cases where the proceedings year differs from the conference year. OpenReview notes without an official export, or marked submitted/rejected/withdrawn, are not accepted as published conference citations. Some publishers require browser verification; the error provides an official-page action and an explicit DBLP choice. IEEE's successful export format is regression-tested against its published download contract; live requests were restricted during validation, so availability cannot be guaranteed.

For ACM, the script also runs on `dl.acm.org/doi/*` solely to answer a short-lived request started from Overleaf. Normal ACM visits remain unchanged. Bibliographic fields are not reconstructed from CSL or Crossref, and no publisher renderer is bundled.

## Troubleshooting
- **Script Not Working?**
  - Allow Tampermonkey to run userscripts using **Allow User Scripts** or extension **Developer Mode**.
  - If the Bib button is missing, try **Alt+Shift+B** or the Tampermonkey menu and verify that you have v2.2.1 installed.
  - Ensure Tampermonkey is enabled and the script is active.
  - Verify you’re on an Overleaf project page.
  - Reload or reinstall from Greasy Fork.
- **No Results?**
  - Check your query for typos.
  - Ensure you have granted the plugin search permissions.
  - Try switching between DBLP and Google Scholar.
  - DBLP may also show a browser verification page. Use **Open verification page**, allow the site to complete its check, and retry.
- **Google Scholar Issues?**
  - Click **Open verification page** in the helper, complete verification in that tab, and retry; or choose **Search DBLP instead**.
  - Scholar may restrict automated requests even when its homepage loads. Switch mirrors or use the Source link to obtain the citation manually.

## Disclaimer
While Overleaf-Bib-Helper aims to provide a seamless experience, please note that it relies on external services (DBLP and Google Scholar) which may change their APIs or require user verification (e.g., CAPTCHA). Use this tool at your own discretion and always verify retrieved BibTeX entries before including them in your documents.

## Changelog
- **2026-09-07 (v2.2.1)**: Expanded original official BibTeX to CVF, ECVA/Springer, verified BMVC proceedings, AAAI-family venues, IJCAI, KR, ACM, and IEEE. Added DOI routing, publisher identity validation, legacy AAAI migration, and a cancellable ACM citation-dialog bridge. Added provider, historical-format, and cross-tab lifecycle regression tests. v2.2.0 builds were used only for local verification.
- **2026-09-07 (v2.1.0)**: Added original official BibTeX retrieval from NeurIPS, PMLR, ACL Anthology, and OpenReview; separate search and citation-source preferences; citation provenance; explicit DBLP fallback; original-field preservation and publication/URL validation. Added official-provider and request-race regression coverage.
- **2026-09-07 (v2.0.2)**: Simplified the toolbar launcher to borderless **Bib** text, preserving keyboard focus visibility.
- **2026-09-07 (v2.0.1)**: Current toolbar compatibility and layout recovery; dependency-free startup; shortcut/menu/selection search; recent queries; BibTeX preview/edit/key/citation/download; request timeouts, HTTP/BibTeX validation, stale-search protection, pinned Scholar origins and explicit verification actions; Unicode grouping and strict Hide preprints. Added Playwright regression coverage and GitHub Actions.
- **2026-02-03**: Code cleanup, MutationObserver-based injection, expanded `@connect` for custom Scholar mirrors (v1.8).
- **2026-02-03**: Overleaf-themed UI, Google Scholar as default, grouped “Versions (n)” results, mirror selector + pagination, plus ordering & year-range filters and DBLP version preference (v1.7).
- **2025-04-10**: Added support for cn.overleaf.com and cn.overleaf.com domains (v1.2).
- **2025-04-09**: Initial release with basic functionality for DBLP and Google Scholar (v1.1).

## License
This project is licensed under the MIT License - see [LICENSE](LICENSE) for details.

## Contributing
Feel free to fork the [GitHub repository](https://github.com/MLNLP-World/Overleaf-Bib-Helper), submit issues, or create pull requests with improvements!

## Development and validation
The userscript remains a single file with no build step. Tests run in an isolated browser with mocked network responses and do not access real paper projects.

```sh
npm ci
npx playwright install chromium
npm test
```

To reuse locally installed Google Chrome, run `PW_USE_SYSTEM_CHROME=1 npm test`. GitHub Actions runs the same suite on pushes and pull requests.

## Contact
Please email [Xunjian Yin](mailto:xjyin@pku.edu.cn) or create Github issues here if you have any questions or suggestions.

## Organizers
<a href="https://github.com/Arvid-pku">  <img src="https://avatars.githubusercontent.com/u/53811705?s=96&v=4"  width="55" > </a>

## Acknowledgments
Inspired by similar tools and the academic community’s need for efficient reference management.
