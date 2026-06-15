"""
REBUILD + TEST api_patagonia (v10 — clean architecture).
Builds network, then calls stored fetch_apis_script via exec() for testing.
No duplicate fetch logic. nodeX/nodeY for CHOPs/Execute DATs.
"""
import json
import time

# ================================================================
# PHASE 1: REBUILD NETWORK
# ================================================================
print("=" * 60)
print("  PHASE 1: REBUILDING api_patagonia")
print("=" * 60)

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

CHOP_CHANNELS = [
    "temperature", "humidity", "wind_speed", "wind_direction",
    "precipitation", "cloud_cover", "weather_code",
    "wave_height", "wave_direction", "wave_period", "sea_surface_temp",
    "pm10", "pm2_5", "no2", "so2", "ozone", "uv_index",
    "kp_index", "quake_count", "latest_quake_mag",
]

try:
    old = op("/project1/api_patagonia")
    if old: old.destroy()
except: pass

base = op("/project1").create(baseCOMP, "api_patagonia")
print("[REBUILD] Created:", base.path)

# Custom parameters
try:
    page = base.appendCustomPage("API Config")
    p1 = page.appendFloat("Pollsec"); p1.label = "Poll Interval (sec)"; p1.val = 300
    p2 = page.appendStr("Location"); p2.label = "Primary Location"; p2.val = "el_chalten"
    p3 = page.appendToggle("Autofetch"); p3.label = "Auto Fetch"; p3.val = True
    p4 = page.appendPulse("Fetchnow"); p4.label = "Fetch Now"
    p5 = page.appendFloat("Lastfetch"); p5.label = "Last Fetch (epoch)"; p5.val = 0
    print("[REBUILD] Custom params: OK")
except Exception as e:
    print("[REBUILD] Custom params ERROR:", e)

# Config DAT
config = base.create(textDAT, "config")
config.text = json.dumps({"locations": LOCATIONS, "apis": APIS}, indent=2)

# Table DATs for raw API data
tbl_names = ["weather", "marine", "air_quality", "seismic", "geomagnetic", "astronomy"]
for name in tbl_names:
    tbl = base.create(tableDAT, "tbl_" + name)
    tbl.clear()
    tbl.appendRow(["key", "value"])
    tbl.appendRow(["status", "waiting_for_first_fetch"])

# Status DAT
base.create(textDAT, "last_status").text = json.dumps(
    {"last_fetch": None, "errors": [], "fetch_count": 0}, indent=2)

# Numeric channels Table DAT
chop_tbl = base.create(tableDAT, "chop_data")
chop_tbl.clear()
chop_tbl.appendRow(CHOP_CHANNELS)
chop_tbl.appendRow(["0"] * len(CHOP_CHANNELS))

