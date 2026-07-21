# 차박Seek

전국 오토캠핑장 · 예약제 야영장 · 무료 차박지를 지도와 필터로 찾는 대시보드.
[campseek](https://heekeunlee.github.io/campseek/), [korea_festival](https://heekeunlee.github.io/korea_festival/)를 벤치마킹해 설계했다.

## 개발

```
npm install
npm run dev
```

## 배포

`main` 브랜치에 push하면 GitHub Actions가 빌드 후 GitHub Pages에 자동 배포한다.
https://jgjeong730.github.io/chabak/

## 데이터

`src/data/sites.json`은 현재 시드(샘플) 데이터다. 공공데이터포털에서 고캠핑 API 키를 발급받아
`GOCAMPING_API_KEY` 환경변수로 설정하고 `npm run fetch-data`를 확장하면 실데이터로 교체할 수 있다.
