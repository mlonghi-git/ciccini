// Supabase config
var SUPABASE_URL = 'https://asqpmpjemiaiyqohoyfc.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcXBtcGplbWlhaXlxb2hveWZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MzMyODMsImV4cCI6MjA5MjIwOTI4M30.si_uA8xGMLPTsLeQYjSFSgZMXnz-mG1Tk7p1s8SUSNo';
var SUPABASE_CDN = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
  'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.min.js'
];
var STORAGE_BUCKET_CANDIDATES = ['gallery', 'photos', 'images', 'public'];
var DEFAULT_GALLERY = [
  { id: 'demo-1', title: 'Passeggiata al tramonto', caption: 'Un’immagine hero perfetta per dare subito calore alla pagina.', src: 'assets/images/demo-1.svg', origin: 'demo' },
  { id: 'demo-2', title: 'Cena tra luci sospese', caption: 'Una scena serale che racconta l’atmosfera del ricevimento.', src: 'assets/images/demo-2.svg', origin: 'demo' },
  { id: 'demo-3', title: 'Dettagli da partecipazione', caption: 'Un taglio editoriale per fiori, inviti e piccoli dettagli.', src: 'assets/images/demo-3.svg', origin: 'demo' },
  { id: 'demo-4', title: 'Brindisi finale', caption: 'Una chiusura più festosa per il carosello centrale.', src: 'assets/images/demo-4.svg', origin: 'demo' }
];

var supabase;
var DB_READY = false;
var SUPABASE_LOADING = false;

var guests = [];
var filtered = [];
var curPage = 1;
var PER = 12;
var srch = '';
var stFilter = '';
var xlsData = null;
var xlsHdrs = [];
var galleryPhotos = [];
var galleryIndex = 0;
var galleryTimer = null;
var pendingPhotoData = '';
var pendingPhotoUpload = null;
var lightboxIndex = 0;
var rsvpAllGuests = [];
var rsvpSelected = null;
var rsvpChoice = null;
var acHighlight = -1;

function getSupabaseFactory() {
  if (window.supabase && typeof window.supabase.createClient === 'function') return window.supabase;
  if (window.supabase && window.supabase.default && typeof window.supabase.default.createClient === 'function') return window.supabase.default;
  return null;
}

function ensureSupabaseLoaded(callback) {
  var factory = getSupabaseFactory();
  if (factory) {
    callback(factory);
    return;
  }
  if (SUPABASE_LOADING) {
    setTimeout(function () { ensureSupabaseLoaded(callback); }, 150);
    return;
  }
  SUPABASE_LOADING = true;
  var idx = 0;
  function tryNext() {
    if (idx >= SUPABASE_CDN.length) {
      SUPABASE_LOADING = false;
      callback(null);
      return;
    }
    var script = document.createElement('script');
    script.src = SUPABASE_CDN[idx++];
    script.async = true;
    script.onload = function () {
      SUPABASE_LOADING = false;
      callback(getSupabaseFactory());
    };
    script.onerror = function () {
      tryNext();
    };
    document.head.appendChild(script);
  }
  tryNext();
}

function initDB() {
  ensureSupabaseLoaded(function (factory) {
    try {
      if (!factory) {
        showDBError('SDK Supabase non caricato');
        return;
      }
      supabase = factory.createClient(SUPABASE_URL, SUPABASE_KEY);
      DB_READY = true;
      hideDBError();
      loadRsvpList();
    } catch (e) {
      showDBError('Errore Supabase: ' + e.message);
    }
  });
}

function showDBError(msg) {
  var banner = document.getElementById('fb-banner');
  if (banner) {
    banner.textContent = '⚠ ' + msg;
    banner.style.display = 'block';
  }
}

function hideDBError() {
  var banner = document.getElementById('fb-banner');
  if (banner) banner.style.display = 'none';
}

function loadS() {
  var defaults = { bride: 'Michela', groom: 'Guglielmo', date: '2026-06-14', location: 'Villa dei Colli, Spoleto' };
  try {
    return JSON.parse(localStorage.getItem('weddingSettings')) || defaults;
  } catch (e) {
    return defaults;
  }
}

function loadC() {
  try {
    return JSON.parse(localStorage.getItem('weddingCreds')) || { user: 'sposi', pass: 'matrimonio2026' };
  } catch (e) {
    return { user: 'sposi', pass: 'matrimonio2026' };
  }
}

function loadGallery() {
  try {
    return JSON.parse(localStorage.getItem('weddingGallery')) || [];
  } catch (e) {
    return [];
  }
}

function saveGallery(list) {
  localStorage.setItem('weddingGallery', JSON.stringify(list));
}

function getDefaultGallery() {
  return DEFAULT_GALLERY.map(function (photo) {
    return Object.assign({}, photo);
  });
}

function seedDefaultGallery() {
  var current = loadGallery();
  if (current && current.length) return;
  saveGallery(getDefaultGallery());
}

function getBucketCandidates() {
  var saved = localStorage.getItem('weddingPhotoBucket');
  var list = saved ? [saved] : [];
  STORAGE_BUCKET_CANDIDATES.forEach(function (name) {
    if (list.indexOf(name) === -1) list.push(name);
  });
  return list;
}

