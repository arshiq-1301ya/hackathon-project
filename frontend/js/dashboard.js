(function () {
  'use strict';

  var STATUS = {
    NOT_STARTED: { label: 'Not started', cls: 'status-not-started' },
    PREPARING_DOCUMENTS: { label: 'Preparing documents', cls: 'status-preparing' },
    READY_TO_APPLY: { label: 'Ready to apply', cls: 'status-ready' },
    APPLIED: { label: 'Applied', cls: 'status-applied' },
    UNDER_REVIEW: { label: 'Under review', cls: 'status-review' },
    APPROVED: { label: 'Approved', cls: 'status-approved' },
    REJECTED: { label: 'Rejected', cls: 'status-rejected' }
  };

  var CLOSED_STATUSES = ['APPROVED', 'REJECTED'];

  var BACKEND_STATUS = {
    not_started: 'NOT_STARTED',
    in_progress: 'PREPARING_DOCUMENTS',
    submitted: 'APPLIED',
    approved: 'APPROVED',
    rejected: 'REJECTED'
  };

  var PROFILE_FIELDS = [
    { key: 'state', label: 'State' },
    { key: 'educationLevel', label: 'Education level' },
    { key: 'annualFamilyIncome', label: 'Annual family income' },
    { key: 'purpose', label: 'Purpose' },
    { key: 'occupation', label: 'Occupation' },
    { key: 'otherInfo', label: 'Other information' }
  ];

  var DAY_MS = 24 * 60 * 60 * 1000;
  var DEADLINE_WINDOW_DAYS = 60;
  var RECOMMENDED_MAX = 3;
  var APPLICATIONS_MAX = 4;
  var ACTIVITY_MAX = 6;
  var DISCOVER_MAX_LENGTH = 1000;

  var bound = false;

  function $(id) {
    return document.getElementById(id);
  }

  function read(key, fallback) {
    var store = window.CivicAssist && window.CivicAssist.storage;
    if (!store) {
      return fallback;
    }
    try {
      var value = store.get(key, fallback);
      return value === undefined || value === null ? fallback : value;
    } catch (err) {
      return fallback;
    }
  }

  function write(key, value) {
    var store = window.CivicAssist && window.CivicAssist.storage;
    if (!store) {
      return;
    }
    try {
      store.set(key, value);
    } catch (err) {
      /* storage unavailable: navigation still proceeds */
    }
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function clearNode(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function makeEl(tag, className, text) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined && text !== null) {
      node.textContent = String(text);
    }
    return node;
  }

  function setText(node, text) {
    if (node) {
      node.textContent = text;
    }
  }

  function setHidden(node, hidden) {
    if (node) {
      node.hidden = !!hidden;
    }
  }

  function clampPercent(value) {
    var n = Number(value);
    if (!isFinite(n)) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function setProgress(barNode, percent) {
    if (!barNode) {
      return;
    }
    var pct = clampPercent(percent);
    barNode.style.width = pct + '%';
    var track = barNode.parentNode;
    if (track && track.setAttribute) {
      track.setAttribute('aria-valuenow', String(pct));
    }
  }

  function isFilled(value) {
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === 'string') {
      return value.trim() !== '';
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return true;
  }

  function parseDate(value) {
    if (!value) {
      return null;
    }
    var date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-IN');
  }

  function schemeName(scheme) {
    if (typeof scheme === 'string') {
      return scheme;
    }
    if (isObject(scheme)) {
      return String(scheme.name || scheme.id || '');
    }
    return '';
  }

  function statusBadge(code) {
    var info = STATUS[code];
    if (info) {
      return makeEl('span', 'badge ' + info.cls, info.label);
    }
    return makeEl('span', 'badge badge-muted', code || 'Unknown');
  }

  function mapApplication(app) {
    var scheme = isObject(app.schemeId) ? app.schemeId : {};
    var rawId = isObject(app.schemeId) ? app.schemeId._id : app.schemeId;
    return {
      id: rawId != null ? String(rawId) : '',
      name: scheme.name || '',
      status: BACKEND_STATUS[app.status] || app.status,
      deadline: app.deadline || null,
      progress: app.progress || 0,
      createdAt: app.createdAt || null
    };
  }

  // Signed-out users have no server applications, so no request is made.
  function loadApplications(signedIn) {
    if (!signedIn) {
      return Promise.resolve([]);
    }
    return Promise.resolve()
      .then(function () { return window.CIVICASSIST_API.listApplications(); })
      .then(function (res) {
        var list = res && res.data && Array.isArray(res.data.applications) ? res.data.applications : [];
        return list.filter(isObject).map(mapApplication);
      });
  }

  function renderHero(session) {
    var name = session && isObject(session) ? String(session.name || '').trim() : '';
    setText($('welcomeTitle'), name ? 'Welcome back, ' + name : 'Welcome back');
  }

  function renderStats(profilePercent, apps, savedCount) {
    var results = read('results.count', null);
    var hasCount = typeof results === 'number' && isFinite(results);

    setText($('statProfile'), profilePercent + '%');
    setProgress($('statProfileBar'), profilePercent);

    setText($('statMatched'), hasCount ? String(results) : '\u2014');
    setHidden($('statMatchedHelper'), hasCount);

    setText($('statSaved'), String(savedCount));

    var active = apps.filter(function (app) {
      return CLOSED_STATUSES.indexOf(app.status) === -1;
    });
    setText($('statActive'), String(active.length));
  }

  function renderProfile(profile) {
    var list = $('profileList');
    clearNode(list);
    var filled = 0;

    PROFILE_FIELDS.forEach(function (field) {
      var value = isObject(profile) ? profile[field.key] : undefined;
      var ok = isFilled(value);
      if (ok) {
        filled += 1;
      }
      var row = makeEl('div', 'dash-dl-row');
      var dt = makeEl('dt', '', field.label);
      var dd = makeEl('dd', '');
      if (ok) {
        dd.textContent = String(value);
      } else {
        dd.appendChild(makeEl('span', 'badge badge-muted', 'Missing'));
      }
      row.appendChild(dt);
      row.appendChild(dd);
      list.appendChild(row);
    });

    var percent = Math.round((filled / PROFILE_FIELDS.length) * 100);
    setProgress($('profileBar'), percent);
    return percent;
  }

  function renderRecommended() {
    var list = $('recList');
    var items = asArray(read('results.list', [])).filter(isObject).slice(0, RECOMMENDED_MAX);
    clearNode(list);

    items.forEach(function (item) {
      var li = makeEl('li', 'dash-list-item');
      var row = makeEl('div', 'dash-list-row');
      row.appendChild(makeEl('span', 'dash-list-name', item.name || ''));
      if (STATUS[item.status]) {
        row.appendChild(statusBadge(item.status));
      } else if (item.status) {
        row.appendChild(makeEl('span', 'badge badge-muted', item.status));
      }
      li.appendChild(row);
      list.appendChild(li);
    });

    setHidden($('recEmpty'), items.length > 0);
  }

  function renderApplications(apps, failed) {
    var list = $('appList');
    var items = apps.slice(0, APPLICATIONS_MAX);
    clearNode(list);

    if (failed) {
      // Do not show the "not started any applications" empty state on a failed load.
      setHidden($('appEmpty'), true);
      return;
    }

    items.forEach(function (app) {
      var li = makeEl('li', 'dash-list-item');
      var row = makeEl('div', 'dash-list-row');
      row.appendChild(makeEl('span', 'dash-list-name', app.name || ''));
      row.appendChild(statusBadge(app.status));
      li.appendChild(row);

      var track = makeEl('div', 'dash-progress');
      track.setAttribute('role', 'progressbar');
      track.setAttribute('aria-label', 'Application progress');
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', '100');
      track.setAttribute('aria-valuenow', String(clampPercent(app.progress)));
      var bar = makeEl('span', 'dash-progress-bar');
      track.appendChild(bar);
      li.appendChild(track);
      setProgress(bar, app.progress);

      list.appendChild(li);
    });

    setHidden($('appEmpty'), items.length > 0);
  }

  function renderChecklist(apps) {
    var latest = null;
    var latestTime = -Infinity;
    apps.forEach(function (app) {
      var date = parseDate(app.createdAt);
      var time = date ? date.getTime() : 0;
      if (!latest || time >= latestTime) {
        latest = app;
        latestTime = time;
      }
    });

    var items = null;
    if (latest && latest.id) {
      var saved = read('checklist.' + latest.id, null);
      items = saved && isObject(saved) && isObject(saved.items) ? saved.items : null;
    }
    var keys = items ? Object.keys(items) : [];

    if (keys.length === 0) {
      setHidden($('checkBody'), true);
      setHidden($('checkEmpty'), false);
      return;
    }

    var done = keys.filter(function (key) {
      return items[key] === true;
    }).length;

    setText($('checkName'), latest.name || '');
    setText($('checkSummary'), done + ' of ' + keys.length + ' completed');
    setProgress($('checkBar'), Math.round((done / keys.length) * 100));
    setHidden($('checkBody'), false);
    setHidden($('checkEmpty'), true);
  }

  function renderDeadlines(apps) {
    var list = $('deadlineList');
    clearNode(list);

    var now = Date.now();
    var limit = now + DEADLINE_WINDOW_DAYS * DAY_MS;

    var upcoming = apps
      .map(function (app) {
        return { name: app.name || '', date: parseDate(app.deadline) };
      })
      .filter(function (item) {
        return item.date && item.date.getTime() >= now && item.date.getTime() <= limit;
      })
      .sort(function (a, b) {
        return a.date.getTime() - b.date.getTime();
      });

    upcoming.forEach(function (item) {
      var li = makeEl('li', 'dash-list-item');
      var row = makeEl('div', 'dash-list-row');
      row.appendChild(makeEl('span', 'dash-list-name', item.name));
      row.appendChild(makeEl('span', 'timeline-date', formatDate(item.date)));
      li.appendChild(row);
      list.appendChild(li);
    });

    setHidden($('deadlineEmpty'), upcoming.length > 0);
  }

  function renderActivity(saved, apps) {
    var list = $('activityList');
    clearNode(list);

    var events = [];

    saved.forEach(function (scheme) {
      var stamp = isObject(scheme) ? (scheme.savedAt || scheme.createdAt) : null;
      var date = parseDate(stamp);
      if (date) {
        events.push({ date: date, text: 'Saved scheme: ' + schemeName(scheme) });
      }
    });

    apps.forEach(function (app) {
      var date = parseDate(app.createdAt);
      if (date) {
        events.push({ date: date, text: 'Started application: ' + (app.name || '') });
      }
    });

    events.sort(function (a, b) {
      return b.date.getTime() - a.date.getTime();
    });

    events.slice(0, ACTIVITY_MAX).forEach(function (event) {
      var li = makeEl('li', 'timeline-item');
      li.appendChild(makeEl('span', 'dash-list-name', event.text));
      li.appendChild(makeEl('span', 'timeline-date', formatDate(event.date)));
      list.appendChild(li);
    });

    setHidden($('activityEmpty'), events.length > 0);
  }

  function setPersonalVisibility(signedIn) {
    var signin = $('signinCard');
    setHidden(signin, signedIn);
    var nodes = document.querySelectorAll('.js-personal');
    Array.prototype.forEach.call(nodes, function (node) {
      setHidden(node, !signedIn);
    });
  }

  async function render() {
    var session = read('auth.session', null);
    var signedIn = isObject(session);

    var profile = read('profile.confirmed', null) || read('profile.draft', null);
    var saved = asArray(read('saved.schemes', [])).filter(function (item) {
      return item !== null && item !== undefined && item !== '';
    });

    var apps = [];
    var appsFailed = false;
    try {
      apps = await loadApplications(signedIn);
    } catch (err) {
      appsFailed = true;
      window.CivicAssist.toast('error', window.CivicAssist.t('toast.networkError'));
    }

    renderHero(session);
    setPersonalVisibility(signedIn);

    var profilePercent = renderProfile(profile);
    renderStats(profilePercent, apps, saved.length);
    renderRecommended();
    renderApplications(apps, appsFailed);
    renderChecklist(apps);
    renderDeadlines(apps);
    renderActivity(saved, apps);
  }

  function openChat() {
    document.dispatchEvent(new CustomEvent('civicassist:chat-open'));
  }

  function bindEvents() {
    if (bound) {
      return;
    }
    bound = true;

    var discoverBtn = $('dashDiscoverBtn');
    var input = $('dashInput');
    if (discoverBtn && input) {
      discoverBtn.addEventListener('click', function () {
        var text = String(input.value || '').trim().slice(0, DISCOVER_MAX_LENGTH);
        write('discover.input', text);
        window.location.href = 'discover.html';
      });
    }

    var chatButtons = document.querySelectorAll('[data-chat-open]');
    Array.prototype.forEach.call(chatButtons, function (button) {
      button.addEventListener('click', openChat);
    });

    document.addEventListener('civicassist:langchange', render);
  }

  function prefillDiscoverInput() {
    var input = $('dashInput');
    if (!input) {
      return;
    }
    var saved = read('discover.input', '');
    if (typeof saved === 'string' && input.value === '') {
      input.value = saved.slice(0, DISCOVER_MAX_LENGTH);
    }
  }

  function init() {
    bindEvents();
    prefillDiscoverInput();
    render();
  }

  if (window.CivicAssist && typeof window.CivicAssist.registerPage === 'function') {
    window.CivicAssist.registerPage(init);
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
