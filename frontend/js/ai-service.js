/**
 * CivicAssist - ai-service.js
 *
 * Modular AI service layer for the CivicAssist frontend.
 *
 * - Nexen AI is the only permitted AI provider for this project.
 * - The Nexen AI integration specification was NOT available when this file was
 *   written, so no Nexen endpoints, SDK methods or credentials are defined here.
 *   NEXEN_AI_INTEGRATION is therefore 'PENDING'.
 * - The frontend never holds API secrets. Real AI calls must go through the
 *   separately developed backend, reached via api.js (window.CIVICASSIST_API).
 * - Where the backend is unavailable, this layer uses clearly labelled
 *   demonstration logic (never presented as real AI output) or returns empty
 *   results. Nothing is fabricated.
 *
 * Public API (window.CIVICASSIST_AI):
 *   extractProfile(text)            -> Promise<ExtractedProfile>
 *   demonstrationExtract(text)      -> ExtractedProfile (synchronous, rule-based)
 *   matchSchemes(profile)           -> Promise<{items: MatchResult[], _source: string}>
 *   explainEligibility(scheme, profile) -> null (backend responsibility)
 *   detectMissingInfo(profile)      -> MissingInfoResult (local logic)
 *   getIntegrationStatus()          -> 'PENDING'
 */

/**
 * @typedef {Object} ExtractionInput
 * @property {string} text  Free text (Hindi or English) describing the citizen.
 */

/**
 * @typedef {Object} ExtractedProfile
 * @property {string|number|null} state            State / UT name, or null if unknown.
 * @property {string|number|null} educationLevel   Education level, or null if unknown.
 * @property {string|number|null} annualFamilyIncome Annual family income in rupees, or null.
 * @property {string|number|null} purpose          Purpose of the enquiry, or null.
 * @property {string|number|null} occupation       Occupation, or null if unknown.
 * @property {string|number|null} otherInfo        Other information, or null.
 * @property {string} _source                      'backend' or 'demo'.
 * @property {boolean} [isDemonstration]           true when produced by demonstration logic.
 */

/**
 * @typedef {Object} MatchInput
 * @property {ExtractedProfile} profile
 */

/**
 * @typedef {Object} MatchResult
 * @property {string} schemeId
 * @property {'LIKELY_ELIGIBLE'|'POSSIBLE_MATCH'|'NOT_MATCHED'} status
 * @property {string[]} matchedConditions
 * @property {string[]} missingConditions
 * @property {string} explanation
 */

/**
 * @typedef {Object} MissingInfoResult
 * @property {string[]} missingFields
 */

