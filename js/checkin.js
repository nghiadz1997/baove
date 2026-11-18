/**
 * NSG SMART GUARD - NSG SMART CHECK-IN Module
 * QR Shift Check-in, Substitution / Swap Request, Active Duty Session Binding,
 * and Shift Check-out & Handover with Firestore Transactions.
 */

import { storage } from "./storage.js";
import {
  OFFICIAL_CAMPUSES,
  DEFAULT_SHIFTS,
  CHECKIN_TYPES,
  CHECKIN_STATUS_META,
  getTodayDateKey,
  getLogDateKey,
  isPatrolLogValid,
  parseSmartQrPayload,
  getActiveDutySessionForGuard,
  getGuardCurrentDutySession,
  isGuardScheduledForPostAndShift,
  createDutySessionWithTransaction,
  checkoutDutySessionWithTransaction
} from "./firebase-config.js";

class SmartCheckInModule {
  constructor() {}

  init() {
    this.bindEvents();
    this.renderGuardCheckInUI();
  }

  bindEvents() {
    const quickCheckinBtn = document.getElementById('btn-quick-checkin-shift');
    if (quickCheckinBtn) {
      quickCheckinBtn.addEventListener('click', () => {
        const user = storage.getCurrentUser();
        const activeSession = getActiveDutySessionForGuard(user?.id);
        if (activeSession) {
          this.startCheckOutFlow();
        } else {
          this.startCheckInFlow();
        }
      });
    }
  }

