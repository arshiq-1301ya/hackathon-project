/* applications.js - My Applications tracker.
 * Data comes from the backend (GET /applications); nothing is stored locally.
 * Statuses are user-managed; this page never shows them as government updates.
 * TODO i18n: new strings below use English fallbacks until translations exist.
 */
(function () {
  'use strict';

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

  // The only place frontend status codes map to backend statuses (not_started, in_progress,
  // submitted, approved, rejected). Several frontend codes share one backend value, so the
  // reverse mapping shows the canonical code for each backend value.
  var BACKEND_STATUS = {
    NOT_STARTED: 'not_started',
    PREPARING_DOCUMENTS: 'in_progress',
    READY_TO_APPLY: 'in_progress',
    APPLIED: 'submitted',
    UNDER_REVIEW: 'submitted',
    APPROVED: 'approved',
    REJECTED: 'rejected'
  };
  var FRONTEND_STATUS = {
    not_started: 'NOT_STARTED',
    in_progress: 'PREPARING_DOCUMENTS',
    submitted: 'APPLIED',
    approved: 'APPROVED',
    rejected: 'REJECTED'
  };

  var state = { items: [], loadFailed: false, query: '', status: '', openStatus: {}, openEdit: {} };
  var els = {};

  function CA() { return window.CivicAssist; }
  function api() { return window.CIVICASSIST_API; }

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

  function errorMessage(err) {
    return (err && err.message) || tr('toast.networkError', 'Something went wrong.');
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function statusInfo(code) { return STATUS_BY_CODE[code] || STATUS_BY_CODE.NOT_STARTED; }
  function statusLabel(code) { return tr('status.' + code, statusInfo(code).label); }

  function toBackendStatus(code) { return BACKEND_STATUS[code] || null; }
  function fromBackendStatus(value) { return FRONTEND_STATUS[value] || 'NOT_STARTED'; }

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

  // Backend deadline is an ISO timestamp or date; the UI works with YYYY-MM-DD.
  function dateOnly(value) {
    if (typeof value !== 'string' || !value) return '';
    var day = value.slice(0, 10);
    return isIsoDate(day) ? day : '';
  }

  // Maps one backend application (schemeId populated as {_id, name, ...}) to the view model.
  // prev supplies scheme id/name when a PATCH response leaves schemeId unpopulated.
  function normalizeApp(raw, prev) {
    if (!raw || typeof raw !== 'object' || !raw._id) return null;
    var s = raw.schemeId;
    var schemeId = '';
    var name = '';
    if (s && typeof s === 'object') {
      schemeId = s._id ? String(s._id) : '';
      name = typeof s.name === 'string' ? s.name.trim() : '';
    } else if (s) {
      schemeId = String(s);
    }
    if (!schemeId && prev) schemeId = prev.schemeId;
    if (!name && prev) name = prev.name;
    return {
      id: String(raw._id),
      schemeId: schemeId,
      name: name || 'Unnamed scheme', // TODO i18n
      status: fromBackendStatus(raw.status),
      deadline: dateOnly(raw.deadline),
      reminderDate: '', // no backend field yet; display only
      progress: 0,      // no backend field yet; display only
      createdAt: raw.createdAt || ''
    };
  }

  function findItem(id) {
    for (var i = 0; i < state.items.length; i++) {
      if (state.items[i].id === id) return state.items[i];
    }
    return null;
  }

  // Replaces one item with the server copy from a { data: { application } } response.
  function applyServerApp(id, res) {
    var prev = findItem(id);
    var next = normalizeApp(res && res.data && res.data.application, prev);
    if (!next) return;
    state.items = state.items.map(function (i) { return i.id === id ? next : i; });
  }

  function loadApplications() {
    els.loadingArea.hidden = false;
    return Promise.resolve()
      .then(function () { return api().listApplications(); })
      .then(function (res) {
        var list = res && res.data && Array.isArray(res.data.applications) ? res.data.applications : [];
        state.items = list.map(function (raw) { return normalizeApp(raw, null); }).filter(Boolean);
        state.loadFailed = false;
      }, function (err) {
        state.items = [];
        state.loadFailed = true;
        toast('error', errorMessage(err));
      })
      .then(function () {
        els.loadingArea.hidden = true;
        render();
      });
  }

  function saveStatus(id, code) {
    var backend = toBackendStatus(code);
    if (!backend || !findItem(id)) return;
    state.openStatus[id] = false;
    // Status changes never alter progress automatically.
    api().updateApplication(id, { status: backend }).then(function (res) {
      applyServerApp(id, res);
      toast('success', tr('toast.saved', 'Changes saved.'));
      render();
    }, function (err) {
      state.openStatus[id] = true;
      toast('error', errorMessage(err));
      render();
    });
  }

  function removeItem(item) {
    CA().confirm('Remove this application from your tracker?', { danger: true }).then(function (ok) {
      if (!ok) return;
      api().deleteApplication(item.id).then(function () {
        removeLocal(item.id);
        toast('success', tr('toast.removed', 'Application removed.'));
      }, function (err) {
        // 404: already gone on the server, so drop it from the list too.
        if (err && err.status === 404) {
          removeLocal(item.id);
          return;
        }
        toast('error', errorMessage(err));
      });
    });
  }

  function removeLocal(id) {
    state.items = state.items.filter(function (i) { return i.id !== id; });
    delete state.openStatus[id];
    delete state.openEdit[id];
    render();
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

    // Edit panel: deadline (the only date field the backend stores)
    var editPanel = el('form', 'inline-panel edit-panel');
    editPanel.noValidate = true;
    editPanel.hidden = !state.openEdit[item.id];

    var dlLabel = el('label', '', 'Deadline');
    var dlInput = el('input');
    dlInput.type = 'date';
    dlInput.value = item.deadline;
    dlLabel.appendChild(dlInput);

    var saveEditBtn = el('button', 'btn btn-primary btn-sm', tr('btn.save', 'Save'));
    saveEditBtn.type = 'submit';
    var cancelEditBtn = el('button', 'btn btn-ghost btn-sm', tr('btn.cancel', 'Cancel'));
    cancelEditBtn.type = 'button';
    cancelEditBtn.addEventListener('click', function () {
      state.openEdit[item.id] = false;
      editPanel.hidden = true;
    });

    editPanel.appendChild(dlLabel);
    editPanel.appendChild(saveEditBtn);
    editPanel.appendChild(cancelEditBtn);

    editPanel.addEventListener('submit', function (e) {
      e.preventDefault();
      var dl = dlInput.value;
      state.openEdit[item.id] = false;
      api().updateApplication(item.id, { deadline: dl || null }).then(function (res) {
        applyServerApp(item.id, res);
        toast('success', tr('toast.saved', 'Changes saved.'));
        render();
      }, function (err) {
        state.openEdit[item.id] = true;
        toast('error', errorMessage(err));
        render();
      });
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
    if (item.schemeId) {
      viewLink.href = 'scheme-detail.html?id=' + encodeURIComponent(item.schemeId);
    } else {
      viewLink.setAttribute('aria-disabled', 'true');
    }

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

    // On a load failure the error toast is the message; do not claim "no applications".
    els.emptyState.hidden = state.loadFailed || state.items.length !== 0;
    els.noMatch.hidden = state.loadFailed || !(state.items.length > 0 && visible.length === 0);
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

    loadApplications();
  }

  if (window.CivicAssist && typeof window.CivicAssist.registerPage === 'function') {
    window.CivicAssist.registerPage(init);
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
