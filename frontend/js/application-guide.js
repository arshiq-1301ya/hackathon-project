/* Application guide page logic. Uses window.CivicAssist and window.CIVICASSIST_API. */
(function () {
  'use strict';

  var CA = window.CivicAssist;
  var API = window.CIVICASSIST_API || {};

  var SAMPLE_STEPS = [
    'Gather your documents',
    'Open the official application portal',
    'Fill in your details',
    'Upload or submit documents',
    'Save the acknowledgement'
  ];

  function tr(key, fallback) {
    var value = CA.t(key);
    return (!value || value === key) ? fallback : value;
  }

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
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
    if (!Array.isArray(scheme.requiredDocuments)) {
      return [];
    }
    return scheme.requiredDocuments.filter(isNonEmptyString);
  }

  function buildSteps(scheme) {
    if (Array.isArray(scheme.applicationSteps)) {
      var real = scheme.applicationSteps.filter(isNonEmptyString);
      if (real.length > 0) {
        return real.map(function (title) {
          return { title: title, body: '', sample: false };
        });
      }
    }
    return SAMPLE_STEPS.map(function (title, i) {
      return {
        title: 'Sample step ' + (i + 1) + ': ' + title,
        body: 'Follow the portal instructions for this step.',
        sample: true
      };
    });
  }

  CA.registerPage(function () {
    var params = new URLSearchParams(window.location.search);
    var id = params.get('id');

    var el = {
      schemeName: document.getElementById('schemeName'),
      demoBadge: document.getElementById('demoBadge'),
      notFound: document.getElementById('notFound'),
      guideProgressText: document.getElementById('guideProgressText'),
      guideProgressBar: document.getElementById('guideProgressBar'),
      stepTitle: document.getElementById('stepTitle'),
      stepBody: document.getElementById('stepBody'),
      prevBtn: document.getElementById('prevBtn'),
      nextBtn: document.getElementById('nextBtn'),
      docSummary: document.getElementById('docSummary'),
      portalLink: document.getElementById('officialPortalLink'),
      portalNote: document.getElementById('portalNote'),
      saveAppBtn: document.getElementById('saveAppBtn')
    };

    var steps = [];
    var docs = [];
    var index = 0;
    var finished = false;
    var scheme = null;
    var storageKey = 'guide.' + id;

    function showNotFound() {
      el.notFound.hidden = false;
    }

    function applyNavText() {
      var isLast = steps.length > 0 && index === steps.length - 1;
      el.nextBtn.textContent = isLast
        ? tr('btn.finish', 'Finish') // TODO i18n
        : tr('btn.next', 'Next');
    }

    function render() {
      var total = steps.length;
      var step = steps[index];

      el.guideProgressText.textContent = 'Step ' + (index + 1) + ' of ' + total; // TODO i18n
      el.guideProgressBar.style.width = Math.round(((index + 1) / total) * 100) + '%';
      el.guideProgressBar.setAttribute('aria-valuenow', String(Math.round(((index + 1) / total) * 100)));

      el.stepTitle.textContent = step.title;
      el.stepBody.textContent = step.body;
      el.stepBody.hidden = !step.body;

      el.prevBtn.disabled = index === 0;
      applyNavText();
      el.nextBtn.disabled = finished;
    }

    function goTo(newIndex) {
      index = newIndex;
      finished = false;
      CA.storage.set(storageKey, index);
      render();
    }

    function renderDocs() {
      el.docSummary.innerHTML = '';
      if (docs.length === 0) {
        var empty = document.createElement('li');
        empty.textContent = 'No documents listed for this scheme yet.'; // TODO i18n
        el.docSummary.appendChild(empty);
        return;
      }
      docs.forEach(function (name) {
        var li = document.createElement('li');
        li.textContent = name;
        el.docSummary.appendChild(li);
      });
    }

    function renderPortal() {
      var url = scheme.officialApplicationUrl;
      var isHttps = isNonEmptyString(url) && url.indexOf('https://') === 0;

      if (isHttps) {
        el.portalLink.href = url;
        el.portalLink.rel = 'noopener noreferrer';
        el.portalLink.target = '_blank';
        el.portalLink.hidden = false;
        el.portalNote.hidden = true;
      } else {
        el.portalLink.hidden = true;
        el.portalNote.hidden = false;
      }
    }

    function saveApplication() {
      Promise.resolve()
        .then(function () { return API.createApplication({ schemeId: id }); })
        .then(function () {
          CA.toast('success', tr('toast.success.default', 'Saved successfully.'));
        }, function (err) {
          if (err && err.status === 409) {
            CA.toast('info', 'This application is already saved.'); // TODO i18n
          } else {
            CA.toast('error', (err && err.message) || CA.t('toast.networkError'));
          }
        });
    }

    if (!id) {
      showNotFound();
      return;
    }

    loadScheme(id).then(function (loaded) {
      if (!loaded) {
        showNotFound();
        return;
      }

      scheme = loaded;
      if (scheme.name) {
        el.schemeName.textContent = scheme.name;
      }
      if (scheme.isDemo === true) {
        el.demoBadge.hidden = false;
      }

      steps = buildSteps(scheme);
      docs = getDocuments(scheme);

      var saved = Number(CA.storage.get(storageKey, 0));
      index = Math.min(Math.max(0, Number.isFinite(saved) ? Math.floor(saved) : 0), steps.length - 1);

      renderDocs();
      renderPortal();
      render();

      el.prevBtn.addEventListener('click', function () {
        if (index > 0) {
          goTo(index - 1);
        }
      });

      el.nextBtn.addEventListener('click', function () {
        if (index < steps.length - 1) {
          goTo(index + 1);
          return;
        }
        if (!finished) {
          finished = true;
          render();
          CA.toast('success', 'Application guide finished.'); // TODO i18n
        }
      });

      el.saveAppBtn.addEventListener('click', saveApplication);
    });

    document.addEventListener('civicassist:langchange', applyNavText);
  });
})();
