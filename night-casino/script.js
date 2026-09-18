// ============================================================
// NIGHT CASINO — script.js
// Jogo fictício em localStorage. Sem backend, sem dinheiro real.
// ============================================================

const STORAGE_USERS = "nightCasinoUsers";
const STORAGE_CURRENT = "nightCasinoCurrentUser";

const BET_OPTIONS = [2, 5, 10, 20, 50];
const DEFAULT_BET = 10;
const DAILY_BONUS_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_HISTORY = 6;

// ============================================================
// ECONOMIA — duas moedas
// 🪙 Moedas: usadas para apostar nos jogos.
// 💎 Gemas: só se ganham no bónus diário; trocam-se por moedas.
// ============================================================
const ECONOMY = {
    dailyBonusGems: 200,   // gemas recebidas por cada bónus diário
    gemsPerExchange: 2000, // gemas necessárias por cada troca
    coinsPerExchange: 2,   // moedas recebidas por cada troca
};

// ============================================================
// CONFIGURAÇÃO DE PROBABILIDADES
// Ajusta aqui para tornar os jogos mais ou menos generosos.
// ============================================================
const GAME_CONFIG = {
    // Mais símbolos = menos coincidências = prémios mais raros.
    // Com 10 símbolos: par ≈ 28% das rondas, trio (jackpot) ≈ 1%.
    slotsSymbols: ["🍒", "🍋", "🍊", "🍇", "🍉", "🔔", "⭐", "🍀", "💎", "7️⃣"],

    // Hipótese de acertares no número que escolheste (mais baixa que o 1/6 "justo").
    diceWinChance: 0.12,

    // Hipótese de a roleta calhar na cor que escolheste.
    rouletteWinChance: 0.28,
};

// ============================================================
// PRÉMIOS — quanto se ganha em relação à aposta
// ============================================================
const PAYOUTS = {
    slotsPair: 1.5,   // dois símbolos iguais
    slotsJackpot: 5,  // três símbolos iguais
    dice: 4,          // acertar no número escolhido
    roulette: 2,      // acertar na cor escolhida
};

let currentBet = DEFAULT_BET;
let currentCurrency = "coins"; // "coins" ou "gems" — em que moeda se está a apostar
let selectedDiceNumber = 6;
let selectedRouletteColor = "red";


// ============================================================
// STORAGE — leitura/escrita protegidas (localStorage pode falhar
// em modo privado, quota cheia, etc.)
// ============================================================

function safeGet(key) {
    try {
        return localStorage.getItem(key);
    } catch (err) {
        console.error("Falha ao ler localStorage:", err);
        return null;
    }
}

function safeSet(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (err) {
        console.error("Falha ao escrever localStorage:", err);
        return false;
    }
}

function getUsers() {
    const raw = safeGet(STORAGE_USERS);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        console.error("Dados de utilizadores corrompidos:", err);
        return [];
    }
}

function saveUsers(users) {
    safeSet(STORAGE_USERS, JSON.stringify(users));
}


// ============================================================
// SEGURANÇA LIGEIRA
// Isto NÃO é criptografia real — é apenas uma ofuscação simples
// (hash não-reversível básico) para não guardar passwords em
// texto puro. Adequado só para este projeto de brincar, nunca
// para dados sensíveis a sério.
// ============================================================

