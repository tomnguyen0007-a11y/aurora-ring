"""
Bakes the Afterimage Hall (built by build_hall.py) into assets for the web gallery.

  python build_hall.py        # first: NORENDER=1 builds and saves out/afterimage_hall.blend
  python bake_hall.py         # then this: lighting, geometry, sky, reflections

  BAKE_PREVIEW=1 python bake_hall.py   quick low-quality pass, to test the pipeline
  ONLY=floor,shell python bake_hall.py bake just those atlases

What it makes, in ../museum/assets/hall/:
  floor.jpg shell.jpg props.jpg exterior.jpg   the room as the camera sees it, lighting included
  hall.glb      geometry for those four, UV-mapped into the atlases
  sky.jpg       the far scenery (lawn, trees, hills, clouds) as a panorama
  env.hdr       the room's own reflections, for the live sculptures and the glass
  hall.json     atlas sizes, where each work hangs, where each sculpture stands

How an atlas is made. Cycles bakes two things per surface: the colour of the material (no
lighting) and the light that lands on it (direct and indirect, no reflections). The light is
smooth, so it is cleaned up and added to the colour afterwards: noise-free lighting on
full-resolution texture detail. The result goes through the same view transform as the
Blender renders (Khronos PBR Neutral, +0.5 EV) so the web gallery matches them.
"""
import json
import math
import os
import shutil
import sys

import bpy  # must come first: it makes bmesh and mathutils importable
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402
from PIL import Image  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
BLEND = os.path.join(HERE, 'out', 'afterimage_hall.blend')
OUT = os.path.normpath(os.path.join(HERE, '..', 'museum', 'assets', 'hall'))
WORK = os.path.join(HERE, 'out', 'bake')
PREVIEW = bool(os.environ.get('BAKE_PREVIEW'))
ONLY = set(filter(None, os.environ.get('ONLY', '').split(',')))
SAMPLES = int(os.environ.get('BAKE_SAMPLES', 24 if PREVIEW else 160))
DIV = int(os.environ.get('BAKE_DIV', 4 if PREVIEW else 1))     # atlas size divisor for quick tests
EXPOSURE_EV = 0.7          # the same as build_hall.py's render
WINDOW_TINT = 0.18         # how much daylight the window glass lets through (see WINDOW_GLASS)
JPEG_QUALITY = 86

