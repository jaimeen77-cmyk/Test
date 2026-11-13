# Seats 한국어 소스 overlay

기존 `apps` 같은 MGU Store 저장소에 한국어 Seats를 추가합니다.

```sh
python3 tools/install-overlay.py /path/to/apps
```

대상 `apps/seats_easy_access/`에 소스를 복사하고 공용 `kit/tools/build.py`와 MGU Store 빌드 항목을 추가합니다. 기존 앱과 도구 항목은 유지합니다. 공용 빌드 파일이나 Seats 파일이 다르면 복사 전에 중단합니다. 기존 빌드 파일이 있는 저장소에는 내용을 검토해 통합하세요. `--force`는 충돌 파일을 교체합니다.

빌드: `python3 kit/tools/build.py --language ko seats_easy_access`. 결과는 `dist/`에 생성됩니다.

대상에서 Seats는 한국어 리소스만 만들고 기본 언어도 한국어로 설정됩니다. Comfort는 별도 원본 의존성이므로 `IterioDev/car-apps` 소스가 필요합니다.

대상 변경을 커밋·푸시한 뒤 MGU Store에서 해당 저장소의 main 채널을 새로고침하면 **시트 Easy Access**가 표시됩니다. `catalog.json` 직접 주소 채널 대신 main 저장소 채널을 사용하세요.
