# PNG validation fixtures

Generate the three deterministic 256 × 256 RGBA inputs from the `image-to-svg`
directory:

```powershell
python scripts/generate_fixtures.py
```

The generator needs [Pillow](https://python-pillow.org/) (`python -m pip install Pillow`).
It uses 4× supersampling and one Lanczos downsample so transparent edges are
antialiased. The source drawings are original code, not embedded SVGs or
downloaded images.

| File | Coverage | Expected limitation to report honestly |
| --- | --- | --- |
| `01-transparent-solid-logo.png` | Few opaque solid colour regions on a transparent canvas. | Smooth raster edge antialiasing may not match a traced path exactly. |
| `02-thin-line-knockout-icon.png` | 3 px cyan details plus genuinely transparent lens and button holes. | Very thin lines and small holes can be simplified or lost by aggressive path fitting. |
| `03-transparent-gradient-shape.png` | Single rounded, opaque shape with a diagonal violet-to-cyan gradient. | A path tracer that has no gradient fitting will approximate the continuous transition with flat regions. |
| `04-opaque-logo.jpg` | Opaque RGB JPEG version of the simple logo. | JPEG compression can introduce near-colours; this is a format-acceptance smoke case, not a precision benchmark. |

All files have transparent pixels outside their artwork. Re-run the generator
after changing it; it overwrites only the three named PNG fixtures. Pixels are
deterministic for a given Pillow resampling implementation, although PNG bytes
can differ between Pillow versions.
