/*
 * CivicAssist demo authentication (frontend only).
 *
 * DEMO MODE: accounts live only in this browser's storage and are not real.
 * Passwords are validated and then discarded. They are never stored,
 * logged or sent anywhere.
 *
 * Storage keys:
 *   auth.session       {name, email, loggedInAt}
 *   auth.users         [{name, email, createdAt}]  (deduped by lowercase email)
 *   auth.rememberEmail string (email only)
 */
(function () {
  'use strict';

  var CA = (window.CivicAssist = window.CivicAssist || {});

  var SESSION_KEY = 'auth.session';
  var USERS_KEY = 'auth.users';
  var REMEMBER_KEY = 'auth.rememberEmail';

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var MOBILE_RE = /^[6-9]\d{9}$/;

  /* ---------- storage wrappers ---------- */

  function readStore(key) {
    try {
      return CA.storage && typeof CA.storage.get === 'function' ? CA.storage.get(key) : null;
    } catch (err) {
      return null;
    }
  }

  function writeStore(key, value) {
    if (CA.storage && typeof CA.storage.set === 'function') {
      CA.storage.set(key, value);
    }
  }

  function removeStore(key) {
    if (CA.storage && typeof CA.storage.remove === 'function') {
      CA.storage.remove(key);
    } else {
      writeStore(key, null);
    }
  }

  /* ---------- small helpers ---------- */

  function $(id) {
    return document.getElementById(id);
  }

  function validateEmail(value) {
    return EMAIL_RE.test(String(value || '').trim());
  }

  function passwordScore(pw) {
    var value = String(pw || '');
    if (!value) {
      return { score: 0, level: 0, label: '', cls: '' };
    }
    var score = 0;
    if (value.length >= 8) score++;
    if (value.length >= 12) score++;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
    if (/\d/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value)) score++;

    if (score <= 1) return { score: score, level: 1, label: 'Weak', cls: 'is-weak' };
    if (score === 2) return { score: score, level: 2, label: 'Fair', cls: 'is-fair' };
    if (score === 3) return { score: score, level: 3, label: 'Good', cls: 'is-good' };
    return { score: score, level: 4, label: 'Strong', cls: 'is-strong' };
  }

  function setFieldError(inputId, message) {
    var input = $(inputId);
    var errorEl = $(inputId + '-error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    }
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      input.classList.add('is-invalid');
    }
  }

  function clearFieldError(inputId) {
    var input = $(inputId);
    var errorEl = $(inputId + '-error');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.hidden = true;
    }
    if (input) {
      input.removeAttribute('aria-invalid');
      input.classList.remove('is-invalid');
    }
  }

  // Applies a validator result (empty string = valid). Returns true when valid.
  function applyResult(inputId, message) {
    if (message) {
      setFieldError(inputId, message);
      return false;
    }
    clearFieldError(inputId);
    return true;
  }

  function notify(message) {
    if (CA.toast && typeof CA.toast.success === 'function') {
      CA.toast.success(message);
      return;
    }
    if (typeof CA.toast === 'function') {
      CA.toast(message, 'success');
      return;
    }
    var el = document.createElement('div');
    el.className = 'auth-toast';
    el.setAttribute('role', 'status');
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 2400);
  }

  function refreshAccount() {
    if (CA.layout && typeof CA.layout.refreshAccount === 'function') {
      CA.layout.refreshAccount();
    }
  }

  function deriveName(email) {
    var local = String(email).split('@')[0] || 'Citizen';
    var words = local.replace(/[._-]+/g, ' ').trim().split(/\s+/);
    return words
      .map(function (w) {
        return w ? w.charAt(0).toUpperCase() + w.slice(1) : '';
      })
      .join(' ')
      .trim() || 'Citizen';
  }

  function getUsers() {
    var list = readStore(USERS_KEY);
    return Array.isArray(list) ? list : [];
  }

  // Adds a user to the demo list if the lowercase email is not present yet.
  function upsertUser(name, email) {
    var users = getUsers();
    var key = email.toLowerCase();
    var exists = users.some(function (u) {
      return String(u.email || '').toLowerCase() === key;
    });
    if (!exists) {
      users.push({ name: name, email: email, createdAt: new Date().toISOString() });
      writeStore(USERS_KEY, users);
    }
  }

  function findUserName(email) {
    var key = email.toLowerCase();
    var match = getUsers().filter(function (u) {
      return String(u.email || '').toLowerCase() === key;
    })[0];
    return match && match.name ? match.name : deriveName(email);
  }

  /* ---------- session API (single backend integration points) ----------
   * getSession(), login(email), logout(), signupDemo({name, email})
   * These four functions are the only places that touch the session and user
   * list. A real backend would replace their bodies with API calls.
   * None of them accepts or stores a password.
   */

  function getSession() {
    var session = readStore(SESSION_KEY);
    return session && typeof session === 'object' ? session : null;
  }

  function login(email) {
    var clean = String(email || '').trim();
    var session = {
      name: findUserName(clean),
      email: clean,
      loggedInAt: new Date().toISOString()
    };
    writeStore(SESSION_KEY, session);
    return session;
  }

  function logout() {
    removeStore(SESSION_KEY);
  }

  function signupDemo(details) {
    var name = String((details && details.name) || '').trim();
    var email = String((details && details.email) || '').trim();
    upsertUser(name, email);
    var session = { name: name, email: email, loggedInAt: new Date().toISOString() };
    writeStore(SESSION_KEY, session);
    return session;
  }

  /* ---------- shared UI wiring ---------- */

  function wirePasswordToggles() {
    var toggles = document.querySelectorAll('.password-toggle');
    Array.prototype.forEach.call(toggles, function (btn) {
      var input = $(btn.getAttribute('aria-controls'));
      if (!input) return;
      btn.addEventListener('click', function () {
        var showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        btn.setAttribute('aria-pressed', showing ? 'false' : 'true');
        btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
        btn.textContent = showing ? 'Show' : 'Hide';
      });
    });
  }

  function emailError(value) {
    var v = String(value || '').trim();
    if (!v) return 'Please enter your email address.';
    if (!validateEmail(v)) return 'Enter a valid email address, like name@example.com.';
    return '';
  }

  function loginPasswordError(value) {
    if (!value) return 'Please enter your password.';
    if (value.length < 8) return 'Password must be at least 8 characters.';
    return '';
  }

  function signupPasswordError(value) {
    if (!value) return 'Please create a password.';
    if (value.length < 8) return 'Password must be at least 8 characters.';
    return '';
  }

  function bindBlur(inputId, validator) {
    var input = $(inputId);
    if (!input) return;
    input.addEventListener('blur', function () {
      applyResult(inputId, validator(input.value));
    });
  }

  function redirectLater(ms) {
    setTimeout(function () {
      window.location.href = 'dashboard.html';
    }, ms);
  }

  /* ---------- login page ---------- */

  function initLogin() {
    var form = $('loginForm');
    if (!form) return;

    var emailEl = $('loginEmail');
    var passwordEl = $('loginPassword');
    var rememberEl = $('rememberMe');
    var btn = $('loginBtn');
    var btnLabel = btn ? btn.textContent : 'Log in';

    var remembered = readStore(REMEMBER_KEY);
    if (typeof remembered === 'string' && remembered) {
      emailEl.value = remembered;
      rememberEl.checked = true;
    }

    bindBlur('loginEmail', emailError);
    bindBlur('loginPassword', loginPasswordError);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var okEmail = applyResult('loginEmail', emailError(emailEl.value));
      var okPassword = applyResult('loginPassword', loginPasswordError(passwordEl.value));
      if (!okEmail || !okPassword) {
        (okEmail ? passwordEl : emailEl).focus();
        return;
      }

      var email = emailEl.value.trim();
      if (rememberEl.checked) {
        writeStore(REMEMBER_KEY, email);
      } else {
        removeStore(REMEMBER_KEY);
      }

      login(email);
      passwordEl.value = '';
      refreshAccount();

      btn.disabled = true;
      btn.textContent = 'Logging in…';
      notify('Logged in in demo mode.');
      setTimeout(function () {
        btn.disabled = false;
        btn.textContent = btnLabel;
      }, 300);
      redirectLater(300);
    });
  }

  /* ---------- signup page ---------- */

  function updateStrength(passwordValue) {
    var meter = document.querySelector('.strength-meter');
    var text = $('strengthText');
    var result = passwordScore(passwordValue);

    if (meter) {
      meter.classList.remove('is-weak', 'is-fair', 'is-good', 'is-strong');
      if (result.cls) meter.classList.add(result.cls);
      var bars = meter.querySelectorAll('.strength-bar');
      Array.prototype.forEach.call(bars, function (bar, index) {
        bar.classList.toggle('is-on', index < result.level);
      });
    }
    if (text) text.textContent = result.label;
  }

  function initSignup() {
    var form = $('signupForm');
    if (!form) return;

    var nameEl = $('fullName');
    var emailEl = $('signupEmail');
    var mobileEl = $('mobile');
    var passwordEl = $('signupPassword');
    var confirmEl = $('confirmPassword');
    var termsEl = $('terms');
    var btn = $('signupBtn');

    function nameError(value) {
      var v = String(value || '').trim();
      if (!v) return 'Please enter your full name.';
      if (v.length < 2 || v.length > 80) return 'Name must be 2 to 80 characters.';
      return '';
    }

    function mobileError(value) {
      var digits = String(value || '').replace(/\s/g, '');
      if (!digits) return '';
      if (!MOBILE_RE.test(digits)) return 'Enter a valid 10-digit mobile number starting with 6 to 9.';
      return '';
    }

    function confirmError(value) {
      if (!value) return 'Please confirm your password.';
      if (value !== passwordEl.value) return 'Passwords do not match.';
      return '';
    }

    function termsMessage() {
      return termsEl.checked ? '' : 'Please accept the terms to continue.';
    }

    bindBlur('fullName', nameError);
    bindBlur('signupEmail', emailError);
    bindBlur('mobile', mobileError);
    bindBlur('signupPassword', signupPasswordError);
    bindBlur('confirmPassword', confirmError);
    termsEl.addEventListener('change', function () {
      applyResult('terms', termsMessage());
    });

    passwordEl.addEventListener('input', function () {
      updateStrength(passwordEl.value);
    });
    updateStrength(passwordEl.value);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var results = [
        applyResult('fullName', nameError(nameEl.value)),
        applyResult('signupEmail', emailError(emailEl.value)),
        applyResult('mobile', mobileError(mobileEl.value)),
        applyResult('signupPassword', signupPasswordError(passwordEl.value)),
        applyResult('confirmPassword', confirmError(confirmEl.value)),
        applyResult('terms', termsMessage())
      ];
      var firstInvalid = [nameEl, emailEl, mobileEl, passwordEl, confirmEl, termsEl][
        results.indexOf(false)
      ];
      if (firstInvalid) {
        firstInvalid.focus();
        return;
      }

      signupDemo({ name: nameEl.value.trim(), email: emailEl.value.trim() });
      passwordEl.value = '';
      confirmEl.value = '';
      refreshAccount();

      btn.disabled = true;
      notify('Account created in demo mode.');
      redirectLater(400);
    });
  }

  /* ---------- forgot-password page ---------- */

  function initForgot() {
    var form = $('forgotForm');
    if (!form) return;

    var emailEl = $('forgotEmail');
    bindBlur('forgotEmail', emailError);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!applyResult('forgotEmail', emailError(emailEl.value))) {
        emailEl.focus();
        return;
      }

      var holder = $('forgotResult');
      if (!holder) return;
      holder.innerHTML = '';

      var alert = document.createElement('div');
      alert.className = 'alert alert-info';
      alert.setAttribute('role', 'status');

      var message = document.createElement('p');
      message.textContent =
        'Demo mode: no email is sent. In the live service, a reset link would be emailed to this address.';
      alert.appendChild(message);

      var link = document.createElement('a');
      link.href = 'login.html';
      link.textContent = 'Back to log in';
      alert.appendChild(link);

      holder.appendChild(alert);
    });
  }

  /* ---------- page dispatch ---------- */

  CA.auth = {
    getSession: getSession,
    login: login,
    logout: logout,
    signupDemo: signupDemo
  };

  function init() {
    wirePasswordToggles();
    var page = document.body ? document.body.getAttribute('data-page') : '';
    if (page === 'login') initLogin();
    else if (page === 'signup') initSignup();
    else if (page === 'forgot-password') initForgot();
  }

  if (typeof CA.registerPage === 'function') {
    CA.registerPage(init);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
