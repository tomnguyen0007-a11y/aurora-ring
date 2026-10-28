"""
Afterimage Hall v2, built in Blender at real-world scale (metres).

  python build_hall.py                  full render of the 'overview' view
  VIEW=window python build_hall.py      other views: overview, window, alcove, pano
  PREVIEW=1 python build_hall.py        small, fast test render (about a minute)
  NORENDER=1 python build_hall.py       build and save the .blend only

Needs the `bpy` package (Blender as a Python module), plus Pillow. Outputs go to ./out:
the .blend, the renders, and placements.json (where every work hangs and stands, in the
web gallery's coordinates).

Design rules, from gallery practice:
  - Works hang with their centre about 1.5 m from the floor (57 to 60 inches).
  - Track lights sit about 30 degrees off each work's centre line, so they wash the wall
    without glare; warm-neutral light, about 3300 K.
  - Plinths in quiet neutrals: limewash, travertine, charcoal microcement, pale oak, steel.
  - Everything is supported: rails hang from the ceiling, lights hang from rails or rods,
    sculptures rest on their plinths. check_support() tests this.
"""
import json
import math
import os
import random

import bpy  # must come first: it makes bmesh and mathutils importable
import bmesh  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Euler, Vector  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
PREVIEW = bool(os.environ.get('PREVIEW'))
OUT = os.path.join(HERE, 'out')
PAINT = os.path.join(HERE, 'paintings')
os.makedirs(OUT, exist_ok=True)
random.seed(11)

# Room interior, metres. x runs left to right, y front to back, z up.
W, D, H = 22.0, 13.0, 4.8
HW, HD = W / 2, D / 2
T = 0.4                                     # wall thickness
ART_CENTER = 1.52                           # centre of every work, 59.8 inches
RAIL_OFFSET = (H - 0.6 - ART_CENTER) * math.tan(math.radians(30))
RAIL_Z = H - 0.5
WIN = dict(y0=-4.5, y1=4.5, z0=0.45, z1=4.0)  # window opening, right wall
DOOR = dict(x0=7.2, x1=9.8, z1=3.2)           # doorway in the back wall, to the alcove
ALC = dict(x0=6.6, x1=10.4, y1=10.5, h=3.4)   # the alcove behind it

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def srgb(h):
    """'#rrggbb' to linear RGBA, as Blender colour inputs expect."""
    h = h.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


# ---- materials --------------------------------------------------------------
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


def textured(name, base, rough, bump_scale, bump_strength=0.15, variation=0.5, noise_scale=300.0):
    """A matte painted or plastered surface: fine grain, soft colour drift."""
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
    cloud.inputs['Scale'].default_value = 0.7
    cloud.inputs['Detail'].default_value = 3
    t.links.new(coord.outputs['Object'], cloud.inputs['Vector'])
    mix = node(t, 'ShaderNodeMix', data_type='RGBA')
    mix.inputs['A'].default_value = srgb(base)
    mix.inputs['B'].default_value = tuple(min(1, c * 0.82) for c in srgb(base)[:3]) + (1.0,)
    t.links.new(cloud.outputs['Fac'], mix.inputs['Factor'])
    t.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    return m


