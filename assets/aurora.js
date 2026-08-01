/**
 * Aurora Ring — shared behaviour for the aurora-* sections.
 *
 * Deliberately dependency-free and idempotent: the Shopify theme editor
 * re-renders sections in place, so every initialiser is safe to run again and
 * marks what it has already touched.
 */

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

/* ------------------------------------------------------------------ *
 * Scroll reveal
 * ------------------------------------------------------------------ */

function initReveal(root = document) {
  const targets = root.querySelectorAll('.aurora-reveal:not([data-reveal-bound])');
  if (!targets.length) return;

  // Reduced motion or no IntersectionObserver: show everything immediately.
  if (REDUCED_MOTION.matches || !('IntersectionObserver' in window)) {
    targets.forEach((el) => {
      el.setAttribute('data-reveal-bound', '');
      el.classList.add('is-revealed');
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.1 }
  );

  targets.forEach((el) => {
    el.setAttribute('data-reveal-bound', '');
    observer.observe(el);
  });
}

/* ------------------------------------------------------------------ *
 * Count-up for data readouts
 *
 * Reads the final value from the element's text so the markup stays the
 * source of truth and the page degrades to plain numbers without JS.
 * ------------------------------------------------------------------ */

function animateCount(el) {
  const raw = el.textContent.trim();
  // Split "7h 42m" / "68ms" / "12,480" into a leading number and its suffix.
  const match = raw.match(/^([\d.,]+)(.*)$/s);
  if (!match) return;

  const target = parseFloat(match[1].replace(/,/g, ''));
  if (!Number.isFinite(target)) return;

  const suffix = match[2];
  const decimals = (match[1].split('.')[1] || '').length;
  const grouped = match[1].includes(',');
  const duration = 1100;
  const start = performance.now();

  // Lock the box so the surrounding layout cannot shift while digits change.
  el.style.minWidth = `${el.getBoundingClientRect().width}px`;
  el.style.display = 'inline-block';

  function format(value) {
    const fixed = value.toFixed(decimals);
    return grouped ? Number(fixed).toLocaleString('en-US', { minimumFractionDigits: decimals }) : fixed;
  }

  function frame(now) {
    const p = Math.min((now - start) / duration, 1);
    // easeOutExpo — fast settle, reads as a sensor locking on
    const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
    el.textContent = format(target * eased) + suffix;
    if (p < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function initCounters(root = document) {
  const counters = root.querySelectorAll('[data-aurora-count]:not([data-count-bound])');
  if (!counters.length) return;

  if (REDUCED_MOTION.matches || !('IntersectionObserver' in window)) {
    counters.forEach((el) => el.setAttribute('data-count-bound', ''));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animateCount(entry.target);
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.6 }
  );

  counters.forEach((el) => {
    el.setAttribute('data-count-bound', '');
    observer.observe(el);
  });
}

/* ------------------------------------------------------------------ *
 * Radial gauges — draw the arc from a data-value percentage
 * ------------------------------------------------------------------ */

function initGauges(root = document) {
  const gauges = root.querySelectorAll('[data-aurora-gauge]:not([data-gauge-bound])');
  if (!gauges.length) return;

  const paint = (el) => {
    const value = Math.max(0, Math.min(100, parseFloat(el.dataset.auroraGauge) || 0));
    const circle = el.querySelector('[data-gauge-arc]');
    if (!circle) return;

    const r = circle.r.baseVal.value;
    const circumference = 2 * Math.PI * r;
    circle.style.strokeDasharray = `${circumference}`;

    if (REDUCED_MOTION.matches) {
      circle.style.strokeDashoffset = `${circumference * (1 - value / 100)}`;
      return;
    }

    circle.style.strokeDashoffset = `${circumference}`;
    requestAnimationFrame(() => {
      circle.style.transition = 'stroke-dashoffset 1.4s cubic-bezier(0.22, 1, 0.36, 1)';
      circle.style.strokeDashoffset = `${circumference * (1 - value / 100)}`;
    });
  };

  if (!('IntersectionObserver' in window)) {
    gauges.forEach((el) => {
      el.setAttribute('data-gauge-bound', '');
      paint(el);
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        paint(entry.target);
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.4 }
  );

  gauges.forEach((el) => {
    el.setAttribute('data-gauge-bound', '');
    observer.observe(el);
  });
}

/* ------------------------------------------------------------------ *
 * Sticky buy bar — appears once the main buy button scrolls out of view
 * ------------------------------------------------------------------ */

function initStickyBar(root = document) {
  const bar = root.querySelector('[data-aurora-sticky]:not([data-sticky-bound])');
  if (!bar) return;
  bar.setAttribute('data-sticky-bound', '');

  const sentinelSelector = bar.dataset.auroraSticky;
  const sentinel = sentinelSelector ? document.querySelector(sentinelSelector) : null;

  // Reserve space while the bar is up so it never sits on top of the last
  // section or the footer. Released again when it hides.
  const setVisible = (visible) => {
    bar.classList.toggle('is-visible', visible);
    document.body.style.paddingBottom = visible ? `${bar.offsetHeight}px` : '';
  };

  if (!sentinel || !('IntersectionObserver' in window)) {
    // Without an anchor to track, showing after a fixed scroll distance is the
    // safer fallback than never showing at all.
    const onScroll = () => setVisible(window.scrollY > 700);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return;
  }

  const observer = new IntersectionObserver(
    ([entry]) => {
      // Show only once the anchor has scrolled off the top of the viewport.
      const belowViewport = entry.boundingClientRect.top > 0;
      setVisible(!entry.isIntersecting && !belowViewport);
    },
    { threshold: 0 }
  );

  observer.observe(sentinel);
}

/* ------------------------------------------------------------------ *
 * Add-to-cart proxy
 *
 * The sticky bar never owns its own cart form. It forwards the click to the
 * page's real add-to-cart button so the currently selected variant, quantity
 * and any line-item properties are whatever the customer actually chose.
 * ------------------------------------------------------------------ */

function initAtcProxy(root = document) {
  const proxies = root.querySelectorAll('[data-aurora-atc-proxy]:not([data-proxy-bound])');

  proxies.forEach((proxy) => {
    proxy.setAttribute('data-proxy-bound', '');

    proxy.addEventListener('click', () => {
      const selector = proxy.dataset.auroraAtcProxy;
      // Never match the proxy itself, or a click would recurse.
      const target = Array.from(document.querySelectorAll(selector)).find(
        (el) => el !== proxy && !proxy.contains(el)
      );

      if (target) {
        target.click();
        return;
      }

      // No form on the page (or it has not hydrated): fall back to the product
      // page rather than silently doing nothing.
      const href = proxy.dataset.auroraAtcFallback;
      if (href) window.location.href = href;
    });
  });
}

/* ------------------------------------------------------------------ *
 * Accordion — one open at a time within a group
 * ------------------------------------------------------------------ */

function initAccordions(root = document) {
  const groups = root.querySelectorAll('[data-aurora-accordion]:not([data-accordion-bound])');

  groups.forEach((group) => {
    group.setAttribute('data-accordion-bound', '');
    const items = Array.from(group.querySelectorAll('details'));

    items.forEach((item) => {
      item.addEventListener('toggle', () => {
        if (!item.open) return;
        items.forEach((other) => {
          if (other !== item) other.open = false;
        });
      });
    });
  });
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

function init(root = document) {
  initReveal(root);
  initCounters(root);
  initGauges(root);
  initStickyBar(root);
  initAtcProxy(root);
  initAccordions(root);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => init());
} else {
  init();
}

// Theme editor re-renders a section's markup without a page load.
document.addEventListener('shopify:section:load', (event) => init(event.target));
