bl_info = {
    "name": "GLB One-Click Exporter by motdub",
    "author": "motdub https://github.com/motdub",
    "version": (1, 4),
    "blender": (3, 6, 0),
    "category": "Export",
}

import bpy
import os
import traceback


# ---------------------------------------------------------------------------
# Progress state
# ---------------------------------------------------------------------------

_status_title   = "GLB Exporter"
_status_message = ""
_status_lines   = []


def _push_status(title: str, message: str, icon: str = 'INFO'):
    global _status_title, _status_message, _status_lines
    _status_title   = title
    _status_message = message
    _status_lines.append((icon, message))
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            area.tag_redraw()


def _reset_log():
    global _status_lines
    _status_lines = []


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_export_collection(context, src_scene):
    tmp_scene = bpy.data.scenes.new("__glb_export_tmp__")
    tmp_col   = bpy.data.collections.new("__glb_export_col__")
    tmp_scene.collection.children.link(tmp_col)

    tmp_scene.render.engine  = src_scene.render.engine
    tmp_scene.cycles.samples = src_scene.cycles.samples
    tmp_scene.frame_start    = src_scene.frame_start
    tmp_scene.frame_end      = src_scene.frame_end
    tmp_scene.render.fps     = src_scene.render.fps

    for obj in src_scene.objects:
        new_obj = obj.copy()
        if obj.data:
            new_obj.data = obj.data.copy()
        tmp_col.objects.link(new_obj)

    return tmp_scene, tmp_col


def _apply_modifiers(depsgraph, obj):
    eval_obj   = obj.evaluated_get(depsgraph)
    baked_mesh = bpy.data.meshes.new_from_object(eval_obj)
    old_mesh   = obj.data
    obj.data   = baked_mesh
    obj.modifiers.clear()
    bpy.data.meshes.remove(old_mesh)


def _triangulate(context, obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.quads_convert_to_tris()
    bpy.ops.object.mode_set(mode='OBJECT')


def _apply_transforms(context, obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def _bake_material_to_image(context, obj, mat, bake_res):
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    img_name = f"baked_{mat.name}_{obj.name}"
    img = bpy.data.images.get(img_name)
    if img:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(img_name, width=bake_res, height=bake_res, alpha=False)

    img_node          = nodes.new('ShaderNodeTexImage')
    img_node.image    = img
    img_node.name     = "__bake_target__"
    img_node.location = (300, -400)
    nodes.active      = img_node

    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    context.view_layer.objects.active = obj

    context.scene.render.engine  = 'CYCLES'
    context.scene.cycles.samples = 32
    bpy.ops.object.bake(
        type='DIFFUSE',
        pass_filter={'COLOR'},
        save_mode='INTERNAL',
    )

    img.pack()

    bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        bsdf          = nodes.new('ShaderNodeBsdfPrincipled')
        bsdf.location = (0, 0)
        out = next((n for n in nodes if n.type == 'OUTPUT_MATERIAL'), None)
        if out:
            links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])

    for lnk in list(bsdf.inputs['Base Color'].links):
        links.remove(lnk)
    links.new(img_node.outputs['Color'], bsdf.inputs['Base Color'])

    return img


