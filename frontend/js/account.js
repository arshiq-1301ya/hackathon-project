/*
 * DEMO STORAGE ONLY: data lives in the browser's localStorage and is NOT secure.
 * It must be replaced by a server-side account API before real personal data is collected.
 * Never store passwords or auth tokens here.
 *
 * Account data-access module. Loaded before layout.js and app.js, so it does not
 * depend on CA.storage at load time. Every exported function returns a Promise.
 *
 * When window.CIVIC_API_BASE is a non-empty string, requests go to that server
 * (credentials: 'include'). Otherwise data is read/written in localStorage.
 */
(function () {
    'use strict';

    window.CA = window.CA || {};

    var PREFIX = 'civicassist.';
    var MAX_STRING = 200;
    var MAX_PHOTO_LENGTH = 400000;
    var PHOTO_PREFIXES = [
        'data:image/jpeg;base64,',
        'data:image/png;base64,',
        'data:image/webp;base64,'
    ];
    var PROFILE_STRING_FIELDS = [
        'fullName', 'mobile', 'dob', 'gender', 'state', 'district', 'city', 'pinCode',
        'address', 'educationLevel', 'employmentStatus', 'category'
    ];
    var PROFILE_FIELDS = PROFILE_STRING_FIELDS.concat(['annualIncome', 'familySize']);
    var COMPLETION_FIELDS = ['fullName', 'mobile', 'dob', 'gender', 'state', 'city',
        'educationLevel', 'employmentStatus'];

    var account = {
        API_BASE: window.CIVIC_API_BASE || null
    };

    function hasApi() {
        return typeof account.API_BASE === 'string' && account.API_BASE.length > 0;
    }

    function isPlainObject(v) {
        return v !== null && typeof v === 'object' && !Array.isArray(v);
    }

    function has(obj, key) {
        return Object.prototype.hasOwnProperty.call(obj, key);
    }

    function pad2(n) {
        return (n < 10 ? '0' : '') + n;
    }

    function cleanString(v) {
        if (v === null || v === undefined) return '';
        return String(v).trim().slice(0, MAX_STRING);
    }

    // Runs fn inside a Promise chain so sync throws become rejections, then maps them to fallback.
    function guard(fn, fallback) {
        return new Promise(function (resolve) {
            resolve(fn());
        }).catch(function () {
            return fallback;
        });
    }

    /* ---------- localStorage helpers (no CA.storage dependency) ---------- */

    function readJSON(key) {
        try {
            var raw = window.localStorage.getItem(key);
            return raw === null ? null : JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    function writeJSON(key, value) {
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            return false;
        }
    }

    function localSession() {
        var s = readJSON(PREFIX + 'auth.session');
        return (isPlainObject(s) && typeof s.email === 'string' && s.email.trim()) ? s : null;
    }

    function profileKey(email) {
        return PREFIX + 'account.profile:' + String(email).trim().toLowerCase();
    }

    function localProfileObject(session) {
        var obj = readJSON(profileKey(session.email));
        return isPlainObject(obj) ? obj : {};
    }

    /* ---------- validation ---------- */

    function isValidDob(s) {
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        if (!m) return false;
        var y = parseInt(m[1], 10);
        var mo = parseInt(m[2], 10);
        var d = parseInt(m[3], 10);
        var dt = new Date(Date.UTC(y, mo - 1, d));
        if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
            return false;
        }
        var now = new Date();
        var today = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
        return s <= today;
    }

    // Validates and normalises only the keys present in `fields`. Email and unknown keys are ignored.
    function normalizeFields(fields) {
        var values = {};
        var errors = {};
        var i;
        var key;
        var raw;
        var n;

        if (!isPlainObject(fields)) fields = {};

        for (i = 0; i < PROFILE_STRING_FIELDS.length; i++) {
            key = PROFILE_STRING_FIELDS[i];
            if (has(fields, key)) values[key] = cleanString(fields[key]);
        }

        if (has(fields, 'mobile') && values.mobile !== '' && !/^\d{10}$/.test(values.mobile)) {
            errors.mobile = 'Mobile number must be exactly 10 digits.';
        }
        if (has(fields, 'pinCode') && values.pinCode !== '' && !/^\d{6}$/.test(values.pinCode)) {
            errors.pinCode = 'PIN code must be exactly 6 digits.';
        }
        if (has(fields, 'dob') && values.dob !== '' && !isValidDob(values.dob)) {
            errors.dob = 'Date of birth must be a valid date (YYYY-MM-DD) and not in the future.';
        }

        if (has(fields, 'familySize')) {
            raw = fields.familySize;
            if (raw === null || raw === undefined || String(raw).trim() === '') {
                values.familySize = null;
            } else {
                n = Number(String(raw).trim());
                if (!Number.isInteger(n) || n < 1 || n > 30) {
                    errors.familySize = 'Family size must be a whole number from 1 to 30.';
                } else {
                    values.familySize = n;
                }
            }
        }

        if (has(fields, 'annualIncome')) {
            raw = fields.annualIncome;
            if (raw === null || raw === undefined || String(raw).trim() === '') {
                values.annualIncome = null;
            } else {
                n = Number(String(raw).trim());
                if (!isFinite(n) || n < 0) {
                    errors.annualIncome = 'Annual income must be a number of 0 or more.';
                } else {
                    values.annualIncome = n;
                }
            }
        }

        return { values: values, errors: errors };
    }

    function validatePhoto(dataUrl) {
        if (typeof dataUrl !== 'string') return false;
        if (dataUrl.length > MAX_PHOTO_LENGTH) return false;
        for (var i = 0; i < PHOTO_PREFIXES.length; i++) {
            if (dataUrl.indexOf(PHOTO_PREFIXES[i]) === 0) return true;
        }
        return false;
    }

    /* ---------- HTTP adapter ---------- */

    function apiRequest(method, path, body) {
        var opts = { method: method, credentials: 'include', headers: {} };
        if (body !== undefined) {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
        return fetch(account.API_BASE + path, opts).then(function (res) {
            return res.json()
                .catch(function () { return null; })
                .then(function (data) {
                    return { ok: res.ok, status: res.status, data: data };
                });
        });
    }

    /* ---------- local implementations ---------- */

    function localGetSession() {
        return localSession();
    }

    function localGetProfile() {
        var session = localSession();
        if (!session) return {};
        var obj = localProfileObject(session);
        var copy = {};
        Object.keys(obj).forEach(function (k) { copy[k] = obj[k]; });
        return copy;
    }

    function localSaveProfile(fields) {
        var session = localSession();
        if (!session) return { ok: false, errors: { _form: 'Please log in first.' } };

        var norm = normalizeFields(fields);
        if (Object.keys(norm.errors).length) return { ok: false, errors: norm.errors };

        var existing = localProfileObject(session);
        var obj = {};
        PROFILE_FIELDS.forEach(function (k) {
            if (has(norm.values, k)) {
                obj[k] = norm.values[k];
            } else if (has(existing, k)) {
                obj[k] = existing[k];
            }
        });
        if (has(existing, 'photo')) obj.photo = existing.photo;

        if (!writeJSON(profileKey(session.email), obj)) {
            return { ok: false, errors: { _form: 'Could not save profile in this browser.' } };
        }
        return { ok: true, profile: obj };
    }

    function localSavePhoto(dataUrl) {
        var session = localSession();
        if (!session) return { ok: false, errors: { _form: 'Please log in first.' } };

        if (dataUrl !== null && !validatePhoto(dataUrl)) {
            return {
                ok: false,
                errors: { photo: 'Photo must be a JPEG, PNG or WebP image (max 400,000 characters).' }
            };
        }

        var obj = localProfileObject(session);
        if (dataUrl === null) {
            delete obj.photo;
        } else {
            obj.photo = dataUrl;
        }
        if (!writeJSON(profileKey(session.email), obj)) {
            return { ok: false, errors: { _form: 'Could not save photo in this browser.' } };
        }
        return { ok: true };
    }

    /* ---------- API implementations ---------- */

    function apiGetSession() {
        return apiRequest('GET', '/api/auth/me').then(function (r) {
            if (!r.ok || !isPlainObject(r.data)) return null;
            var u = isPlainObject(r.data.user) ? r.data.user : r.data;
            if (!u || typeof u.email !== 'string' || !u.email) return null;
            return { name: cleanString(u.name), email: u.email, loggedInAt: u.loggedInAt || null };
        }).catch(function () { return null; });
    }

    function apiGetProfile() {
        return apiRequest('GET', '/api/profile').then(function (r) {
            if (!r.ok || !isPlainObject(r.data)) return {};
            return isPlainObject(r.data.profile) ? r.data.profile : r.data;
        }).catch(function () { return {}; });
    }

    function apiSaveProfile(fields) {
        var norm = normalizeFields(fields);
        if (Object.keys(norm.errors).length) return Promise.resolve({ ok: false, errors: norm.errors });

        return apiRequest('PATCH', '/api/profile', norm.values).then(function (r) {
            if (r.status === 401) return { ok: false, errors: { _form: 'Please log in first.' } };
            if (!r.ok) {
                var errs = (isPlainObject(r.data) && isPlainObject(r.data.errors))
                    ? r.data.errors
                    : { _form: 'Could not save profile.' };
                return { ok: false, errors: errs };
            }
            var profile = (isPlainObject(r.data) && isPlainObject(r.data.profile)) ? r.data.profile : norm.values;
            return { ok: true, profile: profile };
        });
    }

    function apiSavePhoto(dataUrl) {
        if (dataUrl !== null && !validatePhoto(dataUrl)) {
            return Promise.resolve({
                ok: false,
                errors: { photo: 'Photo must be a JPEG, PNG or WebP image (max 400,000 characters).' }
            });
        }
        return apiRequest('POST', '/api/profile/photo', { photo: dataUrl }).then(function (r) {
            if (r.status === 401) return { ok: false, errors: { _form: 'Please log in first.' } };
            if (!r.ok) {
                var errs = (isPlainObject(r.data) && isPlainObject(r.data.errors))
                    ? r.data.errors
                    : { _form: 'Could not save photo.' };
                return { ok: false, errors: errs };
            }
            return { ok: true };
        });
    }

    /* ---------- exported API (all return Promises) ---------- */

    account.getSession = function () {
        return guard(function () {
            return hasApi() ? apiGetSession() : localGetSession();
        }, null);
    };

    account.getProfile = function () {
        return guard(function () {
            return hasApi() ? apiGetProfile() : localGetProfile();
        }, {});
    };

    account.saveProfile = function (fields) {
        return guard(function () {
            return hasApi() ? apiSaveProfile(fields) : localSaveProfile(fields);
        }, { ok: false, errors: { _form: 'Something went wrong. Please try again.' } });
    };

    account.savePhoto = function (dataUrl) {
        return guard(function () {
            return hasApi() ? apiSavePhoto(dataUrl) : localSavePhoto(dataUrl);
        }, { ok: false, errors: { _form: 'Something went wrong. Please try again.' } });
    };

    account.getCompletion = function (profile) {
        return guard(function () {
            var p = isPlainObject(profile) ? profile : {};
            var filled = 0;
            COMPLETION_FIELDS.forEach(function (k) {
                var v = p[k];
                if (v !== null && v !== undefined && String(v).trim() !== '') filled++;
            });
            return Math.round(filled / COMPLETION_FIELDS.length * 100);
        }, 0);
    };

    account.getDisplayName = function (session) {
        return guard(function () {
            var name = (session && typeof session.name === 'string') ? session.name.trim() : '';
            if (!name) return 'there';
            return name.split(/\s+/)[0];
        }, 'there');
    };

    account.getInitials = function (session) {
        return guard(function () {
            var name = (session && typeof session.name === 'string') ? session.name.trim() : '';
            var words = name ? name.split(/\s+/) : [];
            if (words.length) {
                var first = words[0].charAt(0);
                var last = words.length > 1 ? words[words.length - 1].charAt(0) : '';
                return (first + last).toUpperCase();
            }
            var email = (session && typeof session.email === 'string') ? session.email.trim() : '';
            return email ? email.charAt(0).toUpperCase() : '';
        }, '');
    };

    window.CA.account = account;
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