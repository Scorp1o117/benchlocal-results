(function () {
  'use strict';

  var html = document.documentElement;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var precisePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function setLanguage(language) {
    html.lang = language === 'en' ? 'en' : 'zh-CN';
    localStorage.setItem('bl-lang', language);
    document.querySelectorAll('[data-lb]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.lb === language));
    });
  }

  document.querySelectorAll('[data-lb]').forEach(function (button) {
    button.addEventListener('click', function () { setLanguage(button.dataset.lb); });
  });
  setLanguage(localStorage.getItem('bl-lang') || 'zh');

  function attachTilt(node, strength, lift) {
    if (!node) return;
    node.addEventListener('pointermove', function (event) {
      var rect = node.getBoundingClientRect();
      var x = (event.clientX - rect.left) / rect.width - .5;
      var y = (event.clientY - rect.top) / rect.height - .5;
      node.style.setProperty('--glow-x', ((x + .5) * 100).toFixed(1) + '%');
      node.style.setProperty('--glow-y', ((y + .5) * 100).toFixed(1) + '%');
      node.style.transform = 'perspective(1100px) rotateX(' + (-y * strength) + 'deg) rotateY(' + (x * strength) + 'deg) translateY(' + lift + 'px)';
    });
    node.addEventListener('pointerleave', function () {
      node.style.transform = '';
      node.style.removeProperty('--glow-x');
      node.style.removeProperty('--glow-y');
    });
  }

  if (!reducedMotion && precisePointer) {
    attachTilt(document.querySelector('.detail-hero'), 8, 0);
    document.querySelectorAll('.score-card').forEach(function (card) { attachTilt(card, 5, -3); });
    document.querySelectorAll('.suite-card').forEach(function (card) { attachTilt(card, 3.5, -2); });

    var logo = document.querySelector('.detail-logo:not(.placeholder)');
    if (logo) {
      logo.addEventListener('pointermove', function (event) {
        var rect = logo.getBoundingClientRect();
        var x = (event.clientX - rect.left) / rect.width - .5;
        var y = (event.clientY - rect.top) / rect.height - .5;
        logo.style.transform = 'perspective(700px) rotateX(' + (-y * 14) + 'deg) rotateY(' + (x * 14) + 'deg) rotate(-1deg) translateZ(62px) scale(1.055)';
      });
      logo.addEventListener('pointerleave', function () { logo.style.transform = ''; });
    }
  }

  html.classList.add('motion-ready');
  var nodes = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || reducedMotion) {
    nodes.forEach(function (node) { node.classList.add('is-visible'); });
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: .06 });
  nodes.forEach(function (node) { observer.observe(node); });
})();
