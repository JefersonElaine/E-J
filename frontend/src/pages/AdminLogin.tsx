import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";

export default function AdminLogin() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.login(email, password);
      nav("/admin");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 420, paddingTop: 80 }}>
      <p className="kicker">Privado</p>
      <h2>Painel</h2>
      <form onSubmit={onSubmit}>
        <label>E-mail</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label>Senha</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="error">{error}</p>}
        <div className="actions" style={{ marginTop: 24 }}>
          <button className="btn" disabled={busy} type="submit">Entrar</button>
        </div>
      </form>
      <p className="muted" style={{ marginTop: 24 }}>
        <Link to="/admin/ativar">Ativar primeira conta</Link>
        {" · "}
        <Link to="/admin/recuperar">Recuperar senha</Link>
      </p>
    </div>
  );
}
