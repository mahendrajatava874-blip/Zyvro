(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  const BAL_KEY = 'zyvro_prism_balance_v4';
  const BET_KEY = 'zyvro_prism_bets_v4';
  const PATTERN_KEY = 'zyvro_prism_pattern_v4';

  let balance = readBalance();
  let stake = 1;
  let selections = [];
  let bets = readArray(BET_KEY);
  let pattern = readPattern();
  let currentPeriod = null;

  function readBalance() {
    const n = Number(localStorage.getItem(BAL_KEY));
    return Number.isFinite(n) && n >= 0 ? n : 1000;
  }

  function readArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function store(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error('Storage error:', error);
    }
  }

  function periodInfo() {
    const seconds = Math.floor(Date.now() / 1000);

    return {
      period: Math.floor(seconds / 30),
      remaining: 30 - (seconds % 30)
    };
  }

  function colorFor(number) {
    if (number === 0 || number === 5) return 'Fuchsia';
    if ([1, 3, 7, 9].includes(number)) return 'Aqua';
    return 'Gold';
  }

  function sizeFor(number) {
    return number >= 5 ? 'Big' : 'Small';
  }

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
      const saved = JSON.parse(
        localStorage.getItem(PATTERN_KEY) || 'null'
      );

      if (
        saved &&
        Array.isArray(saved.results) &&
        saved.results.length === 10 &&
        Number.isFinite(saved.startPeriod)
      ) {
        return saved;
      }
    } catch (error) {
      console.warn('Creating a new demo pattern.');
    }

    const pattern = makePattern(periodInfo().period);
    store(PATTERN_KEY, pattern);

    return pattern;
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

  function resultFor(period) {
    const offset = period - pattern.startPeriod;

    if (offset >= 0 && offset < 10) {
      return pattern.results[offset];
    }

    let value =
      (Math.imul(Number(period) >>> 0, 2147483647) || 148271) >>> 0;

    return value % 10;
  }

  function setStatus(message) {
    const status = $('status');

    if (status) {
      status.textContent = message;
    }
  }

  function saveBalance() {
    try {
      localStorage.setItem(BAL_KEY, String(balance));
    } catch (error) {
      console.error('Could not save balance:', error);
    }

    if ($('balance')) {
      $('balance').textContent = String(balance);
    }
  }

  function renderNumbers() {
    const root = $('numbers');

    if (!root) return;

    root.innerHTML = '';

    for (let n = 0; n < 10; n++) {
      const button = document.createElement('button');

      button.type = 'button';
      button.className = 'num ' + colorFor(n).toLowerCase();
      button.dataset.market = 'number';
      button.dataset.val = String(n);
      button.textContent = String(n);

      root.appendChild(button);
    }
  }

  function renderBalls(number) {
    const root = $('balls');

    if (!root) return;

    root.innerHTML = '';

    for (let i = 0; i < 5; i++) {
      const value = (number + i * 3) % 10;
      const ball = document.createElement('span');

      ball.className = 'mini ' + colorFor(value).toLowerCase();
      ball.textContent = String(value);

      root.appendChild(ball);
    }
  }

  function renderSelections() {
    document.querySelectorAll('[data-market]').forEach(button => {
      const selected = selections.some(
        item =>
          item.market === button.dataset.market &&
          item.val === button.dataset.val
      );

      button.classList.toggle('sel', selected);
    });

    setStatus(
      selections.length
        ? selections.length +
            ' prediction(s) selected · ' +
            stake * selections.length +
            ' virtual coin(s) total.'
        : 'Choose a number, color, or Big/Small.'
    );
  }

  function pick(button) {
    const market = button.dataset.market;
    const value = button.dataset.val;

    const index = selections.findIndex(
      item => item.market === market && item.val === value
    );

    if (index >= 0) {
      selections.splice(index, 1);
    } else {
      selections.push({ market, val: value });
    }

    renderSelections();
  }

  function renderHistory() {
    const root = $('history');

    if (!root) return;

    const rows = [];
    const q = periodInfo();

    for (
      let p = q.period - 1;
      p >= Math.max(0, q.period - 10);
      p--
    ) {
      const number = resultFor(p);

      rows.push({
        period: p,
        number,
        color: colorFor(number),
        size: sizeFor(number)
      });
    }

    root.innerHTML = rows.length
      ? rows.map(row => `
          <div class="historyrow">
            <span>${row.period}</span>
            <strong>${row.number}</strong>
            <span>${row.color}</span>
            <span>${row.size}</span>
          </div>
        `).join('')
      : '<div class="empty">Results appear after each round finishes.</div>';
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function renderLedger() {
    const root = $('ledger');

    if (!root) return;

    if (!bets.length) {
      root.innerHTML = '<div class="empty">No bets yet.</div>';
      return;
    }

    root.innerHTML = bets.slice(0, 30).map(bet => `
      <div class="ledgerrow">
        <span>${escapeHTML(bet.label)}</span>
        <span>${bet.cost}</span>
        <span>${bet.done ? (bet.net >= 0 ? 'Won' : 'Lost') : 'Pending'}</span>
        <span class="${bet.done ? (bet.net >= 0 ? 'profit' : 'loss') : ''}">
          ${bet.done ? (bet.net >= 0 ? '+' : '') + bet.net : '—'}
        </span>
      </div>
    `).join('');
  }

  function settleBets(period) {
    const number = resultFor(period);
    const color = colorFor(number);
    const size = sizeFor(number);

    let changed = false;

    bets.forEach(bet => {
      if (!bet.done && Number(bet.period) === Number(period)) {
        let payout = 0;

        bet.items.forEach(item => {
          const won =
            (item.market === 'number' && Number(item.val) === number) ||
            (item.market === 'color' && item.val === color) ||
            (item.market === 'size' && item.val === size);

          if (won) {
            payout += bet.stake * 2;
          }
        });

        bet.done = true;
        bet.number = number;
        bet.color = color;
        bet.size = size;
        bet.payout = payout;
        bet.net = payout - bet.cost;

        balance += payout;
        changed = true;
      }
    });

    if (changed) {
      saveBalance();
      store(BET_KEY, bets);
      renderLedger();

      if ($('pl')) {
        const net = bets
          .filter(bet => bet.done && Number(bet.period) === Number(period))
          .reduce((sum, bet) => sum + bet.net, 0);

        $('pl').textContent =
          'Round ' + period + ': ' +
          number + ' · ' + color + ' · ' + size +
          '. Net ' + net + ' coins.';
      }
    }
  }

  function openSheet() {
    const q = periodInfo();

    if (q.remaining <= 5) {
      setStatus('Betting closes during the last 5 seconds.');
      return;
    }

    if (!selections.length) {
      setStatus('Please choose a number, color, or Big/Small first.');
      return;
    }

    const cost = stake * selections.length;

    if (cost > balance) {
      setStatus('Not enough virtual coins. Reduce stake or reset coins.');
      return;
    }

    $('sheetTitle').textContent = selections
      .map(item =>
        item.market === 'number' ? 'Number ' + item.val : item.val
      )
      .join(', ');

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
      setStatus('Bet could not be placed. Check time, selection, and balance.');
      return;
    }

    balance -= cost;
    saveBalance();

    bets.unshift({
      id: Date.now(),
      period: q.period,
      items: selections.map(item => ({ ...item })),
      label: selections.map(item =>
        item.market === 'number' ? '#' + item.val : item.val
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

    if ($('roundStatus')) {
      $('roundStatus').textContent =
        q.remaining <= 5
          ? 'Betting closes in ' + q.remaining + ' second(s).'
          : 'Practice round is live.';
    }

    if (currentPeriod === null) {
      currentPeriod = q.period;
    }

    if (q.period !== currentPeriod) {
      settleBets(currentPeriod);
      currentPeriod = q.period;

      selections = [];
      renderSelections();
      renderHistory();
      renderLedger();

      if (q.period >= pattern.startPeriod + 10) {
        pattern = makePattern(q.period);
        store(PATTERN_KEY, pattern);
      }
    }

    if ($('place')) {
      $('place').disabled = q.remaining <= 5;
      $('place').textContent =
        q.remaining <= 5 ? 'Betting closed' : 'Place bet';
    }

    renderBalls(resultFor(q.period));
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

    setStatus('Refreshed: a new 10-round demo pattern has started.');
  }

  function init() {
    const required = [
      'balance',
      'm1',
      'm2',
      's1',
      's2',
      'period',
      'numbers',
      'history',
      'ledger',
      'status',
      'place',
      'sheetback',
      'sheetTitle',
      'sheetStake',
      'sheetCount',
      'sheetTotal',
      'closeSheet',
      'cancelBet',
      'confirmBet',
      'refreshHistory',
      'resetCoins',
      'randomPick',
      'pl'
    ];

    const missing = required.filter(id => !$(id));

    if (missing.length) {
      console.error('Missing game HTML elements:', missing);
      setStatus('Game setup error: missing ' + missing.join(', '));
      return;
    }

    renderNumbers();

    // Attach each market button exactly once.
    document.querySelectorAll('[data-market]').forEach(button => {
      button.addEventListener('click', () => pick(button));
    });

    document.querySelectorAll('[data-stake]').forEach(button => {
      button.addEventListener('click', () => {
        stake = Number(button.dataset.stake) || 1;

        document.querySelectorAll('[data-stake]').forEach(item => {
          item.classList.toggle('active', item === button);
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

    $('sheetback').addEventListener('click', event => {
      if (event.target === $('sheetback')) {
        closeSheet();
      }
    });

    $('refreshHistory').addEventListener('click', refreshGame);

    $('resetCoins').addEventListener('click', () => {
      if (confirm('Reset demo balance to 1000 virtual coins?')) {
        balance = 1000;
        saveBalance();
        setStatus('Virtual coins reset to 1000.');
      }
    });

    if ($('howTo')) {
      $('howTo').addEventListener('click', () => {
        alert(
          'Choose a number, color, or Big/Small. Select a virtual stake and tap Place bet. Winning selections return 2× stake. This is a demo using virtual coins only.'
        );
      });
    }

    saveBalance();
    renderSelections();
    renderHistory();
    renderLedger();

    currentPeriod = periodInfo().period;
    updateClock();

    setInterval(updateClock, 250);
  }

  window.addEventListener('error', event => {
    setStatus('Game error: ' + (event.message || 'JavaScript error'));
  });

  window.addEventListener('unhandledrejection', event => {
    setStatus(
      'Game error: ' +
      String(
        event.reason && event.reason.message
          ? event.reason.message
          : event.reason || 'Async error'
      )
    );
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
