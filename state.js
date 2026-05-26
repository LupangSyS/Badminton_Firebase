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
// --- LEVEL & BALANCING SYSTEM ---
const LEVEL_WEIGHTS = { 'BG': 1, 'N': 2, 'S': 3, 'P': 4 };
const RANK_LEVELS = ['BG', 'N', 'S', 'P'];
const LEVEL_COLORS = { 'BG': '#bdbdbd', 'N': '#66bb6a', 'S': '#ffa726', 'P': '#ef5350' };
const RANK_SCORES = { 'P': 4, 'S': 3, 'N': 2, 'BG': 1 };

