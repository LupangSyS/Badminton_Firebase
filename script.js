// ==========================================
// 🏸 BADMINTON MANAGER PRO - SCRIPT
// ==========================================

// 👇 วาง Config ทิ้งไว้บนสุดเลย
const firebaseConfig = {
  apiKey: "AIzaSyCnrkEbVOM3i7f59rAnWN9mgPC9iekEuIA",
  authDomain: "badminton-manager-e77bb.firebaseapp.com",
  projectId: "badminton-manager-e77bb",
  storageBucket: "badminton-manager-e77bb.firebasestorage.app",
  messagingSenderId: "402072472322",
  appId: "1:402072472322:web:a212ed6eaff7ec10fbd01b",
  measurementId: "G-2EFE485QTK"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
console.log("🔥 Firebase พร้อมใช้งานแล้วเว้ยแปง!");

// --- Persistence & State Management ---
const STORAGE_KEY = 'BADMINTON_MANAGER_V7_DATA';

// 👇 เอาฟังก์ชัน saveData ใหม่ไปทับของเดิมด้วย!
function saveData() {
    const ruleEl = document.getElementById('game-rule');
    const ruleValue = ruleEl ? ruleEl.value : 'normal';

    const data = {
        players: players,
        courts: courts.map(c => ({...c, interval: null})),
        courtCount: courtCount,
        pairingHistory: pairingHistory,
        opponentHistory: opponentHistory,
        matchLogs: matchLogs,
        bookingCounter: bookingCounter,
        gameRule: ruleValue, 
        rankedMode: isRankedMode,
        mmrMode: isMMRMode,
        completedGameTimes: completedGameTimes,
        lastUpdated: new Date().toISOString()
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

    // 🚀 ยิงขึ้น Firebase เลยตรงๆ
    if (typeof db !== 'undefined') {
        db.collection('rooms').doc('main-court').set(data)
          .then(() => console.log("☁️ Data Synced to Firebase สำเร็จเว้ย!"))
          .catch((error) => console.error("❌ Error writing to Firebase: ", error));
    }
}

function loadData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;

    try {
        const data = JSON.parse(raw);
        players = data.players || [];
        courtCount = data.courtCount || 2;
        pairingHistory = data.pairingHistory || {};
        opponentHistory = data.opponentHistory || {};
        matchLogs = data.matchLogs || [];
        bookingCounter = data.bookingCounter || 0;
       
        // โหลด Rank Mode
        if (typeof data.rankedMode !== 'undefined') {
            isRankedMode = data.rankedMode;
            const cb = document.getElementById('ranked-mode-toggle');
            if (cb) cb.checked = isRankedMode;
        }

        // โหลด Courts
        if (data.courts) {
            courts = data.courts.map((c, index) => {
                c.interval = null;
                if (!c.rule) c.rule = 'normal'; 
                return c;
            });
        }
       
        // โหลด Rule
        if (data.gameRule) {
            const ruleSelect = document.getElementById('game-rule');
            if(ruleSelect) ruleSelect.value = data.gameRule;
        }
        if (data.completedGameTimes) completedGameTimes = data.completedGameTimes;

        // โหลด MMR Mode
        if (typeof data.mmrMode !== 'undefined') {
            isMMRMode = data.mmrMode;
            const cb = document.getElementById('mmr-mode-toggle');
            if (cb) cb.checked = isMMRMode;
        }

        // 🔥 FIX: ดักคอตรงนี้! ถ้าเปิดทั้งคู่ ให้ปิด Rank ทิ้ง (ถือว่า MMR ใหญ่กว่า)
        if (isRankedMode && isMMRMode) {
            console.log("⚠️ เจอเปิดซ้อนกัน! สั่งปิด Rank อัตโนมัติ");
            isRankedMode = false;
            const rankCB = document.getElementById('ranked-mode-toggle');
            if(rankCB) rankCB.checked = false;
        }

        return true;
    } catch (e) {
        console.error("Load Data Error:", e);
        return false;
    }
}

const countRealPlayers = (court) => {
    return court.players.filter(p => p !== null && p !== undefined).length;
};

// --- LEVEL & BALANCING SYSTEM ---
const LEVEL_WEIGHTS = { 'BG': 1, 'N': 2, 'S': 3, 'P': 4 };
const RANK_LEVELS = ['BG', 'N', 'S', 'P'];
const LEVEL_COLORS = { 'BG': '#bdbdbd', 'N': '#66bb6a', 'S': '#ffa726', 'P': '#ef5350' };

const toggleLevel = (id) => {
    const p = players.find(x => x.id === id);
    if (!p) return;
    const levels = ['BG', 'N', 'S', 'P'];
    const currentIdx = levels.indexOf(p.level || 'BG');
    p.level = levels[(currentIdx + 1) % levels.length];
    updateQueueDisplay();
};

const toggleGender = (id) => {
    const p = players.find(x => x.id === id);
    if (!p) return;
    p.gender = (p.gender === 'F') ? 'M' : 'F';
    updateQueueDisplay();
    saveData();
};

const RANK_SCORES = { 'P': 4, 'S': 3, 'N': 2, 'BG': 1 };

function getPlayerPower(p) {
    const baseScore = RANK_SCORES[p.level || 'BG'] || 1;
    const streakPenalty = (p.winStreak >= 3) ? 0.5 : 0;
    return baseScore + streakPenalty;
}

function getWinRate(p) {
    return p.gamesPlayed > 0 ? (p.wins / p.gamesPlayed) : 0;
}

const autoBalanceTeam = (candidates) => {
    if (candidates.some(p => p.bookingId) || candidates.length !== 4) return candidates;

    const combinations = [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]];
    let bestCombo = combinations[0];
    let minDiffScore = Infinity;

    combinations.forEach(combo => {
        const p1 = candidates[combo[0]]; const p2 = candidates[combo[1]];
        const p3 = candidates[combo[2]]; const p4 = candidates[combo[3]];

        const team1Power = getPlayerPower(p1) + getPlayerPower(p2);
        const team2Power = getPlayerPower(p3) + getPlayerPower(p4);
        const powerDiff = Math.abs(team1Power - team2Power) * 1000; 

        const team1WinRate = getWinRate(p1) + getWinRate(p2);
        const team2WinRate = getWinRate(p3) + getWinRate(p4);
        const winRateDiff = Math.abs(team1WinRate - team2WinRate);

        let repeatPenalty = 0;
        if (getPairCount(p1.id, p2.id) > 0) repeatPenalty += 500;
        if (getPairCount(p3.id, p4.id) > 0) repeatPenalty += 500;

        const totalBadness = powerDiff + repeatPenalty + winRateDiff;

        if (totalBadness < minDiffScore) {
            minDiffScore = totalBadness;
            bestCombo = combo;
        }
    });

    return [candidates[bestCombo[0]], candidates[bestCombo[1]], candidates[bestCombo[2]], candidates[bestCombo[3]]];
};

const addPlayerToCourt = (court, player) => {
    let emptyIdx = court.players.findIndex(p => p === null || p === undefined);
    if (emptyIdx !== -1) {
        court.players[emptyIdx] = player;
        const activeCount = court.players.filter(p => p !== null).length;
        if (activeCount === 4) court.gameStartTime = Date.now(); 
    } else {
        if (court.players.length < 4) court.players.push(player);
        else console.error("สนามเต็มแล้ว ยัดไม่เข้า!");
    }
};

// --- Data ---
let players = [];
let courts = [];  
let courtCount = 2;
let bookingCounter = 0;
let activeGameResolveCourtId = null;
let pairingHistory = {};
let opponentHistory = {};
let matchLogs = [];
let isRankedMode = false;
let isAntiDejaVuMode = false;
let isMMRMode = false;
let completedGameTimes = [];
const DEFAULT_GAME_TIME = 15;
const AUTO_START_DELAY = 30;

