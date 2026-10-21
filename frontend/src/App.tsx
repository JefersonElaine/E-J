import { Navigate, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Gallery from "./pages/Gallery";
import Upload from "./pages/Upload";
import AdminLogin from "./pages/AdminLogin";
import AdminPanel from "./pages/AdminPanel";
import Setup from "./pages/Setup";
import Recover from "./pages/Recover";
import PrintQr from "./pages/PrintQr";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/galeria" element={<Gallery />} />
      <Route path="/enviar" element={<Upload />} />
      <Route path="/qr" element={<PrintQr />} />
      <Route path="/admin" element={<AdminPanel />} />
      <Route path="/admin/entrar" element={<AdminLogin />} />
      <Route path="/admin/ativar" element={<Setup />} />
      <Route path="/admin/recuperar" element={<Recover />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
