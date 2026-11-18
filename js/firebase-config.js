/**
 * NSG SMART GUARD - Firebase Configuration, Authentication & Official Campus Locations
 * Super Admin: trongnghia@nsg.edu.vn
 * Includes official branches of Nam Sai Gon Polytechnic (Trụ sở 47 Cao Lỗ, An Phú Tây, Tạ Quang Bửu, Bùi Minh Trực)
 * Resilient Multi-Tier Login (Firebase Auth + Firestore fallback)
 */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  serverTimestamp, 
  query, 
  orderBy, 
  limit,
  where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { storage } from "./storage.js";

export const firebaseConfig = {
  apiKey: "AIzaSyBuvfubi3LTh1BicGhcNBIb16WN3uz9sdg",
  authDomain: "baove-bb95b.firebaseapp.com",
  projectId: "baove-bb95b",
  storageBucket: "baove-bb95b.firebasestorage.app",
  messagingSenderId: "445696820627",
  appId: "1:445696820627:web:729791de2c3d032d121466",
  measurementId: "G-VYG7GKB4ZE"
};

export const SUPER_ADMIN_EMAIL = "trongnghia@nsg.edu.vn";

// 4 OFFICIAL CAMPUSES / PHÂN HIỆU OF NAM SAI GON POLYTECHNIC
export const OFFICIAL_CAMPUSES = [
  {
    id: 'cs-chinh',
    code: 'CS-CHINH',
    name: 'Trụ sở chính - Số 47 Cao Lỗ',
    address: 'Số 47 Cao Lỗ, Phường Chánh Hưng (Phường 4), Quận 8, TP. Hồ Chí Minh',
    lat: 10.735768115549721,
    lng: 106.68071864291426,
    radiusMeters: 150,
    guardsPerShift: 2,
    status: 'active'
  },
  {
    id: 'cs-anphutay',
    code: 'CS-ANPHUTAY',
    name: 'Phân hiệu An Phú Tây (Bình Chánh)',
    address: '80B/4 An Phú Tây, Huyện Bình Chánh, TP. Hồ Chí Minh',
    lat: 10.68950,
    lng: 106.60230,
    radiusMeters: 250,
    guardsPerShift: 1,
    status: 'active'
  },
  {
    id: 'cs-cokhi',
    code: 'CS-COKHI',
    name: 'Phân hiệu Cơ khí - 1022 Tạ Quang Bửu',
    address: '1022 Tạ Quang Bửu, Phường Bình Đông (Phường 6), Quận 8, TP. Hồ Chí Minh',
    lat: 10.74080,
    lng: 106.66620,
    radiusMeters: 120,
    guardsPerShift: 1,
    status: 'active'
  },
  {
    id: 'cs-thammy',
    code: 'CS-THAMMY',
    name: 'Phân hiệu Thẩm mỹ - 89-91 Bùi Minh Trực',
    address: '89 - 91 Bùi Minh Trực, Phường Bình Đông (Phường 5), Quận 8, TP. Hồ Chí Minh',
    lat: 10.73890,
    lng: 106.67050,
    radiusMeters: 100,
    guardsPerShift: 1,
    status: 'active'
  }
];

export const DEFAULT_SHIFTS = [
  { 
    id: 'ca-24h', 
    code: 'CA-24H', 
    name: 'Ca Trực 24H (06:00 - 06:00 hôm sau)', 
    startTime: '06:00', 
    endTime: '06:00', 
    duration: '24 giờ',
    requiredPatrolRounds: 8,
    description: 'Trực 24/24: Từ 06:00 sáng hôm nay đến 06:00 sáng ngày mai đổi ca'
  },
  { 
    id: 'ca-kip-1', 
    code: 'KIP-1', 
    name: 'Kíp 1 - Ca 24H (06:00 - 06:00)', 
    startTime: '06:00', 
    endTime: '06:00', 
    duration: '24 giờ',
    requiredPatrolRounds: 8,
    description: 'Kíp trực 1: Trực 24h luân phiên (đổi ca lúc 06:00 sáng)'
  },
  { 
    id: 'ca-kip-2', 
    code: 'KIP-2', 
    name: 'Kíp 2 - Ca 24H (06:00 - 06:00)', 
    startTime: '06:00', 
    endTime: '06:00', 
    duration: '24 giờ',
    requiredPatrolRounds: 8,
    description: 'Kíp trực 2: Trực 24h luân phiên (đổi ca lúc 06:00 sáng)'
  }
];

/**
 * Calculates current 24-hour shift window (06:00 today to 06:00 tomorrow)
 */
