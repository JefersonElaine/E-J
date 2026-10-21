import { Link, useLocation } from "react-router-dom";
import { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <>
      <nav className="nav">
        <Link className="brand" to="/">E &amp; J</Link>
        <div className="nav-links">
          <Link className={pathname === "/" ? "active" : ""} to="/">Inicio</Link>
          <Link className={pathname.startsWith("/enviar") ? "active" : ""} to="/enviar">Enviar</Link>
          <Link className={pathname.startsWith("/galeria") ? "active" : ""} to="/galeria">Galeria</Link>
        </div>
      </nav>
      {children}
      <footer className="footer">Elaine e Jeferson · 27.11.2026</footer>
    </>
  );
}
