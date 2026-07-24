// Plain static file server for production (Azure App Service).
//
// Azure's default Node hosting for a repo with no explicit server serves
// static files in "single-page-app" mode: it strips .html extensions and
// falls back to index.html for any path it doesn't recognize as a route.
// That silently swallows every page except index.html (report.html,
// pointage.html) since this is a genuine multi-page static site, not a SPA.
// Running a real server here makes every file reachable at its real path,
// with no fallback and no extension rewriting.
const express = require('express');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static(__dirname));

app.use((req, res) => {
    res.status(404).send('Not found');
});

app.listen(PORT, () => {
    console.log(`front-pointeuse static server listening on port ${PORT}`);
});
