import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import L from "leaflet";
import "leaflet.markercluster";
import "./style.css";

const TYPE_LABEL = { free: "무료", fee: "유료", reservation: "예약제" };
const SOURCE_LABEL = { official: "공식", community: "제보" };

const state = {
  sites: [],
  query: "",
  region: "all",
  type: "all",
  amenities: new Set(),
  view: "map",
  selectedId: null,
};

function filteredSites() {
  const q = state.query.trim().toLowerCase();
  return state.sites.filter((s) => {
    if (state.region !== "all" && s.region !== state.region) return false;
    if (state.type === "bookable") {
      if (s.type === "free") return false;
    } else if (state.type !== "all" && s.type !== state.type) {
      return false;
    }
    for (const a of state.amenities) {
      if (a === "반려동물") {
        if (!s.pet) return false;
      } else if (a === "모토캠핑") {
        if (!s.moto) return false;
      } else if (!s.amenities.includes(a)) {
        return false;
      }
    }
    if (q && !(s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q))) return false;
    return true;
  });
}

function kakaoSearchLink(site) {
  return `https://map.kakao.com/link/search/${encodeURIComponent(site.name + " " + site.address)}`;
}

function blogSearchLink(site) {
  return `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(site.name + " 후기")}`;
}

function videoSearchLink(site) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(site.name + " 후기")}`;
}

function priceLabel(site) {
  if (site.type === "free") return "무료";
  if (site.price) return `${site.price.toLocaleString()}원~`;
  return "요금 문의";
}

// ---------- layout ----------
const app = document.getElementById("app");
app.innerHTML = `
  <div class="app">
    <div class="topbar">
      <div class="brand"><span class="sw"></span>차박Seek</div>
      <div class="kpis" id="kpis"></div>
      <button class="theme-toggle" id="themeToggle">테마</button>
    </div>
    <div class="disclaimer">
      <b>안내</b> "제보" 배지 장소는 커뮤니티 정보 기반이며 주정차·야영 가능 여부는 현지 규정을 반드시 확인하세요. 최근 확인일이 오래된 장소는 방문 전 재확인을 권장합니다.
    </div>
    <div class="filterbar">
      <input type="text" id="search" placeholder="장소명 또는 주소 검색" />
      <select id="regionSelect"></select>
      <div class="chip-group" id="typeGroup">
        <span class="chip type-chip active" data-type="all">전체</span>
        <span class="chip type-chip" data-type="free">무료</span>
        <span class="chip type-chip" data-type="fee">유료</span>
        <span class="chip type-chip" data-type="reservation">예약제</span>
        <span class="chip type-chip" data-type="bookable">예약 가능만</span>
      </div>
      <span class="filter-divider"></span>
      <span class="chip" data-amenity="전기">전기</span>
      <span class="chip" data-amenity="화장실">화장실</span>
      <span class="chip" data-amenity="반려동물">반려동물 동반</span>
      <span class="chip" data-amenity="모토캠핑">🏍️ 모토캠핑 가능</span>
    </div>
    <div class="body view-map" id="body">
      <div class="map-panel">
        <div class="view-tabs">
          <button data-view="map" class="active">지도</button>
          <button data-view="list">리스트</button>
        </div>
        <div id="map"></div>
        <div class="map-legend">
          <span><i style="background:var(--good)"></i>무료</span>
          <span><i style="background:var(--warn)"></i>유료</span>
          <span><i style="background:var(--resv)"></i>예약제</span>
        </div>
      </div>
      <div class="list-panel" id="listPanel"><div class="empty">불러오는 중...</div></div>
    </div>
  </div>
  <div class="overlay hidden" id="overlay">
    <div class="detail" id="detail"></div>
  </div>
