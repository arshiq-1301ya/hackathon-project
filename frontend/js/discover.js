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
    var micBtn = document.getElementById('micBtn');
    var micStatus = document.getElementById('micStatus');

    // Aadhaar (12 digits), PAN, or long digit runs: never send these anywhere.
    function looksLikeIdNumber(value) {
      var ascii = value.replace(/[०-९]/g, function (ch) { return String(ch.charCodeAt(0) - 0x966); });
      return /(^|\D)\d{4}[\s-]?\d{4}[\s-]?\d{4}(\D|$)/.test(ascii) ||
        /\b[A-Za-z]{5}\d{4}[A-Za-z]\b/.test(ascii) ||
        /(^|\D)(\d[\s-]?){13,19}(\D|$)/.test(ascii);
    }

    // Voice input via the browser's Web Speech API (hidden where unsupported).
    var SPEECH_LANGS = { en: 'en-IN', hi: 'hi-IN', bn: 'bn-IN', mr: 'mr-IN', ta: 'ta-IN', te: 'te-IN', gu: 'gu-IN', kn: 'kn-IN', ml: 'ml-IN', pa: 'pa-IN' };
    var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    var recognition = null;
    var listening = false;

    function setMic(on, message) {
      listening = on;
      micBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      document.getElementById('micLabel').textContent = on ? 'Stop listening' : 'Speak instead';
      micStatus.textContent = message || '';
    }

    if (Recognition && micBtn) {
      micBtn.hidden = false;
      micBtn.addEventListener('click', function () {
        if (listening && recognition) {
          recognition.stop();
          return;
        }
        recognition = new Recognition();
        recognition.lang = SPEECH_LANGS[CA.getLanguage()] || 'hi-IN';
        recognition.interimResults = false;
        recognition.continuous = false;
        var base = textarea.value ? textarea.value.trim() + ' ' : '';
        recognition.onresult = function (event) {
          var heard = '';
          for (var i = 0; i < event.results.length; i++) {
            heard += event.results[i][0].transcript + ' ';
          }
          textarea.value = (base + heard.trim()).slice(0, MAX_LENGTH);
          updateCount();
          clearError();
        };
        recognition.onerror = function () { setMic(false, 'Could not hear you. Please try again or type.'); };
        recognition.onend = function () { if (listening) setMic(false, ''); };
        try {
          recognition.start();
          setMic(true, 'Listening… speak now.');
        } catch (err) {
          setMic(false, 'Microphone unavailable. Please type instead.');
        }
      });
    }

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

      if (looksLikeIdNumber(text)) {
        errorBox.textContent = 'Please remove Aadhaar, PAN, bank or card numbers. We never need ID numbers.';
        errorBox.hidden = false;
        textarea.setAttribute('aria-invalid', 'true');
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