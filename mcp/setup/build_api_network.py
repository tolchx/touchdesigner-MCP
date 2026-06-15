"""
Build API Patagonia Network in TouchDesigner (v4 — production ready)
Creates a Base COMP at /project1/api_patagonia with all DATs, fetch
scripts, and data output for real-time environmental data from
southern Argentina (El Chaltén).

Key fixes from v3.1:
  - Custom params: use .label assignment, not kwarg
  - All op() references use absolute paths
  - Manual fetch resets Lastfetch to force immediate trigger
"""
import json
import time

# ─── CONFIG ─────────────────────────────────────────────────────────
LOCATIONS = {
    "el_chalten": {"lat": -49.33, "lon": -72.89, "name": "El Chaltén"},
    "el_calafate": {"lat": -50.34, "lon": -72.27, "name": "El Calafate"},
    "rio_gallegos": {"lat": -51.62, "lon": -69.22, "name": "Río Gallegos"},
}

APIS = {
    "weather": "https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation,cloud_cover,weather_code&timezone=America/Argentina/Buenos_Aires",
    "marine": "https://marine-api.open-meteo.com/v1/marine?latitude={lat}&longitude={lon}&current=wave_height,wave_direction,wave_period,sea_surface_temperature",
    "air_quality": "https://air-quality-api.open-meteo.com/v1/air-quality?latitude={lat}&longitude={lon}&current=pm10,pm2_5,nitrogen_dioxide,sulphur_dioxide,ozone,uv_index",
    "seismic": "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude={lat}&longitude={lon}&maxradiuskm=500&orderby=time&limit=5",
    "geomagnetic": "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json",
    "astronomy": "https://api.sunrise-sunset.org/json?lat={lat}&lng={lon}&formatted=0",
}

# ─── STEP 1: Clean up and create Base COMP ──────────────────────────
try:
    existing = op("/project1/api_patagonia")
    if existing:
        existing.destroy()
        print("[BUILD] Destroyed existing api_patagonia")
except:
    pass

project1 = op("/project1")
base = project1.create(baseCOMP, "api_patagonia")
print("[BUILD] Created Base COMP:", base.path)

# ─── STEP 2: Custom parameters (correct TD API) ────────────────────
try:
    page = base.appendCustomPage("API Config")
    p1 = page.appendFloat("Pollsec")
    p1.label = "Poll Interval (sec)"
    p1.val = 300
    p2 = page.appendStr("Location")
    p2.label = "Primary Location"
    p2.val = "el_chalten"
    p3 = page.appendToggle("Autofetch")
    p3.label = "Auto Fetch"
    p3.val = True
    p4 = page.appendPulse("Fetchnow")
    p4.label = "Fetch Now"
    p5 = page.appendFloat("Lastfetch")
    p5.label = "Last Fetch (epoch)"
    p5.val = 0
    print("[BUILD] Created custom parameters: Pollsec, Location, Autofetch, Fetchnow, Lastfetch")
except Exception as e:
    print("[BUILD] Custom params ERROR:", e)

# ─── STEP 3: Config Text DAT ───────────────────────────────────────
config = base.create(textDAT, "config")
config.text = json.dumps({
    "locations": LOCATIONS,
    "apis": APIS,
}, indent=2)
print("[BUILD] Created config DAT")

# ─── STEP 4: Table DATs ────────────────────────────────────────────
tbl_names = ["weather", "marine", "air_quality", "seismic", "geomagnetic", "astronomy"]
for name in tbl_names:
    tbl = base.create(tableDAT, "tbl_" + name)
    tbl.clear()
    tbl.appendRow(["key", "value"])
    tbl.appendRow(["status", "waiting_for_first_fetch"])
print("[BUILD] Created {} Table DATs".format(len(tbl_names)))

# ─── STEP 5: Status Text DAT ───────────────────────────────────────
status_dat = base.create(textDAT, "last_status")
status_dat.text = json.dumps({"last_fetch": None, "errors": [], "fetch_count": 0}, indent=2)
print("[BUILD] Created last_status DAT")