# Fetch script — imports INSIDE functions
fetch_dat = base.create(textDAT, "fetch_apis_script")
fetch_dat.text = r'''
import json, time

def _fetch(url, timeout=10):
    import urllib.request
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "TD-Patagonia/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return {"_error": str(e)}

def _sf(val, default=0.0):
    try: return float(val) if val is not None else default
    except: return default

def run_fetch():
    B = op("/project1/api_patagonia")
    if B is None: return
    interval = B.par.Pollsec.eval()
    loc_name = B.par.Location.eval()
    if not B.par.Autofetch.eval(): return
    now = time.time()
    try: last = B.par.Lastfetch.eval()
    except: last = 0
    if (now - last) < interval: return

    cfg = json.loads(op("/project1/api_patagonia/config").text)
    loc = cfg["locations"].get(loc_name, cfg["locations"]["el_chalten"])
    lat, lon = loc["lat"], loc["lon"]
    apis = cfg["apis"]
    R, E = {}, []
    t0 = time.time()

    d = _fetch(apis["weather"].format(lat=lat, lon=lon))
    if "_error" in d: E.append("weather: " + d["_error"])
    else:
        c = d.get("current", {})
        R["weather"] = {"temperature": c.get("temperature_2m"), "humidity": c.get("relative_humidity_2m"),
            "wind_speed": c.get("wind_speed_10m"), "wind_direction": c.get("wind_direction_10m"),
            "precipitation": c.get("precipitation"), "cloud_cover": c.get("cloud_cover"),
            "weather_code": c.get("weather_code")}

    d = _fetch(apis["marine"].format(lat=lat, lon=lon))
    if "_error" in d: E.append("marine: " + d["_error"])
    else:
        c = d.get("current", {})
        R["marine"] = {"wave_height": c.get("wave_height"), "wave_direction": c.get("wave_direction"),
            "wave_period": c.get("wave_period"), "sea_surface_temp": c.get("sea_surface_temperature")}

    d = _fetch(apis["air_quality"].format(lat=lat, lon=lon))
    if "_error" in d: E.append("air_quality: " + d["_error"])
    else:
        c = d.get("current", {})
        R["air_quality"] = {"pm10": c.get("pm10"), "pm2_5": c.get("pm2_5"),
            "no2": c.get("nitrogen_dioxide"), "so2": c.get("sulphur_dioxide"),
            "ozone": c.get("ozone"), "uv_index": c.get("uv_index")}

    d = _fetch(apis["seismic"].format(lat=lat, lon=lon))
    if "_error" in d: E.append("seismic: " + d["_error"])
    else:
        qs = []
        for f in d.get("features", [])[:5]:
            p, g = f.get("properties", {}), f.get("geometry", {})
            coords = g.get("coordinates", [0,0,0])
            qs.append({"mag": p.get("mag"), "place": p.get("place",""), "time": p.get("time"),
                "depth": coords[2] if len(coords)>2 else 0})
        R["seismic"] = {"earthquakes": qs, "count": len(qs)}

    d = _fetch(apis["geomagnetic"])
    if "_error" in d: E.append("geomagnetic: " + d["_error"])
    else:
        kvs = []
        if isinstance(d, list):
            for e in d[-6:]:
                if isinstance(e, (list,tuple)) and len(e)>=2:
                    try: kvs.append({"time": e[0], "kp": float(e[1])})
                    except: pass
        R["geomagnetic"] = {"k_index": kvs, "latest_kp": kvs[-1]["kp"] if kvs else None}

    d = _fetch(apis["astronomy"].format(lat=lat, lon=lon))
    if "_error" in d: E.append("astronomy: " + d["_error"])
    else:
        r = d.get("results", {})
        R["astronomy"] = {"sunrise": r.get("sunrise"), "sunset": r.get("sunset"),
            "solar_noon": r.get("solar_noon"), "day_length": r.get("day_length")}

    elapsed = round(time.time() - t0, 2)
    for key in ["weather","marine","air_quality","seismic","geomagnetic","astronomy"]:
        tbl = op("/project1/api_patagonia/tbl_" + key)
        if tbl is None: continue
        do = R.get(key, {"status":"no_data"})
        tbl.clear()
        tbl.appendRow(["key","value"])
        if isinstance(do, dict):
            for k, v in do.items():
                tbl.appendRow([k, json.dumps(v) if isinstance(v,(list,dict)) else str(v) if v is not None else "N/A"])

    # Write numeric values to chop_data Table DAT
    channels = ["temperature","humidity","wind_speed","wind_direction","precipitation","cloud_cover",
        "weather_code","wave_height","wave_direction","wave_period","sea_surface_temp",
        "pm10","pm2_5","no2","so2","ozone","uv_index","kp_index","quake_count","latest_quake_mag"]
    vals = {}
    w = R.get("weather",{})
    vals["temperature"]=_sf(w.get("temperature")); vals["humidity"]=_sf(w.get("humidity"))
    vals["wind_speed"]=_sf(w.get("wind_speed")); vals["wind_direction"]=_sf(w.get("wind_direction"))
    vals["precipitation"]=_sf(w.get("precipitation")); vals["cloud_cover"]=_sf(w.get("cloud_cover"))
    vals["weather_code"]=_sf(w.get("weather_code"))
    m = R.get("marine",{})
    vals["wave_height"]=_sf(m.get("wave_height")); vals["wave_direction"]=_sf(m.get("wave_direction"))
    vals["wave_period"]=_sf(m.get("wave_period")); vals["sea_surface_temp"]=_sf(m.get("sea_surface_temp"))
    a = R.get("air_quality",{})
    vals["pm10"]=_sf(a.get("pm10")); vals["pm2_5"]=_sf(a.get("pm2_5"))
    vals["no2"]=_sf(a.get("no2")); vals["so2"]=_sf(a.get("so2"))
    vals["ozone"]=_sf(a.get("ozone")); vals["uv_index"]=_sf(a.get("uv_index"))
    g = R.get("geomagnetic",{})
    vals["kp_index"]=_sf(g.get("latest_kp"))
    s = R.get("seismic",{})
    vals["quake_count"]=_sf(s.get("count"))
    if s.get("earthquakes"): vals["latest_quake_mag"]=_sf(s["earthquakes"][0].get("mag"))
    ct = op("/project1/api_patagonia/chop_data")
    if ct:
        row = [str(vals.get(ch, 0)) for ch in channels]
        ct.clear()
        ct.appendRow(channels)
        ct.appendRow(row)

    try: B.par.Lastfetch.val = time.time()
    except: pass
    pc = 0
    try: pc = json.loads(op("/project1/api_patagonia/last_status").text).get("fetch_count",0)
    except: pass
    st = {"last_fetch": time.strftime("%Y-%m-%d %H:%M:%S"), "fetch_count": pc+1,
        "errors": E, "elapsed_sec": elapsed, "sources_ok": list(R.keys()), "primary_location": loc_name}
    op("/project1/api_patagonia/last_status").text = json.dumps(st, indent=2)
    print("[FETCH] {}s — {} OK, {} errors".format(elapsed, len(R), len(E)))
    for e in E: print("  ! " + e)

run_fetch()
'''

