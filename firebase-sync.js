
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
console.log("Firebase is ready to use");

// 👇 เซ็ตระบบ Save แบบ Debounce
let saveTimeout = null;

function triggerSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveData(); 
    }, 1500); 
}

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

    if (typeof db !== 'undefined') {
        const roomIdToSave = currentRoomId ? currentRoomId : 'main-court'; 
        db.collection('rooms').doc(roomIdToSave).set(data)
          .then(() => console.log("☁️ Synced to Room:", roomIdToSave))
          .catch((error) => console.error("❌ Firebase Error: ", error));
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

function createRoom() {
    currentRoomId = generateRoomCode();
    isHost = true;
    
    // 🔥 ฝังชิปความจำลง sessionStorage!
    sessionStorage.setItem('ROOM_ID', currentRoomId);
    sessionStorage.setItem('IS_HOST', 'true');
    
    document.getElementById('landing-page').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    
    document.getElementById('display-room-id').innerText = currentRoomId;
    document.getElementById('display-role').innerText = "👑 HOST (คนคุม)";
    document.getElementById('display-role').style.background = "#e74c3c";
    
    if (players.length === 0) players = []; 
    syncFromFirebase();
    triggerSave(); 
}

// ... (ส่วน Config บนสุดปล่อยไว้เหมือนเดิม) ...

function joinRoom() {
    const codeInput = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (codeInput.length < 8) {
        alert("ใส่รหัสห้องให้ครบดิวะตาแหกดูด้วย!");
        return;
    }
    
    currentRoomId = codeInput;
    isHost = false;
    
    sessionStorage.setItem('ROOM_ID', currentRoomId);
    sessionStorage.setItem('IS_HOST', 'false');
    
    document.body.classList.add('view-mode');
    document.getElementById('landing-page').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    
    document.getElementById('display-room-id').innerText = currentRoomId;
    document.getElementById('display-role').innerText = "📱 VIEWER (ดูอย่างเดียว)";
    document.getElementById('display-role').style.background = "#7f8c8d";

    syncFromFirebase(); // 👈 เหลือแค่นี้พอ ท่อเดียวจบ!
}

function syncFromFirebase() {
    if (typeof db === 'undefined') return;
    
    db.collection('rooms').doc(currentRoomId).onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            
            players = data.players || [];
            courtCount = data.courtCount || 2;
            
            if (data.courts) {
                courts = data.courts;
            } else if (typeof courts !== 'undefined' && courts.length === 0) {
                for(let i=0; i<courtCount; i++) courts.push({ players: [], startTime: null });
            }
            
            pairingHistory = data.pairingHistory || {};
            opponentHistory = data.opponentHistory || {};
            completedGameTimes = data.completedGameTimes || [];
            
            renderCourts();
            updateQueueDisplay(); // 👈 กูแก้ชื่อให้ถูกแล้ว!
            updateDashboard();
            
            console.log("📡 ข้อมูล Sync จาก Firebase เรียบร้อย!");
        }
    });
}