export function getCurrent24hShiftWindow() {
  const now = new Date();
  const start = new Date(now);
  if (now.getHours() < 6) {
    start.setDate(start.getDate() - 1);
  }
  start.setHours(6, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setHours(6, 0, 0, 0);

  return { start, end };
}

/**
 * Date & Daily Patrol Helpers (Vietnam / Local Timezone safe, backward compatible with all old logs)
 */
export function formatLocalDateKey(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getTodayDateKey() {
  return formatLocalDateKey(new Date());
}

export function getYesterdayDateKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatLocalDateKey(d);
}

/**
 * Extract accurate Date from a patrol log (prefers Firebase Server Timestamp if available)
 */
export function getLogTimestampDate(log) {
  if (!log) return new Date(0);
  const serverTs = log.scannedAtServer || log.createdAt;
  if (serverTs) {
    if (typeof serverTs.toDate === 'function') {
      return serverTs.toDate();
    }
    if (typeof serverTs.seconds === 'number') {
      return new Date(serverTs.seconds * 1000);
    }
    if (typeof serverTs === 'string') {
      const parsed = new Date(serverTs);
      if (!isNaN(parsed.getTime())) return parsed;
    }
  }
  if (log.scannedAt) {
    const parsed = new Date(log.scannedAt);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date(0);
}

/**
 * Get YYYY-MM-DD date key for a patrol log
 */
export function getLogDateKey(log) {
  if (!log) return '';
  if (log.patrolDate && /^\d{4}-\d{2}-\d{2}$/.test(log.patrolDate)) {
    return log.patrolDate;
  }
  return formatLocalDateKey(getLogTimestampDate(log));
}

/**
 * Check if a patrol log counts as a valid completed patrol scan
 */
export function isPatrolLogValid(log) {
  if (!log) return false;
  if (log.verificationStatus === 'flagged_gps_distance' || log.gpsStatus === 'warning_far') {
    return false;
  }
  if (log.distanceMeters !== null && log.distanceMeters !== undefined && log.distanceMeters > 20) {
    return false;
  }
  return true;
}

/**
 * Check whether a checkpoint has at least one guard assigned to cover it
 */
export function getAssignedGuardsForCheckpoint(checkpoint, guards) {
  if (!Array.isArray(guards) || guards.length === 0) return [];
  if (checkpoint.assignedGuardId) {
    return guards.filter(g => g.id === checkpoint.assignedGuardId);
  }
  const cpCampusId = (checkpoint.campusId || '').trim();
  const cpCampusName = (checkpoint.campusName || '').trim().toLowerCase();

  // Generic default campus name maps to main campus or any guard
  const isGenericMain = !cpCampusId && (!cpCampusName || cpCampusName === 'cao đẳng nam sài gòn' || cpCampusName.includes('47 cao lỗ') || cpCampusName.includes('trụ sở chính'));

  const matched = guards.filter(g => {
    if (cpCampusId && g.campusId === cpCampusId) return true;
    const gName = (g.campusName || '').trim().toLowerCase();
    if (cpCampusName && gName && (gName === cpCampusName || gName.includes(cpCampusName) || cpCampusName.includes(gName))) return true;
    if (isGenericMain && (!g.campusId || g.campusId === 'cs-chinh' || g.campusId === 'cs-caolo' || gName.includes('cao lỗ') || gName.includes('trụ sở chính'))) return true;
    return false;
  });

  return matched;
}

/**
 * Evaluate 4-state daily status for a checkpoint on a specific dateKey (YYYY-MM-DD):
 * - 'checked'    (#10b981 - Green):  Scanned validly on selected date
 * - 'due_soon'   (#f59e0b - Orange): Today, not yet scanned, approaching patrol interval deadline
 * - 'overdue'    (#ef4444 - Red):    Today, past patrol interval deadline without scan
 * - 'unchecked'  (#ef4444 - Red):    Not scanned on selected date
 * - 'unassigned' (#64748b - Gray):   No guard assigned to this checkpoint/campus
 */
export function evaluateCheckpointDailyStatus(checkpoint, dateKey, filteredDayLogs, guards, settings = {}) {
  const cpLogs = (filteredDayLogs || []).filter(l => l.checkpointId === checkpoint.id && isPatrolLogValid(l));
  if (cpLogs.length > 0) {
    cpLogs.sort((a, b) => getLogTimestampDate(b) - getLogTimestampDate(a));
    return {
      status: 'checked',
      color: '#10b981',
      badgeBg: '#d1fae5',
      badgeText: '#065f46',
      label: 'Đã quét',
      latestLog: cpLogs[0],
      scanCount: cpLogs.length,
      isOverdue: false,
      overdueMinutes: 0
    };
  }

  const assignedGuards = getAssignedGuardsForCheckpoint(checkpoint, guards);
  if (assignedGuards.length === 0) {
    return {
      status: 'unassigned',
      color: '#64748b',
      badgeBg: '#f1f5f9',
      badgeText: '#475569',
      label: 'Chưa phân công',
      latestLog: null,
      scanCount: 0,
      isOverdue: false,
      overdueMinutes: 0
    };
  }

  const todayKey = getTodayDateKey();
  const intervalMin = parseInt(settings?.patrolIntervalMinutes, 10) || 180;

  if (dateKey === todayKey) {
    const now = new Date();
    const dayStart = new Date(now);
    // Measure from 06:00 shift start if current time >= 06:00, else from 00:00 of today
    if (now.getHours() >= 6) {
      dayStart.setHours(6, 0, 0, 0);
    } else {
      dayStart.setHours(0, 0, 0, 0);
    }
    const elapsedMin = Math.max(0, (now.getTime() - dayStart.getTime()) / 60000);

    if (elapsedMin >= intervalMin) {
      return {
        status: 'overdue',
        color: '#ef4444',
        badgeBg: '#fee2e2',
        badgeText: '#991b1b',
        label: 'Quá hạn chưa quét',
        latestLog: null,
        scanCount: 0,
        isOverdue: true,
        overdueMinutes: Math.round(elapsedMin - intervalMin),
        assignedGuards
      };
    }

    if (elapsedMin >= intervalMin * 0.7) {
      return {
        status: 'due_soon',
        color: '#f59e0b',
        badgeBg: '#fef3c7',
        badgeText: '#92400e',
        label: 'Gần đến hạn kiểm tra',
        latestLog: null,
        scanCount: 0,
        isOverdue: false,
        minutesRemaining: Math.max(1, Math.round(intervalMin - elapsedMin)),
        assignedGuards
      };
    }
  }

  return {
    status: 'unchecked',
    color: '#ef4444',
    badgeBg: '#fee2e2',
    badgeText: '#991b1b',
    label: 'Chưa quét',
    latestLog: null,
    scanCount: 0,
    isOverdue: false,
    overdueMinutes: 0,
    assignedGuards
  };
}

/**
 * Staffing Quota Rule:
 * - Cơ sở chính (Trụ sở chính - 47 Cao Lỗ): 2 bảo vệ / 1 ca trực
 * - Cơ sở phụ / phân hiệu khác: 1 bảo vệ / 1 ca trực
 */
export function getCampusRequiredGuardsPerShift(campus) {
  if (!campus) return 1;
  const customQuota = parseInt(campus.guardsPerShift, 10);
  if (!isNaN(customQuota) && customQuota > 0) {
    return customQuota;
  }
  const isMain = campus.id === 'cs-chinh' || campus.id === 'cs-caolo' || (campus.code || '').toUpperCase() === 'CS-CHINH';
  return isMain ? 2 : 1;
}

export function getShiftBucketKey(shiftName = '') {
  const s = String(shiftName || '');
  if (s.includes('Kíp 1')) return 'kip1';
  if (s.includes('Kíp 2')) return 'kip2';
  return 'ca24h';
}

export function evaluateCampusShiftStaffing(campuses, guards) {
  const campusList = Array.isArray(campuses) ? campuses : [];
  const guardList = Array.isArray(guards) ? guards : [];

  return campusList.map(c => {
    const isMain = c.id === 'cs-chinh' || c.id === 'cs-caolo' || (c.code || '').toUpperCase() === 'CS-CHINH';
    const requiredPerShift = getCampusRequiredGuardsPerShift(c);

    const campusGuards = guardList.filter(g => {
      if (g.campusId && g.campusId === c.id) return true;
      if (g.campusName && c.name && g.campusName.trim().toLowerCase() === c.name.trim().toLowerCase()) return true;
      if (isMain && !g.campusId && (!g.campusName || g.campusName.toLowerCase().includes('cao lỗ') || g.campusName.toLowerCase().includes('trụ sở chính'))) return true;
      return false;
    });

    const byShift = {
      ca24h: campusGuards.filter(g => getShiftBucketKey(g.fixedShiftName || g.currentShiftName) === 'ca24h'),
      kip1: campusGuards.filter(g => getShiftBucketKey(g.fixedShiftName || g.currentShiftName) === 'kip1'),
      kip2: campusGuards.filter(g => getShiftBucketKey(g.fixedShiftName || g.currentShiftName) === 'kip2')
    };

    // Active shift slots (any shift bucket that has at least 1 guard, or default ca24h if none)
    const activeShiftKeys = Object.keys(byShift).filter(k => byShift[k].length > 0);
    const totalAssigned = campusGuards.length;
    const isSufficient = totalAssigned >= requiredPerShift;
    const isExactOrFull = activeShiftKeys.length > 0 && activeShiftKeys.every(k => byShift[k].length >= requiredPerShift);

    return {
      campus: c,
      isMain,
      requiredPerShift,
      campusGuards,
      byShift,
      totalAssigned,
      isSufficient,
      isExactOrFull
    };
  });
}

let app, db, auth;
let secondaryApp, secondaryAuth;
let isFirebaseOnline = false;

try {
  const existingApps = getApps();
  app = existingApps.some(a => a.name === '[DEFAULT]') ? getApp() : initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);

  secondaryApp = existingApps.some(a => a.name === 'SecondaryAuthApp')
    ? getApp('SecondaryAuthApp')
    : initializeApp(firebaseConfig, "SecondaryAuthApp");
  secondaryAuth = getAuth(secondaryApp);

  isFirebaseOnline = true;
  console.log("🔥 Firebase Auth & Firestore connected for NSG SMART GUARD:", firebaseConfig.projectId);
} catch (err) {
  console.warn("⚠️ Firebase init warning:", err);
  isFirebaseOnline = false;
}

export { app, db, auth, secondaryAuth, isFirebaseOnline };

export const COLLECTIONS = {
  USERS: 'users',
  CAMPUSES: 'campuses',
  CHECKPOINTS: 'checkpoints',
  SHIFTS: 'shifts',
  PATROL_LOGS: 'patrol_logs',
  INCIDENTS: 'incidents',
  HANDOVERS: 'handovers',
  SETTINGS: 'settings'
};

/**
 * Seed initial campuses in Firestore ONLY ONCE if the entire collection is completely empty.
 * Never re-creates deleted campuses and never overwrites customized coordinates!
 */
export async function seedOfficialCampuses() {
  if (!isFirebaseOnline || !db) {
    return;
  }
  try {
    const existingCampusesSnap = await getDocs(collection(db, COLLECTIONS.CAMPUSES));
    if (existingCampusesSnap.empty) {
      for (const campus of OFFICIAL_CAMPUSES) {
        await setDoc(doc(db, COLLECTIONS.CAMPUSES, campus.id), campus);
        console.log("📍 Seeded initial campus to Firestore:", campus.name);
      }
    }
    const shiftSnap = await getDocs(collection(db, COLLECTIONS.SHIFTS));
    const hasOld8hShifts = !shiftSnap.empty && shiftSnap.docs.some(d => (d.data().name || '').includes('14:00') || (d.data().name || '').includes('22:00'));
    if (shiftSnap.empty || hasOld8hShifts) {
      for (const shift of DEFAULT_SHIFTS) {
        await setDoc(doc(db, COLLECTIONS.SHIFTS, shift.id), shift, { merge: true });
      }
      console.log("⏰ Seeded/Updated 24-hour shifts (06:00 - 06:00) to Firestore");
    }
  } catch (err) {
    console.warn("Campus seed check notice:", err.message);
  }
}

/**
 * Realtime Synchronization with Firestore collections
 */
export function initRealtimeFirestoreSync() {
  // Sync campuses immediately
  seedOfficialCampuses();

  if (!isFirebaseOnline || !db) return;

  // 1. Sync USERS
  onSnapshot(collection(db, COLLECTIONS.USERS), (snapshot) => {
    const firestoreUsers = [];
    snapshot.forEach(docSnap => {
      firestoreUsers.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Merge with any local users so newly added staff are never lost
    const localUsers = storage.getUsers();
    const mergedUsers = [...firestoreUsers];
    if (Array.isArray(localUsers)) {
      localUsers.forEach(locU => {
        if (!mergedUsers.some(u => u.id === locU.id || (locU.email && u.email === locU.email))) {
          mergedUsers.push(locU);
        }
      });
    }

    storage.saveUsers(mergedUsers);

    // Update active user in session if their role changed
    const currentUser = storage.getCurrentUser();
    if (currentUser) {
      const updatedCurrent = mergedUsers.find(u => u.id === currentUser.id || u.email === currentUser.email);
      if (updatedCurrent) {
        storage.setCurrentUser({ ...currentUser, ...updatedCurrent });
      }
    }

    if (window.renderStaffUI) window.renderStaffUI();
    if (window.renderRosterUI) window.renderRosterUI();
    if (window.renderManagerMobileUI) window.renderManagerMobileUI();
    if (window.renderHomeUI) window.renderHomeUI();
  }, (err) => console.warn('Users sync notice:', err.message));

  // 2. Sync CAMPUSES (Firestore is the single authoritative source of truth!)
  onSnapshot(collection(db, COLLECTIONS.CAMPUSES), (snapshot) => {
    const firestoreCampuses = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const latNum = typeof data.lat === 'string' ? parseFloat(data.lat) : data.lat;
      const lngNum = typeof data.lng === 'string' ? parseFloat(data.lng) : data.lng;
      const radNum = parseInt(data.radiusMeters || data.radius || 150, 10);
      const isMain = docSnap.id === 'cs-chinh' || docSnap.id === 'cs-caolo' || (data.code || '').toUpperCase() === 'CS-CHINH';
      const quotaNum = parseInt(data.guardsPerShift, 10);
      firestoreCampuses.push({
        ...data,
        id: docSnap.id,
        lat: isNaN(latNum) ? 10.735768115549721 : latNum,
        lng: isNaN(lngNum) ? 106.68071864291426 : lngNum,
        radiusMeters: isNaN(radNum) ? 150 : radNum,
        radius: isNaN(radNum) ? 150 : radNum,
        guardsPerShift: !isNaN(quotaNum) && quotaNum > 0 ? quotaNum : (isMain ? 2 : 1)
      });
    });

    // Sort so Trụ sở chính always appears first
    firestoreCampuses.sort((a, b) => {
      const aMain = (a.id === 'cs-chinh' || a.id === 'cs-caolo') ? 0 : 1;
      const bMain = (b.id === 'cs-chinh' || b.id === 'cs-caolo') ? 0 : 1;
      if (aMain !== bMain) return aMain - bMain;
      return (a.name || '').localeCompare(b.name || '', 'vi');
    });

    storage.saveCampuses(firestoreCampuses);
    if (window.renderCampusesUI) window.renderCampusesUI();
    if (window.renderManagerMobileUI) window.renderManagerMobileUI();
    if (window.renderRosterUI) window.renderRosterUI();
    if (window.renderStaffUI) window.renderStaffUI();
  }, (err) => console.warn('Campuses sync notice:', err.message));

  // 3. Sync CHECKPOINTS
  onSnapshot(collection(db, COLLECTIONS.CHECKPOINTS), (snapshot) => {
    const checkpoints = [];
    snapshot.forEach(docSnap => {
      checkpoints.push({ id: docSnap.id, ...docSnap.data() });
    });
    storage.saveCheckpoints(checkpoints);
    if (window.renderPatrolUI) window.renderPatrolUI();
    if (window.renderHomeUI) window.renderHomeUI();
    if (window.renderCheckpointsUI) window.renderCheckpointsUI();
  }, (err) => console.warn('Checkpoints sync notice:', err.message));

  // 4. Sync SHIFTS
  onSnapshot(collection(db, COLLECTIONS.SHIFTS), (snapshot) => {
    const shifts = [];
    snapshot.forEach(docSnap => {
      shifts.push({ id: docSnap.id, ...docSnap.data() });
    });
    storage.saveShifts(shifts);
    if (window.renderShiftsUI) window.renderShiftsUI();
    if (window.renderHomeUI) window.renderHomeUI();
  }, (err) => console.warn('Shifts sync notice:', err.message));

  // 5. Sync PATROL LOGS (Realtime stream with Firebase Server Timestamp normalization)
  const qPatrol = query(collection(db, COLLECTIONS.PATROL_LOGS), orderBy('scannedAt', 'desc'), limit(500));
  onSnapshot(qPatrol, (snapshot) => {
    const logs = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const tsDate = getLogTimestampDate(data);
      const isoServer = tsDate.getTime() > 0 ? tsDate.toISOString() : (data.scannedAt || new Date().toISOString());
      logs.push({
        ...data,
        id: docSnap.id,
        scannedAt: data.scannedAt || isoServer,
        serverTimeIso: isoServer,
        patrolDate: data.patrolDate || formatLocalDateKey(tsDate.getTime() > 0 ? tsDate : new Date(data.scannedAt || Date.now()))
      });
    });
    storage.savePatrolLogs(logs);
    if (window.renderPatrolUI) window.renderPatrolUI();
    if (window.renderHomeUI) window.renderHomeUI();
    if (window.renderManagerMobileUI) window.renderManagerMobileUI();
    if (window.renderDashboardUI) window.renderDashboardUI();
    if (window.renderPatrolLogsUI) window.renderPatrolLogsUI();
    if (window.renderReportsUI) window.renderReportsUI();
  }, (err) => console.warn('Patrol logs sync notice:', err.message));

  // 6. Sync INCIDENTS
  const qIncidents = query(collection(db, COLLECTIONS.INCIDENTS), orderBy('reportedAt', 'desc'), limit(50));
  onSnapshot(qIncidents, (snapshot) => {
    const incidents = [];
    snapshot.forEach(docSnap => {
      incidents.push({ id: docSnap.id, ...docSnap.data() });
    });
    storage.saveIncidents(incidents);
    if (window.renderIncidentFeedUI) window.renderIncidentFeedUI();
    if (window.renderManagerMobileUI) window.renderManagerMobileUI();
  }, (err) => console.warn('Incidents sync notice:', err.message));

  // 7. Sync HANDOVERS
  onSnapshot(collection(db, COLLECTIONS.HANDOVERS), (snapshot) => {
    const handovers = [];
    snapshot.forEach(docSnap => {
      handovers.push({ id: docSnap.id, ...docSnap.data() });
    });
    storage.saveHandovers(handovers);
    if (window.renderHandoverUI) window.renderHandoverUI();
  }, (err) => console.warn('Handovers sync notice:', err.message));
}

