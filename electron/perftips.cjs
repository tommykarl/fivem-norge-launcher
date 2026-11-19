// Ytelsestips: leser GTA V sin settings.xml (bare lesing, ingenting endres) og foreslår endringer som gir
// flere FPS i FiveM. Filen ligger i Dokumenter\Rockstar Games\GTA V (også når Dokumenter er flyttet til OneDrive).
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

function candidates() {
  const home = os.homedir();
  const docs = [];
  try {
    docs.push(app.getPath('documents'));
  } catch {}
  docs.push(path.join(home, 'Documents'), path.join(home, 'OneDrive', 'Documents'), path.join(home, 'OneDrive', 'Dokumenter'), path.join(home, 'Dokumenter'));
  return [...new Set(docs)].map((d) => path.join(d, 'Rockstar Games', 'GTA V', 'settings.xml'));
}

function readValue(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}\\s+value="([^"]*)"`, 'i')) || xml.match(new RegExp(`<${tag}>([^<]{1,200})</${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

const num = (v) => (v === null ? null : Number(v));
const LEVEL = ['Normal', 'Høy', 'Veldig høy', 'Ultra'];

function analyze() {
  const file = candidates().find((f) => {
    try {
      return fs.statSync(f).isFile();
    } catch {
      return false;
    }
  });
  if (!file) return { found: false, tips: [] };
  let xml = '';
  try {
    xml = fs.readFileSync(file, 'utf8').slice(0, 200_000);
  } catch {
    return { found: false, tips: [] };
  }
  const g = (t) => num(readValue(xml, t));
  const tips = [];
  const tip = (id, impact, title, detail) => tips.push({ id, impact, title, detail });
  const msaa = g('MSAA');
  if (msaa > 0) tip('msaa', 'stor', `Slå av MSAA (nå ${msaa}x)`, 'MSAA koster mye FPS i byer med mange spillere. Bruk FXAA i stedet: Innstillinger → Grafikk → MSAA: Av, FXAA: På.');
  if (g('ReflectionMSAA') > 0) tip('rmsaa', 'middels', 'Slå av MSAA for refleksjoner', 'Grafikk → Avanserte innstillinger → Refleksjon MSAA: Av.');
  if (g('GrassQuality') >= 2) tip('grass', 'stor', `Senk gresskvalitet (nå ${LEVEL[g('GrassQuality')] || g('GrassQuality')})`, 'Gress er en av de tyngste innstillingene utendørs. Sett den til Normal eller Høy.');
  if (g('ShadowQuality') >= 3) tip('shadow', 'middels', `Senk skyggekvalitet (nå ${LEVEL[g('ShadowQuality') - 1] || g('ShadowQuality')})`, 'Høy skyggekvalitet ser nesten likt ut og gir flere FPS.');
  if (g('UltraShadows_Enabled') === 1 || readValue(xml, 'UltraShadows_Enabled') === 'true') tip('ultrashadow', 'middels', 'Slå av lange skygger med høy oppløsning', 'Grafikk → Avanserte innstillinger → Høyoppløselige skygger: Av.');
  if (g('PostFX') >= 2) tip('postfx', 'middels', 'Sett etterbehandling (Post FX) til Normal', 'Ultra og Veldig høy Post FX legger på uskarphet og bloom som koster mye.');
  if (g('MotionBlurStrength') > 0) tip('blur', 'liten', 'Slå av bevegelsesuskarphet', 'Gir et skarpere bilde og litt bedre ytelse.');
  if (g('DoF') === 1 || readValue(xml, 'DoF') === 'true') tip('dof', 'liten', 'Slå av dybdeskarphet (DoF)', 'Grafikk → Etterbehandling: Dybdeskarphet av.');
  if (g('Tessellation') >= 2) tip('tess', 'middels', 'Slå ned tessellering', 'Tessellering gir små detaljer på trær og bakke, men koster mye. Sett den til Normal eller Av.');
  if (g('SSAO') >= 1) tip('ssao', 'liten', 'Senk omgivelsesskygge (SSAO)', 'Sett den til Normal eller Av hvis du mangler FPS.');
  if (g('LodScale') > 1.01) tip('lod', 'stor', 'Senk detaljavstand («Utvidet avstandsskalering»)', 'Den øker hvor langt unna detaljer vises, og koster mye i FiveM. Sett glideren helt til venstre.');
  if (g('CityDensity') > 0.8 || g('PedVarietyMultiplier') > 0.8 || g('VehicleVarietyMultiplier') > 0.8) tip('density', 'liten', 'Senk befolknings- og variasjonstetthet', 'På de fleste FiveM-servere bestemmer serveren trafikken uansett. Lavere variasjon sparer minne.');
  if (g('VSync') >= 1) tip('vsync', 'middels', 'Slå av VSync', 'VSync kan halvere FPS når du ligger under skjermens oppdateringsfrekvens. Bruk heller en FPS-grense i skjermkortets innstillinger.');
  if (g('Windowed') === 1) tip('window', 'liten', 'Bruk fullskjerm', 'Vindusmodus gir ofte litt lavere FPS og mer forsinkelse enn fullskjerm.');
  if (g('TextureQuality') >= 2) tip('tex', 'liten', 'Senk teksturkvalitet hvis du har lite skjermkortminne', 'Veldig høy krever mye VRAM. Har skjermkortet ditt 4 GB eller mindre, bruk Normal eller Høy.');
  const order = { stor: 0, middels: 1, liten: 2 };
  tips.sort((a, b) => order[a.impact] - order[b.impact]);
  const res = readValue(xml, 'ScreenWidth') && readValue(xml, 'ScreenHeight') ? `${readValue(xml, 'ScreenWidth')}×${readValue(xml, 'ScreenHeight')}` : null;
  return { found: true, file, gpu: readValue(xml, 'VideoCardDescription'), resolution: res, tips };
}

module.exports = { analyze };
