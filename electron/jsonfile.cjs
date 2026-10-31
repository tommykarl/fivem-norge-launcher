// Liten hjelper for å lese/skrive JSON-filer i app-mappen, med utsatt lagring.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

function jsonFile(name, fallback) {
  const file = () => path.join(app.getPath('userData'), name);
  let data = null;
  let timer = null;

  const load = () => {
    if (data) return data;
    try {
      data = { ...structuredClone(fallback), ...JSON.parse(fs.readFileSync(file(), 'utf8')) };
    } catch {
      data = structuredClone(fallback);
    }
    return data;
  };

  const flush = () => {
    clearTimeout(timer);
    timer = null;
    if (!data) return;
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    const tmp = file() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file());
  };

  const save = (now = false) => {
    if (now) return flush();
    clearTimeout(timer);
    timer = setTimeout(flush, 1500);
  };

  app.on('before-quit', flush);
  return { get: load, save };
}

module.exports = { jsonFile };