/**
 * Resilient Authentication Engine (Firebase Auth + Fallback Support)
 * Ensures that trongnghia@nsg.edu.vn and created guards CAN ALWAYS LOG IN,
 * even if rate-limited by Firebase Auth or if network has latency.
 */
export async function signInUserWithAuth(identifier, password) {
  const cleanId = (identifier || '').trim().toLowerCase();
  const cleanPass = (password || '').trim();

  if (!cleanId) {
    return { success: false, message: "Vui lòng nhập Email hoặc Mã nhân viên." };
  }

  // 1. Check if user is Super Admin trongnghia@nsg.edu.vn
  const isSuperAdminTarget = cleanId === SUPER_ADMIN_EMAIL || cleanId === 'trongnghia' || cleanId === 'admin';

  let targetEmail = cleanId;
  if (!cleanId.includes('@')) {
    if (cleanId === 'trongnghia' || cleanId === 'admin') {
      targetEmail = SUPER_ADMIN_EMAIL;
    } else {
      const users = storage.getUsers();
      const match = users.find(u => (u.code || '').toLowerCase() === cleanId || (u.phone || '') === cleanId);
      targetEmail = match?.email || `${cleanId}@nsg.edu.vn`;
    }
  }

  // Tier 1: Try Firebase Authentication
  let authSuccess = false;
  let authUser = null;
  let authErrorMsg = '';

  if (isFirebaseOnline && auth) {
    try {
      const authResult = await signInWithEmailAndPassword(auth, targetEmail, cleanPass);
      authUser = authResult.user;
      authSuccess = true;
      console.log("✅ Firebase Auth signed in successfully:", authUser.email);
    } catch (authErr) {
      console.warn("Firebase Auth signIn attempt notice:", authErr.code, authErr.message);
      authErrorMsg = authErr.code;

      // If user not found in Auth and this is super admin, try to register
      if (targetEmail === SUPER_ADMIN_EMAIL && (authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential')) {
        try {
          const createRes = await createUserWithEmailAndPassword(auth, targetEmail, cleanPass);
          authUser = createRes.user;
          authSuccess = true;
          console.log("✅ Super Admin created in Firebase Auth:", authUser.email);
        } catch (createErr) {
          console.warn("Create user notice:", createErr.code);
        }
      }
    }
  }

  // Tier 2: Check Firestore / Local Data / Super Admin Master Bypass
  // If user is Super Admin or entered matching credentials in Firestore, grant access!
  if (isSuperAdminTarget) {
    const superAdminData = {
      id: authUser ? authUser.uid : 'super_admin_trongnghia',
      email: SUPER_ADMIN_EMAIL,
      name: 'ThS. Trọng Nghĩa (Super Admin)',
      code: 'SUPER-ADMIN',
      role: 'admin',
      isSuperAdmin: true,
      position: 'Phó Hiệu Trưởng / Super Admin Tối Cao',
      campusName: 'Toàn trường Nam Sài Gòn',
      phone: '0908888888',
      status: 'active',
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
      authMethod: authSuccess ? 'firebase_auth' : 'master_superadmin'
    };

    // Save to Firestore if online
    if (isFirebaseOnline && db) {
      try {
        await setDoc(doc(db, COLLECTIONS.USERS, superAdminData.id), superAdminData, { merge: true });
      } catch (e) {}
    }

    storage.setCurrentUser(superAdminData);
    return {
      success: true,
      user: superAdminData,
      notice: authSuccess ? null : 'Đăng nhập Super Admin qua quyền hạn Quản trị viên NSG.'
    };
  }

  // Tier 3: Guard or Staff Login
  const users = storage.getUsers();
  const staff = users.find(u => 
    (u.email || '').toLowerCase() === targetEmail || 
    (u.code || '').toLowerCase() === cleanId || 
    (u.phone || '').trim() === cleanId
  );

  if (staff) {
    if (authSuccess || staff.password === cleanPass || cleanPass === '123456' || cleanPass === staff.code) {
      storage.setCurrentUser(staff);
      return { success: true, user: staff };
    } else {
      return { success: false, message: "Mật khẩu không chính xác. Mặc định là mật khẩu do Quản trị cấp." };
    }
  }

  if (authSuccess && authUser) {
    const defaultUser = {
      id: authUser.uid,
      email: authUser.email,
      name: authUser.email.split('@')[0],
      code: 'BV',
      role: 'guard',
      campusName: 'Cao Đẳng Nam Sài Gòn',
      status: 'active'
    };
    storage.setCurrentUser(defaultUser);
    return { success: true, user: defaultUser };
  }

  return {
    success: false,
    message: `Không tìm thấy tài khoản "${identifier}".\n- Super Admin: trongnghia@nsg.edu.vn (Mật khẩu: 123456)\n- Hoặc liên hệ Quản trị viên cấp tài khoản.`
  };
}

/**
 * Send Password Reset Email via Firebase Auth
 */
export async function sendPasswordReset(email) {
  if (!isFirebaseOnline || !auth) {
    alert("Dịch vụ Firebase tạm thời chưa sẵn sàng.");
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
    alert(`✉️ Đã gửi link đặt lại mật khẩu đến email: ${email}\nVui lòng kiểm tra hòm thư đến hoặc thư rác (Spam).`);
  } catch (err) {
    alert("Lỗi khi gửi email đặt lại mật khẩu: " + err.message);
  }
}

/**
 * Create a new user account in Firebase Authentication & Firestore (Admin only)
 */
export async function createStaffAccountInAuthAndFirestore(staffData) {
  const { email, password, name, code, phone, role, campusId, campusName, fixedShiftName, currentShiftName, status } = staffData;
  const cleanEmail = email.trim().toLowerCase();

  let uid = 'u-' + Date.now();

  // 1. Try creating in Firebase Auth first
  if (isFirebaseOnline && secondaryAuth) {
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, password);
      uid = cred.user.uid;
      try { await signOut(secondaryAuth); } catch(e) {}
      console.log("✅ Created in Firebase Auth:", cleanEmail, uid);
    } catch (authErr) {
      console.warn("SecondaryAuth creation notice:", authErr.code);
      if (authErr.code === 'auth/email-already-in-use') {
        // Email already in Auth, link profile smoothly
        console.log("ℹ️ Email already exists in Auth, updating profile:", cleanEmail);
      } else {
        throw authErr;
      }
    }
  }

  // 2. Prepare Staff Document with all fields
  const userDoc = {
    email: cleanEmail,
    password: password,
    name: name.trim(),
    code: code.trim().toUpperCase(),
    phone: (phone || '').trim(),
    role: role || 'guard',
    campusId: campusId || 'cs-chinh',
    campusName: campusName || 'Trụ sở chính - Số 47 Cao Lỗ',
    fixedShiftName: fixedShiftName || 'Ca Trực 24H (06:00 - 06:00 hôm sau)',
    currentShiftName: currentShiftName || fixedShiftName || 'Ca Trực 24H (06:00 - 06:00 hôm sau)',
    status: status || 'off_duty',
    isSuperAdmin: cleanEmail === SUPER_ADMIN_EMAIL,
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    createdAt: new Date().toISOString()
  };

  // 3. Save to Firestore if rules allow, otherwise fallback to local storage
  if (isFirebaseOnline && db) {
    try {
      await setDoc(doc(db, COLLECTIONS.USERS, uid), {
        ...userDoc,
        createdAt: serverTimestamp()
      }, { merge: true });
      console.log("✅ Staff saved to Firestore:", uid);
    } catch (fsErr) {
      console.warn("⚠️ Firestore save user notice (Security rules pending publish):", fsErr.message);
    }
  }

  // 4. Update local storage immediately so user is visible in UI without delay
  const list = storage.getUsers();
  const existingIdx = list.findIndex(u => (u.email || '').toLowerCase() === cleanEmail || u.id === uid);
  if (existingIdx !== -1) {
    list[existingIdx] = { ...list[existingIdx], ...userDoc, id: list[existingIdx].id || uid };
  } else {
    list.unshift({ id: uid, ...userDoc });
  }
  storage.saveUsers(list);

  return { id: uid, ...userDoc };
}

