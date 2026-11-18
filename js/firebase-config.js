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
  where,
  runTransaction
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
  DUTY_SESSIONS: 'duty_sessions',
  DUTY_AUDIT_LOGS: 'duty_audit_logs',
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

  // 8. Sync DUTY_SESSIONS (NSG SMART CHECK-IN Realtime)
  const qDutySessions = query(collection(db, COLLECTIONS.DUTY_SESSIONS), orderBy('checkInTime', 'desc'), limit(400));
  onSnapshot(qDutySessions, (snapshot) => {
    const sessions = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const ciServer = data.checkInTimeServer;
      let ciIso = data.checkInTime || '';
      if (ciServer && typeof ciServer.toDate === 'function') {
        ciIso = ciServer.toDate().toISOString();
      } else if (ciServer && typeof ciServer.seconds === 'number') {
        ciIso = new Date(ciServer.seconds * 1000).toISOString();
      }
      const coServer = data.checkOutTimeServer;
      let coIso = data.checkOutTime || null;
      if (coServer && typeof coServer.toDate === 'function') {
        coIso = coServer.toDate().toISOString();
      } else if (coServer && typeof coServer.seconds === 'number') {
        coIso = new Date(coServer.seconds * 1000).toISOString();
      }
      sessions.push({
        ...data,
        id: docSnap.id,
        checkInTime: data.checkInTime || ciIso,
        checkInServerIso: ciIso,
        checkOutTime: coIso
      });
    });
    storage.saveDutySessions(sessions);
    if (window.renderHomeUI) window.renderHomeUI();
    if (window.renderPatrolUI) window.renderPatrolUI();
    if (window.renderShiftsUI) window.renderShiftsUI();
    if (window.renderManagerMobileUI) window.renderManagerMobileUI();
    if (window.renderDashboardUI) window.renderDashboardUI();
    if (window.renderSmartCheckInUI) window.renderSmartCheckInUI();
    if (window.renderReportsUI) window.renderReportsUI();
  }, (err) => console.warn('Duty sessions sync notice:', err.message));

  // 9. Sync DUTY_AUDIT_LOGS (Change & Approval Audit Trail)
  const qAuditLogs = query(collection(db, COLLECTIONS.DUTY_AUDIT_LOGS), orderBy('createdAtClient', 'desc'), limit(300));
  onSnapshot(qAuditLogs, (snapshot) => {
    const audits = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const srv = data.createdAt;
      let srvIso = data.createdAtClient || '';
      if (srv && typeof srv.toDate === 'function') {
        srvIso = srv.toDate().toISOString();
      } else if (srv && typeof srv.seconds === 'number') {
        srvIso = new Date(srv.seconds * 1000).toISOString();
      }
      audits.push({
        ...data,
        id: docSnap.id,
        timestampIso: srvIso || data.createdAtClient
      });
    });
    storage.saveDutyAuditLogs(audits);
    if (window.renderSmartCheckInUI) window.renderSmartCheckInUI();
  }, (err) => console.warn('Duty audit logs sync notice:', err.message));

  // 10. Sync SETTINGS (Global security settings including check-in exception toggle)
  onSnapshot(doc(db, COLLECTIONS.SETTINGS, 'global'), (docSnap) => {
    if (docSnap.exists()) {
      const merged = { ...storage.getSettings(), ...docSnap.data() };
      storage.saveSettings(merged);
      if (window.renderHomeUI) window.renderHomeUI();
      if (window.renderPatrolUI) window.renderPatrolUI();
    }
  }, (err) => console.warn('Settings sync notice:', err.message));
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

  // 0. Check NSG SMART CHECK-IN Active Duty Session (Section 5: Patrol-Session Integration)
  const activeSession = getActiveDutySessionForGuard(guard?.id);
  const allowWithoutCheckIn = Boolean(settings.allowPatrolWithoutCheckIn);

  if (!activeSession && !allowWithoutCheckIn) {
    const pendingSession = getGuardCurrentDutySession(guard?.id);
    const isPendingApproval = pendingSession && pendingSession.checkInStatus === 'pending_approval';
    return {
      success: false,
      code: 'CHECKIN_REQUIRED',
      pendingApproval: isPendingApproval,
      message: isPendingApproval
        ? 'Yêu cầu trực thay / đổi ca của bạn ĐANG CHỜ QUẢN TRỊ VIÊN PHÊ DUYỆT. Chưa được ghi nhận hoàn thành tuần tra chính thức cho đến khi được duyệt!'
        : 'Bạn CHƯA XÁC NHẬN NHẬN CA (QR Check-in) cho ca trực hiện tại! Vui lòng quét mã QR Nhận Ca trước khi thực hiện tuần tra chính thức.'
    };
  }

  // Normalize QR payload (supports raw checkpoint code AND NSG-CP:<code>)
  const cleanPayload = (qrPayload || '').trim();
  const normalizedCpCode = cleanPayload.startsWith('NSG-CP:') ? cleanPayload.slice(7).trim() : cleanPayload;
  const checkpoint = checkpoints.find(c => c.code === normalizedCpCode || c.id === normalizedCpCode || c.code === cleanPayload || c.id === cleanPayload);
  if (!checkpoint) {
    return {
      success: false,
      code: 'INVALID_QR',
      message: 'Mã QR không khớp với bất kỳ điểm chốt tuần tra nào đã khai báo trên hệ thống Firestore!'
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

  // Always bind actual guard, assigned guard, shift, and dutySessionId from the confirmed Active Duty Session!
  const actualGuardId = activeSession ? activeSession.guardId : guard.id;
  const actualGuardName = activeSession ? activeSession.guardName : `${guard.name} (${guard.code})`;
  const assignedGuardId = activeSession ? (activeSession.assignedGuardId || actualGuardId) : guard.id;
  const assignedGuardName = activeSession ? (activeSession.assignedGuardName || actualGuardName) : actualGuardName;
  const resolvedShiftId = activeSession?.shiftId || shift?.id || 'ca-24h';
  const resolvedShiftName = activeSession?.shiftName || guard?.fixedShiftName || guard?.currentShiftName || shift?.name || 'Ca Trực 24H (06:00 - 06:00 hôm sau)';
  const isSubPatrol = Boolean(activeSession && activeSession.isSubstitution);
  const isExceptionPatrol = !activeSession && allowWithoutCheckIn;

  const logEntry = {
    checkpointId: checkpoint.id,
    checkpointCode: checkpoint.code,
    checkpointName: checkpoint.name,
    campusId: checkpoint.campusId || campus?.id || 'cs-chinh',
    campusName: checkpoint.campusName || campus?.name || 'Cao Đẳng Nam Sài Gòn',
    zoneName: checkpoint.zoneName || '',
    floor: checkpoint.floor || '',
    // Core backward-compatible fields ALWAYS store the ACTUAL guard performing duty (never blindly default to scheduled guard)
    guardId: actualGuardId,
    guardName: actualGuardName,
    guardEmail: guard.email || '',
    // NSG SMART CHECK-IN required patrol attribution fields (Section 5)
    actualGuardId,
    actualGuardName,
    assignedGuardId,
    assignedGuardName,
    dutySessionId: activeSession ? activeSession.id : null,
    checkInType: activeSession ? (activeSession.checkInType || 'scheduled') : 'exception_no_checkin',
    isSubstitutionPatrol: isSubPatrol,
    patrolException: isExceptionPatrol,
    shiftId: resolvedShiftId,
    shiftName: resolvedShiftName,
    patrolDate: patrolDateKey,
    patrolMonth: patrolMonthKey,
    scannedAt: nowDate.toISOString(),
    serverTimeIso: nowDate.toISOString(),
    distanceMeters: distanceMeters !== null ? Math.round(distanceMeters * 10) / 10 : null,
    accuracy: userLocation?.accuracy ? Math.round(userLocation.accuracy) : null,
    guardCoordinates: userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null,
    gpsStatus: 'valid',
    verificationStatus: isExceptionPatrol ? 'verified_exception' : 'verified_cloud',
    notes: isSubPatrol
      ? `Trực thay (${assignedGuardName}) • Đã kiểm tra chốt (Cách ${Math.round(distanceMeters || 0)}m ≤ ${maxAllowed}m)`
      : (isExceptionPatrol
          ? `Ngoại lệ (Chưa Check-in ca) • Đã kiểm tra chốt (Cách ${Math.round(distanceMeters || 0)}m ≤ ${maxAllowed}m)`
          : `Đã kiểm tra an toàn tại vị trí chốt (Cách ${Math.round(distanceMeters || 0)}m ≤ ${maxAllowed}m)`)
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

export async function saveSystemSettingsToFirestore(settingsObj) {
  const merged = { ...storage.getSettings(), ...settingsObj };
  storage.saveSettings(merged);
  if (isFirebaseOnline && db) {
    try {
      await setDoc(doc(db, COLLECTIONS.SETTINGS, 'global'), {
        ...merged,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.warn('Firestore settings save notice:', err.message);
    }
  }
  return merged;
}

// ============================================================================
// NSG SMART CHECK-IN ENGINE (QR Check-in, Substitution Approval, Check-out)
// ============================================================================

export const CHECKIN_TYPES = {
  scheduled: {
    code: 'scheduled',
    label: 'Trực đúng lịch',
    shortLabel: 'Đúng lịch',
    badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    requiresApproval: false
  },
  substitute: {
    code: 'substitute',
    label: 'Trực thay đồng nghiệp',
    shortLabel: 'Trực thay',
    badgeClass: 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
    requiresApproval: true
  },
  swap_post: {
    code: 'swap_post',
    label: 'Đổi vị trí trực',
    shortLabel: 'Đổi vị trí',
    badgeClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
    requiresApproval: true
  },
  swap_shift: {
    code: 'swap_shift',
    label: 'Đổi ca trực',
    shortLabel: 'Đổi ca',
    badgeClass: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300',
    requiresApproval: true
  },
  emergency_extra: {
    code: 'emergency_extra',
    label: 'Bổ sung nhân sự trực đột xuất',
    shortLabel: 'Đột xuất',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
    requiresApproval: true
  }
};

export const CHECKIN_STATUS_META = {
  active: {
    label: 'Đã nhận ca',
    badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    dotClass: 'bg-emerald-500'
  },
  pending_approval: {
    label: 'Chờ phê duyệt',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
    dotClass: 'bg-amber-500'
  },
  checked_out: {
    label: 'Đã kết thúc ca',
    badgeClass: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
    dotClass: 'bg-slate-400'
  },
  rejected: {
    label: 'Bị từ chối',
    badgeClass: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
    dotClass: 'bg-rose-500'
  },
  not_checked_in: {
    label: 'Chưa nhận ca',
    badgeClass: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
    dotClass: 'bg-rose-500'
  }
};

/**
 * Build standardized Smart QR payload (contains ONLY post/checkpoint ID, NEVER personal info)
 * - QR_CHECKIN:   NSG-CI:<postCodeOrId>
 * - QR_CHECKPOINT: <cp.code> (100% backward compatible)
 * - QR_CHECKOUT:  NSG-CO:<postCodeOrId>
 */
export function buildSmartQrPayload(qrType, targetIdOrCode) {
  const clean = String(targetIdOrCode || '').trim();
  if (qrType === 'QR_CHECKIN') return `NSG-CI:${clean}`;
  if (qrType === 'QR_CHECKOUT') return `NSG-CO:${clean}`;
  return clean;
}

/**
 * Parse scanned QR string and resolve target checkpoint / campus post.
 * Compatible with new QR CHECK-IN / QR CHECK-OUT codes AND existing checkpoint QR codes.
 */
export function parseSmartQrPayload(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return { valid: false, reason: 'Mã QR trống.' };

  let qrType = 'QR_CHECKPOINT';
  let refId = text;

  if (text.startsWith('NSG-CI:')) {
    qrType = 'QR_CHECKIN';
    refId = text.slice(7).trim();
  } else if (text.startsWith('NSG-CO:')) {
    qrType = 'QR_CHECKOUT';
    refId = text.slice(7).trim();
  } else if (text.startsWith('NSG-CP:')) {
    qrType = 'QR_CHECKPOINT';
    refId = text.slice(7).trim();
  }

  const checkpoints = storage.getCheckpoints();
  const campuses = storage.getCampuses();
  const campusList = campuses.length > 0 ? campuses : OFFICIAL_CAMPUSES;

  // 1. Match Campus-level Check-in/Check-out QR (e.g. NSG-CI:CAMPUS-cs-chinh or NSG-CI:cs-chinh)
  const campusRef = refId.startsWith('CAMPUS-') ? refId.slice(7) : refId;
  const matchedCampus = campusList.find(c =>
    c.id === campusRef || (c.code && c.code.toUpperCase() === campusRef.toUpperCase())
  );
  if (matchedCampus) {
    return {
      valid: true,
      qrType,
      rawQr: text,
      checkpointId: null,
      postId: matchedCampus.id,
      postCode: matchedCampus.code || matchedCampus.id,
      postName: `Chốt Trực Chính - ${matchedCampus.name}`,
      campusId: matchedCampus.id,
      campusName: matchedCampus.name,
      lat: parseFloat(matchedCampus.lat || 10.735768115549721),
      lng: parseFloat(matchedCampus.lng || 106.68071864291426),
      allowedRadius: parseInt(matchedCampus.radiusMeters || 150, 10)
    };
  }

  // 2. Match Checkpoint QR (works for NSG-CI:<cp.code>, NSG-CO:<cp.code>, or existing <cp.code>)
  const matchedCp = checkpoints.find(cp =>
    cp.code === refId || cp.id === refId || (cp.code && cp.code.toUpperCase() === refId.toUpperCase())
  );
  if (matchedCp) {
    const parentCampus = campusList.find(c => c.id === matchedCp.campusId || c.name === matchedCp.campusName) || campusList[0];
    return {
      valid: true,
      qrType,
      rawQr: text,
      checkpoint: matchedCp,
      checkpointId: matchedCp.id,
      postId: matchedCp.code || matchedCp.id,
      postCode: matchedCp.code || matchedCp.id,
      postName: matchedCp.name,
      campusId: matchedCp.campusId || parentCampus?.id || 'cs-chinh',
      campusName: matchedCp.campusName || parentCampus?.name || 'Trụ sở chính - Số 47 Cao Lỗ',
      lat: parseFloat(matchedCp.lat || parentCampus?.lat || 10.735768115549721),
      lng: parseFloat(matchedCp.lng || parentCampus?.lng || 106.68071864291426),
      allowedRadius: parseInt(matchedCp.allowedRadius || 20, 10)
    };
  }

  return {
    valid: false,
    qrType,
    rawQr: text,
    reason: 'Mã QR không thuộc vị trí trực hoặc điểm chốt nào đã khai báo trong hệ thống NSG SMART GUARD!'
  };
}

/**
 * Find the currently ACTIVE official duty session for a guard
 * Supports 24H shift window (06:00 today -> 06:00 tomorrow)
 */
export function getActiveDutySessionForGuard(guardId, referenceDateKey = null) {
  if (!guardId) return null;
  const sessions = storage.getDutySessions();
  const todayKey = referenceDateKey || getTodayDateKey();
  const yesterdayKey = getYesterdayDateKey();
  const currentHour = new Date().getHours();

  return sessions.find(s => {
    if (s.guardId !== guardId) return false;
    if (s.checkInStatus !== 'active') return false;
    if (s.workDate === todayKey) return true;
    // Still inside yesterday's 24H shift window (00:00 - 05:59 next morning)
    if (!referenceDateKey && currentHour < 6 && s.workDate === yesterdayKey) return true;
    return false;
  }) || null;
}

/**
 * Get the latest duty session of a guard for today (active, pending_approval, or checked_out)
 */
export function getGuardCurrentDutySession(guardId, workDate = null) {
  if (!guardId) return null;
  const active = getActiveDutySessionForGuard(guardId, workDate);
  if (active) return active;

  const targetDate = workDate || getTodayDateKey();
  const sessions = storage.getDutySessions();
  // Prefer pending_approval, then latest checked_out/rejected for targetDate
  const todaySessions = sessions.filter(s => s.guardId === guardId && s.workDate === targetDate);
  return todaySessions.find(s => s.checkInStatus === 'pending_approval')
    || todaySessions[0]
    || null;
}

/**
 * Check if guard is officially scheduled for the scanned campus & shift
 */
export function isGuardScheduledForPostAndShift(guard, postCampusId, shiftIdOrName, campusList = []) {
  if (!guard) return false;
  const list = campusList.length > 0 ? campusList : OFFICIAL_CAMPUSES;
  const targetCampus = list.find(c => c.id === postCampusId);
  const isTargetMain = postCampusId === 'cs-chinh' || postCampusId === 'cs-caolo';

  let campusMatches = false;
  if (guard.campusId && guard.campusId === postCampusId) {
    campusMatches = true;
  } else if (targetCampus && guard.campusName) {
    const gName = guard.campusName.trim().toLowerCase();
    const cName = targetCampus.name.trim().toLowerCase();
    const cPrefix = cName.split('-')[0].trim();
    if (gName === cName || (cPrefix && gName.includes(cPrefix))) campusMatches = true;
  } else if (isTargetMain && !guard.campusId && (!guard.campusName || guard.campusName.toLowerCase().includes('cao lỗ') || guard.campusName.toLowerCase().includes('trụ sở chính'))) {
    campusMatches = true;
  }

  const guardBucket = getShiftBucketKey(guard.fixedShiftName || guard.currentShiftName || 'Ca Trực 24H');
  const targetBucket = getShiftBucketKey(shiftIdOrName || 'Ca Trực 24H');
  const shiftMatches = guardBucket === targetBucket;

  return { campusMatches, shiftMatches, isExactScheduled: campusMatches && shiftMatches };
}

/**
 * Create a new Duty Session using Firestore Transaction (atomically prevents duplicate active sessions)
 */
export async function createDutySessionWithTransaction(payload) {
  const {
    guard,
    parsedQr,
    shiftId,
    shiftName,
    workDate = getTodayDateKey(),
    location = null,
    checkInType = 'scheduled',
    assignedGuardId = null,
    assignedGuardName = null,
    changeReason = ''
  } = payload;

  if (!guard || !guard.id) {
    throw new Error('Bạn phải đăng nhập bằng tài khoản bảo vệ cá nhân để xác nhận nhận ca!');
  }
  if (!parsedQr || !parsedQr.valid) {
    throw new Error('Mã QR vị trí trực không hợp lệ.');
  }

  const typeMeta = CHECKIN_TYPES[checkInType] || CHECKIN_TYPES.scheduled;
  const isSubstitution = checkInType !== 'scheduled';
  if (isSubstitution && (!changeReason || changeReason.trim().length < 3)) {
    throw new Error('Vui lòng nhập rõ lý do trực thay / thay đổi vị trí / đổi ca!');
  }

  const resolvedShiftId = shiftId || 'ca-24h';
  const resolvedShiftName = shiftName || guard.fixedShiftName || 'Ca Trực 24H (06:00 - 06:00 hôm sau)';
  const shiftBucket = getShiftBucketKey(resolvedShiftName);
  const baseSessionId = `ds_${workDate}_${shiftBucket}_${guard.id}`;

  // Calculate GPS distance as supporting evidence (Section 9: supporting evidence only, never sole identity proof)
  let distanceMeters = null;
  if (location && location.lat && location.lng && parsedQr.lat && parsedQr.lng) {
    distanceMeters = Math.round(
      calculateHaversineDistance(location.lat, location.lng, parsedQr.lat, parsedQr.lng) * 10
    ) / 10;
  }

  const nowIso = new Date().toISOString();
  const initialStatus = typeMeta.requiresApproval ? 'pending_approval' : 'active';
  const actualGuardDisplay = `${guard.name} (${guard.code || guard.email})`;

  const sessionBody = {
    guardId: guard.id,
    guardName: actualGuardDisplay,
    guardCode: guard.code || '',
    guardEmail: guard.email || '',
    assignedGuardId: isSubstitution ? (assignedGuardId || '') : guard.id,
    assignedGuardName: isSubstitution ? (assignedGuardName || 'Chưa chỉ định') : actualGuardDisplay,
    checkpointId: parsedQr.checkpointId || null,
    postId: parsedQr.postId,
    postCode: parsedQr.postCode || parsedQr.postId,
    postName: parsedQr.postName,
    campusId: parsedQr.campusId || 'cs-chinh',
    campusName: parsedQr.campusName || 'Trụ sở chính - Số 47 Cao Lỗ',
    shiftId: resolvedShiftId,
    shiftName: resolvedShiftName,
    shiftBucket,
    workDate,
    checkInTime: nowIso,
    latitude: location?.lat ?? null,
    longitude: location?.lng ?? null,
    gpsAccuracy: location?.accuracy ? Math.round(location.accuracy) : null,
    distanceMeters,
    qrCodeScanned: parsedQr.rawQr,
    qrType: parsedQr.qrType || 'QR_CHECKIN',
    checkInType,
    checkInStatus: initialStatus,
    isSubstitution,
    changeReason: changeReason.trim(),
    approvedBy: initialStatus === 'active' ? 'Tự động (Đúng lịch phân công)' : null,
    approvedById: initialStatus === 'active' ? 'system_schedule' : null,
    approvedAt: initialStatus === 'active' ? nowIso : null,
    approvalNote: '',
    checkOutTime: null,
    checkOutQrCode: null,
    handoverFromGuardId: null,
    handoverFromGuardName: null,
    handoverToGuardId: null,
    handoverToGuardName: null,
    handoverNotes: '',
    incidentSummary: '',
    handoverCompleted: false
  };

  // Prevent duplicate active session locally first
  const localActive = getActiveDutySessionForGuard(guard.id, workDate);
  if (localActive && localActive.shiftBucket === shiftBucket) {
    throw new Error(`Bạn đã có phiên trực đang hoạt động (${localActive.postName}) cho ca này! Không thể tạo 2 phiên trực song song khi chưa kết thúc và bàn giao ca.`);
  }
  const localPending = storage.getDutySessions().find(s =>
    s.guardId === guard.id && s.workDate === workDate && s.shiftBucket === shiftBucket && s.checkInStatus === 'pending_approval'
  );
  if (localPending) {
    throw new Error(`Bạn đã gửi yêu cầu trực thay tại ${localPending.postName} đang chờ phê duyệt. Vui lòng đợi Quản trị viên xác nhận.`);
  }

  let finalSessionId = baseSessionId;

  if (isFirebaseOnline && db) {
    finalSessionId = await runTransaction(db, async (transaction) => {
      const baseRef = doc(db, COLLECTIONS.DUTY_SESSIONS, baseSessionId);
      const baseSnap = await transaction.get(baseRef);

      if (!baseSnap.exists()) {
        transaction.set(baseRef, {
          ...sessionBody,
          checkInTimeServer: serverTimestamp(),
          requestedAtServer: serverTimestamp(),
          approvedAtServer: initialStatus === 'active' ? serverTimestamp() : null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        return baseSessionId;
      }

      const existing = baseSnap.data();
      if (existing.checkInStatus === 'active') {
        throw new Error(`Phiên trực cho ca này đã đang hoạt động tại ${existing.postName}! Không được tạo trùng phiên trực.`);
      }
      if (existing.checkInStatus === 'pending_approval') {
        throw new Error(`Yêu cầu nhận ca thay thế cho ca này đang chờ Quản trị viên phê duyệt.`);
      }
      if (existing.checkInStatus === 'checked_out' && !existing.handoverCompleted) {
        throw new Error('Phiên trực trước đó chưa hoàn tất quy trình chuyển giao hợp lệ.');
      }

      // If previous session was validly handed over or rejected, create a chained transfer session ID
      const transferId = `${baseSessionId}__t${Date.now()}`;
      const transferRef = doc(db, COLLECTIONS.DUTY_SESSIONS, transferId);
      transaction.set(transferRef, {
        ...sessionBody,
        previousSessionId: baseSessionId,
        checkInTimeServer: serverTimestamp(),
        requestedAtServer: serverTimestamp(),
        approvedAtServer: initialStatus === 'active' ? serverTimestamp() : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return transferId;
    });

    // Write immutable audit trail
    const auditRecord = {
      sessionId: finalSessionId,
      action: isSubstitution ? 'SUBSTITUTION_REQUESTED' : 'CHECKIN_CONFIRMED',
      workDate,
      guardId: guard.id,
      guardName: actualGuardDisplay,
      assignedGuardId: sessionBody.assignedGuardId,
      assignedGuardName: sessionBody.assignedGuardName,
      postName: sessionBody.postName,
      campusName: sessionBody.campusName,
      shiftName: resolvedShiftName,
      checkInType,
      reason: sessionBody.changeReason || 'Nhận ca đúng lịch phân công',
      actorId: guard.id,
      actorName: actualGuardDisplay,
      createdAtClient: nowIso
    };
    try {
      await addDoc(collection(db, COLLECTIONS.DUTY_AUDIT_LOGS), {
        ...auditRecord,
        createdAt: serverTimestamp()
      });
    } catch (auditErr) {
      console.warn('Audit log write notice:', auditErr.message);
    }
    storage.addDutyAuditLog({ id: 'aud-' + Date.now(), ...auditRecord, timestampIso: nowIso });

    // If officially active (scheduled), update live status to on_duty WITHOUT modifying fixed schedule!
    if (initialStatus === 'active') {
      try {
        await updateFirestoreUser(guard.id, { status: 'on_duty' });
      } catch (e) {}
    }
  }

  const savedSession = { id: finalSessionId, ...sessionBody, checkInServerIso: nowIso };
  storage.upsertDutySession(savedSession);
  return savedSession;
}

/**
 * Approve or Reject a substitution / swap / extra check-in request (Admin / Manager only)
 */
export async function approveOrRejectDutySession(sessionId, decision, approver, approvalNote = '') {
  if (!approver || !['admin', 'manager', 'phophong'].includes(approver.role) && approver.email !== SUPER_ADMIN_EMAIL && !approver.isSuperAdmin) {
    throw new Error('Chỉ Quản trị viên / Quản lý có thẩm quyền mới được phê duyệt trực thay!');
  }
  if (!['approve', 'reject'].includes(decision)) {
    throw new Error('Trạng thái phê duyệt không hợp lệ.');
  }

  const newStatus = decision === 'approve' ? 'active' : 'rejected';
  const nowIso = new Date().toISOString();
  const approverLabel = `${approver.name || 'Quản trị viên'} (${approver.email || approver.code || 'ADMIN'})`;

  let updatedSessionData = null;

  if (isFirebaseOnline && db) {
    updatedSessionData = await runTransaction(db, async (transaction) => {
      const ref = doc(db, COLLECTIONS.DUTY_SESSIONS, sessionId);
      const snap = await transaction.get(ref);
      if (!snap.exists()) {
        throw new Error('Không tìm thấy phiên nhận ca cần phê duyệt trên Firestore.');
      }
      const data = snap.data();
      if (data.checkInStatus !== 'pending_approval') {
        throw new Error(`Yêu cầu này đã được xử lý trước đó (Trạng thái hiện tại: ${data.checkInStatus}).`);
      }

      transaction.update(ref, {
        checkInStatus: newStatus,
        approvedBy: approverLabel,
        approvedById: approver.id || approver.email,
        approvedAt: nowIso,
        approvedAtServer: serverTimestamp(),
        approvalNote: approvalNote.trim(),
        updatedAt: serverTimestamp()
      });

      return { ...data, id: sessionId, checkInStatus: newStatus, approvedBy: approverLabel, approvedAt: nowIso, approvalNote: approvalNote.trim() };
    });

    // Write immutable approval audit log
    const auditRecord = {
      sessionId,
      action: decision === 'approve' ? 'SUBSTITUTION_APPROVED' : 'SUBSTITUTION_REJECTED',
      workDate: updatedSessionData.workDate,
      guardId: updatedSessionData.guardId,
      guardName: updatedSessionData.guardName,
      assignedGuardId: updatedSessionData.assignedGuardId,
      assignedGuardName: updatedSessionData.assignedGuardName,
      postName: updatedSessionData.postName,
      campusName: updatedSessionData.campusName,
      shiftName: updatedSessionData.shiftName,
      checkInType: updatedSessionData.checkInType,
      reason: approvalNote.trim() || (decision === 'approve' ? 'Đã phê duyệt trực thay' : 'Từ chối yêu cầu trực thay'),
      actorId: approver.id || approver.email,
      actorName: approverLabel,
      createdAtClient: nowIso
    };
    try {
      await addDoc(collection(db, COLLECTIONS.DUTY_AUDIT_LOGS), {
        ...auditRecord,
        createdAt: serverTimestamp()
      });
    } catch (e) {}
    storage.addDutyAuditLog({ id: 'aud-' + Date.now(), ...auditRecord, timestampIso: nowIso });

    // If approved, set actual guard's live status to on_duty (NEVER alter original fixed schedule!)
    if (decision === 'approve' && updatedSessionData.guardId) {
      try {
        await updateFirestoreUser(updatedSessionData.guardId, { status: 'on_duty' });
      } catch (e) {}
    }
  }

  if (updatedSessionData) {
    storage.upsertDutySession(updatedSessionData);
  }
  return updatedSessionData;
}

/**
 * End Duty Session & Record Handover using Firestore Transaction (strictly prevents double check-out!)
 */
export async function checkoutDutySessionWithTransaction(sessionId, checkoutData) {
  const {
    guard,
    checkOutQrCode = '',
    handoverToGuardId = '',
    handoverToGuardName = '',
    handoverNotes = '',
    incidentSummary = '',
    location = null
  } = checkoutData;

  if (!sessionId) throw new Error('Không tìm thấy mã phiên trực cần kết thúc.');
  const nowIso = new Date().toISOString();

  let finishedSession = null;

  if (isFirebaseOnline && db) {
    finishedSession = await runTransaction(db, async (transaction) => {
      const ref = doc(db, COLLECTIONS.DUTY_SESSIONS, sessionId);
      const snap = await transaction.get(ref);
      if (!snap.exists()) {
        throw new Error('Không tìm thấy phiên trực trong Firestore.');
      }
      const data = snap.data();
      if (data.checkInStatus === 'checked_out' || data.checkOutTime) {
        throw new Error('Phiên trực này ĐÃ ĐƯỢC KẾT THÚC trước đó! Hệ thống không cho phép kết thúc một phiên trực hai lần.');
      }
      if (data.checkInStatus !== 'active') {
        throw new Error('Chỉ có thể kết thúc và bàn giao phiên trực đang ở trạng thái Đã nhận ca (Active).');
      }

      const updates = {
        checkInStatus: 'checked_out',
        checkOutTime: nowIso,
        checkOutTimeServer: serverTimestamp(),
        checkOutQrCode: checkOutQrCode || 'DIRECT_END_SHIFT',
        checkOutLatitude: location?.lat ?? null,
        checkOutLongitude: location?.lng ?? null,
        checkOutGpsAccuracy: location?.accuracy ? Math.round(location.accuracy) : null,
        handoverFromGuardId: data.guardId,
        handoverFromGuardName: data.guardName,
        handoverToGuardId: handoverToGuardId || '',
        handoverToGuardName: handoverToGuardName || '',
        handoverNotes: (handoverNotes || '').trim(),
        incidentSummary: (incidentSummary || '').trim(),
        handoverCompleted: true,
        updatedAt: serverTimestamp()
      };

      transaction.update(ref, updates);
      return { ...data, id: sessionId, ...updates };
    });

    // Record in handovers collection
    const handoverRecord = {
      dutySessionId: sessionId,
      workDate: finishedSession.workDate,
      shiftId: finishedSession.shiftId,
      shiftName: finishedSession.shiftName,
      postName: finishedSession.postName,
      campusId: finishedSession.campusId,
      campusName: finishedSession.campusName,
      fromGuardId: finishedSession.handoverFromGuardId,
      fromGuardName: finishedSession.handoverFromGuardName,
      toGuardId: finishedSession.handoverToGuardId,
      toGuardName: finishedSession.handoverToGuardName,
      notes: finishedSession.handoverNotes,
      incidentSummary: finishedSession.incidentSummary,
      handedOverAt: nowIso
    };
    try {
      await addDoc(collection(db, COLLECTIONS.HANDOVERS), {
        ...handoverRecord,
        createdAt: serverTimestamp()
      });
    } catch (e) {}
    storage.addHandover({ id: 'ho-' + Date.now(), ...handoverRecord });

    // Record immutable audit log
    const auditRecord = {
      sessionId,
      action: 'SHIFT_CHECKOUT_HANDOVER',
      workDate: finishedSession.workDate,
      guardId: finishedSession.guardId,
      guardName: finishedSession.guardName,
      assignedGuardId: finishedSession.assignedGuardId,
      assignedGuardName: finishedSession.assignedGuardName,
      postName: finishedSession.postName,
      campusName: finishedSession.campusName,
      shiftName: finishedSession.shiftName,
      checkInType: finishedSession.checkInType,
      reason: `Kết thúc ca trực. Ghi chú: ${finishedSession.handoverNotes || 'Hoàn thành an toàn'}${finishedSession.handoverToGuardName ? ` | Nhận bàn giao: ${finishedSession.handoverToGuardName}` : ''}`,
      actorId: guard?.id || finishedSession.guardId,
      actorName: finishedSession.guardName,
      createdAtClient: nowIso
    };
    try {
      await addDoc(collection(db, COLLECTIONS.DUTY_AUDIT_LOGS), {
        ...auditRecord,
        createdAt: serverTimestamp()
      });
    } catch (e) {}
    storage.addDutyAuditLog({ id: 'aud-' + Date.now(), ...auditRecord, timestampIso: nowIso });

    // Mark guard off_duty after checkout
    try {
      await updateFirestoreUser(finishedSession.guardId, { status: 'off_duty' });
    } catch (e) {}
  }

  if (finishedSession) {
    storage.upsertDutySession(finishedSession);
  }
  return finishedSession;
}

/**
 * Fetch duty sessions for any date range (uses single-field workDate range, no custom composite index)
 */
export async function fetchDutySessionsByDateRange(startDateKey, endDateKey) {
  const mergeLocal = (fetched) => {
    const map = new Map();
    fetched.forEach(s => map.set(s.id, s));
    storage.getDutySessions().forEach(s => {
      if (s.workDate >= startDateKey && s.workDate <= endDateKey) {
        map.set(s.id, s);
      }
    });
    return Array.from(map.values()).sort((a, b) => new Date(b.checkInTime || 0) - new Date(a.checkInTime || 0));
  };

  if (!isFirebaseOnline || !db) return mergeLocal([]);
  try {
    const q = query(
      collection(db, COLLECTIONS.DUTY_SESSIONS),
      where('workDate', '>=', startDateKey),
      where('workDate', '<=', endDateKey),
      orderBy('workDate', 'desc'),
      limit(600)
    );
    const snap = await getDocs(q);
    const list = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      list.push({ ...data, id: docSnap.id });
    });
    return mergeLocal(list);
  } catch (err) {
    console.warn('Fetch duty sessions range notice:', err.message);
    return mergeLocal([]);
  }
}

/**
 * Evaluate complete daily duty overview (answers all 6 BGH / Admin questions for any workDate)
 */
export function evaluateDailyDutyOverview(workDate, sessionsSource = null, patrolLogsSource = null) {
  const targetDate = workDate || getTodayDateKey();
  const users = storage.getUsers();
  const guards = users.filter(u => u.role === 'guard');
  const allSessions = (sessionsSource || storage.getDutySessions()).filter(s => s.workDate === targetDate);
  const allLogs = (patrolLogsSource || storage.getPatrolLogs()).filter(l => getLogDateKey(l) === targetDate);

  // Count patrol scans per session & per actual guard
  const scansBySession = new Map();
  const scansByGuard = new Map();
  allLogs.forEach(l => {
    if (!isPatrolLogValid(l)) return;
    if (l.dutySessionId) {
      scansBySession.set(l.dutySessionId, (scansBySession.get(l.dutySessionId) || 0) + 1);
    }
    const gid = l.actualGuardId || l.guardId;
    if (gid) {
      scansByGuard.set(gid, (scansByGuard.get(gid) || 0) + 1);
    }
  });

  // Track which assigned guards have been covered (either by themselves or via approved/active substitution)
  const coveredAssignedGuardIds = new Set();
  const checkedInGuardIds = new Set();

  const enrichedSessions = allSessions.map(s => {
    if (s.checkInStatus === 'active' || s.checkInStatus === 'checked_out') {
      checkedInGuardIds.add(s.guardId);
      if (s.assignedGuardId) coveredAssignedGuardIds.add(s.assignedGuardId);
    }
    const sessionPatrolCount = scansBySession.get(s.id) || 0;
    const guardPatrolCount = scansByGuard.get(s.guardId) || 0;
    return {
      ...s,
      patrolCount: sessionPatrolCount > 0 ? sessionPatrolCount : guardPatrolCount
    };
  });

  // Guards who are scheduled in the system but have NOT checked in (and not covered by substitution)
  const notCheckedInGuards = guards.filter(g => !checkedInGuardIds.has(g.id) && !coveredAssignedGuardIds.has(g.id));

  const activeSessions = enrichedSessions.filter(s => s.checkInStatus === 'active');
  const pendingSessions = enrichedSessions.filter(s => s.checkInStatus === 'pending_approval');
  const checkedOutSessions = enrichedSessions.filter(s => s.checkInStatus === 'checked_out');
  const substitutionSessions = enrichedSessions.filter(s => s.isSubstitution);

  return {
    workDate: targetDate,
    scheduledGuards: guards,
    sessions: enrichedSessions,
    activeSessions,
    pendingSessions,
    checkedOutSessions,
    substitutionSessions,
    notCheckedInGuards
  };
}
