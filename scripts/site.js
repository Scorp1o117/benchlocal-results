(function () {
  'use strict';

  var html = document.documentElement;
  var savedLanguage = localStorage.getItem('bl-lang') || 'zh';

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
  setLanguage(savedLanguage);

  var list = document.querySelector('.model-list');
  var cards = list ? Array.from(list.querySelectorAll('.model-card')) : [];
  var currentMode = 'all';
  var currentSort = 'total';

  function metricFor(card, key) {
    if (currentMode === 'all') return Number(card.dataset[key]);
    var prefix = currentMode.replace(/-([a-z])/g, function (_, letter) { return letter.toUpperCase(); });
    var property = prefix + key.charAt(0).toUpperCase() + key.slice(1);
    var value = Number(card.dataset[property]);
    return Number.isFinite(value) ? value : -Infinity;
  }

  function updateRanking() {
    cards
      .slice()
      .sort(function (left, right) { return metricFor(right, currentSort) - metricFor(left, currentSort); })
      .forEach(function (card) { list.appendChild(card); });

    var rank = 0;
    cards.forEach(function (card) {
      var visible = currentMode === 'all' || card.dataset.modes.split(',').includes(currentMode);
      card.hidden = !visible;
    });
    Array.from(list.querySelectorAll('.model-card')).forEach(function (card) {
      if (card.hidden) return;
      rank += 1;
      card.querySelector('.model-rank strong').textContent = String(rank).padStart(2, '0');
      var score = metricFor(card, currentSort);
      card.querySelector('.model-primary-score strong').textContent = Number(score.toFixed(1));
      var labels = {
        total: ['能力上限', 'Max score'],
        adjusted: ['实用得分', 'Effective'],
        tc: ['ToolCall', 'ToolCall'],
        bf: ['BugFind', 'BugFind'],
        ha: ['HermesAgent', 'HermesAgent'],
      };
      card.querySelector('.model-primary-score > span').innerHTML = '<span data-lang="zh">' + labels[currentSort][0] + '</span><span data-lang="en">' + labels[currentSort][1] + '</span>';
    });
  }

  document.querySelectorAll('[data-filter]').forEach(function (button) {
    button.addEventListener('click', function () {
      currentMode = button.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(function (item) {
        item.setAttribute('aria-pressed', String(item === button));
      });
      updateRanking();
    });
  });

  var sort = document.querySelector('[data-sort]');
  if (sort) sort.addEventListener('change', function () { currentSort = sort.value; updateRanking(); });
  if (list) updateRanking();

  var spotlightData = {
    thinking: { max: 93.7, effective: 87.7, tc: 100, bf: 95, ha: 88 },
    'no-thinking': { max: 91, effective: 88, tc: 100, bf: 90, ha: 85 },
  };

  function animateNumber(element, next) {
    var start = Number(element.textContent);
    var startedAt = performance.now();
    function frame(now) {
      var progress = Math.min(1, (now - startedAt) / 500);
      var eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = (start + (next - start) * eased).toFixed(1);
      if (progress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  document.querySelectorAll('[data-spotlight-mode]').forEach(function (button) {
    button.addEventListener('click', function () {
      var mode = button.dataset.spotlightMode;
      var next = spotlightData[mode];
      document.querySelectorAll('[data-spotlight-mode]').forEach(function (item) {
        item.setAttribute('aria-pressed', String(item === button));
      });
      animateNumber(document.querySelector('[data-spotlight-max]'), next.max);
      animateNumber(document.querySelector('[data-spotlight-effective]'), next.effective);
      ['tc', 'bf', 'ha'].forEach(function (key) {
        document.querySelector('[data-spotlight-bar="' + key + '"]').style.width = next[key] + '%';
        document.querySelector('[data-spotlight-value="' + key + '"]').textContent = next[key];
      });
      document.querySelector('[data-spotlight-dot]').classList.toggle('fast', mode === 'no-thinking');
    });
  });

  var motionAllowed = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var precisePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var stage = document.querySelector('[data-tilt]');
  if (stage && motionAllowed && precisePointer) {
    stage.addEventListener('pointermove', function (event) {
      var rect = stage.getBoundingClientRect();
      var x = (event.clientX - rect.left) / rect.width - .5;
      var y = (event.clientY - rect.top) / rect.height - .5;
      stage.style.transform = 'perspective(1100px) rotateX(' + (-y * 12) + 'deg) rotateY(' + (x * 12) + 'deg) scale(1.012)';
    });
    stage.addEventListener('pointerleave', function () { stage.style.transform = ''; });
  }

  var orbit = document.querySelector('[data-model-orbit]');
  if (orbit) {
    var orbitNodes = Array.from(orbit.querySelectorAll('.orbit-model'));
    var orbitPhase = 0;
    var orbitPaused = false;
    var orbitMotion = 1;
    var orbitHovered = null;
    var orbitLastFrame = null;
    var orbitWidth = orbit.clientWidth;
    var orbitHeight = orbit.clientHeight;

    function measureOrbit() {
      orbitWidth = orbit.clientWidth;
      orbitHeight = orbit.clientHeight;
    }

    function drawOrbit(now) {
      if (orbitLastFrame === null) orbitLastFrame = now;
      var elapsed = Math.min(now - orbitLastFrame, 50);
      orbitLastFrame = now;
      var targetMotion = orbitPaused || document.hidden ? 0 : 1;
      var motionEase = 1 - Math.exp(-elapsed / (targetMotion ? 620 : 480));
      orbitMotion += (targetMotion - orbitMotion) * motionEase;
      if (orbitMotion < .001) orbitMotion = 0;
      if (motionAllowed) orbitPhase += elapsed * Math.PI * 2 / 42000 * orbitMotion;

      var radiusX = orbitWidth * .435;
      var radiusY = orbitHeight * .27;
      orbitNodes.forEach(function (node, index) {
        var angle = orbitPhase + index * Math.PI * 2 / orbitNodes.length;
        var sine = Math.sin(angle);
        var depth = (sine + 1) / 2;
        var hovered = node === orbitHovered;
        var x = Math.cos(angle) * radiusX;
        var y = sine * radiusY - (hovered ? 8 : 0);
        var scale = .66 + depth * .48 + (hovered ? .15 : 0);
        node.style.transform = 'translate3d(calc(-50% + ' + x.toFixed(2) + 'px), calc(-50% + ' + y.toFixed(2) + 'px), ' + (depth * 70).toFixed(1) + 'px) scale(' + scale.toFixed(3) + ')';
        node.style.opacity = String(hovered ? 1 : .44 + depth * .56);
        node.style.filter = 'blur(' + (hovered ? 0 : (1 - depth) * .65).toFixed(2) + 'px) saturate(' + (.82 + depth * .28).toFixed(2) + ')';
        node.style.zIndex = String(10 + Math.round(depth * 90) + (hovered ? 110 : 0));
      });

      if (motionAllowed) requestAnimationFrame(drawOrbit);
    }

    orbit.addEventListener('pointerenter', function () { orbitPaused = true; });
    orbit.addEventListener('pointerleave', function () { orbitPaused = false; orbitHovered = null; });
    orbit.addEventListener('focusin', function () { orbitPaused = true; });
    orbit.addEventListener('focusout', function () { orbitPaused = false; orbitHovered = null; });
    orbitNodes.forEach(function (node) {
      node.addEventListener('pointerenter', function () { orbitHovered = node; });
      node.addEventListener('pointerleave', function () { orbitHovered = null; });
      node.addEventListener('focus', function () { orbitHovered = node; });
      node.addEventListener('blur', function () { orbitHovered = null; });
    });
    if ('ResizeObserver' in window) new ResizeObserver(measureOrbit).observe(orbit);
    drawOrbit(performance.now());
  }

  if (motionAllowed && precisePointer) {

    cards.forEach(function (card) {
      card.addEventListener('pointermove', function (event) {
        var rect = card.getBoundingClientRect();
        var x = (event.clientX - rect.left) / rect.width - .5;
        var y = (event.clientY - rect.top) / rect.height - .5;
        card.style.transform = 'perspective(1200px) rotateX(' + (-y * 3.6) + 'deg) rotateY(' + (x * 3.6) + 'deg) translateY(-2px)';
        card.style.boxShadow = '0 16px 35px rgba(41, 50, 86, .07)';
      });
      card.addEventListener('pointerleave', function () {
        card.style.transform = '';
        card.style.boxShadow = '';
      });
    });
  }

  html.classList.add('motion-ready');
  var reveals = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    reveals.forEach(function (element) { element.classList.add('is-visible'); });
  } else {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: .06 });
    reveals.forEach(function (element) { observer.observe(element); });
  }
})();
