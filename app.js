(function () {
  "use strict";

  var KEY = "imo-p3p6-trainer:v1";
  var PROBLEMS = window.PROBLEMS || [];
  var RESULT_LABEL = { own: "решил сам", hint: "решил с подсказкой", fail: "не решил" };
  var RANK = { own: 3, hint: 2, fail: 1 };

  /* ---------- storage (works without localStorage too) ---------- */
  var memory = null;
  function emptyState() { return { attempts: {}, active: {} }; }
  function load() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && typeof s === "object") {
          s.attempts = s.attempts || {};
          s.active = s.active || {};
          return s;
        }
      }
    } catch (e) { /* storage blocked or corrupt */ }
    return memory || emptyState();
  }
  function save(s) {
    memory = s;
    try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* keep in memory */ }
  }
  var state = load();
  var review = {}; // answer opened after a finished attempt (not stored)

  /* ---------- helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function fmtDur(ms) {
    var t = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return h > 0 ? h + ":" + pad(m) + ":" + pad(s) : m + ":" + pad(s);
  }
  function fmtTotal(ms) {
    var min = Math.round(ms / 60000);
    if (min < 60) return min + " мин";
    return Math.floor(min / 60) + " ч " + (min % 60) + " мин";
  }
  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
    } catch (e) { return iso.slice(0, 10); }
  }
  function elapsed(a) {
    if (!a) return 0;
    return (a.elapsed || 0) + (a.startedAt ? Date.now() - a.startedAt : 0);
  }
  function attemptsOf(pid) { return state.attempts[pid] || []; }
  function best(pid) {
    var list = attemptsOf(pid), b = null;
    for (var i = 0; i < list.length; i++) {
      if (!b || RANK[list[i].result] > RANK[b]) b = list[i].result;
    }
    return b;
  }
  function bestOwnTime(pid) {
    var list = attemptsOf(pid), t = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].result === "own" && (t === null || list[i].ms < t)) t = list[i].ms;
    }
    return t;
  }
  function renderMath(el) {
    if (typeof window.renderMathInElement !== "function") return;
    try {
      window.renderMathInElement(el, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false }
        ],
        throwOnError: false
      });
    } catch (e) { /* leave plain text */ }
  }

  /* ---------- progress ---------- */
  function renderProgress() {
    var own = 0, hint = 0, total = 0, time = 0;
    PROBLEMS.forEach(function (p) {
      var b = best(p.id);
      if (b === "own") own++;
      else if (b === "hint") hint++;
      attemptsOf(p.id).forEach(function (a) { total++; time += a.ms || 0; });
    });
    $("#stats").innerHTML =
      stat(own + " / " + PROBLEMS.length, "решено самостоятельно") +
      stat(String(hint), "решено с подсказкой") +
      stat(String(total), total === 1 ? "попытка" : "попыток всего") +
      stat(fmtTotal(time), "время на задачах");

    $("#board").innerHTML = PROBLEMS.map(function (p) {
      var list = attemptsOf(p.id);
      var dots = list.length
        ? list.map(function (a) {
            return '<span class="dot dot-' + a.result + '" title="' + fmtDate(a.at) + ": " +
              RESULT_LABEL[a.result] + ", " + fmtDur(a.ms) + '"></span>';
          }).join("")
        : '<span class="empty">ещё не пробовали</span>';
      var b = best(p.id), ownT = bestOwnTime(p.id);
      var bestText = b === "own" ? "лучшее время " + fmtDur(ownT) : b ? RESULT_LABEL[b] : "";
      return '<div class="row"><a href="#' + p.id + '">' + p.source + '</a>' +
        '<div class="dots" aria-label="История попыток">' + dots + '</div>' +
        '<div class="best">' + bestText + '</div></div>';
    }).join("");
  }
  function stat(value, label) { return '<div class="stat"><b>' + value + '</b><span>' + label + '</span></div>'; }

  /* ---------- problem cards ---------- */
  function cardHTML(p, idx) {
    var a = state.active[p.id];
    var html = '<div class="card-head"><h3>Задача ' + (idx + 1) + '</h3>' +
      '<span class="tag">' + p.source + ' · ' + p.topic + '</span></div>' +
      '<div class="statement"><p>' + p.statement + '</p></div>';

    if (!a) {
      html += '<div class="controls"><button type="button" class="primary" data-act="start">Начать попытку</button>';
      if (p.answer && attemptsOf(p.id).length) {
        html += '<button type="button" data-act="review">' + (review[p.id] ? "Скрыть ответ" : "Сверить ответ") + '</button>';
      }
      html += '</div>';
      if (review[p.id] && p.answer) html += answerBlock(p);
    } else {
      var running = !!a.startedAt;
      html += '<div class="controls">' +
        '<span class="timer' + (running ? "" : " paused") + '" data-timer>' + fmtDur(elapsed(a)) + '</span>' +
        '<button type="button" data-act="pause">' + (running ? "Пауза" : "Продолжить") + '</button>';
      if (!a.hint) html += '<button type="button" data-act="hint">Подсказка Мираса</button>';
      if (a.hint && p.answer && !a.answer) html += '<button type="button" data-act="answer">Показать ответ</button>';
      html += '</div>';
      if (a.hint) {
        html += '<div class="reveal hint"><span class="label">Подсказка Мираса</span><p>' + p.hint + '</p></div>';
        if (!p.answer) html += '<p class="note">Это задача на доказательство, готового ответа в виде числа здесь нет.</p>';
      }
      if (a.answer && p.answer) html += answerBlock(p);
      html += '<div class="result"><p class="q">Как прошла попытка?</p><div class="controls">' +
        '<button type="button" class="r-own" data-act="res-own"' +
          (a.hint ? ' disabled title="В этой попытке подсказка уже открыта"' : '') + '>Решил сам</button>' +
        '<button type="button" class="r-hint" data-act="res-hint">Решил с подсказкой</button>' +
        '<button type="button" data-act="res-fail">Не решил</button>' +
        '<button type="button" class="link-btn" data-act="cancel">Отменить попытку</button>' +
        '</div></div>';
    }

    var list = attemptsOf(p.id);
    if (list.length) {
      html += '<details class="history"><summary>История: ' + list.length + ' ' + plural(list.length) + '</summary><ol>' +
        list.map(function (x) {
          return '<li>' + fmtDate(x.at) + ', ' + fmtDur(x.ms) + ': ' + RESULT_LABEL[x.result] + '</li>';
        }).join("") + '</ol></details>';
    }
    return html;
  }
  function answerBlock(p) {
    return '<div class="reveal answer"><span class="label">Ответ</span><p>' + p.answer + '</p></div>';
  }
  function plural(n) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return "попытка";
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "попытки";
    return "попыток";
  }

  function renderCard(p, idx) {
    var el = document.getElementById(p.id);
    var openHistory = el && el.querySelector("details.history[open]");
    el.innerHTML = cardHTML(p, idx);
    if (openHistory) { var d = el.querySelector("details.history"); if (d) d.open = true; }
    renderMath(el);
  }

  function renderAll() {
    var root = $("#problems");
    root.innerHTML = PROBLEMS.map(function (p) {
      return '<article class="card" id="' + p.id + '"></article>';
    }).join("");
    PROBLEMS.forEach(renderCard);
    renderProgress();
  }

  /* ---------- actions ---------- */
  function act(pid, action) {
    var idx = -1;
    for (var i = 0; i < PROBLEMS.length; i++) if (PROBLEMS[i].id === pid) idx = i;
    if (idx < 0) return;
    var p = PROBLEMS[idx];
    var a = state.active[pid];

    if (action === "start") {
      state.active[pid] = { startedAt: Date.now(), elapsed: 0, hint: false, answer: false };
      review[pid] = false;
    } else if (action === "review") {
      review[pid] = !review[pid];
    } else if (!a) {
      return;
    } else if (action === "pause") {
      if (a.startedAt) { a.elapsed = elapsed(a); a.startedAt = null; }
      else { a.startedAt = Date.now(); }
    } else if (action === "hint") {
      a.hint = true;
    } else if (action === "answer") {
      if (a.hint) a.answer = true;
    } else if (action === "cancel") {
      delete state.active[pid];
    } else if (action.indexOf("res-") === 0) {
      var result = action.slice(4);
      if (result === "own" && a.hint) return;
      if (!state.attempts[pid]) state.attempts[pid] = [];
      state.attempts[pid].push({
        at: new Date().toISOString(),
        ms: elapsed(a),
        result: result,
        hint: !!a.hint
      });
      delete state.active[pid];
    }
    save(state);
    renderCard(p, idx);
    renderProgress();
  }

  function onClick(e) {
    var btn = e.target.closest ? e.target.closest("button[data-act]") : null;
    if (!btn || btn.disabled) return;
    var card = btn.closest("article.card");
    if (!card) return;
    act(card.id, btn.getAttribute("data-act"));
  }

  function tick() {
    PROBLEMS.forEach(function (p) {
      var a = state.active[p.id];
      if (!a || !a.startedAt) return;
      var el = document.querySelector("#" + p.id + " [data-timer]");
      if (el) el.textContent = fmtDur(elapsed(a));
    });
  }

  function init() {
    if (!PROBLEMS.length) return;
    renderAll();
    $("#problems").addEventListener("click", onClick);
    $("#reset-all").addEventListener("click", function () {
      if (window.confirm("Удалить всю историю попыток на этом устройстве?")) {
        state = emptyState();
        review = {};
        save(state);
        renderAll();
      }
    });
    setInterval(tick, 1000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