# group: (colour atlas size, light atlas size). Light is smooth, so it needs fewer pixels.
ATLAS = {
    'floor': ((4096, 2480), (1024, 620)),
    'shell': ((4096, 4096), (1024, 1024)),
    'props': ((4096, 4096), (512, 512)),
    'exterior': ((1024, 1024), (256, 256)),
}
if DIV > 1:
    ATLAS = {k: ((a[0] // DIV, a[1] // DIV), (b[0] // DIV, b[1] // DIV)) for k, (a, b) in ATLAS.items()}

os.makedirs(OUT, exist_ok=True)
os.makedirs(WORK, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=BLEND)
scene = bpy.context.scene
view_layer = bpy.context.view_layer
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = False
scene.cycles.max_bounces = 10
scene.cycles.diffuse_bounces = 6
scene.cycles.sample_clamp_indirect = 3.0


def log(*a):
    print('[bake]', *a, flush=True)


def group_objects(group):
    return [o for o in bpy.data.objects if o.type == 'MESH' and o.get('bake') == group]


def select_only(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    view_layer.objects.active = objs[0]


# ---- UVs ------------------------------------------------------------------------------------
def unwrap(group, objs):
    """Give every object of a group one UV layer, 'BakeUV', all packed into one shared atlas."""
    for o in objs:
        uvs = o.data.uv_layers
        keep = group == 'floor' and 'UVMap' in uvs
        for name in [layer.name for layer in uvs]:
            if not (keep and name == 'UVMap'):
                uvs.remove(uvs[name])
        if keep:
            uvs['UVMap'].name = 'BakeUV'
        else:
            uvs.new(name='BakeUV')
        uvs.active = uvs['BakeUV']
    if group == 'floor':
        return      # one quad whose UVs already cover 0..1
    select_only(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0015, area_weight=0.6)
    bpy.ops.uv.pack_islands(margin=0.0015, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')


# ---- hiding what nobody can see -------------------------------------------------------------
def viewpoints():
    """Where a visitor's eyes can be: a grid through the hall and the alcove, at three heights."""
    pts = []
    for z in (0.9, 1.65, 2.9):
        for x in np.linspace(-10, 10, 6):
            for y in np.linspace(-5.6, 5.6, 5):
                pts.append(Vector((x, y, z)))
        for x in (7.6, 9.4):
            for y in (8.0, 9.8):
                pts.append(Vector((x, y, z)))
    return pts


def build_bvh():
    """Every solid thing in the hall, in world space, as one acceleration structure."""
    from mathutils.bvhtree import BVHTree
    verts, polys, owner = [], [], []
    for o in bpy.data.objects:
        if o.type != 'MESH' or o.name.startswith(('Glass_', 'WindowGlass')):
            continue
        mw = o.matrix_world
        base = len(verts)
        verts.extend(mw @ v.co for v in o.data.vertices)
        for p in o.data.polygons:
            polys.append([base + i for i in p.vertices])
            owner.append((o.name, p.index))
    return BVHTree.FromPolygons(verts, polys, epsilon=0.0, all_triangles=False), owner


def prune_hidden(objs):
    """Delete faces that can't be seen from anywhere a visitor can stand: the outsides of walls,
    the backs of frames, the tops of ceiling slabs. The atlas then spends its pixels on what shows."""
    import bmesh
    bpy.context.view_layer.update()
    bvh, owner = build_bvh()
    index_of = {k: i for i, k in enumerate(owner)}
    eyes = viewpoints()
    rng = np.random.default_rng(3)
    removed = kept = 0
    for o in objs:
        mw = o.matrix_world
        n_mat = mw.to_3x3().inverted_safe().transposed()
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.faces.ensure_lookup_table()
        doomed = []
        for f in bm.faces:
            verts = [mw @ v.co for v in f.verts]
            normal = (n_mat @ f.normal).normalized()
            gid = index_of[(o.name, f.index)]
            area = f.calc_area()
            n_s = 1 if area < 0.6 else min(12, 1 + int(area / 0.6))
            samples = [sum(verts, Vector()) / len(verts)]
            for _ in range(n_s - 1):
                w = rng.dirichlet(np.ones(len(verts)))
                samples.append(sum((vv * float(wi) for vv, wi in zip(verts, w)), Vector()))
            seen = False
            for p in samples:
                p0 = p + normal * 0.002
                for e in eyes:
                    d = e - p0
                    dist = d.length
                    if d.dot(normal) <= 0:
                        continue
                    hit = bvh.ray_cast(p0, d / dist, dist)
                    if hit[0] is None:
                        seen = True       # nothing between the face and the eye: not even itself
                        break
                    if hit[2] == gid and hit[3] > dist - 0.005:
                        seen = True
                        break
                if seen:
                    break
            if seen:
                kept += 1
            else:
                doomed.append(f)
        removed += len(doomed)
        if doomed:
            bmesh.ops.delete(bm, geom=doomed, context='FACES')
        bm.to_mesh(o.data)
        bm.free()
    log('pruned', removed, 'hidden faces, kept', kept)


# ---- baking ---------------------------------------------------------------------------------
def make_image(name, size):
    img = bpy.data.images.new(name, size[0], size[1], alpha=False, float_buffer=True)
    img.colorspace_settings.name = 'Non-Color'
    return img


def point_materials_at(objs, image):
    """Every material of the group gets an image node, active, which is where Cycles bakes to."""
    for m in {m for o in objs for m in o.data.materials if m}:
        nt = m.node_tree
        n = nt.nodes.get('BAKE_IMG') or nt.nodes.new('ShaderNodeTexImage')
        n.name = 'BAKE_IMG'
        n.image = image
        n.select = True
        nt.nodes.active = n


def bake(objs, size, kind, name):
    img = make_image(name, size)
    scene.cycles.samples = 4 if kind == 'albedo' else SAMPLES    # colour has no noise to average away
    point_materials_at(objs, img)
    select_only(objs)
    margin = max(4, size[0] // 256)
    if kind == 'albedo':
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, margin=margin, margin_type='EXTEND', use_clear=True)
    elif kind == 'light':
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=margin, margin_type='EXTEND', use_clear=True)
    elif kind == 'emit':
        bpy.ops.object.bake(type='EMIT', margin=margin, margin_type='EXTEND', use_clear=True)
    arr = np.empty(size[0] * size[1] * 4, dtype=np.float32)
    img.pixels.foreach_get(arr)
    return arr.reshape(size[1], size[0], 4)[..., :3].copy()


def blur(a, sigma):
    """Separable Gaussian, edge-clamped. Lighting is smooth, so this removes bake noise."""
    if sigma <= 0:
        return a
    r = int(math.ceil(sigma * 3))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    out = a
    for axis in (0, 1):
        pad = [(0, 0)] * a.ndim
        pad[axis] = (r, r)
        p = np.pad(out, pad, mode='edge')
        acc = np.zeros_like(out)
        n = out.shape[axis]
        for i, w in enumerate(k):
            sl = [slice(None)] * a.ndim
            sl[axis] = slice(i, i + n)
            acc += w * p[tuple(sl)]
        out = acc
    return out


def smooth_light(light, sigma):
    """Two-scale clean-up of bake noise. Where the light is smooth (ceilings, beams, wall
    between pools) a wide blur is used; where it has an edge (a spot's pool, a shadow) the
    narrow blur is kept, so pools stay crisp."""
    small = blur(light, sigma)
    big = blur(light, sigma * 4.0)
    lum_s = small.mean(axis=-1, keepdims=True)
    lum_b = big.mean(axis=-1, keepdims=True)
    w = np.exp(-(((lum_s - lum_b) / (0.12 * lum_b + 0.02)) ** 2))
    return small * (1 - w) + big * w


def resize(a, size):
    """Bilinear upsample of a float RGB array to (w, h)."""
    h0, w0 = a.shape[:2]
    w1, h1 = size
    ys = (np.arange(h1) + 0.5) * h0 / h1 - 0.5
    xs = (np.arange(w1) + 0.5) * w0 / w1 - 0.5
    y0 = np.clip(np.floor(ys).astype(int), 0, h0 - 1)
    x0 = np.clip(np.floor(xs).astype(int), 0, w0 - 1)
    y1 = np.clip(y0 + 1, 0, h0 - 1)
    x1 = np.clip(x0 + 1, 0, w0 - 1)
    fy = np.clip(ys - y0, 0, 1)[:, None, None]
    fx = np.clip(xs - x0, 0, 1)[None, :, None]
    top = a[y0][:, x0] * (1 - fx) + a[y0][:, x1] * fx
    bot = a[y1][:, x0] * (1 - fx) + a[y1][:, x1] * fx
    return (top * (1 - fy) + bot * fy).astype(np.float32)


def neutral_tonemap(c):
    """Khronos PBR Neutral, the same operator Blender's view transform and three.js use."""
    start = 0.8 - 0.04
    desat = 0.15
    x = c.min(axis=-1, keepdims=True)
    offset = np.where(x < 0.08, x - 6.25 * x * x, 0.04)
    c = c - offset
    peak = c.max(axis=-1, keepdims=True)
    d = 1 - start
    new_peak = 1 - d * d / (peak + d - start)
    scaled = c * (new_peak / np.maximum(peak, 1e-6))
    g = 1 - 1 / (desat * (peak - new_peak) + 1)
    mapped = scaled * (1 - g) + new_peak * g
    return np.where(peak < start, c, mapped)


def srgb_encode(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def to_jpeg(linear_rgb, path, flip=True, dither=True):
    """Linear scene radiance to a display-referred JPEG, with a touch of dither against banding."""
    c = srgb_encode(neutral_tonemap(linear_rgb * (2.0 ** EXPOSURE_EV)))
    if dither:
        rng = np.random.default_rng(5)
        c = c + (rng.random(c.shape[:2] + (1,), dtype=np.float32) - rng.random(c.shape[:2] + (1,), dtype=np.float32)) / 255.0
    img = Image.fromarray((np.clip(c, 0, 1) * 255 + 0.5).astype(np.uint8))
    if flip:
        img = img.transpose(Image.FLIP_TOP_BOTTOM)      # Blender's origin is bottom-left; glTF's is top-left
    img.save(path, quality=JPEG_QUALITY, optimize=True, subsampling=0 if min(img.size) <= 1024 else 2)
    return os.path.getsize(path)


info = {'atlases': {}}
prepared = set()     # groups already pruned and unwrapped in this run


def bake_group(group):
    objs = group_objects(group)
    if not objs:
        log('no objects in', group)
        return
    log(group, len(objs), 'objects')
    if group != 'floor':
        prune_hidden(objs)
        objs = [o for o in objs if len(o.data.polygons)]
    unwrap(group, objs)
    prepared.add(group)
    (cw, ch), (lw, lh) = ATLAS[group]
    raw = os.path.join(WORK, f'{group}.npz')
    if os.environ.get('COMPOSE_ONLY') and os.path.exists(raw):
        z = np.load(raw)
        albedo, light, emit = z['albedo'], z['light'], z['emit']
    else:
        albedo = bake(objs, (cw, ch), 'albedo', f'{group}_albedo')
        log(group, 'albedo done')
        light = bake(objs, (lw, lh), 'light', f'{group}_light')
        log(group, 'light done')
        emit = bake(objs, (lw, lh), 'emit', f'{group}_emit')
        np.savez(raw, albedo=albedo, light=light, emit=emit)
    light = smooth_light(light, 2.0 if group != 'exterior' else 1.0)
    radiance = albedo * resize(light, (cw, ch)) + resize(emit, (cw, ch))
    size = to_jpeg(radiance, os.path.join(OUT, f'{group}.jpg'))
    log(group, f'{cw}x{ch}', f'{size / 1024:.0f} KB')
    info['atlases'][group] = {'file': f'{group}.jpg', 'size': [cw, ch]}


def export_geometry():
    """One mesh per group, in world space, UVs in the atlas, no materials: the web side adds them."""
    bpy.ops.object.select_all(action='DESELECT')
    exports = []
    for group in ATLAS:
        objs = group_objects(group)
        if not objs:
            continue
        if group not in prepared:
            if group != 'floor':
                prune_hidden(objs)
                objs = [o for o in objs if len(o.data.polygons)]
            unwrap(group, objs)
        select_only(objs)
        for o in objs:
            if o.parent:
                m = o.matrix_world.copy()
                o.parent = None
                o.matrix_world = m
        bpy.ops.object.join()
        joined = view_layer.objects.active
        joined.name = f'HALL_{group}'
        joined.data.name = f'HALL_{group}'
        joined.data.materials.clear()
        for p in joined.data.polygons:
            p.use_smooth = False
        exports.append(joined)
    if not exports:
        return
    bpy.ops.object.select_all(action='DESELECT')
    for o in exports:
        o.select_set(True)
    view_layer.objects.active = exports[0]
    path = os.path.join(OUT, 'hall.glb')
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
        export_materials='NONE', export_normals=False, export_tangents=False, export_texcoords=True,
        export_cameras=False, export_lights=False, export_vertex_color='NONE',
    )
    log('hall.glb', f'{os.path.getsize(path) / 1024:.0f} KB', [(o.name, len(o.data.vertices)) for o in exports])


# ---- panoramas ------------------------------------------------------------------------------
def roll_to_three(a):
    """Blender's equirect has +Y_blender (the web gallery's -Z) in the centre; three.js wants +X there."""
    return np.roll(a, -a.shape[1] // 4, axis=1)


def render_pano(path, position, size, hide, samples):
    cam_data = bpy.data.cameras.new('PanoCam')
    cam_data.type = 'PANO'
    if hasattr(cam_data, 'panorama_type'):
        cam_data.panorama_type = 'EQUIRECTANGULAR'
    cam = bpy.data.objects.new('PanoCam', cam_data)
    scene.collection.objects.link(cam)
    cam.location = position
    cam.rotation_euler = (math.pi / 2, 0, 0)
    scene.camera = cam
    hidden = []
    for o in bpy.data.objects:
        if hide(o) and not o.hide_render:
            o.hide_render = True
            hidden.append(o)
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = 'OPENIMAGEDENOISE'
    scene.render.image_settings.file_format = 'OPEN_EXR'
    scene.render.image_settings.color_depth = '32'
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for o in hidden:
        o.hide_render = False
    img = bpy.data.images.load(path, check_existing=False)
    arr = np.empty(size[0] * size[1] * 4, dtype=np.float32)
    img.pixels.foreach_get(arr)
    bpy.data.images.remove(img)
    scene.cycles.use_denoising = False
    return arr.reshape(size[1], size[0], 4)[..., :3].copy()


def write_sky():
    """Far scenery as seen from the window, with the window glass's tint baked in."""
    w, h = (1024, 512) if PREVIEW else (4096, 2048)
    arr = render_pano(os.path.join(WORK, 'sky.exr'), (11.0, 0.0, 1.7), (w, h),
                      lambda o: o.get('bake') != 'pano', 24 if PREVIEW else 96)
    arr = roll_to_three(arr) * WINDOW_TINT
    size = to_jpeg(arr, os.path.join(OUT, 'sky.jpg'), dither=True)
    log('sky.jpg', f'{size / 1024:.0f} KB')
    info['sky'] = 'sky.jpg'


def write_env():
    """The room as a reflection map, kept in HDR so spotlights still glint in chrome."""
    w, h = (512, 256) if PREVIEW else (1024, 512)
    arr = render_pano(os.path.join(WORK, 'env.exr'), (0.0, -0.5, 1.6), (w, h),
                      lambda o: False, 24 if PREVIEW else 96)
    arr = roll_to_three(arr)
    write_rgbe(os.path.join(OUT, 'env.hdr'), arr[::-1])     # Radiance files run top to bottom
    log('env.hdr', f'{os.path.getsize(os.path.join(OUT, "env.hdr")) / 1024:.0f} KB')
    info['env'] = 'env.hdr'


def write_rgbe(path, a):
    """Radiance .hdr with run-length encoding, which three.js's RGBELoader reads."""
    h, w = a.shape[:2]
    a = np.maximum(a, 0)
    m = a.max(axis=-1)
    mant, exp = np.frexp(np.maximum(m, 1e-32))
    scale = np.where(m < 1e-32, 0.0, mant * 256.0 / np.maximum(m, 1e-32))
    rgbe = np.zeros((h, w, 4), dtype=np.uint8)
    rgbe[..., :3] = np.clip(a * scale[..., None], 0, 255).astype(np.uint8)
    rgbe[..., 3] = np.where(m < 1e-32, 0, exp + 128).astype(np.uint8)
    with open(path, 'wb') as f:
        f.write(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n' + f'-Y {h} +X {w}\n'.encode())
        for y in range(h):
            f.write(bytes([2, 2, w >> 8, w & 255]))
            for c in range(4):
                row = rgbe[y, :, c]
                i = 0
                while i < w:
                    run = 1
                    while i + run < w and run < 127 and row[i + run] == row[i]:
                        run += 1
                    if run >= 4:
                        f.write(bytes([128 + run, int(row[i])]))
                        i += run
                    else:
                        j = i
                        lit = 0
                        while j < w and lit < 128:
                            r2 = 1
                            while j + r2 < w and r2 < 4 and row[j + r2] == row[j]:
                                r2 += 1
                            if r2 >= 4:
                                break
                            j += 1
                            lit += 1
                        lit = max(lit, 1)
                        f.write(bytes([lit]) + bytes(row[i:i + lit].tolist()))
                        i += lit


def write_info():
    """hall.json for tools, and js/hall-data.js so the gallery knows where everything hangs
    before the heavy assets have loaded."""
    with open(os.path.join(HERE, 'out', 'placements.json')) as f:
        placements = json.load(f)
    data = {
        'atlases': {g: {'file': f'{g}.jpg', 'size': list(ATLAS[g][0])} for g in ATLAS},
        'sky': 'sky.jpg',
        'env': 'env.hdr',
        'exposureEV': EXPOSURE_EV,
        **placements,
    }
    with open(os.path.join(OUT, 'hall.json'), 'w') as f:
        json.dump(data, f, indent=1)
    js = os.path.normpath(os.path.join(HERE, '..', 'museum', 'js', 'hall-data.js'))
    with open(js, 'w') as f:
        f.write('// Written by blender/bake_hall.py: where the room\'s works hang and stand.\n')
        f.write('export const HALL = ' + json.dumps(data, indent=2) + ';\n')
    log('hall.json and hall-data.js written')


if __name__ == '__main__':
    groups = [g for g in ATLAS if not ONLY or g in ONLY]
    for g in groups:
        bake_group(g)
    if not ONLY or 'sky' in ONLY:
        write_sky()
    if not ONLY or 'env' in ONLY:
        write_env()
    if not ONLY or 'geometry' in ONLY:
        export_geometry()
    write_info()
    log('done')
