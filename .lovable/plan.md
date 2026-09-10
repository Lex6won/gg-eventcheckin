# 재배포 계획

1. 보안 스캔 결과 확인: 최신 `security--get_scan_results`를 조회해 미해결 critical finding이 있는지 확인.
2. 배포 진행: critical finding이 없거나 워크스페이스 게이트를 통과하면 `preview_ui--publish`로 현재 프로젝트를 재배포.
3. 결과 안내: 배포 예상 URL(`gg-eventcheckin.lovable.app`)과 약 1분 뒤 라이브 반영됨을 전달.

- 스캔에서 critical finding이 발견되면, 워크스페이스 설정에 따라 배포가 차단될 수 있으며 이 경우 먼저 수정을 진행.
