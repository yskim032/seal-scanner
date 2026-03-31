// ============================================================
//   camera.js  —  Camera, Scan Orchestration & TOS Transmission
// ============================================================
'use strict';

// ── State ────────────────────────────────────────────────────
const App = {
    stream: null,
    facingMode: 'environment', // 후면 카메라 기본
    torchOn: false,
    scanning: false,
    detections: [],
    capturedImageDataURL: null,
    scanComplete: false
};

// ── MQTT Client (실시간 서버 연결) ───────────────────────────
const mqttClient = typeof mqtt !== 'undefined' ? mqtt.connect('wss://test.mosquitto.org:8081/mqtt') : null;
const TOPIC = 'sealscan/yskim032/tos_data';

if (mqttClient) {
    mqttClient.on('connect', () => {
        console.log('✅ Real-time Cloud Connected');
    });
}

// ── DOM refs ─────────────────────────────────────────────────
const video = document.getElementById('videoFeed');
const detCanvas = document.getElementById('detectionCanvas');
const capCanvas = document.getElementById('captureCanvas');
const laserLine = document.getElementById('laserLine');
const sealsList = document.getElementById('sealsList');
const emptySeals = document.getElementById('emptySeals');
const btnScan = document.getElementById('btnScanAction');
const btnScanTxt = document.getElementById('btnScanText');
const btnSend = document.getElementById('btnSendAction');
const statusBadge = document.getElementById('scanStatusBadge');
const countBadge = document.getElementById('detectCountBadge');
const countText = document.getElementById('detectCountText');
const photoRow = document.getElementById('photoPreviewRow');
const capturedImg = document.getElementById('capturedPhoto');
const connBadge = document.getElementById('connBadge');
const connText = document.getElementById('connText');
const clockEl = document.getElementById('clockMini');

// ── Clock ────────────────────────────────────────────────────
function tickClock() {
    const n = new Date();
    const pad = v => String(v).padStart(2, '0');
    clockEl.textContent = `${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`;
}
setInterval(tickClock, 1000);
tickClock();

// ── Online/Offline indicator ──────────────────────────────────
function updateConn() {
    if (navigator.onLine) {
        connBadge.className = 'conn-badge online';
        connText.textContent = '온라인';
    } else {
        connBadge.className = 'conn-badge';
        connText.textContent = '오프라인';
    }
}
window.addEventListener('online', updateConn);
window.addEventListener('offline', updateConn);
updateConn();

