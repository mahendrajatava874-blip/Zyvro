(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const BAL_KEY = 'zyvro_prism_balance_v4';
  const BET_KEY = 'zyvro_prism_bets_v4';
  const PATTERN_KEY = 'zyvro_prism_pattern_v2';

  let balance = readBalance();
  let stake = 1;
  let selections = [];
  let bets = readArray(BET_KEY);
  let currentPeriod = null;
  let pattern = readPattern();

  function readBalance() {
    const n = Number(localStorage.getItem(BAL_KEY));
    return Number.isFinite(n) && n >= 0 ? n : 1000;
  }

  function readArray(key) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (_) {
      return [];
    }
  }

  function store(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  function periodInfo() {
    const seconds = Math.floor(Date.now() / 1000);
    return {
      period: Math.floor(seconds / 30),
      remaining: 30 - (seconds % 30)
    };
  }

  function colorFor(n) {
    if (n === 0 || n === 5) return 'Fuchsia';
    if ([1, 3, 7, 9].includes(n)) return 'Aqua';
    return 'Gold';
  }

  function sizeFor(n) {
    return n >= 5 ? 'Big' : 'Small';
  }

  // Demo pattern: 10 results, then a new pattern starts.
  function makePattern(startPeriod) {
    let seed =
      (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;

    if (!seed) seed = 123456789;

    const results = [];

    for (let i = 0; i < 10; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      results.push(seed % 10);
    }

    return { startPeriod, results };
  }

  function readPattern() {
    try {
      const p = JSON.parse(
        localStorage.getItem(PATTERN_KEY) || 'null'
      );

      if (
        p &&
        Array.isArray(p.results) &&
        p.results.length === 10 &&
        Number.isFinite(p.startPeriod)
      ) {
        return p;
      }
    } catch (_) {}

    const p = makePattern(periodInfo().period);
    store(PATTERN_KEY, p);
    return p;
  }

  function ensurePattern() {
    const q = periodInfo();

    if (
      q.period < pattern.startPeriod ||
      q.period >= pattern.startPeriod + 10
    ) {
      pattern = makePattern(q.period);
      store(PATTERN_KEY, pattern);
    }

    return q;
  }

  function saveBalance() {
    localStorage.setItem(BAL_KEY, String(balance));

    if ($('balance')) {
      $('balance').textContent = String(balance);
    }
  }

  function setStatus(message) {
    if ($('status')) {
      $('status').textContent = message;
    }
  }

  function renderBalls(n) {
    if (!$('balls')) return;

    let html = '';

    for (let i = 0; i < 5; i++) {
      const v = (n + i * 3) % 10;

      html +=
        '<span class="mini ' +
        colorFor(v) +
        '">' +
        v +
        '</span>';
    }

    $('balls').innerHTML = html;
  }

  function renderHistory() {
    if (!$('history')) return;

    const q = periodInfo();
    const rows = [];

    for (
      let p = q.period - 1;
      p >= Math.max(pattern.startPeriod, q.period - 10);
      p--
    ) {
      if (
        p >= pattern.startPeriod &&
        p < pattern.startPeriod + 10
      ) {
        const n = pattern.results[p - pattern.startPeriod];

        rows.push({
          period: p,
          number: n,
          color: colorFor(n),
          size: sizeFor(n)
        });
      }
    }

    if (!rows.length) {
      $('history').innerHTML =
        '<div class="emptyledger">' +
        'First result appears when this round finishes.' +
        '</div>';
      return;
    }

    $('history').innerHTML = rows.slice(0, 10).map(h =>
      '<div class="historyrow">' +
      '<span>' + h.period + '</span>' +
      '<span class="hnum">' + h.number + '</span>' +
      '<span class="tag">' + h.color + '</span>' +
      '<span class="tag">' + h.size + '</span>' +
      '</div>'
    ).join('');
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  function renderLedger() {
    if (!$('ledger')) return;

    if (!bets.length) {
      $('ledger').innerHTML =
        '<div class="emptyledger">No bets yet.</div>';
      return;
    }

    $('ledger').innerHTML = bets.slice(0, 30).map(b =>
      '<div class="ledgerrow">' +
      '<span>' + escapeHtml(b.label) + '</span>' +
      '<span>' + b.cost + '</span>' +
      '<span>' +
      (b.done ? (b.net >= 0 ? 'Settled' : 'Lost') : 'Pending') +
      '</span>' +
      '<span>' +
      (b.done ? ((b.net > 0 ? '+' : '') + b.net) : '—') +
      '</span>' +
      '</div>'
    ).join('');
  }

  function renderSelections() {
    document.querySelectorAll('[data-market]').forEach(button => {
      const selected = selections.some(s =>
        s.market === button.dataset.market &&
        s.val === button.dataset.val
      );

      button.classList.toggle('sel', selected);
    });

    setStatus(
      selections.length
        ? selections.length +
          ' prediction(s) selected · ' +
          stake +
          ' coin(s) each.'
        : 'Choose a number, color, or Big/Small.'
    );
  }

  function pick(button) {
    const market = button.dataset.market;
    const val = button.dataset.val;

    const index = selections.findIndex(s =>
      s.market === market && s.val === val
    );

    if (index >= 0) {
      selections.splice(index, 1);
    } else {
      selections.push({ market, val });
    }

    renderSelections();
  }

  function settleBets(period) {
    const index = period - pattern.startPeriod;
    const n = pattern.results[index];

    if (!Number.isInteger(n)) return;

    const color = colorFor(n);
    const size = sizeFor(n);

    let changed = false;
    let netTotal = 0;

    bets.forEach(b => {
      if (!b.done && Number(b.period) === Number(period)) {
        let payout = 0;

        b.items.forEach(item => {
          const win =
            (item.market === 'number' &&
              Number(item.val) === n) ||
            (item.market === 'color' &&
              item.val === color) ||
            (item.market === 'size' &&
              item.val === size);

          if (win) payout += b.stake * 2;
        });

        b.done = true;
        b.number = n;
        b.color = color;
        b.size = size;
        b.payout = payout;
        b.net = payout - b.cost;

        netTotal += b.net;
        balance += payout;
        changed = true;
      }
    });

    if (changed) {
      saveBalance();
      store(BET_KEY, bets);
      renderLedger();

      if ($('pl')) {
        $('pl').textContent =
          'Round ' + period +
          ': ' + n +
          ' (' + color + ', ' + size + ')' +
          ' · Net ' +
          (netTotal >= 0 ? '+' : '') +
          netTotal + ' coins';
      }
    }
  }

  function updateClock() {
    const q = ensurePattern();
    const text = String(q.remaining).padStart(2, '0');

    if ($('m1')) $('m1').textContent = '0';
    if ($('m2')) $('m2').textContent = '0';
    if ($('s1')) $('s1').textContent = text[0];
    if ($('s2')) $('s2').textContent = text[1];

    if ($('period')) {
      $('period').textContent = String(q.period);
    }

    if (currentPeriod === null) {
      currentPeriod = q.period;
    }

    if (q.period !== currentPeriod) {
      settleBets(currentPeriod);
      currentPeriod = q.period;
      selections = [];
      renderSelections();

      if (q.period >= pattern.startPeriod + 10) {
        pattern = makePattern(q.period);
        store(PATTERN_KEY, pattern);
      }

      renderHistory();
    }

    if ($('place')) {
      $('place').disabled = q.remaining <= 5;
      $('place').textContent =
        q.remaining <= 5 ? 'Betting closed' : 'Place bet';
    }

    const index = q.period - pattern.startPeriod;
    renderBalls(
      pattern.results[index] ??
      pattern.results[0]
    );
  }

  function openSheet() {
    const q = periodInfo();

    if (q.remaining <= 5) {
      setStatus('Betting closes during the last 5 seconds.');
      return;
    }

    if (!selections.length) {
      setStatus('Please choose a prediction first.');
      return;
    }

    const cost = stake * selections.length;

    if (cost > balance) {
      setStatus('Not enough virtual coins.');
      return;
    }

    $('sheetTitle').textContent = selections.map(s =>
      s.market === 'number' ? 'Number ' + s.val : s.val
    ).join(', ');

    $('sheetStake').textContent = stake + ' coin(s)';
    $('sheetCount').textContent = String(selections.length);
    $('sheetTotal').textContent = cost + ' coins';

    $('sheetback').classList.add('show');
  }

  function closeSheet() {
    if ($('sheetback')) {
      $('sheetback').classList.remove('show');
    }
  }

  function confirmBet() {
    const q = periodInfo();
    const cost = stake * selections.length;

    if (
      q.remaining <= 5 ||
      !selections.length ||
      cost > balance
    ) {
      closeSheet();
      setStatus('Check your selection and balance.');
      return;
    }

    balance -= cost;
    saveBalance();

    bets.unshift({
      id: Date.now(),
      period: q.period,
      items: selections.map(s => ({
        market: s.market,
        val: s.val
      })),
      label: selections.map(s =>
        s.market === 'number' ? '#' + s.val : s.val
      ).join(', '),
      stake,
      cost,
      done: false,
      net: 0
    });

    bets = bets.slice(0, 100);
    store(BET_KEY, bets);
    renderLedger();

    closeSheet();
    selections = [];
    renderSelections();

    setStatus('Virtual bet placed for round ' + q.period + '.');
  }

  function refreshGame() {
    pattern = makePattern(periodInfo().period);
    store(PATTERN_KEY, pattern);

    currentPeriod = periodInfo().period;
    selections = [];

    renderSelections();
    renderHistory();
    renderLedger();
    updateClock();

    if ($('pl')) {
      $('pl').textContent =
        'New 10-round pattern started. Previous bet records are kept.';
    }

    setStatus('Refresh complete: a new 10-round pattern has started.');
  }

  function init() {
    const required = [
      'balance', 'balls', 'm1', 'm2', 's1', 's2',
      'period', 'numbers', 'history', 'ledger',
      'status', 'place', 'sheetback', 'sheetTitle',
      'sheetStake', 'sheetCount', 'sheetTotal',
      'closeSheet', 'cancelBet', 'confirmBet',
      'refreshHistory', 'resetCoins', 'randomPick', 'pl'
    ];

    const missing = required.filter(id => !$(id));

    if (missing.length) {
      setStatus('Game setup error: missing ' + missing.join(', '));
      console.error('Zyvro missing HTML elements:', missing);
      return;
    }

    for (let n = 0; n < 10; n++) {
      const button = document.createElement('button');

      button.type = 'button';
      button.className = 'num';
      button.dataset.market = 'number';
      button.dataset.val = String(n);
      button.textContent = String(n);

      button.addEventListener('click', () => pick(button));
      $('numbers').appendChild(button);
    }

    document.querySelectorAll(
      '.colors [data-market], .sizes [data-market]'
    ).forEach(button => {
      button.addEventListener('click', () => pick(button));
    });

    document.querySelectorAll('[data-stake]').forEach(button => {
      button.addEventListener('click', () => {
        stake = Number(button.dataset.stake) || 1;

        document.querySelectorAll('[data-stake]').forEach(b => {
          b.classList.toggle('sel', b === button);
        });

        renderSelections();
      });
    });

    $('randomPick').addEventListener('click', () => {
      selections = [{
        market: 'number',
        val: String(Math.floor(Math.random() * 10))
      }];

      renderSelections();
    });

    $('place').addEventListener('click', openSheet);
    $('closeSheet').addEventListener('click', closeSheet);
    $('cancelBet').addEventListener('click', closeSheet);
    $('confirmBet').addEventListener('click', confirmBet);

    $('refreshHistory').addEventListener('click', refreshGame);

    $('resetCoins').addEventListener('click', () => {
      if (confirm('Reset demo balance to 1000 virtual coins?')) {
        balance = 1000;
        saveBalance();
        setStatus('Virtual coins reset to 1000.');
      }
    });

    saveBalance();
    renderLedger();
    renderSelections();

    currentPeriod = periodInfo().period;
    updateClock();
    renderHistory();

    setInterval(updateClock, 250);
  }

  window.addEventListener('error', event => {
    setStatus('Game error: ' + (event.message || 'JavaScript error'));
  });

  window.addEventListener('unhandledrejection', event => {
    setStatus(
      'Game error: ' +
      String(
        event.reason &&
        event.reason.message ||
        event.reason ||
        'Async error'
      )
    );
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