// --- Init ---
function init() {
    renderCourts();
    updateQueueDisplay();
    updateCustomHoursInputs();
    
    if (loadData()) {
        console.log("📂 Loaded data from LocalStorage");
    }

    renderCourts();
    updateQueueDisplay();
   
    setInterval(saveData, 5000);

    setInterval(() => {
        if (!isModalOpen()) autoFillCourts();
    }, 1000);

    setInterval(() => {
        courts.forEach((c, idx) => {
            if (c.state === 'playing' && c.gameStartTime) {
                const diffSec = Math.floor((Date.now() - c.gameStartTime) / 1000);
                c.timer = diffSec;
                const el = document.getElementById(`timer-${idx}`);
                if (el) el.innerText = formatTime(diffSec);
            }
        });
    }, 1000);

    setInterval(() => {
        if (!isModalOpen()) updateQueueDisplay();
    }, 60000);
   
    updateCustomHoursInputs();
}

function toggleView(viewName) {
    document.getElementById('main-view').classList.add('hidden');
    document.getElementById('overview-view').classList.add('hidden');
    if(viewName === 'main') {
        document.getElementById('main-view').classList.remove('hidden');
    } else {
        document.getElementById('overview-view').classList.remove('hidden');
        renderOverview();
    }
}

function toggleRankedMode() {
    const checkbox = document.getElementById('ranked-mode-toggle');
    isRankedMode = checkbox.checked;
    
    // ✨ FIX: ถ้าเปิด Rank ให้ปิด MMR อัตโนมัติ (สลับขั้วกัน)
    if (isRankedMode) {
        const mmrCB = document.getElementById('mmr-mode-toggle');
        if(mmrCB) mmrCB.checked = false;
        isMMRMode = false;
        
        alert('🏆 เปิดโหมดจัดอันดับ! \n(ปิดโหมด MMR แล้ว)');
    } else {
        alert('👌 ปิดโหมดจัดอันดับ');
    }
    updateNextMatchPanel();
    saveData();
}

function toggleMMRMode() {
    const checkbox = document.getElementById('mmr-mode-toggle');
    isMMRMode = checkbox.checked;
    if (isMMRMode) {
        const rankCB = document.getElementById('ranked-mode-toggle');
        if(rankCB) rankCB.checked = false;
        isRankedMode = false;
        alert('⚖️ เปิดโหมด MMR!');
    } else {
        alert('👌 ปิดโหมด MMR');
    }
    updateNextMatchPanel(); 
    saveData();
}

// 👇 ฟังก์ชันเปิดปิดโหมดผี
function toggleAntiDejaVuMode() {
    const checkbox = document.getElementById('antidejavu-mode-toggle');
    isAntiDejaVuMode = checkbox.checked;
    if (isAntiDejaVuMode) alert('👻 เปิดโหมดหนีเจ้ากรรมนายเวร!\n(ระบบจะพยายามไม่ให้เจอคนหน้าเดิมซ้ำๆ และคนโดนข้ามคิวจะได้สิทธิ์ลงคอร์ทถัดไปทันที)');
    else alert('👌 ปิดโหมดหนีเจ้ากรรมนายเวร');
}

function getPairKey(id1, id2) { return id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`; }
function recordPairing(id1, id2) {
    const key = getPairKey(id1, id2);
    if (!pairingHistory[key]) pairingHistory[key] = 0;
    pairingHistory[key]++;
}
function getPairCount(id1, id2) { return pairingHistory[getPairKey(id1, id2)] || 0; }

function recordOpponent(id1, id2) {
    const key = getPairKey(id1, id2);
    if (!opponentHistory[key]) opponentHistory[key] = 0;
    opponentHistory[key]++;
}
function getOpponentCount(id1, id2) { return opponentHistory[getPairKey(id1, id2)] || 0; }

function addPlayers() {
    const input = document.getElementById('new-players');
    const rawText = input.value.trim();
    if (!rawText) return;
    const names = rawText.split('\n').map(n => n.trim()).filter(n => n);
    let maxGamesInSystem = 0;
    players.forEach(p => { if(p.gamesPlayed > maxGamesInSystem) maxGamesInSystem = p.gamesPlayed; });

    names.forEach(name => {
        let cleanName = name.replace(/^[\d]+\.[\s]*/, '');
        let joinTime = Date.now();
        let isFastPass = false;
        if (maxGamesInSystem > 2) {
            joinTime = Date.now() - (60 * 60 * 1000);
            isFastPass = true;
        }
        players.push({
            id: Date.now() + Math.random(),
            name: cleanName,
            level: 'BG',
            gender: 'M',
            gamesPlayed: 0,
            wins: 0,
            status: 'waiting',
            joinedQueueAt: joinTime,
            bookingId: null,
            winStreak: 0,
            sessionGames: 0,
            isFastPass: isFastPass,
            checkInTime: new Date(),
            isResting: false,
            mmr: 100
        });
    });
    input.value = '';
    updateQueueDisplay();
    saveData();
}

const removePlayer = (id) => {
    const p = players.find(x => x.id === id);
    if (!p) return;
    if(p.status === 'playing') { alert('เล่นอยู่ ลบไม่ได้ครับ'); return; }

    if (p.bookingId) {
        const others = players.filter(x => x.bookingId === p.bookingId && x.id !== id);
        if (others.length > 0) {
            if(!confirm(`⚠️ ${p.name} ติดจองอยู่ ลบทั้งกลุ่มไหม?`)) return;
            players.forEach(x => {
                if(x.bookingId === p.bookingId) { x.bookingId = null; x.bookingTeam = null; }
            });
        }
    } else {
        if(!confirm(`ต้องการลบ ${p.name} ใช่ไหม?`)) return;
    }
    players = players.filter(p => p.id !== id);
    updateQueueDisplay();
    saveData();
};

function resetStatsOnly() {
    if(!confirm('รีเซ็ตสถิติ?')) return;
    players.forEach(p => {
        p.gamesPlayed = 0; p.wins = 0; p.sessionGames = 0; p.mmr =0;
        p.status = 'waiting'; p.joinedQueueAt = Date.now(); p.bookingId = null; p.isFastPass = false;
    });
    pairingHistory = {}; opponentHistory = {}; matchLogs = [];
    renderMatchLog(); resetCourtsState(); updateQueueDisplay();
}

function resetAll() {
    if(!confirm('⚠️ ล้างข้อมูลทั้งหมดใช่ไหม?')) return;
    if(!confirm('⚠️ ยืนยันครั้งที่ 2?')) return;
    players = []; pairingHistory = {}; opponentHistory = {}; matchLogs = [];
    courts.forEach(c => { clearInterval(c.interval); c.players = []; c.state = 'empty'; c.timer = 0; });
    localStorage.removeItem(STORAGE_KEY);
    renderMatchLog(); renderCourts(); updateQueueDisplay();
}

function resetCourtsState() {
    courts.forEach(c => {
        clearInterval(c.interval);
        c.players = []; c.state = 'empty'; c.timer = 0; c.isOpened = false; c.autoStartTarget = null;
    });
    renderCourts();
}

function updateCourts(change) {
    const newCount = courtCount + change;
    if (newCount < 1) return;
    courtCount = newCount;
    document.getElementById('court-count').innerText = courtCount;
    document.getElementById('calc-court-count').value = courtCount;
    updateCustomHoursInputs();
    renderCourts();
}

function setCourtRule(courtIdx, newRule) {
    courts[courtIdx].rule = newRule;
    renderCourts();
    updateQueueDisplay();
    saveData();
}
function toggleRankFilter(idx) {
    courts[idx].isRankFilterOn = !courts[idx].isRankFilterOn;
    renderCourts(); saveData();
}

function setCourtRankMin(idx, val) {
    courts[idx].minRank = val;
    renderCourts(); saveData();
}

function setCourtRankMax(idx, val) {
    courts[idx].maxRank = val;
    renderCourts(); saveData();
}

function renderCourts() {
    const container = document.getElementById('courts-container');
    if (courts.length < courtCount) {
        for (let i = courts.length; i < courtCount; i++) {
            // init ค่า default ให้ rank ด้วย กันเหนียว
            courts.push({ id: i, players: [], state: 'empty', timer: 0, interval: null, isOpened: false, autoStartTarget: null, rule: 'normal', isRankFilterOn: false, minRank: 'BG', maxRank: 'P' });
        }
    } else if (courts.length > courtCount) {
        const removed = courts.pop();
        if (removed.players.length > 0) {
            removed.players.forEach(p => {
                const pl = players.find(x => x.id === p.id);
                if(pl) { pl.status = 'waiting'; pl.joinedQueueAt = Date.now(); pl.sessionGames = 0; }
            });
        }
    }
    container.innerHTML = '';
    courts.forEach((court, index) => {
        if (!court.rule) court.rule = 'normal';
        // Defend against undefined
        if (typeof court.isRankFilterOn === 'undefined') court.isRankFilterOn = false;
        if (!court.minRank) court.minRank = 'BG';
        if (!court.maxRank) court.maxRank = 'P';

        let overlayHTML = '';
        if (court.state === 'post_game') {
            overlayHTML = `<div class="court-overlay"><button class="btn-overlay btn-call" onclick="triggerFill(${index})">📢 เรียกคนลง</button><button class="btn-overlay btn-rest" onclick="closeAndRest(${index})">🔴 พักคอร์ท</button></div>`;
        } else if (!court.isOpened) {
            overlayHTML = `<div class="court-overlay"><button class="btn-overlay btn-open" onclick="openCourt(${index})">🔔 เปิดสนาม</button></div>`;
        }
        const displayName = court.customName || `#${index + 1}`;
        
        // --- 👇 ส่วนที่เพิ่มใหม่: Rank Filter Control ---
        const rankOptions = RANK_LEVELS.map(r => `<option value="${r}">${r}</option>`).join('');
        const rankFilterHTML = `
            <div class="rank-filter-container" onclick="event.stopPropagation()">
                <input type="checkbox" class="rank-checkbox" ${court.isRankFilterOn ? 'checked' : ''} onchange="toggleRankFilter(${index})" title="บังคับ Rank">
                <span style="font-weight:bold; color:${court.isRankFilterOn ? '#c0392b' : '#aaa'};">Rank</span>
                <select class="rank-select" onchange="setCourtRankMin(${index}, this.value)" ${!court.isRankFilterOn?'disabled':''}>${RANK_LEVELS.map(r => `<option value="${r}" ${court.minRank===r?'selected':''}>${r}</option>`).join('')}</select>
                to
                <select class="rank-select" onchange="setCourtRankMax(${index}, this.value)" ${!court.isRankFilterOn?'disabled':''}>${RANK_LEVELS.map(r => `<option value="${r}" ${court.maxRank===r?'selected':''}>${r}</option>`).join('')}</select>
            </div>
        `;
        // ---------------------------------------------

        const ruleSelectHTML = `
            <select class="court-rule-select" onchange="setCourtRule(${index}, this.value)" onclick="event.stopPropagation()">
                <option value="normal" ${court.rule === 'normal' ? 'selected' : ''}>⛔ ออกหมด</option>
                <option value="winner_stay" ${court.rule === 'winner_stay' ? 'selected' : ''}>👑 ครบ 2 เด้ง</option>
            </select>`;
        
        container.innerHTML += `
            <div class="court" id="court-${index}">
                <div class="court-lines"></div><div class="service-line-top"></div><div class="service-line-bottom"></div>
            
            <div class="court-header" style="position: relative; z-index: 10; padding-bottom: 4px;"> 
              <div style="display:flex; flex-direction: column; width:100%;"> 
              <div style="display:flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span onclick="editCourtName(${index})" style="cursor:pointer; white-space:nowrap; font-weight:bold; margin-right: 5px;">${displayName} ✏️</span>
                ${ruleSelectHTML}
              </div>
        
              <div style="width: 100%;">
             ${rankFilterHTML}
              </div>

              </div>
             </div>
            
                ${overlayHTML}
                <div class="court-players">
                    <div class="team team-pink">${renderPlayerOnCourt(court.players[0], index, 0)}${renderPlayerOnCourt(court.players[1], index, 1)}</div>
                    <div class="team team-blue">${renderPlayerOnCourt(court.players[2], index, 2)}${renderPlayerOnCourt(court.players[3], index, 3)}</div>
                </div>
                <div class="court-controls">
                    <div class="timer" id="timer-${index}">${formatTime(court.timer)}</div>${renderCourtButtons(court, index)}
                </div>
            </div>`;
    });
    updateQueueDisplay();
    updateDashboard();
}

