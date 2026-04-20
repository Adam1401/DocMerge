/* ═══════════════════════════════════════════════════════════
   DocMerge — app.js
   Dépendances : pdf-lib (chargé via CDN dans index.html)
═══════════════════════════════════════════════════════════ */

// ── Utilitaires ──────────────────────────────────────────────

/**
 * Formate une taille en octets en chaîne lisible.
 */
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' o';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
  return (bytes / (1024 * 1024)).toFixed(2) + ' Mo';
}

/**
 * Déclenche le téléchargement d'un Uint8Array comme fichier.
 */
function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Lit un File et retourne un ArrayBuffer.
 */
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Échec lecture fichier'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Lit un File image et retourne une Data URL (pour la miniature).
 */
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Échec lecture image'));
    reader.readAsDataURL(file);
  });
}

// ── State ─────────────────────────────────────────────────────

const state = {
  merge:   [],   // Array<File> — PDFs
  convert: [],   // Array<File> — Images
};

// ── DOM helpers ───────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

// ── Tool Switcher ─────────────────────────────────────────────

const btnMerge   = $('btn-merge');
const btnConvert = $('btn-convert');
const panelMerge   = $('panel-merge');
const panelConvert = $('panel-convert');

function switchTool(tool) {
  if (tool === 'merge') {
    btnMerge.classList.add('active');
    btnConvert.classList.remove('active');
    panelMerge.classList.add('active');
    panelConvert.classList.remove('active');
  } else {
    btnConvert.classList.add('active');
    btnMerge.classList.remove('active');
    panelConvert.classList.add('active');
    panelMerge.classList.remove('active');
  }
}

btnMerge.addEventListener('click',   () => switchTool('merge'));
btnConvert.addEventListener('click', () => switchTool('convert'));

// ── Drop Zones ────────────────────────────────────────────────

function setupDropZone(zoneId, inputId, mode) {
  const zone  = $(zoneId);
  const input = $(inputId);

  // Clic sur la zone = ouvrir le sélecteur
  zone.addEventListener('click', e => {
    if (e.target.tagName === 'LABEL') return; // label gère lui-même
    input.click();
  });

  // Input file classique
  input.addEventListener('change', () => {
    addFiles(mode, Array.from(input.files));
    input.value = ''; // reset pour permettre de re-sélectionner les mêmes fichiers
  });

  // Drag & Drop
  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', e => {
    if (!zone.contains(e.relatedTarget)) {
      zone.classList.remove('drag-over');
    }
  });

  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files);
    addFiles(mode, files);
  });
}

setupDropZone('drop-merge',   'input-merge',   'merge');
setupDropZone('drop-convert', 'input-convert', 'convert');

// ── Gestion des fichiers ──────────────────────────────────────

function isValidFile(file, mode) {
  if (mode === 'merge')   return file.type === 'application/pdf';
  if (mode === 'convert') return ['image/jpeg'].includes(file.type)
                              || /\.(jpg|jpeg)$/i.test(file.name);
  return false;
}

async function addFiles(mode, files) {
  const valid = files.filter(f => isValidFile(f, mode));

  if (valid.length < files.length) {
    const rejected = files.length - valid.length;
    alert(`${rejected} fichier(s) ignoré(s) — format non accepté.`);
  }

  if (valid.length === 0) return;

  // Pour les images, on génère la miniature avant d'ajouter
  for (const file of valid) {
    let thumb = null;
    if (mode === 'convert') {
      thumb = await readFileAsDataURL(file).catch(() => null);
    }
    state[mode].push({ file, thumb });
  }

  renderList(mode);
  updateActionRow(mode);
}

function removeFile(mode, index) {
  state[mode].splice(index, 1);
  renderList(mode);
  updateActionRow(mode);
}

// ── Rendu de la liste ─────────────────────────────────────────

// État interne du drag-to-reorder
const dragState = { mode: null, fromIndex: null };

