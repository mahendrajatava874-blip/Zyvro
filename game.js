(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  const BAL_KEY = 'zyvro_prism_balance_v4';
  const BET_KEY = 'zyvro_prism_bets_v4';
  const PATTERN_KEY = 'zyvro_prism_pattern_v1';

  let balance = readBalance();
  let stake = 1;
  let selections = [];
  let myBets = readArray(BET_KEY);
  let pattern = readPattern();
  let currentPeriod = null;

  function readBalance() {
    try {
      const n = Number(localStorage.getItem(BAL_KEY));
      return Number.isFinite(n) && n >= 0 ? n : 1000;
    } catch (e) {
      return 1000;
    }
  }

  function readArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (e) {
      return [];
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('Storage error:', e);
    }
  }

  function saveBalance() {
    try {
      localStorage.setItem(BAL_KEY, String(balance));
    } catch (e) {
      console.error('Balance storage error:', e);
    }

    if ($('balance')) {
      $('balance').textContent = String(balance);
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
    if (number === 0 || number === 5) {
      return 'Fuchsia';
    }

    if ([1, 3, 7, 9].includes(number)) {
      return 'Aqua';
    }

    return 'Gold';
  }

  function sizeFor(number) {
    return number >= 5 ? 'Big' : 'Small';
  }

  function makePattern(startPeriod) {
    let seed =
      (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;

    if (!seed) {
      seed = 123456789;
    }

    const results = [];

    for (let i = 0; i < 10; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      results.push(seed % 10);
    }

    return {
      startPeriod: startPeriod,
      results: results
    };
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
    } catch (e) {
      console.warn('Creating a new demo pattern.');
    }

    const pattern = makePattern(periodInfo().period);
    write(PATTERN_KEY, pattern);

    return pattern;
  }

  function ensurePattern() {
    const q = periodInfo();

    if (
      q.period < pattern.startPeriod ||
      q.period >= pattern.startPeriod + 10
    ) {
      pattern = makePattern(q.period);
      write(PATTERN_KEY, pattern);
    }

    return q;
  }

  function resultFor(period) {
    const index = period - pattern.startPeriod;

    if (index >= 0 && index < 10) {
      return pattern.results[index];
    }

    let seed = Math.imul(
      (Number(period) % 2147483647) || 1,
      48271
    ) >>> 0;

    return seed % 10;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
  }

  function setStatus(message, type) {
    const status = $('status');

    if (!status) return;

    status.textContent = message;
    status.className = 'status' + (type ? ' ' + type : '');
  }

  function renderBalls(number) {
    const balls = $('balls');

    if (!balls) return;

    let html = '';

    for (let i = 0; i < 5; i++) {
      const value = (number + i * 3) % 10;
      const color = colorFor(value).toLowerCase();

      html +=
        '<span class="mini ' + color + '">' +
        value +
        '</span>';
    }

    balls.innerHTML = html;
  }

  function renderNumbers() {
    const box = $('numbers');

    if (!box) return;

    box.innerHTML = '';

    for (let n = 0; n < 10; n++) {
      const button = document.createElement('button');

      button.type = 'button';
      button.className = 'num ' + colorFor(n).toLowerCase();
      button.dataset.market = 'number';
      button.dataset.val = String(n);
      button.textContent = String(n);

      button.addEventListener('click', function () {
        pick(button);
      });

      box.appendChild(button);
    }
  }

  function renderSelections() {
    document.querySelectorAll('[data-market]').forEach(button => {
      const selected = selections.some(item =>
        item.market === button.dataset.market &&
        item.val === button.dataset.val
      );

      button.classList.toggle('sel', selected);
      button.classList.toggle('selected', selected);
    });

    if (selections.length) {
      setStatus(
        selections.length +
        ' prediction(s) selected · ' +
        stake +
        ' coin(s) each.'
      );
    } else {
      setStatus('Choose a number, color, or Big/Small.');
    }
  }

  function pick(button) {
    const market = button.dataset.market;
    const value = button.dataset.val;

    const index = selections.findIndex(item =>
      item.market === market && item.val === value
    );

    if (index >= 0) {
      selections.splice(index, 1);
    } else {
      selections.push({
        market: market,
        val: value
      });
    }

    renderSelections();
  }

  function renderHistory() {
    const history = $('history');

    if (!history) return;

    const q = periodInfo();
    const rows = [];

    for (
      let period = q.period - 1;
      period >= Math.max(pattern.startPeriod, q.period - 10);
      period--
    ) {
      if (
        period >= pattern.startPeriod &&
        period < pattern.startPeriod + 10
      ) {
        const number = resultFor(period);

        rows.push({
          period: period,
          number: number,
          color: colorFor(number),
          size: sizeFor(number)
        });
      }
    }

    if (!rows.length) {
      history.innerHTML =
        '<div class="emptyledger">' +
        'Results appear after the first round finishes.' +
        '</div>';

      return;
    }

    history.innerHTML = rows.slice(0, 10).map(row =>
      '<div class="historyrow">' +
        '<span>' + row.period + '</span>' +
        '<span class="hnum">' + row.number + '</span>' +
        '<span class="tag">' + row.color + '</span>' +
        '<span class="tag">' + row.size + '</span>' +
      '</div>'
    ).join('');
  }

  function renderLedger() {
    const ledger = $('ledger');

    if (!ledger) return;

    if (!myBets.length) {
      ledger.innerHTML =
        '<div class="emptyledger">No bets yet.</div>';

      return;
    }

    ledger.innerHTML = myBets.slice(0, 30).map(bet =>
      '<div class="ledgerrow">' +
        '<span>' + escapeHtml(bet.label) + '</span>' +
        '<span>' + bet.cost + '</span>' +
        '<span>' +
          (bet.done
            ? (bet.net >= 0 ? 'Settled' : 'Lost')
            : 'Pending') +
        '</span>' +
        '<span class="' +
          (bet.done
            ? (bet.net >= 0 ? 'profit' : 'loss')
            : '') +
        '">' +
          (bet.done
            ? (bet.net > 0 ? '+' : '') + bet.net
            : '—') +
        '</span>' +
      '</div>'
    ).join('');
  }

  function settleBets(period) {
    const number = resultFor(period);
    const color = colorFor(number);
    const size = sizeFor(number);

    let changed = false;
    let totalNet = 0;

    myBets.forEach(bet => {
      if (!bet.done && Number(bet.period) === Number(period)) {
        let payout = 0;

        bet.items.forEach(item => {
          const won =
            (item.market === 'number' &&
              Number(item.val) === number) ||
            (item.market === 'color' &&
              item.val === color) ||
            (item.market === 'size' &&
              item.val === size);

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

        totalNet += bet.net;
        balance += payout;
        changed = true;
      }
    });

    if (changed) {
      saveBalance();
      write(BET_KEY, myBets);
      renderLedger();

      if ($('pl')) {
        $('pl').textContent =
          'Round ' + period +
          ': ' + number +
          ' (' + color + ', ' + size + ')' +
          ' · Net ' +
          (totalNet >= 0 ? '+' : '') +
          totalNet +
          ' coins';
      }
    }
  }

  function updateClock() {
    const q = ensurePattern();

    if (currentPeriod === null) {
      currentPeriod = q.period;
    }

    if (q.period !== currentPeriod) {
      settleBets(currentPeriod);

      currentPeriod = q.period;
      selections = [];

      renderSelections();
      renderHistory();
    }

    const text = String(q.remaining).padStart(2, '0');

    if ($('m1')) $('m1').textContent = '0';
    if ($('m2')) $('m2').textContent = '0';
    if ($('s1')) $('s1').textContent = text[0];
    if ($('s2')) $('s2').textContent = text[1];

    if ($('period')) {
      $('period').textContent = 'Round ' + q.period;
    }

    if ($('place')) {
      $('place').disabled = q.remaining <= 5;
      $('place').textContent =
        q.remaining <= 5 ? 'Betting closed' : 'Place bet';
    }

    renderBalls(resultFor(Math.max(pattern.startPeriod, q.period - 1)));
    renderHistory();
  }

  function openSheet() {
    const q = periodInfo();

    if (q.remaining <= 5) {
      setStatus('Betting closes during the last 5 seconds.', 'error');
      return;
    }

    if (!selections.length) {
      setStatus(
        'Please choose a number, color, or Big/Small first.',
        'error'
      );
      return;
    }

    const cost = stake * selections.length;

    if (cost > balance) {
      setStatus(
        'Not enough virtual coins. Reduce stake or reset coins.',
        'error'
      );
      return;
    }

    $('sheetTitle').textContent = selections.map(item =>
      item.market === 'number' ? 'Number ' + item.val : item.val
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
      setStatus(
        'Bet could not be placed. Check time, selection and balance.',
        'error'
      );
      return;
    }

    balance -= cost;
    saveBalance();

    myBets.unshift({
      id: Date.now(),
      period: q.period,
      items: selections.map(item => ({
        market: item.market,
        val: item.val
      })),
      label: selections.map(item =>
        item.market === 'number' ? '#' + item.val : item.val
      ).join(', '),
      stake: stake,
      cost: cost,
      done: false,
      net: 0
    });

    myBets = myBets.slice(0, 100);

    write(BET_KEY, myBets);
    renderLedger();

    closeSheet();

    selections = [];
    renderSelections();

    setStatus(
      'Virtual bet placed for round ' + q.period + '.',
      'good'
    );
  }

  function resetCoins() {
    if (confirm('Reset demo balance to 1000 virtual coins?')) {
      balance = 1000;
      saveBalance();

      setStatus('Virtual coins reset to 1000.', 'good');
    }
  }

  function refreshGame() {
    const q = periodInfo();

    pattern = makePattern(q.period);
    write(PATTERN_KEY, pattern);

    currentPeriod = q.period;
    selections = [];

    renderSelections();
    renderHistory();
    renderLedger();
    updateClock();

    if ($('pl')) {
      $('pl').textContent =
        'New demo pattern started. Previous bet records are kept.';
    }

    setStatus(
      'Refresh complete: a new 10-round demo pattern has started.',
      'good'
    );
  }

  function init() {
    const required = [
      'balance',
      'balls',
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

      setStatus(
        'Game setup error: missing ' + missing.join(', '),
        'error'
      );

      return;
    }

    renderNumbers();

    document.querySelectorAll(
      '.colors [data-market], .sizes [data-market]'
    ).forEach(button => {
      button.addEventListener('click', () => pick(button));
    });

    document.querySelectorAll('[data-stake]').forEach(button => {
      button.addEventListener('click', () => {
        stake = Number(button.dataset.stake) || 1;

        document.querySelectorAll('[data-stake]').forEach(item => {
          item.classList.toggle('active', item === button);
          item.classList.toggle('sel', item === button);
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
    $('resetCoins').addEventListener('click', resetCoins);

    saveBalance();
    renderLedger();
    renderSelections();

    currentPeriod = periodInfo().period;

    updateClock();
    renderHistory();

    setInterval(updateClock, 250);
  }

  window.addEventListener('error', event => {
    setStatus(
      'Game error: ' + (event.message || 'JavaScript error'),
      'error'
    );
  });

  window.addEventListener('unhandledrejection', event => {
    setStatus(
      'Game error: ' +
      String(
        event.reason &&
        event.reason.message ||
        event.reason ||
        'Async error'
      ),
      'error'
    );
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      try {
        init();
      } catch (error) {
        console.error(error);
        setStatus('Game failed to start: ' + error.message, 'error');
      }
    }, { once: true });
  } else {
    try {
      init();
    } catch (error) {
      console.error(error);
      setStatus('Game failed to start: ' + error.message, 'error');
    }
  }
})();
