# Easy Access 복귀 진단

하차 위치로 이동하지만 문을 닫고 시동을 켤 때 복귀하지 않으면, 설정을 다시 저장하기 전에 로그를 수집하세요. 자동 복귀는 Seats 화면이 아닌 별도 Comfort 서비스가 수행합니다.

## PC에서 수집

기존 차량 SSH 연결의 IP와 키 파일 경로를 사용합니다. Windows PowerShell에서 저장소 최상위 기준:

```powershell
.\tools\collect-seats.ps1 -CarIp 192.168.0.10 -IdentityFile "C:\BMW\mgu_key" -DurationSeconds 180
```

IP와 키 경로는 실제 접속 정보로 바꿉니다. 새 키나 비밀번호를 입력받지 않습니다. `collect-seats.ps1`와 `collect-seats.js`가 같은 tools 폴더에 있어야 합니다.

수집을 시작한 다음 정차 상태에서 **시동 OFF → 운전석 문 열기 → 문 닫기 → 시동 ON → 10초 정도 대기** 순서로 증상을 한 번 재현합니다. 실행 중 화면을 열거나 닫았다면 그 시점도 기록해 주세요. 앱을 계속 열어 둘 필요는 없습니다.

PC에 `seats-report-날짜-시간.jsonl`이 생성됩니다. SSH가 끊겨도 이미 받은 내용은 남습니다. 이 파일과 재현 시각, 운전석/조수석 중 어느 좌석인지 보내면 됩니다. head unit이 잠들어 SSH가 종료되면 후반 로그가 누락될 수 있습니다.

이 도구는 상태 조회 `get`만 전송하고, Comfort journal과 Seats 앱 로그의 끝부분을 읽습니다. 시트 이동·정지·메모리·설정 변경·서비스 재시작을 요청하지 않습니다. VIN과 SSH 키 내용은 수집하지 않습니다.

## 로그에서 구분할 것

- `driver door closed` 또는 `car on`이 없는 경우: 문·전원 이벤트 전달 확인.
- `driver seat`가 빈 좌석으로 보고되는 경우: 알려진 착좌 정보가 복귀를 막는지 확인. 참고한 Comfort 구현은 운전석도 착좌 정보가 알려져 있으면 사람이 앉아 있어야 복귀합니다.
- `back: the car is not standing`: 시동 직후 정차 정보가 없거나 잘못 판단됐을 가능성. 참고 구현은 복귀 준비 조건의 false→true 변화에 반응하므로, 최초 시도 거절 후 다시 시도하지 않는지도 확인해야 합니다.
- `returnPending: false`: 복귀할 원래 위치가 남아 있지 않을 가능성. 저장 시점·서비스 재시작 등과 함께 판단합니다.
- `back driver: "stopped"` 등: 복귀 작업은 시작했지만 중단됨. Seats 화면 숨김·종료 로그와 시간 비교가 필요합니다. 현재 앱의 해당 경로가 전역 stop을 보내므로 자동화와 경합할 수 있습니다.
- `back` 작업 중 진단 오류나 `no positions`: 모듈 응답·위치 센서·세션 오류를 확인합니다.

이들은 코드에서 확인한 후보이며 실차의 확정 원인은 아닙니다. 설치된 Comfort 버전과 코드 해시도 보고서에 남겨 구현 차이를 확인합니다. Comfort 소스나 자동 복귀 로직은 변경하지 않습니다.

이미 재현한 직후 차량 SSH에서 빠르게 확인하려면:

```sh
journalctl -u iteriodev-comfort.service --since "15 minutes ago" --no-pager -n 600 -o short-iso
```