function renderList(mode) {
  const listEl = $('list-' + mode);
  listEl.innerHTML = '';

  const total = state[mode].length;

  state[mode].forEach((entry, i) => {
    const { file, thumb } = entry;
    const item = document.createElement('div');
    item.className  = 'file-item';
    item.draggable  = true;
    item.dataset.index = i;

    // ── Poignée drag ────────────────────────────────────────
    const handle = document.createElement('div');
    handle.className = 'drag-handle';
    handle.title     = 'Glisser pour réordonner';
    handle.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
      <line x1="3" y1="4"  x2="13" y2="4"/>
      <line x1="3" y1="8"  x2="13" y2="8"/>
      <line x1="3" y1="12" x2="13" y2="12"/>
    </svg>`;

    // ── Numéro d'ordre ───────────────────────────────────────
    const orderBadge = document.createElement('span');
    orderBadge.className   = 'file-order';
    orderBadge.textContent = i + 1;

    // ── Miniature ────────────────────────────────────────────
    let thumbEl;
    if (thumb) {
      thumbEl = document.createElement('img');
      thumbEl.src       = thumb;
      thumbEl.className = 'file-thumb';
      thumbEl.alt       = file.name;
    } else {
      thumbEl = document.createElement('div');
      thumbEl.className   = 'file-thumb-pdf';
      thumbEl.textContent = 'PDF';
    }

    // ── Infos ────────────────────────────────────────────────
    const info = document.createElement('div');
    info.className = 'file-info';

    const name = document.createElement('div');
    name.className   = 'file-name';
    name.textContent = file.name;

    const size = document.createElement('div');
    size.className   = 'file-size';
    size.textContent = formatSize(file.size);

    info.appendChild(name);
    info.appendChild(size);

    // ── Boutons ↑ / ↓ ────────────────────────────────────────
    const reorderBtns = document.createElement('div');
    reorderBtns.className = 'reorder-btns';

    const btnUp = document.createElement('button');
    btnUp.className = 'reorder-btn';
    btnUp.title     = 'Monter';
    btnUp.disabled  = i === 0;
    btnUp.innerHTML = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M2 8l4-4 4 4"/>
    </svg>`;
    btnUp.addEventListener('click', () => moveItem(mode, i, i - 1));

    const btnDown = document.createElement('button');
    btnDown.className = 'reorder-btn';
    btnDown.title     = 'Descendre';
    btnDown.disabled  = i === total - 1;
    btnDown.innerHTML = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M2 4l4 4 4-4"/>
    </svg>`;
    btnDown.addEventListener('click', () => moveItem(mode, i, i + 1));

    reorderBtns.appendChild(btnUp);
    reorderBtns.appendChild(btnDown);

    // ── Bouton supprimer ─────────────────────────────────────
    const removeBtn = document.createElement('button');
    removeBtn.className = 'file-remove';
    removeBtn.title     = 'Supprimer';
    removeBtn.innerHTML = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M5 5l10 10M15 5L5 15"/>
    </svg>`;
    removeBtn.addEventListener('click', () => removeFile(mode, i));

    // ── Assemblage ───────────────────────────────────────────
    item.appendChild(handle);
    item.appendChild(orderBadge);
    item.appendChild(thumbEl);
    item.appendChild(info);
    item.appendChild(reorderBtns);
    item.appendChild(removeBtn);
    listEl.appendChild(item);

    // ── Drag events ──────────────────────────────────────────
    item.addEventListener('dragstart', e => {
      dragState.mode      = mode;
      dragState.fromIndex = i;
      e.dataTransfer.effectAllowed = 'move';
      // Léger délai pour que le navigateur capture le snapshot avant d'appliquer .dragging
      setTimeout(() => item.classList.add('dragging'), 0);
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      // Nettoie toutes les cibles
      listEl.querySelectorAll('.drag-target').forEach(el => el.classList.remove('drag-target'));
      dragState.mode = dragState.fromIndex = null;
    });

    item.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragState.mode !== mode) return;
      // Retire drag-target des autres
      listEl.querySelectorAll('.drag-target').forEach(el => el.classList.remove('drag-target'));
      if (parseInt(item.dataset.index) !== dragState.fromIndex) {
        item.classList.add('drag-target');
      }
    });

    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-target');
    });

    item.addEventListener('drop', e => {
      e.preventDefault();
      item.classList.remove('drag-target');
      if (dragState.mode !== mode) return;
      const toIndex = parseInt(item.dataset.index);
      if (toIndex === dragState.fromIndex) return;
      moveItem(mode, dragState.fromIndex, toIndex);
    });
  });
}

// ── Déplace un élément de fromIndex vers toIndex ──────────────
function moveItem(mode, fromIndex, toIndex) {
  if (toIndex < 0 || toIndex >= state[mode].length) return;
  const arr = state[mode];
  const [moved] = arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, moved);
  renderList(mode);
  updateActionRow(mode);
}