(function () {
  'use strict';

  /** Nexen AI integration status. The specification has not yet been provided. */
  var NEXEN_AI_INTEGRATION = 'PENDING';

  /** Profile fields that the extractor and missing-info check care about. */
  var PROFILE_FIELDS = [
    'state',
    'educationLevel',
    'annualFamilyIncome',
    'purpose',
    'occupation',
    'otherInfo'
  ];

  /** Fields that must be filled for a profile to be considered complete. */
  var REQUIRED_FIELDS = [
    'state',
    'educationLevel',
    'annualFamilyIncome',
    'purpose',
    'occupation'
  ];

  /** Demonstration state dictionary: English and Hindi spellings. */
  var STATE_TERMS = [
    { name: 'Uttar Pradesh', terms: ['uttar pradesh', 'उत्तर प्रदेश'] },
    { name: 'Bihar', terms: ['bihar', 'बिहार'] },
    { name: 'Maharashtra', terms: ['maharashtra', 'महाराष्ट्र'] },
    { name: 'Tamil Nadu', terms: ['tamil nadu', 'तमिलनाडु'] },
    { name: 'West Bengal', terms: ['west bengal', 'पश्चिम बंगाल'] },
    { name: 'Madhya Pradesh', terms: ['madhya pradesh', 'मध्य प्रदेश'] },
    { name: 'Rajasthan', terms: ['rajasthan', 'राजस्थान'] },
    { name: 'Gujarat', terms: ['gujarat', 'गुजरात'] },
    { name: 'Karnataka', terms: ['karnataka', 'कर्नाटक'] },
    { name: 'Kerala', terms: ['kerala', 'केरल'] }
  ];

  /** Demonstration education dictionary, checked in priority order. */
  var EDUCATION_TERMS = [
    { value: 'Graduate', pattern: /graduate|graduation|ग्रेजुएट|स्नातक/i },
    { value: '12th Pass', pattern: /\b12(th)?\b|बारहवीं/i },
    { value: '10th Pass', pattern: /\b10(th)?\b|दसवीं/i },
    { value: 'Illiterate', pattern: /illiterate|अनपढ़/i }
  ];

  /** Demonstration occupation dictionary. */
  var OCCUPATION_TERMS = [
    { value: 'Farmer', pattern: /farmer|किसान/i },
    { value: 'Student', pattern: /student|छात्र/i },
    { value: 'Labourer', pattern: /labou?rer|मजदूर/i },
    { value: 'Shopkeeper', pattern: /shopkeeper|दुकानदार/i },
    { value: 'Daily wage worker', pattern: /daily wage|दिहाड़ी/i }
  ];

  /** Words that indicate a number in the text refers to income. */
  var INCOME_CONTEXT = /income|annual|salary|earn|आय|कमाई|वार्षिक|सालाना/i;

  /** Unit multipliers for income amounts. */
  var INCOME_UNITS = [
    { pattern: /^(lakh|लाख)$/i, factor: 100000 },
    { pattern: /^(thousand|हजार|hazar)$/i, factor: 1000 }
  ];

  /**
   * Returns the api.js service object if it is available, otherwise null.
   * @returns {Object|null}
   */
  function getApi() {
    if (typeof window === 'undefined' || !window) {
      return null;
    }
    return window.CIVICASSIST_API || null;
  }

  /**
   * True when an error is an ApiError representing a network or timeout failure.
   * @param {*} err
   * @returns {boolean}
   */
  function isFallbackError(err) {
    return !!err && (err.code === 'NETWORK' || err.code === 'TIMEOUT');
  }

  /**
   * Converts a value to a non-empty string, or null.
   * @param {*} value
   * @returns {string|null}
   */
  function cleanString(value) {
    if (typeof value !== 'string') {
      return null;
    }
    var trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  /**
   * Builds a normalised ExtractedProfile from an arbitrary object. Missing
   * fields become null; nothing is invented.
   * @param {Object} data
   * @param {string} source
   * @returns {ExtractedProfile}
   */
  function normalizeProfile(data, source) {
    var profile = {};
    PROFILE_FIELDS.forEach(function (field) {
      var value = data ? data[field] : null;
      if (typeof value === 'number') {
        profile[field] = isFinite(value) ? value : null;
      } else {
        profile[field] = cleanString(value);
      }
    });
    profile._source = source;
    return profile;
  }

  /**
   * True when a backend response contains at least one non-null profile field.
   * @param {Object} data
   * @returns {boolean}
   */
  function hasUsableData(data) {
    if (!data || typeof data !== 'object') {
      return false;
    }
    return PROFILE_FIELDS.some(function (field) {
      var value = data[field];
      return (typeof value === 'number' && isFinite(value)) ||
        (typeof value === 'string' && value.trim().length > 0);
    });
  }

  /**
   * Unwraps a response that may be shaped as { data: {...} } or as the object itself.
   * @param {*} response
   * @returns {Object|null}
   */
  function unwrap(response) {
    if (response && typeof response === 'object' && response.data &&
        typeof response.data === 'object') {
      return response.data;
    }
    return response && typeof response === 'object' ? response : null;
  }

  /**
   * Converts Devanagari digits (०-९) to ASCII digits so numbers in Hindi text parse.
   * @param {string} text
   * @returns {string}
   */
  function normalizeDigits(text) {
    return text.replace(/[०-९]/g, function (ch) {
      return String(ch.charCodeAt(0) - 0x966);
    });
  }

  /**
   * Extracts the first matching dictionary value from text.
   * @param {string} text
   * @param {Array<{value: string, pattern: RegExp}>} table
   * @returns {string|null}
   */
  function matchTable(text, table) {
    for (var i = 0; i < table.length; i++) {
      if (table[i].pattern.test(text)) {
        return table[i].value;
      }
    }
    return null;
  }

  /**
   * Extracts an annual income in rupees, or null if no credible amount is found.
   * A number is accepted when it has a lakh/thousand unit, or when income-related
   * wording is present. Ordinals such as "12th" are ignored.
   * @param {string} text
   * @returns {number|null}
   */
  function extractIncome(text) {
    var hasIncomeContext = INCOME_CONTEXT.test(text);
    var pattern = /(\d[\d,]*(?:\.\d+)?)\s*(lakh|लाख|thousand|हजार|hazar)?(\s*(th|st|nd|rd)\b)?/gi;
    var match;
    while ((match = pattern.exec(text)) !== null) {
      if (match[3]) {
        continue; // ordinal such as 12th, not an amount
      }
      var unit = match[2] || '';
      if (!unit && !hasIncomeContext) {
        continue;
      }
      var amount = parseFloat(match[1].replace(/,/g, ''));
      if (!isFinite(amount)) {
        continue;
      }
      var factor = 1;
      for (var i = 0; i < INCOME_UNITS.length; i++) {
        if (INCOME_UNITS[i].pattern.test(unit)) {
          factor = INCOME_UNITS[i].factor;
          break;
        }
      }
      return Math.round(amount * factor);
    }
    return null;
  }

  /**
   * Rule-based demonstration extractor. Uses no AI. Accepts Hindi and English
   * input regardless of UI language. Fields that cannot be found are null.
   * The result is labelled as demonstration output.
   * @param {string} text
   * @returns {ExtractedProfile & {isDemonstration: true}}
   */
  function demonstrationExtract(text) {
    var input = typeof text === 'string' ? normalizeDigits(text) : '';
    var lower = input.toLowerCase();

    var state = null;
    for (var i = 0; i < STATE_TERMS.length && state === null; i++) {
      var terms = STATE_TERMS[i].terms;
      for (var j = 0; j < terms.length; j++) {
        if (lower.indexOf(terms[j]) !== -1) {
          state = STATE_TERMS[i].name;
          break;
        }
      }
    }

    return {
      state: state,
      educationLevel: matchTable(input, EDUCATION_TERMS),
      annualFamilyIncome: extractIncome(input),
      purpose: null,
      occupation: matchTable(input, OCCUPATION_TERMS),
      otherInfo: null,
      _source: 'demo',
      isDemonstration: true
    };
  }

  /**
   * Extracts a citizen profile from free text. Tries the backend (via api.js)
   * first. Falls back to demonstrationExtract on network/timeout errors or when
   * the backend returns no usable data.
   * @param {string} text
   * @returns {Promise<ExtractedProfile>}
   */
  function extractProfile(text) {
    var api = getApi();
    var fallback = function () {
      return demonstrationExtract(text);
    };

    if (!api || typeof api.extractProfile !== 'function') {
      return Promise.resolve().then(fallback);
    }

    return Promise.resolve()
      .then(function () {
        return api.extractProfile(text);
      })
      .then(function (response) {
        var data = unwrap(response);
        if (hasUsableData(data)) {
          return normalizeProfile(data, 'backend');
        }
        return fallback();
      }, function (err) {
        if (isFallbackError(err)) {
          return fallback();
        }
        throw err;
      });
  }

  /**
   * Matches a profile against schemes via the backend (api.js). When the API is
   * unavailable, or fails with a network/timeout error, returns an empty mock
   * result. No matches are fabricated.
   * @param {ExtractedProfile} profile
   * @returns {Promise<{items: MatchResult[], _source: string, isMock?: boolean}>}
   */
  function matchSchemes(profile) {
    var api = getApi();
    var mock = function () {
      return { items: [], _source: 'mock', isMock: true };
    };

    if (!api || typeof api.matchSchemes !== 'function') {
      return Promise.resolve().then(mock);
    }

    return Promise.resolve()
      .then(function () {
        return api.matchSchemes(profile);
      })
      .then(function (response) {
        var data = unwrap(response);
        if (data && Array.isArray(data.items)) {
          return { items: data.items, _source: 'backend' };
        }
        return mock();
      }, function (err) {
        if (isFallbackError(err)) {
          return mock();
        }
        throw err;
      });
  }

  /**
   * Explains eligibility for one scheme. Not implemented locally: this is a
   * backend responsibility until the Nexen AI specification is available.
   * @param {Object} scheme
   * @param {ExtractedProfile} profile
   * @returns {null}
   */
  function explainEligibility(scheme, profile) {
    // Backend responsibility until the Nexen AI specification is available.
    return null;
  }

  /**
   * Lists required profile fields that are null, undefined or empty. This is
   * simple local logic and needs no AI.
   * @param {ExtractedProfile} profile
   * @returns {MissingInfoResult & {_source: 'local'}}
   */
  function detectMissingInfo(profile) {
    var missingFields = REQUIRED_FIELDS.filter(function (field) {
      var value = profile ? profile[field] : null;
      if (value === null || value === undefined) {
        return true;
      }
      if (typeof value === 'number') {
        return !isFinite(value);
      }
      return typeof value === 'string' && value.trim().length === 0;
    });
    return { missingFields: missingFields, _source: 'local' };
  }

  /**
   * Returns the Nexen AI integration status.
   * @returns {string}
   */
  function getIntegrationStatus() {
    return NEXEN_AI_INTEGRATION;
  }

  /** Maximum accepted length of a chat message, in characters. */
  var ASSISTANT_MAX_LENGTH = 1000;

  /** Prefix that marks every demonstration assistant reply. */
  var DEMO_PREFIX = '[Demo mode] ';

  /** Keyword rules for demonstration replies, checked in order (English and Hindi). */
  var ASSISTANT_RULES = [
    {
      pattern: /documents?|दस्तावेज/i,
      reply: 'Common documents include identity, address and income proof. ' +
        'The exact list depends on each scheme; open a scheme\'s checklist for its documents.'
    },
    {
      pattern: /eligib|पात्र/i,
      reply: 'Eligibility depends on each scheme\'s official criteria. ' +
        'Complete your profile and review matching results; ' +
        'the final decision rests with the government authority.'
    },
    {
      pattern: /apply|आवेदन/i,
      reply: 'Open a scheme\'s application guide for steps. ' +
        'Always apply through the official portal.'
    },
    {
      pattern: /scholarship|छात्रवृत्ति/i,
      reply: 'Scholarship eligibility is set by each scheme. ' +
        'Review your education level and family income in your profile, ' +
        'then compare matching results.'
    }
  ];

  /** Demonstration reply used when no keyword rule matches. */
  var ASSISTANT_DEFAULT_REPLY = 'This is demo mode: the AI backend is not connected yet, ' +
    'so I cannot analyse your question. You can explore Discover Schemes, ' +
    'your profile and checklists in the meantime.';

  /**
   * Builds a demonstration assistant reply from keyword rules. Always labelled.
   * @param {string} message
   * @returns {{reply: string, _source: 'demo', isDemonstration: true}}
   */
  function demonstrationReply(message) {
    var reply = ASSISTANT_DEFAULT_REPLY;
    for (var i = 0; i < ASSISTANT_RULES.length; i++) {
      if (ASSISTANT_RULES[i].pattern.test(message)) {
        reply = ASSISTANT_RULES[i].reply;
        break;
      }
    }
    return { reply: DEMO_PREFIX + reply, _source: 'demo', isDemonstration: true };
  }

  /**
   * Sends a question to the assistant. Uses the backend (api.js assistantChat)
   * when it exists; otherwise, or on any error, returns a labelled demonstration
   * reply. Rejects only when the message itself is invalid.
   * @param {string} message
   * @param {Object} [context]
   * @returns {Promise<{reply: string, _source: string, isDemonstration?: boolean}>}
   */
  function askAssistant(message, context) {
    if (typeof message !== 'string') {
      return Promise.reject(new TypeError('message must be a string'));
    }
    var text = message.trim();
    if (text.length === 0) {
      return Promise.reject(new TypeError('message must not be empty'));
    }
    if (text.length > ASSISTANT_MAX_LENGTH) {
      return Promise.reject(new RangeError('message must be at most ' + ASSISTANT_MAX_LENGTH + ' characters'));
    }

    var api = getApi();
    var demo = function () {
      return demonstrationReply(text);
    };

    if (!api || typeof api.assistantChat !== 'function') {
      return Promise.resolve().then(demo);
    }

    return Promise.resolve()
      .then(function () {
        return api.assistantChat(text, context || {});
      })
      .then(function (response) {
        var data = unwrap(response);
        if (data && typeof data.reply === 'string' && data.reply.trim().length > 0) {
          return { reply: data.reply, _source: 'backend', isDemonstration: false };
        }
        return demo();
      })
      .catch(function () {
        return demo();
      });
  }

  /**
   * Returns 'CONNECTED' when the backend assistant endpoint exists, else 'PENDING'.
   * @returns {'CONNECTED'|'PENDING'}
   */
  function getAssistantStatus() {
    var api = getApi();
    return api && typeof api.assistantChat === 'function' ? 'CONNECTED' : 'PENDING';
  }

  if (typeof window !== 'undefined' && window) {
    window.CIVICASSIST_AI = {
      extractProfile: extractProfile,
      demonstrationExtract: demonstrationExtract,
      matchSchemes: matchSchemes,
      explainEligibility: explainEligibility,
      detectMissingInfo: detectMissingInfo,
      getIntegrationStatus: getIntegrationStatus,
      askAssistant: askAssistant,
      getAssistantStatus: getAssistantStatus
    };
  }
})();
