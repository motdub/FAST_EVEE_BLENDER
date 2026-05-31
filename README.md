# FAST_EVEE_BLENDER
Addon and Render Engine to Replace Slow Evee using Game Engine Technology

HOW IT WORKS: to get the addon you NEED FOR IT TO WORK open up https://github.com/motdub/FAST_EVEE_BLENDER/tree/main/glb-engine/blender-addon
you will see a python file. that python file is a blender addon (made by me) so download it and install it in blender. the name of the addon will be 
GLB One-CLick Exporter
using the addon you can export the ENTIRE BLENDER SCENE INSTANTLY with all animations, image textures, colors, camera data, etc, all INSIDE THAT ONE TINY FILE
(supports custom names AND custom folder location) 

it also converts EVERYTHING to TRIANGLES so game engines can process this type of "baked" file faster

and take that file and render it somewhere else that is FASTER that blenders INTERNAL RENDER which is quite bad at what it does if you aren't trying to make realistic looking animations
that take FOREVER to render, instead of quick simple 2d that should NOT take as long as it currently does in blender due to the INSANE amount of processing that THERE IS ZERO OPTION TO TURN OFF WHAT ISNT NEEDED TO MAKE 2D STYLIZED 
CONTENT.

right now there are some options as to what to insert those GLB files into. 

option 1. https://github.com/donmccurdy/three-gltf-viewer aka https://gltf-viewer.donmccurdy.com/ this one is EASY TO USE and is what i used to test the addon. screen record it and its FASTER THAN BLENDER RENDER.
only issue is that it lacks more features but for what it is, its acctually a solid option. also this site will never go down because even if it does, you can download the OFFLINE DESKTOP PROGRAM VERSION that does NOT NEED A WEB BROWSER.
option 2. game engine like godot, unity, unreal engine, etc. there probably is a way to import this type of .glb that has ALL SCENE ANIMATION AND TEXTURE DATA but i havent tried that yet. also game engines
do work with massive scenes, but the learning curve is a LOT WORSE than option 1.
option 3. MY VERSION OF https://gltf-viewer.donmccurdy.com/ that im working on (it's not done yet). (i will update this when it's done, its specifically for stilized 2d looking 3d aka 3d "anime" with all the features
that EVEE either doesen't have, or is so unoptimized that the most basic of tasks take FOREVER)


🧾 License
Copyright (c) 2026 Automatic Video Cut

All rights reserved.

No part of this software may be copied, modified, distributed, or used commercially without explicit permission from the author.

