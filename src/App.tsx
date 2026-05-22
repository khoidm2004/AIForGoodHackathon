import MainLayout from './layouts/main_layout'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

function App() {
  return (
    <BrowserRouter>
      <MainLayout>
        <Routes>
          <Route path="/" element={<p>Chatbot</p>} />
          <Route path="/admin" element={<p>Admin page content</p>} />
        </Routes>
      </MainLayout>
    </BrowserRouter>
  )
}

export default App