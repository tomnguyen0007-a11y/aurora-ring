"""
Afterimage Hall, built in Blender at real-world scale (metres).

Run:  python build_hall.py                 (full render of the 'overview' view)
      VIEW=window python build_hall.py     (the glazed-wall view)
      PREVIEW=1 python build_hall.py       (fast, small test render, about 40 s)
Needs the `bpy` Python package (Blender as a module). Outputs go to ./out.

Design rules, from gallery practice:
  - Works hang with their centre about 1.5 m from the floor (57 to 60 inches).
  - Track lights sit about 30 degrees off each work's centre line, so they wash the wall
    without glare: for a 4.4 m ceiling that puts the rail about 1.6 m from the wall.
  - Warm-neutral light (about 3300 K) with a high colour-rendering index.
  - Plinths in quiet neutrals (limewash, travertine, charcoal microcement, pale oak).
"""
import math
import os
import random

import bpy  # must come first: it makes bmesh and mathutils importable
import bmesh  # noqa: E402
from mathutils import Euler, Vector  # noqa: E402

PREVIEW = bool(os.environ.get('PREVIEW'))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
os.makedirs(OUT, exist_ok=True)
random.seed(7)

# Room interior, metres. x runs left to right, y runs front to back, z is up.
W, D, H = 16.0, 11.0, 4.4
HW, HD = W / 2, D / 2
ART_W, ART_H, ART_CENTER = 1.2, 1.5, 1.52     # painting size and centre height
RAIL_OFFSET = (H - 0.6 - ART_CENTER) * math.tan(math.radians(30))  # about 1.6 m

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def srgb(h):
    """'#rrggbb' to linear RGB, as Blender colour inputs expect."""
    h = h.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


# ---- materials ------------------------------------------------------------
def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.node_tree.nodes.clear()
    out = m.node_tree.nodes.new('ShaderNodeOutputMaterial')
    bsdf = m.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
    m.node_tree.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return m, m.node_tree, bsdf


def node(tree, kind, **props):
    n = tree.nodes.new(kind)
    for k, v in props.items():
        setattr(n, k, v)
    return n


def simple(name, color, rough=0.6, metal=0.0, **extra):
    m, t, b = new_mat(name)
    b.inputs['Base Color'].default_value = srgb(color) if isinstance(color, str) else color
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    for k, v in extra.items():
        b.inputs[k.replace('_', ' ').title()].default_value = v
    return m


def textured(name, base, rough, bump_scale, bump_strength=0.15, variation=0.04, noise_scale=300.0):
    """A matte painted or plastered surface with fine grain and soft colour drift."""
    m, t, b = new_mat(name)
    coord = node(t, 'ShaderNodeTexCoord')
    grain = node(t, 'ShaderNodeTexNoise')
    grain.inputs['Scale'].default_value = noise_scale
    grain.inputs['Detail'].default_value = 8
    t.links.new(coord.outputs['Object'], grain.inputs['Vector'])
    bump = node(t, 'ShaderNodeBump')
    bump.inputs['Strength'].default_value = bump_strength
    bump.inputs['Distance'].default_value = bump_scale
    t.links.new(grain.outputs['Fac'], bump.inputs['Height'])
    t.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    cloud = node(t, 'ShaderNodeTexNoise')
    cloud.inputs['Scale'].default_value = 0.8
    cloud.inputs['Detail'].default_value = 3
    t.links.new(coord.outputs['Object'], cloud.inputs['Vector'])
    mix = node(t, 'ShaderNodeMix', data_type='RGBA')
    mix.inputs['Factor'].default_value = variation
    mix.inputs['A'].default_value = srgb(base)
    mix.inputs['B'].default_value = tuple(min(1, c * 0.78) for c in srgb(base)[:3]) + (1.0,)
    t.links.new(cloud.outputs['Fac'], mix.inputs['Factor'])
    mix.inputs['Factor'].default_value = 0.5
    t.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    return m


