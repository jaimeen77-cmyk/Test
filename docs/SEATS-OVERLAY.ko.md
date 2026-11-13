# Seats 공용 빌드·설치

Seats 0.6.6는 Cluster Redline·Storage와 같은 `apps/<id>/app.json + main.js` 및 공용 캔버스 구조입니다. 기본은 영어이고 `--language ko`로 한국어를 선택합니다. 자동 시작하는 백그라운드 코드가 시동 시 M1 옵션을 처리하며, 옵션 기본값은 꺼짐입니다.

## 기존 idrive7-apps 프로젝트에 추가

이 저장소에서 실행합니다. 대상에는 원래 `kit/tools/build.py`, `make_kit.py`, runtime, deploy와 한국어 지원이 있어야 합니다.

```powershell
python tools/install-overlay.py ../idrive7-apps --apps seats_easy_access
```

세 앱을 함께 합치려면 `--apps cluster_redline storage seats_easy_access`를 사용합니다. 기본 실행은 이 저장소의 모든 앱을 포함합니다. 충돌은 복사 전에 확인하며 사용자 변경을 검토한 뒤에만 `--force`로 갱신하세요.

예전 간이 Seats 빌더로 대상 `kit/tools/build.py`를 덮어썼다면 대상 원본을 먼저 복구하세요. 새 overlay는 원본 구조를 검사하고 필요한 공용 기능만 추가합니다. 대상은 사용자의 로컬 프로젝트이며 appsKOR 원격 저장소에는 Seats를 추가하지 않습니다.

## 대상 프로젝트에서 빌드

```powershell
python kit/tools/build.py --preview-only seats_easy_access
python kit/tools/build.py seats_easy_access
python kit/tools/make_kit.py seats_easy_access
# 한국어
python kit/tools/make_kit.py seats_easy_access --language ko
```

첫 명령은 SDK 없이 오프라인 리소스를 준비합니다. 실제 `.mgu`와 `.tgz` 생성에는 본인 차량에서 추출한 `oap-sdk`가 필요합니다. 영어 키트는 `dist/mgu-custom-apps.tar.gz`, 한국어 키트는 `dist/mgu-custom-apps-ko.tar.gz`입니다. 버전은 영어 `0.6.6`, 한국어 `0.6.6-ko.1` 형식입니다.

에뮬레이터: `node kit/tools/emu.js seats_easy_access`. 실제 차량과 같은 그리기 코드를 실행하고, PC에서는 소켓을 사용하지 않는 모의 시트 상태로 시작합니다. PREVIEW 표시가 보이며 버튼은 모의 상태만 바꿉니다.

설치에는 기존 `deploy/push-to-car.ps1` 또는 `push-to-car.sh`를 사용합니다. Comfort 0.5.1 이상은 원본 `IterioDev/car-apps`에서 별도로 설치해야 합니다.

## MGU Store

이 저장소의 main 소스에서는 다른 앱과 같은 `tools/store-build.js`와 SDK 없는 UI/runtime 템플릿으로 현재 JavaScript 소스를 패키징합니다. 차량 SDK는 Store가 준비합니다. **Seats Easy Access (English)**가 기본 항목(`seats_easy_access`)이고 **시트 Easy Access (한국어)**는 별도 항목(`seats_easy_access_ko`)입니다. 기존 기본 ID를 업데이트하면 영어판으로 바뀌므로 한국어를 원하면 한국어 항목을 설치하세요.

검사: `python tests/seats-build.test.py /path/to/original-project`. 실제 overlay 재적용·충돌 보존·Seats/Storage 키트 생성·리소스·체크섬을 검사합니다. 키트 구조 검사는 임시 테스트 SDK를 사용하며 실차 동작 검사는 아닙니다.