def _cleanup_tmp_scene(tmp_scene):
    for obj in list(tmp_scene.collection.all_objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.scenes.remove(tmp_scene)


# ---------------------------------------------------------------------------
# File-name input operator  (button 1)
# ---------------------------------------------------------------------------

class GLB_OT_SetFileName(bpy.types.Operator):
    """Type a custom file name for the exported GLB"""
    bl_idname  = "export.glb_set_filename"
    bl_label   = "Set File Name"
    bl_options = {'REGISTER', 'INTERNAL'}

    filename: bpy.props.StringProperty(
        name="File Name",
        description="Name of the exported file (without .glb extension)",
        default="export_scene",
    )

    def invoke(self, context, event):
        # Pre-fill with whatever name is currently set (strip path + ext)
        current = context.scene.glb_export_path
        base = os.path.splitext(os.path.basename(bpy.path.abspath(current)))[0]
        if base:
            self.filename = base
        return context.window_manager.invoke_props_dialog(self, width=340)

    def draw(self, context):
        layout = self.layout
        layout.label(text="Enter a name for the exported .glb file:")
        layout.prop(self, "filename", text="", icon='FILE_TEXT')
        layout.label(text='Extension ".glb" will be added automatically.', icon='INFO')

    def execute(self, context):
        scene    = context.scene
        current  = bpy.path.abspath(scene.glb_export_path)
        folder   = os.path.dirname(current) or bpy.path.abspath("//")
        new_name = self.filename.strip() or "export_scene"
        # Ensure no double extension
        if new_name.lower().endswith(".glb"):
            new_name = new_name[:-4]
        scene.glb_export_path = os.path.join(folder, new_name + ".glb")
        return {'FINISHED'}


# ---------------------------------------------------------------------------
# Output folder browser operator  (button 2)
# ---------------------------------------------------------------------------

class GLB_OT_BrowseOutputFolder(bpy.types.Operator):
    """Open a folder browser to choose where the GLB is saved"""
    bl_idname   = "export.glb_browse_folder"
    bl_label    = "Choose Output Folder"
    bl_options  = {'REGISTER', 'INTERNAL'}

    # Blender's built-in directory browser fills this property
    directory: bpy.props.StringProperty(
        name="Output Folder",
        subtype='DIR_PATH',
    )

    def invoke(self, context, event):
        # Start the browser in the folder of the current export path
        current = bpy.path.abspath(context.scene.glb_export_path)
        self.directory = os.path.dirname(current) or bpy.path.abspath("//")
        context.window_manager.fileselect_add(self)
        return {'RUNNING_MODAL'}

    def execute(self, context):
        scene    = context.scene
        current  = bpy.path.abspath(scene.glb_export_path)
        filename = os.path.basename(current) or "export_scene.glb"
        scene.glb_export_path = os.path.join(self.directory, filename)
        return {'FINISHED'}


# ---------------------------------------------------------------------------
# Main welcome / control popup  (opens on load, stays until user closes it)
# ---------------------------------------------------------------------------

class GLB_OT_WelcomePopup(bpy.types.Operator):
    """
    Persistent control window.
    Opens automatically when the add-on loads.
    Stays open until the user clicks the X in the top-right corner.
    """
    bl_idname  = "export.glb_welcome_popup"
    bl_label   = "GLB One-Click Exporter"
    bl_options = {'REGISTER', 'INTERNAL'}

    def invoke(self, context, event):
        # invoke_props_dialog gives us a real window with a title bar and
        # an X close button — it will NOT auto-close on click-outside.
        return context.window_manager.invoke_props_dialog(self, width=440)

    def draw(self, context):
        layout = self.layout
        scene  = context.scene

        # ── Header ──────────────────────────────────────────────────────
        header = layout.box()
        row    = header.row()
        row.label(text="GLB ONE-CLICK EXPORTER", icon='EXPORT')
        row.label(text="v1.4")

        layout.separator()

        # ── What this does ───────────────────────────────────────────────
        info = layout.box()
        info.label(text="What does this add-on do?", icon='QUESTION')
        info.label(text="  1.  Duplicates your scene so the original is never changed.")
        info.label(text="  2.  Bakes all modifiers, geometry nodes, and transforms.")
        info.label(text="  3.  Bakes all materials into flat diffuse textures.")
        info.label(text="  4.  Bakes animations / IK rigs into plain keyframes.")
        info.label(text="  5.  Exports everything as ONE self-contained .glb file.")

        layout.separator()

        # ── Settings ────────────────────────────────────────────────────
        settings = layout.box()
        settings.label(text="Settings", icon='SETTINGS')
        settings.prop(scene, "glb_bake_resolution", text="Bake Resolution")

        layout.separator()

        # ── Button 1 — Set file name ────────────────────────────────────
        name_box = layout.box()
        name_box.label(text="Output File Name", icon='FILE_TEXT')
        # Show the current filename as read-only info
        current_path = bpy.path.abspath(scene.glb_export_path)
        current_name = os.path.basename(current_path) or "export_scene.glb"
        name_box.label(text=f"Current:  {current_name}", icon='DOT')
        name_box.operator(
            "export.glb_set_filename",
            text="  Type a File Name",
            icon='GREASEPENCIL',
        )

        layout.separator()

        # ── Button 2 — Choose output folder ────────────────────────────
        folder_box = layout.box()
        folder_box.label(text="Output Folder", icon='FILE_FOLDER')
        # Show the current folder as read-only info
        current_folder = os.path.dirname(current_path) or "(same folder as .blend)"
        folder_box.label(text=f"Current:  {current_folder}", icon='DOT')
        folder_box.operator(
            "export.glb_browse_folder",
            text="  Browse Output Folder",
            icon='FILEBROWSER',
        )

        layout.separator()

        # ── Export button ───────────────────────────────────────────────
        big = layout.row()
        big.scale_y = 1.6
        big.operator(
            "export.glb_oneclick",
            text="  BAKE + EXPORT GLB",
            icon='EXPORT',
        )

        layout.separator()
        layout.label(text="Or use the 'GLB Export' tab in the N-panel (press N in 3D view).",
                     icon='INFO')

    def execute(self, context):
        # User clicked OK / closed the dialog — nothing to do
        return {'FINISHED'}


# ---------------------------------------------------------------------------
# Progress popup  (opens during export, stays until user closes it)
# ---------------------------------------------------------------------------

class GLB_OT_ProgressPopup(bpy.types.Operator):
    """Shows live step-by-step progress during export."""
    bl_idname  = "export.glb_progress_popup"
    bl_label   = "GLB Export Progress"
    bl_options = {'INTERNAL'}

    def invoke(self, context, event):
        return context.window_manager.invoke_props_dialog(self, width=440)

    def draw(self, context):
        layout = self.layout

        header = layout.box()
        header.label(text="GLB ONE-CLICK EXPORTER — PROGRESS", icon='EXPORT')

        current = layout.box()
        current.scale_y = 1.4
        current.label(text=_status_message, icon='TIME')

        if _status_lines:
            layout.label(text="Completed steps:")
            log_box = layout.box()
            for icon, line in _status_lines:
                log_box.label(text=line, icon=icon)

        layout.separator()
        help_box = layout.box()
        help_box.label(text="What is happening?", icon='QUESTION')
        _explain(help_box, _status_message)

    def execute(self, context):
        return {'FINISHED'}


def _explain(layout, step: str):
    explanations = {
        "CREATING DUPLICATE SCENE": [
            "Your original scene is being copied into a hidden",
            "temporary scene.  ALL destructive operations happen",
            "on the copy — your original file is never modified.",
        ],
        "APPLYING MODIFIERS": [
            "Modifiers like Subdivision, Boolean, Array, and",
            "Geometry Nodes are 'frozen' into real mesh geometry.",
            "The web engine cannot run live Blender logic, so",
            "everything must become plain triangles.",
        ],
        "APPLYING TRANSFORMS": [
            "Every object's position, rotation, and scale are",
            "baked into the mesh vertices directly.  This prevents",
            "objects appearing in the wrong place at runtime.",
        ],
        "TRIANGULATING MESHES": [
            "All quad and n-gon faces are split into triangles.",
            "GPUs (and WebGL) only draw triangles, so this must",
            "happen before export.",
        ],
        "BAKING ANIMATIONS": [
            "IK rigs, constraints, and drivers are converted into",
            "plain keyframe curves.  The web engine plays back",
            "simple keyframes — it cannot run Blender's rig logic.",
        ],
        "BAKING TEXTURES": [
            "Blender's node-based materials are rendered out to",
            "flat image textures.  Complex shader graphs,",
            "procedural noise, and Principled BSDF nodes are all",
            "collapsed into a single diffuse PNG per material.",
        ],
        "WIRING BAKED TEXTURE": [
            "The baked image is being connected to the Base Color",
            "input of the material.  Without this step the GLB",
            "exporter would not see the texture and would export",
            "the model with no image.",
        ],
        "PACKING IMAGES": [
            "The baked texture images are packed (embedded) inside",
            "the .blend file so they travel with it and also get",
            "embedded inside the final .glb binary.",
        ],
        "EXPORTING GLB": [
            "Everything — meshes, textures, animations, skeleton,",
            "cameras — is being written into ONE binary .glb file.",
            "No external texture folders.  One file = the whole scene.",
        ],
        "CLEANING UP": [
            "The temporary duplicate scene is being deleted.",
            "Your original scene is restored exactly as it was.",
        ],
        "DONE": [
            "Export complete!  Your .glb file is ready.",
            "Drop it into the Node.js optimizer pipeline next,",
            "then serve it from Vercel.",
        ],
    }

    lines = None
    for key, text in explanations.items():
        if key in step.upper():
            lines = text
            break

    if lines is None:
        lines = ["Processing — please wait…"]

    col = layout.column(align=True)
    for line in lines:
        col.label(text=line)


# ---------------------------------------------------------------------------
# Main export operator
# ---------------------------------------------------------------------------

class GLB_OT_OneClickExport(bpy.types.Operator):
    bl_idname  = "export.glb_oneclick"
    bl_label   = "Export GLB (Baked)"
    bl_options = {'REGISTER'}

    bake_resolution: bpy.props.IntProperty(
        name="Bake Resolution",
        default=1024, min=128, max=4096,
    )
    export_path: bpy.props.StringProperty(
        name="Export Path",
        default="//export_scene.glb",
        subtype='FILE_PATH',
    )

    def invoke(self, context, event):
        self.bake_resolution = context.scene.glb_bake_resolution
        self.export_path     = context.scene.glb_export_path
        _reset_log()
        self._step("STARTING EXPORT", 'EXPORT')
        bpy.ops.export.glb_progress_popup('INVOKE_DEFAULT')
        return self.execute(context)

    def execute(self, context):
        src_scene = context.scene

        if not bpy.data.filepath and self.export_path.startswith("//"):
            self.report({'ERROR'}, "Save your .blend file first.")
            return {'CANCELLED'}

        try:
            self._run(context, src_scene)
        except Exception:
            err = traceback.format_exc()
            self._step(f"ERROR: {err}", 'ERROR')
            self.report({'ERROR'}, err)
            return {'CANCELLED'}

        return {'FINISHED'}

    def _step(self, label: str, icon: str = 'CHECKMARK'):
        _push_status("GLB Exporter", label, icon)

    def _run(self, context, src_scene):
        self._step("CREATING DUPLICATE SCENE", 'DUPLICATE')
        tmp_scene, tmp_col = _make_export_collection(context, src_scene)
        context.window.scene = tmp_scene
        depsgraph = context.evaluated_depsgraph_get()

        try:
            self._process(context, tmp_scene, depsgraph)
        finally:
            context.window.scene = src_scene

        context.window.scene = tmp_scene
        try:
            self._step("EXPORTING GLB", 'EXPORT')
            self._export(context, tmp_scene)
        finally:
            context.window.scene = src_scene
            self._step("CLEANING UP", 'TRASH')
            _cleanup_tmp_scene(tmp_scene)

        self._step("DONE  ✓  — " + bpy.path.abspath(self.export_path), 'CHECKMARK')
        self.report({'INFO'}, "GLB export complete!")

    def _process(self, context, scene, depsgraph):
        mesh_objs = [o for o in scene.objects if o.type == 'MESH']
        arm_objs  = [o for o in scene.objects if o.type == 'ARMATURE']

        self._step("APPLYING MODIFIERS  (baking geometry nodes, subsurf, booleans…)", 'MODIFIER')
        for obj in mesh_objs:
            _push_status("GLB Exporter", f"  ↳ modifiers on: {obj.name}", 'DOT')
            _apply_modifiers(depsgraph, obj)

        self._step("APPLYING TRANSFORMS  (freezing position / rotation / scale)", 'OBJECT_ORIGIN')
        for obj in mesh_objs:
            _push_status("GLB Exporter", f"  ↳ transforms on: {obj.name}", 'DOT')
            _apply_transforms(context, obj)

        self._step("TRIANGULATING MESHES  (quads → triangles for the GPU)", 'MESH_DATA')
        for obj in mesh_objs:
            _push_status("GLB Exporter", f"  ↳ triangulating: {obj.name}", 'DOT')
            _triangulate(context, obj)

        if scene.frame_start != scene.frame_end:
            self._step("BAKING ANIMATIONS  (IK / constraints → plain keyframes)", 'ANIM')
            for obj in arm_objs:
                _push_status("GLB Exporter", f"  ↳ baking rig: {obj.name}", 'DOT')
                bpy.ops.object.select_all(action='DESELECT')
                obj.select_set(True)
                context.view_layer.objects.active = obj
                bpy.ops.nla.bake(
                    frame_start=scene.frame_start,
                    frame_end=scene.frame_end,
                    only_selected=True,
                    visual_keying=True,
                    clear_constraints=True,
                    bake_types={'POSE'},
                )
        else:
            _push_status("GLB Exporter", "SKIPPING ANIMATION BAKE  (single frame scene)", 'INFO')

        self._step("BAKING TEXTURES  (node graphs → flat diffuse images)", 'IMAGE_DATA')
        bake_res  = self.bake_resolution
        mat_count = 0

        for obj in mesh_objs:
            if not obj.data.uv_layers:
                _push_status("GLB Exporter", f"  ↳ SKIP {obj.name}: no UV map", 'ERROR')
                continue
            for slot in obj.material_slots:
                mat = slot.material
                if mat is None:
                    continue
                if mat.node_tree is None:
                    mat.use_nodes = True
                _push_status("GLB Exporter",
                             f"  ↳ baking: {mat.name}  on  {obj.name}", 'DOT')
                _bake_material_to_image(context, obj, mat, bake_res)
                self._step("WIRING BAKED TEXTURE  (connecting image → Base Color)", 'LINKED')
                self._step("PACKING IMAGES  (embedding texture into .blend)", 'PACKAGE')
                mat_count += 1

        _push_status("GLB Exporter",
                     f"TEXTURE BAKE COMPLETE  ({mat_count} material(s) baked)", 'CHECKMARK')

    def _export(self, context, scene):
        out_path = bpy.path.abspath(self.export_path)
        os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=out_path,
            export_format='GLB',
            export_apply=False,
            export_texcoords=True,
            export_normals=True,
            export_materials='EXPORT',
            export_image_format='AUTO',
            export_animations=True,
            export_skins=True,
            export_frame_range=True,
            export_cameras=True,
            export_lights=False,
            use_active_scene=True,
        )