`;

// ---------- theme ----------
const themeToggle = document.getElementById("themeToggle");
function applyTheme(mode) {
  if (mode === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", mode);
  }
  localStorage.setItem("chabak-theme", mode);
  themeToggle.textContent = mode === "system" ? "테마: 자동" : mode === "dark" ? "테마: 다크" : "테마: 라이트";
}
const savedTheme = localStorage.getItem("chabak-theme") || "system";
applyTheme(savedTheme);
themeToggle.addEventListener("click", () => {
  const order = ["system", "light", "dark"];
  const current = localStorage.getItem("chabak-theme") || "system";
  applyTheme(order[(order.indexOf(current) + 1) % order.length]);
});

// ---------- region options ----------
const regionSelect = document.getElementById("regionSelect");
function populateRegionOptions() {
  const regions = ["all", ...new Set(state.sites.map((s) => s.region))];
  regionSelect.innerHTML = regions
    .map((r) => `<option value="${r}">${r === "all" ? "전체 지역" : r}</option>`)
    .join("");
}

// ---------- map ----------
const KOREA_BOUNDS = L.latLngBounds([32.9, 124.5], [38.7, 131.0]);
const map = L.map("map", {
  zoomControl: true,
  minZoom: 7,
  maxBounds: KOREA_BOUNDS.pad(0.15),
  maxBoundsViscosity: 1.0,
}).fitBounds(KOREA_BOUNDS);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
  maxZoom: 18,
  noWrap: true,
  bounds: KOREA_BOUNDS,
}).addTo(map);
const clusterGroup = L.markerClusterGroup({ maxClusterRadius: 50 });
map.addLayer(clusterGroup);
const markerById = new Map();

function pinIcon(type) {
  return L.divIcon({
    className: "",
    html: `<div class="pin-icon ${type}"></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  });
}

function renderMap(sites) {
  clusterGroup.clearLayers();
  markerById.clear();
  sites.forEach((site) => {
    const marker = L.marker([site.lat, site.lng], { icon: pinIcon(site.type) });
    marker.on("click", () => selectSite(site.id));
    marker.bindTooltip(site.name, { direction: "top", offset: [0, -24] });
    clusterGroup.addLayer(marker);
    markerById.set(site.id, marker);
  });
}

// ---------- list ----------
const listPanel = document.getElementById("listPanel");
function renderList(sites) {
  if (sites.length === 0) {
    listPanel.innerHTML = `<div class="empty">조건에 맞는 차박지가 없습니다. 필터를 조정해 보세요.</div>`;
    return;
  }
  listPanel.innerHTML =
    `<div class="list-count">${sites.length}곳</div>` +
    sites
      .map(
        (s) => `
      <div class="item ${s.id === state.selectedId ? "selected" : ""}" data-id="${s.id}">
        <div class="thumb">${s.type === "free" ? "🅿️" : s.type === "fee" ? "🏕️" : "📅"}</div>
        <div>
          <div class="name">${s.name}</div>
          <div class="meta">
            <span class="badge ${s.type}">${TYPE_LABEL[s.type]}</span>
            <span class="badge source">${SOURCE_LABEL[s.source]}</span>
            <span>${s.region} · ${priceLabel(s)}</span>
          </div>
        </div>
      </div>`
      )
      .join("");
  listPanel.querySelectorAll(".item").forEach((el) => {
    el.addEventListener("click", () => selectSite(el.dataset.id));
  });
}

// ---------- KPIs ----------
function renderKpis(sites) {
  const total = state.sites.length;
  const free = state.sites.filter((s) => s.type === "free").length;
  const regionsCount = new Set(state.sites.map((s) => s.region)).size;
  const shown = sites.length;
  document.getElementById("kpis").innerHTML = `
    <div class="kpi"><div class="n">${total}</div><div class="l">전체 등록</div></div>
    <div class="kpi"><div class="n">${free}</div><div class="l">무료 사이트</div></div>
    <div class="kpi"><div class="n">${regionsCount}</div><div class="l">커버 지역</div></div>
    <div class="kpi"><div class="n">${shown}</div><div class="l">현재 필터 결과</div></div>
  `;
}

