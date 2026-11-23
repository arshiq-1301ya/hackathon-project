/* scheme-detail.js — logic for pages/scheme-detail.html
 * Scheme data comes from storage 'scheme.selected' (if it matches the id in the
 * URL) or from CIVICASSIST_API.getScheme(id). No sample data is used here. */
(function () {
  'use strict';

  var CA = window.CivicAssist;
  var API = window.CIVICASSIST_API;

  var dom = {};
  var currentId = '';
  var currentScheme = null;

  // TODO i18n: fallback copy
  var NOT_VERIFIED = 'Not yet verified';
  var BENEFITS_PENDING = 'Benefits will be shown here once verified by the official source.';
  var DETAILS_PENDING = 'Details will be shown here once they are available.';

  function fillList(listEl, items, fallback) {
    listEl.textContent = '';
    var values = Array.isArray(items) ? items : (items ? [String(items)] : []);
    if (!values.length) {
      var empty = document.createElement('li');
      empty.textContent = fallback;
      listEl.appendChild(empty);
      return;
    }
    values.forEach(function (value) {
      var li = document.createElement('li');
      li.textContent = String(value);
      listEl.appendChild(li);
    });
  }

  function setOfficialLink(linkEl, textEl, url) {
    var isSecure = typeof url === 'string' && url.indexOf('https://') === 0;
    if (isSecure) {
      linkEl.href = url;
      linkEl.textContent = url;
      linkEl.hidden = false;
      textEl.hidden = true;
    } else {
      linkEl.hidden = true;
      linkEl.removeAttribute('href');
      textEl.hidden = false;
      textEl.textContent = NOT_VERIFIED;
    }
  }

  function setText(el, value, fallback) {
    el.textContent = value ? String(value) : fallback;
  }

  // Converts any value to display text without ever producing "[object Object]".
  function toText(value) {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.map(toText).filter(Boolean).join(', ');
    if (typeof value === 'object') {
      try { return JSON.stringify(value); } catch (err) { return ''; }
    }
    return String(value);
  }

  // Maps one eligibility rule { field, operator, value, description } to display text.
  function ruleText(rule) {
    if (typeof rule === 'string') return rule.trim();
    if (!rule || typeof rule !== 'object') return '';
    var desc = typeof rule.description === 'string' ? rule.description.trim() : '';
    if (desc) return desc;
    var parts = [toText(rule.field), toText(rule.operator), toText(rule.value)].filter(Boolean);
    var text = parts.join(' ');
    if (text && (rule.value === null || rule.value === undefined)) {
      text += ' (not yet defined in our data)'; // TODO i18n
    }
    return text;
  }

  function eligibilityLines(rules) {
    if (!Array.isArray(rules)) return [];
    return rules.map(ruleText).filter(Boolean);
  }

  var savedToList = false;
  var saving = false;

  // Scheme id of a backend application (schemeId is populated as {_id, name, ...}).
  function schemeIdOf(app) {
    var s = app && app.schemeId;
    if (s && typeof s === 'object') return String(s._id || '');
    return s ? String(s) : '';
  }

  // Button text and aria state for the saved / not-saved view.
  function renderSaveState(saved) {
    savedToList = !!saved;
    dom.saveBtn.textContent = savedToList ? 'Saved to My Applications' : 'Save Application'; // TODO i18n
    dom.saveBtn.setAttribute('aria-pressed', savedToList ? 'true' : 'false');
  }

  // Asks the backend whether this user already has an application for this scheme.
  function loadSavedState() {
    return API.listApplications().then(function (res) {
      var apps = res && res.data && Array.isArray(res.data.applications) ? res.data.applications : [];
      renderSaveState(apps.some(function (app) { return schemeIdOf(app) === currentId; }));
    }, function () {
      renderSaveState(false);
      CA.toast('error', CA.t('toast.networkError'));
    });
  }

  function renderScheme(s) {
    currentScheme = s;
    dom.name.textContent = s.name ? String(s.name) : 'Scheme details';
    dom.demoBadge.hidden = true; // backend has no isDemo field

    setText(dom.overview, s.description, 'No overview available yet.'); // TODO i18n

    // benefits is a <p> in the page: join the string array for display.
    var benefitList = Array.isArray(s.benefits) ? s.benefits.map(toText).filter(Boolean) : [];
    dom.benefits.textContent = benefitList.length ? benefitList.join('; ') : BENEFITS_PENDING;

    fillList(dom.eligibility, eligibilityLines(s.eligibility), 'Eligibility criteria not yet available.'); // TODO i18n
    dom.whoCanApply.textContent = DETAILS_PENDING; // no backend field for this yet
    fillList(dom.documents, s.requiredDocuments, 'Required documents not yet available.'); // TODO i18n
    fillList(dom.instructions, s.applicationSteps, 'Application instructions not yet available.'); // TODO i18n

    setOfficialLink(dom.officialSource, dom.officialSourceText, s.officialSource);

    // No backend application URL exists yet: hide the apply link and its placeholder text.
    dom.officialApply.hidden = true;
    dom.officialApply.removeAttribute('href');
    dom.officialApplyText.hidden = true;

    var verified = s.lastVerified ? new Date(s.lastVerified) : null;
    dom.lastVerified.textContent = verified && !isNaN(verified.getTime())
      ? verified.toLocaleDateString()
      : NOT_VERIFIED;

    var encodedId = encodeURIComponent(currentId);
    dom.viewDocs.href = 'checklist.html?id=' + encodedId;
    dom.howToApply.href = 'application-guide.html?id=' + encodedId;

    loadSavedState();
    showContent();
  }

  function showLoading(on) {
    dom.loading.hidden = !on;
    dom.content.hidden = on;
    dom.actions.hidden = on;
  }

  function showContent() {
    showLoading(false);
    dom.notFound.hidden = true;
  }

  function showNotFound() {
    showLoading(false);
    dom.notFound.hidden = false;
    dom.name.textContent = 'Scheme not found'; // TODO i18n
    dom.demoBadge.hidden = true;
  }

  function saveApplication() {
    if (!currentScheme || saving) return;
    if (savedToList) {
      CA.toast('info', 'This scheme is already in My Applications.'); // TODO i18n
      return;
    }

    saving = true;
    dom.saveBtn.disabled = true;
    API.createApplication({ schemeId: currentId }).then(function () {
      renderSaveState(true);
      CA.toast('success', 'Application saved to My Applications.'); // TODO i18n
    }, function (err) {
      if (err && err.status === 409) {
        // Backend already has an application for this scheme: treat as saved.
        renderSaveState(true);
        CA.toast('info', 'This scheme is already in My Applications.'); // TODO i18n
      } else {
        CA.toast('error', (err && err.message) || CA.t('toast.networkError'));
      }
    }).then(function () {
      saving = false;
      dom.saveBtn.disabled = false;
    });
  }

  async function loadScheme() {
    var stored = CA.storage.get('scheme.selected', null);
    if (stored && String(stored._id || stored.id) === currentId) {
      renderScheme(stored);
      return;
    }

    showLoading(true);
    var scheme = null;
    try {
      scheme = await API.getScheme(currentId);
    } catch (err) {
      CA.toast('error', CA.t('toast.networkError'));
      scheme = null;
    }

    if (scheme && typeof scheme === 'object') {
      renderScheme(scheme);
    } else {
      showNotFound();
    }
  }

  function init() {
    dom.name = document.getElementById('schemeName');
    dom.demoBadge = document.getElementById('demoBadge');
    dom.overview = document.getElementById('overview');
    dom.benefits = document.getElementById('benefits');
    dom.eligibility = document.getElementById('eligibility');
    dom.whoCanApply = document.getElementById('whoCanApply');
    dom.documents = document.getElementById('documents');
    dom.instructions = document.getElementById('instructions');
    dom.officialSource = document.getElementById('officialSource');
    dom.officialSourceText = document.getElementById('officialSourceText');
    dom.officialApply = document.getElementById('officialApplyUrl');
    dom.officialApplyText = document.getElementById('officialApplyText');
    dom.lastVerified = document.getElementById('lastVerified');
    dom.viewDocs = document.getElementById('viewDocsBtn');
    dom.howToApply = document.getElementById('howToApplyBtn');
    dom.saveBtn = document.getElementById('saveAppBtn');
    dom.loading = document.getElementById('loadingArea');
    dom.notFound = document.getElementById('notFound');
    dom.content = document.getElementById('detailContent');
    dom.actions = dom.saveBtn.parentNode;

    currentId = new URLSearchParams(window.location.search).get('id') || '';
    if (!currentId) {
      showNotFound();
      return;
    }

    dom.saveBtn.addEventListener('click', saveApplication);
    loadScheme();
  }

  CA.registerPage(init);
})();
