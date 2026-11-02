/**
 * NSG SMART GUARD - Patrol Module with Real Data & Google Maps Navigation
 */

import { storage } from "./storage.js";

class PatrolModule {
  constructor() {
    this.currentFilterZone = 'all';
    this.currentFilterFloor = 'all';
    this.currentFilterStatus = 'all';
    this.isOnline = navigator.onLine;
  }

  init() {
    this.bindNetworkListeners();
    this.bindFilterEvents();
    this.render();
  }

  bindNetworkListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.updateOfflineBanner();
    });
    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.updateOfflineBanner();
    });
  }

  updateOfflineBanner() {
    const banner = document.getElementById('offline-status-banner');
    if (!banner) return;
    if (!this.isOnline) {
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  }

  bindFilterEvents() {
    const zoneFilter = document.getElementById('patrol-filter-zone');
    const floorFilter = document.getElementById('patrol-filter-floor');
    const statusFilter = document.getElementById('patrol-filter-status');

    if (zoneFilter) {
      zoneFilter.addEventListener('change', (e) => {
        this.currentFilterZone = e.target.value;
        this.render();
      });
    }

    if (floorFilter) {
      floorFilter.addEventListener('change', (e) => {
        this.currentFilterFloor = e.target.value;
        this.render();
      });
    }

    if (statusFilter) {
      statusFilter.addEventListener('change', (e) => {
        this.currentFilterStatus = e.target.value;
        this.render();
      });
    }
  }

  getCheckpointStatus(checkpointId, logs) {
    // Current 24h shift starts at 06:00 (today or yesterday if currently < 6 AM) and ends at 06:00 next day
    const now = new Date();
    const shiftStart = new Date(now);
    if (now.getHours() < 6) {
      shiftStart.setDate(shiftStart.getDate() - 1);
    }
    shiftStart.setHours(6, 0, 0, 0);

    const shiftEnd = new Date(shiftStart);
    shiftEnd.setDate(shiftEnd.getDate() + 1);
    shiftEnd.setHours(6, 0, 0, 0);

    const recentLog = logs.find(log => {
      if (log.checkpointId !== checkpointId) return false;
      const logDate = new Date(log.scannedAt);
      return logDate >= shiftStart && logDate < shiftEnd;
    });

    return recentLog ? { checked: true, log: recentLog } : { checked: false, log: null };
  }

  render() {
    const checkpoints = storage.getCheckpoints();
    const patrolLogs = storage.getPatrolLogs();
    const activeShift = storage.getActiveShift();

    // Calculate progress
    let totalPoints = checkpoints.length;
    let checkedCount = 0;

    checkpoints.forEach(cp => {
      const status = this.getCheckpointStatus(cp.id, patrolLogs);
      if (status.checked) checkedCount++;
    });

    const percent = totalPoints > 0 ? Math.round((checkedCount / totalPoints) * 100) : 0;
    const remainingCount = totalPoints - checkedCount;

    // Update Progress Bars & Counters in UI
    const progressPercentEl = document.getElementById('patrol-progress-percent');
    const progressBarEl = document.getElementById('patrol-progress-bar');
    const checkedCountEl = document.getElementById('patrol-checked-count');
    const remainingCountEl = document.getElementById('patrol-remaining-count');
    const totalCountEl = document.getElementById('patrol-total-count');

    if (progressPercentEl) progressPercentEl.textContent = `${percent}%`;
    if (progressBarEl) progressBarEl.style.width = `${percent}%`;
    if (checkedCountEl) checkedCountEl.textContent = checkedCount;
    if (remainingCountEl) remainingCountEl.textContent = remainingCount;
    if (totalCountEl) totalCountEl.textContent = totalPoints;

    // Filter checkpoints
    let filtered = checkpoints.filter(cp => {
      if (this.currentFilterZone !== 'all' && (cp.zoneName || '') !== this.currentFilterZone) return false;
      if (this.currentFilterFloor !== 'all' && (cp.floor || '') !== this.currentFilterFloor) return false;

      const { checked } = this.getCheckpointStatus(cp.id, patrolLogs);
      if (this.currentFilterStatus === 'checked' && !checked) return false;
      if (this.currentFilterStatus === 'unchecked' && checked) return false;

      return true;
    });

    // Populate zone and floor dropdowns dynamically from real checkpoints
    const zoneFilter = document.getElementById('patrol-filter-zone');
    if (zoneFilter && zoneFilter.children.length <= 1) {
      const zones = [...new Set(checkpoints.map(c => c.zoneName).filter(Boolean))];
      zones.forEach(z => {
        const opt = document.createElement('option');
        opt.value = z;
        opt.textContent = z;
        zoneFilter.appendChild(opt);
      });
    }

    const floorFilter = document.getElementById('patrol-filter-floor');
    if (floorFilter && floorFilter.children.length <= 1) {
      const floors = [...new Set(checkpoints.map(c => c.floor).filter(Boolean))];
      floors.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f;
        opt.textContent = f;
        floorFilter.appendChild(opt);
      });
    }

    // Render Checkpoint List
    const listContainer = document.getElementById('patrol-checkpoints-list');
    if (listContainer) {
      if (checkpoints.length === 0) {
        listContainer.innerHTML = `
          <div class="py-12 px-4 text-center bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xs">
            <div class="w-16 h-16 rounded-full bg-blue-50 dark:bg-slate-700 text-blue-500 mx-auto flex items-center justify-center text-2xl mb-3">
              <i class="fa-solid fa-qrcode"></i>
            </div>
            <p class="font-bold text-slate-700 dark:text-slate-200 text-base">Chưa có điểm chốt tuần tra</p>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
              Quản trị viên vui lòng vào mục <strong>QR/GPS</strong> trên trang Quản Trị để thêm các chốt tuần tra thật của trường.
            </p>
          </div>
        `;
      } else if (filtered.length === 0) {
        listContainer.innerHTML = `
          <div class="py-8 text-center text-xs text-slate-400">
            Không tìm thấy chốt phù hợp với bộ lọc hiện tại.
          </div>
        `;
      } else {
        listContainer.innerHTML = filtered.map(cp => {
          const { checked, log } = this.getCheckpointStatus(cp.id, patrolLogs);
          const scanTime = log ? new Date(log.scannedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
          const gmapUrl = cp.lat && cp.lng ? `https://www.google.com/maps/dir/?api=1&destination=${cp.lat},${cp.lng}` : null;

          return `
            <div class="relative overflow-hidden bg-white dark:bg-slate-800/90 rounded-2xl p-4 border ${checked ? 'border-emerald-300 dark:border-emerald-800/70 shadow-sm' : 'border-slate-200/80 dark:border-slate-700 shadow-sm'} transition">
              <div class="absolute left-0 top-0 bottom-0 w-1.5 ${checked ? 'bg-emerald-500' : 'bg-amber-400'}"></div>

              <div class="flex items-start justify-between gap-3 pl-1">
                <div class="flex-1">
                  <div class="flex flex-wrap items-center gap-1.5 mb-1.5">
                    <span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${checked ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'}">
                      <i class="fa-solid ${checked ? 'fa-check-circle' : 'fa-clock'} mr-1"></i>
                      ${checked ? 'Đã kiểm tra' : 'Chưa kiểm tra'}
                    </span>
                    ${cp.floor ? `<span class="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300">${cp.floor}</span>` : ''}
                    ${cp.zoneName ? `<span class="px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">${cp.zoneName}</span>` : ''}
                  </div>

                  <h3 class="font-bold text-slate-800 dark:text-slate-100 text-sm leading-snug">
                    ${cp.name}
                  </h3>
                  ${cp.description ? `<p class="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">${cp.description}</p>` : ''}

                  <!-- Google Maps Direction link -->
                  <div class="mt-2 flex items-center gap-2">
                    ${gmapUrl ? `
                      <a href="${gmapUrl}" target="_blank" class="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 font-bold hover:underline">
                        <i class="fa-solid fa-diamond-turn-right text-xs"></i> Google Maps
                      </a>
                    ` : ''}
                    <span class="text-[10px] text-slate-400 font-mono">Bán kính: ≤${cp.allowedRadius || 50}m</span>
                  </div>

                  ${checked && log ? `
                    <div class="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <div class="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                        <i class="fa-regular fa-clock"></i> Lúc: <strong>${scanTime}</strong>
                      </div>
                      <div>
                        GPS: <span class="font-bold text-slate-700 dark:text-slate-300">${log.distanceMeters !== null ? log.distanceMeters + 'm' : 'OK'}</span>
                      </div>
                    </div>
                  ` : ''}
                </div>

                <div class="flex flex-col items-center gap-1.5 shrink-0 self-center">
                  <button 
                    onclick="window.scannerManager.openScanner('${cp.id}')"
                    class="w-11 h-11 rounded-2xl flex items-center justify-center transition shadow-sm ${checked ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20 active:scale-95'}"
                    title="${checked ? 'Quét lại' : 'Quét'}">
                    <i class="fa-solid ${checked ? 'fa-arrow-rotate-right' : 'fa-qrcode'} text-base"></i>
                  </button>
                  <span class="text-[10px] font-semibold text-slate-400">${checked ? 'Quét lại' : 'Quét'}</span>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    this.renderPatrolHistory(patrolLogs);
    this.updateOfflineBanner();
  }

  renderPatrolHistory(logs) {
    const historyContainer = document.getElementById('patrol-history-list');
    if (!historyContainer) return;

    if (!logs || logs.length === 0) {
      historyContainer.innerHTML = `
        <div class="py-6 text-center text-xs text-slate-400">
          Chưa có nhật ký tuần tra nào.
        </div>
      `;
      return;
    }

    const recentLogs = logs.slice(0, 10);
    historyContainer.innerHTML = recentLogs.map(item => {
      const timeStr = new Date(item.scannedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const isValid = item.gpsStatus === 'valid' || item.verificationStatus === 'verified_cloud';

      return `
        <div class="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-xs">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full ${isValid ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400' : 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'} flex items-center justify-center text-sm font-bold shrink-0">
              <i class="fa-solid ${isValid ? 'fa-check' : 'fa-exclamation'}"></i>
            </div>
            <div>
              <div class="font-bold text-xs text-slate-800 dark:text-slate-100">${item.checkpointName}</div>
              <div class="text-[11px] text-slate-500 dark:text-slate-400">${item.guardName}</div>
            </div>
          </div>
          <div class="text-right shrink-0">
            <div class="text-xs font-mono font-bold text-slate-700 dark:text-slate-200">${timeStr}</div>
            <div class="text-[10px] ${isValid ? 'text-emerald-600' : 'text-amber-600'} font-medium">
              ${item.distanceMeters !== null ? item.distanceMeters + 'm' : 'Hợp lệ'}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
}

export const patrolModule = new PatrolModule();
window.patrolModule = patrolModule;
window.renderPatrolUI = () => patrolModule.render();
