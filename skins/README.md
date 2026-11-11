# Skins

Use your own images instead of the built-in Kori. Skins stay on your PC: everything
in this folder except this file is git-ignored.

1. Make a folder here, for example `skins/my-skin/`.
2. Put your main image in it as `skin.png` or `skin.jpg` (`.webp` and `.gif` work too).
3. Optional: add `ultimate.png` or `ultimate.jpg`. After a donation, the pet plays the
   Frost Release and switches to this image for the ultimate form (30 seconds by
   default), then switches back. Another donation during the form resets the timer.
4. Optional: add `skin.json` to fine-tune it:

   ```json
   {
     "scale": 1.15,
     "offsetX": 0,
     "offsetY": 0,
     "keyMode": "edges",
     "keyTolerance": 40,
     "ultimateSeconds": 30,
     "ultimate": { "scale": 1.3, "offsetY": 4, "keyTolerance": 48 }
   }
   ```

   - `scale`: image height relative to the pet (1.0 = 188 pet units, Kori's height).
     The image keeps its proportions; wide images extend past the sides.
   - `offsetX`, `offsetY`: nudge the image in pet units (positive y moves it down).
   - `keyMode`: background removal for images without transparency. `"edges"`
     (the default for JPGs) removes only background connected to the image border,
     so white hair or clothes inside the outline stay. `"color"` removes every pixel
     close to `keyColor`. `"none"` turns it off.
   - `keyColor`: the background color as `#rrggbb`. With `"edges"` it defaults to
     the average corner color.
   - `keyTolerance`: how close a color must be to the background to be removed
     (0-255). Raise it if a gradient background leaves a halo; lower it if parts of
     the character disappear.
   - `ultimateSeconds`: how long the ultimate form lasts (5-600).
   - `ultimate`: the same `scale`, `offsetX`, `offsetY`, `keyMode`, `keyColor`, and
     `keyTolerance` settings for the ultimate image.
5. Right-click the pet or the tray icon, open **Skin**, and pick your folder. The jar's
   Settings section has the same picker. Changes to the files apply when you re-pick
   the skin or choose **Reload mods and quips**.

A skin gets whole-body motion: walking bounce, landing squash, dangling when dragged,
leaning, napping, the desk in desk mode, and the Frost Release and ultimate aura
around it. Limb-level animations need the built-in Kori.
