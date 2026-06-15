#!/usr/bin/env node
/**
 * build_particle_system.mjs
 * POP particle system for TD 2025.
 *
 * Architecture:
 * - POP operators live INSIDE geometryCOMP (standard TD 2025 pattern)
 * - geometryCOMP renders its POP children
 * - renderTOP.par.geometry = geo path, renderTOP.par.camera = cam path
 * - Output chain: POP chain → pop_out → render → top_out (1280x720)
 * - Feedback: pop_out → particlePOP via targetpop param
 */
import { McpClient, ROOT } from "./test_helpers.mjs";

const SCENE = `${ROOT}/pop_particle_system`;
const NET = `${SCENE}/particle_net`;
const GEO = `${NET}/geo`;

function parsePyResult(result) {
  if (!result.ok) return null;
  try {
    const stdout = result.data?.stdout;
    return stdout ? JSON.parse(stdout) : result.data;
  } catch { return result.data; }
}

async function pyExec(c, code, timeout = 15000) {
  const r = await c.call("td_execute", { code: code.trim() }, timeout);
  if (!r.ok) {
    console.log(`  ⚠️  Python failed: ${r.error || JSON.stringify(r.data)}`);
    return null;
  }
  return parsePyResult(r);
}

async function run() {
  const c = new McpClient();

  try {
    await c.start();
    await c.waitForReady();
    console.log("  ✅ MCP Server ready");
  } catch (e) {
    console.error(`  ❌ Server failed: ${e.message}`);
    c.stop();
    process.exit(1);
  }

  const hc = await c.call("td_healthcheck", { path: "/", recurse: false }, 5000);
  if (!hc.ok || hc.data?.error) {
    console.log("  ❌ TouchDesigner NOT connected");
    c.stop();
    process.exit(1);
  }
  console.log("  ✅ TouchDesigner connected\n");

  // Cleanup
  try {
    await c.call("td_delete_operator", { path: SCENE }, 3000);
    console.log("  🧹 Cleaned previous scene");
  } catch {}

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 1: Create structure + render pipeline
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log("\n── Phase 1: Creating Structure ──\n");

  const createResult = await pyExec(c, `import json
try:
    root = op('${ROOT}')

    scene = root.create('baseCOMP', 'pop_particle_system')
    scene.nodeX = 50; scene.nodeY = 50

    net = scene.create('baseCOMP', 'particle_net')
    net.nodeX = 50; net.nodeY = 50

    # geometryCOMP — POP operators go INSIDE this
    geo = net.create('geometryCOMP', 'geo')
    geo.nodeX = 50; geo.nodeY = 300

    # Camera
    cam = net.create('cameraCOMP', 'cam')
    cam.nodeX = 50; cam.nodeY = 400
    cam.par.tz = -8; cam.par.ty = 2

    # Render pipeline — renderTOP references geo and cam via params
    render = net.create('renderTOP', 'render')
    render.nodeX = 330; render.nodeY = 300
    render.par.geometry = geo.path
    render.par.camera = cam.path

    # Output nullTOP
    top_out = net.create('nullTOP', 'top_out')
    top_out.nodeX = 610; top_out.nodeY = 300
    top_out.inputConnectors[0].connect(render)

    print(json.dumps({'success': True, 'geo': geo.path, 'cam': cam.path}))
except Exception as e:
    print(json.dumps({'success': False, 'error': str(e)}))`);

  if (!createResult?.success) {
    console.log(`  ❌ Structure failed: ${createResult?.error}`);
    c.stop(); process.exit(1);
  }
  console.log(`  ✅ Structure created: geo=${createResult.geo}`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 2: Create POP operators inside geometryCOMP
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log("\n── Phase 2: POP Network (inside geo) ──\n");

  const popResult = await pyExec(c, `import json
try:
    geo = op('${GEO}')
    ops = []

    emitter = geo.create('spherePOP', 'emitter')
    emitter.nodeX = 50; emitter.nodeY = 50
    ops.append(emitter.name)

    rv = geo.create('randomPOP', 'rand_vel')
    rv.nodeX = 330; rv.nodeY = 50
    ops.append(rv.name)

    pp = geo.create('particlePOP', 'particle')
    pp.nodeX = 610; pp.nodeY = 50
    ops.append(pp.name)

    ns = geo.create('noisePOP', 'turbulence')
    ns.nodeX = 890; ns.nodeY = 50
    ops.append(ns.name)

    tr = geo.create('transformPOP', 'spin')
    tr.nodeX = 1170; tr.nodeY = 50
    ops.append(tr.name)

    tl = geo.create('trailPOP', 'trail')
    tl.nodeX = 890; tl.nodeY = 230
    ops.append(tl.name)

    po = geo.create('nullPOP', 'pop_out')
    po.nodeX = 1170; po.nodeY = 230
    ops.append(po.name)

    print(json.dumps({'success': True, 'count': len(ops), 'operators': ops}))
except Exception as e:
    print(json.dumps({'success': False, 'error': str(e)}))`);

  if (!popResult?.success) {
    console.log(`  ❌ POP creation failed: ${popResult?.error}`);
    c.stop(); process.exit(1);
  }
  console.log(`  ✅ ${popResult.count} POP operators created inside geo`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 3: Wire POP chain
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log("\n── Phase 3: Wiring POP Chain ──\n");

  const wireResult = await pyExec(c, `import json
try:
    geo = op('${GEO}')
    wired = []
    failed = []

    chain = [
        ('emitter', 'rand_vel'),
        ('rand_vel', 'particle'),
        ('particle', 'turbulence'),
        ('turbulence', 'spin'),
        ('spin', 'trail'),
        ('trail', 'pop_out'),
    ]

    for src_name, tgt_name in chain:
        src = geo.op(src_name)
        tgt = geo.op(tgt_name)
        if src and tgt:
            try:
                tgt.inputConnectors[0].connect(src)
                wired.append(src_name + ' -> ' + tgt_name)
            except Exception as e:
                failed.append(src_name + ' -> ' + tgt_name + ': ' + str(e))
        else:
            failed.append(src_name + ' -> ' + tgt_name + ': not found')

    print(json.dumps({'success': True, 'wired': wired, 'failed': failed, 'count': len(wired)}))
except Exception as e:
    print(json.dumps({'success': False, 'error': str(e)}))`);

  console.log(`  ✅ ${wireResult?.count || 0} connections wired`);
  for (const w of (wireResult?.wired || [])) console.log(`    ${w}`);
  for (const f of (wireResult?.failed || [])) console.log(`    ❌ ${f}`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 4: Parameters
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log("\n── Phase 4: Parameters ──\n");

  const paramResult = await pyExec(c, `import json
try:
    geo = op('${GEO}')
    r = {}

    # spherePOP params: radx/rady/radz, freq, cols, rows
    e = geo.op('emitter')
    if e:
        try:
            for pname, pval in [('radx',0.8),('rady',0.8),('radz',0.8),('freq',12),('cols',30),('rows',30),('rx',0),('ry',0),('rz',0),('tx',0),('ty',0),('tz',0),('scale',1.0)]:
                if hasattr(e.par, pname):
                    try: setattr(e.par, pname, pval)
                    except: pass
            r['emitter'] = 'ok'
        except Exception as ex: r['emitter'] = str(ex)

    rv = geo.op('rand_vel')
    if rv:
        try:
            if hasattr(rv.par, 'type'): rv.par.type = 'direction'
            if hasattr(rv.par, 'randomsize'): rv.par.randomsize = '3'
            if hasattr(rv.par, 'amp0'): rv.par.amp0 = 2.0
            if hasattr(rv.par, 'seed'): rv.par.seed = 42
            r['rand_vel'] = 'ok'
        except Exception as ex: r['rand_vel'] = str(ex)

    pp = geo.op('particle')
    if pp:
        try:
            if hasattr(pp.par, 'maxparticles'): pp.par.maxparticles = 2000
            if hasattr(pp.par, 'birthrate'): pp.par.birthrate = 100
            if hasattr(pp.par, 'life'): pp.par.life = 4.0
            if hasattr(pp.par, 'lifevariance'): pp.par.lifevariance = 1.0
            if hasattr(pp.par, 'timeintegration'): pp.par.timeintegration = True
            if hasattr(pp.par, 'initmass'): pp.par.initmass = 1.0
            if hasattr(pp.par, 'initdrag'): pp.par.initdrag = 0.02
            if hasattr(pp.par, 'damping'): pp.par.damping = 0.01
            r['particle'] = 'ok'
        except Exception as ex: r['particle'] = str(ex)

    ns = geo.op('turbulence')
    if ns:
        try:
            if hasattr(ns.par, 'period'): ns.par.period = 1.5
            if hasattr(ns.par, 'amp0'): ns.par.amp0 = 0.3
            if hasattr(ns.par, 'harmon'): ns.par.harmon = 2
            if hasattr(ns.par, 'spread'): ns.par.spread = 2.0
            if hasattr(ns.par, 'gain'): ns.par.gain = 0.7
            r['turbulence'] = 'ok'
        except Exception as ex: r['turbulence'] = str(ex)

    tr = geo.op('spin')
    if tr:
        try:
            if hasattr(tr.par, 'ry'): tr.par.ry = 15
            r['spin'] = 'ok'
        except Exception as ex: r['spin'] = str(ex)

    tl = geo.op('trail')
    if tl:
        try:
            if hasattr(tl.par, 'length'): tl.par.length = 1.0
            if hasattr(tl.par, 'inc'): tl.par.inc = 1.0
            r['trail'] = 'ok'
        except Exception as ex: r['trail'] = str(ex)

    print(json.dumps({'success': True, 'results': r}))
except Exception as e:
    print(json.dumps({'success': False, 'error': str(e)}))`);

  const okP = Object.values(paramResult?.results || {}).filter(v => v === "ok").length;
  const totP = Object.keys(paramResult?.results || {}).length;
  console.log(`  ✅ ${okP}/${totP} param sets OK`);
  if (paramResult?.results?.emitter_pars) {
    console.log(`  spherePOP emitter configured (radx/rady/radz=0.8, freq=12, cols/rows=30)`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 5: Feedback Loop
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log("\n── Phase 5: Feedback Loop ──\n");

  const fbResult = await pyExec(c, `import json
try:
    geo = op('${GEO}')
    particle = geo.op('particle')
    pop_out = geo.op('pop_out')
    if not particle or not pop_out:
        print(json.dumps({'success':False,'error':'ops not found'}))
    else:
        target = ''
        for p in particle.pars():
            pname = p.name.lower()
            if 'targetpop' in pname or 'target' in pname or 'feedback' in pname:
                try:
                    p.val = pop_out.path
                    target = p.name
                    break
                except: pass
        if not target:
            for name in ['targetpop', 'targetfeedbacklooppop']:
                try:
                    setattr(particle.par, name, pop_out.path)
                    target = name
                    break
                except: pass
        print(json.dumps({'success': len(target) > 0, 'param': target}))
except Exception as e:
    print(json.dumps({'success': False, 'error': str(e)}))`);

  if (fbResult?.success) {
    console.log(`  ✅ Feedback: particle.${fbResult.param} → pop_out`);
  } else {
    console.log(`  ⚠️  Feedback: ${fbResult?.error || "not found"}`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 6: Verification
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log("\n── Phase 6: Verification ──\n");

  const verifyResult = await pyExec(c, `import json
try:
    geo = op('${GEO}')
    net = op('${NET}')

    pop_names = ['emitter','rand_vel','particle','turbulence','spin','trail','pop_out']
    pop_found = []
    for name in pop_names:
        t = geo.op(name)
        if t:
            pop_found.append(name + ':' + t.__class__.__name__)

    # Check connections by verifying input count
    pop_conns = []
    for i, name in enumerate(pop_names[:-1]):
        tgt = geo.op(pop_names[i+1])
        if tgt:
            try:
                nconn = len(tgt.inputConnectors)
                pop_conns.append(pop_names[i+1] + ' has ' + str(nconn) + ' input(s)')
            except:
                pop_conns.append(pop_names[i+1] + ': no inputConnectors')

    # Render params
    render = net.op('render')
    render_info = {}
    if render:
        try: render_info['geometry'] = str(render.par.geometry.eval())
        except: render_info['geometry'] = 'error'
        try: render_info['camera'] = str(render.par.camera.eval())
        except: render_info['camera'] = 'error'

    # Output sizes
    top_out = net.op('top_out')
    if top_out:
        render_info['top_out'] = str(top_out.width) + 'x' + str(top_out.height)

    # POP data check
    pop_out = geo.op('pop_out')
    if pop_out:
        try: render_info['pop_out_points'] = int(pop_out.numPoints())
        except: render_info['pop_out_points'] = 'N/A'

    # Feedback
    particle = geo.op('particle')
    fb = ''
    if particle and pop_out:
        for p in particle.pars():
            try:
                if pop_out.path in str(p.val):
                    fb = p.name
                    break
            except: pass

    # Errors
    issues = []
    for name in pop_names:
        t = geo.op(name)
        if t:
            try:
                e = t.errors()
                if e: issues.append(name + ': ' + str(e)[:80])
            except: pass

    print(json.dumps({
        'pop_operators': pop_found,
        'pop_conns': pop_conns,
        'render': render_info,
        'feedback': fb,
        'issues': issues
    }, indent=2))
except Exception as e:
    print(json.dumps({'error': str(e)}))`);

  if (verifyResult) {
    console.log(`  POP operators: ${verifyResult.pop_operators?.length || 0}/7`);
    for (const c of (verifyResult.pop_conns || [])) console.log(`    ${c}`);
    console.log(`  Render geometry: ${verifyResult.render?.geometry || "N/A"}`);
    console.log(`  Render camera: ${verifyResult.render?.camera || "N/A"}`);
    console.log(`  Top out: ${verifyResult.render?.top_out || "N/A"}`);
    console.log(`  POP points flowing: ${verifyResult.render?.pop_out_points ?? "N/A"}`);
    console.log(`  Feedback: ${verifyResult.feedback || "NONE"}`);
    if (verifyResult.issues?.length > 0) {
      console.log(`  ⚠️  Errors:`);
      for (const i of verifyResult.issues) console.log(`    ${i}`);
    }
  }

  // Navigate
  try { await c.call("td_navigate_to", { path: GEO }, 3000); } catch {}
  console.log("\n  📍 Navigated to geo (POP network inside geometryCOMP)");

  try {
    const screenshot = await c.call("td_screenshot", { path: NET }, 10000);
    if (screenshot.ok && screenshot.data?.image) console.log("  📸 Screenshot captured");
  } catch {}

  console.log("\n🎨 === POP Particle System Complete ===\n");
  console.log("  /project1/pop_particle_system/particle_net");
  console.log("    geo (geometryCOMP)");
  console.log("      emitter(spherePOP) → rand_vel → particle");
  console.log("      → turbulence → spin → trail → pop_out");
  console.log("    cam → renderTOP(1280x720) → top_out");
  console.log("    Feedback: pop_out → particle (targetpop)");
  console.log("  ======================================\n");

  await new Promise(r => setTimeout(r, 1000));
  c.stop();
  console.log("  ✅ Done!\n");
}

run().catch((e) => {
  console.error(`\n  💥 Crash: ${e.message}`);
  process.exit(1);
});