# on_frame Execute DAT
exec_dat = base.create(executeDAT, "on_frame")
try: exec_dat.par.cookrate = 1
except: pass
exec_dat.text = '''
import time, json
def onFrameStart(scriptOp):
    B = op("/project1/api_patagonia")
    if B is None: return
    try:
        if not B.par.Autofetch.eval(): return
        if (time.time() - B.par.Lastfetch.eval()) >= B.par.Pollsec.eval():
            exec(op("/project1/api_patagonia/fetch_apis_script").text)
    except: pass
'''

# manual_fetch
manual = base.create(executeDAT, "manual_fetch")
manual.text = '''
def onPulse(scriptOp):
    try: op("/project1/api_patagonia").par.Lastfetch.val = 0
    except: pass
'''

# Position CHOPs/Execute DATs (nodeX/nodeY only works on these)
positions = {
    "on_frame": (0, 300),
    "manual_fetch": (0, 500),
}
for child in base.children:
    if child.name in positions:
        try:
            child.nodeX = positions[child.name][0]
            child.nodeY = positions[child.name][1]
        except: pass

print("[REBUILD] All operators created")

# ================================================================
# PHASE 2: TRIGGER FETCH (call stored script via exec)
# ================================================================
print("\n" + "=" * 60)
print("  PHASE 2: TRIGGERING FETCH")
print("=" * 60)

# Force fetch by resetting timestamp
try: base.par.Lastfetch.val = 0
except: pass

t0 = time.time()
try:
    exec(fetch_dat.text)
    elapsed = round(time.time() - t0, 1)
    print("  Fetch completed in {}s".format(elapsed))
except Exception as e:
    elapsed = round(time.time() - t0, 1)
    print("  FETCH ERROR ({}s): {}".format(elapsed, e))

# ================================================================
# PHASE 3: VERIFICATION
# ================================================================
print("\n" + "=" * 60)
print("  PHASE 3: VERIFICATION")
print("=" * 60)

print("\n  TABLE DATS:")
tbl_ok = True
for name in tbl_names:
    tbl = op("/project1/api_patagonia/" + name)
    if tbl:
        rows = tbl.numRows
        has_data = rows > 2
        preview = str(tbl[1, 1])[:50] if rows > 2 else ""
        print("  {:25s} rows={:>2d} {} {}".format(name, rows, "[DATA]" if has_data else "[EMPTY]", preview))
        if not has_data: tbl_ok = False

print("\n  CHOP_DATA TABLE:")
ct = op("/project1/api_patagonia/chop_data")
if ct:
    print("  rows={} cols={}".format(ct.numRows, ct.numCols))
    if ct.numRows > 1:
        for i, ch in enumerate(CHOP_CHANNELS):
            val = ct[1, i] if ct.numCols > i else "0"
            print("    {:25s} = {}".format(ch, val))

print("\n  CUSTOM PARAMETERS:")
for pname in ["Pollsec", "Location", "Autofetch", "Lastfetch"]:
    try:
        val = getattr(base.par, pname).eval()
        print("  {:20s} = {}".format(pname, val))
    except:
        print("  {:20s} MISSING".format(pname))

print("\n  STATUS:")
try:
    s = json.loads(op("/project1/api_patagonia/last_status").text)
    print("  last_fetch: {}".format(s.get("last_fetch")))
    print("  sources_ok: {}".format(s.get("sources_ok")))
    print("  errors: {}".format(len(s.get("errors", []))))
except Exception as e:
    print("  Error: {}".format(e))

print("\n  HEALTHCHECK:")
issues = 0
for child in base.children:
    try:
        errs = child.errors()
        if errs:
            print("  ERROR {:20s}: {}".format(child.name, str(errs)[:80]))
            issues += 1
    except: pass
if issues == 0:
    print("  All operators clean!")

print("\n" + "=" * 60)
print("  FINAL SUMMARY")
print("=" * 60)
print("  Operators: {}".format(len(base.children)))
print("  Table DATs: {}".format("ALL OK" if tbl_ok else "SOME EMPTY"))
print("  chop_data: {} channels".format(len(CHOP_CHANNELS)))
print("  Health: {}".format("CLEAN" if issues == 0 else "{} ISSUES".format(issues)))
print("=" * 60)
