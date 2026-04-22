const API = 'https://en.wikipedia.org/w/api.php';

async function wikiFetch(params) {
  const url = new URL(API);
  for (const [k, v] of Object.entries({ ...params, format: 'json', origin: '*' })) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
  return res.json();
}

function normTitle(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function pickBestHit(hits, title) {
  const target = normTitle(title);
  // Strongest signal: "<title> (YYYY film)" or "<title> (film)" where title matches
  const titleFilm = hits.find((h) => {
    const m = h.title.match(/^(.+?) \((?:\d{4} )?film\)$/i);
    return m && normTitle(m[1]) === target;
  });
  if (titleFilm) return titleFilm;
  // Any "(YYYY film)" or "(film)" suffix
  const anyFilm = hits.find((h) => /\(\d{4} film\)$|\(film\)$/i.test(h.title));
  if (anyFilm) return anyFilm;
  // Exact title match (for films with no disambiguation, e.g. "Inception")
  const exact = hits.find((h) => normTitle(h.title) === target);
  if (exact) return exact;
  // Starts-with fallback
  const starts = hits.find((h) => normTitle(h.title).startsWith(target));
  if (starts) return starts;
  return null;
}

async function searchFilmPage(title, year) {
  const queries = [
    year ? `"${title}" ${year} film` : null,
    year ? `${title} ${year} film` : null,
    `${title} film`,
  ].filter(Boolean);

  for (const q of queries) {
    const data = await wikiFetch({ action: 'query', list: 'search', srsearch: q, srlimit: 5 });
    const hits = data?.query?.search || [];
    const best = pickBestHit(hits, title);
    if (best) return best.title;
  }
  return null;
}

async function findPlotSectionIndex(pageTitle) {
  const data = await wikiFetch({ action: 'parse', page: pageTitle, prop: 'sections' });
  const sections = data?.parse?.sections || [];
  const wanted = ['plot', 'plot summary', 'synopsis', 'story'];
  const match = sections.find((s) => wanted.includes(s.line.toLowerCase().trim()));
  return match?.index ?? null;
}

function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('.mw-editsection, sup.reference, .reference, .noprint, style, script').forEach((el) => el.remove());
  const parts = [];
  doc.querySelectorAll('p, h3, h4').forEach((el) => {
    const text = el.textContent.trim();
    if (!text) return;
    if (el.tagName === 'H3' || el.tagName === 'H4') {
      parts.push(`\n${text}\n`);
    } else {
      parts.push(text);
    }
  });
  return parts.join('\n\n').trim();
}

async function getSectionText(pageTitle, sectionIndex) {
  const data = await wikiFetch({
    action: 'parse', page: pageTitle, section: sectionIndex, prop: 'text', disableeditsection: 1,
  });
  const html = data?.parse?.text?.['*'] || '';
  return htmlToText(html);
}

export async function fetchWikipediaPlot(title, year) {
  const pageTitle = await searchFilmPage(title, year);
  if (!pageTitle) return { notFound: true };

  const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`;
  const idx = await findPlotSectionIndex(pageTitle);
  if (idx == null) return { notFound: true, wikipediaTitle: pageTitle, wikipediaUrl: url };

  const plot = await getSectionText(pageTitle, idx);
  if (!plot) return { notFound: true, wikipediaTitle: pageTitle, wikipediaUrl: url };

  return { plot, wikipediaTitle: pageTitle, wikipediaUrl: url };
}