function openCourt(idx) { courts[idx].isOpened = true; renderCourts(); }
function triggerFill(idx) { courts[idx].state = 'empty'; renderCourts(); }
function closeAndRest(idx) {
    courts[idx].players.forEach(p => sendToQueue(p.id));
    courts[idx].players = []; courts[idx].state = 'empty'; courts[idx].isOpened = false; courts[idx].timer = 0;
    renderCourts();
}

function renderPlayerOnCourt(player, courtIdx, slotIdx) {
    if (!player) return `<div class="player-on-court" style="cursor:pointer; opacity:0.7; background:#f0f0f0; color:#888; border:2px dashed #ccc;" onclick="openManualAddModal(${courtIdx})" title="จิ้มเพื่อเลือกคนลง">+ ว่าง</div>`;
    const rule = courts[courtIdx].rule || 'normal';
    let badge = (rule === 'winner_stay') ? `<span class="quota-badge" style="background:${player.sessionGames >= 1 ? '#e67e22' : '#27ae60'}">G: ${player.sessionGames + 1}/2</span>` : '';
    return `<div class="player-on-court" title="เปลี่ยนตัว" onclick="kickPlayer(${courtIdx}, ${slotIdx})"><strong>${player.name}</strong><span style="font-size:0.8em; margin-top:2px;">(${player.gamesPlayed}P)</span>${badge}</div>`;
}

function renderCourtButtons(court, idx) {
    if (!court.isOpened || court.state === 'post_game') return `<button class="secondary" style="width:100%;" disabled>...</button>`;
    if (court.state === 'playing') return `<button class="danger" style="width:100%;" onclick="stopGame(${idx})">จบเกม</button>`;
    
    const realCount = countRealPlayers(court);
    if (realCount === 4) {
        if (court.autoStartTarget) {
            const remaining = Math.ceil((court.autoStartTarget - Date.now()) / 1000);
            if (remaining > 0) return `<button class="success btn-auto-start" style="width:100%;" onclick="startGame(${idx})">เริ่ม (Auto ${remaining}s)</button>`;
        }
        return `<button class="success" style="width:100%;" onclick="startGame(${idx})">เริ่มเกม</button>`;
    }
    const waiting = players.filter(p => p.status === 'waiting').sort((a,b) => a.joinedQueueAt - b.joinedQueueAt);
    const head = waiting.length > 0 ? waiting[0] : null;
    const needed = 4 - realCount;
    let isBookingPair = false, isBookingFour = false, bookingSize = 0;

    if (head && head.bookingId) {
        const group = players.filter(p => p.bookingId === head.bookingId && p.status === 'waiting');
        bookingSize = group.length;
        if (bookingSize <= needed) {
            if (bookingSize === 2) isBookingPair = true;
            if (bookingSize === 4) isBookingFour = true;
        }
    }
    const disabledStyle = "background:#e0e0e0; color:#a0a0a0; cursor:not-allowed; border:1px solid #ccc;";
    const activePairStyle = "background:#9b59b6; color:white;";
    const activeFourStyle = "background:#8e44ad; color:white;";

    return `
        <div style="display:flex; flex-direction:column; gap:4px;">
            <div style="display:flex; gap:4px;">
                <button class="warning" style="flex:1;" onclick="fillCourtSmart(${idx})">🎲 สุ่ม</button>
                <button style="background:#3498db; color:white; flex:1;" onclick="fillCourtQueue(${idx})">⏩ ตามคิว</button>
            </div>
            <div style="display:flex; gap:4px;">
                <button style="flex:1; ${isBookingPair ? activePairStyle : disabledStyle}" ${isBookingPair ? `onclick="fillCourtSmart(${idx})"` : 'disabled'}>👥 จองคู่ ${isBookingPair ? '✅' : ''}</button>
                <button style="flex:1; ${isBookingFour ? activeFourStyle : disabledStyle}" ${isBookingFour ? `onclick="fillCourtSmart(${idx})"` : 'disabled'}>⚔️ จอง 4 ${isBookingFour ? '✅' : ''}</button>
            </div>
        </div>`;
}

