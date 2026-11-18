/**
 * NSG SMART GUARD - Guard Today's Duty Schedule Module (Lịch trực hôm nay)
 * Shows ONLY the guard's own shift card and colleagues currently ON DUTY on the SAME DAY.
 * All off-duty staff, checked-out staff, other shifts, and admin details are strictly hidden.
 */

import { storage } from "./storage.js";
import {
  getTodayDateKey,
  getYesterdayDateKey,
  getActiveDutySessionForGuard,
  CHECKIN_TYPES
} from "./firebase-config.js";

class ShiftsScheduleModule {
  constructor() {}

  init() {
    this.render();
  }

  /**
   * Build list of guards currently ON DUTY on the same day (todayKey)
   * Strictly excludes off_duty, checked_out, pending_approval, rejected, and non-guard/admin accounts.
   */
  getOnDutySameDayGuards(todayKey) {
    const allUsers = storage.getUsers();
    const guards = allUsers.filter(u => u.role === 'guard');
    const sessions = storage.getDutySessions();
    const yesterdayKey = getYesterdayDateKey();
    const currentHour = new Date().getHours();

    // Active Smart Check-in sessions valid for today (including ongoing 24H shift started yesterday before 06:00)
    const activeSessionsByGuard = new Map();
    const checkedOutTodayGuardIds = new Set();

    sessions.forEach(s => {
      const isSameShiftDay = s.workDate === todayKey || (currentHour < 6 && s.workDate === yesterdayKey);
      if (!isSameShiftDay) return;

      if (s.checkInStatus === 'active') {
        if (!activeSessionsByGuard.has(s.guardId)) {
          activeSessionsByGuard.set(s.guardId, s);
        }
      } else if (s.checkInStatus === 'checked_out' && s.workDate === todayKey) {
        checkedOutTodayGuardIds.add(s.guardId);
      }
    });

    const onDutyList = [];
    const includedIds = new Set();

    // 1. Everyone with an ACTIVE confirmed Check-in session today
    activeSessionsByGuard.forEach((session, guardId) => {
      const u = guards.find(g => g.id === guardId);
      includedIds.add(guardId);
      onDutyList.push({
        id: guardId,
        name: u?.name || session.guardName,
        code: u?.code || session.guardCode || '',
        avatar: u?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        phone: u?.phone || '',
        postName: session.postName || session.campusName || u?.campusName || 'Trụ sở chính - Số 47 Cao Lỗ',
        campusName: session.campusName || u?.campusName || 'Trụ sở chính - Số 47 Cao Lỗ',
        shiftName: session.shiftName || u?.fixedShiftName || 'Ca Trực 24H (06:00 - 06:00 hôm sau)',
        checkInTime: session.checkInServerIso || session.checkInTime || null,
        isSubstitution: Boolean(session.isSubstitution),
        checkInType: session.checkInType || 'scheduled',
        checkedInViaQr: true
      });
    });

    // 2. Guards with live status === 'on_duty' who have NOT ended their shift today
    guards.forEach(g => {
      if (includedIds.has(g.id)) return;
      if (g.status !== 'on_duty') return;
      if (checkedOutTodayGuardIds.has(g.id)) return;

      includedIds.add(g.id);
      onDutyList.push({
        id: g.id,
        name: g.name,
        code: g.code || '',
        avatar: g.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        phone: g.phone || '',
        postName: g.campusName || 'Trụ sở chính - Số 47 Cao Lỗ',
        campusName: g.campusName || 'Trụ sở chính - Số 47 Cao Lỗ',
        shiftName: g.fixedShiftName || g.currentShiftName || 'Ca Trực 24H (06:00 - 06:00 hôm sau)',
        checkInTime: null,
        isSubstitution: false,
        checkInType: 'scheduled',
        checkedInViaQr: false
      });
    });

    return onDutyList;
  }

