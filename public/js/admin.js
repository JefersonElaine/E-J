(function () {
  const loginView = document.getElementById("loginView");
  const appView = document.getElementById("appView");
  const loginError = document.getElementById("loginError");
  const grid = document.getElementById("adminGrid");
  const empty = document.getElementById("adminEmpty");
  let status = "pending";
  let items = [];

  async function api(url, opts) {
    const res = await fetch(url, Object.assign({ credentials: "same-origin" }, opts || {}));
    let body = {};
    try { body = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(body.error || "Erro");
    return body;
  }

  function showApp(admin) {
    loginView.classList.add("hidden");
    appView.classList.remove("hidden");
    document.getElementById("who").textContent = "Olá, " + admin.username;
    loadMedia();
    loadAdmins();
    loadAlbum();
  }

  function showLogin() {
    appView.classList.add("hidden");
    loginView.classList.remove("hidden");
  }

  document.getElementById("loginBtn").addEventListener("click", doLogin);
  document.getElementById("password").addEventListener("keydown", function (e) {
    if (e.key === "Enter") doLogin();
  });

  async function doLogin() {
    loginError.textContent = "";
    try {
      const data = await api("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: document.getElementById("username").value,
          password: document.getElementById("password").value,
        }),
      });
      showApp(data.admin);
    } catch (e) {
      loginError.textContent = e.message;
    }
  }

  document.getElementById("logoutBtn").addEventListener("click", async function () {
    await fetch("/api/admin/logout", { method: "POST" });
    showLogin();
  });

  document.getElementById("tabs").addEventListener("click", function (e) {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    status = btn.dataset.status;
    Array.from(document.querySelectorAll(".tab")).forEach(function (t) {
      t.classList.toggle("on", t === btn);
    });
    loadMedia();
  });

  async function loadMedia() {
    const data = await api("/api/admin/media?status=" + encodeURIComponent(status));
    items = data.items || [];
    document.getElementById("cPending").textContent = data.counts.pending || 0;
    document.getElementById("cApproved").textContent = data.counts.approved || 0;
    document.getElementById("cRejected").textContent = data.counts.rejected || 0;
    document.getElementById("cAll").textContent = data.counts.all || 0;
    render();
  }

  function render() {
    grid.innerHTML = "";
    empty.classList.toggle("hidden", items.length > 0);
    items.forEach(function (item) {
      const el = document.createElement("article");
      el.className = "admin-item";
      const media = item.kind === "video"
        ? '<video src="' + item.url + '" muted></video>'
        : '<img src="' + (item.thumb || item.url) + '" alt="" />';
      el.innerHTML =
        media +
        '<div>' +
        '<label style="margin:0 0 6px;display:flex;align-items:center;gap:8px;letter-spacing:0.08em;">' +
        '<input type="checkbox" data-id="' + item.id + '" /> selecionar</label>' +
        '<span class="status ' + item.status + '">' + labelStatus(item.status) + "</span>" +
        "<h3>" + escapeHtml(item.guestName || "Convidado") + "</h3>" +
        "<p>" + escapeHtml(item.caption || "Sem legenda") + "</p>" +
        '<div class="row-actions">' +
        '<button class="btn small" data-act="approve" data-id="' + item.id + '" type="button">Aprovar</button>' +
        '<button class="btn small ghost" data-act="reject" data-id="' + item.id + '" type="button">Rejeitar</button>' +
        '<button class="btn small danger" data-act="delete" data-id="' + item.id + '" type="button">Excluir</button>' +
        "</div></div>";
      grid.appendChild(el);
    });
  }

  function labelStatus(s) {
    if (s === "pending") return "pendente";
    if (s === "approved") return "aprovada";
    if (s === "rejected") return "rejeitada";
    return s;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  grid.addEventListener("click", async function (e) {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    if (btn.dataset.act === "delete" && !confirm("Excluir este item? Não pode ser desfeito.")) return;
    await act([btn.dataset.id], btn.dataset.act);
  });

  function selectedIds() {
    return Array.from(grid.querySelectorAll("input[type=checkbox][data-id]:checked"))
      .map(function (c) { return c.dataset.id; });
  }

  document.getElementById("selectAll").addEventListener("change", function () {
    const on = this.checked;
    grid.querySelectorAll("input[type=checkbox][data-id]").forEach(function (c) { c.checked = on; });
  });

  document.getElementById("batchApprove").addEventListener("click", function () { act(selectedIds(), "approve"); });
  document.getElementById("batchReject").addEventListener("click", function () { act(selectedIds(), "reject"); });
  document.getElementById("batchDelete").addEventListener("click", function () {
    if (!selectedIds().length) return;
    if (!confirm("Excluir os itens selecionados? Esta ação não pode ser desfeita.")) return;
    act(selectedIds(), "delete");
  });

  async function act(ids, action) {
    if (!ids.length) return;
    await api("/api/admin/media/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ids, action: action }),
    });
    await loadMedia();
  }

  async function loadAdmins() {
    const data = await api("/api/admin/admins");
    const ul = document.getElementById("adminList");
    ul.innerHTML = "";
    (data.admins || []).forEach(function (a) {
      const li = document.createElement("li");
      li.textContent = a.username + (a.role === "owner" ? " (principal)" : "");
      ul.appendChild(li);
    });
  }

  document.getElementById("addAdminBtn").addEventListener("click", async function () {
    const msg = document.getElementById("addAdminMsg");
    msg.textContent = "";
    try {
      await api("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: document.getElementById("newUser").value,
          password: document.getElementById("newPass").value,
        }),
      });
      document.getElementById("newUser").value = "";
      document.getElementById("newPass").value = "";
      msg.textContent = "Administrador criado.";
      msg.style.color = "#2f5d3a";
      loadAdmins();
    } catch (e) {
      msg.style.color = "";
      msg.textContent = e.message;
    }
  });

  document.getElementById("changePassBtn").addEventListener("click", async function () {
    const msg = document.getElementById("passMsg");
    msg.textContent = "";
    try {
      await api("/api/admin/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: document.getElementById("curPass").value,
          newPassword: document.getElementById("nextPass").value,
        }),
      });
      document.getElementById("curPass").value = "";
      document.getElementById("nextPass").value = "";
      msg.textContent = "Senha atualizada.";
      msg.style.color = "#2f5d3a";
    } catch (e) {
      msg.style.color = "";
      msg.textContent = e.message;
    }
  });

  let albumItems = [];
  let albumHeroId = null;
  let albumSelected = [];
  const albumFiles = document.getElementById("albumFiles");
  const albumPreviews = document.getElementById("albumPreviews");
  const albumSend = document.getElementById("albumSend");
  const albumProgress = document.getElementById("albumProgress");
  const albumBar = albumProgress.querySelector("span");
  const albumError = document.getElementById("albumError");
  const albumGrid = document.getElementById("albumGrid");
  const albumEmpty = document.getElementById("albumEmpty");

  function renderAlbumPreviews() {
    albumPreviews.innerHTML = "";
    albumSelected.forEach(function (item, i) {
      const wrap = document.createElement("div");
      wrap.className = "item";
      const img = document.createElement("img");
      img.src = item.url;
      img.alt = item.file.name;
      wrap.appendChild(img);
      wrap.title = "Toque para remover";
      wrap.addEventListener("click", function () {
        URL.revokeObjectURL(item.url);
        albumSelected.splice(i, 1);
        renderAlbumPreviews();
      });
      albumPreviews.appendChild(wrap);
    });
    albumSend.disabled = albumSelected.length === 0;
  }

  albumFiles.addEventListener("change", function () {
    albumError.textContent = "";
    Array.from(albumFiles.files || []).forEach(function (file) {
      albumSelected.push({ file: file, url: URL.createObjectURL(file) });
    });
    albumFiles.value = "";
    renderAlbumPreviews();
  });

  albumSend.addEventListener("click", function () {
    if (!albumSelected.length) return;
    albumError.textContent = "";
    albumSend.disabled = true;
    albumProgress.classList.add("show");
    albumBar.style.width = "8%";
    const data = new FormData();
    const caption = document.getElementById("albumCaption").value;
    const captions = albumSelected.map(function () { return caption; });
    albumSelected.forEach(function (s) { data.append("files", s.file, s.file.name); });
    data.append("captions", JSON.stringify(captions));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/ensaio/upload");
    xhr.withCredentials = true;
    xhr.upload.onprogress = function (e) {
      if (!e.lengthComputable) return;
      albumBar.style.width = Math.max(8, Math.round((e.loaded / e.total) * 100)) + "%";
    };
    xhr.onerror = function () {
      albumError.textContent = "A conexão falhou. Tente de novo.";
      albumSend.disabled = false;
    };
    xhr.onload = function () {
      let body = {};
      try { body = JSON.parse(xhr.responseText || "{}"); } catch (e) {}
      if (xhr.status >= 200 && xhr.status < 300 && body.ok) {
        albumSelected.forEach(function (s) { URL.revokeObjectURL(s.url); });
        albumSelected = [];
        renderAlbumPreviews();
        document.getElementById("albumCaption").value = "";
        albumItems = body.items || [];
        renderAlbum();
        setTimeout(function () {
          albumProgress.classList.remove("show");
          albumBar.style.width = "0";
        }, 500);
      } else {
        albumError.textContent = body.error || "Não foi possível publicar.";
        albumSend.disabled = false;
        albumProgress.classList.remove("show");
      }
    };
    xhr.send(data);
  });

  async function loadAlbum() {
    const data = await api("/api/admin/ensaio");
    albumItems = data.items || [];
    albumHeroId = data.heroId;
    renderAlbum();
  }

  function renderAlbum() {
    albumGrid.innerHTML = "";
    albumEmpty.classList.toggle("hidden", albumItems.length > 0);
    albumItems.forEach(function (item, index) {
      const card = document.createElement("article");
      card.className = "album-card" + (item.id === albumHeroId ? " is-hero" : "");
      card.draggable = true;
      card.dataset.id = item.id;
      card.dataset.index = String(index);
      card.innerHTML =
        (item.id === albumHeroId ? '<span class="hero-mark">principal</span>' : "") +
        '<img src="' + (item.thumb || item.url) + '" alt="" />' +
        '<textarea data-cap="' + item.id + '" maxlength="180" placeholder="Legenda (opcional)">' +
        escapeHtml(item.caption || "") + "</textarea>" +
        '<div class="row-actions">' +
        '<button class="btn small" data-hero="' + item.id + '" type="button">Foto principal</button>' +
        '<button class="btn small danger" data-del="' + item.id + '" type="button">Excluir</button>' +
        "</div>";
      albumGrid.appendChild(card);
    });
  }

  albumGrid.addEventListener("click", async function (e) {
    const heroBtn = e.target.closest("button[data-hero]");
    const delBtn = e.target.closest("button[data-del]");
    if (heroBtn) {
      await api("/api/admin/ensaio/hero", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: heroBtn.dataset.hero }),
      });
      albumHeroId = heroBtn.dataset.hero;
      renderAlbum();
    }
    if (delBtn) {
      if (!confirm("Excluir esta foto do ensaio? Não pode ser desfeito.")) return;
      const data = await api("/api/admin/ensaio/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: delBtn.dataset.del }),
      });
      albumItems = data.items || [];
      albumHeroId = data.heroId;
      renderAlbum();
    }
  });

  albumGrid.addEventListener("change", async function (e) {
    const area = e.target.closest("textarea[data-cap]");
    if (!area) return;
    await api("/api/admin/ensaio/caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: area.dataset.cap, caption: area.value }),
    });
  });

  let dragId = null;
  albumGrid.addEventListener("dragstart", function (e) {
    const card = e.target.closest(".album-card");
    if (!card) return;
    dragId = card.dataset.id;
    card.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragId);
  });
  albumGrid.addEventListener("dragend", function (e) {
    const card = e.target.closest(".album-card");
    if (card) card.classList.remove("dragging");
  });
  albumGrid.addEventListener("dragover", function (e) {
    e.preventDefault();
    const over = e.target.closest(".album-card");
    if (!over || over.dataset.id === dragId) return;
    const ids = albumItems.map(function (i) { return i.id; });
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(over.dataset.id);
    if (from < 0 || to < 0 || from === to) return;
    const moved = albumItems.splice(from, 1)[0];
    albumItems.splice(to, 0, moved);
    renderAlbum();
  });
  albumGrid.addEventListener("drop", async function (e) {
    e.preventDefault();
    await saveAlbumOrder();
  });

  let touchCard = null;
  albumGrid.addEventListener("touchstart", function (e) {
    const card = e.target.closest(".album-card");
    if (!card || e.target.closest("textarea") || e.target.closest("button")) return;
    touchCard = card;
    dragId = card.dataset.id;
    card.classList.add("dragging");
  }, { passive: true });
  albumGrid.addEventListener("touchmove", function (e) {
    if (!touchCard) return;
    const t = e.touches[0];
    const over = document.elementFromPoint(t.clientX, t.clientY);
    const card = over && over.closest ? over.closest(".album-card") : null;
    if (!card || card.dataset.id === dragId) return;
    const ids = albumItems.map(function (i) { return i.id; });
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(card.dataset.id);
    if (from < 0 || to < 0 || from === to) return;
    const moved = albumItems.splice(from, 1)[0];
    albumItems.splice(to, 0, moved);
    renderAlbum();
  }, { passive: true });
  albumGrid.addEventListener("touchend", async function () {
    if (!touchCard) return;
    touchCard.classList.remove("dragging");
    touchCard = null;
    await saveAlbumOrder();
  });

  async function saveAlbumOrder() {
    await api("/api/admin/ensaio/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: albumItems.map(function (i) { return i.id; }) }),
    });
  }

  fetch("/api/admin/me", { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
    .then(function (d) { showApp(d.admin); })
    .catch(function () { showLogin(); });
})();
