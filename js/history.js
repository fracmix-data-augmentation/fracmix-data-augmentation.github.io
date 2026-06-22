/* =====================================================
   S2-FracMix — Interactive Bibliography (history.html)
   Fetches and parses resource/data_augmentation_history.bib live
   on every page load — edit the .bib file and refresh to see
   changes. Stats + 3 clickable charts + searchable/sortable/
   paginated table + click-a-row paper detail modal.

   NOTE: fetch() of a local file is blocked by browsers under the
   file:// protocol (CORS security restriction) — this page must
   be served over http/https (e.g. `python3 -m http.server`).
   If the fetch fails, a clear message is shown instead of a
   silent/broken page.
   ===================================================== */

document.addEventListener('DOMContentLoaded', () => {
  /* ── BibTeX copy buttons (Citation section — one per paper) ── */
  document.querySelectorAll('.bibtex-wrap').forEach(wrap => {
    const btn = wrap.querySelector('.copy-btn');
    const code = wrap.querySelector('pre');
    if (!btn || !code) return;
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(code.textContent).then(() => {
        btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        setTimeout(() => { btn.innerHTML = '<i class="far fa-copy"></i> Copy'; }, 2000);
      }).catch(() => {});
    });
  });

  const tableBody = document.getElementById('historyTableBody');
  if (!tableBody) return;

  const BIB_PATH = 'resource/data_augmentation_history.bib';

  function scholar(title) {
    return 'https://scholar.google.com/scholar?q=' + encodeURIComponent(title);
  }

  /* ── Minimal LaTeX-escape cleanup (common accents + braces) ── */
  const ACCENT_MAP = {
    "'a": 'á', "'e": 'é', "'i": 'í', "'o": 'ó', "'u": 'ú', "'y": 'ý', "'n": 'ń', "'c": 'ć', "'s": 'ś', "'z": 'ź',
    "'A": 'Á', "'E": 'É', "'I": 'Í', "'O": 'Ó', "'U": 'Ú',
    '`a': 'à', '`e': 'è', '`i': 'ì', '`o': 'ò', '`u': 'ù',
    '^a': 'â', '^e': 'ê', '^i': 'î', '^o': 'ô', '^u': 'û',
    '~n': 'ñ', '~a': 'ã', '~o': 'õ',
    '"a': 'ä', '"e': 'ë', '"o': 'ö', '"u': 'ü',
  };
  function cleanLatex(s) {
    if (!s) return s;
    let out = String(s);
    out = out.replace(/\{?\\([`'^"~])\{?([a-zA-Z])\}?\}?/g, (m, acc, ch) => ACCENT_MAP[acc + ch] || ch);
    out = out.replace(/\{?\\v\{?([a-zA-Z])\}?\}?/g, '$1');
    out = out.replace(/\\&/g, '&').replace(/\\%/g, '%');
    out = out.replace(/\\url\{[^}]*\}/g, '');
    out = out.replace(/[{}]/g, '');
    out = out.replace(/--/g, '–');
    out = out.replace(/\s+/g, ' ').trim();
    return out;
  }

  /* ── BibTeX parsing ── */
  function splitBibEntries(text) {
    // Drop full-line comments (%...) before scanning for entries.
    text = text.split('\n').filter(line => !/^\s*%/.test(line)).join('\n');
    const entries = [];
    let i = 0;
    while (i < text.length) {
      const atIdx = text.indexOf('@', i);
      if (atIdx === -1) break;
      const braceStart = text.indexOf('{', atIdx);
      if (braceStart === -1) break;
      let depth = 1, j = braceStart + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') depth--;
        j++;
      }
      entries.push(text.slice(atIdx, j));
      i = j;
    }
    return entries;
  }

  function parseField(body, fieldName) {
    const braceRe = new RegExp(fieldName + '\\s*=\\s*\\{([^{}]*(?:\\{[^{}]*\\}[^{}]*)*)\\}', 'i');
    let m = body.match(braceRe);
    if (m) return m[1];
    const quoteRe = new RegExp(fieldName + '\\s*=\\s*"([^"]*)"', 'i');
    m = body.match(quoteRe);
    if (m) return m[1];
    const bareRe = new RegExp(fieldName + '\\s*=\\s*([A-Za-z][A-Za-z0-9_]*)\\s*,', 'i');
    m = body.match(bareRe);
    if (m) return m[1];
    return null;
  }

  /* ── Venue normalization ── */
  // Real .bib files spell out the same venue many different ways
  // ("IEEE/CVF Conference on Computer Vision and Pattern Recognition",
  // "Proceedings of the IEEE conference on computer vision and pattern
  // recognition", "computer vision and pattern recognition", etc.). Left
  // as-is, these (a) overflow table cells and chart labels, and (b) get
  // counted as different venues in the Top Venues chart even though
  // they're the same conference. Normalize to a short canonical form.
  const KNOWN_ABBRS = ['CVPRW', 'CVPR', 'ICCV', 'ECCV', 'ICLR', 'ICML', 'NeurIPS', 'NIPS', 'AAAI',
    'EMNLP', 'NAACL', 'ICDAR', 'WACV', 'BMVC', 'ICASSP', 'ICME', 'KDD', 'UAI', 'COLING', 'ACML',
    'IROS', 'ICPR', 'MICCAI', 'SIGIR', 'ICB', 'TKDE', 'IJCAI', 'ACCV', 'WWW', 'STOC'];
  const VENUE_PATTERNS = [
    [/computer vision and pattern recognition workshops?/i, 'CVPRW'],
    [/computer vision and pattern recognition/i, 'CVPR'],
    [/international conference on computer vision/i, 'ICCV'],
    [/european conference on computer vision/i, 'ECCV'],
    [/international conference on learning representations/i, 'ICLR'],
    [/international conference on machine learning/i, 'ICML'],
    [/neural information processing systems/i, 'NeurIPS'],
    [/aaai conference on artificial intelligence/i, 'AAAI'],
    [/findings of the association for computational linguistics/i, 'ACL Findings'],
    [/findings of empirical methods in natural language processing/i, 'EMNLP Findings'],
    [/annual meeting of the association for computational linguistics/i, 'ACL'],
    [/empirical methods in natural language processing/i, 'EMNLP'],
    [/north american chapter of the association for computational linguistics/i, 'NAACL'],
    [/international conference on document analysis and recognition/i, 'ICDAR'],
    [/winter conference on applications of computer vision/i, 'WACV'],
    [/british machine vision conference/i, 'BMVC'],
    [/acoustics,?\s*speech and signal processing/i, 'ICASSP'],
    [/international conference on multimedia and expo/i, 'ICME'],
    [/knowledge discovery and data mining/i, 'KDD'],
    [/uncertainty in artificial intelligence/i, 'UAI'],
    [/international conference on computational linguistics/i, 'COLING'],
    [/asian conference on machine learning/i, 'ACML'],
    [/intelligent robots and systems/i, 'IROS'],
    [/international conference on pattern recognition/i, 'ICPR'],
    [/medical image computing and computer-assisted intervention/i, 'MICCAI'],
    [/research and development in information retrieval/i, 'SIGIR'],
    [/international conference on biometrics/i, 'ICB'],
    [/international conference on multimedia\b/i, 'ACM MM'],
    [/the web conference/i, 'WWW'],
    [/theory of computing/i, 'STOC'],
  ];
  function normalizeVenue(raw) {
    if (!raw) return '—';
    const cleaned = raw.replace(/^(proceedings of the|proceedings of|the)\s+/i, '').trim();
    for (const abbr of KNOWN_ABBRS) {
      const re = new RegExp('(?:^|[^a-zA-Z])' + abbr.replace(/[^a-zA-Z0-9]/g, '\\$&') + '(?:[^a-zA-Z]|$)', 'i');
      if (re.test(' ' + cleaned + ' ')) return abbr === 'NIPS' ? 'NeurIPS' : abbr;
    }
    for (const [pattern, abbr] of VENUE_PATTERNS) {
      if (pattern.test(cleaned)) return abbr;
    }
    if (/^arxiv/i.test(cleaned)) return 'arXiv';
    return cleaned;
  }

  function parseBibtex(text) {
    const out = [];
    const skipped = [];
    splitBibEntries(text).forEach(raw => {
      const typeMatch = raw.match(/^@(\w+)\s*\{/);
      if (!typeMatch) return;
      const entryType = typeMatch[1].toLowerCase();
      const body = raw.slice(raw.indexOf('{') + 1);
      const keyMatch = raw.match(/^@\w+\{\s*([^,]+),/);
      const key = keyMatch ? keyMatch[1].trim() : '(no key)';

      const titleRaw = parseField(body, 'title');
      if (!titleRaw) {
        skipped.push({ key, reason: 'no title field' });
        return;
      }
      const title = cleanLatex(titleRaw);

      const authorRaw = parseField(body, 'author');
      const authors = authorRaw ? cleanLatex(authorRaw) : 'Unknown';

      const yearRaw = parseField(body, 'year');
      let year = yearRaw ? parseInt(yearRaw, 10) : null;
      if (!year || isNaN(year)) {
        // Fall back to the 4-digit year conventionally embedded in the
        // bibtex key itself (e.g. "islam2025context" -> 2025). This is
        // what saved the "Context-Guided Responsible Data Augmentation"
        // entry, which has no year={} field at all.
        const keyYearMatch = key.match(/(\d{4})/);
        if (keyYearMatch) year = parseInt(keyYearMatch[1], 10);
      }
      if (!year || isNaN(year)) {
        skipped.push({ key, reason: 'no year field and none found in key', title });
        return;
      }

      const venueRaw = parseField(body, 'journal') || parseField(body, 'booktitle') || parseField(body, 'publisher') || parseField(body, 'howpublished');
      const venue = venueRaw ? normalizeVenue(cleanLatex(venueRaw)) : '—';

      const urlRaw = parseField(body, 'url');
      const noteRaw = parseField(body, 'note');
      const isOurs = !!(noteRaw && /ours/i.test(noteRaw));

      let type;
      if (entryType === 'article') type = 'Article';
      else if (entryType === 'inproceedings') type = 'Inproceedings';
      else if (entryType === 'incollection') type = 'Incollection';
      else if (entryType === 'misc' || entryType === 'online') type = 'Misc';
      else type = entryType.charAt(0).toUpperCase() + entryType.slice(1);

      out.push({
        year, title, authors, venue, type,
        url: urlRaw ? urlRaw.trim() : (isOurs ? null : scholar(title)),
        isOurs,
      });
    });

    if (skipped.length > 0) {
      console.warn(`Skipped ${skipped.length} bib entr${skipped.length === 1 ? 'y' : 'ies'} (missing required fields):`, skipped);
    }
    parseBibtex.lastSkipped = skipped;
    return out;
  }

  /* Dedupe by normalized title — first occurrence wins. As more .bib
     entries get pasted in over time, any repeated title (even with a
     different key, different casing, or different punctuation)
     collapses to a single row automatically. */
  function dedupeByTitle(list) {
    const seen = new Set();
    const result = [];
    list.forEach(paper => {
      const norm = paper.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!seen.has(norm)) { seen.add(norm); result.push(paper); }
    });
    return result;
  }

  /* ── Author display helper ── */
  function firstAuthorEtAl(authorsStr) {
    if (!authorsStr) return 'Unknown';
    const parts = authorsStr.split(' and ').map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return 'Unknown';
    const first = parts[0];
    let surname;
    if (first.includes(',')) {
      surname = first.split(',')[0].trim();
    } else {
      const words = first.split(/\s+/);
      surname = words[words.length - 1];
    }
    return parts.length > 1 ? `${surname} et al.` : surname;
  }

  /* ── State ── */
  let HISTORY_DATA = [];
  let state = { query: '', type: '', year: '', venue: '', author: '', sortKey: 'year', sortDir: 'desc', page: 1, pageSize: 50 };

  function showLoadError(message) {
    const subtitleEl = document.getElementById('historySubtitle');
    if (subtitleEl) subtitleEl.textContent = '';
    const noResultsEl = document.getElementById('historyNoResults');
    const tableEl = document.getElementById('historyTable');
    if (tableEl) tableEl.style.display = 'none';
    if (noResultsEl) {
      noResultsEl.innerHTML = `<i class="fas fa-triangle-exclamation" style="color:#f59e0b;"></i><br>${message}`;
      noResultsEl.style.display = 'block';
    }
  }

  /* ── Stats ── */
  function animateCount(el, target) {
    if (!el) return;
    const duration = 900, start = performance.now();
    function step(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(eased * target);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function renderStats() {
    const years = HISTORY_DATA.map(p => p.year);
    const minYear = Math.min(...years), maxYear = Math.max(...years);
    const types = new Set(HISTORY_DATA.map(p => p.type));
    const since2020 = HISTORY_DATA.filter(p => p.year >= 2020).length;
    animateCount(document.getElementById('statPapers'), HISTORY_DATA.length);
    animateCount(document.getElementById('statTypes'), types.size);
    animateCount(document.getElementById('statRecent'), since2020);
    const spanEl = document.getElementById('statSpan');
    if (spanEl) spanEl.textContent = (maxYear - minYear) + ' yrs';
  }

  function populateFilters() {
    const typeSelect = document.getElementById('historyTypeFilter');
    const yearSelect = document.getElementById('historyYearFilter');
    if (!typeSelect || !yearSelect) return;
    typeSelect.innerHTML = '<option value="">All Types</option>';
    yearSelect.innerHTML = '<option value="">All Years</option>';
    [...new Set(HISTORY_DATA.map(p => p.type))].sort().forEach(t => {
      const opt = document.createElement('option'); opt.value = t; opt.textContent = t;
      typeSelect.appendChild(opt);
    });
    [...new Set(HISTORY_DATA.map(p => p.year))].sort((a, b) => b - a).forEach(y => {
      const opt = document.createElement('option'); opt.value = y; opt.textContent = y;
      yearSelect.appendChild(opt);
    });
  }

  function getFilteredSorted() {
    const q = state.query.trim().toLowerCase();
    let rows = HISTORY_DATA.filter(p => {
      if (state.type && p.type !== state.type) return false;
      if (state.year && String(p.year) !== state.year) return false;
      if (state.venue && p.venue !== state.venue) return false;
      if (state.author && !p.authors.toLowerCase().includes(state.author.toLowerCase())) return false;
      if (q) {
        const hay = `${p.title} ${p.authors} ${p.venue} ${p.year} ${p.type}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    rows = rows.slice().sort((a, b) => {
      let av = a[state.sortKey], bv = b[state.sortKey];
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return state.sortDir === 'asc' ? -1 : 1;
      if (av > bv) return state.sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return rows;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function toBibtex(p) {
    const key = (firstAuthorEtAl(p.authors).split(' ')[0] || 'ref').replace(/[^a-zA-Z]/g, '').toLowerCase() + p.year;
    const entryType = p.type === 'Article' ? 'article' : 'inproceedings';
    const venueField = entryType === 'article' ? 'journal' : 'booktitle';
    return `@${entryType}{${key},\n  title     = {${p.title}},\n  author    = {${p.authors}},\n  ${venueField} = {${p.venue}},\n  year      = {${p.year}}\n}`;
  }

  function rowHtml(p) {
    return `
      <tr class="${p.isOurs ? 'ours-row' : ''}" data-idx="${HISTORY_DATA.indexOf(p)}">
        <td class="history-table-title">${escapeHtml(p.title)}${p.isOurs ? '<span class="ours-badge">Ours</span>' : ''}</td>
        <td>${escapeHtml(firstAuthorEtAl(p.authors))}</td>
        <td><em>${escapeHtml(p.venue)}</em></td>
        <td>${p.year}</td>
        <td><span class="history-type-badge">${escapeHtml(p.type)}</span></td>
        <td class="history-actions-cell">
          <button class="history-cite-btn" data-idx="${HISTORY_DATA.indexOf(p)}" title="Copy BibTeX citation"><i class="far fa-copy"></i> Cite</button>
        </td>
      </tr>
    `;
  }

  function openPaperModal(p) {
    const overlay = document.getElementById('paperModalOverlay');
    if (!overlay) return;
    document.getElementById('paperModalTitle').textContent = p.title;
    document.getElementById('paperModalAuthors').textContent = p.authors;
    document.getElementById('paperModalVenue').textContent = `${p.venue} · ${p.year}`;
    const link = document.getElementById('paperModalLink');
    const unavailable = document.getElementById('paperModalUnavailable');
    if (p.url) {
      link.href = p.url; link.style.display = ''; unavailable.style.display = 'none';
    } else {
      link.style.display = 'none'; unavailable.style.display = 'block';
    }
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closePaperModal() {
    const overlay = document.getElementById('paperModalOverlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  function renderTable() {
    const all = getFilteredSorted();
    const totalPages = Math.max(1, Math.ceil(all.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.pageSize;
    const pageRows = all.slice(start, start + state.pageSize);

    const tableEl = document.getElementById('historyTable');
    const noResultsEl = document.getElementById('historyNoResults');
    const countEl = document.getElementById('historyCount');
    const subtitleEl = document.getElementById('historySubtitle');
    const paginationEl = document.getElementById('historyPagination');

    if (all.length === 0) {
      tableBody.innerHTML = '';
      if (tableEl) tableEl.style.display = 'none';
      if (noResultsEl) { noResultsEl.textContent = 'No papers match your search.'; noResultsEl.style.display = 'block'; }
    } else {
      tableBody.innerHTML = pageRows.map(rowHtml).join('');
      if (tableEl) tableEl.style.display = '';
      if (noResultsEl) noResultsEl.style.display = 'none';
    }

    if (countEl) {
      const from = all.length === 0 ? 0 : start + 1;
      const to = Math.min(start + state.pageSize, all.length);
      countEl.textContent = `Showing ${from}-${to} of ${all.length} papers`;
    }
    if (subtitleEl) {
      subtitleEl.textContent = `Search, filter, and sort ${HISTORY_DATA.length} papers on data augmentation. Click column headers to sort, or click a row for details.`;
    }

    document.querySelectorAll('.sortable').forEach(th => {
      const arrow = th.querySelector('.sort-arrow');
      if (!arrow) return;
      arrow.textContent = th.dataset.sort === state.sortKey ? (state.sortDir === 'asc' ? '↑' : '↓') : '';
    });

    if (paginationEl) {
      if (totalPages <= 1) {
        paginationEl.innerHTML = '';
      } else {
        paginationEl.innerHTML = `
          <button class="history-page-btn" id="historyFirstPage" ${state.page === 1 ? 'disabled' : ''} title="First page"><i class="fas fa-angles-left"></i></button>
          <button class="history-page-btn" id="historyPrevPage" ${state.page === 1 ? 'disabled' : ''} title="Previous"><i class="fas fa-chevron-left"></i></button>
          <span class="history-page-indicator">Page ${state.page} of ${totalPages}</span>
          <button class="history-page-btn" id="historyNextPage" ${state.page === totalPages ? 'disabled' : ''} title="Next"><i class="fas fa-chevron-right"></i></button>
          <button class="history-page-btn" id="historyLastPage" ${state.page === totalPages ? 'disabled' : ''} title="Last page"><i class="fas fa-angles-right"></i></button>
        `;
        const wire = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
        wire('historyFirstPage', () => { state.page = 1; renderTable(); });
        wire('historyPrevPage', () => { state.page--; renderTable(); });
        wire('historyNextPage', () => { state.page++; renderTable(); });
        wire('historyLastPage', () => { state.page = totalPages; renderTable(); });
      }
    }

    document.querySelectorAll('.history-cite-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = HISTORY_DATA[Number(btn.dataset.idx)];
        if (!p) return;
        const bib = toBibtex(p);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(bib).then(() => {
            btn.innerHTML = '<i class="fas fa-check"></i> Copied';
            setTimeout(() => { btn.innerHTML = '<i class="far fa-copy"></i> Cite'; }, 1500);
          }).catch(() => {});
        }
      });
    });

    tableBody.querySelectorAll('tr[data-idx]').forEach(tr => {
      tr.addEventListener('click', () => {
        const p = HISTORY_DATA[Number(tr.dataset.idx)];
        if (p) openPaperModal(p);
      });
    });
  }

  function renderCharts() {
    try {
      if (typeof Chart === 'undefined') throw new Error('Chart.js did not load');

      const yearCounts = {};
      HISTORY_DATA.forEach(p => { yearCounts[p.year] = (yearCounts[p.year] || 0) + 1; });
      const yearOrder = Object.keys(yearCounts).map(Number).sort((a, b) => a - b);
      const yearLabels = yearOrder.map(String);
      const yearValues = yearOrder.map(y => yearCounts[y]);

      const yearCanvas = document.getElementById('historyYearChart');
      if (yearCanvas) {
        const chart = new Chart(yearCanvas, {
          type: 'bar',
          data: { labels: yearLabels, datasets: [{ data: yearValues, backgroundColor: '#7c3aed', borderRadius: 4 }] },
          options: {
            responsive: true, maintainAspectRatio: false,
            animation: { duration: 800, easing: 'easeOutQuart' },
            plugins: { legend: { display: false } },
            onClick: (evt) => {
              const pts = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
              if (pts.length) {
                const year = yearLabels[pts[0].index];
                const yearSelect = document.getElementById('historyYearFilter');
                if (yearSelect) { yearSelect.value = year; state.year = year; state.page = 1; renderTable(); }
              }
            },
            scales: {
              y: { beginAtZero: true, ticks: { stepSize: 1, color: '#6b7280' }, grid: { color: '#f3f4f6' } },
              x: { ticks: { color: '#6b7280', font: { size: 9 }, maxRotation: 60, minRotation: 60 }, grid: { display: false } }
            }
          }
        });
      }

      const typeCounts = {};
      HISTORY_DATA.forEach(p => { typeCounts[p.type] = (typeCounts[p.type] || 0) + 1; });
      const typeLabels = Object.keys(typeCounts);
      const typeValues = typeLabels.map(k => typeCounts[k]);

      const typeCanvas = document.getElementById('historyTypeChart');
      if (typeCanvas) {
        const chart = new Chart(typeCanvas, {
          type: 'doughnut',
          data: { labels: typeLabels, datasets: [{ data: typeValues, backgroundColor: ['#7c3aed', '#a78bfa', '#c4b5fd', '#ddd6fe', '#6366f1'], borderWidth: 2, borderColor: '#fff' }] },
          options: {
            responsive: true, maintainAspectRatio: false,
            animation: { duration: 800, easing: 'easeOutQuart' },
            plugins: { legend: { position: 'bottom', labels: { color: '#4b5563', font: { size: 10 }, boxWidth: 10, padding: 8 } } },
            onClick: (evt) => {
              const pts = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
              if (pts.length) {
                const type = typeLabels[pts[0].index];
                const typeSelect = document.getElementById('historyTypeFilter');
                if (typeSelect) { typeSelect.value = type; state.type = type; state.page = 1; renderTable(); }
              }
            }
          }
        });
      }

      const venueCounts = {};
      HISTORY_DATA.forEach(p => { venueCounts[p.venue] = (venueCounts[p.venue] || 0) + 1; });
      const topVenues = Object.keys(venueCounts).map(v => ({ venue: v, count: venueCounts[v] })).sort((a, b) => b.count - a.count).slice(0, 8);
      const venueLabels = topVenues.map(v => v.venue);
      const venueValues = topVenues.map(v => v.count);

      const venueCanvas = document.getElementById('historyVenueChart');
      if (venueCanvas) {
        const chart = new Chart(venueCanvas, {
          type: 'bar',
          data: { labels: venueLabels, datasets: [{ data: venueValues, backgroundColor: '#4f46e5', borderRadius: 4 }] },
          options: {
            indexAxis: 'y',
            responsive: true, maintainAspectRatio: false,
            animation: { duration: 800, easing: 'easeOutQuart' },
            plugins: { legend: { display: false } },
            onClick: (evt) => {
              const pts = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
              if (pts.length) {
                const venue = venueLabels[pts[0].index];
                const searchInput = document.getElementById('historySearch');
                if (searchInput) { searchInput.value = venue; state.query = venue; state.page = 1; renderTable(); }
              }
            },
            scales: {
              x: { beginAtZero: true, ticks: { stepSize: 1, color: '#6b7280' }, grid: { color: '#f3f4f6' } },
              y: { ticks: { color: '#6b7280', font: { size: 9.5 } }, grid: { display: false } }
            }
          }
        });
      }
    } catch (err) {
      console.error('Chart render failed:', err);
    }
  }

  function wireControls() {
    const searchInput = document.getElementById('historySearch');
    const typeSelect = document.getElementById('historyTypeFilter');
    const yearSelect = document.getElementById('historyYearFilter');
    const clearBtn = document.getElementById('historyClear');
    const pageSizeSelect = document.getElementById('historyPageSize');
    const modalClose = document.getElementById('paperModalClose');
    const modalOverlay = document.getElementById('paperModalOverlay');

    if (searchInput) searchInput.addEventListener('input', () => { state.query = searchInput.value; state.page = 1; renderTable(); });
    if (typeSelect) typeSelect.addEventListener('change', () => { state.type = typeSelect.value; state.venue = ''; state.page = 1; renderTable(); });
    if (yearSelect) yearSelect.addEventListener('change', () => { state.year = yearSelect.value; state.page = 1; renderTable(); });
    if (pageSizeSelect) pageSizeSelect.addEventListener('change', () => { state.pageSize = Number(pageSizeSelect.value); state.page = 1; renderTable(); });
    if (clearBtn) clearBtn.addEventListener('click', () => {
      state = { query: '', type: '', year: '', venue: '', author: '', sortKey: 'year', sortDir: 'desc', page: 1, pageSize: state.pageSize };
      if (searchInput) searchInput.value = '';
      if (typeSelect) typeSelect.value = '';
      if (yearSelect) yearSelect.value = '';
      renderTable();
    });
    if (modalClose) modalClose.addEventListener('click', closePaperModal);
    if (modalOverlay) modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closePaperModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePaperModal(); });

    document.querySelectorAll('.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sortKey = key; state.sortDir = 'asc'; }
        renderTable();
      });
    });
  }

  function finishLoading(text, source) {
    const parsed = parseBibtex(text);
    const skipped = parseBibtex.lastSkipped || [];
    HISTORY_DATA = dedupeByTitle(parsed);
    if (HISTORY_DATA.length === 0) {
      showLoadError('The bibliography loaded but no valid entries were found. Check that each entry has a title and year field.');
      return;
    }
    if (source === 'inline') {
      console.info('Loaded bibliography from the embedded fallback copy (fetch() of the live .bib file was blocked — this is normal when opening the page via file://). To pick up brand-new edits without re-syncing this fallback, serve the folder over http(s) instead, e.g. `python3 -m http.server`.');
    }

    const skippedNoteEl = document.getElementById('historySkippedNote');
    if (skippedNoteEl) {
      if (skipped.length > 0) {
        const names = skipped.map(s => s.title || s.key).slice(0, 5).join(', ');
        const more = skipped.length > 5 ? ` and ${skipped.length - 5} more` : '';
        skippedNoteEl.innerHTML = `<i class="fas fa-triangle-exclamation"></i> ${skipped.length} entr${skipped.length === 1 ? 'y' : 'ies'} skipped (missing title or year): ${names}${more}. See browser console for details.`;
        skippedNoteEl.style.display = 'block';
      } else {
        skippedNoteEl.style.display = 'none';
      }
    }

    renderStats();
    populateFilters();
    wireControls();
    renderTable();
    renderCharts();
  }

  function loadFromInlineFallback() {
    const inlineEl = document.getElementById('bibDataInline');
    if (inlineEl && inlineEl.textContent.trim()) {
      finishLoading(inlineEl.textContent, 'inline');
    } else {
      showLoadError('Could not load the bibliography from the live file or the embedded fallback.');
    }
  }

  /* ── Load + parse the .bib file, then render everything ──
     Try a live fetch first (works when served over http/https, or once this
     site is deployed to GitHub Pages) — this picks up any edits made to the
     .bib file immediately. If fetch is blocked (opening the page directly via
     file:// triggers a browser security restriction that disables fetch() of
     local files — this is not something this page can override), fall back
     to the embedded copy baked into this page. */
  fetch(BIB_PATH)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    })
    .then(text => finishLoading(text, 'fetch'))
    .catch(() => loadFromInlineFallback());
});
