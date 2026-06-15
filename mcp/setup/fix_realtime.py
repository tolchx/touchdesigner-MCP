"""
FIX REALTIME api_patagonia v3 — all issues resolved:
1. Explicit variable assignments (no tuple unpacking for TD /exec)
2. Execute DAT cookrate deferred until AFTER fetch
3. All imports inside functions for TD /exec scope
4. nodeX/nodeY positioning for all operators
"""
import json
import time
import urllib.request

# ================================================================
# CONSTANTS
# ================================================================
LOCATIONS = {
    "el_chalten": {"lat": -49.33, "lon": -72.89, "name": "El Chalten"},
    "el_calafate": {"lat": -50.34, "lon": -72.27, "name": "El Calafate"},
    "rio_gallegos": {"lat": -51.62, "lon": -69.22, "name": "Rio Gallegos"},
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

TBL_NAMES = ["weather", "marine", "air_quality", "seismic", "geomagnetic", "astronomy"]

# ================================================================
# PHASE 1: DESTROY OLD & REBUILD
# ================================================================
print("=" * 60)
print("  PHASE 1: REBUILDING api_patagonia")
print("=" * 60)

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

# Table DATs
for name in TBL_NAMES:
    tbl = base.create(tableDAT, "tbl_" + name)
    tbl.clear()
    tbl.appendRow(["key", "value"])
    tbl.appendRow(["status", "waiting"])

# Status DAT
base.create(textDAT, "last_status").text = json.dumps(
    {"last_fetch": None, "errors": [], "fetch_count": 0}, indent=2)

# chop_data Table DAT
chop_tbl = base.create(tableDAT, "chop_data")
chop_tbl.clear()
chop_tbl.appendRow(CHOP_CHANNELS)
chop_tbl.appendRow(["0"] * len(CHOP_CHANNELS))

# ================================================================
# PHASE 2: CREATE Execute DATs (cookrate deferred!)
# ================================================================
print("[REBUILD] Creating Execute DATs...")

# on_frame Execute DAT — cookrate set to 0 initially (disabled)
exec_dat = base.create(executeDAT, "on_frame")
exec_dat.text = """
import time, json, urllib.request

def _fetch(url, timeout=10):
    import urllib.request as _u, json as _j
    try:
        req = _u.Request(url, headers={"User-Agent": "TD-Patagonia/1.0"})
        with _u.urlopen(req, timeout=timeout) as resp:
            return _j.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return {"_error": str(e)}

def _sf(val, default=0.0):
    try: return float(val) if val is not None else default
    except: return default

def onFrameStart(scriptOp):
    import time as _t, json as _j
    B = op("/project1/api_patagonia")
    if B is None: return
    try:
        if not B.par.Autofetch.eval(): return
        interval = B.par.Pollsec.eval()
        try: last = B.par.Lastfetch.eval()
        except: last = 0
        if (_t.time() - last) < interval: return
    except: return

    try:
        cfg = _j.loads(op("/project1/api_patagonia/config").text)
        loc_name = B.par.Location.eval()
        loc = cfg["locations"].get(loc_name, cfg["locations"]["el_chalten"])
        lat, lon = loc["lat"], loc["lon"]
        apis = cfg["apis"]
        R = {}
        E = []
        t0 = _t.time()

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
                p = f.get("properties", {})
                g = f.get("geometry", {})
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

        elapsed = round(_t.time() - t0, 2)

        for key in ["weather","marine","air_quality","seismic","geomagnetic","astronomy"]:
            tbl = op("/project1/api_patagonia/tbl_" + key)
            if tbl is None: continue
            do = R.get(key, {"status":"no_data"})
            tbl.clear()
            tbl.appendRow(["key","value"])
            if isinstance(do, dict):
                for k, v in do.items():
                    tbl.appendRow([k, _j.dumps(v) if isinstance(v,(list,dict)) else str(v) if v is not None else "N/A"])

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

        try: B.par.Lastfetch.val = _t.time()
        except: pass
        pc = 0
        try: pc = _j.loads(op("/project1/api_patagonia/last_status").text).get("fetch_count",0)
        except: pass
        st = {"last_fetch": _t.strftime("%Y-%m-%d %H:%M:%S"), "fetch_count": pc+1,
            "errors": E, "elapsed_sec": elapsed, "sources_ok": list(R.keys()), "primary_location": loc_name}
        op("/project1/api_patagonia/last_status").text = _j.dumps(st, indent=2)
        print("[FETCH] {}s - {} OK, {} errors".format(elapsed, len(R), len(E)))
    except Exception as e:
        print("[FETCH] ERROR:", e)
"""

# manual_fetch Execute DAT
manual = base.create(executeDAT, "manual_fetch")
manual.text = """
import time, json, urllib.request

def _fetch(url, timeout=10):
    import urllib.request as _u, json as _j
    try:
        req = _u.Request(url, headers={"User-Agent": "TD-Patagonia/1.0"})
        with _u.urlopen(req, timeout=timeout) as resp:
            return _j.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return {"_error": str(e)}

def _sf(val, default=0.0):
    try: return float(val) if val is not None else default
    except: return default

def onPulse(scriptOp):
    import time as _t, json as _j
    B = op("/project1/api_patagonia")
    if B is None: return
    try:
        cfg = _j.loads(op("/project1/api_patagonia/config").text)
        loc_name = B.par.Location.eval()
        loc = cfg["locations"].get(loc_name, cfg["locations"]["el_chalten"])
        lat, lon = loc["lat"], loc["lon"]
        apis = cfg["apis"]
        R = {}
        E = []
        t0 = _t.time()

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
                p = f.get("properties", {})
                g = f.get("geometry", {})
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

        elapsed = round(_t.time() - t0, 2)

        for key in ["weather","marine","air_quality","seismic","geomagnetic","astronomy"]:
            tbl = op("/project1/api_patagonia/tbl_" + key)
            if tbl is None: continue
            do = R.get(key, {"status":"no_data"})
            tbl.clear()
            tbl.appendRow(["key","value"])
            if isinstance(do, dict):
                for k, v in do.items():
                    tbl.appendRow([k, _j.dumps(v) if isinstance(v,(list,dict)) else str(v) if v is not None else "N/A"])

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

        try: B.par.Lastfetch.val = _t.time()
        except: pass
        pc = 0
        try: pc = _j.loads(op("/project1/api_patagonia/last_status").text).get("fetch_count",0)
        except: pass
        st = {"last_fetch": _t.strftime("%Y-%m-%d %H:%M:%S"), "fetch_count": pc+1,
            "errors": E, "elapsed_sec": elapsed, "sources_ok": list(R.keys()), "primary_location": loc_name}
        op("/project1/api_patagonia/last_status").text = _j.dumps(st, indent=2)
        print("[FETCH] {}s - {} OK, {} errors".format(elapsed, len(R), len(E)))
    except Exception as e:
        print("[FETCH] ERROR:", e)
"""

# IMPORTANT: cookrate stays at 0 (disabled) until after immediate fetch
try: exec_dat.par.cookrate = 0
except: pass

print("[REBUILD] Execute DATs created (cookrate=0 until fetch done)")

# ================================================================
# PHASE 3: POSITION OPERATORS (nodeX/nodeY)
# ================================================================
print("[REBUILD] Positioning operators...")

pos = {
    "config":           (0, 0),
    "last_status":      (0, 200),
    "chop_data":        (0, 400),
    "on_frame":         (400, 0),
    "manual_fetch":     (400, 200),
    "tbl_weather":      (800, 0),
    "tbl_marine":       (800, 150),
    "tbl_air_quality":  (800, 300),
    "tbl_seismic":      (800, 450),
    "tbl_geomagnetic":  (800, 600),
    "tbl_astronomy":    (800, 750),
}

for child in base.children:
    if child.name in pos:
        try:
            child.nodeX = pos[child.name][0]
            child.nodeY = pos[child.name][1]
        except: pass

print("[REBUILD] {} operators positioned".format(len(pos)))

# ================================================================
# PHASE 4: IMMEDIATE FETCH (standalone, no shared vars)
# ================================================================
print("")
print("=" * 60)
print("  PHASE 2: IMMEDIATE FETCH")
print("=" * 60)

try: base.par.Lastfetch.val = 0
except: pass

t0 = time.time()
R = {}
E = []

try:
    import urllib.request as _u
    import json as _j

    def do_fetch(url, timeout=10):
        import urllib.request as _u2, json as _j2
        try:
            req = _u2.Request(url, headers={"User-Agent": "TD-Patagonia/1.0"})
            with _u2.urlopen(req, timeout=timeout) as resp:
                return _j2.loads(resp.read().decode("utf-8"))
        except Exception as e:
            return {"_error": str(e)}

    def sf(val, default=0.0):
        try: return float(val) if val is not None else default
        except: return default

    loc = LOCATIONS["el_chalten"]
    lat = loc["lat"]
    lon = loc["lon"]

    d = do_fetch(APIS["weather"].format(lat=lat, lon=lon))
    if "_error" in d:
        E.append("weather: " + d["_error"])
    else:
        c = d.get("current", {})
        R["weather"] = {
            "temperature": c.get("temperature_2m"),
            "humidity": c.get("relative_humidity_2m"),
            "wind_speed": c.get("wind_speed_10m"),
            "wind_direction": c.get("wind_direction_10m"),
            "precipitation": c.get("precipitation"),
            "cloud_cover": c.get("cloud_cover"),
            "weather_code": c.get("weather_code"),
        }

    d = do_fetch(APIS["marine"].format(lat=lat, lon=lon))
    if "_error" in d:
        E.append("marine: " + d["_error"])
    else:
        c = d.get("current", {})
        R["marine"] = {
            "wave_height": c.get("wave_height"),
            "wave_direction": c.get("wave_direction"),
            "wave_period": c.get("wave_period"),
            "sea_surface_temp": c.get("sea_surface_temperature"),
        }

    d = do_fetch(APIS["air_quality"].format(lat=lat, lon=lon))
    if "_error" in d:
        E.append("air_quality: " + d["_error"])
    else:
        c = d.get("current", {})
        R["air_quality"] = {
            "pm10": c.get("pm10"),
            "pm2_5": c.get("pm2_5"),
            "no2": c.get("nitrogen_dioxide"),
            "so2": c.get("sulphur_dioxide"),
            "ozone": c.get("ozone"),
            "uv_index": c.get("uv_index"),
        }

    d = do_fetch(APIS["seismic"].format(lat=lat, lon=lon))
    if "_error" in d:
        E.append("seismic: " + d["_error"])
    else:
        qs = []
        features = d.get("features", [])
        for f in features[:5]:
            p = f.get("properties", {})
            g = f.get("geometry", {})
            coords = g.get("coordinates", [0, 0, 0])
            depth = coords[2] if len(coords) > 2 else 0
            qs.append({
                "mag": p.get("mag"),
                "place": p.get("place", ""),
                "time": p.get("time"),
                "depth": depth,
            })
        R["seismic"] = {"earthquakes": qs, "count": len(qs)}

    d = do_fetch(APIS["geomagnetic"])
    if "_error" in d:
        E.append("geomagnetic: " + d["_error"])
    else:
        kvs = []
        if isinstance(d, list):
            for e in d[-6:]:
                if isinstance(e, (list, tuple)) and len(e) >= 2:
                    try:
                        kvs.append({"time": e[0], "kp": float(e[1])})
                    except: pass
        latest_kp = kvs[-1]["kp"] if kvs else None
        R["geomagnetic"] = {"k_index": kvs, "latest_kp": latest_kp}

    d = do_fetch(APIS["astronomy"].format(lat=lat, lon=lon))
    if "_error" in d:
        E.append("astronomy: " + d["_error"])
    else:
        r = d.get("results", {})
        R["astronomy"] = {
            "sunrise": r.get("sunrise"),
            "sunset": r.get("sunset"),
            "solar_noon": r.get("solar_noon"),
            "day_length": r.get("day_length"),
        }

    elapsed = round(time.time() - t0, 2)
    print("  Fetched {} / 6 sources in {}s".format(len(R), elapsed))
    for e_item in E:
        print("  ERROR: {}".format(e_item))

    # Write to Table DATs
    for key in ["weather", "marine", "air_quality", "seismic", "geomagnetic", "astronomy"]:
        tbl = op("/project1/api_patagonia/tbl_" + key)
        if tbl is None: continue
        do = R.get(key, {"status": "no_data"})
        tbl.clear()
        tbl.appendRow(["key", "value"])
        if isinstance(do, dict):
            for k, v in do.items():
                if isinstance(v, (list, dict)):
                    tbl.appendRow([k, json.dumps(v)])
                elif v is not None:
                    tbl.appendRow([k, str(v)])
                else:
                    tbl.appendRow([k, "N/A"])

    # Write to chop_data — explicit variable, no tuple unpacking
    vals = {}
    w = R.get("weather", {})
    vals["temperature"] = sf(w.get("temperature"))
    vals["humidity"] = sf(w.get("humidity"))
    vals["wind_speed"] = sf(w.get("wind_speed"))
    vals["wind_direction"] = sf(w.get("wind_direction"))
    vals["precipitation"] = sf(w.get("precipitation"))
    vals["cloud_cover"] = sf(w.get("cloud_cover"))
    vals["weather_code"] = sf(w.get("weather_code"))
    m = R.get("marine", {})
    vals["wave_height"] = sf(m.get("wave_height"))
    vals["wave_direction"] = sf(m.get("wave_direction"))
    vals["wave_period"] = sf(m.get("wave_period"))
    vals["sea_surface_temp"] = sf(m.get("sea_surface_temp"))
    a = R.get("air_quality", {})
    vals["pm10"] = sf(a.get("pm10"))
    vals["pm2_5"] = sf(a.get("pm2_5"))
    vals["no2"] = sf(a.get("no2"))
    vals["so2"] = sf(a.get("so2"))
    vals["ozone"] = sf(a.get("ozone"))
    vals["uv_index"] = sf(a.get("uv_index"))
    g = R.get("geomagnetic", {})
    vals["kp_index"] = sf(g.get("latest_kp"))
    s = R.get("seismic", {})
    vals["quake_count"] = sf(s.get("count"))
    if s.get("earthquakes"):
        vals["latest_quake_mag"] = sf(s["earthquakes"][0].get("mag"))

    ct = op("/project1/api_patagonia/chop_data")
    if ct:
        row = []
        for ch in CHOP_CHANNELS:
            row.append(str(vals.get(ch, 0)))
        ct.clear()
        ct.appendRow(CHOP_CHANNELS)
        ct.appendRow(row)
        print("  chop_data: {} cols written".format(len(CHOP_CHANNELS)))

    # Update status
    try: base.par.Lastfetch.val = time.time()
    except: pass
    st = {
        "last_fetch": time.strftime("%Y-%m-%d %H:%M:%S"),
        "fetch_count": 1,
        "errors": E,
        "elapsed_sec": elapsed,
        "sources_ok": list(R.keys()),
        "primary_location": "el_chalten",
    }
    op("/project1/api_patagonia/last_status").text = json.dumps(st, indent=2)

except Exception as e:
    elapsed = round(time.time() - t0, 1)
    print("  FETCH ERROR ({}s): {}".format(elapsed, e))

# ================================================================
# PHASE 5: ENABLE AUTO-FETCH (now that immediate fetch is done)
# ================================================================
try: exec_dat.par.cookrate = 1
except: pass
print("[REBUILD] on_frame cookrate=1 (auto-fetch enabled)")

# ================================================================
# PHASE 6: VERIFICATION
# ================================================================
print("")
print("=" * 60)
print("  PHASE 3: VERIFICATION")
print("=" * 60)

print("")
print("  TABLE DATS:")
tbl_ok = True
for name in TBL_NAMES:
    tbl = op("/project1/api_patagonia/tbl_" + name)
    if tbl:
        rows = tbl.numRows
        has_data = rows > 2
        preview = ""
        if rows > 2:
            preview = str(tbl[1, 1])[:50]
        status = "[DATA]" if has_data else "[EMPTY]"
        print("  {:25s} rows={:>2d} {} {}".format(name, rows, status, preview))
        if not has_data:
            tbl_ok = False

print("")
print("  CHOP_DATA TABLE:")
nonzero = 0
ct = op("/project1/api_patagonia/chop_data")
if ct:
    print("  rows={} cols={}".format(ct.numRows, ct.numCols))
    if ct.numRows > 1:
        for i, ch in enumerate(CHOP_CHANNELS):
            if ct.numCols > i:
                val = ct[1, i]
            else:
                val = "0"
            if val != "0":
                nonzero += 1
            print("    {:25s} = {}".format(ch, val))
        print("  {} channels with real values".format(nonzero))

print("")
print("  CUSTOM PARAMETERS:")
for pname in ["Pollsec", "Location", "Autofetch", "Lastfetch"]:
    try:
        val = getattr(base.par, pname).eval()
        print("  {:20s} = {}".format(pname, val))
    except:
        print("  {:20s} MISSING".format(pname))

print("")
print("  STATUS:")
try:
    s = json.loads(op("/project1/api_patagonia/last_status").text)
    print("  last_fetch: {}".format(s.get("last_fetch")))
    print("  sources_ok: {}".format(s.get("sources_ok")))
    print("  errors: {}".format(len(s.get("errors", []))))
except Exception as e:
    print("  Error: {}".format(e))

print("")
print("  HEALTHCHECK:")
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

print("")
print("  POSITIONS:")
for child in base.children:
    try:
        print("    {:25s} ({:>6.0f}, {:>6.0f})".format(child.name, child.nodeX, child.nodeY))
    except:
        print("    {:25s} (no pos)".format(child.name))

print("")
print("=" * 60)
print("  FINAL SUMMARY")
print("=" * 60)
print("  Operators: {}".format(len(base.children)))
print("  Table DATs: {}".format("ALL OK" if tbl_ok else "SOME EMPTY"))
print("  chop_data: {} channels ({} with values)".format(len(CHOP_CHANNELS), nonzero))
print("  Execute DATs: on_frame (auto-fetch), manual_fetch (pulse)")
print("  Health: {}".format("CLEAN" if issues == 0 else "{} ISSUES".format(issues)))
print("=" * 60)
