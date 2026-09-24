const FINGER_LAKES = { lat: 42.60, lng: -76.95, zoom: 8.7 };

// Google Maps IDs
// OFF uses the cloud style where Points of Interest are hidden.
// ON uses Google's default style where Points of Interest are visible.
const MAP_ID_DESTINATIONS_OFF = "39e3e5d57f6a3b577a866c0a";
const MAP_ID_DESTINATIONS_ON = "39e3e5d57f6a3b5794f5fdf2";

const state = {
  map: null,
  locations: [],
  categories: [],
  categoryIcons: {},
  markers: [],
  info: null
};

/*
 * Airtable single-select color -> map marker color.
 * These are approximate web equivalents of Airtable's palette.
 */
const AIRTABLE_COLORS = {
  blueLight2: "#C6E2FF",
  cyanLight2: "#C4ECF7",
  tealLight2: "#C8F1E4",
  greenLight2: "#D1F2C4",
  yellowLight2: "#FFEAB6",
  orangeLight2: "#FFD4B8",
  redLight2: "#FFD1CC",
  pinkLight2: "#F8D4E8",
  purpleLight2: "#E5D5F5",
  grayLight2: "#E2E2E2",

  blueLight1: "#9CC7FF",
  cyanLight1: "#8ED7E8",
  tealLight1: "#8ADBC1",
  greenLight1: "#A7E68F",
  yellowLight1: "#FFDA7A",
  orangeLight1: "#FFB77D",
  redLight1: "#FFA39A",
  pinkLight1: "#F4A6CF",
  purpleLight1: "#C9A6E8",
  grayLight1: "#C4C4C4",

  blueBright: "#2D7FF9",
  cyanBright: "#18BFFF",
  tealBright: "#20C997",
  greenBright: "#20C933",
  yellowBright: "#F7C948",
  orangeBright: "#FF8C42",
  redBright: "#F82B60",
  pinkBright: "#F65CC6",
  purpleBright: "#8B46FF",
  grayBright: "#666666",

  blueDark1: "#1B5DBF",
  cyanDark1: "#0B87A6",
  tealDark1: "#147D64",
  greenDark1: "#1F7A34",
  yellowDark1: "#B88700",
  orangeDark1: "#B85B16",
  redDark1: "#B51E3D",
  pinkDark1: "#A83283",
  purpleDark1: "#5B2A9D",
  grayDark1: "#444444"
};

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function norm(v) {
  return String(v || "Other")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function categoryConfig(categoryName) {
  const wanted = norm(categoryName);

  return state.categories.find(
    c => norm(c.name) === wanted
  ) || null;
}

function categoryColor(categoryName) {
  const category = categoryConfig(categoryName);

  if (!category) {
    const other = categoryConfig("Other");
    if (other) {
      return AIRTABLE_COLORS[other.airtableColor] || "#666666";
    }
    return "#666666";
  }

  return AIRTABLE_COLORS[category.airtableColor] || "#666666";
}

function categoryIcon(categoryName) {
  const exact = state.categoryIcons[categoryName];

  if (exact) return exact;

  const wanted = norm(categoryName);

  const matchingKey = Object.keys(state.categoryIcons).find(
    key => norm(key) === wanted
  );

  if (matchingKey) return state.categoryIcons[matchingKey];

  return state.categoryIcons.Other || "radio_button_unchecked";
}

function styleFor(categoryName) {
  const category = categoryConfig(categoryName);

  return {
    icon: categoryIcon(categoryName),
    color: categoryColor(categoryName),
    label: category?.name || categoryName || "Other"
  };
}

function youtubeId(url) {
  try {
    const u = new URL(url);

    if (u.hostname === "youtu.be") {
      return u.pathname.slice(1).split(/[/?#]/)[0];
    }

    if (u.hostname.includes("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");

      if (
        u.pathname.startsWith("/shorts/") ||
        u.pathname.startsWith("/embed/")
      ) {
        return u.pathname.split("/")[2];
      }
    }
  } catch (_) {}

  const m = String(url || "").match(
    /(?:v=|youtu\.be\/|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{6,})/
  );

  return m ? m[1] : null;
}

function selectedChannels() {
  const s = new Set();

  if (document.querySelector("#flockToggle").checked) s.add("flock");
  if (document.querySelector("#poomToggle").checked) s.add("poom");

  return s;
}

function visibleLocations() {
  const s = selectedChannels();
  return state.locations.filter(x => s.has(x.channel));
}

function groupLocations(items) {
  const m = new Map();

  for (const x of items) {
    const key =
      `${Number(x.lat).toFixed(6)},${Number(x.lng).toFixed(6)}`;

    if (!m.has(key)) {
      m.set(key, {
        key,
        lat: Number(x.lat),
        lng: Number(x.lng),
        episodes: [],
        address: "",
        addressStreet: "",
        addressTown: "",
        addressState: "",
        addressZip: "",
        addressCountry: ""
      });
    }

    const g = m.get(key);
    g.episodes.push(x);

    if (!g.address && x.address) {
      Object.assign(g, {
        address: x.address,
        addressStreet: x.addressStreet,
        addressTown: x.addressTown,
        addressState: x.addressState,
        addressZip: x.addressZip,
        addressCountry: x.addressCountry
      });
    }
  }

  return [...m.values()];
}

function groupStyle(g) {
  const cats = [
    ...new Set(g.episodes.map(e => norm(e.mapCategory)))
  ];

  if (cats.length === 1) {
    return styleFor(g.episodes[0].mapCategory);
  }

  return styleFor("Other");
}

function addressHtml(g) {
  const lines = [];

  if (g.addressStreet) {
    lines.push(`<div>${esc(g.addressStreet)}</div>`);
  }

  let city = [g.addressTown, g.addressState]
    .filter(Boolean)
    .join(", ");

  if (g.addressZip) {
    city += (city ? " " : "") + g.addressZip;
  }

  if (city) {
    lines.push(`<div>${esc(city)}</div>`);
  }

  if (g.addressCountry) {
    lines.push(`<div>${esc(g.addressCountry)}</div>`);
  }

  return lines.join("");
}

function episodeHtml(e) {
  const st = styleFor(e.mapCategory);
  const id = youtubeId(e.youtubeLink);

  return `
    <div class="episode-card" style="--episode-color:${st.color}">
      <div class="episode-card-header">
        <div>
          <div class="episode-card-title">
            ${esc(e.episodeName || "Video")}
          </div>
          <div class="channel-label">
            ${esc(e.channelLabel)}
          </div>
        </div>
        <div class="episode-category">
          ${esc(st.label)}
        </div>
      </div>

      ${
        id
          ? `<div class="video-wrap">
              <iframe
                src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0"
                title="${esc(e.episodeName || "Video")}"
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowfullscreen>
              </iframe>
            </div>`
          : ""
      }

      <div class="episode-links">
        ${
          e.youtubeLink
            ? `<a href="${esc(e.youtubeLink)}"
                  target="_blank"
                  rel="noopener noreferrer">
                 Watch on YouTube ↗
               </a>`
            : ""
        }
      </div>
    </div>
  `;
}

function popupHtml(g) {
  const count = g.episodes.length;

  const maps = g.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(g.address)}`
    : `https://www.google.com/maps/search/?api=1&query=${g.lat},${g.lng}`;

  return `
    <div class="info-window">
      <div class="location-popup-title">
        ${count === 1
          ? "Video Location"
          : `${count} Episodes at This Location`}
      </div>

      ${
        addressHtml(g)
          ? `<div class="location-address">${addressHtml(g)}</div>`
          : ""
      }

      <a class="location-map-link"
         href="${maps}"
         target="_blank"
         rel="noopener noreferrer">
        Navigate to this address in Google Maps ↗
      </a>

      <div class="episode-list">
        ${g.episodes.map(episodeHtml).join("")}
      </div>
    </div>
  `;
}

/*
 * Build our marker as SVG.
 * The category symbol itself comes from Google's Material Symbols font.
 */
function markerElement(st, count) {
  const wrapper = document.createElement("div");
  wrapper.className = "custom-map-marker";

  wrapper.style.position = "relative";
  wrapper.style.width = "42px";
  wrapper.style.height = "50px";
  wrapper.style.transform = "translateY(-25px)";

  const pin = document.createElement("div");

  pin.style.width = "42px";
  pin.style.height = "42px";
  pin.style.background = st.color;
  pin.style.border = "2.5px solid white";
  pin.style.borderRadius = "50% 50% 50% 0";
  pin.style.transform = "rotate(-45deg)";
  pin.style.boxSizing = "border-box";
  pin.style.boxShadow = "0 1px 4px rgba(0,0,0,.35)";
  pin.style.display = "flex";
  pin.style.alignItems = "center";
  pin.style.justifyContent = "center";

  const symbol = document.createElement("span");
  symbol.className = "material-symbols-rounded";
  symbol.textContent = st.icon;

  symbol.style.transform = "rotate(45deg)";
  symbol.style.color = "white";
  symbol.style.fontSize = "23px";
  symbol.style.fontWeight = "500";
  symbol.style.fontVariationSettings =
    "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24";

  pin.appendChild(symbol);
  wrapper.appendChild(pin);

  if (count > 1) {
    const badge = document.createElement("div");

    badge.textContent = String(count);
    badge.style.position = "absolute";
    badge.style.right = "-7px";
    badge.style.top = "-7px";
    badge.style.minWidth = "20px";
    badge.style.height = "20px";
    badge.style.padding = "0 4px";
    badge.style.boxSizing = "border-box";
    badge.style.borderRadius = "10px";
    badge.style.background = "#202124";
    badge.style.color = "white";
    badge.style.border = "2px solid white";
    badge.style.font = "700 10px/16px Arial, sans-serif";
    badge.style.textAlign = "center";

    wrapper.appendChild(badge);
  }

  return wrapper;
}

function clearMarkers() {
  for (const m of state.markers) {
    m.map = null;
  }

  state.markers = [];
}

function render() {
  clearMarkers();

  if (state.info) state.info.close();

  const groups = groupLocations(visibleLocations());

  for (const g of groups) {
    const st = groupStyle(g);

    const marker = new google.maps.marker.AdvancedMarkerElement({
      map: state.map,
      position: { lat: g.lat, lng: g.lng },
      title:
        g.episodes.length === 1
          ? g.episodes[0].episodeName
          : `${g.episodes.length} episodes`,
      content: markerElement(st, g.episodes.length)
    });

    marker.addListener("click", () => {
      state.info.setContent(popupHtml(g));

      state.info.open({
        map: state.map,
        anchor: marker
      });
    });

    state.markers.push(marker);
  }

  document.querySelector("#status").textContent =
    `${state.markers.length} filming locations • ` +
    `${visibleLocations().length} episodes`;
}

function fitAll() {
  if (!state.markers.length) return;

  const b = new google.maps.LatLngBounds();

  for (const m of state.markers) {
    if (m.position) b.extend(m.position);
  }

  state.map.fitBounds(b, 70);

  if (state.markers.length === 1) {
    state.map.setZoom(12);
  }
}

function createMap(mapId, view = {}) {
  state.map = new google.maps.Map(
    document.querySelector("#map"),
    {
      center: view.center || FINGER_LAKES,
      zoom: view.zoom ?? FINGER_LAKES.zoom,
      mapTypeId: view.mapTypeId || "roadmap",
      fullscreenControl: true,
      streetViewControl: false,
      mapTypeControl: true,
      gestureHandling: "greedy",
      clickableIcons: view.clickableIcons ?? false,
      mapId
    }
  );

  state.info = new google.maps.InfoWindow();
}

function switchDestinations(showDestinations) {
  const center = state.map?.getCenter();
  const zoom = state.map?.getZoom();
  const mapTypeId = state.map?.getMapTypeId() || "roadmap";

  const view = {
    center: center
      ? { lat: center.lat(), lng: center.lng() }
      : FINGER_LAKES,
    zoom: zoom ?? FINGER_LAKES.zoom,
    mapTypeId,
    clickableIcons: showDestinations
  };

  clearMarkers();

  if (state.info) {
    state.info.close();
  }

  createMap(
    showDestinations
      ? MAP_ID_DESTINATIONS_ON
      : MAP_ID_DESTINATIONS_OFF,
    view
  );

  render();
}

function loadGoogleMaps() {
  return new Promise((resolve, reject) => {
    const key = window.MAP_CONFIG?.GOOGLE_MAPS_API_KEY;

    if (!key || key === "REPLACE_ME") {
      return reject(
        new Error("Google Maps API key is not configured.")
      );
    }

    window.__initMap = resolve;

    const s = document.createElement("script");

    s.src =
      `https://maps.googleapis.com/maps/api/js` +
      `?key=${encodeURIComponent(key)}` +
      `&callback=__initMap` +
      `&libraries=marker` +
      `&v=weekly`;

    s.async = true;

    s.onerror = () =>
      reject(new Error("Google Maps failed to load."));

    document.head.appendChild(s);
  });
}

async function loadCategoryIcons() {
  const response = await fetch(
    `category-icons.json?v=${Date.now()}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error("Could not load category-icons.json.");
  }

  return response.json();
}

async function main() {
  const [data, categoryIcons] = await Promise.all([
    fetch(
      `data.json?v=${Date.now()}`,
      { cache: "no-store" }
    ).then(r => {
      if (!r.ok) {
        throw new Error("Could not load data.json.");
      }
      return r.json();
    }),

    loadCategoryIcons()
  ]);

  state.locations = (data.locations || []).filter(
    x =>
      Number.isFinite(Number(x.lat)) &&
      Number.isFinite(Number(x.lng))
  );

  state.categories = data.categories || [];
  state.categoryIcons = categoryIcons || {};

  await loadGoogleMaps();

  createMap(MAP_ID_DESTINATIONS_OFF, {
    center: FINGER_LAKES,
    zoom: FINGER_LAKES.zoom,
    mapTypeId: "roadmap",
    clickableIcons: false
  });

  render();

  document
    .querySelectorAll("#flockToggle,#poomToggle")
    .forEach(x => x.addEventListener("change", render));

  document
    .querySelector("#placesToggle")
    .addEventListener("change", e => {
      switchDestinations(e.target.checked);
    });

  document
    .querySelector("#fingerLakesBtn")
    .addEventListener("click", () => {
      state.map.setCenter(FINGER_LAKES);
      state.map.setZoom(FINGER_LAKES.zoom);
    });

  document
    .querySelector("#allLocationsBtn")
    .addEventListener("click", fitAll);
}

main().catch(err => {
  document.querySelector("#error").hidden = false;
  document.querySelector("#error").textContent = err.message;
  document.querySelector("#status").textContent = "Map unavailable";
  console.error(err);
});
