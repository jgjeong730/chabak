// 공공데이터포털 고캠핑 API 연동 스텁.
// GOCAMPING_API_KEY 환경변수가 없으면 기존 시드 데이터(src/data/sites.json)를 그대로 둔다.
// 키가 준비되면 이 스크립트에서 API 호출 → src/data/sites.json 형식으로 매핑 → 파일 갱신하도록 확장한다.

const API_KEY = process.env.GOCAMPING_API_KEY;

if (!API_KEY) {
  console.log("GOCAMPING_API_KEY가 설정되지 않아 시드 데이터를 유지합니다.");
  process.exit(0);
}

console.log("TODO: 고캠핑 API(https://gocamping.or.kr) 연동 로직을 구현하세요.");
