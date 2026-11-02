/**
 * NSG SMART GUARD - Manager Mobile Dashboard with Google Maps
 * Uses official Google Maps tiles (Roadmap & Satellite Hybrid),
 * live GPS position tracking, and direct Google Maps navigation.
 */

import { storage } from "./storage.js";
import { OFFICIAL_CAMPUSES, updateFirestoreUser } from "./firebase-config.js";

class ManagerMobileModule {
  constructor() {
    this.selectedCampus = 'all';
    this.mapInstance = null;
    this.markersGroup = null;
    this.campusCircleLayer = null;
    this.userLocationMarker = null;
    this.googleMapLayer = null;
    this.googleSatLayer = null;
    this.currentMapType = 'roadmap';
  }

  init() {
    this.bindEvents();
    this.populateCampusDropdown();
    this.render();
  }

  populateCampusDropdown() {
    const campusSelect = document.getElementById('manager-campus-filter');
    if (!campusSelect) return;
    const campuses = storage.getCampuses();
    const list = campuses.length > 0 ? campuses : OFFICIAL_CAMPUSES;

    campusSelect.innerHTML = `
      <option value="all">Tất cả các phân hiệu (Mặc định: 47 Cao Lỗ)</option>
      ${list.map(c => `
        <option value="${c.id}">${c.name}</option>
      `).join('')}
    `;
  }

