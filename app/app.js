(() => {
'use strict';

const FORMAT = 'modernslides';
const VERSION = 2;
const PUBLISH_LOGIN_URL = './api/login.php';
const PUBLISH_URL = './api/publish.php';
const STAGE_W = 1600;
const STAGE_H = 900;
const STORAGE_CURRENT = 'modernslides.v2.current';
const STORAGE_PREVIOUS = 'modernslides.v2.previous';
const STORAGE_CURRENT_NAME = 'modernslides.v2.currentName';
const STORAGE_PREVIOUS_NAME = 'modernslides.v2.previousName';
const STORAGE_SLIDE = 'modernslides.v2.slideId';
const MAX_HISTORY = 60;
const THEME_IDS = [
  ['tufte', "Tufte"],
  ['bauhaus', "Bauhaus"],
  ['editorial', "Editorial"],
  ['oxford', "Oxford"],
  ['bringhurst', "Bringhurst"],
  ['calgary', "Calgary"],
  ['swiss-modern', "Swiss Modern"],
  ['modern-dark', "Modern Dark"],
  ['gradient', "Gradient"],
  ['japan-minimal', "Japan Minimal"],
  ['david-carson', "David Carson"],
  ['raygun', "Ray Gun"],
  ['baron', "Baron"],
  ['wochenzeitung', "Wochenzeitung"],
  ['magazine', "Magazine"],
  ['pavilion', "Pavilion"],
  ['westvaco', "Westvaco"],
  ['unigrid', "Unigrid"],
  ['penguin', "Penguin"],
  ['isotype', "Isotype"],
  ['sandberg', "Sandberg"],
  ['huber', "Huber"],
  ['fili', "Fili"],
  ['saville', "Saville"],
  ['glaser', "Glaser"],
  ['pintori', "Pintori"],
  ['sutnar', "Sutnar"],
  ['aicher', "Aicher"],
  ['corbusier', "Corbusier"],
  ['rand', "Rand"],
  ['cooper', "Cooper"],
  ['greiman', "Greiman"],
  ['tanaka', "Ikko Tanaka"],
  ['scher', "Paula Scher"],
  ['boom', "Irma Boom"],
  ['born', "Julia Born"],
  ['na-kim', "Na Kim"],
  ['lubalin', "Lubalin"],
  ['feitler', "Feitler"],
  ['hochuli', "Hochuli"],
  ['van-toorn', "van Toorn"],
  ['monguzzi', "Monguzzi"],
  ['fletcher', "Fletcher"],
  ['kalman', "Kalman"],
  ['mevis', "MVD"],
  ['sulki-min', "Sulki"],
  ['mutiti', "Mutiti"]
];
const LAYOUTS = new Set(['auto', 'top', 'center', 'statement', 'data', 'full']);
const BLOCK_TYPES = new Set(['title', 'text', 'list', 'quote', 'image', 'break', 'rule', 'website', 'code', 'columns', 'table']);
const DIRECTIVES = new Set(['title','header','bigtext','text','smalltext','tinytext','quote','image','break','rule','website','code','aside','background','columns','table']);
const TOP_LEVEL_FIELDS = new Set(['header','aside','background']);

const DECK_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://modernslides.local/schema/v2.json',
  title: 'ModernSlides deck',
  type: 'object',
  additionalProperties: false,
  required: ['format','version','meta','slides'],
  properties: {
    format: {const:'modernslides'},
    version: {const:2},
    meta: {
      type:'object', additionalProperties:false, required:['title','theme','pageNumbers'],
      properties:{
        title:{type:'string'}, theme:{type:'string'}, author:{type:'string'}, date:{type:'string'},
        footer:{type:'string'}, pageNumbers:{type:'boolean'}, logo:{type:['string','null']}
      }
    },
    assets:{type:'object', additionalProperties:{$ref:'#/$defs/asset'}},
    slides:{type:'array', minItems:1, items:{$ref:'#/$defs/slide'}}
  },
  $defs:{
    asset:{type:'object',additionalProperties:false,required:['data'],properties:{name:{type:'string'},type:{type:'string'},data:{type:'string'}}},
    slide:{
      type:'object',additionalProperties:false,required:['id','hidden','layout','blocks'],
      properties:{
        id:{type:'string'},hidden:{type:'boolean'},layout:{enum:['auto','top','center','statement','data','full']},
        background:{anyOf:[{type:'null'},{type:'object',additionalProperties:false,required:['src','mode'],properties:{src:{type:'string'},mode:{enum:['tint','full']}}}]},
        header:{type:'string'},aside:{type:'string'},speaker:{type:'string'},print:{type:'string'},steps:{type:'integer',minimum:0},
        blocks:{type:'array',items:{$ref:'#/$defs/block'}}
      }
    },
    block:{
      type:'object',required:['type'],properties:{
        type:{enum:['title','text','list','quote','image','break','rule','website','code','columns','table']},
        id:{type:'string'},step:{type:'integer',minimum:0},until:{type:'integer',minimum:0},align:{enum:['left','center','right']},
        start:{type:'integer',minimum:1},progressive:{type:'boolean'},columnAlign:{type:'array',items:{enum:['l','c','r']}}
      }
    }
  }
};

function collectUnknownKeys(object, allowed, path, errors) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) { errors.push(`${path} must be an object.`); return; }
  Object.keys(object).forEach(key => { if (!allowed.has(key)) errors.push(`${path}.${key} is not a recognized key.`); });
}
function validateBlockInput(block, path, errors) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) { errors.push(`${path} must be a block object.`); return; }
  const common = ['type','id','step','until','align'];
  const specific = {
    title:['content'], text:['size','content'], list:['ordered','size','start','progressive','items'], quote:['content','source'],
    image:['src','caption','width','fit','focus'], break:['lines'], rule:[], website:['src','poster'],
    code:['lang','content'], columns:['widths','valign','columns'], table:['widths','headerRows','headerCols','columnAlign','rows']
  };
  if (!BLOCK_TYPES.has(block.type)) { errors.push(`${path}.type is unsupported.`); return; }
  collectUnknownKeys(block, new Set([...common, ...(specific[block.type] || [])]), path, errors);
  if (block.type === 'columns') {
    if (!Array.isArray(block.columns)) errors.push(`${path}.columns must be an array.`);
    else block.columns.forEach((column, index) => {
      collectUnknownKeys(column, new Set(['blocks']), `${path}.columns[${index}]`, errors);
      if (!Array.isArray(column?.blocks)) errors.push(`${path}.columns[${index}].blocks must be an array.`);
      else column.blocks.forEach((child, childIndex) => validateBlockInput(child, `${path}.columns[${index}].blocks[${childIndex}]`, errors));
    });
  }
  if (block.type === 'list' && Array.isArray(block.items)) {
    block.items.forEach((item,index) => collectUnknownKeys(item, new Set(['content','step','until','number']), `${path}.items[${index}]`, errors));
  }
  if (block.type === 'table' && Array.isArray(block.rows)) {
    block.rows.forEach((row,rowIndex) => {
      if (!Array.isArray(row)) errors.push(`${path}.rows[${rowIndex}] must be an array.`);
      else row.forEach((cell,colIndex) => {
        if (typeof cell === 'string') return;
        if (cell && typeof cell === 'object' && Array.isArray(cell.blocks)) {
          collectUnknownKeys(cell, new Set(['blocks']), `${path}.rows[${rowIndex}][${colIndex}]`, errors);
          cell.blocks.forEach((child,childIndex) => validateBlockInput(child, `${path}.rows[${rowIndex}][${colIndex}].blocks[${childIndex}]`, errors));
        } else errors.push(`${path}.rows[${rowIndex}][${colIndex}] must be a string or {blocks:[...]}.`);
      });
    });
  }
}
function validateDeckInput(deck) {
  const errors = [];
  collectUnknownKeys(deck, new Set(['format','version','meta','assets','slides']), 'deck', errors);
  if (deck?.format !== FORMAT) errors.push(`deck.format must be "${FORMAT}".`);
  if (Number(deck?.version) !== VERSION) errors.push(`deck.version must be ${VERSION}.`);
  collectUnknownKeys(deck?.meta, new Set(['title','theme','author','date','footer','pageNumbers','logo']), 'deck.meta', errors);
  if (deck?.assets != null && (typeof deck.assets !== 'object' || Array.isArray(deck.assets))) errors.push('deck.assets must be an object.');
  else Object.entries(deck?.assets || {}).forEach(([id,asset]) => collectUnknownKeys(asset, new Set(['name','type','data']), `deck.assets.${id}`, errors));
  if (!Array.isArray(deck?.slides) || !deck.slides.length) errors.push('deck.slides must be a non-empty array.');
  else deck.slides.forEach((slide,index) => {
    const path = `deck.slides[${index}]`;
    collectUnknownKeys(slide, new Set(['id','hidden','layout','background','header','aside','speaker','print','steps','blocks']), path, errors);
    if (slide?.background != null) collectUnknownKeys(slide.background, new Set(['src','mode']), `${path}.background`, errors);
    if (!Array.isArray(slide?.blocks)) errors.push(`${path}.blocks must be an array.`);
    else slide.blocks.forEach((block,blockIndex) => validateBlockInput(block, `${path}.blocks[${blockIndex}]`, errors));
  });
  if (errors.length) throw new Error(`Invalid ModernSlides JSON:\n${errors.slice(0,20).join('\n')}`);
  return true;
}

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const deepClone = value => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const cleanText = value => String(value ?? '').replace(/\r\n?/g, '\n');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const escapeAttr = escapeHtml;
function storageGet(key) { try { return globalThis['localStorage']?.getItem(key) ?? null; } catch { return null; } }
function storageSet(key, value) { try { globalThis['localStorage']?.setItem(key, String(value)); return true; } catch { return false; } }
function storageRemove(key) { try { globalThis['localStorage']?.removeItem(key); } catch {} }
const DECK_DB_NAME = 'modernslides-v2';
const DECK_DB_STORE = 'decks';
let deckDbPromise = null;
function openDeckDb() {
  if (!('indexedDB' in globalThis)) return Promise.resolve(null);
  if (deckDbPromise) return deckDbPromise;
  deckDbPromise = new Promise(resolve => {
    try {
      const request = indexedDB.open(DECK_DB_NAME, 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(DECK_DB_STORE)) request.result.createObjectStore(DECK_DB_STORE); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return deckDbPromise;
}
async function deckStoreGet(key) {
  const db = await openDeckDb();
  if (db) {
    const value = await new Promise(resolve => {
      try { const req = db.transaction(DECK_DB_STORE, 'readonly').objectStore(DECK_DB_STORE).get(key); req.onsuccess=()=>resolve(req.result ?? null); req.onerror=()=>resolve(null); }
      catch { resolve(null); }
    });
    if (value != null) return value;
  }
  return storageGet(key);
}
async function deckStoreSet(key, value) {
  const text = String(value);
  const db = await openDeckDb();
  if (db) {
    const ok = await new Promise(resolve => {
      try { const tx=db.transaction(DECK_DB_STORE,'readwrite'); tx.objectStore(DECK_DB_STORE).put(text,key); tx.oncomplete=()=>resolve(true); tx.onerror=tx.onabort=()=>resolve(false); }
      catch { resolve(false); }
    });
    if (ok) { storageRemove(key); return true; }
  }
  return storageSet(key, text);
}
async function deckStoreRemove(key) {
  const db = await openDeckDb();
  if (db) await new Promise(resolve => { try { const tx=db.transaction(DECK_DB_STORE,'readwrite'); tx.objectStore(DECK_DB_STORE).delete(key); tx.oncomplete=tx.onerror=tx.onabort=()=>resolve(); } catch { resolve(); } });
  storageRemove(key);
}
async function refreshRestoreAvailability() { $('restore-deck').disabled = !(await deckStoreGet(STORAGE_PREVIOUS)); }
const debounce = (fn, delay) => {
  let timer = 0;
  const wrapped = (...args) => { clearTimeout(timer); timer = window.setTimeout(() => fn(...args), delay); };
  wrapped.flush = (...args) => { clearTimeout(timer); timer = 0; return fn(...args); };
  wrapped.cancel = () => { clearTimeout(timer); timer = 0; };
  return wrapped;
};

function uid(prefix = 'slide') {
  if (crypto?.randomUUID) return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function slugify(value, fallback = 'slide') {
  const slug = String(value ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  return slug || fallback;
}
function nextSlideId(deck) {
  let max = 0;
  for (const slide of deck?.slides || []) {
    const match = String(slide?.id || '').match(/^slide(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `slide${max + 1}`;
}
function defaultMeta(title = 'New Presentation') {
  return { title, theme: 'bauhaus', author: '', date: '', footer: '', pageNumbers: true, logo: null };
}
function freshSlide(title = 'New slide', id = '') {
  return {
    id,
    hidden: false,
    layout: 'auto',
    background: null,
    header: '',
    aside: '',
    speaker: '',
    print: '',
    steps: 0,
    blocks: [
      { type: 'title', content: title },
      { type: 'text', size: 'normal', content: 'Edit this content.' }
    ]
  };
}

function freshDeck(title = 'New Presentation') {
  return {
    format: FORMAT,
    version: VERSION,
    meta: defaultMeta(title),
    assets: {},
    slides: [freshSlide(title, 'slide1')]
  };
}

const state = {
  deck: null,
  baseUrl: new URL('.', location.href).href,
  filename: 'presentation.json',
  currentSlideId: null,
  currentStep: 0,
  editMode: false,
  editorLoading: false,
  editorWarnings: [],
  undoStack: [],
  redoStack: [],
  renderRevision: 0,
  lastRenderedRevision: 0,
  renderPromise: Promise.resolve(),
  rendering: false,
  pendingRenderAll: true,
  pendingSlideIds: new Set(),
  speakerWindow: null,
  speakerTimer: null,
  speakerStartedAt: 0,
  activeNotesTab: 'speaker',
  printPrepared: false,
  dragSlideId: null,
  dirty: false,
  lastAutosaveOk: true,
  autosaveChain: Promise.resolve(),
  fileHandle: null,
  publishAuthenticated: false
};

function normalizeBlock(block) {
  if (!block || typeof block !== 'object') return { type: 'text', size: 'normal', content: '' };
  const out = deepClone(block);
  if (!BLOCK_TYPES.has(out.type)) out.type = 'text';
  const legacyTableColumnAlign = out.type === 'table' && Array.isArray(out.align) ? out.align.slice() : null;
  out.step = Math.max(0, Math.trunc(Number(out.step) || 0));
  if (out.until != null) out.until = Math.max(out.step || 0, Math.trunc(Number(out.until) || 0));
  if (out.align != null && typeof out.align !== 'string') delete out.align;
  if (out.align && !['left','center','right'].includes(out.align)) delete out.align;
  switch (out.type) {
    case 'title': out.content = String(out.content ?? ''); break;
    case 'text':
      out.content = String(out.content ?? '');
      if (!(typeof out.size === 'number' || ['big','normal','small','tiny'].includes(out.size))) out.size = 'normal';
      if (typeof out.size === 'number') out.size = Math.max(.2, Math.min(5, out.size));
      break;
    case 'list':
      out.ordered = !!out.ordered;
      out.start = Math.max(1, Math.trunc(Number(out.start) || 1));
      out.progressive = !!out.progressive;
      out.size = typeof out.size === 'number' ? Math.max(.2, Math.min(5, out.size)) : (['big','normal','small','tiny'].includes(out.size) ? out.size : 'normal');
      out.items = Array.isArray(out.items) ? out.items.map((item, index) => {
        const itemStep = item?.step != null ? Math.max(0, Math.trunc(Number(item.step) || 0)) : null;
        const normalized = {content: String(item?.content ?? '')};
        if (itemStep != null) normalized.step = itemStep;
        if (item?.until != null) normalized.until = Math.max(itemStep || 0, Math.trunc(Number(item.until) || 0));
        if (out.ordered) normalized.number = Math.max(1, Math.trunc(Number(item?.number) || (out.start + index)));
        return normalized;
      }) : [];
      break;
    case 'quote': out.content = String(out.content ?? ''); out.source = String(out.source ?? ''); break;
    case 'image':
      out.src = String(out.src ?? ''); out.caption = String(out.caption ?? '');
      out.width = String(out.width ?? '100%'); out.fit = ['contain','cover'].includes(out.fit) ? out.fit : 'contain';
      out.focus = String(out.focus ?? 'center');
      break;
    case 'break': out.lines = Math.max(0, Number(out.lines) || 1); break;
    case 'website': out.src = String(out.src ?? ''); out.poster = String(out.poster ?? ''); break;
    case 'code': out.lang = String(out.lang ?? ''); out.content = String(out.content ?? ''); break;
    case 'columns':
      out.widths = Array.isArray(out.widths) && out.widths.length ? out.widths.map(n => Math.max(.01, Number(n) || 1)) : [];
      out.valign = ['top','center','bottom'].includes(out.valign) ? out.valign : 'center';
      out.columns = Array.isArray(out.columns) ? out.columns.map(col => ({ blocks: Array.isArray(col?.blocks) ? col.blocks.map(normalizeBlock) : [] })) : [];
      break;
    case 'table':
      out.widths = Array.isArray(out.widths) ? out.widths.map(n => Math.max(.01, Number(n) || 1)) : [];
      out.headerRows = Math.max(0, Math.trunc(Number(out.headerRows) || 0));
      out.headerCols = Math.max(0, Math.trunc(Number(out.headerCols) || 0));
      out.columnAlign = (Array.isArray(out.columnAlign) ? out.columnAlign : (legacyTableColumnAlign || [])).map(a => ['l','c','r'].includes(String(a).toLowerCase()) ? String(a).toLowerCase() : 'l');
      out.rows = Array.isArray(out.rows) ? out.rows.map(row => Array.isArray(row) ? row.map(cell => (cell && typeof cell === 'object' && Array.isArray(cell.blocks)) ? {blocks:cell.blocks.map(normalizeBlock)} : String(cell ?? '')) : []) : [];
      break;
  }
  return out;
}
function maxStepInBlocks(blocks) {
  let max = 0;
  const walk = list => list.forEach(block => {
    max = Math.max(max, Number(block.step) || 0, Number(block.until) || 0);
    if (block.type === 'list') block.items.forEach(item => { max = Math.max(max, Number(item.step) || 0, Number(item.until) || 0); });
    if (block.type === 'columns') block.columns.forEach(col => walk(col.blocks));
    if (block.type === 'table') block.rows.forEach(row => row.forEach(cell => { if (cell && typeof cell === 'object' && Array.isArray(cell.blocks)) walk(cell.blocks); }));
  });
  walk(blocks || []);
  return max;
}
function normalizeDeck(input) {
  if (!input || typeof input !== 'object') throw new Error('Deck is not an object.');
  const deck = {
    format: FORMAT,
    version: VERSION,
    meta: {...defaultMeta(), ...(input.meta || {})},
    assets: input.assets && typeof input.assets === 'object' ? deepClone(input.assets) : {},
    slides: Array.isArray(input.slides) ? input.slides.map(slide => ({
      id: slide?.id == null ? '' : String(slide.id).trim(),
      hidden: !!slide?.hidden,
      layout: LAYOUTS.has(slide?.layout) ? slide.layout : 'auto',
      background: slide?.background?.src ? {src:String(slide.background.src), mode: slide.background.mode === 'full' ? 'full' : 'tint'} : null,
      header: String(slide?.header ?? ''),
      aside: String(slide?.aside ?? ''),
      speaker: String(slide?.speaker ?? ''),
      print: String(slide?.print ?? ''),
      steps: 0,
      blocks: Array.isArray(slide?.blocks) ? slide.blocks.map(normalizeBlock) : []
    })) : []
  };
  if (!deck.slides.length) deck.slides.push(freshSlide('New slide', 'slide1'));
  deck.meta.title = String(deck.meta.title || 'Untitled Presentation');
  deck.meta.theme = THEME_IDS.some(([id]) => id === deck.meta.theme) ? deck.meta.theme : 'tufte';
  deck.meta.author = String(deck.meta.author ?? '');
  deck.meta.date = String(deck.meta.date ?? '');
  deck.meta.footer = String(deck.meta.footer ?? '');
  deck.meta.pageNumbers = deck.meta.pageNumbers !== false;
  deck.meta.logo = deck.meta.logo ? String(deck.meta.logo) : null;
  const used = new Set();

  /* First reserve every valid ID that already exists.
   Existing IDs therefore never change merely because slides move. */
  deck.slides.forEach(slide => {
    const requested = String(slide.id || '').trim();
    if (!requested) {
      slide.id = '';
      return;
    }

    const id = slugify(requested, '');
    if (!id || used.has(id)) {
      slide.id = '';
      return;
    }

    slide.id = id;
    used.add(id);
  });

  /* Slides without IDs get slide1, slide2, ... in their FIRST loaded order. */
  let defaultNumber = 1;
  deck.slides.forEach(slide => {
    if (!slide.id) {
      while (used.has(`slide${defaultNumber}`)) defaultNumber++;
      slide.id = `slide${defaultNumber}`;
      used.add(slide.id);
      defaultNumber++;
    }

    slide.steps = maxStepInBlocks(slide.blocks);
  });
  return deck;
}

function currentSlide() { return state.deck?.slides.find(slide => slide.id === state.currentSlideId) || state.deck?.slides[0] || null; }
function currentSlideIndex() { return Math.max(0, state.deck.slides.findIndex(slide => slide.id === state.currentSlideId)); }
function visibleSlides() { return state.deck.slides.filter(slide => !slide.hidden); }
function visibleIndexOf(id) { return visibleSlides().findIndex(slide => slide.id === id); }
function nearestVisibleId(fromIndex = currentSlideIndex()) {
  const slides = state.deck.slides;
  for (let distance = 0; distance < slides.length; distance++) {
    const right = fromIndex + distance;
    if (right < slides.length && !slides[right].hidden) return slides[right].id;
    const left = fromIndex - distance;
    if (left >= 0 && !slides[left].hidden) return slides[left].id;
  }
  return slides[0]?.id || null;
}

function setStatus(text, kind = 'saved') {
  $('save-status').textContent = text;
  $('save-status').style.color = kind === 'error' ? 'var(--ui-danger)' : kind === 'working' ? '#735c00' : 'var(--ui-success)';
}
function showWarnings(warnings = []) {
  state.editorWarnings = warnings;
  $('warning-status').textContent = warnings.slice(0, 3).join(' • ');
  $('warning-status').title = warnings.join('\n');
}
function markDirty() { state.dirty = true; setStatus('Editing…', 'working'); }

function snapshot() {
  return { deck: deepClone(state.deck), currentSlideId: state.currentSlideId, currentStep: state.currentStep, filename: state.filename, baseUrl: state.baseUrl };
}
function pushUndo() {
  state.undoStack.push(snapshot());
  if (state.undoStack.length > MAX_HISTORY) state.undoStack.shift();
  state.redoStack = [];
  updateHistoryButtons();
}
function restoreSnapshot(snap) {
  state.deck = normalizeDeck(snap.deck);
  state.currentSlideId = state.deck.slides.some(s => s.id === snap.currentSlideId) ? snap.currentSlideId : state.deck.slides[0].id;
  state.currentStep = Math.max(0, snap.currentStep || 0);
  state.filename = snap.filename || state.filename;
  state.baseUrl = snap.baseUrl || state.baseUrl;
  state.dirty = false;
  loadEditorsFromCurrent();
  scheduleRender('history');
  autosave();
}
function undo() {
  commitEditor({record:false});
  const snap = state.undoStack.pop();
  if (!snap) return;
  state.redoStack.push(snapshot());
  restoreSnapshot(snap);
  updateHistoryButtons();
}
function redo() {
  commitEditor({record:false});
  const snap = state.redoStack.pop();
  if (!snap) return;
  state.undoStack.push(snapshot());
  restoreSnapshot(snap);
  updateHistoryButtons();
}
function updateHistoryButtons() { $('undo').disabled = !state.undoStack.length; $('redo').disabled = !state.redoStack.length; }

function autosave() {
  if (!state.deck) return;
  const payload = JSON.stringify(state.deck);
  storageSet(STORAGE_CURRENT_NAME, state.filename || 'presentation.json');
  storageSet(STORAGE_SLIDE, state.currentSlideId || '');
  setStatus('Saving locally…', 'working');
  state.autosaveChain = state.autosaveChain.then(() => deckStoreSet(STORAGE_CURRENT, payload)).then(ok => {
    state.lastAutosaveOk = !!ok;
    setStatus(ok ? 'Saved locally' : 'Local save unavailable — use Save', ok ? 'saved' : 'error');
    refreshRestoreAvailability();
    return ok;
  });
}
async function preserveCurrentAsPrevious() {
  if (!state.deck) return;
  await deckStoreSet(STORAGE_PREVIOUS, JSON.stringify(state.deck));
  storageSet(STORAGE_PREVIOUS_NAME, state.filename || storageGet(STORAGE_CURRENT_NAME) || 'previous.json');
  refreshRestoreAvailability();
}

/* ---------- Text grammar ---------- */
function maskMathSegments(text) {
  const tokens = [];
  const source = String(text ?? '');
  const pattern = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|(?<!\\)\$(?!\s)(?:\\.|[^$\n])+?(?<!\\)\$(?!\d))/g;
  const masked = source.replace(pattern, value => {
    const token = `\uE100${tokens.length}\uE101`;
    tokens.push(value);
    return token;
  });
  return {masked, tokens};
}
function restoreMathSegments(text, tokens, transform = value => value) {
  let out = String(text ?? '');
  tokens.forEach((value, index) => { out = out.split(`\uE100${index}\uE101`).join(transform(value)); });
  return out;
}
function splitOutsideMath(text, separator = '|') {
  const {masked, tokens} = maskMathSegments(text);
  const parts = [];
  let buffer = '';
  for (let i = 0; i < masked.length; i++) {
    const ch = masked[i];
    if (ch === '\\' && masked[i + 1] === separator) {
      buffer += separator;
      i++;
      continue;
    }
    if (ch === separator) {
      parts.push(restoreMathSegments(buffer, tokens));
      buffer = '';
    } else {
      buffer += ch;
    }
  }
  parts.push(restoreMathSegments(buffer, tokens));
  return parts;
}
function escapePipesOutsideMath(text) {
  const {masked, tokens} = maskMathSegments(text);
  return restoreMathSegments(masked.replace(/\|/g, '\\|'), tokens);
}
function parseArgString(raw = '') {
  const args = {};
  const positional = [];
  const source = String(raw || '').trim();
  if (!source) return {args, positional, raw: ''};
  source.split(/\s*;\s*/).filter(Boolean).forEach(chunk => {
    const eq = chunk.indexOf('=');
    if (eq > 0 && /^[A-Za-z][A-Za-z0-9_-]*\s*=/.test(chunk)) {
      args[chunk.slice(0, eq).trim().toLowerCase()] = chunk.slice(eq + 1).trim();
    } else {
      positional.push(chunk.trim());
    }
  });
  return {args, positional, raw: source};
}
function parseStepValue(value, fallback = 0) {
  if (value == null || value === '') return {step: fallback};
  const match = String(value).trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
  if (!match) return {step: fallback};
  const step = Math.max(0, Number(match[1]));
  const until = match[2] == null ? undefined : Math.max(step, Number(match[2]));
  return until == null ? {step} : {step, until};
}
function commonBlockProps(parsedArgs, currentStep) {
  const props = parseStepValue(parsedArgs.args.step, currentStep);
  const align = String(parsedArgs.args.align || '').toLowerCase();
  if (['left','center','right','l','c','r'].includes(align)) props.align = ({l:'left',c:'center',r:'right'}[align] || align);
  return props;
}
function matchDirective(line) {
  if (/^\s*\\[A-Za-z][A-Za-z0-9]*\s*:/.test(line)) return null;
  const match = line.match(/^\s*([A-Za-z][A-Za-z0-9]*)(?:\((.*?)\))?\s*:\s*(.*)$/);
  if (!match) return null;
  const name = match[1].toLowerCase();
  if (!DIRECTIVES.has(name)) return null;
  return {name, argsRaw: match[2] || '', value: match[3] || ''};
}
function looksDirectiveLike(line) {
  if (/^\s*\\/.test(String(line ?? ''))) return false;
  return /^\s*[A-Za-z][A-Za-z0-9]*(?:\([^)]*\))?\s*:/.test(String(line ?? ''));
}
function directiveLikeName(line) {
  return String(line ?? '').match(/^\s*([A-Za-z][A-Za-z0-9]*)/)?.[1] || '';
}
function matchStepStartLine(line) {
  const match = String(line ?? '').trim().match(/^\[Step\s+(\d+)\]$/i);
  return match ? Math.max(1, Number(match[1]) || 1) : null;
}
function matchStepEndLine(line) {
  const match = String(line ?? '').trim().match(/^\[End\s+Step\s+(\d+)\]$/i);
  return match ? Math.max(1, Number(match[1]) || 1) : null;
}
function isStepMarkerLine(line) { return matchStepStartLine(line) != null || matchStepEndLine(line) != null; }
function literalizeLine(line) {
  return String(line ?? '').replace(/^(\s*)\\(?=\\?(?:[A-Za-z][A-Za-z0-9]*\s*:|End\s*$|---\s*$|\[(?:End\s+)?Step\s+\d+\]\s*$))/, '$1');
}
function escapeStructuralLine(line) {
  const source = String(line ?? '');
  const unescaped = source.replace(/^(\s*)\\/, '$1');
  if (/^\s*(?:End|---)\s*$/.test(unescaped) || isStepMarkerLine(unescaped) || matchDirective(unescaped) || looksDirectiveLike(unescaped)) return source.replace(/^(\s*)/, '$1\\');
  return source;
}
function escapeDirectiveValue(value) {
  const lines = String(value ?? '').split('\n');
  return lines.map((line, index) => index === 0 ? line : escapeStructuralLine(line)).join('\n');
}
function dedentText(value) {
  const lines = cleanText(value).replace(/^\n+|\n+$/g, '').split('\n');
  const nonblank = lines.filter(line => line.trim());
  if (!nonblank.length) return '';
  const depth = Math.min(...nonblank.map(line => (line.match(/^[ \t]*/) || [''])[0].replace(/\t/g, '  ').length));
  return lines.map(line => {
    let remaining = depth, index = 0;
    while (index < line.length && remaining > 0 && /[ \t]/.test(line[index])) { remaining -= line[index] === '\t' ? 2 : 1; index++; }
    return line.slice(index);
  }).join('\n');
}
function isControlLine(line) {
  const value = String(line ?? '').trim();
  return value === 'End' || value === '---' || isStepMarkerLine(value);
}
function gatherDirectiveValue(ctx, firstValue) {
  const parts = [firstValue];
  while (ctx.index < ctx.lines.length) {
    const line = ctx.lines[ctx.index];
    if (isControlLine(line) || matchDirective(line) || looksDirectiveLike(line)) break;
    parts.push(literalizeLine(line));
    ctx.index++;
  }
  return parts.join('\n').replace(/^\n+|\n+$/g, '');
}
function extractLegacyLineAlign(content, suppliedAlign = null) {
  const source = String(content ?? '');
  const match = source.match(/^\s*(<<<|\|\|\||>>>)\s+([\s\S]*)$/);
  if (!match) return {content: source, align: suppliedAlign || undefined};
  return {content: match[2], align: suppliedAlign || ({'<<<':'left','|||':'center','>>>':'right'}[match[1]])};
}
function sizeFromDirective(name, positional = '') {
  if (name === 'bigtext') return 'big';
  if (name === 'smalltext') return 'small';
  if (name === 'tinytext') return 'tiny';
  if (name === 'text' && positional) {
    const number = Number(positional);
    if (Number.isFinite(number)) return Math.max(.2, Math.min(5, number));
  }
  return 'normal';
}
function indentWidth(line) { return (String(line ?? '').match(/^[ \t]*/) || [''])[0].replace(/\t/g, '  ').length; }
function parseListLine(line) {
  const match = String(line ?? '').match(/^(\s*)(?:(\d{1,3})\.|([-*+]))\s+(.+)$/);
  if (!match) return null;
  let content = match[4];
  let itemStep = null, itemUntil = null;
  const stepMeta = content.match(/^\[step=(\d+)(?:\s*-\s*(\d+))?\]\s+(.*)$/i);
  if (stepMeta) {
    itemStep = Math.max(0, Number(stepMeta[1]));
    itemUntil = stepMeta[2] == null ? null : Math.max(itemStep, Number(stepMeta[2]));
    content = stepMeta[3];
  }
  return {ordered:!!match[2], number:match[2] ? Number(match[2]) : null, marker:match[2] ? `${match[2]}.` : match[3], indent:indentWidth(match[1]), content, itemStep, itemUntil};
}
function makeTextBlocks(raw, size, ctx, props = {}) {
  const lines = cleanText(raw).split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    while (i < lines.length && !lines[i].trim()) i++;
    if (i >= lines.length) break;
    const listMatch = parseListLine(lines[i]);
    if (listMatch) {
      const ordered = listMatch.ordered;
      const start = ordered ? listMatch.number : 1;
      const items = [];
      const requestedProgressiveStart = Number(props.progressiveStart);
      const progressiveStart = props.progressive ? (Number.isFinite(requestedProgressiveStart) && requestedProgressiveStart > 0 ? Math.trunc(requestedProgressiveStart) : Math.max(1, props.step || ctx.step || 1)) : 0;
      while (i < lines.length) {
        const match = parseListLine(lines[i]);
        if (!match || match.ordered !== ordered) break;
        const item = {content: match.content};
        if (ordered) item.number = match.number;
        if (match.itemStep != null) {
          item.step = match.itemStep;
          if (match.itemUntil != null) item.until = match.itemUntil;
        } else if (props.progressive) {
          item.step = progressiveStart + items.length;
        }
        const baseIndent = match.indent;
        i++;
        const continuation = [];
        while (i < lines.length && lines[i].trim()) {
          if (parseListLine(lines[i])) break;
          if (indentWidth(lines[i]) <= baseIndent) break;
          continuation.push(lines[i].replace(/^\s+/, ''));
          i++;
        }
        if (continuation.length) item.content += '\n' + continuation.join('\n');
        items.push(item);
      }
      const block = {type:'list', ordered, start, progressive:!!props.progressive, size, items, step:props.step ?? ctx.step};
      if (props.until != null) block.until = props.until;
      if (props.align) block.align = props.align;
      blocks.push(block);
      ctx.maxStep = Math.max(ctx.maxStep, maxStepInBlocks([block]));
      continue;
    }
    const paragraph = [];
    while (i < lines.length && lines[i].trim()) {
      if (parseListLine(lines[i]) && paragraph.length) break;
      paragraph.push(lines[i]);
      i++;
    }
    const aligned = extractLegacyLineAlign(paragraph.join('\n'), props.align);
    const block = {type:'text', size, content: aligned.content, step:props.step ?? ctx.step};
    if (props.until != null) block.until = props.until;
    if (aligned.align) block.align = aligned.align;
    blocks.push(block);
  }
  return blocks;
}
function parseWidths(value) {
  if (!value) return [];
  return String(value).split(',').map(part => Number(part.trim())).filter(n => Number.isFinite(n) && n > 0);
}
function parseAlignList(value) {
  if (!value) return [];
  return String(value).split(',').map(part => ({left:'l',center:'c',right:'r'}[part.trim().toLowerCase()] || part.trim().toLowerCase())).map(v => ['l','c','r'].includes(v) ? v : 'l');
}
function encodeStructuredTableCell(cell) {
  const json = JSON.stringify(cell?.blocks || []);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return `@blocks:${btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}`;
}
function decodeStructuredTableCell(value) {
  const match = String(value || '').match(/^@blocks:([A-Za-z0-9_-]+)$/);
  if (!match) return null;
  try {
    let base64 = match[1].replace(/-/g,'+').replace(/_/g,'/');
    while (base64.length % 4) base64 += '=';
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    const blocks = JSON.parse(new TextDecoder().decode(bytes));
    return {blocks:Array.isArray(blocks) ? blocks.map(normalizeBlock) : []};
  } catch { return null; }
}
function parseSequence(ctx, stopTokens = new Set(), depth = 0, expectedStepEnd = null) {
  const blocks = [];
  while (ctx.index < ctx.lines.length) {
    const rawLine = ctx.lines[ctx.index];
    const trimmed = rawLine.trim();
    const lineNumber = ctx.index + 1;
    const stepEnd = matchStepEndLine(trimmed);

    if (expectedStepEnd != null && stepEnd === expectedStepEnd) break;
    if (stepEnd != null) {
      ctx.warnings.push(`Line ${lineNumber}: unexpected [End Step ${stepEnd}] was ignored.`);
      ctx.index++;
      continue;
    }
    if (stopTokens.has(trimmed)) break;
    if (!trimmed) { ctx.index++; continue; }

    const stepStart = matchStepStartLine(trimmed);
    if (stepStart != null) {
      ctx.index++;
      const previousStep = ctx.step;
      ctx.step = stepStart;
      ctx.maxStep = Math.max(ctx.maxStep, stepStart);
      const steppedBlocks = parseSequence(ctx, new Set(), depth + 1, stepStart);
      blocks.push(...steppedBlocks);
      const closingStep = ctx.index < ctx.lines.length ? matchStepEndLine(ctx.lines[ctx.index]) : null;
      if (closingStep === stepStart) ctx.index++;
      else ctx.warnings.push(`Line ${lineNumber}: [Step ${stepStart}] reached a container boundary or the end of the slide without [End Step ${stepStart}].`);
      ctx.step = previousStep;
      continue;
    }

    if ((trimmed === 'End' || trimmed === '---') && depth === 0) {
      ctx.warnings.push(`Line ${lineNumber}: top-level ${trimmed} is not a valid container delimiter here; it was kept as literal text${trimmed === '---' ? '. Use Rule: for a horizontal rule.' : '.'}`);
      blocks.push(...makeTextBlocks(rawLine, 'normal', ctx, {step:ctx.step}));
      ctx.index++;
      continue;
    }
    if (trimmed === 'End' || trimmed === '---') break;

    const directive = matchDirective(rawLine);
    if (!directive) {
      if (looksDirectiveLike(rawLine)) ctx.warnings.push(`Line ${lineNumber}: unknown directive "${directiveLikeName(rawLine)}"; it was kept as ordinary text.`);
      const run = [];
      while (ctx.index < ctx.lines.length) {
        const line = ctx.lines[ctx.index];
        const here = line.trim();
        if ((isControlLine(line) && depth > 0) || matchDirective(line) || (looksDirectiveLike(line) && run.length)) break;
        if ((here === 'End' || here === '---') && depth === 0 && run.length) break;
        run.push(literalizeLine(line));
        ctx.index++;
      }
      blocks.push(...makeTextBlocks(run.join('\n'), 'normal', ctx, {step:ctx.step}));
      continue;
    }

    ctx.index++;
    const parsedArgs = parseArgString(directive.argsRaw);
    const progressive = parsedArgs.positional.some(value => value.toLowerCase() === 'steps') || parsedArgs.args.steps != null;
    const valuePositionals = parsedArgs.positional.filter(value => value.toLowerCase() !== 'steps');
    const props = {...commonBlockProps(parsedArgs, ctx.step), progressive};
    if (progressive && parsedArgs.args.steps && /^\d+$/.test(parsedArgs.args.steps)) props.progressiveStart = Math.max(1, Number(parsedArgs.args.steps));
    const positional = valuePositionals.join(';').trim();

    if (TOP_LEVEL_FIELDS.has(directive.name)) {
      const value = gatherDirectiveValue(ctx, directive.value).trim();
      if (ctx.step > 0) ctx.warnings.push(`Line ${lineNumber}: ${directive.name} is slide-level metadata and remains visible outside step regions.`);
      if (directive.name === 'header') ctx.fields.header = value;
      if (directive.name === 'aside') ctx.fields.aside = value;
      if (directive.name === 'background') ctx.fields.background = value ? {src:value, mode: positional.toLowerCase() === 'full' ? 'full' : 'tint'} : null;
      continue;
    }

    if (directive.name === 'columns') {
      const widths = parseWidths(positional || parsedArgs.args.widths);
      const valign = ['top','center','bottom'].includes(String(parsedArgs.args.valign || '').toLowerCase()) ? String(parsedArgs.args.valign).toLowerCase() : 'center';
      const columns = [];
      while (ctx.index < ctx.lines.length) {
        const result = parseSequence(ctx, new Set(['---','End']), depth + 1);
        columns.push({blocks: result});
        if (ctx.index >= ctx.lines.length) { ctx.warnings.push(`Line ${lineNumber}: Columns block reached the end of the slide without End.`); break; }
        const token = ctx.lines[ctx.index].trim();
        ctx.index++;
        if (token === 'End') break;
        if (token !== '---') break;
      }
      const block = {type:'columns', widths, valign, columns, ...props};
      delete block.progressive;
      blocks.push(block);
      ctx.maxStep = Math.max(ctx.maxStep, maxStepInBlocks([block]));
      continue;
    }

    if (directive.name === 'table') {
      const rows = [];
      while (ctx.index < ctx.lines.length && ctx.lines[ctx.index].trim() !== 'End') {
        const line = ctx.lines[ctx.index++];
        if (!line.trim()) continue;
        if (isStepMarkerLine(line)) { ctx.warnings.push(`Line ${ctx.index}: step regions cannot split individual table rows. Wrap the entire Table block instead.`); continue; }
        rows.push(splitOutsideMath(line, '|').map(cell => { const value = cell.trim(); const structured = decodeStructuredTableCell(value); return structured || value; }));
      }
      if (ctx.index < ctx.lines.length && ctx.lines[ctx.index].trim() === 'End') ctx.index++;
      else ctx.warnings.push(`Line ${lineNumber}: Table block reached the end of the slide without End.`);
      const widths = parseWidths(parsedArgs.args.widths || positional);
      const headerRows = Math.max(0, Math.trunc(Number(parsedArgs.args.header ?? 1) || 0));
      const headerCols = Math.max(0, Math.trunc(Number(parsedArgs.args.headercol ?? 0) || 0));
      let columnAlignValue = parsedArgs.args.columnalign || parsedArgs.args.cellalign || '';
      if (!columnAlignValue && /^(?:\s*[lcr](?:eft|enter|ight)?\s*,?)+$/i.test(String(parsedArgs.args.align || '')) && String(parsedArgs.args.align || '').includes(',')) {
        columnAlignValue = parsedArgs.args.align;
        delete props.align;
      }
      const block = {type:'table', widths, headerRows, headerCols, columnAlign:parseAlignList(columnAlignValue), rows, ...props};
      delete block.progressive;
      blocks.push(block);
      continue;
    }

    if (directive.name === 'code') {
      const codeLines = [];
      if (directive.value) codeLines.push(directive.value);
      while (ctx.index < ctx.lines.length && ctx.lines[ctx.index].trim() !== 'End') codeLines.push(ctx.lines[ctx.index++]);
      if (ctx.index < ctx.lines.length) ctx.index++;
      else ctx.warnings.push(`Line ${lineNumber}: Code block reached the end of the slide without End.`);
      const block = {type:'code', lang:positional, content:dedentText(codeLines.map(literalizeLine).join('\n')), ...props};
      delete block.progressive;
      blocks.push(block);
      continue;
    }

    if (directive.name === 'break') {
      const block = {type:'break', lines:Math.max(0, Number(directive.value) || 1), ...props};
      delete block.progressive;
      blocks.push(block);
      ctx.maxStep = Math.max(ctx.maxStep, maxStepInBlocks([block]));
      continue;
    }
    if (directive.name === 'rule') {
      const block = {type:'rule', ...props};
      delete block.progressive;
      blocks.push(block);
      ctx.maxStep = Math.max(ctx.maxStep, maxStepInBlocks([block]));
      continue;
    }

    const value = gatherDirectiveValue(ctx, directive.value);
    if (directive.name === 'title') {
      const aligned = extractLegacyLineAlign(value, props.align);
      const block = {type:'title', content:aligned.content, step:props.step};
      if (props.until != null) block.until = props.until;
      if (aligned.align) block.align = aligned.align;
      blocks.push(block);
    } else if (['bigtext','text','smalltext','tinytext'].includes(directive.name)) {
      blocks.push(...makeTextBlocks(value, sizeFromDirective(directive.name, positional), ctx, props));
    } else if (directive.name === 'quote') {
      const aligned = extractLegacyLineAlign(value, props.align);
      const block = {type:'quote', content:aligned.content, source:positional, step:props.step};
      if (props.until != null) block.until = props.until;
      if (aligned.align) block.align = aligned.align;
      blocks.push(block);
    } else if (directive.name === 'image') {
      const parts = splitOutsideMath(value, '|');
      const src = (parts.shift() || '').trim();
      const caption = parts.join('|').trim();
      const width = positional || parsedArgs.args.width || '100%';
      const fit = ['contain','cover'].includes(String(parsedArgs.args.fit || '').toLowerCase()) ? String(parsedArgs.args.fit).toLowerCase() : 'contain';
      const focus = parsedArgs.args.focus || 'center';
      const block = {type:'image', src, caption, width, fit, focus, ...props};
      delete block.progressive;
      blocks.push(block);
    } else if (directive.name === 'website') {
      const parts = splitOutsideMath(value, '|');
      const block = {type:'website', src:(parts[0] || '').trim(), poster:(parts.slice(1).join('|') || parsedArgs.args.poster || '').trim(), ...props};
      delete block.progressive;
      blocks.push(block);
    }
    ctx.maxStep = Math.max(ctx.maxStep, maxStepInBlocks(blocks));
  }
  return blocks;
}
function parseBody(text) {
  const ctx = {lines:cleanText(text).split('\n'), index:0, step:0, maxStep:0, warnings:[], fields:{header:'', aside:'', background:null}};
  const blocks = parseSequence(ctx, new Set(), 0);
  const steps = Math.max(ctx.maxStep, maxStepInBlocks(blocks));
  return {blocks, steps, warnings:ctx.warnings, ...ctx.fields};
}

function joinArgs(positional = '', keyed = []) {
  const values = [];
  if (positional) values.push(positional);
  keyed.filter(Boolean).forEach(value => values.push(value));
  return values.length ? `(${values.join('; ')})` : '';
}
function stepArg(block) {
  const step = Math.max(0, Math.trunc(Number(block?.step) || 0));
  if (block?.until != null) return `step=${step}-${Math.max(step, Math.trunc(Number(block.until) || 0))}`;
  return step > 0 ? `step=${step}` : '';
}
function commonArgs(block, extras = []) {
  const args = [...extras];
  if (block?.align) args.push(`align=${block.align}`);
  const step = stepArg(block);
  if (step) args.push(step);
  return args.filter(Boolean);
}
function indentText(text, spaces = 2) {
  const pad = ' '.repeat(spaces);
  return String(text ?? '').split('\n').map(line => pad + line).join('\n');
}
function effectiveBlockStep(block) { return Math.max(0, Math.trunc(Number(block?.step) || 0)); }
function renderListItemText(item, block, index) {
  const number = block.ordered ? Math.max(1, Math.trunc(Number(item?.number) || (block.start || 1) + index)) : null;
  const marker = block.ordered ? `${number}.` : '-';
  let meta = '';
  const step = item?.step == null ? null : Math.max(0, Math.trunc(Number(item.step) || 0));
  const until = item?.until == null ? null : Math.max(step || 0, Math.trunc(Number(item.until) || 0));
  const progressiveBase = block.progressive ? Math.max(1, Number(block.items?.[0]?.step) || effectiveBlockStep(block) || 1) : null;
  const progressiveExpected = block.progressive ? progressiveBase + index : null;
  const isCanonicalProgressive = block.progressive && step === progressiveExpected && until == null;
  if (step != null && !isCanonicalProgressive) meta = ` [step=${step}${until != null ? `-${until}` : ''}]`;
  const contentLines = escapeDirectiveValue(item?.content || '').split('\n');
  const first = `${marker}${meta} ${contentLines.shift() || ''}`;
  return [first, ...contentLines.map(line => `  ${line}`)].join('\n');
}
function renderBlockText(block, indent = 0) {
  const pad = ' '.repeat(indent);
  const lines = [];
  switch (block.type) {
    case 'title':
      lines.push(`${pad}Title${joinArgs('', commonArgs(block))}: ${escapeDirectiveValue(block.content)}`);
      break;
    case 'text': {
      let name = 'Text';
      let positional = '';
      if (block.size === 'big') name = 'BigText';
      else if (block.size === 'small') name = 'SmallText';
      else if (block.size === 'tiny') name = 'TinyText';
      else if (typeof block.size === 'number') positional = String(block.size);
      lines.push(`${pad}${name}${joinArgs(positional, commonArgs(block))}: ${escapeDirectiveValue(block.content)}`);
      break;
    }
    case 'list': {
      const name = block.size === 'big' ? 'BigText' : block.size === 'small' ? 'SmallText' : block.size === 'tiny' ? 'TinyText' : 'Text';
      let positional = typeof block.size === 'number' ? String(block.size) : '';
      const keyed = commonArgs(block);
      if (block.progressive) {
        const firstStep = block.items?.find(item => item?.step != null)?.step;
        const defaultStart = Math.max(1, effectiveBlockStep(block) || 1);
        if (firstStep != null && Number(firstStep) !== defaultStart) keyed.unshift(`steps=${Math.max(1, Number(firstStep) || 1)}`);
        else positional = positional ? `${positional}; steps` : 'steps';
      }
      const body = (block.items || []).map((item, index) => renderListItemText(item, block, index)).join('\n');
      lines.push(`${pad}${name}${joinArgs(positional, keyed)}: ${body}`);
      break;
    }
    case 'quote':
      lines.push(`${pad}Quote${joinArgs(block.source || '', commonArgs(block))}: ${escapeDirectiveValue(block.content)}`);
      break;
    case 'image': {
      const extras = [];
      if (block.fit && block.fit !== 'contain') extras.push(`fit=${block.fit}`);
      if (block.focus && block.focus !== 'center') extras.push(`focus=${block.focus}`);
      lines.push(`${pad}Image${joinArgs(block.width && block.width !== '100%' ? block.width : '', commonArgs(block, extras))}: ${escapePipesOutsideMath(block.src)}${block.caption ? ` | ${escapePipesOutsideMath(block.caption)}` : ''}`);
      break;
    }
    case 'break': lines.push(`${pad}Break${joinArgs('', commonArgs(block))}: ${block.lines}`); break;
    case 'rule': lines.push(`${pad}Rule${joinArgs('', commonArgs(block))}:`); break;
    case 'website': {
      const extras = block.poster ? [`poster=${escapePipesOutsideMath(block.poster)}`] : [];
      lines.push(`${pad}Website${joinArgs('', commonArgs(block, extras))}: ${escapePipesOutsideMath(block.src)}`);
      break;
    }
    case 'code':
      lines.push(`${pad}Code${joinArgs(block.lang || '', commonArgs(block))}:`);
      lines.push(indentText(String(block.content ?? '').split('\n').map(escapeStructuralLine).join('\n'), indent + 2));
      lines.push(`${pad}End`);
      break;
    case 'columns': {
      const widths = block.widths?.length ? block.widths.join(',') : '';
      const extras = [];
      if (block.valign && block.valign !== 'center') extras.push(`valign=${block.valign}`);
      lines.push(`${pad}Columns${joinArgs(widths, commonArgs(block, extras))}:`);
      block.columns.forEach((column, index) => {
        const columnText = blocksToText(column.blocks, indent + 2);
        if (columnText) lines.push(columnText);
        if (index < block.columns.length - 1) lines.push(`${pad}---`);
      });
      lines.push(`${pad}End`);
      break;
    }
    case 'table': {
      const extras = [];
      if (block.widths?.length) extras.push(`widths=${block.widths.join(',')}`);
      extras.push(`header=${block.headerRows ?? 1}`);
      if (block.headerCols) extras.push(`headercol=${block.headerCols}`);
      if (block.columnAlign?.length) extras.push(`columnAlign=${block.columnAlign.join(',')}`);
      lines.push(`${pad}Table${joinArgs('', commonArgs(block, extras))}:`);
      block.rows.forEach(row => lines.push(`${pad}${row.map(cell => escapePipesOutsideMath(typeof cell === 'string' ? cell : encodeStructuredTableCell(cell))).join(' | ')}`));
      lines.push(`${pad}End`);
      break;
    }
  }
  return lines.join('\n');
}
function blocksToText(blocks, indent = 0) {
  return (blocks || []).map(block => renderBlockText(block, indent)).filter(Boolean).join('\n\n').trimEnd();
}
function slideToText(slide) {
  const sections = [];
  if (slide.header) sections.push(`Header: ${escapeDirectiveValue(slide.header)}`);
  if (slide.background?.src) sections.push(`Background${slide.background.mode === 'full' ? '(full)' : ''}: ${escapeDirectiveValue(slide.background.src)}`);
  const body = blocksToText(slide.blocks);
  if (body) sections.push(body);
  if (slide.aside) sections.push(`Aside: ${escapeDirectiveValue(slide.aside)}`);
  return sections.join('\n\n').trim();
}

function roundTripBodyModel(model) {
  const slide = {
    id:'roundtrip-test', hidden:false, layout:'auto', speaker:'', print:'',
    header:String(model.header || ''), aside:String(model.aside || ''), background:model.background ? deepClone(model.background) : null,
    blocks:(model.blocks || []).map(normalizeBlock), steps:0
  };
  slide.steps = maxStepInBlocks(slide.blocks);
  const parsed = parseBody(slideToText(slide));
  return {
    header:parsed.header,
    aside:parsed.aside,
    background:parsed.background,
    blocks:parsed.blocks.map(normalizeBlock),
    steps:parsed.steps
  };
}
function normalizedBodyModel(model) {
  const blocks = (model.blocks || []).map(normalizeBlock);
  return {
    header:String(model.header || ''),
    aside:String(model.aside || ''),
    background:model.background ? {src:String(model.background.src || ''), mode:model.background.mode === 'full' ? 'full' : 'tint'} : null,
    blocks,
    steps:maxStepInBlocks(blocks)
  };
}
function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableObject(value[key])]));
  return value;
}
function runRoundTripSelfTest() {
  const fixture = {
    header:'Header **markup**', aside:'Aside', background:{src:'image.jpg',mode:'tint'},
    blocks:[
      {type:'title',content:'Title',align:'center',step:1,until:2},
      {type:'text',size:2.4,content:'Right text',align:'right',step:0},
      {type:'list',ordered:true,start:3,progressive:false,size:'normal',align:'center',step:0,items:[
        {number:3,content:'Three',step:1,until:2},{number:7,content:'Seven\nwrapped',step:3}
      ]},
      {type:'list',ordered:false,start:1,progressive:true,size:'big',step:0,items:[
        {content:'First',step:1},{content:'Second',step:2}
      ]},
      {type:'quote',content:'Quote',source:'Source',align:'left',step:2},
      {type:'image',src:'asset:test',caption:'Caption',width:'60%',fit:'cover',focus:'65% 40%',align:'center',step:1},
      {type:'break',lines:1.5,step:0},
      {type:'rule',align:'center',step:2},
      {type:'website',src:'https://example.com/a_(b)',poster:'poster.jpg',step:0},
      {type:'code',lang:'python',content:'print("x")\n\\End\n\\---',step:1},
      {type:'columns',widths:[2,1],valign:'top',align:'center',step:1,columns:[
        {blocks:[{type:'text',size:'small',content:'Left',step:0}]},
        {blocks:[{type:'text',size:'normal',content:'Right',step:3,until:4}]}
      ]},
      {type:'table',widths:[2,1],headerRows:1,headerCols:1,columnAlign:['l','r'],align:'center',step:2,rows:[
        ['Name','Value'],['A',{blocks:[{type:'text',size:'tiny',content:'Rich **cell**',step:0}]}]
      ]}
    ]
  };
  const expected = normalizedBodyModel(fixture);
  const actual = roundTripBodyModel(fixture);
  if (JSON.stringify(stableObject(expected)) !== JSON.stringify(stableObject(actual))) return {ok:false, expected, actual};
  return {ok:true};
}

/* ---------- Inline renderer ---------- */
function maskEscapes(text) {
  const tokens = [];
  const masked = String(text ?? '').replace(/\\([*_|$:\\])/g, (_, value) => {
    const token = `\uE200${tokens.length}\uE201`;
    tokens.push(value);
    return token;
  });
  return {masked, tokens};
}
function restoreEscapes(text, tokens) {
  let out = String(text ?? '');

  tokens.forEach((value, index) => {
    /* MathJax must receive \$ in the DOM text in order to leave
       an ordinary dollar sign alone. */
    const restored = value === '$' ? '\\$' : value;

    out = out
      .split(`\uE200${index}\uE201`)
      .join(escapeHtml(restored));
  });

  return out;
}
function protectNonMathDollars(text) {
  return String(text ?? '').replace(/(^|[^\\])\$/g, '$1\\$');
}
function formatInlineEmphasis(html) {
  let out = String(html ?? '');
  out = out.replace(/(^|[^A-Za-z0-9])\*\*\*(?=\S)([\s\S]*?\S)\*\*\*(?![A-Za-z0-9])/g, '$1<strong><em>$2</em></strong>');
  out = out.replace(/(^|[^A-Za-z0-9])\*\*(?=\S)([\s\S]*?\S)\*\*(?![A-Za-z0-9])/g, '$1<strong>$2</strong>');
  out = out.replace(/(^|[^A-Za-z0-9])\*(?=\S)([\s\S]*?\S)\*(?![A-Za-z0-9])/g, '$1<em>$2</em>');
  out = out.replace(/(^|[^A-Za-z0-9])_(?=\S)([\s\S]*?\S)_(?![A-Za-z0-9])/g, '$1<em>$2</em>');
  return out;
}
function trimBareUrl(url) {
  let core = String(url || ''), tail = '';
  while (/[.,;:!?]$/.test(core)) { tail = core.slice(-1) + tail; core = core.slice(0, -1); }
  const pairs = [['(',')'], ['[',']'], ['{','}']];
  pairs.forEach(([open, close]) => {
    while (core.endsWith(close) && (core.split(close).length - 1) > (core.split(open).length - 1)) { tail = close + tail; core = core.slice(0, -1); }
  });
  return {core, tail};
}
function maskInlineLinksAndUrls(text) {
  const tokens = [];
  const source = String(text ?? '');
  let out = '', i = 0;
  const pushToken = html => { const token = `\uE300${tokens.length}\uE301`; tokens.push(html); out += token; };
  while (i < source.length) {
    if (source[i] === '[') {
      const labelEnd = source.indexOf('](', i + 1);
      if (labelEnd > i) {
        let j = labelEnd + 2, depth = 1;
        while (j < source.length && depth > 0) {
          if (source[j] === '\\') { j += 2; continue; }
          if (source[j] === '(') depth++;
          else if (source[j] === ')') depth--;
          j++;
        }
        if (depth === 0) {
          const label = source.slice(i + 1, labelEnd);
          const url = source.slice(labelEnd + 2, j - 1);
          if (url && !/\s/.test(url)) {
            const safeLabel = formatInlineEmphasis(escapeHtml(label));
            if (url.startsWith('#')) {
              const id = url.slice(1);
              pushToken(`<a href="#${escapeAttr(id)}" class="ms-link-internal" data-slide-id="${escapeAttr(id)}">${safeLabel}</a>`);
            } else if (/^(https?:|mailto:)/i.test(url)) {
              pushToken(`<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`);
            } else pushToken(safeLabel);
            i = j; continue;
          }
        }
      }
    }
    const bare = source.slice(i).match(/^https?:\/\/[^\s<>]+/i);
    if (bare) {
      const {core, tail} = trimBareUrl(bare[0]);
      if (core) pushToken(`<a href="${escapeAttr(core)}" target="_blank" rel="noopener noreferrer">${escapeHtml(core)}</a>`);
      out += tail;
      i += bare[0].length;
      continue;
    }
    out += source[i++];
  }
  return {masked:out, tokens};
}
function inlineMarkup(text) {
  /* First remove genuine math expressions from consideration. */
  const math = maskMathSegments(String(text ?? ''));

  /* Every remaining dollar is ordinary text/currency, so make sure
     MathJax sees it as \$ rather than as a math delimiter. */
  const escaped = maskEscapes(protectNonMathDollars(math.masked));

  const linked = maskInlineLinksAndUrls(escaped.masked);

  let html = formatInlineEmphasis(escapeHtml(linked.masked));

  linked.tokens.forEach((value, index) => {
    html = html
      .split(`\uE300${index}\uE301`)
      .join(value);
  });

  html = restoreEscapes(html, escaped.tokens);

  /* Genuine math gets its original $...$ delimiters back only here. */
  html = restoreMathSegments(
    html,
    math.tokens,
    value => escapeHtml(value)
  );

  return html.replace(/\n/g, '<br>');
}
function noteMarkup(text) {
  return cleanText(text).split(/\n{2,}/).filter(part => part.trim()).map(part => `<p>${inlineMarkup(part.trim())}</p>`).join('');
}

/* ---------- Editor commit ---------- */
function commitEditor({record = true, rerender = true} = {}) {
  if (state.editorLoading || !state.deck) return false;
  const oldSlide = currentSlide();
  if (!oldSlide) return false;
  const parsed = parseBody($('body-editor').value);
  const requestedId = oldSlide.id;
  const newSlide = {
    ...deepClone(oldSlide),
    id: requestedId,
    layout: LAYOUTS.has($('slide-layout').value) ? $('slide-layout').value : 'auto',
    header: parsed.header,
    aside: parsed.aside,
    background: parsed.background,
    speaker: $('speaker-editor').value,
    print: $('print-editor').value,
    blocks: parsed.blocks.map(normalizeBlock),
    steps: parsed.steps
  };
  const changed = JSON.stringify(oldSlide) !== JSON.stringify(newSlide);
  showWarnings(parsed.warnings.concat(lintSlide(newSlide)));
  if (!changed) { state.dirty = false; return false; }
  if (record) pushUndo();
  const index = state.deck.slides.findIndex(slide => slide.id === oldSlide.id);
  state.deck.slides[index] = newSlide;
  state.currentSlideId = newSlide.id;
  state.currentStep = Math.min(state.currentStep, newSlide.steps);
  state.dirty = false;
  autosave();
  if (rerender) scheduleRender('edit', oldSlide.id === newSlide.id ? {full:false, slideIds:[newSlide.id]} : {full:true});
  return true;
}
const debouncedCommit = debounce(() => commitEditor({record:true, rerender:true}), 550);

function loadEditorsFromCurrent() {
  const slide = currentSlide();
  if (!slide) return;
  state.editorLoading = true;
  debouncedCommit.cancel();
  $('editor-slide-id').textContent = slide.id;
  $('slide-layout').value = slide.layout || 'auto';
  $('body-editor').value = slideToText(slide);
  $('speaker-editor').value = slide.speaker || '';
  $('print-editor').value = slide.print || '';
  $('toggle-hidden').innerHTML = slide.hidden ? '<i class="fa-regular fa-eye"></i>' : '<i class="fa-regular fa-eye-slash"></i>';
  $('toggle-hidden').title = slide.hidden ? 'Show slide' : 'Hide slide';
  state.currentStep = Math.min(state.currentStep, slide.steps || 0);
  showWarnings(lintSlide(slide));
  state.editorLoading = false;
}
function lintSlide(slide) {
  const warnings = [];
  const title = slide.blocks.find(block => block.type === 'title');
  if (title && title.content.length > 105) warnings.push('Title is long; aim for two lines or fewer.');
  const lists = [];
  const walk = blocks => blocks.forEach(block => {
    if (block.type === 'list') lists.push(block);
    if (block.type === 'columns') block.columns.forEach(column => walk(column.blocks));
    if (block.type === 'columns' && block.columns.length > 3) warnings.push('More than three columns will usually be crowded.');
    if (block.type === 'table' && (block.rows.length > 9 || Math.max(0, ...block.rows.map(row => row.length)) > 6)) warnings.push('Large table may be difficult to read.');
    if (block.type === 'text' && typeof block.size === 'number' && block.size < .5) warnings.push('Text scale below .5 is too small for most projection and print.');
  });
  walk(slide.blocks);
  lists.forEach(list => { if (list.items.length > 7) warnings.push('Long list: consider splitting it across slides.'); });
  return [...new Set(warnings)];
}

/* ---------- Canonical renderer ---------- */
function resolveSource(src) {
  const value = String(src || '').trim();
  if (!value) return '';
  if (value.startsWith('asset:')) {
    const asset = state.deck.assets[value.slice(6)];
    return asset?.data || '';
  }
  if (/^(data:|blob:|https?:)/i.test(value)) return value;
  try { return new URL(value, state.baseUrl || location.href).href; }
  catch { return value; }
}
function plainTextFromMarkup(value) {
  return String(value || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[\*_`]/g, '').replace(/\$+/g, '').trim();
}
function youtubeInfo(url) {
  try {
    const parsed = new URL(url, location.href);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    let id = '';
    if (host === 'youtu.be') id = parsed.pathname.split('/').filter(Boolean)[0] || '';
    else if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      if (parsed.pathname.startsWith('/embed/')) id = parsed.pathname.split('/')[2] || '';
      else if (parsed.pathname.startsWith('/shorts/')) id = parsed.pathname.split('/')[2] || '';
      else if (parsed.pathname.startsWith('/live/')) id = parsed.pathname.split('/')[2] || '';
      else id = parsed.searchParams.get('v') || '';
    }
    if (!id) return null;
    const parseTime = value => {
      if (!value) return 0;
      if (/^\d+$/.test(value)) return Number(value);
      const match = String(value).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
      return match ? Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0) : 0;
    };
    const start = Number(parsed.searchParams.get('start') || 0) || parseTime(parsed.searchParams.get('t'));
    return { id, start, list: parsed.searchParams.get('list') || '', index: parsed.searchParams.get('index') || '' };
  } catch { return null; }
}
function youtubePoster(url) {
  const info = youtubeInfo(url);
  return info ? `https://img.youtube.com/vi/${encodeURIComponent(info.id)}/hqdefault.jpg` : '';
}
function normalizeWebsiteSource(url) {
  const absolute = resolveSource(url);
  const info = youtubeInfo(absolute);
  if (!info) return absolute;
  const embed = new URL(`https://www.youtube.com/embed/${encodeURIComponent(info.id)}`);
  embed.searchParams.set('rel', '0');
  if (info.start > 0) embed.searchParams.set('start', String(info.start));
  if (info.list) embed.searchParams.set('list', info.list);
  if (info.index) embed.searchParams.set('index', info.index);
  return embed.href;
}
function activateLiveWebsites(frame) {
  if (!frame) return;
  const doc = frame.ownerDocument || document;
  frame.querySelectorAll('.website-card[data-website-src]').forEach(card => {
    const src = normalizeWebsiteSource(card.dataset.websiteSrc || '');
    if (!/^https?:/i.test(src)) return;
    const iframe = doc.createElement('iframe');
    iframe.className = 'website-live-frame';
    iframe.src = src;
    iframe.title = 'Embedded website';
    iframe.loading = 'eager';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    card.replaceChildren(iframe);
  });
}
function applyStepAttributes(element, item) {
  const step = Number(item?.step) || 0;
  if (step > 0) element.dataset.step = String(step);
  if (item?.until != null) element.dataset.until = String(Number(item.until) || 0);
  if (item?.align) element.classList.add(`align-${item.align}`);
}
function renderBlock(block, doc = document) {
  let element;
  switch (block.type) {
    case 'title':
      element = doc.createElement('h1');
      element.className = 'slide-title slide-block';
      element.innerHTML = inlineMarkup(block.content);
      break;
    case 'text':
      element = doc.createElement('div');
      element.className = `slide-block block-text ${typeof block.size === 'string' ? `size-${block.size}` : ''}`;
      if (typeof block.size === 'number') element.style.setProperty('--text-size', String(block.size));
      element.innerHTML = inlineMarkup(block.content);
      break;
    case 'list': {
      element = doc.createElement(block.ordered ? 'ol' : 'ul');
      element.className = `slide-block block-list ${typeof block.size === 'string' ? `size-${block.size}` : ''}`;
      if (typeof block.size === 'number') element.style.setProperty('--text-size', String(block.size));
      if (block.ordered) element.start = Math.max(1, Math.trunc(Number(block.start) || 1));
      block.items.forEach((item, index) => {
        const li = doc.createElement('li');
        li.innerHTML = inlineMarkup(item.content);
        if (block.ordered && item?.number != null && Number(item.number) !== element.start + index) li.value = Math.max(1, Math.trunc(Number(item.number) || 1));
        applyStepAttributes(li, item);
        element.appendChild(li);
      });
      break;
    }
    case 'quote': {
      element = doc.createElement('div');
      element.className = 'slide-block block-quote';
      const quote = doc.createElement('div');
      quote.className = 'quote-text';
      quote.innerHTML = inlineMarkup(block.content);
      element.appendChild(quote);
      if (block.source) {
        const source = doc.createElement('div');
        source.className = 'quote-source';
        source.innerHTML = inlineMarkup(block.source);
        element.appendChild(source);
      }
      break;
    }
    case 'image': {
      element = doc.createElement('figure');
      element.className = 'slide-block block-image';
      element.style.setProperty('--image-width', block.width || '100%');
      element.style.setProperty('--image-fit', block.fit || 'contain');
      element.style.setProperty('--image-focus', block.focus || 'center');
      const img = doc.createElement('img');
      img.src = resolveSource(block.src);
      img.alt = plainTextFromMarkup(block.caption) || '';
      img.decoding = 'async';
      img.loading = 'eager';
      element.appendChild(img);
      if (block.caption) {
        const caption = doc.createElement('figcaption');
        caption.className = 'image-caption';
        caption.innerHTML = inlineMarkup(block.caption);
        element.appendChild(caption);
      }
      break;
    }
    case 'break':
      element = doc.createElement('div');
      element.className = 'slide-block block-break';
      element.setAttribute('aria-hidden', 'true');
      element.style.setProperty('--lines', String(block.lines || 1));
      break;
    case 'rule':
      element = doc.createElement('hr');
      element.className = 'slide-block block-rule';
      break;
    case 'website': {
      element = doc.createElement('div');
      element.className = 'slide-block block-website';
      const card = doc.createElement('div');
      card.className = 'website-card';
      card.dataset.websiteSrc = block.src;
      const poster = resolveSource(block.poster) || youtubePoster(block.src);
      if (poster) {
        card.classList.add('has-poster');
        card.style.setProperty('--poster-image', `url("${poster.replace(/"/g, '\\"')}")`);
      }
      const content = doc.createElement('div');
      content.className = 'website-card-content';
      let host = block.src;
      try { host = new URL(block.src, location.href).hostname; } catch {}
      content.innerHTML = `<div class="website-icon">▶</div><div class="website-label">${escapeHtml(host || 'Embedded website')}</div><div class="website-url">${escapeHtml(block.src)}</div>`;
      card.appendChild(content);
      element.appendChild(card);
      break;
    }
    case 'code':
      element = doc.createElement('pre');
      element.className = 'slide-block block-code';
      element.dataset.lang = block.lang || '';
      element.textContent = block.content || '';
      break;
    case 'columns': {
      element = doc.createElement('div');
      element.className = 'slide-block block-columns';
      const widths = block.widths?.length === block.columns.length ? block.widths : block.columns.map(() => 1);
      element.style.setProperty('--column-template', widths.map(value => `minmax(0, ${value}fr)`).join(' '));
      element.style.setProperty('--column-valign', ({top:'flex-start',center:'center',bottom:'flex-end'}[block.valign] || 'center'));
      block.columns.forEach(column => {
        const columnEl = doc.createElement('div');
        columnEl.className = 'slide-column';
        column.blocks.forEach(child => columnEl.appendChild(renderBlock(child, doc)));
        element.appendChild(columnEl);
      });
      break;
    }
    case 'table': {
      element = doc.createElement('table');
      element.className = 'slide-block block-table';
      const maxCols = Math.max(0, ...block.rows.map(row => row.length));
      if (maxCols) {
        const colgroup = doc.createElement('colgroup');
        const widths = block.widths?.length === maxCols ? block.widths : Array(maxCols).fill(1);
        const total = widths.reduce((sum, value) => sum + value, 0) || 1;
        widths.forEach(value => {
          const col = doc.createElement('col');
          col.style.width = `${value / total * 100}%`;
          colgroup.appendChild(col);
        });
        element.appendChild(colgroup);
      }
      const tbody = doc.createElement('tbody');
      block.rows.forEach((row, rowIndex) => {
        const tr = doc.createElement('tr');
        row.forEach((cell, colIndex) => {
          const header = rowIndex < (block.headerRows || 0) || colIndex < (block.headerCols || 0);
          const td = doc.createElement(header ? 'th' : 'td');
          if (cell && typeof cell === 'object' && Array.isArray(cell.blocks)) cell.blocks.forEach(child => td.appendChild(renderBlock(child, doc)));
          else td.innerHTML = inlineMarkup(cell);
          const align = block.columnAlign?.[colIndex] || 'l';
          td.style.textAlign = ({l:'left',c:'center',r:'right'}[align] || 'left');
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      element.appendChild(tbody);
      break;
    }
    default:
      element = doc.createElement('div');
      element.className = 'slide-block block-text';
      element.textContent = '';
  }
  applyStepAttributes(element, block);
  return element;
}
function inferredLayout(slide) {
  if (slide.layout && slide.layout !== 'auto') return slide.layout;
  const meaningful = slide.blocks.filter(block => block.type !== 'break' && block.type !== 'rule');
  const nonTitles = meaningful.filter(block => block.type !== 'title');
  if (meaningful.length === 1 && meaningful[0].type === 'image') return 'full';
  if (nonTitles.length === 1 && ['quote'].includes(nonTitles[0].type)) return 'statement';
  if (nonTitles.length === 1 && nonTitles[0].type === 'text' && nonTitles[0].size === 'big') return 'statement';
  if (meaningful.some(block => ['table','columns'].includes(block.type))) return 'data';
  return 'auto';
}
function frameNumberInfo(slide) {
  const visible = visibleSlides();
  const visibleIndex = visible.findIndex(item => item.id === slide.id);
  if (visibleIndex >= 0) return {current:visibleIndex + 1, total:visible.length, percent: visible.length ? `${(visibleIndex + 1) / visible.length * 100}%` : '0%'};
  const absolute = state.deck.slides.findIndex(item => item.id === slide.id);
  return {current:absolute + 1, total:state.deck.slides.length, percent: state.deck.slides.length ? `${(absolute + 1) / state.deck.slides.length * 100}%` : '0%'};
}
function buildCanonicalFrame(slide, doc = document) {
  const frame = doc.createElement('article');
  frame.className = `slide-frame theme-${state.deck.meta.theme} layout-${inferredLayout(slide)}`;
  frame.dataset.slideId = slide.id;
  frame.dataset.steps = String(slide.steps || 0);
  if (slide.hidden) frame.dataset.hidden = 'true';

  const background = doc.createElement('div');
  background.className = 'slide-background';
  if (slide.background?.src) {
    const url = resolveSource(slide.background.src);
    background.style.setProperty('--background-image', `url("${url.replace(/"/g, '\\"')}")`);
    background.style.setProperty('--background-size', slide.background.mode === 'full' ? 'contain' : 'cover');
    if (slide.background.mode === 'full') frame.classList.add('background-full');
    else background.style.setProperty('--background-overlay', 'color-mix(in srgb, var(--bg) var(--background-tint), transparent)');
  }
  frame.appendChild(background);

  if (slide.header) {
    const header = doc.createElement('div');
    header.className = 'slide-header';
    header.innerHTML = inlineMarkup(slide.header);
    frame.appendChild(header);
  }

  const inner = doc.createElement('div');
  inner.className = 'slide-inner';
  const flow = doc.createElement('div');
  flow.className = 'slide-flow';
  slide.blocks.forEach(block => flow.appendChild(renderBlock(block, doc)));
  inner.appendChild(flow);
  frame.appendChild(inner);

  if (slide.aside) {
    const aside = doc.createElement('aside');
    aside.className = 'slide-aside';
    aside.innerHTML = inlineMarkup(slide.aside);
    frame.appendChild(aside);
  }

  const logoSrc = state.deck.meta.logo ? resolveSource(state.deck.meta.logo) : '';
  if (logoSrc) {
    const logo = doc.createElement('img');
    logo.className = 'slide-logo';
    logo.src = logoSrc;
    logo.alt = '';
    frame.appendChild(logo);
  }

  const info = frameNumberInfo(slide);
  const footer = doc.createElement('div');
  footer.className = 'slide-footer';
  const footerText = doc.createElement('span');
  footerText.innerHTML = inlineMarkup(state.deck.meta.footer || [state.deck.meta.author, state.deck.meta.date].filter(Boolean).join(' · '));
  footer.appendChild(footerText);
  if (state.deck.meta.pageNumbers) {
    const number = doc.createElement('span');
    number.className = 'slide-number';
    number.textContent = `${info.current}/${info.total}`;
    footer.appendChild(number);
  }
  frame.appendChild(footer);

  if (state.deck.meta.pageNumbers) {
    const progress = doc.createElement('div');
    progress.className = 'slide-progress';
    progress.style.setProperty('--progress-percent', info.percent);
    frame.appendChild(progress);
  }
  return frame;
}
function applyReveal(frame, step) {
  const current = Math.max(0, Number(step) || 0);
  frame.querySelectorAll('[data-step], [data-until]').forEach(element => {
    element.classList.remove('future-step', 'past-step');
    const start = Math.max(0, Number(element.dataset.step) || 0);
    const until = element.dataset.until == null ? Infinity : Math.max(start, Number(element.dataset.until) || 0);
    if (start > current) element.classList.add('future-step');
    else if (until < current) element.classList.add('past-step');
  });
  frame.dataset.currentStep = String(current);
}
async function waitForMathJax(timeout = 12000) {
  const started = performance.now();
  while (!window.MathJax?.startup?.promise) {
    if (performance.now() - started > timeout) return false;
    await sleep(50);
  }
  try {
    return await Promise.race([
      window.MathJax.startup.promise.then(() => true).catch(() => false),
      sleep(timeout).then(() => false)
    ]);
  } catch { return false; }
}
async function typeset(root) {
  if (!(await waitForMathJax())) return;
  try {
    window.MathJax.typesetClear?.([root]);
    const job = window.MathJax.typesetPromise?.([root]);
    if (job) await Promise.race([job, sleep(12000)]);
  } catch (error) {
    console.warn('MathJax typesetting failed:', error);
  }
}
async function waitForAssets(root, timeout = 9000) {
  const doc = root?.ownerDocument || document;
  const fontPromise = doc.fonts?.ready || Promise.resolve();
  const nodes = selector => { try { return [...root.querySelectorAll(selector)]; } catch { return []; } };
  const imagePromises = nodes('img').map(img => {
    if (img.complete) return img.decode?.().catch(() => {}) || Promise.resolve();
    return new Promise(resolve => {
      const finish = () => resolve();
      img.addEventListener('load', finish, {once:true});
      img.addEventListener('error', finish, {once:true});
    });
  });
  const backgroundUrls = new Set();
  nodes('.slide-background,.website-card.has-poster').forEach(node => {
    const style = doc.defaultView?.getComputedStyle(node);
    const value = style?.backgroundImage || '';
    for (const match of value.matchAll(/url\(["']?([^"')]+)["']?\)/g)) if (match[1]) backgroundUrls.add(match[1]);
  });
  const backgroundPromises = [...backgroundUrls].map(src => new Promise(resolve => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = src;
  }));
  await Promise.race([Promise.allSettled([fontPromise, ...imagePromises, ...backgroundPromises]), sleep(timeout)]);
}
function semanticOverflow(frame) {
  const flow = frame.querySelector('.slide-flow');
  if (!flow) return {overflow:false, reasons:[]};
  const reasons = [];
  const tolerance = 1.5;
  let maxBottom = 0, maxRight = 0, minTop = 0, minLeft = 0;
  [...flow.children].forEach(child => {
    maxBottom = Math.max(maxBottom, child.offsetTop + child.offsetHeight);
    maxRight = Math.max(maxRight, child.offsetLeft + child.offsetWidth);
    minTop = Math.min(minTop, child.offsetTop);
    minLeft = Math.min(minLeft, child.offsetLeft);
  });
  if (minTop < -tolerance || maxBottom > flow.clientHeight + tolerance) reasons.push('vertical content');
  if (minLeft < -tolerance || maxRight > flow.clientWidth + tolerance) reasons.push('horizontal content');
  frame.querySelectorAll('.slide-column').forEach((column, index) => {
    if (column.scrollHeight > column.clientHeight + tolerance) reasons.push(`column ${index + 1} vertical`);
    if (column.scrollWidth > column.clientWidth + tolerance) reasons.push(`column ${index + 1} horizontal`);
  });
  frame.querySelectorAll('.block-code').forEach((code, index) => {
    if (code.scrollHeight > code.clientHeight + tolerance) reasons.push(`code ${index + 1} vertical`);
    if (code.scrollWidth > code.clientWidth + tolerance) reasons.push(`code ${index + 1} horizontal`);
  });
  return {overflow:reasons.length > 0, reasons:[...new Set(reasons)]};
}
function fitCanonicalFrame(frame) {
  const flow = frame.querySelector('.slide-flow');
  if (!flow) return;
  let fit = 1;
  frame.style.setProperty('--fit', '1');
  let measure = semanticOverflow(frame);
  while (measure.overflow && fit > .72) {
    fit = Math.max(.72, fit - .02);
    frame.style.setProperty('--fit', fit.toFixed(2));
    measure = semanticOverflow(frame);
  }
  frame.dataset.fit = fit.toFixed(2);
  frame.dataset.overflow = measure.overflow ? 'true' : 'false';
  frame.dataset.overflowReason = measure.reasons.join(', ');
}
function canonicalFrame(id) { return [...$('render-bank').children].find(frame => frame.dataset.slideId === id) || null; }
function cloneFrame(id, step = 0) {
  const source = canonicalFrame(id);
  if (!source) return null;
  const clone = source.cloneNode(true);
  clone.style.transform = '';
  clone.style.left = '';
  clone.style.top = '';
  applyReveal(clone, step);
  return clone;
}
function fitFrameInSlot(slot, frame = slot?.querySelector('.slide-frame')) {
  if (!slot || !frame) return;
  const width = slot.clientWidth, height = slot.clientHeight;
  if (!width || !height) return;
  const scale = Math.max(.01, Math.min(width / STAGE_W, height / STAGE_H));
  frame.style.transform = `scale(${scale})`;
  frame.style.left = `${(width - STAGE_W * scale) / 2}px`;
  frame.style.top = `${(height - STAGE_H * scale) / 2}px`;
}
function mountFrame(slot, id, step, {showOverflow = false, liveWebsites = false} = {}) {
  slot.replaceChildren();
  const frame = cloneFrame(id, step);
  if (!frame) return null;
  if (showOverflow) frame.style.setProperty('--show-overflow', 'block');
  slot.appendChild(frame);
  if (liveWebsites) activateLiveWebsites(frame);
  fitFrameInSlot(slot, frame);
  return frame;
}
async function renderAllSlides() {
  const bank = $('render-bank');
  if (window.MathJax?.typesetClear) { try { window.MathJax.typesetClear([bank]); } catch {} }
  bank.replaceChildren();
  state.deck.slides.forEach(slide => bank.appendChild(buildCanonicalFrame(slide)));
  await typeset(bank);
  await waitForAssets(bank);
  [...bank.children].forEach(fitCanonicalFrame);
}
async function renderSlideIds(ids) {
  const bank = $('render-bank');
  const rendered = [];
  for (const id of ids) {
    const slide = state.deck.slides.find(item => item.id === id);
    if (!slide) continue;
    const previous = canonicalFrame(id);
    if (previous && window.MathJax?.typesetClear) { try { window.MathJax.typesetClear([previous]); } catch {} }
    const frame = buildCanonicalFrame(slide);
    if (previous) previous.replaceWith(frame); else bank.appendChild(frame);
    rendered.push(frame);
  }
  for (const frame of rendered) await typeset(frame);
  await waitForAssets({querySelectorAll: selector => rendered.flatMap(frame => [...frame.querySelectorAll(selector)]), ownerDocument:document});
  rendered.forEach(fitCanonicalFrame);
}
function setRenderStatus(text = '') { if ($('render-status')) $('render-status').textContent = text; }
function updateRenderDiagnostics() {
  const frame = canonicalFrame(state.currentSlideId);
  if (!frame) { setRenderStatus(''); return; }
  const fit = Number(frame.dataset.fit || 1);
  if (frame.dataset.overflow === 'true') setRenderStatus(`OVERFLOW · fit ${Math.round(fit * 100)}% · ${frame.dataset.overflowReason || 'content clipped'}`);
  else if (fit < .999) setRenderStatus(`fit ${Math.round(fit * 100)}%`);
  else setRenderStatus('');
}
async function renderLoop() {
  if (state.rendering) return state.renderPromise;
  state.rendering = true;
  state.renderPromise = (async () => {
    while ((state.lastRenderedRevision || 0) < state.renderRevision) {
      const revision = state.renderRevision;
      const renderAll = state.pendingRenderAll || !$('render-bank').children.length;
      const ids = renderAll ? [] : [...state.pendingSlideIds];
      state.pendingRenderAll = false;
      state.pendingSlideIds.clear();
      setRenderStatus('Rendering…');
      if (renderAll) await renderAllSlides(); else await renderSlideIds(ids);
      state.lastRenderedRevision = revision;
      if (renderAll) refreshThumbnails({scrollSelected:false}); else ids.forEach(refreshThumbnail);
      refreshPresentation({preserveLive:false});
      syncSpeaker({preserveLive:false});
      updateToolbarState();
      updateRenderDiagnostics();
    }
  })().catch(error => {
    console.error(error);
    setRenderStatus(`Render error: ${error.message}`);
  }).finally(() => {
    state.rendering = false;
    if ((state.lastRenderedRevision || 0) < state.renderRevision) renderLoop();
  });
  return state.renderPromise;
}
function scheduleRender(reason = 'update', options = {}) {
  const ids = Array.isArray(options.slideIds) ? options.slideIds.filter(Boolean) : [];
  if (options.full === false && ids.length) ids.forEach(id => state.pendingSlideIds.add(id));
  else { state.pendingRenderAll = true; state.pendingSlideIds.clear(); }
  const targetRevision = ++state.renderRevision;
  renderLoop();
  return (async () => {
    while ((state.lastRenderedRevision || 0) < targetRevision) {
      await state.renderPromise;
      if ((state.lastRenderedRevision || 0) < targetRevision) { renderLoop(); await sleep(0); }
    }
  })();
}
function refreshAllViews({scrollThumb = false, preserveLive = false} = {}) {
  refreshPresentation({preserveLive});
  refreshThumbnails({scrollSelected:scrollThumb});
  syncSpeaker({preserveLive});
  updateToolbarState();
  updateRenderDiagnostics();
}
function refreshPresentation({preserveLive = false} = {}) {
  const slide = currentSlide();
  if (!slide) return;
  const slot = $('presentation-slot');
  const existing = slot.querySelector('.slide-frame');
  if (preserveLive && existing?.dataset.slideId === slide.id) {
    applyReveal(existing, state.currentStep);
    fitFrameInSlot(slot, existing);
  } else {
    mountFrame(slot, slide.id, state.currentStep, {liveWebsites: !state.editMode});
  }
  const visible = visibleSlides();
  const position = visible.findIndex(item => item.id === slide.id);
  $('mobile-status').textContent = `${position >= 0 ? position + 1 : '–'}/${visible.length}`;
}
function buildThumbnailElement(slide, index) {
  const canonical = canonicalFrame(slide.id);
  const wrapper = document.createElement('div');
  wrapper.className = `thumb${slide.id === state.currentSlideId ? ' selected' : ''}${slide.hidden ? ' hidden-slide' : ''}${canonical?.dataset.overflow === 'true' ? ' has-overflow' : ''}`;
  wrapper.draggable = true;
  wrapper.dataset.slideId = slide.id;
  const canvas = document.createElement('div');
  canvas.className = 'thumb-canvas';
  const frame = cloneFrame(slide.id, slide.steps || 0);
  if (frame) { if (canonical?.dataset.overflow === 'true') frame.style.setProperty('--show-overflow','block'); canvas.appendChild(frame); }
  const number = document.createElement('span');
  number.className = 'thumb-number'; number.textContent = String(index + 1); canvas.appendChild(number);
  const controls = document.createElement('span'); controls.className = 'thumb-controls';
  const add = document.createElement('button'); add.type='button'; add.title='Add slide after'; add.setAttribute('aria-label','Add slide after'); add.dataset.action='add'; add.innerHTML='<i class="fa-solid fa-plus"></i>';
  const del = document.createElement('button'); del.type='button'; del.title='Delete slide'; del.setAttribute('aria-label','Delete slide'); del.dataset.action='delete'; del.disabled=state.deck.slides.length<=1; del.innerHTML='<i class="fa-solid fa-minus"></i>';
  controls.append(add,del); canvas.appendChild(controls);
  if (slide.hidden) { const label=document.createElement('span'); label.className='thumb-hidden-label'; label.textContent='HIDDEN'; canvas.appendChild(label); }
  wrapper.appendChild(canvas);
  return wrapper;
}
function refreshThumbnail(id) {
  const list = $('thumb-list');
  const slide = state.deck.slides.find(item => item.id === id);
  const current = list.querySelector(`.thumb[data-slide-id="${CSS.escape(id)}"]`);
  if (!slide) { current?.remove(); return; }
  const index = state.deck.slides.findIndex(item => item.id === id);
  const replacement = buildThumbnailElement(slide, index);
  if (current) current.replaceWith(replacement); else list.appendChild(replacement);
}
function scrollSelectedThumbnail() {
  requestAnimationFrame(() => $('thumb-list').querySelector('.thumb.selected')?.scrollIntoView({block:'center', inline:'nearest'}));
}
function refreshThumbnails({scrollSelected = false} = {}) {
  const list = $('thumb-list');
  const oldScrollTop = list.parentElement?.scrollTop ?? 0;
  list.replaceChildren(...state.deck.slides.map((slide,index) => buildThumbnailElement(slide,index)));
  if (scrollSelected) scrollSelectedThumbnail();
  else if (list.parentElement) list.parentElement.scrollTop = oldScrollTop;
}
function updateToolbarState() {
  const slide = currentSlide();
  $('delete-slide').disabled = state.deck.slides.length <= 1;
  $('theme-select').value = state.deck.meta.theme;
  $('toggle-page-numbers').style.opacity = state.deck.meta.pageNumbers ? '1' : '.38';
  $('toggle-hidden').innerHTML = slide?.hidden ? '<i class="fa-regular fa-eye"></i>' : '<i class="fa-regular fa-eye-slash"></i>';
  updateHistoryButtons();
}


/* ---------- Slide actions and navigation ---------- */
function selectSlide(id, {commit = true, step = 0} = {}) {
  if (!state.deck.slides.some(slide => slide.id === id)) return;
  if (commit && state.editMode) commitEditor({record:true});
  state.currentSlideId = id;
  state.currentStep = Math.max(0, Math.min(step, currentSlide()?.steps || 0));
  storageSet(STORAGE_SLIDE, id);
  if (state.editMode) loadEditorsFromCurrent();
  refreshAllViews({scrollThumb:true, preserveLive:false});
}
function addSlideAfter(id = state.currentSlideId) {
  if (state.editMode) commitEditor({record:true});
  pushUndo();

  const index = Math.max(0, state.deck.slides.findIndex(slide => slide.id === id));
  const slide = freshSlide('New slide', nextSlideId(state.deck));

  state.deck.slides.splice(index + 1, 0, slide);
  state.currentSlideId = slide.id;
  state.currentStep = 0;

  loadEditorsFromCurrent();
  autosave();
  scheduleRender('add').then(scrollSelectedThumbnail);
}
function deleteSlide(id = state.currentSlideId) {
  if (state.deck.slides.length <= 1) return;
  if (state.editMode) commitEditor({record:true});
  const index = state.deck.slides.findIndex(slide => slide.id === id);
  if (index < 0) return;
  const deletingCurrent = id === state.currentSlideId;
  pushUndo();
  state.deck.slides.splice(index, 1);
  if (deletingCurrent) {
    const replacement = state.deck.slides[Math.min(index, state.deck.slides.length - 1)];
    state.currentSlideId = replacement.id;
    state.currentStep = 0;
    if (state.editMode) loadEditorsFromCurrent();
  }
  autosave();
  scheduleRender('delete').then(() => { if (deletingCurrent) scrollSelectedThumbnail(); });
}
function duplicateSlide(id = state.currentSlideId) {
  if (state.editMode) commitEditor({record:true});

  const index = state.deck.slides.findIndex(slide => slide.id === id);
  if (index < 0) return;

  pushUndo();

  const copy = deepClone(state.deck.slides[index]);
  copy.id = nextSlideId(state.deck);

  state.deck.slides.splice(index + 1, 0, copy);
  state.currentSlideId = copy.id;
  state.currentStep = 0;

  loadEditorsFromCurrent();
  autosave();
  scheduleRender('duplicate').then(scrollSelectedThumbnail);
}
function toggleCurrentHidden() {
  if (state.editMode) commitEditor({record:true});
  const slide = currentSlide();
  if (!slide) return;
  pushUndo();
  slide.hidden = !slide.hidden;
  loadEditorsFromCurrent();
  autosave();
  scheduleRender('hide');
}
function moveSlideBefore(dragId, targetId = null) {
  if (!dragId || dragId === targetId) return;
  if (state.editMode) commitEditor({record:true});
  const from = state.deck.slides.findIndex(slide => slide.id === dragId);
  if (from < 0) return;
  let to = targetId ? state.deck.slides.findIndex(slide => slide.id === targetId) : state.deck.slides.length;
  if (to < 0) to = state.deck.slides.length;
  pushUndo();
  const [moved] = state.deck.slides.splice(from, 1);
  if (from < to) to -= 1;
  state.deck.slides.splice(to, 0, moved);
  state.currentSlideId = moved.id;
  autosave();
  scheduleRender('reorder');
}
function setTheme(theme) {
  if (!THEME_IDS.some(([id]) => id === theme) || theme === state.deck.meta.theme) return;
  if (state.editMode) commitEditor({record:true});
  pushUndo();
  state.deck.meta.theme = theme;
  autosave();
  scheduleRender('theme');
}
function togglePageNumbers() {
  if (state.editMode) commitEditor({record:true});
  pushUndo();
  state.deck.meta.pageNumbers = !state.deck.meta.pageNumbers;
  autosave();
  scheduleRender('numbers');
}
function ensurePresentableCurrent() {
  const slide = currentSlide();
  if (!slide || slide.hidden) state.currentSlideId = nearestVisibleId(currentSlideIndex());
  state.currentStep = Math.min(state.currentStep, currentSlide()?.steps || 0);
}
function toggleEdit(force) {
  const next = typeof force === 'boolean' ? force : !state.editMode;
  if (next === state.editMode) return;
  if (!next) {
    commitEditor({record:true});
    ensurePresentableCurrent();
  }
  state.editMode = next;
  document.body.classList.toggle('edit-mode', state.editMode);
  if (state.editMode) loadEditorsFromCurrent();
  requestAnimationFrame(() => {
    refreshAllViews({scrollThumb:false, preserveLive:false});
    fitFrameInSlot($('presentation-slot'));
  });
}
function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  else document.exitFullscreen?.();
}
function nextStepOrSlide() {
  ensurePresentableCurrent();
  const slide = currentSlide();
  if (!slide) return;
  if (state.currentStep < (slide.steps || 0)) {
    state.currentStep += 1;
    refreshPresentation({preserveLive:true}); syncSpeaker({preserveLive:true});
    return;
  }
  const visible = visibleSlides();
  const index = visible.findIndex(item => item.id === slide.id);
  if (index >= 0 && index < visible.length - 1) selectSlide(visible[index + 1].id, {commit:false, step:0});
}
function previousStepOrSlide() {
  ensurePresentableCurrent();
  const slide = currentSlide();
  if (!slide) return;
  if (state.currentStep > 0) {
    state.currentStep -= 1;
    refreshPresentation({preserveLive:true}); syncSpeaker({preserveLive:true});
    return;
  }
  const visible = visibleSlides();
  const index = visible.findIndex(item => item.id === slide.id);
  if (index > 0) selectSlide(visible[index - 1].id, {commit:false, step:visible[index - 1].steps || 0});
}
function goFirst() {
  const first = visibleSlides()[0];
  if (first) selectSlide(first.id, {commit:false, step:0});
}
function goLast() {
  const visible = visibleSlides();
  const last = visible[visible.length - 1];
  if (last) selectSlide(last.id, {commit:false, step:last.steps || 0});
}

/* ---------- Speaker window ---------- */
function speakerDocumentHTML() {
  const styles = $('app-styles').textContent;
  const fontHref = $('font-pack').href;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="${fontHref}"><style>${styles}</style>
<script>window.MathJax={tex:{inlineMath:[[\"$\",\"$\"],[\"\\\\(\",\"\\\\)\"]],displayMath:[[\"$$\",\"$$\"],[\"\\\\[\",\"\\\\]\"]],processEscapes:true},startup:{typeset:false}};<\/script>
<script defer src="https://cdn.jsdelivr.net/npm/mathjax@4/tex-mml-chtml.js"><\/script></head>
<body class="speaker-body">
<section class="speaker-panel"><div class="speaker-label">Current</div><div id="speaker-current" class="speaker-slot"></div></section>
<section class="speaker-panel"><div class="speaker-label">Next</div><div id="speaker-next" class="speaker-slot"></div></section>
<section class="speaker-notes"><div id="speaker-note-text" class="speaker-note-text"></div><div class="speaker-tools"><div id="speaker-timer" class="speaker-timer">00:00</div><div class="speaker-buttons"><button onclick="opener.ModernSlidesAPI.previous()">Previous</button><button onclick="opener.ModernSlidesAPI.next()">Next</button><button onclick="opener.ModernSlidesAPI.resetTimer()">Reset</button></div></div></section>
<script>
window.fitSpeakerSlides=function(){document.querySelectorAll('.speaker-slot').forEach(function(slot){var frame=slot.querySelector('.slide-frame');if(!frame)return;var s=Math.max(.01,Math.min(slot.clientWidth/1600,slot.clientHeight/900));frame.style.transform='scale('+s+')';frame.style.left=((slot.clientWidth-1600*s)/2)+'px';frame.style.top=((slot.clientHeight-900*s)/2)+'px';});};
window.addEventListener('resize',window.fitSpeakerSlides);
<\/script></body></html>`;
}
function openSpeaker() {
  if (state.speakerWindow && !state.speakerWindow.closed) {
    state.speakerWindow.focus();
    syncSpeaker();
    return;
  }
  const popup = window.open('', 'ModernSlidesSpeaker', 'width=1400,height=900');
  if (!popup) { alert('Allow popups to use speaker view.'); return; }
  popup.document.open();
  popup.document.write(speakerDocumentHTML());
  popup.document.close();
  state.speakerWindow = popup;
  state.speakerStartedAt = Date.now();
  clearInterval(state.speakerTimer);
  state.speakerTimer = window.setInterval(updateSpeakerTimer, 500);
  popup.addEventListener('beforeunload', () => {
    clearInterval(state.speakerTimer);
    state.speakerTimer = null;
    state.speakerWindow = null;
  }, {once:true});
  window.setTimeout(syncSpeaker, 120);
}
function resetSpeakerTimer() { state.speakerStartedAt = Date.now(); updateSpeakerTimer(); }
function updateSpeakerTimer() {
  const popup = state.speakerWindow;
  if (!popup || popup.closed) return;
  const seconds = Math.max(0, Math.floor((Date.now() - state.speakerStartedAt) / 1000));
  const text = `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
  const target = popup.document.getElementById('speaker-timer');
  if (target) target.textContent = text;
}
function copyMathStylesToSpeaker() {
  const popup = state.speakerWindow;
  if (!popup || popup.closed) return;
  document.querySelectorAll('style[id*="MJX"], style[data-mathjax]').forEach(style => {
    if (!style.id) return;
    let target = popup.document.getElementById(style.id);
    if (!target) {
      target = popup.document.createElement('style');
      target.id = style.id;
      popup.document.head.appendChild(target);
    }
    target.textContent = style.textContent;
  });
}
function syncSpeaker({preserveLive = false} = {}) {
  const popup = state.speakerWindow;
  if (!popup || popup.closed || !state.deck) return;
  ensurePresentableCurrent();
  const slide = currentSlide();
  const visible = visibleSlides();
  const index = visible.findIndex(item => item.id === slide.id);
  const next = index >= 0 ? visible[index + 1] : null;
  const currentSlot = popup.document.getElementById('speaker-current');
  const nextSlot = popup.document.getElementById('speaker-next');
  if (!currentSlot || !nextSlot) { window.setTimeout(() => syncSpeaker({preserveLive}), 100); return; }
  const existingCurrent = currentSlot.querySelector('.slide-frame');
  if (preserveLive && existingCurrent?.dataset.slideId === slide.id) {
    applyReveal(existingCurrent, state.currentStep);
  } else {
    const currentFrame = cloneFrame(slide.id, state.currentStep);
    if (currentFrame) {
      const importedCurrent = popup.document.importNode(currentFrame, true);
      activateLiveWebsites(importedCurrent);
      currentSlot.replaceChildren(importedCurrent);
    } else currentSlot.replaceChildren(popup.document.createTextNode(''));
  }
  const existingNext = nextSlot.querySelector('.slide-frame');
  if (!(preserveLive && next && existingNext?.dataset.slideId === next.id)) {
    if (next) {
      const nextFrame = cloneFrame(next.id, 0);
      nextSlot.replaceChildren(nextFrame ? popup.document.importNode(nextFrame, true) : popup.document.createTextNode(''));
    } else {
      const end = popup.document.createElement('div');
      end.style.cssText = 'display:grid;place-items:center;width:100%;height:100%;color:#888;font:600 1.4rem Inter,sans-serif;';
      end.textContent = 'End of presentation';
      nextSlot.replaceChildren(end);
    }
  }
  const notes = popup.document.getElementById('speaker-note-text');
  notes.innerHTML = noteMarkup(slide.speaker || '*No speaker notes.*');
  copyMathStylesToSpeaker();
  popup.fitSpeakerSlides?.();
  popup.document.fonts?.ready?.then(() => popup.fitSpeakerSlides?.());
  if (popup.MathJax?.startup?.promise) popup.MathJax.startup.promise.then(() => popup.MathJax.typesetPromise?.([notes])).catch(() => {});
  updateSpeakerTimer();
}

/* ---------- Print ---------- */
function fitPrintNotes(root) {
  root.querySelectorAll('.print-notes').forEach(notes => {
    let size = 22;
    notes.style.fontSize = `${size}px`;
    while (notes.scrollHeight > notes.clientHeight + 1 && size > 9) {
      size -= 1;
      notes.style.fontSize = `${size}px`;
    }
  });
}
async function preparePrint(withNotes) {
  if (state.editMode) commitEditor({record:true});
  await scheduleRender('print');
  const root = $('print-root');
  root.classList.add('print-preparing');
  root.replaceChildren();
  const noteElements = [];
  visibleSlides().forEach(slide => {
    const page = document.createElement('section');
    page.className = `print-page ${withNotes ? 'with-notes' : 'no-notes'}`;
    const box = document.createElement('div');
    box.className = 'print-slide-box';
    const frame = cloneFrame(slide.id, slide.steps || 0);
    if (frame) box.appendChild(frame);
    page.appendChild(box);
    if (withNotes) {
      const notes = document.createElement('div');
      notes.className = 'print-notes';
      notes.innerHTML = noteMarkup(slide.print || '');
      page.appendChild(notes);
      noteElements.push(notes);
    }
    root.appendChild(page);
  });
  for (const notes of noteElements) await typeset(notes);
  await waitForAssets(root);
  fitPrintNotes(root);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  state.printPrepared = true;
  root.classList.remove('print-preparing');
  window.print();
}
function cleanupPrint() {
  if (!state.printPrepared) return;
  $('print-root').classList.remove('print-preparing');
  $('print-root').replaceChildren();
  state.printPrepared = false;
}

window.ModernSlidesAPI = {
  next: nextStepOrSlide,
  previous: previousStepOrSlide,
  resetTimer: resetSpeakerTimer,
  schema: DECK_SCHEMA,
  selfTest: runRoundTripSelfTest
};

/* ---------- Legacy Format 1 translator ---------- */
const OLD_DIRECTIVES = new Set(['hidden','background','fullscreenimage','header','title','bigtext','text','smalltext','tinytext','notes','image','columns','table','fullscreenwebsite','speakernote','printnote','break','logo','blockquote','ref']);
function oldDirective(line) {
  const match = line.match(/^\s*([A-Za-z][A-Za-z0-9.]*)(?:\(([^)]*)\))?\s*:\s*(.*)$/);
  if (!match) return null;
  const rawName = match[1];
  const lower = rawName.toLowerCase();
  if (!OLD_DIRECTIVES.has(lower) && !/^text(?:\d|\.)/i.test(rawName)) return null;
  return {name:lower, rawName, arg:match[2] || '', value:match[3] || ''};
}
function translateLegacyLinks(text) {
  let out = String(text || '');
  out = out.replace(/\+\+\+([^+\[]+)(?:\[([^\]]*)\])?\+\+\+/g, (_, id, label) => `[${label || id}](#${slugify(id)})`);
  out = out.replace(/!(https?:\/\/[^\s\[]+)\[([^\]]*)\]/g, (_, url, label) => `[${label || url}](${url})`);
  out = out.replace(/!(https?:\/\/[^\s]+)/g, '$1');
  out = out.replace(/^\s*(<<<|>>>|\|\|\|)\s*(.*?)\s*\1\s*$/gm, '$1 $2');
  out = out.replace(/\[\[(?:BigText|SmallText|TinyText|Text[\d.]*)\]\]/gi, '');
  return out;
}
function legacyImageValue(value) {
  if (value.includes('|')) return value;
  const comma = value.indexOf(',');
  if (comma < 0) return value.trim();
  return `${value.slice(0, comma).trim()} | ${value.slice(comma + 1).trim()}`;
}
function translateLegacySimpleLine(line) {
  const directive = oldDirective(line);
  if (!directive) {
    const imageLike = line.trim().match(/^(.+\.(?:png|jpe?g|gif|webp|svg)(?:\?.*)?)\s*,\s*(.+)$/i);
    if (imageLike) return `Image: ${imageLike[1]} | ${translateLegacyLinks(imageLike[2])}`;
    return translateLegacyLinks(line);
  }
  const value = translateLegacyLinks(directive.value);
  if (directive.name === 'fullscreenimage') return `Background(full): ${value}`;
  if (directive.name === 'fullscreenwebsite') return `Website: ${value}`;
  if (directive.name === 'notes') return `Aside: ${value}`;
  if (directive.name === 'blockquote') return `Quote${directive.arg ? `(${directive.arg})` : ''}: ${value}`;
  if (directive.name === 'image') return `Image: ${legacyImageValue(value)}`;
  if (/^text(?:\d|\.)/i.test(directive.rawName) && directive.name !== 'text') {
    const scale = directive.rawName.slice(4);
    return `Text(${scale}): ${value}`;
  }
  const nameMap = {bigtext:'BigText', text:'Text', smalltext:'SmallText', tinytext:'TinyText', title:'Title', header:'Header', break:'Break', background:'Background'};
  return nameMap[directive.name] ? `${nameMap[directive.name]}: ${value}` : translateLegacyLinks(line);
}
function collectLegacyContainer(lines, startIndex) {
  const collected = [];
  let index = startIndex;
  while (index < lines.length) {
    if (!lines[index].trim()) {
      let next = index + 1;
      while (next < lines.length && !lines[next].trim()) next++;
      if (next < lines.length && oldDirective(lines[next])) break;
    }
    collected.push(lines[index]);
    index++;
  }
  return {lines:collected, nextIndex:index};
}
function translateLegacyColumns(contentLines) {
  const segments = [];
  const widths = [];
  let buffer = [];
  contentLines.forEach(line => {
    if (/^\s*----\s*$/.test(line)) {
      segments.push(buffer); widths.push(2); buffer = [];
    } else if (/^\s*---\s*$/.test(line)) {
      segments.push(buffer); widths.push(1); buffer = [];
    } else buffer.push(line);
  });
  segments.push(buffer); widths.push(1);
  const body = [`Columns(${widths.join(',')}):`];
  segments.forEach((segment, index) => {
    segment.forEach(line => body.push(translateLegacySimpleLine(line)));
    if (index < segments.length - 1) body.push('---');
  });
  body.push('End');
  return body;
}
function translateLegacyTable(contentLines) {
  const output = ['Table(header=1):'];
  contentLines.forEach(line => {
    if (/^\s*---\s*$/.test(line)) return;
    const math = maskMathSegments(line);
    const converted = math.masked.replace(/\s*&\s*/g, ' | ');
    output.push(restoreMathSegments(converted, math.tokens));
  });
  output.push('End');
  return output;
}
function translateLegacySlide(raw, index, deck) {
  const lines = cleanText(raw).split('\n');
  const body = [];
  let id = '';
  let hidden = false;
  let speaker = '';
  let print = '';
  let logo = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const directive = oldDirective(line);
    if (!directive) { body.push(translateLegacyLinks(line)); i++; continue; }
    if (directive.name === 'columns' || directive.name === 'table') {
      const container = collectLegacyContainer(lines, i + 1);
      body.push(...(directive.name === 'columns' ? translateLegacyColumns(container.lines) : translateLegacyTable(container.lines)));
      i = container.nextIndex;
      continue;
    }
    const parts = [directive.value];
    i++;
    while (i < lines.length && !oldDirective(lines[i])) {
      parts.push(lines[i]);
      i++;
    }
    const value = parts.join('\n').trim();
    if (directive.name === 'hidden') hidden = value.toLowerCase() === 'true';
    else if (directive.name === 'ref') id = slugify(value, `slide-${index + 1}`);
    else if (directive.name === 'speakernote') speaker = translateLegacyLinks(value);
    else if (directive.name === 'printnote') print = translateLegacyLinks(value);
    else if (directive.name === 'logo') logo = value;
    else {
      let reconstructed = `${directive.rawName}${directive.arg ? `(${directive.arg})` : ''}: ${value}`;
      if (directive.name === 'image') reconstructed = `Image: ${legacyImageValue(translateLegacyLinks(value))}`;
      else if (directive.name === 'fullscreenimage') reconstructed = `Background(full): ${translateLegacyLinks(value)}`;
      else if (directive.name === 'fullscreenwebsite') reconstructed = `Website: ${translateLegacyLinks(value)}`;
      else if (directive.name === 'notes') reconstructed = `Aside: ${translateLegacyLinks(value)}`;
      else if (directive.name === 'blockquote') reconstructed = `Quote${directive.arg ? `(${directive.arg})` : ''}: ${translateLegacyLinks(value)}`;
      else if (/^text(?:\d|\.)/i.test(directive.rawName) && directive.name !== 'text') reconstructed = `Text(${directive.rawName.slice(4)}): ${translateLegacyLinks(value)}`;
      else reconstructed = translateLegacySimpleLine(reconstructed);
      body.push(reconstructed);
    }
  }
  const parsed = parseBody(body.join('\n').replace(/\n{3,}/g, '\n\n'));
  const title = parsed.blocks.find(block => block.type === 'title')?.content || `Slide ${index + 1}`;
  const slide = {
    id: id || nextSlideId(deck),
    hidden,
    layout:'auto',
    background:parsed.background,
    header:parsed.header,
    aside:parsed.aside,
    speaker,
    print,
    steps:parsed.steps,
    blocks:parsed.blocks
  };
  return {slide, logo};
}
function importLegacyDeck(text, filename = 'Imported Presentation') {
  const source = cleanText(text).replace(/^\s*Format\s*:\s*1\s*$/im, '');
  const firstSlide = source.search(/^#\s*Slide\(\d+\)\s*:\s*$/m);
  const metadataText = firstSlide >= 0 ? source.slice(0, firstSlide) : '';
  const content = firstSlide >= 0 ? source.slice(firstSlide) : `# Slide(1):\n${source}`;
  const meta = defaultMeta(filename.replace(/\.(json|txt)$/i, '') || 'Imported Presentation');
  metadataText.split('\n').forEach(line => {
    const match = line.match(/^\s*(Title|Theme|ShowSlideCount|LogoUrl)\s*:\s*(.*)$/i);
    if (!match) return;
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    if (key === 'title') meta.title = value;
    if (key === 'theme') meta.theme = THEME_IDS.some(([id]) => id === value) ? value : 'tufte';
    if (key === 'showslidecount') meta.pageNumbers = value.toLowerCase() !== 'false';
    if (key === 'logourl') meta.logo = value || null;
  });
  const chunks = content.split(/^#\s*Slide\(\d+\)\s*:\s*$/m).filter(chunk => chunk.trim());
  const deck = {format:FORMAT, version:VERSION, meta, assets:{}, slides:[]};
  chunks.forEach((chunk, index) => {
    const translated = translateLegacySlide(chunk.trim(), index, deck);
    deck.slides.push(translated.slide);
    if (translated.logo) deck.meta.logo = translated.logo;
  });
  return normalizeDeck(deck);
}

/* ---------- Deck loading ---------- */
function deckFromText(text, filename = 'presentation') {
  const source = String(text || '').trim();
  if (!source) throw new Error('The deck file is empty.');
  if (source.startsWith('{')) {
    const parsed = JSON.parse(source);
    validateDeckInput(parsed);
    return normalizeDeck(parsed);
  }
  return importLegacyDeck(source, filename);
}
async function applyDeck(deck, {filename = 'presentation.json', baseUrl = state.baseUrl, preservePrevious = true, requestedSlideId = null, fileHandle = null} = {}) {
  if (state.editMode && state.deck) commitEditor({record:false});
  if (preservePrevious && state.deck) await preserveCurrentAsPrevious();
  state.deck = normalizeDeck(deck);
  state.filename = filename;
  state.fileHandle = fileHandle;
  state.baseUrl = baseUrl || new URL('.', location.href).href;
  const savedId = requestedSlideId || storageGet(STORAGE_SLIDE);
  state.currentSlideId = state.deck.slides.some(slide => slide.id === savedId) ? savedId : state.deck.slides[0].id;
  state.currentStep = 0;
  state.undoStack = [];
  state.redoStack = [];
  state.dirty = false;
  loadEditorsFromCurrent();
  autosave();
  await scheduleRender('load');
}
async function loadFile(file, {fileHandle = null} = {}) {
  const text = await file.text();
  const deck = deckFromText(text, file.name);
  await applyDeck(deck, {filename:file.name.replace(/\.(txt|json)$/i, '') + '.json', baseUrl:new URL('.', location.href).href, fileHandle});
}
function candidateUrls(deckValue) {
  const value = String(deckValue || '').trim();
  if (!value) return [];
  const hasSlash = value.includes('/');
  const hasExtension = /\.[A-Za-z0-9]+(?:[?#].*)?$/.test(value);
  if (!hasSlash && !hasExtension) return [`${value}/${value}.json`, `${value}/${value}.txt`];
  if (!hasExtension) return [value, `${value}.json`, `${value}.txt`];
  return [value];
}
async function loadFromQuery(deckValue) {
  let lastError = null;
  for (const candidate of candidateUrls(deckValue)) {
    try {
      const absolute = new URL(candidate, location.href);
      const response = await fetch(absolute.href, {cache:'no-store'});
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const text = await response.text();
      const leaf = absolute.pathname.split('/').pop() || 'presentation.txt';
      const deck = deckFromText(text, leaf);
      await applyDeck(deck, {filename:leaf.replace(/\.(txt|json)$/i, '') + '.json', baseUrl:new URL('.', absolute.href).href, preservePrevious:true, fileHandle:null});
      return true;
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('Could not load the requested deck.');
}
function fallbackDownloadDeck(text) {
  const blob = new Blob([text], {type:'application/json'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  const title = slugify(state.deck.meta.title, 'presentation');
  link.download = state.filename?.endsWith('.json') ? state.filename : `${title}.json`;
  document.body.appendChild(link); link.click();
  window.setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 0);
}
async function canWriteHandle(handle) {
  if (!handle) return false;
  try {
    if ((await handle.queryPermission?.({mode:'readwrite'})) === 'granted') return true;
    return (await handle.requestPermission?.({mode:'readwrite'})) === 'granted';
  } catch { return true; }
}
async function saveDeck() {
  if (state.editMode) commitEditor({record:true});
  const text = JSON.stringify(state.deck, null, 2);
  try {
    let handle = state.fileHandle;
    if (!handle && 'showSaveFilePicker' in window) {
      handle = await window.showSaveFilePicker({
        suggestedName: state.filename?.endsWith('.json') ? state.filename : `${slugify(state.deck.meta.title,'presentation')}.json`,
        types:[{description:'ModernSlides JSON', accept:{'application/json':['.json']}}]
      });
    }
    if (handle && await canWriteHandle(handle)) {
      const writable = await handle.createWritable();
      await writable.write(text); await writable.close();
      state.fileHandle = handle;
      state.filename = handle.name || state.filename;
      storageSet(STORAGE_CURRENT_NAME, state.filename);
      setStatus(`Saved ${state.filename}`, 'saved');
      return;
    }
  } catch (error) {
    if (error?.name === 'AbortError') return;
    console.warn('Save File Picker failed; falling back to download.', error);
  }
  fallbackDownloadDeck(text);
  setStatus('Downloaded deck', 'saved');
}
function normalizePublishName(value) {
  let name = String(value ?? '').trim();

  name = name.replace(/\.json$/i, '');
  name = name.replace(/\s+/g, '-');
  name = name.replace(/[^A-Za-z0-9_-]+/g, '-');
  name = name.replace(/-+/g, '-');
  name = name.replace(/^[-_]+|[-_]+$/g, '');

  return name.slice(0, 64);
}

function defaultPublishName() {
  const filename = String(state.filename || '')
    .split(/[\\/]/)
    .pop()
    .replace(/\.(json|txt)$/i, '');

  return (
    normalizePublishName(filename) ||
    normalizePublishName(state.deck?.meta?.title) ||
    'presentation'
  );
}

function publishNameFromField() {
  return normalizePublishName($('publish-name').value);
}

function updatePublishDestination() {
  const name = publishNameFromField();

  $('publish-destination').textContent = name
    ? `ModernSlides/${name}/${name}.json`
    : 'ModernSlides/…/….json';
}

function setPublishError(message = '') {
  const target = $('publish-error');
  target.textContent = message;
  target.classList.toggle('hidden', !message);
}

function openPublishDialog() {
  if (state.editMode) commitEditor({record:true});

  $('publish-name').value = defaultPublishName();

  setPublishError('');
  updatePublishDestination();
  openModal('publish-modal');

  requestAnimationFrame(() => {
    $('publish-name').focus();
    $('publish-name').select();
  });
}

function authorizePublishing() {
  return new Promise((resolve, reject) => {
    const popup = window.open(
      PUBLISH_LOGIN_URL,
      'ModernSlidesPublishLogin',
      'popup=yes,width=520,height=600'
    );

    if (!popup) {
      reject(
        new Error(
          'The browser blocked the publishing authorization window. Allow popups for this site and try again.'
        )
      );
      return;
    }

    let finished = false;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearInterval(closeWatcher);
      clearTimeout(timeout);
    };

    const finish = (result, error = null) => {
      if (finished) return;
      finished = true;
      cleanup();

      if (error) reject(error);
      else resolve(result);
    };

    const onMessage = event => {
      if (event.origin !== location.origin) return;
      if (event.source !== popup) return;
      if (event.data?.type !== 'modernslides-publish-auth') return;

      finish(true);
    };

    window.addEventListener('message', onMessage);

    const closeWatcher = window.setInterval(() => {
      if (popup.closed) {
        finish(
          false,
          new Error('Publishing authorization was cancelled.')
        );
      }
    }, 300);

    const timeout = window.setTimeout(() => {
      try {
        popup.close();
      } catch {}

      finish(
        false,
        new Error('Publishing authorization timed out.')
      );
    }, 180000);
  });
}

async function sendPublishedDeck(name) {
  const controller = new AbortController();

  const timeout = window.setTimeout(
    () => controller.abort(),
    90000
  );

  try {
    return await fetch(PUBLISH_URL, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-ModernSlides-Publish': '1',
        'X-ModernSlides-Name': name
      },
      body: JSON.stringify(state.deck, null, 2)
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function publishDeck() {
  setPublishError('');

  if (location.protocol !== 'https:') {
    setPublishError(
      'Publishing is available only when ModernSlides is running from this website over HTTPS.'
    );
    return;
  }

  if (state.editMode) commitEditor({record:true});

  const name = publishNameFromField();

  if (!name) {
    setPublishError('Enter a filename for the published deck.');
    return;
  }

  if (name.toLowerCase() === 'api') {
    setPublishError('"api" is reserved and cannot be used as a deck name.');
    return;
  }

  /*
   * Put the normalized value back into the field so the user sees
   * exactly what will be used.
   */
  $('publish-name').value = name;
  updatePublishDestination();

  const button = $('confirm-publish');
  button.disabled = true;
  button.textContent = 'Publishing…';

  try {
    /*
     * On the first publish after loading index.html, authorize first.
     *
     * If the server session from a previous page load is still alive,
     * login.php notices that and immediately closes itself, so this
     * remains quick.
     */
    if (!state.publishAuthenticated) {
      await authorizePublishing();
      state.publishAuthenticated = true;
    }

    setStatus(`Publishing ${name}…`, 'working');

    const response = await sendPublishedDeck(name);

    let result = null;

    try {
      result = await response.json();
    } catch {}

    if (response.status === 401) {
      /*
       * Do not attempt to open a popup here, because this response
       * arrives after the original user gesture and some browsers
       * would block it.
       */
      state.publishAuthenticated = false;

      throw new Error(
        'Publishing authorization expired. Press Publish again to re-authorize.'
      );
    }

    if (!response.ok) {
      throw new Error(
        result?.error ||
        `The server returned HTTP ${response.status}.`
      );
    }

    closeModal('publish-modal');

    setStatus(
      `Published ${name}/${name}.json`,
      'saved'
    );

  } catch (error) {
    console.error('Publishing failed:', error);

    const message =
      error?.name === 'AbortError'
        ? 'Publishing timed out.'
        : error?.message || 'Publishing failed.';

    setPublishError(message);
    setStatus(`Publish failed: ${message}`, 'error');

  } finally {
    button.disabled = false;
    button.textContent = 'Publish';
  }
}
async function openDeck() {
  if ('showOpenFilePicker' in window) {
    try {
      const [handle] = await window.showOpenFilePicker({multiple:false, types:[{description:'ModernSlides deck', accept:{'application/json':['.json'], 'text/plain':['.txt']}}]});
      if (!handle) return;
      await loadFile(await handle.getFile(), {fileHandle:handle});
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.warn('Open File Picker failed; using file input.', error);
    }
  }
  $('file-input').click();
}

/* ---------- Assets ---------- */
function blobAsDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read image.'));
    reader.readAsDataURL(blob);
  });
}
async function prepareImageAsset(file, maxDimension = 1600) {
  if (!/^image\/(?:png|jpe?g|webp)$/i.test(file.type || '')) return {data:await blobAsDataURL(file), type:file.type || 'image/*'};
  let bitmap = null;
  try { bitmap = await createImageBitmap(file); } catch {}
  if (!bitmap) return {data:await blobAsDataURL(file), type:file.type || 'image/*'};
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  if (scale >= .999) { bitmap.close?.(); return {data:await blobAsDataURL(file), type:file.type || 'image/*'}; }
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  canvas.getContext('2d', {alpha:true}).drawImage(bitmap, 0, 0, width, height); bitmap.close?.();
  const outputType = /jpe?g/i.test(file.type) ? 'image/jpeg' : /webp/i.test(file.type) ? 'image/webp' : 'image/png';
  const blob = await new Promise(resolve => canvas.toBlob(resolve, outputType, .9));
  if (!blob) return {data:await blobAsDataURL(file), type:file.type || 'image/*'};
  return {data:await blobAsDataURL(blob), type:outputType};
}
async function addImageAsset(file) {
  const id = uid('image');
  const prepared = await prepareImageAsset(file, 1600);
  state.deck.assets[id] = {name:file.name || 'pasted-image', type:prepared.type, data:prepared.data};
  return id;
}
function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  const before = textarea.value.slice(0, start);
  const prefix = before && !before.endsWith('\n') ? '\n' : '';
  const insertion = prefix + text + (textarea.value.slice(end).startsWith('\n') ? '' : '\n');
  textarea.setRangeText(insertion, start, end, 'end');
  textarea.dispatchEvent(new Event('input', {bubbles:true}));
}
async function handleImageFiles(files) {
  const images = [...files].filter(file => file.type.startsWith('image/'));
  if (!images.length) return;
  const lines = [];
  for (const file of images) {
    const id = await addImageAsset(file);
    lines.push(`Image: asset:${id} | ${file.name || 'Image'}`);
  }
  insertAtCursor($('body-editor'), lines.join('\n'));
}
function referencedAssetIds() {
  const text = JSON.stringify(state.deck.slides) + JSON.stringify(state.deck.meta);
  return new Set([...text.matchAll(/asset:([A-Za-z0-9_-]+)/g)].map(match => match[1]));
}
function showAssetManager() {
  const list = $('asset-list');
  list.replaceChildren();
  const used = referencedAssetIds();
  const entries = Object.entries(state.deck.assets || {});
  if (!entries.length) list.innerHTML = '<p>No embedded images.</p>';
  entries.forEach(([id, asset]) => {
    const row = document.createElement('div');
    row.className = 'asset-row';
    const img = document.createElement('img'); img.src = asset.data; img.alt = '';
    const meta = document.createElement('div'); meta.className = 'asset-meta';
    const sizeKb = Math.round((asset.data.length * .75) / 1024);
    meta.innerHTML = `<div class="asset-name">asset:${escapeHtml(id)}</div><div class="asset-info">${escapeHtml(asset.name || '')} · ${sizeKb} KB · ${used.has(id) ? 'in use' : 'unused'}</div>`;
    const del = document.createElement('button'); del.type = 'button'; del.textContent = 'Delete'; del.disabled = used.has(id);
    del.addEventListener('click', () => {
      if (!confirm(`Delete ${asset.name || id}?`)) return;
      pushUndo(); delete state.deck.assets[id]; autosave(); scheduleRender('asset-delete'); showAssetManager();
    });
    row.append(img, meta, del); list.appendChild(row);
  });
  openModal('assets-modal');
}

/* ---------- Demo deck ---------- */
const SCHUMPETER_DEMO_V2 = {
  "format": "modernslides",
  "version": 2,
  "meta": {
    "title": "SchumpeterDemo",
    "theme": "bauhaus",
    "author": "",
    "date": "",
    "footer": "",
    "pageNumbers": true,
    "logo": null
  },
  "assets": {},
  "slides": [
    {
      "id": "on-mr-schumpeter",
      "hidden": false,
      "layout": "auto",
      "background": null,
      "header": "",
      "aside": "",
      "speaker": "",
      "print": "This deck demonstrates the new JSON-backed ModernSlides. The visible syntax compiles to a canonical block model, while the theme handles the design.",
      "steps": 0,
      "blocks": [
        {
          "type": "title",
          "content": "On Mr. Schumpeter",
          "step": 0
        },
        {
          "type": "text",
          "size": "big",
          "content": "\"Creative Destruction\" is the essential fact about capitalism. And the essential fact about slideshow programs!",
          "step": 0
        },
        {
          "type": "break",
          "lines": 1.5,
          "step": 0
        },
        {
          "type": "text",
          "size": "tiny",
          "content": "ModernSlides JSON Demo",
          "step": 0
        }
      ]
    },
    {
      "id": "slide-2",
      "hidden": false,
      "layout": "auto",
      "background": null,
      "header": "",
      "aside": "",
      "speaker": "",
      "print": "Numbered lists, text roles, italics, bold, and bold italic are all theme-controlled.",
      "steps": 0,
      "blocks": [
        {
          "type": "text",
          "size": "big",
          "content": "Why is Progress Slow?",
          "step": 0
        },
        {
          "type": "list",
          "ordered": true,
          "size": "big",
          "items": [
            {
              "content": "***New Things are Hard:*** Innovation makes old skills and capital obsolete.",
              "number": 1
            },
            {
              "content": "***Old Things Protect:*** Society builds bottlenecks to prevent danger.",
              "number": 2
            }
          ],
          "step": 0,
          "start": 1,
          "progressive": false
        },
        {
          "type": "break",
          "lines": 1,
          "step": 0
        },
        {
          "type": "text",
          "size": "normal",
          "content": "*Is this why we use PowerPoint and Beamer?*",
          "step": 0
        }
      ]
    },
    {
      "id": "slide-3",
      "hidden": false,
      "layout": "auto",
      "background": null,
      "header": "",
      "aside": "[Jump to Bigimage](#bigimage)",
      "speaker": "",
      "print": "Math and tables use the same canonical frame in every output.",
      "steps": 0,
      "blocks": [
        {
          "type": "text",
          "size": "normal",
          "content": "Consider a task.",
          "step": 0
        },
        {
          "type": "table",
          "widths": [],
          "headerRows": 1,
          "headerCols": 0,
          "rows": [
            [
              "Period",
              "Fast",
              "Slow",
              "Total",
              "Impact"
            ],
            [
              "$t=0$",
              "20 hrs",
              "80 hrs",
              "100",
              "Baseline"
            ],
            [
              "$t=1$",
              "10 hrs",
              "80 hrs",
              "90",
              "$\\Delta 10\\%$"
            ],
            [
              "$t=2$",
              "5 hrs",
              "80 hrs",
              "85",
              "$\\Delta 5.5\\%$"
            ],
            [
              "$t=\\infty$",
              "$\\lim_{x \\to 0}=0$",
              "80 hrs",
              "80",
              "**Stagnation**"
            ]
          ],
          "step": 0,
          "columnAlign": []
        }
      ]
    },
    {
      "id": "slide-4",
      "hidden": false,
      "layout": "auto",
      "background": null,
      "header": "",
      "aside": "",
      "speaker": "",
      "print": "Columns recursively use the same block parser as the slide body.",
      "steps": 0,
      "blocks": [
        {
          "type": "columns",
          "widths": [
            1,
            1
          ],
          "valign": "center",
          "columns": [
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Portrait_of_Thomas_Midgley_Jr..jpg/500px-Portrait_of_Thomas_Midgley_Jr..jpg",
                  "caption": "[Thomas Midgley Jr.](https://en.wikipedia.org/wiki/Thomas_Midgley_Jr.)",
                  "width": "100%",
                  "fit": "contain",
                  "focus": "center",
                  "step": 0
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/EthylCorporationSign.jpg/960px-EthylCorporationSign.jpg",
                  "caption": "Leaded Gasoline",
                  "width": "100%",
                  "fit": "contain",
                  "focus": "center",
                  "step": 0
                }
              ]
            }
          ],
          "step": 0
        }
      ]
    },
    {
      "id": "slide-5",
      "hidden": false,
      "layout": "auto",
      "background": null,
      "header": "",
      "aside": "",
      "speaker": "",
      "print": "The editor thumbnail and printed handout use a deterministic poster. Presentation mode and the current speaker preview load the live embedded website automatically.",
      "steps": 0,
      "blocks": [
        {
          "type": "website",
          "src": "https://www.youtube.com/embed/JQ8ZiT1sn88",
          "poster": "",
          "step": 0
        }
      ]
    },
    {
      "id": "the-baumol-effect",
      "hidden": false,
      "layout": "auto",
      "background": null,
      "header": "",
      "aside": "",
      "speaker": "",
      "print": "Blockquotes and attributions are semantic blocks styled by the theme.",
      "steps": 0,
      "blocks": [
        {
          "type": "title",
          "content": "The Baumol Effect",
          "step": 0
        },
        {
          "type": "quote",
          "content": "The output per man-hour of the violinist playing a Schubert quartet in a standard concert hall is relatively fixed, and it is fairly difficult to reduce the number of actors necessary for a performance of Henry IV.",
          "source": "Baumol and Bowen",
          "step": 0
        }
      ]
    },
    {
      "id": "slide-7",
      "hidden": false,
      "layout": "auto",
      "background": null,
      "header": "",
      "aside": "",
      "speaker": "",
      "print": "The old four-dash double-width syntax is translated once into explicit JSON column widths.",
      "steps": 0,
      "blocks": [
        {
          "type": "columns",
          "widths": [
            2,
            1
          ],
          "valign": "center",
          "columns": [
            {
              "blocks": [
                {
                  "type": "text",
                  "size": "big",
                  "content": "But we can sometimes do useful things more quickly if we do it ourselves!",
                  "step": 0
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "image",
                  "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Katalin_Karik%C3%B3_by_Michel_2024_02.jpg/500px-Katalin_Karik%C3%B3_by_Michel_2024_02.jpg",
                  "caption": "Katalin Karikó",
                  "width": "100%",
                  "fit": "contain",
                  "focus": "center",
                  "step": 0
                }
              ]
            }
          ],
          "step": 0
        }
      ]
    },
    {
      "id": "two-timelines",
      "hidden": false,
      "layout": "auto",
      "background": null,
      "header": "Comparison",
      "aside": "",
      "speaker": "Use S to open the speaker window.",
      "print": "The speaker and print notes are separate JSON fields and cannot affect slide layout.",
      "steps": 0,
      "blocks": [
        {
          "type": "title",
          "content": "Two Timelines",
          "step": 0
        },
        {
          "type": "columns",
          "widths": [
            1,
            1
          ],
          "valign": "center",
          "columns": [
            {
              "blocks": [
                {
                  "type": "text",
                  "size": "normal",
                  "content": "**Covid Vaccine (mRNA-1273)**",
                  "step": 0
                },
                {
                  "type": "list",
                  "ordered": true,
                  "size": "normal",
                  "items": [
                    {
                      "content": "Genome ready: Jan 10",
                      "number": 1
                    },
                    {
                      "content": "Human Trial: Mar 16",
                      "number": 2
                    },
                    {
                      "content": "Phase 3: Jul 27",
                      "number": 3
                    },
                    {
                      "content": "Approval: Dec 18",
                      "number": 4
                    }
                  ],
                  "step": 0,
                  "start": 1,
                  "progressive": false
                },
                {
                  "type": "text",
                  "size": "normal",
                  "content": "*Be like this*",
                  "step": 0
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "text",
                  "size": "normal",
                  "content": "**Malaria Vaccine (BNT165)**",
                  "step": 0
                },
                {
                  "type": "list",
                  "ordered": true,
                  "size": "normal",
                  "items": [
                    {
                      "content": "Genome: Long known",
                      "number": 1
                    },
                    {
                      "content": "Dev Start: Jul 2021",
                      "number": 2
                    },
                    {
                      "content": "Human Trial: Dec 2022",
                      "number": 3
                    },
                    {
                      "content": "Phase 3: Not started",
                      "number": 4
                    }
                  ],
                  "step": 0,
                  "start": 1,
                  "progressive": false
                },
                {
                  "type": "text",
                  "size": "normal",
                  "content": "*Why be slower?*",
                  "step": 0
                }
              ]
            }
          ],
          "step": 0
        }
      ]
    },
    {
      "id": "step-regions",
      "hidden": false,
      "layout": "data",
      "background": null,
      "header": "Progressive reveal",
      "aside": "",
      "speaker": "Start at step zero: the left column and the line below are visible. Advance once to reveal only the right column.",
      "print": "Explicit [Step N] regions can be placed inside a column. Hidden content keeps its layout space, so nothing moves when it appears.",
      "steps": 1,
      "blocks": [
        {
          "type": "title",
          "content": "Reveal one column",
          "step": 0
        },
        {
          "type": "columns",
          "widths": [
            2,
            1
          ],
          "valign": "top",
          "columns": [
            {
              "blocks": [
                {
                  "type": "text",
                  "size": "big",
                  "content": "Left column is visible immediately.",
                  "step": 0
                },
                {
                  "type": "text",
                  "size": "small",
                  "content": "It is deliberately twice as wide.",
                  "step": 0
                }
              ]
            },
            {
              "blocks": [
                {
                  "type": "text",
                  "size": "normal",
                  "content": "Right column appears on the first advance.",
                  "step": 1
                },
                {
                  "type": "text",
                  "size": "small",
                  "content": "Its space is reserved before it appears.",
                  "step": 1
                }
              ]
            }
          ],
          "step": 0
        },
        {
          "type": "text",
          "size": "normal",
          "content": "This line below both columns is visible from the beginning.",
          "step": 0
        }
      ]
    },
    {
      "id": "slide-9",
      "hidden": false,
      "layout": "auto",
      "background": null,
      "header": "",
      "aside": "",
      "speaker": "",
      "print": "Variable legacy text sizes are imported as numeric Text(size) blocks.",
      "steps": 0,
      "blocks": [
        {
          "type": "text",
          "size": 2.4,
          "content": "\"You can just do things.\"",
          "step": 0,
          "align": "right"
        },
        {
          "type": "text",
          "size": "big",
          "content": "No sense just using **software** you always used.",
          "step": 0
        },
        {
          "type": "text",
          "size": "normal",
          "content": "Why not slides that separate **content** from **design**?",
          "step": 0
        },
        {
          "type": "text",
          "size": "small",
          "content": "And let you type the slides very quickly?",
          "step": 0
        },
        {
          "type": "text",
          "size": "tiny",
          "content": "(See: Laws of Fear, Cambridge University Press, 2005)",
          "step": 0
        }
      ]
    },
    {
      "id": "slide-10",
      "hidden": false,
      "layout": "auto",
      "background": {
        "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/St_Pancras_Railway_Station_2012-06-23.jpg/960px-St_Pancras_Railway_Station_2012-06-23.jpg",
        "mode": "full"
      },
      "header": "",
      "aside": "",
      "speaker": "",
      "print": "Full-screen images use the same frame background in preview, presentation, speaker view, and print.",
      "steps": 0,
      "blocks": []
    },
    {
      "id": "bigimage",
      "hidden": false,
      "layout": "auto",
      "background": {
        "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/St_Pancras_Railway_Station_2012-06-23.jpg/960px-St_Pancras_Railway_Station_2012-06-23.jpg",
        "mode": "tint"
      },
      "header": "",
      "aside": "",
      "speaker": "",
      "print": "Tinted background images are frame-owned, so print cannot lose the theme background.",
      "steps": 0,
      "blocks": [
        {
          "type": "title",
          "content": "We can build beautiful things again",
          "step": 0
        }
      ]
    },
    {
      "id": "slide-12",
      "hidden": false,
      "layout": "auto",
      "background": null,
      "header": "Indeed, when the slideshow is in the browser, you can browse...",
      "aside": "",
      "speaker": "",
      "print": "Websites use a deterministic poster in thumbnails and print, and load live automatically in presentation mode.",
      "steps": 0,
      "blocks": [
        {
          "type": "website",
          "src": "https://www.kevinbryanecon.com/tools.html",
          "poster": "",
          "step": 0
        }
      ]
    }
  ]
};

function buildSchumpeterDemoDeck() { return normalizeDeck(deepClone(SCHUMPETER_DEMO_V2)); }

/* ---------- Editor utilities and UI ---------- */
function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }
function wrapSelection(open, close = open) {
  const textarea = $('body-editor');
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end);
  textarea.setRangeText(open + selected + close, start, end, 'select');
  textarea.selectionStart = start + open.length;
  textarea.selectionEnd = end + open.length;
  textarea.dispatchEvent(new Event('input', {bubbles:true}));
  textarea.focus();
}
function setAlignOnDirectiveLine(line, align) {
  const match = String(line).match(/^(\s*)([A-Za-z][A-Za-z0-9]*)(?:\((.*?)\))?(\s*:\s*)(.*)$/);
  if (!match || !DIRECTIVES.has(match[2].toLowerCase())) return line;
  const chunks = String(match[3] || '').split(/\s*;\s*/).filter(Boolean).filter(chunk => !/^align\s*=/i.test(chunk));
  chunks.push(`align=${align}`);
  const value = match[5].replace(/^\s*(?:<<<|\|\|\||>>>)\s+/, '');
  return `${match[1]}${match[2]}(${chunks.join('; ')})${match[4]}${value}`;
}
function alignSelection(align) {
  const textarea = $('body-editor');
  const value = textarea.value;
  const selectionStart = textarea.selectionStart;
  const selectionEnd = textarea.selectionEnd;
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const endBreak = value.indexOf('\n', selectionEnd);
  const lineEnd = endBreak < 0 ? value.length : endBreak;
  const sourceLines = value.slice(lineStart, lineEnd).split('\n');
  let changed = false;
  const selectedLines = sourceLines.map(line => {
    const next = setAlignOnDirectiveLine(line, align);
    if (next !== line) changed = true;
    return next;
  });
  if (changed) {
    const replacement = selectedLines.join('\n');
    textarea.setRangeText(replacement, lineStart, lineEnd, 'select');
    textarea.selectionStart = lineStart;
    textarea.selectionEnd = lineStart + replacement.length;
  } else {
    const beforeText = value.slice(0, lineStart);
    const beforeLines = beforeText.split('\n');
    let target = beforeLines.length - 1;
    while (target >= 0 && !matchDirective(beforeLines[target])) {
      if (!beforeLines[target].trim()) break;
      target--;
    }
    if (target >= 0 && matchDirective(beforeLines[target])) {
      const oldLine = beforeLines[target];
      const newLine = setAlignOnDirectiveLine(oldLine, align);
      const delta = newLine.length - oldLine.length;
      beforeLines[target] = newLine;
      const rebuiltBefore = beforeLines.join('\n');
      textarea.value = rebuiltBefore + value.slice(lineStart);
      textarea.selectionStart = selectionStart + delta;
      textarea.selectionEnd = selectionEnd + delta;
    } else return;
  }
  textarea.dispatchEvent(new Event('input', {bubbles:true}));
  textarea.focus();
}
function expandSingleLetterShortcut(event) {
  if (event.key !== ':') return;
  const textarea = event.currentTarget;
  const cursor = textarea.selectionStart;
  if (cursor !== textarea.selectionEnd) return;
  const lineStart = textarea.value.lastIndexOf('\n', cursor - 1) + 1;
  const current = textarea.value.slice(lineStart, cursor);
  if (current.length !== 1) return;
  const map = {
    t:'Title: ', b:'BigText: ', x:'Text: ', s:'SmallText: ', y:'TinyText: ',
    I:'Image: ', q:'Quote(): ', W:'Website: ', F:'Background(full): ',
    C:'Columns():\n\nEnd', T:'Table(header=1):\n\nEnd', h:'Header: ', a:'Aside: '
  };
  const replacement = map[current];
  if (!replacement) return;
  event.preventDefault();
  textarea.setRangeText(replacement, lineStart, cursor, 'end');
  textarea.dispatchEvent(new Event('input', {bubbles:true}));
}
function setNotesTab(tab) {
  state.activeNotesTab = tab;
  $('speaker-tab').classList.toggle('active', tab === 'speaker');
  $('print-tab').classList.toggle('active', tab === 'print');
  $('speaker-editor').classList.toggle('hidden', tab !== 'speaker');
  $('print-editor').classList.toggle('hidden', tab !== 'print');
}
function openSettings() {
  $('setting-title').value = state.deck.meta.title || '';
  $('setting-author').value = state.deck.meta.author || '';
  $('setting-date').value = state.deck.meta.date || '';
  $('setting-footer').value = state.deck.meta.footer || '';
  $('setting-logo').value = state.deck.meta.logo || '';
  openModal('settings-modal');
}
function saveSettings() {
  if (state.editMode) commitEditor({record:true});
  const nextMeta = {
    ...state.deck.meta,
    title:$('setting-title').value.trim() || 'Untitled Presentation',
    author:$('setting-author').value.trim(),
    date:$('setting-date').value.trim(),
    footer:$('setting-footer').value.trim(),
    logo:$('setting-logo').value.trim() || null
  };
  if (JSON.stringify(nextMeta) !== JSON.stringify(state.deck.meta)) {
    pushUndo(); state.deck.meta = nextMeta; autosave(); scheduleRender('settings');
  }
  closeModal('settings-modal');
}
async function createNewDeck() {
  const title = prompt('Name the new presentation:', 'New Presentation');
  if (title == null) return;
  await applyDeck(freshDeck(title.trim() || 'New Presentation'), {filename:`${slugify(title,'presentation')}.json`, baseUrl:new URL('.', location.href).href, preservePrevious:true});
  toggleEdit(true);
}
async function restorePreviousDeck() {
  const previous = await deckStoreGet(STORAGE_PREVIOUS);
  if (!previous) return;
  if (!confirm('Restore the previous deck? The current deck will become the restore copy.')) return;
  if (state.editMode) commitEditor({record:false});
  const current = JSON.stringify(state.deck);
  const currentName = state.filename;
  const previousName = storageGet(STORAGE_PREVIOUS_NAME) || 'previous.json';
  await deckStoreSet(STORAGE_PREVIOUS, current);
  storageSet(STORAGE_PREVIOUS_NAME, currentName || 'current.json');
  await applyDeck(normalizeDeck(JSON.parse(previous)), {filename:previousName, preservePrevious:false, fileHandle:null});
}

/* ---------- Events ---------- */
function setupEvents() {
  $('add-slide').addEventListener('click', () => addSlideAfter());
  $('delete-slide').addEventListener('click', () => deleteSlide());
  $('duplicate-slide').addEventListener('click', () => duplicateSlide());
  $('toggle-hidden').addEventListener('click', toggleCurrentHidden);
  $('undo').addEventListener('click', undo);
  $('redo').addEventListener('click', redo);
  $('theme-select').addEventListener('change', event => setTheme(event.target.value));
  $('toggle-page-numbers').addEventListener('click', togglePageNumbers);
  $('deck-settings').addEventListener('click', openSettings);
  $('save-settings').addEventListener('click', saveSettings);
  $('help-button').addEventListener('click', () => openModal('help-modal'));
  $('new-deck').addEventListener('click', createNewDeck);
  $('load-deck').addEventListener('click', openDeck);
  $('restore-deck').addEventListener('click', restorePreviousDeck);
  $('manage-assets').addEventListener('click', showAssetManager);
  $('view-json').addEventListener('click', () => {
    if (state.editMode) commitEditor({record:true});
    $('json-view').value = JSON.stringify(state.deck, null, 2);
    openModal('json-modal');
  });
  $('save-deck').addEventListener('click', saveDeck);
  $('publish-deck').addEventListener('click', openPublishDialog);
  $('confirm-publish').addEventListener('click', publishDeck);
  $('publish-name').addEventListener('input', updatePublishDestination);

  $('publish-name').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      publishDeck();
    }
  });
  $('print-deck').addEventListener('click', () => preparePrint(false));
  $('print-notes').addEventListener('click', () => preparePrint(true));
  $('speaker-button').addEventListener('click', openSpeaker);
  $('present-button').addEventListener('click', () => toggleEdit(false));
  $('file-input').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try { await loadFile(file, {fileHandle:null}); }
    catch (error) { alert(`Could not load deck: ${error.message}`); }
  });

  document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.closeModal)));
  document.querySelectorAll('.modal').forEach(modal => modal.addEventListener('click', event => { if (event.target === modal) closeModal(modal.id); }));

  const editorChanged = () => {
    if (state.editorLoading) return;
    markDirty();
    debouncedCommit();
  };
  $('body-editor').addEventListener('input', editorChanged);
  $('speaker-editor').addEventListener('input', editorChanged);
  $('print-editor').addEventListener('input', editorChanged);
  $('slide-layout').addEventListener('change', () => commitEditor({record:true}));
  $('body-editor').addEventListener('blur', () => debouncedCommit.flush());
  $('speaker-editor').addEventListener('blur', () => debouncedCommit.flush());
  $('print-editor').addEventListener('blur', () => debouncedCommit.flush());
  $('body-editor').addEventListener('keydown', event => {
    const bold = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b';
    if (bold) {
      event.preventDefault();
      wrapSelection('**');
      return;
    }
    expandSingleLetterShortcut(event);
  });
  $('body-editor').addEventListener('paste', async event => {
    const images = [...(event.clipboardData?.items || [])].filter(item => item.type.startsWith('image/')).map(item => item.getAsFile()).filter(Boolean);
    if (!images.length) return;
    event.preventDefault();
    await handleImageFiles(images);
  });
  ['dragenter','dragover','dragleave','drop'].forEach(name => $('body-editor').addEventListener(name, event => { event.preventDefault(); event.stopPropagation(); }));
  $('body-editor').addEventListener('drop', async event => handleImageFiles(event.dataTransfer?.files || []));

  $('format-bar').addEventListener('mousedown', event => {
    if (event.target.closest('button')) event.preventDefault();
  });
  $('format-bar').addEventListener('click', event => {
    const button = event.target.closest('[data-format]');
    if (!button) return;
    const action = button.dataset.format;
    if (action === 'bold') wrapSelection('**');
    if (action === 'italic') wrapSelection('*');
    if (action === 'bolditalic') wrapSelection('***');
    if (action === 'left') alignSelection('left');
    if (action === 'center') alignSelection('center');
    if (action === 'right') alignSelection('right');
  });
  $('speaker-tab').addEventListener('click', () => setNotesTab('speaker'));
  $('print-tab').addEventListener('click', () => setNotesTab('print'));

  $('thumb-list').addEventListener('click', event => {
    const thumb = event.target.closest('.thumb');
    if (!thumb) return;
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'add') { event.stopPropagation(); addSlideAfter(thumb.dataset.slideId); return; }
    if (action === 'delete') { event.stopPropagation(); deleteSlide(thumb.dataset.slideId); return; }
    selectSlide(thumb.dataset.slideId);
  });
  let thumbAutoScrollFrame = 0;
  let thumbAutoScrollSpeed = 0;

  function stopThumbAutoScroll() {
    if (thumbAutoScrollFrame) {
      cancelAnimationFrame(thumbAutoScrollFrame);
      thumbAutoScrollFrame = 0;
    }
    thumbAutoScrollSpeed = 0;
  }

  function runThumbAutoScroll() {
    const rail = $('thumb-rail');

    if (!rail || !state.dragSlideId || !thumbAutoScrollSpeed) {
      stopThumbAutoScroll();
      return;
    }

    rail.scrollTop += thumbAutoScrollSpeed;
    thumbAutoScrollFrame = requestAnimationFrame(runThumbAutoScroll);
  }

  function updateThumbAutoScroll(clientY) {
    const rail = $('thumb-rail');
    if (!rail || !state.dragSlideId) return;

    const rect = rail.getBoundingClientRect();
    const edge = Math.min(90, rect.height * 0.22);
    const maxSpeed = 24;

    let speed = 0;

    if (clientY < rect.top + edge) {
      const strength = 1 - Math.max(0, clientY - rect.top) / edge;
      speed = -Math.max(3, Math.round(maxSpeed * strength));
    } else if (clientY > rect.bottom - edge) {
      const strength = 1 - Math.max(0, rect.bottom - clientY) / edge;
      speed = Math.max(3, Math.round(maxSpeed * strength));
    }

    thumbAutoScrollSpeed = speed;

    if (speed && !thumbAutoScrollFrame) {
      thumbAutoScrollFrame = requestAnimationFrame(runThumbAutoScroll);
    } else if (!speed) {
      stopThumbAutoScroll();
    }
  }

  $('thumb-list').addEventListener('dragstart', event => {
    const thumb = event.target.closest('.thumb');
    if (!thumb) return;

    state.dragSlideId = thumb.dataset.slideId;
    thumb.classList.add('dragging');

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', state.dragSlideId);

    stopThumbAutoScroll();
  });

  $('thumb-rail').addEventListener('dragover', event => {
    event.preventDefault();

    if (!state.dragSlideId) return;

    event.dataTransfer.dropEffect = 'move';
    updateThumbAutoScroll(event.clientY);

    document
      .querySelectorAll('.thumb.drop-before')
      .forEach(node => node.classList.remove('drop-before'));

    const thumb = event.target.closest('.thumb');
    if (!thumb || thumb.dataset.slideId === state.dragSlideId) return;

    const rect = thumb.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;

    if (after) {
      const next = thumb.nextElementSibling;

      if (
        next?.classList.contains('thumb') &&
        next.dataset.slideId !== state.dragSlideId
      ) {
        next.classList.add('drop-before');
      }
    } else {
      thumb.classList.add('drop-before');
    }
  });

  $('thumb-rail').addEventListener('drop', event => {
    event.preventDefault();

    stopThumbAutoScroll();

    const marker = $('thumb-list').querySelector('.thumb.drop-before');
    const targetId = marker?.dataset.slideId || null;

    if (state.dragSlideId) {
      moveSlideBefore(state.dragSlideId, targetId);
    }

    document
      .querySelectorAll('.thumb.dragging,.thumb.drop-before')
      .forEach(node => node.classList.remove('dragging','drop-before'));

    state.dragSlideId = null;
  });

  $('thumb-list').addEventListener('dragend', () => {
    stopThumbAutoScroll();

    document
      .querySelectorAll('.thumb.dragging,.thumb.drop-before')
      .forEach(node => node.classList.remove('dragging','drop-before'));

    state.dragSlideId = null;
  });

  document.addEventListener('click', event => {
    const internal = event.target.closest('.ms-link-internal');
    if (internal) {
      event.preventDefault(); event.stopPropagation();
      const id = internal.dataset.slideId;
      if (state.deck.slides.some(slide => slide.id === id)) {
        if (!state.editMode && state.deck.slides.find(slide => slide.id === id)?.hidden) return;
        selectSlide(id, {commit:state.editMode, step:0});
      }
      return;
    }
  });

  $('presentation-view').addEventListener('click', event => {
    if (state.editMode || event.target.closest('a,button,iframe')) return;
    if (event.clientX < innerWidth / 2) previousStepOrSlide(); else nextStepOrSlide();
  });
  $('mobile-prev').addEventListener('click', previousStepOrSlide);
  $('mobile-next').addEventListener('click', nextStepOrSlide);

  document.addEventListener('keydown', event => {
    const modal = document.querySelector('.modal.open');
    const inEditorField = event.target instanceof Element && event.target.closest('textarea,input,select');
    if (event.key === 'Escape') {
      if (modal) { closeModal(modal.id); event.preventDefault(); return; }
      if (document.fullscreenElement) { document.exitFullscreen?.(); event.preventDefault(); return; }
      if (state.editMode) { toggleEdit(false); event.preventDefault(); }
      return;
    }
    if (modal || inEditorField) return;
    const key = event.key.toLowerCase();
    if (key === 'e') { event.preventDefault(); toggleEdit(); }
    else if (key === 'f') { event.preventDefault(); toggleFullscreen(); }
    else if (key === 's') { event.preventDefault(); openSpeaker(); }
    else if (key === 'p') { event.preventDefault(); preparePrint(false); }
    else if (key === 'n') { event.preventDefault(); preparePrint(true); }
    else if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') { event.preventDefault(); nextStepOrSlide(); }
    else if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); previousStepOrSlide(); }
    else if (event.key === 'Home') { event.preventDefault(); goFirst(); }
    else if (event.key === 'End') { event.preventDefault(); goLast(); }
  });

  window.addEventListener('resize', () => {
    fitFrameInSlot($('presentation-slot'));
  });
  window.addEventListener('afterprint', cleanupPrint);
  window.addEventListener('beforeunload', () => { if (state.editMode) commitEditor({record:false, rerender:false}); });
}

