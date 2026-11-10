(function () {
  const filesInput = document.getElementById("files");
  const previews = document.getElementById("previews");
  const sendBtn = document.getElementById("sendBtn");
  const progress = document.getElementById("progress");
  const bar = progress.querySelector("span");
  const toast = document.getElementById("toast");
  const toastMsg = document.getElementById("toastMsg");
  const formError = document.getElementById("formError");
  const mosaic = document.getElementById("mosaic");
  const mosaicEnsaio = document.getElementById("mosaicEnsaio");
  const ensaioBlock = document.getElementById("ensaioBlock");
  const heroImg = document.getElementById("heroImg");
  const heroWebp = document.getElementById("heroWebp");
  const heroCaption = document.getElementById("heroCaption");
  const empty = document.getElementById("empty");
  const limitsEl = document.getElementById("limits");
  const downloadAllBtn = document.getElementById("downloadAll");
  const downloadBar = document.getElementById("downloadBar");
  const lightbox = document.getElementById("lightbox");
  const lbStage = document.getElementById("lbStage");
  const lbBar = document.getElementById("lbBar");
  const lbDownload = document.getElementById("lbDownload");
  const afterEvent = document.getElementById("afterEvent");
  const inviteCopy = document.getElementById("inviteCopy");
  const uploadHint = document.getElementById("uploadHint");

  let config = { maxImageMb: 15, maxVideoMb: 80, maxFiles: 8 };
  let selected = [];
  let gallery = [];
  let ensaio = [];
  let viewing = [];
  let latest = "";
  let lbIndex = 0;
  let lastFocus = null;

  const WEDDING_AT = new Date("2026-11-27T14:30:00-03:00").getTime();
  const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;
  const VIDEO_EXT = /\.(mp4|mov)$/i;
  const HEIC_EXT = /\.(heic|heif)$/i;

  function kindOf(file) {
    const t = (file.type || "").toLowerCase();
    if (t.startsWith("image/") || IMAGE_EXT.test(file.name)) return "image";
    if (t.startsWith("video/") || VIDEO_EXT.test(file.name)) return "video";
    return null;
  }

  function isHeic(file) {
    const t = (file.type || "").toLowerCase();
    return t === "image/heic" || t === "image/heif" || HEIC_EXT.test(file.name);
  }

  function tooBig(file, kind) {
    const max = (kind === "video" ? config.maxVideoMb : config.maxImageMb) * 1024 * 1024;
    return file.size > max;
  }

  if (Date.now() >= WEDDING_AT) {
    afterEvent.classList.remove("hidden");
    inviteCopy.textContent =
      "Obrigado por celebrar com a gente. As fotos da festa continuam aqui, e você ainda pode enviar as suas.";
    uploadHint.textContent = "Se ainda tiver fotos no celular, envie com carinho.";
  }

  function compressImage(file) {
    return new Promise(function (resolve) {
      if (file.kind === "video" || isHeic(file.file)) {
        resolve(file.file);
        return;
      }
      const img = new Image();
      const url = URL.createObjectURL(file.file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        const maxSide = 1920;
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (w <= maxSide && h <= maxSide && file.file.size < 1.6 * 1024 * 1024) {
          resolve(file.file);
          return;
        }
        const scale = Math.min(1, maxSide / Math.max(w, h));
        w = Math.round(w * scale);
        h = Math.round(h * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          function (blob) {
            if (!blob) {
              resolve(file.file);
              return;
            }
            const name = file.file.name.replace(/\.[^.]+$/, "") + ".jpg";
            resolve(new File([blob], name, { type: "image/jpeg" }));
          },
          "image/jpeg",
          0.78
        );
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        resolve(file.file);
      };
      img.src = url;
    });
  }

  function renderPreviews() {
    previews.innerHTML = "";
    selected.forEach(function (item, i) {
      const wrap = document.createElement("div");
      wrap.className = "item" + (item.error ? " bad" : "");
      wrap.setAttribute("role", "button");
      wrap.setAttribute("tabindex", "0");
      wrap.setAttribute("aria-label", "Remover " + item.file.name);
      if (item.kind === "video") {
        const v = document.createElement("video");
        v.src = item.url;
        v.muted = true;
        v.setAttribute("playsinline", "");
        wrap.appendChild(v);
      } else {
        const img = document.createElement("img");
        img.src = item.url;
        img.alt = "Prévia de " + item.file.name;
        wrap.appendChild(img);
      }
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = item.kind === "video" ? "vídeo" : "foto";
      wrap.appendChild(tag);
      if (item.error) {
        const err = document.createElement("div");
        err.className = "err";
        err.textContent = item.error;
        wrap.appendChild(err);
      }
      function remove() {
        URL.revokeObjectURL(item.url);
        selected.splice(i, 1);
        renderPreviews();
      }
      wrap.addEventListener("click", remove);
      wrap.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          remove();
        }
      });
      previews.appendChild(wrap);
    });
    const valid = selected.filter(function (s) { return !s.error; });
    sendBtn.disabled = valid.length === 0;
    sendBtn.classList.toggle("solid", valid.length > 0);
  }

  filesInput.addEventListener("change", function () {
    toast.classList.remove("show");
    formError.textContent = "";
    const incoming = Array.from(filesInput.files || []);
    filesInput.value = "";
    incoming.forEach(function (file) {
      const kind = kindOf(file);
      let error = "";
      if (!kind) error = "Este tipo não é aceito.";
      else if (tooBig(file, kind)) {
        error =
          kind === "video"
            ? "Este vídeo passa de " + config.maxVideoMb + " MB."
            : "Esta foto passa de " + config.maxImageMb + " MB.";
      }
      if (selected.length >= config.maxFiles) {
        error = "No máximo " + config.maxFiles + " arquivos por vez.";
      }
      selected.push({
        file: file,
        kind: kind || "arquivo",
        url: URL.createObjectURL(file),
        error: error,
      });
    });
    renderPreviews();
  });

  sendBtn.addEventListener("click", async function () {
    const valid = selected.filter(function (s) { return !s.error; });
    if (!valid.length) return;
    formError.textContent = "";
    toast.classList.remove("show");
    sendBtn.disabled = true;
    progress.classList.add("show");
    bar.style.width = "8%";
    progress.setAttribute("aria-valuenow", "8");

    const data = new FormData();
    data.append("guestName", document.getElementById("guestName").value);
    data.append("caption", document.getElementById("caption").value);
    for (let i = 0; i < valid.length; i++) {
      const packed = await compressImage(valid[i]);
      data.append("files", packed, packed.name);
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = function (e) {
      if (!e.lengthComputable) return;
      const pct = Math.max(8, Math.round((e.loaded / e.total) * 100));
      bar.style.width = pct + "%";
      progress.setAttribute("aria-valuenow", String(pct));
    };
    xhr.onerror = function () {
      formError.textContent = "A conexão falhou. Tente de novo, com carinho.";
      sendBtn.disabled = false;
    };
    xhr.onload = function () {
      let body = {};
      try { body = JSON.parse(xhr.responseText || "{}"); } catch (e) {}
      if (xhr.status >= 200 && xhr.status < 300 && body.ok) {
        bar.style.width = "100%";
        const n = (body.saved && body.saved.length) || valid.length;
        toastMsg.textContent =
          n > 1
            ? "Suas fotos aparecerão na galeria depois da aprovação."
            : "Sua foto aparecerá na galeria depois da aprovação.";
        toast.classList.add("show");
        selected.forEach(function (s) { URL.revokeObjectURL(s.url); });
        selected = [];
        renderPreviews();
        document.getElementById("caption").value = "";
        setTimeout(function () {
          progress.classList.remove("show");
          bar.style.width = "0";
        }, 700);
      } else {
        formError.textContent = body.error || "Não foi possível enviar agora.";
        sendBtn.disabled = false;
        progress.classList.remove("show");
      }
    };
    xhr.send(data);
  });

  function liveList(item) {
    return item.album === "ensaio" ? ensaio : gallery;
  }

  function tileHtml(item) {
    const tile = document.createElement("article");
    tile.className = "tile";
    tile.dataset.id = item.id;
    tile.setAttribute("tabindex", "0");
    tile.setAttribute("role", "button");
    const label = item.caption || item.guestName || (item.kind === "video" ? "Vídeo" : "Foto");
    tile.setAttribute("aria-label", "Abrir " + label);
    if (item.kind === "video") {
      const v = document.createElement("video");
      v.src = item.url;
      v.muted = true;
      v.playsInline = true;
      v.preload = "metadata";
      v.setAttribute("aria-hidden", "true");
      tile.appendChild(v);
      const play = document.createElement("div");
      play.className = "play";
      play.textContent = "▶";
      tile.appendChild(play);
    } else {
      const img = document.createElement("img");
      img.src = item.thumb || item.url;
      img.alt = item.caption || "Foto do casamento de Elaine e Jeferson";
      img.loading = "lazy";
      tile.appendChild(img);
    }
    if (item.guestName || item.caption) {
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = [item.guestName, item.caption].filter(Boolean).join(" — ");
      tile.appendChild(meta);
    }
    function open() {
      viewing = liveList(item);
      openLightbox(viewing.findIndex(function (g) { return g.id === item.id; }));
    }
    tile.addEventListener("click", open);
    tile.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
    return tile;
  }

  function renderList(container, items) {
    container.innerHTML = "";
    items.forEach(function (item) {
      container.appendChild(tileHtml(item));
    });
  }

  function renderGallery(items, replace) {
    if (replace) mosaic.innerHTML = "";
    const have = new Set(Array.from(mosaic.children).map(function (n) { return n.dataset.id; }));
    items.forEach(function (item) {
      if (have.has(item.id)) return;
      mosaic.prepend(tileHtml(item));
    });
    empty.classList.toggle("hidden", gallery.length > 0);
    downloadBar.classList.toggle("hidden", gallery.length === 0);
  }

  async function loadGallery(initial) {
    const q = initial || !latest ? "" : "?since=" + encodeURIComponent(latest);
    const res = await fetch("/api/gallery" + q);
    if (!res.ok) return;
    const data = await res.json();
    ensaio = (data.ensaio || []).slice();
    if (ensaioBlock) ensaioBlock.classList.toggle("hidden", ensaio.length === 0);
    if (mosaicEnsaio) renderList(mosaicEnsaio, ensaio);
    if (data.hero && heroImg) {
      const src = data.hero.url || data.hero.thumb;
      if (heroWebp) heroWebp.srcset = src;
      heroImg.src = src;
      if (data.hero.caption && heroCaption) heroCaption.textContent = data.hero.caption;
    }
    const festa = data.items || [];
    if (initial) {
      gallery = festa;
      renderGallery(gallery, true);
    } else if (festa.length) {
      const map = {};
      gallery.forEach(function (g) { map[g.id] = g; });
      festa.forEach(function (it) { map[it.id] = it; });
      gallery = Object.keys(map).map(function (k) { return map[k]; })
        .sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
      renderGallery(festa, false);
    }
    if (data.latest) latest = data.latest;
  }

  function openLightbox(i) {
    if (i < 0 || i >= viewing.length) return;
    lbIndex = i;
    const item = viewing[i];
    lbStage.innerHTML = "";
    if (item.kind === "video") {
      const v = document.createElement("video");
      v.src = item.url;
      v.controls = true;
      v.autoplay = true;
      v.playsInline = true;
      lbStage.appendChild(v);
    } else {
      const img = document.createElement("img");
      img.src = item.url;
      img.alt = item.caption || "Foto ampliada";
      lbStage.appendChild(img);
    }
    lbBar.textContent = [item.guestName, item.caption].filter(Boolean).join(" — ");
    lbDownload.href = item.originalUrl || item.url;
    lbDownload.setAttribute("download", "");
    if (!lightbox.classList.contains("open")) {
      lastFocus = document.activeElement;
      lightbox.classList.add("open");
    }
    document.getElementById("lbClose").focus();
  }

  function closeLightbox() {
    lightbox.classList.remove("open");
    lbStage.innerHTML = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.getElementById("lbClose").addEventListener("click", closeLightbox);
  document.getElementById("lbPrev").addEventListener("click", function (e) {
    e.stopPropagation();
    openLightbox((lbIndex - 1 + viewing.length) % viewing.length);
  });
  document.getElementById("lbNext").addEventListener("click", function (e) {
    e.stopPropagation();
    openLightbox((lbIndex + 1) % viewing.length);
  });
  lightbox.addEventListener("click", function (e) {
    if (e.target === lightbox || e.target === lbStage) closeLightbox();
  });
  document.addEventListener("keydown", function (e) {
    if (!lightbox.classList.contains("open")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") openLightbox((lbIndex - 1 + viewing.length) % viewing.length);
    if (e.key === "ArrowRight") openLightbox((lbIndex + 1) % viewing.length);
  });

  let touchX = 0;
  let touchY = 0;
  lightbox.addEventListener("touchstart", function (e) {
    if (!e.changedTouches || !e.changedTouches[0]) return;
    touchX = e.changedTouches[0].clientX;
    touchY = e.changedTouches[0].clientY;
  }, { passive: true });
  lightbox.addEventListener("touchend", function (e) {
    if (!e.changedTouches || !e.changedTouches[0]) return;
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) openLightbox((lbIndex + 1) % viewing.length);
    else openLightbox((lbIndex - 1 + viewing.length) % viewing.length);
  }, { passive: true });

  downloadAllBtn.addEventListener("click", function () {
    if (!gallery.length) return;
    window.location.href = "/api/download-all";
  });

  fetch("/api/config")
    .then(function (r) { return r.json(); })
    .then(function (c) {
      config = c;
      limitsEl.textContent =
        "Fotos até " + c.maxImageMb + " MB (JPG, PNG, HEIC, WEBP). Vídeos até " +
        c.maxVideoMb + " MB (MP4, MOV). No máximo " + c.maxFiles + " arquivos por vez.";
    })
    .catch(function () {});

  loadGallery(true);
  setInterval(function () { loadGallery(false); }, 6000);
})();