// ── Start Camera ──────────────────────────────────────────────
async function startCamera() {
    const overlay = document.getElementById('camReadyOverlay');
    const loading = document.getElementById('camLoading');
    overlay.style.display = 'none';
    loading.style.display = 'flex';

    try {
        if (App.stream) { App.stream.getTracks().forEach(t => t.stop()); }
        const constraints = {
            video: { facingMode: App.facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        };
        App.stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = App.stream;
        await video.play();

        loading.style.display = 'none';
        SealDetector.init(detCanvas, video); // YOLO box 초기화
        showToast('카메라 시작됨', 'success');
    } catch (err) {
        loading.style.display = 'none';
        overlay.style.display = 'flex';
        overlay.querySelector('.cam-ready-sub').textContent = '카메라 접근 실패: ' + err.message;
        showToast('카메라 오류', 'error');
    }
}

// ── Flip Camera ───────────────────────────────────────────────
async function flipCamera() {
    App.facingMode = App.facingMode === 'environment' ? 'user' : 'environment';
    const btn = document.getElementById('btnFlip');
    btn.style.transform = 'rotate(180deg)';
    setTimeout(() => btn.style.transform = '', 400);
    await startCamera();
}

// ── Torch (플래시) ────────────────────────────────────────────
async function toggleTorch() {
    if (!App.stream) return;
    const track = App.stream.getVideoTracks()[0];
    try {
        App.torchOn = !App.torchOn;
        await track.applyConstraints({ advanced: [{ torch: App.torchOn }] });
        document.getElementById('btnTorch').classList.toggle('active', App.torchOn);
    } catch { showToast('플래시 미지원 기기', 'error'); }
}

// ── Capture Photo (데이터 전송을 위한 썸네일 생성) ─────────────
function captureCompressedPhoto() {
    const ctx = capCanvas.getContext('2d');
    // 빠른 실시간 전송을 위해 이미지를 480px로 축소하여 압축
    const maxW = 480;
    const scale = maxW / video.videoWidth;
    capCanvas.width = maxW;
    capCanvas.height = video.videoHeight * scale;
    ctx.drawImage(video, 0, 0, capCanvas.width, capCanvas.height);
    // JPEG 0.65 품질로 압축 (약 20~40KB로 경량화되어 즉시 전송됨)
    return capCanvas.toDataURL('image/jpeg', 0.65);
}

// ── Build Seal Result Card ────────────────────────────────────
function buildSealCard(seal, recognizedNum, photoURL) {
    const card = document.createElement('div');
    card.className = 'seal-card';
    card.id = `sealCard${seal.id}`;

    const colMap = { 'YANG MING': '#3b82f6', 'HMM': '#06b6d4', 'HAPAG-LLOYD': '#f97316' };
    const col = colMap[seal.line] || '#8b5cf6';

    card.innerHTML = `
    <img class="seal-card-thumb" src="${photoURL}" alt="${seal.line}"/>
    <div class="seal-card-info">
      <div class="seal-card-line" style="color:${col}">${seal.line}</div>
      <div class="seal-card-number" id="cardNum${seal.id}">
        <span style="opacity:0.4">분석중...</span>
      </div>
      <div class="seal-card-conf" id="cardConf${seal.id}" style="display:none">
        신뢰도 ${(seal.confidence * 100).toFixed(1)}%
      </div>
    </div>
    <div class="seal-card-status" id="cardSts${seal.id}">⏳</div>
  `;
    return card;
}

// ── Main Scan Flow ────────────────────────────────────────────
async function doScan() {
    if (App.scanning) return;
    if (!App.stream) { showToast('먼저 카메라를 켜주세요', 'error'); return; }

    App.scanning = true; App.scanComplete = false; App.detections = [];
    sealsList.innerHTML = ''; emptySeals.style.display = 'none';
    photoRow.style.display = 'none'; btnSend.disabled = true;

    btnScan.classList.add('scanning'); btnScanTxt.textContent = '스캔 진행중...';
    statusBadge.className = 'scan-status-badge scanning'; statusBadge.textContent = '스캔중';
    laserLine.classList.add('active'); countBadge.style.display = 'block'; countText.textContent = '0 씰 감지';

    SealDetector.clearDetections();
    const photoDataURL = captureCompressedPhoto(); // 사진 캡처

    // YOLO 바운딩 박스 감지 
    const foundSeals = await SealDetector.detectAll((found, total, seal) => {
        countText.textContent = `${found}/${total} 씰 탐지`;
        sealsList.appendChild(buildSealCard(seal, null, photoDataURL));

        // OCR 인식 (Tesseract 시뮬레이션)
        OCREngine.recognize(seal, (partial, full) => {
            const numEl = document.getElementById(`cardNum${seal.id}`);
            if (numEl) {
                const pct = partial.length / full.length;
                numEl.innerHTML = `<span style="color:${seal.color}">${partial}</span><span style="opacity:0.25">${'█'.repeat(full.length - partial.length)}</span>`;
                if (pct >= 1) { // 인식 완료
                    numEl.innerHTML = `<span style="color:${seal.color};font-weight:700">${full}</span>`;
                    document.getElementById(`cardConf${seal.id}`).style.display = 'block';
                    document.getElementById(`cardSts${seal.id}`).textContent = '✅';
                    document.getElementById(`sealCard${seal.id}`).classList.add('confirmed');
                }
            }
        });
        App.detections.push(seal);
    });

    App.capturedImageDataURL = photoDataURL;
    capturedImg.src = photoDataURL; photoRow.style.display = 'block';

    laserLine.classList.remove('active'); App.scanning = false; App.scanComplete = true;
    statusBadge.className = 'scan-status-badge detected'; statusBadge.textContent = `${foundSeals.length}개 완료`;
    btnScan.classList.remove('scanning'); btnScanTxt.textContent = '재스캔';
    btnSend.disabled = false;
    showToast(`✅ ${foundSeals.length}개 씰 감지 성공`, 'success');
}

// ── Real-time TOS Transmission ────────────────────────────────
async function sendToTOS() {
    if (!App.scanComplete || App.detections.length === 0) return;
    btnSend.disabled = true; btnSend.classList.add('sending');
    btnSend.querySelector('span').textContent = '클라우드 전송 중...';

    const now = new Date();
    const msgInput = document.getElementById('tosMessage');
    const payload = {
        timestamp: now.toISOString(),
        terminalCode: document.getElementById('terminalCode').value,
        operationType: document.getElementById('operationType').value,
        operatorId: document.getElementById('operatorId').value,
        message: msgInput ? msgInput.value.trim() : '',
        capturedImage: App.capturedImageDataURL,
        seals: App.detections.map(s => ({
            shippingLine: s.line, sealNumber: s.number, confidence: +(s.confidence * 100).toFixed(1)
        }))
    };

    try {
        // 1. 디바이스 로컬 저장 (사진 포함)
        const history = JSON.parse(localStorage.getItem('sealScanHistory') || '[]');
        history.unshift(payload);
        if (history.length > 50) history.splice(50);
        localStorage.setItem('sealScanHistory', JSON.stringify(history));

        // 2. 외부 웹사이트 실시간 동기화를 위해 MQTT로 메세지 퍼블리시
        // 퍼블릭 무료 MQTT 서버의 메세지 용량 제한(약 64KB) 때문에 사진은 제외하고 텍스트만 전송합니다.
        if (mqttClient && mqttClient.connected) {
            const mqttPayload = { ...payload, capturedImage: null };
            mqttClient.publish(TOPIC, JSON.stringify(mqttPayload));
        } else {
            console.warn("MQTT disconnected, data saved locally only.");
        }
    } catch (e) { console.error('Storage Exception', e); }

    await new Promise(r => setTimeout(r, 600)); // UI delay effect

    btnSend.classList.remove('sending'); btnSend.querySelector('span').textContent = '✅ 서버전송 완료';
    statusBadge.className = 'scan-status-badge sent'; statusBadge.textContent = '클라우드 전송됨';
    showSuccessModal(payload);
}

// ── Success Modal ─────────────────────────────────────────────
function showSuccessModal(payload) {
    const dt = new Date(payload.timestamp).toLocaleString('ko-KR');
    document.getElementById('modalDesc').textContent = `${dt} — ${payload.terminalCode} 전송완료`;
    const lines = [
        `터미널 : ${payload.terminalCode}`, `작업   : ${payload.operationType}`, `담당자 : ${payload.operatorId}`, `────────────────────────`,
        ...payload.seals.map((s, i) => `씰 #${i + 1}: ${s.sealNumber}  [${s.shippingLine}]  ${s.confidence}%`)
    ];
    document.getElementById('modalSeals').textContent = lines.join('\n');
    document.getElementById('modalOverlay').style.display = 'flex';
}
function closeModal() { document.getElementById('modalOverlay').style.display = 'none'; }

// ── Toast ─────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast' + (type === 'error' ? ' error' : '');
    t.style.display = 'block';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.display = 'none'; }, 2800);
}

document.addEventListener('touchmove', e => {
    if (e.target.closest('.result-panel')) return;
    e.preventDefault();
}, { passive: false });
