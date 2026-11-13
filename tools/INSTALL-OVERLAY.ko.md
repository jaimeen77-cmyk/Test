# Seats 한국어 소스 overlay

기존 `apps` 같은 MGU Store 저장소에 한국어 Seats를 추가합니다.

```sh
python3 tools/install-overlay.py /path/to/apps
```

대상 루트에 `seats-easy-access/` 소스를 복사하고 `mgu-repo.json`에 독립 빌드 항목을 추가합니다. 기존 앱과 도구 항목은 유지합니다. 같은 내용은 재실행할 수 있으며, 수정된 Seats 파일과 충돌하면 복사 전에 중단합니다. 확인 후 교체할 때만 `--force`를 사용하세요.

대상에서 Seats는 한국어 리소스만 만들고 기본 언어도 한국어로 설정됩니다. Comfort는 별도 원본 의존성이므로 `IterioDev/car-apps` 소스가 필요합니다.

대상 변경을 커밋·푸시한 뒤 MGU Store에서 해당 저장소의 main 채널을 새로고침하면 **시트 Easy Access**가 표시됩니다. `catalog.json` 직접 주소 채널 대신 main 저장소 채널을 사용하세요.
