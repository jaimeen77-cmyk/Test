# BMW iDrive 7 시트 앱

2020 BMW G20과 iDrive 7에서 시험하기 위한 시트 앱 저장소입니다. BMW SDK·펌웨어나 IterioDev Comfort 바이너리는 포함하지 않습니다.

## Seats Easy Access 0.3.0

실제 시트 그림을 중심으로 운전석과 조수석을 조절하고 메모리와 Easy Access를 사용하는 앱입니다.

- 운전석·조수석 하차 위치 저장
- 전후·높이·등받이·쿠션·헤드레스트 조절
- 운전석·조수석 M1~M3 저장과 호출
- 저장 위치로 수동 시험 이동
- 자동 Easy Access ON/OFF
- 즉시 정지 요청
- 정차 상태, 화면 포커스, 시트 위치 센서 확인
- 위치 센서가 없는 시트의 저장·이동 버튼 자동 잠금

[한국어 설치·사용 안내](seats-easy-access/README.ko.md) · [USB 설치 묶음](downloads/seats-easy-access-0.3.0-usb.zip) · [OAP 패키지](downloads/seats_easy_access@0.3.0.tgz)

## G20 Seat Test 0.1.0

빈 조수석의 전후 축을 한 번 짧게 움직여 차량 호환성을 확인하는 보수적인 실험용 앱입니다. 자동 Easy Access와 운전석 이동은 제공하지 않습니다.

[한국어 안내](g20-seat-test/README.ko.md) · [USB 설치 묶음](downloads/g20-seat-test-0.1.0-usb.zip) · [OAP 패키지](downloads/g20_seat_test@0.1.0.tgz)

## MGU Store 설치

Store의 **Settings → Add source**에서 `jaimeen77-cmyk/test`의 `main` 브랜치를 추가하거나 다음 카탈로그 주소를 사용합니다.

```text
https://raw.githubusercontent.com/jaimeen77-cmyk/test/main/catalog.json
```

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