function updateActionRow(mode) {
  const count  = state[mode].length;
  const action = $('action-' + mode);
  const countEl = $('count-' + mode);

  if (count === 0) {
    action.style.display = 'none';
    return;
  }

  action.style.display = 'flex';

  if (mode === 'merge') {
    countEl.textContent = count === 1
      ? '1 fichier PDF ajouté'
      : `${count} fichiers PDF ajoutés`;
  } else {
    countEl.textContent = count === 1
      ? '1 image ajoutée'
      : `${count} images ajoutées`;
  }
}

// ── Barre de progression ──────────────────────────────────────

function setProgress(mode, pct, label) {
  $('fill-' + mode).style.width  = pct + '%';
  $('label-' + mode).textContent = label;
}

function showProgress(mode, show) {
  $('progress-' + mode).style.display = show ? 'flex' : 'none';
}

// ── FUSIONNER des PDFs ────────────────────────────────────────

$('do-merge').addEventListener('click', async () => {
  if (state.merge.length < 1) return;
  const btn = $('do-merge');
  btn.disabled = true;

  showProgress('merge', true);
  setProgress('merge', 10, 'Initialisation…');

  try {
    const { PDFDocument } = PDFLib;
    const merged = await PDFDocument.create();

    const total = state.merge.length;

    for (let i = 0; i < total; i++) {
      const { file } = state.merge[i];
      setProgress('merge', 10 + Math.round((i / total) * 75), `Traitement : ${file.name}`);

      const buffer = await readFileAsArrayBuffer(file);
      const doc    = await PDFDocument.load(buffer);
      const pages  = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach(p => merged.addPage(p));
    }

    setProgress('merge', 90, 'Génération du fichier…');

    const bytes = await merged.save();
    setProgress('merge', 100, 'Téléchargement…');

    downloadBytes(bytes, 'document-fusionné.pdf');

    // Reset après succès
    setTimeout(() => {
      state.merge = [];
      renderList('merge');
      updateActionRow('merge');
      showProgress('merge', false);
      setProgress('merge', 0, '');
      btn.disabled = false;
    }, 1200);

  } catch (err) {
    console.error(err);
    setProgress('merge', 0, '');
    showProgress('merge', false);
    btn.disabled = false;
    alert('Erreur lors de la fusion : ' + err.message);
  }
});

// ── CONVERTIR images → PDF ────────────────────────────────────

$('do-convert').addEventListener('click', async () => {
  if (state.convert.length < 1) return;
  const btn = $('do-convert');
  btn.disabled = true;

  showProgress('convert', true);
  setProgress('convert', 10, 'Initialisation…');

  try {
    const { PDFDocument, PageSizes } = PDFLib;
    const pdf   = await PDFDocument.create();
    const total = state.convert.length;

    for (let i = 0; i < total; i++) {
      const { file } = state.convert[i];
      setProgress('convert', 10 + Math.round((i / total) * 78), `Ajout de ${file.name}…`);

      const buffer = await readFileAsArrayBuffer(file);
      const uint8  = new Uint8Array(buffer);

      // Embed l'image JPEG
      const img = await pdf.embedJpg(uint8);

      // Dimensions intrinsèques
      const { width: iw, height: ih } = img;

      // Ajuste à la page A4 (595 x 842 pt) tout en conservant le ratio
      const A4W = 595, A4H = 842;
      const margin = 40;
      const maxW = A4W - margin * 2;
      const maxH = A4H - margin * 2;
      const scale = Math.min(maxW / iw, maxH / ih, 1); // pas d'agrandissement
      const drawW = iw * scale;
      const drawH = ih * scale;

      const page = pdf.addPage([A4W, A4H]);
      page.drawImage(img, {
        x:      (A4W - drawW) / 2,
        y:      (A4H - drawH) / 2,
        width:  drawW,
        height: drawH,
      });
    }

    setProgress('convert', 92, 'Génération du fichier…');
    const bytes = await pdf.save();
    setProgress('convert', 100, 'Téléchargement…');

    downloadBytes(bytes, 'images-converties.pdf');

    // Reset après succès
    setTimeout(() => {
      state.convert = [];
      renderList('convert');
      updateActionRow('convert');
      showProgress('convert', false);
      setProgress('convert', 0, '');
      btn.disabled = false;
    }, 1200);

  } catch (err) {
    console.error(err);
    setProgress('convert', 0, '');
    showProgress('convert', false);
    btn.disabled = false;
    alert('Erreur lors de la conversion : ' + err.message);
  }
});
