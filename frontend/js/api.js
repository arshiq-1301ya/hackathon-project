/**
 * CivicAssist - central API layer (frontend/js/api.js)
 *
 * This is the single place where the frontend talks to the backend.
 *
 * Base URL: defined once below as DEFAULT_ORIGIN + '/api'. To point at another
 * server set window.CIVIC_API_BASE to an ORIGIN ONLY (e.g. 'http://localhost:5000').
 * A trailing '/api' in the override is tolerated and stripped, so '/api' is never doubled.
 *
 * Auth: the JWT is stored in localStorage under 'civicassist_token' and the user
 * summary under 'civicassist_user'. Passwords are never stored.
 *
 * Mock fallback is DEVELOPMENT-ONLY. When the backend is unreachable
 * (network failure or timeout) and useMockFallback is enabled, a mock handler
 * may return an empty result tagged with _source: 'mock'. Mocks never invent
 * scheme data. Set window.CIVICASSIST_CONFIG.useMockFallback = false in
 * production builds.
 *
 * Only listSchemes has a mock (resolves to { items: [], _source: 'mock' }). Applications,
 * checklists and reminders never mock: a failure is always thrown as an ApiError.
 */
(function () {
  'use strict';

  var TOKEN_KEY = 'civicassist_token';
  var USER_KEY = 'civicassist_user';
  var DEFAULT_ORIGIN = 'https://scheme-finder-aod3.onrender.com';

  var cfg = window.CIVICASSIST_CONFIG || {};

  // The only place the base URL is defined. Input is an origin; '/api' is appended exactly once.
  function buildBaseUrl(origin) {
    var clean = String(origin || '').trim().replace(/\/+$/, '').replace(/\/api$/i, '');
    return (clean || DEFAULT_ORIGIN) + '/api';
  }

  var API_CONFIG = {
    baseUrl: buildBaseUrl(window.CIVIC_API_BASE),
    timeoutMs: 10000,
    useMockFallback: cfg.useMockFallback !== undefined ? !!cfg.useMockFallback : true
  };

  /* ---------- token / user storage ---------- */

  function storageGet(key) {
    try {
      return window.localStorage.getItem(key) || '';
    } catch (err) {
      return '';
    }
  }

  function storageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (err) {
      // Storage unavailable (private mode / disabled).
    }
  }

  function storageRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      // Storage unavailable.
    }
  }

  function getToken() {
    return storageGet(TOKEN_KEY);
  }

  function getStoredUser() {
    var raw = storageGet(USER_KEY);
    if (!raw) {
      return null;
    }
    try {
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (err) {
      return null;
    }
  }

  function storeSession(token, user) {
    storageSet(TOKEN_KEY, token);
    storageSet(USER_KEY, JSON.stringify(user || null));
  }

  function clearSession() {
    storageRemove(TOKEN_KEY);
    storageRemove(USER_KEY);
  }

  /**
   * Error type for every failed API call.
   * code: 'NETWORK' | 'TIMEOUT' | 'HTTP' | 'PARSE'
   * status: HTTP status number, or 0 for network/timeout/parse failures.
   * data: parsed response body when available, otherwise null.
   */
  class ApiError extends Error {
    constructor(message, status, code, data) {
      super(message);
      this.name = 'ApiError';
      this.status = status || 0;
      this.code = code;
      this.data = data === undefined ? null : data;
    }
  }

  function classifyFetchError(err) {
    if (err && err.name === 'AbortError') {
      return new ApiError('Request timed out', 0, 'TIMEOUT', null);
    }
    return new ApiError('Cannot reach server. Check that the backend is running.', 0, 'NETWORK', null);
  }

  /**
   * Performs an HTTP request and returns the parsed JSON body (or null for empty bodies).
   * Adds Authorization: Bearer <token> when a token is stored.
   * Throws ApiError on every failure.
   */
  async function request(method, path, body) {
    var url = API_CONFIG.baseUrl + path;
    var headers = { Accept: 'application/json' };
    var init = { method: method, headers: headers };
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (controller) {
      init.signal = controller.signal;
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    var token = getToken();
    if (token) {
      headers.Authorization = 'Bearer ' + token;
    }

    var timer = controller
      ? setTimeout(function () { controller.abort(); }, API_CONFIG.timeoutMs)
      : null;

    try {
      var response;
      try {
        response = await fetch(url, init);
      } catch (fetchErr) {
        throw classifyFetchError(fetchErr);
      }

      var text;
      try {
        text = await response.text();
      } catch (readErr) {
        throw classifyFetchError(readErr);
      }

      var data = null;
      var parseFailed = false;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (parseErr) {
          parseFailed = true;
        }
      }

      if (!response.ok) {
        var message = (data && data.message) || response.statusText || ('HTTP ' + response.status);
        throw new ApiError(message, response.status, 'HTTP', data);
      }

      if (parseFailed) {
        throw new ApiError('Invalid JSON in response', response.status, 'PARSE', null);
      }

      return data;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  /**
   * Development-only mock handlers. Keyed by public function name.
   * Only empty results are returned; no scheme data is invented.
   * Endpoints without a mock rethrow the original ApiError.
   */
  var MOCKS = {
    listSchemes: function () { return { items: [], _source: 'mock' }; }
  };

  function withMockFallback(name, fn) {
    return async function () {
      var args = arguments;
      try {
        return await fn.apply(null, args);
      } catch (err) {
        var canMock = err instanceof ApiError &&
          (err.code === 'NETWORK' || err.code === 'TIMEOUT') &&
          API_CONFIG.useMockFallback &&
          typeof MOCKS[name] === 'function';
        if (canMock) {
          return MOCKS[name].apply(null, args);
        }
        throw err;
      }
    };
  }

  function buildQuery(params) {
    var qs = new URLSearchParams();
    if (params && typeof params === 'object') {
      Object.keys(params).forEach(function (key) {
        var value = params[key];
        if (value === undefined || value === null || value === '') {
          return;
        }
        qs.append(key, String(value));
      });
    }
    var s = qs.toString();
    return s ? '?' + s : '';
  }

  // Canonical profile fields. Only these keys are ever sent to the backend.
  var PROFILE_FIELDS = ['state', 'educationLevel', 'annualFamilyIncome', 'purpose', 'occupation', 'landStatus', 'otherInfo'];

  function pickProfileFields(source) {
    var out = {};
    PROFILE_FIELDS.forEach(function (key) {
      if (source && Object.prototype.hasOwnProperty.call(source, key)) {
        out[key] = source[key];
      }
    });
    return out;
  }

  // Stores token + user from an auth response envelope {success, message, token, user}.
  function storeAuthResponse(res) {
    if (!res || typeof res.token !== 'string' || !res.token) {
      throw new ApiError('Unexpected response from server', 0, 'PARSE', res);
    }
    storeSession(res.token, res.user || null);
    return res;
  }

  var rawApi = {
    getHealth: function () {
      return request('GET', '/health');
    },
    signup: function (details) {
      var d = details || {};
      return request('POST', '/auth/signup', {
        name: d.name,
        email: d.email,
        password: d.password
      }).then(storeAuthResponse);
    },
    login: function (credentials) {
      var c = credentials || {};
      return request('POST', '/auth/login', {
        email: c.email,
        password: c.password
      }).then(storeAuthResponse);
    },
    me: function () {
      return request('GET', '/auth/me').then(function (res) {
        return res && res.user ? res.user : res;
      });
    },
    // Resolves to a flat canonical profile: { state, educationLevel, annualFamilyIncome, purpose, occupation, otherInfo }.
    extractProfile: function (text) {
      return request('POST', '/profile/extract', { text: text }).then(function (res) {
        var profile = (res && res.data && res.data.profile) || {};
        var out = pickProfileFields(profile);
        out.otherInfo = profile.otherInfo !== undefined ? profile.otherInfo : null;
        return out;
      });
    },

        assistantChat: function (message, context) {
      var body = { message: message };
      if (context && context.profile && typeof context.profile === 'object') {
        body.profile = pickProfileFields(context.profile);
      }
      return request('POST', '/ai/ask', body);
    },
    // Resolves to the envelope data: { profile, updatedAt, exists }.
    getProfile: function () {
      return request('GET', '/profile').then(function (res) {
        return res && res.data ? res.data : null;
      });
    },
    // Partial update. Resolves to the envelope data: { profile, updatedAt, exists }.
    saveProfile: function (partial) {
      return request('PATCH', '/profile', pickProfileFields(partial)).then(function (res) {
        return res && res.data ? res.data : null;
      });
    },
    // Sends the canonical profile fields only (flat body). Resolves to { success, message, data: { results, count } }.
    // No mock fallback: a backend failure is thrown as an ApiError.
    matchSchemes: function (profile) {
      return request('POST', '/schemes/match', pickProfileFields(profile));
    },
    listSchemes: function (params) {
      return request('GET', '/schemes' + buildQuery(params));
    },
    // Resolves to the inner scheme object (data.scheme), or null when absent.
    getScheme: function (id) {
      return request('GET', '/schemes/' + encodeURIComponent(id)).then(function (res) {
        return res && res.data && res.data.scheme ? res.data.scheme : null;
      });
    },
    // Resolves to { success, data: { scheme: {_id, name}, checklist: {_id, schemeId, persisted, items} } }.
    getSchemeChecklist: function (schemeId) {
      return request('GET', '/schemes/' + encodeURIComponent(schemeId) + '/checklist');
    },
    // Creates (or returns the existing) saved checklist for a scheme. Resolves to { data: { checklist } }.
    createChecklist: function (schemeId) {
      return request('POST', '/checklists', { schemeId: schemeId });
    },
    // items: [{ key, completed }]. Resolves to { data: { checklist } }.
    updateChecklist: function (checklistId, items) {
      return request('PATCH', '/checklists/' + encodeURIComponent(checklistId), { items: items });
    },
    // payload: { schemeId, status?, deadline?, notes?, trackingNumber? }. Resolves to { data: { application } }.
    createApplication: function (payload) {
      return request('POST', '/applications', payload);
    },
    // Resolves to { data: { applications, count } }.
    listApplications: function () {
      return request('GET', '/applications');
    },
    updateApplication: function (id, patch) {
      return request('PATCH', '/applications/' + encodeURIComponent(id), patch);
    },
    deleteApplication: function (id) {
      return request('DELETE', '/applications/' + encodeURIComponent(id));
    },
    // Resolves to { data: { reminders, count } }.
    getReminders: function () {
      return request('GET', '/reminders');
    }
  };

  var api = {};
  Object.keys(rawApi).forEach(function (name) {
    api[name] = withMockFallback(name, rawApi[name]);
  });

  /**
   * Clears the stored token and user. No server call (the backend has no logout endpoint).
   */
  api.logout = function () {
    clearSession();
  };

  api.getToken = getToken;
  api.getStoredUser = getStoredUser;

  /**
   * Overrides the backend origin for this page session only (not persisted).
   * Accepts an origin; a trailing '/api' is tolerated.
   */
  api.setBaseUrl = function (origin) {
    API_CONFIG.baseUrl = buildBaseUrl(origin);
    return API_CONFIG.baseUrl;
  };

  api.ApiError = ApiError;
  api.config = API_CONFIG;

  window.CIVICASSIST_API = api;
})();
