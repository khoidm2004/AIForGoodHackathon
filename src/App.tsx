import { useEffect } from "react";
import Chatbot from './pages/chatbot';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import NotFound from './pages/notfound404';
import { ThemeProvider } from './components/ui/theme';
import { warmup } from "./services/api";

function App() {
  useEffect(() => {
    warmup();  // now handles localStorage, ready check, and only runs once
  }, []);

  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Chatbot />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;