def oak_floor():
    """Wide oak boards in running bond: colour per board, grain along the board, fine gaps."""
    m, t, b = new_mat('OakFloor')
    coord = node(t, 'ShaderNodeTexCoord')
    brick = node(t, 'ShaderNodeTexBrick', offset=0.5, offset_frequency=2, squash=1.0, squash_frequency=2)
    brick.inputs['Color1'].default_value = srgb('#dcbd8e')
    brick.inputs['Color2'].default_value = srgb('#c6a174')
    brick.inputs['Mortar'].default_value = srgb('#2e2216')
    brick.inputs['Scale'].default_value = 1.0
    brick.inputs['Mortar Size'].default_value = 0.004
    brick.inputs['Mortar Smooth'].default_value = 0.1
    brick.inputs['Bias'].default_value = 0.0
    brick.inputs['Brick Width'].default_value = 2.1
    brick.inputs['Row Height'].default_value = 0.19
    t.links.new(coord.outputs['Object'], brick.inputs['Vector'])
    split = node(t, 'ShaderNodeSeparateColor')
    t.links.new(brick.outputs['Color'], split.inputs['Color'])
    phase = node(t, 'ShaderNodeMath', operation='MULTIPLY')
    phase.inputs[1].default_value = 40.0
    t.links.new(split.outputs['Red'], phase.inputs[0])
    grain = node(t, 'ShaderNodeTexWave', wave_type='BANDS', bands_direction='Y', wave_profile='SAW')
    grain.inputs['Scale'].default_value = 70.0
    grain.inputs['Distortion'].default_value = 7.0
    grain.inputs['Detail'].default_value = 3.0
    t.links.new(coord.outputs['Object'], grain.inputs['Vector'])
    t.links.new(phase.outputs['Value'], grain.inputs['Phase Offset'])
    fine = node(t, 'ShaderNodeTexNoise')
    fine.inputs['Scale'].default_value = 220.0
    fine.inputs['Detail'].default_value = 6.0
    t.links.new(coord.outputs['Object'], fine.inputs['Vector'])
    shade = node(t, 'ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
    shade.inputs['Factor'].default_value = 0.42
    t.links.new(brick.outputs['Color'], shade.inputs['A'])
    t.links.new(grain.outputs['Color'], shade.inputs['B'])
    t.links.new(shade.outputs['Result'], b.inputs['Base Color'])
    height = node(t, 'ShaderNodeMath', operation='ADD')
    t.links.new(grain.outputs['Fac'], height.inputs[0])
    t.links.new(fine.outputs['Fac'], height.inputs[1])
    gap = node(t, 'ShaderNodeMath', operation='MULTIPLY')
    t.links.new(height.outputs['Value'], gap.inputs[0])
    t.links.new(brick.outputs['Fac'], gap.inputs[1])
    bump = node(t, 'ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.35
    bump.inputs['Distance'].default_value = 0.004
    t.links.new(gap.outputs['Value'], bump.inputs['Height'])
    t.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    b.inputs['Roughness'].default_value = 0.36
    b.inputs['Coat Weight'].default_value = 0.22
    b.inputs['Coat Roughness'].default_value = 0.25
    return m


def travertine():
    m, t, b = new_mat('Travertine')
    coord = node(t, 'ShaderNodeTexCoord')
    bands = node(t, 'ShaderNodeTexWave', wave_type='BANDS', bands_direction='Z')
    bands.inputs['Scale'].default_value = 5.0
    bands.inputs['Distortion'].default_value = 3.0
    t.links.new(coord.outputs['Object'], bands.inputs['Vector'])
    ramp = node(t, 'ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = srgb('#cdb99a')
    ramp.color_ramp.elements[1].color = srgb('#e4d6bb')
    t.links.new(bands.outputs['Fac'], ramp.inputs['Fac'])
    pores = node(t, 'ShaderNodeTexVoronoi')
    pores.inputs['Scale'].default_value = 90.0
    pores.inputs['Randomness'].default_value = 1.0
    t.links.new(coord.outputs['Object'], pores.inputs['Vector'])
    pore_mask = node(t, 'ShaderNodeMath', operation='LESS_THAN')
    pore_mask.inputs[1].default_value = 0.12
    t.links.new(pores.outputs['Distance'], pore_mask.inputs[0])
    mix = node(t, 'ShaderNodeMix', data_type='RGBA')
    mix.inputs['B'].default_value = srgb('#7b6a50')
    t.links.new(pore_mask.outputs['Value'], mix.inputs['Factor'])
    t.links.new(ramp.outputs['Color'], mix.inputs['A'])
    t.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    bump = node(t, 'ShaderNodeBump')
    bump.inputs['Distance'].default_value = 0.002
    t.links.new(pore_mask.outputs['Value'], bump.inputs['Height'])
    t.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    b.inputs['Roughness'].default_value = 0.5
    return m


MAT = {
    'plaster': textured('Plaster', '#efe7da', 0.9, 0.003, 0.25, noise_scale=500.0),
    'ceiling': textured('Ceiling', '#efece6', 0.95, 0.002, 0.15, noise_scale=400.0),
    'limewash': textured('Limewash', '#e6e1d6', 0.85, 0.004, 0.35, variation=0.2, noise_scale=40.0),
    'microcement': textured('Microcement', '#3c3a37', 0.5, 0.003, 0.3, variation=0.25, noise_scale=30.0),
    'floor': oak_floor(),
    'travertine': travertine(),
    'frame': simple('Frame', '#15110e', 0.4, coat_weight=0.2),
    'mat': simple('MatBoard', '#ece8df', 0.95),
    'steel': simple('BlackSteel', '#0b0b0c', 0.38, 0.85),
    'rail': simple('Rail', '#111111', 0.5, 0.4),
    'brass': simple('Brass', '#c99a52', 0.24, 1.0),
    'chrome': simple('Chrome', '#e8e8e8', 0.03, 1.0),
    'oak': simple('PaleOak', '#c9a574', 0.45, coat_weight=0.2),
    'fabric': simple('Fabric', '#7b746a', 0.95, sheen_weight=0.5),
    'terracotta': simple('Terracotta', '#b25a32', 0.5),
    'black_slip': simple('BlackSlip', '#14100e', 0.35),
    'white': simple('White', '#f1efe9', 0.8),
    'ground': simple('Ground', '#6b6a65', 0.9),
}
LENS = bpy.data.materials.new('Lens')
LENS.use_nodes = True
LENS.node_tree.nodes.clear()
_e = LENS.node_tree.nodes.new('ShaderNodeEmission')
_e.inputs['Color'].default_value = (1.0, 0.86, 0.66, 1.0)
_e.inputs['Strength'].default_value = 25.0
_o = LENS.node_tree.nodes.new('ShaderNodeOutputMaterial')
LENS.node_tree.links.new(_e.outputs['Emission'], _o.inputs['Surface'])
PANEL = bpy.data.materials.new('DaylightPanel')
PANEL.use_nodes = True
PANEL.node_tree.nodes.clear()
_pe = PANEL.node_tree.nodes.new('ShaderNodeEmission')
_pe.inputs['Color'].default_value = (0.95, 0.97, 1.0, 1.0)
_pe.inputs['Strength'].default_value = 1.1
_po = PANEL.node_tree.nodes.new('ShaderNodeOutputMaterial')
PANEL.node_tree.links.new(_pe.outputs['Emission'], _po.inputs['Surface'])


# ---- geometry helpers --------------------------------------------------------
def link(obj):
    scene.collection.objects.link(obj)
    return obj


def make_box(name, dims, loc, mat, bevel=0.0, rot_z=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= dims[0]
        v.co.y *= dims[1]
        v.co.z *= dims[2]
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=2, affect='EDGES')
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    obj.rotation_euler.z = rot_z
    obj.data.materials.append(mat)
    return link(obj)


def make_cylinder(name, radius, depth, loc, mat, rot=(0, 0, 0), segments=48):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius, radius2=radius, depth=depth)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    for p in mesh.polygons:
        p.use_smooth = True
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    obj.rotation_euler = Euler(rot)
    obj.data.materials.append(mat)
    return link(obj)


def make_lathe(name, profile, loc, mats, segments=96):
    """Revolve (radius, height) points around the vertical axis. mats is a function of height."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        ring = [bm.verts.new((r * math.cos(2 * math.pi * i / segments), r * math.sin(2 * math.pi * i / segments), z)) for i in range(segments)]
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(segments):
            j = (i + 1) % segments
            bm.faces.new((a[i], a[j], b[j], b[i]))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    for p in mesh.polygons:
        p.use_smooth = True
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    for m in mats:
        obj.data.materials.append(m)
    # Material slot by band of height (for the banded vase).
    zs = [z for _, z in profile]
    lo, hi = min(zs), max(zs)
    for p in mesh.polygons:
        zc = sum(mesh.vertices[v].co.z for v in p.vertices) / len(p.vertices)
        t = (zc - lo) / (hi - lo)
        p.material_index = 1 if (t < 0.08 or 0.18 < t < 0.2 or 0.55 < t < 0.7 or t > 0.9) else 0
    return link(obj)


# ---- the shell --------------------------------------------------------------
T = 0.4
WIN = dict(y0=-3.0, y1=4.0, z0=0.45, z1=3.7)  # window opening in the right wall
make_box('Floor', (W + 2 * T, D + 2 * T, 0.3), (0, 0, -0.15), MAT['floor'])
make_box('Ceiling', (W + 2 * T, D + 2 * T, 0.3), (0, 0, H + 0.15), MAT['ceiling'])
make_box('WallBack', (W + 2 * T, T, H), (0, HD + T / 2, H / 2), MAT['plaster'])
make_box('WallFront', (W + 2 * T, T, H), (0, -HD - T / 2, H / 2), MAT['plaster'])
make_box('WallLeft', (T, D, H), (-HW - T / 2, 0, H / 2), MAT['plaster'])
# Right wall around the window.
make_box('WallRightA', (T, WIN['y0'] + HD, H), (HW + T / 2, (-HD + WIN['y0']) / 2, H / 2), MAT['plaster'])
make_box('WallRightB', (T, HD - WIN['y1'], H), (HW + T / 2, (HD + WIN['y1']) / 2, H / 2), MAT['plaster'])
make_box('WallRightTop', (T, WIN['y1'] - WIN['y0'], H - WIN['z1']), (HW + T / 2, (WIN['y0'] + WIN['y1']) / 2, (H + WIN['z1']) / 2), MAT['plaster'])
make_box('WallRightSill', (T, WIN['y1'] - WIN['y0'], WIN['z0']), (HW + T / 2, (WIN['y0'] + WIN['y1']) / 2, WIN['z0'] / 2), MAT['plaster'])

# Skirting: a slim painted board and a shadow gap above the floor.
for name, dims, loc in [
    ('SkirtBack', (W, 0.016, 0.11), (0, HD - 0.008, 0.055)),
    ('SkirtLeft', (0.016, D, 0.11), (-HW + 0.008, 0, 0.055)),
    ('SkirtFront', (W, 0.016, 0.11), (0, -HD + 0.008, 0.055)),
]:
    make_box(name, dims, loc, MAT['white'], bevel=0.002)

# Coffered ceiling: beams and daylight panels.
for x in (-5.2, -1.7, 1.7, 5.2):
    make_box(f'BeamY{x}', (0.3, D, 0.42), (x, 0, H - 0.21), MAT['ceiling'], bevel=0.004)
for y in (-3.4, 0.0, 3.4):
    make_box(f'BeamX{y}', (W, 0.28, 0.36), (0, y, H - 0.18), MAT['ceiling'], bevel=0.004)
for x in (-3.45, 3.45):
    make_box(f'Panel{x}', (2.9, 2.4, 0.02), (x, -1.7, H - 0.012), PANEL)

# Window frame: black steel mullions.
wy, wz = (WIN['y0'] + WIN['y1']) / 2, (WIN['z0'] + WIN['z1']) / 2
for y in (WIN['y0'], WIN['y1']):
    make_box('Mullion', (0.07, 0.06, WIN['z1'] - WIN['z0']), (HW - 0.2, y, wz), MAT['steel'])
for i in range(1, 4):
    make_box('Mullion', (0.05, 0.04, WIN['z1'] - WIN['z0']), (HW - 0.2, WIN['y0'] + (WIN['y1'] - WIN['y0']) * i / 4, wz), MAT['steel'])
for z in (WIN['z0'], WIN['z1'], 2.7):
    make_box('Transom', (0.06, WIN['y1'] - WIN['y0'], 0.05), (HW - 0.2, wy, z), MAT['steel'])
make_box('GroundOutside', (60, 60, 0.1), (HW + 32, 0, -0.1), MAT['ground'])

# ---- track rails and lit fixtures ------------------------------------------------
RAIL_Z = H - 0.47
make_box('RailBack', (W - 1.0, 0.04, 0.035), (0, HD - RAIL_OFFSET, RAIL_Z), MAT['rail'])
make_box('RailLeft', (0.04, D - 1.0, 0.035), (-HW + RAIL_OFFSET, 0, RAIL_Z), MAT['rail'])


def spot(name, loc, target, power=2600, size=34, blend=0.9):
    loc, target = Vector(loc), Vector(target)
    direction = target - loc
    rot = direction.to_track_quat('-Z', 'Y').to_euler()
    data = bpy.data.lights.new(name, 'SPOT')
    data.energy = power
    data.color = (1.0, 0.82, 0.6)          # about 3300 K, warm-neutral
    data.spot_size = math.radians(size)
    data.spot_blend = blend
    data.shadow_soft_size = 0.05
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    obj.rotation_euler = rot
    link(obj)
    body = make_cylinder(name + 'Body', 0.052, 0.2, (0, 0, 0), MAT['rail'], segments=24)
    body.parent = obj
    body.location = (0, 0, 0.105)   # the body sits behind the light, so the beam leaves the open end
    lens = make_cylinder(name + 'Lens', 0.044, 0.01, (0, 0, 0), LENS, segments=24)
    lens.parent = obj
    lens.location = (0, 0, 0.003)
    yoke = make_box(name + 'Yoke', (0.012, 0.012, RAIL_Z - loc.z + 0.02), (0, 0, 0), MAT['rail'])
    yoke.location = (loc.x, loc.y, loc.z + (RAIL_Z - loc.z) / 2 + 0.01)
    return obj


# ---- artworks ----------------------------------------------------------------------
def ramp_mat(name, builder, rough=0.7):
    m, t, b = new_mat(name)
    coord = node(t, 'ShaderNodeTexCoord')
    color = builder(t, coord)
    t.links.new(color, b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    canvas = node(t, 'ShaderNodeTexNoise')
    canvas.inputs['Scale'].default_value = 900.0
    bump = node(t, 'ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.2
    bump.inputs['Distance'].default_value = 0.001
    t.links.new(coord.outputs['Generated'], canvas.inputs['Vector'])
    t.links.new(canvas.outputs['Fac'], bump.inputs['Height'])
    t.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m


def ramp(t, stops):
    r = node(t, 'ShaderNodeValToRGB')
    el = r.color_ramp.elements
    while len(el) < len(stops):
        el.new(0.5)
    for e, (pos, hexcol) in zip(el, stops):
        e.position = pos
        e.color = srgb(hexcol)
    return r


def drift_builder(t, coord):
    warp = node(t, 'ShaderNodeTexNoise')
    warp.inputs['Scale'].default_value = 2.2
    warp.inputs['Detail'].default_value = 5
    t.links.new(coord.outputs['Generated'], warp.inputs['Vector'])
    vec = node(t, 'ShaderNodeVectorMath', operation='ADD')
    t.links.new(coord.outputs['Generated'], vec.inputs[0])
    scale = node(t, 'ShaderNodeVectorMath', operation='SCALE')
    scale.inputs['Scale'].default_value = 0.9
    t.links.new(warp.outputs['Color'], scale.inputs[0])
    t.links.new(scale.outputs['Vector'], vec.inputs[1])
    main = node(t, 'ShaderNodeTexNoise')
    main.inputs['Scale'].default_value = 3.0
    main.inputs['Detail'].default_value = 6
    t.links.new(vec.outputs['Vector'], main.inputs['Vector'])
    r = ramp(t, [(0.25, '#0c1b2b'), (0.42, '#1d7a7e'), (0.62, '#e6793f'), (0.8, '#f3ead9')])
    t.links.new(main.outputs['Fac'], r.inputs['Fac'])
    return r.outputs['Color']


def fracture_builder(t, coord):
    cells = node(t, 'ShaderNodeTexVoronoi', feature='F1')
    cells.inputs['Scale'].default_value = 6.0
    t.links.new(coord.outputs['Generated'], cells.inputs['Vector'])
    split = node(t, 'ShaderNodeSeparateColor')
    t.links.new(cells.outputs['Color'], split.inputs['Color'])
    r = ramp(t, [(0.0, '#3a0f16'), (0.35, '#a2402a'), (0.7, '#d9a441'), (1.0, '#efe6d2')])
    t.links.new(split.outputs['Red'], r.inputs['Fac'])
    edge = node(t, 'ShaderNodeTexVoronoi', feature='DISTANCE_TO_EDGE')
    edge.inputs['Scale'].default_value = 6.0
    t.links.new(coord.outputs['Generated'], edge.inputs['Vector'])
    seam = node(t, 'ShaderNodeMapRange')
    seam.inputs['From Min'].default_value = 0.0
    seam.inputs['From Max'].default_value = 0.05
    t.links.new(edge.outputs['Distance'], seam.inputs['Value'])
    mix = node(t, 'ShaderNodeMix', data_type='RGBA')
    mix.inputs['A'].default_value = srgb('#2a0d10')
    t.links.new(seam.outputs['Result'], mix.inputs['Factor'])
    t.links.new(r.outputs['Color'], mix.inputs['B'])
    return mix.outputs['Result']


def tide_builder(t, coord):
    waves = node(t, 'ShaderNodeTexWave', wave_type='BANDS', bands_direction='Z', wave_profile='SAW')
    waves.inputs['Scale'].default_value = 7.0
    waves.inputs['Distortion'].default_value = 1.3
    waves.inputs['Detail'].default_value = 0.4
    t.links.new(coord.outputs['Generated'], waves.inputs['Vector'])
    r = node(t, 'ShaderNodeValToRGB')
    r.color_ramp.interpolation = 'CONSTANT'
    el = r.color_ramp.elements
    el[0].position = 0.0
    el[0].color = srgb('#14263c')
    el.new(0.62).color = srgb('#c2597a')
    el.new(0.76).color = srgb('#14263c')
    el.new(0.88).color = srgb('#6fb3a4')
    t.links.new(waves.outputs['Fac'], r.inputs['Fac'])
    return r.outputs['Color']


def plane_art(name, size, mat):
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    for v in bm.verts:
        v.co.x *= size[0] * 2
        v.co.z, v.co.y = v.co.y * size[1] * 2, 0.0
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    return obj


def hang(name, center_x, normal, builder=None, extra=None):
    """Frame, mat and canvas on a wall. normal is 'back' (wall at +y), 'left' (wall at x = -HW)."""
    parts = []
    depth = 0.045
    bw = 0.035
    for pname, dims, off in [
        ('Top', (ART_W + 2 * bw + 0.14, depth, bw), (0, 0, ART_H / 2 + 0.07 + bw / 2)),
        ('Bottom', (ART_W + 2 * bw + 0.14, depth, bw), (0, 0, -ART_H / 2 - 0.07 - bw / 2)),
        ('Left', (bw, depth, ART_H + 0.14), (-ART_W / 2 - 0.07 - bw / 2, 0, 0)),
        ('Right', (bw, depth, ART_H + 0.14), (ART_W / 2 + 0.07 + bw / 2, 0, 0)),
    ]:
        parts.append(make_box(f'{name}{pname}', dims, off, MAT['frame'], bevel=0.004))
        parts[-1].location.y = -depth / 2
    parts.append(make_box(f'{name}Mat', (ART_W + 0.14, 0.012, ART_H + 0.14), (0, -0.007, 0), MAT['mat']))
    art = plane_art(f'{name}Art', (ART_W / 2, ART_H / 2), builder)
    art.location.y = -0.0135
    link(art)
    parts.append(art)
    for e in extra or []:
        parts.append(e)
    # Place on the wall: local -y points into the room.
    if normal == 'back':
        loc, rot = (center_x, HD, ART_CENTER), 0.0
    else:
        loc, rot = (-HW, center_x, ART_CENTER), math.pi / 2
    root = bpy.data.objects.new(name, None)
    root.location = loc
    root.rotation_euler.z = rot
    link(root)
    for p in parts:
        p.parent = root
    # Light it from the rail, 30 degrees off the work's centre line.
    if normal == 'back':
        spot(name + 'Spot', (center_x, HD - RAIL_OFFSET, H - 0.6), (center_x, HD, ART_CENTER))
    else:
        spot(name + 'Spot', (-HW + RAIL_OFFSET, center_x, H - 0.6), (-HW, center_x, ART_CENTER))
    return root


def blocks_for_planes():
    cream = simple('PlanesGround', '#e9e5da', 0.8)
    pieces = []

    def block(name, dims, loc, rot, color):
        m = simple('Planes' + name, color, 0.7)
        o = make_box('Planes' + name, dims, loc, m)
        o.rotation_euler.y = rot
        o.location.y = -0.0175
        pieces.append(o)
    block('Black', (0.78, 0.003, 0.12), (-0.05, 0, 0.18), math.radians(25), '#161617')
    block('Red', (0.36, 0.003, 0.36), (0.10, 0, -0.22), math.radians(-18), '#d2352a')
    block('Blue', (0.14, 0.003, 0.40), (0.30, 0, 0.45), math.radians(-52), '#2b4fa8')
    disc = make_cylinder('PlanesDisc', 0.12, 0.003, (-0.28, -0.0175, -0.46), simple('PlanesDiscM', '#161617', 0.7), rot=(math.pi / 2, 0, 0))
    pieces.append(disc)
    return cream, pieces


# Back wall, left to right: Drift, Floating Planes, Fracture, Tide. Left wall: Fracture and Drift again as stand-ins.
hang('Drift', -5.2, 'back', ramp_mat('DriftPaint', drift_builder))
cream, planes_extra = blocks_for_planes()
hang('Planes', -2.6, 'back', cream, planes_extra)
hang('Fracture', 0.0, 'back', ramp_mat('FracturePaint', fracture_builder))
hang('Tide', 2.6, 'back', ramp_mat('TidePaint', tide_builder))
hang('TideLeft', -2.2, 'left', ramp_mat('TidePaint2', tide_builder))
hang('DriftLeft', 1.0, 'left', ramp_mat('DriftPaint2', drift_builder))


# ---- plinths and sculptures -------------------------------------------------------------
def plinth(name, x, y, size, height, mat):
    make_box(name, (size, size, height), (x, y, height / 2), mat, bevel=0.003)
    return height


# Lumen Column: brass blades on a charcoal microcement base.
cx, cy = -3.6, 0.2
make_cylinder('ColumnBase', 0.42, 0.14, (cx, cy, 0.07), MAT['microcement'])
for i in range(30):
    swell = math.sin(math.pi * (i + 0.5) / 30) ** 0.8
    w = 0.22 + 0.27 * swell
    blade = make_box(f'Blade{i}', (w * 1.0, w * 0.55, 0.035), (cx, cy, 0.18 + i * 0.056), MAT['brass'], bevel=0.003, rot_z=i * 0.19)

# Knot Study: chrome trefoil on a black plinth.
kx, ky = 3.2, -0.6
plinth('KnotPlinth', kx, ky, 0.5, 1.0, MAT['steel'])
pts = []
N = 240
for i in range(N):
    a = 2 * math.pi * i / N
    r = 2 + math.cos(3 * a)
    pts.append((r * math.cos(2 * a) * 0.1, r * math.sin(2 * a) * 0.1, -math.sin(3 * a) * 0.1))
curve = bpy.data.curves.new('Knot', 'CURVE')
curve.dimensions = '3D'
curve.bevel_depth = 0.034
curve.bevel_resolution = 8
sp = curve.splines.new('POLY')
sp.points.add(len(pts) - 1)
for p, c in zip(sp.points, pts):
    p.co = (*c, 1.0)
sp.use_cyclic_u = True
knot = bpy.data.objects.new('Knot', curve)
knot.location = (kx, ky, 1.0 + 0.36)
knot.data.materials.append(MAT['chrome'])
link(knot)

# Amphora: a terracotta vase with black bands, on a travertine plinth.
ax, ay = -6.3, 2.4
plinth('AmphoraPlinth', ax, ay, 0.45, 0.95, MAT['travertine'])
profile = [(0.0, 0.0), (0.045, 0.0), (0.052, 0.012), (0.04, 0.03), (0.036, 0.05), (0.065, 0.085), (0.1, 0.14), (0.12, 0.21),
           (0.124, 0.26), (0.112, 0.32), (0.08, 0.38), (0.05, 0.42), (0.036, 0.45), (0.036, 0.49), (0.052, 0.515), (0.064, 0.53)]
make_lathe('Amphora', [(r * 1.35, z * 1.35) for r, z in profile], (ax, ay, 0.95), [MAT['terracotta'], MAT['black_slip']])

spot('ColumnSpot', (cx + 1.0, cy - 1.2, H - 0.6), (cx, cy, 1.2), power=1500, size=26, blend=0.8)
spot('KnotSpot', (kx + 1.0, ky - 1.2, H - 0.6), (kx, ky, 1.3), power=1500, size=22, blend=0.8)
spot('AmphoraSpot', (ax + 1.0, ay - 1.2, H - 0.6), (ax, ay, 1.3), power=1200, size=20, blend=0.8)

# A long oak bench with black steel legs, and a limewash plinth for contrast.
make_box('BenchTop', (2.6, 0.46, 0.06), (0.4, -2.6, 0.45), MAT['oak'], bevel=0.008)
for lx in (-0.8, 1.6):
    for ly in (-2.8, -2.4):
        make_box('BenchLeg', (0.04, 0.04, 0.42), (lx, ly, 0.21), MAT['steel'])
plinth('LimewashPlinth', 6.0, 3.6, 0.6, 0.45, MAT['limewash'])

# ---- sky, camera, render -----------------------------------------------------------------
world = bpy.data.worlds.new('Sky')
scene.world = world
world.use_nodes = True
wt = world.node_tree
sky = wt.nodes.new('ShaderNodeTexSky')
sky.sky_type = 'MULTIPLE_SCATTERING'
sky.sun_elevation = math.radians(28)
sky.sun_rotation = math.radians(250)
sky.sun_intensity = 0.8
sky.air_density = 1.0
wt.links.new(sky.outputs['Color'], wt.nodes['Background'].inputs['Color'])
wt.nodes['Background'].inputs['Strength'].default_value = 0.65

cam_data = bpy.data.cameras.new('Cam')
cam_data.sensor_fit = 'VERTICAL'
cam_data.angle_y = math.radians(55)
cam = bpy.data.objects.new('Cam', cam_data)
VIEWS = {
    'overview': ((7.2, -5.2, 1.65), (-1.2, 3.8, 1.35)),
    'window': ((-5.8, -3.9, 1.65), (8.0, 0.8, 1.9)),
}
VIEW = os.environ.get('VIEW', 'overview')
cam.location = VIEWS[VIEW][0]
direction = Vector(VIEWS[VIEW][1]) - Vector(cam.location)
cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
link(cam)
scene.camera = cam

scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 24 if PREVIEW else 128
scene.cycles.use_denoising = True
scene.cycles.denoiser = 'OPENIMAGEDENOISE'
scene.cycles.max_bounces = 8 if PREVIEW else 12
scene.cycles.diffuse_bounces = 4 if PREVIEW else 6
scene.cycles.glossy_bounces = 4
scene.cycles.sample_clamp_indirect = 8.0
scene.render.resolution_x = 960 if PREVIEW else 1920
scene.render.resolution_y = 600 if PREVIEW else 1200
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = 'Khronos PBR Neutral'
scene.view_settings.look = 'None'
scene.view_settings.exposure = 0.5
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = os.path.join(OUT, f'preview_{VIEW}.png' if PREVIEW else f'hero_{VIEW}.png')

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'afterimage_hall.blend'))
print('rendering', scene.render.filepath)
bpy.ops.render.render(write_still=True)
print('done')
