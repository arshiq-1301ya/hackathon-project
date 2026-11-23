/*
 * CivicAssist shared app runtime.
 * Loads after translations.js, api.js and ai-service.js on every page.
 * Provides i18n, language selector, mobile nav, active nav link,
 * toasts, confirm dialog, storage helper and global error handling.
 */
(function () {
  'use strict';

  var FALLBACK_LANG = 'en';
  var STORAGE_KEY = 'civicassist.lang';
  var STORAGE_PREFIX = 'civicassist.';
  var LANG_EVENT = 'civicassist:langchange';

  var I18N = window.CIVICASSIST_I18N || {};
  var SUPPORTED = Array.isArray(I18N.SUPPORTED_LANGUAGES) && I18N.SUPPORTED_LANGUAGES.length
    ? I18N.SUPPORTED_LANGUAGES
    : [{ code: FALLBACK_LANG, name: 'English', dir: 'ltr' }];
  var DEFAULT_LANG = I18N.DEFAULT_LANGUAGE || FALLBACK_LANG;
  var TRANSLATIONS = I18N.TRANSLATIONS || {};

  var currentLang = FALLBACK_LANG;
  var pageInits = [];
  var pagesReady = false;
  var reportingError = false;

  function hasOwn(obj, key) {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function findLang(code) {
    for (var i = 0; i < SUPPORTED.length; i += 1) {
      if (SUPPORTED[i] && SUPPORTED[i].code === code) return SUPPORTED[i];
    }
    return null;
  }

  /* ---------- i18n ---------- */

  function getStoredLanguage() {
    try {
      var stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && findLang(stored)) return stored;
    } catch (e) {
      /* storage unavailable (private mode) */
    }
    return findLang(DEFAULT_LANG) ? DEFAULT_LANG : FALLBACK_LANG;
  }

  function saveLanguage(code) {
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch (e) {
      /* quota / private mode: ignore */
    }
  }

  function t(key, vars) {
    var dict = TRANSLATIONS[currentLang] || {};
    var en = TRANSLATIONS[FALLBACK_LANG] || {};
    var str;
    if (hasOwn(dict, key)) str = dict[key];
    else if (hasOwn(en, key)) str = en[key];
    else return key;
    if (typeof str !== 'string') return key;
    if (vars && typeof vars === 'object') {
      str = str.replace(/\{(\w+)\}/g, function (match, name) {
        return hasOwn(vars, name) ? String(vars[name]) : match;
      });
    }
    return str;
  }

  function applyTranslations() {
    var root = document;
    Array.prototype.forEach.call(root.querySelectorAll('[data-i18n]'), function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-i18n-placeholder]'), function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-i18n-aria-label]'), function (el) {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')));
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-i18n-title]'), function (el) {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
  }

  function syncLangSelect() {
    var select = document.getElementById('langSelect');
    if (select && select.value !== currentLang) select.value = currentLang;
  }

  function setLanguage(code) {
    var lang = findLang(code);
    if (!lang) return false;
    currentLang = lang.code;

    var root = document.documentElement;
    root.lang = lang.code;
    root.dir = lang.dir || 'ltr';

    applyTranslations();
    syncLangSelect();
    saveLanguage(lang.code);

    document.dispatchEvent(new CustomEvent(LANG_EVENT, { detail: { lang: lang.code } }));
    return true;
  }

  function getLanguage() {
    return currentLang;
  }

  /* ---------- language selector ---------- */

  function populateLangSelect() {
    var select = document.getElementById('langSelect');
    if (!select) return;
    select.innerHTML = '';
    SUPPORTED.forEach(function (lang) {
      var option = document.createElement('option');
      option.value = lang.code;
      option.textContent = lang.name;
      select.appendChild(option);
    });
    select.value = currentLang;
    select.setAttribute('aria-label', t('nav.language'));
    select.addEventListener('change', function () {
      setLanguage(select.value);
    });
    document.addEventListener(LANG_EVENT, function () {
      select.setAttribute('aria-label', t('nav.language'));
    });
  }

  /* ---------- mobile nav ---------- */

  function initNavToggle() {
    var toggle = document.querySelector('.nav-toggle');
    var header = document.querySelector('.site-header');
    if (!toggle || !header) return;

    function setOpen(open) {
      header.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', t(open ? 'nav.closeMenu' : 'nav.openMenu'));
    }

    toggle.addEventListener('click', function () {
      setOpen(!header.classList.contains('nav-open'));
    });

    Array.prototype.forEach.call(document.querySelectorAll('.nav-link'), function (link) {
      link.addEventListener('click', function () {
        setOpen(false);
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && header.classList.contains('nav-open')) {
        setOpen(false);
        toggle.focus();
      }
    });

    document.addEventListener(LANG_EVENT, function () {
      setOpen(header.classList.contains('nav-open'));
    });

    setOpen(header.classList.contains('nav-open'));
  }

  /* ---------- active nav link ---------- */

  function lastSegment(path) {
    var clean = String(path || '').split('?')[0].split('#')[0];
    var parts = clean.split('/');
    var seg = parts[parts.length - 1] || '';
    return seg === 'index.html' ? '' : seg;
  }

  function initActiveNavLink() {
    var current = lastSegment(window.location.pathname);
    Array.prototype.forEach.call(document.querySelectorAll('.nav-link'), function (link) {
      var href = link.getAttribute('href') || '';
      var isMatch = lastSegment(link.pathname || href) === current;
      link.classList.toggle('is-active', isMatch);
      if (isMatch) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  /* ---------- toast ---------- */

  function getToastContainer() {
    var container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      container.setAttribute('aria-live', 'polite');
      document.body.appendChild(container);
    }
    return container;
  }

  function toast(type, message, options) {
    var kind = (type === 'success' || type === 'error' || type === 'info') ? type : 'info';
    var container = getToastContainer();

    var el = document.createElement('div');
    el.className = 'toast toast-' + kind;

    var text = document.createElement('span');
    text.className = 'toast-message';
    text.textContent = message == null ? '' : String(message);

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.setAttribute('aria-label', t('toast.close'));
    close.textContent = '\u00D7';

    el.appendChild(text);
    el.appendChild(close);
    container.appendChild(el);

    var duration = options && typeof options.duration === 'number'
      ? options.duration
      : (kind === 'error' ? 6000 : 4000);
    var dismissed = false;
    var timer = null;

    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      if (timer) clearTimeout(timer);
      el.classList.add('toast-leave');
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 250);
    }

    close.addEventListener('click', dismiss);
    timer = setTimeout(dismiss, duration);
    return el;
  }

  /* ---------- confirm dialog ---------- */

  function confirmDialog(message, options) {
    options = options || {};
    return new Promise(function (resolve) {
      var previouslyFocused = document.activeElement;
      var done = false;

      var backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';

      var modal = document.createElement('div');
      modal.className = 'modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');

      var p = document.createElement('p');
      p.textContent = message == null ? '' : String(message);

      var actions = document.createElement('div');
      actions.className = 'modal-actions';

      var cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn btn-secondary';
      cancelBtn.textContent = t('btn.cancel');

      var confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.className = options.danger ? 'btn btn-danger' : 'btn btn-primary';
      confirmBtn.textContent = options.confirmText || t('btn.confirm');

      actions.appendChild(cancelBtn);
      actions.appendChild(confirmBtn);
      modal.appendChild(p);
      modal.appendChild(actions);
      backdrop.appendChild(modal);

      function onKey(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          close(false);
        }
      }

      function close(result) {
        if (done) return;
        done = true;
        document.removeEventListener('keydown', onKey, true);
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
          try { previouslyFocused.focus(); } catch (e) { /* ignore */ }
        }
        resolve(result);
      }

      backdrop.addEventListener('click', function (e) {
        if (e.target === backdrop) close(false);
      });
      cancelBtn.addEventListener('click', function () { close(false); });
      confirmBtn.addEventListener('click', function () { close(true); });
      document.addEventListener('keydown', onKey, true);

      document.body.appendChild(backdrop);
      confirmBtn.focus();
      requestAnimationFrame(function () {
        backdrop.classList.add('is-open');
      });
    });
  }

  /* ---------- storage helper ---------- */

  var storage = {
    get: function (key, fallback) {
      try {
        var raw = window.localStorage.getItem(STORAGE_PREFIX + key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set: function (key, value) {
      try {
        window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    },
    remove: function (key) {
      try {
        window.localStorage.removeItem(STORAGE_PREFIX + key);
        return true;
      } catch (e) {
        return false;
      }
    }
  };

  /* ---------- helpers ---------- */

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ---------- global error reporting ---------- */

  function reportError() {
    if (reportingError) return;
    reportingError = true;
    try {
      toast('error', t('toast.error.default'));
    } catch (e) {
      /* avoid recursive reporting */
    }
    setTimeout(function () { reportingError = false; }, 1000);
  }

  window.addEventListener('error', function (event) {
    if (event.target !== window) return;
    reportError();
  });

  window.addEventListener('unhandledrejection', function () {
    reportError();
  });

  /* ---------- page registration & init ---------- */

  function runPageInit(fn) {
    try {
      fn();
    } catch (e) {
      reportError();
    }
  }

  function registerPage(fn) {
    if (typeof fn !== 'function') return;
    pageInits.push(fn);
    if (pagesReady) runPageInit(fn);
  }

  function safeStep(step) {
    try {
      step();
    } catch (e) {
      reportError();
    }
  }

  function onReady() {
    safeStep(applyTranslations);
    safeStep(populateLangSelect);
    safeStep(syncLangSelect);
    safeStep(initNavToggle);
    safeStep(initActiveNavLink);
    pagesReady = true;
    pageInits.forEach(runPageInit);
  }

  /* ---------- expose API ---------- */

  window.CivicAssist = window.CivicAssist || {};
  window.CivicAssist.t = t;
  window.CivicAssist.setLanguage = setLanguage;
  window.CivicAssist.getLanguage = getLanguage;
  window.CivicAssist.toast = toast;
  window.CivicAssist.showToast = toast;
  window.CivicAssist.confirm = confirmDialog;
  window.CivicAssist.storage = storage;
  window.CivicAssist.registerPage = registerPage;
  window.CivicAssist.escapeHtml = escapeHtml;

  /* Apply stored language before page scripts run. */
  currentLang = getStoredLanguage();
  setLanguage(currentLang);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
})();
const themeToggle = document.getElementById("themeToggle");

if (themeToggle) {
    const savedTheme = localStorage.getItem("theme");

    if (savedTheme === "dark") {
        document.body.classList.add("dark-mode");
        themeToggle.textContent = "☀️";
    }

    themeToggle.addEventListener("click", () => {
        document.body.classList.toggle("dark-mode");

        const isDark = document.body.classList.contains("dark-mode");

        localStorage.setItem("theme", isDark ? "dark" : "light");

        themeToggle.textContent = isDark ? "☀️" : "🌙";
    });
}
