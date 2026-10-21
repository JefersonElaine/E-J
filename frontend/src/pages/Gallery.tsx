import { FormEvent, useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api, downloadUrl, fileUrl, formatDate } from "../api";
import type { MediaItem } from "../types";

export default function Gallery() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [type, setType] = useState("");
  const [sort, setSort] = useState("newest");
  const [q, setQ] = useState("");
  const [day, setDay] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(reset = false) {
    setLoading(true);
    const params: Record<string, string> = { sort: sort === "oldest" ? "oldest" : "newest" };
    if (type) params.type = type;
    if (q) params.q = q;
    if (day) params.date = day;
    if (!reset && cursor) params.cursor = cursor;
    const data = await api.gallery(params);
    setItems((prev) => (reset ? data.items : [...prev, ...data.items]));
    setCursor(data.nextCursor);
    setLoading(false);
  }

  useEffect(() => {
    setCursor(null);
    load(true).catch(() => setLoading(false));
  }, [type, sort, day]);

  function search(e: FormEvent) {
    e.preventDefault();
    setCursor(null);
    load(true).catch(() => setLoading(false));
  }

  const current = open != null ? items[open] : null;

  return (
    <Layout>
      <div className="page">
        <p className="kicker">Album</p>
        <h2>Galeria</h2>
        <p className="muted">Somente lembrancas aprovadas aparecem aqui.</p>
        <form className="toolbar" onSubmit={search}>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Tudo</option>
            <option value="photo">Fotos</option>
            <option value="video">Videos</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Mais recentes</option>
            <option value="oldest">Mais antigas</option>
          </select>
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          <input type="search" placeholder="Buscar por nome" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn small" type="submit">Buscar</button>
        </form>

        {!loading && items.length === 0 && (
          <div className="empty">
            <h2>O album ainda espera a primeira lembranca</h2>
            <p className="muted">Quando os envios forem aprovados, as fotos e os videos aparecerao neste mosaico.</p>
          </div>
        )}

        <div className="mosaic">
          {items.map((item, i) => (
            <article className="tile" key={item.id} onClick={() => setOpen(i)}>
              {item.kind === "photo" ? (
                <img src={fileUrl(item.id)} alt={item.caption || "Foto do casamento"} loading="lazy" />
              ) : (
                <video src={fileUrl(item.id)} muted playsInline preload="metadata" />
              )}
              {(item.guestName || item.caption) && (
                <div className="meta">{item.guestName || item.caption}</div>
              )}
            </article>
          ))}
        </div>

        {cursor && (
          <div className="actions" style={{ marginTop: 28, justifyContent: "center" }}>
            <button className="btn ghost" onClick={() => load(false)} disabled={loading}>Carregar mais</button>
          </div>
        )}
      </div>

      {current && open != null && (
        <div className="lightbox" role="dialog">
          <header>
            <div>
              <strong>{current.guestName || "Convidado"}</strong>
              <div className="muted">{formatDate(current.createdAt)}</div>
            </div>
            <button className="btn ghost small" onClick={() => setOpen(null)}>Fechar</button>
          </header>
          <div className="stage">
            {current.kind === "photo" ? (
              <img src={fileUrl(current.id)} alt={current.caption || ""} />
            ) : (
              <video src={fileUrl(current.id)} controls playsInline />
            )}
          </div>
          <footer>
            <div>
              <div>{current.caption}</div>
              <button className="btn ghost small" disabled={open <= 0} onClick={() => setOpen(open - 1)}>Anterior</button>
              <button className="btn ghost small" disabled={open >= items.length - 1} onClick={() => setOpen(open + 1)}>Proxima</button>
            </div>
            <div className="actions">
              <a className="btn small" href={downloadUrl(current.id)}>Baixar</a>
              <button
                className="btn ghost small"
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/galeria`)}
              >
                Copiar link
              </button>
            </div>
          </footer>
        </div>
      )}
    </Layout>
  );
}
