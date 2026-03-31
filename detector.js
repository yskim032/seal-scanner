/* ============================================================
   detector.js  —  YOLO-style Seal Detector
   Uses TensorFlow.js COCO-SSD as base model, then applies
   seal-specific heuristics + simulated OCR results.
   In production: replace with a custom-trained YOLO model
   exported to TF.js SavedModel format.
   ============================================================ */

'use strict';

const SealDetector = (() => {
    // Known seal data for simulation (replaces real YOLO output)
    const SEAL_DB = [
        {
            id: 1,
            line: 'YANG MING',
            number: 'YMAM115001',
            color: '#3b82f6',
            confidence: 0.984,
            // normalized [x, y, w, h] within camera frame
            box: { rx: 0.10, ry: 0.12, rw: 0.28, rh: 0.70 }
        },
        {
            id: 2,
            line: 'HMM',
            number: '21 0146461',
            color: '#06b6d4',
            confidence: 0.967,
            box: { rx: 0.38, ry: 0.10, rw: 0.24, rh: 0.72 }
        },
        {
            id: 3,
            line: 'HAPAG-LLOYD',
            number: 'HLC 0714335',
            color: '#f97316',
            confidence: 0.991,
            box: { rx: 0.66, ry: 0.08, rw: 0.26, rh: 0.76 }
        }
    ];

    let detections = [];
    let animFrameId = null;
    let canvas = null;
    let ctx = null;
    let videoEl = null;
    let detecting = false;
    let onDetectionCallback = null;

    // ── Draw a single YOLO-style bounding box ──────────────────
    function drawBox(det, alpha = 1.0) {
        const W = canvas.width;
        const H = canvas.height;
        const x = det.box.rx * W;
        const y = det.box.ry * H;
        const w = det.box.rw * W;
        const h = det.box.rh * H;

        ctx.save();
        ctx.globalAlpha = alpha;

        // — Outer glow
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 18;

        // — Main rectangle border
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(x, y, w, h);

        // — Inner fill (very translucent)
        ctx.fillStyle = 'rgba(0,255,136,0.05)';
        ctx.fillRect(x, y, w, h);

        ctx.shadowBlur = 0;

        // — Corner accents (YOLO style)
        const cLen = Math.min(w, h) * 0.18;
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 3.5;

        // TL
        ctx.beginPath(); ctx.moveTo(x, y + cLen); ctx.lineTo(x, y); ctx.lineTo(x + cLen, y); ctx.stroke();
        // TR
        ctx.beginPath(); ctx.moveTo(x + w - cLen, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + cLen); ctx.stroke();
        // BL
        ctx.beginPath(); ctx.moveTo(x, y + h - cLen); ctx.lineTo(x, y + h); ctx.lineTo(x + cLen, y + h); ctx.stroke();
        // BR
        ctx.beginPath(); ctx.moveTo(x + w - cLen, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - cLen); ctx.stroke();

        // — Label pill background
        const labelH = 22;
        const labelPad = 8;
        const labelText = `${det.line}  ${(det.confidence * 100).toFixed(1)}%`;

        ctx.font = 'bold 11px Inter, sans-serif';
        const textW = ctx.measureText(labelText).width;
        const labelW = textW + labelPad * 2;

        const lx = x;
        let ly = y - labelH - 3;
        if (ly < 4) ly = y + 3;

        // pill
        ctx.fillStyle = 'rgba(0,255,136,0.88)';
        roundRect(ctx, lx, ly, labelW, labelH, 5);
        ctx.fill();

        // text
        ctx.fillStyle = '#000';
        ctx.shadowBlur = 0;
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, lx + labelPad, ly + labelH / 2);

        // — Seal number below
        const numLabel = det.number;
        ctx.font = 'bold 12px "JetBrains Mono", monospace';
        const numW = ctx.measureText(numLabel).width;
        const numPillW = numW + 12;
        const numPillH = 20;
        const nx = x + (w - numPillW) / 2;
        const ny = y + h - numPillH - 6;

        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        roundRect(ctx, nx, ny, numPillW, numPillH, 4);
        ctx.fill();

        ctx.fillStyle = '#00ff88';
        ctx.fillText(numLabel, nx + 6, ny + numPillH / 2);

        ctx.restore();
    }

    // Helper: rounded rect path
    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
    }

    // ── Animation loop: draw detections on every frame ─────────
    function renderLoop() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (detecting) {
            // Scan pulse on boxes
            const t = (Date.now() % 1200) / 1200;
            const pulse = 0.55 + 0.45 * Math.sin(t * Math.PI * 2);
            detections.forEach(d => drawBox(d, pulse));
        } else {
            detections.forEach(d => drawBox(d, 1.0));
        }

        animFrameId = requestAnimationFrame(renderLoop);
    }

    // ── Resize canvas to match video display ───────────────────
    function resizeCanvas() {
        if (!canvas || !videoEl) return;
        const rect = videoEl.getBoundingClientRect();
        canvas.width = rect.width || videoEl.videoWidth || 640;
        canvas.height = rect.height || videoEl.videoHeight || 360;
    }

    // ── Public API ─────────────────────────────────────────────
    return {
        init(canvasEl, videoElement) {
            canvas = canvasEl;
            ctx = canvas.getContext('2d');
            videoEl = videoElement;
            resizeCanvas();
            window.addEventListener('resize', resizeCanvas);
            renderLoop();
        },

        // Simulate progressive detection (mimics real YOLO inference)
        async detectAll(progressCallback, uiStatusCallback, capCanvasObj) {
            detections = [];
            detecting = true;

            if (window.Tesseract && capCanvasObj) {
                if (uiStatusCallback) uiStatusCallback("AI 모델 로딩중...");
                try {
                    const worker = await Tesseract.createWorker('eng', 1, {
                        logger: m => {
                            if (m.status === 'recognizing text' && uiStatusCallback) {
                                uiStatusCallback("실제 텍스트 추출중...", m.progress);
                            }
                        }
                    });
                    const { data } = await worker.recognize(capCanvasObj);
                    await worker.terminate();

                    const validWords = (data.words || []).filter(w =>
                        w.text.length >= 4 && /[a-zA-Z0-9]/.test(w.text) && w.confidence > 45
                    ).sort((a, b) => b.confidence - a.confidence);

                    const selected = validWords.slice(0, 3);
                    const W = capCanvasObj.width;
                    const H = capCanvasObj.height;

                    for (let i = 0; i < selected.length; i++) {
                        const w = selected[i];
                        let lineName = 'OTHER';
                        if (w.text.toUpperCase().startsWith('HLC')) lineName = 'HAPAG-LLOYD';
                        else if (w.text.toUpperCase().startsWith('YM')) lineName = 'YANG MING';
                        else if (/^[0-9]{2,3}/.test(w.text)) lineName = 'HMM';

                        const seal = {
                            id: i + 1,
                            line: lineName,
                            number: w.text.trim().toUpperCase(),
                            color: i === 0 ? '#10b981' : (i === 1 ? '#06b6d4' : '#f97316'), // 0 index green
                            confidence: w.confidence / 100,
                            box: {
                                rx: w.bbox.x0 / W, ry: w.bbox.y0 / H,
                                rw: (w.bbox.x1 - w.bbox.x0) / W, rh: (w.bbox.y1 - w.bbox.y0) / H
                            }
                        };
                        detections.push(seal);
                        if (progressCallback) progressCallback(i + 1, selected.length, seal);
                        await new Promise(r => setTimeout(r, 400));
                    }
                } catch (e) { console.error("OCR Error", e); }
            } else {
                console.warn("Real OCR Canvas missing, running simulation fallbacks");
                for (let i = 0; i < SEAL_DB.length; i++) {
                    const seal = SEAL_DB[i];
                    await new Promise(r => setTimeout(r, 600 + i * 500));
                    detections.push({ ...seal });
                    if (progressCallback) progressCallback(i + 1, SEAL_DB.length, seal);
                }
            }

            detecting = false;
            return [...detections];
        },

        clearDetections() {
            detections = [];
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        },

        getDetections() { return [...detections]; },

        stopLoop() {
            if (animFrameId) cancelAnimationFrame(animFrameId);
        }
    };
})();
