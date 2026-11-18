/**
 * NSG SMART GUARD - Desktop Admin Portal with Real Firestore & Google Maps
 * Allows Super Administrator to configure staff, edit fixed shifts,
 * change and reposition checkpoint GPS coordinates, and monitor the entire campus.
 */

import { storage, STORAGE_KEYS } from "./storage.js";
import { 
  createStaffAccountInAuthAndFirestore,
  deleteStaffAccount,
  updateFirestoreUser,
  createFirestoreCheckpoint,
  updateFirestoreCheckpoint,
  deleteFirestoreCheckpoint,
  createFirestoreCampus,
  updateFirestoreCampus,
  deleteFirestoreCampus,
  createFirestoreShift,
  SUPER_ADMIN_EMAIL,
  OFFICIAL_CAMPUSES,
  DEFAULT_SHIFTS,
  COLLECTIONS,
  formatLocalDateKey,
  getTodayDateKey,
  getYesterdayDateKey,
  getLogTimestampDate,
  getLogDateKey,
  isPatrolLogValid,
  evaluateCheckpointDailyStatus,
  fetchPatrolLogsByDateRange,
  getCampusRequiredGuardsPerShift,
  getShiftBucketKey,
  evaluateCampusShiftStaffing
} from "./firebase-config.js";

class AdminDesktopModule {
  constructor() {
    this.currentModule = 'dashboard';
    this.adminGoogleMap = null;
    this.adminMapMarkersGroup = null;
    this.adminCampusCircle = null;
    this.adminMapType = 'roadmap';
    this.adminMapLayer = null;
    this.adminSatLayer = null;

    // Daily Dashboard & Google Maps filter state
    this.dashboardDate = getTodayDateKey();
    this.dashboardShift = 'all';
    this.dashboardGuard = 'all';
    this.dashboardCampus = 'all';
    this.dashboardDutyCampus = 'all';
    this.dashboardLogsCache = null;

    // Staff & Roster on-duty filter state
    this.staffFilterCampus = 'all';
    this.staffFilterStatus = 'on_duty'; // Default: only show on-duty staff (hide off_duty)
    this.rosterFilterCampus = 'all';
    this.rosterOnlyOnDuty = false;

    // Patrol Logs filter state
    this.logFilterFrom = getTodayDateKey();
    this.logFilterTo = getTodayDateKey();
    this.logFilterShift = 'all';
    this.logFilterGuard = 'all';
    this.logFilterMode = 'today';
    this.logFilterLogsCache = null;

    // Monthly Report state
    this.reportMonth = getTodayDateKey().slice(0, 7);
    this.reportCampus = 'all';
    this.reportLogsCache = null;

    // Coordinate picker modal state
    this.pickerMap = null;
    this.pickerMarker = null;
    this.editPickerMap = null;
    this.editPickerMarker = null;
    this.campusPickerMap = null;
    this.campusPickerMarker = null;
    this.campusPickerCircle = null;
  }

  init() {
    this.bindSidebarEvents();
    this.renderModule(this.currentModule);
  }

