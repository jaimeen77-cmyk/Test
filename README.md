# BMW iDrive 7 시트 앱

2020 BMW G20과 iDrive 7에서 시험하기 위한 시트 앱 저장소입니다. BMW SDK·펌웨어나 IterioDev Comfort 바이너리는 포함하지 않습니다.

## Seats Easy Access 0.3.2

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

[한국어 설치·사용 안내](seats-easy-access/README.ko.md) · [USB 설치 묶음](downloads/seats-easy-access-0.3.2-usb.zip) · [OAP 패키지](downloads/seats_easy_access@0.3.2.tgz)

## MGU Store 설치

**간편 설치 (HTTPS 카탈로그):** Store → Settings → Add source에 `https://raw.githubusercontent.com/jaimeen77-cmyk/Test/main/catalog.json`을 입력하세요. **Seats Easy Access 0.3.2**를 선택해 설치합니다. `IterioDev/car-apps` 소스도 추가해야 Comfort 의존성을 설치할 수 있습니다. 이 방법은 완성된 OAP 패키지를 내려받으므로 차량에서 Python 빌드를 실행하지 않습니다.

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

## 개발 검사

```sh
cd seats-easy-access
node test/test.js
python3 tools/build.py
python3 test/package_check.py
```

실차 검증 전까지 실험용으로 취급하세요. 앱의 정지 요청은 물리적인 시트 정지를 보장하지 않으므로 처음 시험할 때는 순정 시트 스위치에 손이 닿는 상태를 유지해야 합니다.
