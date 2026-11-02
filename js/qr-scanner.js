/**
 * NSG SMART GUARD - Fullscreen QR Scanner & Verification Module
 * Includes Camera Management, GPS Geolocation Tracking, Distance Calculation,
 * Audio Beep, Haptic Feedback, Anti-tampering, and Success/Error Overlays.
 */

import { storage } from "./storage.js";
import { verifyAndRecordPatrolCloud, calculateHaversineDistance } from "./firebase-config.js";

class QRScannerManager {
  constructor() {
    this.html5QrCode = null;
    this.isScanning = false;
    this.currentFacingMode = "environment"; // default back camera
    this.hasFlashlight = false;
    this.isFlashlightOn = false;
    this.currentLocation = null;
    this.gpsWatchId = null;
    this.gpsError = null;
    this.audioCtx = null;
    this.targetCheckpoint = null; // if opened from a specific checkpoint click
    this.isProcessing = false; // anti-spam flag
    this.scanCooldownTimer = null;
  }

  init() {
    this.bindEvents();
    this.startGpsTracking();
  }

  bindEvents() {
    // Open scanner buttons
    document.querySelectorAll('[data-action="open-scanner"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const cpId = btn.getAttribute('data-checkpoint-id');
        this.openScanner(cpId);
      });
    });

    // Close scanner
    const closeBtn = document.getElementById('btn-close-scanner');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeScanner());
    }

    // Toggle camera (front / back)
    const switchCamBtn = document.getElementById('btn-switch-camera');
    if (switchCamBtn) {
      switchCamBtn.addEventListener('click', () => this.switchCamera());
    }

    // Toggle Flashlight / Torch
    const torchBtn = document.getElementById('btn-toggle-torch');
    if (torchBtn) {
      torchBtn.addEventListener('click', () => this.toggleTorch());
    }

    // Modal success close / continue
    const continueBtn = document.getElementById('btn-scan-continue');
    if (continueBtn) {
      continueBtn.addEventListener('click', () => {
        this.hideResultModal();
        if (window.renderPatrolUI) window.renderPatrolUI();
        if (window.renderHomeUI) window.renderHomeUI();
      });
    }

    // Report incident directly from scan modal
    const reportFromScanBtn = document.getElementById('btn-scan-report-incident');
    if (reportFromScanBtn) {
      reportFromScanBtn.addEventListener('click', () => {
        const cp = this.lastScannedCp;
        this.hideResultModal();
        this.closeScanner();
        if (window.openIncidentModalWithCheckpoint) {
          window.openIncidentModalWithCheckpoint(cp);
        }
      });
    }

    // Fallback QR file upload input
    const qrFileInput = document.getElementById('qr-file-input');
    if (qrFileInput) {
      qrFileInput.addEventListener('change', (e) => this.handleFileScan(e));
    }
  }

  /**
   * Sound & Haptic Generation
   */
  playSuccessSound() {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      // Pleasant high-pitch double beep
      const now = this.audioCtx.currentTime;
      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now); // A5
      osc1.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
      osc1.connect(gain1);
      gain1.connect(this.audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.12);

      const osc2 = this.audioCtx.createOscillator();
      const gain2 = this.audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1320, now + 0.14);
      osc2.frequency.exponentialRampToValueAtTime(1760, now + 0.28);
      gain2.gain.setValueAtTime(0.35, now + 0.14);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
      osc2.connect(gain2);
      gain2.connect(this.audioCtx.destination);
      osc2.start(now + 0.14);
      osc2.stop(now + 0.28);
    } catch (e) {
      console.warn('Audio feedback error:', e);
    }

    // Haptic vibration
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }
  }

  playErrorSound() {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(180, now + 0.3);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } catch (e) {}

    if (navigator.vibrate) {
      navigator.vibrate([300, 100, 300]);
    }
  }

  /**
   * Continuous GPS Geolocation Engine
   */
  startGpsTracking() {
    if (!navigator.geolocation) {
      this.gpsError = 'Trình duyệt không hỗ trợ GPS Geolocation';
      this.updateGpsStatusUI();
      return;
    }

    const options = {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 10000
    };

    const success = (pos) => {
      this.currentLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp
      };
      this.gpsError = null;
      this.updateGpsStatusUI();
    };

    const error = (err) => {
      console.warn('GPS position error:', err.message);
      this.gpsError = err.message || 'Không thể lấy tọa độ GPS';
      this.updateGpsStatusUI();
    };

    this.gpsWatchId = navigator.geolocation.watchPosition(success, error, options);
  }

  updateGpsStatusUI() {
    const statusTextEl = document.getElementById('scanner-gps-status');
    const accuracyEl = document.getElementById('scanner-gps-accuracy');
    const distEl = document.getElementById('scanner-distance-badge');
    const headerGpsDot = document.getElementById('header-gps-indicator');

    if (!statusTextEl) return;

    if (this.currentLocation) {
      const acc = Math.round(this.currentLocation.accuracy);
      statusTextEl.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1.5 animate-pulse"></span>GPS Đã khóa (±${acc}m)`;
      statusTextEl.className = "text-xs font-semibold text-emerald-400 flex items-center";

      if (headerGpsDot) {
        headerGpsDot.className = "w-2.5 h-2.5 rounded-full bg-emerald-500 gps-live-dot inline-block";
        headerGpsDot.title = `GPS Tốt (±${acc}m)`;
      }

      // Calculate distance if target checkpoint is selected
      if (this.targetCheckpoint && distEl) {
        const d = calculateHaversineDistance(
          this.currentLocation.lat,
          this.currentLocation.lng,
          this.targetCheckpoint.lat,
          this.targetCheckpoint.lng
        );
        const distRounded = Math.round(d);
        const maxRadius = this.targetCheckpoint.allowedRadius || 50;
        const isValid = distRounded <= maxRadius;

        distEl.classList.remove('hidden');
        distEl.innerHTML = `
          <div class="px-3 py-1.5 rounded-full ${isValid ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'} flex items-center gap-1.5 text-xs font-medium backdrop-blur-md">
            <i class="fa-solid fa-location-crosshairs"></i>
            <span>Khoảng cách đến điểm: <strong>${distRounded}m</strong> (${isValid ? 'Hợp lệ ≤ ' + maxRadius + 'm' : 'Quá xa > ' + maxRadius + 'm'})</span>
          </div>
        `;
      } else if (distEl) {
        distEl.classList.add('hidden');
      }
    } else {
      statusTextEl.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1.5 animate-ping"></span>Đang định vị GPS...`;
      statusTextEl.className = "text-xs font-medium text-amber-300 flex items-center";
      if (distEl) distEl.classList.add('hidden');
    }
  }

  /**
   * Open QR Scanner Fullscreen Overlay
   */
  async openScanner(checkpointId = null) {
    const scannerOverlay = document.getElementById('qr-scanner-overlay');
    if (!scannerOverlay) return;

    // Check target checkpoint
    if (checkpointId) {
      const allCheckpoints = storage.getCheckpoints();
      this.targetCheckpoint = allCheckpoints.find(c => c.id === checkpointId || c.code === checkpointId) || null;
    } else {
      this.targetCheckpoint = null;
    }

    // Set Target Point Banner in scanner UI
    const targetInfoEl = document.getElementById('scanner-target-checkpoint-info');
    if (targetInfoEl) {
      if (this.targetCheckpoint) {
        targetInfoEl.classList.remove('hidden');
        targetInfoEl.innerHTML = `
          <div class="bg-blue-900/60 backdrop-blur-md border border-blue-400/30 rounded-xl p-2.5 px-3 flex items-center justify-between text-white text-xs">
            <div>
              <div class="text-[10px] text-blue-300 uppercase tracking-wider font-bold">Mục tiêu quét</div>
              <div class="font-bold text-sm text-white">${this.targetCheckpoint.name}</div>
              <div class="text-[11px] text-slate-300">${this.targetCheckpoint.campusName} • ${this.targetCheckpoint.zoneName} (${this.targetCheckpoint.floor})</div>
            </div>
            <div class="text-right">
              <span class="px-2 py-0.5 rounded bg-blue-500/30 text-blue-200 text-[10px] font-mono">Bán kính ≤${this.targetCheckpoint.allowedRadius}m</span>
            </div>
          </div>
        `;
      } else {
        targetInfoEl.classList.add('hidden');
      }
    }

    this.updateGpsStatusUI();
    scannerOverlay.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');

    await this.startCamera();
  }

  async startCamera() {
    try {
      const qrReaderContainer = document.getElementById('qr-reader');
      if (!qrReaderContainer) return;

      if (!window.Html5Qrcode) {
        console.error('Html5Qrcode library not loaded');
        this.showCameraError('Thư viện quét mã QR chưa được nạp. Vui lòng tải lại trang.');
        return;
      }

      if (this.html5QrCode) {
        try {
          await this.html5QrCode.stop();
        } catch (e) {}
      }

      this.html5QrCode = new Html5Qrcode("qr-reader");

      const config = {
        fps: 15,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const edgeSize = Math.min(viewfinderWidth, viewfinderHeight) * 0.75;
          return {
            width: Math.max(240, Math.floor(edgeSize)),
            height: Math.max(240, Math.floor(edgeSize))
          };
        },
        aspectRatio: 1.0,
        showTorchButtonIfSupported: true
      };

      const cameraIdOrConfig = { facingMode: this.currentFacingMode };

      await this.html5QrCode.start(
        cameraIdOrConfig,
        config,
        (decodedText, decodedResult) => this.onQrCodeSuccess(decodedText, decodedResult),
        (errorMessage) => {
          // ignore transient frame decode misses
        }
      );

      this.isScanning = true;
      console.log("📷 Camera started successfully in mode:", this.currentFacingMode);
    } catch (err) {
      console.error("Camera start failed:", err);
      this.showCameraError("Không thể kích hoạt Camera: " + (err.message || "Vui lòng cấp quyền camera trong cài đặt trình duyệt."));
    }
  }

  async switchCamera() {
    this.currentFacingMode = this.currentFacingMode === "environment" ? "user" : "environment";
    await this.startCamera();
    const btn = document.getElementById('btn-switch-camera');
    if (btn) {
      btn.title = `Đổi camera (${this.currentFacingMode === "environment" ? "Cam sau" : "Cam trước"})`;
    }
  }

  async toggleTorch() {
    if (!this.html5QrCode || !this.isScanning) return;
    try {
      const track = this.html5QrCode.getRunningTrackCameraCapabilities();
      if (track && track.torchFeature().isSupported()) {
        this.isFlashlightOn = !this.isFlashlightOn;
        await track.torchFeature().apply(this.isFlashlightOn);
        const torchBtn = document.getElementById('btn-toggle-torch');
        if (torchBtn) {
          torchBtn.classList.toggle('text-amber-400', this.isFlashlightOn);
        }
      } else {
        alert("Thiết bị hoặc camera hiện tại không hỗ trợ đèn Flash.");
      }
    } catch (e) {
      console.warn("Torch toggle error:", e);
    }
  }

  async closeScanner() {
    if (this.html5QrCode && this.isScanning) {
      try {
        await this.html5QrCode.stop();
      } catch (e) {}
      this.isScanning = false;
    }
    const scannerOverlay = document.getElementById('qr-scanner-overlay');
    if (scannerOverlay) scannerOverlay.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }

  showCameraError(message) {
    const errorEl = document.getElementById('scanner-camera-error');
    if (errorEl) {
      errorEl.classList.remove('hidden');
      errorEl.innerHTML = `
        <div class="bg-rose-950/90 border border-rose-500/50 text-rose-200 p-4 rounded-2xl text-center max-w-sm mx-auto shadow-2xl">
          <i class="fa-solid fa-triangle-exclamation text-3xl text-rose-400 mb-2"></i>
          <p class="text-sm font-semibold mb-3">${message}</p>
          <div class="flex flex-col gap-2">
            <button onclick="document.getElementById('qr-file-input').click()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition">
              <i class="fa-solid fa-image mr-1.5"></i> Chọn ảnh QR từ thiết bị
            </button>
            <button onclick="window.scannerManager.startCamera()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition">
              <i class="fa-solid fa-arrows-rotate mr-1.5"></i> Thử lại quyền camera
            </button>
          </div>
        </div>
      `;
    }
  }

  /**
   * Handle QR scanning through file upload (fallback)
   */
  async handleFileScan(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (!this.html5QrCode) {
        this.html5QrCode = new Html5Qrcode("qr-reader");
      }
      const decodedResult = await this.html5QrCode.scanFile(file, true);
      this.onQrCodeSuccess(decodedResult);
    } catch (err) {
      this.playErrorSound();
      alert("Không tìm thấy mã QR trong ảnh vừa chọn. Vui lòng thử lại với ảnh rõ nét hơn.");
    }
  }

  /**
   * QR Scanned Callback with Server/Cloud Verification
   */
  async onQrCodeSuccess(decodedText) {
    // Anti-spam throttling
    if (this.isProcessing) return;
    this.isProcessing = true;

    // Visual pause
    try {
      if (this.html5QrCode && this.isScanning) {
        await this.html5QrCode.pause();
      }
    } catch (e) {}

    const guard = storage.getCurrentUser();
    const shift = storage.getActiveShift();

    // Verify and record with Cloud functions logic
    const result = await verifyAndRecordPatrolCloud({
      qrPayload: decodedText.trim(),
      userLocation: this.currentLocation,
      guard: guard,
      shift: shift
    });

    if (result.success) {
      this.playSuccessSound();
      this.lastScannedCp = result.checkpoint;
      this.showResultModal(result);
    } else {
      this.playErrorSound();
      this.showErrorModal(result);
    }

    // Release processing lock after brief timeout
    setTimeout(() => {
      this.isProcessing = false;
      if (this.html5QrCode && this.isScanning) {
        try {
          this.html5QrCode.resume();
        } catch (e) {}
      }
    }, 2000);
  }

  /**
   * Display Verification Success Modal / Bottom Sheet
   */
  showResultModal(result) {
    const modal = document.getElementById('scan-result-modal');
    if (!modal) return;

    const { checkpoint, data, distanceMeters, isGpsValid } = result;
    const nowTimeStr = new Date(data.scannedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const nowDateStr = new Date(data.scannedAt).toLocaleDateString('vi-VN');

    document.getElementById('modal-cp-name').textContent = checkpoint.name;
    document.getElementById('modal-campus-name').textContent = checkpoint.campusName;
    document.getElementById('modal-zone-floor').textContent = `${checkpoint.zoneName} • ${checkpoint.floor}`;
    document.getElementById('modal-scan-time').textContent = `${nowTimeStr} - ${nowDateStr}`;
    document.getElementById('modal-guard-name').textContent = data.guardName;

    // GPS Status badge
    const gpsBadge = document.getElementById('modal-gps-badge');
    if (gpsBadge) {
      if (distanceMeters !== null) {
        if (isGpsValid) {
          gpsBadge.className = "p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between";
          gpsBadge.innerHTML = `
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-sm">
                <i class="fa-solid fa-location-dot"></i>
              </div>
              <div>
                <div class="text-xs font-bold text-emerald-700 dark:text-emerald-300">Google Maps GPS Hợp Lệ (≤${checkpoint.allowedRadius || 50}m)</div>
                <div class="text-[11px] text-slate-500 dark:text-slate-400">Khoảng cách: <strong>${distanceMeters}m</strong> (Sai số: ±${data.accuracy || 5}m)</div>
                ${checkpoint.lat && checkpoint.lng ? `
                  <a href="https://www.google.com/maps?q=${checkpoint.lat},${checkpoint.lng}" target="_blank" class="inline-flex items-center gap-1 text-[11px] text-blue-600 font-bold hover:underline mt-1">
                    <i class="fa-brands fa-google"></i> Mở trên Google Maps
                  </a>
                ` : ''}
              </div>
            </div>
            <i class="fa-solid fa-circle-check text-emerald-500 text-xl"></i>
          `;
        } else {
          gpsBadge.className = "p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-center justify-between";
          gpsBadge.innerHTML = `
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-sm">
                <i class="fa-solid fa-triangle-exclamation"></i>
              </div>
              <div>
                <div class="text-xs font-bold text-amber-700 dark:text-amber-300">Cảnh báo: Cách xa điểm (${distanceMeters}m)</div>
                <div class="text-[11px] text-slate-500 dark:text-slate-400">Hệ thống đã ghi nhận nhưng đánh dấu nghi vấn vị trí để Quản lý đối chiếu.</div>
              </div>
            </div>
            <i class="fa-solid fa-circle-exclamation text-amber-500 text-xl"></i>
          `;
        }
      } else {
        gpsBadge.className = "p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between";
        gpsBadge.innerHTML = `
          <div class="text-xs text-slate-600 dark:text-slate-300">
            <span class="font-bold">Chưa xác định tọa độ GPS</span> (Thiết bị không truyền GPS)
          </div>
        `;
      }
    }

    modal.classList.remove('hidden');
  }

  hideResultModal() {
    const modal = document.getElementById('scan-result-modal');
    if (modal) modal.classList.add('hidden');
    this.closeScanner();
  }

  showErrorModal(result) {
    alert(`❌ TỪ CHỐI XÁC THỰC:\n\n${result.message}`);
  }
}

export const scannerManager = new QRScannerManager();
window.scannerManager = scannerManager;
