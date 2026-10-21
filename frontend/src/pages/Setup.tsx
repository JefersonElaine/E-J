import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";

export default function Setup() {
  const nav = useNavigate();
  const [setupToken, setSetupToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.setup({ setupToken, email, password });
      nav("/admin");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 460, paddingTop: 80 }}>
      <p className="kicker">Configuracao</p>
      <h2>Ativar conta administrativa</h2>
      <p className="muted">Use o SETUP_TOKEN definido nas variaveis de ambiente. A senha precisa ter 10 caracteres, com letras e numeros.</p>
      <form onSubmit={onSubmit}>
        <label>Token de ativacao</label>
        <input value={setupToken} onChange={(e) => setSetupToken(e.target.value)} required />
        <label>E-mail</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label>Senha</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="error">{error}</p>}
        <div className="actions" style={{ marginTop: 24 }}>
          <button className="btn" disabled={busy} type="submit">Criar conta</button>
          <Link className="btn ghost" to="/admin/entrar">Voltar</Link>
        </div>
      </form>
    </div>
  );
}
