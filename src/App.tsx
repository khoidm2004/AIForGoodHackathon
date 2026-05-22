import MainLayout from './layouts/main_layout'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

function App() {
  return (
    <BrowserRouter>
      <MainLayout>
        <Routes>
          <Route path="/" element={<p>Home page content</p>} />
          <Route path="/about" element={<p>About page content</p>} />
          <Route path="/contact" element={<p>Contact page content</p>} />
        </Routes>
      </MainLayout>
    </BrowserRouter>
  )
}

export default App