function simpleHash(text) {
    let hash = 5381;
    for (let i = 0; i < text.length; i++) {
        hash = (hash * 33) ^ text.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
}

function hashPassword(username, password) {
    return simpleHash(username.toLowerCase() + ":" + password);
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}


// ============================================================
// UTILIZADOR ATUAL
// ============================================================

function getCurrentUsername() {
    return safeGet(STORAGE_CURRENT);
}

function setCurrentUsername(username) {
    safeSet(STORAGE_CURRENT, username);
}

function clearCurrentUsername() {
    try {
        localStorage.removeItem(STORAGE_CURRENT);
    } catch (err) {
        console.error(err);
    }
}

function normalizeUser(user) {
    if (!user) return user;
    if (typeof user.coins !== "number") user.coins = 0;
    if (typeof user.gems !== "number") user.gems = 0;
    if (!Array.isArray(user.history)) user.history = [];
    if (typeof user.lastBonusClaim !== "number") user.lastBonusClaim = 0;
    return user;
}

function findUserByName(username) {
    const users = getUsers();
    const user = users.find(
        (u) => u.username.toLowerCase() === username.toLowerCase()
    );
    return user ? normalizeUser(user) : null;
}

function findCurrentUser() {
    const username = getCurrentUsername();
    if (!username) return null;
    return findUserByName(username);
}

function persistUser(updatedUser) {
    const users = getUsers();
    const index = users.findIndex((u) => u.username === updatedUser.username);
    if (index === -1) return;
    users[index] = updatedUser;
    saveUsers(users);
}


// ============================================================
// MENSAGENS / FEEDBACK
// ============================================================

function showMessage(element, text, type) {
    if (!element) return;
    element.textContent = text;
    element.style.color = type === "error" ? "#ff5555" : "#d4af37";
}

function setButtonLoading(button, loading, loadingText) {
    if (!button) return;
    if (loading) {
        button.dataset.originalText = button.textContent;
        button.textContent = loadingText || "A processar...";
        button.disabled = true;
    } else {
        button.textContent = button.dataset.originalText || button.textContent;
        button.disabled = false;
    }
}


// ============================================================
// VALIDAÇÃO
// ============================================================

function validateCredentials(username, password) {
    if (!username || !password) {
        return "Preenche o username e a password.";
    }
    if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) {
        return "O username deve ter 3 a 16 caracteres (letras, números, _).";
    }
    if (password.length < 4) {
        return "A password deve ter pelo menos 4 caracteres.";
    }
    return null;
}


// ============================================================
// REGISTAR
// ============================================================

function register() {
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const message = document.getElementById("message");
    const registerButton = document.getElementById("registerButton");

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    const error = validateCredentials(username, password);
    if (error) {
        showMessage(message, error, "error");
        return;
    }

    if (findUserByName(username)) {
        showMessage(message, "Esse username já existe.", "error");
        return;
    }

    setButtonLoading(registerButton, true, "A criar conta...");

    setTimeout(() => {
        const users = getUsers();

        const newUser = {
            username: username,
            passwordHash: hashPassword(username, password),
            coins: 0,
            gems: 0,
            history: [],
            lastBonusClaim: 0,
        };

        users.push(newUser);
        saveUsers(users);
        setCurrentUsername(newUser.username);

        setButtonLoading(registerButton, false);
        showMessage(message, "Conta criada! Reclama o bónus diário para começares a jogar. A entrar...", "success");

        setTimeout(() => {
            window.location.href = "casino.html";
        }, 600);
    }, 400);
}


// ============================================================
// LOGIN
// ============================================================

function login() {
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const message = document.getElementById("message");
    const loginButton = document.getElementById("loginButton");

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
        showMessage(message, "Preenche o username e a password.", "error");
        return;
    }

    setButtonLoading(loginButton, true, "A entrar...");

    setTimeout(() => {
        const user = findUserByName(username);
        const hash = hashPassword(username, password);

        // Compatibilidade com contas antigas guardadas com password em texto puro
        const passwordMatches =
            user && (user.passwordHash === hash || user.password === password);

        if (user && passwordMatches) {
            setCurrentUsername(user.username);
            window.location.href = "casino.html";
            return;
        }

        setButtonLoading(loginButton, false);
        showMessage(message, "Username ou password incorretos.", "error");
    }, 300);
}


// ============================================================
// PASSWORD VISÍVEL
// ============================================================

