import td

def create_pop_system():
    p = op('/project1')
    if not p:
        print('Error: No se encontró el componente /project1')
        return
    
    # Limpiar componente previo si existe
    existing = p.op('pop_particles_trail')
    if existing:
        existing.destroy()

    # Crear un contenedor base
    comp = p.create(baseCOMP, 'pop_particles_trail')
    comp.nodeX = 0
    comp.nodeY = 0

    # 1. Source (Generador de Puntos)
    pg = comp.create(pointgeneratorPOP, 'pg_source')
    pg.par.numpoints = 200
    
    # 2. Solver de Partículas
    particles = comp.create(particlePOP, 'pop_particles')
    particles.par.birthrate = 100
    particles.par.life = 3
    
    # 3. Fuerzas (Movimiento en 3D con Noise)
    force = comp.create(noisePOP, 'force_noise')
    force.par.amp = 2.0
    
    # 4. Trail (Rastro del movimiento)
    trail = comp.create(trailPOP, 'pop_trail')
    
    # 5. Salida del sistema POP
    out = comp.create(nullPOP, 'out_pop')
    
    # Conectar los nodos POP
    particles.inputConnectors[0].connect(pg)
    force.inputConnectors[0].connect(particles)
    trail.inputConnectors[0].connect(force)
    out.inputConnectors[0].connect(trail)
    
    # Layout de los nodos POP
    nodes = [pg, particles, force, trail, out]
    for i, n in enumerate(nodes):
        n.nodeX = i * 200
        n.nodeY = 0

    # --- Configuración de Escena 3D y Render ---
    
    # Geo COMP para renderizar los POPs
    geo = comp.create(geometryCOMP, 'geo_particles')
    geo.nodeX = 0
    geo.nodeY = -200
    
    # Seleccionar el POP dentro del Geo COMP para renderizarlo nativamente
    geo_select = geo.create(selectPOP, 'select_pop')
    geo_select.par.pop = '../out_pop'
    
    geo_out = geo.create(nullPOP, 'out_render_pop')
    geo_out.inputConnectors[0].connect(geo_select)
    geo_out.display = True
    geo_out.render = True
    
    # Cámara
    cam = comp.create(cameraCOMP, 'cam1')
    cam.nodeX = 200
    cam.nodeY = -200
    cam.par.tz = 5
    
    # Material (Line MAT es ideal para renderizar primitivas tipo línea del Trail)
    mat = comp.create(lineMAT, 'mat_line')
    mat.nodeX = 0
    mat.nodeY = -350
    geo.par.material = mat
    
    # Render TOP
    render = comp.create(renderTOP, 'render1')
    render.nodeX = 400
    render.nodeY = -200
    render.par.camera = cam.name
    render.par.geometry = geo.name
    
    # Salida final
    out_top = comp.create(nullTOP, 'out_render')
    out_top.nodeX = 600
    out_top.nodeY = -200
    out_top.inputConnectors[0].connect(render)
    
    print('Sistema de partículas POP con Trail y Escena 3D generado exitosamente.')

create_pop_system()