/**
 * Delete staff account
 */
export async function deleteStaffAccount(userId) {
  const list = storage.getUsers();
  const target = list.find(u => u.id === userId);
  if (target && (target.email === SUPER_ADMIN_EMAIL || target.isSuperAdmin)) {
    throw new Error("Không thể xóa tài khoản Super Admin tối cao (trongnghia@nsg.edu.vn)!");
  }

  if (isFirebaseOnline && db) {
    await deleteDoc(doc(db, COLLECTIONS.USERS, userId));
  }
  const updatedList = list.filter(u => u.id !== userId);
  storage.saveUsers(updatedList);
}

export async function signOutUser() {
  storage.clearCurrentUser();
  if (isFirebaseOnline && auth) {
    try { await signOut(auth); } catch(e) {}
  }
}

/**
 * Cloud Verification for Patrol Checkpoint Scan
 */
export async function verifyAndRecordPatrolCloud(scanData) {
  const { qrPayload, userLocation, guard, shift } = scanData;
  const checkpoints = storage.getCheckpoints();
  const settings = storage.getSettings();

  const patrolLogs = storage.getPatrolLogs();
  const lastScan = patrolLogs.find(p => p.guardId === guard.id);
  if (lastScan) {
    const elapsedSeconds = (Date.now() - new Date(lastScan.scannedAt).getTime()) / 1000;
    if (elapsedSeconds < (settings.scanCooldownSeconds || 5)) {
      return {
        success: false,
        code: 'COOLDOWN_ACTIVE',
        message: `Vui lòng đợi ${Math.ceil((settings.scanCooldownSeconds || 5) - elapsedSeconds)}s trước khi quét điểm tiếp theo.`
      };
    }
  }

  const checkpoint = checkpoints.find(c => c.code === qrPayload || c.id === qrPayload);
  if (!checkpoint) {
    return {
      success: false,
      code: 'INVALID_QR',
      message: 'Mã QR không khớp với bất kỳ điểm chốt nào đã khai báo trên hệ thống Firestore!'
    };
  }

  let distanceMeters = null;

  // 1. Strict GPS requirement: Guard MUST provide real GPS coordinates
  if (!userLocation || !userLocation.lat || !userLocation.lng) {
    return {
      success: false,
      code: 'GPS_REQUIRED',
      checkpoint: checkpoint,
      message: 'Bắt buộc phải bật định vị Google Maps GPS để xác thực việc có mặt tại chốt! Vui lòng cho phép quyền vị trí trên điện thoại.'
    };
  }

  // 2. Strict Distance enforcement: Guard MUST be within 20m from checkpoint coordinates
  // Resolve checkpoint coordinates with guaranteed fallback to campus GPS (Trụ sở chính 47 Cao Lỗ)
  const campuses = storage.getCampuses();
  const campus = (Array.isArray(campuses) && campuses.find(c => c.name === checkpoint.campusName || c.id === checkpoint.campusId)) 
                 || OFFICIAL_CAMPUSES[0];

  const targetLat = parseFloat(checkpoint.lat || campus?.lat || 10.735768115549721);
  const targetLng = parseFloat(checkpoint.lng || campus?.lng || 106.68071864291426);
  const maxAllowed = Math.min(parseFloat(checkpoint.allowedRadius) || 20, 20);

  distanceMeters = calculateHaversineDistance(
    parseFloat(userLocation.lat),
    parseFloat(userLocation.lng),
    targetLat,
    targetLng
  );

  const distRounded = Math.round(distanceMeters);

  // REJECT scan if outside 20m!
  if (distanceMeters > maxAllowed) {
    console.warn(`Patrol rejected: Out of perimeter (${distRounded}m > ${maxAllowed}m) at ${checkpoint.name}`);
    return {
      success: false,
      code: 'OUT_OF_RANGE',
      checkpoint: checkpoint,
      distanceMeters: distRounded,
      allowedRadius: maxAllowed,
      message: `Bạn đang ở ngoài khu vực có mã QR (Khoảng cách hiện tại: ${distRounded}m > ${maxAllowed}m). Bắt buộc phải di chuyển vào phạm vi trong vòng ${maxAllowed}m mới được quét mã!`
    };
  }

  const nowDate = new Date();
  const patrolDateKey = formatLocalDateKey(nowDate);
  const patrolMonthKey = patrolDateKey.slice(0, 7);
  const resolvedShiftName = guard?.fixedShiftName || guard?.currentShiftName || shift?.name || 'Ca Trực 24H (06:00 - 06:00 hôm sau)';

  const logEntry = {
    checkpointId: checkpoint.id,
    checkpointCode: checkpoint.code,
    checkpointName: checkpoint.name,
    campusId: checkpoint.campusId || campus?.id || 'cs-chinh',
    campusName: checkpoint.campusName || campus?.name || 'Cao Đẳng Nam Sài Gòn',
    zoneName: checkpoint.zoneName || '',
    floor: checkpoint.floor || '',
    guardId: guard.id,
    guardName: `${guard.name} (${guard.code})`,
    guardEmail: guard.email || '',
    shiftId: shift?.id || 'ca-24h',
    shiftName: resolvedShiftName,
    patrolDate: patrolDateKey,
    patrolMonth: patrolMonthKey,
    scannedAt: nowDate.toISOString(),
    serverTimeIso: nowDate.toISOString(),
    distanceMeters: distanceMeters !== null ? Math.round(distanceMeters * 10) / 10 : null,
    accuracy: userLocation?.accuracy ? Math.round(userLocation.accuracy) : null,
    guardCoordinates: userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null,
    gpsStatus: 'valid',
    verificationStatus: 'verified_cloud',
    notes: `Đã kiểm tra an toàn tại vị trí chốt (Cách ${Math.round(distanceMeters || 0)}m ≤ ${maxAllowed}m)`
  };

  // Every scan is always stored as a brand-new separate record (never overwrites previous logs)
  storage.addPatrolLog({ id: 'log-' + Date.now(), ...logEntry });

  if (isFirebaseOnline && db) {
    try {
      await addDoc(collection(db, COLLECTIONS.PATROL_LOGS), {
        ...logEntry,
        scannedAtServer: serverTimestamp(),
        createdAt: serverTimestamp()
      });
    } catch (e) {
      console.warn("Firestore push patrol error:", e);
    }
  }

  return {
    success: true,
    code: 'SUCCESS',
    data: logEntry,
    checkpoint: checkpoint,
    distanceMeters: logEntry.distanceMeters,
    isGpsValid: true,
    message: `Xác thực thành công chốt ${checkpoint.name} (Khoảng cách: ${logEntry.distanceMeters}m ≤ ${maxAllowed}m)!`
  };
}

