// ============================================================
//   SealScan TOS System - Core Application Logic
// ============================================================

// ─── Seal Database (Simulated OCR Results) ───────────────────
const SEAL_DATA = [
  {
    id: 1,
    line: 'YANG MING',
    number: 'YMAM115001',
    color: '#3b82f6',
    confidence: 98.4,
    detectDelay: 800,
    ocrDelay: 2200
  },
  {
    id: 2,
    line: 'HMM',
    number: '21 0146461',
    color: '#06b6d4',
    confidence: 96.7,
    detectDelay: 1400,
    ocrDelay: 3100
  },
  {
    id: 3,
    line: 'HAPAG-LLOYD',
    number: 'HLC 0714335',
    color: '#f97316',
    confidence: 99.1,
    detectDelay: 2000,
    ocrDelay: 4000
  }
];

// ─── State ───────────────────────────────────────────────────
let state = {
  scanning: false,
  detected: [false, false, false],
  scanResults: [null, null, null],
  scanTime: null,
  allDetected: false
};

// ─── Live Clock ───────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  document.getElementById('liveClock').textContent = `${y}-${mo}-${d} ${h}:${m}:${s}`;
}
setInterval(updateClock, 1000);
updateClock();

// ─── Logging ──────────────────────────────────────────────────
function addLog(message, type = 'info') {
  const logBody = document.getElementById('logBody');
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;

  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  entry.innerHTML = `<span class="log-time">${time}</span><span class="log-msg">${message}</span>`;
  logBody.appendChild(entry);
  logBody.scrollTop = logBody.scrollHeight;
}

function clearLog() {
  document.getElementById('logBody').innerHTML = '';
  addLog('로그 초기화 완료.', 'info');
}

