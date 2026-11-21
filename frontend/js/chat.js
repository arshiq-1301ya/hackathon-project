/**
 * CivicAssist - chat.js
 *
 * Floating AI assistant. Injects its own launcher button and chat panel into
 * <body> once per page. Conversation is kept in memory only (no storage).
 * Replies come from window.CIVICASSIST_AI.askAssistant (ai-service.js).
 * All message text is rendered with textContent, never as HTML.
 *
 * Public API: window.CivicAssist.chat = { open, close, toggle }
 * Document event 'civicassist:chat-open' opens the panel.
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var MAX_INPUT_LENGTH = 1000;
  var HIDE_DELAY_MS = 220;
  var MAX_INPUT_HEIGHT_PX = 120;
  var WELCOME_TEXT = 'Hello! I can help with government schemes, eligibility, documents and applications. Ask in Hindi or English.';
  var ERROR_TEXT = 'Could not get a reply. Please try again.';
  var SUGGESTIONS = [
    'Which government schemes can I apply for?',
    'Am I eligible for scholarships?',
    'What documents do I need?',
    'How do I apply for a government scheme?',
    'Help me understand my eligibility.'
  ];

  /**
   * Creates an element with optional class name and attributes.
   * @param {string} tag
   * @param {string} [className]
   * @param {Object} [attrs]
   * @returns {HTMLElement}
   */
  function el(tag, className, attrs) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        node.setAttribute(key, attrs[key]);
      });
    }
    return node;
  }

  /**
   * Creates an inline stroke-style SVG icon.
   * @param {string[]} paths  SVG path data strings.
   * @returns {SVGElement}
   */
  function svgIcon(paths) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'chat-icon');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    paths.forEach(function (d) {
      var path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    });
    return svg;
  }

  function init() {
    if (document.getElementById('chatLauncher')) {
      return;
    }
    if (!document.body) {
      return;
    }

    var isOpen = false;
    var busy = false;
    var hideTimer = null;

    // ---- Launcher -------------------------------------------------------
    var launcher = el('button', 'chat-launcher', {
      id: 'chatLauncher',
      type: 'button',
      'aria-controls': 'chatPanel',
      'aria-expanded': 'false',
      'aria-label': 'Open AI assistant'
    });
    launcher.appendChild(svgIcon([
      'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z'
    ]));
    var launcherLabel = el('span', 'chat-launcher-label');
    launcherLabel.textContent = 'Ask CivicAssist';
    launcher.appendChild(launcherLabel);

    // ---- Panel header --------------------------------------------------
    var panel = el('section', 'chat-panel', {
      id: 'chatPanel',
      role: 'dialog',
      'aria-modal': 'false',
      'aria-labelledby': 'chatTitle'
    });
    panel.hidden = true;

    var header = el('header', 'chat-header');
    var brand = el('div', 'chat-brand');
    var avatar = el('span', 'chat-avatar', { 'aria-hidden': 'true' });
    avatar.textContent = 'CA';
    var title = el('h2', 'chat-title', { id: 'chatTitle' });
    title.textContent = 'CivicAssist AI';
    var demoBadge = el('span', 'badge-demo');
    demoBadge.textContent = 'Demo mode';
    brand.appendChild(avatar);
    brand.appendChild(title);
    brand.appendChild(demoBadge);

    var closeBtn = el('button', 'chat-close', { type: 'button', 'aria-label': 'Close' });
    closeBtn.appendChild(svgIcon(['M6 6l12 12M18 6L6 18']));
    header.appendChild(brand);
    header.appendChild(closeBtn);

    // ---- Messages ------------------------------------------------------
    var messagesEl = el('div', 'chat-messages', {
      id: 'chatMessages',
      role: 'log',
      'aria-live': 'polite'
    });

    var typingEl = el('div', 'typing-indicator', { 'aria-hidden': 'true' });
    typingEl.hidden = true;
    for (var d = 0; d < 3; d++) {
      typingEl.appendChild(el('span', 'typing-dot'));
    }

    // ---- Suggestions ---------------------------------------------------
    var suggestionsEl = el('div', 'chat-suggestions');
    SUGGESTIONS.forEach(function (text) {
      var chip = el('button', 'btn btn-ghost btn-sm chat-suggestion', { type: 'button' });
      chip.textContent = text;
      chip.addEventListener('click', function () {
        send(text);
      });
      suggestionsEl.appendChild(chip);
    });

    // ---- Input form ----------------------------------------------------
    var form = el('form', 'chat-form', { id: 'chatForm' });
    var input = el('textarea', 'chat-input', {
      id: 'chatInput',
      rows: '1',
      maxlength: String(MAX_INPUT_LENGTH),
      placeholder: 'Type your question\u2026',
      'aria-label': 'Your question'
    });
    var sendBtn = el('button', 'btn btn-primary chat-send', {
      id: 'chatSend',
      type: 'submit',
      'aria-label': 'Send'
    });
    sendBtn.appendChild(svgIcon(['M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z']));
    form.appendChild(input);
    form.appendChild(sendBtn);

    var note = el('p', 'chat-note');
    note.textContent = 'AI answers are indicative. Do not share Aadhaar or other ID numbers.';

    panel.appendChild(header);
    panel.appendChild(messagesEl);
    panel.appendChild(typingEl);
    panel.appendChild(suggestionsEl);
    panel.appendChild(form);
    panel.appendChild(note);

    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    // ---- Helpers -------------------------------------------------------
    function scrollToBottom() {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function addMessage(role, text) {
      var row = el('div', 'chat-msg chat-msg-' + role + ' chat-msg-enter');
      row.textContent = text;
      messagesEl.appendChild(row);
      scrollToBottom();
    }

    function updateBadge(source) {
      demoBadge.hidden = !!source && source !== 'demo';
    }

    function setBusy(value) {
      busy = value;
      sendBtn.disabled = value;
      typingEl.hidden = !value;
      if (value) {
        scrollToBottom();
      }
    }

    function resizeInput() {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, MAX_INPUT_HEIGHT_PX) + 'px';
    }

    // ---- Open / close --------------------------------------------------
    function open() {
      if (!isOpen) {
        isOpen = true;
        window.clearTimeout(hideTimer);
        panel.hidden = false;
        launcher.setAttribute('aria-expanded', 'true');
        window.requestAnimationFrame(function () {
          if (isOpen) {
            panel.classList.add('is-open');
          }
        });
      }
      input.focus();
    }

    function close() {
      if (!isOpen) {
        return;
      }
      isOpen = false;
      panel.classList.remove('is-open');
      launcher.setAttribute('aria-expanded', 'false');
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(function () {
        if (!isOpen) {
          panel.hidden = true;
        }
      }, HIDE_DELAY_MS);
      launcher.focus();
    }

    function toggle() {
      if (isOpen) {
        close();
      } else {
        open();
      }
    }

    // ---- Sending -------------------------------------------------------
    async function send(raw) {
      var text = typeof raw === 'string' ? raw.trim() : '';
      if (!text || busy) {
        return;
      }
      addMessage('user', text);
      input.value = '';
      resizeInput();
      setBusy(true);
      try {
        var ai = window.CIVICASSIST_AI;
        if (!ai || typeof ai.askAssistant !== 'function') {
          throw new Error('assistant unavailable');
        }
        var result = await ai.askAssistant(text);
        var reply = result && typeof result.reply === 'string' ? result.reply : '';
        if (!reply) {
          throw new Error('empty reply');
        }
        updateBadge(result._source);
        addMessage('assistant', reply);
      } catch (err) {
        addMessage('assistant', ERROR_TEXT);
      } finally {
        setBusy(false);
      }
    }

    // ---- Events --------------------------------------------------------
    launcher.addEventListener('click', toggle);
    closeBtn.addEventListener('click', close);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) {
        close();
      }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      send(input.value);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        send(input.value);
      }
    });

    input.addEventListener('input', resizeInput);

    document.addEventListener('civicassist:chat-open', function () {
      open();
    });

    // ---- Start ---------------------------------------------------------
    addMessage('assistant', WELCOME_TEXT);

    window.CivicAssist = window.CivicAssist || {};
    window.CivicAssist.chat = {
      open: open,
      close: close,
      toggle: toggle
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
