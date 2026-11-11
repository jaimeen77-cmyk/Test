# G20 Seat Test 0.1.0

2020 BMW G20의 iDrive 7에서 시트 상태를 확인하고, 조건 확인 후 빈 조수석 전후 축의 짧은 이동을 한 번 요청하는 실험용 앱입니다. 실제 이동 요청 기능을 포함하며, 기본은 조회 전용입니다.

**MGU Store용 패키지와 소스입니다. 사용자 차량에서 설치·작동은 아직 검증하지 않았습니다.** 모의 검사 14개와 패키지 구조 검사를 통과했습니다. 정지 요청은 물리적 정지 확인을 뜻하지 않습니다.

## MGU Store에서 설치

1. Store의 **Settings → Add source**에 `jaimeen77-cmyk/Test`를 입력합니다.
2. **main 브랜치**를 선택합니다. 이 저장소에는 태그나 GitHub Release가 없습니다.
3. **Seat Test (G20 experimental)**를 선택해 설치합니다.

앱은 차량에서 소스로 빌드하고, 차량의 SDK를 연결해 설치하도록 구성했습니다. BMW SDK·펌웨어는 포함하지 않습니다. 기존 **Comfort / iteriodev-comfort 0.5.1 이상**, **mgu-deploy 0.7.11 이상**이 필요합니다. Comfort를 찾지 못하면 원본 소스 `IterioDev/car-apps`도 Store에 추가하세요.

저장소 방식 대신 미리 만든 패키지를 사용하려면 Add source에 다음 카탈로그 주소를 입력할 수도 있습니다.

```text
https://raw.githubusercontent.com/jaimeen77-cmyk/Test/main/catalog.json
```

## USB로 설치

[USB 설치 묶음 다운로드](https://raw.githubusercontent.com/jaimeen77-cmyk/Test/main/downloads/g20-seat-test-0.1.0-usb.zip)

압축을 풀고 `mgu-repo` 폴더를 USB 최상위에 복사한 다음 **MGU Store → USB**에서 설치합니다. 오프라인 설치 전에는 필요한 Comfort 도구가 차량에 설치되어 있어야 합니다.

## 첫 시험

정차·P단·주차브레이크·빈 조수석 상태에서 **상태 새로 확인 → 빈 조수석 확인 → 조수석 전후 + 또는 -** 순서로 진행합니다. 속도 0과 P단을 새로 확인하지 못하거나 화면 포커스·서비스 상태가 불명확하면 이동을 잠급니다. 운전석 이동과 자동 이동 기능은 제공하지 않습니다.

한 번의 이동 요청 후 250ms 뒤 STOP 전송을 예약합니다. **실제 모터 구동 시간이 250ms로 보장되는 것은 아닙니다.** 통신 지연이나 반응 이상이 있으면 추가 이동을 요청하지 마세요.

- [한국어 설치·사용 안내](g20-seat-test/README.ko.md)
- [모의 검사와 검증 한계](g20-seat-test/TEST_RESULTS.md)
- [소스 코드](g20-seat-test/src)
- [배포용 OAP 패키지](downloads/g20_seat_test@0.1.0.tgz)

## 개발

```sh
cd g20-seat-test
node test/test.js
python3 tools/build.py
python3 test/package_check.py
```

앱 코드는 MIT이며 기반 코드의 고지는 [NOTICE](g20-seat-test/NOTICE)와 [라이선스](g20-seat-test/THIRD_PARTY_LICENSES/idrive7-apps.txt)에 있습니다. IterioDev의 Comfort 소스·바이너리는 포함하지 않으며 원본 서비스는 별도 라이선스를 따릅니다.