function setPhotoStatus(msg) {
  var el = document.getElementById('photo-status');
  if (el) el.textContent = 'Storage: ' + msg;
}

function loadGFromFirestore(callback) {
  if (!DB_READY) {
    callback([]);
    return;
  }
  supabase.from('guests').select('*').order('created_at', { ascending: true })
    .then(function (response) {
      if (response.error) {
        showDBError('Errore lettura: ' + response.error.message);
        callback([]);
        return;
      }
      callback(response.data || []);
    })
    .catch(function (e) {
      showDBError('Errore lettura: ' + e.message);
      callback([]);
    });
}

function addGuestFS(obj, callback) {
  if (!DB_READY) {
    if (callback) callback(null);
    return;
  }
  supabase.from('guests').insert([obj])
    .then(function (response) {
      if (response.error) {
        showDBError('Errore salvataggio: ' + response.error.message);
        if (callback) callback(null);
        return;
      }
      if (callback) callback(response.data && response.data[0] ? response.data[0] : obj);
    })
    .catch(function (e) {
      showDBError('Errore salvataggio: ' + e.message);
      if (callback) callback(null);
    });
}

function updateGuestFS(id, obj, callback) {
  if (!DB_READY) {
    if (callback) callback();
    return;
  }
  var data = Object.assign({}, obj);
  delete data.id;
  supabase.from('guests').update(data).eq('id', id)
    .then(function (response) {
      if (response.error) showDBError('Errore aggiornamento: ' + response.error.message);
      if (callback) callback();
    })
    .catch(function (e) {
      showDBError('Errore aggiornamento: ' + e.message);
      if (callback) callback();
    });
}

function deleteGuestFS(id, callback) {
  if (!DB_READY) {
    if (callback) callback();
    return;
  }
  supabase.from('guests').delete().eq('id', id)
    .then(function (response) {
      if (response.error) showDBError('Errore eliminazione: ' + response.error.message);
      if (callback) callback();
    })
    .catch(function (e) {
      showDBError('Errore eliminazione: ' + e.message);
      if (callback) callback();
    });
}

function deleteAllGuestsFS(callback) {
  if (!DB_READY) {
    if (callback) callback();
    return;
  }
  supabase.from('guests').delete().neq('id', null)
    .then(function (response) {
      if (response.error) showDBError('Errore cancellazione: ' + response.error.message);
      if (callback) callback();
    })
    .catch(function (e) {
      showDBError('Errore cancellazione: ' + e.message);
      if (callback) callback();
    });
}

function importGuestsFS(list, callback) {
  if (!DB_READY || !list.length) {
    if (callback) callback(0);
    return;
  }
  var done = 0;
  var batches = [];
  var i;
  for (i = 0; i < list.length; i += 100) {
    batches.push(list.slice(i, i + 100));
  }
  var batchIdx = 0;

  function nextBatch() {
    if (batchIdx >= batches.length) {
      if (callback) callback(done);
      return;
    }
    var batch = batches[batchIdx];
    batch.forEach(function (guest) { delete guest.id; });
    supabase.from('guests').insert(batch)
      .then(function (response) {
        if (response.error) {
          showDBError('Errore import: ' + response.error.message);
          if (callback) callback(done);
          return;
        }
        done += batch.length;
        batchIdx += 1;
        nextBatch();
      })
      .catch(function (e) {
        showDBError('Errore import: ' + e.message);
        if (callback) callback(done);
      });
  }

  nextBatch();
}