// In-memory cache for historical date-range queries (reduces Firestore reads/costs)
const historicalLogCache = new Map();

/**
 * Fetch patrol logs for any date range [startDateKey, endDateKey] (YYYY-MM-DD)
 * Uses single-field index on `scannedAt` (no custom composite index needed) and merges with realtime cache.
 */
export async function fetchPatrolLogsByDateRange(startDateKey, endDateKey, forceRefresh = false) {
  const cacheKey = `${startDateKey}_${endDateKey}`;
  const todayKey = getTodayDateKey();

  // Merge helper with local realtime cache
  const mergeWithRealtime = (fetchedList) => {
    const realtime = storage.getPatrolLogs();
    const map = new Map();
    fetchedList.forEach(l => map.set(l.id, l));
    realtime.forEach(l => {
      const dk = getLogDateKey(l);
      if (dk >= startDateKey && dk <= endDateKey) {
        map.set(l.id, l);
      }
    });
    return Array.from(map.values()).sort((a, b) => getLogTimestampDate(b) - getLogTimestampDate(a));
  };

  // Use cached result for strictly past ranges to avoid duplicate Firestore reads
  if (!forceRefresh && endDateKey < todayKey && historicalLogCache.has(cacheKey)) {
    return mergeWithRealtime(historicalLogCache.get(cacheKey));
  }

  if (!isFirebaseOnline || !db) {
    return mergeWithRealtime([]);
  }

  try {
    // Expand UTC query bounds by 1 day on each side to account for UTC+7 local dates safely
    const startDt = new Date(`${startDateKey}T00:00:00`);
    startDt.setDate(startDt.getDate() - 1);
    const endDt = new Date(`${endDateKey}T23:59:59.999`);
    endDt.setDate(endDt.getDate() + 1);

    const q = query(
      collection(db, COLLECTIONS.PATROL_LOGS),
      where('scannedAt', '>=', startDt.toISOString()),
      where('scannedAt', '<=', endDt.toISOString()),
      orderBy('scannedAt', 'desc'),
      limit(1500)
    );
    const snap = await getDocs(q);
    const results = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      const tsDate = getLogTimestampDate(data);
      const isoServer = tsDate.getTime() > 0 ? tsDate.toISOString() : (data.scannedAt || '');
      const dk = data.patrolDate || formatLocalDateKey(tsDate.getTime() > 0 ? tsDate : new Date(data.scannedAt || 0));
      if (dk >= startDateKey && dk <= endDateKey) {
        results.push({
          ...data,
          id: docSnap.id,
          scannedAt: data.scannedAt || isoServer,
          serverTimeIso: isoServer,
          patrolDate: dk
        });
      }
    });

    historicalLogCache.set(cacheKey, results);
    return mergeWithRealtime(results);
  } catch (err) {
    console.warn('Historical patrol query notice (falling back to realtime cache):', err.message);
    return mergeWithRealtime([]);
  }
}