const autoFillCourts = () => {
    courts.forEach((court, idx) => {
        if (!court.isOpened || court.state === 'playing' || court.state === 'post_game') return;
        if (countRealPlayers(court) === 4) {
            if (!court.autoStartTarget) {
                court.autoStartTarget = Date.now() + (AUTO_START_DELAY * 1000);
                renderCourts();
            } else if (Date.now() >= court.autoStartTarget) {
                startGame(idx);
            } else {
                const btn = document.querySelector(`#court-${idx} .btn-auto-start`);
                if (btn) btn.innerHTML = `เริ่ม (Auto ${Math.ceil((court.autoStartTarget - Date.now()) / 1000)}s)`;
            }
        } else {
             court.autoStartTarget = null;
        }
    });
};

const fillCourtSmart = (courtIdx) => {
    const court = courts[courtIdx];
    const existingPlayers = court.players.filter(p => p !== null && p !== undefined);
    const needed = 4 - existingPlayers.length;
    // กรองเบื้องต้น
    const waiting = players.filter(p => p.status === 'waiting' && !p.isResting && !p.bookingId).sort((a, b) => a.joinedQueueAt - b.joinedQueueAt);
    const headOfQueue = waiting.length > 0 ? waiting[0] : null;

    // 👇 สร้าง Object ตัวกรอง ถ้าเปิดใช้
    let rankFilter = null;
    if (court.isRankFilterOn) {
        rankFilter = { min: court.minRank || 'BG', max: court.maxRank || 'P' };
    }

    // 👇 ส่ง rankFilter เข้าไปใน getSmartDraft
    let candidates = getSmartDraft(needed, new Set(), existingPlayers, false, rankFilter); 
    if (candidates.length === 0 && waiting.length >= needed) {
        candidates = getSmartDraft(needed, new Set(), existingPlayers, true, rankFilter); 
    }
   
    if (candidates.length > 0) {
        // ... (Logic เดิม ไม่ต้องแก้) ...
        if (headOfQueue) {
            const isHeadPicked = candidates.some(c => c.id === headOfQueue.id);
            if (!isHeadPicked) headOfQueue.skipCount = (headOfQueue.skipCount || 0) + 1;
            else headOfQueue.skipCount = 0;
        }
        candidates.forEach(p => {
            p.status = 'playing'; p.sessionGames = 0;
            if(p.isFastPass) p.isFastPass = false;
            p.bookingId = null; p.bookingTeam = null;
            addPlayerToCourt(court, p);
        });
        renderCourts();
    } else {
        alert('❌ คนในคิว (ที่ตรงตามเงื่อนไข Rank) ไม่พอครับ');
    }
    saveData();
};

const fillCourtQueue = (courtIdx) => {
    const court = courts[courtIdx];
    const needed = 4 - countRealPlayers(court);
    const waiting = players.filter(p => p.status === 'waiting'&& !p.isResting).sort((a, b) => a.joinedQueueAt - b.joinedQueueAt);

    if (waiting.length === 0) { alert('ไม่มีคนรอคิวครับ'); return; }
    const firstP = waiting[0];
    let candidates = [];

    if (firstP.bookingId) {
        const group = waiting.filter(p => p.bookingId === firstP.bookingId);
        group.sort((a, b) => (a.bookingTeam || 0) - (b.bookingTeam || 0));
        if (group.length > needed) { alert(`⚠️ ลงไม่ได้! ติด Booking`); return; }
        candidates = group;
    } else {
        for (let i = 0; i < waiting.length; i++) {
            if (candidates.length >= needed) break;
            const p = waiting[i];
            if (p.bookingId) break;
            candidates.push(p);
        }
    }

    if (candidates.length > 0) {
        if (candidates.length === 4) candidates = autoBalanceTeam(candidates);
        candidates.forEach(p => {
            p.status = 'playing'; p.sessionGames = 0;
            if(p.isFastPass) p.isFastPass = false;
            addPlayerToCourt(court, p);
        });
        renderCourts();
    }
};

function getSmartDraft(count, excludeIds = new Set(), existingPlayers = [], isForce = false, rankFilter = null) {
    let pool = players.filter(p => p.status === 'waiting' && !p.isResting && !excludeIds.has(p.id));
    
    if (rankFilter) {
        const minIdx = RANK_LEVELS.indexOf(rankFilter.min);
        const maxIdx = RANK_LEVELS.indexOf(rankFilter.max);
        pool = pool.filter(p => {
            const pLevel = p.level || 'BG';
            const pIdx = RANK_LEVELS.indexOf(pLevel);
            return pIdx >= minIdx && pIdx <= maxIdx;
        });
    }

    pool.sort((a, b) => a.joinedQueueAt - b.joinedQueueAt); 
    if (pool.length === 0) return [];

    let targetScore = null, targetMMR = null;
    if (existingPlayers.length > 0) {
        targetScore = existingPlayers.reduce((sum, p) => sum + (RANK_SCORES[p.level||'BG']||1), 0);
        targetMMR = existingPlayers.reduce((sum, p) => sum + (p.mmr || 0), 0);
    }

    const head = pool[0];
    
    // 🚨 กฎเหล็ก Anti-Starvation: ถ้า C โดนสคิปมาแล้ว (skipCount >= 1) บังคับลงทันที ห้ามสคิปซ้ำ! 🚨
    if (head && head.skipCount >= 1 && !isForce) {
        let team = tryBuildTeam(head, pool, count, existingPlayers, true, targetScore, false, targetMMR);
        if (team.length === count) return team; 
    }

    if (isMMRMode && !isForce) {
        let captain = pool[0];
        let team = tryBuildTeam(captain, pool, count, existingPlayers, false, targetScore, false, targetMMR);
        if (team.length === count) return team;
        return [];
    }

    // 👻 โหมดหนีเจ้ากรรมนายเวร (Anti-Deja Vu)
    if (typeof isAntiDejaVuMode !== 'undefined' && isAntiDejaVuMode && existingPlayers.length > 0 && !isForce) {
        // ดึง 4 คิวแรกมาพิจารณา
        let candidates = pool.slice(0, 4);
        
        // เรียงลำดับตามคนที่ "เคยเจอพวกที่อยู่ในสนามน้อยที่สุด" (ยิ่งน้อยยิ่งได้เป็นกัปตันก่อน)
        candidates.sort((a, b) => {
            let conflictA = 0; existingPlayers.forEach(ex => conflictA += getOpponentCount(a.id, ex.id));
            let conflictB = 0; existingPlayers.forEach(ex => conflictB += getOpponentCount(b.id, ex.id));
            
            // ถ้า conflict เท่ากัน ให้วัดกันที่คิวใครมาก่อน
            if (conflictA !== conflictB) return conflictA - conflictB;
            return a.joinedQueueAt - b.joinedQueueAt; 
        });

        for (let i = 0; i < candidates.length; i++) {
            let captain = candidates[i];
            
            // เช็ค Rank กรณีที่เปิด Ranked Mode ซ้อนกันไว้
            if (isRankedMode) {
                 const capScore = RANK_SCORES[captain.level || 'BG'] || 1;
                 let isCompatible = true;
                 for(let ex of existingPlayers) {
                     const exScore = RANK_SCORES[ex.level || 'BG'] || 1;
                     if (Math.abs(capScore - exScore) >= 2) { isCompatible = false; break; }
                 }
                 if (!isCompatible) continue; 
            }
            let team = tryBuildTeam(captain, pool, count, existingPlayers, false, targetScore, isForce, targetMMR);
            if (team.length === count) {
                if (count === 4) return autoBalanceTeam(team);
                return team;
            }
        }
    }

    // --- โหมดปกติ (ไล่จากคิวแรกตามเดิม) ---
    for (let i = 0; i < pool.length; i++) {
        let captain = pool[i];
        if (!isForce && isRankedMode && existingPlayers.length > 0) {
             const capScore = RANK_SCORES[captain.level || 'BG'] || 1;
             let isCompatible = true;
             for(let ex of existingPlayers) {
                 const exScore = RANK_SCORES[ex.level || 'BG'] || 1;
                 if (Math.abs(capScore - exScore) >= 2) { isCompatible = false; break; }
             }
             if (!isCompatible) continue; 
        }
        let team = tryBuildTeam(captain, pool, count, existingPlayers, false, targetScore, isForce, targetMMR); 
        if (team.length === count) {
            if (count === 4 && !isForce) return autoBalanceTeam(team);
            return team;
        }
    }
    return [];
}