function populateThemes() {
  const select = $('theme-select');
  THEME_IDS.forEach(([id, label]) => {
    const option = document.createElement('option');
    option.value = id; option.textContent = label; select.appendChild(option);
  });
}

async function initialize() {
  populateThemes();
  setupEvents();
  setNotesTab('speaker');
  const selfTest = runRoundTripSelfTest();
  if (!selfTest.ok) console.error('ModernSlides round-trip self-test failed', selfTest);
  const params = new URLSearchParams(location.search);
  const query = params.get('deck') || params.get('xml');
  try {
    if (query) {
      setStatus('Loading linked deck…', 'working');
      await loadFromQuery(query);
    } else {
      const saved = await deckStoreGet(STORAGE_CURRENT);
      if (saved) {
        const deck = normalizeDeck(JSON.parse(saved));
        await applyDeck(deck, {
          filename:storageGet(STORAGE_CURRENT_NAME) || 'presentation.json',
          requestedSlideId:storageGet(STORAGE_SLIDE),
          preservePrevious:false,
          fileHandle:null
        });
      } else {
        await applyDeck(buildSchumpeterDemoDeck(), {filename:'SchumpeterDemo.json', preservePrevious:false, fileHandle:null});
      }
    }
  } catch (error) {
    console.error(error);
    alert(`Could not load the requested deck. Opening the Schumpeter demo instead.\n\n${error.message}`);
    await applyDeck(buildSchumpeterDemoDeck(), {filename:'SchumpeterDemo.json', preservePrevious:false, fileHandle:null});
  }
  await refreshRestoreAvailability();
  document.body.classList.toggle('edit-mode', state.editMode);
  refreshAllViews({scrollThumb:false, preserveLive:false});
  requestAnimationFrame(() => fitFrameInSlot($('presentation-slot')));
}

initialize();
})();
