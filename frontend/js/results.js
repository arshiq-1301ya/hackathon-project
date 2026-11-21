/* results.js — logic for pages/results.html
 * Scheme data comes ONLY from CIVICASSIST_API. DEMO_SCHEMES is the sole sample
 * data and is shown only when the API returns an empty mock response. */
(function () {
  'use strict';

  var CA = window.CivicAssist;
  var API = window.CIVICASSIST_API;

  // Demonstration data only — never present as verified government data.
  var DEMO_SCHEMES = [
    {
      id: 'demo-1',
      name: 'Demonstration Scheme A — Education Support',
      description: 'Illustrative sample entry for layout testing. It is not a real government scheme.',
      state: 'Any state (demo)',
      category: 'Education',
      eligibility: 'Illustrative eligibility text: students within a demo age range.',
      matchedConditions: ['Age within demo range'],
      missingConditions: ['Income certificate (demo)'],
      status: 'POSSIBLE_MATCH',
      isDemo: true
    },
    {
      id: 'demo-2',
      name: 'Demonstration Scheme B — Livelihood Support',
      description: 'Illustrative sample entry for layout testing. It is not a real government scheme.',
      state: 'Any state (demo)',
      category: 'Livelihood',
      eligibility: 'Illustrative eligibility text: self-employed applicants (demo only).',
      matchedConditions: ['Self-employed (demo)'],
      missingConditions: [],
      status: 'LIKELY_ELIGIBLE',
      isDemo: true
    },
    {
      id: 'demo-3',
      name: 'Demonstration Scheme C — Housing Support',
      description: 'Illustrative sample entry for layout testing. It is not a real government scheme.',
      state: 'Any state (demo)',
      category: 'Housing',
      eligibility: 'Illustrative eligibility text: households without a pucca house (demo only).',
      matchedConditions: [],
      missingConditions: ['Household survey record (demo)'],
      status: 'NOT_MATCHED',
      isDemo: true
    }
  ];

  // TODO i18n: status labels
  var STATUS_META = {
    LIKELY_ELIGIBLE: { cls: 'badge-success', label: 'Likely Eligible', rank: 0 },
    POSSIBLE_MATCH: { cls: 'badge-warning', label: 'Possible Match — More Information Needed', rank: 1 },
    NOT_MATCHED: { cls: 'badge-muted', label: 'Not Matched', rank: 2 }
  };

  var dom = {};
  var schemes = [];
  var byId = {};
  var ready = false;

  function esc(value) {
    return CA.escapeHtml(value == null ? '' : String(value));
  }

  function asList(value) {
    return Array.isArray(value) ? value : [];
  }

  function statusMeta(status) {
    return STATUS_META[status] || STATUS_META.NOT_MATCHED;
  }

  function listHtml(items) {
    return asList(items).map(function (item) {
      return '<li>' + esc(item) + '</li>';
    }).join('');
  }

  function getSavedIds() {
    var saved = CA.storage.get('saved.schemes', []);
    return Array.isArray(saved) ? saved : [];
  }

  function cardHtml(s, savedIds) {
    var meta = statusMeta(s.status);
    var id = s.id == null ? '' : String(s.id);
    var isSaved = savedIds.indexOf(id) !== -1;
    var demoBadge = s.isDemo === true
      ? '<span class="badge-demo">Demonstration data</span>' // TODO i18n
      : '';

    return '<div class="card scheme-card">' +
      '<h3>' + esc(s.name) + '</h3>' +
      demoBadge +
      '<p class="text-muted">' + esc(s.description) + '</p>' +
      '<span class="badge ' + meta.cls + '">' + esc(meta.label) + '</span>' +
      '<div class="scheme-meta"><span>' + esc(s.state) + '</span><span>' + esc(s.category) + '</span></div>' +
      '<p>' + esc(s.eligibility) + '</p>' +
      '<h4 class="condition-title">Matched conditions</h4>' + // TODO i18n
      '<ul class="condition-list">' + listHtml(s.matchedConditions) + '</ul>' +
      '<h4 class="condition-title">Missing conditions</h4>' + // TODO i18n
      '<ul class="condition-list">' + listHtml(s.missingConditions) + '</ul>' +
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
      state: dom.state.value,
      category: dom.category.value,
      sort: dom.sort.value
    };
  }

  function comparator(sort) {
    var byName = function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''));
    };
    if (sort === 'name-asc') return byName;
    if (sort === 'name-desc') return function (a, b) { return byName(b, a); };
    return function (a, b) {
      var ra = statusMeta(a.status).rank;
      var rb = statusMeta(b.status).rank;
      return ra !== rb ? ra - rb : byName(a, b);
    };
  }

  function filterSchemes(f) {
    return schemes.filter(function (s) {
      if (f.q) {
        var haystack = (String(s.name || '') + ' ' + String(s.description || '')).toLowerCase();
        if (haystack.indexOf(f.q) === -1) return false;
      }
      if (f.state && s.state !== f.state) return false;
      if (f.category && s.category !== f.category) return false;
      return true;
    }).sort(comparator(f.sort));
  }

  function writeUrl() {
    var params = new URLSearchParams();
    if (dom.search.value.trim()) params.set('q', dom.search.value.trim());
    if (dom.state.value) params.set('state', dom.state.value);
    if (dom.category.value) params.set('category', dom.category.value);
    if (dom.sort.value !== 'match') params.set('sort', dom.sort.value);
    var qs = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
  }

  function readUrl() {
    var params = new URLSearchParams(window.location.search);
    if (params.has('q')) dom.search.value = params.get('q');
    if (params.has('state')) dom.state.value = params.get('state');
    if (params.has('category')) dom.category.value = params.get('category');
    if (params.has('sort')) dom.sort.value = params.get('sort');
  }

  function render() {
    var list = filterSchemes(readFilters());
    var savedIds = getSavedIds();
    dom.grid.innerHTML = list.map(function (s) { return cardHtml(s, savedIds); }).join('');
    dom.count.textContent = list.length + ' of ' + schemes.length + ' schemes shown'; // TODO i18n
    dom.empty.hidden = list.length !== 0;
    writeUrl();
  }

  function applyFilters() {
    if (ready) render();
  }

  function clearFilters() {
    dom.search.value = '';
    dom.state.value = '';
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
      var scheme = byId[detailLink.getAttribute('data-id')];
      if (scheme) CA.storage.set('scheme.selected', scheme);
    }
  }

  async function loadSchemes(profile) {
    var res = null;
    setLoading(true);
    try {
      res = await API.matchSchemes(profile);
    } catch (err) {
      CA.toast('error', CA.t('toast.networkError'));
      res = null;
    }

    var items = res && Array.isArray(res.items) ? res.items : [];
    if (items.length) {
      schemes = items;
    } else if (res && res._source === 'mock') {
      schemes = DEMO_SCHEMES.slice();
      dom.demoNotice.hidden = false;
    } else {
      schemes = [];
    }

    byId = {};
    schemes.forEach(function (s) { byId[String(s.id)] = s; });

    setLoading(false);
    ready = true;
    render();
  }

  function init() {
    dom.summary = document.getElementById('profileSummary');
    dom.demoNotice = document.getElementById('demoNotice');
    dom.search = document.getElementById('searchInput');
    dom.state = document.getElementById('stateFilter');
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
    dom.state.addEventListener('change', applyFilters);
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