function tryBuildTeam(captain, currentPool, targetCount, existingPlayers = [], isPity = false, targetScore = null, isForce = false, targetMMR = null) {
    let selected = []; let usedIds = new Set();
    if (captain.bookingId) {
        const group = currentPool.filter(x => x.bookingId === captain.bookingId);
        if (group.length > targetCount) return [];
        group.sort((a, b) => (a.bookingTeam || 0) - (b.bookingTeam || 0));
        group.forEach(p => { selected.push(p); usedIds.add(p.id); });
    } else {
        selected.push(captain); usedIds.add(captain.id);
    }

    while (selected.length < targetCount) {
        let nextPlayer = null;
        if (selected.length % 2 !== 0 && !selected[selected.length-1].bookingId) {
            let currentSolo = selected[selected.length - 1];
            nextPlayer = findBestPartnerInfinite(currentSolo, currentPool, usedIds, existingPlayers, isPity, targetScore, isForce, targetMMR);
        } else {
            let currentTeamMMR = selected.reduce((s, p) => s + (p.mmr||0), 0);
            const effectiveTeam = [...selected, ...existingPlayers];
            nextPlayer = findBestOpponentInfinite(effectiveTeam, currentPool, usedIds, currentTeamMMR);
        }
        if (nextPlayer) { selected.push(nextPlayer); usedIds.add(nextPlayer.id); } else break; 
    }
    return selected;
}

function findBestPartnerInfinite(captain, fullPool, usedIds, rankCheckList = [], isPity = false, targetScore = null, isForce = false, targetMMR = null) {
    let best = null; let minScore = Infinity;
    const capScore = RANK_SCORES[captain.level || 'BG'] || 1;
    const capMMR = captain.mmr || 0;
    const capGender = captain.gender || 'M'; // 👈 เช็คเพศกัปตัน
   
    for (let i = 0; i < fullPool.length; i++) {
        const c = fullPool[i];
        if (c.id === captain.id || usedIds.has(c.id) || c.bookingId) continue;
        const cGender = c.gender || 'M';
        if (capGender === 'F' && cGender === 'F') continue;
        let finalScore = 0;

        if (isMMRMode && !isForce) {
            const queueCost = i * 100; 
            let mmrCost = 0;
            const partnerMMR = c.mmr || 0;
            if (targetMMR !== null) {
                const ourTeamMMR = capMMR + partnerMMR;
                mmrCost = Math.abs(ourTeamMMR - targetMMR) * 100;
            } else {
                mmrCost = Math.abs(capMMR - partnerMMR) * 100;
            }
            const pairCost = getPairCount(captain.id, c.id) * 1000000;
            finalScore = queueCost + mmrCost + pairCost;
        } else if (isForce) {
             const queueCost = i * 1000; 
             let balanceCost = 0;
             if (targetScore !== null) {
                const myTeamScore = capScore + (RANK_SCORES[c.level||'BG']||1);
                balanceCost = Math.abs(myTeamScore - targetScore) * 2500; 
             }
             const pairCost = getPairCount(captain.id, c.id) * 3000; 
             finalScore = queueCost + balanceCost + pairCost;
        } else {
             if (isPity && targetScore !== null) {
                 const cScore = RANK_SCORES[c.level || 'BG'] || 1;
                 const ourTeamSum = capScore + cScore;
                 finalScore = (getPairCount(captain.id, c.id) * 1000000) + (Math.abs(ourTeamSum - targetScore) * 1000) + i;
            } else {
                const pairPenalty = (getPairCount(captain.id, c.id) >= 2) ? 999999999 : getPairCount(captain.id, c.id) * 1000000;
                let rankPenalty = 0;
                if (isRankedMode) {
                    const cScore = RANK_SCORES[c.level || 'BG'] || 1;
                    const diffCap = Math.abs(capScore - cScore);
                    if (diffCap === 1) rankPenalty += 5;
                    if (diffCap >= 2) rankPenalty += 500;
                    for(let existing of rankCheckList) {
                        const exScore = RANK_SCORES[existing.level || 'BG'] || 1;
                        const diffEx = Math.abs(cScore - exScore);
                        if (diffEx === 1) rankPenalty += 5; else if (diffEx >= 2) rankPenalty += 500;
                    }
                }
                finalScore = pairPenalty + rankPenalty + i;
            }
        }
        if (finalScore < minScore) { minScore = finalScore; best = c; }
    }
    return best;
}

function findBestOpponentInfinite(currentTeam, fullPool, usedIds, targetMMR = null) {
    let best = null; let minScore = Infinity;
    for (let i = 0; i < fullPool.length; i++) {
        const c = fullPool[i];
        if (usedIds.has(c.id) || c.bookingId) continue;
        let conflictScore = 0;
        currentTeam.forEach(member => {
            const opCount = getOpponentCount(member.id, c.id);
            conflictScore += (opCount >= 2) ? 100000000 : (opCount * 1000000);
        });
        let extraScore = 0;
        let rankPenalty = 0;

        if (isMMRMode) {
            if (targetMMR !== null) {
                const myMMR = c.mmr || 0;
                const projectedTeam2MMR = myMMR * 2; 
                extraScore = Math.abs(projectedTeam2MMR - targetMMR) * 100;
            }
        } else if (isRankedMode) {
            const cScore = RANK_SCORES[c.level || 'BG'] || 1;
            let maxDiff = 0;
            currentTeam.forEach(member => {
                const mScore = RANK_SCORES[member.level || 'BG'] || 1;
                const diff = Math.abs(mScore - cScore);
                if (diff > maxDiff) maxDiff = diff;
            });
            if (maxDiff === 1) rankPenalty = 5;
            else if (maxDiff >= 2) rankPenalty = 500;
        }
        const totalScore = conflictScore + extraScore + rankPenalty + i;
        if (totalScore < minScore) { minScore = totalScore; best = c; }
    }
    return best;
}

function startGame(courtIdx) {
    const court = courts[courtIdx];
    court.state = 'playing'; court.gameStartTime = Date.now(); court.timer = 0; court.autoStartTarget = null;
    if(court.players[0] && court.players[1]) recordPairing(court.players[0].id, court.players[1].id);
    if(court.players[2] && court.players[3]) recordPairing(court.players[2].id, court.players[3].id);
    const p0 = court.players[0]; const p1 = court.players[1];
    const p2 = court.players[2]; const p3 = court.players[3];
    if (p0 && p2) recordOpponent(p0.id, p2.id); if (p0 && p3) recordOpponent(p0.id, p3.id);
    if (p1 && p2) recordOpponent(p1.id, p2.id); if (p1 && p3) recordOpponent(p1.id, p3.id);
    renderCourts(); saveData();
}

function stopGame(courtIdx) {
    const court = courts[courtIdx]; clearInterval(court.interval);
    court.players.forEach(p => { const pl = players.find(x => x.id === p.id); if(pl) { pl.gamesPlayed++; pl.sessionGames++; } });
    activeGameResolveCourtId = courtIdx; document.getElementById('winner-modal').style.display = 'flex';
}

function cancelStopGame() {
    const court = courts[activeGameResolveCourtId];
    court.players.forEach(p => { const pl = players.find(x => x.id === p.id); if(pl) { pl.gamesPlayed--; pl.sessionGames--; } });
    court.interval = setInterval(() => { court.timer++; document.getElementById(`timer-${activeGameResolveCourtId}`).innerText = formatTime(court.timer); }, 1000);
    document.getElementById('winner-modal').style.display = 'none'; activeGameResolveCourtId = null; renderCourts();
}

