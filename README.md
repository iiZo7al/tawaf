# Tawaf

Tawaf is a camera and display pairing website for the Smart Black Stone Guard project.

## Website files

- `web/` contains the editable website source.
- `site/public/` contains the static files served by Vercel.
- `api/[...path].js` forwards the website API to the existing Cloudflare Worker.
- `cloud/worker.js` contains the Worker source for incident storage and media delivery.
- `tools/build_site.py` copies website changes into `site/public/`.

The large MediaPipe model and WebAssembly assets remain in the existing object storage and are served through the `/media/` rewrite. Incident images use the `/incidents/` rewrite.

## Updating the website

Edit files in `web/`, rebuild `site/public/` with `python tools/build_site.py`, then open a pull request. Vercel deploys changes to the production domain after the pull request is merged into `main`.