function tick() {
  var s = loadS();
  var target = new Date(s.date + 'T15:00:00');
  var now = new Date();
  var diff = target - now;
  if (diff <= 0) {
    document.getElementById('countdown-box').innerHTML = '<div style="font-family:Cormorant Garamond,serif;font-style:italic;font-size:2rem;color:var(--gold)">Oggi è il grande giorno! 💕</div>';
    return;
  }
  var dd = Math.floor(diff / 86400000);
  var hh = Math.floor((diff % 86400000) / 3600000);
  var mm = Math.floor((diff % 3600000) / 60000);
  var ss = Math.floor((diff % 60000) / 1000);
  document.getElementById('cd-d').textContent = pad(dd);
  document.getElementById('cd-h').textContent = pad(hh);
  document.getElementById('cd-m').textContent = pad(mm);
  document.getElementById('cd-s').textContent = pad(ss);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function gv(id) {
  return document.getElementById(id).value.trim();
}

function toast(msg) {
  var el = document.getElementById('toast-el');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(function () {
    el.classList.remove('show');
  }, 2800);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function safeText(v) {
  return String(v || '').replace(/[&<>"']/g, function (ch) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
  });
}

function getActiveGalleryIndex() {
  if (!galleryPhotos.length) return 0;
  return ((galleryIndex % galleryPhotos.length) + galleryPhotos.length) % galleryPhotos.length;
}

function renderGallerySection() {
  var section = document.getElementById('gallery');
  var wrap = document.getElementById('gallery-stage-wrap');
  var strip = document.getElementById('gallery-strip');
  var dots = document.getElementById('gallery-dots');
  var controls = document.getElementById('gallery-controls');
  if (!section || !wrap || !strip || !dots || !controls) return;

  if (!galleryPhotos.length) {
    section.style.display = 'none';
    wrap.innerHTML = '';
    strip.innerHTML = '';
    dots.innerHTML = '';
    controls.style.display = 'none';
    closeLightbox();
    return;
  }

  section.style.display = 'block';
  var active = getActiveGalleryIndex();
  var activePhoto = galleryPhotos[active];
  controls.style.display = galleryPhotos.length > 1 ? 'flex' : 'none';

  wrap.innerHTML = '<div class="gallery-stage">' + galleryPhotos.map(function (photo, idx) {
    return '<div class="gallery-stage-item' + (idx === active ? ' active' : '') + '">' +
      '<img src="' + photo.src + '" alt="' + safeText(photo.title || ('Foto ' + (idx + 1))) + '">' +
      (idx === active ? '<button class="gallery-stage-hit" type="button" aria-label="Apri foto a schermo intero" onclick="openLightbox(' + idx + ')"></button>' : '') +
      '<div class="gallery-stage-caption"><strong>' + (photo.title ? safeText(photo.title) : 'Momento speciale') + '</strong><span>' + (photo.caption ? safeText(photo.caption) : 'Un ricordo da condividere con gli invitati.') + '</span></div>' +
      '</div>';
  }).join('') + '</div>';

  strip.innerHTML = galleryPhotos.map(function (photo, idx) {
    return '<button class="gallery-rail-card' + (idx === active ? ' active' : '') + '" type="button" onclick="setGalleryIndex(' + idx + ')">' +
      '<div class="gallery-rail-image"><img src="' + photo.src + '" alt="' + safeText(photo.title || ('Anteprima ' + (idx + 1))) + '"></div>' +
      '<div class="gallery-rail-body">' +
      '<div class="gallery-rail-index">0' + (idx + 1) + '</div>' +
      '<div class="gallery-rail-title">' + safeText(photo.title || ('Foto ' + (idx + 1))) + '</div>' +
      '<div class="gallery-rail-copy">' + safeText(photo.caption || 'Apri la foto per vederla a schermo intero.') + '</div>' +
      '</div></button>';
  }).join('');

  dots.innerHTML = galleryPhotos.map(function (_, idx) {
    return '<button class="gallery-dot' + (idx === active ? ' active' : '') + '" type="button" aria-label="Vai alla foto ' + (idx + 1) + '" onclick="setGalleryIndex(' + idx + ')"></button>';
  }).join('');

  if (document.getElementById('gallery-lightbox').classList.contains('open')) {
    renderLightbox(activePhoto, active);
  }
}

function renderPhotoAdmin() {
  var list = document.getElementById('photo-list');
  var empty = document.getElementById('photo-empty');
  if (!list || !empty) return;
  if (!galleryPhotos.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  list.innerHTML = galleryPhotos.map(function (photo, idx) {
    return '<div class="photo-card"><img src="' + photo.src + '" alt="' + safeText(photo.title || ('Foto ' + (idx + 1))) + '"><div class="photo-card-body"><strong>' + (photo.title ? safeText(photo.title) : 'Foto senza titolo') + '</strong><p>' + (photo.caption ? safeText(photo.caption) : 'Nessuna didascalia inserita.') + '</p><div class="photo-card-actions"><button class="tbtn btn-outline" onclick="openLightbox(' + idx + ')">Apri</button><button class="tbtn btn-red" onclick="removePhoto(\'' + photo.id + '\')">Elimina</button></div></div></div>';
  }).join('');
}

function applyGallery() {
  galleryPhotos = loadGallery();
  if (galleryIndex >= galleryPhotos.length) galleryIndex = 0;
  renderGallerySection();
  renderPhotoAdmin();
  restartGalleryAutoplay();
}

function setGalleryIndex(idx) {
  galleryIndex = idx;
  renderGallerySection();
  restartGalleryAutoplay();
}

function moveGallery(step) {
  if (!galleryPhotos.length) return;
  setGalleryIndex(getActiveGalleryIndex() + step);
}

function restartGalleryAutoplay() {
  if (galleryTimer) clearInterval(galleryTimer);
  if (galleryPhotos.length <= 1) return;
  galleryTimer = setInterval(function () {
    moveGallery(1);
  }, 5000);
}

function renderLightbox(photo, idx) {
  document.getElementById('lightbox-image').src = photo.src;
  document.getElementById('lightbox-image').alt = photo.title || ('Foto ' + (idx + 1));
  document.getElementById('lightbox-title').textContent = photo.title || ('Foto ' + (idx + 1));
  document.getElementById('lightbox-caption').textContent = photo.caption || 'Un momento del nostro percorso insieme.';
}

function openLightbox(idx) {
  if (!galleryPhotos.length) return;
  lightboxIndex = ((idx % galleryPhotos.length) + galleryPhotos.length) % galleryPhotos.length;
  renderLightbox(galleryPhotos[lightboxIndex], lightboxIndex);
  document.getElementById('gallery-lightbox').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  var lightbox = document.getElementById('gallery-lightbox');
  if (!lightbox) return;
  lightbox.classList.remove('open');
  document.body.style.overflow = '';
}

function moveLightbox(step) {
  if (!galleryPhotos.length) return;
  lightboxIndex = ((lightboxIndex + step) % galleryPhotos.length + galleryPhotos.length) % galleryPhotos.length;
  setGalleryIndex(lightboxIndex);
  openLightbox(lightboxIndex);
}

function clearPhotoForm() {
  ['photo-title', 'photo-caption', 'photo-url', 'photo-file'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  pendingPhotoData = '';
  pendingPhotoUpload = null;
}

function handlePhotoFile(file) {
  if (!file) return;
  if (!file.type || file.type.indexOf('image/') !== 0) {
    toast('Seleziona un file immagine valido');
    return;
  }
  var reader = new FileReader();
  reader.onload = function (e) {
    var img = new Image();
    img.onload = function () {
      var canvas = document.createElement('canvas');
      var maxSide = 1600;
      var ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      pendingPhotoData = canvas.toDataURL('image/jpeg', 0.82);
      canvas.toBlob(function (blob) {
        pendingPhotoUpload = { blob: blob, name: file.name || ('photo-' + Date.now() + '.jpg') };
        toast('Foto pronta per essere aggiunta');
      }, 'image/jpeg', 0.82);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function uploadPhotoToStorage(uploadInfo, callback) {
  if (!DB_READY || !supabase || !uploadInfo || !uploadInfo.blob) {
    callback(null);
    return;
  }
  var buckets = getBucketCandidates();
  var idx = 0;

  function tryBucket() {
    if (idx >= buckets.length) {
      callback(null);
      return;
    }
    var bucket = buckets[idx++];
    var ext = ((uploadInfo.name || 'image.jpg').split('.').pop() || 'jpg').toLowerCase();
    if (ext === 'svg') ext = 'jpg';
    var path = 'wedding-gallery/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext;
    supabase.storage.from(bucket).upload(path, uploadInfo.blob, { contentType: 'image/jpeg', upsert: false })
      .then(function (response) {
        if (response.error) {
          tryBucket();
          return;
        }
        var publicData = supabase.storage.from(bucket).getPublicUrl(path);
        localStorage.setItem('weddingPhotoBucket', bucket);
        callback(publicData && publicData.data ? publicData.data.publicUrl : null, bucket);
      })
      .catch(function () {
        tryBucket();
      });
  }

  tryBucket();
}

function addPhotoFromAdmin() {
  var title = gv('photo-title');
  var caption = gv('photo-caption');
  var url = gv('photo-url');
  var btn = document.querySelector('#panel-photos .btn-gold');
  if (!url && !pendingPhotoData) {
    toast('Inserisci un link immagine o carica un file');
    return;
  }

  function persist(src, origin) {
    var list = loadGallery();
    list.push({ id: uid(), title: title, caption: caption, src: src, origin: origin || 'custom' });
    saveGallery(list);
    clearPhotoForm();
    applyGallery();
    toast('Foto aggiunta alla galleria');
  }

  if (url) {
    persist(url, 'remote');
    setPhotoStatus('immagine esterna collegata.');
    return;
  }

  if (btn) btn.disabled = true;
  setPhotoStatus('upload verso Supabase Storage in corso...');
  uploadPhotoToStorage(pendingPhotoUpload, function (publicUrl, bucket) {
    if (btn) btn.disabled = false;
    if (publicUrl) {
      persist(publicUrl, 'storage');
      setPhotoStatus('upload completato nel bucket "' + bucket + '".');
      return;
    }
    persist(pendingPhotoData, 'local');
    setPhotoStatus('bucket non trovato o upload non riuscito: uso copia locale come fallback.');
  });
}

function removePhoto(id) {
  var next = loadGallery().filter(function (photo) {
    return photo.id !== id;
  });
  saveGallery(next);
  applyGallery();
  toast('Foto rimossa');
}

function restoreDemoGallery() {
  saveGallery(getDefaultGallery());
  applyGallery();
  setPhotoStatus('galleria demo ripristinata.');
  toast('Foto demo ripristinate');
}

function openLogin() {
  document.getElementById('login-screen').classList.add('open');
}

function doLogin() {
  var creds = loadC();
  if (gv('login-user') === creds.user && gv('login-pass') === creds.pass) {
    document.getElementById('login-screen').classList.remove('open');
    document.getElementById('admin-overlay').style.display = 'block';
    loadSettingsForm();
    initDB();
    setTimeout(function () {
      loadGFromFirestore(function (list) {
        guests = list;
        updateStats();
        renderGuests();
        renderDash();
      });
    }, 200);
  } else {
    document.getElementById('login-error').style.display = 'block';
  }
}

function closeAdmin() {
  document.getElementById('admin-overlay').style.display = 'none';
}

function showTab(name) {
  ['dashboard', 'guests', 'import', 'photos', 'settings'].forEach(function (tabName) {
    document.getElementById('panel-' + tabName).classList.remove('active');
    document.getElementById('tab-' + tabName).classList.remove('active');
  });
  document.getElementById('panel-' + name).classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
  if (name === 'guests') {
    loadGFromFirestore(function (list) {
      guests = list;
      renderGuests();
    });
  }
  if (name === 'dashboard') renderDash();
  if (name === 'photos') renderPhotoAdmin();
}

function updateStats() {
  loadGFromFirestore(function (list) {
    var total = list.length;
    var conf = list.filter(function (g) { return g.status === 'confermato'; }).length;
    var decl = list.filter(function (g) { return g.status === 'declinato'; }).length;
    document.getElementById('st-total').textContent = total;
    document.getElementById('st-conf').textContent = conf;
    document.getElementById('st-decl').textContent = decl;
    document.getElementById('st-pend').textContent = total - conf - decl;
  });
}

function renderDash() {
  updateStats();
  loadGFromFirestore(function (list) {
    var recent = list.filter(function (g) { return g.source === 'rsvp'; }).slice(-5).reverse();
    var el = document.getElementById('recent-list');
    if (!recent.length) {
      el.innerHTML = 'Nessun RSVP ancora.';
      return;
    }
    el.innerHTML = recent.map(function (g) {
      var badgeClass = g.status === 'confermato' ? 'bc' : g.status === 'declinato' ? 'bd' : 'bp';
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #0f3460"><span>' + g.name + ' ' + g.surname + '<span style="color:#8892a4;font-size:0.75rem;margin-left:8px">' + (g.email || '') + '</span></span><span class="badge ' + badgeClass + '">' + g.status + '</span></div>';
    }).join('');
  });
}

function getFiltered() {
  return guests.filter(function (g) {
    var q = srch.toLowerCase();
    var ms = !q || (g.name + ' ' + g.surname + ' ' + (g.email || '')).toLowerCase().indexOf(q) > -1;
    var mst = !stFilter || g.status === stFilter;
    return ms && mst;
  });
}

function filterGuests(v) {
  srch = v;
  curPage = 1;
  renderGuests();
}

function filterStatus(v) {
  stFilter = v;
  curPage = 1;
  renderGuests();
}

function bc(s) {
  return s === 'confermato' ? 'bc' : s === 'declinato' ? 'bd' : 'bp';
}

function renderGuests() {
  filtered = getFiltered();
  var total = filtered.length;
  var pages = Math.max(1, Math.ceil(total / PER));
  if (curPage > pages) curPage = pages;
  var start = (curPage - 1) * PER;
  var page = filtered.slice(start, start + PER);
  var tb = document.getElementById('guests-tbody');
  if (!page.length) {
    tb.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#8892a4;padding:40px">Nessun invitato trovato</td></tr>';
  } else {
    tb.innerHTML = page.map(function (g, i) {
      return '<tr><td style="color:#8892a4">' + (start + i + 1) + '</td><td>' + g.name + '</td><td>' + g.surname + '</td><td style="color:#8892a4">' + (g.email || '&mdash;') + '</td><td style="color:#8892a4">' + (g.phone || '&mdash;') + '</td><td style="color:#8892a4">' + (g.table || '&mdash;') + '</td><td style="color:#8892a4;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (g.diet || '&mdash;') + '</td><td><span class="badge ' + bc(g.status) + '">' + g.status + '</span></td><td><span class="badge ' + (g.source === 'rsvp' ? 'br' : 'bp') + '">' + (g.source || 'manuale') + '</span></td><td><div class="tbl-actions"><button class="tbl-btn" onclick="editGuest(\'' + g.id + '\')">✎</button><button class="tbl-btn del" onclick="deleteGuest(\'' + g.id + '\')">✕</button></div></td></tr>';
    }).join('');
  }
  renderPag(pages, total);
}

function renderPag(pages, total) {
  var el = document.getElementById('pagination');
  if (pages <= 1) {
    el.innerHTML = '<span class="page-info" style="color:#8892a4;font-size:0.75rem">' + total + ' invitati</span>';
    return;
  }
  var html = '<span class="page-info" style="color:#8892a4;font-size:0.75rem;margin-right:8px">' + total + ' invitati</span>';
  html += '<button class="page-btn" ' + (curPage === 1 ? 'disabled style="opacity:0.4"' : '') + ' onclick="goPage(' + (curPage - 1) + ')">‹</button>';
  var i;
  for (i = 1; i <= pages; i += 1) {
    if (pages > 7 && i > 2 && i < pages - 1 && Math.abs(i - curPage) > 1) {
      if (i === 3 || i === pages - 2) html += '<span style="color:#8892a4;padding:0 4px">&hellip;</span>';
      continue;
    }
    html += '<button class="page-btn' + (i === curPage ? ' active' : '') + '" onclick="goPage(' + i + ')">' + i + '</button>';
  }
  html += '<button class="page-btn" ' + (curPage === pages ? 'disabled style="opacity:0.4"' : '') + ' onclick="goPage(' + (curPage + 1) + ')">›</button>';
  el.innerHTML = html;
}

function goPage(p) {
  if (p < 1 || p > Math.ceil(filtered.length / PER)) return;
  curPage = p;
  renderGuests();
}

function openAddGuest() {
  document.getElementById('modal-title').textContent = 'Aggiungi invitato';
  ['g-id', 'g-name', 'g-surname', 'g-email', 'g-phone', 'g-table', 'g-diet', 'g-notes'].forEach(function (id) {
    document.getElementById(id).value = '';
  });
  document.getElementById('g-status').value = 'in attesa';
  document.getElementById('guest-modal').classList.add('open');
}

function editGuest(id) {
  var g = guests.find(function (item) { return item.id === id; });
  if (!g) return;
  document.getElementById('modal-title').textContent = 'Modifica invitato';
  document.getElementById('g-id').value = g.id;
  document.getElementById('g-name').value = g.name || '';
  document.getElementById('g-surname').value = g.surname || '';
  document.getElementById('g-email').value = g.email || '';
  document.getElementById('g-phone').value = g.phone || '';
  document.getElementById('g-table').value = g.table || '';
  document.getElementById('g-diet').value = g.diet || '';
  document.getElementById('g-notes').value = g.notes || '';
  document.getElementById('g-status').value = g.status || 'in attesa';
  document.getElementById('guest-modal').classList.add('open');
}

function saveGuest() {
  var name = gv('g-name');
  var surname = gv('g-surname');
  if (!name || !surname) {
    toast('Nome e cognome sono obbligatori');
    return;
  }
  var existingId = document.getElementById('g-id').value;
  var obj = {
    name: name,
    surname: surname,
    email: gv('g-email'),
    phone: gv('g-phone'),
    table: gv('g-table'),
    diet: gv('g-diet'),
    notes: gv('g-notes'),
    status: document.getElementById('g-status').value
  };
  if (existingId) {
    var orig = guests.find(function (x) { return x.id === existingId; });
    if (orig) obj.source = orig.source;
    updateGuestFS(existingId, obj, function () {
      closeModal();
      loadGFromFirestore(function (list) {
        guests = list;
        renderGuests();
        updateStats();
      });
      toast('Invitato aggiornato ✓');
    });
  } else {
    obj.source = 'manuale';
    addGuestFS(obj, function (added) {
      if (!added) {
        toast('Errore nel salvataggio');
        return;
      }
      closeModal();
      loadGFromFirestore(function (list) {
        guests = list;
        renderGuests();
        updateStats();
      });
      toast('Invitato aggiunto ✓');
    });
  }
}

function deleteGuest(id) {
  if (!confirm('Eliminare questo invitato?')) return;
  deleteGuestFS(id, function () {
    loadGFromFirestore(function (list) {
      guests = list;
      renderGuests();
      updateStats();
    });
    toast('Invitato eliminato');
  });
}

function closeModal() {
  document.getElementById('guest-modal').classList.remove('open');
}

function loadRsvpList() {
  if (!DB_READY) return;
  supabase.from('guests').select('id,name,surname,status,diet')
    .then(function (response) {
      if (response.error) return;
      rsvpAllGuests = response.data.map(function (d) {
        return { id: d.id, name: d.name || '', surname: d.surname || '', status: d.status || 'in attesa', diet: d.diet || '' };
      });
    })
    .catch(function () {});
}

function rsvpSearch(val) {
  var ac = document.getElementById('rsvp-ac');
  var nf = document.getElementById('rsvp-not-found');
  nf.style.display = 'none';
  acHighlight = -1;
  if (val.trim().length < 2) {
    ac.classList.remove('open');
    return;
  }
  var q = val.toLowerCase();
  var matches = rsvpAllGuests.filter(function (g) {
    return (g.name + ' ' + g.surname).toLowerCase().indexOf(q) > -1;
  }).slice(0, 8);
  if (!matches.length) {
    ac.innerHTML = '<div class="rsvp-ac-empty">Nessun invitato trovato con questo nome.</div>';
    ac.classList.add('open');
    return;
  }
  ac.innerHTML = matches.map(function (g, i) {
    return '<div class="rsvp-ac-item" data-idx="' + i + '" onclick="selectGuest(' + JSON.stringify(g).replace(/"/g, '&quot;') + ')"><strong>' + g.name + ' ' + g.surname + '</strong><span style="float:right;font-size:0.7rem;opacity:0.6"></span></div>';
  }).join('');
  ac.classList.add('open');
}

function rsvpKeyNav(e) {
  var items = document.querySelectorAll('.rsvp-ac-item');
  if (!items.length) return;
  if (e.key === 'ArrowDown') acHighlight = Math.min(acHighlight + 1, items.length - 1);
  else if (e.key === 'ArrowUp') acHighlight = Math.max(acHighlight - 1, 0);
  else if (e.key === 'Enter' && acHighlight >= 0) {
    items[acHighlight].click();
    return;
  } else if (e.key === 'Escape') {
    document.getElementById('rsvp-ac').classList.remove('open');
    return;
  }
  items.forEach(function (el, i) {
    el.classList.toggle('active', i === acHighlight);
  });
}

function selectGuest(g) {
  rsvpSelected = g;
  rsvpChoice = null;
  document.getElementById('rsvp-ac').classList.remove('open');
  document.getElementById('rsvp-search').value = g.name + ' ' + g.surname;
  document.getElementById('rsvp-card-name').textContent = g.name + ' ' + g.surname;
  var badgeMap = { confermato: 'conf', declinato: 'decl', 'in attesa': 'pend' };
  var labelMap = { confermato: 'Hai già confermato', declinato: 'Hai già declinato', 'in attesa': 'Risposta in attesa' };
  var badgeClass = badgeMap[g.status] || 'pend';
  document.getElementById('rsvp-current-badge').innerHTML = '<span class="rsvp-already ' + badgeClass + '">' + (labelMap[g.status] || g.status) + '</span>';
  document.getElementById('rsvp-diet-inp').value = g.diet || '';
  document.getElementById('rsvp-btn-yes').classList.remove('sel');
  document.getElementById('rsvp-btn-no').classList.remove('sel');
  if (g.status === 'confermato') {
    rsvpChoice = 'confermato';
    document.getElementById('rsvp-btn-yes').classList.add('sel');
  }
  if (g.status === 'declinato') {
    rsvpChoice = 'declinato';
    document.getElementById('rsvp-btn-no').classList.add('sel');
  }
  document.getElementById('rsvp-submit-btn').disabled = !rsvpChoice;
  document.getElementById('rsvp-card').style.display = 'block';
  document.getElementById('rsvp-not-found').style.display = 'none';
}

function selectRsvp(val) {
  rsvpChoice = val;
  document.getElementById('rsvp-btn-yes').classList.toggle('sel', val === 'confermato');
  document.getElementById('rsvp-btn-no').classList.toggle('sel', val === 'declinato');
  document.getElementById('rsvp-submit-btn').disabled = false;
}

function submitRSVP() {
  if (!rsvpSelected || !rsvpChoice) return;
  var diet = document.getElementById('rsvp-diet-inp').value.trim();
  var btn = document.getElementById('rsvp-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Salvataggio...';
  updateGuestFS(rsvpSelected.id, { status: rsvpChoice, diet: diet, source: 'rsvp', rsvpDate: new Date().toISOString() }, function () {
    document.getElementById('rsvp-step1').style.display = 'none';
    document.getElementById('rsvp-card').style.display = 'none';
    document.getElementById('rsvp-success-name').textContent = rsvpSelected.name;
    document.getElementById('rsvp-success').style.display = 'block';
    var idx = rsvpAllGuests.findIndex(function (g) { return g.id === rsvpSelected.id; });
    if (idx > -1) {
      rsvpAllGuests[idx].status = rsvpChoice;
      rsvpAllGuests[idx].diet = diet;
    }
  });
}

function resetRsvp() {
  rsvpSelected = null;
  rsvpChoice = null;
  document.getElementById('rsvp-search').value = '';
  document.getElementById('rsvp-ac').classList.remove('open');
  document.getElementById('rsvp-card').style.display = 'none';
  document.getElementById('rsvp-not-found').style.display = 'none';
}

document.addEventListener('click', function (e) {
  if (!e.target.closest('#rsvp-step1')) {
    var ac = document.getElementById('rsvp-ac');
    if (ac) ac.classList.remove('open');
  }
  if (e.target.id === 'gallery-lightbox') {
    closeLightbox();
  }
});

document.addEventListener('keydown', function (e) {
  var lightbox = document.getElementById('gallery-lightbox');
  if (lightbox && lightbox.classList.contains('open')) {
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') moveLightbox(1);
    if (e.key === 'ArrowLeft') moveLightbox(-1);
  }
});

function initDropzone() {
  var dz = document.getElementById('drop-zone');
  if (!dz) return;
  dz.addEventListener('dragover', function (e) {
    e.preventDefault();
    dz.classList.add('drag-over');
  });
  dz.addEventListener('dragleave', function () {
    dz.classList.remove('drag-over');
  });
  dz.addEventListener('drop', function (e) {
    e.preventDefault();
    dz.classList.remove('drag-over');
    var f = e.dataTransfer.files[0];
    if (f) loadExcel(f);
  });
}

function loadExcel(file) {
  if (!file) return;
  var rd = new FileReader();
  rd.onload = function (e) {
    var wb = XLSX.read(e.target.result, { type: 'array' });
    var ws = wb.Sheets[wb.SheetNames[0]];
    xlsData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (xlsData.length < 2) {
      toast('Il file è vuoto o non valido');
      return;
    }
    xlsHdrs = xlsData[0].map(String);
    renderImportMap();
    renderPreview();
    document.getElementById('import-preview').style.display = 'block';
  };
  rd.readAsArrayBuffer(file);
}

var FIELDS = [
  { k: 'name', l: 'Nome' },
  { k: 'surname', l: 'Cognome' },
  { k: 'email', l: 'Email' },
  { k: 'phone', l: 'Telefono' },
  { k: 'table', l: 'Tavolo' },
  { k: 'diet', l: 'Dieta/Intolleranze' },
  { k: 'status', l: 'Stato' },
  { k: 'notes', l: 'Note' }
];

function renderImportMap() {
  var opts = '<option value="">— non importare —</option>' + xlsHdrs.map(function (h, i) {
    return '<option value="' + i + '">' + h + '</option>';
  }).join('');
  document.getElementById('map-rows').innerHTML = FIELDS.map(function (f) {
    var autoIdx = xlsHdrs.findIndex(function (h) {
      return h.toLowerCase().indexOf(f.l.toLowerCase()) > -1 || h.toLowerCase().indexOf(f.k) > -1;
    });
    var sel = opts.replace('value="' + autoIdx + '"', 'value="' + autoIdx + '" selected');
    return '<div class="map-row"><label>' + f.l + '</label><select id="map-' + f.k + '">' + sel + '</select></div>';
  }).join('');
}

function renderPreview() {
  var rows = xlsData.slice(1, 6);
  document.getElementById('prev-count').textContent = xlsData.length - 1;
  var th = xlsHdrs.map(function (h) { return '<th>' + h + '</th>'; }).join('');
  var trs = rows.map(function (r) {
    return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
  }).join('');
  document.getElementById('prev-table').innerHTML = '<table><thead><tr>' + th + '</tr></thead><tbody>' + trs + '</tbody></table>';
}

function confirmImport() {
  var toImport = [];
  xlsData.slice(1).forEach(function (row) {
    if (!row.some(function (c) { return String(c).trim(); })) return;
    var guest = { source: 'excel' };
    FIELDS.forEach(function (f) {
      var el = document.getElementById('map-' + f.k);
      if (el && el.value !== '') guest[f.k] = String(row[parseInt(el.value, 10)] || '').trim();
      else guest[f.k] = '';
    });
    if (!guest.name && !guest.surname) return;
    if (!guest.status) guest.status = 'in attesa';
    toImport.push(guest);
  });
  if (!toImport.length) {
    toast('Nessuna riga valida trovata');
    return;
  }
  toast('Importazione in corso...');
  importGuestsFS(toImport, function (count) {
    loadGFromFirestore(function (list) {
      guests = list;
      renderGuests();
      updateStats();
    });
    toast(count + ' invitati importati ✓');
    cancelImport();
  });
}

function cancelImport() {
  document.getElementById('import-preview').style.display = 'none';
  xlsData = null;
  xlsHdrs = [];
  document.getElementById('xls-input').value = '';
}

function exportExcel() {
  loadGFromFirestore(function (list) {
    if (!list.length) {
      toast('Nessun invitato da esportare');
      return;
    }
    var rows = [['ID', 'Nome', 'Cognome', 'Email', 'Telefono', 'Tavolo', 'Dieta', 'Stato', 'Fonte', 'Note']];
    list.forEach(function (g) {
      rows.push([g.id, g.name, g.surname, g.email, g.phone, g.table, g.diet, g.status, g.source, g.notes]);
    });
    var ws = XLSX.utils.aoa_to_sheet(rows);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invitati');
    XLSX.writeFile(wb, 'invitati_matrimonio.xlsx');
    toast('Excel esportato ✓');
  });
}

function loadSettingsForm() {
  var s = loadS();
  document.getElementById('s-bride').value = s.bride;
  document.getElementById('s-groom').value = s.groom;
  document.getElementById('s-date').value = s.date;
  document.getElementById('s-location').value = s.location;
}

function saveSettings() {
  var s = { bride: gv('s-bride'), groom: gv('s-groom'), date: gv('s-date'), location: gv('s-location') };
  localStorage.setItem('weddingSettings', JSON.stringify(s));
  document.getElementById('hero-bride').textContent = s.bride;
  document.getElementById('hero-groom').textContent = s.groom;
  document.getElementById('hero-place').textContent = s.location;
  document.getElementById('nav-brand').textContent = s.bride + ' & ' + s.groom;
  document.getElementById('footer-names').textContent = s.bride + ' & ' + s.groom;
  toast('Impostazioni salvate ✓');
}

function changePassword() {
  var c = loadC();
  var old = gv('s-old');
  var nw = gv('s-new');
  var cf = gv('s-conf');
  if (old !== c.pass) {
    toast('Password attuale errata');
    return;
  }
  if (!nw) {
    toast('Inserisci la nuova password');
    return;
  }
  if (nw !== cf) {
    toast('Le password non coincidono');
    return;
  }
  localStorage.setItem('weddingCreds', JSON.stringify({ user: c.user, pass: nw }));
  ['s-old', 's-new', 's-conf'].forEach(function (id) {
    document.getElementById(id).value = '';
  });
  toast('Password aggiornata ✓');
}

function clearAll() {
  if (!confirm('Eliminare TUTTI gli invitati? Questa azione è irreversibile.')) return;
  deleteAllGuestsFS(function () {
    guests = [];
    renderGuests();
    renderDash();
    toast('Tutti gli invitati eliminati');
  });
}

(function initSite() {
  seedDefaultGallery();
  initDB();
  initDropzone();
  tick();
  setInterval(tick, 1000);
  var s = loadS();
  document.getElementById('hero-bride').textContent = s.bride;
  document.getElementById('hero-groom').textContent = s.groom;
  document.getElementById('hero-place').textContent = s.location;
  document.getElementById('nav-brand').textContent = s.bride + ' & ' + s.groom;
  document.getElementById('footer-names').textContent = s.bride + ' & ' + s.groom;
  applyGallery();
  setPhotoStatus('pronto. Carica un file o usa un URL pubblico.');
})();
