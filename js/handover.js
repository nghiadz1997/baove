/**
 * NSG SMART GUARD - Fixed Shifts & Schedule Module (Lịch trực ca cố định)
 * Guard schedule with fixed 24-hour shifts (06:00 sáng hôm nay - 06:00 sáng mai).
 * Handover requirement is completely removed.
 */

import { storage } from "./storage.js";
import { DEFAULT_SHIFTS } from "./firebase-config.js";

class ShiftsScheduleModule {
  constructor() {}

  init() {
    this.render();
  }

  render() {
    const rawShifts = storage.getShifts();
    const shifts = rawShifts.length > 0 ? rawShifts : DEFAULT_SHIFTS;
    const user = storage.getCurrentUser();
    const allUsers = storage.getUsers();
    const guards = allUsers.filter(u => u.role === 'guard');

    const container = document.getElementById('shifts-card-container');
    if (!container) return;

    const userFixedShift = user?.fixedShiftName || user?.currentShiftName || 'Ca Trực 24H (06:00 - 06:00 hôm sau)';

    container.innerHTML = `
      <!-- User's Fixed Assignment Header Card -->
      <div class="bg-gradient-to-br from-blue-900 to-indigo-950 text-white rounded-3xl p-5 shadow-lg border border-blue-500/20 space-y-2">
        <div class="flex items-center justify-between">
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/30 text-blue-200 border border-blue-400/30 uppercase tracking-wider">
            CA PHÂN CÔNG CỦA BẠN
          </span>
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-white flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span> Đang trực 24/24H
          </span>
        </div>
        <h3 class="text-xl font-extrabold tracking-tight">${userFixedShift}</h3>
        <div class="text-xs text-blue-200 flex items-center justify-between pt-1">
          <span><i class="fa-solid fa-user-shield text-blue-400 mr-1"></i> ${user?.name || 'Nhân viên'} (${user?.code || 'BV'})</span>
          <span><i class="fa-solid fa-school text-rose-400 mr-1"></i> ${user?.campusName || 'Trụ sở Cao Lỗ'}</span>
        </div>
      </div>

      <!-- All Shifts List -->
      <div class="space-y-3 pt-1">
        <h4 class="font-bold text-xs uppercase tracking-wider text-slate-500 px-1">Danh mục ca trực 24/24H (Đổi ca: 06:00 sáng hàng ngày)</h4>
        ${shifts.map(shift => {
          const isUserShift = userFixedShift.includes(shift.name) || userFixedShift.includes(shift.code);
          const shiftGuards = guards.filter(g => (g.fixedShiftName || '').includes(shift.name) || (g.fixedShiftName || '').includes(shift.code));

          return `
            <div class="rounded-2xl p-4.5 border transition ${isUserShift ? 'bg-blue-50/80 dark:bg-slate-800 border-blue-500 dark:border-blue-500 shadow-sm' : 'bg-white dark:bg-slate-800 border-slate-200/80 dark:border-slate-700 shadow-xs'}">
              <div class="flex items-center justify-between mb-2">
                <span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${isUserShift ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'} font-mono">
                  ${shift.code}
                </span>
                <span class="text-xs font-bold text-slate-700 dark:text-slate-300">
                  <i class="fa-regular fa-clock text-blue-600 mr-1"></i> ${shift.startTime} - ${shift.endTime}
                </span>
              </div>

              <h4 class="font-bold text-base mb-1 text-slate-900 dark:text-white flex items-center gap-2">
                ${shift.name}
                ${isUserShift ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 font-extrabold">Ca của bạn</span>' : ''}
              </h4>

              <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Định mức an ninh: <strong>${shift.requiredPatrolRounds || 3} lượt tuần tra</strong> / ca trực.
              </p>

              <!-- Guards on this shift -->
              <div class="pt-2.5 border-t border-slate-100 dark:border-slate-700/60 text-xs">
                <span class="text-slate-400 block text-[11px] font-semibold mb-1.5">Lực lượng phân công ca này (${shiftGuards.length}):</span>
                <div class="flex flex-wrap gap-1.5">
                  ${shiftGuards.length === 0 ? '<span class="text-slate-400 italic">Chưa phân công bảo vệ</span>' : shiftGuards.map(g => `
                    <span class="inline-flex items-center gap-1 px-2 py-0.8 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-medium">
                      <i class="fa-solid fa-user-check text-[10px] text-emerald-500"></i> ${g.name}
                    </span>
                  `).join('')}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Also hide or clean up handover history container if present
    const historyContainer = document.getElementById('handover-history-list');
    if (historyContainer) {
      historyContainer.parentElement.style.display = 'none';
    }
  }

  selectActiveShift(shiftId) {
    const rawShifts = storage.getShifts();
    const shifts = rawShifts.length > 0 ? rawShifts : DEFAULT_SHIFTS;
    const target = shifts.find(s => s.id === shiftId);
    if (target) {
      storage.setActiveShift(target);
      this.render();
      if (window.renderHomeUI) window.renderHomeUI();
      if (window.renderPatrolUI) window.renderPatrolUI();
    }
  }
}

export const handoverModule = new ShiftsScheduleModule();
window.handoverModule = handoverModule;
window.renderShiftsUI = () => handoverModule.render();
