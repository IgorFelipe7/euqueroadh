# Fonts

Two static Archivo faces, used by `next/og` when it renders the certificate images
(`/certificado/<token>/imagem` and `/story`).

They exist because **Satori cannot select a weight along a variable font's axis**, and the 400 → 800
weight jump is the event's identity (VISUAL-DIRECTION.md § 6.3, RAFFLE-AND-CERTIFICATE-SPEC.md
§ 4.4). Without them the certificate falls back to Satori's bundled face, which has no weight range,
and the recipient's name loses the one typographic relationship the document is built on.

These are a **build asset, not a dependency**: nothing imports them, `next/og` reads the bytes.
`next.config.ts` lists them in `outputFileTracingIncludes`, because a `readFile` from `process.cwd()`
is invisible to the module tracer and they would otherwise be missing from the deployed function.

The web page itself does **not** use these files — it uses `next/font/google`, which self-hosts the
variable font and keeps `font-src 'self'` honest.

## Licence

Archivo is © 2020 The Archivo Project Authors and is licensed under the **SIL Open Font License
1.1**. The full licence text is in [`OFL.txt`](./OFL.txt), beside the font files.

That file is not optional paperwork. The OFL requires the copyright notice and licence to be
distributed **with** the font software, and these `.ttf` files are redistributed twice over: in this
repository, and inside the deployed function that `outputFileTracingIncludes` ships them to. Keep
`OFL.txt` next to them — moving the fonts without it breaks the licence.

The instanced faces below are Modified Versions under § 2 of the licence. They carry no Reserved
Font Name (Archivo is published without one), so no rename is required.

## Regenerating them

The two faces are instanced from the upstream variable font, so they are reproducible rather than
copied from an unversioned CDN URL:

```sh
curl -L 'https://raw.githubusercontent.com/google/fonts/main/ofl/archivo/Archivo%5Bwdth%2Cwght%5D.ttf' \
  -o /tmp/Archivo-Variable.ttf

python - <<'PY'
from fontTools import ttLib
from fontTools.varLib import instancer

for weight, name in ((400, 'Archivo-Regular.ttf'), (800, 'Archivo-ExtraBold.ttf')):
    font = ttLib.TTFont('/tmp/Archivo-Variable.ttf')
    instancer.instantiateVariableFont(
        font, {'wght': weight, 'wdth': 100}, inplace=True, updateFontNames=True
    )
    font.save(f'assets/fonts/{name}')
PY
```

`wdth` is pinned to 100 because the certificate uses no width variation; leaving the axis in place
would carry the whole width range's outlines for nothing.
