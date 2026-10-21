import { FormEvent, useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api";
import type { SiteInfo } from "../types";

type Preview = { file: File; url: string };

export default function Upload() {
  const [site, setSite] = useState<SiteInfo | null>(null);
  const [files, setFiles] = useState<Preview[]>([]);
  const [guestName, setGuestName] = useState("");
  const [caption, setCaption] = useState("");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.site().then(setSite).catch(() => null);
    return () => files.forEach((f) => URL.revokeObjectURL(f.url));
  }, []);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const max = site?.limits.filesPerUpload || 10;
    const next = [...files];
    for (const file of Array.from(list)) {
      if (next.length >= max) break;
      next.push({ file, url: URL.createObjectURL(file) });
    }
    setFiles(next);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!files.length) return setError("Escolha ao menos um arquivo.");
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData();
    form.append("guestName", guestName);
    form.append("caption", caption);
    files.forEach((f) => form.append("files", f.file));
    try {
      const data = await api.upload(form, setProgress);
      setMessage(data.message + (data.rejected?.length ? ` ${data.rejected.length} arquivo(s) nao aceitos.` : ""));
      if (data.rejected?.length) {
        setError(data.rejected.map((r: any) => `${r.name}: ${r.error}`).join(" "));
      }
      if (data.accepted?.length) {
        files.forEach((f) => URL.revokeObjectURL(f.url));
        setFiles([]);
        setCaption("");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }

  return (
    <Layout>
      <div className="page" style={{ maxWidth: 720 }}>
        <p className="kicker">Envio</p>
        <h2>Compartilhar lembrancas</h2>
        <p className="muted">
          Fotos ate {site?.limits.photoMb || 12} MB. Videos ate {site?.limits.videoMb || 80} MB e {site?.limits.maxVideoSeconds || 90}s.
          Maximo de {site?.limits.filesPerUpload || 10} arquivos por envio. O conteudo so aparece depois da aprovacao.
        </p>
        <form onSubmit={submit}>
          <label>Seu nome ou apelido (opcional)</label>
          <input value={guestName} onChange={(e) => setGuestName(e.target.value)} maxLength={80} />
          <label>Legenda (opcional)</label>
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={280} rows={3} />
          <label>Arquivos</label>
          <div className="drop" onClick={() => inputRef.current?.click()}>
            Toque para escolher da galeria do celular
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime,video/webm"
              multiple
              hidden
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>
          <div className="actions" style={{ marginTop: 12 }}>
            <label className="btn ghost small" style={{ display: "inline-block" }}>
              Usar camera
              <input
                type="file"
                accept="image/*,video/*"
                capture="environment"
                hidden
                onChange={(e) => addFiles(e.target.files)}
              />
            </label>
          </div>
          <div className="previews">
            {files.map((f, i) => (
              <figure key={i}>
                {f.file.type.startsWith("video") ? <video src={f.url} muted /> : <img src={f.url} alt="" />}
              </figure>
            ))}
          </div>
          {busy && (
            <div className="progress"><span style={{ width: `${progress}%` }} /></div>
          )}
          {message && <div className="notice">{message}</div>}
          {error && <p className="error">{error}</p>}
          <div className="actions" style={{ marginTop: 24 }}>
            <button className="btn" disabled={busy} type="submit">{busy ? "Enviando..." : "Enviar"}</button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