function resolveGame(winningTeamIdx) {
    const court = courts[activeGameResolveCourtId];
    document.getElementById('winner-modal').style.display = 'none';

    if (winningTeamIdx === -1) {
        court.players.forEach(p => sendToQueue(p.id));
        court.players = []; court.state = 'post_game';
    } else {
        const t1 = [court.players[0], court.players[1]];
        const t2 = [court.players[2], court.players[3]];
        let winners = (winningTeamIdx === 0) ? t1 : t2;
        let losers = (winningTeamIdx === 0) ? t2 : t1;
       
        if (court.gameStartTime) {
            const durationMs = Date.now() - court.gameStartTime;
            const durationMins = Math.round(durationMs / 60000); 
            if (durationMins >= 2) {
                completedGameTimes.push(durationMins);
                if (completedGameTimes.length > 5) completedGameTimes.shift(); 
            }
        }

// สร้าง Log โชว์หน้าเว็บ
        const newLog = {
            time: new Date().toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'}),
            court: activeGameResolveCourtId+1,
            winners: winners.map(p=>p.name).join(', '),
            losers: losers.map(p=>p.name).join(', '),
            duration: formatTime(court.timer),
        };
        matchLogs.unshift(newLog);

        // 👇 ส่งข้อมูลไปบันทึกลง Sheet (แท็บ DB_MatchLogs)
        if (typeof google !== 'undefined' && google.script) {
            const sheetLog = {
                logId: Date.now(),
                date: new Date().toLocaleString('th-TH'),
                courtName: court.customName || `คอร์ท ${activeGameResolveCourtId + 1}`,
                winners: newLog.winners,
                losers: newLog.losers,
                duration: newLog.duration,
                rule: court.rule || 'normal'
            };
            google.script.run.appendMatchLogToDB(JSON.stringify(sheetLog));
        }
        
        court.gameStartTime = null; 
        renderMatchLog();
       
        winners.forEach(p => {
            const pl = players.find(x => x.id === p.id);
            if(pl) { pl.wins++; pl.winStreak = (pl.winStreak || 0) + 1; pl.mmr = (pl.mmr || 0) + 25; }
        });
        losers.forEach(p => {
            const pl = players.find(x => x.id === p.id);
            if(pl) { pl.winStreak = 0; pl.mmr = (pl.mmr || 0) - 25; if (pl.mmr < 0) pl.mmr = 0; }
        });

        let stayers = [], leavers = [];
        const rule = court.rule || 'normal';
        if (rule === 'normal') {
            leavers.push(...t1, ...t2);
        } else {
            const q1 = players.find(x => x.id === t1[0].id).sessionGames;
            const q2 = players.find(x => x.id === t2[0].id).sessionGames;
            if (q1 < 2 && q2 < 2) {
                if (winningTeamIdx === 0) { stayers.push(...t1); leavers.push(...t2); }
                else { stayers.push(...t2); leavers.push(...t1); }
            } else {
                if (q1 >= 2) leavers.push(...t1); else stayers.push(...t1);
                if (q2 >= 2) leavers.push(...t2); else stayers.push(...t2);
            }
        }
        leavers.forEach(p => sendToQueue(p.id));
        court.players = [...stayers];
        court.state = 'post_game';
    }
    court.timer = 0;
    renderCourts();
    saveData();
}

function sendToQueue(playerId) { 
  const pl = players.find(x => x.id === playerId);
   if(pl) { pl.status = 'waiting'; pl.joinedQueueAt = Date.now(); pl.sessionGames = 0; pl.lastFinishedAt = Date.now(); } 
}

const kickPlayer = (courtIdx, slotIdx) => {
    const court = courts[courtIdx]; const player = court.players[slotIdx];
    if (!player) return;
    if (!confirm(`ต้องการเปลี่ยนตัว ${player.name} ออกใช่ไหม?`)) return;
    sendToQueue(player.id);
    court.players[slotIdx] = null;
    if (court.state === 'playing') { clearInterval(court.interval); court.state = 'empty'; }
    court.autoStartTarget = null;
    renderCourts();
};

function renderMatchLog() {
    const tbody = document.getElementById('match-log-body');
    if (matchLogs.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="color:gray;">-</td></tr>'; return; }
    tbody.innerHTML = matchLogs.map(log => `<tr><td>${log.time}</td><td>${log.court}</td><td class="log-winner">${log.winners}</td><td class="log-loser">${log.losers}</td><td>${log.duration}</td></tr>`).join('');
}

function updateDashboard() {
    const tbody = document.getElementById('stats-body');
    const sortType = document.getElementById('sort-select').value;
    let sorted = [...players].sort((a, b) => {
        if (sortType === 'games_desc') return b.gamesPlayed - a.gamesPlayed;
        if (sortType === 'games_asc') return a.gamesPlayed - b.gamesPlayed;
        if (sortType === 'wins_desc') return b.wins - a.wins;
        return 0;
    });
    tbody.innerHTML = sorted.map((p, index) => {
        let rank = index + 1; let medal = (rank === 1) ? '🥇' : (rank === 2) ? '🥈' : (rank === 3) ? '🥉' : '';
        const rate = p.gamesPlayed > 0 ? Math.round((p.wins / p.gamesPlayed) * 100) : 0;
        return `<tr><td>${medal} ${rank}</td><td>${p.name}</td><td style="font-weight:bold; color:#2980b9;">${p.mmr || 0}</td><td>${p.gamesPlayed}</td><td>${p.wins}</td><td>${rate}%</td></tr>`;
    }).join('');
}

function renderOverview(skipUpdateCost = false) {
    const statsBody = document.getElementById('overview-stats-body');
    const repeatBody = document.getElementById('overview-repeat-body');
    statsBody.innerHTML = players.map(p => {
        let time = p.checkInTime ? new Date(p.checkInTime).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'}) : '-';
        let costShow = p.calculatedCost ? Math.ceil(p.calculatedCost) : 0;
        return `<tr><td style="text-align:left">${p.name}</td><td>${time}</td><td>${p.gamesPlayed}</td><td>${p.wins}</td><td style="font-weight:bold; color:#27ae60;">${costShow} ฿</td></tr>`;
    }).join('');

    let repeats = [];
    for (const [key, count] of Object.entries(pairingHistory)) {
        if (count > 1) {
            const [id1, id2] = key.split('-');
            const p1 = players.find(p => p.id == id1); const p2 = players.find(p => p.id == id2);
            if (p1 && p2) repeats.push({ name: `${p1.name} + ${p2.name}`, count: count });
        }
    }
    repeats.sort((a, b) => b.count - a.count);
    repeatBody.innerHTML = repeats.length === 0 ? '<tr><td colspan="2" style="color:green;">ไม่มีคู่ซ้ำ</td></tr>' : repeats.map(s => `<tr><td style="text-align:left;">${s.name}</td><td style="color:#e65100; font-weight:bold;">${s.count}</td></tr>`).join('');
    if (!skipUpdateCost) updateCost();
}

let isCustomHours = false;
function toggleCustomHours() {
    isCustomHours = !isCustomHours;
    document.getElementById('custom-hours-area').style.display = isCustomHours ? 'block' : 'none';
    document.getElementById('std-hours-group').style.display = isCustomHours ? 'none' : 'flex';
    updateCustomHoursInputs(); updateCost();
}

function updateCustomHoursInputs() {
    const area = document.getElementById('custom-hours-area');
    area.innerHTML = '';
    for(let i=0; i<courtCount; i++) {
        area.innerHTML += `<div style="display:flex; justify-content:space-between; margin-bottom:5px;"><label>คอร์ท ${i+1}:</label><input type="number" class="court-hr-input" value="2" style="width:50px;" onchange="updateCost()"> ชม.</div>`;
    }
}

function updateCost() {
    const pricePerHr = parseFloat(document.getElementById('calc-court-price').value) || 0;
    let totalHours = 0;
    if (isCustomHours) document.querySelectorAll('.court-hr-input').forEach(inp => totalHours += parseFloat(inp.value) || 0);
    else totalHours = (parseFloat(document.getElementById('calc-hours').value) || 0) * (parseFloat(document.getElementById('calc-court-count').value) || 0);

    const shuttleTotal = (parseFloat(document.getElementById('calc-shuttle-price').value) || 0) / 12 * (parseFloat(document.getElementById('calc-shuttle-used').value) || 0);
    const grandTotal = (totalHours * pricePerHr) + shuttleTotal;
    document.getElementById('total-cost-display').innerText = grandTotal.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});

    const now = new Date(); let totalMinutesAllPlayers = 0;
    players.forEach(p => {
        if (p.checkInTime) {
            const diffMs = now - new Date(p.checkInTime);
            p.minutesPresent = Math.max(1, Math.floor(diffMs / 60000));
        } else p.minutesPresent = 0;
        totalMinutesAllPlayers += p.minutesPresent;
    });
    players.forEach(p => {
        if (totalMinutesAllPlayers > 0 && grandTotal > 0) p.calculatedCost = (p.minutesPresent / totalMinutesAllPlayers) * grandTotal;
        else p.calculatedCost = 0;
    });
    renderOverview(true);
}