# ─── STEP 6: Main Fetch Script ──────────────────────────────────────
fetch_script = base.create(textDAT, "fetch_apis_script")
fetch_script.text = r'''
import json
import urllib.request
import time

def fetch_json(url, timeout=10):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "TD-Patagonia/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return {"_error": str(e)}

def safe_float(val, default=0.0):
    try:
        return float(val) if val is not None else default
    except:
        return default

def run_fetch():
    base_op = op("/project1/api_patagonia")
    if base_op is None:
        print("[FETCH] ERROR: api_patagonia not found!")
        return

    interval = base_op.par.Pollsec.eval()
    primary_loc = base_op.par.Location.eval()
    auto_fetch = base_op.par.Autofetch.eval()

    if not auto_fetch:
        return

    now = time.time()
    try:
        last = base_op.par.Lastfetch.eval()
    except:
        last = 0
    if (now - last) < interval:
        return

    cfg_op = op("/project1/api_patagonia/config")
    if cfg_op is None:
        print("[FETCH] ERROR: config not found!")
        return
    cfg = json.loads(cfg_op.text)
    loc = cfg["locations"].get(primary_loc, cfg["locations"]["el_chalten"])
    lat, lon = loc["lat"], loc["lon"]
    apis = cfg["apis"]

    results = {}
    errors = []
    t0 = time.time()

    data = fetch_json(apis["weather"].format(lat=lat, lon=lon))
    if "_error" in data:
        errors.append("weather: " + data["_error"])
    else:
        c = data.get("current", {})
        results["weather"] = {
            "temperature": c.get("temperature_2m"),
            "humidity": c.get("relative_humidity_2m"),
            "wind_speed": c.get("wind_speed_10m"),
            "wind_direction": c.get("wind_direction_10m"),
            "precipitation": c.get("precipitation"),
            "cloud_cover": c.get("cloud_cover"),
            "weather_code": c.get("weather_code"),
        }

    data = fetch_json(apis["marine"].format(lat=lat, lon=lon))
    if "_error" in data:
        errors.append("marine: " + data["_error"])
    else:
        c = data.get("current", {})
        results["marine"] = {
            "wave_height": c.get("wave_height"),
            "wave_direction": c.get("wave_direction"),
            "wave_period": c.get("wave_period"),
            "sea_surface_temp": c.get("sea_surface_temperature"),
        }

    data = fetch_json(apis["air_quality"].format(lat=lat, lon=lon))
    if "_error" in data:
        errors.append("air_quality: " + data["_error"])
    else:
        c = data.get("current", {})
        results["air_quality"] = {
            "pm10": c.get("pm10"),
            "pm2_5": c.get("pm2_5"),
            "no2": c.get("nitrogen_dioxide"),
            "so2": c.get("sulphur_dioxide"),
            "ozone": c.get("ozone"),
            "uv_index": c.get("uv_index"),
        }

    data = fetch_json(apis["seismic"].format(lat=lat, lon=lon))
    if "_error" in data:
        errors.append("seismic: " + data["_error"])
    else:
        features = data.get("features", [])
        quakes = []
        for f in features[:5]:
            p = f.get("properties", {})
            g = f.get("geometry", {})
            coords = g.get("coordinates", [0, 0, 0])
            quakes.append({
                "mag": p.get("mag"),
                "place": p.get("place", ""),
                "time": p.get("time"),
                "depth": coords[2] if len(coords) > 2 else 0,
            })
        results["seismic"] = {"earthquakes": quakes, "count": len(quakes)}

    data = fetch_json(apis["geomagnetic"])
    if "_error" in data:
        errors.append("geomagnetic: " + data["_error"])
    else:
        k_values = []
        if isinstance(data, list):
            for entry in data[-6:]:
                if isinstance(entry, (list, tuple)) and len(entry) >= 2:
                    try:
                        k_values.append({"time": entry[0], "kp": float(entry[1])})
                    except:
                        pass
        latest_kp = k_values[-1]["kp"] if k_values else None
        results["geomagnetic"] = {"k_index": k_values, "latest_kp": latest_kp}

    data = fetch_json(apis["astronomy"].format(lat=lat, lon=lon))
    if "_error" in data:
        errors.append("astronomy: " + data["_error"])
    else:
        r = data.get("results", {})
        results["astronomy"] = {
            "sunrise": r.get("sunrise"),
            "sunset": r.get("sunset"),
            "solar_noon": r.get("solar_noon"),
            "day_length": r.get("day_length"),
        }

    elapsed = round(time.time() - t0, 2)

    for key in ["weather", "marine", "air_quality", "seismic", "geomagnetic", "astronomy"]:
        tbl = op("/project1/api_patagonia/tbl_" + key)
        if tbl is None:
            continue
        data_out = results.get(key, {"status": "no_data"})
        tbl.clear()
        tbl.appendRow(["key", "value"])
        if isinstance(data_out, dict):
            for k, v in data_out.items():
                if isinstance(v, (list, dict)):
                    tbl.appendRow([k, json.dumps(v)])
                else:
                    tbl.appendRow([k, str(v) if v is not None else ""])

    out = op("/project1/api_patagonia/out_data")
    if out is not None:
        channel_data = {}
        w = results.get("weather", {})
        channel_data["temperature"] = safe_float(w.get("temperature"))
        channel_data["humidity"] = safe_float(w.get("humidity"))
        channel_data["wind_speed"] = safe_float(w.get("wind_speed"))
        channel_data["wind_direction"] = safe_float(w.get("wind_direction"))
        channel_data["precipitation"] = safe_float(w.get("precipitation"))
        channel_data["cloud_cover"] = safe_float(w.get("cloud_cover"))
        channel_data["weather_code"] = safe_float(w.get("weather_code"))
        m = results.get("marine", {})
        channel_data["wave_height"] = safe_float(m.get("wave_height"))
        channel_data["wave_direction"] = safe_float(m.get("wave_direction"))
        channel_data["wave_period"] = safe_float(m.get("wave_period"))
        channel_data["sea_surface_temp"] = safe_float(m.get("sea_surface_temp"))
        a = results.get("air_quality", {})
        channel_data["pm10"] = safe_float(a.get("pm10"))
        channel_data["pm2_5"] = safe_float(a.get("pm2_5"))
        channel_data["no2"] = safe_float(a.get("no2"))
        channel_data["so2"] = safe_float(a.get("so2"))
        channel_data["ozone"] = safe_float(a.get("ozone"))
        channel_data["uv_index"] = safe_float(a.get("uv_index"))
        g = results.get("geomagnetic", {})
        channel_data["kp_index"] = safe_float(g.get("latest_kp"))
        s = results.get("seismic", {})
        channel_data["quake_count"] = safe_float(s.get("count"))
        if s.get("earthquakes"):
            channel_data["latest_quake_mag"] = safe_float(s["earthquakes"][0].get("mag"))
        for ch_name, ch_val in channel_data.items():
            try:
                out[ch_name][0] = ch_val
            except:
                try:
                    out.appendChan(ch_name)
                    out[ch_name][0] = ch_val
                except:
                    pass

    try:
        base_op.par.Lastfetch.val = time.time()
    except:
        pass

    prev_count = 0
    try:
        prev = json.loads(op("/project1/api_patagonia/last_status").text)
        prev_count = prev.get("fetch_count", 0)
    except:
        pass

    status = {
        "last_fetch": time.strftime("%Y-%m-%d %H:%M:%S"),
        "fetch_count": prev_count + 1,
        "errors": errors,
        "elapsed_sec": elapsed,
        "sources_ok": list(results.keys()),
        "primary_location": primary_loc,
    }
    op("/project1/api_patagonia/last_status").text = json.dumps(status, indent=2)

    print("[FETCH] Done in {}s — {} sources OK, {} errors".format(
        elapsed, len(results), len(errors)))
    if errors:
        for e in errors:
            print("  ! " + e)

run_fetch()
'''
print("[BUILD] Created fetch_apis_script DAT")

