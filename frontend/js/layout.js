/*
 * CivicAssist shared layout: renders the site header and footer.
 *
 * Contract:
 *  - <html data-base="..."> is "" on frontend/index.html and "../" under frontend/pages/.
 *  - <body data-page="..."> identifies the current page and selects the active nav link.
 *  - Placeholders #site-header and #site-footer are filled synchronously at load.
 *  - Exposes window.CivicAssist.layout = { renderHeader, renderFooter, refreshAccount }.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var base = root.getAttribute('data-base') || '';
  var body = document.body;
  var pageName = (body && body.getAttribute('data-page')) || '';

  var CA = (window.CivicAssist = window.CivicAssist || {});

  var LOGO_SRC = base + 'assets/Schemefinder%20Benefits%20Logo.png';

  var NAV_ACTIVE_MAP = {
    home: 'home',
    discover: 'discover',
    profile: 'discover',
    results: 'discover',
    'scheme-detail': 'discover',
    checklist: 'discover',
    'application-guide': 'discover',
    dashboard: 'dashboard',
    applications: 'applications'
  };

  var NAV_ITEMS = [
    { key: 'home', href: base + 'index.html', i18n: 'nav.home', label: 'Home' },
    { key: 'discover', href: base + 'pages/discover.html', i18n: 'nav.discover', label: 'Discover' },
    { key: 'how', href: base + 'index.html#how-it-works', i18n: 'nav.how', label: 'How it works' },
    { key: 'dashboard', href: base + 'pages/dashboard.html', i18n: 'nav.dashboard', label: 'My Dashboard' },
    { key: 'applications', href: base + 'pages/applications.html', i18n: 'nav.applications', label: 'My Applications' }
  ];

  var FOOTER_LINKS = [
    { href: base + 'index.html', i18n: 'nav.home', label: 'Home' },
    { href: base + 'pages/discover.html', i18n: 'nav.discover', label: 'Discover' },
    { href: base + 'pages/dashboard.html', i18n: 'nav.dashboard', label: 'My Dashboard' },
    { href: base + 'pages/applications.html', i18n: 'nav.applications', label: 'My Applications' }
  ];

  var GLOBE_SVG =
    '<svg class="lang-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="12" cy="12" r="9"/>' +
    '<path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/>' +
    '</svg>';

  var CHEVRON_SVG =
    '<svg class="account-chevron" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">' +
    '<path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';

  var HAMBURGER_SVG =
    '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">' +
    '<path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '</svg>';

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (name) {
        node.setAttribute(name, attrs[name]);
      });
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  function svgFrom(markup) {
    var template = document.createElement('template');
    template.innerHTML = markup.trim();
    return template.content.firstElementChild;
  }

  // Translated string with an English fallback when the i18n layer is missing or lacks the key.
  function tr(key, fallback) {
    var out = typeof CA.t === 'function' ? CA.t(key) : null;
    return out && out !== key ? out : fallback;
  }

  function readSession() {
    try {
      if (CA.storage && typeof CA.storage.get === 'function') {
        return CA.storage.get('auth.session', null);
      }
    } catch (err) {
      return null;
    }
    return null;
  }

  function clearSession() {
    try {
      if (CA.storage && typeof CA.storage.remove === 'function') {
        CA.storage.remove('auth.session');
      }
    } catch (err) {
      /* storage unavailable: nothing to clear */
    }
  }

  function applyActiveLink(nav) {
    var activeKey = NAV_ACTIVE_MAP[pageName];
    if (!activeKey) {
      return;
    }
    var links = nav.querySelectorAll('.nav-link');
    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute('data-nav') === activeKey) {
        links[i].classList.add('is-active');
        links[i].setAttribute('aria-current', 'page');
      }
    }
  }

  function buildNavLink(item) {
    var li = el('li', { class: 'nav-item' });
    var a = el('a', { class: 'nav-link', href: item.href, 'data-nav': item.key, 'data-i18n': item.i18n }, item.label);
    li.appendChild(a);
    return li;
  }

  function buildBrand() {
    var brand = el('a', { class: 'brand', href: base + 'index.html' });
    brand.appendChild(el('img', {
      class: 'brand-logo',
      src: LOGO_SRC,
      alt: 'Schemefinder Benefits'
    }));
    return brand;
  }

  function buildAuthLinks(extraClass) {
    return [
      el('a', {
        class: 'btn-login auth-link' + extraClass,
        href: base + 'pages/login.html',
        'data-i18n': 'account.login'
      }, 'Log in'),
      el('a', {
        class: 'btn-signup auth-link' + extraClass,
        href: base + 'pages/signup.html',
        'data-i18n': 'account.signup'
      }, 'Sign up')
    ];
  }

  function renderAccount() {
    var area = document.getElementById('accountArea');
    if (!area) {
      return;
    }
    var wasOpen = isAccountMenuOpen();
    area.textContent = '';

    var session = readSession();
    var signedIn = !!(session && typeof session === 'object');
    var header = document.getElementById('siteHeader');
    if (header) {
      // Header-level Log in / Sign up links are hidden while signed in.
      header.classList.toggle('is-signed-in', signedIn);
    }

    if (!signedIn) {
      // Logged-out state: the static Log in / Sign up links in the header cover this.
      return;
    }

    var displayName = String(session.name || session.email || '');
    var initial = displayName.charAt(0).toUpperCase() || '?';

    var trigger = el('button', {
      class: 'account-trigger',
      type: 'button',
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
      'aria-controls': 'accountMenu',
      'data-i18n-aria-label': 'account.menu',
      'aria-label': tr('account.menu', 'Account menu')
    });
    trigger.appendChild(el('span', { class: 'account-avatar', 'aria-hidden': 'true' }, initial));
    trigger.appendChild(el('span', { class: 'account-name' }, displayName));
    trigger.appendChild(svgFrom(CHEVRON_SVG));

    var menu = el('div', {
      class: 'account-menu',
      id: 'accountMenu',
      role: 'menu',
      'aria-hidden': 'true',
      hidden: ''
    });
    menu.appendChild(el('a', {
      class: 'account-menu-item',
      href: base + 'pages/dashboard.html',
      role: 'menuitem',
      'data-i18n': 'nav.dashboard'
    }, tr('nav.dashboard', 'My Dashboard')));
    menu.appendChild(el('a', {
      class: 'account-menu-item',
      href: base + 'pages/profile.html',
      role: 'menuitem',
      'data-i18n': 'account.profile'
    }, tr('account.profile', 'My Profile')));
    menu.appendChild(el('a', {
      class: 'account-menu-item',
      href: base + 'pages/applications.html',
      role: 'menuitem',
      'data-i18n': 'nav.applications'
    }, tr('nav.applications', 'My Applications')));

    var logout = el('button', {
      class: 'account-menu-item account-logout',
      type: 'button',
      role: 'menuitem',
      'data-i18n': 'account.logout'
    }, tr('account.logout', 'Log out'));
    logout.addEventListener('click', function () {
      clearSession();
      window.location.href = base + 'index.html';
    });
    menu.appendChild(logout);

    area.appendChild(trigger);
    area.appendChild(menu);

    if (wasOpen) {
      setAccountMenuOpen(true, false);
    }
  }

  function setAccountMenuOpen(open, focusFirst) {
    var area = document.getElementById('accountArea');
    if (!area) {
      return;
    }
    var trigger = area.querySelector('.account-trigger');
    var menu = area.querySelector('.account-menu');
    if (!trigger || !menu) {
      return;
    }
    // hidden, is-open, aria-hidden and aria-expanded always change together.
    menu.hidden = !open;
    menu.classList.toggle('is-open', open);
    menu.setAttribute('aria-hidden', open ? 'false' : 'true');
    area.classList.toggle('is-open', open);
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open && focusFirst) {
      var first = menu.querySelector('[role="menuitem"]');
      if (first) {
        first.focus();
      }
    }
  }

  function isAccountMenuOpen() {
    var area = document.getElementById('accountArea');
    var menu = area && area.querySelector('.account-menu');
    return !!menu && !menu.hidden;
  }

  function renderHeader() {
    var host = document.getElementById('site-header');
    if (!host) {
      return;
    }
    host.textContent = '';

    var header = el('header', { class: 'site-header', id: 'siteHeader' });
    var container = el('div', { class: 'container navbar' });

    // LEFT: logo
    container.appendChild(buildBrand());

    // CENTRE: navigation drawer (row on desktop, slide-down panel under 1023px)
    var nav = el('nav', {
      class: 'nav-links nav-drawer',
      id: 'primary-nav',
      'data-i18n-aria-label': 'nav.mainLabel',
      'aria-label': 'Main navigation'
    });
    var list = el('ul', { class: 'nav-list' });
    NAV_ITEMS.forEach(function (item) {
      list.appendChild(buildNavLink(item));
    });
    nav.appendChild(list);

    var mobileActions = el('div', { class: 'nav-mobile-actions' });
    buildAuthLinks(' auth-link-drawer').forEach(function (link) {
      mobileActions.appendChild(link);
    });
    nav.appendChild(mobileActions);
    container.appendChild(nav);

    // RIGHT: language, auth links, account
    var actions = el('div', { class: 'nav-actions' });
    var langField = el('div', { class: 'lang-field' });
    langField.appendChild(svgFrom(GLOBE_SVG));
    langField.appendChild(el('select', {
      id: 'langSelect',
      class: 'lang-select',
      'data-i18n-aria-label': 'nav.language',
      'aria-label': 'Language'
    }));
    actions.appendChild(langField);
    buildAuthLinks('').forEach(function (link) {
      actions.appendChild(link);
    });
    actions.appendChild(el('div', { class: 'account', id: 'accountArea' }));
    container.appendChild(actions);

    var toggle = el('button', {
      class: 'nav-toggle',
      type: 'button',
      'aria-controls': 'primary-nav',
      'aria-expanded': 'false',
      'data-i18n-aria-label': 'nav.openMenu',
      'aria-label': 'Open menu'
    });
    toggle.appendChild(svgFrom(HAMBURGER_SVG));
    container.appendChild(toggle);


toggle.addEventListener('click', function () {
  var isOpen = header.classList.toggle('nav-open');

  toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  toggle.setAttribute(
    'aria-label',
    isOpen ? 'Close menu' : 'Open menu'
  );
});

nav.addEventListener('click', function (event) {
  if (event.target.closest('.nav-link, .auth-link')) {
    header.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
  }
});


    header.appendChild(container);
    host.appendChild(header);

    applyActiveLink(nav);
    renderAccount();
  }

  function renderFooter() {
    var host = document.getElementById('site-footer');
    if (!host) {
      return;
    }
    host.textContent = '';

    var footer = el('footer', { class: 'site-footer' });
    var container = el('div', { class: 'container footer-inner' });

    var brandBlock = el('div', { class: 'footer-brand' });
    brandBlock.appendChild(el('p', { class: 'footer-brand-name', 'data-i18n': 'brand.name' }, 'CivicAssist'));
    brandBlock.appendChild(el('p', { class: 'footer-tagline', 'data-i18n': 'brand.tagline' },
      'Discover government schemes you qualify for.'));
    container.appendChild(brandBlock);

    var linksBlock = el('nav', { class: 'footer-links', 'aria-label': 'Footer navigation' });
    var linkList = el('ul', { class: 'footer-link-list' });
    FOOTER_LINKS.forEach(function (item) {
      var li = el('li');
      li.appendChild(el('a', { href: item.href, 'data-i18n': item.i18n }, item.label));
      linkList.appendChild(li);
    });
    linksBlock.appendChild(linkList);
    container.appendChild(linksBlock);

    footer.appendChild(container);

    var bottom = el('div', { class: 'container footer-bottom' });
    bottom.appendChild(el('p', { class: 'footer-disclaimer', 'data-i18n': 'footer.disclaimer' },
      'CivicAssist provides guidance only. Verify details on official government portals.'));
    bottom.appendChild(el('p', { class: 'footer-copyright', 'data-i18n': 'footer.copyright' },
      '\u00A9 CivicAssist'));
    footer.appendChild(bottom);

    host.appendChild(footer);
  }

  function bindGlobalAccountHandlers() {
    // Outside click closes the menu; clicking a menu item closes it too.
    document.addEventListener('click', function (event) {
      var target = event.target;
      var area = document.getElementById('accountArea');
      if (!area || !isAccountMenuOpen()) {
        return;
      }
      if (!area.contains(target)) {
        setAccountMenuOpen(false, false);
        return;
      }
      if (target.closest && target.closest('.account-menu-item')) {
        setAccountMenuOpen(false, false);
      }
    });

    // Trigger toggles the menu.
    document.addEventListener('click', function (event) {
      var area = document.getElementById('accountArea');
      if (!area) {
        return;
      }
      var trigger = event.target.closest ? event.target.closest('.account-trigger') : null;
      if (trigger && area.contains(trigger)) {
        var opening = !isAccountMenuOpen();
        setAccountMenuOpen(opening, opening);
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || !isAccountMenuOpen()) {
        return;
      }
      setAccountMenuOpen(false, false);
      var area = document.getElementById('accountArea');
      var trigger = area && area.querySelector('.account-trigger');
      if (trigger) {
        trigger.focus();
      }
    });

    // Re-render the account area text in the new language.
    document.addEventListener('civicassist:langchange', function () {
      renderAccount();
    });
  }

  renderHeader();
  renderFooter();
  bindGlobalAccountHandlers();

  CA.layout = {
    renderHeader: renderHeader,
    renderFooter: renderFooter,
    refreshAccount: renderAccount
  };
})();
