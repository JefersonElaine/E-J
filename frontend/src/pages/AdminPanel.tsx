import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { adminFileUrl, api, formatBytes, formatDate } from "../api";
import type { MediaItem, Stats } from "../types";

export default function AdminPanel() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [status, setStatus] = useState("pending");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [preview, setPreview] = useState<MediaItem | null>(null);

  async function boot() {
    try {
      const me = await api.me();
      setEmail(me.email);
      await refresh();
    } catch {
      nav("/admin/entrar");
    }
  }

  async function refresh() {
    const [s, m] = await Promise.all([
      api.stats(),
      api.adminMedia({ status, type, q }),
    ]);
    setStats(s);
    setItems(m.items);
    setSelected([]);
  }

  useEffect(() => {
    boot();
  }, []);

  useEffect(() => {
    if (email) refresh().catch((err) => setError(err.message));
  }, [status, type]);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function act(kind: "approve" | "reject" | "delete") {
    const ids = selected.length ? selected : [];
    if (!ids.length) return setError("Selecione ao menos um arquivo.");
    if (kind === "delete" && !window.confirm("Excluir definitivamente os arquivos selecionados?")) return;
    setError("");
    try {
      if (kind === "approve") await api.approve(ids);
      if (kind === "reject") await api.reject(ids, reason);
      if (kind === "delete") await api.remove(ids);
      await refresh();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    try {
      await api.password({ currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setError("");
      alert("Senha atualizada.");
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <nav className="nav" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <Link className="brand" to="/">E &amp; J</Link>
        <div className="nav-links">
          <span>{email}</span>
          <button
            className="btn ghost small"
            onClick={async () => {
              await api.logout();
              nav("/admin/entrar");
            }}
          >
            Sair
          </button>
        </div>
      </nav>

      <p className="kicker">Moderacao</p>
      <h2>Painel</h2>
      {stats && (
        <div className="admin-grid" style={{ margin: "24px 0 36px" }}>
          <div className="stat"><span>Recebidos</span><b>{stats.total}</b></div>
          <div className="stat"><span>Pendentes</span><b>{stats.pending}</b></div>
          <div className="stat"><span>Aprovados</span><b>{stats.approved}</b></div>
          <div className="stat"><span>Armazenamento</span><b>{formatBytes(stats.bytes)}</b></div>
        </div>
      )}

      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos</option>
          <option value="pending">Pendentes</option>
          <option value="approved">Aprovados</option>
          <option value="rejected">Rejeitados</option>
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Fotos e videos</option>
          <option value="photo">Fotos</option>
          <option value="video">Videos</option>
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, legenda ou arquivo" />
        <button className="btn small" onClick={() => refresh()}>Filtrar</button>
      </div>

      <div className="actions" style={{ marginBottom: 16 }}>
        <button className="btn small" onClick={() => act("approve")}>Aprovar</button>
        <button className="btn ghost small" onClick={() => act("reject")}>Rejeitar</button>
        <button className="btn ghost small" onClick={() => act("delete")}>Excluir</button>
      </div>
      <input
        placeholder="Motivo interno da rejeicao"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        style={{ marginBottom: 18 }}
      />
      {error && <p className="error">{error}</p>}

      <div className="admin-list">
        {items.map((item) => (
          <article className="admin-card" key={item.id}>
            <div onClick={() => setPreview(item)} style={{ cursor: "pointer" }}>
              {item.kind === "photo" ? (
                <img src={adminFileUrl(item.id, item.previewToken || "")} alt="" />
              ) : (
                <video src={adminFileUrl(item.id, item.previewToken || "")} muted />
              )}
            </div>
            <div>
              <strong>{item.guestName || "Sem nome"}</strong>
              <div className="muted">{item.caption || item.originalName}</div>
              <div className="muted">{item.status} · {formatDate(item.createdAt)} · {formatBytes(item.sizeBytes)}</div>
              {item.rejectReason && <div className="muted">Motivo: {item.rejectReason}</div>}
            </div>
            <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />
          </article>
        ))}
        {!items.length && <div className="empty"><p>Nenhum arquivo neste filtro.</p></div>}
      </div>

      {stats?.recent?.length ? (
        <section className="section">
          <h3>Atividade recente</h3>
          {stats.recent.map((r) => (
            <p className="muted" key={r.id}>{formatDate(r.createdAt)} · {r.action} · {r.detail}</p>
          ))}
        </section>
      ) : null}

      <section className="section" style={{ maxWidth: 420 }}>
        <h3>Trocar senha</h3>
        <form onSubmit={changePassword}>
          <label>Senha atual</label>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          <label>Nova senha</label>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
          <div className="actions" style={{ marginTop: 16 }}>
            <button className="btn small" type="submit">Salvar senha</button>
          </div>
        </form>
      </section>

      {preview && (
        <div className="lightbox" onClick={() => setPreview(null)}>
          <header>
            <strong>{preview.guestName || preview.originalName}</strong>
            <button className="btn ghost small">Fechar</button>
          </header>
          <div className="stage">
            {preview.kind === "photo" ? (
              <img src={adminFileUrl(preview.id, preview.previewToken || "")} alt="" />
            ) : (
              <video src={adminFileUrl(preview.id, preview.previewToken || "")} controls />
            )}
          </div>
          <footer>
            <span>{preview.caption}</span>
            <span />
          </footer>
        </div>
      )}
    </div>
  );
}
