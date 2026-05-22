import Chatbot from './pages/chatbot'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

function App() {
  return (
    <BrowserRouter>
        <Routes>
          <Route path="/" element={<Chatbot />} />
          <Route path="/admin" element={<p>Admin page content</p>} />
        </Routes>
    </BrowserRouter>
  )
}

export default App