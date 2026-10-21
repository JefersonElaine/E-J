import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function Recover() {
  const [setupToken, setSetupToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOk("");
    try {
      await api.recover({ setupToken, email, password });
      setOk("Senha atualizada. Entre no painel com a nova senha.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 460, paddingTop: 80 }}>
      <p className="kicker">Acesso</p>
      <h2>Recuperar senha</h2>
      <p className="muted">Quem tiver o SETUP_TOKEN pode definir uma senha nova. Depois, o token continua valido — troque-o nas variaveis de ambiente se alguem o viu.</p>
      <form onSubmit={onSubmit}>
        <label>Token de recuperacao</label>
        <input value={setupToken} onChange={(e) => setSetupToken(e.target.value)} required />
        <label>E-mail do administrador</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label>Nova senha</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {ok && <div className="notice">{ok}</div>}
        {error && <p className="error">{error}</p>}
        <div className="actions" style={{ marginTop: 24 }}>
          <button className="btn" disabled={busy} type="submit">Atualizar senha</button>
          <Link className="btn ghost" to="/admin/entrar">Entrar</Link>
        </div>
      </form>
    </div>
  );
}