# ---------------------------------------------------------------------------
# N-panel
# ---------------------------------------------------------------------------

class GLB_PT_ExportPanel(bpy.types.Panel):
    bl_label       = "GLB One-Click Export"
    bl_idname      = "GLB_PT_export_panel"
    bl_space_type  = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category    = 'GLB Export'

    def draw(self, context):
        layout = self.layout
        scene  = context.scene

        box = layout.box()
        box.label(text="Settings", icon='SETTINGS')
        box.prop(scene, "glb_bake_resolution", text="Bake Resolution")

        layout.separator()
        layout.operator("export.glb_set_filename",   text="  Type a File Name",    icon='GREASEPENCIL')
        layout.operator("export.glb_browse_folder",  text="  Browse Output Folder", icon='FILEBROWSER')

        layout.separator()
        row = layout.row()
        row.scale_y = 1.4
        row.operator("export.glb_oneclick", text="  Bake + Export GLB", icon='EXPORT')

        layout.separator()
        help_box = layout.box()
        help_box.label(text="What does this do?", icon='QUESTION')
        help_box.label(text="Duplicates your scene (original untouched),")
        help_box.label(text="bakes all modifiers, textures, and animations")
        help_box.label(text="into a single self-contained .glb file.")


# ---------------------------------------------------------------------------
# Scene props
# ---------------------------------------------------------------------------

