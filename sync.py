import json, os, re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote
import requests

AIRTABLE_TOKEN = os.environ.get("AIRTABLE_TOKEN")
ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "data.json"
API = "https://api.airtable.com/v0"
META_API = "https://api.airtable.com/v0/meta"
HEADERS = {"Authorization": f"Bearer {AIRTABLE_TOKEN}", "User-Agent": "FlockPOOMEpisodeMap/1.0"}

SOURCES = [
    {"id":"flock", "label":"Flock Finger Lakes", "base":"appG2NKvsCNWdPKrb", "table":"FLOCK Production", "view":"Map"},
    {"id":"poom", "label":"Plant One On Me", "base":"apptrASxYLA8YKsoR", "table":"POOM Production", "view":"Map"},
]

FIELDS = {
    "episode":"Episode Name", "youtube":"YouTube URL", "geolocation":"Geolocation",
    "category":"Map Category", "show":"Show on Map", "street":"Address Street",
    "town":"Address Town", "state":"Address State/Province", "zip":"Address ZIP",
    "country":"Address Country"
}

def clean(v):
    if v is None: return ""
    if isinstance(v, list): return ", ".join(str(x) for x in v)
    return str(v).strip()

def parse_coordinates(value):
    nums = re.findall(r"[-+]?\d+(?:\.\d+)?", clean(value))
    if len(nums) < 2: return None
    try: lat, lng = float(nums[0]), float(nums[1])
    except ValueError: return None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180): return None
    return lat, lng

def get_table(source):
    r = requests.get(f"{META_API}/bases/{source['base']}/tables", headers=HEADERS, timeout=30)
    r.raise_for_status()
    for table in r.json().get("tables", []):
        if table.get("name") == source["table"]: return table
    raise RuntimeError(f"Could not find table {source['table']} in {source['label']}")

def validate_fields(table, source):
    actual = {f.get("name") for f in table.get("fields", [])}
    missing = [name for name in FIELDS.values() if name not in actual]
    if missing:
        raise RuntimeError(f"{source['label']} is missing fields: {', '.join(missing)}")

def get_records(source, table_id):
    url = f"{API}/{source['base']}/{quote(table_id, safe='')}"
    params = {"pageSize":100, "view":source["view"]}
    out = []
    while True:
        r = requests.get(url, headers=HEADERS, params=params, timeout=30)
        r.raise_for_status(); payload = r.json(); out.extend(payload.get("records", []))
        if not payload.get("offset"): break
        params["offset"] = payload["offset"]
    return out

def checkbox_on(value):
    return value is True or clean(value).lower() in {"true","1","yes","checked"}

def normalize(record, source):
    f = record.get("fields", {})
    if not checkbox_on(f.get(FIELDS["show"])): return None, "Show on Map is unchecked"
    coords = parse_coordinates(f.get(FIELDS["geolocation"]))
    if not coords: return None, "missing/invalid Geolocation"
    youtube = clean(f.get(FIELDS["youtube"]))
    if not youtube: return None, "missing YouTube URL"
    street, town = clean(f.get(FIELDS["street"])), clean(f.get(FIELDS["town"]))
    state, zipcode = clean(f.get(FIELDS["state"])), clean(f.get(FIELDS["zip"]))
    country = clean(f.get(FIELDS["country"]))
    address = ", ".join(x for x in [street, town, state, zipcode, country] if x)
    return {
        "recordId":record.get("id"), "channel":source["id"], "channelLabel":source["label"],
        "episodeName":clean(f.get(FIELDS["episode"])) or "Video", "youtubeLink":youtube,
        "mapCategory":clean(f.get(FIELDS["category"])) or "Other", "lat":coords[0], "lng":coords[1],
        "address":address, "addressStreet":street, "addressTown":town, "addressState":state,
        "addressZip":zipcode, "addressCountry":country
    }, None

def main():
    if not AIRTABLE_TOKEN: raise RuntimeError("AIRTABLE_TOKEN GitHub secret is missing.")
    locations, summary = [], []
    for source in SOURCES:
        print(f"\n--- {source['label']} ---")
        table = get_table(source); validate_fields(table, source)
        records = get_records(source, table["id"])
        mapped = 0; skipped = 0
        for record in records:
            row, reason = normalize(record, source)
            if row: locations.append(row); mapped += 1
            else: skipped += 1; print(f"Skipping {record.get('id')}: {reason}")
        summary.append({"channel":source["id"], "label":source["label"], "recordsInView":len(records), "mapped":mapped, "skipped":skipped})
        print(f"Records in Map view: {len(records)}; published: {mapped}; skipped: {skipped}")
    locations.sort(key=lambda x: (x["channelLabel"], x["episodeName"].lower()))
    DATA_PATH.write_text(json.dumps({"updatedAt":datetime.now(timezone.utc).isoformat(), "sources":summary, "mappedLocations":len(locations), "locations":locations}, indent=2, ensure_ascii=False)+"\n")
    print(f"\nTotal published episodes: {len(locations)}")

if __name__ == "__main__": main()
