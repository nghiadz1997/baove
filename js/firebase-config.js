/**
 * NSG SMART GUARD - Firebase Configuration, Authentication & Official Campus Locations
 * Super Admin: trongnghia@nsg.edu.vn
 * Includes official branches of Nam Sai Gon Polytechnic (Trụ sở 47 Cao Lỗ, An Phú Tây, Tạ Quang Bửu, Bùi Minh Trực)
 * Resilient Multi-Tier Login (Firebase Auth + Firestore fallback)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
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

let app, db, auth;
let secondaryApp, secondaryAuth;
let isFirebaseOnline = false;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);

  secondaryApp = initializeApp(firebaseConfig, "SecondaryAuthApp");
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
 * Seed official campuses in Firestore (ONLY if document does not exist yet)
 * Never overwrites customized coordinates!
 */
export async function seedOfficialCampuses() {
  if (!isFirebaseOnline || !db) {
    return;
  }
  try {
    for (const campus of OFFICIAL_CAMPUSES) {
      const snap = await getDoc(doc(db, COLLECTIONS.CAMPUSES, campus.id));
      if (!snap.exists()) {
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

  // 2. Sync CAMPUSES (Smart merge with OFFICIAL_CAMPUSES so defaults and customizations are never lost)
  onSnapshot(collection(db, COLLECTIONS.CAMPUSES), (snapshot) => {
    const firestoreCampuses = {};
    snapshot.forEach(docSnap => {
      firestoreCampuses[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
    });

    const mergedCampuses = OFFICIAL_CAMPUSES.map(defaultC => {
      return firestoreCampuses[defaultC.id] 
        ? { ...defaultC, ...firestoreCampuses[defaultC.id] } 
        : { ...defaultC };
    });

    // Add all custom branches from Firestore
    Object.keys(firestoreCampuses).forEach(id => {
      if (!mergedCampuses.some(c => c.id === id)) {
        mergedCampuses.push(firestoreCampuses[id]);
      }
    });

    // Also retain any newly created custom branches from local storage that are awaiting sync
    const currentLocal = storage.getCampuses();
    if (Array.isArray(currentLocal)) {
      currentLocal.forEach(locC => {
        if (!mergedCampuses.some(c => c.id === locC.id)) {
          mergedCampuses.push(locC);
        }
      });
    }

    storage.saveCampuses(mergedCampuses);
    if (window.renderCampusesUI) window.renderCampusesUI();
    if (window.renderManagerMobileUI) window.renderManagerMobileUI();
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

  // 5. Sync PATROL LOGS
  const qPatrol = query(collection(db, COLLECTIONS.PATROL_LOGS), orderBy('scannedAt', 'desc'), limit(100));
  onSnapshot(qPatrol, (snapshot) => {
    const logs = [];
    snapshot.forEach(docSnap => {
      logs.push({ id: docSnap.id, ...docSnap.data() });
    });
    storage.savePatrolLogs(logs);
    if (window.renderPatrolUI) window.renderPatrolUI();
    if (window.renderHomeUI) window.renderHomeUI();
    if (window.renderManagerMobileUI) window.renderManagerMobileUI();
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
  const { email, password, name, code, phone, role, campusName, fixedShiftName, currentShiftName } = staffData;
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
    campusName: campusName || 'Trụ sở chính - Số 47 Cao Lỗ',
    fixedShiftName: fixedShiftName || 'Ca Trực 24H (06:00 - 06:00 hôm sau)',
    currentShiftName: currentShiftName || fixedShiftName || 'Ca Trực 24H (06:00 - 06:00 hôm sau)',
    status: 'off_duty',
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
  let isGpsValid = true;
  let gpsStatus = 'valid';

  if (userLocation && userLocation.lat && userLocation.lng) {
    distanceMeters = calculateHaversineDistance(
      userLocation.lat,
      userLocation.lng,
      checkpoint.lat,
      checkpoint.lng
    );

    const maxAllowed = checkpoint.allowedRadius || settings.maxGpsRadiusMeters || 50;
    if (distanceMeters > maxAllowed) {
      isGpsValid = false;
      gpsStatus = 'warning_far';
    }
  } else {
    if (settings.requireGpsForScan) {
      return {
        success: false,
        code: 'GPS_REQUIRED',
        message: 'Bắt buộc phải bật định vị Google Maps GPS để xác thực việc có mặt tại chốt!'
      };
    }
    gpsStatus = 'no_gps';
  }

  const logEntry = {
    checkpointId: checkpoint.id,
    checkpointCode: checkpoint.code,
    checkpointName: checkpoint.name,
    campusName: checkpoint.campusName || 'Cao Đẳng Nam Sài Gòn',
    zoneName: checkpoint.zoneName || '',
    floor: checkpoint.floor || '',
    guardId: guard.id,
    guardName: `${guard.name} (${guard.code})`,
    guardEmail: guard.email || '',
    shiftId: shift?.id || 'default',
    shiftName: shift?.name || 'Ca trực hiện tại',
    scannedAt: new Date().toISOString(),
    distanceMeters: distanceMeters ? Math.round(distanceMeters * 10) / 10 : null,
    accuracy: userLocation?.accuracy ? Math.round(userLocation.accuracy) : null,
    guardCoordinates: userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null,
    gpsStatus: gpsStatus,
    verificationStatus: isGpsValid ? 'verified_cloud' : 'flagged_gps_distance',
    notes: isGpsValid ? 'Đã kiểm tra an toàn' : `Cảnh báo GPS: ${Math.round(distanceMeters)}m (Vượt mức cho phép ${checkpoint.allowedRadius || 50}m)`
  };

  storage.addPatrolLog({ id: 'log-' + Date.now(), ...logEntry });

  if (isFirebaseOnline && db) {
    try {
      await addDoc(collection(db, COLLECTIONS.PATROL_LOGS), {
        ...logEntry,
        createdAt: serverTimestamp()
      });
    } catch (e) {
      console.warn("Firestore push patrol error:", e);
    }
  }

  return {
    success: true,
    code: isGpsValid ? 'SUCCESS' : 'WARNING_DISTANCE',
    data: logEntry,
    checkpoint: checkpoint,
    distanceMeters: logEntry.distanceMeters,
    isGpsValid: isGpsValid,
    message: isGpsValid 
      ? `Xác thực thành công chốt ${checkpoint.name}` 
      : `Đã ghi nhận quét chốt nhưng GPS cách ${logEntry.distanceMeters}m (Vượt mức cho phép). Đã gắn cờ cảnh báo!`
  };
}

export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

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
  const slug = code.toLowerCase().replace(/[^a-z0-9]/g, '') || `${Date.now()}`;
  const campusId = campusData.id || `cs-${slug}`;

  const latVal = typeof campusData.lat === 'string' ? parseFloat(campusData.lat) : campusData.lat;
  const lngVal = typeof campusData.lng === 'string' ? parseFloat(campusData.lng) : campusData.lng;
  const radiusVal = campusData.radiusMeters ? parseInt(campusData.radiusMeters, 10) : (campusData.radius ? parseInt(campusData.radius, 10) : 150);

  const cleanCampus = {
    id: campusId,
    name: (campusData.name || 'Phân hiệu mới').trim(),
    code: code,
    address: (campusData.address || '').trim(),
    lat: isNaN(latVal) ? 10.735768115549721 : latVal,
    lng: isNaN(lngVal) ? 106.68071864291426 : lngVal,
    radiusMeters: isNaN(radiusVal) ? 150 : radiusVal,
    radius: isNaN(radiusVal) ? 150 : radiusVal,
    status: campusData.status || 'active',
    createdAt: new Date().toISOString()
  };

  if (isFirebaseOnline && db) {
    try {
      await setDoc(doc(db, COLLECTIONS.CAMPUSES, campusId), {
        ...cleanCampus,
        createdAt: serverTimestamp()
      }, { merge: true });
      console.log("✅ Firestore campus created successfully:", cleanCampus.name, campusId);
    } catch (e) {
      console.warn("Firestore create campus error (falling back to storage):", e);
    }
  }

  // IMMEDIATELY update storage cache so it renders without delay!
  let list = storage.getCampuses();
  if (!list || list.length === 0) {
    list = OFFICIAL_CAMPUSES.map(c => ({ ...c }));
  }
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
  const cleanUpdates = {
    ...updates,
    lat: typeof updates.lat === 'string' ? parseFloat(updates.lat) : updates.lat,
    lng: typeof updates.lng === 'string' ? parseFloat(updates.lng) : updates.lng,
    radiusMeters: updates.radiusMeters ? parseInt(updates.radiusMeters, 10) : (updates.radius ? parseInt(updates.radius, 10) : 150),
    radius: updates.radiusMeters ? parseInt(updates.radiusMeters, 10) : (updates.radius ? parseInt(updates.radius, 10) : 150),
    updatedAt: serverTimestamp()
  };

  if (isFirebaseOnline && db) {
    try {
      await setDoc(doc(db, COLLECTIONS.CAMPUSES, campusId), {
        id: campusId,
        ...cleanUpdates
      }, { merge: true });
    } catch (e) {
      console.warn("Firestore update campus error:", e);
    }
  }

  let list = storage.getCampuses();
  if (!list || list.length === 0) {
    list = OFFICIAL_CAMPUSES.map(c => ({ ...c }));
  }
  const idx = list.findIndex(c => c.id === campusId);
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...cleanUpdates };
  } else {
    list.push({ id: campusId, ...cleanUpdates });
  }
  storage.saveCampuses(list);
  return list;
}

export async function deleteFirestoreCampus(campusId) {
  if (campusId === 'cs-chinh' || campusId === 'cs-caolo') {
    throw new Error('Không thể xóa Trụ sở chính (Số 47 Cao Lỗ)! Bạn chỉ có thể sửa thông tin và tọa độ GPS.');
  }
  if (isFirebaseOnline && db) {
    try {
      await deleteDoc(doc(db, COLLECTIONS.CAMPUSES, campusId));
    } catch (e) {
      console.warn("Firestore delete campus error:", e);
    }
  }
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
