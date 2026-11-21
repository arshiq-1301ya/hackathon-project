/* Profile review page: show extracted profile, let the user correct it, confirm and continue. */
(function () {
  'use strict';

  var CA = window.CivicAssist;
  var FIELDS = ['state', 'educationLevel', 'annualFamilyIncome', 'purpose', 'occupation', 'otherInfo'];
  var REQUIRED = ['state', 'purpose'];
  var MAX_INCOME = 1e12;
  var CONFIRMED_KEY = 'profile.confirmed';
  var DRAFT_KEY = 'profile.draft';

  function isBlank(value) {
    return value === null || value === undefined || String(value).trim() === '';
  }

  CA.registerPage(function initProfile() {
    var form = document.getElementById('profileForm');
    var emptyState = document.getElementById('emptyState');
    var demoBanner = document.getElementById('demoBanner');
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

    // Normalised values for storage: income becomes a number or null.
    function collect() {
      var raw = readRaw();
      return {
        state: raw.state,
        educationLevel: raw.educationLevel,
        annualFamilyIncome: raw.annualFamilyIncome === '' ? null : Number(raw.annualFamilyIncome),
        purpose: raw.purpose,
        occupation: raw.occupation,
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

    var draft = CA.storage.get(DRAFT_KEY, null);
    var profile = CA.storage.get(CONFIRMED_KEY, null) || draft;

    if (!profile) {
      emptyState.hidden = false;
      form.hidden = true;
      return;
    }

    FIELDS.forEach(function (name) {
      var raw = profile[name];
      var blank = isBlank(raw);
      controls[name].value = blank ? '' : String(raw);
      setMissing(name, blank);
    });

    if (draft && draft.isDemonstration) {
      demoBanner.hidden = false;
    }

    // Clear errors and update missing markers as the user edits; save each change.
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

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      clearAllErrors();

      var raw = readRaw();
      var errors = validate(raw);
      if (Object.keys(errors).length > 0) {
        showErrors(errors);
        return;
      }

      CA.storage.set(CONFIRMED_KEY, collect());
      window.location.href = 'results.html';
    });
  });
})();