  bindSidebarEvents() {
    document.querySelectorAll('.admin-nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const moduleKey = btn.getAttribute('data-admin-module');
        if (moduleKey) {
          this.switchModule(moduleKey);
        }
      });
    });
  }

  switchModule(moduleKey) {
    this.currentModule = moduleKey;

    document.querySelectorAll('.admin-nav-item').forEach(btn => {
      const isCurrent = btn.getAttribute('data-admin-module') === moduleKey;
      btn.classList.toggle('bg-blue-800', isCurrent);
      btn.classList.toggle('text-white', isCurrent);
      btn.classList.toggle('text-slate-300', !isCurrent);
    });

    const headerTitle = document.getElementById('admin-header-title');
    const titles = {
      dashboard: 'Tổng Quan & Giám Sát Google Maps',
      campuses: 'Quản Lý Cơ Sở Giáo Dục (Firestore)',
      zones: 'Khu Vực & Tòa Nhà',
      staff: 'Quản Lý Nhân Sự & Cấp Tài Khoản (Firestore)',
      shifts: 'Danh Mục Ca Trực Cố Định',
      roster: 'Phân Công Lịch Trực Ca Cố Định',
      checkpoints: 'Quản Lý Điểm Chốt & Định Vị Google Maps',
      patrol_logs: 'Nhật Ký Tuần Tra Thời Gian Thực',
      incidents: 'Quản Lý Sự Cố Toàn Trường',
      reports: 'Báo Cáo & Thống Kê Định Kỳ',
      settings: 'Cấu Hình Hệ Thống & Tham Số An Ninh'
    };
    if (headerTitle) headerTitle.textContent = titles[moduleKey] || 'Quản Trị NSG Smart Guard';

    this.renderModule(moduleKey);
  }

  renderModule(moduleKey) {
    const container = document.getElementById('admin-content-pane');
    if (!container) return;

    switch (moduleKey) {
      case 'dashboard':
        this.renderDashboard(container);
        break;
      case 'campuses':
        this.renderCampuses(container);
        break;
      case 'zones':
        this.renderZones(container);
        break;
      case 'staff':
        this.renderStaff(container);
        break;
      case 'shifts':
        this.renderShifts(container);
        break;
      case 'roster':
        this.renderRoster(container);
        break;
      case 'checkpoints':
        this.renderCheckpoints(container);
        break;
      case 'patrol_logs':
        this.renderPatrolLogs(container);
        break;
      case 'incidents':
        this.renderIncidents(container);
        break;
      case 'reports':
        this.renderReports(container);
        break;
      case 'settings':
        this.renderSettings(container);
        break;
      default:
        this.renderDashboard(container);
    }
  }

  /**
   * Helper: Filter logs by dateKey, shiftName, guardId
   */
  filterLogsByCriteria(allLogs, { dateKey = null, fromDate = null, toDate = null, shiftFilter = 'all', guardFilter = 'all' } = {}) {
    return (allLogs || []).filter(l => {
      const dk = getLogDateKey(l);
      if (dateKey && dk !== dateKey) return false;
      if (fromDate && dk < fromDate) return false;
      if (toDate && dk > toDate) return false;
      if (shiftFilter && shiftFilter !== 'all') {
        const sName = (l.shiftName || '').toLowerCase();
        if (!sName.includes(shiftFilter.toLowerCase())) return false;
      }
      if (guardFilter && guardFilter !== 'all') {
        if (l.guardId !== guardFilter) return false;
      }
      return true;
    });
  }

  async setDashboardDate(dateKey) {
    if (!dateKey) return;
    this.dashboardDate = dateKey;
    const todayKey = getTodayDateKey();
    if (dateKey !== todayKey) {
      this.dashboardLogsCache = await fetchPatrolLogsByDateRange(dateKey, dateKey);
    } else {
      this.dashboardLogsCache = null;
    }
    this.renderDashboard(document.getElementById('admin-content-pane'));
  }

  setDashboardShift(shiftVal) {
    this.dashboardShift = shiftVal || 'all';
    this.renderDashboard(document.getElementById('admin-content-pane'));
  }

  setDashboardGuard(guardVal) {
    this.dashboardGuard = guardVal || 'all';
    this.renderDashboard(document.getElementById('admin-content-pane'));
  }

  setDashboardCampus(campusVal) {
    this.dashboardCampus = campusVal || 'all';
    this.renderDashboard(document.getElementById('admin-content-pane'));
  }

  /**
   * Match a user/guard against a campusId (checks campusId, campusName, and main campus fallback)
   */
  doesUserMatchCampus(user, campusId, campusList = []) {
    if (!campusId || campusId === 'all') return true;
    if (!user) return false;
    if (user.campusId && user.campusId === campusId) return true;

    const targetCampus = campusList.find(c => c.id === campusId);
    if (!targetCampus) return false;

    const uName = (user.campusName || '').trim().toLowerCase();
    const cName = (targetCampus.name || '').trim().toLowerCase();
    const cPrefix = cName.split('-')[0].trim();

    if (uName && (uName === cName || (cPrefix && uName.includes(cPrefix)))) {
      return true;
    }

    const isTargetMain = targetCampus.id === 'cs-chinh' || targetCampus.id === 'cs-caolo' || (targetCampus.code || '').toUpperCase() === 'CS-CHINH';
    if (isTargetMain && !user.campusId && (!uName || uName.includes('cao lỗ') || uName.includes('trụ sở chính'))) {
      return true;
    }
    return false;
  }

  setDashboardDutyCampus(campusVal) {
    this.dashboardDutyCampus = campusVal || 'all';
    this.renderDashboard(document.getElementById('admin-content-pane'));
  }

  setStaffFilterCampus(campusVal) {
    this.staffFilterCampus = campusVal || 'all';
    this.renderStaff(document.getElementById('admin-content-pane'));
  }

  setStaffFilterStatus(statusVal) {
    this.staffFilterStatus = statusVal || 'on_duty';
    this.renderStaff(document.getElementById('admin-content-pane'));
  }

  setRosterFilterCampus(campusVal) {
    this.rosterFilterCampus = campusVal || 'all';
    this.renderRoster(document.getElementById('admin-content-pane'));
  }

  toggleRosterOnlyOnDuty() {
    this.rosterOnlyOnDuty = !this.rosterOnlyOnDuty;
    this.renderRoster(document.getElementById('admin-content-pane'));
  }

  async toggleGuardDutyStatus(userId) {
    const users = storage.getUsers();
    const target = users.find(u => u.id === userId);
    if (!target) return;

    const newStatus = target.status === 'on_duty' ? 'off_duty' : 'on_duty';
    try {
      await updateFirestoreUser(userId, { status: newStatus });
      this.renderModule(this.currentModule);
      if (window.renderManagerMobileUI) window.renderManagerMobileUI();
      if (window.renderHomeUI) window.renderHomeUI();
    } catch (err) {
      alert('Lỗi khi cập nhật trạng thái ca trực: ' + err.message);
    }
  }

  focusCheckpointOnMap(lat, lng) {
    if (this.adminGoogleMap && lat && lng) {
      this.adminGoogleMap.flyTo([parseFloat(lat), parseFloat(lng)], 19, { duration: 1.0 });
      const mapEl = document.getElementById('admin-google-map');
      if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /**
   * 1. Dashboard with Daily Patrol Status, Progress Tracking, Google Maps Filters & Overdue Alerts
   */
  renderDashboard(container) {
    if (!container) return;
    const allCheckpoints = storage.getCheckpoints();
    const rawLogs = this.dashboardLogsCache !== null ? this.dashboardLogsCache : storage.getPatrolLogs();
    const incidents = storage.getIncidents();
    const users = storage.getUsers();
    const shifts = storage.getShifts();
    const settings = storage.getSettings();
    const campuses = storage.getCampuses();
    const campusList = campuses.length > 0 ? campuses : OFFICIAL_CAMPUSES;
    const shiftList = shifts.length > 0 ? shifts : DEFAULT_SHIFTS;

    const guards = users.filter(u => u.role === 'guard');
    const onDutyAllGuards = guards.filter(g => g.status === 'on_duty');
    const onDutyCount = onDutyAllGuards.length;
    const onDutyCampusGuards = onDutyAllGuards.filter(g => this.doesUserMatchCampus(g, this.dashboardDutyCampus, campusList));
    const offDutyHiddenInCampusCount = guards.filter(g => g.status !== 'on_duty' && this.doesUserMatchCampus(g, this.dashboardDutyCampus, campusList)).length;
    const unresolvedIncidents = incidents.filter(i => i.status !== 'resolved').length;

    // Filter checkpoints by selected campus
    const selectedCampusObj = this.dashboardCampus !== 'all' ? campusList.find(c => c.id === this.dashboardCampus) : null;
    const checkpoints = allCheckpoints.filter(cp => {
      if (this.dashboardCampus === 'all') return true;
      if (cp.campusId && cp.campusId === this.dashboardCampus) return true;
      if (selectedCampusObj && cp.campusName && cp.campusName.toLowerCase().includes((selectedCampusObj.name || '').toLowerCase().split('-')[0].trim())) return true;
      return false;
    });

    // Filter logs strictly for selected date + shift + guard (NEVER carries over previous day!)
    const dayLogs = this.filterLogsByCriteria(rawLogs, {
      dateKey: this.dashboardDate,
      shiftFilter: this.dashboardShift,
      guardFilter: this.dashboardGuard
    });

    const distanceWarnings = dayLogs.filter(l => l.gpsStatus === 'warning_far').length;

    // Evaluate 4-state daily status for every checkpoint
    const cpStatuses = new Map();
    let checkedCps = 0;
    let uncheckedCps = 0;
    let dueSoonCps = 0;
    let unassignedCps = 0;
    const overdueList = [];

    checkpoints.forEach(cp => {
      const st = evaluateCheckpointDailyStatus(cp, this.dashboardDate, dayLogs, guards, settings);
      cpStatuses.set(cp.id, st);
      if (st.status === 'checked') checkedCps++;
      else if (st.status === 'due_soon') dueSoonCps++;
      else if (st.status === 'unassigned') unassignedCps++;
      else uncheckedCps++;

      if (st.isOverdue) {
        overdueList.push({ cp, st });
      }
    });

    const totalMustPatrol = checkpoints.length;
    const totalRemaining = Math.max(0, totalMustPatrol - checkedCps);
    const completionRate = totalMustPatrol > 0 ? Math.round((checkedCps / totalMustPatrol) * 100) : 0;

    // Latest scan details for selected date
    const validDayLogs = dayLogs.filter(l => isPatrolLogValid(l));
    const latestScan = validDayLogs[0] || dayLogs[0] || null;
    const latestScanTimeStr = latestScan
      ? `${getLogTimestampDate(latestScan).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} (${getLogDateKey(latestScan).split('-').reverse().join('/')})`
      : 'Chưa có lượt quét';
    const latestGuardName = latestScan ? latestScan.guardName : 'Chưa có nhân viên quét';
    const activeShiftLabel = this.dashboardShift !== 'all'
      ? this.dashboardShift
      : (latestScan?.shiftName || shiftList[0]?.name || 'Ca Trực 24H (06:00 - 06:00 hôm sau)');

    const todayKey = getTodayDateKey();
    const yesterdayKey = getYesterdayDateKey();
    const isViewingToday = this.dashboardDate === todayKey;
    const isViewingYesterday = this.dashboardDate === yesterdayKey;
    const displayDateVN = this.dashboardDate.split('-').reverse().join('/');

    container.innerHTML = `
      <div class="space-y-5">
        <!-- Overdue Patrol Alert Banner -->
        ${overdueList.length > 0 && isViewingToday ? `
          <div class="bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 rounded-2xl p-4 shadow-sm space-y-2.5">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center text-base shrink-0 animate-pulse">
                  <i class="fa-solid fa-bell"></i>
                </div>
                <div>
                  <h4 class="font-extrabold text-sm text-rose-800 dark:text-rose-200">
                    Cảnh báo tuần tra quá hạn (${overdueList.length} chốt chưa được quét hôm nay)
                  </h4>
                  <p class="text-xs text-rose-600 dark:text-rose-300">
                    Đã quá thời gian quy định (${settings.patrolIntervalMinutes || 180} phút) kể từ đầu ca nhưng bảo vệ chưa quét mã QR tại các chốt sau:
                  </p>
                </div>
              </div>
              <span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-600 text-white">Cần kiểm tra ngay</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
              ${overdueList.slice(0, 6).map(({ cp, st }) => `
                <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900/80 border border-rose-200 dark:border-rose-900 flex items-center justify-between gap-2 text-xs">
                  <div class="min-w-0">
                    <div class="font-bold text-slate-800 dark:text-slate-100 truncate">${cp.name}</div>
                    <div class="text-[11px] text-rose-600 dark:text-rose-400">Quá hạn ~${st.overdueMinutes} phút • ${cp.zoneName || cp.campusName || ''}</div>
                  </div>
                  ${cp.lat && cp.lng ? `
                    <button onclick="window.adminModule.focusCheckpointOnMap(${cp.lat}, ${cp.lng})" class="px-2 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-[10px] shrink-0">
                      <i class="fa-solid fa-location-crosshairs"></i> Xem
                    </button>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Top Stats Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Lực lượng bảo vệ</p>
              <h3 class="text-3xl font-extrabold text-blue-600 mt-1">${onDutyCount}<span class="text-base text-slate-400 font-normal">/${guards.length}</span></h3>
              <p class="text-[11px] text-emerald-600 font-semibold mt-1">Định biên: Cơ sở chính 2 BV/ca • Cơ sở phụ 1 BV/ca</p>
            </div>
            <div class="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl">
              <i class="fa-solid fa-user-shield"></i>
            </div>
          </div>

          <div class="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tiến độ ngày ${displayDateVN}</p>
              <h3 class="text-3xl font-extrabold ${completionRate === 100 && totalMustPatrol > 0 ? 'text-emerald-600' : 'text-blue-600'} mt-1">${completionRate}%</h3>
              <p class="text-xs text-slate-500 mt-1">Đã quét <strong class="text-emerald-600">${checkedCps}</strong> / <strong>${totalMustPatrol}</strong> • Chưa quét: <strong class="text-rose-600">${totalRemaining}</strong></p>
            </div>
            <div class="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl">
              <i class="fa-solid fa-route"></i>
            </div>
          </div>

          <div class="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sự cố ghi nhận</p>
              <h3 class="text-3xl font-extrabold ${unresolvedIncidents > 0 ? 'text-rose-600' : 'text-slate-700 dark:text-slate-200'} mt-1">${unresolvedIncidents}</h3>
              <p class="text-xs text-slate-500 mt-1">Chờ xử lý / Đang xử lý</p>
            </div>
            <div class="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center text-xl">
              <i class="fa-solid fa-triangle-exclamation"></i>
            </div>
          </div>

          <div class="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cảnh báo tuần tra</p>
              <h3 class="text-3xl font-extrabold ${(overdueList.length + distanceWarnings) > 0 ? 'text-amber-500' : 'text-slate-700 dark:text-slate-200'} mt-1">${overdueList.length + distanceWarnings}</h3>
              <p class="text-xs text-slate-500 mt-1">Quá hạn: <strong>${overdueList.length}</strong> • GPS: <strong>${distanceWarnings}</strong></p>
            </div>
            <div class="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl">
              <i class="fa-solid fa-location-crosshairs"></i>
            </div>
          </div>
        </div>

        <!-- Detailed Daily Patrol Progress Strip -->
        <div class="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-2">
              <span class="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold text-xs">
                <i class="fa-solid fa-calendar-day mr-1"></i> Tiến Độ Tuần Tra Ngày ${displayDateVN} ${isViewingToday ? '(Hôm nay)' : (isViewingYesterday ? '(Hôm qua)' : '(Lịch sử)')}
              </span>
              <span class="text-xs text-slate-500">Ca trực: <strong class="text-slate-700 dark:text-slate-200">${activeShiftLabel}</strong></span>
            </div>
            <div class="text-xs font-extrabold text-emerald-600 font-mono">${completionRate}% hoàn thành</div>
          </div>

          <div class="w-full h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div class="h-full bg-gradient-to-r from-blue-600 to-emerald-500 rounded-full transition-all duration-500" style="width: ${completionRate}%"></div>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs pt-1">
            <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-700/70">
              <div class="text-[10px] text-slate-400 uppercase font-bold">Tổng chốt phải quét</div>
              <div class="text-base font-extrabold text-slate-800 dark:text-slate-100 font-mono mt-0.5">${totalMustPatrol}</div>
            </div>
            <div class="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900">
              <div class="text-[10px] text-emerald-600 uppercase font-bold">Đã quét hợp lệ</div>
              <div class="text-base font-extrabold text-emerald-700 dark:text-emerald-400 font-mono mt-0.5">${checkedCps}</div>
            </div>
            <div class="p-2.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/70 dark:border-rose-900">
              <div class="text-[10px] text-rose-600 uppercase font-bold">Chưa quét</div>
              <div class="text-base font-extrabold text-rose-700 dark:text-rose-400 font-mono mt-0.5">${totalRemaining}</div>
            </div>
            <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-700/70">
              <div class="text-[10px] text-slate-400 uppercase font-bold">Quét gần nhất</div>
              <div class="text-xs font-bold text-slate-800 dark:text-slate-100 font-mono mt-1 truncate" title="${latestScanTimeStr}">${latestScanTimeStr}</div>
            </div>
            <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-700/70">
              <div class="text-[10px] text-slate-400 uppercase font-bold">Bảo vệ thực hiện</div>
              <div class="text-xs font-bold text-blue-700 dark:text-blue-300 mt-1 truncate" title="${latestGuardName}">${latestGuardName}</div>
            </div>
            <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-700/70">
              <div class="text-[10px] text-slate-400 uppercase font-bold">Lượt quét trong ngày</div>
              <div class="text-base font-extrabold text-blue-600 dark:text-blue-400 font-mono mt-0.5">${dayLogs.length} lượt</div>
            </div>
          </div>
        </div>

        <!-- Google Maps Section -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col space-y-3">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h4 class="font-bold text-base text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <i class="fa-solid fa-map-location-dot text-blue-600"></i> Bản Đồ Google Maps Giám Sát Chốt Theo Ngày
                </h4>
                <p class="text-xs text-slate-500">Đang xem trạng thái tuần tra ngày <strong>${displayDateVN}</strong> • Tự động reset mỗi ngày mới</p>
              </div>
              <div class="flex items-center gap-2">
                <button id="btn-admin-map-toggle" class="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700">
                  <i class="fa-solid fa-layer-group mr-1"></i> ${this.adminMapType === 'satellite' ? 'Xem Bản đồ' : 'Xem Vệ tinh'}
                </button>
                <button onclick="window.adminModule.zoomAdminToMyLocation()" class="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition">
                  <i class="fa-solid fa-crosshairs mr-1"></i> Vị trí của tôi
                </button>
              </div>
            </div>

            <!-- Google Maps Filter Toolbar (Date, Shift, Guard, Campus) -->
            <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 flex items-center flex-wrap gap-2 text-xs">
              <div class="flex items-center gap-1">
                <button onclick="window.adminModule.setDashboardDate('${todayKey}')" class="px-2.5 py-1.5 rounded-lg font-bold transition ${isViewingToday ? 'bg-blue-600 text-white shadow-xs' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'}">
                  Hôm nay
                </button>
                <button onclick="window.adminModule.setDashboardDate('${yesterdayKey}')" class="px-2.5 py-1.5 rounded-lg font-bold transition ${isViewingYesterday ? 'bg-blue-600 text-white shadow-xs' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'}">
                  Hôm qua
                </button>
                <input type="date" id="admin-map-date-picker" value="${this.dashboardDate}" onchange="window.adminModule.setDashboardDate(this.value)" class="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200">
              </div>

              <select id="admin-map-shift-filter" onchange="window.adminModule.setDashboardShift(this.value)" class="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200">
                <option value="all" ${this.dashboardShift === 'all' ? 'selected' : ''}>Tất cả ca trực</option>
                ${shiftList.map(s => `<option value="${s.name}" ${this.dashboardShift === s.name ? 'selected' : ''}>${s.name}</option>`).join('')}
              </select>

              <select id="admin-map-guard-filter" onchange="window.adminModule.setDashboardGuard(this.value)" class="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200">
                <option value="all" ${this.dashboardGuard === 'all' ? 'selected' : ''}>Tất cả bảo vệ</option>
                ${guards.map(g => `<option value="${g.id}" ${this.dashboardGuard === g.id ? 'selected' : ''}>${g.name} (${g.code})</option>`).join('')}
              </select>

              <select id="admin-map-campus-filter" onchange="window.adminModule.setDashboardCampus(this.value)" class="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200">
                <option value="all" ${this.dashboardCampus === 'all' ? 'selected' : ''}>Tất cả cơ sở</option>
                ${campusList.map(c => `<option value="${c.id}" ${this.dashboardCampus === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
              </select>
            </div>

            <div id="admin-google-map" class="w-full h-96 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 z-10"></div>

            <!-- 4-Color Status Legend -->
            <div class="flex items-center justify-between flex-wrap gap-2 pt-1 text-xs">
              <div class="flex items-center flex-wrap gap-3 font-semibold text-slate-600 dark:text-slate-300">
                <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-emerald-500 border border-white shadow-xs"></span> Đã quét (<strong class="text-emerald-600">${checkedCps}</strong>)</span>
                <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-rose-500 border border-white shadow-xs"></span> Chưa quét / Quá hạn (<strong class="text-rose-600">${uncheckedCps}</strong>)</span>
                <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-amber-500 border border-white shadow-xs"></span> Gần đến hạn (<strong class="text-amber-600">${dueSoonCps}</strong>)</span>
                <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-slate-500 border border-white shadow-xs"></span> Chưa phân công (<strong class="text-slate-500">${unassignedCps}</strong>)</span>
              </div>
              <span class="text-[11px] text-slate-400 font-mono">Định mức cảnh báo: ${settings.patrolIntervalMinutes || 180} phút</span>
            </div>
          </div>

          <!-- On-Duty Staff Roster Filtered by Campus (Strictly Hides Off-Duty Staff) -->
          <div class="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between gap-2 mb-2.5">
                <div class="flex items-center gap-2">
                  <h4 class="font-bold text-base text-slate-800 dark:text-slate-100">Nhân Sự Đang Trực</h4>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-mono">
                    ${onDutyCampusGuards.length} đang trực
                  </span>
                </div>
                <button onclick="window.adminModule.openAddStaffModal()" class="text-xs font-bold text-blue-600 hover:underline shrink-0">
                  + Cấp tài khoản
                </button>
              </div>

              <!-- Campus Filter for On-Duty Staff -->
              <div class="mb-3 space-y-1.5">
                <select id="dashboard-duty-campus-filter" onchange="window.adminModule.setDashboardDutyCampus(this.value)" class="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200">
                  <option value="all" ${this.dashboardDutyCampus === 'all' ? 'selected' : ''}>🏢 Tất cả cơ sở (${onDutyAllGuards.length} đang trực)</option>
                  ${campusList.map(c => {
                    const cOnCount = onDutyAllGuards.filter(g => this.doesUserMatchCampus(g, c.id, campusList)).length;
                    return `<option value="${c.id}" ${this.dashboardDutyCampus === c.id ? 'selected' : ''}>${c.name} (${cOnCount} đang trực)</option>`;
                  }).join('')}
                </select>
                <div class="flex items-center justify-between text-[10px] text-slate-400 px-0.5">
                  <span><i class="fa-solid fa-eye-slash mr-1"></i> Tự động ẩn nhân sự nghỉ ca (${offDutyHiddenInCampusCount} đã ẩn)</span>
                  <button onclick="window.adminModule.setStaffFilterStatus('all'); window.adminModule.switchModule('staff')" class="text-blue-600 hover:underline font-bold">
                    Quản lý ca &rarr;
                  </button>
                </div>
              </div>
              
              <div class="space-y-2.5 overflow-y-auto max-h-80 pr-1">
                ${onDutyCampusGuards.length === 0 ? `
                  <div class="py-8 px-3 text-center text-xs text-slate-400 bg-slate-50/70 dark:bg-slate-900/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 space-y-2">
                    <i class="fa-solid fa-user-clock text-2xl text-slate-300 block"></i>
                    <div class="font-bold text-slate-600 dark:text-slate-300">Không có nhân sự nào đang trực${this.dashboardDutyCampus !== 'all' ? ' tại cơ sở này' : ''}.</div>
                    <div class="text-[11px]">${offDutyHiddenInCampusCount > 0 ? `Có ${offDutyHiddenInCampusCount} bảo vệ đang nghỉ ca (không hiển thị ở danh sách đang trực).` : 'Chưa có bảo vệ nào được bật trạng thái Đang trực.'}</div>
                    <button onclick="window.adminModule.setStaffFilterStatus('all'); window.adminModule.switchModule('staff')" class="mt-1 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px]">
                      <i class="fa-solid fa-user-check mr-1"></i> Bật trạng thái Đang trực
                    </button>
                  </div>
                ` : onDutyCampusGuards.map(g => {
                  const guardDayScans = dayLogs.filter(l => l.guardId === g.id && isPatrolLogValid(l)).length;
                  return `
                    <div class="p-3 rounded-xl border border-emerald-200/70 dark:border-emerald-800/50 bg-emerald-50/20 dark:bg-emerald-950/10 flex items-center justify-between gap-2">
                      <div class="flex items-center gap-3 min-w-0">
                        <div class="relative shrink-0">
                          <img src="${g.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}" class="w-10 h-10 rounded-full object-cover border-2 border-emerald-500">
                          <span class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-800"></span>
                        </div>
                        <div class="min-w-0">
                          <div class="font-bold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1.5 truncate">
                            ${g.name}
                            <span class="text-[10px] text-blue-600 font-bold">(${g.code})</span>
                          </div>
                          <div class="text-[10px] text-slate-500 truncate">${g.campusName || 'Trụ sở chính - Số 47 Cao Lỗ'}</div>
                          <div class="text-[10px] text-emerald-600 font-bold truncate">${g.fixedShiftName || 'Ca Trực 24H'} • ${guardDayScans} quét</div>
                        </div>
                      </div>
                      <div class="flex items-center gap-1 shrink-0">
                        <button onclick="window.adminModule.toggleGuardDutyStatus('${g.id}')" class="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-100 hover:bg-rose-100 text-emerald-700 hover:text-rose-700 transition" title="Bấm để chuyển sang Nghỉ ca (sẽ ẩn khỏi danh sách đang trực)">
                          Đang trực
                        </button>
                        <button onclick="window.adminModule.openEditStaffModal('${g.id}')" class="text-blue-600 hover:text-blue-800 text-xs px-1.5 py-0.5 rounded hover:bg-blue-50" title="Chỉnh sửa thông tin">
                          <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

            <div class="pt-3 border-t border-slate-100 dark:border-slate-700 mt-3 flex gap-2">
              <button onclick="window.adminModule.openAddCheckpointModal()" class="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition">
                <i class="fa-solid fa-plus mr-1"></i> Thêm chốt QR mới
              </button>
              <button onclick="window.adminModule.switchModule('checkpoints')" class="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs">
                In QR
              </button>
            </div>
          </div>
        </div>

        <!-- Recent Patrol Log Table for Selected Date -->
        <div class="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <h4 class="font-bold text-base text-slate-800 dark:text-slate-100">Nhật Ký Quét QR Ngày ${displayDateVN} (${dayLogs.length} bản ghi)</h4>
            <button onclick="window.adminModule.switchModule('patrol_logs')" class="text-xs font-bold text-blue-600 hover:underline">
              Xem tất cả nhật ký & Xuất Excel &rarr;
            </button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead class="bg-slate-50 dark:bg-slate-900/50 text-slate-500 uppercase text-[11px]">
                <tr>
                  <th class="p-3">Ngày & Giờ quét</th>
                  <th class="p-3">Điểm chốt</th>
                  <th class="p-3">Ca trực</th>
                  <th class="p-3">Nhân viên</th>
                  <th class="p-3">Khoảng cách GPS</th>
                  <th class="p-3">Trạng thái</th>
                  <th class="p-3 text-right">Tọa độ GPS</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
                ${dayLogs.length === 0 ? `
                  <tr><td colspan="7" class="p-6 text-center text-slate-400">Chưa có lượt tuần tra nào được ghi nhận trong ngày ${displayDateVN}.</td></tr>
                ` : dayLogs.slice(0, 8).map(l => {
                  const isValid = isPatrolLogValid(l);
                  const ts = getLogTimestampDate(l);
                  const gmapLink = l.guardCoordinates ? `https://www.google.com/maps?q=${l.guardCoordinates.lat},${l.guardCoordinates.lng}` : '#';
                  return `
                    <tr class="hover:bg-slate-50/50">
                      <td class="p-3 font-mono font-semibold">${ts.toLocaleTimeString('vi-VN')} <span class="text-slate-400 font-normal">(${ts.toLocaleDateString('vi-VN')})</span></td>
                      <td class="p-3 font-bold text-slate-800 dark:text-slate-100">${l.checkpointName} <span class="text-[10px] font-mono text-slate-400">${l.checkpointCode || ''}</span></td>
                      <td class="p-3 text-[11px]">${l.shiftName || 'Ca Trực 24H'}</td>
                      <td class="p-3 font-semibold">${l.guardName}</td>
                      <td class="p-3 font-semibold ${isValid ? 'text-emerald-600' : 'text-amber-600'}">
                        ${l.distanceMeters !== null && l.distanceMeters !== undefined ? l.distanceMeters + 'm' : '—'}
                      </td>
                      <td class="p-3">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${isValid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
                          ${isValid ? 'Hợp lệ' : 'Cảnh báo'}
                        </span>
                      </td>
                      <td class="p-3 text-right">
                        ${l.guardCoordinates ? `
                          <a href="${gmapLink}" target="_blank" class="text-blue-600 font-bold hover:underline font-mono text-[11px]">
                            <i class="fa-solid fa-location-dot mr-0.5"></i> ${Number(l.guardCoordinates.lat).toFixed(5)}, ${Number(l.guardCoordinates.lng).toFixed(5)}
                          </a>
                        ` : '—'}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    setTimeout(() => {
      this.initAdminGoogleMap(checkpoints, cpStatuses);
      this.bindAdminMapEvents();
    }, 80);
  }

  bindAdminMapEvents() {
    const toggleBtn = document.getElementById('btn-admin-map-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        if (!this.adminGoogleMap) return;
        if (this.adminMapType === 'roadmap') {
          this.adminGoogleMap.removeLayer(this.adminMapLayer);
          this.adminSatLayer.addTo(this.adminGoogleMap);
          this.adminMapType = 'satellite';
          toggleBtn.innerHTML = '<i class="fa-solid fa-map mr-1"></i> Xem Bản đồ';
        } else {
          this.adminGoogleMap.removeLayer(this.adminSatLayer);
          this.adminMapLayer.addTo(this.adminGoogleMap);
          this.adminMapType = 'roadmap';
          toggleBtn.innerHTML = '<i class="fa-solid fa-layer-group mr-1"></i> Xem Vệ tinh';
        }
      });
    }
  }

  panAdminMapToCampus(campusId) {
    if (!this.adminGoogleMap) return;
    const campuses = storage.getCampuses();
    const list = campuses.length > 0 ? campuses : OFFICIAL_CAMPUSES;

    if (campusId === 'all') {
      const main = list.find(c => c.id === 'cs-chinh' || c.id === 'cs-caolo') || list[0];
      if (main && main.lat) {
        this.adminGoogleMap.flyTo([main.lat, main.lng], 17, { duration: 1.2 });
        this.drawAdminCampusCircle(main);
      }
    } else {
      const target = list.find(c => c.id === campusId);
      if (target && target.lat) {
        this.adminGoogleMap.flyTo([target.lat, target.lng], 18, { duration: 1.2 });
        this.drawAdminCampusCircle(target);
      }
    }
  }

  drawAdminCampusCircle(campus) {
    if (!this.adminGoogleMap || !campus || !campus.lat) return;
    if (this.adminCampusCircle) {
      this.adminGoogleMap.removeLayer(this.adminCampusCircle);
    }
    const radius = campus.radiusMeters || campus.radius || 150;
    this.adminCampusCircle = L.circle([campus.lat, campus.lng], {
      radius: radius,
      color: '#2563eb',
      fillColor: '#3b82f6',
      fillOpacity: 0.12,
      weight: 2,
      dashArray: '4, 4'
    }).addTo(this.adminGoogleMap);

    this.adminCampusCircle.bindTooltip(`${campus.name} (Bán kính ${radius}m)`, { permanent: false, direction: 'top' });
  }

  initAdminGoogleMap(checkpoints, cpStatuses = new Map()) {
    const mapEl = document.getElementById('admin-google-map');
    if (!mapEl || !window.L) return;

    const campuses = storage.getCampuses();
    const list = campuses.length > 0 ? campuses : OFFICIAL_CAMPUSES;
    const targetCampus = this.dashboardCampus !== 'all'
      ? list.find(c => c.id === this.dashboardCampus)
      : (list.find(c => c.id === 'cs-chinh' || c.id === 'cs-caolo') || list[0]);

    const centerLat = parseFloat(targetCampus?.lat) || 10.735768115549721;
    const centerLng = parseFloat(targetCampus?.lng) || 106.68071864291426;
    const zoomLvl = this.dashboardCampus !== 'all' ? 18 : 17;

    if (this.adminGoogleMap) {
      this.adminGoogleMap.remove();
      this.adminGoogleMap = null;
    }

    this.adminGoogleMap = L.map('admin-google-map', {
      zoomControl: true,
      attributionControl: false
    }).setView([centerLat, centerLng], zoomLvl);

    this.adminMapLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    });

    this.adminSatLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    });

    if (this.adminMapType === 'satellite') {
      this.adminSatLayer.addTo(this.adminGoogleMap);
    } else {
      this.adminMapLayer.addTo(this.adminGoogleMap);
    }

    this.adminMapMarkersGroup = L.layerGroup().addTo(this.adminGoogleMap);

    if (targetCampus) this.drawAdminCampusCircle(targetCampus);

    const displayDateVN = this.dashboardDate.split('-').reverse().join('/');

    // Add 4-Color Daily Status Checkpoint Markers
    checkpoints.forEach(cp => {
      if (!cp.lat || !cp.lng) return;
      const st = cpStatuses.get(cp.id) || {
        status: 'unchecked',
        color: '#ef4444',
        badgeBg: '#fee2e2',
        badgeText: '#991b1b',
        label: 'Chưa quét',
        latestLog: null,
        scanCount: 0
      };

      const iconClass = st.status === 'checked'
        ? 'fa-check'
        : (st.status === 'due_soon' ? 'fa-clock' : (st.status === 'unassigned' ? 'fa-user-slash' : 'fa-qrcode'));

      const customIcon = L.divIcon({
        className: 'admin-map-checkpoint-marker',
        html: `
          <div style="background-color: ${st.color}; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; border: 2.5px solid white; box-shadow: 0 2px 10px rgba(0,0,0,0.45); font-size: 13px; cursor: pointer;">
            <i class="fa-solid ${iconClass}"></i>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([parseFloat(cp.lat), parseFloat(cp.lng)], { icon: customIcon });
      const gDir = `https://www.google.com/maps/dir/?api=1&destination=${cp.lat},${cp.lng}`;

      const scanInfoHtml = st.latestLog
        ? `
          <div style="margin: 6px 0; padding: 6px 8px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 11px;">
            <div><strong>Bảo vệ:</strong> ${st.latestLog.guardName}</div>
            <div><strong>Giờ quét:</strong> ${getLogTimestampDate(st.latestLog).toLocaleTimeString('vi-VN')} (${st.scanCount} lượt ngày ${displayDateVN})</div>
            <div><strong>Khoảng cách GPS:</strong> ${st.latestLog.distanceMeters !== null && st.latestLog.distanceMeters !== undefined ? st.latestLog.distanceMeters + 'm' : 'Hợp lệ'}</div>
            <div><strong>Ca trực:</strong> ${st.latestLog.shiftName || 'Ca Trực 24H'}</div>
          </div>
        `
        : `
          <div style="margin: 6px 0; font-size: 11px; color: #64748b;">
            Ngày xem: <strong>${displayDateVN}</strong>
            ${st.isOverdue ? `<br><span style="color: #dc2626; font-weight: bold;">⚠️ Quá hạn ~${st.overdueMinutes} phút chưa quét!</span>` : ''}
            ${st.status === 'due_soon' ? `<br><span style="color: #d97706; font-weight: bold;">⏱ Còn khoảng ${st.minutesRemaining} phút đến hạn kiểm tra</span>` : ''}
          </div>
        `;

      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 12px; line-height: 1.4; min-width: 210px;">
          <strong style="color: #1e40af; font-size: 13px;">${cp.name}</strong><br>
          <span style="color: #64748b;">${cp.campusName || ''} • ${cp.zoneName || ''} (${cp.floor || ''})</span><br>
          <div style="margin: 6px 0;">
            <span style="padding: 2px 7px; border-radius: 5px; background: ${st.badgeBg}; color: ${st.badgeText}; font-weight: bold; font-size: 11px;">
              ${st.label}
            </span>
          </div>
          ${scanInfoHtml}
          <div style="margin-top: 6px; display: flex; gap: 6px;">
            <a href="${gDir}" target="_blank" style="padding: 4px 8px; border-radius: 6px; background: #2563eb; color: white; text-decoration: none; font-size: 11px; font-weight: bold;">
              Chỉ đường Maps &rarr;
            </a>
            <button onclick="window.adminModule.openEditCheckpointModal('${cp.id}')" style="padding: 4px 8px; border-radius: 6px; background: #f1f5f9; color: #0f172a; border: 1px solid #cbd5e1; font-size: 11px; font-weight: bold; cursor: pointer;">
              Sửa vị trí
            </button>
          </div>
        </div>
      `);
      this.adminMapMarkersGroup.addLayer(marker);
    });
  }

  zoomAdminToMyLocation() {
    if (!this.adminGoogleMap) return;
    navigator.geolocation.getCurrentPosition(
      pos => {
        this.adminGoogleMap.setView([pos.coords.latitude, pos.coords.longitude], 18);
        L.marker([pos.coords.latitude, pos.coords.longitude])
          .addTo(this.adminGoogleMap)
          .bindPopup('Vị trí GPS của bạn').openPopup();
      },
      () => alert('Không thể lấy tọa độ GPS.')
    );
  }

  /**
   * 2. Staff Management (Direct Firestore Integration, Campus & On-Duty Filtering)
   */
  renderStaff(container) {
    const users = storage.getUsers();
    const campuses = storage.getCampuses();
    const campusList = campuses.length > 0 ? campuses : OFFICIAL_CAMPUSES;

    // Filter by campus first
    const campusMatchedUsers = users.filter(u => this.doesUserMatchCampus(u, this.staffFilterCampus, campusList));
    const onDutyCountInCampus = campusMatchedUsers.filter(u => u.status === 'on_duty').length;
    const offDutyCountInCampus = campusMatchedUsers.filter(u => u.status !== 'on_duty').length;

    // Strictly hide off-duty staff when filter is 'on_duty' (default)
    const filteredUsers = this.staffFilterStatus === 'on_duty'
      ? campusMatchedUsers.filter(u => u.status === 'on_duty')
      : campusMatchedUsers;

    container.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h4 class="font-bold text-lg text-slate-800 dark:text-slate-100">Quản Lý Nhân Sự & Phân Quyền Firebase Auth</h4>
            <p class="text-xs text-slate-500">Super Admin: <strong class="text-blue-600 font-mono">${SUPER_ADMIN_EMAIL}</strong> • Lọc nhanh nhân sự đang trực theo cơ sở (ẩn người nghỉ ca)</p>
          </div>
          <button onclick="window.adminModule.openAddStaffModal()" class="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition">
            <i class="fa-solid fa-user-plus mr-1.5"></i> + Cấp tài khoản mới (Firebase Auth)
          </button>
        </div>

        <!-- Campus & On-Duty Filter Toolbar -->
        <div class="flex items-center justify-between flex-wrap gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700">
          <div class="flex items-center flex-wrap gap-2">
            <label for="staff-campus-filter" class="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <i class="fa-solid fa-building text-blue-600"></i> Lọc theo cơ sở:
            </label>
            <select id="staff-campus-filter" onchange="window.adminModule.setStaffFilterCampus(this.value)" class="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 min-w-[220px]">
              <option value="all" ${this.staffFilterCampus === 'all' ? 'selected' : ''}>Tất cả cơ sở (${users.filter(u => u.status === 'on_duty').length} đang trực)</option>
              ${campusList.map(c => {
                const cOn = users.filter(u => u.status === 'on_duty' && this.doesUserMatchCampus(u, c.id, campusList)).length;
                return `<option value="${c.id}" ${this.staffFilterCampus === c.id ? 'selected' : ''}>${c.name} (${cOn} đang trực)</option>`;
              }).join('')}
            </select>
          </div>

          <div class="flex items-center gap-1.5 flex-wrap text-xs">
            <button onclick="window.adminModule.setStaffFilterStatus('on_duty')" class="px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${this.staffFilterStatus === 'on_duty' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'}">
              <span class="w-2 h-2 rounded-full ${this.staffFilterStatus === 'on_duty' ? 'bg-white' : 'bg-emerald-500'}"></span>
              Đang trực (${onDutyCountInCampus}) • Ẩn nghỉ ca
            </button>
            <button onclick="window.adminModule.setStaffFilterStatus('all')" class="px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${this.staffFilterStatus === 'all' ? 'bg-blue-600 text-white shadow-xs' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'}">
              <i class="fa-solid fa-users text-[11px]"></i>
              Tất cả (${campusMatchedUsers.length}${offDutyCountInCampus > 0 ? ` • ${offDutyCountInCampus} nghỉ ca` : ''})
            </button>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs text-slate-600 dark:text-slate-300">
            <thead class="bg-slate-50 dark:bg-slate-900 text-slate-500 uppercase text-[11px]">
              <tr>
                <th class="p-3">Họ tên & Chức vụ</th>
                <th class="p-3">Email Authentication</th>
                <th class="p-3">Mã NV</th>
                <th class="p-3">Phân quyền</th>
                <th class="p-3">Ca cố định</th>
                <th class="p-3">Cơ sở phụ trách</th>
                <th class="p-3">Trạng thái ca</th>
                <th class="p-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
              ${filteredUsers.length === 0 ? `
                <tr><td colspan="8" class="p-8 text-center text-slate-400">
                  ${users.length === 0
                    ? 'Chưa có tài khoản nào trong hệ thống. Bấm "+ Cấp tài khoản mới" ở trên để tạo.'
                    : (this.staffFilterStatus === 'on_duty'
                      ? `Không có nhân sự nào đang trực${this.staffFilterCampus !== 'all' ? ' tại cơ sở này' : ''}. (${offDutyCountInCampus} nhân sự nghỉ ca đang được ẩn — bấm nút "Tất cả" ở trên để xem hoặc bật lại Đang trực.)`
                      : 'Không có nhân sự nào thuộc cơ sở đã chọn.')
                  }
                </td></tr>
              ` : filteredUsers.map(u => {
                const isSuper = u.email === SUPER_ADMIN_EMAIL || u.isSuperAdmin;
                const isOn = u.status === 'on_duty';
                return `
                  <tr class="hover:bg-slate-50/50">
                    <td class="p-3">
                      <div class="flex items-center gap-3">
                        <img src="${u.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}" class="w-9 h-9 rounded-full object-cover">
                        <div>
                          <div class="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                            ${u.name}
                            ${isSuper ? '<span class="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-500 text-white">SUPER ADMIN</span>' : ''}
                          </div>
                          <div class="text-[10px] text-slate-400">${u.position || (isSuper ? 'Quản trị viên tối cao' : 'Nhân viên bảo vệ')} • ${u.phone || 'Chưa có SĐT'}</div>
                        </div>
                      </div>
                    </td>
                    <td class="p-3 font-mono font-bold text-blue-600">${u.email || '—'}</td>
                    <td class="p-3 font-mono font-bold text-slate-700 dark:text-slate-200">${u.code || '—'}</td>
                    <td class="p-3">
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isSuper ? 'bg-amber-100 text-amber-800 font-extrabold' : (u.role === 'admin' ? 'bg-purple-100 text-purple-700' : (u.role === 'manager' ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'))}">
                        ${isSuper ? 'SUPER ADMIN' : (u.role || 'guard').toUpperCase()}
                      </span>
                    </td>
                    <td class="p-3 font-semibold text-slate-800 dark:text-slate-200">
                      <span class="px-2 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 text-[11px] font-bold">
                        ${u.fixedShiftName || u.currentShiftName || 'Ca Trực 24H (06:00 - 06:00 hôm sau)'}
                      </span>
                    </td>
                    <td class="p-3">${u.campusName || 'Trụ sở chính - Số 47 Cao Lỗ'}</td>
                    <td class="p-3">
                      <button onclick="window.adminModule.toggleGuardDutyStatus('${u.id}')" class="px-2.5 py-1 rounded-full text-[10px] font-bold transition inline-flex items-center gap-1 ${isOn ? 'bg-emerald-100 hover:bg-rose-100 text-emerald-700 hover:text-rose-700' : 'bg-slate-100 hover:bg-emerald-100 text-slate-500 hover:text-emerald-700'}" title="Bấm để chuyển nhanh Đang trực / Nghỉ ca">
                        <span class="w-1.5 h-1.5 rounded-full ${isOn ? 'bg-emerald-500' : 'bg-slate-400'}"></span>
                        ${isOn ? 'Đang trực' : (u.status === 'off_duty' ? 'Nghỉ ca' : 'Nghỉ ca')}
                      </button>
                    </td>
                    <td class="p-3 text-right">
                      <div class="flex items-center justify-end gap-1.5">
                        <button onclick="window.adminModule.openEditStaffModal('${u.id}')" class="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition" title="Chỉnh sửa thông tin">
                          <i class="fa-solid fa-pen-to-square mr-1"></i> Sửa
                        </button>
                        ${isSuper ? `
                          <span class="text-[10px] text-amber-600 font-bold px-2 py-1 bg-amber-50 rounded">Gốc</span>
                        ` : `
                          <button onclick="window.adminModule.deleteStaff('${u.id}')" class="px-2 py-1 text-rose-600 hover:bg-rose-50 rounded text-xs font-bold" title="Xóa tài khoản">
                            <i class="fa-solid fa-trash-can"></i>
                          </button>
                        `}
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /**
   * Edit Staff Modal
   */
  openEditStaffModal(userId) {
    const users = storage.getUsers();
    const user = users.find(u => u.id === userId);
    if (!user) {
      alert("Không tìm thấy thông tin nhân viên!");
      return;
    }

    const campuses = storage.getCampuses();
    const campusList = campuses.length > 0 ? campuses : OFFICIAL_CAMPUSES;

    const modalHtml = `
      <div id="modal-edit-staff" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 border border-slate-200 dark:border-slate-800 max-h-[92vh] overflow-y-auto">
          <div class="flex items-center justify-between">
            <div>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">SUPER ADMINISTRATOR</span>
              <h3 class="font-bold text-base text-slate-900 dark:text-white mt-0.5">Chỉnh Sửa Thông Tin Người Dùng</h3>
            </div>
            <button onclick="document.getElementById('modal-edit-staff').remove()" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-xmark text-lg"></i></button>
          </div>

          <form id="form-edit-staff" class="space-y-3 text-xs">
            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Họ và tên *</label>
              <input type="text" id="edit-staff-name" value="${user.name || ''}" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold" required>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Mã nhân viên *</label>
                <input type="text" id="edit-staff-code" value="${user.code || ''}" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono uppercase" required>
              </div>
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Số điện thoại</label>
                <input type="tel" id="edit-staff-phone" value="${user.phone || ''}" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800">
              </div>
            </div>

            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Email</label>
              <input type="email" id="edit-staff-email" value="${user.email || ''}" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono" ${user.email === SUPER_ADMIN_EMAIL ? 'readonly disabled' : ''}>
            </div>

            <!-- Fixed Shift Assignment -->
            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Phân công ca trực cố định *</label>
              <select id="edit-staff-shift" class="w-full px-3 py-2 rounded-xl border border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/40 font-bold text-blue-900 dark:text-blue-200">
                <option value="Ca Trực 24H (06:00 - 06:00 hôm sau)" ${(!user.fixedShiftName || (user.fixedShiftName.includes('24H') && !user.fixedShiftName.includes('Kíp'))) ? 'selected' : ''}>Ca Trực 24H (06:00 - 06:00 hôm sau)</option>
                <option value="Kíp 1 - Ca 24H (06:00 - 06:00)" ${(user.fixedShiftName || '').includes('Kíp 1') ? 'selected' : ''}>Kíp 1 - Ca 24H (06:00 - 06:00)</option>
                <option value="Kíp 2 - Ca 24H (06:00 - 06:00)" ${(user.fixedShiftName || '').includes('Kíp 2') ? 'selected' : ''}>Kíp 2 - Ca 24H (06:00 - 06:00)</option>
              </select>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Phân quyền vai trò</label>
                <select id="edit-staff-role" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold" ${user.email === SUPER_ADMIN_EMAIL ? 'disabled' : ''}>
                  <option value="guard" ${user.role === 'guard' ? 'selected' : ''}>Bảo vệ (Mobile App)</option>
                  <option value="manager" ${user.role === 'manager' ? 'selected' : ''}>Quản lý / Phó phòng</option>
                  <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Quản trị viên / BGH</option>
                </select>
              </div>
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Trạng thái làm việc</label>
                <select id="edit-staff-status" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold">
                  <option value="on_duty" ${user.status === 'on_duty' ? 'selected' : ''}>Đang trực</option>
                  <option value="off_duty" ${user.status === 'off_duty' ? 'selected' : ''}>Nghỉ ca</option>
                  <option value="active" ${user.status === 'active' ? 'selected' : ''}>Hoạt động</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Cơ sở phân công</label>
              <select id="edit-staff-campus" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800">
                ${campusList.map(c => `
                  <option value="${c.id}" ${(user.campusId === c.id || user.campusName === c.name) ? 'selected' : ''}>${c.name}</option>
                `).join('')}
              </select>
            </div>

            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Mật khẩu mới (Để trống nếu không đổi)</label>
              <input type="text" id="edit-staff-pass" placeholder="Nhập mật khẩu mới nếu muốn đổi..." class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono">
            </div>

            <div class="pt-2 flex justify-end gap-2">
              <button type="button" onclick="document.getElementById('modal-edit-staff').remove()" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Hủy</button>
              <button type="submit" id="btn-submit-edit-staff" class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold">
                Lưu Thay Đổi vào Firestore
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('form-edit-staff').onsubmit = async (e) => {
      e.preventDefault();
      const name = document.getElementById('edit-staff-name').value.trim();
      const code = document.getElementById('edit-staff-code').value.trim().toUpperCase();
      const phone = document.getElementById('edit-staff-phone').value.trim();
      const fixedShiftName = document.getElementById('edit-staff-shift').value;
      const role = document.getElementById('edit-staff-role').value;
      const status = document.getElementById('edit-staff-status').value;
      const campusId = document.getElementById('edit-staff-campus').value;
      const selectedCampusObj = campusList.find(c => c.id === campusId);
      const campusName = selectedCampusObj ? selectedCampusObj.name : (user.campusName || 'Trụ sở chính - Số 47 Cao Lỗ');
      const newPass = document.getElementById('edit-staff-pass').value.trim();

      const btn = document.getElementById('btn-submit-edit-staff');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang lưu...';

      const updates = {
        name,
        code,
        phone,
        fixedShiftName,
        currentShiftName: fixedShiftName,
        campusId: selectedCampusObj ? selectedCampusObj.id : (user.campusId || 'cs-chinh'),
        campusName,
        status,
        role: user.email === SUPER_ADMIN_EMAIL ? 'admin' : role
      };

      if (newPass && newPass.length >= 6) {
        updates.password = newPass;
      }

      try {
        await updateFirestoreUser(userId, updates);
        document.getElementById('modal-edit-staff').remove();
        alert(`✅ Đã cập nhật thành công thông tin nhân viên ${name} vào Firestore!`);
        this.renderModule(this.currentModule);
        if (window.renderManagerMobileUI) window.renderManagerMobileUI();
        if (window.renderHomeUI) window.renderHomeUI();
      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = 'Lưu Thay Đổi vào Firestore';
        alert("Lỗi khi cập nhật Firestore: " + err.message);
      }
    };
  }

  openAddStaffModal() {
    const campuses = storage.getCampuses();
    const campusList = campuses.length > 0 ? campuses : OFFICIAL_CAMPUSES;

    const modalHtml = `
      <div id="modal-add-staff" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 border border-slate-200 dark:border-slate-800">
          <div class="flex items-center justify-between">
            <div>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">FIREBASE AUTHENTICATION</span>
              <h3 class="font-bold text-base text-slate-900 dark:text-white mt-0.5">Tạo Tài Khoản & Phân Quyền</h3>
            </div>
            <button onclick="document.getElementById('modal-add-staff').remove()" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-xmark text-lg"></i></button>
          </div>

          <form id="form-add-staff" class="space-y-3 text-xs">
            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Email đăng nhập Authentication *</label>
              <input type="email" id="staff-email" placeholder="VD: bv01@nsg.edu.vn" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono" required>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Mật khẩu (Tối thiểu 6 ký tự) *</label>
                <input type="password" id="staff-pass" value="123456" minlength="6" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono" required>
              </div>
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Mã NV ngắn *</label>
                <input type="text" id="staff-code" placeholder="VD: BV-01" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono uppercase" required>
              </div>
            </div>

            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Họ và tên nhân viên *</label>
              <input type="text" id="staff-name" placeholder="VD: Trần Văn Bình" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800" required>
            </div>

            <!-- Fixed Shift Assignment -->
            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Ca trực cố định được phân công *</label>
              <select id="staff-fixed-shift" class="w-full px-3 py-2 rounded-xl border border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/40 font-bold text-blue-900 dark:text-blue-200">
                <option value="Ca Trực 24H (06:00 - 06:00 hôm sau)" selected>Ca Trực 24H (06:00 - 06:00 hôm sau)</option>
                <option value="Kíp 1 - Ca 24H (06:00 - 06:00)">Kíp 1 - Ca 24H (06:00 - 06:00)</option>
                <option value="Kíp 2 - Ca 24H (06:00 - 06:00)">Kíp 2 - Ca 24H (06:00 - 06:00)</option>
              </select>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Số điện thoại</label>
                <input type="tel" id="staff-phone" placeholder="090..." class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800">
              </div>
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Phân quyền vai trò *</label>
                <select id="staff-role" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold">
                  <option value="guard" selected>Bảo vệ (Mobile App)</option>
                  <option value="manager">Quản lý / Phó phòng</option>
                  <option value="admin">Quản trị viên / BGH</option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Cơ sở phân công</label>
                <select id="staff-campus" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800">
                  ${campusList.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Trạng thái ca</label>
                <select id="staff-status" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold">
                  <option value="on_duty" selected>🟢 Đang trực</option>
                  <option value="off_duty">⚪ Nghỉ ca</option>
                </select>
              </div>
            </div>

            <div class="pt-2 flex justify-end gap-2">
              <button type="button" onclick="document.getElementById('modal-add-staff').remove()" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Hủy</button>
              <button type="submit" id="btn-submit-add-staff" class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold">
                Tạo vào Firebase Auth
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('form-add-staff').onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('staff-email').value.trim();
      const password = document.getElementById('staff-pass').value.trim();
      const name = document.getElementById('staff-name').value.trim();
      const code = document.getElementById('staff-code').value.trim().toUpperCase();
      const phone = document.getElementById('staff-phone').value.trim();
      const fixedShiftName = document.getElementById('staff-fixed-shift').value;
      const role = document.getElementById('staff-role').value;
      const campusId = document.getElementById('staff-campus').value;
      const selectedCampusObj = campusList.find(c => c.id === campusId);
      const campusName = selectedCampusObj ? selectedCampusObj.name : 'Trụ sở chính - Số 47 Cao Lỗ';
      const status = document.getElementById('staff-status')?.value || 'on_duty';

      const submitBtn = document.getElementById('btn-submit-add-staff');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang tạo trên Firebase...';

      try {
        await createStaffAccountInAuthAndFirestore({
          email,
          password,
          name,
          code,
          phone,
          fixedShiftName,
          currentShiftName: fixedShiftName,
          role,
          campusId: selectedCampusObj ? selectedCampusObj.id : 'cs-chinh',
          campusName,
          status
        });
        document.getElementById('modal-add-staff').remove();
        alert(`🎉 TẠO TÀI KHOẢN THÀNH CÔNG!\n\nEmail: ${email}\nHọ tên: ${name}\nMã NV: ${code}\nPhân quyền: ${role.toUpperCase()}\nCa cố định: ${fixedShiftName}\nCơ sở: ${campusName}\n\nTài khoản đã được tạo trực tiếp trong Firebase Authentication và cấp quyền trong hệ thống!`);
        this.renderModule(this.currentModule);
        if (window.renderRosterUI) window.renderRosterUI();
        if (window.renderManagerMobileUI) window.renderManagerMobileUI();
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Tạo vào Firebase Auth';
        let msg = err.message;
        if (err.code === 'auth/email-already-in-use') {
          msg = 'Email này đã tồn tại trong Firebase Authentication. Vui lòng chọn email khác.';
        } else if (err.code === 'auth/weak-password') {
          msg = 'Mật khẩu phải có ít nhất 6 ký tự.';
        }
        alert('❌ Lỗi khi tạo tài khoản: ' + msg);
      }
    };
  }

  async deleteStaff(id) {
    if (confirm('Bạn có chắc chắn muốn xóa tài khoản này khỏi Firestore?')) {
      try {
        await deleteStaffAccount(id);
        alert('Đã xóa tài khoản thành công.');
        this.renderStaff(document.getElementById('admin-content-pane'));
      } catch(err) {
        alert(err.message);
      }
    }
  }

  /**
   * 3. Checkpoints Management (Super Administrator Edit & Move GPS Coordinates)
   */
  renderCheckpoints(container) {
    const checkpoints = storage.getCheckpoints();
    container.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h4 class="font-bold text-lg text-slate-800 dark:text-slate-100">Điểm Chốt Tuần Tra & Tọa Độ Google Maps</h4>
            <p class="text-xs text-slate-500">Super Administrator có quyền thay đổi, di dời vị trí giám sát trực tiếp trên Google Maps</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="window.adminModule.printAllQrCards()" class="px-4 py-2.5 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow-sm transition">
              <i class="fa-solid fa-print mr-1.5"></i> In tất cả thẻ QR
            </button>
            <button onclick="window.adminModule.openAddCheckpointModal()" class="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition">
              <i class="fa-solid fa-plus mr-1.5"></i> + Thêm chốt bằng Google Maps
            </button>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs text-slate-600 dark:text-slate-300">
            <thead class="bg-slate-50 dark:bg-slate-900 text-slate-500 uppercase text-[11px]">
              <tr>
                <th class="p-3">Mã chốt</th>
                <th class="p-3">Tên chốt</th>
                <th class="p-3">Khu vực / Tầng</th>
                <th class="p-3">Tọa độ GPS (Google Maps)</th>
                <th class="p-3">Bán kính cho phép</th>
                <th class="p-3">Google Maps</th>
                <th class="p-3 text-right">Thao tác Quản trị</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
              ${checkpoints.length === 0 ? `
                <tr><td colspan="7" class="p-8 text-center text-slate-400">Chưa có chốt tuần tra nào trong Firestore. Bấm "+ Thêm chốt bằng Google Maps" ở trên để thêm điểm thật.</td></tr>
              ` : checkpoints.map(cp => `
                <tr class="hover:bg-slate-50/50">
                  <td class="p-3 font-mono font-bold text-blue-600">${cp.code}</td>
                  <td class="p-3">
                    <div class="font-bold text-slate-800 dark:text-slate-100">${cp.name}</div>
                    <div class="text-[11px] text-slate-400 line-clamp-1">${cp.description || ''}</div>
                  </td>
                  <td class="p-3">${cp.zoneName || 'Khu A'} (${cp.floor || 'Trệt'})</td>
                  <td class="p-3 font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                    ${cp.lat ? cp.lat.toFixed(5) : '—'}, ${cp.lng ? cp.lng.toFixed(5) : '—'}
                  </td>
                  <td class="p-3 font-bold text-slate-700 dark:text-slate-300">≤ ${cp.allowedRadius || 20}m</td>
                  <td class="p-3">
                    ${cp.lat && cp.lng ? `
                      <a href="https://www.google.com/maps?q=${cp.lat},${cp.lng}" target="_blank" class="text-blue-600 font-bold hover:underline">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> Mở Map
                      </a>
                    ` : '—'}
                  </td>
                  <td class="p-3 text-right">
                    <div class="flex items-center justify-end gap-1.5">
                      <button onclick="window.adminModule.openEditCheckpointModal('${cp.id}')" class="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-xs font-bold transition" title="Thay đổi vị trí GPS & nội dung chốt">
                        <i class="fa-solid fa-location-pen mr-1"></i> Sửa vị trí
                      </button>
                      <button onclick="window.adminModule.previewQrModal('${cp.id}')" class="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold">
                        <i class="fa-solid fa-qrcode"></i> QR
                      </button>
                      <button onclick="window.adminModule.deleteCheckpoint('${cp.id}')" class="px-2 py-1 text-rose-600 hover:bg-rose-50 rounded text-xs font-bold" title="Xóa chốt">
                        <i class="fa-solid fa-trash-can"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /**
   * Edit Checkpoint Modal with Interactive Google Maps Marker Dragging
   */
  openEditCheckpointModal(cpId) {
    const checkpoints = storage.getCheckpoints();
    const cp = checkpoints.find(c => c.id === cpId);
    if (!cp) {
      alert("Không tìm thấy điểm chốt này!");
      return;
    }

    const initLat = cp.lat || 10.735768115549721;
    const initLng = cp.lng || 106.68071864291426;

    const modalHtml = `
      <div id="modal-edit-checkpoint" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 border border-slate-200 dark:border-slate-800 max-h-[92vh] overflow-y-auto">
          <div class="flex items-center justify-between">
            <div>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">SUPER ADMINISTRATOR</span>
              <h3 class="font-bold text-base text-slate-900 dark:text-white mt-0.5">Thay Đổi Vị Trí Giám Sát & Chốt Tuần Tra</h3>
            </div>
            <button onclick="document.getElementById('modal-edit-checkpoint').remove()" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-xmark text-lg"></i></button>
          </div>

          <form id="form-edit-checkpoint" class="space-y-3 text-xs">
            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Tên điểm chốt *</label>
              <input type="text" id="edit-cp-name" value="${cp.name || ''}" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold" required>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Mã QR chốt *</label>
                <input type="text" id="edit-cp-code" value="${cp.code || ''}" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold" required>
              </div>
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Bán kính quét cho phép (m) *</label>
                <input type="number" id="edit-cp-radius" value="${cp.allowedRadius || 20}" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800" required>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Khu nhà / Khối phòng</label>
                <input type="text" id="edit-cp-zone" value="${cp.zoneName || ''}" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800">
              </div>
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Tầng lầu</label>
                <input type="text" id="edit-cp-floor" value="${cp.floor || ''}" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800">
              </div>
            </div>

            <!-- Google Map Coordinate Picker & Drag Marker -->
            <div class="space-y-1.5 pt-1">
              <div class="flex items-center justify-between">
                <label class="font-bold text-slate-700 dark:text-slate-300">
                  <i class="fa-solid fa-map-pin text-rose-500 mr-1"></i> Bấm bản đồ hoặc kéo ghim để đổi vị trí:
                </label>
                <button type="button" onclick="window.adminModule.setEditPickerCurrentGps()" class="text-blue-600 font-bold hover:underline">
                  <i class="fa-solid fa-location-crosshairs mr-1"></i> Lấy GPS hiện tại
                </button>
              </div>
              
              <div id="edit-picker-google-map" class="w-full h-56 rounded-2xl border border-slate-300 dark:border-slate-700 overflow-hidden z-10"></div>
              
              <div class="grid grid-cols-2 gap-2 pt-1 font-mono">
                <div>
                  <span class="text-[10px] text-slate-400 block font-semibold">Vĩ độ (Latitude)</span>
                  <input type="number" step="any" id="edit-cp-lat" value="${initLat}" class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold" required>
                </div>
                <div>
                  <span class="text-[10px] text-slate-400 block font-semibold">Kinh độ (Longitude)</span>
                  <input type="number" step="any" id="edit-cp-lng" value="${initLng}" class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold" required>
                </div>
              </div>
            </div>

            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Mô tả nhiệm vụ kiểm tra</label>
              <textarea id="edit-cp-desc" rows="2" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800">${cp.description || ''}</textarea>
            </div>

            <div class="pt-2 flex justify-end gap-2">
              <button type="button" onclick="document.getElementById('modal-edit-checkpoint').remove()" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Hủy</button>
              <button type="submit" id="btn-submit-edit-cp" class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold">
                Lưu Vị Trí Mới vào Firestore
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Initialize Interactive Edit Map
    setTimeout(() => {
      const pickerEl = document.getElementById('edit-picker-google-map');
      if (pickerEl && window.L) {
        this.editPickerMap = L.map('edit-picker-google-map', { zoomControl: true, attributionControl: false }).setView([initLat, initLng], 18);
        
        L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { maxZoom: 20 }).addTo(this.editPickerMap);

        this.editPickerMarker = L.marker([initLat, initLng], { draggable: true }).addTo(this.editPickerMap);

        this.editPickerMarker.bindPopup(`<strong>Vị trí chốt</strong><br>Kéo ghim này đến vị trí mới`).openPopup();

        this.editPickerMarker.on('dragend', (e) => {
          const pos = e.target.getLatLng();
          document.getElementById('edit-cp-lat').value = pos.lat.toFixed(6);
          document.getElementById('edit-cp-lng').value = pos.lng.toFixed(6);
        });

        this.editPickerMap.on('click', (e) => {
          this.editPickerMarker.setLatLng(e.latlng);
          document.getElementById('edit-cp-lat').value = e.latlng.lat.toFixed(6);
          document.getElementById('edit-cp-lng').value = e.latlng.lng.toFixed(6);
        });
      }
    }, 150);

    // Submit Handler
    document.getElementById('form-edit-checkpoint').onsubmit = async (e) => {
      e.preventDefault();
      const name = document.getElementById('edit-cp-name').value.trim();
      const code = document.getElementById('edit-cp-code').value.trim().toUpperCase();
      const allowedRadius = parseInt(document.getElementById('edit-cp-radius').value, 10) || 20;
      const zoneName = document.getElementById('edit-cp-zone').value.trim();
      const floor = document.getElementById('edit-cp-floor').value.trim();
      const lat = parseFloat(document.getElementById('edit-cp-lat').value);
      const lng = parseFloat(document.getElementById('edit-cp-lng').value);
      const description = document.getElementById('edit-cp-desc').value.trim();

      const btn = document.getElementById('btn-submit-edit-cp');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang lưu...';

      const updates = {
        name,
        code,
        allowedRadius,
        zoneName,
        floor,
        lat,
        lng,
        description
      };

      try {
        await updateFirestoreCheckpoint(cpId, updates);
        document.getElementById('modal-edit-checkpoint').remove();
        alert(`✅ ĐÃ CẬP NHẬT VỊ TRÍ CHỐT THÀNH CÔNG!\n\nChốt: ${name}\nTọa độ mới: ${lat.toFixed(6)}, ${lng.toFixed(6)}\nDữ liệu đã lưu trực tiếp vào Firestore!`);
        this.renderCheckpoints(document.getElementById('admin-content-pane'));
      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = 'Lưu Vị Trí Mới vào Firestore';
        alert("Lỗi khi cập nhật Firestore: " + err.message);
      }
    };
  }

  setEditPickerCurrentGps() {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        document.getElementById('edit-cp-lat').value = lat.toFixed(6);
        document.getElementById('edit-cp-lng').value = lng.toFixed(6);
        if (this.editPickerMarker && this.editPickerMap) {
          this.editPickerMarker.setLatLng([lat, lng]);
          this.editPickerMap.setView([lat, lng], 18);
        }
      },
      () => alert('Không thể lấy vị trí GPS hiện tại.')
    );
  }

  openAddCheckpointModal() {
    const modalHtml = `
      <div id="modal-add-checkpoint" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 border border-slate-200 dark:border-slate-800 max-h-[92vh] overflow-y-auto">
          <div class="flex items-center justify-between">
            <h3 class="font-bold text-base text-slate-900 dark:text-white">Thêm Điểm Chốt Định Vị Google Maps</h3>
            <button onclick="document.getElementById('modal-add-checkpoint').remove()" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-xmark text-lg"></i></button>
          </div>

          <form id="form-add-checkpoint" class="space-y-3 text-xs">
            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Tên điểm chốt *</label>
              <input type="text" id="cp-name" placeholder="VD: Cổng chính số 47 Cao Lỗ" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800" required>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Mã QR chốt *</label>
                <input type="text" id="cp-code" placeholder="VD: QR-CS1-GATE" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono" required>
              </div>
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Bán kính quét cho phép (m) *</label>
                <input type="number" id="cp-radius" value="20" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800" required>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Khu nhà / Khối phòng</label>
                <input type="text" id="cp-zone" placeholder="VD: Khu A (Hiệu Bộ)" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800">
              </div>
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Tầng lầu</label>
                <input type="text" id="cp-floor" placeholder="VD: Trệt hoặc Lầu 2" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800">
              </div>
            </div>

            <!-- Google Map Picker Box -->
            <div class="space-y-1.5 pt-1">
              <div class="flex items-center justify-between">
                <label class="font-bold text-slate-700 dark:text-slate-300">Chọn vị trí trên Google Maps (Bấm vào bản đồ để thả ghim):</label>
                <button type="button" onclick="window.adminModule.setPickerCurrentGps()" class="text-blue-600 font-bold hover:underline">
                  <i class="fa-solid fa-location-crosshairs mr-1"></i> Lấy GPS hiện tại
                </button>
              </div>
              <div id="picker-google-map" class="w-full h-52 rounded-2xl border border-slate-300 dark:border-slate-700 overflow-hidden z-10"></div>
              
              <div class="grid grid-cols-2 gap-2 pt-1 font-mono">
                <div>
                  <span class="text-[10px] text-slate-400 block">Vĩ độ (Latitude)</span>
                  <input type="number" step="any" id="cp-lat" value="10.735768115549721" class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px]" required>
                </div>
                <div>
                  <span class="text-[10px] text-slate-400 block">Kinh độ (Longitude)</span>
                  <input type="number" step="any" id="cp-lng" value="106.68071864291426" class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px]" required>
                </div>
              </div>
            </div>

            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Mô tả nhiệm vụ kiểm tra</label>
              <textarea id="cp-desc" rows="2" placeholder="Ghi chú các hạng mục an ninh cần kiểm tra tại chốt..." class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"></textarea>
            </div>

            <div class="pt-2 flex justify-end gap-2">
              <button type="button" onclick="document.getElementById('modal-add-checkpoint').remove()" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Hủy</button>
              <button type="submit" class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold">Lưu Chốt vào Firestore</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Initialize Picker Map
    setTimeout(() => {
      const pickerEl = document.getElementById('picker-google-map');
      if (pickerEl && window.L) {
        this.pickerMap = L.map('picker-google-map', { zoomControl: true, attributionControl: false }).setView([10.735768115549721, 106.68071864291426], 17);
        
        L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { maxZoom: 20 }).addTo(this.pickerMap);

        this.pickerMarker = L.marker([10.735768115549721, 106.68071864291426], { draggable: true }).addTo(this.pickerMap);

        this.pickerMarker.on('dragend', (e) => {
          const pos = e.target.getLatLng();
          document.getElementById('cp-lat').value = pos.lat;
          document.getElementById('cp-lng').value = pos.lng;
        });

        this.pickerMap.on('click', (e) => {
          this.pickerMarker.setLatLng(e.latlng);
          document.getElementById('cp-lat').value = e.latlng.lat;
          document.getElementById('cp-lng').value = e.latlng.lng;
        });
      }
    }, 150);

    // Submit Handler
    document.getElementById('form-add-checkpoint').onsubmit = async (e) => {
      e.preventDefault();
      const name = document.getElementById('cp-name').value.trim();
      const code = document.getElementById('cp-code').value.trim().toUpperCase();
      const allowedRadius = parseInt(document.getElementById('cp-radius').value, 10) || 20;
      const zoneName = document.getElementById('cp-zone').value.trim() || 'Khu A';
      const floor = document.getElementById('cp-floor').value.trim() || 'Trệt';
      const lat = parseFloat(document.getElementById('cp-lat').value);
      const lng = parseFloat(document.getElementById('cp-lng').value);
      const description = document.getElementById('cp-desc').value.trim();

      try {
        await createFirestoreCheckpoint({
          name,
          code,
          allowedRadius,
          zoneName,
          floor,
          lat,
          lng,
          description,
          campusName: 'Cao Đẳng Nam Sài Gòn',
          status: 'active'
        });
        document.getElementById('modal-add-checkpoint').remove();
        alert(`✅ Đã thêm điểm chốt "${name}" thành công vào Firestore!`);
        this.renderCheckpoints(document.getElementById('admin-content-pane'));
      } catch (err) {
        alert('Lỗi khi lưu điểm chốt: ' + err.message);
      }
    };
  }

  setPickerCurrentGps() {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        document.getElementById('cp-lat').value = lat.toFixed(6);
        document.getElementById('cp-lng').value = lng.toFixed(6);
        if (this.pickerMarker && this.pickerMap) {
          this.pickerMarker.setLatLng([lat, lng]);
          this.pickerMap.setView([lat, lng], 18);
        }
      },
      () => alert('Không thể lấy vị trí GPS hiện tại.')
    );
  }

  async deleteCheckpoint(id) {
    if (confirm('Bạn có chắc chắn muốn xóa chốt này khỏi Firestore?')) {
      await deleteFirestoreCheckpoint(id);
      this.renderCheckpoints(document.getElementById('admin-content-pane'));
    }
  }

  previewQrModal(cpId) {
    const cp = storage.getCheckpoints().find(c => c.id === cpId);
    if (!cp) return;

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(cp.code)}`;

    const modalHtml = `
      <div id="admin-qr-preview-modal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-white rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl relative">
          <button onclick="document.getElementById('admin-qr-preview-modal').remove()" class="absolute top-4 right-4 text-slate-400 hover:text-slate-700 text-xl font-bold">
            <i class="fa-solid fa-xmark"></i>
          </button>
          
          <div class="text-xs font-bold uppercase tracking-wider text-blue-600 mb-1">MÃ CHỐT TUẦN TRA AN NINH</div>
          <h3 class="text-base font-extrabold text-slate-900">${cp.name}</h3>
          <p class="text-xs text-slate-500 mb-4">${cp.zoneName || ''} (${cp.floor || ''})</p>

          <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 inline-block mb-3">
            <img src="${qrUrl}" alt="Mã QR" class="w-56 h-56 mx-auto object-contain">
          </div>

          <div class="font-mono text-xs font-bold text-slate-600 mb-4 bg-slate-100 py-1 px-3 rounded-lg inline-block">
            ${cp.code}
          </div>

          <div class="flex gap-2">
            <a href="${qrUrl}" download="${cp.code}.png" class="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs">
              <i class="fa-solid fa-download mr-1"></i> Tải ảnh
            </a>
            <button onclick="window.print()" class="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs">
              <i class="fa-solid fa-print mr-1"></i> In thẻ
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  printAllQrCards() {
    const checkpoints = storage.getCheckpoints();
    if (checkpoints.length === 0) {
      alert('Chưa có chốt tuần tra nào để in. Vui lòng thêm chốt trước.');
      return;
    }
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>In Thẻ QR Chốt Tuần Tra - NSG SMART GUARD</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; color: #1e293b; }
          .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
          .card { border: 2px dashed #0284c7; border-radius: 12px; padding: 16px; text-align: center; page-break-inside: avoid; }
          .title { font-size: 14px; font-weight: bold; margin-bottom: 4px; color: #1e40af; }
          .sub { font-size: 11px; color: #64748b; margin-bottom: 12px; }
          .qr { width: 180px; height: 180px; margin: 0 auto 10px; }
          .code { font-family: monospace; font-size: 13px; font-weight: bold; background: #f1f5f9; padding: 4px 8px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <h2 style="text-align: center; color: #1e40af;">HỆ THỐNG MÃ QR CHỐT TUẦN TRA - CAO ĐẲNG NAM SÀI GÒN</h2>
        <div class="grid">
          ${checkpoints.map(cp => `
            <div class="card">
              <div class="title">${cp.name}</div>
              <div class="sub">${cp.zoneName || ''} (${cp.floor || ''})</div>
              <img class="qr" src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(cp.code)}">
              <div class="code">${cp.code}</div>
            </div>
          `).join('')}
        </div>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  /**
   * 4. Campuses Management (Customize GPS for All Branches and Main Campus)
   */
  renderCampuses(container) {
    if (!container) return;
    const campuses = storage.getCampuses();
    const guards = storage.getUsers().filter(u => u.role === 'guard');
    const staffingList = evaluateCampusShiftStaffing(campuses, guards);
    const staffingById = new Map(staffingList.map(s => [s.campus.id, s]));

    container.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h4 class="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <i class="fa-solid fa-school text-blue-600"></i> Quản Lý Cơ Sở & Tùy Chỉnh Tọa Độ GPS (Google Maps)
            </h4>
            <p class="text-xs text-slate-500">Định biên quy định: <strong>Trụ sở chính: 2 bảo vệ / 1 ca trực</strong> • <strong>Cơ sở phụ / phân hiệu: 1 bảo vệ / 1 ca trực</strong></p>
          </div>
          <button onclick="window.adminModule.openAddCampusModal()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition">
            <i class="fa-solid fa-plus mr-1.5"></i> + Thêm phân hiệu mới
          </button>
        </div>

        ${campuses.length === 0 ? `
          <div class="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
            Chưa có cơ sở / phân hiệu nào trên Firestore. Nhấn <strong>"+ Thêm phân hiệu mới"</strong> để tạo mới.
          </div>
        ` : `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${campuses.map(c => {
            const isMain = c.id === 'cs-chinh' || c.id === 'cs-caolo';
            const radius = c.radiusMeters || c.radius || 150;
            const quota = getCampusRequiredGuardsPerShift(c);
            const stf = staffingById.get(c.id);
            const assignedCount = stf ? stf.totalAssigned : 0;
            const isEnough = assignedCount >= quota;
            const latVal = parseFloat(c.lat);
            const lngVal = parseFloat(c.lng);
            const hasCoords = !isNaN(latVal) && !isNaN(lngVal);
            return `
              <div class="p-5 rounded-2xl border ${isMain ? 'border-blue-400 dark:border-blue-500 bg-blue-50/20 dark:bg-slate-900/60 shadow-sm' : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50'} hover:border-blue-500 transition shadow-xs flex flex-col justify-between">
                <div>
                  <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                      <span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${isMain ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'} font-mono">${c.code || 'CS'}</span>
                      ${isMain ? `
                        <span class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-500 text-white flex items-center gap-1 shadow-xs">
                          <i class="fa-solid fa-star text-[9px]"></i> TRỤ SỞ CHÍNH
                        </span>
                      ` : `
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                          CƠ SỞ PHỤ
                        </span>
                      `}
                    </div>
                    <span class="px-2 py-0.5 rounded text-[11px] font-bold ${isEnough ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}">
                      ${isEnough ? `✓ Đủ quân số (${assignedCount} BV)` : `⚠ Thiếu BV (${assignedCount}/${quota})`}
                    </span>
                  </div>

                  <h5 class="font-bold text-base text-slate-800 dark:text-slate-100 mt-1">${c.name}</h5>
                  <p class="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                    <i class="fa-solid fa-location-dot text-rose-500 mr-1.5"></i> ${c.address || 'Chưa cập nhật địa chỉ'}
                  </p>

                  <div class="mt-3 p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs space-y-1.5">
                    <div class="flex items-center justify-between">
                      <span class="text-slate-400">Định biên trực / 1 ca:</span>
                      <span class="px-2 py-0.5 rounded-md font-extrabold ${isMain ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}">
                        <i class="fa-solid fa-user-shield mr-1"></i> ${quota} bảo vệ / 1 ca
                      </span>
                    </div>
                    <div class="flex items-center justify-between">
                      <span class="text-slate-400">Tọa độ GPS tâm:</span>
                      <span class="font-mono font-bold text-blue-600 dark:text-blue-400">
                        ${hasCoords ? `${latVal.toFixed(6)}, ${lngVal.toFixed(6)}` : '—'}
                      </span>
                    </div>
                    <div class="flex items-center justify-between">
                      <span class="text-slate-400">Bán kính geofence:</span>
                      <span class="font-bold text-slate-700 dark:text-slate-200">${radius} mét</span>
                    </div>
                  </div>
                </div>

                <div class="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 flex-wrap">
                  <div class="flex items-center gap-2">
                    <button onclick="window.adminModule.openEditCampusModal('${c.id}')" class="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200 font-bold text-xs transition flex items-center gap-1 border border-amber-200 dark:border-amber-800">
                      <i class="fa-solid fa-location-pen"></i> Sửa GPS & Thông tin
                    </button>
                    ${!isMain ? `
                      <button onclick="window.adminModule.deleteCampus('${c.id}')" class="px-2.5 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 text-xs font-bold transition" title="Xóa phân hiệu">
                        <i class="fa-solid fa-trash-can"></i>
                      </button>
                    ` : ''}
                  </div>

                  <a href="https://www.google.com/maps?q=${hasCoords ? `${latVal},${lngVal}` : '10.735768115549721,106.68071864291426'}" target="_blank" class="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 dark:bg-slate-800 dark:text-blue-400 font-bold hover:bg-blue-100 transition flex items-center gap-1 text-xs">
                    <i class="fa-brands fa-google"></i> Mở Google Maps
                  </a>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        `}
      </div>
    `;
  }

  /**
   * Edit Campus GPS Coordinates & Details Modal
   */
  openEditCampusModal(campusId) {
    const rawCampuses = storage.getCampuses();
    const campuses = rawCampuses.length > 0 ? rawCampuses : OFFICIAL_CAMPUSES;
    const campus = campuses.find(c => c.id === campusId);
    if (!campus) {
      alert("Không tìm thấy cơ sở này!");
      return;
    }

    const isMain = campus.id === 'cs-chinh' || campus.id === 'cs-caolo';
    const initLat = campus.lat || 10.735768115549721;
    const initLng = campus.lng || 106.68071864291426;
    const initRadius = campus.radiusMeters || campus.radius || 150;

    const modalHtml = `
      <div id="modal-edit-campus" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 border border-slate-200 dark:border-slate-800 max-h-[92vh] overflow-y-auto">
          <div class="flex items-center justify-between">
            <div>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isMain ? 'bg-amber-100 text-amber-800 font-extrabold' : 'bg-blue-100 text-blue-800'}">
                ${isMain ? '⭐ TRỤ SỞ CHÍNH (SỐ 47 CAO LỖ)' : 'PHÂN HIỆU / CƠ SỞ'}
              </span>
              <h3 class="font-bold text-base text-slate-900 dark:text-white mt-0.5">Tùy Chỉnh Tọa Độ GPS & Bán Kính Cơ Sở</h3>
            </div>
            <button onclick="document.getElementById('modal-edit-campus').remove()" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-xmark text-lg"></i></button>
          </div>

          <form id="form-edit-campus" class="space-y-3 text-xs">
            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Tên cơ sở / Phân hiệu *</label>
              <input type="text" id="edit-campus-name" value="${campus.name || ''}" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold" required>
            </div>

            <div class="grid grid-cols-3 gap-2">
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Mã cơ sở *</label>
                <input type="text" id="edit-campus-code" value="${campus.code || 'CS'}" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold uppercase" required>
              </div>
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Bán kính GPS (m) *</label>
                <input type="number" id="edit-campus-radius" value="${initRadius}" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold" required>
              </div>
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Số BV / 1 ca *</label>
                <input type="number" id="edit-campus-guards-per-shift" min="1" max="10" value="${getCampusRequiredGuardsPerShift(campus)}" class="w-full px-3 py-2 rounded-xl border border-blue-300 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-950/40 font-bold text-blue-700 dark:text-blue-300" required>
              </div>
            </div>

            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Địa chỉ chi tiết *</label>
              <input type="text" id="edit-campus-address" value="${campus.address || ''}" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800" required>
            </div>

            <!-- Interactive Google Maps Coordinate Picker & Geofence Circle -->
            <div class="space-y-1.5 pt-1">
              <div class="flex items-center justify-between">
                <label class="font-bold text-slate-700 dark:text-slate-300">
                  <i class="fa-solid fa-map-location-dot text-blue-600 mr-1"></i> Bấm bản đồ hoặc kéo ghim để định vị tâm cơ sở:
                </label>
                <button type="button" onclick="window.adminModule.setCampusPickerCurrentGps()" class="text-blue-600 font-bold hover:underline">
                  <i class="fa-solid fa-location-crosshairs mr-1"></i> Lấy GPS hiện tại
                </button>
              </div>

              <div id="edit-campus-google-map" class="w-full h-56 rounded-2xl border border-slate-300 dark:border-slate-700 overflow-hidden z-10"></div>

              <div class="grid grid-cols-2 gap-2 pt-1 font-mono">
                <div>
                  <span class="text-[10px] text-slate-400 block font-semibold">Vĩ độ GPS (Latitude)</span>
                  <input type="number" step="any" id="edit-campus-lat" value="${initLat}" class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold" required>
                </div>
                <div>
                  <span class="text-[10px] text-slate-400 block font-semibold">Kinh độ GPS (Longitude)</span>
                  <input type="number" step="any" id="edit-campus-lng" value="${initLng}" class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold" required>
                </div>
              </div>
            </div>

            <div class="pt-2 flex justify-end gap-2">
              <button type="button" onclick="document.getElementById('modal-edit-campus').remove()" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Hủy</button>
              <button type="submit" id="btn-submit-edit-campus" class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold">
                Lưu Tọa Độ vào Firestore
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.getElementById('modal-edit-campus')?.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Initialize Campus Map Picker
    setTimeout(() => {
      const pickerEl = document.getElementById('edit-campus-google-map');
      if (pickerEl && window.L) {
        if (this.campusPickerMap) {
          try { this.campusPickerMap.remove(); } catch (e) {}
          this.campusPickerMap = null;
        }
        this.campusPickerMap = L.map('edit-campus-google-map', { zoomControl: true, attributionControl: false }).setView([initLat, initLng], 17);

        L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { maxZoom: 20 }).addTo(this.campusPickerMap);

        this.campusPickerMarker = L.marker([initLat, initLng], { draggable: true }).addTo(this.campusPickerMap);
        this.campusPickerCircle = L.circle([initLat, initLng], {
          radius: initRadius,
          color: '#2563eb',
          fillColor: '#3b82f6',
          fillOpacity: 0.15,
          weight: 2,
          dashArray: '4, 4'
        }).addTo(this.campusPickerMap);

        this.campusPickerMarker.bindPopup(`<strong>Tâm GPS: ${campus.name}</strong><br>Kéo ghim hoặc bấm bản đồ để di dời`).openPopup();

        const updatePickerPos = (lat, lng) => {
          document.getElementById('edit-campus-lat').value = lat;
          document.getElementById('edit-campus-lng').value = lng;
          if (this.campusPickerCircle) {
            this.campusPickerCircle.setLatLng([lat, lng]);
          }
        };

        this.campusPickerMarker.on('dragend', (e) => {
          const pos = e.target.getLatLng();
          updatePickerPos(pos.lat, pos.lng);
        });

        this.campusPickerMap.on('click', (e) => {
          this.campusPickerMarker.setLatLng(e.latlng);
          updatePickerPos(e.latlng.lat, e.latlng.lng);
        });

        const syncManualCoords = () => {
          const mLat = parseFloat(document.getElementById('edit-campus-lat').value);
          const mLng = parseFloat(document.getElementById('edit-campus-lng').value);
          if (!isNaN(mLat) && !isNaN(mLng) && this.campusPickerMarker && this.campusPickerMap) {
            this.campusPickerMarker.setLatLng([mLat, mLng]);
            if (this.campusPickerCircle) this.campusPickerCircle.setLatLng([mLat, mLng]);
            this.campusPickerMap.setView([mLat, mLng], this.campusPickerMap.getZoom());
          }
        };
        document.getElementById('edit-campus-lat')?.addEventListener('change', syncManualCoords);
        document.getElementById('edit-campus-lng')?.addEventListener('change', syncManualCoords);

        const radiusInput = document.getElementById('edit-campus-radius');
        if (radiusInput) {
          radiusInput.addEventListener('input', (e) => {
            const rad = parseFloat(e.target.value) || 150;
            if (this.campusPickerCircle) this.campusPickerCircle.setRadius(rad);
          });
        }
      }
    }, 150);

    // Submit handler
    document.getElementById('form-edit-campus').onsubmit = async (e) => {
      e.preventDefault();
      const name = document.getElementById('edit-campus-name').value.trim();
      const code = document.getElementById('edit-campus-code').value.trim().toUpperCase();
      const address = document.getElementById('edit-campus-address').value.trim();
      const radiusMeters = parseInt(document.getElementById('edit-campus-radius').value, 10) || 150;
      const guardsPerShift = parseInt(document.getElementById('edit-campus-guards-per-shift')?.value, 10) || (isMain ? 2 : 1);
      const lat = parseFloat(document.getElementById('edit-campus-lat').value);
      const lng = parseFloat(document.getElementById('edit-campus-lng').value);

      const btn = document.getElementById('btn-submit-edit-campus');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang lưu...';

      const updates = {
        name,
        code,
        address,
        radiusMeters,
        radius: radiusMeters,
        guardsPerShift,
        lat,
        lng,
        status: 'active'
      };

      try {
        await updateFirestoreCampus(campusId, updates);
        document.getElementById('modal-edit-campus').remove();
        alert(`✅ ĐÃ CẬP NHẬT TỌA ĐỘ GPS CƠ SỞ THÀNH CÔNG!\n\nCơ sở: ${name}\nTọa độ mới: ${lat.toFixed(6)}, ${lng.toFixed(6)}\nBán kính: ${radiusMeters}m\n\nTọa độ mới đã được lưu trực tiếp vào Firestore và có hiệu lực ngay!`);
        this.renderCampuses(document.getElementById('admin-content-pane'));
        if (window.renderManagerMobileUI) window.renderManagerMobileUI();
      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = 'Lưu Tọa Độ vào Firestore';
        alert('Lỗi khi cập nhật cơ sở: ' + err.message);
      }
    };
  }

  setCampusPickerCurrentGps() {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        document.getElementById('edit-campus-lat').value = lat;
        document.getElementById('edit-campus-lng').value = lng;
        if (this.campusPickerMarker && this.campusPickerMap) {
          this.campusPickerMarker.setLatLng([lat, lng]);
          if (this.campusPickerCircle) this.campusPickerCircle.setLatLng([lat, lng]);
          this.campusPickerMap.setView([lat, lng], 18);
        }
      },
      () => alert('Không thể lấy vị trí GPS hiện tại.')
    );
  }

  setAddCampusPickerCurrentGps() {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        document.getElementById('campus-lat').value = lat;
        document.getElementById('campus-lng').value = lng;
        if (this.addCampusMarker && this.addCampusMap) {
          this.addCampusMarker.setLatLng([lat, lng]);
          this.addCampusMap.setView([lat, lng], 17);
        }
        if (this.addCampusCircle) {
          this.addCampusCircle.setLatLng([lat, lng]);
        }
      },
      () => alert('Không thể lấy vị trí GPS hiện tại. Vui lòng cho phép quyền vị trí trên trình duyệt.')
    );
  }

  openAddCampusModal() {
    const modalHtml = `
      <div id="modal-add-campus" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 border border-slate-200 dark:border-slate-800 max-h-[92vh] overflow-y-auto">
          <div class="flex items-center justify-between">
            <h3 class="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-school text-blue-600"></i> Thêm Phân Hiệu / Cơ Sở Mới
            </h3>
            <button onclick="document.getElementById('modal-add-campus').remove()" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-xmark text-lg"></i></button>
          </div>

          <form id="form-add-campus" class="space-y-3.5 text-xs">
            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Tên cơ sở / Phân hiệu *</label>
              <input type="text" id="campus-name" placeholder="VD: Phân hiệu Quận 7 hoặc Cơ sở Ký Túc Xá" class="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold" required>
            </div>

            <div class="grid grid-cols-3 gap-2">
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Mã cơ sở *</label>
                <input type="text" id="campus-code" placeholder="VD: CS-Q7" class="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold uppercase" required>
              </div>
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Bán kính GPS (m) *</label>
                <input type="number" id="campus-radius" value="150" class="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold" required>
              </div>
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Số BV / 1 ca *</label>
                <input type="number" id="campus-guards-per-shift" value="1" min="1" max="10" class="w-full px-3 py-2.5 rounded-xl border border-blue-300 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-950/40 font-bold text-blue-700 dark:text-blue-300" required>
              </div>
            </div>

            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Địa chỉ chi tiết *</label>
              <input type="text" id="campus-address" placeholder="VD: Số 123 Đường ABC, Phường X, Quận Y, TP.HCM" class="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800" required>
            </div>

            <!-- Picker Map -->
            <div class="space-y-1.5 pt-1">
              <div class="flex items-center justify-between">
                <label class="font-bold text-slate-700 dark:text-slate-300">
                  <i class="fa-solid fa-map-location-dot text-blue-600 mr-1"></i> Bấm bản đồ hoặc kéo ghim để định vị tâm cơ sở:
                </label>
                <button type="button" onclick="window.adminModule.setAddCampusPickerCurrentGps()" class="text-blue-600 font-bold hover:underline">
                  <i class="fa-solid fa-location-crosshairs mr-1"></i> Lấy GPS hiện tại
                </button>
              </div>

              <div id="add-campus-picker-map" class="w-full h-56 rounded-2xl border border-slate-300 dark:border-slate-700 overflow-hidden z-10"></div>
              
              <div class="grid grid-cols-2 gap-2 pt-1 font-mono">
                <div>
                  <span class="text-[10px] text-slate-400 block font-semibold">Vĩ độ GPS (Lat)</span>
                  <input type="number" step="any" id="campus-lat" value="10.735768115549721" class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold" required>
                </div>
                <div>
                  <span class="text-[10px] text-slate-400 block font-semibold">Kinh độ GPS (Lng)</span>
                  <input type="number" step="any" id="campus-lng" value="106.68071864291426" class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold" required>
                </div>
              </div>
            </div>

            <div class="p-3 bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-700 dark:text-blue-300">
              <i class="fa-solid fa-cloud-arrow-up mr-1.5"></i> Cơ sở sau khi lưu sẽ được đồng bộ vĩnh viễn vào Cloud Firestore và xuất hiện ngay trong bản đồ giám sát cũng như danh sách phân ca.
            </div>

            <div class="pt-2 flex justify-end gap-2">
              <button type="button" onclick="document.getElementById('modal-add-campus').remove()" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Hủy</button>
              <button type="submit" id="btn-submit-add-campus" class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition">
                <i class="fa-solid fa-floppy-disk mr-1"></i> Lưu Cơ Sở vào Firestore
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.getElementById('modal-add-campus')?.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    setTimeout(() => {
      const pickerEl = document.getElementById('add-campus-picker-map');
      if (pickerEl && window.L) {
        if (this.addCampusMap) {
          try { this.addCampusMap.remove(); } catch (e) {}
          this.addCampusMap = null;
        }
        this.addCampusMap = L.map('add-campus-picker-map', { zoomControl: true, attributionControl: false }).setView([10.735768115549721, 106.68071864291426], 16);
        L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { maxZoom: 20 }).addTo(this.addCampusMap);
        this.addCampusMarker = L.marker([10.735768115549721, 106.68071864291426], { draggable: true }).addTo(this.addCampusMap);

        this.addCampusCircle = L.circle([10.735768115549721, 106.68071864291426], {
          radius: 150,
          color: '#2563eb',
          fillColor: '#3b82f6',
          fillOpacity: 0.15,
          weight: 2,
          dashArray: '4, 4'
        }).addTo(this.addCampusMap);

        const updateAddPickerPos = (lat, lng) => {
          document.getElementById('campus-lat').value = lat;
          document.getElementById('campus-lng').value = lng;
          if (this.addCampusCircle) this.addCampusCircle.setLatLng([lat, lng]);
        };

        this.addCampusMarker.on('dragend', (e) => {
          const pos = e.target.getLatLng();
          updateAddPickerPos(pos.lat, pos.lng);
        });

        this.addCampusMap.on('click', (e) => {
          this.addCampusMarker.setLatLng(e.latlng);
          updateAddPickerPos(e.latlng.lat, e.latlng.lng);
        });

        const syncAddManualCoords = () => {
          const mLat = parseFloat(document.getElementById('campus-lat').value);
          const mLng = parseFloat(document.getElementById('campus-lng').value);
          if (!isNaN(mLat) && !isNaN(mLng) && this.addCampusMarker && this.addCampusMap) {
            this.addCampusMarker.setLatLng([mLat, mLng]);
            if (this.addCampusCircle) this.addCampusCircle.setLatLng([mLat, mLng]);
            this.addCampusMap.setView([mLat, mLng], this.addCampusMap.getZoom());
          }
        };
        document.getElementById('campus-lat')?.addEventListener('change', syncAddManualCoords);
        document.getElementById('campus-lng')?.addEventListener('change', syncAddManualCoords);

        const radInput = document.getElementById('campus-radius');
        if (radInput) {
          radInput.addEventListener('input', (e) => {
            const rad = parseFloat(e.target.value) || 150;
            if (this.addCampusCircle) this.addCampusCircle.setRadius(rad);
          });
        }
      }
    }, 150);

    document.getElementById('form-add-campus').onsubmit = async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btn-submit-add-campus');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang lưu Firestore...';
      }

      try {
        const name = document.getElementById('campus-name').value.trim();
        const code = document.getElementById('campus-code').value.trim().toUpperCase();
        const address = document.getElementById('campus-address').value.trim();
        const radiusMeters = parseInt(document.getElementById('campus-radius').value, 10) || 150;
        const guardsPerShift = parseInt(document.getElementById('campus-guards-per-shift')?.value, 10) || 1;
        const lat = parseFloat(document.getElementById('campus-lat').value) || 10.735768115549721;
        const lng = parseFloat(document.getElementById('campus-lng').value) || 106.68071864291426;

        if (!name) throw new Error('Vui lòng nhập tên cơ sở.');
        if (!code) throw new Error('Vui lòng nhập mã cơ sở.');

        await createFirestoreCampus({ 
          name, 
          code, 
          address, 
          radiusMeters, 
          radius: radiusMeters, 
          guardsPerShift,
          lat, 
          lng, 
          status: 'active' 
        });

        document.getElementById('modal-add-campus')?.remove();
        alert(`✅ ĐÃ THÊM CƠ SỞ THÀNH CÔNG!\n\n• Cơ sở: ${name} (${code})\n• Định biên trực: ${guardsPerShift} bảo vệ / 1 ca\n• Địa chỉ: ${address}\n• Tọa độ GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}\n• Bán kính: ${radiusMeters}m\n\nCơ sở đã được lưu trực tiếp vào Firestore và có thể phân công bảo vệ ngay lập tức!`);
        this.renderCampuses(document.getElementById('admin-content-pane'));
        if (window.renderCampusesUI) window.renderCampusesUI();
        if (window.renderManagerMobileUI) window.renderManagerMobileUI();
        if (window.renderRosterUI) window.renderRosterUI();
      } catch (err) {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i> Lưu Cơ Sở vào Firestore';
        }
        alert('Lỗi khi lưu cơ sở mới: ' + err.message);
      }
    };
  }

  async deleteCampus(campusId) {
    if (confirm('Bạn có chắc chắn muốn xóa cơ sở này khỏi Firestore?')) {
      try {
        await deleteFirestoreCampus(campusId);
        alert('Đã xóa cơ sở thành công.');
        this.renderCampuses(document.getElementById('admin-content-pane'));
        if (window.renderManagerMobileUI) window.renderManagerMobileUI();
      } catch (err) {
        alert(err.message);
      }
    }
  }

  /**
   * 5. Fixed Shifts
   */
  renderShifts(container) {
    const shifts = storage.getShifts();
    const shiftList = shifts.length > 0 ? shifts : DEFAULT_SHIFTS;

    container.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="font-bold text-lg text-slate-800 dark:text-slate-100">Danh Mục Ca Trực Cố Định</h4>
            <p class="text-xs text-slate-500">Phân công bảo vệ trực theo ca 24H: 06:00 sáng hôm nay đến 06:00 sáng mai (Đổi ca lúc 06:00 sáng)</p>
          </div>
          <button onclick="window.adminModule.openAddShiftModal()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition">
            <i class="fa-solid fa-plus mr-1.5"></i> + Thêm ca trực
          </button>
        </div>

        <div class="p-3.5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex items-center justify-between flex-wrap gap-3 text-xs">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center text-sm shrink-0">
              <i class="fa-solid fa-user-shield"></i>
            </div>
            <div>
              <div class="font-extrabold text-blue-900 dark:text-blue-200">Quy Định Định Biên Nhân Sự Trực Ca</div>
              <div class="text-slate-600 dark:text-slate-300 mt-0.5">
                ⭐ <strong>Trụ sở chính (Số 47 Cao Lỗ):</strong> <span class="font-extrabold text-blue-700 dark:text-blue-300">2 bảo vệ / 1 ca trực</span>
                &nbsp;•&nbsp;
                🏢 <strong>Các cơ sở phụ / phân hiệu:</strong> <span class="font-extrabold text-emerald-700 dark:text-emerald-300">1 bảo vệ / 1 ca trực</span>
              </div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
          ${shiftList.map(s => `
            <div class="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
              <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700 font-mono">${s.code || 'CA'}</span>
              <h5 class="font-bold text-base text-slate-800 dark:text-slate-100 mt-2">${s.name}</h5>
              <div class="text-xs text-slate-500 mt-2">
                <div>Khung giờ: <strong>${s.startTime} - ${s.endTime} (${s.duration || '24 tiếng'})</strong></div>
                <div>Đổi ca: <strong>06:00 sáng hàng ngày</strong></div>
                <div>Định mức: <strong>${s.requiredPatrolRounds || 8} lượt tuần tra / ca 24h</strong></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  openAddShiftModal() {
    const modalHtml = `
      <div id="modal-add-shift" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 border border-slate-200 dark:border-slate-800">
          <div class="flex items-center justify-between">
            <h3 class="font-bold text-base text-slate-900 dark:text-white">Thiết Lập Ca Trực Mới (Firestore)</h3>
            <button onclick="document.getElementById('modal-add-shift').remove()"><i class="fa-solid fa-xmark text-lg"></i></button>
          </div>

          <form id="form-add-shift" class="space-y-3 text-xs">
            <div>
              <label class="block font-bold mb-1">Tên ca trực *</label>
              <input type="text" id="shift-name" placeholder="VD: Ca Trực 24H (06:00 - 06:00 hôm sau)" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800" required>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block font-bold mb-1">Giờ bắt đầu *</label>
                <input type="time" id="shift-start" value="06:00" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800" required>
              </div>
              <div>
                <label class="block font-bold mb-1">Giờ kết thúc *</label>
                <input type="time" id="shift-end" value="06:00" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800" required>
              </div>
            </div>
            <div>
              <label class="block font-bold mb-1">Số lượt tuần tra tối thiểu yêu cầu</label>
              <input type="number" id="shift-rounds" value="8" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800" required>
            </div>
            <div class="pt-2 flex justify-end gap-2">
              <button type="button" onclick="document.getElementById('modal-add-shift').remove()" class="px-4 py-2 rounded-xl bg-slate-100 font-bold">Hủy</button>
              <button type="submit" class="px-5 py-2 rounded-xl bg-blue-600 text-white font-bold">Lưu Firestore</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('form-add-shift').onsubmit = async (e) => {
      e.preventDefault();
      const name = document.getElementById('shift-name').value.trim();
      const startTime = document.getElementById('shift-start').value;
      const endTime = document.getElementById('shift-end').value;
      const requiredPatrolRounds = parseInt(document.getElementById('shift-rounds').value, 10) || 3;

      await createFirestoreShift({ name, startTime, endTime, requiredPatrolRounds, code: 'CA' });
      document.getElementById('modal-add-shift').remove();
      alert(`✅ Đã tạo ca trực thành công vào Firestore!`);
      this.renderShifts(document.getElementById('admin-content-pane'));
    };
  }

  /**
   * 6. Zones
   */
  renderZones(container) {
    container.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <h4 class="font-bold text-lg text-slate-800 dark:text-slate-100">Khu Nhà & Khu Vực Tuần Tra</h4>
        <p class="text-xs text-slate-500">Các khối nhà được cấu hình trực tiếp khi thêm điểm chốt trên Google Maps</p>
      </div>
    `;
  }

  /**
   * 7. Roster / Schedule (Fixed Shifts per Guard)
   */
  renderRoster(container) {
    const users = storage.getUsers();
    const allGuards = users.filter(u => u.role === 'guard');
    const campuses = storage.getCampuses();
    const campusList = campuses.length > 0 ? campuses : OFFICIAL_CAMPUSES;

    // Filter guards by selected campus and optional on-duty-only toggle
    const campusGuards = allGuards.filter(g => this.doesUserMatchCampus(g, this.rosterFilterCampus, campusList));
    const guards = this.rosterOnlyOnDuty ? campusGuards.filter(g => g.status === 'on_duty') : campusGuards;
    const hiddenOffDutyCount = this.rosterOnlyOnDuty ? campusGuards.filter(g => g.status !== 'on_duty').length : 0;

    const ca24hGuards = guards.filter(g => {
      const s = g.fixedShiftName || g.currentShiftName || '';
      return !s.includes('Kíp 1') && !s.includes('Kíp 2');
    });
    const kip1Guards = guards.filter(g => (g.fixedShiftName || g.currentShiftName || '').includes('Kíp 1'));
    const kip2Guards = guards.filter(g => (g.fixedShiftName || g.currentShiftName || '').includes('Kíp 2'));
    const staffingSummary = evaluateCampusShiftStaffing(campusList, allGuards);

    container.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-5">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h4 class="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <i class="fa-solid fa-calendar-check text-blue-600"></i> Bảng Phân Công Ca Trực Cố Định
            </h4>
            <p class="text-xs text-slate-500">Định biên chuẩn: <strong>Cơ sở chính 2 bảo vệ / 1 ca</strong> • <strong>Cơ sở phụ 1 bảo vệ / 1 ca</strong> (Ca 24H: 06:00 hôm nay - 06:00 sáng mai)</p>
          </div>
          <div class="flex items-center flex-wrap gap-2">
            <select onchange="window.adminModule.setRosterFilterCampus(this.value)" class="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200">
              <option value="all" ${this.rosterFilterCampus === 'all' ? 'selected' : ''}>🏢 Tất cả cơ sở</option>
              ${campusList.map(c => `<option value="${c.id}" ${this.rosterFilterCampus === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
            </select>
            <button onclick="window.adminModule.toggleRosterOnlyOnDuty()" class="px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${this.rosterOnlyOnDuty ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50'}">
              <i class="fa-solid ${this.rosterOnlyOnDuty ? 'fa-eye-slash' : 'fa-filter'}"></i>
              ${this.rosterOnlyOnDuty ? `Chỉ hiện đang trực (đã ẩn ${hiddenOffDutyCount} nghỉ ca)` : 'Lọc: Chỉ hiện đang trực'}
            </button>
            <button onclick="window.adminModule.openQuickAssignShiftModal()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5">
              <i class="fa-solid fa-user-plus"></i> + Phân công ca trực cho bảo vệ
            </button>
          </div>
        </div>

        <!-- Per-Campus Staffing Quota Tracker (Main: 2 guards/shift, Branch: 1 guard/shift) -->
        <div class="space-y-2">
          <div class="text-xs font-extrabold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <i class="fa-solid fa-building-shield text-blue-600"></i> Định Biên Quân Số Theo Cơ Sở (Cơ sở chính: 2 BV/ca • Cơ sở phụ: 1 BV/ca)
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            ${staffingSummary.map(s => {
              const badgeCls = s.totalAssigned >= s.requiredPerShift
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';
              const statusTxt = s.totalAssigned >= s.requiredPerShift ? '✓ Đủ định biên' : `⚠ Thiếu ${s.requiredPerShift - s.totalAssigned} BV`;
              return `
                <div class="p-3.5 rounded-xl border ${s.isMain ? 'border-blue-300 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-950/20' : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40'} space-y-2 text-xs">
                  <div class="flex items-center justify-between gap-1">
                    <span class="font-extrabold text-slate-800 dark:text-slate-100 truncate" title="${s.campus.name}">
                      ${s.isMain ? '⭐ ' : '🏢 '}${s.campus.name}
                    </span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-[11px] font-bold text-blue-700 dark:text-blue-300">Định mức: <strong>${s.requiredPerShift} BV / 1 ca</strong></span>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeCls}">${statusTxt}</span>
                  </div>
                  <div class="grid grid-cols-3 gap-1 pt-1 border-t border-slate-200/70 dark:border-slate-700/70 text-[10px] text-center font-mono">
                    <div class="p-1 rounded bg-white dark:bg-slate-800">
                      <div class="text-slate-400">Ca 24H</div>
                      <div class="font-extrabold ${s.byShift.ca24h.length === s.requiredPerShift ? 'text-emerald-600' : (s.byShift.ca24h.length > s.requiredPerShift ? 'text-blue-600' : 'text-slate-600 dark:text-slate-300')}">${s.byShift.ca24h.length}/${s.requiredPerShift}</div>
                    </div>
                    <div class="p-1 rounded bg-white dark:bg-slate-800">
                      <div class="text-slate-400">Kíp 1</div>
                      <div class="font-extrabold ${s.byShift.kip1.length === s.requiredPerShift ? 'text-emerald-600' : (s.byShift.kip1.length > s.requiredPerShift ? 'text-blue-600' : 'text-slate-600 dark:text-slate-300')}">${s.byShift.kip1.length}/${s.requiredPerShift}</div>
                    </div>
                    <div class="p-1 rounded bg-white dark:bg-slate-800">
                      <div class="text-slate-400">Kíp 2</div>
                      <div class="font-extrabold ${s.byShift.kip2.length === s.requiredPerShift ? 'text-emerald-600' : (s.byShift.kip2.length > s.requiredPerShift ? 'text-blue-600' : 'text-slate-600 dark:text-slate-300')}">${s.byShift.kip2.length}/${s.requiredPerShift}</div>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Shift Overview Summary Stats -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="p-3.5 rounded-xl bg-blue-50/50 dark:bg-slate-900/40 border border-blue-200 dark:border-blue-800 flex items-center justify-between">
            <div>
              <span class="text-xs font-bold text-blue-700 dark:text-blue-300">Ca Trực 24H (Chính)</span>
              <div class="text-[11px] text-slate-400">06:00 - 06:00 (Đổi ca 06:00 sáng)</div>
            </div>
            <span class="text-lg font-black text-blue-600 font-mono">${ca24hGuards.length} NV</span>
          </div>
          <div class="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-slate-900/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
            <div>
              <span class="text-xs font-bold text-emerald-700 dark:text-emerald-300">Kíp 1 - Ca 24H</span>
              <div class="text-[11px] text-slate-400">06:00 - 06:00 (Đổi ca 06:00 sáng)</div>
            </div>
            <span class="text-lg font-black text-emerald-600 font-mono">${kip1Guards.length} NV</span>
          </div>
          <div class="p-3.5 rounded-xl bg-indigo-50/50 dark:bg-slate-900/40 border border-indigo-200 dark:border-indigo-800 flex items-center justify-between">
            <div>
              <span class="text-xs font-bold text-indigo-700 dark:text-indigo-300">Kíp 2 - Ca 24H</span>
              <div class="text-[11px] text-slate-400">06:00 - 06:00 (Đổi ca 06:00 sáng)</div>
            </div>
            <span class="text-lg font-black text-indigo-600 font-mono">${kip2Guards.length} NV</span>
          </div>
        </div>
        
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <!-- Ca Trực 24H (Chính) -->
          <div class="p-4 rounded-2xl border border-blue-200 dark:border-blue-800/80 bg-blue-50/30 dark:bg-slate-900/40 space-y-3">
            <div class="flex items-center justify-between pb-2 border-b border-blue-100 dark:border-blue-900/40">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                <span class="font-extrabold text-sm text-blue-700 dark:text-blue-300">Ca Trực 24H (06h - 06h)</span>
              </div>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 font-mono">${ca24hGuards.length} người</span>
            </div>
            <div class="space-y-2.5 min-h-[160px]">
              ${ca24hGuards.length === 0 ? `
                <div class="text-xs text-slate-400 py-6 text-center">Chưa có bảo vệ nào được phân vào Ca Trực 24H</div>
              ` : ca24hGuards.map(g => this.renderGuardRosterCard(g, campusList)).join('')}
            </div>
            <button onclick="window.adminModule.openQuickAssignShiftModal(null, 'Ca Trực 24H (06:00 - 06:00 hôm sau)')" class="w-full py-2 bg-white dark:bg-slate-800 hover:bg-blue-50 text-blue-600 font-bold text-xs rounded-xl border border-dashed border-blue-300 dark:border-blue-700 transition flex items-center justify-center gap-1.5 shadow-2xs">
              <i class="fa-solid fa-plus text-[10px]"></i> Thêm bảo vệ vào Ca 24H
            </button>
          </div>

          <!-- Kíp 1 -->
          <div class="p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/30 dark:bg-slate-900/40 space-y-3">
            <div class="flex items-center justify-between pb-2 border-b border-emerald-100 dark:border-emerald-900/40">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span class="font-extrabold text-sm text-emerald-700 dark:text-emerald-300">Kíp 1 - Ca 24H (06h - 06h)</span>
              </div>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 font-mono">${kip1Guards.length} người</span>
            </div>
            <div class="space-y-2.5 min-h-[160px]">
              ${kip1Guards.length === 0 ? `
                <div class="text-xs text-slate-400 py-6 text-center">Chưa có bảo vệ nào được phân vào Kíp 1</div>
              ` : kip1Guards.map(g => this.renderGuardRosterCard(g, campusList)).join('')}
            </div>
            <button onclick="window.adminModule.openQuickAssignShiftModal(null, 'Kíp 1 - Ca 24H (06:00 - 06:00)')" class="w-full py-2 bg-white dark:bg-slate-800 hover:bg-emerald-50 text-emerald-700 font-bold text-xs rounded-xl border border-dashed border-emerald-300 dark:border-emerald-700 transition flex items-center justify-center gap-1.5 shadow-2xs">
              <i class="fa-solid fa-plus text-[10px]"></i> Thêm bảo vệ vào Kíp 1
            </button>
          </div>

          <!-- Kíp 2 -->
          <div class="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/30 dark:bg-slate-900/40 space-y-3">
            <div class="flex items-center justify-between pb-2 border-b border-indigo-100 dark:border-indigo-900/40">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                <span class="font-extrabold text-sm text-indigo-700 dark:text-indigo-300">Kíp 2 - Ca 24H (06h - 06h)</span>
              </div>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 font-mono">${kip2Guards.length} người</span>
            </div>
            <div class="space-y-2.5 min-h-[160px]">
              ${kip2Guards.length === 0 ? `
                <div class="text-xs text-slate-400 py-6 text-center">Chưa có bảo vệ nào được phân vào Kíp 2</div>
              ` : kip2Guards.map(g => this.renderGuardRosterCard(g, campusList)).join('')}
            </div>
            <button onclick="window.adminModule.openQuickAssignShiftModal(null, 'Kíp 2 - Ca 24H (06:00 - 06:00)')" class="w-full py-2 bg-white dark:bg-slate-800 hover:bg-indigo-50 text-indigo-700 font-bold text-xs rounded-xl border border-dashed border-indigo-300 dark:border-indigo-700 transition flex items-center justify-center gap-1.5 shadow-2xs">
              <i class="fa-solid fa-plus text-[10px]"></i> Thêm bảo vệ vào Kíp 2
            </button>
          </div>
        </div>
      </div>
    `;
  }

  renderGuardRosterCard(g, campusList) {
    const isOn = g.status === 'on_duty';
    const shift = g.fixedShiftName || g.currentShiftName || 'Ca Trực 24H (06:00 - 06:00 hôm sau)';
    return `
      <div class="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs space-y-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="relative">
              <img src="${g.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}" class="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700">
              <span class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-800 ${isOn ? 'bg-emerald-500' : 'bg-slate-400'}"></span>
            </div>
            <div>
              <div class="font-bold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1">
                ${g.name}
                <span class="text-[9px] font-mono px-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">${g.code}</span>
              </div>
              <div class="text-[10px] text-slate-400">${g.phone || 'Chưa có SĐT'}</div>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <button onclick="window.adminModule.toggleGuardDutyStatus('${g.id}')" class="px-2 py-1 rounded-lg text-[10px] font-bold transition ${isOn ? 'bg-emerald-100 hover:bg-rose-100 text-emerald-700 hover:text-rose-700' : 'bg-slate-100 hover:bg-emerald-100 text-slate-500 hover:text-emerald-700'}" title="Bấm để đổi nhanh Đang trực / Nghỉ ca">
              ${isOn ? 'Đang trực' : 'Nghỉ ca'}
            </button>
            <button onclick="window.adminModule.openQuickAssignShiftModal('${g.id}')" class="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-bold transition flex items-center gap-1" title="Chỉnh sửa chi tiết">
              <i class="fa-solid fa-pen-to-square text-[10px]"></i> Sửa
            </button>
          </div>
        </div>

        <!-- Inline Quick Controls -->
        <div class="grid grid-cols-2 gap-1.5 pt-1 text-[11px]">
          <div>
            <label class="block text-[9px] text-slate-400 uppercase font-bold">Chuyển ca nhanh:</label>
            <select onchange="window.adminModule.quickChangeGuardShift('${g.id}', this.value)" class="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-bold text-slate-700 dark:text-slate-200 text-[11px] focus:ring-1 focus:ring-blue-500">
              <option value="Ca Trực 24H (06:00 - 06:00 hôm sau)" ${(!shift.includes('Kíp 1') && !shift.includes('Kíp 2')) ? 'selected' : ''}>🛡️ Ca Trực 24H</option>
              <option value="Kíp 1 - Ca 24H (06:00 - 06:00)" ${shift.includes('Kíp 1') ? 'selected' : ''}>👥 Kíp 1 (24H)</option>
              <option value="Kíp 2 - Ca 24H (06:00 - 06:00)" ${shift.includes('Kíp 2') ? 'selected' : ''}>🔄 Kíp 2 (24H)</option>
            </select>
          </div>
          <div>
            <label class="block text-[9px] text-slate-400 uppercase font-bold">Cơ sở phụ trách:</label>
            <select onchange="window.adminModule.quickChangeGuardCampus('${g.id}', this.value)" class="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-medium text-slate-700 dark:text-slate-200 text-[11px] focus:ring-1 focus:ring-blue-500">
              ${campusList.map(c => `
                <option value="${c.id}" ${g.campusId === c.id || g.campusName === c.name ? 'selected' : ''}>${c.name}</option>
              `).join('')}
            </select>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Check campus shift quota before assigning a guard:
   * - Main Campus: max 2 guards / shift
   * - Sub-campuses: max 1 guard / shift
   */
  confirmCampusShiftQuota(campus, shiftName, excludeGuardId = null) {
    if (!campus) return true;
    const quota = getCampusRequiredGuardsPerShift(campus);
    const targetBucket = getShiftBucketKey(shiftName);
    const allGuards = storage.getUsers().filter(u => u.role === 'guard' && u.id !== excludeGuardId);

    const existingInSlot = allGuards.filter(g => {
      const sameCampus = (g.campusId && g.campusId === campus.id) ||
        (g.campusName && campus.name && g.campusName.trim().toLowerCase() === campus.name.trim().toLowerCase());
      if (!sameCampus) return false;
      return getShiftBucketKey(g.fixedShiftName || g.currentShiftName) === targetBucket;
    });

    if (existingInSlot.length >= quota) {
      const names = existingInSlot.map(g => `${g.name} (${g.code})`).join(', ');
      return confirm(
        `⚠️ CẢNH BÁO ĐỊNH BIÊN CA TRỰC:\n\n` +
        `• Cơ sở: ${campus.name}\n` +
        `• Quy định định biên: ${quota} bảo vệ / 1 ca trực\n` +
        `• Ca "${shiftName}" hiện đã có đủ ${existingInSlot.length}/${quota} người: ${names}.\n\n` +
        `Bạn có chắc chắn muốn phân công vượt định biên không?`
      );
    }
    return true;
  }

  async quickChangeGuardShift(guardId, newShift) {
    const users = storage.getUsers();
    const guard = users.find(u => u.id === guardId);
    const campuses = storage.getCampuses();
    const campusList = campuses.length > 0 ? campuses : OFFICIAL_CAMPUSES;
    const guardCampus = campusList.find(c => c.id === guard?.campusId || c.name === guard?.campusName) || campusList[0];

    if (!this.confirmCampusShiftQuota(guardCampus, newShift, guardId)) {
      this.renderRoster(document.getElementById('admin-content-pane'));
      return;
    }

    try {
      await updateFirestoreUser(guardId, { fixedShiftName: newShift, currentShiftName: newShift });
      alert(`✅ Đã chuyển ${guard?.name || 'nhân viên'} sang ${newShift} thành công và lưu vào Firestore!`);
      this.renderRoster(document.getElementById('admin-content-pane'));
      if (window.renderManagerMobileUI) window.renderManagerMobileUI();
      if (window.renderStaffUI) window.renderStaffUI();
      if (window.renderHomeUI) window.renderHomeUI();
    } catch (err) {
      alert("Lỗi khi cập nhật Firestore: " + err.message);
    }
  }

  async quickChangeGuardCampus(guardId, campusId) {
    const users = storage.getUsers();
    const guard = users.find(u => u.id === guardId);
    const campuses = storage.getCampuses();
    const campusList = campuses.length > 0 ? campuses : OFFICIAL_CAMPUSES;
    const campus = campusList.find(c => c.id === campusId);
    if (!campus) return;

    const currentShift = guard?.fixedShiftName || guard?.currentShiftName || 'Ca Trực 24H (06:00 - 06:00 hôm sau)';
    if (!this.confirmCampusShiftQuota(campus, currentShift, guardId)) {
      this.renderRoster(document.getElementById('admin-content-pane'));
      return;
    }

    try {
      await updateFirestoreUser(guardId, { campusId: campus.id, campusName: campus.name });
      alert(`✅ Đã chuyển ${guard?.name || 'nhân viên'} sang ${campus.name} thành công và lưu vào Firestore!`);
      this.renderRoster(document.getElementById('admin-content-pane'));
      if (window.renderManagerMobileUI) window.renderManagerMobileUI();
      if (window.renderStaffUI) window.renderStaffUI();
      if (window.renderHomeUI) window.renderHomeUI();
    } catch (err) {
      alert("Lỗi khi cập nhật Firestore: " + err.message);
    }
  }

  openQuickAssignShiftModal(guardId = null, preselectedShift = '') {
    const users = storage.getUsers();
    const guards = users.filter(u => u.role === 'guard');
    if (guards.length === 0) {
      alert("Chưa có nhân viên bảo vệ nào trong hệ thống! Vui lòng vào Quản lý Nhân sự để cấp tài khoản.");
      return;
    }

    const campuses = storage.getCampuses();
    const campusList = campuses.length > 0 ? campuses : OFFICIAL_CAMPUSES;
    const targetGuard = guardId ? guards.find(g => g.id === guardId) : null;
    const activeShift = preselectedShift || targetGuard?.fixedShiftName || targetGuard?.currentShiftName || 'Ca Trực 24H (06:00 - 06:00 hôm sau)';

    const modalHtml = `
      <div id="modal-quick-assign-shift" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 border border-slate-200 dark:border-slate-800 max-h-[92vh] overflow-y-auto">
          <div class="flex items-center justify-between">
            <h3 class="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-calendar-check text-blue-600"></i> Phân Công Ca Trực Cố Định
            </h3>
            <button onclick="document.getElementById('modal-quick-assign-shift').remove()" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-xmark text-lg"></i></button>
          </div>

          <form id="form-quick-assign-shift" class="space-y-3.5 text-xs">
            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Nhân viên bảo vệ *</label>
              <select id="assign-guard-id" class="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100" required ${guardId ? 'disabled' : ''}>
                ${guards.map(g => `
                  <option value="${g.id}" ${g.id === guardId ? 'selected' : ''}>
                    ${g.name} (${g.code}) — Đang ca: ${g.fixedShiftName || g.currentShiftName || 'Ca Trực 24H'}
                  </option>
                `).join('')}
              </select>
            </div>

            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Ca trực cố định *</label>
              <select id="assign-shift-name" class="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100" required>
                <option value="Ca Trực 24H (06:00 - 06:00 hôm sau)" ${(!activeShift.includes('Kíp 1') && !activeShift.includes('Kíp 2')) ? 'selected' : ''}>🛡️ Ca Trực 24H (06:00 - 06:00 hôm sau)</option>
                <option value="Kíp 1 - Ca 24H (06:00 - 06:00)" ${activeShift.includes('Kíp 1') ? 'selected' : ''}>👥 Kíp 1 - Ca 24H (06:00 - 06:00)</option>
                <option value="Kíp 2 - Ca 24H (06:00 - 06:00)" ${activeShift.includes('Kíp 2') ? 'selected' : ''}>🔄 Kíp 2 - Ca 24H (06:00 - 06:00)</option>
              </select>
            </div>

            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Cơ sở / Phân hiệu phụ trách *</label>
              <select id="assign-campus-id" class="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-medium text-slate-800 dark:text-slate-100" required>
                ${campusList.map(c => {
                  const q = getCampusRequiredGuardsPerShift(c);
                  return `<option value="${c.id}" ${targetGuard && (targetGuard.campusId === c.id || targetGuard.campusName === c.name) ? 'selected' : ''}>${c.name} (${q} BV / 1 ca)</option>`;
                }).join('')}
              </select>
            </div>

            <div class="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-700 dark:text-blue-300">
              <i class="fa-solid fa-user-shield mr-1.5"></i> Định biên chuẩn: <strong>Cơ sở chính 2 bảo vệ / 1 ca</strong> • <strong>Cơ sở phụ 1 bảo vệ / 1 ca</strong>. Dữ liệu lưu trực tiếp vào Firestore.
            </div>

            <div class="pt-2 flex justify-end gap-2">
              <button type="button" onclick="document.getElementById('modal-quick-assign-shift').remove()" class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">Hủy</button>
              <button type="submit" id="btn-submit-quick-assign" class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition">
                <i class="fa-solid fa-floppy-disk mr-1"></i> Lưu Phân Công
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('form-quick-assign-shift').onsubmit = async (e) => {
      e.preventDefault();
      const selectedGuardId = guardId || document.getElementById('assign-guard-id').value;
      const selectedShift = document.getElementById('assign-shift-name').value;
      const selectedCampusId = document.getElementById('assign-campus-id').value;
      const selectedCampus = campusList.find(c => c.id === selectedCampusId);
      const guard = guards.find(g => g.id === selectedGuardId);

      if (!this.confirmCampusShiftQuota(selectedCampus, selectedShift, selectedGuardId)) {
        return;
      }

      const saveBtn = document.getElementById('btn-submit-quick-assign');
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang lưu...';

      try {
        await updateFirestoreUser(selectedGuardId, {
          fixedShiftName: selectedShift,
          currentShiftName: selectedShift,
          campusId: selectedCampusId,
          campusName: selectedCampus?.name || 'Trụ sở Cao Lỗ'
        });

        document.getElementById('modal-quick-assign-shift')?.remove();
        alert(`✅ Đã phân công thành công cho bảo vệ ${guard?.name || 'nhân viên'}:\n• Ca: ${selectedShift}\n• Cơ sở: ${selectedCampus?.name || 'Trụ sở Cao Lỗ'}`);
        this.renderRoster(document.getElementById('admin-content-pane'));
        if (window.renderManagerMobileUI) window.renderManagerMobileUI();
        if (window.renderStaffUI) window.renderStaffUI();
        if (window.renderHomeUI) window.renderHomeUI();
      } catch (err) {
        alert("Lỗi khi lưu Firestore: " + err.message);
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i> Lưu Phân Công';
      }
    };
  }

  /**
   * 8. Patrol Logs with Date/Shift/Guard Filters, GPS Coordinates & Excel (.xlsx) Export
   */
  async setPatrolLogPreset(mode) {
    this.logFilterMode = mode;
    const todayKey = getTodayDateKey();
    if (mode === 'today') {
      this.logFilterFrom = todayKey;
      this.logFilterTo = todayKey;
      this.logFilterLogsCache = null;
    } else if (mode === 'yesterday') {
      const yKey = getYesterdayDateKey();
      this.logFilterFrom = yKey;
      this.logFilterTo = yKey;
      this.logFilterLogsCache = await fetchPatrolLogsByDateRange(yKey, yKey);
    } else if (mode === '7days') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      this.logFilterFrom = formatLocalDateKey(d);
      this.logFilterTo = todayKey;
      this.logFilterLogsCache = await fetchPatrolLogsByDateRange(this.logFilterFrom, this.logFilterTo);
    } else if (mode === 'month') {
      const monthPrefix = todayKey.slice(0, 7);
      this.logFilterFrom = `${monthPrefix}-01`;
      this.logFilterTo = todayKey;
      this.logFilterLogsCache = await fetchPatrolLogsByDateRange(this.logFilterFrom, this.logFilterTo);
    } else {
      // 'all'
      this.logFilterFrom = '';
      this.logFilterTo = '';
      this.logFilterLogsCache = null;
    }
    this.renderPatrolLogs(document.getElementById('admin-content-pane'));
  }

  async applyPatrolLogFilters() {
    const fromVal = document.getElementById('log-filter-from')?.value || '';
    const toVal = document.getElementById('log-filter-to')?.value || '';
    const shiftVal = document.getElementById('log-filter-shift')?.value || 'all';
    const guardVal = document.getElementById('log-filter-guard')?.value || 'all';

    this.logFilterFrom = fromVal;
    this.logFilterTo = toVal;
    this.logFilterShift = shiftVal;
    this.logFilterGuard = guardVal;
    this.logFilterMode = 'custom';

    if (fromVal && toVal) {
      this.logFilterLogsCache = await fetchPatrolLogsByDateRange(fromVal, toVal);
    } else if (fromVal) {
      this.logFilterLogsCache = await fetchPatrolLogsByDateRange(fromVal, getTodayDateKey());
    } else {
      this.logFilterLogsCache = null;
    }

    this.renderPatrolLogs(document.getElementById('admin-content-pane'));
  }

  getFilteredPatrolLogs() {
    const rawLogs = this.logFilterLogsCache !== null ? this.logFilterLogsCache : storage.getPatrolLogs();
    return this.filterLogsByCriteria(rawLogs, {
      fromDate: this.logFilterFrom || null,
      toDate: this.logFilterTo || null,
      shiftFilter: this.logFilterShift,
      guardFilter: this.logFilterGuard
    });
  }

  renderPatrolLogs(container) {
    if (!container) return;
    const users = storage.getUsers();
    const guards = users.filter(u => u.role === 'guard');
    const shifts = storage.getShifts();
    const shiftList = shifts.length > 0 ? shifts : DEFAULT_SHIFTS;

    const logs = this.getFilteredPatrolLogs();
    const validCount = logs.filter(l => isPatrolLogValid(l)).length;
    const warningCount = logs.length - validCount;

    container.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h4 class="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <i class="fa-solid fa-clipboard-check text-blue-600"></i> Nhật Ký Tuần Tra Toàn Trường (Firestore Audit)
            </h4>
            <p class="text-xs text-slate-500">Mỗi lượt quét QR được lưu thành bản ghi riêng với thời gian máy chủ Firebase, tọa độ GPS & khoảng cách thực tế</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="window.adminModule.exportLogsExcel()" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5">
              <i class="fa-solid fa-file-excel"></i> Xuất báo cáo Excel (.xlsx)
            </button>
          </div>
        </div>

        <!-- Filter Toolbar -->
        <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-2.5 text-xs">
          <div class="flex items-center flex-wrap gap-1.5">
            <span class="text-[11px] font-bold text-slate-500 mr-1">Nhanh:</span>
            ${[
              { k: 'today', label: 'Hôm nay' },
              { k: 'yesterday', label: 'Hôm qua' },
              { k: '7days', label: '7 ngày qua' },
              { k: 'month', label: 'Tháng này' },
              { k: 'all', label: 'Tất cả gần nhất' }
            ].map(p => `
              <button onclick="window.adminModule.setPatrolLogPreset('${p.k}')" class="px-2.5 py-1 rounded-lg font-bold transition ${this.logFilterMode === p.k ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'}">
                ${p.label}
              </button>
            `).join('')}
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">Từ ngày</label>
              <input type="date" id="log-filter-from" value="${this.logFilterFrom}" onchange="window.adminModule.applyPatrolLogFilters()" class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-bold">
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">Đến ngày</label>
              <input type="date" id="log-filter-to" value="${this.logFilterTo}" onchange="window.adminModule.applyPatrolLogFilters()" class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-bold">
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">Ca trực</label>
              <select id="log-filter-shift" onchange="window.adminModule.applyPatrolLogFilters()" class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-bold">
                <option value="all" ${this.logFilterShift === 'all' ? 'selected' : ''}>Tất cả ca trực</option>
                ${shiftList.map(s => `<option value="${s.name}" ${this.logFilterShift === s.name ? 'selected' : ''}>${s.name}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">Nhân viên bảo vệ</label>
              <select id="log-filter-guard" onchange="window.adminModule.applyPatrolLogFilters()" class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-bold">
                <option value="all" ${this.logFilterGuard === 'all' ? 'selected' : ''}>Tất cả nhân viên</option>
                ${guards.map(g => `<option value="${g.id}" ${this.logFilterGuard === g.id ? 'selected' : ''}>${g.name} (${g.code})</option>`).join('')}
              </select>
            </div>
            <div class="flex items-end">
              <div class="w-full p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
                <span class="font-extrabold text-blue-600">${logs.length}</span> lượt
                (<span class="text-emerald-600 font-bold">${validCount} OK</span> / <span class="text-amber-600 font-bold">${warningCount} CB</span>)
              </div>
            </div>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs text-slate-600 dark:text-slate-300">
            <thead class="bg-slate-50 dark:bg-slate-900 text-slate-500 uppercase text-[11px]">
              <tr>
                <th class="p-3">Ngày & Giờ quét</th>
                <th class="p-3">Nhân viên</th>
                <th class="p-3">Ca trực</th>
                <th class="p-3">Tên chốt QR</th>
                <th class="p-3">Tọa độ GPS</th>
                <th class="p-3">Khoảng cách</th>
                <th class="p-3">Trạng thái</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
              ${logs.length === 0 ? `
                <tr><td colspan="7" class="p-8 text-center text-slate-400">Không tìm thấy bản ghi tuần tra nào phù hợp với bộ lọc đang chọn.</td></tr>
              ` : logs.map(l => {
                const isValid = isPatrolLogValid(l);
                const ts = getLogTimestampDate(l);
                const hasGps = l.guardCoordinates && l.guardCoordinates.lat && l.guardCoordinates.lng;
                const gmapLink = hasGps ? `https://www.google.com/maps?q=${l.guardCoordinates.lat},${l.guardCoordinates.lng}` : '#';
                return `
                  <tr class="hover:bg-slate-50/50">
                    <td class="p-3 font-mono font-bold whitespace-nowrap">
                      <div>${ts.toLocaleTimeString('vi-VN')}</div>
                      <div class="text-[10px] text-slate-400 font-normal">${ts.toLocaleDateString('vi-VN')}</div>
                    </td>
                    <td class="p-3 font-semibold text-slate-800 dark:text-slate-100">${l.guardName}</td>
                    <td class="p-3 text-[11px]">${l.shiftName || 'Ca Trực 24H'}</td>
                    <td class="p-3">
                      <div class="font-bold text-blue-600">${l.checkpointName}</div>
                      <div class="text-[10px] font-mono text-slate-400">${l.checkpointCode || ''} • ${l.campusName || ''}</div>
                    </td>
                    <td class="p-3 font-mono text-[11px]">
                      ${hasGps ? `
                        <a href="${gmapLink}" target="_blank" class="text-blue-600 hover:underline font-semibold inline-flex items-center gap-1">
                          <i class="fa-solid fa-location-dot text-rose-500"></i>
                          ${Number(l.guardCoordinates.lat).toFixed(5)}, ${Number(l.guardCoordinates.lng).toFixed(5)}
                        </a>
                      ` : '<span class="text-slate-400">—</span>'}
                    </td>
                    <td class="p-3 font-bold ${isValid ? 'text-emerald-600' : 'text-amber-600'} whitespace-nowrap">
                      ${l.distanceMeters !== null && l.distanceMeters !== undefined ? l.distanceMeters + 'm' : '—'}
                    </td>
                    <td class="p-3">
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${isValid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
                        ${isValid ? '✓ Hợp lệ' : '⚠ Cảnh báo'}
                      </span>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  exportLogsExcel() {
    const logs = this.getFilteredPatrolLogs();
    if (logs.length === 0) {
      alert('Không có dữ liệu nhật ký nào trong bộ lọc hiện tại để xuất Excel!');
      return;
    }

    const rows = logs.map((l, idx) => {
      const ts = getLogTimestampDate(l);
      const isValid = isPatrolLogValid(l);
      return {
        'STT': idx + 1,
        'Ngày quét': ts.toLocaleDateString('vi-VN'),
        'Giờ quét': ts.toLocaleTimeString('vi-VN'),
        'Nhân viên bảo vệ': l.guardName || '',
        'Ca trực': l.shiftName || 'Ca Trực 24H',
        'Tên chốt QR': l.checkpointName || '',
        'Mã QR': l.checkpointCode || '',
        'Cơ sở': l.campusName || '',
        'Tọa độ GPS (Lat, Lng)': l.guardCoordinates ? `${l.guardCoordinates.lat}, ${l.guardCoordinates.lng}` : '',
        'Khoảng cách (m)': l.distanceMeters !== null && l.distanceMeters !== undefined ? l.distanceMeters : '',
        'Trạng thái': isValid ? 'Hợp lệ' : 'Cảnh báo GPS',
        'Ghi chú': l.notes || ''
      };
    });

    const dateTag = this.logFilterFrom && this.logFilterTo
      ? `${this.logFilterFrom}_den_${this.logFilterTo}`
      : getTodayDateKey();

    if (window.XLSX) {
      const ws = window.XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 5 }, { wch: 12 }, { wch: 10 }, { wch: 24 }, { wch: 28 },
        { wch: 24 }, { wch: 14 }, { wch: 24 }, { wch: 24 }, { wch: 15 }, { wch: 14 }, { wch: 35 }
      ];
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, 'NhatKyTuanTra');
      window.XLSX.writeFile(wb, `NSG_NhatKyTuanTra_${dateTag}.xlsx`);
    } else {
      // Fallback UTF-8 BOM CSV for Excel compatibility if offline
      const headers = Object.keys(rows[0]);
      let csv = '\uFEFF' + headers.join(',') + '\n';
      rows.forEach(r => {
        csv += headers.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(',') + '\n';
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', `NSG_NhatKyTuanTra_${dateTag}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  exportLogsCsv() {
    this.exportLogsExcel();
  }

  /**
   * 9. Incidents
   */
  renderIncidents(container) {
    const incidents = storage.getIncidents();
    container.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <div class="flex items-center justify-between">
          <h4 class="font-bold text-lg text-slate-800 dark:text-slate-100">Bảng Xử Lý Sự Cố Toàn Trường (Firestore)</h4>
          <button onclick="window.incidentModule.openIncidentModal()" class="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition">
            + Báo sự cố mới
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          ${incidents.length === 0 ? `
            <div class="col-span-3 py-8 text-center text-slate-400">Không có sự cố nào trong hệ thống. An ninh trật tự ổn định!</div>
          ` : incidents.map(inc => `
            <div class="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 shadow-xs flex flex-col justify-between">
              <div>
                <div class="flex items-center justify-between mb-2">
                  <span class="font-mono text-xs font-bold text-slate-500">${inc.code}</span>
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold ${inc.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">${inc.status === 'resolved' ? 'Đã xử lý' : 'Chờ xử lý'}</span>
                </div>
                <h5 class="font-bold text-sm text-slate-800 dark:text-slate-100 mb-1">${inc.title}</h5>
                <p class="text-xs text-slate-500 mb-2">${inc.description}</p>
                ${inc.imageUrl ? `<img src="${inc.imageUrl}" class="w-full h-32 object-cover rounded-xl my-2 cursor-pointer" onclick="window.viewImagePreview('${inc.imageUrl}')">` : ''}
                <div class="text-[11px] text-slate-400">Báo bởi: <strong>${inc.reportedBy}</strong> (${new Date(inc.reportedAt).toLocaleString('vi-VN')})</div>
              </div>
              <div class="pt-3 border-t border-slate-100 dark:border-slate-800 mt-3 flex justify-between items-center">
                ${inc.status !== 'resolved' ? `
                  <button onclick="window.adminModule.resolveIncident('${inc.id}')" class="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold">
                    <i class="fa-solid fa-check mr-1"></i> Đóng / Đã xử lý
                  </button>
                ` : '<span class="text-xs text-emerald-600 font-bold">✓ Đã giải quyết</span>'}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  resolveIncident(id) {
    storage.updateIncidentStatus(id, 'resolved', 'Đã xử lý xong');
    alert('✅ Đã cập nhật trạng thái sự cố sang: ĐÃ GIẢI QUYẾT.');
    this.renderIncidents(document.getElementById('admin-content-pane'));
  }

  /**
   * 10. Monthly Patrol Reports & Statistics
   */
  async setReportMonth(monthStr) {
    if (!monthStr) return;
    this.reportMonth = monthStr;
    await this.loadMonthlyReportData();
    this.renderReports(document.getElementById('admin-content-pane'));
  }

  setReportCampus(campusId) {
    this.reportCampus = campusId || 'all';
    this.renderReports(document.getElementById('admin-content-pane'));
  }

  async loadMonthlyReportData() {
    const [year, month] = this.reportMonth.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const startKey = `${this.reportMonth}-01`;
    const endKey = `${this.reportMonth}-${String(lastDay).padStart(2, '0')}`;
    this.reportLogsCache = await fetchPatrolLogsByDateRange(startKey, endKey);
  }

  async openDateOnDashboardMap(dateKey) {
    this.dashboardDate = dateKey;
    this.dashboardShift = 'all';
    this.dashboardGuard = 'all';
    const todayKey = getTodayDateKey();
    if (dateKey !== todayKey) {
      this.dashboardLogsCache = await fetchPatrolLogsByDateRange(dateKey, dateKey);
    } else {
      this.dashboardLogsCache = null;
    }
    this.switchModule('dashboard');
  }

  computeMonthlyReportMetrics() {
    const [year, month] = this.reportMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const todayKey = getTodayDateKey();

    const allCheckpoints = storage.getCheckpoints();
    const campuses = storage.getCampuses();
    const campusList = campuses.length > 0 ? campuses : OFFICIAL_CAMPUSES;
    const selectedCampusObj = this.reportCampus !== 'all' ? campusList.find(c => c.id === this.reportCampus) : null;

    const checkpoints = allCheckpoints.filter(cp => {
      if (this.reportCampus === 'all') return true;
      if (cp.campusId && cp.campusId === this.reportCampus) return true;
      if (selectedCampusObj && cp.campusName && cp.campusName.toLowerCase().includes((selectedCampusObj.name || '').toLowerCase().split('-')[0].trim())) return true;
      return false;
    });

    const cpIdSet = new Set(checkpoints.map(c => c.id));
    const users = storage.getUsers();
    const guards = users.filter(u => u.role === 'guard' && (this.reportCampus === 'all' || u.campusId === this.reportCampus));

    const sourceLogs = this.reportLogsCache !== null ? this.reportLogsCache : storage.getPatrolLogs();
    const monthLogs = sourceLogs.filter(l => {
      const dk = getLogDateKey(l);
      if (!dk.startsWith(this.reportMonth)) return false;
      if (this.reportCampus !== 'all' && !cpIdSet.has(l.checkpointId)) return false;
      return true;
    });

    // Determine elapsed days in the selected month (don't count future days as missed)
    const elapsedDateKeys = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dk = `${this.reportMonth}-${String(day).padStart(2, '0')}`;
      if (dk <= todayKey) {
        elapsedDateKeys.push(dk);
      }
    }

    // Count shifts operated (distinct date + shiftName, or at least 1 shift/day elapsed)
    const activeShiftSet = new Set();
    monthLogs.forEach(l => {
      activeShiftSet.add(`${getLogDateKey(l)}__${l.shiftName || 'Ca Trực 24H'}`);
    });
    const totalShifts = Math.max(activeShiftSet.size, elapsedDateKeys.length);

    const totalScans = monthLogs.length;
    const completedScans = monthLogs.filter(l => isPatrolLogValid(l)).length;
    const flaggedScans = totalScans - completedScans;

    // Evaluate day-by-day completeness
    const incompleteDays = [];
    let totalRequiredCheckpointDays = elapsedDateKeys.length * checkpoints.length;
    let totalCompletedCheckpointDays = 0;

    elapsedDateKeys.forEach(dk => {
      const dayValidLogs = monthLogs.filter(l => getLogDateKey(l) === dk && isPatrolLogValid(l));
      const scannedCpIds = new Set(dayValidLogs.map(l => l.checkpointId));
      const checkedCount = checkpoints.filter(cp => scannedCpIds.has(cp.id)).length;
      totalCompletedCheckpointDays += checkedCount;

      if (checkpoints.length > 0 && checkedCount < checkpoints.length) {
        const missedCps = checkpoints.filter(cp => !scannedCpIds.has(cp.id));
        const guardsOnDay = [...new Set(dayValidLogs.map(l => l.guardName).filter(Boolean))];
        incompleteDays.push({
          dateKey: dk,
          displayDate: dk.split('-').reverse().join('/'),
          checkedCount,
          totalCheckpoints: checkpoints.length,
          percent: Math.round((checkedCount / checkpoints.length) * 100),
          missedNames: missedCps.map(c => c.name),
          guardsOnDay
        });
      }
    });

    const uncompletedCount = Math.max(0, totalRequiredCheckpointDays - totalCompletedCheckpointDays) + flaggedScans;

    // Per-guard completion statistics
    const guardStats = guards.map(g => {
      const gLogs = monthLogs.filter(l => l.guardId === g.id);
      const gValidLogs = gLogs.filter(l => isPatrolLogValid(l));
      const activeDays = new Set(gValidLogs.map(l => getLogDateKey(l)));
      const uniqueCpsPerDaySum = Array.from(activeDays).reduce((sum, dk) => {
        const cpsOnDay = new Set(gValidLogs.filter(l => getLogDateKey(l) === dk).map(l => l.checkpointId));
        return sum + cpsOnDay.size;
      }, 0);

      // Target: checkpoints across elapsed days (or active days if guard has specific days)
      const targetDays = Math.max(activeDays.size, elapsedDateKeys.length);
      const targetCheckpoints = targetDays * checkpoints.length;
      const rate = targetCheckpoints > 0 ? Math.min(100, Math.round((uniqueCpsPerDaySum / targetCheckpoints) * 100)) : 0;

      return {
        guard: g,
        activeDaysCount: activeDays.size,
        totalScans: gLogs.length,
        validScans: gValidLogs.length,
        flaggedScans: gLogs.length - gValidLogs.length,
        completedCheckpointDays: uniqueCpsPerDaySum,
        targetCheckpoints,
        rate
      };
    });

    // Sort guards by completion rate descending
    guardStats.sort((a, b) => b.rate - a.rate || b.validScans - a.validScans);

    return {
      monthStr: this.reportMonth,
      elapsedDaysCount: elapsedDateKeys.length,
      daysInMonth,
      checkpointsCount: checkpoints.length,
      totalShifts,
      totalScans,
      completedScans,
      uncompletedCount,
      flaggedScans,
      overallCompletionRate: totalRequiredCheckpointDays > 0 ? Math.round((totalCompletedCheckpointDays / totalRequiredCheckpointDays) * 100) : 0,
      guardStats,
      incompleteDays: incompleteDays.reverse(), // Most recent incomplete day first
      monthLogs
    };
  }

  renderReports(container) {
    if (!container) return;

    // Ensure full month logs are loaded from Firestore once per month selection
    if (this.reportLogsCache === null) {
      this.loadMonthlyReportData().then(() => {
        if (this.currentModule === 'reports') {
          this.renderReports(document.getElementById('admin-content-pane'));
        }
      });
    }

    const campuses = storage.getCampuses();
    const campusList = campuses.length > 0 ? campuses : OFFICIAL_CAMPUSES;
    const m = this.computeMonthlyReportMetrics();
    const [yr, mo] = m.monthStr.split('-');

    container.innerHTML = `
      <div class="space-y-5">
        <!-- Header & Filters -->
        <div class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <div class="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h4 class="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <i class="fa-solid fa-file-invoice text-blue-600"></i> Báo Cáo Tuần Tra Tháng ${mo}/${yr}
              </h4>
              <p class="text-xs text-slate-500">Tổng hợp hiệu suất ca trực, tỷ lệ hoàn thành theo từng bảo vệ & các ngày chưa thực hiện đủ nhiệm vụ</p>
            </div>
            <div class="flex items-center flex-wrap gap-2">
              <input type="month" id="report-month-picker" value="${this.reportMonth}" onchange="window.adminModule.setReportMonth(this.value)" class="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold">
              <select id="report-campus-filter" onchange="window.adminModule.setReportCampus(this.value)" class="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold">
                <option value="all" ${this.reportCampus === 'all' ? 'selected' : ''}>Tất cả cơ sở</option>
                ${campusList.map(c => `<option value="${c.id}" ${this.reportCampus === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
              </select>
              <button onclick="window.adminModule.exportMonthlyReportExcel()" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5">
                <i class="fa-solid fa-file-excel"></i> Xuất Excel Tháng
              </button>
              <button onclick="window.print()" class="px-4 py-2 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5">
                <i class="fa-solid fa-print"></i> In Báo Cáo
              </button>
            </div>
          </div>

          <!-- 4 Monthly KPI Cards -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
            <div class="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
              <div class="text-[11px] font-bold text-blue-600 uppercase">Tổng số ca trực</div>
              <div class="text-2xl font-black text-blue-700 dark:text-blue-300 font-mono mt-1">${m.totalShifts}</div>
              <div class="text-[11px] text-slate-500 mt-0.5">${m.elapsedDaysCount}/${m.daysInMonth} ngày đã tính trong tháng</div>
            </div>

            <div class="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900">
              <div class="text-[11px] font-bold text-indigo-600 uppercase">Tổng lượt tuần tra</div>
              <div class="text-2xl font-black text-indigo-700 dark:text-indigo-300 font-mono mt-1">${m.totalScans}</div>
              <div class="text-[11px] text-slate-500 mt-0.5">Tổng số lần quét mã QR chốt</div>
            </div>

            <div class="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
              <div class="text-[11px] font-bold text-emerald-600 uppercase">Số lượt hoàn thành</div>
              <div class="text-2xl font-black text-emerald-700 dark:text-emerald-300 font-mono mt-1">${m.completedScans}</div>
              <div class="text-[11px] text-emerald-600 font-semibold mt-0.5">Tỷ lệ phủ chốt tháng: ${m.overallCompletionRate}%</div>
            </div>

            <div class="p-4 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900">
              <div class="text-[11px] font-bold text-rose-600 uppercase">Số lượt không hoàn thành</div>
              <div class="text-2xl font-black text-rose-700 dark:text-rose-300 font-mono mt-1">${m.uncompletedCount}</div>
              <div class="text-[11px] text-rose-600 mt-0.5">${m.incompleteDays.length} ngày chưa đủ chốt • ${m.flaggedScans} cảnh báo</div>
            </div>
          </div>
        </div>

        <!-- Table 1: Completion Rate per Guard -->
        <div class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <div>
            <h5 class="font-bold text-base text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <i class="fa-solid fa-user-check text-emerald-600"></i> Tỷ Lệ Hoàn Thành Theo Từng Bảo Vệ (Tháng ${mo}/${yr})
            </h5>
            <p class="text-xs text-slate-500">Thống kê lượt quét hợp lệ so với tổng mục tiêu điểm chốt trong tháng</p>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead class="bg-slate-50 dark:bg-slate-900 text-slate-500 uppercase text-[11px]">
                <tr>
                  <th class="p-3">Nhân viên bảo vệ</th>
                  <th class="p-3">Cơ sở / Ca cố định</th>
                  <th class="p-3 text-center">Số ngày có quét</th>
                  <th class="p-3 text-center">Lượt hợp lệ</th>
                  <th class="p-3 text-center">Lượt cảnh báo</th>
                  <th class="p-3">Tỷ lệ hoàn thành</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
                ${m.guardStats.length === 0 ? `
                  <tr><td colspan="6" class="p-6 text-center text-slate-400">Chưa có nhân viên bảo vệ nào trong hệ thống.</td></tr>
                ` : m.guardStats.map(gs => {
                  const barColor = gs.rate >= 80 ? 'bg-emerald-500' : (gs.rate >= 50 ? 'bg-amber-500' : 'bg-rose-500');
                  const textColor = gs.rate >= 80 ? 'text-emerald-600' : (gs.rate >= 50 ? 'text-amber-600' : 'text-rose-600');
                  return `
                    <tr class="hover:bg-slate-50/50">
                      <td class="p-3 font-bold text-slate-800 dark:text-slate-100">
                        ${gs.guard.name} <span class="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500">${gs.guard.code}</span>
                      </td>
                      <td class="p-3">
                        <div class="font-semibold">${gs.guard.campusName || 'Trụ sở chính'}</div>
                        <div class="text-[10px] text-blue-600">${gs.guard.fixedShiftName || 'Ca Trực 24H'}</div>
                      </td>
                      <td class="p-3 text-center font-mono font-bold">${gs.activeDaysCount}/${m.elapsedDaysCount}</td>
                      <td class="p-3 text-center font-mono font-bold text-emerald-600">${gs.validScans}</td>
                      <td class="p-3 text-center font-mono font-bold ${gs.flaggedScans > 0 ? 'text-amber-600' : 'text-slate-400'}">${gs.flaggedScans}</td>
                      <td class="p-3 min-w-[170px]">
                        <div class="flex items-center justify-between text-[11px] font-bold mb-1">
                          <span class="${textColor}">${gs.rate}%</span>
                          <span class="text-slate-400 font-normal">${gs.completedCheckpointDays}/${gs.targetCheckpoints} chốt-ngày</span>
                        </div>
                        <div class="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div class="h-full ${barColor} rounded-full" style="width: ${gs.rate}%"></div>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Table 2: Days Not Completing All Patrol Tasks -->
        <div class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h5 class="font-bold text-base text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <i class="fa-solid fa-calendar-xmark text-rose-600"></i> Những Ngày Không Thực Hiện Đủ Nhiệm Vụ (${m.incompleteDays.length} ngày)
              </h5>
              <p class="text-xs text-slate-500">Danh sách các ngày trong tháng ${mo}/${yr} còn điểm chốt chưa được quét đủ</p>
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead class="bg-slate-50 dark:bg-slate-900 text-slate-500 uppercase text-[11px]">
                <tr>
                  <th class="p-3">Ngày</th>
                  <th class="p-3 text-center">Đã quét / Tổng chốt</th>
                  <th class="p-3 text-center">Tỷ lệ</th>
                  <th class="p-3">Các chốt chưa quét</th>
                  <th class="p-3 text-right">Xem bản đồ</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
                ${m.incompleteDays.length === 0 ? `
                  <tr><td colspan="5" class="p-6 text-center text-emerald-600 font-bold">🎉 Xuất sắc! Tất cả các ngày trong tháng đều hoàn thành đủ 100% chốt tuần tra.</td></tr>
                ` : m.incompleteDays.map(d => `
                  <tr class="hover:bg-slate-50/50">
                    <td class="p-3 font-mono font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">${d.displayDate}</td>
                    <td class="p-3 text-center font-mono font-bold">
                      <span class="text-emerald-600">${d.checkedCount}</span> / ${d.totalCheckpoints}
                    </td>
                    <td class="p-3 text-center">
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${d.percent >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-700'}">
                        ${d.percent}%
                      </span>
                    </td>
                    <td class="p-3 text-rose-600 dark:text-rose-400">
                      ${d.missedNames.slice(0, 4).join(', ')}${d.missedNames.length > 4 ? ` (+${d.missedNames.length - 4} chốt khác)` : ''}
                    </td>
                    <td class="p-3 text-right whitespace-nowrap">
                      <button onclick="window.adminModule.openDateOnDashboardMap('${d.dateKey}')" class="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] transition">
                        <i class="fa-solid fa-map-location-dot mr-1"></i> Xem ngày này
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  exportMonthlyReportExcel() {
    const m = this.computeMonthlyReportMetrics();

    const guardRows = m.guardStats.map((gs, idx) => ({
      'STT': idx + 1,
      'Họ tên bảo vệ': gs.guard.name,
      'Mã NV': gs.guard.code,
      'Cơ sở': gs.guard.campusName || '',
      'Ca cố định': gs.guard.fixedShiftName || 'Ca Trực 24H',
      'Số ngày hoạt động': `${gs.activeDaysCount}/${m.elapsedDaysCount}`,
      'Tổng lượt quét': gs.totalScans,
      'Lượt hợp lệ': gs.validScans,
      'Lượt cảnh báo': gs.flaggedScans,
      'Tỷ lệ hoàn thành (%)': `${gs.rate}%`
    }));

    const incompleteRows = m.incompleteDays.map((d, idx) => ({
      'STT': idx + 1,
      'Ngày': d.displayDate,
      'Đã quét': d.checkedCount,
      'Tổng chốt': d.totalCheckpoints,
      'Tỷ lệ (%)': `${d.percent}%`,
      'Danh sách chốt bị bỏ sót': d.missedNames.join(', ')
    }));

    const detailRows = m.monthLogs.map((l, idx) => {
      const ts = getLogTimestampDate(l);
      return {
        'STT': idx + 1,
        'Ngày': ts.toLocaleDateString('vi-VN'),
        'Giờ': ts.toLocaleTimeString('vi-VN'),
        'Nhân viên': l.guardName || '',
        'Ca trực': l.shiftName || '',
        'Tên chốt QR': l.checkpointName || '',
        'Tọa độ GPS': l.guardCoordinates ? `${l.guardCoordinates.lat}, ${l.guardCoordinates.lng}` : '',
        'Khoảng cách (m)': l.distanceMeters !== null && l.distanceMeters !== undefined ? l.distanceMeters : '',
        'Trạng thái': isPatrolLogValid(l) ? 'Hợp lệ' : 'Cảnh báo GPS'
      };
    });

    if (window.XLSX) {
      const wb = window.XLSX.utils.book_new();
      const ws1 = window.XLSX.utils.json_to_sheet(guardRows.length ? guardRows : [{ 'Thông báo': 'Chưa có nhân viên bảo vệ' }]);
      const ws2 = window.XLSX.utils.json_to_sheet(incompleteRows.length ? incompleteRows : [{ 'Thông báo': 'Tất cả các ngày đều hoàn thành đủ nhiệm vụ' }]);
      const ws3 = window.XLSX.utils.json_to_sheet(detailRows.length ? detailRows : [{ 'Thông báo': 'Chưa có lượt quét nào trong tháng' }]);

      window.XLSX.utils.book_append_sheet(wb, ws1, 'TyLeBaoVe');
      window.XLSX.utils.book_append_sheet(wb, ws2, 'NgayChuaHoanThanh');
      window.XLSX.utils.book_append_sheet(wb, ws3, 'ChiTietThang');
      window.XLSX.writeFile(wb, `NSG_BaoCaoTuanTra_Thang_${m.monthStr}.xlsx`);
    } else {
      alert('Không tải được thư viện xuất Excel (.xlsx) do đang offline. Vui lòng kết nối mạng và thử lại.');
    }
  }

  /**
   * 11. Settings
   */
  renderSettings(container) {
    const settings = storage.getSettings();
    container.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4 max-w-2xl">
        <h4 class="font-bold text-lg text-slate-800 dark:text-slate-100">Cấu Hình Tham Số An Ninh</h4>
        <div class="space-y-3 text-xs">
          <div>
            <label class="block font-bold mb-1">Bán kính GPS tối đa cho phép (Mét)</label>
            <input type="number" id="setting-gps-radius" value="${settings.maxGpsRadiusMeters || 20}" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800">
          </div>
          <div>
            <label class="block font-bold mb-1">Thời gian quy định tuần tra chốt (Phút) — Dùng để cảnh báo quá hạn / gần đến hạn</label>
            <input type="number" id="setting-patrol-interval" value="${settings.patrolIntervalMinutes || 180}" min="15" max="1440" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800">
            <span class="text-[11px] text-slate-400">VD: 180 phút (3 tiếng). Từ 70% thời gian trở đi chốt chuyển màu cam (gần đến hạn), quá 100% sẽ phát cảnh báo đỏ trên Dashboard.</span>
          </div>
          <div>
            <label class="block font-bold mb-1">Thời gian giãn cách quét tối thiểu (Giây)</label>
            <input type="number" id="setting-cooldown" value="${settings.scanCooldownSeconds || 5}" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800">
          </div>
          <div class="pt-2">
            <button onclick="window.adminModule.saveSystemSettings()" class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl">Lưu Cấu Hình</button>
          </div>
        </div>
      </div>
    `;
  }

  saveSystemSettings() {
    const radius = parseInt(document.getElementById('setting-gps-radius').value, 10) || 20;
    const interval = parseInt(document.getElementById('setting-patrol-interval')?.value, 10) || 180;
    const cooldown = parseInt(document.getElementById('setting-cooldown').value, 10) || 5;
    storage.saveSettings({
      ...storage.getSettings(),
      maxGpsRadiusMeters: radius,
      patrolIntervalMinutes: interval,
      scanCooldownSeconds: cooldown
    });
    alert('✅ Đã lưu cấu hình an ninh!');
  }
}

export const adminModule = new AdminDesktopModule();
window.adminModule = adminModule;
window.renderDashboardUI = (resetToToday = false) => {
  if (resetToToday) {
    adminModule.dashboardDate = getTodayDateKey();
    adminModule.dashboardLogsCache = null;
  }
  if (adminModule.currentModule === 'dashboard') {
    adminModule.renderDashboard(document.getElementById('admin-content-pane'));
  }
};
window.renderPatrolLogsUI = () => {
  if (adminModule.currentModule === 'patrol_logs') {
    adminModule.renderPatrolLogs(document.getElementById('admin-content-pane'));
  }
};
window.renderReportsUI = () => {
  if (adminModule.currentModule === 'reports') {
    adminModule.renderReports(document.getElementById('admin-content-pane'));
  }
};
window.renderStaffUI = () => {
  if (adminModule.currentModule === 'staff') adminModule.renderStaff(document.getElementById('admin-content-pane'));
};
window.renderCheckpointsUI = () => {
  if (adminModule.currentModule === 'checkpoints') adminModule.renderCheckpoints(document.getElementById('admin-content-pane'));
};
window.renderCampusesUI = () => {
  if (adminModule.currentModule === 'campuses') adminModule.renderCampuses(document.getElementById('admin-content-pane'));
};
window.renderShiftsUI = () => {
  if (adminModule.currentModule === 'shifts') adminModule.renderShifts(document.getElementById('admin-content-pane'));
};
window.renderRosterUI = () => {
  if (adminModule.currentModule === 'roster') adminModule.renderRoster(document.getElementById('admin-content-pane'));
};
