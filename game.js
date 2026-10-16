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

  // -------------------------------
  // STORAGE
  // -------------------------------

  function readBalance() {
    const n = Number(localStorage.getItem(BAL_KEY));

    return Number.isFinite(n) && n >= 0
      ? n
      : 1000;
  }

  function readArray(key) {
    try {
      const value = JSON.parse(
        localStorage.getItem(key) || '[]'
      );

      return Array.isArray(value) ? value : [];
    } catch (error) {
      console.error('Storage read error:', error);
      return [];
    }
  }

  function store(key, value) {
    try {
      localStorage.setItem(
        key,
        JSON.stringify(value)
      );
    } catch (error) {
      console.error('Storage save error:', error);
      setStatus(
        'Browser storage save nahi ho paya.'
      );
    }
  }

  function saveBalance() {
    try {
      localStorage.setItem(
        BAL_KEY,
        String(balance)
      );
    } catch (error) {
      console.error(error);
    }

    if ($('balance')) {
      $('balance').textContent = String(balance);
    }
  }

  // -------------------------------
  // ROUND TIMER
  // -------------------------------

  function periodInfo() {
    const seconds = Math.floor(Date.now() / 1000);

    return {
      period: Math.floor(seconds / 30),
      remaining: 30 - (seconds % 30)
    };
  }

  // -------------------------------
  // RESULT HELPERS
  // -------------------------------

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

  // -------------------------------
  // DEMO ROUND PATTERN
  // -------------------------------

  function makePattern(startPeriod) {
    let seed = (
      Date.now() ^
      Math.floor(Math.random() * 0x7fffffff)
    ) >>> 0;

    if (!seed) {
      seed = 123456789;
    }

    const results = [];

    for (let i = 0; i < 10; i++) {
      seed = (
        Math.imul(seed, 1664525) +
        1013904223
      ) >>> 0;

      results.push(seed % 10);
    }

    return {
      startPeriod,
      results
    };
  }

  function readPattern() {
    try {
      const saved = JSON.parse(
        localStorage.getItem(PATTERN_KEY) || 'null'
      );

      const now = periodInfo().period;

      if (
        saved &&
        Array.isArray(saved.results) &&
        saved.results.length === 10 &&
        Number.isFinite(saved.startPeriod) &&
        now >= saved.startPeriod &&
        now < saved.startPeriod + 10
      ) {
        return saved;
      }
    } catch (error) {
      console.warn('Creating a new demo pattern.');
    }

    const newPattern = makePattern(
      periodInfo().period
    );

    store(PATTERN_KEY, newPattern);

    return newPattern;
  }

  function ensurePattern() {
    const current = periodInfo();

    if (
      current.period < pattern.startPeriod ||
      current.period >= pattern.startPeriod + 10
    ) {
      pattern = makePattern(current.period);
      store(PATTERN_KEY, pattern);
    }

    return current;
  }

  function resultFor(period) {
    const index = period - pattern.startPeriod;

    if (
      index >= 0 &&
      index < pattern.results.length
    ) {
      return pattern.results[index];
    }

    return 0;
  }

  // -------------------------------
  // STATUS MESSAGE
  // -------------------------------

  function setStatus(message) {
    if ($('status')) {
      $('status').textContent = message;
    }
  }

  // -------------------------------
  // NUMBER BUTTONS
  // -------------------------------

  function renderNumbers() {
    const root = $('numbers');

    if (!root) {
      return;
    }

    root.innerHTML = '';

    for (let number = 0; number < 10; number++) {
      const button = document.createElement('button');

      button.type = 'button';
      button.className =
        'btn num ' + colorFor(number).toLowerCase();

      button.dataset.market = 'number';
      button.dataset.val = String(number);

      button.textContent = String(number);

      button.setAttribute(
        'aria-label',
        'Number ' + number
      );

      root.appendChild(button);
    }
  }

  // -------------------------------
  // SELECTIONS
  // -------------------------------

  function pick(button) {
    const market = button.dataset.market;
    const value = button.dataset.val;

    const index = selections.findIndex(item =>
      item.market === market &&
      item.val === value
    );

    if (index >= 0) {
      selections.splice(index, 1);
    } else {
      selections.push({
        market,
        val: value
      });
    }

    renderSelections();
  }

  function renderSelections() {
    document.querySelectorAll('[data-market]')
      .forEach(button => {
        const selected = selections.some(item =>
          item.market === button.dataset.market &&
          item.val === button.dataset.val
        );

        button.classList.toggle(
          'selected',
          selected
        );

        button.classList.toggle(
          'active',
          selected
        );
      });

    if (selections.length) {
      setStatus(
        selections.length +
        ' prediction(s) selected. Stake: ' +
        stake +
        ' virtual coin(s) each.'
      );
    } else {
      setStatus(
        'Choose a number, color, or Big/Small.'
      );
    }
  }

  // -------------------------------
  // CONFIRM BET SHEET
  // -------------------------------

  function openSheet() {
    const round = periodInfo();

    if (round.remaining <= 5) {
      setStatus(
        'Betting closes during the last 5 seconds.'
      );
      return;
    }

    if (!selections.length) {
      setStatus(
        'Please choose a number, color, or Big/Small.'
      );
      return;
    }

    const cost = stake * selections.length;

    if (cost > balance) {
      setStatus(
        'Not enough virtual coins. Reduce your stake.'
      );
      return;
    }

    if (!$('sheetback')) {
      setStatus('Bet confirmation panel is missing.');
      return;
    }

    $('sheetTitle').textContent =
      selections.map(item => {
        if (item.market === 'number') {
          return 'Number ' + item.val;
        }

        return item.val;
      }).join(', ');

    $('sheetStake').textContent =
      stake + ' coin(s)';

    $('sheetCount').textContent =
      String(selections.length);

    $('sheetTotal').textContent =
      cost + ' coins';

    $('sheetback').classList.add('show');
  }

  function closeSheet() {
    if ($('sheetback')) {
      $('sheetback').classList.remove('show');
    }
  }

  // -------------------------------
  // PLACE VIRTUAL BET
  // -------------------------------

  function confirmBet() {
    const round = periodInfo();

    const cost = stake * selections.length;

    if (
      round.remaining <= 5 ||
      !selections.length ||
      cost > balance
    ) {
      closeSheet();

      setStatus(
        'Bet could not be placed. Check selection, balance, and timer.'
      );

      return;
    }

    balance -= cost;

    saveBalance();

    const bet = {
      id: Date.now(),

      period: round.period,

      items: selections.map(item => ({
        market: item.market,
        val: item.val
      })),

      label: selections.map(item => {
        return item.market === 'number'
          ? '#' + item.val
          : item.val;
      }).join(', '),

      stake,
      cost,
      done: false,
      net: 0
    };

    bets.unshift(bet);

    bets = bets.slice(0, 100);

    store(BET_KEY, bets);

    renderLedger();

    closeSheet();

    selections = [];

    renderSelections();

    setStatus(
      'Virtual bet placed for round ' +
      round.period +
      '.'
    );
  }

  // -------------------------------
  // SETTLE ROUND
  // -------------------------------

  function settleBets(period) {
    const number = resultFor(period);

    const color = colorFor(number);
    const size = sizeFor(number);

    let changed = false;
    let totalNet = 0;

    bets.forEach(bet => {
      if (
        !bet.done &&
        Number(bet.period) === Number(period)
      ) {
        let payout = 0;

        bet.items.forEach(item => {
          const won =
            (
              item.market === 'number' &&
              Number(item.val) === number
            ) ||
            (
              item.market === 'color' &&
              item.val === color
            ) ||
            (
              item.market === 'size' &&
              item.val === size
            );

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
        totalNet += bet.net;

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
          ' · Result ' + number +
          ' (' + color + ', ' + size + ')' +
          ' · Net ' +
          (totalNet >= 0 ? '+' : '') +
          totalNet +
          ' coins';

        $('pl').style.color =
          totalNet >= 0 ? '#8be7c8' : '#ff9eaf';
      }
    }
  }

  // -------------------------------
  // ROUND HISTORY
  // -------------------------------

  function renderHistory() {
    const root = $('history');

    if (!root) {
      return;
    }

    const current = periodInfo();
    const rows = [];

    for (
      let period = current.period - 1;
      period >= Math.max(
        pattern.startPeriod,
        current.period - 10
      );
      period--
    ) {
      if (
        period >= pattern.startPeriod &&
        period < pattern.startPeriod + 10
      ) {
        const number = resultFor(period);

        rows.push({
          period,
          number,
          color: colorFor(number),
          size: sizeFor(number)
        });
      }
    }

    if (!rows.length) {
      root.innerHTML =
        '<div class="empty">' +
        'First result will appear when this round finishes.' +
        '</div>';

      return;
    }

    root.innerHTML = rows.slice(0, 10).map(row => {
      return (
        '<div class="historyrow">' +
          '<span>' + row.period + '</span>' +
          '<strong>' + row.number + '</strong>' +
          '<span>' + row.color + '</span>' +
          '<span>' + row.size + '</span>' +
        '</div>'
      );
    }).join('');
  }

  // -------------------------------
  // MY BET HISTORY
  // -------------------------------

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char];
    });
  }

  function renderLedger() {
    const root = $('ledger');

    if (!root) {
      return;
    }

    if (!bets.length) {
      root.innerHTML =
        '<div class="empty">No bets yet.</div>';

      return;
    }

    root.innerHTML = bets.slice(0, 30).map(bet => {
      let result = 'Pending';

      if (bet.done) {
        result = bet.net >= 0
          ? '+' + bet.net
          : '−' + Math.abs(bet.net);
      }

      return (
        '<div class="ledgerrow" ' +
        'style="grid-template-columns:1.3fr .8fr 1fr">' +
          '<span>' + escapeHtml(bet.label) + '</span>' +
          '<span>' + bet.cost + '</span>' +
          '<span>' + result + '</span>' +
        '</div>'
      );
    }).join('');
  }

  // -------------------------------
  // TIMER UPDATE
  // -------------------------------

  function updateClock() {
    const round = ensurePattern();

    const time = String(round.remaining).padStart(2, '0');

    if ($('m1')) $('m1').textContent = '0';
    if ($('m2')) $('m2').textContent = '0';
    if ($('s1')) $('s1').textContent = time[0];
    if ($('s2')) $('s2').textContent = time[1];

    if ($('period')) {
      $('period').textContent = String(round.period);
    }

    if (currentPeriod === null) {
      currentPeriod = round.period;
    }

    if (round.period !== currentPeriod) {
      settleBets(currentPeriod);

      currentPeriod = round.period;

      selections = [];

      renderSelections();
      renderHistory();

      setStatus(
        'New round started. Choose your prediction.'
      );
    }

    if ($('place')) {
      $('place').disabled = round.remaining <= 5;
    }

    renderHistory();
  }

  // -------------------------------
  // REFRESH GAME
  // -------------------------------

  function refreshGame() {
    pattern = makePattern(periodInfo().period);

    store(PATTERN_KEY, pattern);

    currentPeriod = periodInfo().period;

    selections = [];

    renderSelections();
    renderHistory();
    renderLedger();
    updateClock();

    setStatus(
      'Refresh complete. New 10-round demo pattern started.'
    );
  }

  // -------------------------------
  // INITIALIZE GAME
  // -------------------------------

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
      console.error(
        'Zyvro missing HTML elements:',
        missing
      );

      setStatus(
        'Game setup error: missing ' +
        missing.join(', ')
      );

      return;
    }

    renderNumbers();

    document.querySelectorAll('[data-market]')
      .forEach(button => {
        button.addEventListener('click', () => {
          pick(button);
        });
      });

    document.querySelectorAll('[data-stake]')
      .forEach(button => {
        button.addEventListener('click', () => {
          stake = Number(button.dataset.stake) || 1;

          document.querySelectorAll('[data-stake]')
            .forEach(item => {
              item.classList.toggle(
                'active',
                item === button
              );
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

    $('place').addEventListener(
      'click',
      openSheet
    );

    $('closeSheet').addEventListener(
      'click',
      closeSheet
    );

    $('cancelBet').addEventListener(
      'click',
      closeSheet
    );

    $('confirmBet').addEventListener(
      'click',
      confirmBet
    );

    $('sheetback').addEventListener('click', event => {
      if (event.target === $('sheetback')) {
        closeSheet();
      }
    });

    $('refreshHistory').addEventListener(
      'click',
      refreshGame
    );

    $('resetCoins').addEventListener('click', () => {
      if (
        confirm(
          'Reset demo balance to 1000 virtual coins?'
        )
      ) {
        balance = 1000;

        saveBalance();

        setStatus(
          'Virtual coins reset to 1000.'
        );
      }
    });

    saveBalance();

    renderSelections();
    renderLedger();
    renderHistory();

    currentPeriod = periodInfo().period;

    updateClock();

    // Timer refreshes four times per second.
    setInterval(updateClock, 250);
  }

  // -------------------------------
  // ERROR DISPLAY
  // -------------------------------

  window.addEventListener('error', event => {
    setStatus(
      'Game error: ' +
      (event.message || 'JavaScript error')
    );

    console.error(event.error || event.message);
  });

  window.addEventListener(
    'unhandledrejection',
    event => {
      const reason = event.reason;

      setStatus(
        'Game error: ' +
        String(
          reason && reason.message
            ? reason.message
            : reason || 'Async error'
        )
      );

      console.error(reason);
    }
  );

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      init,
      { once: true }
    );
  } else {
    init();
  }
})();