function togglePasswordVisibility() {
    const passwordInput = document.getElementById("password");
    const toggleButton = document.getElementById("togglePassword");
    if (!passwordInput || !toggleButton) return;

    const isHidden = passwordInput.type === "password";
    passwordInput.type = isHidden ? "text" : "password";
    toggleButton.textContent = isHidden ? "🙈" : "👁️";
}


// ============================================================
// SAIR
// ============================================================

function logout() {
    clearCurrentUsername();
    window.location.href = "index.html";
}


// ============================================================
// SALDO NA INTERFACE
// ============================================================

function renderBalances(user) {
    const targets = [
        { el: document.getElementById("headerCoins"), value: user.coins, cls: "coin-pulse" },
        { el: document.getElementById("balanceCoins"), value: user.coins, cls: "coin-pulse" },
        { el: document.getElementById("headerGems"), value: user.gems, cls: "gem-pulse" },
        { el: document.getElementById("balanceGems"), value: user.gems, cls: "gem-pulse" },
    ];

    targets.forEach(({ el, value, cls }) => {
        if (!el) return;
        el.textContent = value;
        el.classList.remove(cls);
        // força reflow para reiniciar a animação
        void el.offsetWidth;
        el.classList.add(cls);
    });
}

function updateBalancesDisplay() {
    const user = findCurrentUser();
    if (!user) return;
    renderBalances(user);
}


// ============================================================
// CARREGAR UTILIZADOR / PROTEGER PÁGINAS
// ============================================================

function loadUser() {
    const user = findCurrentUser();
    const isProtectedPage =
        window.location.pathname.includes("casino.html") ||
        window.location.pathname.includes("ranking.html");

    if (!user) {
        if (isProtectedPage) {
            window.location.href = "index.html";
        }
        return;
    }

    const headerUsername = document.getElementById("headerUsername");
    const welcomeUsername = document.getElementById("welcomeUsername");

    if (headerUsername) headerUsername.textContent = user.username;
    if (welcomeUsername) welcomeUsername.textContent = user.username;

    renderBalances(user);
    renderHistory(user);
    renderDailyBonus(user);
    renderExchangeButton(user);
}


// ============================================================
// MOEDA DA APOSTA (moedas 🪙 ou gemas 💎)
// ============================================================

function initCurrencySelector() {
    const container = document.getElementById("currencySelector");
    if (!container) return;

    container.querySelectorAll(".currency-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
            currentCurrency = chip.dataset.currency;

            container
                .querySelectorAll(".currency-chip")
                .forEach((c) => c.classList.remove("active"));
            chip.classList.add("active");

            updateBetLabels();
        });
    });
}


// ============================================================
// SELETOR DE APOSTA
// ============================================================

function initBetSelector() {
    const container = document.getElementById("betSelector");
    if (!container) return;

    container.querySelectorAll(".bet-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
            currentBet = Number(chip.dataset.bet);

            container
                .querySelectorAll(".bet-chip")
                .forEach((c) => c.classList.remove("active"));
            chip.classList.add("active");

            updateBetLabels();
        });
    });

    updateBetLabels();
}

function updateBetLabels() {
    const icon = currentCurrency === "gems" ? "💎" : "🪙";
    document.querySelectorAll("[data-bet-label]").forEach((el) => {
        el.textContent = "APOSTA: " + icon + " " + currentBet;
    });
}


// ============================================================
// ESCOLHA DO NÚMERO (DADOS)
// ============================================================

function initDicePicker() {
    const container = document.getElementById("dicePicker");
    if (!container) return;

    container.querySelectorAll(".number-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
            selectedDiceNumber = Number(chip.dataset.number);

            container
                .querySelectorAll(".number-chip")
                .forEach((c) => c.classList.remove("active"));
            chip.classList.add("active");
        });
    });
}


// ============================================================
// ESCOLHA DA COR (ROLETA)
// ============================================================

