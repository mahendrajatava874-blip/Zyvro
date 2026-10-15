(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  const BAL_KEY = 'zyvro_prism_balance_v3';
  const BET_KEY = 'zyvro_prism_bets_v3';
  const HIST_KEY = 'zyvro_prism_history_v3';

  let balance = Number(localStorage.getItem(BAL_KEY));
  if (!Number.isFinite(balance) || balance < 0) balance = 1000;

  let stake = 1;
  let selections = [];
  let currentPeriod = null;
  let myBets = loadJSON(BET_KEY, []);
  let history = loadJSON(HIST_KEY, []);

  function loadJSON(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return Array.isArray(value) ? value : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function colorFor(n) {
    if (n === 0 || n === 5) return 'Fuchsia';
    if ([1, 3, 7, 9].includes(n)) return 'Aqua';
    return 'Gold';
  }

  function sizeFor(n) {
    return n >= 5 ? 'Big' : 'Small';
  }

  function resultFor(period) {
    let x = Math.imul((Number(period) % 2147483647) || 1, 48271);
    x %= 2147483647;
    if (x < 0) x = -x;
    return x % 10;
  }

  function periodInfo() {
    const now = Math.floor(Date.now() / 1000);
    return {
      p: Math.floor(now / 30),
      remain: 30 - (now % 30)
    };
  }

  function saveBalance() {
    localStorage.setItem(BAL_KEY, String(balance));
    if ($('balance')) $('balance').textContent = balance;
  }

  function renderHistory() {
    if (!$('history')) return;

    if (!history.length) {
      $('history').innerHTML =
        '<div class="emptyledger">No round history yet.</div>';
      return;
    }

    $('history').innerHTML = history.slice(0, 30).map(h =>
      `<div class="historyrow">
        <span>${h.period}</span>
        <span class="hnum">${h.number}</span>
        <span class="tag">${h.color}</span>
        <span class="tag">${h.size}</span>
      </div>`
    ).join('');
  }

  function renderLedger() {
    if (!$('ledger')) return;

    if (!myBets.length) {
      $('ledger').innerHTML =
        '<div class="emptyledger">No bets yet.</div>';
      return;
    }

    $('ledger').innerHTML = myBets.slice(0, 30).map(b =>
      `<div class="ledgerrow">
        <span>${b.label}</span>
        <span>${b.cost}</span>
        <span>${b.done ? (b.net >= 0 ? 'Settled' : 'Lost') : 'Pending'}</span>
        <span>${b.done ? b.net : '—'}</span>
      </div>`
    ).join('');
  }

  function renderBalls(n) {
    if (!$('balls')) return;

    let html = '';

    for (let i = 0; i < 5; i++) {
      const v = (n + i * 3) % 10;
      html += `<span class="mini ${colorFor(v)}">${v}</span>`;
    }

    $('balls').innerHTML = html;
  }

  function renderSelections() {
    document.querySelectorAll('[data-market]').forEach(button => {
      const selected = selections.some(s =>
        s.market === button.dataset.market &&
        s.val === button.dataset.val
      );

      button.classList.toggle('sel', selected);
    });

    if ($('status')) {
      $('status').textContent = selections.length
        ? `${selections.length} prediction(s) selected · ${stake} coin(s) each.`
        : 'Choose a number, color, or Big/Small.';
    }
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

  function setStake(button) {
    stake = Number(button.dataset.stake) || 1;

    document.querySelectorAll('[data-stake]').forEach(b => {
      b.classList.toggle('sel', b === button);
    });

    renderSelections();
  }

  function settleBets(period) {
    const n = resultFor(period);
    const color = colorFor(n);
    const size = sizeFor(n);

    let changed = false;
    let netSum = 0;

    myBets.forEach(b => {
      if (!b.done && String(b.period) === String(period)) {
        let payout = 0;

        b.items.forEach(item => {
          const win =
            (item.market === 'number' && Number(item.val) === n) ||
            (item.market === 'color' && item.val === color) ||
            (item.market === 'size' && item.val === size);

          if (win) payout += b.stake * 2;
        });

        b.done = true;
        b.number = n;
        b.color = color;
        b.size = size;
        b.payout = payout;
        b.net = payout - b.cost;

        netSum += b.net;
        balance += payout;
        changed = true;
      }
    });

    if (changed) {
      saveBalance();
      saveJSON(BET_KEY, myBets);
      renderLedger();

      if ($('pl')) {
        $('pl').textContent =
          `Round ${period}: result ${n} (${color}, ${size}) · Net ${netSum >= 0 ? '+' : ''}${netSum} coins`;
      }
    }

    if (!history.some(h => String(h.period) === String(period))) {
      history.unshift({ period, number: n, color, size });
      history = history.slice(0, 50);
      saveJSON(HIST_KEY, history);
      renderHistory();
    }
  }

  function updateClock() {
    const q = periodInfo();

    if ($('m1')) $('m1').textContent = '0';
    if ($('m2')) $('m2').textContent = '0';
    if ($('s1')) $('s1').textContent = String(Math.floor(q.remain / 10));
    if ($('s2')) $('s2').textContent = String(q.remain % 10);

    if ($('period')) $('period').textContent = String(q.p);

    if (currentPeriod === null) currentPeriod = q.p;

    if (q.p !== currentPeriod) {
      settleBets(currentPeriod);
      currentPeriod = q.p;
      selections = [];
      renderSelections();
    }

    if ($('place')) {
      $('place').disabled = q.remain <= 5;
      $('place').textContent =
        q.remain <= 5 ? 'Betting closed' : 'Place bet';
    }

    renderBalls(resultFor(q.p - 1));
  }

  function refreshHistory() {
    const q = periodInfo();
    const known = new Map(
      history.map(h => [String(h.period), h])
    );

    for (let p = q.p - 1; p >= Math.max(0, q.p - 30); p--) {
      if (!known.has(String(p))) {
        const n = resultFor(p);

        known.set(String(p), {
          period: String(p),
          number: n,
          color: colorFor(n),
          size: sizeFor(n)
        });
      }
    }

    history = Array.from(known.values())
      .sort((a, b) => Number(b.period) - Number(a.period))
      .slice(0, 50);

    saveJSON(HIST_KEY, history);
    renderHistory();
  }

  function showBetSheet() {
    const q = periodInfo();

    if (q.remain <= 5) {
      $('status').textContent = 'Betting closed for the last 5 seconds.';
      return;
    }

    if (!selections.length) {
      $('status').textContent = 'Please choose a prediction first.';
      return;
    }

    const cost = stake * selections.length;

    if (cost > balance) {
      $('status').textContent = 'Not enough virtual coins.';
      return;
    }

    $('sheetTitle').textContent = selections
      .map(s => s.market === 'number' ? 'Number ' + s.val : s.val)
      .join(', ');

    $('sheetStake').textContent = stake + ' coin(s)';
    $('sheetCount').textContent = selections.length;
    $('sheetTotal').textContent = cost + ' coins';
    $('sheetback').classList.add('show');
  }

  function confirmBet() {
    const q = periodInfo();
    const cost = stake * selections.length;

    if (q.remain <= 5 || !selections.length || cost > balance) {
      $('status').textContent = 'Check your selection and balance.';
      $('sheetback').classList.remove('show');
      return;
    }

    balance -= cost;
    saveBalance();

    myBets.unshift({
      id: Date.now(),
      period: String(q.p),
      items: selections.map(s => ({ ...s })),
      label: selections.map(s =>
        s.market === 'number' ? '#' + s.val : s.val
      ).join(', '),
      stake,
      cost,
      done: false,
      net: 0
    });

    myBets = myBets.slice(0, 100);

    saveJSON(BET_KEY, myBets);
    renderLedger();

    $('sheetback').classList.remove('show');

    selections = [];
    renderSelections();

    $('status').textContent = 'Bet placed for round ' + q.p + '.';
  }

  function initialize() {
    const required = [
      'balance', 'history', 'ledger', 'balls',
      'm1', 'm2', 's1', 's2', 'period',
      'place', 'status', 'numbers'
    ];

    const missing = required.filter(id => !$(id));

    if (missing.length) {
      console.error('Zyvro missing HTML elements:', missing);
      return;
    }

    for (let n = 0; n < 10; n++) {
      const button = document.createElement('button');

      button.type = 'button';
      button.className = 'num';
      button.dataset.market = 'number';
      button.dataset.val = String(n);
      button.textContent = n;
