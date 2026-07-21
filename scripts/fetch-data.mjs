// 큐레이션 데이터(src/data/curated.json) + 고캠핑 API(한국관광공사, 공공데이터포털) 응답을 합쳐
// src/data/sites.json을 생성한다. GOCAMPING_API_KEY가 없거나 API 호출이 실패하면
// 큐레이션 데이터만으로 sites.json을 만들어 빌드가 절대 깨지지 않도록 한다.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CURATED_PATH = path.join(__dirname, "..", "src", "data", "curated.json");
const OUTPUT_PATH = path.join(__dirname, "..", "src", "data", "sites.json");

const API_KEY = process.env.GOCAMPING_API_KEY;
const BASE_URL = "https://apis.data.go.kr/B551011/GoCamping/basedList";
const PAGE_SIZE = 300;
const MAX_PAGES = 30; // 안전장치: 최대 9,000건까지만 순회

const AMENITY_RULES = [
  ["전기", ["전기"]],
  ["화장실", ["화장실"]],
  ["샤워장", ["샤워"]],
  ["개수대", ["개수대", "취사"]],
  ["편의점", ["편의점", "매점"]],
  ["해변", ["해수욕장", "해변"]],
  ["계곡", ["계곡"]],
];

function deriveAmenities(...texts) {
  const joined = texts.filter(Boolean).join(" ");
  return AMENITY_RULES.filter(([, keywords]) => keywords.some((k) => joined.includes(k))).map(([label]) => label);
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

function deriveRegion(addr1) {
  const text = addr1 || "";
  const hit = REGION_PREFIXES.find(([prefix]) => text.startsWith(prefix));
  return hit ? hit[1] : text.split(" ")[0] || "기타";
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

  return {
    id: `gc-${item.contentId}`,
    name: item.facltNm.trim(),
    region: deriveRegion(item.addr1),
    address: [item.addr1, item.addr2].filter(Boolean).join(" ").trim(),
    lat,
    lng,
    type: "fee",
    source: "official",
    price: null,
    amenities: deriveAmenities(item.sbrsCl, item.sbrsEtc, item.posblFcltyCl, item.lineIntro, item.intro),
    pet,
    lastVerified: (item.modifiedtime || item.createdtime || "").slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3") || null,
    provider: "gocamping",
    link: item.homepage?.match(/https?:\/\/[^\s"'<>]+/)?.[0] || "https://gocamping.or.kr",
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

  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf-8");
  console.log(`sites.json 생성 완료: 큐레이션 ${curated.sites.length}건 + 고캠핑 ${gocampingSites.length}건 = 총 ${sites.length}건`);
}

main();