function initRoulettePicker() {
    const container = document.getElementById("roulettePicker");
    if (!container) return;

    container.querySelectorAll(".color-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
            selectedRouletteColor = chip.dataset.color;

            container
                .querySelectorAll(".color-chip")
                .forEach((c) => c.classList.remove("active"));
            chip.classList.add("active");
        });
    });
}


// ============================================================
// RESULTADO DE JOGO
// ============================================================

function renderResult(title, text, outcome) {
    const result = document.getElementById("gameResult");
    if (!result) return;

    result.innerHTML =
        '<h2 class="result-title result-' + outcome + '">' +
        title +
        "</h2><p>" +
        text +
        "</p>";
}

function addHistoryEntry(user, entry) {
    if (!Array.isArray(user.history)) user.history = [];
    user.history.unshift(entry);
    user.history = user.history.slice(0, MAX_HISTORY);
}

function renderHistory(user) {
    const list = document.getElementById("historyList");
    if (!list) return;

    const history = user.history || [];

    if (history.length === 0) {
        list.innerHTML = '<li class="history-empty">Ainda não jogaste nenhuma ronda.</li>';
        return;
    }

    list.innerHTML = history
        .map((entry) => {
            const sign = entry.amount >= 0 ? "+" : "";
            const cls = entry.amount >= 0 ? "history-win" : "history-loss";
            const currencyIcon = entry.currency === "gems" ? "💎" : "🪙";
            return (
                '<li class="history-item">' +
                '<span>' + entry.icon + " " + escapeHtml(entry.game) + "</span>" +
                '<span class="' + cls + '">' + sign + entry.amount + " " + currencyIcon + "</span>" +
                "</li>"
            );
        })
        .join("");
}


// ============================================================
// BÓNUS DIÁRIO
// ============================================================

function renderDailyBonus(user) {
    const button = document.getElementById("dailyBonusButton");
    if (!button) return;

    const elapsed = Date.now() - (user.lastBonusClaim || 0);
    const remaining = DAILY_BONUS_COOLDOWN_MS - elapsed;

    if (remaining <= 0) {
        button.disabled = false;
        button.textContent = "🎁 Reclamar bónus diário (+" + ECONOMY.dailyBonusGems + " 💎)";
    } else {
        button.disabled = true;
        const hours = Math.ceil(remaining / (60 * 60 * 1000));
        button.textContent = "🎁 Bónus disponível daqui a " + hours + "h";
    }
}

function claimDailyBonus() {
    const user = findCurrentUser();
    if (!user) return;

    const elapsed = Date.now() - (user.lastBonusClaim || 0);
    if (elapsed < DAILY_BONUS_COOLDOWN_MS) return;

    user.gems += ECONOMY.dailyBonusGems;
    user.lastBonusClaim = Date.now();
    addHistoryEntry(user, {
        game: "Bónus diário",
        icon: "🎁",
        amount: ECONOMY.dailyBonusGems,
        currency: "gems",
    });

    persistUser(user);
    renderBalances(user);
    renderHistory(user);
    renderDailyBonus(user);
    renderExchangeButton(user);

    renderResult(
        "🎁 BÓNUS RECEBIDO!",
        "Recebeste " + ECONOMY.dailyBonusGems + " 💎 gemas. Junta " + ECONOMY.gemsPerExchange + " 💎 para trocar por moedas. Volta amanhã!",
        "win"
    );
}


// ============================================================
// TROCA DE GEMAS POR MOEDAS
// ============================================================

function renderExchangeButton(user) {
    const button = document.getElementById("exchangeButton");
    if (!button) return;

    const units = Math.floor(user.gems / ECONOMY.gemsPerExchange);

    if (units > 0) {
        button.disabled = false;
        button.textContent =
            "🔁 Trocar " + (units * ECONOMY.gemsPerExchange) + " 💎 por " +
            (units * ECONOMY.coinsPerExchange) + " 🪙";
    } else {
        button.disabled = true;
        const missing = ECONOMY.gemsPerExchange - user.gems;
        button.textContent = "🔁 Precisas de mais " + missing + " 💎";
    }
}