def oak_floor():
    """Oak boards in running bond. Each board has its own tone and grain, boards sit a hair
    proud of one another with fine bevelled gaps, and a satin finish catches the light."""
    m, t, b = new_mat('OakFloor')
    coord = node(t, 'ShaderNodeTexCoord')
    brick = node(t, 'ShaderNodeTexBrick', offset=0.5, offset_frequency=2, squash=1.0, squash_frequency=2)
    brick.inputs['Color1'].default_value = srgb('#dcbd8e')
    brick.inputs['Color2'].default_value = srgb('#bf9a68')
    brick.inputs['Mortar'].default_value = srgb('#2e2216')
    brick.inputs['Scale'].default_value = 1.0
    brick.inputs['Mortar Size'].default_value = 0.0035
    brick.inputs['Mortar Smooth'].default_value = 0.25
    brick.inputs['Bias'].default_value = 0.0
    brick.inputs['Brick Width'].default_value = 2.4
    brick.inputs['Row Height'].default_value = 0.2
    t.links.new(coord.outputs['Object'], brick.inputs['Vector'])
    split = node(t, 'ShaderNodeSeparateColor')
    t.links.new(brick.outputs['Color'], split.inputs['Color'])
    # A different grain pattern on each board: the board's own colour drives the phase.
    phase = node(t, 'ShaderNodeMath', operation='MULTIPLY')
    phase.inputs[1].default_value = 53.0
    t.links.new(split.outputs['Red'], phase.inputs[0])
    grain = node(t, 'ShaderNodeTexWave', wave_type='BANDS', bands_direction='Y', wave_profile='SAW')
    grain.inputs['Scale'].default_value = 58.0
    grain.inputs['Distortion'].default_value = 8.0
    grain.inputs['Detail'].default_value = 4.0
    grain.inputs['Detail Scale'].default_value = 1.4
    t.links.new(coord.outputs['Object'], grain.inputs['Vector'])
    t.links.new(phase.outputs['Value'], grain.inputs['Phase Offset'])
    # Long fine fibres along the board: noise stretched strongly along x.
    stretch = node(t, 'ShaderNodeMapping')
    stretch.inputs['Scale'].default_value = (2.0, 260.0, 260.0)
    t.links.new(coord.outputs['Object'], stretch.inputs['Vector'])
    fibre = node(t, 'ShaderNodeTexNoise')
    fibre.inputs['Scale'].default_value = 1.0
    fibre.inputs['Detail'].default_value = 5.0
    t.links.new(stretch.outputs['Vector'], fibre.inputs['Vector'])
    tone = node(t, 'ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
    tone.inputs['Factor'].default_value = 0.45
    t.links.new(brick.outputs['Color'], tone.inputs['A'])
    t.links.new(grain.outputs['Color'], tone.inputs['B'])
    fine = node(t, 'ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
    fine.inputs['Factor'].default_value = 0.3
    t.links.new(tone.outputs['Result'], fine.inputs['A'])
    t.links.new(fibre.outputs['Color'], fine.inputs['B'])
    t.links.new(fine.outputs['Result'], b.inputs['Base Color'])
    height = node(t, 'ShaderNodeMath', operation='ADD')
    t.links.new(grain.outputs['Fac'], height.inputs[0])
    t.links.new(fibre.outputs['Fac'], height.inputs[1])
    gap = node(t, 'ShaderNodeMath', operation='MULTIPLY')
    t.links.new(height.outputs['Value'], gap.inputs[0])
    t.links.new(brick.outputs['Fac'], gap.inputs[1])
    lip = node(t, 'ShaderNodeMath', operation='MULTIPLY')     # each board a hair higher or lower
    lip.inputs[1].default_value = 0.6
    t.links.new(split.outputs['Green'], lip.inputs[0])
    total = node(t, 'ShaderNodeMath', operation='ADD')
    t.links.new(gap.outputs['Value'], total.inputs[0])
    t.links.new(lip.outputs['Value'], total.inputs[1])
    bump = node(t, 'ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.45
    bump.inputs['Distance'].default_value = 0.004
    t.links.new(total.outputs['Value'], bump.inputs['Height'])
    t.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    rough = node(t, 'ShaderNodeMath', operation='MULTIPLY_ADD')
    rough.inputs[1].default_value = 0.16
    rough.inputs[2].default_value = 0.30
    t.links.new(fibre.outputs['Fac'], rough.inputs[0])
    t.links.new(rough.outputs['Value'], b.inputs['Roughness'])
    b.inputs['Coat Weight'].default_value = 0.2
    b.inputs['Coat Roughness'].default_value = 0.22
    return m


def veined(name, light, dark, scale, rough, vein_sharp=12.0, pores=False):
    """Marble or travertine: banded colour, and either fine veins or dark pores."""
    m, t, b = new_mat(name)
    coord = node(t, 'ShaderNodeTexCoord')
    bands = node(t, 'ShaderNodeTexWave', wave_type='BANDS', bands_direction='Z' if pores else 'DIAGONAL')
    bands.inputs['Scale'].default_value = scale
    bands.inputs['Distortion'].default_value = 4.0
    bands.inputs['Detail'].default_value = 3.0
    t.links.new(coord.outputs['Object'], bands.inputs['Vector'])
    ramp = node(t, 'ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = srgb(dark if not pores else light)
    ramp.color_ramp.elements[1].color = srgb(light if not pores else '#e4d6bb')
    if not pores:
        ramp.color_ramp.elements[0].position = 0.0
        ramp.color_ramp.elements[1].position = 0.08
    t.links.new(bands.outputs['Fac'], ramp.inputs['Fac'])
    base_out = ramp.outputs['Color']
    if pores:
        cells = node(t, 'ShaderNodeTexVoronoi')
        cells.inputs['Scale'].default_value = 90.0
        t.links.new(coord.outputs['Object'], cells.inputs['Vector'])
        mask = node(t, 'ShaderNodeMath', operation='LESS_THAN')
        mask.inputs[1].default_value = 0.12
        t.links.new(cells.outputs['Distance'], mask.inputs[0])
        mix = node(t, 'ShaderNodeMix', data_type='RGBA')
        mix.inputs['B'].default_value = srgb(dark)
        t.links.new(mask.outputs['Value'], mix.inputs['Factor'])
        t.links.new(ramp.outputs['Color'], mix.inputs['A'])
        base_out = mix.outputs['Result']
        bump = node(t, 'ShaderNodeBump')
        bump.inputs['Distance'].default_value = 0.002
        t.links.new(mask.outputs['Value'], bump.inputs['Height'])
        t.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    t.links.new(base_out, b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    return m


MAT = {
    'plaster': textured('Plaster', '#efe7da', 0.9, 0.003, 0.25, noise_scale=500.0),
    'ceiling': textured('Ceiling', '#f1ede5', 0.95, 0.002, 0.15, noise_scale=400.0),
    'limewash': textured('Limewash', '#e6e1d6', 0.85, 0.004, 0.35, noise_scale=40.0),
    'microcement': textured('Microcement', '#3c3a37', 0.5, 0.003, 0.3, noise_scale=30.0),
    'floor': oak_floor(),
    'travertine': veined('Travertine', '#cdb99a', '#7b6a50', 5.0, 0.5, pores=True),
    'marble': veined('Marble', '#ece8e0', '#8f8b84', 3.0, 0.32),
    'stone': textured('TerraceStone', '#bdb6a8', 0.8, 0.004, 0.4, noise_scale=60.0),
    'frame': simple('Frame', '#15110e', 0.38, coat_weight=0.25),
    'mat': simple('MatBoard', '#ece8df', 0.95),
    'steel': simple('BlackSteel', '#0b0b0c', 0.38, 0.85),
    'rail': simple('Rail', '#111111', 0.5, 0.4),
    'brass': simple('Brass', '#c99a52', 0.24, 1.0),
    'chrome': simple('Chrome', '#e8e8e8', 0.03, 1.0),
    'oak': simple('PaleOak', '#c9a574', 0.45, coat_weight=0.2),
    'terracotta': simple('Terracotta', '#b25a32', 0.5),
    'white': simple('White', '#f1efe9', 0.8),
    'grass': textured('Grass', '#7a8156', 0.95, 0.02, 0.5, noise_scale=25.0),
    'leaf': textured('Leaf', '#6b7a5e', 0.95, 0.02, 0.5, variation=0.8, noise_scale=18.0),
    'hill': simple('Hill', '#a9b8bd', 1.0),
    'trunk': simple('Trunk', '#3e2f22', 0.9),
}


def emission(name, color, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.node_tree.nodes.clear()
    e = m.node_tree.nodes.new('ShaderNodeEmission')
    e.inputs['Color'].default_value = color
    e.inputs['Strength'].default_value = strength
    o = m.node_tree.nodes.new('ShaderNodeOutputMaterial')
    m.node_tree.links.new(e.outputs['Emission'], o.inputs['Surface'])
    return m


LENS = emission('Lens', (1.0, 0.86, 0.66, 1.0), 25.0)
PANEL = emission('DaylightPanel', (0.95, 0.97, 1.0, 1.0), 2.6)


def glass(name, ior=1.45, tint=(1.0, 1.0, 1.0)):
    """Thin glass as a reflection layer: clear head-on, mirror-like at a grazing angle.
    `tint` darkens what is seen through it, like the solar-control glass in a big window."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    t = m.node_tree
    t.nodes.clear()
    out = t.nodes.new('ShaderNodeOutputMaterial')
    mix = t.nodes.new('ShaderNodeMixShader')
    clear = t.nodes.new('ShaderNodeBsdfTransparent')
    clear.inputs['Color'].default_value = (*tint, 1.0)
    gloss = t.nodes.new('ShaderNodeBsdfGlossy')
    gloss.inputs['Roughness'].default_value = 0.0
    fres = t.nodes.new('ShaderNodeFresnel')
    fres.inputs['IOR'].default_value = ior
    t.links.new(fres.outputs['Fac'], mix.inputs['Fac'])
    t.links.new(clear.outputs['BSDF'], mix.inputs[1])
    t.links.new(gloss.outputs['BSDF'], mix.inputs[2])
    t.links.new(mix.outputs['Shader'], out.inputs['Surface'])
    return m


GLASS = glass('Glass')
WINDOW_GLASS = glass('WindowGlassMat', tint=(0.17, 0.18, 0.2))


# ---- geometry helpers ----------------------------------------------------------
STATICS = []   # (object, bake group)


def link(obj, group=None):
    scene.collection.objects.link(obj)
    if group:
        obj['bake'] = group
        STATICS.append(obj)
    return obj


def make_box(name, dims, loc, mat, bevel=0.0, rot_z=0.0, group=None, segments=1):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= dims[0]
        v.co.y *= dims[1]
        v.co.z *= dims[2]
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=segments, affect='EDGES')
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    obj.rotation_euler.z = rot_z
    obj.data.materials.append(mat)
    return link(obj, group)


def make_cylinder(name, radius, depth, loc, mat, rot=(0, 0, 0), segments=48, group=None, radius2=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius, radius2=radius if radius2 is None else radius2, depth=depth)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    for p in mesh.polygons:
        p.use_smooth = True
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    obj.rotation_euler = Euler(rot)
    obj.data.materials.append(mat)
    return link(obj, group)


def make_plane(name, w, d, loc, mat, group=None):
    """A single upward-facing quad with UVs over the whole face (used for the floor)."""
    bm = bmesh.new()
    verts = [bm.verts.new((sx * w / 2, sy * d / 2, 0)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    bm.faces.new(verts)
    bm.faces.ensure_lookup_table()
    uv = bm.loops.layers.uv.new('UVMap')
    for loop, (u, v) in zip(bm.faces[0].loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uv].uv = (u, v)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    obj.data.materials.append(mat)
    return link(obj, group)


def make_mesh(name, verts, faces, loc, mats, smooth=True, group=None, uvs=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    if uvs is not None:
        layer = mesh.uv_layers.new(name='UVMap')
        for poly in mesh.polygons:
            for li, vi in zip(poly.loop_indices, poly.vertices):
                layer.data[li].uv = uvs[vi]
    for p in mesh.polygons:
        p.use_smooth = smooth
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    for m in mats:
        obj.data.materials.append(m)
    return link(obj, group)


# ---- the shell ------------------------------------------------------------------
make_plane('S_Floor', W + 2 * T, D + 2 * T, (0, 0, 0), MAT['floor'], 'floor')
make_box('S_Ceiling', (W + 2 * T, D + 2 * T, 0.3), (0, 0, H + 0.15), MAT['ceiling'], group='shell')
make_box('S_WallFront', (W + 2 * T, T, H), (0, -HD - T / 2, H / 2), MAT['plaster'], group='shell')
make_box('S_WallLeft', (T, D, H), (-HW - T / 2, 0, H / 2), MAT['plaster'], group='shell')

# Back wall with a doorway to the alcove.
make_box('S_WallBackL', (DOOR['x0'] + HW + T, T, H), ((-HW - T + DOOR['x0']) / 2, HD + T / 2, H / 2), MAT['plaster'], group='shell')
make_box('S_WallBackR', (HW + T - DOOR['x1'], T, H), ((DOOR['x1'] + HW + T) / 2, HD + T / 2, H / 2), MAT['plaster'], group='shell')
make_box('S_WallBackHead', (DOOR['x1'] - DOOR['x0'], T, H - DOOR['z1']), ((DOOR['x0'] + DOOR['x1']) / 2, HD + T / 2, (H + DOOR['z1']) / 2), MAT['plaster'], group='shell')

# Right wall around the window.
make_box('S_WallRightA', (T, WIN['y0'] + HD, H), (HW + T / 2, (-HD + WIN['y0']) / 2, H / 2), MAT['plaster'], group='shell')
make_box('S_WallRightB', (T, HD - WIN['y1'], H), (HW + T / 2, (HD + WIN['y1']) / 2, H / 2), MAT['plaster'], group='shell')
make_box('S_WallRightTop', (T, WIN['y1'] - WIN['y0'], H - WIN['z1']), (HW + T / 2, (WIN['y0'] + WIN['y1']) / 2, (H + WIN['z1']) / 2), MAT['plaster'], group='shell')
make_box('S_WallRightSill', (T, WIN['y1'] - WIN['y0'], WIN['z0']), (HW + T / 2, (WIN['y0'] + WIN['y1']) / 2, WIN['z0'] / 2), MAT['plaster'], group='shell')
make_box('S_WindowStool', (0.14, WIN['y1'] - WIN['y0'] + 0.1, 0.04), (HW - 0.04, (WIN['y0'] + WIN['y1']) / 2, WIN['z0'] + 0.02), MAT['marble'], bevel=0.004, group='shell')

# The alcove: a small, lit room beyond the doorway.
aw = ALC['x1'] - ALC['x0']
make_box('S_AlcoveCeiling', (aw + 0.4, ALC['y1'] - HD - T + 0.2, 0.2), ((ALC['x0'] + ALC['x1']) / 2, (HD + T + ALC['y1']) / 2 + 0.1, ALC['h'] + 0.1), MAT['ceiling'], group='shell')
make_box('S_AlcoveWallL', (0.2, ALC['y1'] - HD - T, ALC['h']), (ALC['x0'] - 0.1, (HD + T + ALC['y1']) / 2, ALC['h'] / 2), MAT['plaster'], group='shell')
make_box('S_AlcoveWallR', (0.2, ALC['y1'] - HD - T, ALC['h']), (ALC['x1'] + 0.1, (HD + T + ALC['y1']) / 2, ALC['h'] / 2), MAT['plaster'], group='shell')
make_box('S_AlcoveBack', (aw + 0.4, 0.2, ALC['h']), ((ALC['x0'] + ALC['x1']) / 2, ALC['y1'] + 0.1, ALC['h'] / 2), MAT['plaster'], group='shell')
make_box('S_AlcoveFloor', (aw, ALC['y1'] - HD - T, 0.05), ((ALC['x0'] + ALC['x1']) / 2, (HD + T + ALC['y1']) / 2, -0.025), MAT['limewash'], group='shell')
make_box('S_AlcoveLight', (1.6, 1.2, 0.02), (8.5, 8.5, ALC['h'] - 0.012), PANEL, group='shell')
# Architrave around the doorway.
for nm, dims, loc in [
    ('S_ArchL', (0.1, 0.05, DOOR['z1']), (DOOR['x0'] - 0.05, HD - 0.025, DOOR['z1'] / 2)),
    ('S_ArchR', (0.1, 0.05, DOOR['z1']), (DOOR['x1'] + 0.05, HD - 0.025, DOOR['z1'] / 2)),
    ('S_ArchTop', (DOOR['x1'] - DOOR['x0'] + 0.2, 0.05, 0.1), ((DOOR['x0'] + DOOR['x1']) / 2, HD - 0.025, DOOR['z1'] + 0.05)),
]:
    make_box(nm, dims, loc, MAT['white'], bevel=0.004, group='shell')

# Skirting and crown moulding along every wall.
def trim(name, length, horizontal_axis, center, face, z, depth, height, mat, group='shell'):
    """A slim board along a wall. face is the unit vector pointing into the room."""
    fx, fy = face
    dims = (length if horizontal_axis == 'x' else depth, depth if horizontal_axis == 'x' else length, height)
    make_box(name, dims, (center[0] + fx * depth / 2, center[1] + fy * depth / 2, z), mat, bevel=min(0.004, depth / 4), group=group)


segs = [
    ('Back1', 'x', (( -HW + DOOR['x0']) / 2, HD), (0, -1), DOOR['x0'] + HW),
    ('Back2', 'x', ((DOOR['x1'] + HW) / 2, HD), (0, -1), HW - DOOR['x1']),
    ('Front', 'x', (0, -HD), (0, 1), W),
    ('Left', 'y', (-HW, 0), (1, 0), D),
]
for nm, ax, ctr, face, ln in segs:
    trim('S_Skirt' + nm, ln, ax, ctr, face, 0.07, 0.018, 0.14, MAT['white'])
    trim('S_SkirtCap' + nm, ln, ax, ctr, face, 0.15, 0.026, 0.022, MAT['white'])
    trim('S_CrownLow' + nm, ln, ax, ctr, face, H - 0.045, 0.07, 0.09, MAT['ceiling'])
    trim('S_CrownHigh' + nm, ln, ax, ctr, face, H - 0.012, 0.11, 0.024, MAT['ceiling'])
for nm, y0, y1 in [('RA', -HD, WIN['y0']), ('RB', WIN['y1'], HD)]:
    trim('S_Skirt' + nm, y1 - y0, 'y', (HW, (y0 + y1) / 2), (-1, 0), 0.07, 0.018, 0.14, MAT['white'])
    trim('S_Crown' + nm, y1 - y0, 'y', (HW, (y0 + y1) / 2), (-1, 0), H - 0.045, 0.07, 0.09, MAT['ceiling'])

# Coffered ceiling: beams and daylight panels.
BEAMS_X = (-8.25, -2.75, 2.75, 8.25)
BEAMS_Y = (-4.3, 0.0, 4.3)
for x in BEAMS_X:
    make_box(f'S_BeamY{x}', (0.32, D, 0.45), (x, 0, H - 0.225), MAT['ceiling'], bevel=0.004, group='shell')
for y in BEAMS_Y:
    make_box(f'S_BeamX{y}', (W, 0.3, 0.38), (0, y, H - 0.19), MAT['ceiling'], bevel=0.004, group='shell')
for x, y in ((-5.5, -2.15), (5.5, 2.15), (-5.5, 6.5 - 2.15 - 0.0)):
    if y < HD - 0.8:
        make_box(f'S_Panel{x}_{y}', (4.6, 3.4, 0.02), (x, y, H - 0.012), PANEL, group='shell')

# Window: black steel mullions set in the reveal, with the glass inside them.
wy, wz = (WIN['y0'] + WIN['y1']) / 2, (WIN['z0'] + WIN['z1']) / 2
gx = HW + 0.2
for y in (WIN['y0'], WIN['y1']):
    make_box('P_Mullion', (0.08, 0.1, WIN['z1'] - WIN['z0'] + 0.06), (gx, y - 0.0 + (0.03 if y == WIN['y0'] else -0.03), wz), MAT['steel'], group='props')
for i in range(1, 6):
    make_box('P_Mullion', (0.06, 0.05, WIN['z1'] - WIN['z0']), (gx, WIN['y0'] + (WIN['y1'] - WIN['y0']) * i / 6, wz), MAT['steel'], group='props')
for z in (WIN['z0'] + 0.03, WIN['z1'] - 0.03, 2.75):
    make_box('P_Transom', (0.07, WIN['y1'] - WIN['y0'] + 0.1, 0.06), (gx, wy, z), MAT['steel'], group='props')
pane = make_box('WindowGlass', (0.01, WIN['y1'] - WIN['y0'], WIN['z1'] - WIN['z0']), (gx, wy, wz), WINDOW_GLASS)

# Outside. The terrace and parapet are real, baked geometry. Everything beyond (lawn, hedge,
# trees, hills) is far scenery: Blender renders it directly, and the web gallery gets it as a
# sky panorama that follows the camera, so it never swims.
from mathutils import noise as mnoise  # noqa: E402

make_box('X_Terrace', (4.0, 18.0, 0.3), (HW + T + 2.0, 0, -0.17), MAT['stone'], group='exterior')
make_box('X_Parapet', (0.3, 18.0, 0.95), (HW + T + 3.85, 0, 0.45), MAT['stone'], bevel=0.01, group='exterior')
make_box('X_ParapetCap', (0.44, 18.2, 0.06), (HW + T + 3.85, 0, 0.95), MAT['stone'], bevel=0.008, group='exterior')
LAWN_Z = -1.2
make_box('X_Lawn', (6000, 6000, 0.4), (0, 0, LAWN_Z - 0.2), MAT['grass'], group='pano')


def blob(name, centre, radius, squash, seed, subdiv=4):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    off = Vector((seed * 7.31, seed * 1.73, seed * 3.19))
    for v in bm.verts:
        p = v.co.copy()
        r = 1 + 0.30 * mnoise.noise(p * 1.9 + off) + 0.15 * mnoise.noise(p * 5.1 + off * 1.7) + 0.07 * mnoise.noise(p * 11.0 + off * 2.3)
        v.co = Vector((p.x * r * radius, p.y * r * radius, p.z * r * radius * squash))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    o = bpy.data.objects.new(name, mesh)
    o.location = centre
    o.data.materials.append(MAT['leaf'])
    return link(o, 'pano')


rng_t = random.Random(21)
# One long, soft treeline far across the lawn: many overlapping crowns, muted by distance.
for i in range(70):
    tx = 150 + rng_t.random() * 60
    ty = -260 + i * 7.5 + rng_t.random() * 5
    s_ = 9 + rng_t.random() * 7
    for k in range(3):
        blob(f'X_Canopy{i}_{k}', (tx + rng_t.random() * 8, ty + rng_t.random() * 8, LAWN_Z + s_ * (0.9 + 0.5 * rng_t.random())),
             s_ * (0.7 + 0.3 * rng_t.random()), 0.8, i * 3 + k, subdiv=3)
for i, (hx, hy, hs) in enumerate([(420, -220, 60), (470, -40, 80), (430, 190, 58), (560, 60, 95), (500, -130, 74), (380, 20, 40)]):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=4, radius=1.0)
    for v in bm.verts:
        p = v.co.copy()
        r = 1 + 0.12 * mnoise.noise(p * 3.1 + Vector((i * 4.1, 0, 0)))
        v.co = Vector((p.x * hs * 1.7 * r, p.y * hs * 2.4 * r, p.z * hs * 0.5 * r))
    mesh = bpy.data.meshes.new(f'X_Hill{i}')
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    hill = bpy.data.objects.new(f'X_Hill{i}', mesh)
    hill.location = (hx, hy, -hs * 0.12)
    hill.data.materials.append(MAT['hill'])
    link(hill, 'pano')

# ---- track rails and lit fixtures -----------------------------------------------------
def rail(name, length, loc, along):
    dims = (length, 0.04, 0.035) if along == 'x' else (0.04, length, 0.035)
    make_box(name, dims, loc, MAT['rail'], group='props')
    # Hanger rods tie the rail to the ceiling every 2.4 m.
    n = max(2, int(length // 2.4) + 1)
    for i in range(n):
        t = -length / 2 + length * i / (n - 1)
        hx, hy = (loc[0] + t, loc[1]) if along == 'x' else (loc[0], loc[1] + t)
        make_cylinder(f'{name}Rod{i}', 0.006, H - RAIL_Z, (hx, hy, (H + RAIL_Z) / 2), MAT['rail'], segments=8, group='props')


rail('P_RailBack', 20.4, (0, HD - RAIL_OFFSET, RAIL_Z), 'x')
rail('P_RailLeft', 11.6, (-HW + RAIL_OFFSET, 0, RAIL_Z), 'y')
rail('P_RailFront', 11.0, (0, -HD + RAIL_OFFSET, RAIL_Z), 'x')
LIGHTS = []


def spot(name, loc, target, power=2600, size=34, blend=0.9, hang_to=None):
    """A track spot. hang_to=None clips it to the rail; otherwise a rod hangs it from that height."""
    loc, target = Vector(loc), Vector(target)
    rot = (target - loc).to_track_quat('-Z', 'Y').to_euler()
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
    LIGHTS.append(obj)
    body = make_cylinder(name + 'Body', 0.052, 0.2, (0, 0, 0), MAT['rail'], segments=24)
    body.parent = obj
    body.location = (0, 0, 0.105)   # the body sits behind the light, so the beam leaves the open end
    lens = make_cylinder(name + 'Lens', 0.044, 0.01, (0, 0, 0), LENS, segments=24)
    lens.parent = obj
    lens.location = (0, 0, 0.003)
    top = loc.z + 0.15
    reach = (RAIL_Z if hang_to is None else hang_to)
    yoke = make_cylinder(name + 'Yoke', 0.007, reach - top, (loc.x, loc.y, top + (reach - top) / 2), MAT['rail'], segments=8, group='props')
    return obj


# ---- the artworks ----------------------------------------------------------------------
ART_SIZES = {'A': (1.2, 1.5), 'B': (1.5, 1.9), 'C': (0.9, 1.15)}
# id, wall, position along the wall (metres), size. Even gaps, with one larger work per wall.
ARTWORKS = [
    ('drift', 'back', -8.4, 'A'), ('planes', 'back', -5.0, 'C'), ('fracture', 'back', -1.6, 'B'),
    ('deco', 'back', 1.8, 'A'), ('tide', 'back', 5.0, 'C'),
    ('lattice', 'left', -4.2, 'C'), ('grid', 'left', -1.4, 'A'), ('moire', 'left', 1.4, 'B'), ('strata', 'left', 4.2, 'A'),
    ('halftone', 'front', 0.0, 'B'),
    ('dots', 'alcove', 8.5, 'A'),
]
WALL = {  # id -> (origin on wall, normal into the room, rotation about z)
    'back': (lambda p: (p, HD, 0), (0, -1), 0.0),
    'left': (lambda p: (-HW, p, 0), (1, 0), math.pi / 2),
    'front': (lambda p: (p, -HD, 0), (0, 1), math.pi),
    'alcove': (lambda p: (p, ALC['y1'], 0), (0, -1), 0.0),
}
PLACEMENTS = {'art': [], 'sculptures': []}


def art_material(wid):
    m, t, b = new_mat('Paint_' + wid)
    tex = node(t, 'ShaderNodeTexImage')
    tex.image = bpy.data.images.load(os.path.join(PAINT, wid + '.png'))
    tex.image.colorspace_settings.name = 'sRGB'
    t.links.new(tex.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.65
    canvas = node(t, 'ShaderNodeTexNoise')
    canvas.inputs['Scale'].default_value = 700.0
    coord = node(t, 'ShaderNodeTexCoord')
    t.links.new(coord.outputs['Generated'], canvas.inputs['Vector'])
    bump = node(t, 'ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.18
    bump.inputs['Distance'].default_value = 0.0008
    t.links.new(canvas.outputs['Fac'], bump.inputs['Height'])
    t.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m


def hang(wid, wall, pos, size_key):
    aw, ah = ART_SIZES[size_key]
    origin_fn, normal, rot = WALL[wall]
    ox, oy, _ = origin_fn(pos)
    bw, depth, mat_w = 0.032, 0.045, 0.07 + 0.015 * (ah - 1.5)
    parts = []
    outer_w, outer_h = aw + 2 * mat_w, ah + 2 * mat_w
    for pname, dims, off in [
        ('Top', (outer_w + 2 * bw, depth, bw), (0, 0, outer_h / 2 + bw / 2)),
        ('Bottom', (outer_w + 2 * bw, depth, bw), (0, 0, -outer_h / 2 - bw / 2)),
        ('Left', (bw, depth, outer_h), (-outer_w / 2 - bw / 2, 0, 0)),
        ('Right', (bw, depth, outer_h), (outer_w / 2 + bw / 2, 0, 0)),
    ]:
        parts.append(make_box(f'P_{wid}Frame{pname}', dims, off, MAT['frame'], bevel=0.004, group='props'))
        parts[-1].location.y = -depth / 2
    parts.append(make_box(f'P_{wid}Mat', (outer_w, 0.012, outer_h), (0, -0.007, 0), MAT['mat'], group='props'))
    # The canvas is its own object: the web gallery draws the live painting here.
    bm = bmesh.new()
    verts = [bm.verts.new((sx * aw / 2, 0, sz * ah / 2)) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    bm.faces.new(verts[::-1])
    bm.faces.ensure_lookup_table()
    uv = bm.loops.layers.uv.new('UVMap')
    for loop, (u, v) in zip(bm.faces[0].loops, ((0, 0), (0, 1), (1, 1), (1, 0))):
        loop[uv].uv = (u, v)
    mesh = bpy.data.meshes.new(f'ART_{wid}')
    bm.to_mesh(mesh)
    bm.free()
    art = bpy.data.objects.new(f'ART_{wid}', mesh)
    art.data.materials.append(art_material(wid))
    art.location.y = -0.0135
    link(art)
    parts.append(art)
    # Glass in front of the work, reflecting the room.
    g = make_box(f'Glass_{wid}', (outer_w, 0.004, outer_h), (0, -0.03, 0), GLASS)
    parts.append(g)
    root = bpy.data.objects.new(f'Hang_{wid}', None)
    root.location = (ox, oy, ART_CENTER)
    root.rotation_euler.z = rot
    link(root)
    for p in parts:
        p.parent = root
    # Light from a spot about 30 degrees off the work's centre line.
    ceiling = ALC['h'] if wall == 'alcove' else H
    off = (ceiling - 0.6 - ART_CENTER) * math.tan(math.radians(30))
    sx, sy = ox + normal[0] * off, oy + normal[1] * off
    if wall == 'alcove':
        spot(f'Spot_{wid}', (sx, sy, ceiling - 0.6), (ox, oy, ART_CENTER), power=900, hang_to=ceiling)
    else:
        spot(f'Spot_{wid}', (sx, sy, H - 0.6), (ox, oy, ART_CENTER), power=2600 if aw < 1.4 else 3200)
    PLACEMENTS['art'].append({
        'id': wid, 'wall': wall, 'size': [aw, ah],
        'centre': [ox, ART_CENTER, -oy],           # the web gallery's axes: x, up, -depth
        'normal': [normal[0], 0.0, -normal[1]],
    })
    return root


for item in ARTWORKS:
    hang(*item)


# ---- plinths and sculptures -------------------------------------------------------------------
def plinth(name, x, y, size, height, mat, round_=False):
    if round_:
        make_cylinder(name, size / 2, height, (x, y, height / 2), mat, group='props')
    else:
        make_box(name, (size, size, height), (x, y, height / 2), mat, bevel=0.003, group='props')
    return height


def register(sid, x, y, top, hung=False):
    PLACEMENTS['sculptures'].append({'id': sid, 'base': [x, top, -y]})


def pendant_spot(name, x, y, target, power=1500, size=24):
    spot(name, (x + 1.0, y - 1.2, H - 0.9), target, power=power, size=size, blend=0.8, hang_to=H)


# Lumen Column: brass blades on a steel spine, on a microcement base.
cx, cy = -6.0, -2.0
make_cylinder('ColumnBase', 0.42, 0.14, (cx, cy, 0.07), MAT['microcement'], group='props')
make_cylinder('ColumnSpine', 0.014, 1.95, (cx, cy, 0.14 + 0.975), MAT['steel'], segments=16)
for i in range(30):
    swell = math.sin(math.pi * (i + 0.5) / 30) ** 0.8
    w = 0.22 + 0.27 * swell
    make_box(f'Blade{i}', (w, w * 0.55, 0.035), (cx, cy, 0.19 + i * 0.056), MAT['brass'], bevel=0.003, rot_z=i * 0.19)
pendant_spot('ColumnSpot', cx, cy, (cx, cy, 1.2))
register('column', cx, cy, 0.14)

# Knot Study: a chrome trefoil resting on a black steel plinth.
kx, ky = 2.2, -2.6
KNOT_TOP = plinth('KnotPlinth', kx, ky, 0.5, 1.0, MAT['steel'])
pts = []
for i in range(260):
    a = 2 * math.pi * i / 260
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
knot.location = (kx, ky, KNOT_TOP + 0.034 + 0.1 - 0.001)     # its lowest point rests on the plinth
knot.data.materials.append(MAT['chrome'])
link(knot)
pendant_spot('KnotSpot', kx, ky, (kx, ky, 1.3))
register('knot', kx, ky, KNOT_TOP)

# Cloud Form: an oil-slick resin body on a limewash cylinder.
ox_, oy_ = 8.6, 2.8
CLOUD_TOP = plinth('CloudPlinth', ox_, oy_, 0.8, 1.05, MAT['limewash'], round_=True)
bm = bmesh.new()
bmesh.ops.create_icosphere(bm, subdivisions=5, radius=0.5)
for v in bm.verts:
    x, y, z = v.co
    d = 1 + 0.26 * math.sin(4.2 * x + 1.3 * math.sin(2.2 * y)) + 0.2 * math.sin(3.6 * y + 2.0 * math.sin(1.9 * z)) + 0.16 * math.sin(4.4 * z + math.sin(2.3 * x))
    v.co = (x * d, y * d, z * d)
zmin = min(v.co.z for v in bm.verts)
mesh = bpy.data.meshes.new('Cloud')
bm.to_mesh(mesh)
bm.free()
for p in mesh.polygons:
    p.use_smooth = True
cloud = bpy.data.objects.new('Cloud', mesh)
cloud.location = (ox_, oy_, CLOUD_TOP - zmin)
cm, ct, cb = new_mat('Resin')
cb.inputs['Base Color'].default_value = srgb('#2b2140')
cb.inputs['Metallic'].default_value = 0.55
cb.inputs['Roughness'].default_value = 0.07
for key, val in (('Thin Film Thickness', 700.0), ('Thin Film IOR', 1.6), ('Coat Weight', 0.8)):
    if key in cb.inputs:
        cb.inputs[key].default_value = val
cloud.data.materials.append(cm)
link(cloud)
pendant_spot('CloudSpot', ox_, oy_, (ox_, oy_, 1.65), power=1300, size=22)
register('cloud', ox_, oy_, CLOUD_TOP)

# Amphora: terracotta with black bands, a meander, and palmettes, with handles.
ax, ay = -8.8, 5.3
AMPH_TOP = plinth('AmphoraPlinth', ax, ay, 0.45, 0.95, MAT['travertine'])


def amphora_image():
    wpx, hpx = 2048, 1024
    img = Image.new('RGB', (wpx, hpx), (178, 90, 50))
    d = ImageDraw.Draw(img)
    rng = random.Random(3)
    for _ in range(2200):   # slip variation
        x, y = rng.randrange(wpx), rng.randrange(hpx)
        c = rng.randrange(-14, 14)
        d.rectangle((x, y, x + rng.randrange(20, 120), y + rng.randrange(2, 7)), fill=(178 + c, 90 + c // 2, 50))
    black = (20, 16, 14)
    for v0, v1 in ((0.0, 0.07), (0.095, 0.105), (0.62, 0.70), (0.88, 1.0)):
        d.rectangle((0, hpx * (1 - v1), wpx, hpx * (1 - v0)), fill=black)
    # Meander band.
    y0, y1 = hpx * (1 - 0.82), hpx * (1 - 0.72)
    step = wpx / 40
    for i in range(40):
        x = i * step
        d.line([(x, y1), (x, y0), (x + step * 0.75, y0), (x + step * 0.75, y1 - (y1 - y0) * 0.3),
                (x + step * 0.25, y1 - (y1 - y0) * 0.3), (x + step * 0.25, y0 + (y1 - y0) * 0.4), (x + step * 0.5, y0 + (y1 - y0) * 0.4)], fill=black, width=7)
    # Palmettes around the belly.
    for i in range(16):
        u = (i + 0.5) / 16 * wpx
        cy_ = hpx * (1 - 0.42)
        for k in range(-3, 4):
            ang = k * 0.32
            ex, ey = u + math.sin(ang) * 55, cy_ - math.cos(ang) * 55
            d.ellipse((ex - 14, ey - 46, ex + 14, ey + 46), fill=black) if k == 0 else d.polygon(
                [(u, cy_), (ex - 12 * math.cos(ang), ey - 12 * math.sin(ang)), (ex + math.sin(ang) * 40, ey - math.cos(ang) * 40), (ex + 12 * math.cos(ang), ey + 12 * math.sin(ang))], fill=black)
        d.rectangle((u - 5, cy_, u + 5, cy_ + 80), fill=black)
    arr = np.asarray(img.transpose(Image.FLIP_TOP_BOTTOM), dtype=np.float32) / 255.0
    rgba = np.ones((hpx, wpx, 4), dtype=np.float32)
    rgba[..., :3] = np.where(arr <= 0.04045, arr / 12.92, ((arr + 0.055) / 1.055) ** 2.4)
    image = bpy.data.images.new('AmphoraTex', wpx, hpx)
    image.pixels.foreach_set(rgba.ravel())
    image.pack()
    return image


am, at, ab = new_mat('AmphoraClay')
tex = node(at, 'ShaderNodeTexImage')
tex.image = amphora_image()
at.links.new(tex.outputs['Color'], ab.inputs['Base Color'])
ab.inputs['Roughness'].default_value = 0.55
profile = [(0.0, 0.0), (0.045, 0.0), (0.052, 0.012), (0.04, 0.03), (0.036, 0.05), (0.065, 0.085), (0.1, 0.14), (0.12, 0.21),
           (0.124, 0.26), (0.112, 0.32), (0.08, 0.38), (0.05, 0.42), (0.036, 0.45), (0.036, 0.49), (0.052, 0.515), (0.064, 0.53)]
S = 1.3
SEG = 96
verts, faces, uvs = [], [], []
for ri, (r, z) in enumerate(profile):
    for i in range(SEG + 1):
        a = 2 * math.pi * i / SEG
        verts.append((r * S * math.cos(a), r * S * math.sin(a), z * S))
        uvs.append((i / SEG, ri / (len(profile) - 1)))
for ri in range(len(profile) - 1):
    for i in range(SEG):
        a = ri * (SEG + 1) + i
        faces.append((a, a + 1, a + SEG + 2, a + SEG + 1))
vase = make_mesh('Amphora', verts, faces, (ax, ay, AMPH_TOP), [am], uvs=uvs)
# make_mesh assigns UVs per vertex index; the seam column is duplicated so this is exact.
for sd in (-1, 1):
    arc = bpy.data.curves.new('Handle', 'CURVE')
    arc.dimensions = '3D'
    arc.bevel_depth = 0.014
    arc.bevel_resolution = 5
    s = arc.splines.new('POLY')
    pts_h = []
    for j in range(15):
        t_ = j / 14
        pts_h.append((sd * (0.085 + 0.075 * math.sin(math.pi * t_)) * S, 0.0, (0.385 + 0.11 * t_) * S))
    s.points.add(len(pts_h) - 1)
    for pnt, c in zip(s.points, pts_h):
        pnt.co = (*c, 1.0)
    ho = bpy.data.objects.new('AmphoraHandle', arc)
    ho.location = (ax, ay, AMPH_TOP)
    ho.data.materials.append(MAT['steel'])
    link(ho)
spot('AmphoraSpot', (ax + 1.0, ay - 1.2, H - 0.9), (ax, ay, 1.3), power=1200, size=20, blend=0.8, hang_to=H)
register('amphora', ax, ay, AMPH_TOP)


# Doric Ruin: a fluted marble shaft with a broken top, a fallen drum and a capital.
def fluted(height, r_bottom, r_top, flutes=20, rings=40, segs=160, chipped=True):
    verts, faces = [], []
    for j in range(rings + 1):
        k = j / rings
        radius = r_bottom + (r_top - r_bottom) * k + 0.02 * math.sin(math.pi * k)
        for i in range(segs + 1):
            a = i / segs * 2 * math.pi
            q = abs(math.sin(a * flutes / 2))
            r = radius * (1 - 0.05 * math.sqrt(q))
            chip = 0.16 * (0.5 + 0.5 * math.sin(a * 2.3 + 1.0)) * (0.5 + 0.5 * math.sin(a * 5.1)) if (chipped and j == rings) else 0
            verts.append((r * math.cos(a), r * math.sin(a), k * height - chip))
    for j in range(rings):
        for i in range(segs):
            a = j * (segs + 1) + i
            faces.append((a, a + 1, a + segs + 2, a + segs + 1))
    return verts, faces


dx, dy = 7.0, -4.8
make_cylinder('DoricStep', 0.62, 0.12, (dx, dy, 0.06), MAT['marble'], group='props')
sv, sf = fluted(2.2, 0.42, 0.34)
make_mesh('DoricShaft', sv, sf, (dx, dy, 0.12), [MAT['marble']], group='props')
dv, df = fluted(0.5, 0.4, 0.4, chipped=False)
make_mesh('DoricDrum', dv, df, (dx - 1.6, dy + 0.9, 0.4), [MAT['marble']], group='props').rotation_euler = Euler((0, math.pi / 2, 0.5))
cap = make_cylinder('DoricEchinus', 0.58, 0.24, (dx + 1.3, dy + 0.6, 0.58), MAT['marble'], rot=(0, math.pi / 2, 0.4), radius2=0.36, group='props')
make_box('DoricAbacus', (1.15, 1.15, 0.13), (dx + 1.3 - 0.185 * math.cos(0.4), dy + 0.6 - 0.185 * math.sin(0.4), 0.58), MAT['marble'], bevel=0.004, group='props').rotation_euler = Euler((0, math.pi / 2, 0.4))
spot('DoricSpot', (dx + 1.0, dy - 1.2, H - 0.9), (dx, dy, 1.3), power=1200, size=26, blend=0.8, hang_to=H)
register('doric', dx, dy, 0.12)

# Mobile: painted shapes on balanced wire arms, hung from the ceiling.
mx, my = -2.0, 1.5
M_COLOURS = ['#d9362b', '#2447b8', '#e8b923', '#151515', '#f1ede4']
shape_count = [0]


def mobile_shape(depth_hint):
    k = shape_count[0]
    shape_count[0] += 1
    radius = 0.1 + 0.07 * ((k * 7) % 3)
    bm_ = bmesh.new()
    bmesh.ops.create_uvsphere(bm_, u_segments=28, v_segments=12, radius=1.0)
    for v in bm_.verts:
        v.co.x *= radius * (1 + 0.5 * (k % 2))
        v.co.y *= radius * (1.3 - 0.4 * (k % 2))
        v.co.z *= 0.025
    mesh_ = bpy.data.meshes.new(f'MobileShape{k}')
    bm_.to_mesh(mesh_)
    bm_.free()
    for p in mesh_.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(f'MobileShape{k}', mesh_)
    o.data.materials.append(simple(f'MobileColour{k}', M_COLOURS[k % len(M_COLOURS)], 0.55))
    link(o)
    return o


def wire(length, parent):
    w = make_cylinder('MobileWire', 0.004, length, (0, 0, -length / 2), MAT['steel'], segments=6)
    w.parent = parent
    return w


def mobile_arm(depth, length, drop, parent, rot):
    g = bpy.data.objects.new('MobileArm', None)
    link(g)
    g.parent = parent
    g.rotation_euler.z = rot
    rod = make_cylinder('MobileRod', 0.006, length * 2, (0, 0, 0), MAT['steel'], rot=(0, math.pi / 2, 0), segments=8)
    rod.parent = g
    for side in (-1, 1):
        hang_ = bpy.data.objects.new('MobileHang', None)
        link(hang_)
        hang_.parent = g
        hang_.location = (side * length, 0, 0)
        wire(drop, hang_)
        if depth > 0:
            sub = mobile_arm(depth - 1, length * 0.6, drop, hang_, random.random() * 3)
            sub.location = (0, 0, -drop)
        else:
            sh = mobile_shape(depth)
            sh.parent = hang_
            sh.location = (0, 0, -drop)
    return g


mob_root = bpy.data.objects.new('MobileRoot', None)
mob_root.location = (mx, my, 3.75)
link(mob_root)
line = make_cylinder('MobileLine', 0.004, H - 3.75, (0, 0, (H - 3.75) / 2), MAT['steel'], segments=6)
line.parent = mob_root
mobile_arm(2, 0.8, 0.45, mob_root, 0.4)
register('mobile', mx, my, 3.0)
spot('MobileSpot', (mx + 1.2, my - 1.4, H - 0.9), (mx, my, 2.9), power=1100, size=28, blend=0.8, hang_to=H)

# Benches: pale oak on black steel, one facing the works and one facing the window.
def bench(name, x, y, rot):
    make_box(name + 'Top', (2.6, 0.46, 0.06), (x, y, 0.45), MAT['oak'], bevel=0.008, rot_z=rot, group='props')
    c, s = math.cos(rot), math.sin(rot)
    for lx in (-1.0, 1.0):
        for ly in (-0.17, 0.17):
            make_box(name + 'Leg', (0.04, 0.04, 0.42), (x + lx * c - ly * s, y + lx * s + ly * c, 0.21), MAT['steel'], group='props')


bench('BenchA', -1.0, -4.2, 0.0)
bench('BenchB', 9.4, -0.6, math.pi / 2)

# ---- sky, cameras, render ---------------------------------------------------------------------
world = bpy.data.worlds.new('Sky')
scene.world = world
world.use_nodes = True
wt = world.node_tree
sky = wt.nodes.new('ShaderNodeTexSky')
sky.sky_type = 'MULTIPLE_SCATTERING'
sky.sun_elevation = math.radians(28)
sky.sun_rotation = math.radians(250)
sky.sun_intensity = 0.8
coord_w = wt.nodes.new('ShaderNodeTexCoord')
map_w = wt.nodes.new('ShaderNodeMapping')
map_w.inputs['Scale'].default_value = (1.0, 1.0, 3.2)      # stretched upward: clouds sit in horizontal banks
wt.links.new(coord_w.outputs['Generated'], map_w.inputs['Vector'])
cl = wt.nodes.new('ShaderNodeTexNoise')
cl.noise_dimensions = '3D'
cl.inputs['Scale'].default_value = 2.4
cl.inputs['Detail'].default_value = 7
cl.inputs['Roughness'].default_value = 0.6
wt.links.new(map_w.outputs['Vector'], cl.inputs['Vector'])
ramp_w = wt.nodes.new('ShaderNodeValToRGB')
ramp_w.color_ramp.elements[0].position = 0.5
ramp_w.color_ramp.elements[1].position = 0.74
wt.links.new(cl.outputs['Fac'], ramp_w.inputs['Fac'])
sep_w = wt.nodes.new('ShaderNodeSeparateXYZ')
wt.links.new(coord_w.outputs['Generated'], sep_w.inputs['Vector'])
up_w = wt.nodes.new('ShaderNodeMapRange')
up_w.inputs['From Min'].default_value = 0.03
up_w.inputs['From Max'].default_value = 0.4
wt.links.new(sep_w.outputs['Z'], up_w.inputs['Value'])
mask_w = wt.nodes.new('ShaderNodeMath')
mask_w.operation = 'MULTIPLY'
wt.links.new(ramp_w.outputs['Color'], mask_w.inputs[0])
wt.links.new(up_w.outputs['Result'], mask_w.inputs[1])
mix_w = wt.nodes.new('ShaderNodeMix')
mix_w.data_type = 'RGBA'
mix_w.inputs['B'].default_value = (0.92, 0.92, 0.94, 1.0)
wt.links.new(mask_w.outputs['Value'], mix_w.inputs['Factor'])
wt.links.new(sky.outputs['Color'], mix_w.inputs['A'])
wt.links.new(mix_w.outputs['Result'], wt.nodes['Background'].inputs['Color'])
wt.nodes['Background'].inputs['Strength'].default_value = 0.65

cam_data = bpy.data.cameras.new('Cam')
cam_data.sensor_fit = 'VERTICAL'
cam_data.angle_y = math.radians(55)
cam = bpy.data.objects.new('Cam', cam_data)
VIEWS = {
    'overview': ((-10.2, -5.6, 1.62), (2.5, 4.5, 1.45)),
    'window': ((-8.5, -5.0, 1.65), (11.0, 0.8, 1.9)),
    'alcove': ((-1.0, -2.0, 1.6), (8.5, 9.5, 1.55)),
    'pano': ((0.0, -0.5, 1.6), (0.0, 5.0, 1.6)),
}
VIEW = os.environ.get('VIEW', 'overview')
cam.location = VIEWS[VIEW][0]
cam.rotation_euler = (Vector(VIEWS[VIEW][1]) - Vector(cam.location)).to_track_quat('-Z', 'Y').to_euler()
link(cam)
scene.camera = cam
if VIEW == 'pano':
    cam_data.type = 'PANO'
    if hasattr(cam_data, 'panorama_type'):
        cam_data.panorama_type = 'EQUIRECTANGULAR'
    cam.rotation_euler = (math.pi / 2, 0, 0)

scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 24 if PREVIEW else 128
scene.cycles.use_denoising = True
scene.cycles.denoiser = 'OPENIMAGEDENOISE'
scene.cycles.max_bounces = 8 if PREVIEW else 12
scene.cycles.diffuse_bounces = 4 if PREVIEW else 6
scene.cycles.glossy_bounces = 4
scene.cycles.transparent_max_bounces = 12
scene.cycles.sample_clamp_indirect = 8.0
if VIEW == 'pano':
    scene.render.resolution_x, scene.render.resolution_y = (1024, 512) if PREVIEW else (2048, 1024)
else:
    scene.render.resolution_x = 960 if PREVIEW else 1920
    scene.render.resolution_y = 600 if PREVIEW else 1200
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = 'Khronos PBR Neutral'
scene.view_settings.look = 'None'
scene.view_settings.exposure = 0.7
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = os.path.join(OUT, f'preview_{VIEW}.png' if PREVIEW else f'hero_{VIEW}.png')


# ---- physics check: everything must be held up by something ---------------------------------------
def check_support():
    """Flag any mesh that is not connected, through touching bounding boxes, to the floor,
    ceiling, or a wall. Catches floating fixtures, sculptures that hover, loose parts."""
    bpy.context.view_layer.update()
    items = []
    for o in bpy.data.objects:
        if o.type not in {'MESH', 'CURVE'} or o.name.startswith(('ART_', 'Glass_', 'WindowGlass', 'X_')):
            continue
        pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        items.append((o, lo, hi))
    tol = 0.012

    def touches(a, b):
        return all(a[0][i] - tol <= b[1][i] and b[0][i] - tol <= a[1][i] for i in range(3))

    def anchored(lo, hi):
        return lo.z <= tol or hi.z >= H - tol or lo.x <= -HW + tol or hi.x >= HW - tol or lo.y <= -HD + tol or hi.y >= HD - tol

    reached = {i for i, (o, lo, hi) in enumerate(items) if anchored(lo, hi) or o.name.startswith('S_')}
    changed = True
    while changed:
        changed = False
        for i, (o, lo, hi) in enumerate(items):
            if i in reached:
                continue
            if any(touches((lo, hi), (items[j][1], items[j][2])) for j in reached):
                reached.add(i)
                changed = True
    loose = [items[i][0].name for i in range(len(items)) if i not in reached]
    print('SUPPORT CHECK:', 'all parts are supported' if not loose else f'{len(loose)} unsupported: {loose[:25]}')
    return loose


loose = check_support()
with open(os.path.join(OUT, 'placements.json'), 'w') as f:
    json.dump({'room': {'width': W, 'depth': D, 'height': H, 'artCentre': ART_CENTER}, **PLACEMENTS}, f, indent=2)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'afterimage_hall.blend'))
if not os.environ.get('NORENDER'):
    print('rendering', scene.render.filepath)
    bpy.ops.render.render(write_still=True)
print('done')
