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

`src/data/curated.json`은 수동 큐레이션 데이터(무료 노지, 국립공원 등)다.
`npm run fetch-data`가 이 파일과 고캠핑 API(공공데이터포털, `GOCAMPING_API_KEY` 필요) 응답을 합쳐
`public/data/sites.json`을 생성하고, 앱은 이 파일을 런타임에 fetch한다. `npm run build` 시 자동 실행된다.
매주 월요일 GitHub Actions(`refresh-data.yml`)가 자동으로 갱신한다.
