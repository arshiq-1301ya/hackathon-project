/* Discover page: collect the user's situation, extract a profile draft, go to profile review. */
(function () {
  'use strict';

  var MAX_LENGTH = 1000;
  var INPUT_KEY = 'discover.input';
  var DRAFT_KEY = 'profile.draft';

  window.CivicAssist.registerPage(function initDiscover() {
    var CA = window.CivicAssist;
    var AI = window.CIVICASSIST_AI;

    var form = document.getElementById('discoverForm');
    var textarea = document.getElementById('situation');
    var charCount = document.getElementById('charCount');
    var errorBox = document.getElementById('situation-error');
    var clearBtn = document.getElementById('clearBtn');
    var submitBtn = document.getElementById('submitBtn');
    var spinner = submitBtn.querySelector('.spinner');
    var loadingArea = document.getElementById('loadingArea');
    var examples = document.querySelectorAll('.example-prompt');
    var busy = false;

    function updateCount() {
      charCount.textContent = textarea.value.length + ' / ' + MAX_LENGTH;
    }

    function showError(key, vars) {
      errorBox.textContent = CA.t(key, vars);
      errorBox.hidden = false;
      textarea.setAttribute('aria-invalid', 'true');
    }

    function clearError() {
      errorBox.textContent = '';
      errorBox.hidden = true;
      textarea.removeAttribute('aria-invalid');
    }

    function setLoading(on) {
      busy = on;
      submitBtn.disabled = on;
      spinner.hidden = !on;
      loadingArea.hidden = !on;
      if (on) {
        submitBtn.setAttribute('aria-busy', 'true');
      } else {
        submitBtn.removeAttribute('aria-busy');
      }
    }

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (busy) {
        return;
      }

      var text = textarea.value.trim();
      clearError();

      if (!text) {
        showError('validation.required');
        textarea.focus();
        return;
      }
      if (text.length > MAX_LENGTH) {
        showError('validation.maxLength', { max: MAX_LENGTH });
        textarea.focus();
        return;
      }

      setLoading(true);
      var result;
      try {
        result = await AI.extractProfile(text);
      } catch (err) {
        setLoading(false);
        CA.toast('error', CA.t('toast.networkError'));
        return;
      }

      CA.storage.set(INPUT_KEY, text);
      CA.storage.set(DRAFT_KEY, result);
      window.location.href = 'profile.html';
    });

    clearBtn.addEventListener('click', function () {
      textarea.value = '';
      clearError();
      updateCount();
      CA.storage.remove(INPUT_KEY);
      textarea.focus();
    });

    textarea.addEventListener('input', function () {
      updateCount();
      if (!errorBox.hidden) {
        clearError();
      }
    });

    Array.prototype.forEach.call(examples, function (btn) {
      btn.addEventListener('click', function () {
        textarea.value = btn.getAttribute('data-example') || '';
        clearError();
        updateCount();
        textarea.focus();
      });
    });

    // Restore the previous input, if any.
    var saved = CA.storage.get(INPUT_KEY, '');
    if (typeof saved === 'string') {
      textarea.value = saved.slice(0, MAX_LENGTH);
    }
    updateCount();
  });
})();
