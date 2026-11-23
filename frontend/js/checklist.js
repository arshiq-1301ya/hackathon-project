/* Document checklist page logic. Uses window.CivicAssist and window.CIVICASSIST_API.
 * State comes from the backend: GET /schemes/:id/checklist. The saved checklist is created
 * on the first change (POST /checklists) and each toggle is saved with PATCH /checklists/:id.
 * No local-only state: a failed save reverts the toggle. */
(function () {
  'use strict';

  var CA = window.CivicAssist;
  var API = window.CIVICASSIST_API || {};

  function tr(key, fallback) {
    var value = CA.t(key);
    return (!value || value === key) ? fallback : value;
  }

  function errorMessage(err) {
    return (err && err.message) || tr('toast.networkError', 'Something went wrong.');
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

    // Server checklist: { _id, schemeId, persisted, items: [{ key, label, completed, completedAt }] } or null.
    var checklist = null;
    var rows = [];              // rendered rows: { key, input, badge }
    var pending = {};           // key -> number of unsaved updates in flight
    var saved = {};             // key -> last completed value confirmed by the server
    var creating = null;        // shared in-flight createChecklist request
    var wasComplete = false;

    function showNotFound() {
      el.loadingArea.hidden = true;
      el.notFound.hidden = false;
    }

    function items() {
      return checklist && Array.isArray(checklist.items) ? checklist.items : [];
    }

    function itemFor(key) {
      var list = items();
      for (var i = 0; i < list.length; i++) {
        if (list[i].key === key) return list[i];
      }
      return null;
    }

    function completedCount() {
      return items().filter(function (item) { return item.completed === true; }).length;
    }

    function isAllDone() {
      return items().length > 0 && completedCount() === items().length;
    }

    function refreshStatusBadge() {
      var complete = isAllDone();
      el.statusBadge.className = complete ? 'badge-success' : 'badge-muted';
      el.statusBadge.textContent = complete
        ? tr('status.completed', 'Completed')
        : tr('status.pending', 'Pending');
    }

    // Keeps checkbox and badge in step with local state; never rebuilds rows.
    function refreshRowBadges() {
      rows.forEach(function (row) {
        var item = itemFor(row.key);
        var done = !!(item && item.completed === true);
        row.input.checked = done;
        row.badge.className = done ? 'badge-success row-badge' : 'badge-muted row-badge';
        row.badge.textContent = done
          ? tr('status.completed', 'Completed')
          : tr('status.pending', 'Pending');
      });
    }

    function updateProgress() {
      var total = items().length;
      var done = completedCount();
      var percent = total ? Math.round((done / total) * 100) : 0;

      el.progressText.textContent = done + ' of ' + total + ' completed'; // TODO i18n
      el.progressPercent.textContent = percent + '%';
      el.progressBar.style.width = percent + '%';
      el.progressBar.setAttribute('aria-valuenow', String(percent));

      refreshStatusBadge();
      refreshRowBadges();
    }

    // Replaces local checklist state with the server copy. Items with unsaved local
    // changes keep their local value until the server confirms them.
    function adoptServerChecklist(c) {
      var local = {};
      items().forEach(function (item) { local[item.key] = item.completed === true; });

      var previousItems = items();
      var serverItems = Array.isArray(c.items) ? c.items : previousItems;

      checklist = {
        _id: c._id || null,
        schemeId: c.schemeId,
        persisted: c.persisted === true,
        items: serverItems.map(function (item) {
          saved[item.key] = item.completed === true;
          var keepLocal = pending[item.key] > 0 && Object.prototype.hasOwnProperty.call(local, item.key);
          return {
            key: item.key,
            label: item.label,
            completed: keepLocal ? local[item.key] : item.completed === true,
            completedAt: item.completedAt || null
          };
        })
      };
    }

    // Returns the saved checklist, creating it on first use. Concurrent callers share one request.
    function ensureChecklist() {
      if (checklist && checklist._id) return Promise.resolve(checklist);
      if (!creating) {
        creating = API.createChecklist(id).then(function (res) {
          var c = res && res.data && res.data.checklist;
          if (!c || !c._id) throw new Error('Checklist could not be saved.');
          adoptServerChecklist(c);
          return checklist;
        }).then(function (cl) {
          creating = null;
          return cl;
        }, function (err) {
          creating = null;
          throw err;
        });
      }
      return creating;
    }

    function finishPending(key) {
      pending[key] = (pending[key] || 1) - 1;
      if (pending[key] <= 0) delete pending[key];
    }

    function onToggle(key, checked) {
      var item = itemFor(key);
      if (!item) return;

      item.completed = checked;
      pending[key] = (pending[key] || 0) + 1;
      updateProgress();

      var nowComplete = isAllDone();
      if (nowComplete && !wasComplete) {
        CA.toast('success', 'All required documents are ready.'); // TODO i18n
      }
      wasComplete = nowComplete;

      ensureChecklist()
        .then(function (cl) {
          return API.updateChecklist(cl._id, [{ key: key, completed: checked }]);
        })
        .then(function (res) {
          finishPending(key);
          var c = res && res.data && res.data.checklist;
          if (c) adoptServerChecklist(c);
          updateProgress();
          wasComplete = isAllDone();
        }, function (err) {
          finishPending(key);
          var current = itemFor(key);
          // Revert to the last server value unless a newer toggle for this item is still in flight.
          if (current && !pending[key]) current.completed = saved[key] === true;
          updateProgress();
          wasComplete = isAllDone();
          CA.toast('error', errorMessage(err));
        });
    }

    function renderList() {
      el.docList.innerHTML = '';
      rows = [];
      items().forEach(function (item, index) {
        var li = document.createElement('li');
        li.className = 'checklist-row';

        var label = document.createElement('label');
        label.className = 'checklist-label';

        var input = document.createElement('input');
        input.type = 'checkbox';
        input.id = 'doc-' + index;
        input.className = 'checklist-check';
        input.checked = item.completed === true;
        input.setAttribute('aria-labelledby', 'doc-name-' + index);

        var nameSpan = document.createElement('span');
        nameSpan.id = 'doc-name-' + index;
        nameSpan.className = 'checklist-name';
        nameSpan.textContent = String(item.label || item.key);

        var badge = document.createElement('span');
        badge.className = 'badge-muted row-badge';

        label.appendChild(input);
        label.appendChild(nameSpan);
        li.appendChild(label);
        li.appendChild(badge);
        el.docList.appendChild(li);

        rows.push({ key: item.key, input: input, badge: badge });

        input.addEventListener('change', function () {
          onToggle(item.key, input.checked);
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

    API.getSchemeChecklist(id).then(function (res) {
      var data = (res && res.data) || {};
      el.loadingArea.hidden = true;

      if (!data.checklist) {
        showNotFound();
        return;
      }

      if (data.scheme && data.scheme.name) {
        el.schemeName.textContent = String(data.scheme.name);
      }

      adoptServerChecklist(data.checklist);

      if (items().length === 0) {
        el.emptyState.hidden = false;
        updateProgress();
        return;
      }

      renderList();
      updateProgress();
      wasComplete = isAllDone();
    }, function (err) {
      CA.toast('error', errorMessage(err));
      showNotFound();
    });

    // Every toggle is already saved; this button confirms the checklist exists on the server.
    el.saveBtn.addEventListener('click', function () {
      ensureChecklist().then(function () {
        CA.toast('success', tr('toast.success.default', 'Saved successfully.'));
      }, function (err) {
        CA.toast('error', errorMessage(err));
      });
    });

    document.addEventListener('civicassist:langchange', function () {
      refreshStatusBadge();
      refreshRowBadges();
    });
  });
})();
