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

  function findSaved(list, id) {
    return list.some(function (app) { return String(app.id) === id; });
  }

  function renderSaveState() {
    var list = CA.storage.get('applications.list', []);
    var saved = Array.isArray(list) && findSaved(list, currentId);
    dom.saveBtn.textContent = saved ? 'Saved to My Applications' : 'Save Application'; // TODO i18n
    dom.saveBtn.setAttribute('aria-pressed', saved ? 'true' : 'false');
  }

  function renderScheme(s) {
    currentScheme = s;
    dom.name.textContent = s.name ? String(s.name) : 'Scheme details';
    dom.demoBadge.hidden = s.isDemo !== true;

    setText(dom.overview, s.description || s.overview, 'No overview available yet.'); // TODO i18n

    if (s.benefits && s.verified === true) {
      dom.benefits.textContent = String(s.benefits);
    } else {
      dom.benefits.textContent = BENEFITS_PENDING;
    }

    fillList(dom.eligibility, s.eligibility, 'Eligibility criteria not yet available.'); // TODO i18n
    setText(dom.whoCanApply, s.whoCanApply, DETAILS_PENDING);
    fillList(dom.documents, s.documents, 'Required documents not yet available.'); // TODO i18n
    fillList(dom.instructions, s.instructions, 'Application instructions not yet available.'); // TODO i18n

    setOfficialLink(dom.officialSource, dom.officialSourceText, s.officialSourceUrl);
    setOfficialLink(dom.officialApply, dom.officialApplyText, s.officialApplyUrl);
    setText(dom.lastVerified, s.lastVerified, NOT_VERIFIED);

    var encodedId = encodeURIComponent(currentId);
    dom.viewDocs.href = 'checklist.html?id=' + encodedId;
    dom.howToApply.href = 'application-guide.html?id=' + encodedId;

    renderSaveState();
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
    if (!currentScheme) return;
    var list = CA.storage.get('applications.list', []);
    if (!Array.isArray(list)) list = [];

    if (findSaved(list, currentId)) {
      CA.toast('info', 'This scheme is already in My Applications.'); // TODO i18n
    } else {
      list.push({
        id: currentId,
        name: currentScheme.name ? String(currentScheme.name) : currentId,
        status: 'NOT_STARTED',
        deadline: null,
        reminderDate: null,
        progress: 0,
        createdAt: new Date().toISOString()
      });
      CA.storage.set('applications.list', list);
      CA.toast('success', 'Application saved to My Applications.'); // TODO i18n
    }
    renderSaveState();
  }

  async function loadScheme() {
    var stored = CA.storage.get('scheme.selected', null);
    if (stored && String(stored.id) === currentId) {
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