  bindEvents() {
    const campusSelect = document.getElementById('manager-campus-filter');
    if (campusSelect) {
      campusSelect.addEventListener('change', (e) => {
        this.selectedCampus = e.target.value;
        this.panMapToSelectedCampus(this.selectedCampus);
        this.render();
      });
    }

    const refreshBtn = document.getElementById('btn-refresh-manager-mobile');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.render();
        if (window.scannerManager) window.scannerManager.playSuccessSound();
      });
    }

    const toggleMapBtn = document.getElementById('btn-toggle-manager-map-type');
    if (toggleMapBtn) {
      toggleMapBtn.addEventListener('click', () => this.toggleMapType());
    }

    const myLocationBtn = document.getElementById('btn-manager-my-location');
    if (myLocationBtn) {
      myLocationBtn.addEventListener('click', () => this.zoomToUserLocation());
    }
  }

  panMapToSelectedCampus(campusId) {
    if (!this.mapInstance) return;
    const campuses = storage.getCampuses();
    const list = campuses.length > 0 ? campuses : OFFICIAL_CAMPUSES;

    if (campusId === 'all') {
      // Main Campus - 47 Cao Lỗ
      const mainCampus = list.find(c => c.id === 'cs-chinh' || c.id === 'cs-caolo') || list[0];
      if (mainCampus && mainCampus.lat && mainCampus.lng) {
        this.mapInstance.flyTo([mainCampus.lat, mainCampus.lng], 17, { duration: 1.2 });
        this.drawCampusBoundary(mainCampus);
      }
    } else {
      const target = list.find(c => c.id === campusId);
      if (target && target.lat && target.lng) {
        this.mapInstance.flyTo([target.lat, target.lng], 18, { duration: 1.2 });
        this.drawCampusBoundary(target);
      }
    }
  }

  drawCampusBoundary(campus) {
    if (!this.mapInstance || !campus || !campus.lat || !campus.lng) return;
    if (this.campusCircleLayer) {
      this.mapInstance.removeLayer(this.campusCircleLayer);
    }
    const radius = campus.radius || 150;
    this.campusCircleLayer = L.circle([campus.lat, campus.lng], {
      color: '#2563eb',
      fillColor: '#3b82f6',
      fillOpacity: 0.12,
      weight: 2,
      dashArray: '4, 4'
    }).addTo(this.mapInstance);

    this.campusCircleLayer.bindTooltip(`Khu vực GPS: ${campus.name} (Bán kính ${radius}m)`, {
      permanent: false,
      direction: 'top'
    });
  }

  toggleMapType() {
    if (!this.mapInstance) return;
    if (this.currentMapType === 'roadmap') {
      this.mapInstance.removeLayer(this.googleMapLayer);
      this.googleSatLayer.addTo(this.mapInstance);
      this.currentMapType = 'satellite';
    } else {
      this.mapInstance.removeLayer(this.googleSatLayer);
      this.googleMapLayer.addTo(this.mapInstance);
      this.currentMapType = 'roadmap';
    }
    const btn = document.getElementById('btn-toggle-manager-map-type');
    if (btn) {
      btn.innerHTML = `<i class="fa-solid fa-layer-group"></i> ${this.currentMapType === 'roadmap' ? 'Vệ tinh' : 'Bản đồ'}`;
    }
  }

  zoomToUserLocation() {
    if (!this.mapInstance) return;
    if (window.scannerManager?.currentLocation) {
      const loc = window.scannerManager.currentLocation;
      this.mapInstance.setView([loc.lat, loc.lng], 18);
      this.updateUserLocationOnMap(loc.lat, loc.lng, loc.accuracy);
    } else {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.mapInstance.setView([pos.coords.latitude, pos.coords.longitude], 18);
          this.updateUserLocationOnMap(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        },
        () => alert('Không thể lấy tọa độ GPS hiện tại. Vui lòng bật quyền vị trí trên điện thoại.')
      );
    }
  }

  updateUserLocationOnMap(lat, lng, accuracy) {
    if (!this.mapInstance) return;
    if (this.userLocationMarker) {
      this.mapInstance.removeLayer(this.userLocationMarker);
    }

    const myIcon = L.divIcon({
      className: 'user-gps-marker',
      html: `
        <div style="position: relative; width: 20px; height: 20px;">
          <div style="position: absolute; inset: -10px; border-radius: 50%; background: rgba(59, 130, 246, 0.25); animation: ping 2s infinite;"></div>
          <div style="width: 20px; height: 20px; border-radius: 50%; background: #2563eb; border: 3px solid white; box-shadow: 0 0 8px rgba(0,0,0,0.4);"></div>
        </div>
      `,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    this.userLocationMarker = L.marker([lat, lng], { icon: myIcon }).addTo(this.mapInstance);
    this.userLocationMarker.bindPopup(`<strong>Vị trí của bạn</strong><br>Độ chính xác: ±${Math.round(accuracy || 5)}m`).openPopup();
  }

  render() {
    const users = storage.getUsers();
    const checkpoints = storage.getCheckpoints();
    const patrolLogs = storage.getPatrolLogs();
    const incidents = storage.getIncidents();
    const activeShift = storage.getActiveShift();

    // Guards
    const guards = users.filter(u => u.role === 'guard');
    const filteredGuards = guards.filter(g => this.selectedCampus === 'all' || g.campusId === this.selectedCampus);
    const onDutyGuards = filteredGuards.filter(g => g.status === 'on_duty');

    // Patrol progress
    let filteredCps = checkpoints.filter(c => this.selectedCampus === 'all' || c.campusId === this.selectedCampus);
    let checkedCount = 0;
    filteredCps.forEach(cp => {
      const hasLog = patrolLogs.some(log => log.checkpointId === cp.id);
      if (hasLog) checkedCount++;
    });
    const patrolPercent = filteredCps.length > 0 ? Math.round((checkedCount / filteredCps.length) * 100) : 0;

    // Warnings
    const distanceWarnings = patrolLogs.filter(l => l.gpsStatus === 'warning_far');
    const openIncidents = incidents.filter(i => i.status !== 'resolved');

    // Stats UI
    const onDutyCountEl = document.getElementById('mgr-on-duty-count');
    const patrolPercentEl = document.getElementById('mgr-patrol-percent');
    const alertsCountEl = document.getElementById('mgr-alerts-count');
    const openIncidentsEl = document.getElementById('mgr-incidents-count');

    if (onDutyCountEl) onDutyCountEl.textContent = `${onDutyGuards.length}/${filteredGuards.length}`;
    if (patrolPercentEl) patrolPercentEl.textContent = `${patrolPercent}%`;
    if (alertsCountEl) alertsCountEl.textContent = distanceWarnings.length;
    if (openIncidentsEl) openIncidentsEl.textContent = openIncidents.length;

    // Guards List
    const guardListEl = document.getElementById('manager-guard-cards-list');
    if (guardListEl) {
      if (filteredGuards.length === 0) {
        guardListEl.innerHTML = `
          <div class="py-6 text-center text-xs text-slate-400 bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700">
            <i class="fa-solid fa-user-shield text-2xl text-slate-300 mb-1.5 block"></i>
            Chưa có nhân viên bảo vệ nào trong hệ thống Firestore.
            <div class="mt-2 text-[11px] text-blue-600 font-bold">Vào Quản Trị -> Nhân Sự để cấp tài khoản bảo vệ.</div>
          </div>
        `;
      } else {
        guardListEl.innerHTML = filteredGuards.map(g => {
          const isOn = g.status === 'on_duty';
          const lastScan = patrolLogs.find(l => l.guardId === g.id);
          const lastScanTime = lastScan ? new Date(lastScan.scannedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'Chưa có lượt quét';

          return `
            <div class="p-3.5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-xs flex items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <div class="relative">
                  <img src="${g.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}" alt="${g.name}" class="w-11 h-11 rounded-full object-cover border-2 ${isOn ? 'border-emerald-500' : 'border-slate-300'}">
                  <span class="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-slate-800 ${isOn ? 'bg-emerald-500' : 'bg-slate-400'}"></span>
                </div>
                <div>
                  <div class="font-bold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    ${g.name}
                    <span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">${g.code}</span>
                  </div>
                  <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    ${g.campusName || 'Cơ sở phân công'}
                  </div>
                  <div class="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                    Ca: <strong>${g.fixedShiftName || g.currentShiftName || 'Ca Trực 24H'}</strong> • Quét gần nhất: <strong>${lastScanTime}</strong>
                  </div>
                </div>
              </div>

              <div class="flex flex-col items-end gap-1.5 shrink-0">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${isOn ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}">
                  ${isOn ? 'Đang trực' : 'Nghỉ ca'}
                </span>
                <div class="flex items-center gap-1">
                  <button onclick="window.managerMobileModule.openChangeShiftModal('${g.id}')" class="px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 font-bold text-[10px] border border-blue-200 dark:border-blue-800 flex items-center gap-1 hover:bg-blue-100 transition" title="Đổi ca trực cố định">
                    <i class="fa-solid fa-clock-rotate-left"></i> Đổi ca
                  </button>
                  ${g.phone ? `
                    <a href="tel:${g.phone}" class="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 flex items-center justify-center hover:bg-emerald-100 transition" title="Gọi trực tiếp">
                      <i class="fa-solid fa-phone text-xs"></i>
                    </a>
                  ` : ''}
                </div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // Fixed Shifts Schedule (Mobile Manager & Super Admin)
    const scheduleEl = document.getElementById('manager-fixed-shifts-schedule');
    if (scheduleEl) {
      const shiftDefinitions = [
        { 
          key: 'ca24h', 
          name: 'Ca Trực 24H (06:00 - 06:00 hôm sau)', 
          shortName: 'Ca 24H (Chính)', 
          time: '06:00 hôm nay - 06:00 sáng mai', 
          icon: 'fa-shield-halved', 
          badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200', 
          borderClass: 'border-blue-200 dark:border-blue-800', 
          bgClass: 'bg-blue-50/40 dark:bg-slate-900/40' 
        },
        { 
          key: 'kip1', 
          name: 'Kíp 1 - Ca 24H (06:00 - 06:00)', 
          shortName: 'Kíp 1 (24H)', 
          time: '06:00 hôm nay - 06:00 sáng mai', 
          icon: 'fa-user-group', 
          badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200', 
          borderClass: 'border-emerald-200 dark:border-emerald-800', 
          bgClass: 'bg-emerald-50/40 dark:bg-slate-900/40' 
        },
        { 
          key: 'kip2', 
          name: 'Kíp 2 - Ca 24H (06:00 - 06:00)', 
          shortName: 'Kíp 2 (24H)', 
          time: '06:00 hôm nay - 06:00 sáng mai', 
          icon: 'fa-people-arrows', 
          badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200', 
          borderClass: 'border-indigo-200 dark:border-indigo-800', 
          bgClass: 'bg-indigo-50/40 dark:bg-slate-900/40' 
        }
      ];

      scheduleEl.innerHTML = shiftDefinitions.map(sDef => {
        let assigned = [];
        if (sDef.key === 'kip1') {
          assigned = filteredGuards.filter(g => (g.fixedShiftName || g.currentShiftName || '').includes('Kíp 1'));
        } else if (sDef.key === 'kip2') {
          assigned = filteredGuards.filter(g => (g.fixedShiftName || g.currentShiftName || '').includes('Kíp 2'));
        } else {
          assigned = filteredGuards.filter(g => {
            const s = g.fixedShiftName || g.currentShiftName || '';
            return !s.includes('Kíp 1') && !s.includes('Kíp 2');
          });
        }

        return `
          <div class="rounded-2xl border ${sDef.borderClass} ${sDef.bgClass} p-3.5 space-y-2.5">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="px-2 py-0.5 rounded-md text-[11px] font-extrabold ${sDef.badgeClass} flex items-center gap-1">
                  <i class="fa-solid ${sDef.icon} text-[10px]"></i> ${sDef.shortName}
                </span>
                <span class="text-xs font-bold text-slate-700 dark:text-slate-200 font-mono">${sDef.time}</span>
              </div>
              <span class="text-[11px] font-bold text-slate-500">${assigned.length} nhân viên</span>
            </div>

            <div class="space-y-1.5">
              ${assigned.length === 0 ? `
                <div class="text-[11px] text-slate-400 py-2.5 text-center bg-white/60 dark:bg-slate-800/60 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">Chưa phân công bảo vệ nào vào ca này</div>
              ` : assigned.map(g => `
                <div class="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs shadow-2xs">
                  <div class="flex items-center gap-2.5">
                    <img src="${g.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}" class="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-700">
                    <div>
                      <div class="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        ${g.name}
                        <span class="text-[9px] font-mono px-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-500">${g.code}</span>
                      </div>
                      <div class="text-[10px] text-slate-400">${g.campusName || 'Trụ sở chính Cao Lỗ'}</div>
                    </div>
                  </div>
                  <button onclick="window.managerMobileModule.openChangeShiftModal('${g.id}')" class="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 font-bold text-[10px] rounded-lg border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition">
                    Đổi ca
                  </button>
                </div>
              `).join('')}
            </div>

            <button onclick="window.managerMobileModule.openQuickAssignModal('${sDef.name}')" class="w-full py-2 bg-white/80 dark:bg-slate-800/80 hover:bg-white text-blue-600 dark:text-blue-400 font-bold text-[11px] rounded-xl border border-dashed border-blue-200 dark:border-blue-800 transition flex items-center justify-center gap-1.5 shadow-2xs">
              <i class="fa-solid fa-plus text-[10px]"></i> Thêm bảo vệ vào ${sDef.shortName}
            </button>
          </div>
        `;
      }).join('');
    }

    // Alerts
    const alertsListEl = document.getElementById('manager-alerts-feed');
    if (alertsListEl) {
      if (distanceWarnings.length === 0 && openIncidents.length === 0) {
        alertsListEl.innerHTML = `
          <div class="py-6 text-center text-xs text-slate-400 bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700">
            <i class="fa-solid fa-shield-halved text-emerald-500 text-2xl mb-1 block"></i>
            Tất cả chốt và ca trực an toàn, không có cảnh báo vi phạm.
          </div>
        `;
      } else {
        const alertItems = [];
        distanceWarnings.forEach(w => {
          alertItems.push(`
            <div class="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs flex items-start gap-2.5">
              <i class="fa-solid fa-triangle-exclamation text-amber-600 text-sm mt-0.5"></i>
              <div>
                <strong class="text-amber-800 dark:text-amber-200">Nghi vấn vị trí quét:</strong> ${w.checkpointName}
                <div class="text-[11px] text-slate-600 dark:text-slate-400">${w.guardName} cách điểm ${w.distanceMeters}m (${new Date(w.scannedAt).toLocaleTimeString('vi-VN')})</div>
              </div>
            </div>
          `);
        });

        openIncidents.forEach(inc => {
          alertItems.push(`
            <div class="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs flex items-start gap-2.5">
              <i class="fa-solid fa-bell text-rose-600 text-sm mt-0.5 animate-bounce"></i>
              <div>
                <strong class="text-rose-800 dark:text-rose-200">Sự cố chờ giải quyết:</strong> ${inc.title}
                <div class="text-[11px] text-slate-600 dark:text-slate-400">${inc.reportedBy} • ${new Date(inc.reportedAt).toLocaleTimeString('vi-VN')}</div>
              </div>
            </div>
          `);
        });

        alertsListEl.innerHTML = alertItems.join('');
      }
    }

    // Google Maps
    this.initOrUpdateGoogleMap(filteredCps, patrolLogs, activeShift);
  }

  initOrUpdateGoogleMap(checkpoints, patrolLogs, activeShift) {
    const mapEl = document.getElementById('manager-mobile-map');
    if (!mapEl || !window.L) return;

    const campuses = storage.getCampuses();
    const list = campuses.length > 0 ? campuses : OFFICIAL_CAMPUSES;

    // Determine initial center (Default: Trụ sở chính Nam Sài Gòn)
    const mainCampus = list.find(c => c.id === 'cs-chinh' || c.id === 'cs-caolo') || list[0];
    let defaultLat = mainCampus?.lat || 10.735768115549721;
    let defaultLng = mainCampus?.lng || 106.68071864291426;
    let zoomLevel = 17;

    if (this.selectedCampus === 'all') {
      if (mainCampus && mainCampus.lat) {
        defaultLat = mainCampus.lat;
        defaultLng = mainCampus.lng;
      }
    } else {
      const selected = list.find(c => c.id === this.selectedCampus);
      if (selected && selected.lat) {
        defaultLat = selected.lat;
        defaultLng = selected.lng;
        zoomLevel = 18;
      }
    }

    if (!this.mapInstance) {
      this.mapInstance = L.map('manager-mobile-map', {
        zoomControl: false,
        attributionControl: false
      }).setView([defaultLat, defaultLng], zoomLevel);

      // Google Maps Roadmap Layer
      this.googleMapLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
      }).addTo(this.mapInstance);

      // Google Maps Satellite Hybrid Layer
      this.googleSatLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
      });

      this.markersGroup = L.layerGroup().addTo(this.mapInstance);

      // Draw initial boundary
      const initCampus = this.selectedCampus === 'all'
        ? (list.find(c => c.id === 'cs-chinh' || c.id === 'cs-caolo') || list[0])
        : list.find(c => c.id === this.selectedCampus);
      if (initCampus) this.drawCampusBoundary(initCampus);
    }

    this.markersGroup.clearLayers();

    checkpoints.forEach(cp => {
      if (!cp.lat || !cp.lng) return;
      const isChecked = patrolLogs.some(log => log.checkpointId === cp.id);
      const color = isChecked ? '#10b981' : '#f59e0b';

      const customIcon = L.divIcon({
        className: 'google-map-checkpoint-marker',
        html: `
          <div style="background-color: ${color}; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; border: 2.5px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.4); font-size: 12px; cursor: pointer;">
            <i class="fa-solid ${isChecked ? 'fa-check' : 'fa-qrcode'}"></i>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const marker = L.marker([cp.lat, cp.lng], { icon: customIcon });
      const googleMapsDirUrl = `https://www.google.com/maps/dir/?api=1&destination=${cp.lat},${cp.lng}`;

      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 12px; line-height: 1.4; min-width: 170px;">
          <strong style="color: #1e40af; font-size: 13px;">${cp.name}</strong><br>
          <span style="color: #64748b;">${cp.campusName || ''} - ${cp.floor || ''}</span><br>
          <div style="margin: 6px 0;">
            <span style="display: inline-block; padding: 2px 7px; border-radius: 6px; background: ${isChecked ? '#d1fae5; color: #065f46;' : '#fef3c7; color: #92400e;'} font-weight: bold; font-size: 11px;">
              ${isChecked ? '✓ Đã kiểm tra' : '⏱ Chưa kiểm tra'}
            </span>
          </div>
          <a href="${googleMapsDirUrl}" target="_blank" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 6px; background: #2563eb; color: white; text-decoration: none; font-size: 11px; font-weight: bold; margin-top: 4px;">
            <i class="fa-solid fa-diamond-turn-right"></i> Chỉ đường Google Maps
          </a>
        </div>
      `);
      this.markersGroup.addLayer(marker);
    });

    setTimeout(() => {
      if (this.mapInstance) this.mapInstance.invalidateSize();
    }, 200);
  }

  /**
   * Modal to switch fixed shift & campus for a specific guard
   */
  openChangeShiftModal(guardId) {
    const users = storage.getUsers();
    const guard = users.find(u => u.id === guardId);
    if (!guard) {
      alert("Không tìm thấy thông tin nhân viên bảo vệ!");
      return;
    }

    const campuses = storage.getCampuses();
    const campusList = campuses.length > 0 ? campuses : OFFICIAL_CAMPUSES;
    const currentShift = guard.fixedShiftName || guard.currentShiftName || 'Ca Trực 24H (06:00 - 06:00 hôm sau)';

    const modalHtml = `
      <div id="modal-manager-change-shift" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-4 border border-slate-200 dark:border-slate-800 max-h-[92vh] overflow-y-auto">
          <div class="flex items-center justify-between">
            <h3 class="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-user-clock text-blue-600"></i> Phân Công Ca Trực Cố Định
            </h3>
            <button onclick="document.getElementById('modal-manager-change-shift').remove()" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-xmark text-base"></i></button>
          </div>

          <div class="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center gap-3">
            <img src="${guard.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}" class="w-11 h-11 rounded-full object-cover border border-slate-200 dark:border-slate-700">
            <div>
              <div class="font-bold text-xs text-slate-800 dark:text-slate-100">${guard.name}</div>
              <div class="text-[10px] text-slate-400 font-mono">Mã NV: ${guard.code} • ${guard.phone || 'Chưa có SĐT'}</div>
            </div>
          </div>

          <form id="form-manager-change-shift" class="space-y-3 text-xs">
            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Chọn Ca Trực Cố Định *</label>
              <select id="modal-shift-select" class="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100" required>
                <option value="Ca Trực 24H (06:00 - 06:00 hôm sau)" ${(!currentShift.includes('Kíp 1') && !currentShift.includes('Kíp 2')) ? 'selected' : ''}>🛡️ Ca Trực 24H (06:00 - 06:00 hôm sau)</option>
                <option value="Kíp 1 - Ca 24H (06:00 - 06:00)" ${currentShift.includes('Kíp 1') ? 'selected' : ''}>👥 Kíp 1 - Ca 24H (06:00 - 06:00)</option>
                <option value="Kíp 2 - Ca 24H (06:00 - 06:00)" ${currentShift.includes('Kíp 2') ? 'selected' : ''}>🔄 Kíp 2 - Ca 24H (06:00 - 06:00)</option>
              </select>
            </div>

            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Cơ sở / Phân hiệu phụ trách *</label>
              <select id="modal-campus-select" class="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-medium text-slate-800 dark:text-slate-100" required>
                ${campusList.map(c => `
                  <option value="${c.id}" ${guard.campusId === c.id || guard.campusName === c.name ? 'selected' : ''}>${c.name}</option>
                `).join('')}
              </select>
            </div>

            <div class="p-2.5 bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl text-[10px] text-blue-700 dark:text-blue-300">
              <i class="fa-solid fa-cloud-arrow-up mr-1"></i> Dữ liệu phân công sẽ lưu cố định vào Cloud Firestore và tự động áp dụng khi bảo vệ nhận ca tuần tra.
            </div>

            <div class="pt-2 flex justify-end gap-2">
              <button type="button" onclick="document.getElementById('modal-manager-change-shift').remove()" class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">Hủy</button>
              <button type="submit" id="btn-save-manager-shift" class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition">
                <i class="fa-solid fa-floppy-disk mr-1"></i> Lưu Phân Công
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('form-manager-change-shift').onsubmit = async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('btn-save-manager-shift');
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang lưu...';

      const selectedShift = document.getElementById('modal-shift-select').value;
      const selectedCampusId = document.getElementById('modal-campus-select').value;
      const selectedCampus = campusList.find(c => c.id === selectedCampusId);

      try {
        await updateFirestoreUser(guardId, {
          fixedShiftName: selectedShift,
          currentShiftName: selectedShift,
          campusId: selectedCampusId,
          campusName: selectedCampus?.name || 'Trụ sở Cao Lỗ'
        });

        document.getElementById('modal-manager-change-shift')?.remove();
        alert(`✅ Đã cập nhật ca trực cố định cho ${guard.name}:\n• Ca: ${selectedShift}\n• Cơ sở: ${selectedCampus?.name || 'Trụ sở Cao Lỗ'}`);
        this.render();
        if (window.renderRosterUI) window.renderRosterUI();
        if (window.renderStaffUI) window.renderStaffUI();
        if (window.renderHomeUI) window.renderHomeUI();
      } catch (err) {
        alert("Lỗi khi lưu vào Firestore: " + err.message);
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i> Lưu Phân Công';
      }
    };
  }

  /**
   * Modal to quickly assign any guard into a shift and campus
   */
  openQuickAssignModal(defaultShift = '') {
    const users = storage.getUsers();
    const guards = users.filter(u => u.role === 'guard');
    if (guards.length === 0) {
      alert("Chưa có nhân viên bảo vệ nào trong hệ thống! Vui lòng vào Desktop Admin -> Quản lý Nhân sự để tạo tài khoản.");
      return;
    }

    const campuses = storage.getCampuses();
    const campusList = campuses.length > 0 ? campuses : OFFICIAL_CAMPUSES;

    const modalHtml = `
      <div id="modal-manager-quick-assign" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-4 border border-slate-200 dark:border-slate-800 max-h-[92vh] overflow-y-auto">
          <div class="flex items-center justify-between">
            <h3 class="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-calendar-plus text-blue-600"></i> Phân Công Ca Trực Cố Định
            </h3>
            <button onclick="document.getElementById('modal-manager-quick-assign').remove()" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-xmark text-base"></i></button>
          </div>

          <form id="form-manager-quick-assign" class="space-y-3 text-xs">
            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Chọn Nhân viên bảo vệ *</label>
              <select id="modal-assign-guard" class="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100" required>
                ${guards.map(g => `
                  <option value="${g.id}">
                    ${g.name} (${g.code}) — Đang ca: ${g.fixedShiftName || g.currentShiftName || 'Ca Trực 24H'}
                  </option>
                `).join('')}
              </select>
            </div>

            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Ca trực cố định *</label>
              <select id="modal-assign-shift" class="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100" required>
                <option value="Ca Trực 24H (06:00 - 06:00 hôm sau)" ${(!defaultShift.includes('Kíp 1') && !defaultShift.includes('Kíp 2')) ? 'selected' : ''}>🛡️ Ca Trực 24H (06:00 - 06:00 hôm sau)</option>
                <option value="Kíp 1 - Ca 24H (06:00 - 06:00)" ${defaultShift.includes('Kíp 1') ? 'selected' : ''}>👥 Kíp 1 - Ca 24H (06:00 - 06:00)</option>
                <option value="Kíp 2 - Ca 24H (06:00 - 06:00)" ${defaultShift.includes('Kíp 2') ? 'selected' : ''}>🔄 Kíp 2 - Ca 24H (06:00 - 06:00)</option>
              </select>
            </div>

            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Cơ sở phân công *</label>
              <select id="modal-assign-campus" class="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-medium text-slate-800 dark:text-slate-100" required>
                ${campusList.map(c => `
                  <option value="${c.id}">${c.name}</option>
                `).join('')}
              </select>
            </div>

            <div class="p-2.5 bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl text-[10px] text-blue-700 dark:text-blue-300">
              <i class="fa-solid fa-cloud-arrow-up mr-1"></i> Dữ liệu phân công sẽ lưu cố định vào Cloud Firestore và tự động áp dụng khi bảo vệ nhận ca tuần tra.
            </div>

            <div class="pt-2 flex justify-end gap-2">
              <button type="button" onclick="document.getElementById('modal-manager-quick-assign').remove()" class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">Hủy</button>
              <button type="submit" id="btn-save-manager-assign" class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition">
                <i class="fa-solid fa-floppy-disk mr-1"></i> Lưu Phân Công
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('form-manager-quick-assign').onsubmit = async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('btn-save-manager-assign');
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang lưu...';

      const guardId = document.getElementById('modal-assign-guard').value;
      const selectedShift = document.getElementById('modal-assign-shift').value;
      const selectedCampusId = document.getElementById('modal-assign-campus').value;
      const selectedCampus = campusList.find(c => c.id === selectedCampusId);
      const guard = guards.find(g => g.id === guardId);

      try {
        await updateFirestoreUser(guardId, {
          fixedShiftName: selectedShift,
          currentShiftName: selectedShift,
          campusId: selectedCampusId,
          campusName: selectedCampus?.name || 'Trụ sở Cao Lỗ'
        });

        document.getElementById('modal-manager-quick-assign')?.remove();
        alert(`✅ Đã phân công thành công cho bảo vệ ${guard?.name || 'nhân viên'}:\n• Ca: ${selectedShift}\n• Cơ sở: ${selectedCampus?.name || 'Trụ sở Cao Lỗ'}`);
        this.render();
        if (window.renderRosterUI) window.renderRosterUI();
        if (window.renderStaffUI) window.renderStaffUI();
        if (window.renderHomeUI) window.renderHomeUI();
      } catch (err) {
        alert("Lỗi khi lưu Firestore: " + err.message);
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i> Lưu Phân Công';
      }
    };
  }
}

export const managerMobileModule = new ManagerMobileModule();
window.managerMobileModule = managerMobileModule;
window.renderManagerMobileUI = () => managerMobileModule.render();
