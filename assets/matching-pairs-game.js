
 (function () {
  const cfg = window.MATCHING_PAIRS_CFG || {};
  const root = document.getElementById("matching-pairs-root");
  if (!root) return;
 

  // =====================================
  // 16 IMAGE FILES STORED IN /assets/cards/
  // =====================================
  const CARD_FILES = [
    "1.jpg",
    "2.jpg",
    "3.jpg",
    "4.jpg",
    "5.png",
    "6.jpg",
    "7.jpg",
    "8.jpg",
    "9.jpg",
    "10.png",
    "11.jpg",
    "12.jpg",
    "13.jpg",
    "14.jpg",
    "15.jpg",
    "16.jpg",
  ];

  // Build full URLs based on your plugin’s assetsBase path
  const CARD_IMAGES = CARD_FILES.map(
    (name) => (cfg.assetsBase || "") + "cards/" + name
  );

  // =====================================
  // AUDIO TRACKS
  // Files live in /assets/audio/
  // =====================================
  const GAME_TRACKS = [
    "1.mp3",
    "2.mp3",
    "3.mp3",
    "4.mp3",
    "5.mp3",
    "6.mp3",
    "7.mp3",
    "8.mp3",
    "9.mp3",
    "10.mp3",
    "11.mp3",
    "12.mp3",
    "13.mp3",
  ];

  const LEADER_TRACKS = [
    "1.mp3",
    "2.mp3",
    "3.mp3",
    "4.mp3",
    "5.mp3",
    "6.mp3",
    "7.mp3",
    "8.mp3",
    "9.mp3",
    "10.mp3",
    "11.mp3",
    "12.mp3",
    "13.mp3",
  ];

  function pickRandom(arr) {
    if (!arr || !arr.length) return null;
    const i = Math.floor(Math.random() * arr.length);
    return arr[i];
  }

  let gameAudio = null;
  let leaderAudio = null;

  function stopAllAudio() {
    [gameAudio, leaderAudio].forEach((a) => {
      if (a) {
        try {
          a.pause();
          a.currentTime = 0;
        } catch (e) {}
      }
    });
    gameAudio = null;
    leaderAudio = null;
  }

  function playRandomGameTrack() {
    stopAllAudio();
    const file = pickRandom(GAME_TRACKS);
    if (!file) return;
    const url = (cfg.assetsBase || "") + "audio/" + file;

    gameAudio = new Audio(url);
    gameAudio.volume = 0.6;
    gameAudio.loop = false;

    gameAudio.play().catch((e) => {
      console.warn("Could not play game audio:", e.message);
    });

    // Stop after game duration (60s) just in case the track is longer
    setTimeout(() => {
      if (gameAudio) {
        try {
          gameAudio.pause();
        } catch (e) {}
      }
    }, GAME_DURATION_MS + 500);
  }

  function playRandomLeaderTrack() {
    stopAllAudio();
    const file = pickRandom(LEADER_TRACKS);
    if (!file) return;
    const url = (cfg.assetsBase || "") + "audio/" + file;

    leaderAudio = new Audio(url);
    leaderAudio.volume = 0.6;
    leaderAudio.loop = false;

    leaderAudio.play().catch((e) => {
      console.warn("Could not play leaderboard audio:", e.message);
    });
  }


  const GAME_DURATION_MS = 60000; // 60 seconds
  const PRE_COUNTDOWN_MS = 3000; // 3 seconds
 
  let state = "intro"; // intro | countdown | playing | finished | personal | global
  let cards = [];
  let firstIndex = null;
  let secondIndex = null;
  let lockFlip = false;
  let matchedPairs = 0;
  let score = 0;
  let timerStart = 0;
  let timerInterval = null;
  let timeLeftMs = GAME_DURATION_MS;

  let playerInitials = "";
  let lastSubmitId = null;

  function shuffle(array) {
    const arr = array.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function createDeck() {
    const deck = [];
    CARD_IMAGES.forEach((face, idx) => {
      deck.push({ id: idx * 2, face: face, matched: false });
      deck.push({ id: idx * 2 + 1, face: face, matched: false });
    });
    return shuffle(deck);
  }

  function resetGame() {
    state = "intro";
    cards = createDeck();
    firstIndex = null;
    secondIndex = null;
    lockFlip = false;
    matchedPairs = 0;
    score = 0;
    timerStart = 0;
    timeLeftMs = GAME_DURATION_MS;
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    stopAllAudio();   // 👈 ensure nothing keeps playing
    renderIntro();
  }

  // ---------- Rendering helpers ----------

  function el(tag, cls, text) {
    const x = document.createElement(tag);
    if (cls) x.className = cls;
    if (text !== undefined && text !== null) x.textContent = text;
    return x;
  }

  function renderIntro() {
    const wrap = el("div", "mpg-wrap");
    const card = el("div", "mpg-card");
    const header = el("div", "mpg-header");
    header.appendChild(el("h2", "mpg-title", "Matching Pairs"));

    card.appendChild(header);
    card.appendChild(
      el(
        "p",
        "mpg-sub",
        "You have 1 minute to find all 16 matching pairs. Finish early to earn bonus points!"
      )
    );

    const info = el("p", "mpg-sub");
    info.innerHTML =
      "Match pairs to earn <strong>100 points per pair</strong>. " +
      "If you finish with time left, you get <strong>100 bonus points per 0.5 seconds</strong> remaining.";
    card.appendChild(info);

    const actions = el("div", "mpg-actions");
    const btn = el("button", "mpg-btn", "Start game");
    btn.onclick = () => startCountdown();
    actions.appendChild(btn);

    card.appendChild(actions);
    wrap.appendChild(card);
    root.replaceChildren(wrap);
  }

  function startCountdown() {
    state = "countdown";
    const wrap = el("div", "mpg-wrap");
    const card = el("div", "mpg-card");
    const header = el("div", "mpg-header");
    header.appendChild(el("h2", "mpg-title", "Get ready..."));
    card.appendChild(header);
    const countdownText = el("p", "mpg-sub", "Starting in 3...");
    card.appendChild(countdownText);

    wrap.appendChild(card);
    root.replaceChildren(wrap);

    let remaining = PRE_COUNTDOWN_MS;
    const step = 100;
    const interval = setInterval(() => {
      remaining -= step;
      const seconds = Math.ceil(remaining / 1000);
      countdownText.textContent =
        remaining > 0 ? `Starting in ${seconds}...` : "Go!";
      if (remaining <= 0) {
        clearInterval(interval);
        startGame();
      }
    }, step);
  }

  function startGame() {
    state = "playing";
    cards = createDeck();
    firstIndex = null;
    secondIndex = null;
    lockFlip = false;
    matchedPairs = 0;
    score = 0;
    timerStart = Date.now();
    timeLeftMs = GAME_DURATION_MS;

    playRandomGameTrack();  // 👈 start background music

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      const elapsed = Date.now() - timerStart;
      timeLeftMs = Math.max(0, GAME_DURATION_MS - elapsed);
      if (timeLeftMs <= 0) {
        clearInterval(timerInterval);
        timerInterval = null;
        endGame(false);
      } else {
        renderGame(); // update timer display
      }
    }, 100);

    renderGame();
  }

  function formatTime(ms) {
    const s = Math.max(0, ms) / 1000;
    const whole = Math.floor(s);
    const tenths = Math.floor((s - whole) * 10);
    return `${whole}.${tenths.toString().padStart(1, "0")}s`;
  }

function renderGame() {
  if (state !== "playing") return;

  const wrap = el("div", "mpg-wrap");
  const cardEl = el("div", "mpg-card");
  const header = el("div", "mpg-header");
  header.appendChild(el("h2", "mpg-title", "Matching Pairs"));
  cardEl.appendChild(header);

  const stats = el("div", "mpg-stats");
  stats.appendChild(el("div", "", `Time left: ${formatTime(timeLeftMs)}`));
  stats.appendChild(el("div", "", `Score: ${score}`));
  stats.appendChild(el("div", "", `Pairs matched: ${matchedPairs} / 16`));
  cardEl.appendChild(stats);

  const gridWrapper = el("div", "");
  gridWrapper.style.position = "relative";

  const grid = el("div", "mpg-grid");

  // Build tiles
  cards.forEach((c, idx) => {
    const tile = el("div", "mpg-card-tile");
    tile.dataset.index = idx;

    const isFaceUp =
      c.matched || idx === firstIndex || idx === secondIndex;

    if (c.matched) {
      tile.classList.add("matched", "disabled");
    }

    if (!isFaceUp) {
      tile.classList.add("face-down");
    } else {
      tile.classList.add("face-up");

      const imgUrl = c.face; // face already holds the full image URL
      if (imgUrl) {
        const img = document.createElement("img");
        img.src = imgUrl;
        img.alt = `Card ${idx + 1}`;
        img.loading = "lazy";
        tile.appendChild(img);
      } else {
        tile.textContent = String(idx + 1);
      }
    }

    if (lockFlip || c.matched) {
      tile.classList.add("disabled");
    }

    grid.appendChild(tile);
  });

  // ONE click handler for the whole grid (event delegation)
  grid.addEventListener(
  "pointerdown",
  (event) => {
    console.log("GRID POINTERDOWN fired", {
      tag: event.target.tagName,
      class: event.target.className,
    });

    const tile = event.target.closest(".mpg-card-tile");
    if (!tile) return;

    if (tile.classList.contains("disabled")) {
      console.log("Tile ignored: disabled", tile.dataset.index);
      return;
    }

    const index = parseInt(tile.dataset.index, 10);
    if (Number.isNaN(index)) {
      console.log("Tile ignored: no dataset.index");
      return;
    }

    console.log("GRID HANDLER calling handleFlip for", index);
    handleFlip(index);
  },
  false
);


  gridWrapper.appendChild(grid);
  cardEl.appendChild(gridWrapper);

  const actions = el("div", "mpg-actions");
  const quitBtn = el("button", "mpg-btn secondary", "Quit");
  quitBtn.onclick = resetGame;
  actions.appendChild(quitBtn);
  cardEl.appendChild(actions);

  wrap.appendChild(cardEl);
  root.replaceChildren(wrap);
}

// --- TEMP DEBUG: log any click that hits a tile at all ---
document.addEventListener(
  "click",
  (e) => {
    const tile = e.target.closest(".mpg-card-tile");
    if (tile) {
      console.log("RAW CLICK on tile", tile.dataset.index, {
        tag: e.target.tagName,
        classes: e.target.className,
        lockFlip,
        state,
      });
    }
  },
  true // capture phase: see clicks even if something stops bubbling
);


  function handleFlip(index) {
     console.log("handleFlip()", {
    index,
    lockFlip,
    state,
    firstIndex,
    secondIndex,
    matched: cards[index].matched
  });
    if (lockFlip) return;
    const c = cards[index];
    if (c.matched) return;
    if (index === firstIndex) return;

    if (firstIndex === null) {
      firstIndex = index;
      renderGame();
      return;
    }

    if (secondIndex === null) {
      secondIndex = index;
      lockFlip = true;
      renderGame();

      const firstCard = cards[firstIndex];
      const secondCard = cards[secondIndex];

      setTimeout(() => {
        if (firstCard.face === secondCard.face) {
          firstCard.matched = true;
          secondCard.matched = true;
          matchedPairs++;
          score += 100;
          if (matchedPairs === 16) {
            // all pairs found
            endGame(true);
            return;
          }
        }
        firstIndex = null;
        secondIndex = null;
        lockFlip = false;
        renderGame();
      }, 700);
    }
  }

  function endGame(allMatched) {
    state = "finished";
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    stopAllAudio();  // 👈 stop game audio when game is over
    let bonus = 0;
    if (allMatched && timeLeftMs > 0) {
      // 100 points per 0.5 seconds remaining
      const units = Math.floor(timeLeftMs / 500);
      bonus = units * 100;
      score += bonus;
    }

    renderSummary(allMatched, bonus);
  }

  function renderSummary(allMatched, bonus) {
    const wrap = el("div", "mpg-wrap");
    const card = el("div", "mpg-card");

     playRandomLeaderTrack();   // 👈 new: music for leaderboard view

    const header = el("div", "mpg-header");
    header.appendChild(el("h2", "mpg-title", "Game over"));
    card.appendChild(header);

    const result = allMatched
      ? "You found all 16 pairs!"
      : "Time’s up! You didn’t find all the pairs this time.";
    card.appendChild(el("p", "mpg-sub", result));

    const details = el(
      "p",
      "mpg-sub",
      `Pairs matched: ${matchedPairs} / 16 · Base score: ${
        matchedPairs * 100
      }`
    );
    card.appendChild(details);

    if (bonus > 0) {
      card.appendChild(
        el(
          "p",
          "mpg-sub",
          `Bonus for finishing early: +${bonus} points (time left: ${formatTime(
            timeLeftMs
          )})`
        )
      );
    }

    card.appendChild(el("p", "mpg-sub", `Final score: ${score}`));

    // Initials input
    const row = el("div", "mpg-input-row");
    const label = el(
      "label",
      "",
      "Enter up to 3 initials to save your score (e.g. ABC):"
    );
    const input = document.createElement("input");
    input.maxLength = 3;
    input.placeholder = "ABC";
    input.value = playerInitials || "";
    row.appendChild(label);
    row.appendChild(input);
    card.appendChild(row);

    const actions = el("div", "mpg-actions");
    const saveBtn = el("button", "mpg-btn", "Save my score");
    const skipBtn = el(
      "button",
      "mpg-btn secondary",
      "Skip saving / play again"
    );

    saveBtn.onclick = async () => {
      const initials = (input.value || "").toUpperCase();
      playerInitials = initials;
      saveBtn.disabled = true;
      try {
        const res = await fetch(cfg.rest.submit, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            initials,
            score,
            time_left_ms: timeLeftMs,
            matched_pairs: matchedPairs,
          }),
        });
        const j = await res.json();
        if (!j || !j.ok) {
          alert("Could not save score: " + (j && j.error ? j.error : "error"));
          saveBtn.disabled = false;
          return;
        }
        lastSubmitId = j.id;
        playerInitials = j.initials || initials;
        renderPersonalScores();
      } catch (e) {
        alert("Could not save score: " + e.message);
        saveBtn.disabled = false;
      }
    };

    skipBtn.onclick = resetGame;

    actions.appendChild(skipBtn);
    actions.appendChild(saveBtn);
    card.appendChild(actions);

    wrap.appendChild(card);
    root.replaceChildren(wrap);
  }
  

  // ---------- Personal rankings ----------

  async function renderPersonalScores() {
    state = "personal";

   
    const wrap = el("div", "mpg-wrap");
    const card = el("div", "mpg-card");

    const header = el("div", "mpg-header");
    header.appendChild(el("h2", "mpg-title", "Your top scores"));
    card.appendChild(header);

    const sub = el(
      "p",
      "mpg-sub",
      playerInitials
        ? `These are the best scores we have saved with initials "${playerInitials}".`
        : "No initials entered; showing nothing saved yet."
    );
    card.appendChild(sub);

    const table = el("table", "mpg-scores-table");
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    ["Rank", "Score", "Initials"].forEach((h) => {
      const th = document.createElement("th");
      th.textContent = h;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    if (!playerInitials) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 3;
      td.textContent = "No scores saved yet for this session.";
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      try {
        const res = await fetch(
          cfg.rest.personal +
            "?initials=" +
            encodeURIComponent(playerInitials)
        );
        const j = await res.json();
        const scores = (j && j.scores) || [];

        if (!scores.length) {
          const tr = document.createElement("tr");
          const td = document.createElement("td");
          td.colSpan = 3;
          td.textContent = "No scores found yet for those initials.";
          tr.appendChild(td);
          tbody.appendChild(tr);
        } else {
          scores.forEach((row, idx) => {
            const tr = document.createElement("tr");
            const tdRank = document.createElement("td");
            tdRank.textContent = String(idx + 1);
            const tdScore = document.createElement("td");
            tdScore.textContent = row.score;
            const tdInit = document.createElement("td");
            tdInit.textContent = row.initials || "";
            tr.append(tdRank, tdScore, tdInit);
            tbody.appendChild(tr);
          });
        }
      } catch (e) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 3;
        td.textContent = "Error loading scores: " + e.message;
        tr.appendChild(td);
        tbody.appendChild(tr);
      }
    }

    table.appendChild(tbody);
    card.appendChild(table);

    const footerNote = el(
      "div",
      "mpg-footer-note",
      "Only the top 5 scores for your initials are shown here."
    );
    card.appendChild(footerNote);

    const actions = el("div", "mpg-actions");
    const playBtn = el("button", "mpg-btn secondary", "Play again");
    playBtn.onclick = resetGame;

    const globalBtn = el("button", "mpg-btn", "View global rankings");
    globalBtn.onclick = renderGlobalScores;

    actions.appendChild(playBtn);
    actions.appendChild(globalBtn);
    card.appendChild(actions);

    wrap.appendChild(card);
    root.replaceChildren(wrap);
  }

  // ---------- Global rankings ----------

  async function renderGlobalScores() {
    state = "global";
     
    const wrap = el("div", "mpg-wrap");
    const card = el("div", "mpg-card");

    const header = el("div", "mpg-header");
    header.appendChild(el("h2", "mpg-title", "Global rankings"));
    card.appendChild(header);

    const sub = el(
      "p",
      "mpg-sub",
      "These are the top scores from everyone who has played on this site."
    );
    card.appendChild(sub);

    const scrollBox = el("div", "mpg-scroll-box");

    const table = el("table", "mpg-scores-table");
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    ["Rank", "Score", "Initials"].forEach((h) => {
      const th = document.createElement("th");
      th.textContent = h;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    let highlightIndex = -1;

    try {
      const res = await fetch(
        cfg.rest.global +
          (playerInitials
            ? "?initials=" + encodeURIComponent(playerInitials)
            : "")
      );
      const j = await res.json();
      const scores = (j && j.scores) || [];
      highlightIndex =
        typeof j.highlightIndex === "number" ? j.highlightIndex : -1;

      if (!scores.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 3;
        td.textContent = "No scores recorded yet.";
        tr.appendChild(td);
        tbody.appendChild(tr);
      } else {
        scores.forEach((row, idx) => {
          const tr = document.createElement("tr");
          if (idx === highlightIndex) tr.classList.add("mpg-highlight-row");

          const tdRank = document.createElement("td");
          tdRank.textContent = String(idx + 1);
          const tdScore = document.createElement("td");
          tdScore.textContent = row.score;
          const tdInit = document.createElement("td");
          tdInit.textContent = row.initials || "";
          tr.append(tdRank, tdScore, tdInit);
          tbody.appendChild(tr);
        });
      }
    } catch (e) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 3;
      td.textContent = "Error loading global scores: " + e.message;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    scrollBox.appendChild(table);
    card.appendChild(scrollBox);

    const footer = el(
      "div",
      "mpg-footer-note",
      "The list opens at the top scores. If your best score is not in the top 5, we scroll to it automatically."
    );
    card.appendChild(footer);

    const actions = el("div", "mpg-actions");
    const playBtn = el("button", "mpg-btn secondary", "Play again");
    playBtn.onclick = resetGame;

    const nextBtn = el("button", "mpg-btn mpg-disabled-btn", "Next activity");
    // cfg.nextUrl is empty for now – button intentionally disabled
    actions.appendChild(playBtn);
    actions.appendChild(nextBtn);
    card.appendChild(actions);

    wrap.appendChild(card);
    root.replaceChildren(wrap);

    // Auto-scroll to highlighted row if it's beyond top 5
    if (highlightIndex > 4) {
      const rows = tbody.querySelectorAll("tr");
      if (rows[highlightIndex]) {
        rows[highlightIndex].scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }

  // ---------- Start ----------

  resetGame();
})();
