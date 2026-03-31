/* ============================================================
   ocr.js  —  OCR Engine (Simulated + Tesseract.js ready)
   Simulates character-by-character OCR recognition.
   In production: replace simulateOCR with Tesseract.js call.
   ============================================================ */

'use strict';

const OCREngine = (() => {

    // Simulate OCR with realistic timing & character reveal
    async function simulateOCR(sealData, onCharReveal) {
        const num = sealData.number;
        const revealDelay = Math.max(60, 1200 / num.length);
        let revealed = '';

        for (let i = 0; i < num.length; i++) {
            await new Promise(r => setTimeout(r, revealDelay));
            revealed += num[i];
            if (onCharReveal) onCharReveal(revealed, num);
        }
        return num;
    }

    // In production, use Tesseract.js:
    // async function realOCR(imageData) {
    //   const { createWorker } = Tesseract;
    //   const worker = await createWorker('eng');
    //   const { data } = await worker.recognize(imageData);
    //   await worker.terminate();
    //   return data.text.trim();
    // }

    return {
        async recognize(sealData, onProgress) {
            return await simulateOCR(sealData, onProgress);
        }
    };
})();
