# Reagent System Frontend

Upload the files in this directory to the root of the GitHub Pages repository `MASS-reagent-system`.

The production API defaults to:

`https://reagent-api-1cqo.onrender.com`

Local `file://`, `localhost`, and `127.0.0.1` use `http://localhost:39280`.

To use a different backend URL, place this before `app.js` in `index.html`:

```html
<script>window.REAGENT_API_BASE = "https://your-api.onrender.com";</script>
```

GitHub Pages settings: **Deploy from a branch**, branch `main`, folder `/ (root)`.
