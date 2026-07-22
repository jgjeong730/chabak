// 큐레이션 데이터(src/data/curated.json) + 고캠핑 API(한국관광공사, 공공데이터포털) 응답을 합쳐
// src/data/sites.json을 생성한다. GOCAMPING_API_KEY가 없거나 API 호출이 실패하면
// 큐레이션 데이터만으로 sites.json을 만들어 빌드가 절대 깨지지 않도록 한다.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CURATED_PATH = path.join(__dirname, "..", "src", "data", "curated.json");
const OUTPUT_PATH = path.join(__dirname, "..", "public", "data", "sites.json");

const API_KEY = process.env.GOCAMPING_API_KEY;
const BASE_URL = "https://apis.data.go.kr/B551011/GoCamping/basedList";
const PAGE_SIZE = 300;
const MAX_PAGES = 30; // 안전장치: 최대 9,000건까지만 순회

const TEXT_AMENITY_RULES = [
  ["전기", ["전기"]],
  ["편의점", ["편의점", "마트"]],
  ["해변", ["해수욕", "해변"]],
  ["계곡", ["계곡"]],
];

function deriveAmenities(item) {
  const text = [item.sbrsCl, item.sbrsEtc, item.posblFcltyCl, item.lctCl, item.lineIntro]
    .filter(Boolean)
    .join(" ");
  const amenities = TEXT_AMENITY_RULES.filter(([, keywords]) => keywords.some((k) => text.includes(k))).map(
    ([label]) => label
  );
  if (Number(item.toiletCo) > 0) amenities.push("화장실");
  if (Number(item.swrmCo) > 0) amenities.push("샤워장");
  if (Number(item.wtrplCo) > 0) amenities.push("개수대");
  return [...new Set(amenities)];
}

function deriveVerifiedDate(item) {
  const raw = item.modifiedtime || item.createdtime || "";
  if (!raw) return null;
  return raw.includes("-") ? raw : raw.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
}

const REGION_PREFIXES = [
  ["서울특별시", "서울"],
  ["부산광역시", "부산"],
  ["대구광역시", "대구"],
  ["인천광역시", "인천"],
  ["광주광역시", "광주"],
  ["대전광역시", "대전"],
  ["울산광역시", "울산"],
  ["세종특별자치시", "세종"],
  ["경기도", "경기"],
  ["강원특별자치도", "강원"],
  ["강원도", "강원"],
  ["충청북도", "충북"],
  ["충청남도", "충남"],
  ["전북특별자치도", "전북"],
  ["전라북도", "전북"],
  ["전라남도", "전남"],
  ["경상북도", "경북"],
  ["경상남도", "경남"],
  ["제주특별자치도", "제주"],
];

const GWANGJU_GU = ["동구", "서구", "남구", "북구", "광산구"];

function deriveRegion(doNm, addr1) {
  // 2026년 전남-광주 행정통합으로 doNm이 "전남광주통합특별시"로 오는 경우, 시군구명으로 광주/전남을 재구분한다.
  if (doNm?.includes("전남") && doNm?.includes("광주")) {
    const sigungu = (addr1 || "").split(" ")[1] || "";
    return GWANGJU_GU.includes(sigungu) ? "광주" : "전남";
  }
  const text = doNm || addr1 || "";
  const hit = REGION_PREFIXES.find(([prefix]) => text.startsWith(prefix));
  return hit ? hit[1] : (addr1 || "").split(" ")[0] || "기타";
}

async function fetchGoCampingItems() {
  if (!API_KEY) {
    console.log("GOCAMPING_API_KEY가 없어 큐레이션 데이터만 사용합니다.");
    return [];
  }

  const items = [];
  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
    const url = new URL(BASE_URL);
    url.searchParams.set("serviceKey", API_KEY);
    url.searchParams.set("numOfRows", String(PAGE_SIZE));
    url.searchParams.set("pageNo", String(pageNo));
    url.searchParams.set("MobileOS", "ETC");
    url.searchParams.set("MobileApp", "chabak");
    url.searchParams.set("_type", "json");

    let res;
    try {
      res = await fetch(url);
    } catch (err) {
      console.warn(`고캠핑 API 요청 실패(네트워크): ${err.message}`);
      break;
    }

    if (!res.ok) {
      const body = await res.text();
      console.warn(`고캠핑 API 요청 실패: HTTP ${res.status} — ${body.slice(0, 200)}`);
      break;
    }

    const json = await res.json();
    const header = json?.response?.header;
    if (header && header.resultCode !== "0000") {
      console.warn(`고캠핑 API 오류: ${header.resultCode} ${header.resultMsg}`);
      break;
    }

    const body = json?.response?.body;
    const raw = body?.items?.item;
    const pageItems = Array.isArray(raw) ? raw : raw ? [raw] : [];
    items.push(...pageItems);

    const totalCount = Number(body?.totalCount ?? 0);
    if (pageItems.length === 0 || items.length >= totalCount) break;
  }

  console.log(`고캠핑 API에서 ${items.length}건 수신`);
  return items;
}

function mapGoCampingItem(item) {
  const lat = Number(item.mapY);
  const lng = Number(item.mapX);
  if (!lat || !lng || !item.facltNm) return null;

  const animalText = `${item.animalCmgCl ?? ""} ${item.animalCmgClEtc ?? ""}`;
  const pet = animalText.includes("가능") && !animalText.includes("불가능");
  // 일반야영장(텐트 사이트)만 모토캠핑 적합으로 본다. 자동차야영장 전용·글램핑·카라반은 제외.
  const moto = (item.induty || "").includes("일반야영장");

  return {
    id: `gc-${item.contentId}`,
    name: item.facltNm.trim(),
    region: deriveRegion(item.doNm, item.addr1),
    address: [item.addr1, item.addr2].filter(Boolean).join(" ").trim(),
    lat,
    lng,
    type: "fee",
    source: "official",
    price: null,
    amenities: deriveAmenities(item),
    pet,
    moto,
    lastVerified: deriveVerifiedDate(item),
    provider: "gocamping",
    link: item.homepage?.match(/https?:\/\/[^\s"'<>]+/)?.[0] || "https://gocamping.or.kr",
    image: item.firstImageUrl?.match(/^https?:\/\//) ? item.firstImageUrl : null,
  };
}

async function main() {
  const curated = JSON.parse(await readFile(CURATED_PATH, "utf-8"));
  const rawItems = await fetchGoCampingItems();
  const gocampingSites = rawItems.map(mapGoCampingItem).filter(Boolean);

  const sites = [...curated.sites, ...gocampingSites];

  const output = {
    generatedAt: new Date().toISOString(),
    source: gocampingSites.length > 0 ? "curated+gocamping" : "curated-only",
    curatedCount: curated.sites.length,
    gocampingCount: gocampingSites.length,
    sites,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf-8");
  console.log(`sites.json 생성 완료: 큐레이션 ${curated.sites.length}건 + 고캠핑 ${gocampingSites.length}건 = 총 ${sites.length}건`);
}

main();
