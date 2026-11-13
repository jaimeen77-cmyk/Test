# BMW iDrive 7 시트 앱

2020 BMW G20과 iDrive 7에서 시험하기 위한 시트 앱 저장소입니다. BMW SDK·펌웨어나 IterioDev Comfort 바이너리는 포함하지 않습니다.

## Seats Easy Access 0.6.6

기본 언어는 **영어**입니다. `--language ko`를 지정하면 한국어판을 빌드합니다. MGU Store도 English/한국어 항목을 별도로 제공합니다. 기존 기본 ID 업데이트는 영어판으로 전환되므로 한국어를 원하면 한국어 항목을 선택하세요.

실제 시트 그림을 중심으로 운전석과 조수석을 조절하고 메모리와 Easy Access를 사용하는 앱입니다.

- 운전석·조수석 하차 위치 저장
- 상단 운전석 / 조수석 선택 탭 (선택 좌석은 ● 표시)
- 조수석 Make room 공간 확보 / 원위치 복귀 (정차 시)
- 전후·높이·등받이·쿠션·헤드레스트 조절
- 운전석·조수석 M1~M3 저장과 호출
- 저장 위치로 수동 시험 이동
- 자동 Easy Access ON/OFF
- 즉시 정지 요청
- 정차 상태, 화면 포커스, 시트 위치 센서 확인
- 위치 센서가 없는 시트의 저장·이동 버튼 자동 잠금

[한국어 설치·사용 안내](apps/seats_easy_access/README.ko.md) · [English guide](apps/seats_easy_access/README.md)

- [영어 USB 설치](downloads/seats-easy-access-0.6.6-usb.zip) · [영어 OAP](downloads/seats_easy_access@0.6.6.tgz)
- [한국어 USB 설치](downloads/seats-easy-access-ko-0.6.6-usb.zip) · [한국어 OAP](downloads/seats_easy_access_ko@0.6.6.tgz)

0.6.6에서는 **시동 시 M1 복귀**를 차량 켜짐부터 15초 대기 후 시도합니다. 정차 상태이며 Comfort가 3초 이상 대기 상태일 때 운전석 M1을 한 번 호출합니다. 운전석 M1을 먼저 저장한 뒤 옵션을 켜세요(기본 꺼짐). 자동 시작하며 화면이 닫혀도 감지합니다. **로그 → 사진 찍기·일시정지** 화면에서 호출 전 위치·목표 위치·호출 후 위치 변화를 촬영할 수 있습니다. 수동 M1 호출도 같은 기록을 남깁니다. 시동 직후 준비 시간 문제는 아직 추정이며 실차 해결 여부는 확인이 필요합니다. 대상 프로젝트에서 `node kit/tools/emu.js seats_easy_access`로 확인할 수 있고, PC의 PREVIEW 모드는 차량 소켓에 연결하지 않습니다.

## MGU Store 설치

**간편 설치 (HTTPS 카탈로그):** Store → Settings → Add source에 `https://raw.githubusercontent.com/jaimeen77-cmyk/Test/main/catalog.json`을 입력하세요. **Seats Easy Access (English)** 또는 **시트 Easy Access (한국어)**를 선택합니다. `IterioDev/car-apps` 소스도 추가해야 Comfort 의존성을 설치할 수 있습니다.

**소스 빌드 (main):** 아래 방법을 사용합니다.

Store의 **Settings → Add source**에서 `jaimeen77-cmyk/test`의 `main` 브랜치를 추가하거나 다음 카탈로그 주소를 사용합니다.

```text
https://raw.githubusercontent.com/jaimeen77-cmyk/test/main/catalog.json
```

GitHub Releases 배포는 아직 제공되지 않습니다. 현재는 위 HTTPS 카탈로그 또는 main 브랜치를 사용하세요.

필수 구성:

- iDrive 7용 MGU Store
- `mgu-deploy` 0.7.11 이상
- 원본 `iteriodev-comfort` 0.5.1 이상 (`IterioDev/car-apps`)

## 기존 프로젝트의 공용 빌드·설치

Cluster Redline·Storage처럼 원본 프로젝트에 overlay로 합친 뒤 빌드합니다. 이 저장소에서:

```sh
python tools/install-overlay.py ../idrive7-apps --apps seats_easy_access
```

대상 프로젝트에서:

```sh
python3 kit/tools/build.py seats_easy_access
python3 kit/tools/make_kit.py seats_easy_access
# 한국어
python3 kit/tools/make_kit.py seats_easy_access --language ko
```

소스는 `apps/seats_easy_access/`입니다. 대상의 원래 공용 빌더가 `.mgu`, `.tgz`와 설치 키트를 생성합니다. 별도 Seats 빌더로 공용 파일을 덮어쓰지 않습니다. [상세 안내](docs/SEATS-OVERLAY.ko.md)

실차 검증 전까지 실험용으로 취급하세요. 앱의 정지 요청은 물리적인 시트 정지를 보장하지 않으므로 처음 시험할 때는 순정 시트 스위치에 손이 닿는 상태를 유지해야 합니다.
