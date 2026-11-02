/**
 * NSG SMART GUARD - Main Application Controller with Real Firestore Authentication
 */

import { storage } from "./storage.js";
import { scannerManager } from "./qr-scanner.js";
import { patrolModule } from "./patrol.js";
import { incidentModule } from "./incident.js";
import { handoverModule } from "./handover.js";
import { managerMobileModule } from "./manager-mobile.js";
import { adminModule } from "./admin.js";
import { initRealtimeFirestoreSync, signInUserWithAuth, signOutUser, sendPasswordReset, SUPER_ADMIN_EMAIL } from "./firebase-config.js";

class AppController {
  constructor() {
    this.currentViewMode = storage.getViewMode();
    this.currentGuardTab = 'home';
    this.isDarkMode = localStorage.getItem('nsg_guard_theme') === 'dark';
  }

  async init() {
    this.applyTheme();
    this.bindEvents();
    this.registerServiceWorker();

    // Start Realtime Firestore listeners
    initRealtimeFirestoreSync();

    // Initialize submodules
    scannerManager.init();
    patrolModule.init();
    incidentModule.init();
    handoverModule.init();
    managerMobileModule.init();
    adminModule.init();

    // Check user authentication
    const currentUser = storage.getCurrentUser();
    if (!currentUser) {
      this.showLoginModal();
    } else {
      this.routeUserByRole(currentUser);
    }
  }

  showLoginModal() {
    const modal = document.getElementById('login-auth-modal');
    if (modal) {
      modal.classList.remove('hidden');
      document.body.classList.add('overflow-hidden');
    }
  }

  hideLoginModal() {
    const modal = document.getElementById('login-auth-modal');
    if (modal) {
      modal.classList.add('hidden');
      document.body.classList.remove('overflow-hidden');
    }
  }

  routeUserByRole(user) {
    this.hideLoginModal();
    const role = user.role || 'guard';
    const isSuper = user.email === SUPER_ADMIN_EMAIL || user.isSuperAdmin;

    if (isSuper || role === 'admin') {
      if (window.innerWidth >= 1024) {
        this.switchViewMode('desktop_admin');
      } else {
        this.switchViewMode('manager_mobile');
      }
    } else if (role === 'manager') {
      this.switchViewMode('manager_mobile');
    } else {
      // guard
      this.switchViewMode('guard_mobile');
      this.switchGuardTab('home');
    }

    this.renderHome();
    this.renderAccountTab();

    const userBadge = document.getElementById('header-user-badge');
    const userEmail = document.getElementById('header-user-email');
    if (userBadge && userEmail) {
      userBadge.classList.remove('hidden');
      userEmail.textContent = isSuper ? 'Super Admin' : (user.name || user.code || user.email);
      userBadge.title = `Đã đăng nhập: ${user.email} (${(user.role || 'guard').toUpperCase()})`;
    }
  }