  render() {
    const user = storage.getCurrentUser();
    const container = document.getElementById('shifts-card-container');
    if (!container) return;

    const todayKey = getTodayDateKey();
    const displayDateVN = todayKey.split('-').reverse().join('/');
    const userActiveSession = user ? getActiveDutySessionForGuard(user.id) : null;
    const userShift = userActiveSession?.shiftName || user?.fixedShiftName || user?.currentShiftName || 'Ca Trực 24H (06:00 - 06:00 hôm sau)';
    const userPost = userActiveSession?.postName || user?.campusName || 'Trụ sở chính - Số 47 Cao Lỗ';
    const isUserOnDuty = Boolean(userActiveSession) || user?.status === 'on_duty';

    const sameDayOnDuty = this.getOnDutySameDayGuards(todayKey);

    // Sort so current user appears first if on duty, followed by teammates
    sameDayOnDuty.sort((a, b) => {
      if (a.id === user?.id) return -1;
      if (b.id === user?.id) return 1;
      return (a.name || '').localeCompare(b.name || '', 'vi');
    });

    container.innerHTML = `
      <!-- Guard's Own Today Card -->
      <div class="bg-gradient-to-br from-blue-900 to-indigo-950 text-white rounded-3xl p-5 shadow-lg border border-blue-500/20 space-y-2">
        <div class="flex items-center justify-between gap-2">
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/30 text-blue-200 border border-blue-400/30 uppercase tracking-wider">
            CA TRỰC HÔM NAY (${displayDateVN})
          </span>
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${isUserOnDuty ? 'bg-emerald-500 text-white' : 'bg-slate-600 text-slate-200'} flex items-center gap-1">
            ${isUserOnDuty ? '<span class="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span> Đang trực' : 'Chưa vào ca'}
          </span>
        </div>
        <h3 class="text-lg font-extrabold tracking-tight">${userShift}</h3>
        <div class="text-xs text-blue-200 flex items-center justify-between flex-wrap gap-1 pt-1">
          <span><i class="fa-solid fa-user-shield text-blue-400 mr-1"></i> ${user?.name || 'Nhân viên'} (${user?.code || 'BV'})</span>
          <span><i class="fa-solid fa-location-dot text-rose-400 mr-1"></i> ${userPost}</span>
        </div>
      </div>

      <!-- ONLY Guards Currently On Duty on the Same Day (Everyone Else Strictly Hidden) -->
      <div class="space-y-2.5 pt-1">
        <div class="flex items-center justify-between px-1">
          <h4 class="font-bold text-xs uppercase tracking-wider text-slate-500">
            Đang trực cùng ngày ${displayDateVN} (${sameDayOnDuty.length})
          </h4>
        </div>

        ${sameDayOnDuty.length === 0 ? `
          <div class="py-8 px-4 text-center bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs text-slate-400 space-y-1.5">
            <i class="fa-solid fa-user-clock text-2xl text-slate-300 block"></i>
            <div class="font-bold text-slate-600 dark:text-slate-300">Chưa có nhân sự nào đang trực hôm nay.</div>
            <div>Khi bạn và đồng nghiệp quét QR Check-in nhận ca sẽ hiển thị tại đây.</div>
          </div>
        ` : sameDayOnDuty.map(g => {
          const isMe = g.id === user?.id;
          const ciStr = g.checkInTime
            ? new Date(g.checkInTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
            : null;
          const subBadge = g.isSubstitution
            ? `<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-100 text-purple-700">${CHECKIN_TYPES[g.checkInType]?.shortLabel || 'Trực thay'}</span>`
            : '';

          return `
            <div class="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border ${isMe ? 'border-blue-400 dark:border-blue-600 ring-1 ring-blue-400/30' : 'border-emerald-200/80 dark:border-emerald-800/60'} shadow-xs flex items-center justify-between gap-3">
              <div class="flex items-center gap-3 min-w-0">
                <div class="relative shrink-0">
                  <img src="${g.avatar}" alt="${g.name}" class="w-11 h-11 rounded-full object-cover border-2 border-emerald-500">
                  <span class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-800"></span>
                </div>
                <div class="min-w-0">
                  <div class="font-bold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1.5 flex-wrap">
                    <span class="truncate">${g.name}</span>
                    ${g.code ? `<span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">${g.code}</span>` : ''}
                    ${isMe ? '<span class="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-blue-600 text-white">Bạn</span>' : ''}
                    ${subBadge}
                  </div>
                  <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    <i class="fa-solid fa-location-dot text-rose-400 mr-1 text-[10px]"></i>${g.postName}
                  </div>
                  <div class="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                    ${ciStr ? `Nhận ca lúc ${ciStr}` : g.shiftName}
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-1.5 shrink-0">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">
                  Đang trực
                </span>
                ${!isMe && g.phone ? `
                  <a href="tel:${g.phone}" class="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 flex items-center justify-center hover:bg-emerald-100 transition" title="Gọi đồng nghiệp">
                    <i class="fa-solid fa-phone text-xs"></i>
                  </a>
                ` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }
}

export const handoverModule = new ShiftsScheduleModule();
window.handoverModule = handoverModule;
window.renderShiftsUI = () => handoverModule.render();