// ─── Progress Bar Animation ───────────────────────────────────
function animateOCRBar(barId, pctId, targetPct, duration) {
  return new Promise(resolve => {
    const bar = document.getElementById(barId);
    const pctEl = document.getElementById(pctId);
    const start = performance.now();
    const startVal = 0;

    function step(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const current = Math.round(startVal + (targetPct - startVal) * eased);
      bar.style.width = current + '%';
      pctEl.textContent = current + '%';
      if (progress < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

// ─── Start Scan ───────────────────────────────────────────────
async function startScan() {
  if (state.scanning) return;
  state.scanning = true;
  state.detected = [false, false, false];
  state.scanResults = [null, null, null];
  state.allDetected = false;

  // Reset UI
  resetDisplays();

  const btnScan = document.getElementById('btnScan');
  btnScan.disabled = true;
  btnScan.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> 스캔 중...`;

  const systemStatus = document.getElementById('systemStatus');
  systemStatus.className = 'status-badge scanning';
  systemStatus.innerHTML = '<span class="status-dot"></span><span>씰 스캔 중</span>';

  // Show scan line
  const scanLine = document.getElementById('scanLine');
  scanLine.classList.add('active');

  // Show OCR progress panel
  const ocrPanel = document.getElementById('ocrProgressPanel');
  ocrPanel.style.display = 'block';

  updateDetectionCount(0);
  addLog('🔍 씰 스캔 시작. 카메라 활성화...', 'info');

  const statusText = document.getElementById('camStatusText');
  statusText.textContent = '📷 씰 탐지 진행중...';

  document.getElementById('resultBadge').className = 'badge scanning';
  document.getElementById('resultBadge').textContent = '스캔중';

  // Process each seal with delays
  for (let i = 0; i < SEAL_DATA.length; i++) {
    const seal = SEAL_DATA[i];
    // Simulate detection delay
    await new Promise(resolve => setTimeout(resolve, i === 0 ? 600 : 600));
    await detectSeal(seal, i);
  }

  // All detected - finalize
  scanLine.classList.remove('active');
  state.allDetected = true;
  state.scanTime = new Date();
  state.scanning = false;

  btnScan.disabled = false;
  btnScan.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> 재스캔`;

  systemStatus.className = 'status-badge active';
  systemStatus.innerHTML = '<span class="status-dot"></span><span>스캔 완료</span>';

  statusText.textContent = '✅ 3개 씰 인식 완료';
  updateDetectionCount(3);

  document.getElementById('resultBadge').className = 'badge success';
  document.getElementById('resultBadge').textContent = '완료';

  document.getElementById('btnSend').disabled = false;
  document.querySelector('.send-tip').textContent = '✅ 씰 3개 인식 완료 - TOS 전송 가능';

  addLog('✅ 모든 씰 OCR 인식 완료 (3/3)', 'success');
  addLog(`📋 인식 결과: YMAM115001 | 21 0146461 | HLC 0714335`, 'success');
}

// ─── Detect Individual Seal ───────────────────────────────────
async function detectSeal(seal, index) {
  const i = index + 1;
  const camItem = document.getElementById(`camSeal${i}`);
  const detectBox = document.getElementById(`detectBox${i}`);
  const camNum = document.getElementById(`camNum${i}`);
  const resultItem = document.getElementById(`result${i}`);
  const sealNumEl = document.getElementById(`sealNum${i}`);
  const statusEl = document.getElementById(`status${i}`);

  // Phase 1: Detecting
  camItem.classList.add('scanning');
  addLog(`🔎 씰 #${i} (${seal.line}) 감지 시도 중...`, 'info');

  await new Promise(resolve => setTimeout(resolve, seal.detectDelay));

  // Phase 2: Detected
  camItem.classList.remove('scanning');
  camItem.classList.add('detected');

  addLog(`📌 씰 #${i} (${seal.line}) 위치 확정. OCR 분석 시작...`, 'info');

  // Animate OCR bar
  const ocrPromise = animateOCRBar(`ocrBar${i}`, `ocrPct${i}`, 100, seal.ocrDelay - seal.detectDelay);

  // Type out the number character by character
  const num = seal.number;
  camNum.textContent = '';
  let charIdx = 0;
  const typeInterval = (seal.ocrDelay - seal.detectDelay) / (num.length + 2);

  await new Promise(resolve => {
    const timer = setInterval(() => {
      if (charIdx < num.length) {
        // Show scrambled chars first, then reveal
        const revealed = num.substring(0, charIdx);
        const scramble = Math.random() > 0.5 ? '█' : '?';
        camNum.textContent = revealed + scramble;
        charIdx++;
      } else {
        clearInterval(timer);
        camNum.textContent = num;
        resolve();
      }
    }, typeInterval);
  });

  await ocrPromise;

  // Phase 3: OCR Complete
  state.detected[index] = true;
  state.scanResults[index] = { ...seal, detectedAt: new Date() };

  // Update result panel
  resultItem.classList.add('detected');
  sealNumEl.innerHTML = `<span style="color: ${seal.color}; font-weight: 700;">${seal.number}</span>`;
  statusEl.innerHTML = `<div class="status-icon success">✅</div>`;

  // Add confidence badge
  const confBadge = document.createElement('div');
  confBadge.style.cssText = `font-size: 0.68rem; color: #6ee7b7; margin-top: 2px; font-family: 'JetBrains Mono', monospace;`;
  confBadge.textContent = `신뢰도 ${seal.confidence}%`;
  document.getElementById(`result${i}`).querySelector('.result-info').appendChild(confBadge);

  addLog(`✅ 씰 #${i} OCR 완료: [${seal.number}] 신뢰도 ${seal.confidence}%`, 'success');

  const count = state.detected.filter(Boolean).length;
  updateDetectionCount(count);
}

// ─── Update Detection Count ───────────────────────────────────
function updateDetectionCount(count) {
  document.getElementById('detectionCount').textContent = `감지: ${count}/3`;
}

// ─── Reset ────────────────────────────────────────────────────
function resetDisplays() {
  for (let i = 1; i <= 3; i++) {
    const camItem = document.getElementById(`camSeal${i}`);
    camItem.classList.remove('scanning', 'detected');
    document.getElementById(`camNum${i}`).textContent = '───────';
    document.getElementById(`detectBox${i}`).style.display = '';

    document.getElementById(`result${i}`).classList.remove('detected');
    document.getElementById(`sealNum${i}`).innerHTML = '<span class="num-placeholder">스캔 대기중...</span>';
    document.getElementById(`status${i}`).innerHTML = '<div class="status-icon pending">⏳</div>';

    // Remove confidence badges
    const confBadge = document.getElementById(`result${i}`).querySelector('.result-info div:last-child');
    if (confBadge && confBadge.style.fontSize === '0.68rem') confBadge.remove();

    // Reset OCR bars
    document.getElementById(`ocrBar${i}`).style.width = '0%';
    document.getElementById(`ocrPct${i}`).textContent = '0%';
  }
  document.getElementById('btnSend').disabled = true;
  document.querySelector('.send-tip').textContent = '씰 스캔 완료 후 전송 버튼이 활성화됩니다';
  document.getElementById('resultBadge').className = 'badge';
  document.getElementById('resultBadge').textContent = '대기중';
}

function resetScan() {
  if (state.scanning) return;
  state = { scanning: false, detected: [false,false,false], scanResults: [null,null,null], scanTime: null, allDetected: false };
  resetDisplays();

  document.getElementById('ocrProgressPanel').style.display = 'none';
  document.getElementById('scanLine').classList.remove('active');
  document.getElementById('camStatusText').textContent = '📷 스캔 준비됨';
  document.getElementById('detectionCount').textContent = '감지: 0/3';

  const systemStatus = document.getElementById('systemStatus');
  systemStatus.className = 'status-badge';
  systemStatus.innerHTML = '<span class="status-dot"></span><span>시스템 대기중</span>';

  const btnScan = document.getElementById('btnScan');
  btnScan.disabled = false;
  btnScan.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> 씰 스캔 시작`;

  addLog('🔄 스캔 초기화 완료. 재스캔 준비됨.', 'warn');
}

// ─── TOS Send ─────────────────────────────────────────────────
async function sendToTOS() {
  if (!state.allDetected) return;

  const btnSend = document.getElementById('btnSend');
  btnSend.disabled = true;
  btnSend.classList.add('sending');
  btnSend.textContent = '전송 중...';

  addLog('📡 TOS 서버 연결 중...', 'info');

  const terminalCode = document.getElementById('terminalCode').value;
  const operationType = document.getElementById('operationType').value;
  const operatorId = document.getElementById('operatorId').value;
  const now = new Date();

  const payload = {
    timestamp: now.toISOString(),
    terminalCode,
    operationType,
    operatorId,
    seals: state.scanResults.map(s => ({
      shippingLine: s.line,
      sealNumber: s.number,
      confidence: s.confidence,
      detectedAt: s.detectedAt?.toISOString()
    }))
  };

  try {
    // Store to localStorage for dashboard
    const history = JSON.parse(localStorage.getItem('sealScanHistory') || '[]');
    history.unshift(payload);
    if (history.length > 100) history.splice(100);
    localStorage.setItem('sealScanHistory', JSON.stringify(history));

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1800));

    // Send to GitHub Pages dashboard via URL params / localStorage
    const sealNums = payload.seals.map(s => s.sealNumber).join(' | ');
    addLog(`✅ TOS 전송 성공!`, 'success');
    addLog(`📦 씰번호: ${sealNums}`, 'success');
    addLog(`🕐 전송시각: ${now.toLocaleString('ko-KR')}`, 'success');
    addLog(`🏭 터미널: ${terminalCode} / 작업: ${operationType}`, 'success');

    // Show modal
    showSuccessModal(payload);

  } catch (err) {
    addLog(`❌ 전송 실패: ${err.message}`, 'error');
    btnSend.disabled = false;
    btnSend.classList.remove('sending');
    btnSend.textContent = 'TOS 데이터 전송';
  }
}

// ─── Success Modal ────────────────────────────────────────────
function showSuccessModal(payload) {
  const modal = document.getElementById('modalOverlay');
  const desc = document.getElementById('modalDesc');
  const payloadEl = document.getElementById('modalPayload');

  const time = new Date(payload.timestamp).toLocaleString('ko-KR');
  desc.textContent = `${time} — ${payload.terminalCode} TOS 전송 완료`;

  const payloadText = [
    `TERMINAL  : ${payload.terminalCode}`,
    `OPERATION : ${payload.operationType}`,
    `OPERATOR  : ${payload.operatorId}`,
    `TIMESTAMP : ${payload.timestamp}`,
    `─────────────────────────────────────`,
    ...payload.seals.map((s, i) =>
      `SEAL #${i+1}   : ${s.sealNumber.padEnd(15)} [${s.shippingLine}] ${s.confidence}%`
    )
  ].join('\n');

  payloadEl.textContent = payloadText;

  // Update dashboard link
  const params = new URLSearchParams({
    data: JSON.stringify(payload)
  });
  document.getElementById('tosViewLink').href = `dashboard.html`;

  modal.style.display = 'flex';

  // Reset send button
  const btnSend = document.getElementById('btnSend');
  btnSend.classList.remove('sending');
  btnSend.textContent = '✅ 전송 완료';
}

function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
}

// ─── Init ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  addLog('🚀 SealScan TOS System v2.1 시작됨', 'info');
  addLog('📷 카메라 모듈 초기화 완료', 'info');
  addLog('🔗 TOS 서버 연결 대기중...', 'info');
  document.getElementById('camStatusText').textContent = '📷 스캔 준비됨 - [씰 스캔 시작] 클릭';
});
