/**
 * NSG SMART GUARD - Storage & Cache Manager (Clean Production Mode)
 * No fake/mock data. All data is fetched and synchronized with Firestore.
 */

export const STORAGE_KEYS = {
  CURRENT_USER: 'nsg_guard_user',
  ACTIVE_SHIFT: 'nsg_guard_active_shift',
  CHECKPOINTS_CACHE: 'nsg_guard_checkpoints_cache',
  CAMPUSES_CACHE: 'nsg_guard_campuses_cache',
  ZONES_CACHE: 'nsg_guard_zones_cache',
  SHIFTS_CACHE: 'nsg_guard_shifts_cache',
  USERS_CACHE: 'nsg_guard_users_cache',
  PATROL_LOGS_CACHE: 'nsg_guard_patrol_logs_cache',
  INCIDENTS_CACHE: 'nsg_guard_incidents_cache',
  HANDOVERS_CACHE: 'nsg_guard_handovers_cache',
  SETTINGS_CACHE: 'nsg_guard_settings_cache',
  THEME: 'nsg_guard_theme',
  CURRENT_VIEW_MODE: 'nsg_guard_view_mode'
};

export const DEFAULT_OFFICIAL_CAMPUSES = [
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

export const DEFAULT_SETTINGS = {
  maxGpsRadiusMeters: 50,
  enableSoundFeedback: true,
  enableHapticVibration: true,
  scanCooldownSeconds: 5,
  requireGpsForScan: true,
  allowOfflineScan: true,
  mapType: 'google_roadmap' // 'google_roadmap' | 'google_satellite' | 'google_hybrid'
};

class LocalStorageManager {
  constructor() {
    this.purgeLegacyMockData();
  }

  /**
   * Purge any old fake demo data from previous sessions
   */
  purgeLegacyMockData() {
    const isCleaned = localStorage.getItem('nsg_guard_v2_cleaned_real_data');
    if (!isCleaned) {
      console.log("🧹 Purging old mock data to prepare for real Firestore data...");
      // Remove old mock keys
      localStorage.removeItem('nsg_guard_initialized');
      localStorage.removeItem(STORAGE_KEYS.CHECKPOINTS_CACHE);
      localStorage.removeItem(STORAGE_KEYS.CAMPUSES_CACHE);
      localStorage.removeItem(STORAGE_KEYS.ZONES_CACHE);
      localStorage.removeItem(STORAGE_KEYS.SHIFTS_CACHE);
      localStorage.removeItem(STORAGE_KEYS.USERS_CACHE);
      localStorage.removeItem(STORAGE_KEYS.PATROL_LOGS_CACHE);
      localStorage.removeItem(STORAGE_KEYS.INCIDENTS_CACHE);
      localStorage.removeItem(STORAGE_KEYS.HANDOVERS_CACHE);
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_SHIFT);

      // Initialize empty arrays
      this.set(STORAGE_KEYS.CHECKPOINTS_CACHE, []);
      this.set(STORAGE_KEYS.CAMPUSES_CACHE, []);
      this.set(STORAGE_KEYS.ZONES_CACHE, []);
      this.set(STORAGE_KEYS.SHIFTS_CACHE, []);
      this.set(STORAGE_KEYS.USERS_CACHE, []);
      this.set(STORAGE_KEYS.PATROL_LOGS_CACHE, []);
      this.set(STORAGE_KEYS.INCIDENTS_CACHE, []);
      this.set(STORAGE_KEYS.HANDOVERS_CACHE, []);
      this.set(STORAGE_KEYS.SETTINGS_CACHE, DEFAULT_SETTINGS);

      localStorage.setItem('nsg_guard_v2_cleaned_real_data', 'true');
    }
  }

  get(key, defaultValue = null) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultValue;
    } catch (e) {
      console.warn('Storage read error:', key, e);
      return defaultValue;
    }
  }

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('Storage write error:', key, e);
    }
  }

  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  }

  // User Authentication Session
  getCurrentUser() {
    const user = this.get(STORAGE_KEYS.CURRENT_USER, null);
    if (user && (!user.fixedShiftName || user.fixedShiftName.includes('14:00') || user.fixedShiftName.includes('22:00'))) {
      user.fixedShiftName = 'Ca Trực 24H (06:00 - 06:00 hôm sau)';
      user.currentShiftName = 'Ca Trực 24H (06:00 - 06:00 hôm sau)';
      this.setCurrentUser(user);
    }
    return user;
  }

  setCurrentUser(user) {
    if (user) {
      this.set(STORAGE_KEYS.CURRENT_USER, user);
    } else {
      this.remove(STORAGE_KEYS.CURRENT_USER);
    }
  }

  clearCurrentUser() {
    this.remove(STORAGE_KEYS.CURRENT_USER);
  }

  // Active Shift (24H from 06:00 to 06:00 next day)
  getActiveShift() {
    const list = this.getShifts();
    const current = this.get(STORAGE_KEYS.ACTIVE_SHIFT, null);
    if (current && list.some(s => s.id === current.id)) {
      return current;
    }
    return list.length > 0 ? list[0] : DEFAULT_SHIFTS[0];
  }

  setActiveShift(shift) {
    this.set(STORAGE_KEYS.ACTIVE_SHIFT, shift);
  }

  // Campuses
  getCampuses() {
    let list = this.get(STORAGE_KEYS.CAMPUSES_CACHE, null);
    if (!list || list.length === 0) {
      this.saveCampuses(DEFAULT_OFFICIAL_CAMPUSES);
      return DEFAULT_OFFICIAL_CAMPUSES;
    }
    // Migrate old hardcoded 10.74128 to user's official coordinates 10.735768115549721
    let needsSave = false;
    list = list.map(c => {
      if ((c.id === 'cs-chinh' || c.id === 'cs-caolo') && (Math.abs(c.lat - 10.74128) < 0.001 || !c.lat)) {
        needsSave = true;
        return {
          ...c,
          id: 'cs-chinh',
          lat: 10.735768115549721,
          lng: 106.68071864291426
        };
      }
      return c;
    });
    if (needsSave) {
      this.saveCampuses(list);
    }
    return list;
  }

  saveCampuses(list) {
    this.set(STORAGE_KEYS.CAMPUSES_CACHE, list);
  }

  // Checkpoints
  getCheckpoints() {
    return this.get(STORAGE_KEYS.CHECKPOINTS_CACHE, []);
  }

  saveCheckpoints(list) {
    this.set(STORAGE_KEYS.CHECKPOINTS_CACHE, list);
  }

  // Shifts (24H Shift Schedule: 06:00 today - 06:00 tomorrow)
  getShifts() {
    let list = this.get(STORAGE_KEYS.SHIFTS_CACHE, []);
    if (!list || list.length === 0 || list.some(s => (s.name || '').includes('14:00') || (s.name || '').includes('22:00'))) {
      this.saveShifts(DEFAULT_SHIFTS);
      return DEFAULT_SHIFTS;
    }
    return list;
  }

  saveShifts(list) {
    this.set(STORAGE_KEYS.SHIFTS_CACHE, list);
  }

  // Users (Auto-migrated to 24H shift)
  getUsers() {
    let list = this.get(STORAGE_KEYS.USERS_CACHE, []);
    let needsSave = false;
    list = list.map(u => {
      if (u.role === 'guard' && (!u.fixedShiftName || u.fixedShiftName.includes('14:00') || u.fixedShiftName.includes('22:00'))) {
        needsSave = true;
        return {
          ...u,
          fixedShiftName: 'Ca Trực 24H (06:00 - 06:00 hôm sau)',
          currentShiftName: 'Ca Trực 24H (06:00 - 06:00 hôm sau)'
        };
      }
      return u;
    });
    if (needsSave) {
      this.saveUsers(list);
    }
    return list;
  }

  saveUsers(list) {
    this.set(STORAGE_KEYS.USERS_CACHE, list);
  }

  // Patrol Logs
  getPatrolLogs() {
    return this.get(STORAGE_KEYS.PATROL_LOGS_CACHE, []);
  }

  savePatrolLogs(list) {
    this.set(STORAGE_KEYS.PATROL_LOGS_CACHE, list);
  }

  addPatrolLog(log) {
    const list = this.getPatrolLogs();
    list.unshift(log);
    this.savePatrolLogs(list);
    return list;
  }

  // Incidents
  getIncidents() {
    return this.get(STORAGE_KEYS.INCIDENTS_CACHE, []);
  }

  saveIncidents(list) {
    this.set(STORAGE_KEYS.INCIDENTS_CACHE, list);
  }

  addIncident(incident) {
    const list = this.getIncidents();
    list.unshift(incident);
    this.saveIncidents(list);
    return list;
  }

  updateIncidentStatus(id, newStatus, notes = '') {
    const list = this.getIncidents();
    const item = list.find(x => x.id === id);
    if (item) {
      item.status = newStatus;
      if (notes) item.notes = notes;
      this.saveIncidents(list);
    }
    return list;
  }

  // Handovers
  getHandovers() {
    return this.get(STORAGE_KEYS.HANDOVERS_CACHE, []);
  }

  saveHandovers(list) {
    this.set(STORAGE_KEYS.HANDOVERS_CACHE, list);
  }

  addHandover(handover) {
    const list = this.getHandovers();
    list.unshift(handover);
    this.saveHandovers(list);
    return list;
  }

  // Settings
  getSettings() {
    return this.get(STORAGE_KEYS.SETTINGS_CACHE, DEFAULT_SETTINGS);
  }

  saveSettings(settings) {
    this.set(STORAGE_KEYS.SETTINGS_CACHE, settings);
  }

  // View Mode
  getViewMode() {
    return localStorage.getItem(STORAGE_KEYS.CURRENT_VIEW_MODE) || 'guard_mobile';
  }

  setViewMode(mode) {
    localStorage.setItem(STORAGE_KEYS.CURRENT_VIEW_MODE, mode);
  }
}

export const storage = new LocalStorageManager();
