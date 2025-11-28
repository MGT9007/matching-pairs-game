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

  // Build full URLs based on your plugin's assetsBase path
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
    }, ROUND_DURATION_MS + 500);
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

  // =====================================
  // ROUND CONFIGURATION
  // =====================================
  const ROUNDS = [
    { round: 1, pairs: 4, cards: 8 },    // Round 1: 4 pairs (8 cards)
    { round: 2, pairs: 8, cards: 16 },   // Round 2: 8 pairs (16 cards)
    { round: 3, pairs: 10, cards: 20 },  // Round 3: 10 pairs (20 cards)
    { round: 4, pairs: 12, cards: 24 },  // Round 4: 12 pairs (24 cards)
    { round: 5, pairs: 14, cards: 28 },  // Round 5: 14 pairs (28 cards)
    { round: 6, pairs: 16, cards: 32 },  // Round 6: 16 pairs (32 cards)
  ];

  const ROUND_DURATION_MS = 60000; // 60 seconds per round
  const PRE_COUNTDOWN_MS = 3000; // 3 seconds
 
  let state = "intro"; // intro | countdown | playing | round_complete | finished | personal | global | timesup
  let imagesPreloaded = false;
  let currentRound = 0; // 0-indexed (0 = Round 1, 1 = Round 2, 2 = Round 3)
  let totalScore = 0;
  let totalMatchedPairs = 0;
  
  let cards = [];
  let firstIndex = null;
  let secondIndex = null;
  let lockFlip = false;
  let matchedPairs = 0;
  let roundScore = 0;
  let timerStart = 0;
  let timerInterval = null;
  let timeLeftMs = ROUND_DURATION_MS;

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

  function preloadImages() {
    return new Promise((resolve) => {
      if (imagesPreloaded) {
        resolve();
        return;
      }

      let loaded = 0;
      const total = CARD_IMAGES.length;

      if (total === 0) {
        imagesPreloaded = true;
        resolve();
        return;
      }

      CARD_IMAGES.forEach((src) => {
        const img = new Image();
        img.onload = img.onerror = () => {
          loaded++;
          if (loaded === total) {
            imagesPreloaded = true;
            resolve();
          }
        };
        img.src = src;
      });
    });
  }

  function createDeck(pairCount) {
    const deck = [];
    for (let i = 0; i < pairCount; i++) {
      const face = CARD_IMAGES[i % CARD_IMAGES.length];
      deck.push({ id: i * 2, face: face, matched: false });
      deck.push({ id: i * 2 + 1, face: face, matched: false });
    }
    return shuffle(deck);
  }

  function resetGame() {
    state = "intro";
    currentRound = 0;
    totalScore = 0;
    totalMatchedPairs = 0;
    cards = [];
    firstIndex = null;
    secondIndex = null;
    lockFlip = false;
    matchedPairs = 0;
    roundScore = 0;
    timerStart = 0;
    timeLeftMs = ROUND_DURATION_MS;
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    stopAllAudio();
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
    header.appendChild(el("h2", "mpg-title", "Matching Pairs - 6 Round Challenge"));

    card.appendChild(header);
    card.appendChild(
      el(
        "p",
        "mpg-sub",
        "Progress through 6 rounds of increasing difficulty. You have 1 minute per round!"
      )
    );

    const info = el("p", "mpg-sub");
    info.innerHTML =
      "<strong>Round 1:</strong> 4 pairs (8 cards)<br>" +
      "<strong>Round 2:</strong> 8 pairs (16 cards)<br>" +
      "<strong>Round 3:</strong> 10 pairs (20 cards)<br>" +
      "<strong>Round 4:</strong> 12 pairs (24 cards)<br>" +
      "<strong>Round 5:</strong> 14 pairs (28 cards)<br>" +
      "<strong>Round 6:</strong> 16 pairs (32 cards)<br><br>" +
      "Match pairs to earn <strong>100 points per pair</strong>. " +
      "Finish with time left to get <strong>100 bonus points per 0.5 seconds</strong> remaining.<br><br>" +
      "If you run out of time, your game ends and you can save your score!";
    card.appendChild(info);

    const actions = el("div", "mpg-actions");
    const btn = el("button", "mpg-btn", "Start Round 1");
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = "Loading...";
      await preloadImages();
      startCountdown();
    };
    actions.appendChild(btn);

    card.appendChild(actions);
    wrap.appendChild(card);
    root.replaceChildren(wrap);
  }

  function startCountdown() {
    state = "countdown";
    const roundConfig = ROUNDS[currentRound];
    const wrap = el("div", "mpg-wrap");
    const card = el("div", "mpg-card");
    const header = el("div", "mpg-header");
    header.appendChild(el("h2", "mpg-title", `Round ${roundConfig.round} - Get ready...`));
    card.appendChild(header);
    const countdownText = el("p", "mpg-sub", "Starting in 3...");
    card.appendChild(countdownText);

    const info = el("p", "mpg-sub");
    info.innerHTML = `Find <strong>${roundConfig.pairs} pairs</strong> in 1 minute!`;
    card.appendChild(info);

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
        startRound();
      }
    }, step);
  }

  function startRound() {
    state = "playing";
    const roundConfig = ROUNDS[currentRound];
    cards = createDeck(roundConfig.pairs);
    firstIndex = null;
    secondIndex = null;
    lockFlip = false;
    matchedPairs = 0;
    roundScore = 0;
    timerStart = Date.now();
    timeLeftMs = ROUND_DURATION_MS;

    playRandomGameTrack();

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      const elapsed = Date.now() - timerStart;
      timeLeftMs = Math.max(0, ROUND_DURATION_MS - elapsed);
      if (timeLeftMs <= 0) {
        clearInterval(timerInterval);
        timerInterval = null;
        endGame(false); // Time ran out
      } else {
        renderGame();
      }
    }, 100);

    renderGame();
  }

  function formatTime(ms) {
    const s = Math.max(0, ms) / 1000;
    const whole = Math.floor(s);
    const frac = Math.floor((s - whole) * 10);
    return `${whole}.${frac}s`;
  }

  function renderGame() {
    const roundConfig = ROUNDS[currentRound];
    const wrap = el("div", "mpg-wrap");
    const card = el("div", "mpg-card");

    const header = el("div", "mpg-header");
    header.appendChild(el("h2", "mpg-title", `Round ${roundConfig.round}`));
    card.appendChild(header);

    const stats = el("div", "mpg-stats");
    stats.innerHTML = `
      <span>⏱️ Time: <strong>${formatTime(timeLeftMs)}</strong></span>
      <span>🎯 Matched: <strong>${matchedPairs}/${roundConfig.pairs}</strong></span>
      <span>💯 Round Score: <strong>${roundScore}</strong></span>
      <span>📊 Total Score: <strong>${totalScore + roundScore}</strong></span>
    `;
    card.appendChild(stats);

    const grid = el("div", "mpg-grid");
    
    // Set grid class based on card count for responsive layouts
    if (cards.length === 8) {
      grid.classList.add("mpg-grid-8"); // 4x2
    } else if (cards.length === 16) {
      grid.classList.add("mpg-grid-16"); // 4x4
    } else if (cards.length === 20) {
      grid.classList.add("mpg-grid-20"); // 5x4 desktop, 4x5 mobile
    } else if (cards.length === 24) {
      grid.classList.add("mpg-grid-24"); // 6x4 desktop, 4x6 mobile
    } else if (cards.length === 28) {
      grid.classList.add("mpg-grid-28"); // 4x7
    } else if (cards.length === 32) {
      grid.classList.add("mpg-grid-32"); // 8x4 desktop, 4x8 mobile
    }

    cards.forEach((c, i) => {
      const tile = el("div", "mpg-card-tile");
      tile.dataset.index = i;

      if (c.matched) {
        tile.classList.add("matched");
        tile.classList.add("disabled");
        const img = document.createElement("img");
        img.src = c.face;
        img.alt = "Matched card";
        tile.appendChild(img);
      } else if (i === firstIndex || i === secondIndex) {
        tile.classList.add("face-up");
        const img = document.createElement("img");
        img.src = c.face;
        img.alt = "Card face";
        tile.appendChild(img);
      } else {
        tile.classList.add("face-down");
      }

      if (lockFlip) {
        tile.classList.add("disabled");
      }

      grid.appendChild(tile);
    });

    // Use event delegation with pointerdown for better touch/click reliability
    grid.addEventListener(
      "pointerdown",
      (event) => {
        const tile = event.target.closest(".mpg-card-tile");
        if (!tile) return;
        if (tile.classList.contains("disabled")) return;
        const index = parseInt(tile.dataset.index, 10);
        if (Number.isNaN(index)) return;
        handleFlip(index);
      },
      false
    );

    card.appendChild(grid);
    wrap.appendChild(card);
    root.replaceChildren(wrap);
  }

  function handleFlip(index) {
    if (lockFlip || cards[index].matched) return;
    if (index === firstIndex) return;

    if (firstIndex === null) {
      firstIndex = index;
      renderGame();
    } else {
      secondIndex = index;
      lockFlip = true;
      renderGame();

      setTimeout(() => {
        checkMatch();
      }, 800);
    }
  }

  function checkMatch() {
    const c1 = cards[firstIndex];
    const c2 = cards[secondIndex];

    if (c1.face === c2.face) {
      c1.matched = true;
      c2.matched = true;
      matchedPairs++;
      roundScore += 100;

      const roundConfig = ROUNDS[currentRound];
      if (matchedPairs === roundConfig.pairs) {
        clearInterval(timerInterval);
        timerInterval = null;
        completeRound();
      }
    }

    firstIndex = null;
    secondIndex = null;
    lockFlip = false;
    renderGame();
  }

  function completeRound() {
    // Stop timer and audio immediately
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    stopAllAudio();
    
    // Add time bonus for this round
    const timeBonus = Math.floor(timeLeftMs / 500) * 100;
    roundScore += timeBonus;
    totalScore += roundScore;
    totalMatchedPairs += matchedPairs;

    const roundConfig = ROUNDS[currentRound];
    
    // Check if there's another round
    if (currentRound < ROUNDS.length - 1) {
      state = "round_complete";
      // Use setTimeout to ensure state updates before rendering
      setTimeout(() => {
        renderRoundComplete();
      }, 100);
    } else {
      // Final round completed
      state = "finished";
      setTimeout(() => {
        endGame(true);
      }, 100);
    }
  }

  function renderRoundComplete() {
    const roundConfig = ROUNDS[currentRound];
    const wrap = el("div", "mpg-wrap");
    const card = el("div", "mpg-card");

    const header = el("div", "mpg-header");
    header.appendChild(el("h2", "mpg-title", `Round ${roundConfig.round} Complete! 🎉`));
    card.appendChild(header);

    const stats = el("div", "mpg-sub");
    const timeBonus = Math.floor(timeLeftMs / 500) * 100;
    stats.innerHTML = `
      <strong>Round ${roundConfig.round} Score:</strong><br>
      Pairs matched: ${matchedPairs} × 100 = ${matchedPairs * 100} points<br>
      Time bonus: ${formatTime(timeLeftMs)} = ${timeBonus} points<br>
      <strong>Round Total: ${roundScore} points</strong><br><br>
      <strong>Total Score: ${totalScore} points</strong>
    `;
    card.appendChild(stats);

    const actions = el("div", "mpg-actions");
    const nextBtn = el("button", "mpg-btn", `Continue to Round ${ROUNDS[currentRound + 1].round}`);
    nextBtn.onclick = () => {
      currentRound++;
      startCountdown();
    };
    actions.appendChild(nextBtn);

    card.appendChild(actions);
    wrap.appendChild(card);
    root.replaceChildren(wrap);
  }

  function endGame(completed) {
    stopAllAudio();
    state = "finished";

    if (!completed) {
      // Time ran out - calculate score for partially completed round
      const timeBonus = Math.floor(timeLeftMs / 500) * 100;
      roundScore += timeBonus;
      totalScore += roundScore;
      totalMatchedPairs += matchedPairs;
    }

    const finalRound = currentRound + 1; // Convert to 1-indexed for display
    
    // Show modal if time ran out
    if (!completed) {
      renderTimesUpModal(finalRound);
    } else {
      renderFinished(finalRound, completed);
    }
  }

  function renderTimesUpModal(finalRound) {
    const wrap = el("div", "mpg-wrap");
    
    // Create modal overlay
    const overlay = el("div", "mpg-modal-overlay");
    const modal = el("div", "mpg-modal");
    
    const title = el("h2", "mpg-modal-title", "⏰ Time's Up!");
    modal.appendChild(title);
    
    const message = el("p", "mpg-modal-text", `You completed Round ${finalRound} before time ran out.`);
    modal.appendChild(message);
    
    const scoreInfo = el("p", "mpg-modal-score");
    scoreInfo.innerHTML = `<strong>Your Score: ${totalScore} points</strong>`;
    modal.appendChild(scoreInfo);
    
    const btnContainer = el("div", "mpg-modal-actions");
    const okBtn = el("button", "mpg-btn", "OK");
    okBtn.onclick = () => {
      renderFinished(finalRound, false);
    };
    btnContainer.appendChild(okBtn);
    modal.appendChild(btnContainer);
    
    overlay.appendChild(modal);
    wrap.appendChild(overlay);
    root.replaceChildren(wrap);
  }

  function renderFinished(finalRound, completed) {
    const wrap = el("div", "mpg-wrap");
    const card = el("div", "mpg-card");

    const header = el("div", "mpg-header");
    const title = completed 
      ? "🏆 All Rounds Complete!"
      : `⏰ Time's Up - Round ${finalRound}`;
    header.appendChild(el("h2", "mpg-title", title));
    card.appendChild(header);

    const message = completed
      ? "Congratulations! You completed all 3 rounds!"
      : `You reached Round ${finalRound} before time ran out.`;
    
    card.appendChild(el("p", "mpg-sub", message));

    const stats = el("div", "mpg-sub");
    stats.innerHTML = `
      <strong>Final Stats:</strong><br>
      Round reached: ${finalRound}<br>
      Total pairs matched: ${totalMatchedPairs}<br>
      <strong>Final Score: ${totalScore} points</strong>
    `;
    card.appendChild(stats);

    const row = el("div", "mpg-input-row");
    const label = el(
      "label",
      "",
      "Enter up to 5 characters to save your score (letters, numbers, or spaces):"
    );
    const input = document.createElement("input");
    input.maxLength = 5;
    input.placeholder = "ABC12";
    input.value = playerInitials || "";
    
    const errorMsg = el("div", "mpg-error-msg", "");
    errorMsg.style.color = "#d32f2f";
    errorMsg.style.fontSize = "13px";
    errorMsg.style.marginTop = "4px";
    errorMsg.style.display = "none";
    
    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(errorMsg);
    card.appendChild(row);

    const actions = el("div", "mpg-actions");
    const saveBtn = el("button", "mpg-btn", "Save my score");
    const skipBtn = el(
      "button",
      "mpg-btn secondary",
      "Skip saving / play again"
    );

    saveBtn.onclick = async () => {
      const initials = (input.value || "").trim();
      
      // Validate on client side first
      if (!initials) {
        errorMsg.textContent = "Please enter at least one character.";
        errorMsg.style.display = "block";
        return;
      }

      saveBtn.disabled = true;
      errorMsg.style.display = "none";

      try {
        // Check initials with server
        const checkRes = await fetch(cfg.rest.checkInitials, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initials }),
        });
        const checkData = await checkRes.json();

        if (!checkData.ok) {
          errorMsg.textContent = checkData.message || "Invalid initials. Please try again.";
          errorMsg.style.display = "block";
          saveBtn.disabled = false;
          return;
        }

        // Submit score
        const submitRes = await fetch(cfg.rest.submit, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            initials: checkData.initials,
            score: totalScore,
            time_left_ms: timeLeftMs,
            matched_pairs: totalMatchedPairs,
            round_reached: finalRound,
          }),
        });
        const submitData = await submitRes.json();

        if (!submitData || !submitData.ok) {
          errorMsg.textContent = "Could not save score: " + (submitData && submitData.error ? submitData.error : "error");
          errorMsg.style.display = "block";
          saveBtn.disabled = false;
          return;
        }

        lastSubmitId = submitData.id;
        playerInitials = submitData.initials || checkData.initials;
        renderPersonalScores();
      } catch (e) {
        errorMsg.textContent = "Could not save score: " + e.message;
        errorMsg.style.display = "block";
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
    ["Rank", "Score", "Round", "Initials"].forEach((h) => {
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
      td.colSpan = 4;
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
          td.colSpan = 4;
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
            const tdRound = document.createElement("td");
            tdRound.textContent = row.round_reached || "1";
            const tdInit = document.createElement("td");
            tdInit.textContent = row.initials || "";
            tr.append(tdRank, tdScore, tdRound, tdInit);
            tbody.appendChild(tr);
          });
        }
      } catch (e) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 4;
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
    ["Rank", "Score", "Round", "Initials"].forEach((h) => {
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
        td.colSpan = 4;
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
          const tdRound = document.createElement("td");
          tdRound.textContent = row.round_reached || "1";
          const tdInit = document.createElement("td");
          tdInit.textContent = row.initials || "";
          tr.append(tdRank, tdScore, tdRound, tdInit);
          tbody.appendChild(tr);
        });
      }
    } catch (e) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 4;
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