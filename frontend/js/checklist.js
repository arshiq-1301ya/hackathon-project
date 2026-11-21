/* Document checklist page logic. Uses window.CivicAssist and window.CIVICASSIST_API. */
(function () {
  'use strict';

  var CA = window.CivicAssist;
  var API = window.CIVICASSIST_API || {};

  function tr(key, fallback) {
    var value = CA.t(key);
    return (!value || value === key) ? fallback : value;
  }

  function noop() {}

  // Optional backend sync: failures are ignored by design.
  function fireAndForget(result) {
    try {
      Promise.resolve(result).catch(noop);
    } catch (e) {
      noop();
    }
  }

  function loadScheme(id) {
    var selected = CA.storage.get('scheme.selected', null);
    if (selected && String(selected.id) === String(id)) {
      return Promise.resolve(selected);
    }
    return Promise.resolve()
      .then(function () { return API.getScheme(id); })
      .catch(function () { return null; });
  }

  function getDocuments(scheme) {
    if (!scheme || !Array.isArray(scheme.requiredDocuments)) {
      return [];
    }
    return scheme.requiredDocuments.filter(function (doc) {
      return typeof doc === 'string' && doc.trim() !== '';
    });
  }

  function normaliseState(saved) {
    if (!saved || typeof saved !== 'object' || !saved.items || typeof saved.items !== 'object') {
      return { items: {} };
    }
    return saved;
  }

  CA.registerPage(function () {
    var params = new URLSearchParams(window.location.search);
    var id = params.get('id');

    var el = {
      schemeName: document.getElementById('schemeName'),
      loadingArea: document.getElementById('loadingArea'),
      notFound: document.getElementById('notFound'),
      emptyState: document.getElementById('emptyState'),
      progressText: document.getElementById('progressText'),
      progressPercent: document.getElementById('progressPercent'),
      progressBar: document.getElementById('progressBar'),
      statusBadge: document.getElementById('statusBadge'),
      docList: document.getElementById('docList'),
      saveBtn: document.getElementById('saveProgressBtn'),
      backLink: document.getElementById('backLink'),
      guideLink: document.getElementById('guideLink')
    };

    var docs = [];
    var state = { items: {} };
    var wasComplete = false;
    var storageKey = 'checklist.' + id;

    function showNotFound() {
      el.loadingArea.hidden = true;
      el.notFound.hidden = false;
    }

    function isDone(index) {
      return state.items[String(index)] === true;
    }

    function completedCount() {
      var count = 0;
      for (var i = 0; i < docs.length; i++) {
        if (isDone(i)) {
          count++;
        }
      }
      return count;
    }

    function isAllDone() {
      return docs.length > 0 && completedCount() === docs.length;
    }

    function refreshStatusBadge() {
      var complete = isAllDone();
      el.statusBadge.className = complete ? 'badge-success' : 'badge-muted';
      el.statusBadge.textContent = complete
        ? tr('status.completed', 'Completed')
        : tr('status.pending', 'Pending');
    }

    // Re-applies badge text only; never rebuilds rows or resets checkboxes.
    function refreshRowBadges() {
      var badges = el.docList.querySelectorAll('.row-badge');
      Array.prototype.forEach.call(badges, function (badge) {
        var done = isDone(Number(badge.dataset.index));
        badge.className = done ? 'badge-success row-badge' : 'badge-muted row-badge';
        badge.textContent = done
          ? tr('status.completed', 'Completed')
          : tr('status.pending', 'Pending');
      });
    }

    function updateProgress() {
      var total = docs.length;
      var done = completedCount();
      var percent = total ? Math.round((done / total) * 100) : 0;

      el.progressText.textContent = done + ' of ' + total + ' completed'; // TODO i18n
      el.progressPercent.textContent = percent + '%';
      el.progressBar.style.width = percent + '%';
      el.progressBar.setAttribute('aria-valuenow', String(percent));

      refreshStatusBadge();
      refreshRowBadges();
    }

    function syncRemote() {
      var payload = { schemeId: id, items: state.items };
      try {
        if (!state.synced && typeof API.createChecklist === 'function') {
          state.synced = true;
          CA.storage.set(storageKey, state);
          fireAndForget(API.createChecklist(payload));
        } else if (typeof API.updateChecklist === 'function') {
          fireAndForget(API.updateChecklist(id, payload));
        }
      } catch (e) {
        noop();
      }
    }

    function onToggle(index, checked) {
      state.items[String(index)] = checked;
      CA.storage.set(storageKey, state);
      syncRemote();
      updateProgress();

      var nowComplete = isAllDone();
      if (nowComplete && !wasComplete) {
        CA.toast('success', 'All required documents are ready.'); // TODO i18n
      }
      wasComplete = nowComplete;
    }

    function renderList() {
      el.docList.innerHTML = '';
      docs.forEach(function (name, index) {
        var li = document.createElement('li');
        li.className = 'checklist-row';

        var label = document.createElement('label');
        label.className = 'checklist-label';

        var input = document.createElement('input');
        input.type = 'checkbox';
        input.id = 'doc-' + index;
        input.className = 'checklist-check';
        input.checked = isDone(index);
        input.setAttribute('aria-labelledby', 'doc-name-' + index);

        var nameSpan = document.createElement('span');
        nameSpan.id = 'doc-name-' + index;
        nameSpan.className = 'checklist-name';
        nameSpan.textContent = name;

        var badge = document.createElement('span');
        badge.className = 'badge-muted row-badge';
        badge.dataset.index = String(index);

        label.appendChild(input);
        label.appendChild(nameSpan);
        li.appendChild(label);
        li.appendChild(badge);
        el.docList.appendChild(li);

        input.addEventListener('change', function () {
          onToggle(index, input.checked);
        });
      });
    }

    if (!id) {
      showNotFound();
      return;
    }

    el.backLink.href = 'scheme-detail.html?id=' + encodeURIComponent(id);
    el.guideLink.href = 'application-guide.html?id=' + encodeURIComponent(id);
    el.loadingArea.hidden = false;

    loadScheme(id).then(function (scheme) {
      el.loadingArea.hidden = true;

      if (!scheme) {
        showNotFound();
        return;
      }

      if (scheme.name) {
        el.schemeName.textContent = scheme.name;
      }

      docs = getDocuments(scheme);
      state = normaliseState(CA.storage.get(storageKey, { items: {} }));

      if (docs.length === 0) {
        el.emptyState.hidden = false;
        updateProgress();
        return;
      }

      renderList();
      updateProgress();
      wasComplete = isAllDone();
    });

    el.saveBtn.addEventListener('click', function () {
      CA.storage.set(storageKey, state);
      syncRemote();
      CA.toast('success', tr('toast.success.default', 'Saved successfully.'));
    });

    document.addEventListener('civicassist:langchange', function () {
      refreshStatusBadge();
      refreshRowBadges();
    });
  });
})();