  bindEvents() {
    // Mode Switcher buttons
    document.querySelectorAll('.view-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode');
        this.switchViewMode(mode);
      });
    });

    // Guard Bottom Navigation Tabs
    document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        this.switchGuardTab(tab);
      });
    });

    // Theme Toggle
    const themeBtn = document.getElementById('btn-toggle-theme');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => this.toggleTheme());
    }

    // Floating SOS
    const floatingSos = document.getElementById('btn-floating-incident');
    if (floatingSos) {
      floatingSos.addEventListener('click', () => {
        if (window.incidentModule) window.incidentModule.openIncidentModal();
      });
    }

    // Login Form Submit
    const loginForm = document.getElementById('form-login-auth');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const idInput = document.getElementById('login-identifier');
        const passInput = document.getElementById('login-password');
        const btnSubmit = document.getElementById('btn-submit-login');

        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang xác thực Firebase Auth...';

        const res = await signInUserWithAuth(idInput.value, passInput.value);
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<i class="fa-solid fa-right-to-bracket mr-1.5"></i> Đăng Nhập Hệ Thống';

        if (res.success) {
          const isSuper = res.user.email === SUPER_ADMIN_EMAIL || res.user.isSuperAdmin;
          alert(`Xin chào ${res.user.name}!\nVai trò: ${isSuper ? 'SUPER ADMIN (Tối cao)' : (res.user.role || 'Bảo vệ').toUpperCase()}`);
          this.routeUserByRole(res.user);
        } else {
          alert('❌ Đăng nhập không thành công:\n' + res.message);
        }
      });
    }

    // Logout Button
    const logoutBtn = document.getElementById('btn-account-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.logout());
    }

    const adminLogoutBtn = document.getElementById('btn-admin-logout');
    if (adminLogoutBtn) {
      adminLogoutBtn.addEventListener('click', () => this.logout());
    }
  }

  async logout() {
    if (confirm('Bạn có chắc chắn muốn đăng xuất khỏi hệ thống?')) {
      await signOutUser();
      location.reload();
    }
  }

  applyTheme() {
    if (this.isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    const themeIcon = document.getElementById('theme-toggle-icon');
    if (themeIcon) {
      themeIcon.className = this.isDarkMode ? 'fa-solid fa-sun text-amber-400' : 'fa-solid fa-moon text-slate-600';
    }
  }

  toggleTheme() {
    this.isDarkMode = !this.isDarkMode;
    localStorage.setItem('nsg_guard_theme', this.isDarkMode ? 'dark' : 'light');
    this.applyTheme();
  }

  switchViewMode(mode) {
    this.currentViewMode = mode;
    storage.setViewMode(mode);

    document.querySelectorAll('.view-mode-btn').forEach(btn => {
      const isTarget = btn.getAttribute('data-mode') === mode;
      btn.classList.toggle('bg-blue-600', isTarget);
      btn.classList.toggle('text-white', isTarget);
      btn.classList.toggle('shadow-sm', isTarget);
      btn.classList.toggle('text-slate-600', !isTarget);
      btn.classList.toggle('dark:text-slate-300', !isTarget);
    });

    const guardMobileView = document.getElementById('view-guard-mobile');
    const managerMobileView = document.getElementById('view-manager-mobile');
    const desktopAdminView = document.getElementById('view-desktop-admin');
    const bottomNav = document.getElementById('guard-bottom-nav');
    const floatingSos = document.getElementById('btn-floating-incident');

    if (guardMobileView) guardMobileView.classList.add('hidden');
    if (managerMobileView) managerMobileView.classList.add('hidden');
    if (desktopAdminView) desktopAdminView.classList.add('hidden');
    if (bottomNav) bottomNav.classList.add('hidden');
    if (floatingSos) floatingSos.classList.add('hidden');

    if (mode === 'guard_mobile') {
      if (guardMobileView) guardMobileView.classList.remove('hidden');
      if (bottomNav) bottomNav.classList.remove('hidden');
      if (floatingSos) floatingSos.classList.remove('hidden');
      this.renderHome();
      patrolModule.render();
    } else if (mode === 'manager_mobile') {
      if (managerMobileView) managerMobileView.classList.remove('hidden');
      managerMobileModule.render();
    } else if (mode === 'desktop_admin') {
      if (desktopAdminView) desktopAdminView.classList.remove('hidden');
      adminModule.switchModule(adminModule.currentModule || 'dashboard');
    }
  }

  switchGuardTab(tab) {
    this.currentGuardTab = tab;

    document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
      const isCurrent = btn.getAttribute('data-tab') === tab;
      btn.classList.toggle('text-blue-600', isCurrent);
      btn.classList.toggle('dark:text-blue-400', isCurrent);
      btn.classList.toggle('font-bold', isCurrent);
      btn.classList.toggle('text-slate-400', !isCurrent);
      btn.classList.toggle('dark:text-slate-500', !isCurrent);
    });

    const panes = {
      home: document.getElementById('tab-pane-home'),
      patrol: document.getElementById('tab-pane-patrol'),
      shifts: document.getElementById('tab-pane-shifts'),
      account: document.getElementById('tab-pane-account')
    };

    Object.keys(panes).forEach(key => {
      if (panes[key]) {
        if (key === tab) {
          panes[key].classList.remove('hidden');
        } else {
          panes[key].classList.add('hidden');
        }
      }
    });

    if (tab === 'home') this.renderHome();
    if (tab === 'patrol') patrolModule.render();
    if (tab === 'shifts') handoverModule.render();
    if (tab === 'account') this.renderAccountTab();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  renderHome() {
    const user = storage.getCurrentUser();
    if (!user) return;

    const checkpoints = storage.getCheckpoints();
    const patrolLogs = storage.getPatrolLogs();
    const fixedShiftName = user.fixedShiftName || user.currentShiftName || 'Ca Trực 24H (06:00 - 06:00 hôm sau)';
    const isOnDuty = user.status !== 'off_duty';

    const nameEl = document.getElementById('home-guard-name');
    const codeEl = document.getElementById('home-guard-code');
    const avatarEl = document.getElementById('home-guard-avatar');
    const campusEl = document.getElementById('home-campus-name');
    const shiftBadgeEl = document.getElementById('home-shift-badge');
    const shiftHoursEl = document.getElementById('home-shift-hours');
    const dutyStatusBadge = document.getElementById('home-duty-status-badge');

    if (nameEl) nameEl.textContent = user.name || 'Nhân viên bảo vệ';
    if (codeEl) codeEl.textContent = user.code || user.email || 'BV';
    if (avatarEl) avatarEl.src = user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150';
    if (campusEl) campusEl.textContent = user.campusName || 'Trường Cao đẳng Nam Sài Gòn';
    if (shiftBadgeEl) shiftBadgeEl.textContent = fixedShiftName;
    if (shiftHoursEl) {
      shiftHoursEl.textContent = '06:00 hôm nay - 06:00 sáng mai (Đổi ca 06:00)';
    }

    if (dutyStatusBadge) {
      dutyStatusBadge.className = "px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5";
      dutyStatusBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Đang trực ca 24/24H`;
    }

    // Progress for current 24-hour shift (06:00 today to 06:00 tomorrow)
    const now = new Date();
    const shiftStart = new Date(now);
    if (now.getHours() < 6) shiftStart.setDate(shiftStart.getDate() - 1);
    shiftStart.setHours(6, 0, 0, 0);

    const shiftEnd = new Date(shiftStart);
    shiftEnd.setDate(shiftEnd.getDate() + 1);
    shiftEnd.setHours(6, 0, 0, 0);

    let checkedCount = 0;
    checkpoints.forEach(cp => {
      const hasChecked = patrolLogs.some(log => {
        if (log.checkpointId !== cp.id) return false;
        const d = new Date(log.scannedAt);
        return d >= shiftStart && d < shiftEnd;
      });
      if (hasChecked) checkedCount++;
    });

    const totalPoints = checkpoints.length;
    const remainingCount = totalPoints - checkedCount;
    const progressPercent = totalPoints > 0 ? Math.round((checkedCount / totalPoints) * 100) : 0;

    const progPercentEl = document.getElementById('home-progress-percent');
    const progBarEl = document.getElementById('home-progress-bar');
    const checkedCountEl = document.getElementById('home-checked-count');
    const remainingCountEl = document.getElementById('home-remaining-count');
    const totalCountEl = document.getElementById('home-total-count');

    if (progPercentEl) progPercentEl.textContent = `${progressPercent}%`;
    if (progBarEl) progBarEl.style.width = `${progressPercent}%`;
    if (checkedCountEl) checkedCountEl.textContent = checkedCount;
    if (remainingCountEl) remainingCountEl.textContent = remainingCount;
    if (totalCountEl) totalCountEl.textContent = totalPoints;

    // Recent scans
    const recentListEl = document.getElementById('home-recent-scans-list');
    if (recentListEl) {
      const guardLogs = patrolLogs.slice(0, 4);
      if (guardLogs.length === 0) {
        recentListEl.innerHTML = `
          <div class="py-6 text-center text-xs text-slate-400">
            Chưa có lượt quét QR nào.
          </div>
        `;
      } else {
        recentListEl.innerHTML = guardLogs.map(item => {
          const time = new Date(item.scannedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
          const isValid = item.gpsStatus === 'valid' || item.verificationStatus === 'verified_cloud';

          return `
            <div class="flex items-center justify-between p-3 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl ${isValid ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400' : 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'} flex items-center justify-center font-bold text-sm shrink-0">
                  <i class="fa-solid ${isValid ? 'fa-qrcode' : 'fa-triangle-exclamation'}"></i>
                </div>
                <div>
                  <div class="font-bold text-xs text-slate-800 dark:text-slate-100 line-clamp-1">${item.checkpointName}</div>
                  <div class="text-[11px] text-slate-500 dark:text-slate-400">${item.zoneName || ''} • ${item.floor || ''}</div>
                </div>
              </div>
              <div class="text-right shrink-0">
                <div class="text-xs font-mono font-bold text-slate-700 dark:text-slate-200">${time}</div>
                <div class="text-[10px] ${isValid ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}">
                  ${item.distanceMeters !== null ? item.distanceMeters + 'm' : 'Hợp lệ'}
                </div>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  }

  renderAccountTab() {
    const user = storage.getCurrentUser();
    if (!user) return;

    const accName = document.getElementById('account-user-name');
    const accCode = document.getElementById('account-user-code');
    const accPhone = document.getElementById('account-user-phone');
    const accCampus = document.getElementById('account-user-campus');
    const accAvatar = document.getElementById('account-user-avatar');
    const accRole = document.getElementById('account-user-role-badge');

    if (accName) accName.textContent = user.name || 'Người dùng';
    if (accCode) accCode.textContent = `Mã: ${user.code || user.email || '—'}`;
    if (accPhone) accPhone.textContent = `SĐT: ${user.phone || 'Chưa cập nhật'}`;
    if (accCampus) accCampus.textContent = user.campusName || 'Cao Đẳng Nam Sài Gòn';
    if (accAvatar) accAvatar.src = user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150';
    if (accRole) accRole.textContent = `Vai trò: ${(user.role || 'guard').toUpperCase()}`;
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      });
    }
  }
}

export const appController = new AppController();
window.appController = appController;
window.renderHomeUI = () => appController.renderHome();
window.sendResetPasswordPrompt = () => {
  const emailInput = document.getElementById('login-identifier');
  const email = (emailInput?.value || '').trim() || SUPER_ADMIN_EMAIL;
  if (confirm(`Bạn có muốn gửi link khôi phục mật khẩu đến email: ${email}?`)) {
    sendPasswordReset(email);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  appController.init();
});
