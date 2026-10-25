# Real Muse Image review

Two live requests through the app's existing Meta client, requesting
`muse-image-1.0`. The supplied credential existed only in each subprocess's
environment. No fallback or substitute model was used.

- **V1:** realistic texture and light, but a lone empty mug and excessive unused
  space. Rejected as too much like a product photograph.
- **V2:** two mismatched cups, espresso and latte, natural light and cobalt
  linen. More inviting arrangement and better space for the event typography.
  Selected after visual review.

`v1-cover.jpg` / `v2-cover.jpg` are the unedited model outputs. Corresponding
`*-generation.json` records prompt, requested model, timing, byte count and hash.
`poster.html` is a self-contained export of the actual Poster component using v2,
including embedded fonts and artwork. `final-poster.png` is the browser screenshot.

Muse generated the photographic cover art. The app adds accurate title/time text.
This is a concept cover, not a real photograph of Pat's Cafe. Date and category
labels are example event data. These requests validate coffee covers only.