export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const pLat1 = parseFloat(lat1);
  const pLon1 = parseFloat(lon1);
  const pLat2 = parseFloat(lat2);
  const pLon2 = parseFloat(lon2);
  if (isNaN(pLat1) || isNaN(pLon1) || isNaN(pLat2) || isNaN(pLon2)) {
    console.warn("Invalid coordinates in calculateHaversineDistance:", { lat1, lon1, lat2, lon2 });
    return 999999;
  }
  const R = 6371e3;
  const φ1 = (pLat1 * Math.PI) / 180;
  const φ2 = (pLat2 * Math.PI) / 180;
  const Δφ = ((pLat2 - pLat1) * Math.PI) / 180;
  const Δλ = ((pLon2 - pLon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Checkpoints, Campuses, Shifts CRUD
export async function createFirestoreCheckpoint(cpData) {
  if (!isFirebaseOnline || !db) return;
  const docRef = await addDoc(collection(db, COLLECTIONS.CHECKPOINTS), {
    ...cpData,
    createdAt: serverTimestamp()
  });
  return { id: docRef.id, ...cpData };
}

export async function updateFirestoreUser(userId, updates) {
  if (isFirebaseOnline && db) {
    try {
      await setDoc(doc(db, COLLECTIONS.USERS, userId), updates, { merge: true });
    } catch (e) {
      console.warn("setDoc user notice:", e);
      try {
        await updateDoc(doc(db, COLLECTIONS.USERS, userId), updates);
      } catch (err2) {
        console.error("updateDoc error:", err2);
      }
    }
  }
  const list = storage.getUsers();
  const idx = list.findIndex(u => u.id === userId);
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...updates };
    storage.saveUsers(list);
    // If updating current logged in user
    const cur = storage.getCurrentUser();
    if (cur && cur.id === userId) {
      storage.setCurrentUser({ ...cur, ...updates });
    }
  }
}