  /**
   * Render Guard Home Check-in Status Card & Patrol Session Banner
   */
  renderGuardCheckInUI() {
    const user = storage.getCurrentUser();
    if (!user) return;

    const activeSession = getActiveDutySessionForGuard(user.id);
    const currentSession = activeSession || getGuardCurrentDutySession(user.id);
    const settings = storage.getSettings();
    const todayKey = getTodayDateKey();
    const todayLogs = storage.getPatrolLogs().filter(l => getLogDateKey(l) === todayKey && isPatrolLogValid(l));
    const sessionScanCount = activeSession
      ? todayLogs.filter(l => l.dutySessionId === activeSession.id || (l.actualGuardId || l.guardId) === user.id).length
      : 0;

    // 1. Update Home Smart Check-in Card
    const cardEl = document.getElementById('home-smart-checkin-card');
    if (cardEl) {
      if (activeSession) {
        const ciTime = new Date(activeSession.checkInServerIso || activeSession.checkInTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const typeMeta = CHECKIN_TYPES[activeSession.checkInType] || CHECKIN_TYPES.scheduled;
        cardEl.innerHTML = `
          <div class="bg-emerald-50 dark:bg-emerald-950/40 rounded-3xl p-4 border-2 border-emerald-400/70 dark:border-emerald-700 shadow-xs space-y-3">
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center gap-2.5">
                <div class="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-lg shrink-0 shadow-sm">
                  <i class="fa-solid fa-user-check"></i>
                </div>
                <div>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">NSG SMART CHECK-IN</span>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${typeMeta.badgeClass}">${typeMeta.shortLabel}</span>
                  </div>
                  <h4 class="font-extrabold text-sm text-slate-900 dark:text-white leading-tight mt-0.5">Đã Nhận Ca Chính Thức</h4>
                </div>
              </div>
              <span class="text-xs font-mono font-extrabold text-emerald-700 dark:text-emerald-300 bg-white dark:bg-slate-800 px-2.5 py-1 rounded-xl border border-emerald-200 dark:border-emerald-800">
                ${ciTime}
              </span>
            </div>

            <div class="bg-white/90 dark:bg-slate-900/60 rounded-2xl p-3 text-xs space-y-1.5 border border-emerald-200/70 dark:border-emerald-800/60">
              <div class="flex justify-between gap-2">
                <span class="text-slate-500">Vị trí trực:</span>
                <strong class="text-slate-800 dark:text-slate-100 text-right">${activeSession.postName}</strong>
              </div>
              <div class="flex justify-between gap-2">
                <span class="text-slate-500">Cơ sở:</span>
                <strong class="text-blue-700 dark:text-blue-300 text-right">${activeSession.campusName}</strong>
              </div>
              <div class="flex justify-between gap-2">
                <span class="text-slate-500">Ca trực:</span>
                <strong class="text-slate-800 dark:text-slate-100 text-right">${activeSession.shiftName}</strong>
              </div>
              ${activeSession.isSubstitution ? `
                <div class="flex justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <span class="text-purple-600 font-bold">Phân công gốc:</span>
                  <strong class="text-purple-700 dark:text-purple-300 text-right">${activeSession.assignedGuardName}</strong>
                </div>
              ` : ''}
              <div class="flex justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                <span class="text-slate-500">Tuần tra trong phiên:</span>
                <strong class="text-emerald-600 font-mono">${sessionScanCount} lượt quét hợp lệ</strong>
              </div>
            </div>

            <button onclick="window.smartCheckInModule.startCheckOutFlow()" class="w-full py-3 rounded-2xl bg-slate-900 hover:bg-black dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-extrabold text-xs transition flex items-center justify-center gap-2 active:scale-[0.98] shadow-sm">
              <i class="fa-solid fa-right-from-bracket"></i> KẾT THÚC CA TRỰC
            </button>
          </div>
        `;
      } else if (currentSession && currentSession.checkInStatus === 'pending_approval') {
        const reqTime = new Date(currentSession.checkInServerIso || currentSession.checkInTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const typeMeta = CHECKIN_TYPES[currentSession.checkInType] || CHECKIN_TYPES.substitute;
        cardEl.innerHTML = `
          <div class="bg-amber-50 dark:bg-amber-950/40 rounded-3xl p-4 border-2 border-amber-400/80 dark:border-amber-700 shadow-xs space-y-2.5">
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center gap-2.5">
                <div class="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-lg shrink-0 animate-pulse">
                  <i class="fa-solid fa-hourglass-half"></i>
                </div>
                <div>
                  <span class="text-[10px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-300">ĐANG CHỜ QUẢN TRỊ VIÊN DUYỆT</span>
                  <h4 class="font-extrabold text-sm text-amber-900 dark:text-amber-100 leading-tight mt-0.5">${typeMeta.label}</h4>
                </div>
              </div>
              <span class="text-[11px] font-mono font-bold text-amber-800 bg-white px-2 py-0.5 rounded-lg">${reqTime}</span>
            </div>
            <div class="text-xs text-amber-800 dark:text-amber-200 bg-white/80 dark:bg-slate-900/50 p-3 rounded-2xl space-y-1">
              <div><strong>Vị trí:</strong> ${currentSession.postName} (${currentSession.campusName})</div>
              <div><strong>Người phân công gốc:</strong> ${currentSession.assignedGuardName || '—'}</div>
              <div><strong>Lý do:</strong> ${currentSession.changeReason || '—'}</div>
              <div class="text-[11px] text-rose-600 dark:text-rose-400 font-bold pt-1">
                <i class="fa-solid fa-circle-info mr-1"></i> Chưa được tính là nhận ca chính thức cho đến khi Quản trị viên phê duyệt.
              </div>
            </div>
          </div>
        `;
      } else if (currentSession && currentSession.checkInStatus === 'checked_out') {
        const coTime = currentSession.checkOutTime ? new Date(currentSession.checkOutTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--';
        cardEl.innerHTML = `
          <div class="bg-slate-100 dark:bg-slate-800 rounded-3xl p-4 border border-slate-300 dark:border-slate-700 space-y-2.5">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-xl bg-slate-600 text-white flex items-center justify-center"><i class="fa-solid fa-flag-checkered"></i></div>
                <div>
                  <div class="text-[10px] font-extrabold uppercase text-slate-500">ĐÃ KẾT THÚC CA HÔM NAY</div>
                  <div class="font-bold text-xs text-slate-800 dark:text-slate-100">Kết thúc lúc ${coTime} • Người ca sau có thể quét QR nhận ca</div>
                </div>
              </div>
            </div>
            <button onclick="window.smartCheckInModule.startCheckInFlow()" class="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition flex items-center justify-center gap-1.5">
              <i class="fa-solid fa-qrcode"></i> Quét QR Nhận Ca Mới (Nếu nhận kíp tiếp theo)
            </button>
          </div>
        `;
      } else {
        cardEl.innerHTML = `
          <div class="bg-gradient-to-r from-amber-50 to-rose-50 dark:from-amber-950/40 dark:to-rose-950/40 rounded-3xl p-4 border-2 border-amber-400/70 dark:border-amber-700 shadow-xs space-y-3">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-lg shrink-0 shadow-sm">
                <i class="fa-solid fa-id-badge"></i>
              </div>
              <div>
                <div class="text-[10px] font-extrabold uppercase tracking-wider text-rose-600 dark:text-rose-400">CHƯA XÁC NHẬN NHẬN CA HÔM NAY</div>
                <h4 class="font-extrabold text-sm text-slate-900 dark:text-white leading-tight mt-0.5">Bắt Buộc Quét QR Check-in Nhận Ca</h4>
                <p class="text-[11px] text-slate-600 dark:text-slate-300 mt-1">
                  ${settings.allowPatrolWithoutCheckIn
                    ? 'Đang bật chế độ ngoại lệ tuần tra, tuy nhiên bạn vẫn nên quét QR Check-in để ghi nhận đúng phiên trực.'
                    : 'Bạn cần quét mã QR tại vị trí trực để kích hoạt phiên trực trước khi thực hiện tuần tra QR chính thức.'}
                </p>
              </div>
            </div>
            <button onclick="window.smartCheckInModule.startCheckInFlow()" class="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md shadow-emerald-600/25 transition flex items-center justify-center gap-2 active:scale-[0.98]">
              <i class="fa-solid fa-qrcode text-sm"></i> XÁC NHẬN NHẬN CA NGAY (QUÉT QR CHECK-IN)
            </button>
          </div>
        `;
      }
    }

    // 2. Sync Quick Action Button (#btn-quick-checkin-shift)
    const quickBtn = document.getElementById('btn-quick-checkin-shift');
    if (quickBtn) {
      if (activeSession) {
        quickBtn.className = "p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs hover:bg-slate-200 transition flex items-center gap-2.5 active:scale-95 touch-target";
        quickBtn.innerHTML = `
          <div class="w-8 h-8 rounded-xl bg-slate-800 text-white flex items-center justify-center text-sm shrink-0">
            <i class="fa-solid fa-right-from-bracket"></i>
          </div>
          <div class="text-left">
            <div class="font-extrabold">Kết Thúc Ca</div>
            <div class="text-[10px] text-slate-500 font-normal">Bấm xác nhận kết thúc</div>
          </div>
        `;
      } else {
        quickBtn.className = "p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-bold text-xs hover:bg-emerald-100 transition flex items-center gap-2.5 active:scale-95 touch-target";
        quickBtn.innerHTML = `
          <div class="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-sm shrink-0">
            <i class="fa-solid fa-qrcode"></i>
          </div>
          <div class="text-left">
            <div class="font-extrabold text-emerald-800 dark:text-emerald-200">Xác Nhận Nhận Ca</div>
            <div class="text-[10px] text-emerald-600 font-normal">Quét QR Check-in</div>
          </div>
        `;
      }
    }

    // 3. Update Home Duty Status Badge
    const dutyBadge = document.getElementById('home-duty-status-badge');
    if (dutyBadge) {
      if (activeSession) {
        const typeMeta = CHECKIN_TYPES[activeSession.checkInType] || CHECKIN_TYPES.scheduled;
        dutyBadge.className = "px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5";
        dutyBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Đã nhận ca (${typeMeta.shortLabel})`;
      } else if (currentSession && currentSession.checkInStatus === 'pending_approval') {
        dutyBadge.className = "px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5";
        dutyBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span> Chờ duyệt trực thay`;
      } else {
        dutyBadge.className = "px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-200 border border-rose-500/30 flex items-center gap-1.5";
        dutyBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-rose-400"></span> Chưa nhận ca`;
      }
    }

    // 4. Update Patrol Tab Session Banner
    const patrolBanner = document.getElementById('patrol-duty-session-banner');
    if (patrolBanner) {
      if (activeSession) {
        patrolBanner.innerHTML = `
          <div class="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between gap-2 text-xs">
            <div class="flex items-center gap-2 min-w-0">
              <i class="fa-solid fa-shield-check text-emerald-600 text-base shrink-0"></i>
              <div class="min-w-0">
                <div class="font-extrabold text-emerald-800 dark:text-emerald-200 truncate">Phiên trực đang hoạt động: ${activeSession.postName}</div>
                <div class="text-[10px] text-emerald-700 dark:text-emerald-300 font-mono truncate">Người trực: ${activeSession.guardName}${activeSession.isSubstitution ? ` (Thay ${activeSession.assignedGuardName})` : ''}</div>
              </div>
            </div>
            <span class="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold shrink-0">Hợp lệ</span>
          </div>
        `;
      } else {
        const isPending = currentSession && currentSession.checkInStatus === 'pending_approval';
        patrolBanner.innerHTML = `
          <div class="p-3 rounded-2xl ${isPending ? 'bg-amber-50 border-amber-300 dark:bg-amber-950/40 dark:border-amber-800' : 'bg-rose-50 border-rose-300 dark:bg-rose-950/40 dark:border-rose-800'} border flex items-center justify-between gap-2 text-xs">
            <div class="min-w-0">
              <div class="font-extrabold ${isPending ? 'text-amber-800 dark:text-amber-200' : 'text-rose-800 dark:text-rose-200'}">
                <i class="fa-solid ${isPending ? 'fa-hourglass-half' : 'fa-triangle-exclamation'} mr-1"></i>
                ${isPending ? 'Yêu cầu trực thay đang chờ Quản trị viên duyệt' : 'Bạn chưa Xác Nhận Nhận Ca (QR Check-in)'}
              </div>
              <div class="text-[11px] ${isPending ? 'text-amber-700 dark:text-amber-300' : 'text-rose-700 dark:text-rose-300'}">
                ${settings.allowPatrolWithoutCheckIn ? 'Quản trị viên đang bật ngoại lệ cho phép quét tạm.' : 'Cần nhận ca chính thức trước khi ghi nhận hoàn thành tuần tra.'}
              </div>
            </div>
            ${!isPending ? `
              <button onclick="window.smartCheckInModule.startCheckInFlow()" class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shrink-0">
                Nhận ca ngay
              </button>
            ` : ''}
          </div>
        `;
      }
    }
  }

  /**
   * Step 1: Launch Camera Scanner in Check-in Mode (no manual guard-ID typing bypass!)
   */
  startCheckInFlow() {
    const user = storage.getCurrentUser();
    if (!user) {
      alert('Vui lòng đăng nhập bằng tài khoản bảo vệ cá nhân trước khi xác nhận nhận ca!');
      return;
    }

    const active = getActiveDutySessionForGuard(user.id);
    if (active) {
      if (confirm(`Bạn đang giữ phiên trực tại "${active.postName}" (Nhận lúc ${new Date(active.checkInTime).toLocaleTimeString('vi-VN')}).\n\nBạn có muốn Kết Thúc Ca Trực hiện tại không?`)) {
        this.startCheckOutFlow();
      }
      return;
    }

    const current = getGuardCurrentDutySession(user.id);
    if (current && current.checkInStatus === 'pending_approval') {
      alert(`Yêu cầu ${CHECKIN_TYPES[current.checkInType]?.label || 'trực thay'} tại "${current.postName}" của bạn đang CHỜ QUẢN TRỊ VIÊN PHÊ DUYỆT.\n\nVui lòng liên hệ Quản lý / BGH để duyệt yêu cầu.`);
      return;
    }

    if (window.scannerManager) {
      window.scannerManager.openScanner(null, 'checkin');
    } else {
      alert('Trình quét QR chưa sẵn sàng. Vui lòng tải lại trang.');
    }
  }

  /**
   * Step 2: Process scanned QR for Check-in & open confirmation / substitution modal
   */
  handleCheckInQrScanned(decodedText, gpsLocation) {
    const user = storage.getCurrentUser();
    if (!user) return { handled: false, message: 'Chưa đăng nhập tài khoản.' };

    const parsed = parseSmartQrPayload(decodedText);
    if (!parsed.valid) {
      return {
        handled: false,
        code: 'INVALID_QR',
        message: parsed.reason
      };
    }

    if (parsed.qrType === 'QR_CHECKOUT') {
      return {
        handled: false,
        code: 'WRONG_QR_TYPE',
        message: 'Đây là mã QR CHECK-OUT (Kết thúc ca). Vui lòng quét mã QR CHECK-IN hoặc mã chốt tại vị trí nhận ca!'
      };
    }

    // Close scanner and open Check-in Confirmation Modal
    if (window.scannerManager) {
      window.scannerManager.playSuccessSound();
      window.scannerManager.closeScanner();
    }

    this.openCheckInConfirmModal(user, parsed, gpsLocation);
    return { handled: true };
  }

  /**
   * Confirmation Modal after scanning Check-in QR:
   * - Auto detects schedule match vs substitution/swap/emergency
   * - Never allows changing guardId (always locked to authenticated user)
   */
  openCheckInConfirmModal(guard, parsedQr, gpsLocation) {
    document.getElementById('modal-smart-checkin-confirm')?.remove();

    const campuses = storage.getCampuses();
    const campusList = campuses.length > 0 ? campuses : OFFICIAL_CAMPUSES;
    const shifts = storage.getShifts();
    const shiftList = shifts.length > 0 ? shifts : DEFAULT_SHIFTS;
    const allGuards = storage.getUsers().filter(u => u.role === 'guard' && u.id !== guard.id);

    const workDate = getTodayDateKey();
    const defaultShiftName = guard.fixedShiftName || guard.currentShiftName || shiftList[0]?.name || 'Ca Trực 24H (06:00 - 06:00 hôm sau)';
    const matchedShift = shiftList.find(s => defaultShiftName.includes(s.name) || defaultShiftName.includes(s.code)) || shiftList[0];

    const scheduleCheck = isGuardScheduledForPostAndShift(guard, parsedQr.campusId, defaultShiftName, campusList);
    const defaultType = scheduleCheck.isExactScheduled ? 'scheduled' : 'substitute';

    const gpsText = gpsLocation && gpsLocation.lat
      ? `${Number(gpsLocation.lat).toFixed(6)}, ${Number(gpsLocation.lng).toFixed(6)} (±${Math.round(gpsLocation.accuracy || 0)}m)`
      : 'Không có tọa độ GPS (Chưa cấp quyền hoặc tín hiệu yếu)';

    const modalHtml = `
      <div id="modal-smart-checkin-confirm" class="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div class="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92vh] overflow-y-auto space-y-4">
          <div class="flex items-start justify-between gap-2">
            <div>
              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 uppercase">
                NSG SMART CHECK-IN • QR XÁC THỰC
              </span>
              <h3 class="font-extrabold text-base text-slate-900 dark:text-white mt-1">Xác Nhận Nhân Sự Nhận Ca</h3>
            </div>
            <button onclick="document.getElementById('modal-smart-checkin-confirm').remove()" class="text-slate-400 hover:text-slate-600 text-lg">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <!-- Verified QR & Guard Identity Summary -->
          <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
            <div class="flex justify-between gap-2">
              <span class="text-slate-500">Nhân sự thực tế:</span>
              <strong class="text-slate-900 dark:text-white">${guard.name} (${guard.code || guard.email})</strong>
            </div>
            <div class="flex justify-between gap-2">
              <span class="text-slate-500">Vị trí quét QR:</span>
              <strong class="text-blue-600 dark:text-blue-400 text-right">${parsedQr.postName}</strong>
            </div>
            <div class="flex justify-between gap-2">
              <span class="text-slate-500">Cơ sở:</span>
              <strong class="text-slate-800 dark:text-slate-200 text-right">${parsedQr.campusName}</strong>
            </div>
            <div class="flex justify-between gap-2">
              <span class="text-slate-500">Ngày trực:</span>
              <strong class="font-mono text-slate-800 dark:text-slate-200">${workDate.split('-').reverse().join('/')}</strong>
            </div>
            <div class="flex justify-between gap-2">
              <span class="text-slate-500">Mã QR đã quét:</span>
              <span class="font-mono font-bold text-[11px] text-emerald-700 dark:text-emerald-300">${parsedQr.rawQr}</span>
            </div>
            <div class="flex justify-between gap-2">
              <span class="text-slate-500">GPS hỗ trợ:</span>
              <span class="font-mono text-[10px] text-slate-600 dark:text-slate-300 text-right">${gpsText}</span>
            </div>
          </div>

          ${!scheduleCheck.isExactScheduled ? `
            <div class="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
              <i class="fa-solid fa-triangle-exclamation text-amber-600 mt-0.5 shrink-0"></i>
              <div>
                <strong>Phát hiện khác lịch phân công!</strong> Vị trí trực bạn vừa quét (${parsedQr.campusName}) khác cơ sở phân công cố định của bạn (${guard.campusName || 'Chưa gán'}). Vui lòng chọn hình thức <strong>Trực thay / Đổi vị trí / Đổi ca / Bổ sung</strong> để gửi Quản trị viên phê duyệt.
              </div>
            </div>
          ` : `
            <div class="p-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
              <i class="fa-solid fa-circle-check text-emerald-600 shrink-0"></i>
              <span>Khớp lịch phân công cố định của bạn! Bạn cũng có thể chuyển sang chế độ <strong>Trực thay / Đổi ca</strong> bên dưới nếu trực giúp đồng nghiệp.</span>
            </div>
          `}

          <form id="form-smart-checkin-confirm" class="space-y-3 text-xs">
            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Ca trực nhận nhiệm vụ *</label>
              <select id="ci-shift-select" class="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold" required>
                ${shiftList.map(s => `<option value="${s.id}" data-name="${s.name}" ${s.id === matchedShift?.id ? 'selected' : ''}>${s.name}</option>`).join('')}
              </select>
            </div>

            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Hình thức nhận ca *</label>
              <select id="ci-type-select" class="w-full px-3 py-2.5 rounded-xl border border-blue-300 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-950/30 font-bold text-slate-800 dark:text-slate-100" required>
                ${scheduleCheck.isExactScheduled ? `<option value="scheduled" ${defaultType === 'scheduled' ? 'selected' : ''}>🟢 Trực đúng lịch phân công (Kích hoạt ngay)</option>` : ''}
                <option value="substitute" ${defaultType === 'substitute' ? 'selected' : ''}>🟣 Trực thay đồng nghiệp (Cần phê duyệt)</option>
                <option value="swap_post">🔵 Đổi vị trí trực (Cần phê duyệt)</option>
                <option value="swap_shift">🔷 Đổi ca trực (Cần phê duyệt)</option>
                <option value="emergency_extra">🟠 Bổ sung nhân sự trực đột xuất (Cần phê duyệt)</option>
              </select>
            </div>

            <!-- Substitution / Change Extra Fields -->
            <div id="ci-substitution-fields" class="${defaultType === 'scheduled' ? 'hidden' : ''} space-y-3 p-3.5 rounded-2xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800">
              <div>
                <label class="block font-bold text-purple-900 dark:text-purple-200 mb-1">Người được phân công ban đầu (nếu trực thay / đổi ca)</label>
                <select id="ci-assigned-guard" class="w-full px-3 py-2 rounded-xl border border-purple-200 dark:border-purple-700 bg-white dark:bg-slate-800 font-bold">
                  <option value="">-- Chọn đồng nghiệp được phân công gốc --</option>
                  ${allGuards.map(g => `<option value="${g.id}" data-name="${g.name} (${g.code})">${g.name} (${g.code}) — ${g.campusName || 'Trụ sở chính'}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="block font-bold text-purple-900 dark:text-purple-200 mb-1">Lý do trực thay / thay đổi *</label>
                <textarea id="ci-change-reason" rows="2" placeholder="VD: Đồng nghiệp xin nghỉ phép đột xuất, đổi vị trí theo điều động tổ trưởng..." class="w-full px-3 py-2 rounded-xl border border-purple-200 dark:border-purple-700 bg-white dark:bg-slate-800"></textarea>
              </div>
              <div class="text-[10px] text-purple-700 dark:text-purple-300 leading-relaxed">
                <i class="fa-solid fa-lock mr-1"></i> Hệ thống <strong>KHÔNG</strong> sửa/xóa lịch phân công ban đầu. Yêu cầu sẽ ở trạng thái <strong>Chờ phê duyệt</strong> cho đến khi Quản trị viên xác nhận.
              </div>
            </div>

            <div class="pt-1 flex gap-2">
              <button type="button" onclick="document.getElementById('modal-smart-checkin-confirm').remove()" class="px-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                Hủy
              </button>
              <button type="submit" id="btn-submit-smart-checkin" class="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold shadow-md transition flex items-center justify-center gap-1.5">
                <i class="fa-solid fa-check-double"></i>
                <span id="btn-submit-smart-checkin-label">${defaultType === 'scheduled' ? 'Xác Nhận Nhận Ca Ngay' : 'Gửi Yêu Cầu Phê Duyệt Trực Thay'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const typeSelect = document.getElementById('ci-type-select');
    const subBox = document.getElementById('ci-substitution-fields');
    const submitLabel = document.getElementById('btn-submit-smart-checkin-label');
    const reasonInput = document.getElementById('ci-change-reason');

    const syncTypeUI = () => {
      const val = typeSelect.value;
      const isSub = val !== 'scheduled';
      subBox.classList.toggle('hidden', !isSub);
      reasonInput.required = isSub;
      submitLabel.textContent = isSub ? 'Gửi Yêu Cầu Phê Duyệt Trực Thay' : 'Xác Nhận Nhận Ca Ngay';
    };
    typeSelect.addEventListener('change', syncTypeUI);
    syncTypeUI();

    document.getElementById('form-smart-checkin-confirm').onsubmit = async (e) => {
      e.preventDefault();
      const shiftSelect = document.getElementById('ci-shift-select');
      const shiftId = shiftSelect.value;
      const shiftName = shiftSelect.options[shiftSelect.selectedIndex]?.getAttribute('data-name') || defaultShiftName;
      const checkInType = typeSelect.value;
      const isSub = checkInType !== 'scheduled';

      const assignedSelect = document.getElementById('ci-assigned-guard');
      const assignedGuardId = isSub ? (assignedSelect.value || '') : guard.id;
      const assignedGuardName = isSub
        ? (assignedSelect.options[assignedSelect.selectedIndex]?.getAttribute('data-name') || (checkInType === 'emergency_extra' ? 'Bổ sung đột xuất' : 'Không chỉ định'))
        : `${guard.name} (${guard.code})`;
      const changeReason = isSub ? reasonInput.value.trim() : '';

      if (isSub && checkInType === 'substitute' && !assignedGuardId) {
        alert('Vui lòng chọn tên đồng nghiệp được phân công ban đầu mà bạn đang trực thay!');
        return;
      }

      const submitBtn = document.getElementById('btn-submit-smart-checkin');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang lưu giao dịch Firestore...';

      try {
        const session = await createDutySessionWithTransaction({
          guard,
          parsedQr,
          shiftId,
          shiftName,
          workDate,
          location: gpsLocation,
          checkInType,
          assignedGuardId,
          assignedGuardName,
          changeReason
        });

        document.getElementById('modal-smart-checkin-confirm')?.remove();
        this.renderGuardCheckInUI();
        if (window.renderHomeUI) window.renderHomeUI();
        if (window.renderPatrolUI) window.renderPatrolUI();
        if (window.renderDashboardUI) window.renderDashboardUI();
        if (window.renderManagerMobileUI) window.renderManagerMobileUI();

        if (session.checkInStatus === 'active') {
          alert(`✅ XÁC NHẬN NHẬN CA THÀNH CÔNG!\n\nNhân sự: ${session.guardName}\nVị trí: ${session.postName}\nCa trực: ${session.shiftName}\nTrạng thái: Đã nhận ca chính thức\n\nPhiên trực đã kích hoạt — mọi lượt quét QR tuần tra sẽ tự động gắn vào phiên trực này!`);
        } else {
          alert(`⏳ ĐÃ GỬI YÊU CẦU ${CHECKIN_TYPES[checkInType]?.label?.toUpperCase() || 'TRỰC THAY'}!\n\nVị trí: ${session.postName}\nPhân công gốc: ${session.assignedGuardName}\nLý do: ${session.changeReason}\n\nYêu cầu đang CHỜ QUẢN TRỊ VIÊN PHÊ DUYỆT. Sau khi được duyệt, phiên trực của bạn sẽ tự động kích hoạt.`);
        }
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i class="fa-solid fa-check-double"></i> <span>${isSub ? 'Gửi Yêu Cầu Phê Duyệt Trực Thay' : 'Xác Nhận Nhận Ca Ngay'}</span>`;
        alert('❌ Không thể xác nhận nhận ca:\n' + err.message);
      }
    };
  }

  /**
   * Step 3: Direct 1-Tap End Shift Flow (No QR Check-out scan & no handover form required!)
   * Once ended, the next guard simply scans QR Check-in to start their own shift.
   */
  startCheckOutFlow() {
    const user = storage.getCurrentUser();
    if (!user) return;
    const active = getActiveDutySessionForGuard(user.id);
    if (!active) {
      alert('Bạn không có phiên trực nào đang hoạt động để kết thúc ca!');
      return;
    }

    const currentLoc = window.scannerManager?.currentLocation || null;
    this.openSimpleEndShiftModal(user, active, currentLoc);
  }

  /**
   * Backward-compatible handler if a legacy QR Check-out is ever scanned
   */
  handleCheckOutQrScanned(decodedText, gpsLocation) {
    const user = storage.getCurrentUser();
    if (!user) return { handled: false, message: 'Chưa đăng nhập tài khoản.' };

    const activeSession = getActiveDutySessionForGuard(user.id);
    if (!activeSession) {
      return {
        handled: false,
        code: 'NO_ACTIVE_SESSION',
        message: 'Không tìm thấy phiên trực đang hoạt động (hoặc phiên trực đã được kết thúc trước đó).'
      };
    }

    if (window.scannerManager) {
      window.scannerManager.playSuccessSound();
      window.scannerManager.closeScanner();
    }

    this.openSimpleEndShiftModal(user, activeSession, gpsLocation);
    return { handled: true };
  }

  /**
   * Simple 1-Step End Shift Confirmation Modal (No QR scan, no handover recipient needed)
   */
  openSimpleEndShiftModal(guard, activeSession, gpsLocation = null) {
    document.getElementById('modal-smart-checkout-handover')?.remove();

    const sessionPatrolCount = storage.getPatrolLogs().filter(l =>
      l.dutySessionId === activeSession.id || (getLogDateKey(l) === activeSession.workDate && (l.actualGuardId || l.guardId) === guard.id && isPatrolLogValid(l))
    ).length;

    const modalHtml = `
      <div id="modal-smart-checkout-handover" class="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div class="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92vh] overflow-y-auto space-y-4">
          <div class="flex items-start justify-between">
            <div>
              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200 uppercase">
                NSG SMART CHECK-IN
              </span>
              <h3 class="font-extrabold text-base text-slate-900 dark:text-white mt-1">Xác Nhận Kết Thúc Ca Trực</h3>
            </div>
            <button onclick="document.getElementById('modal-smart-checkout-handover').remove()" class="text-slate-400 hover:text-slate-600 text-lg">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
            <div class="flex justify-between">
              <span class="text-slate-500">Nhân sự trực:</span>
              <strong class="text-slate-900 dark:text-white">${activeSession.guardName}</strong>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">Vị trí trực:</span>
              <strong class="text-blue-600">${activeSession.postName}</strong>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">Ca trực:</span>
              <strong class="text-slate-800 dark:text-slate-200">${activeSession.shiftName}</strong>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">Giờ nhận ca:</span>
              <strong class="font-mono">${new Date(activeSession.checkInServerIso || activeSession.checkInTime).toLocaleTimeString('vi-VN')}</strong>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">Tuần tra hoàn thành:</span>
              <strong class="text-emerald-600 font-mono">${sessionPatrolCount} lượt quét</strong>
            </div>
          </div>

          <form id="form-smart-checkout-handover" class="space-y-3 text-xs">
            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Ghi chú kết thúc ca (Không bắt buộc)</label>
              <input type="text" id="co-handover-notes" placeholder="VD: Ca trực bình thường, không có sự cố..." class="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800">
            </div>

            <div class="text-[11px] text-slate-500 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-2.5 rounded-xl">
              <i class="fa-solid fa-circle-info text-blue-600 mr-1"></i>
              Sau khi bạn bấm <strong>Kết Thúc Ca</strong>, phiên trực sẽ tự động đóng và nhân viên ca tiếp theo chỉ cần quét mã QR Check-in để vào ca.
            </div>

            <div class="pt-1 flex gap-2">
              <button type="button" onclick="document.getElementById('modal-smart-checkout-handover').remove()" class="px-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                Hủy
              </button>
              <button type="submit" id="btn-submit-smart-checkout" class="flex-1 py-3 rounded-2xl bg-slate-900 hover:bg-black text-white font-extrabold shadow-md transition flex items-center justify-center gap-1.5">
                <i class="fa-solid fa-flag-checkered"></i> Xác Nhận Kết Thúc Ca
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('form-smart-checkout-handover').onsubmit = async (e) => {
      e.preventDefault();
      const handoverNotes = document.getElementById('co-handover-notes')?.value?.trim() || 'Ca trực hoàn thành an toàn';

      const btn = document.getElementById('btn-submit-smart-checkout');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang kết thúc ca...';

      try {
        const ended = await checkoutDutySessionWithTransaction(activeSession.id, {
          guard,
          checkOutQrCode: 'DIRECT_END_SHIFT',
          handoverToGuardId: '',
          handoverToGuardName: '',
          handoverNotes,
          incidentSummary: '',
          location: gpsLocation
        });

        document.getElementById('modal-smart-checkout-handover')?.remove();
        this.renderGuardCheckInUI();
        if (window.renderHomeUI) window.renderHomeUI();
        if (window.renderPatrolUI) window.renderPatrolUI();
        if (window.renderDashboardUI) window.renderDashboardUI();
        if (window.renderManagerMobileUI) window.renderManagerMobileUI();

        alert(`✅ ĐÃ KẾT THÚC CA TRỰC THÀNH CÔNG!\n\nNhân sự: ${ended.guardName}\nGiờ kết thúc: ${new Date(ended.checkOutTime).toLocaleTimeString('vi-VN')}\n\nNhân viên ca tiếp theo có thể quét mã QR Check-in để nhận ca mới.`);
      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-flag-checkered"></i> Xác Nhận Kết Thúc Ca';
        alert('❌ Không thể kết thúc ca:\n' + err.message);
      }
    };
  }
}

export const smartCheckInModule = new SmartCheckInModule();
window.smartCheckInModule = smartCheckInModule;