function exchangeGems() {
    const user = findCurrentUser();
    if (!user) return;

    const units = Math.floor(user.gems / ECONOMY.gemsPerExchange);
    if (units <= 0) return;

    const gemsCost = units * ECONOMY.gemsPerExchange;
    const coinsGained = units * ECONOMY.coinsPerExchange;

    user.gems -= gemsCost;
    user.coins += coinsGained;

    addHistoryEntry(user, {
        game: "Troca de gemas",
        icon: "🔁",
        amount: coinsGained,
        currency: "coins",
    });

    persistUser(user);
    renderBalances(user);
    renderHistory(user);
    renderExchangeButton(user);

    renderResult(
        "🔁 TROCA FEITA!",
        "Trocaste " + gemsCost + " 💎 por " + coinsGained + " 🪙.",
        "win"
    );
}


// ============================================================
// MOTOR DE JOGO GENÉRICO
// Cada jogo chama startRound(), calcula o resultado e chama
// finishRound() para atualizar saldo, histórico e mensagem.
// ============================================================

function startRound() {
    const user = findCurrentUser();
    if (!user) return null;

    const icon = currentCurrency === "gems" ? "💎" : "🪙";
    const label = currentCurrency === "gems" ? "gemas" : "moedas";
    const balance = user[currentCurrency];

    if (balance < currentBet) {
        renderResult(
            "❌ SEM " + label.toUpperCase(),
            "Precisas de pelo menos " + icon + " " + currentBet + " " + label + " para jogar.",
            "loss"
        );
        return null;
    }

    document.querySelectorAll(".play-button").forEach((btn) => {
        btn.disabled = true;
    });

    user[currentCurrency] -= currentBet;
    return user;
}

function finishRound(user, { title, text, amount, icon, gameName, outcome }) {
    user[currentCurrency] += amount;

    addHistoryEntry(user, {
        game: gameName,
        icon: icon,
        amount: amount - currentBet,
        currency: currentCurrency,
    });

    persistUser(user);
    renderBalances(user);
    renderHistory(user);
    renderResult(title, text, outcome);

    document.querySelectorAll(".play-button").forEach((btn) => {
        btn.disabled = false;
    });
}


// ============================================================
// SLOTS
// ============================================================

const SLOT_SYMBOLS = GAME_CONFIG.slotsSymbols;

function spinReel(reelEl, durationMs) {
    return new Promise((resolve) => {
        const finalSymbol =
            SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];

        reelEl.classList.add("spinning");

        const interval = setInterval(() => {
            reelEl.textContent =
                SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
        }, 80);

        setTimeout(() => {
            clearInterval(interval);
            reelEl.classList.remove("spinning");
            reelEl.textContent = finalSymbol;
            resolve(finalSymbol);
        }, durationMs);
    });
}

async function playSlots() {
    const user = startRound();
    if (!user) return;

    const reelA = document.getElementById("reelA");
    const reelB = document.getElementById("reelB");
    const reelC = document.getElementById("reelC");

    const [a, b, c] = await Promise.all([
        spinReel(reelA, 900),
        spinReel(reelB, 1200),
        spinReel(reelC, 1500),
    ]);

    let winnings = 0;
    if (a === b && b === c) {
        winnings = Math.round(currentBet * PAYOUTS.slotsJackpot);
    } else if (a === b || b === c || a === c) {
        winnings = Math.round(currentBet * PAYOUTS.slotsPair);
    }

    const combo = a + " " + b + " " + c;
    const isJackpot = a === b && b === c;

    if (isJackpot) {
        finishRound(user, {
            title: "🎉 JACKPOT!",
            text: combo + " — Ganhaste " + winnings + "!",
            amount: winnings,
            icon: "🎰",
            gameName: "Slots",
            outcome: "win",
        });
    } else if (winnings > 0) {
        finishRound(user, {
            title: "✨ BOA!",
            text: combo + " — Ganhaste " + winnings + "!",
            amount: winnings,
            icon: "🎰",
            gameName: "Slots",
            outcome: "win",
        });
    } else {
        finishRound(user, {
            title: "😢 PERDESTE",
            text: combo + " — Perdeste " + currentBet + ".",
            amount: 0,
            icon: "🎰",
            gameName: "Slots",
            outcome: "loss",
        });
    }
}