# ─── STEP 7: Execute DAT — Cook Every Frame ────────────────────────
exec_dat = base.create(executeDAT, "on_frame")
try:
    exec_dat.par.cookrate = 1
except:
    pass
exec_dat.text = '''
import time, json

def onFrameStart(scriptOp):
    base_op = op("/project1/api_patagonia")
    if base_op is None:
        return
    try:
        auto = base_op.par.Autofetch.eval()
        if not auto:
            return
        interval = base_op.par.Pollsec.eval()
        last = base_op.par.Lastfetch.eval()
        if (time.time() - last) >= interval:
            exec(op("/project1/api_patagonia/fetch_apis_script").text)
    except:
        pass
'''
print("[BUILD] Created on_frame Execute DAT")

# ─── STEP 8: Manual Fetch Execute DAT ──────────────────────────────
manual = base.create(executeDAT, "manual_fetch")
manual.text = '''
def onPulse(scriptOp):
    try:
        op("/project1/api_patagonia").par.Lastfetch.val = 0
    except:
        pass
'''
print("[BUILD] Created manual_fetch Execute DAT")

# ─── STEP 9: Output Null CHOP ──────────────────────────────────────
out_chop = base.create(nullCHOP, "out_data")
print("[BUILD] Created out_data Null CHOP")

# ─── DONE ───────────────────────────────────────────────────────────
print("")
print("=" * 60)
print("  API PATAGONIA NETWORK CREATED (v4)")
print("=" * 60)
print("  Base COMP: /project1/api_patagonia")
print("  Custom Params: Pollsec, Location, Autofetch, Fetchnow, Lastfetch")
print("  Table DATs: tbl_weather, tbl_marine, tbl_air_quality,")
print("              tbl_seismic, tbl_geomagnetic, tbl_astronomy")
print("  Execute DATs: on_frame, manual_fetch")
print("  CHOP: out_data (Null)")
print("=" * 60)
