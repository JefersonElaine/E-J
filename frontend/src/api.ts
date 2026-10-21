async function parse(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Nao foi possivel concluir o pedido.");
  return data;
}

export const api = {
  site: () => fetch("/api/site").then(parse),
  gallery: (params: Record<string, string>) => {
    const q = new URLSearchParams(params);
    return fetch(`/api/gallery?${q}`).then(parse);
  },
  upload: (form: FormData, onProgress: (pct: number) => void) =>
    new Promise<any>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/uploads");
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100));
      };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText || "{}");
          if (xhr.status >= 200 && xhr.status < 300) resolve(data);
          else reject(new Error(data.error || "Falha no envio."));
        } catch {
          reject(new Error("Falha no envio."));
        }
      };
      xhr.onerror = () => reject(new Error("Conexao instavel. Tente novamente."));
      xhr.send(form);
    }),
  login: (email: string, password: string) =>
    fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    }).then(parse),
  logout: () => fetch("/api/auth/logout", { method: "POST", credentials: "include" }).then(parse),
  me: () => fetch("/api/auth/me", { credentials: "include" }).then(parse),
  setup: (body: object) =>
    fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    }).then(parse),
  recover: (body: object) =>
    fetch("/api/auth/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(parse),
  password: (body: object) =>
    fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    }).then(parse),
  stats: () => fetch("/api/admin/stats", { credentials: "include" }).then(parse),
  adminMedia: (params: Record<string, string>) => {
    const q = new URLSearchParams(params);
    return fetch(`/api/admin/media?${q}`, { credentials: "include" }).then(parse);
  },
  approve: (ids: string[]) =>
    fetch("/api/admin/media/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ids }),
    }).then(parse),
  reject: (ids: string[], reason: string) =>
    fetch("/api/admin/media/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ids, reason }),
    }).then(parse),
  remove: (ids: string[]) =>
    fetch("/api/admin/media/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ids }),
    }).then(parse),
};

export function fileUrl(id: string) {
  return `/api/media/${id}/file`;
}

export function downloadUrl(id: string) {
  return `/api/media/${id}/download`;
}

export function adminFileUrl(id: string, token: string) {
  return `/api/admin/media/${id}/file?t=${encodeURIComponent(token)}`;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}
