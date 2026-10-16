(function () {
  "use strict";

  /* =========================================
     ZYVRO PRISM ARCADE
     Virtual-credit demo game
     No real-money transactions
  ========================================= */

  const $ = id => document.getElementById(id);

  const BALANCE_KEY = "zyvro_prism_balance_v4";
  const BET_KEY = "zyvro_prism_bets_v4";
  const PATTERN_KEY = "zyvro_prism_pattern_v4";

  let balance = readBalance();
  let stake = 1;
  let selections = [];
  let bets = readArray(BET_KEY);
  let pattern = readPattern();
  let currentPeriod = null;
  let lastSettled = null;

  /* ---------- STORAGE ---------- */

  function readBalance() {
    const saved = localStorage.getItem(BALANCE_KEY);

    if (saved === null) return 1000;

    const value = Number(saved);

    return Number.isFinite(value) && value >= 0
      ? value
      : 1000;
  }

  function readArray(key) {
    try {
      const value = JSON.parse(
        localStorage.getItem(key) || "[]"
      );

      return Array.isArray(value) ? value : [];
    } catch (error) {
      return [];
    }
  }

  function store(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error("Storage error:", error);
      setStatus("Browser storage error. Refresh the page.");
    }
  }

  function saveBalance() {
    localStorage.setItem(BALANCE_KEY, String(balance));

    if ($("balance")) {
      $("balance").textContent = String(balance);
    }
  }

  /* ---------- ROUND SYSTEM ---------- */

  function periodInfo() {
    const seconds = Math.floor(Date.now() / 1000);

    return {
      period: Math.floor(seconds / 30),
      remaining: 30 - (seconds % 30)
    };
  }

  function colorFor(number) {
    if (number === 0 || number === 5) {
      return "Fuchsia";
    }

    if ([1, 3, 7, 9].includes(number)) {
      return "Aqua";
    }

    return "Gold";
  }

  function sizeFor(number) {
    return number >= 5 ? "Big" : "Small";
  }

  function makePattern(startPeriod) {
    let seed = (
      Date.now() ^
      Math.floor(Math.random() * 0x7fffffff)
    ) >>> 0;

    if (!seed) seed = 123456789;

    const results = [];

    for (let i = 0; i < 10; i++) {
      seed = (
        Math.imul(seed, 1664525) + 1013904223
      ) >>> 0;

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
        localStorage.getItem(PATTERN_KEY) || "null"
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
      console.warn("Creating a new demo pattern.");
    }

    const newPattern = makePattern(periodInfo().period);

    store(PATTERN_KEY, newPattern);

    return newPattern;
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

    if (
      offset >= 0 &&
      offset < 10 &&
      Number.isInteger(pattern.results[offset])
    ) {
      return pattern.results[offset];
    }

    return 0;
  }

  /* ---------- STATUS ---------- */

  function setStatus(message) {
    if ($("status")) {
      $("status").textContent = message;
    }
  }

  /* ---------- NUMBER BUTTONS ---------- */

  function renderNumbers() {
    const container = $("numbers");

    if (!container) return;

    container.innerHTML = "";

    for (let number = 0; number < 10; number++) {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "num " + colorFor(number);
      button.dataset.market = "number";
      button.dataset.val = String(number);
      button.textContent = String(number);

      button.addEventListener("click", function () {
        pick(button);
      });

      container.appendChild(button);
    }
  }

  function renderBalls(number) {
    const container = $("balls");

    if (!container) return;

    let html = "";

    for (let i = 0; i < 5; i++) {
      const value = (number + i * 3) % 10;

      html +=
        '<span class="mini ' +
        colorFor(value) +
        '">' +
        value +
        "</span>";
    }

    container.innerHTML = html;
  }

  /* ---------- SELECTIONS ---------- */

  function renderSelections() {
    document
      .querySelectorAll("[data-market]")
      .forEach(button => {
        const selected = selections.some(item =>
          item.market === button.dataset.market &&
          item.val === button.dataset.val
        );

        button.classList.toggle("sel", selected);
        button.classList.toggle("active", selected);
      });

    setStatus(
      selections.length
        ? selections.length +
          " prediction(s) selected · " +
          stake +
          " coin(s) each."
        : "Choose a number, color, or Big/Small."
    );
  }

  function pick(button) {
    const market = button.dataset.market;
    const val = button.dataset.val;

    if (!market || val === undefined) return;

    const index = selections.findIndex(item =>
      item.market === market && item.val === val
    );

    if (index >= 0) {
      selections.splice(index, 1);
    } else {
      selections.push({
        market: market,
        val: val
      });
    }

    renderSelections();
  }

  function setStake(value) {
    stake = Number(value);

    if (!Number.isFinite(stake) || stake < 1) {
      stake = 1;
    }

    document.querySelectorAll("[data-stake]").forEach(button => {
      button.classList.toggle(
        "sel",
        Number(button.dataset.stake) === stake
      );

      button.classList.toggle(
        "active",
        Number(button.dataset.stake) === stake
      );
    });

    renderSelections();
  }

  /* ---------- BET HISTORY ---------- */

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => {
      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      };

      return map[character];
    });
  }

  function renderLedger() {
    const container = $("ledger");

    if (!container) return;

    if (!bets.length) {
      container.innerHTML =
        '<div class="emptyledger">No bets yet.</div>';
      return;
    }

    container.innerHTML = bets.slice(0, 30).map(bet => {
      const resultText = !bet.done
        ? "Pending"
        : bet.net >= 0
          ? "Settled"
          : "Lost";

      const netText = !bet.done
        ? "—"
        : (bet.net >= 0 ? "+" : "") + bet.net;

      return (
        '<div class="ledgerrow">' +
          "<span>" + escapeHtml(bet.label) + "</span>" +
          "<span>" + escapeHtml(bet.cost) + "</span>" +
          "<span>" + resultText + "</span>" +
          "<span>" + netText + "</span>" +
        "</div>"
      );
    }).join("");
  }

  function renderHistory() {
    const container = $("history");

    if (!container) return;

    const q = periodInfo();
    const rows = [];

    for (
      let period = q.period - 1;
      period >= Math.max(pattern.startPeriod, q.period - 10);
      period--
    ) {
      const number = resultFor(period);

      rows.push({
        period: period,
        number: number,
        color: colorFor(number),
        size: sizeFor(number)
      });
    }

    if (!rows.length) {
      container.innerHTML =
        '<div class="emptyledger">' +
        "Results will appear here after a round finishes." +
        "</div>";

      return;
    }

    container.innerHTML = rows.slice(0, 10).map(row => {
      return (
        '<div class="historyrow">' +
          "<span>" + row.period + "</span>" +
          '<span class="hnum">' + row.number + "</span>" +
          '<span class="tag">' + row.color + "</span>" +
          '<span class="tag">' + row.size + "</span>" +
        "</div>"
      );
    }).join("");
  }

  /* ---------- SETTLE BETS ---------- */

  function settleBets(period) {
    const number = resultFor(period);
    const color = colorFor(number);
    const size = sizeFor(number);

    let changed = false;
    let netTotal = 0;

    bets.forEach(bet => {
      if (bet.done || Number(bet.period) !== Number(period)) {
        return;
      }

      let payout = 0;

      bet.items.forEach(item => {
        const won =
          (item.market === "number" &&
            Number(item.val) === number) ||
          (item.market === "color" &&
            item.val === color) ||
          (item.market === "size" &&
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

      balance += payout;
      netTotal += bet.net;
      changed = true;
    });

    if (changed) {
      saveBalance();
      store(BET_KEY, bets);
      renderLedger();

      if ($("pl")) {
        $("pl").textContent =
          "Round " + period +
          " · Result " + number +
          " · " + color +
          " · " + size +
          " · Net " +
          (netTotal >= 0 ? "+" : "") +
          netTotal + " coins";

        $("pl").style.color =
          netTotal >= 0 ? "#42d6b5" : "#ff7272";
      }

      lastSettled = period;
    }
  }

  /* ---------- BET CONFIRMATION ---------- */

  function openSheet() {
    const q = periodInfo();

    if (q.remaining <= 5) {
      setStatus("Betting closes during the last 5 seconds.");
      return;
    }

    if (!selections.length) {
      setStatus("Please choose a number, color, or Big/Small first.");
      return;
    }

    const cost = stake * selections.length;

    if (cost > balance) {
      setStatus("Not enough virtual coins. Reduce the stake.");
      return;
    }

    if ($("sheetTitle")) {
      $("sheetTitle").textContent = selections.map(item => {
        return item.market === "number"
          ? "Number " + item.val
          : item.val;
      }).join(", ");
    }

    if ($("sheetStake")) {
      $("sheetStake").textContent = stake + " coin(s)";
    }

    if ($("sheetCount")) {
      $("sheetCount").textContent = String(selections.length);
    }

    if ($("sheetTotal")) {
      $("sheetTotal").textContent = cost + " coins";
    }

    if ($("sheetback")) {
      $("sheetback").classList.add("show");
    }
  }

  function closeSheet() {
    if ($("sheetback")) {
      $("sheetback").classList.remove("show");
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
      setStatus("Bet could not be placed. Check your selection and balance.");
      return;
    }

    balance -= cost;
    saveBalance();

    const items = selections.map(item => ({
      market: item.market,
      val: item.val
    }));

    const label = items.map(item =>
      item.market === "number"
        ? "#" + item.val
        : item.val
    ).join(", ");

    bets.unshift({
      id: Date.now(),
      period: q.period,
      items: items,
      label: label,
      stake: stake,
      cost: cost,
      done: false,
      payout: 0,
      net: 0
    });

    bets = bets.slice(0, 100);

    store(BET_KEY, bets);
    renderLedger();

    closeSheet();

    selections = [];
    renderSelections();

    setStatus("Virtual bet placed for round " + q.period + ".");
  }

  /* ---------- REFRESH GAME ---------- */

  function refreshGame() {
    pattern = makePattern(periodInfo().period);
    store(PATTERN_KEY, pattern);

    currentPeriod = periodInfo().period;
    selections = [];

    renderSelections();
    renderHistory();
    renderLedger();
    updateClock();

    setStatus("Demo game refreshed.");
  }

  /* ---------- RESET BALANCE ---------- */

  function resetCoins() {
    if (!confirm("Reset demo balance to 1000 virtual coins?")) {
      return;
    }

    balance = 1000;
    saveBalance();

    setStatus("Virtual coins reset to 1000.");
  }

  /* ---------- CLOCK ---------- */

  function updateClock() {
    const q = ensurePattern();

    const minutes = String(
      Math.floor(q.remaining / 60)
    ).padStart(2, "0");

    const seconds = String(
      q.remaining % 60
    ).padStart(2, "0");

    if ($("m1")) $("m1").textContent = minutes[0];
    if ($("m2")) $("m2").textContent = minutes[1];
    if ($("s1")) $("s1").textContent = seconds[0];
    if ($("s2")) $("s2").textContent = seconds[1];

    if ($("period")) {
      $("period").textContent = String(q.period);
    }

    if (currentPeriod === null) {
      currentPeriod = q.period;
    } else if (q.period !== currentPeriod) {
      settleBets(currentPeriod);

      currentPeriod = q.period;
      selections = [];

      renderSelections();
      renderHistory();
      renderLedger();
    }

    if ($("place")) {
      $("place").disabled = q.remaining <= 5;

      $("place").textContent =
        q.remaining <= 5 ? "Betting closed" : "Place bet";
    }

    renderBalls(resultFor(q.period - 1));
  }

  /* ---------- INITIALIZE ---------- */

  function init() {
    const required = [
      "balance",
      "balls",
      "m1",
      "m2",
      "s1",
      "s2",
      "period",
      "numbers",
      "history",
      "ledger",
      "status",
      "place",
      "sheetback",
      "sheetTitle",
      "sheetStake",
      "sheetCount",
      "sheetTotal",
      "closeSheet",
      "cancelBet",
      "confirmBet",
      "refreshHistory",
      "resetCoins",
      "randomPick"
    ];

    const missing = required.filter(id => !$(id));

    if (missing.length) {
      console.error("Zyvro missing HTML elements:", missing);

      setStatus(
        "Game setup error: missing HTML elements: " +
        missing.join(", ")
      );

      return;
    }

    renderNumbers();

    document.querySelectorAll(
      '.colors [data-market], .sizes [data-market]'
    ).forEach(button => {
      button.addEventListener("click", () => pick(button));
    });

    document.querySelectorAll("[data-stake]").forEach(button => {
      button.addEventListener("click", () => {
        setStake(button.dataset.stake);
      });
    });

    $("randomPick").addEventListener("click", () => {
      selections = [{
        market: "number",
        val: String(Math.floor(Math.random() * 10))
      }];

      renderSelections();
    });

    $("place").addEventListener("click", openSheet);
    $("closeSheet").addEventListener("click", closeSheet);
    $("cancelBet").addEventListener("click", closeSheet);
    $("confirmBet").addEventListener("click", confirmBet);
    $("refreshHistory").addEventListener("click", refreshGame);
    $("resetCoins").addEventListener("click", resetCoins);

    $("sheetback").addEventListener("click", event => {
      if (event.target === $("sheetback")) {
        closeSheet();
      }
    });

    saveBalance();
    renderSelections();
    renderHistory();
    renderLedger();

    currentPeriod = periodInfo().period;

    updateClock();

    setInterval(updateClock, 250);
  }

  window.addEventListener("error", event => {
    setStatus("Game error: " + (event.message || "JavaScript error"));
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
