import { Link } from "react-router-dom";

export default function PrintQr() {
  return (
    <div className="page" style={{ textAlign: "center", paddingTop: 48 }}>
      <p className="kicker">Casamento</p>
      <h1 style={{ fontSize: 56, margin: "12px 0" }}>Elaine &amp; Jeferson</h1>
      <p className="date">27 de novembro de 2026</p>
      <img src="/api/qr" alt="QR Code" style={{ width: 280, height: 280, margin: "36px auto", background: "#fff" }} />
      <p className="tagline" style={{ margin: "0 auto 24px" }}>Aponte a camera e compartilhe sua lembranca.</p>
      <div className="actions" style={{ justifyContent: "center" }}>
        <button className="btn" onClick={() => window.print()}>Imprimir</button>
        <Link className="btn ghost" to="/">Voltar</Link>
      </div>
    </div>
  );
}