// ============================================================
// DADOS
// ============================================================

const DICE_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

function rollDiceAnimation(diceEl, finalNumber, durationMs) {
    return new Promise((resolve) => {
        diceEl.classList.add("rolling");

        const interval = setInterval(() => {
            const random = Math.floor(Math.random() * 6) + 1;
            diceEl.textContent = DICE_FACES[random];
        }, 90);

        setTimeout(() => {
            clearInterval(interval);
            diceEl.classList.remove("rolling");
            diceEl.textContent = DICE_FACES[finalNumber];
            resolve();
        }, durationMs);
    });
}

async function playDice() {
    const user = startRound();
    if (!user) return;

    const diceEl = document.getElementById("diceFace");
    const won = Math.random() < GAME_CONFIG.diceWinChance;

    let number;
    if (won) {
        number = selectedDiceNumber;
    } else {
        const others = [1, 2, 3, 4, 5, 6].filter((n) => n !== selectedDiceNumber);
        number = others[Math.floor(Math.random() * others.length)];
    }

    if (diceEl) {
        await rollDiceAnimation(diceEl, number, 900);
    }

    const winnings = won ? currentBet * 6 : 0;

    if (won) {
        finishRound(user, {
            title: "🎉 GANHASTE!",
            text: "Escolheste o " + selectedDiceNumber + " e saiu o " + number + "! Ganhaste " + winnings + ".",
            amount: winnings,
            icon: "🎲",
            gameName: "Dados",
            outcome: "win",
        });
    } else {
        finishRound(user, {
            title: "😢 PERDESTE",
            text: "Escolheste o " + selectedDiceNumber + ", mas saiu o " + number + ". Perdeste " + currentBet + ".",
            amount: 0,
            icon: "🎲",
            gameName: "Dados",
            outcome: "loss",
        });
    }
}


// ============================================================
// ROLETA
// ============================================================

const ROULETTE_SEGMENTS = 12; // alternando vermelho / preto
const SEGMENT_ANGLE = 360 / ROULETTE_SEGMENTS;

function segmentColor(index) {
    return index % 2 === 0 ? "red" : "black";
}

function spinWheelTo(wheelEl, color, durationMs) {
    return new Promise((resolve) => {
        const candidates = [];
        for (let i = 0; i < ROULETTE_SEGMENTS; i++) {
            if (segmentColor(i) === color) candidates.push(i);
        }
        const segmentIndex =
            candidates[Math.floor(Math.random() * candidates.length)];
        const segmentCenter = segmentIndex * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;

        const fullSpins = 5;
        const rotation = fullSpins * 360 + ((360 - segmentCenter) % 360);

        wheelEl.style.transition = "transform " + durationMs + "ms cubic-bezier(0.2, 0.8, 0.2, 1)";
        wheelEl.style.transform = "rotate(" + rotation + "deg)";

        setTimeout(resolve, durationMs);
    });
}

