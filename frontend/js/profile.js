/* Profile review page: load the saved profile from the backend (or the local draft),
   let the user correct it, save it to the backend, then continue. */
(function () {
  'use strict';

  var CA = window.CivicAssist;
  var FIELDS = ['state', 'educationLevel', 'annualFamilyIncome', 'purpose', 'occupation', 'landStatus', 'otherInfo'];
  var REQUIRED = ['state', 'purpose'];
  var MAX_INCOME = 1e12;
  var CONFIRMED_KEY = 'profile.confirmed';
  var DRAFT_KEY = 'profile.draft';

  function isBlank(value) {
    return value === null || value === undefined || String(value).trim() === '';
  }

  function apiClient() {
    return window.CIVICASSIST_API || null;
  }

  CA.registerPage(function initProfile() {
    var form = document.getElementById('profileForm');
    var emptyState = document.getElementById('emptyState');
    var demoBanner = document.getElementById('demoBanner');
    var submitBtn = form ? form.querySelector('button[type="submit"]') : null;
    var controls = {};

    FIELDS.forEach(function (name) {
      controls[name] = document.getElementById(name);
    });

    function groupOf(name) {
      return document.getElementById('group-' + name);
    }

    function setMissing(name, missing) {
      var group = groupOf(name);
      group.classList.toggle('is-missing', missing);
      group.querySelector('.missing-tag').hidden = !missing;
    }

    // Raw strings straight from the controls.
    function readRaw() {
      var out = {};
      FIELDS.forEach(function (name) {
        out[name] = controls[name].value.trim();
      });
      return out;
    }

    // Canonical values for the backend: income becomes a number or null.
    function collect() {
      var raw = readRaw();
      return {
        state: raw.state,
        educationLevel: raw.educationLevel,
        annualFamilyIncome: raw.annualFamilyIncome === '' ? null : Number(raw.annualFamilyIncome),
        purpose: raw.purpose,
        occupation: raw.occupation,
        landStatus: raw.landStatus === '' ? null : raw.landStatus,
        otherInfo: raw.otherInfo
      };
    }

    function clearFieldError(name) {
      var el = document.getElementById('error-' + name);
      el.textContent = '';
      el.hidden = true;
      controls[name].removeAttribute('aria-invalid');
    }

    function clearAllErrors() {
      FIELDS.forEach(clearFieldError);
    }

    function validate(raw) {
      var errors = {};
      REQUIRED.forEach(function (name) {
        if (raw[name] === '') {
          errors[name] = CA.t('validation.required');
        }
      });
      if (raw.annualFamilyIncome !== '') {
        var income = Number(raw.annualFamilyIncome);
        if (!isFinite(income) || income < 0 || income > MAX_INCOME) {
          // TODO i18n
          errors.annualFamilyIncome = 'Enter a number between 0 and 1,000,000,000,000.';
        }
      }
      return errors;
    }

    function showErrors(errors) {
      var first = null;
      FIELDS.forEach(function (name) {
        if (!errors[name]) {
          return;
        }
        var el = document.getElementById('error-' + name);
        el.textContent = errors[name];
        el.hidden = false;
        controls[name].setAttribute('aria-invalid', 'true');
        if (!first) {
          first = controls[name];
        }
      });
      if (first) {
        first.focus();
      }
    }

    function notifyUser(type, message) {
      if (typeof CA.toast === 'function') {
        CA.toast(type, message);
      }
    }

    // Fills the six fields; empty values are marked missing.
    function fillForm(profile, isDemo) {
      FIELDS.forEach(function (name) {
        var raw = profile[name];
        var blank = isBlank(raw);
        controls[name].value = blank ? '' : String(raw);
        setMissing(name, blank);
      });
      if (demoBanner) {
        demoBanner.hidden = !isDemo;
      }
      emptyState.hidden = true;
      form.hidden = false;
    }

    function showEmpty() {
      emptyState.hidden = false;
      form.hidden = true;
    }

    function redirectToLogin() {
      window.location.href = 'login.html';
    }

    var api = apiClient();
    if (!api || !api.getToken || !api.getToken()) {
      redirectToLogin();
      return;
    }

    var draft = CA.storage.get(DRAFT_KEY, null);
    var localProfile = CA.storage.get(CONFIRMED_KEY, null) || draft;
    var localIsDemo = !!(draft && draft.isDemonstration);

    function useLocal() {
      if (!localProfile) {
        showEmpty();
        return;
      }
      fillForm(localProfile, localIsDemo);
    }

    // Clear errors and update missing markers as the user edits; save each change locally.
    function onEdit(event) {
      var name = event.target.name;
      if (FIELDS.indexOf(name) === -1) {
        return;
      }
      clearFieldError(name);
      setMissing(name, isBlank(controls[name].value));
      CA.storage.set(CONFIRMED_KEY, collect());
    }
    form.addEventListener('input', onEdit);
    form.addEventListener('change', onEdit);

    api.getProfile().then(function (data) {
      if (data && data.exists && data.profile) {
        CA.storage.set(CONFIRMED_KEY, data.profile);
        fillForm(data.profile, false);
      } else {
        useLocal();
      }
    }, function (err) {
      if (err && err.status === 401) {
        api.logout();
        redirectToLogin();
        return;
      }
      useLocal();
      notifyUser('error', (err && err.message) || 'Could not load your saved profile.');
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      clearAllErrors();

      var raw = readRaw();
      var errors = validate(raw);
      if (Object.keys(errors).length > 0) {
        showErrors(errors);
        return;
      }

      var payload = collect();
      if (submitBtn) {
        submitBtn.disabled = true;
      }
      api.saveProfile(payload).then(function (data) {
        var saved = data && data.profile ? data.profile : payload;
        CA.storage.set(CONFIRMED_KEY, saved);
        notifyUser('success', 'Profile saved.');
        setTimeout(function () {
          window.location.href = 'results.html';
        }, 600);
      }, function (err) {
        if (submitBtn) {
          submitBtn.disabled = false;
        }
        if (err && err.status === 401) {
          api.logout();
          redirectToLogin();
          return;
        }
        notifyUser('error', (err && err.message) || 'Could not save your profile. Please try again.');
      });
    });
  });
})();
