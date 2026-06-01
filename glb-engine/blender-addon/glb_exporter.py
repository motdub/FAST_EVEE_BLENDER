bl_info = {
    "name": "GLB One-Click Exporter (Engine v7.3 Fixed Path Sanitization)",
    "author": "motdub (v7.3 path-fix rewrite)",
    "version": (7, 3),
    "blender": (3, 6, 0),
    "category": "Export",
}

import bpy
import os
import traceback
import random
import string

# ============================================================
# STATE
# ============================================================

STATE = {
    "step": 0,
    "scene": None,
    "depsgraph": None,

    "meshes": [],
    "materials": [],

    "out_dir": "",
    "out_file": "",

    "progress": 0.0,
    "stage": "",

    "log": [],
    "done": False,
}

STAGES = [
    "COLLECT",
    "MATERIALS",
    "EXPORT",
    "DONE"
]

# ============================================================
# LOGGING (FULL COPY SAFE)
# ============================================================

def log(msg):
    msg = str(msg)
    print(msg)
    STATE["log"].append(msg)

    try:
        txt = bpy.data.texts.get("GLB_EXPORT_LOG")
        if not txt:
            txt = bpy.data.texts.new("GLB_EXPORT_LOG")
        txt.write(msg + "\n")
    except:
        pass

def dump_log():
    return "\n".join(STATE["log"])

def crash(tag="ERROR"):
    err = traceback.format_exc()
    full = dump_log() + "\n\n[" + tag + "]\n" + err

    try:
        bpy.context.window_manager.clipboard = full
    except:
        pass

    try:
        txt = bpy.data.texts.get("GLB_EXPORT_LOG")
        if not txt:
            txt = bpy.data.texts.new("GLB_EXPORT_LOG")
        txt.clear()
        txt.write(full)
    except:
        pass

    return full

# ============================================================
# PATH SYSTEM (FIXED + SAFE + AUTO-CORRECTING)
# ============================================================

def normalize_dir(p):
    if not p:
        return os.path.expanduser("~")

    # Clean up common user-paste artifacts
    p = str(p).strip()
    p = p.strip('"').strip("'")  # Strip wrapping quotes if pasted with spaces
    
    # Standardize all backslashes to forward slashes for cross-platform safety
    p = p.replace("\\", "/")
    
    # Resolve Blender relative path logic ('//') safely
    if p.startswith("//"):
        if bpy.data.is_saved:
            p = bpy.path.abspath(p)
        else:
            # Fallback if the blend file isn't saved yet
            p = os.path.join(os.path.expanduser("~"), "Documents")
            log(f"[PATH WARNING] Blend file unsaved. Relative path redirected to: {p}")
    else:
        p = os.path.abspath(p)

    # If user passed a file path instead of a directory path, extract the directory
    if os.path.splitext(p)[1]:
        p = os.path.dirname(p)

    # Return platform-native format (converts back to backslashes if on Windows)
    return os.path.normpath(p)

def safe_mkdir(path):
    try:
        os.makedirs(path, exist_ok=True)
        return path
    except Exception:
        log(crash("MKDIR FAILED"))
        fallback = os.path.normpath(os.path.expanduser("~"))
        log(f"[PATH FALLBACK] Failed to create path. Redirecting to: {fallback}")
        return fallback

def random_id():
    return "".join(random.choice(string.digits) for _ in range(6))

def build_output_path(folder, base_name):
    folder = normalize_dir(folder)
    folder = safe_mkdir(folder)

    if not base_name:
        base_name = "export"

    # Strip illegal filename characters just in case
    base_name = "".join(c for c in base_name if c.isalnum() or c in ('_', '-'))

    filename = f"{base_name}_{random_id()}.glb"
    return folder, os.path.join(folder, filename)

# ============================================================
# VISIBILITY
# ============================================================

def is_visible(o):
    return o and o.type == "MESH" and o.visible_get() and not o.hide_get()

def get_meshes(scene):
    m = [o for o in scene.objects if is_visible(o)]
    m.sort(key=lambda x: x.name)
    return m

def get_materials(meshes):
    mats = []
    for o in meshes:
        for s in o.material_slots:
            if s.material:
                mats.append(s.material)

    mats = sorted(set(mats), key=lambda m: m.name if m else "")
    return [m for m in mats if m]

# ============================================================
# CRITICAL FIX: DETERMINISTIC MATERIAL SLOT BINDING
# ============================================================

def enforce_material_order(meshes, materials):
    material_order = {m.name: i for i, m in enumerate(materials)}

    for obj in meshes:
        if obj.type != "MESH":
            continue

        slots = list(obj.material_slots)

        sorted_slots = sorted(
            [s.material for s in slots if s.material],
            key=lambda m: material_order.get(m.name, 999999)
        )

        obj.data.materials.clear()
        for m in sorted_slots:
            obj.data.materials.append(m)

# ============================================================
# EXPORT
# ============================================================

