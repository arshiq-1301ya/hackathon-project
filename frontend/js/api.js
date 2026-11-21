/**
 * CivicAssist - central API layer (frontend/js/api.js)
 *
 * This is the single place where the frontend talks to the backend.
 * The backend is developed separately; the base URL below is a PLACEHOLDER
 * (http://localhost:4000/api) and can be overridden via
 * window.CIVICASSIST_CONFIG.apiBaseUrl or the localStorage key
 * 'civicassist.apiBaseUrl' (see setBaseUrl()).
 *
 * Mock fallback is DEVELOPMENT-ONLY. When the backend is unreachable
 * (network failure or timeout) and useMockFallback is enabled, a mock handler
 * may return an empty result tagged with _source: 'mock'. Mocks never invent
 * scheme data. Set window.CIVICASSIST_CONFIG.useMockFallback = false in
 * production builds.
 *
 * Array-returning calls resolve to { items: [...], _source: 'mock' } when mocked.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'civicassist.apiBaseUrl';
  var DEFAULT_BASE_URL = 'http://localhost:4000/api';

  var cfg = window.CIVICASSIST_CONFIG || {};

  function readStoredBaseUrl() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) || '';
    } catch (err) {
      return '';
    }
  }

  var API_CONFIG = {
    baseUrl: cfg.apiBaseUrl || readStoredBaseUrl() || DEFAULT_BASE_URL,
    timeoutMs: 10000,
    useMockFallback: cfg.useMockFallback !== undefined ? !!cfg.useMockFallback : true
  };

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
    return new ApiError('Network error: backend unreachable', 0, 'NETWORK', null);
  }

  /**
   * Performs an HTTP request and returns the parsed JSON body (or null for empty bodies).
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
    listSchemes: function () { return { items: [], _source: 'mock' }; },
    listApplications: function () { return { items: [], _source: 'mock' }; },
    getReminders: function () { return { items: [], _source: 'mock' }; }
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

  var rawApi = {
    getHealth: function () {
      return request('GET', '/health');
    },
    extractProfile: function (text) {
      return request('POST', '/profile/extract', { text: text });
    },
    matchSchemes: function (profile) {
      return request('POST', '/schemes/match', { profile: profile });
    },
    listSchemes: function (params) {
      return request('GET', '/schemes' + buildQuery(params));
    },
    getScheme: function (id) {
      return request('GET', '/schemes/' + encodeURIComponent(id));
    },
    getSchemeChecklist: function (id) {
      return request('GET', '/schemes/' + encodeURIComponent(id) + '/checklist');
    },
    createChecklist: function (data) {
      return request('POST', '/checklists', data);
    },
    updateChecklist: function (id, data) {
      return request('PATCH', '/checklists/' + encodeURIComponent(id), data);
    },
    createApplication: function (data) {
      return request('POST', '/applications', data);
    },
    listApplications: function () {
      return request('GET', '/applications');
    },
    updateApplication: function (id, data) {
      return request('PATCH', '/applications/' + encodeURIComponent(id), data);
    },
    deleteApplication: function (id) {
      return request('DELETE', '/applications/' + encodeURIComponent(id));
    },
    getReminders: function () {
      return request('GET', '/reminders');
    }
  };

  var api = {};
  Object.keys(rawApi).forEach(function (name) {
    api[name] = withMockFallback(name, rawApi[name]);
  });

  /**
   * Overrides the backend base URL and persists it (safe if storage is unavailable).
   */
  api.setBaseUrl = function (url) {
    var value = String(url || '').replace(/\/+$/, '');
    API_CONFIG.baseUrl = value || DEFAULT_BASE_URL;
    try {
      window.localStorage.setItem(STORAGE_KEY, API_CONFIG.baseUrl);
    } catch (err) {
      // Storage unavailable (private mode / disabled); keep in-memory override only.
    }
    return API_CONFIG.baseUrl;
  };

  api.ApiError = ApiError;
  api.config = API_CONFIG;

  window.CIVICASSIST_API = api;
})();
