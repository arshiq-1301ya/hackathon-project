/* applications.js - My Applications tracker.
 * Statuses are user-managed; this page never shows them as government updates.
 * TODO i18n: new strings below use English fallbacks until translations exist.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'applications.list';
  var STATUSES = [
    { code: 'NOT_STARTED', label: 'Not Started', cls: 'status-not-started' },
    { code: 'PREPARING_DOCUMENTS', label: 'Preparing Documents', cls: 'status-preparing' },
    { code: 'READY_TO_APPLY', label: 'Ready to Apply', cls: 'status-ready' },
    { code: 'APPLIED', label: 'Applied', cls: 'status-applied' },
    { code: 'UNDER_REVIEW', label: 'Under Review', cls: 'status-review' },
    { code: 'APPROVED', label: 'Approved', cls: 'status-approved' },
    { code: 'REJECTED', label: 'Rejected', cls: 'status-rejected' }
  ];
  var STATUS_BY_CODE = {};
  STATUSES.forEach(function (s) { STATUS_BY_CODE[s.code] = s; });

  var state = { items: [], query: '', status: '', openStatus: {}, openEdit: {} };
  var els = {};

  function CA() { return window.CivicAssist; }

  // Translated string when a key exists, otherwise the English fallback.
  function tr(key, fallback, vars) {
    var c = CA();
    if (c && typeof c.t === 'function') {
      var v = c.t(key, vars);
      if (v && v !== key) return v;
    }
    return fallback;
  }

  function toast(type, msg) {
    var c = CA();
    if (c && typeof c.toast === 'function') c.toast(type, msg);
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function statusInfo(code) { return STATUS_BY_CODE[code] || STATUS_BY_CODE.NOT_STARTED; }
  function statusLabel(code) { return tr('status.' + code, statusInfo(code).label); }

  function isIsoDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

  function formatDate(iso) {
    if (!isIsoDate(iso)) return '';
    var d = new Date(iso + 'T00:00:00');
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN');
  }

  function daysUntil(iso) {
    var target = new Date(iso + 'T00:00:00');
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((target - today) / 86400000);
  }

  // Keep only well-formed entries; drop anything without an id or name.
  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.id === undefined || raw.id === null || String(raw.id).trim() === '') return null;
    if (typeof raw.name !== 'string' || !raw.name.trim()) return null;
    var p = Number(raw.progress);
    return {
      id: String(raw.id),
      name: raw.name.trim(),
      status: STATUS_BY_CODE[raw.status] ? raw.status : 'NOT_STARTED',
      deadline: isIsoDate(raw.deadline) ? raw.deadline : '',
      reminderDate: isIsoDate(raw.reminderDate) ? raw.reminderDate : '',
      progress: isFinite(p) ? Math.min(100, Math.max(0, Math.round(p))) : 0,
      createdAt: raw.createdAt || ''
    };
  }

  function loadItems() {
    var raw = CA().storage.get(STORAGE_KEY, []);
    if (!Array.isArray(raw)) return [];
    var out = [];
    raw.forEach(function (r) {
      var n = normalize(r);
      if (n) out.push(n);
    });
    return out;
  }

  function persist() {
    CA().storage.set(STORAGE_KEY, state.items);
  }

  // Best-effort sync to the API layer; local storage remains the source for this page.
  function sendApi(fnName, args) {
    var api = window.CIVICASSIST_API;
    if (!api || typeof api[fnName] !== 'function') return;
    Promise.resolve()
      .then(function () { return api[fnName].apply(api, args); })
      .catch(function () { /* ignored: storage already updated */ });
  }

  function findItem(id) {
    for (var i = 0; i < state.items.length; i++) {
      if (state.items[i].id === id) return state.items[i];
    }
    return null;
  }

  function updateItem(id, patch, msg) {
    var item = findItem(id);
    if (!item) return;
    Object.assign(item, patch);
    persist();
    sendApi('updateApplication', [id, patch]);
    toast('success', msg);
    render();
  }

  function saveStatus(id, code) {
    if (!STATUS_BY_CODE[code]) return;
    state.openStatus[id] = false;
    // Status changes never alter progress automatically.
    updateItem(id, { status: code }, tr('toast.saved', 'Changes saved.'));
  }

  function removeItem(item) {
    CA().confirm('Remove this application from your tracker?', { danger: true }).then(function (ok) {
      if (!ok) return;
      state.items = state.items.filter(function (i) { return i.id !== item.id; });
      delete state.openStatus[item.id];
      delete state.openEdit[item.id];
      persist();
      sendApi('deleteApplication', [item.id]);
      toast('success', tr('toast.removed', 'Application removed.'));
      render();
    });
  }

  function metaRow(term, value) {
    var wrap = el('div');
    wrap.appendChild(el('dt', '', term));
    wrap.appendChild(el('dd', '', value));
    return wrap;
  }

  function buildCard(item) {
    var info = statusInfo(item.status);
    var art = el('article', 'card application-card');
    art.dataset.id = item.id;

    // Header: name and status badge
    var head = el('div', 'application-card-header');
    head.appendChild(el('h3', 'application-card-title', item.name));
    head.appendChild(el('span', 'badge ' + info.cls, statusLabel(item.status)));
    art.appendChild(head);

    // Meta rows
    var meta = el('dl', 'meta-grid');
    meta.appendChild(metaRow('Deadline', formatDate(item.deadline) || tr('common.notSet', 'Not set')));
    meta.appendChild(metaRow('Reminder date', formatDate(item.reminderDate) || tr('common.notSet', 'Not set')));
    art.appendChild(meta);

    // Progress bar
    var prog = el('div', 'progress');
    prog.setAttribute('role', 'progressbar');
    prog.setAttribute('aria-label', 'Preparation progress for ' + item.name);
    prog.setAttribute('aria-valuemin', '0');
    prog.setAttribute('aria-valuemax', '100');
    prog.setAttribute('aria-valuenow', String(item.progress));
    var bar = el('div', 'progress-bar');
    bar.style.width = item.progress + '%';
    prog.appendChild(bar);
    art.appendChild(prog);
    art.appendChild(el('p', 'muted', 'Preparation progress: ' + item.progress + '%'));

    // Inline status panel (user-managed)
    var statusPanel = el('div', 'inline-panel');
    statusPanel.hidden = !state.openStatus[item.id];
    var statusId = 'status-' + item.id;
    var sLabel = el('label', '', 'Status (set by you)');
    sLabel.htmlFor = statusId;
    var sel = el('select');
    sel.id = statusId;
    STATUSES.forEach(function (s) {
      var opt = el('option', '', statusLabel(s.code));
      opt.value = s.code;
      if (s.code === item.status) opt.selected = true;
      sel.appendChild(opt);
    });
    var saveStatusBtn = el('button', 'btn btn-primary btn-sm', tr('btn.save', 'Save'));
    saveStatusBtn.type = 'button';
    saveStatusBtn.addEventListener('click', function () { saveStatus(item.id, sel.value); });
    sLabel.appendChild(sel);
    statusPanel.appendChild(sLabel);
    statusPanel.appendChild(saveStatusBtn);

    // Edit panel: deadline, reminder, progress
    var editPanel = el('form', 'inline-panel edit-panel');
    editPanel.noValidate = true;
    editPanel.hidden = !state.openEdit[item.id];

    var dlLabel = el('label', '', 'Deadline');
    var dlInput = el('input');
    dlInput.type = 'date';
    dlInput.value = item.deadline;
    dlLabel.appendChild(dlInput);

    var remLabel = el('label', '', 'Reminder date');
    var remInput = el('input');
    remInput.type = 'date';
    remInput.value = item.reminderDate;
    remLabel.appendChild(remInput);

    var progLabel = el('label', '', 'Progress');
    var rangeInput = el('input');
    rangeInput.type = 'range';
    rangeInput.min = '0';
    rangeInput.max = '100';
    rangeInput.step = '1';
    rangeInput.value = String(item.progress);
    var rangeOut = el('output', 'range-output', item.progress + '%');
    rangeInput.addEventListener('input', function () { rangeOut.textContent = rangeInput.value + '%'; });
    progLabel.appendChild(rangeInput);

    var errBox = el('p', 'field-error');
    errBox.setAttribute('role', 'alert');
    errBox.hidden = true;

    var saveEditBtn = el('button', 'btn btn-primary btn-sm', tr('btn.save', 'Save'));
    saveEditBtn.type = 'submit';
    var cancelEditBtn = el('button', 'btn btn-ghost btn-sm', tr('btn.cancel', 'Cancel'));
    cancelEditBtn.type = 'button';
    cancelEditBtn.addEventListener('click', function () {
      state.openEdit[item.id] = false;
      editPanel.hidden = true;
    });

    editPanel.appendChild(dlLabel);
    editPanel.appendChild(remLabel);
    editPanel.appendChild(progLabel);
    editPanel.appendChild(errBox);
    editPanel.appendChild(saveEditBtn);
    editPanel.appendChild(cancelEditBtn);

    editPanel.addEventListener('submit', function (e) {
      e.preventDefault();
      var dl = dlInput.value;
      var rem = remInput.value;
      if (dl && rem && rem > dl) {
        errBox.textContent = tr('applications.reminderError', 'Reminder date cannot be after the deadline.');
        errBox.hidden = false;
        remInput.focus();
        return;
      }
      state.openEdit[item.id] = false;
      updateItem(item.id, {
        deadline: dl,
        reminderDate: rem,
        progress: Number(rangeInput.value)
      }, tr('toast.saved', 'Changes saved.'));
    });

    // Actions row
    var actions = el('div', 'card-actions');

    var updBtn = el('button', 'btn btn-secondary btn-sm', 'Update Status');
    updBtn.type = 'button';
    updBtn.setAttribute('aria-expanded', String(!statusPanel.hidden));
    updBtn.addEventListener('click', function () {
      statusPanel.hidden = !statusPanel.hidden;
      state.openStatus[item.id] = !statusPanel.hidden;
      updBtn.setAttribute('aria-expanded', String(!statusPanel.hidden));
    });

    var editBtn = el('button', 'btn btn-secondary btn-sm', 'Edit');
    editBtn.type = 'button';
    editBtn.setAttribute('aria-expanded', String(!editPanel.hidden));
    editBtn.addEventListener('click', function () {
      editPanel.hidden = !editPanel.hidden;
      state.openEdit[item.id] = !editPanel.hidden;
      editBtn.setAttribute('aria-expanded', String(!editPanel.hidden));
    });

    var viewLink = el('a', 'btn btn-ghost btn-sm', 'View Details');
    viewLink.href = 'scheme-detail.html?id=' + encodeURIComponent(item.id);

    var removeBtn = el('button', 'btn btn-danger btn-sm', 'Remove');
    removeBtn.type = 'button';
    removeBtn.addEventListener('click', function () { removeItem(item); });

    actions.appendChild(updBtn);
    actions.appendChild(editBtn);
    actions.appendChild(viewLink);
    actions.appendChild(removeBtn);

    art.appendChild(statusPanel);
    art.appendChild(editPanel);
    art.appendChild(actions);
    return art;
  }

  function updateSummary() {
    var items = state.items;
    var inProgress = items.filter(function (i) { return i.status === 'PREPARING_DOCUMENTS'; }).length;
    var upcoming = items.filter(function (i) {
      if (!i.deadline) return false;
      var d = daysUntil(i.deadline);
      return d >= 0 && d <= 30;
    }).length;
    var prepared = items.filter(function (i) { return i.progress === 100; }).length;

    els.sumTotal.textContent = String(items.length);
    els.sumInProgress.textContent = String(inProgress);
    els.sumDeadlines.textContent = String(upcoming);
    els.sumPrepared.textContent = String(prepared);
  }

  function renderDeadlines() {
    var list = state.items
      .filter(function (i) { return i.deadline; })
      .sort(function (a, b) {
        if (a.deadline < b.deadline) return -1;
        if (a.deadline > b.deadline) return 1;
        return 0;
      });

    els.deadlineList.textContent = '';
    if (!list.length) {
      els.deadlineList.appendChild(el('li', 'muted', tr('deadlines.empty', 'No upcoming deadlines.')));
      return;
    }
    list.forEach(function (i) {
      var li = el('li');
      li.appendChild(el('span', '', i.name));
      li.appendChild(el('span', 'deadline-date', formatDate(i.deadline)));
      els.deadlineList.appendChild(li);
    });
  }

  function render() {
    updateSummary();
    renderDeadlines();

    var q = state.query;
    var s = state.status;
    var visible = state.items.filter(function (i) {
      var matchQ = !q || i.name.toLowerCase().indexOf(q) !== -1;
      var matchS = !s || i.status === s;
      return matchQ && matchS;
    });

    els.applicationsList.textContent = '';
    visible.forEach(function (i) { els.applicationsList.appendChild(buildCard(i)); });

    els.emptyState.hidden = state.items.length !== 0;
    els.noMatch.hidden = !(state.items.length > 0 && visible.length === 0);
    els.applicationsList.hidden = visible.length === 0;
  }

  // Re-apply translated labels (status names, "All statuses") without touching filter values.
  function applyLabels() {
    Array.prototype.forEach.call(els.statusFilter.options, function (opt) {
      opt.textContent = opt.value ? statusLabel(opt.value) : tr('filter.all', 'All statuses');
    });
  }

  function init() {
    els.sumTotal = document.getElementById('sumTotal');
    els.sumInProgress = document.getElementById('sumInProgress');
    els.sumDeadlines = document.getElementById('sumDeadlines');
    els.sumPrepared = document.getElementById('sumPrepared');
    els.searchInput = document.getElementById('searchInput');
    els.statusFilter = document.getElementById('statusFilter');
    els.deadlineList = document.getElementById('deadlineList');
    els.loadingArea = document.getElementById('loadingArea');
    els.applicationsList = document.getElementById('applicationsList');
    els.emptyState = document.getElementById('emptyState');
    els.noMatch = document.getElementById('noMatch');
    els.clearFilters = document.getElementById('clearFilters');

    els.loadingArea.hidden = false;
    state.items = loadItems();
    applyLabels();

    els.searchInput.addEventListener('input', function () {
      state.query = els.searchInput.value.trim().toLowerCase();
      render();
    });
    els.statusFilter.addEventListener('change', function () {
      state.status = els.statusFilter.value;
      render();
    });
    els.clearFilters.addEventListener('click', function () {
      els.searchInput.value = '';
      els.statusFilter.value = '';
      state.query = '';
      state.status = '';
      render();
    });
    document.addEventListener('civicassist:langchange', function () {
      applyLabels();
      render();
    });

    render();
    els.loadingArea.hidden = true;
  }

  if (window.CivicAssist && typeof window.CivicAssist.registerPage === 'function') {
    window.CivicAssist.registerPage(init);
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
