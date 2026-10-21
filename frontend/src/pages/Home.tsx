import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import { api } from "../api";
import type { SiteInfo } from "../types";

export default function Home() {
  const [site, setSite] = useState<SiteInfo | null>(null);

  useEffect(() => {
    api.site().then(setSite).catch(() => setSite(null));
  }, []);

  return (
    <Layout>
      <div className="page">
        <section className="hero">
          <div>
            <p className="kicker">Casamento</p>
            <h1>Elaine &amp;<br />Jeferson</h1>
            <p className="date">{site?.dateLabel || "27 de novembro de 2026"}</p>
            <p className="tagline">{site?.tagline || "Um dia especial, milhares de lembrancas. Compartilhe a sua."}</p>
            <div className="actions">
              <Link className="btn" to="/enviar">Compartilhar minhas lembrancas</Link>
              <Link className="btn ghost" to="/galeria">Explorar a galeria</Link>
            </div>
          </div>
          <div className="hero-art">
            <div className="frame" aria-hidden="true" />
            <div className="stamp">
              27 Nov
              <br />
              2026
              <br />
              <span style={{ display: "block", marginTop: 10, letterSpacing: "0.28em" }}>E · J</span>
            </div>
          </div>
        </section>

        <section className="section">
          <h2>Como participar</h2>
          <p className="muted">Nao e preciso criar conta para ver ou baixar as fotos aprovadas.</p>
          <div className="steps">
            <div className="step">
              <span>01</span>
              <h3>Escolha as fotos</h3>
              <p className="muted">No celular, abra a galeria ou use a camera. Voce pode enviar varias de uma vez.</p>
            </div>
            <div className="step">
              <span>02</span>
              <h3>Envie com carinho</h3>
              <p className="muted">Opcionalmente, deixe seu nome e uma legenda. O envio fica em analise.</p>
            </div>
            <div className="step">
              <span>03</span>
              <h3>Veja na galeria</h3>
              <p className="muted">Depois da aprovacao, a lembranca entra no album para todos baixarem.</p>
            </div>
          </div>
        </section>

        <section className="qr-block">
          <img src="/api/qr" alt="QR Code da galeria" />
          <div>
            <p className="kicker">Recepcao</p>
            <h2>Acesso por link e QR Code</h2>
            <p className="muted">Imprima esta pagina para as mesas. Os convidados apontam a camera do celular e entram direto na galeria.</p>
            <div className="actions" style={{ marginTop: 18 }}>
              <Link className="btn ghost" to="/qr">Abrir versao para impressao</Link>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