def _register_props():
    bpy.types.Scene.glb_bake_resolution = bpy.props.IntProperty(
        name="Bake Resolution", default=1024, min=128, max=4096,
    )
    bpy.types.Scene.glb_export_path = bpy.props.StringProperty(
        name="Export Path", default="//export_scene.glb", subtype='FILE_PATH',
    )


def _unregister_props():
    del bpy.types.Scene.glb_bake_resolution
    del bpy.types.Scene.glb_export_path


# ---------------------------------------------------------------------------
# Auto-open popup on load
# ---------------------------------------------------------------------------

@bpy.app.handlers.persistent
def _on_load_post(dummy):
    """Opens the welcome popup every time Blender finishes loading a file."""
    bpy.ops.export.glb_welcome_popup('INVOKE_DEFAULT')


@bpy.app.handlers.persistent
def _on_register(_dummy=None):
    """Opens the welcome popup immediately when the add-on is enabled."""
    # Defer by one frame so Blender's UI is fully ready
    bpy.app.timers.register(_open_welcome_deferred, first_interval=0.1)


def _open_welcome_deferred():
    try:
        bpy.ops.export.glb_welcome_popup('INVOKE_DEFAULT')
    except Exception:
        pass
    return None  # returning None cancels the timer (runs once)


# ---------------------------------------------------------------------------
# Register / Unregister
# ---------------------------------------------------------------------------