function endSession() {
    // 👇 ส่งข้อมูลบิลรวมไปเก็บลง Sheet (แท็บ DB_Session) ก่อนโหลดรูป
    if (typeof google !== 'undefined' && google.script) {
        const sessionData = {
            date: new Date().toLocaleDateString('th-TH'),
            totalPlayers: players.length,
            totalMatches: matchLogs.length,
            shuttlesUsed: parseFloat(document.getElementById('calc-shuttle-used').value) || 0,
            totalCost: parseFloat(document.getElementById('total-cost-display').innerText.replace(/,/g, '')) || 0
        };
        google.script.run.appendSessionToDB(JSON.stringify(sessionData));
    }

    // แคปรูปตามเดิม
    const element = document.getElementById("summary-capture-area");
    html2canvas(element).then(canvas => {
        const link = document.createElement('a');
        link.download = 'badminton-summary.png';
        link.href = canvas.toDataURL();
        link.click();
    });
}

let currentBookingType = '';
const openBookingModal = (type) => {
    currentBookingType = type;
    const candidates = players.filter(p => !p.bookingId && !p.isResting).sort((a,b) => a.joinedQueueAt - b.joinedQueueAt);
    const options = candidates.map(p => `<option value="${p.id}">${p.name}${p.status === 'playing' ? ' (กำลังเล่น)' : ''}</option>`).join('');
    let html = '';
    if (type === 'pair') {
        html += `<h4>👥 จองคู่</h4><label>คนแรก:</label><select id="b-p1" style="width:100%; margin-bottom:10px;">${options}</select><label>คนที่สอง:</label><select id="b-p2" style="width:100%; margin-bottom:10px;">${options}</select>`;
    } else { 
        html += `<h4>⚔️ จอง 4</h4><strong style="color:#b71c1c;">T1:</strong><select id="b-p1" style="width:100%;">${options}</select><select id="b-p2" style="width:100%;">${options}</select><br><strong style="color:#0d47a1;">T2:</strong><select id="b-p3" style="width:100%;">${options}</select><select id="b-p4" style="width:100%;">${options}</select>`;
    }
    document.getElementById('booking-inputs').innerHTML = html;
    const actions = document.querySelector('#booking-modal .modal-actions');
    if (actions) { actions.style.display = 'flex'; actions.innerHTML = `<button class="secondary" onclick="closeModal('booking-modal')">ยกเลิก</button><button class="success" onclick="confirmBooking()">ยืนยัน</button>`; }
    document.getElementById('booking-modal').style.display = 'flex';
};

const confirmBooking = () => {
    const ids = [];
    if (currentBookingType === 'pair') {
        ids.push({id: document.getElementById('b-p1').value, team: 1});
        ids.push({id: document.getElementById('b-p2').value, team: 1});
    } else {
        ids.push({id: document.getElementById('b-p1').value, team: 1}); ids.push({id: document.getElementById('b-p2').value, team: 1});
        ids.push({id: document.getElementById('b-p3').value, team: 2}); ids.push({id: document.getElementById('b-p4').value, team: 2});
    }
    const unique = new Set(ids.map(x => x.id));
    if (unique.size !== ids.length) { alert('❌ ห้ามเลือกชื่อซ้ำ'); return; }
    const bId = 'book-' + (++bookingCounter);
    ids.forEach(x => { const p = players.find(pl => pl.id == x.id); if (p) { p.bookingId = bId; p.bookingTeam = x.team; } });
    closeModal('booking-modal'); updateQueueDisplay(); renderCourts(); saveData();
};

function updateQueueDisplay() {
    const list = document.getElementById('player-queue');
    const waiting = players.filter(p => p.status === 'waiting').sort((a, b) => a.joinedQueueAt - b.joinedQueueAt);
    document.getElementById('queue-count').innerText = waiting.length;

    list.innerHTML = waiting.map((p, index) => {
        const estimatedWaitMins = getWaitTimeForQueue(index);
        let badgeClass = 'wait-green'; let badgeText = `< ${estimatedWaitMins}m`;
        if (estimatedWaitMins > 20) { badgeClass = 'wait-red'; badgeText = `~${estimatedWaitMins}m`; }
        else if (estimatedWaitMins > 10) { badgeClass = 'wait-orange'; badgeText = `~${estimatedWaitMins}m`; }
        else if (estimatedWaitMins > 5) { badgeText = `~${estimatedWaitMins}m`; }
        else if (estimatedWaitMins > 0) { badgeText = `< ${estimatedWaitMins}m`; }
        else { badgeText = 'เร็วๆ นี้'; }

        const itemClass = p.isResting ? 'player-item resting' : `player-item ${p.bookingId ? 'booked' : ''} ${p.isFastPass ? 'fastpass' : ''}`;
        const opacityStyle = p.isResting ? 'opacity: 0.6; background: #ddd;' : '';
        const namePrefix = p.isResting ? '💤 ' : (p.isFastPass ? '🚀 ' : '');
        const lv = p.level || 'BG';
        const lvColor = LEVEL_COLORS[lv] || '#bdbdbd';
        const levelBadge = `<span onclick="toggleLevel(${p.id})" style="cursor:pointer; background:${lvColor}; color:white; padding:2px 6px; border-radius:4px; font-size:0.8em; margin-right:5px;">${lv}</span>`;
        
        // สัญลักษณ์เพศ
        const genderIcon = (p.gender === 'F') ? '👩' : '👨';
        const genderBadge = `<span onclick="toggleGender(${p.id})" style="cursor:pointer; font-size:1.1em; margin-right:5px; background:rgba(255,255,255,0.5); border-radius:50%; padding:0 2px;" title="คลิกสลับเพศ">${genderIcon}</span>`;

        const waitBadge = !p.isResting ? `<span class="wait-badge ${badgeClass}">${badgeText}</span>` : '<small style="color:gray;">(พัก)</small>';

        return `<li class="${itemClass}" style="${opacityStyle}"><div class="player-info">${!p.isResting ? levelBadge + genderBadge : ''}<strong>${namePrefix}${p.name}</strong>${p.bookingId ? `<small onclick="cancelBooking('${p.bookingId}')" style="cursor:pointer;">🔒</small>` : ''}${waitBadge}</div><button class="mini-btn ${p.isResting ? 'success' : 'secondary'}" style="margin-right:5px;" onclick="toggleRest(${p.id})">${p.isResting ? 'ตื่น' : '💤'}</button><button class="mini-btn danger" onclick="removePlayer(${p.id})">×</button></li>`;
    }).join('');
    updateNextMatchPanel();
}

