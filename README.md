# SealScan - Container Seal Scanner (Android PWA)

컨테이너 터미널 현장에서 **안드로이드 스마트폰 카메라**로 씰을 실시간 스캐닝하여 TOS에 전송하는 앱입니다.

## 📱 안드로이드 설치 방법 (PWA)

1. **GitHub Pages 배포**: 아래 배포 방법 참고
2. **안드로이드 Chrome**에서 배포 URL 접속
3. 주소창 우측 `⋮` → **"홈 화면에 추가"** 클릭
4. 앱처럼 설치 완료! 카메라 권한 허용

## 🚀 앱 기능

| 기능 | 설명 |
|------|------|
| 📷 실시간 카메라 | 후면/전면 카메라 전환, 플래시 지원 |
| 🟩 YOLO 감지 박스 | 씰 인식 시 초록색 바운딩 박스 표시 |
| 🔍 OCR 인식 | 씰 표면 번호 자동 인식 (신뢰도 표시) |
| 📸 사진 캡처 | 스캔 시 현장 사진 자동 저장 |
| 📡 TOS 전송 | 씰번호 + 사진 + 시간 정보 전송 |
| 📋 대시보드 | 전송 기록, 사진 미리보기, 통계 |

## 🌐 GitHub Pages 배포

```bash
git init
git add .
git commit -m "SealScan Android PWA"
git remote add origin https://github.com/YOUR_ID/seal-scanner.git
git push -u origin main
```

GitHub → Settings → Pages → Source: `main` / `(root)` → Save

배포 URL: `https://YOUR_ID.github.io/seal-scanner/`

## 📁 파일 구조

```
Seal_Scanning/
├── index.html          # 메인 카메라 스캐너 (PWA)
├── dashboard.html      # TOS 전송 기록 대시보드
├── camera.js           # 카메라 제어 & 전송 로직
├── detector.js         # YOLO 스타일 씰 감지 & 바운딩 박스
├── ocr.js              # OCR 엔진 (시뮬레이션 / Tesseract.js 대체 가능)
├── style-mobile.css    # 모바일 최적화 스타일
├── manifest.json       # PWA 설치 매니페스트
├── sw.js               # 서비스 워커 (오프라인 지원)
└── icon-192.png        # 앱 아이콘
```

## 🔧 로컬 테스트

```bash
python -m http.server 8090
# → http://localhost:8090
```

> ⚠️ 카메라는 HTTPS 또는 localhost에서만 작동합니다.
> 안드로이드 테스트는 GitHub Pages(HTTPS) 배포 후 진행하세요.
