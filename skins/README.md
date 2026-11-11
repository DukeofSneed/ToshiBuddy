# Skins

Use your own image instead of the built-in Kori. Skins stay on your PC: everything
in this folder except this file is git-ignored.

1. Make a folder here, for example `skins/my-buddy/`.
2. Put your image in it as `skin.png` (any `.png`, `.webp`, or `.gif` works; a
   transparent background looks best).
3. Optional: add `skin.json` to fine-tune it:

   ```json
   { "scale": 1.0, "offsetX": 0, "offsetY": 0, "keyColor": "#1ec0f5", "keyTolerance": 48 }
   ```

   - `scale`: size relative to Kori (1.0 = same height).
   - `offsetX`, `offsetY`: nudge the image in pet units (positive y moves it down).
   - `keyColor`: a solid background color to make transparent, as `#rrggbb`.
   - `keyTolerance`: how close a color must be to `keyColor` to be removed (0-255).
4. Right-click the pet or the tray icon, open **Skin**, and pick your folder. The jar's
   Settings section has the same picker.

A skin gets whole-body motion: walking bounce, landing squash, dangling when dragged,
leaning, napping, the desk in desk mode, and the full Frost Release around it.
Limb-level animations need the built-in Kori.