// ---------- detail ----------
const overlay = document.getElementById("overlay");
const detail = document.getElementById("detail");
function selectSite(id) {
  state.selectedId = id;
  const site = state.sites.find((s) => s.id === id);
  if (!site) return;
  const marker = markerById.get(id);
  if (marker) {
    map.flyTo([site.lat, site.lng], Math.max(map.getZoom(), 12), { duration: 0.6 });
    marker.openTooltip();
  }
  detail.innerHTML = `
    <button class="close" id="closeDetail">✕</button>
    <span class="badge ${site.type}">${TYPE_LABEL[site.type]}</span>
    <span class="badge source">${SOURCE_LABEL[site.source]}</span>
    <h2>${site.name}</h2>
    <div class="addr">${site.address}</div>
    <div class="row"><span class="k">요금</span><span>${priceLabel(site)}</span></div>
    <div class="row"><span class="k">반려동물 동반</span><span>${site.pet ? "가능" : "불가"}</span></div>
    <div class="row"><span class="k">모토캠핑</span><span>${site.moto ? "적합" : "정보 없음"}</span></div>
    <div class="amenities">${site.amenities.map((a) => `<span>${a}</span>`).join("")}</div>
    <div class="actions">
      ${site.link ? `<a class="primary" href="${site.link}" target="_blank" rel="noopener">예약 페이지</a>` : ""}
      <a class="${site.link ? "secondary" : "primary"}" href="${kakaoSearchLink(site)}" target="_blank" rel="noopener">길찾기</a>
    </div>
    <div class="review-links">
      <a href="${blogSearchLink(site)}" target="_blank" rel="noopener">📝 블로그 후기 찾기</a>
      <a href="${videoSearchLink(site)}" target="_blank" rel="noopener">▶ 유튜브 후기 찾기</a>
    </div>
    <div class="verify">최근 확인일 ${site.lastVerified} · ${SOURCE_LABEL[site.source]} 정보</div>
  `;
  document.getElementById("closeDetail").addEventListener("click", closeDetail);
  overlay.classList.remove("hidden");
  refresh({ keepMap: true });
}
function closeDetail() {
  state.selectedId = null;
  overlay.classList.add("hidden");
}
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) closeDetail();
});

// ---------- filter bar events ----------
document.getElementById("search").addEventListener("input", (e) => {
  state.query = e.target.value;
  refresh();
});
regionSelect.addEventListener("change", (e) => {
  state.region = e.target.value;
  refresh();
});
document.querySelectorAll(".type-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    state.type = chip.dataset.type;
    document.querySelectorAll(".type-chip").forEach((c) => c.classList.toggle("active", c === chip));
    refresh();
  });
});
document.querySelectorAll(".chip[data-amenity]").forEach((chip) => {
  chip.addEventListener("click", () => {
    const a = chip.dataset.amenity;
    if (state.amenities.has(a)) {
      state.amenities.delete(a);
      chip.classList.remove("active");
    } else {
      state.amenities.add(a);
      chip.classList.add("active");
    }
    refresh();
  });
});

// ---------- view toggle (mobile) ----------
const bodyEl = document.getElementById("body");
document.querySelectorAll(".view-tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.view = btn.dataset.view;
    document.querySelectorAll(".view-tabs button").forEach((b) => b.classList.toggle("active", b === btn));
    bodyEl.className = `body view-${state.view}`;
    if (state.view === "map") setTimeout(() => map.invalidateSize(), 50);
  });
});

// ---------- refresh ----------
function refresh({ keepMap = false } = {}) {
  const sites = filteredSites();
  renderKpis(sites);
  renderList(sites);
  if (!keepMap) renderMap(sites);
}

// ---------- data load ----------
async function loadData() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/sites.json`);
    const data = await res.json();
    state.sites = data.sites;
  } catch (err) {
    console.error("데이터 로드 실패:", err);
    state.sites = [];
  }
  populateRegionOptions();
  refresh();
  setTimeout(() => map.invalidateSize(), 100);
}
loadData();
