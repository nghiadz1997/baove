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
  COLLECTIONS
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
   * 1. Dashboard with Google Maps & Campus Selector
   */
  renderDashboard(container) {
    const checkpoints = storage.getCheckpoints();
    const patrolLogs = storage.getPatrolLogs();
    const incidents = storage.getIncidents();
    const users = storage.getUsers();

    const guards = users.filter(u => u.role === 'guard');
    const onDutyCount = guards.filter(g => g.status === 'on_duty').length;
    const unresolvedIncidents = incidents.filter(i => i.status !== 'resolved').length;
    const distanceWarnings = patrolLogs.filter(l => l.gpsStatus === 'warning_far').length;

    let checkedCps = 0;
    checkpoints.forEach(cp => {
      if (patrolLogs.some(l => l.checkpointId === cp.id)) checkedCps++;
    });
    const completionRate = checkpoints.length > 0 ? Math.round((checkedCps / checkpoints.length) * 100) : 0;

    const campuses = storage.getCampuses();
    const campusList = campuses.length > 0 ? campuses : OFFICIAL_CAMPUSES;

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Top Stats Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div class="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Lực lượng bảo vệ</p>
              <h3 class="text-3xl font-extrabold text-blue-600 mt-1">${onDutyCount}<span class="text-base text-slate-400 font-normal">/${guards.length}</span></h3>
              <p class="text-xs text-emerald-600 font-semibold mt-1">Đang trực: ${onDutyCount} nhân viên</p>
            </div>
            <div class="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl">
              <i class="fa-solid fa-user-shield"></i>
            </div>
          </div>

          <div class="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tiến độ tuần tra chốt</p>
              <h3 class="text-3xl font-extrabold text-emerald-600 mt-1">${completionRate}%</h3>
              <p class="text-xs text-slate-500 mt-1">Đã kiểm tra ${checkedCps}/${checkpoints.length} điểm chốt</p>
            </div>
            <div class="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl">
              <i class="fa-solid fa-route"></i>
            </div>
          </div>

          <div class="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sự cố ghi nhận</p>
              <h3 class="text-3xl font-extrabold ${unresolvedIncidents > 0 ? 'text-rose-600' : 'text-slate-700'} mt-1">${unresolvedIncidents}</h3>
              <p class="text-xs text-slate-500 mt-1">Chờ xử lý / Đang xử lý</p>
            </div>
            <div class="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center text-xl">
              <i class="fa-solid fa-triangle-exclamation"></i>
            </div>
          </div>

          <div class="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cảnh báo vị trí GPS</p>
              <h3 class="text-3xl font-extrabold ${distanceWarnings > 0 ? 'text-amber-500' : 'text-slate-700'} mt-1">${distanceWarnings}</h3>
              <p class="text-xs text-slate-500 mt-1">Quét ngoài bán kính an toàn</p>
            </div>
            <div class="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl">
              <i class="fa-solid fa-location-crosshairs"></i>
            </div>
          </div>
        </div>

        <!-- Google Maps Section -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
            <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <h4 class="font-bold text-base text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <i class="fa-solid fa-map-location-dot text-blue-600"></i> Bản Đồ Google Maps Giám Sát Vị Trí Chốt
                </h4>
                <p class="text-xs text-slate-500">Định vị trực tiếp các chốt an ninh trường Cao đẳng Nam Sài Gòn</p>
              </div>
              <div class="flex items-center gap-2">
                <select id="admin-map-campus-filter" class="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                  <option value="all">Tất cả phân hiệu (Mặc định: 47 Cao Lỗ)</option>
                  ${campusList.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                </select>
                <button id="btn-admin-map-toggle" class="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700">
                  <i class="fa-solid fa-layer-group mr-1"></i> Xem Vệ tinh
                </button>
                <button onclick="window.adminModule.zoomAdminToMyLocation()" class="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition">
                  <i class="fa-solid fa-crosshairs mr-1"></i> Vị trí của tôi
                </button>
              </div>
            </div>
            <div id="admin-google-map" class="w-full h-96 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 z-10"></div>
          </div>

          <!-- Quick Actions & User Roster -->
          <div class="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between mb-3">
                <h4 class="font-bold text-base text-slate-800 dark:text-slate-100">Lực Lượng Bảo Vệ</h4>
                <button onclick="window.adminModule.openAddStaffModal()" class="text-xs font-bold text-blue-600 hover:underline">
                  + Cấp tài khoản
                </button>
              </div>
              
              <div class="space-y-3 overflow-y-auto max-h-80 pr-1">
                ${guards.length === 0 ? `
                  <div class="py-8 text-center text-xs text-slate-400">
                    Chưa có nhân viên bảo vệ trong Firestore.<br>
                    Bấm "+ Cấp tài khoản" để thêm nhân sự thật.
                  </div>
                ` : guards.map(g => {
                  const isOn = g.status === 'on_duty';
                  return `
                    <div class="p-3 rounded-xl border border-slate-100 dark:border-slate-700 flex items-center justify-between">
                      <div class="flex items-center gap-3">
                        <img src="${g.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}" class="w-10 h-10 rounded-full object-cover">
                        <div>
                          <div class="font-bold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                            ${g.name}
                            <span class="text-[10px] text-blue-600 font-bold">(${g.fixedShiftName || 'Ca Trực 24H'})</span>
                          </div>
                          <div class="text-[11px] text-slate-500">${g.code} • ${g.campusName || 'Trụ sở Cao Lỗ'}</div>
                        </div>
                      </div>
                      <div class="flex items-center gap-1.5">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isOn ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}">
                          ${isOn ? 'Đang trực' : 'Nghỉ ca'}
                        </span>
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

        <!-- Recent Patrol Log Table -->
        <div class="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <h4 class="font-bold text-base text-slate-800 dark:text-slate-100">Nhật Ký Quét QR Gần Nhất (Firestore Realtime)</h4>
            <button onclick="window.adminModule.switchModule('patrol_logs')" class="text-xs font-bold text-blue-600 hover:underline">
              Xem tất cả nhật ký &rarr;
            </button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead class="bg-slate-50 dark:bg-slate-900/50 text-slate-500 uppercase text-[11px]">
                <tr>
                  <th class="p-3">Thời gian</th>
                  <th class="p-3">Điểm chốt</th>
                  <th class="p-3">Khu vực</th>
                  <th class="p-3">Nhân viên</th>
                  <th class="p-3">Khoảng cách GPS</th>
                  <th class="p-3">Trạng thái</th>
                  <th class="p-3 text-right">Google Maps</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
                ${patrolLogs.length === 0 ? `
                  <tr><td colspan="7" class="p-6 text-center text-slate-400">Chưa có lượt tuần tra nào được quét.</td></tr>
                ` : patrolLogs.slice(0, 6).map(l => {
                  const isValid = l.gpsStatus === 'valid' || l.verificationStatus === 'verified_cloud';
                  const gmapLink = l.guardCoordinates ? `https://www.google.com/maps?q=${l.guardCoordinates.lat},${l.guardCoordinates.lng}` : '#';
                  return `
                    <tr class="hover:bg-slate-50/50">
                      <td class="p-3 font-mono font-semibold">${new Date(l.scannedAt).toLocaleTimeString('vi-VN')}</td>
                      <td class="p-3 font-bold text-slate-800 dark:text-slate-100">${l.checkpointName}</td>
                      <td class="p-3">${l.zoneName} (${l.floor})</td>
                      <td class="p-3">${l.guardName}</td>
                      <td class="p-3 font-semibold ${isValid ? 'text-emerald-600' : 'text-amber-600'}">
                        ${l.distanceMeters !== null ? l.distanceMeters + 'm' : '—'}
                      </td>
                      <td class="p-3">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${isValid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
                          ${isValid ? 'Hợp lệ' : 'Cảnh báo'}
                        </span>
                      </td>
                      <td class="p-3 text-right">
                        ${l.guardCoordinates ? `
                          <a href="${gmapLink}" target="_blank" class="text-blue-600 font-bold hover:underline">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i> Xem Map
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
      this.initAdminGoogleMap(checkpoints, patrolLogs);
      this.bindAdminMapEvents();
    }, 100);
  }

  bindAdminMapEvents() {
    const campusSelect = document.getElementById('admin-map-campus-filter');
    if (campusSelect) {
      campusSelect.addEventListener('change', (e) => {
        this.panAdminMapToCampus(e.target.value);
      });
    }

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
      color: '#2563eb',
      fillColor: '#3b82f6',
      fillOpacity: 0.12,
      weight: 2,
      dashArray: '4, 4'
    }).addTo(this.adminGoogleMap);

    this.adminCampusCircle.bindTooltip(`${campus.name} (Bán kính ${radius}m)`, { permanent: false, direction: 'top' });
  }

  initAdminGoogleMap(checkpoints, patrolLogs) {
    const mapEl = document.getElementById('admin-google-map');
    if (!mapEl || !window.L) return;

    // Center on Trụ sở chính Nam Sài Gòn (or custom coordinates)
    const campuses = storage.getCampuses();
    const list = campuses.length > 0 ? campuses : OFFICIAL_CAMPUSES;
    const main = list.find(c => c.id === 'cs-chinh' || c.id === 'cs-caolo') || list[0];
    let centerLat = main?.lat || 10.735768115549721;
    let centerLng = main?.lng || 106.68071864291426;

    if (this.adminGoogleMap) {
      this.adminGoogleMap.remove();
      this.adminGoogleMap = null;
    }

    this.adminGoogleMap = L.map('admin-google-map', {
      zoomControl: true,
      attributionControl: false
    }).setView([centerLat, centerLng], 17);

    this.adminMapLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    }).addTo(this.adminGoogleMap);

    this.adminSatLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    });

    this.adminMapMarkersGroup = L.layerGroup().addTo(this.adminGoogleMap);

    // Initial boundary for Cao Lỗ
    if (main) this.drawAdminCampusCircle(main);

    // Add Checkpoint Markers
    checkpoints.forEach(cp => {
      if (!cp.lat || !cp.lng) return;
      const isChecked = patrolLogs.some(log => log.checkpointId === cp.id);
      const color = isChecked ? '#10b981' : '#f59e0b';

      const customIcon = L.divIcon({
        className: 'admin-map-checkpoint-marker',
        html: `
          <div style="background-color: ${color}; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; border: 2.5px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.4); font-size: 13px; cursor: pointer;">
            <i class="fa-solid ${isChecked ? 'fa-check' : 'fa-qrcode'}"></i>
          </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });

      const marker = L.marker([cp.lat, cp.lng], { icon: customIcon });
      const gDir = `https://www.google.com/maps/dir/?api=1&destination=${cp.lat},${cp.lng}`;

      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 12px; line-height: 1.4;">
          <strong style="color: #1e40af; font-size: 13px;">${cp.name}</strong><br>
          <span style="color: #64748b;">${cp.campusName || ''} - ${cp.floor || ''}</span><br>
          <div style="margin: 6px 0;">
            <span style="padding: 2px 6px; border-radius: 4px; background: ${isChecked ? '#d1fae5; color: #065f46;' : '#fef3c7; color: #92400e;'} font-weight: bold; font-size: 11px;">
              ${isChecked ? '✓ Đã kiểm tra' : '⏱ Chưa kiểm tra'}
            </span>
          </div>
          <div style="margin-top: 6px; display: flex; gap: 6px;">
            <a href="${gDir}" target="_blank" style="padding: 4px 8px; border-radius: 6px; background: #2563eb; color: white; text-decoration: none; font-size: 11px; font-weight: bold;">
              Chỉ đường Google Maps &rarr;
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
   * 2. Staff Management (Direct Firestore Integration & Full Edit)
   */
  renderStaff(container) {
    const users = storage.getUsers();
    container.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h4 class="font-bold text-lg text-slate-800 dark:text-slate-100">Quản Lý Nhân Sự & Phân Quyền Firebase Auth</h4>
            <p class="text-xs text-slate-500">Super Admin: <strong class="text-blue-600 font-mono">${SUPER_ADMIN_EMAIL}</strong> • Chỉnh sửa thông tin, ca trực cố định và phân quyền trực tiếp vào Firestore</p>
          </div>
          <button onclick="window.adminModule.openAddStaffModal()" class="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition">
            <i class="fa-solid fa-user-plus mr-1.5"></i> + Cấp tài khoản mới (Firebase Auth)
          </button>
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
                <th class="p-3">Trạng thái</th>
                <th class="p-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
              ${users.length === 0 ? `
                <tr><td colspan="8" class="p-8 text-center text-slate-400">Chưa có tài khoản nào trong hệ thống. Bấm "+ Cấp tài khoản mới" ở trên để tạo.</td></tr>
              ` : users.map(u => {
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
                    <td class="p-3">${u.campusName || 'Trụ sở Cao Lỗ'}</td>
                    <td class="p-3">
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${isOn ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}">
                        ${isOn ? 'Đang trực' : (u.status === 'off_duty' ? 'Nghỉ ca' : (u.status || 'Hoạt động'))}
                      </span>
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
                  <option value="${c.name}" ${user.campusName === c.name ? 'selected' : ''}>${c.name}</option>
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
      const campusName = document.getElementById('edit-staff-campus').value;
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
        this.renderStaff(document.getElementById('admin-content-pane'));
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

            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Cơ sở phân công</label>
              <select id="staff-campus" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800">
                ${campusList.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
              </select>
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
      const campusName = document.getElementById('staff-campus').value;

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
          campusName
        });
        document.getElementById('modal-add-staff').remove();
        alert(`🎉 TẠO TÀI KHOẢN THÀNH CÔNG!\n\nEmail: ${email}\nHọ tên: ${name}\nMã NV: ${code}\nPhân quyền: ${role.toUpperCase()}\nCa cố định: ${fixedShiftName}\nCơ sở: ${campusName}\n\nTài khoản đã được tạo trực tiếp trong Firebase Authentication và cấp quyền trong hệ thống!`);
        this.renderStaff(document.getElementById('admin-content-pane'));
        if (window.renderStaffUI) window.renderStaffUI();
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
                  <td class="p-3 font-bold text-slate-700 dark:text-slate-300">≤ ${cp.allowedRadius || 50}m</td>
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
                <input type="number" id="edit-cp-radius" value="${cp.allowedRadius || 50}" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800" required>
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
      const allowedRadius = parseInt(document.getElementById('edit-cp-radius').value, 10) || 50;
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
                <input type="number" id="cp-radius" value="35" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800" required>
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
      const allowedRadius = parseInt(document.getElementById('cp-radius').value, 10) || 35;
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
    const rawCampuses = storage.getCampuses();
    const campuses = rawCampuses.length > 0 ? rawCampuses : OFFICIAL_CAMPUSES;

    container.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h4 class="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <i class="fa-solid fa-school text-blue-600"></i> Quản Lý Cơ Sở & Tùy Chỉnh Tọa Độ GPS (Google Maps)
            </h4>
            <p class="text-xs text-slate-500">Super Administrator có thể điều chỉnh trực tiếp tọa độ GPS tâm và bán kính geofence cho <strong>Trụ sở chính</strong> và tất cả các phân hiệu</p>
          </div>
          <button onclick="window.adminModule.openAddCampusModal()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition">
            <i class="fa-solid fa-plus mr-1.5"></i> + Thêm phân hiệu mới
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${campuses.map(c => {
            const isMain = c.id === 'cs-chinh' || c.id === 'cs-caolo';
            const radius = c.radiusMeters || c.radius || 150;
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
                      ` : ''}
                    </div>
                    <span class="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-700">Đang hoạt động</span>
                  </div>

                  <h5 class="font-bold text-base text-slate-800 dark:text-slate-100 mt-1">${c.name}</h5>
                  <p class="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                    <i class="fa-solid fa-location-dot text-rose-500 mr-1.5"></i> ${c.address}
                  </p>

                  <div class="mt-3 p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs space-y-1.5">
                    <div class="flex items-center justify-between">
                      <span class="text-slate-400">Tọa độ GPS tâm:</span>
                      <span class="font-mono font-bold text-blue-600 dark:text-blue-400">
                        ${c.lat ? c.lat.toFixed(6) : '—'}, ${c.lng ? c.lng.toFixed(6) : '—'}
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

                  <a href="https://www.google.com/maps?q=${c.lat},${c.lng}" target="_blank" class="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 dark:bg-slate-800 dark:text-blue-400 font-bold hover:bg-blue-100 transition flex items-center gap-1 text-xs">
                    <i class="fa-brands fa-google"></i> Mở Google Maps
                  </a>
                </div>
              </div>
            `;
          }).join('')}
        </div>
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

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Mã cơ sở *</label>
                <input type="text" id="edit-campus-code" value="${campus.code || 'CS'}" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold uppercase" required>
              </div>
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Bán kính kiểm soát GPS (Mét) *</label>
                <input type="number" id="edit-campus-radius" value="${initRadius}" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold" required>
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

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Initialize Campus Map Picker
    setTimeout(() => {
      const pickerEl = document.getElementById('edit-campus-google-map');
      if (pickerEl && window.L) {
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

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Mã cơ sở *</label>
                <input type="text" id="campus-code" placeholder="VD: CS-Q7" class="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold uppercase" required>
              </div>
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Bán kính geofence (Mét) *</label>
                <input type="number" id="campus-radius" value="150" class="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold" required>
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
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    setTimeout(() => {
      const pickerEl = document.getElementById('add-campus-picker-map');
      if (pickerEl && window.L) {
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
          lat, 
          lng, 
          status: 'active' 
        });

        document.getElementById('modal-add-campus')?.remove();
        alert(`✅ ĐÃ THÊM CƠ SỞ THÀNH CÔNG!\n\n• Cơ sở: ${name} (${code})\n• Địa chỉ: ${address}\n• Tọa độ GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}\n• Bán kính: ${radiusMeters}m\n\nCơ sở đã được lưu trực tiếp vào Firestore và có thể phân công bảo vệ ngay lập tức!`);
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
    const guards = users.filter(u => u.role === 'guard');
    const campuses = storage.getCampuses();
    const campusList = campuses.length > 0 ? campuses : OFFICIAL_CAMPUSES;

    const ca24hGuards = guards.filter(g => {
      const s = g.fixedShiftName || g.currentShiftName || '';
      return !s.includes('Kíp 1') && !s.includes('Kíp 2');
    });
    const kip1Guards = guards.filter(g => (g.fixedShiftName || g.currentShiftName || '').includes('Kíp 1'));
    const kip2Guards = guards.filter(g => (g.fixedShiftName || g.currentShiftName || '').includes('Kíp 2'));

    container.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-5">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h4 class="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <i class="fa-solid fa-calendar-check text-blue-600"></i> Bảng Phân Công Ca Trực Cố Định
            </h4>
            <p class="text-xs text-slate-500">Super Admin & Quản lý phân công ca trực 24/24H cho bảo vệ (từ 06:00 sáng hôm nay đến 06:00 sáng mai đổi ca)</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="window.adminModule.openQuickAssignShiftModal()" class="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5">
              <i class="fa-solid fa-user-plus"></i> + Phân công ca trực cho bảo vệ
            </button>
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
          <button onclick="window.adminModule.openQuickAssignShiftModal('${g.id}')" class="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-bold transition flex items-center gap-1" title="Chỉnh sửa chi tiết">
            <i class="fa-solid fa-pen-to-square text-[10px]"></i> Sửa
          </button>
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

  async quickChangeGuardShift(guardId, newShift) {
    const users = storage.getUsers();
    const guard = users.find(u => u.id === guardId);
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
                ${campusList.map(c => `
                  <option value="${c.id}" ${targetGuard && (targetGuard.campusId === c.id || targetGuard.campusName === c.name) ? 'selected' : ''}>${c.name}</option>
                `).join('')}
              </select>
            </div>

            <div class="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-700 dark:text-blue-300">
              <i class="fa-solid fa-cloud-arrow-up mr-1.5"></i> Thiết lập này được lưu vĩnh viễn vào Firestore và tự động áp dụng khi bảo vệ đăng nhập và thực hiện nhiệm vụ tuần tra.
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
      const saveBtn = document.getElementById('btn-submit-quick-assign');
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang lưu...';

      const selectedGuardId = guardId || document.getElementById('assign-guard-id').value;
      const selectedShift = document.getElementById('assign-shift-name').value;
      const selectedCampusId = document.getElementById('assign-campus-id').value;
      const selectedCampus = campusList.find(c => c.id === selectedCampusId);
      const guard = guards.find(g => g.id === selectedGuardId);

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
   * 8. Patrol Logs with CSV Export
   */
  renderPatrolLogs(container) {
    const logs = storage.getPatrolLogs();
    container.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="font-bold text-lg text-slate-800 dark:text-slate-100">Nhật Ký Tuần Tra Toàn Trường (Firestore Audit)</h4>
            <p class="text-xs text-slate-500">Ghi nhận các lần quét mã QR, sai số GPS và kiểm định Cloud</p>
          </div>
          <button onclick="window.adminModule.exportLogsCsv()" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition">
            <i class="fa-solid fa-file-excel mr-1.5"></i> Xuất file CSV / Excel
          </button>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs text-slate-600 dark:text-slate-300">
            <thead class="bg-slate-50 dark:bg-slate-900 text-slate-500 uppercase text-[11px]">
              <tr>
                <th class="p-3">Thời gian</th>
                <th class="p-3">Nhân viên</th>
                <th class="p-3">Ca trực</th>
                <th class="p-3">Điểm chốt</th>
                <th class="p-3">Khoảng cách GPS</th>
                <th class="p-3">Ghi chú</th>
                <th class="p-3">Kiểm tra</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
              ${logs.length === 0 ? `
                <tr><td colspan="7" class="p-8 text-center text-slate-400">Chưa có nhật ký tuần tra nào trong Firestore.</td></tr>
              ` : logs.map(l => {
                const isValid = l.gpsStatus === 'valid' || l.verificationStatus === 'verified_cloud';
                return `
                  <tr class="hover:bg-slate-50/50">
                    <td class="p-3 font-mono font-bold">${new Date(l.scannedAt).toLocaleTimeString('vi-VN')} <span class="text-slate-400 font-normal">(${new Date(l.scannedAt).toLocaleDateString('vi-VN')})</span></td>
                    <td class="p-3 font-semibold text-slate-800 dark:text-slate-100">${l.guardName}</td>
                    <td class="p-3">${l.shiftName || 'Ca hiện tại'}</td>
                    <td class="p-3 font-bold text-blue-600">${l.checkpointName}</td>
                    <td class="p-3 font-bold ${isValid ? 'text-emerald-600' : 'text-amber-600'}">
                      ${l.distanceMeters !== null ? l.distanceMeters + 'm' : '—'}
                    </td>
                    <td class="p-3 text-slate-500">${l.notes}</td>
                    <td class="p-3">
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${isValid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
                        ${isValid ? 'Hợp lệ' : 'Cảnh báo'}
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

  exportLogsCsv() {
    const logs = storage.getPatrolLogs();
    let csv = "Thời Gian,Nhân Viên,Ca Trực,Điểm Chốt,Khoảng Cách (m),Trạng Thái\n";
    logs.forEach(l => {
      csv += `"${l.scannedAt}","${l.guardName}","${l.shiftName || ''}","${l.checkpointName}","${l.distanceMeters || ''}","${l.verificationStatus}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `nhat_ky_tuan_tra_nsg_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
   * 10. Reports
   */
  renderReports(container) {
    container.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <div class="flex items-center justify-between">
          <h4 class="font-bold text-lg text-slate-800 dark:text-slate-100">Báo Cáo An Ninh & Hiệu Suất</h4>
          <button onclick="window.print()" class="px-4 py-2 bg-slate-900 text-white font-bold text-xs rounded-xl">In Báo Cáo</button>
        </div>
        <p class="text-xs text-slate-500">Tự động tổng hợp dữ liệu từ nhật ký tuần tra thực tế trên Firestore.</p>
      </div>
    `;
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
            <input type="number" id="setting-gps-radius" value="${settings.maxGpsRadiusMeters || 50}" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800">
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
    const radius = parseInt(document.getElementById('setting-gps-radius').value, 10) || 50;
    const cooldown = parseInt(document.getElementById('setting-cooldown').value, 10) || 5;
    storage.saveSettings({ ...storage.getSettings(), maxGpsRadiusMeters: radius, scanCooldownSeconds: cooldown });
    alert('✅ Đã lưu cấu hình an ninh!');
  }
}

export const adminModule = new AdminDesktopModule();
window.adminModule = adminModule;
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