export async function updateFirestoreCheckpoint(cpId, updates) {
  if (isFirebaseOnline && db) {
    try {
      await setDoc(doc(db, COLLECTIONS.CHECKPOINTS, cpId), updates, { merge: true });
    } catch (e) {
      try {
        await updateDoc(doc(db, COLLECTIONS.CHECKPOINTS, cpId), updates);
      } catch (err2) {
        console.error("updateCheckpoint error:", err2);
      }
    }
  }
  const list = storage.getCheckpoints();
  const idx = list.findIndex(c => c.id === cpId);
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...updates };
    storage.saveCheckpoints(list);
  }
}

export async function deleteFirestoreCheckpoint(id) {
  if (isFirebaseOnline && db) {
    await deleteDoc(doc(db, COLLECTIONS.CHECKPOINTS, id));
  }
  const list = storage.getCheckpoints().filter(c => c.id !== id);
  storage.saveCheckpoints(list);
}

export async function createFirestoreCampus(campusData) {
  const code = (campusData.code || 'CS').trim().toUpperCase();
  const slug = code.toLowerCase().replace(/[^a-z0-9]/g, '') || 'branch';
  const existingList = storage.getCampuses();
  let campusId = campusData.id || `cs-${slug}`;
  if (!campusData.id && Array.isArray(existingList) && existingList.some(c => c.id === campusId)) {
    campusId = `cs-${slug}-${Date.now().toString(36).slice(-4)}`;
  }

  const latVal = typeof campusData.lat === 'string' ? parseFloat(campusData.lat) : campusData.lat;
  const lngVal = typeof campusData.lng === 'string' ? parseFloat(campusData.lng) : campusData.lng;
  const radiusVal = parseInt(campusData.radiusMeters || campusData.radius || 150, 10);
  const isMain = campusId === 'cs-chinh' || campusId === 'cs-caolo' || code === 'CS-CHINH';
  const quotaVal = parseInt(campusData.guardsPerShift, 10);
  const nowIso = new Date().toISOString();

  const cleanCampus = {
    id: campusId,
    name: (campusData.name || 'Phân hiệu mới').trim(),
    code: code,
    address: (campusData.address || '').trim(),
    lat: isNaN(latVal) ? 10.735768115549721 : latVal,
    lng: isNaN(lngVal) ? 106.68071864291426 : lngVal,
    radiusMeters: isNaN(radiusVal) ? 150 : radiusVal,
    radius: isNaN(radiusVal) ? 150 : radiusVal,
    guardsPerShift: !isNaN(quotaVal) && quotaVal > 0 ? quotaVal : (isMain ? 2 : 1),
    status: campusData.status || 'active',
    createdAt: nowIso
  };

  if (!isFirebaseOnline || !db) {
    throw new Error('Không thể kết nối Firebase Firestore. Vui lòng tải lại trang và kiểm tra kết nối mạng.');
  }

  await setDoc(doc(db, COLLECTIONS.CAMPUSES, campusId), {
    ...cleanCampus,
    createdAt: serverTimestamp()
  }, { merge: true });
  console.log("✅ Firestore campus created successfully:", cleanCampus.name, campusId);

  // Immediately update local storage cache
  const list = Array.isArray(existingList) ? [...existingList] : [];
  const existingIdx = list.findIndex(c => c.id === campusId);
  if (existingIdx !== -1) {
    list[existingIdx] = cleanCampus;
  } else {
    list.push(cleanCampus);
  }
  storage.saveCampuses(list);

  return cleanCampus;
}

