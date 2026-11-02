/**
 * NSG SMART GUARD - Mobile Incident Report Module (Báo Cáo Sự Cố)
 * Simple one-hand mobile form: Category, quick text presets, camera photo capture,
 * auto GPS coordinates, and status tracking.
 */

import { storage } from "./storage.js";
import { isFirebaseOnline, db, COLLECTIONS } from "./firebase-config.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

class IncidentModule {
  constructor() {
    this.capturedPhotoBase64 = null;
    this.currentIncidentFilter = 'all';
  }

  init() {
    this.bindEvents();
    this.renderIncidentFeed();
  }

  bindEvents() {
    // Open Incident Form Modal
    const openBtn = document.getElementById('btn-open-incident-form');
    if (openBtn) {
      openBtn.addEventListener('click', () => this.openIncidentModal());
    }

    const cancelBtn = document.getElementById('btn-close-incident-modal');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.closeIncidentModal());
    }

    // Photo input capture
    const photoInput = document.getElementById('incident-photo-input');
    if (photoInput) {
      photoInput.addEventListener('change', (e) => this.handlePhotoCapture(e));
    }

    // Remove photo preview
    const removePhotoBtn = document.getElementById('btn-remove-incident-photo');
    if (removePhotoBtn) {
      removePhotoBtn.addEventListener('click', () => this.clearPhoto());
    }

    // Quick text presets
    document.querySelectorAll('.incident-quick-preset').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const text = btn.getAttribute('data-preset-text');
        const descInput = document.getElementById('incident-desc');
        if (descInput) {
          descInput.value = descInput.value ? `${descInput.value}. ${text}` : text;
        }
      });
    });

    // Form submit
    const form = document.getElementById('incident-report-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.submitIncident();
      });
    }

    // Filter incident list
    const filterTabs = document.querySelectorAll('.incident-filter-tab');
    filterTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        filterTabs.forEach(t => t.classList.remove('active', 'bg-blue-600', 'text-white'));
        tab.classList.add('active', 'bg-blue-600', 'text-white');
        this.currentIncidentFilter = tab.getAttribute('data-filter') || 'all';
        this.renderIncidentFeed();
      });
    });
  }

  openIncidentModal(preselectedCheckpoint = null) {
    const modal = document.getElementById('incident-form-modal');
    if (!modal) return;

    // Populate checkpoint dropdown
    const cpSelect = document.getElementById('incident-checkpoint');
    if (cpSelect) {
      const checkpoints = storage.getCheckpoints();
      cpSelect.innerHTML = `<option value="">-- Chọn điểm hoặc khu vực liên quan --</option>` +
        checkpoints.map(c => `
          <option value="${c.id}" ${preselectedCheckpoint && preselectedCheckpoint.id === c.id ? 'selected' : ''}>
            ${c.name} (${c.zoneName} - ${c.floor})
          </option>
        `).join('');
    }

    // Stamp current GPS
    const gpsInfoEl = document.getElementById('incident-gps-display');
    if (gpsInfoEl && window.scannerManager?.currentLocation) {
      const loc = window.scannerManager.currentLocation;
      gpsInfoEl.innerHTML = `
        <i class="fa-solid fa-location-crosshairs text-emerald-500 mr-1"></i>
        <span>Tọa độ GPS: <strong>${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}</strong> (±${Math.round(loc.accuracy)}m)</span>
      `;
    }

    this.clearPhoto();
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }

  closeIncidentModal() {
    const modal = document.getElementById('incident-form-modal');
    if (modal) modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }

  handlePhotoCapture(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Compress & convert to Base64 to save offline & firestore
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1000;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = scaleSize < 1 ? MAX_WIDTH : img.width;
        canvas.height = scaleSize < 1 ? img.height * scaleSize : img.height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        this.capturedPhotoBase64 = canvas.toDataURL('image/jpeg', 0.75);

        // Preview in UI
        const previewEl = document.getElementById('incident-photo-preview');
        const previewImg = document.getElementById('incident-preview-img');
        const uploadPlaceholder = document.getElementById('incident-upload-placeholder');

        if (previewEl && previewImg) {
          previewImg.src = this.capturedPhotoBase64;
          previewEl.classList.remove('hidden');
          if (uploadPlaceholder) uploadPlaceholder.classList.add('hidden');
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  clearPhoto() {
    this.capturedPhotoBase64 = null;
    const photoInput = document.getElementById('incident-photo-input');
    if (photoInput) photoInput.value = '';

    const previewEl = document.getElementById('incident-photo-preview');
    const uploadPlaceholder = document.getElementById('incident-upload-placeholder');
    if (previewEl) previewEl.classList.add('hidden');
    if (uploadPlaceholder) uploadPlaceholder.classList.remove('hidden');
  }

  async submitIncident() {
    const typeSelect = document.getElementById('incident-type');
    const titleInput = document.getElementById('incident-title');
    const descInput = document.getElementById('incident-desc');
    const urgencySelect = document.getElementById('incident-urgency');
    const cpSelect = document.getElementById('incident-checkpoint');

    const currentUser = storage.getCurrentUser();
    const checkpoints = storage.getCheckpoints();
    const selectedCp = checkpoints.find(c => c.id === cpSelect.value);

    const now = new Date();
    const incidentData = {
      id: 'inc-' + Date.now(),
      code: `SC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`,
      type: typeSelect.value,
      title: titleInput.value.trim() || 'Sự cố ghi nhận tại ' + (selectedCp?.name || 'khuôn viên trường'),
      description: descInput.value.trim(),
      campusId: selectedCp ? selectedCp.campusId : currentUser.campusId,
      campusName: selectedCp ? selectedCp.campusName : currentUser.campusName,
      zoneName: selectedCp ? selectedCp.zoneName : 'Chưa phân loại',
      checkpointId: selectedCp ? selectedCp.id : null,
      checkpointName: selectedCp ? selectedCp.name : 'Vị trí tuần tra',
      reportedBy: `${currentUser.name} (${currentUser.code})`,
      reportedAt: now.toISOString(),
      urgency: urgencySelect.value,
      status: 'pending', // pending | in_progress | resolved
      imageUrl: this.capturedPhotoBase64 || '',
      notes: ''
    };

    // Save locally
    storage.addIncident(incidentData);

    // Sync to Firestore
    if (isFirebaseOnline && db) {
      try {
        await addDoc(collection(db, COLLECTIONS.INCIDENTS), {
          ...incidentData,
          createdAt: serverTimestamp()
        });
      } catch (err) {
        console.warn('Firestore incident sync error:', err);
      }
    }

    // Feedback
    if (window.scannerManager) window.scannerManager.playSuccessSound();
    alert(`✅ Đã gửi báo cáo sự cố thành công!\nMã sự cố: ${incidentData.code}\nBan Quản lý và Đội trưởng đã nhận được thông báo.`);

    this.closeIncidentModal();
    this.renderIncidentFeed();
    if (window.renderHomeUI) window.renderHomeUI();
  }

  renderIncidentFeed() {
    const container = document.getElementById('incidents-feed-list');
    if (!container) return;

    let incidents = storage.getIncidents();

    if (this.currentIncidentFilter !== 'all') {
      incidents = incidents.filter(x => x.status === this.currentIncidentFilter);
    }

    if (incidents.length === 0) {
      container.innerHTML = `
        <div class="py-12 text-center">
          <div class="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 mx-auto flex items-center justify-center text-xl mb-2.5">
            <i class="fa-solid fa-shield-heart"></i>
          </div>
          <p class="font-bold text-slate-700 dark:text-slate-200 text-sm">Không có sự cố nào</p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Khu vực an ninh trật tự ổn định.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = incidents.map(item => {
      const timeStr = new Date(item.reportedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      const dateStr = new Date(item.reportedAt).toLocaleDateString('vi-VN');

      let urgencyBadge = '';
      if (item.urgency === 'critical') {
        urgencyBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-600 text-white animate-pulse">KHẨN CẤP</span>';
      } else if (item.urgency === 'high') {
        urgencyBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white">ƯU TIÊN CAO</span>';
      }

      let statusBadge = '';
      if (item.status === 'resolved') {
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300">Đã giải quyết</span>';
      } else if (item.status === 'in_progress') {
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300">Đang xử lý</span>';
      } else {
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300">Chờ tiếp nhận</span>';
      }

      return `
        <div class="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-700 shadow-xs flex flex-col gap-2.5">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">${item.code}</span>
              ${urgencyBadge}
            </div>
            ${statusBadge}
          </div>

          <div>
            <h4 class="font-bold text-slate-800 dark:text-slate-100 text-sm leading-snug">${item.title}</h4>
            <p class="text-xs text-slate-600 dark:text-slate-300 mt-1">${item.description}</p>
          </div>

          ${item.imageUrl ? `
            <div class="relative rounded-xl overflow-hidden max-h-48 border border-slate-200 dark:border-slate-700">
              <img src="${item.imageUrl}" alt="Ảnh minh chứng" class="w-full h-40 object-cover cursor-pointer hover:scale-105 transition duration-300" onclick="window.viewImagePreview('${item.imageUrl}')">
              <div class="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] backdrop-blur-xs">
                <i class="fa-solid fa-camera mr-1"></i> Ảnh hiện trường
              </div>
            </div>
          ` : ''}

          <div class="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <div>
              <i class="fa-solid fa-user-shield mr-1"></i> ${item.reportedBy}
            </div>
            <div>
              <i class="fa-regular fa-clock mr-1"></i> ${timeStr} • ${dateStr}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
}

export const incidentModule = new IncidentModule();
window.incidentModule = incidentModule;
window.openIncidentModalWithCheckpoint = (cp) => incidentModule.openIncidentModal(cp);
window.viewImagePreview = (src) => {
  const modal = document.getElementById('image-viewer-modal');
  const img = document.getElementById('image-viewer-img');
  if (modal && img) {
    img.src = src;
    modal.classList.remove('hidden');
  }
};
