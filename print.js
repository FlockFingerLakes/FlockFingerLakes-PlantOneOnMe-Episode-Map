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

const state = {
  locations: [],
  categories: [],
  categoryIcons: {},
  channels: new Set(["flock", "poom"])
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

function categoryConfig(name) {
  const wanted = norm(name);

  return (
    state.categories.find(
      category => norm(category.name) === wanted
    ) || null
  );
}

function categoryColor(name) {
  const category = categoryConfig(name);

  if (category) {
    return (
      AIRTABLE_COLORS[category.airtableColor] ||
      "#666666"
    );
  }

  const other = categoryConfig("Other");

  if (other) {
    return (
      AIRTABLE_COLORS[other.airtableColor] ||
      "#666666"
    );
  }

  return "#666666";
}

function categoryIcon(name) {
  if (state.categoryIcons[name]) {
    return state.categoryIcons[name];
  }

  const wanted = norm(name);

  const matchingKey =
    Object.keys(state.categoryIcons).find(
      key => norm(key) === wanted
    );

  if (matchingKey) {
    return state.categoryIcons[matchingKey];
  }

  return (
    state.categoryIcons.Other ||
    "radio_button_unchecked"
  );
}

function readPrintFilters() {
  const params = new URLSearchParams(
    window.location.search
  );

  const channelParam = params.get("channels");

  if (!channelParam) {
    return;
  }

  const requested = new Set(
    channelParam
      .split(",")
      .map(x => x.trim())
      .filter(Boolean)
  );

  const valid = new Set(
    [...requested].filter(
      x => x === "flock" || x === "poom"
    )
  );

  if (valid.size) {
    state.channels = valid;
  }
}

function visibleLocations() {
  return state.locations.filter(
    location =>
      state.channels.has(location.channel)
  );
}

function groupLocations(items) {
  const groups = new Map();

  for (const item of items) {
    const lat = Number(item.lat);
    const lng = Number(item.lng);

    const key =
      `${lat.toFixed(6)},${lng.toFixed(6)}`;

    if (!groups.has(key)) {
      groups.set(key, {
        lat,
        lng,
        episodes: [],
        address: "",
        addressStreet: "",
        addressTown: "",
        addressState: "",
        addressZip: "",
        addressCountry: ""
      });
    }

    const group = groups.get(key);

    group.episodes.push(item);

    if (!group.address && item.address) {
      group.address = item.address;
      group.addressStreet =
        item.addressStreet || "";
      group.addressTown =
        item.addressTown || "";
      group.addressState =
        item.addressState || "";
      group.addressZip =
        item.addressZip || "";
      group.addressCountry =
        item.addressCountry || "";
    }
  }

  return [...groups.values()];
}

function primaryCategory(group) {
  const categories = [
    ...new Set(
      group.episodes.map(
        episode =>
          episode.mapCategory || "Other"
      )
    )
  ];

  if (categories.length === 1) {
    return categories[0];
  }

  return "Other";
}

function groupTitle(group) {
  /*
   * We currently don't have a separate location-name
   * field, so use the episode name for single episodes.
   *
   * For shared coordinates, use the address/town as the
   * location heading.
   */

  if (group.episodes.length === 1) {
    return (
      group.episodes[0].episodeName ||
      "Video Location"
    );
  }

  if (group.addressStreet) {
    return group.addressStreet;
  }

  if (group.addressTown) {
    return group.addressTown;
  }

  return `${group.episodes.length} Episodes`;
}

function formattedAddress(group) {
  const lines = [];

  if (group.addressStreet) {
    lines.push(group.addressStreet);
  }

  let cityLine = [
    group.addressTown,
    group.addressState
  ]
    .filter(Boolean)
    .join(", ");

  if (group.addressZip) {
    cityLine +=
      (cityLine ? " " : "") +
      group.addressZip;
  }

  if (cityLine) {
    lines.push(cityLine);
  }

  if (group.addressCountry) {
    lines.push(group.addressCountry);
  }

  return lines;
}

function navigationUrl(group) {
  if (group.address) {
    return (
      "https://www.google.com/maps/search/" +
      "?api=1&query=" +
      encodeURIComponent(group.address)
    );
  }

  return (
    "https://www.google.com/maps/search/" +
    "?api=1&query=" +
    encodeURIComponent(
      `${group.lat},${group.lng}`
    )
  );
}

function channelSubtitle() {
  const flock =
    state.channels.has("flock");

  const poom =
    state.channels.has("poom");

  if (flock && poom) {
    return (
      "Flock Finger Lakes + Plant One On Me"
    );
  }

  if (flock) {
    return "Flock Finger Lakes";
  }

  if (poom) {
    return "Plant One On Me";
  }

  return "Episode Locations";
}

function addGridLines(container) {
  const percentages = [20, 40, 60, 80];

  for (const value of percentages) {
    const vertical =
      document.createElement("div");

    vertical.className =
      "map-grid-line vertical";

    vertical.style.left = `${value}%`;

    container.appendChild(vertical);

    const horizontal =
      document.createElement("div");

    horizontal.className =
      "map-grid-line horizontal";

    horizontal.style.top = `${value}%`;

    container.appendChild(horizontal);
  }
}

function renderMap(groups) {
  const container =
    document.querySelector("#printMap");

  container.replaceChildren();

  addGridLines(container);

  if (!groups.length) {
    container.innerHTML +=
      "<p>No locations selected.</p>";
    return;
  }

  const lats =
    groups.map(group => group.lat);

  const lngs =
    groups.map(group => group.lng);

  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  let minLng = Math.min(...lngs);
  let maxLng = Math.max(...lngs);

  /*
   * Avoid divide-by-zero when all locations share
   * the same latitude or longitude.
   */
  if (minLat === maxLat) {
    minLat -= 0.01;
    maxLat += 0.01;
  }

  if (minLng === maxLng) {
    minLng -= 0.01;
    maxLng += 0.01;
  }

  /*
   * Add geographic padding around the outermost
   * locations.
   */
  const latPad =
    (maxLat - minLat) * 0.08;

  const lngPad =
    (maxLng - minLng) * 0.08;

  minLat -= latPad;
  maxLat += latPad;
  minLng -= lngPad;
  maxLng += lngPad;

  groups.forEach((group, index) => {
    const category =
      primaryCategory(group);

    const color =
      categoryColor(category);

    const icon =
      categoryIcon(category);

    const x =
      ((group.lng - minLng) /
        (maxLng - minLng)) *
      100;

    /*
     * Latitude increases upward, while CSS top
     * increases downward, so invert the Y axis.
     */
    const y =
      100 -
      ((group.lat - minLat) /
        (maxLat - minLat)) *
        100;

    const marker =
      document.createElement("div");

    marker.className =
      "print-marker";

    marker.style.left = `${x}%`;
    marker.style.top = `${y}%`;
    marker.style.background = color;
    marker.style.transform =
      "translate(-50%, -50%) rotate(-45deg)";

    marker.title =
      `${index + 1}. ${groupTitle(group)}`;

    const symbol =
      document.createElement("span");

    symbol.className =
      "material-symbols-rounded " +
      "print-marker-inner";

    symbol.textContent = icon;

    marker.appendChild(symbol);

    const number =
      document.createElement("span");

    number.className =
      "print-marker-number";

    number.textContent =
      String(index + 1);

    marker.appendChild(number);

    container.appendChild(marker);
  });
}

function renderLegend(groups) {
  const legend =
    document.querySelector("#legend");

  legend.replaceChildren();

  const usedCategories = [
    ...new Set(
      groups.map(primaryCategory)
    )
  ].sort((a, b) =>
    a.localeCompare(b)
  );

  for (const category of usedCategories) {
    const item =
      document.createElement("div");

    item.className =
      "legend-item";

    const dot =
      document.createElement("span");

    dot.className =
      "legend-dot";

    dot.style.background =
      categoryColor(category);

    const icon =
      document.createElement("span");

    icon.className =
      "material-symbols-rounded";

    icon.textContent =
      categoryIcon(category);

    icon.style.fontSize = "16px";

    const label =
      document.createElement("span");

    label.textContent = category;

    item.appendChild(dot);
    item.appendChild(icon);
    item.appendChild(label);

    legend.appendChild(item);
  }
}

function renderDirectory(groups) {
  const directory =
    document.querySelector(
      "#locationDirectory"
    );

  directory.replaceChildren();

  groups.forEach((group, index) => {
    const category =
      primaryCategory(group);

    const entry =
      document.createElement("article");

    entry.className =
      "location-entry";

    const number =
      document.createElement("div");

    number.className =
      "location-number";

    number.textContent =
      String(index + 1);

    const body =
      document.createElement("div");

    const addressLines =
      formattedAddress(group);

    const episodesHtml =
      group.episodes
        .map(episode => {
          return `
            <div class="print-episode">

              <div class="print-episode-name">
                ${esc(
                  episode.episodeName ||
                  "Video"
                )}
              </div>

              <div class="print-channel">
                ${esc(
                  episode.channelLabel ||
                  ""
                )}
              </div>

              <div class="print-links">

                ${
                  episode.youtubeLink
                    ? `<a
                        href="${esc(
                          episode.youtubeLink
                        )}"
                        target="_blank"
                        rel="noopener noreferrer">
                        Watch on YouTube ↗
                      </a>`
                    : ""
                }

                <a
                  href="${esc(
                    navigationUrl(group)
                  )}"
                  target="_blank"
                  rel="noopener noreferrer">
                  Navigate in Google Maps ↗
                </a>

              </div>

            </div>
          `;
        })
        .join("");

    body.innerHTML = `
      <h3 class="location-title">
        ${esc(groupTitle(group))}
      </h3>

      ${
        addressLines.length
          ? `<div class="location-address">
              ${addressLines
                .map(
                  line =>
                    `<div>${esc(line)}</div>`
                )
                .join("")}
             </div>`
          : ""
      }

      <div
        class="location-category"
        style="background:${categoryColor(
          category
        )}">
        ${esc(category)}
      </div>

      ${episodesHtml}
    `;

    entry.appendChild(number);
    entry.appendChild(body);

    directory.appendChild(entry);
  });
}

