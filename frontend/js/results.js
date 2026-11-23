/* results.js — logic for pages/results.html
 * Scheme matches come ONLY from CIVICASSIST_API.matchSchemes(profile).
 * Each item of data.results is { scheme, status, matchedConditions, unmatchedConditions,
 * missingInformation, reasoning }; the scheme document is in item.scheme (id: scheme._id). */
(function () {
  'use strict';

  var CA = window.CivicAssist;
  var API = window.CIVICASSIST_API;

  // TODO i18n: status labels
  var STATUS_META = {
    likely_eligible: { cls: 'badge-success', label: 'Likely eligible', rank: 0 },
    possible_match: { cls: 'badge-warning', label: 'Possible match', rank: 1 },
    not_matched: { cls: 'badge-muted', label: 'Not matched', rank: 2 },
    no_configured_rules: { cls: 'badge-muted', label: 'Eligibility rules not yet configured', rank: 3 }
  };
  // Unknown or missing status: neutral label, never a positive one.
  var UNKNOWN_META = { cls: 'badge-muted', label: 'Status not available', rank: 4 };

  var STATUS_EXPLANATION = {
    likely_eligible: 'Based on the details you entered, you are likely eligible. This is not a guarantee; confirm with the official source.',
    possible_match: 'More information is needed to confirm whether you qualify.',
    not_matched: 'Your current profile does not meet the configured eligibility rules for this scheme.',
    no_configured_rules: 'Eligibility rules for this scheme are not currently configured, so we cannot check your eligibility. Please check the official source below.'
  };

  var NOT_AVAILABLE = 'Not currently available';
  var NOT_PROVIDED = 'Not provided in scheme data';

  var dom = {};
  var results = [];
  var byId = {};
  var ready = false;

  function esc(value) {
    return CA.escapeHtml(value == null ? '' : String(value));
  }

  function asList(value) {
    return Array.isArray(value) ? value : [];
  }

  function statusMeta(status) {
    return Object.prototype.hasOwnProperty.call(STATUS_META, status) ? STATUS_META[status] : UNKNOWN_META;
  }

  function resultScheme(r) {
    return (r && r.scheme) || {};
  }

  function schemeId(r) {
    var id = resultScheme(r)._id;
    return id == null ? '' : String(id);
  }

  // Returns trimmed text, or '' for null/undefined/objects/whitespace-only values.
  function cleanText(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '';
  }

  function textOrFallback(value, fallback) {
    return esc(cleanText(value) || fallback);
  }

  function formatDate(value) {
    var d = value instanceof Date ? value : null;
    if (!d) {
      var text = cleanText(value);
      if (!text) return '';
      d = new Date(text);
    }
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString();
  }

  function dateText(value, fallback) {
    return esc(formatDate(value) || fallback);
  }

  function sectionHtml(title, body) {
    return '<h4 class="condition-title">' + esc(title) + '</h4>' + body;
  }

  function listBlock(title, items, ordered) {
    var values = asList(items).map(cleanText).filter(function (v) { return v !== ''; });
    var tag = ordered ? 'ol' : 'ul';
    var body = values.length
      ? '<' + tag + ' class="condition-list">' + values.map(function (v) {
        return '<li>' + esc(v) + '</li>';
      }).join('') + '</' + tag + '>'
      : '<p class="text-muted">' + esc(NOT_PROVIDED) + '</p>';
    return sectionHtml(title, body);
  }

  function benefitsHtml(benefits) {
    if (Array.isArray(benefits)) return listBlock('Benefits', benefits);
    return sectionHtml('Benefits', '<p>' + textOrFallback(benefits, NOT_PROVIDED) + '</p>');
  }

  function officialSourceHtml(url) {
    var text = cleanText(url);
    var body = /^https?:\/\//i.test(text)
      ? '<p><a href="' + esc(text) + '" target="_blank" rel="noopener noreferrer">' + esc(text) + '</a></p>'
      : '<p class="text-muted">' + esc(NOT_AVAILABLE) + '</p>';
    return sectionHtml('Official source', body);
  }

  function verificationText(value) {
    var v = cleanText(value);
    if (v === 'verified') return 'Verified';
    if (v === 'unverified') return 'Not yet verified against the official source';
    return v ? esc(v) : esc(NOT_AVAILABLE);
  }

  function getSavedIds() {
    var saved = CA.storage.get('saved.schemes', []);
    return Array.isArray(saved) ? saved : [];
  }

  function cardHtml(r, savedIds) {
    var scheme = resultScheme(r);
    var status = r && r.status;
    var meta = statusMeta(status);
    var explanation = Object.prototype.hasOwnProperty.call(STATUS_EXPLANATION, status)
      ? STATUS_EXPLANATION[status]
      : 'The eligibility status for this scheme is not available.';
    var note = cleanText(r && r.verificationNote);
    var id = schemeId(r);
    var isSaved = savedIds.indexOf(id) !== -1;

    return '<div class="card scheme-card">' +
      '<h3>' + textOrFallback(scheme.name, NOT_PROVIDED) + '</h3>' +
      '<span class="badge ' + meta.cls + '">' + esc(meta.label) + '</span>' +
      '<div class="scheme-meta"><span>' + textOrFallback(scheme.category, NOT_PROVIDED) + '</span></div>' +
      '<p>' + esc(explanation) + '</p>' +
      '<p>' + textOrFallback(r && r.reasoning, NOT_PROVIDED) + '</p>' +
      listBlock('Why this scheme matches you', r && r.matchedConditions) +
      listBlock('What information is missing', r && r.missingInformation) +
      listBlock('Conditions not met', r && r.unmatchedConditions) +
      listBlock('What documents you need', scheme.requiredDocuments) +
      listBlock('How to apply', scheme.applicationSteps, true) +
      benefitsHtml(scheme.benefits) +
      officialSourceHtml(scheme.officialSource) +
      sectionHtml('Verification status', '<p>' + verificationText(scheme.verificationStatus) + '</p>') +
      sectionHtml('Last verified', '<p>' + dateText(scheme.lastVerified, NOT_AVAILABLE) + '</p>') +
      sectionHtml('Deadline', '<p>' + dateText(scheme.deadline, NOT_PROVIDED) + '</p>') +
      (note ? '<p class="text-muted">' + esc(note) + '</p>' : '') +
      '<div class="scheme-actions">' +
        '<a class="btn btn-secondary btn-sm view-details-btn" data-id="' + esc(id) + '" ' +
          'href="scheme-detail.html?id=' + encodeURIComponent(id) + '">View Details</a>' +
        '<button type="button" class="btn btn-ghost btn-sm save-btn" data-id="' + esc(id) + '" ' +
          'aria-pressed="' + (isSaved ? 'true' : 'false') + '">' + (isSaved ? 'Saved' : 'Save Scheme') + '</button>' +
      '</div>' +
    '</div>';
  }

  function readFilters() {
    return {
      q: dom.search.value.trim().toLowerCase(),
      category: dom.category.value,
      sort: dom.sort.value
    };
  }

  function comparator(sort) {
    var byName = function (a, b) {
      return String(resultScheme(a).name || '').localeCompare(String(resultScheme(b).name || ''));
    };
    if (sort === 'name-asc') return byName;
    if (sort === 'name-desc') return function (a, b) { return byName(b, a); };
    return function (a, b) {
      var ra = statusMeta(a.status).rank;
      var rb = statusMeta(b.status).rank;
      return ra !== rb ? ra - rb : byName(a, b);
    };
  }

  function filterResults(f) {
    return results.filter(function (r) {
      var scheme = resultScheme(r);
      if (f.q) {
        var haystack = (String(scheme.name || '') + ' ' + String(scheme.category || '')).toLowerCase();
        if (haystack.indexOf(f.q) === -1) return false;
      }
      if (f.category && scheme.category !== f.category) return false;
      return true;
    }).sort(comparator(f.sort));
  }

  function writeUrl() {
    var params = new URLSearchParams();
    if (dom.search.value.trim()) params.set('q', dom.search.value.trim());
    if (dom.category.value) params.set('category', dom.category.value);
    if (dom.sort.value !== 'match') params.set('sort', dom.sort.value);
    var qs = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
  }

  function readUrl() {
    var params = new URLSearchParams(window.location.search);
    if (params.has('q')) dom.search.value = params.get('q');
    if (params.has('category')) dom.category.value = params.get('category');
    if (params.has('sort')) dom.sort.value = params.get('sort');
  }

  function render() {
    var list = filterResults(readFilters());
    var savedIds = getSavedIds();
    dom.grid.innerHTML = list.map(function (r) { return cardHtml(r, savedIds); }).join('');
    dom.count.textContent = list.length + ' of ' + results.length + ' schemes shown'; // TODO i18n
    dom.empty.hidden = list.length !== 0;
    writeUrl();
  }

  function applyFilters() {
    if (ready) render();
  }

  function clearFilters() {
    dom.search.value = '';
    dom.category.value = '';
    dom.sort.value = 'match';
    applyFilters();
  }

  function setLoading(on) {
    dom.loading.hidden = !on;
    dom.grid.hidden = on;
  }

  function toggleSave(btn) {
    var id = btn.getAttribute('data-id');
    var ids = getSavedIds();
    var idx = ids.indexOf(id);
    var isSaved = idx === -1;
    if (isSaved) {
      ids.push(id);
      CA.toast('success', 'Scheme saved'); // TODO i18n
    } else {
      ids.splice(idx, 1);
      CA.toast('info', 'Scheme removed from saved'); // TODO i18n
    }
    CA.storage.set('saved.schemes', ids);
    btn.setAttribute('aria-pressed', isSaved ? 'true' : 'false');
    btn.textContent = isSaved ? 'Saved' : 'Save Scheme';
  }

  function onGridClick(event) {
    var saveBtn = event.target.closest('.save-btn');
    if (saveBtn) {
      toggleSave(saveBtn);
      return;
    }
    var detailLink = event.target.closest('.view-details-btn');
    if (detailLink) {
      var result = byId[detailLink.getAttribute('data-id')];
      if (result) CA.storage.set('scheme.selected', resultScheme(result));
    }
  }

  // Inline message for an expired session; the grid stays in the DOM.
  function showAuthError() {
    var box = document.createElement('div');
    box.className = 'card';
    box.setAttribute('role', 'alert');
    box.appendChild(document.createTextNode('Your session has expired. Please sign in again. ')); // TODO i18n
    var link = document.createElement('a');
    link.href = 'login.html';
    link.textContent = 'Sign in'; // TODO i18n
    box.appendChild(link);
    dom.grid.parentNode.insertBefore(box, dom.grid);
  }

  async function loadSchemes(profile) {
    var res = null;
    setLoading(true);
    try {
      res = await API.matchSchemes(profile);
    } catch (err) {
      res = null;
      var code = err && err.code;
      if (err && err.status === 401) {
        showAuthError();
      } else if (code === 'NETWORK' || code === 'TIMEOUT') {
        CA.toast('error', CA.t('toast.networkError'));
      } else {
        CA.toast('error', 'Could not load matching schemes'); // TODO i18n
      }
    }

    var list = res && res.data && Array.isArray(res.data.results) ? res.data.results : [];
    results = list;

    byId = {};
    results.forEach(function (r) { byId[schemeId(r)] = r; });

    setLoading(false);
    ready = true;
    render();
  }

  function init() {
    dom.summary = document.getElementById('profileSummary');
    dom.search = document.getElementById('searchInput');
    dom.category = document.getElementById('categoryFilter');
    dom.sort = document.getElementById('sortSelect');
    dom.clearBtn = document.getElementById('clearFiltersBtn');
    dom.emptyClearBtn = document.getElementById('emptyClearBtn');
    dom.count = document.getElementById('resultCount');
    dom.loading = document.getElementById('loadingArea');
    dom.grid = document.getElementById('resultsGrid');
    dom.empty = document.getElementById('emptyState');
    dom.noProfile = document.getElementById('noProfile');

    dom.search.addEventListener('input', applyFilters);
    dom.category.addEventListener('change', applyFilters);
    dom.sort.addEventListener('change', applyFilters);
    dom.clearBtn.addEventListener('click', clearFilters);
    dom.emptyClearBtn.addEventListener('click', clearFilters);
    dom.grid.addEventListener('click', onGridClick);
    document.addEventListener('civicassist:langchange', applyFilters);

    var profile = CA.storage.get('profile.confirmed', null) || CA.storage.get('profile.draft', null);
    if (!profile) {
      dom.noProfile.hidden = false;
      dom.grid.hidden = true;
      dom.summary.textContent = '';
      return;
    }

    dom.summary.textContent = 'Showing schemes matched to the profile you entered.'; // TODO i18n
    readUrl();
    loadSchemes(profile);
  }

  CA.registerPage(init);
})();