async function playRoulette() {
    const user = startRound();
    if (!user) return;

    const wheelEl = document.getElementById("rouletteWheel");

    const won = Math.random() < GAME_CONFIG.rouletteWinChance;
    const finalColor = won
        ? selectedRouletteColor
        : (selectedRouletteColor === "red" ? "black" : "red");

    if (wheelEl) {
        await spinWheelTo(wheelEl, finalColor, 2600);
    }

    const colorLabel = finalColor === "red" ? "VERMELHO" : "PRETO";
    const chosenLabel = selectedRouletteColor === "red" ? "VERMELHO" : "PRETO";
    const winnings = won ? currentBet * 3 : 0;

    if (won) {
        finishRound(user, {
            title: "🎉 GANHASTE!",
            text: "Escolheste " + chosenLabel + " e a roleta parou no " + colorLabel + ". Ganhaste " + winnings + ".",
            amount: winnings,
            icon: "🎡",
            gameName: "Roleta",
            outcome: "win",
        });
    } else {
        finishRound(user, {
            title: "😢 PERDESTE",
            text: "Escolheste " + chosenLabel + ", mas a roleta parou no " + colorLabel + ". Perdeste " + currentBet + ".",
            amount: 0,
            icon: "🎡",
            gameName: "Roleta",
            outcome: "loss",
        });
    }
}


// ============================================================
// RANKING
// ============================================================

function loadRanking() {
    const rankingList = document.getElementById("rankingList");
    if (!rankingList) return;

    const users = getUsers();
    const currentUsername = getCurrentUsername();

    if (users.length === 0) {
        rankingList.innerHTML =
            '<div class="empty-ranking">Ainda não existem jogadores.</div>';
        return;
    }

    const sorted = [...users].sort((a, b) => b.coins - a.coins);
    const medals = ["🥇", "🥈", "🥉"];

    rankingList.innerHTML = sorted
        .map((user, i) => {
            const position = i + 1;
            const isYou = user.username === currentUsername;
            const medal = medals[i] || "#" + position;

            return (
                '<div class="ranking-player' +
                (isYou ? " ranking-player--you" : "") +
                '">' +
                '<div class="ranking-position">' + medal + "</div>" +
                '<div class="ranking-name">' +
                escapeHtml(user.username) +
                (isYou ? ' <span class="you-tag">TU</span>' : "") +
                "</div>" +
                '<div class="ranking-coins">🪙 ' + user.coins + "</div>" +
                "</div>"
            );
        })
        .join("");
}


// ============================================================
// INICIAR PÁGINA
// ============================================================

document.addEventListener("DOMContentLoaded", function () {

    // LOGIN / REGISTO
    const loginButton = document.getElementById("loginButton");
    const registerButton = document.getElementById("registerButton");
    const togglePassword = document.getElementById("togglePassword");
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");

    if (loginButton) loginButton.addEventListener("click", login);
    if (registerButton) registerButton.addEventListener("click", register);
    if (togglePassword) togglePassword.addEventListener("click", togglePasswordVisibility);

    [usernameInput, passwordInput].forEach((input) => {
        if (!input) return;
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") login();
        });
    });

    // CASINO
    const slotsButton = document.getElementById("slotsButton");
    const diceButton = document.getElementById("diceButton");
    const rouletteButton = document.getElementById("rouletteButton");
    const dailyBonusButton = document.getElementById("dailyBonusButton");
    const exchangeButton = document.getElementById("exchangeButton");

    if (slotsButton) slotsButton.addEventListener("click", playSlots);
    if (diceButton) diceButton.addEventListener("click", playDice);
    if (rouletteButton) rouletteButton.addEventListener("click", playRoulette);
    if (dailyBonusButton) dailyBonusButton.addEventListener("click", claimDailyBonus);
    if (exchangeButton) exchangeButton.addEventListener("click", exchangeGems);

    initCurrencySelector();
    initBetSelector();
    initDicePicker();
    initRoulettePicker();

    // LOGOUT
    const logoutButton = document.getElementById("logoutButton");
    if (logoutButton) {
        logoutButton.addEventListener("click", () => {
            if (confirm("Tens a certeza que queres sair?")) {
                logout();
            }
        });
    }

    // UTILIZADOR + RANKING
    loadUser();
    loadRanking();
});