function formatTime(s) { return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

const cancelBooking = (bId) => {
    const group = players.filter(p => p.bookingId === bId);
    if(group.length === 0) return;
    if(!confirm(`ยกเลิกจองกลุ่มนี้?`)) return;
    players.forEach(p => { if(p.bookingId === bId) { p.bookingId = null; p.bookingTeam = null; } });
    updateQueueDisplay(); saveData();
};

const toggleRest = (id) => { const p = players.find(x => x.id === id); if (p) { p.isResting = !p.isResting; updateQueueDisplay(); renderCourts(); } };

let currentManualAddCourtIdx = null;
const openManualAddModal = (courtIdx) => {
    if (countRealPlayers(courts[courtIdx]) >= 4) { alert('สนามเต็มแล้วเพื่อน!'); return; }
    currentManualAddCourtIdx = courtIdx;
    const waiting = players.filter(p => p.status === 'waiting' && !p.isResting).sort((a,b) => a.joinedQueueAt - b.joinedQueueAt);
    if (waiting.length === 0) { alert('ไม่มีคนรอคิวเลยว่ะ!'); return; }
    let html = `<h4>👇 เลือกคนลง คอร์ท ${courtIdx + 1}</h4><div style="display:flex; flex-direction:column; gap:5px;">`;
    waiting.forEach(p => {
        let label = p.bookingId ? `🔒 ${p.name} (Team)` : p.name;
        html += `<button class="secondary" style="text-align:left;" onclick="confirmManualAdd(${p.id})">${p.isFastPass?'🚀 ':''}${label}</button>`;
    });
    html += `</div>`;
    document.getElementById('booking-inputs').innerHTML = html;
    const modalActions = document.querySelector('#booking-modal .modal-actions');
    const oldActions = modalActions.innerHTML;
    modalActions.innerHTML = `<button class="secondary" onclick="closeModal('booking-modal'); restoreModal('${escape(oldActions)}');">ยกเลิก</button>`;
    document.getElementById('booking-modal').style.display = 'flex';
};

window.restoreModal = (oldContent) => { document.querySelector('#booking-modal .modal-actions').innerHTML = unescape(oldContent); };

const confirmManualAdd = (playerId) => {
    const court = courts[currentManualAddCourtIdx];
    const p = players.find(x => x.id === playerId);
    if (!p) return;
    if (countRealPlayers(court) >= 4) { alert('ช้าไป! สนามเต็มแล้ว'); return; }
    p.status = 'playing'; p.sessionGames = 0; if(p.isFastPass) p.isFastPass = false;
    p.bookingId = null; p.bookingTeam = null;
    addPlayerToCourt(court, p);
    closeModal('booking-modal');
    const actions = document.querySelector('#booking-modal .modal-actions');
    if (actions) actions.innerHTML = `<button class="secondary" onclick="closeModal('booking-modal')">ยกเลิก</button><button class="success" onclick="confirmBooking()">ยืนยัน</button>`;
    renderCourts();
};

function updateNextMatchPanel() {
    const container = document.getElementById('next-match-list');
    if (!container) return;
    const ruleEl = document.getElementById('game-rule');
    const rule = ruleEl ? ruleEl.value : 'normal';
    const needed = (rule === 'winner_stay') ? 2 : 4;
    let html = ''; let excludeIds = new Set();
    const matchesToShow = Math.min(courtCount, 4);

    for (let i = 0; i < matchesToShow; i++) {
        const candidates = getSmartDraft(needed, excludeIds);
        if (candidates.length < needed) {
            if (i === 0) html += `<div style="text-align:center; width:100%; color: #ccc;">⏳ รอคนครบทีม ...</div>`;
            break;
        }
        candidates.forEach(p => excludeIds.add(p.id));
        html += `<div style="background: rgba(255,255,255,0.1); padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); min-width: 200px;"><div style="font-size:0.8em; color:#ddd; margin-bottom:5px;">📢 Match ${i + 1}</div>`;
        const createCard = (p, color) => `<div style="background:white; color:#333; padding:4px 8px; margin:2px 0; border-radius:4px; border-left:4px solid ${color}; font-size:0.9em; display:flex; justify-content:space-between;"><span>${p.isFastPass?'🚀':''} ${p.name}</span>${p.bookingId ? '🔒' : ''}</div>`;
        if (needed === 4) {
            html += `<div style="display:flex; gap:5px;"><div style="flex:1;">${createCard(candidates[0], '#e74c3c')}${createCard(candidates[1], '#e74c3c')}</div><div style="display:flex; align-items:center;">VS</div><div style="flex:1;">${createCard(candidates[2], '#3498db')}${createCard(candidates[3], '#3498db')}</div></div>`;
        } else {
            html += `<div style="display:flex; flex-direction:column; gap:2px;">${createCard(candidates[0], '#f1c40f')}${createCard(candidates[1], '#f1c40f')}</div>`;
        }
        html += `</div>`;
    }
    container.innerHTML = html;
}

function editCourtName(idx) {
    const currentName = courts[idx].customName || `#${idx + 1}`;
    const newName = prompt(`ตั้งชื่อคอร์ทที่ ${idx + 1} ใหม่`, currentName);
    if (newName && newName.trim() !== "") { courts[idx].customName = newName.trim(); renderCourts(); }
}

function getAverageGameTime() {
    if (completedGameTimes.length === 0) return DEFAULT_GAME_TIME;
    const sum = completedGameTimes.reduce((a, b) => a + b, 0);
    return Math.round(sum / completedGameTimes.length);
}

function getWaitTimeForQueue(queueIndex) {
    const avgTime = getAverageGameTime();
    const now = Date.now();
    const gameRuleSelect = document.getElementById('game-rule');
    const isWinnerStay = gameRuleSelect && (gameRuleSelect.value.includes('2') || gameRuleSelect.value.includes('stay'));
    const spotsPerCourt = isWinnerStay ? 2 : 4;
    let availableSlots = [];
    
    courts.forEach(c => {
        const rule = c.rule || 'normal';
        const isWinnerStay = (rule === 'winner_stay');
        const spots = isWinnerStay ? 2 : 4;
        let freeAt = now;
        if (c.gameStartTime) {
            let expected = c.gameStartTime + (avgTime * 60000);
            if (expected < now) expected = now + 30000;
            freeAt = expected;
        }
        for (let k = 0; k < spots; k++) availableSlots.push(freeAt);
    });
    availableSlots.sort((a, b) => a - b);

    if (queueIndex < availableSlots.length) {
        const mySlotTime = availableSlots[queueIndex];
        return Math.max(0, Math.round((mySlotTime - now) / 60000));
    } else {
        const totalCapacity = availableSlots.length || 4;
        const cycles = Math.floor(queueIndex / totalCapacity);
        const remainder = queueIndex % totalCapacity;
        const baseSlotTime = availableSlots[remainder] || now;
        const waitMs = (baseSlotTime - now) + (cycles * avgTime * 60000);
        return Math.max(0, Math.round(waitMs / 60000));
    }
}

// 📡 LIVE SYNC
const isViewer = (typeof APP_MODE !== 'undefined' && APP_MODE === 'viewer');
let syncInterval = null;

if (isViewer) {
    console.log("👀 VIEW MODE ACTIVATED");
    document.body.classList.add('view-mode');
    google.script.run.withSuccessHandler(restoreState).syncLoadState();
    setInterval(() => { google.script.run.withSuccessHandler(restoreState).syncLoadState(); }, 15000);
}

function toggleBroadcast() {
    const btn = document.getElementById('btn-broadcast');
    if (syncInterval) {
        clearInterval(syncInterval); syncInterval = null; btn.innerHTML = '📡 เริ่ม Live'; btn.classList.remove('pulse'); alert('📴 จบการ Live แล้ว');
    } else {
        if(!confirm('เริ่ม "ถ่ายทอดสด" ไหม?')) return;
        syncInterval = setInterval(pushDataToCloud, 10000); pushDataToCloud();
        btn.innerHTML = '🔴 On Air'; btn.classList.add('pulse'); showShareLinkModal();
    }
}

function pushDataToCloud() {
    const state = { players: players, courts: courts, courtCount: courtCount, gameRule: 'normal', timestamp: Date.now() };
    google.script.run.syncSaveState(JSON.stringify(state));
    console.log("Cloud Synced ☁️");
}

function restoreState(json) {
    if (isModalOpen() || !json) return;
    const state = JSON.parse(json);
    players = state.players;
    if (state.courtCount) { courtCount = state.courtCount; document.getElementById('calc-court-count').value = courtCount; }
    courts = state.courts.map(c => { c.interval = null; return c; });
    renderCourts(); updateQueueDisplay(); updateNextMatchPanel();
}

function showShareLinkModal() {
    const baseUrl = (typeof APP_URL !== 'undefined' && APP_URL) ? APP_URL : window.location.href.split('?')[0];
    const viewerUrl = baseUrl + '?mode=viewer';
    const html = `<div style="text-align:center;"><h3>📡 ลิงก์สำหรับเพื่อน</h3><input type="text" value="${viewerUrl}" id="share-link-input" style="width:100%; padding:10px;"><button class="success" onclick="copyShareLink()">📋 Copy</button><button class="secondary" onclick="closeModal('booking-modal')">ปิด</button></div>`;
    document.getElementById('booking-inputs').innerHTML = html;
    document.getElementById('booking-modal').style.display = 'flex';
    document.querySelector('#booking-modal .modal-actions').style.display = 'none';
}

function copyShareLink() {
    const copyText = document.getElementById("share-link-input");
    copyText.select(); document.execCommand("copy"); alert("ก๊อปปี้แล้ว!");
}

init();