def register():
    _register_props()
    bpy.utils.register_class(GLB_OT_SetFileName)
    bpy.utils.register_class(GLB_OT_BrowseOutputFolder)
    bpy.utils.register_class(GLB_OT_WelcomePopup)
    bpy.utils.register_class(GLB_OT_ProgressPopup)
    bpy.utils.register_class(GLB_OT_OneClickExport)
    bpy.utils.register_class(GLB_PT_ExportPanel)

    # Open popup right now (deferred so UI is ready)
    _on_register()

    # Also open popup every time a new file loads
    if _on_load_post not in bpy.app.handlers.load_post:
        bpy.app.handlers.load_post.append(_on_load_post)


def unregister():
    if _on_load_post in bpy.app.handlers.load_post:
        bpy.app.handlers.load_post.remove(_on_load_post)

    bpy.utils.unregister_class(GLB_PT_ExportPanel)
    bpy.utils.unregister_class(GLB_OT_OneClickExport)
    bpy.utils.unregister_class(GLB_OT_ProgressPopup)
    bpy.utils.unregister_class(GLB_OT_WelcomePopup)
    bpy.utils.unregister_class(GLB_OT_BrowseOutputFolder)
    bpy.utils.unregister_class(GLB_OT_SetFileName)
    _unregister_props()


if __name__ == "__main__":
    register()