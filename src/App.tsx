import Chatbot from './pages/chatbot';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import NotFound from './pages/notfound404';
import { ThemeProvider } from './components/ui/theme';

function App() {
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