function sortGroups(groups) {
  /*
   * Sort north-to-south, then west-to-east.
   * This gives the numbered map a reasonably
   * geographic reading order.
   */
  return groups.sort((a, b) => {
    if (b.lat !== a.lat) {
      return b.lat - a.lat;
    }

    return a.lng - b.lng;
  });
}

function renderPrintDocument() {
  const locations =
    visibleLocations();

  const groups =
    sortGroups(
      groupLocations(locations)
    );

  document.querySelector(
    "#printSubtitle"
  ).textContent =
    channelSubtitle();

  document.querySelector(
    "#printSummary"
  ).innerHTML =
    `${groups.length} filming locations<br>` +
    `${locations.length} episodes`;

  renderMap(groups);
  renderLegend(groups);
  renderDirectory(groups);
}

async function loadData() {
  const [data, icons] =
    await Promise.all([
      fetch(
        `data.json?v=${Date.now()}`,
        {
          cache: "no-store"
        }
      ).then(response => {
        if (!response.ok) {
          throw new Error(
            "Could not load data.json."
          );
        }

        return response.json();
      }),

      fetch(
        `category-icons.json?v=${Date.now()}`,
        {
          cache: "no-store"
        }
      ).then(response => {
        if (!response.ok) {
          throw new Error(
            "Could not load category-icons.json."
          );
        }

        return response.json();
      })
    ]);

  state.locations =
    (data.locations || []).filter(
      item =>
        Number.isFinite(
          Number(item.lat)
        ) &&
        Number.isFinite(
          Number(item.lng)
        )
    );

  state.categories =
    data.categories || [];

  state.categoryIcons =
    icons || {};
}

async function main() {
  readPrintFilters();

  await loadData();

  renderPrintDocument();

  document
    .querySelector("#backBtn")
    .addEventListener(
      "click",
      () => {
        window.history.back();
      }
    );

  document
    .querySelector("#printPdfBtn")
    .addEventListener(
      "click",
      () => {
        window.print();
      }
    );
}

main().catch(error => {
  console.error(error);

  document.querySelector(
    "#printSummary"
  ).textContent =
    error.message;
});