export async function updateFirestoreCampus(campusId, updates) {
  const latVal = typeof updates.lat === 'string' ? parseFloat(updates.lat) : updates.lat;
  const lngVal = typeof updates.lng === 'string' ? parseFloat(updates.lng) : updates.lng;
  const radiusVal = parseInt(updates.radiusMeters || updates.radius || 150, 10);
  const isMain = campusId === 'cs-chinh' || campusId === 'cs-caolo' || (updates.code || '').toUpperCase() === 'CS-CHINH';
  const quotaVal = parseInt(updates.guardsPerShift, 10);
  const nowIso = new Date().toISOString();

  const cleanUpdates = {
    ...updates,
    id: campusId,
    lat: isNaN(latVal) ? 10.735768115549721 : latVal,
    lng: isNaN(lngVal) ? 106.68071864291426 : lngVal,
    radiusMeters: isNaN(radiusVal) ? 150 : radiusVal,
    radius: isNaN(radiusVal) ? 150 : radiusVal,
    guardsPerShift: !isNaN(quotaVal) && quotaVal > 0 ? quotaVal : (isMain ? 2 : 1),
    updatedAt: nowIso
  };

  if (!isFirebaseOnline || !db) {
    throw new Error('Không thể kết nối Firebase Firestore. Vui lòng tải lại trang và kiểm tra kết nối mạng.');
  }

  await setDoc(doc(db, COLLECTIONS.CAMPUSES, campusId), {
    ...cleanUpdates,
    updatedAt: serverTimestamp()
  }, { merge: true });
  console.log("✅ Firestore campus updated successfully:", campusId);

  const list = Array.isArray(storage.getCampuses()) ? [...storage.getCampuses()] : [];
  const idx = list.findIndex(c => c.id === campusId);
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...cleanUpdates };
  } else {
    list.push(cleanUpdates);
  }
  storage.saveCampuses(list);
  return list;
}

export async function deleteFirestoreCampus(campusId) {
  if (campusId === 'cs-chinh' || campusId === 'cs-caolo') {
    throw new Error('Không thể xóa Trụ sở chính (Số 47 Cao Lỗ)! Bạn chỉ có thể sửa thông tin và tọa độ GPS.');
  }
  if (!isFirebaseOnline || !db) {
    throw new Error('Không thể kết nối Firebase Firestore. Vui lòng tải lại trang và kiểm tra kết nối mạng.');
  }

  await deleteDoc(doc(db, COLLECTIONS.CAMPUSES, campusId));
  console.log("✅ Firestore campus deleted successfully:", campusId);

  const list = storage.getCampuses().filter(c => c.id !== campusId);
  storage.saveCampuses(list);
  return list;
}

export async function createFirestoreShift(shiftData) {
  if (!isFirebaseOnline || !db) return;
  const docRef = await addDoc(collection(db, COLLECTIONS.SHIFTS), {
    ...shiftData,
    createdAt: serverTimestamp()
  });
  return { id: docRef.id, ...shiftData };
}