def run_export():
    log("[EXPORT] starting GLB export...")

    try:
        # Pass the cleaned absolute path directly to the exporter
        result = bpy.ops.export_scene.gltf(
            filepath=STATE["out_file"],
            export_format='GLB',
            export_texcoords=True,
            export_normals=True,
            export_materials='EXPORT',
            export_animations=True,
            export_skins=True,
            export_cameras=True,
            export_lights=False,
            use_active_scene=True,
        )

        log(f"[EXPORT RESULT] {result}")

        if 'FINISHED' not in result:
            raise Exception(f"Export failed: {result}")

    except Exception:
        raise Exception(crash("EXPORT FAILED"))

# ============================================================
# PIPELINE
# ============================================================

def step():
    stage = STAGES[STATE["step"]]
    STATE["stage"] = stage
    STATE["progress"] = STATE["step"] / max(1, len(STAGES))

    log(f"[{stage}]")

    if stage == "COLLECT":
        scene = STATE["scene"]
        meshes = get_meshes(scene)

        STATE["meshes"] = meshes
        STATE["materials"] = get_materials(meshes)

        log(f"Meshes: {len(meshes)}")
        log(f"Materials: {len(STATE['materials'])}")

        STATE["step"] += 1

    elif stage == "MATERIALS":
        enforce_material_order(STATE["meshes"], STATE["materials"])
        log("Deterministic material binding applied")
        STATE["step"] += 1

    elif stage == "EXPORT":
        run_export()
        STATE["step"] += 1

    elif stage == "DONE":
        STATE["done"] = True
        log("[DONE]")
        return "DONE"

    return "RUN"

# ============================================================
# OPERATOR
# ============================================================

class GLB_OT_EngineV7_2(bpy.types.Operator):
    bl_idname = "export.glb_engine_v7_2"
    bl_label = "GLB Engine v7.2 ALL-OR-NOTHING"
    bl_options = {'REGISTER'}

    def invoke(self, context, event):
        STATE["step"] = 0
        STATE["log"] = []
        STATE["scene"] = context.scene
        STATE["depsgraph"] = context.evaluated_depsgraph_get()

        # FIXED: Pulling path properties directly from scene context properties
        # instead of relying on empty operator default parameters.
        ui_folder = context.scene.glb_folder
        ui_filename = context.scene.glb_name

        folder, out = build_output_path(ui_folder, ui_filename)

        STATE["out_dir"] = folder
        STATE["out_file"] = out

        log(f"[OUTPUT DIR] {folder}")
        log(f"[OUTPUT FILE] {out}")

        wm = context.window_manager
        self._timer = wm.event_timer_add(0.05, window=context.window)
        wm.modal_handler_add(self)

        return {'RUNNING_MODAL'}

    def modal(self, context, event):
        if event.type == 'ESC':
            context.window_manager.event_timer_remove(self._timer)
            return {'CANCELLED'}

        if event.type != 'TIMER':
            return {'PASS_THROUGH'}

        try:
            result = step()
            # Handle UI redrawing cleanly context-safely
            if context.area:
                context.area.tag_redraw()

            if result == "DONE":
                context.window_manager.event_timer_remove(self._timer)
                return {'FINISHED'}

        except Exception:
            crash("PIPELINE CRASH")
            context.window_manager.event_timer_remove(self._timer)
            return {'CANCELLED'}

        return {'RUNNING_MODAL'}

# ============================================================
# UI
# ============================================================

class GLB_PT_Panel(bpy.types.Panel):
    bl_label = "GLB Engine v7.3"
    bl_idname = "GLB_PT_v7_2"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'GLB Export'
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, context):
        layout = self.layout

        layout.label(text="ALL-OR-NOTHING EXPORT")

        layout.prop(context.scene, "glb_folder")
        layout.prop(context.scene, "glb_name")

        layout.operator("export.glb_engine_v7_2", text="EXPORT GLB")

        layout.label(text=f"Stage: {STATE.get('stage', 'IDLE')}")
        layout.label(text=f"Progress: {STATE.get('progress', 0):.2f}")

# ============================================================
# PROPS
# ============================================================

def register_props():
    bpy.types.Scene.glb_folder = bpy.props.StringProperty(
        name="Folder",
        subtype='DIR_PATH',
        default="//"
    )

    bpy.types.Scene.glb_name = bpy.props.StringProperty(
        name="File Name",
        default="export"
    )

def unregister_props():
    del bpy.types.Scene.glb_folder
    del bpy.types.Scene.glb_name

# ============================================================
# REGISTER
# ============================================================

def register():
    register_props()
    bpy.utils.register_class(GLB_OT_EngineV7_2)
    bpy.utils.register_class(GLB_PT_Panel)

def unregister():
    bpy.utils.unregister_class(GLB_PT_Panel)
    bpy.utils.unregister_class(GLB_OT_EngineV7_2)
    unregister_props()

if __name__ == "__main__":
    register()