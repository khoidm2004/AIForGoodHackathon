import MainLayout from './layouts/main_layout'

function App() {
  return (
    <MainLayout>
      <div className="mx-auto max-w-4xl px-4 py-8 text-center">
        <h1 className="mb-4 text-3xl font-bold text-gray-900 dark:text-white">
          This is the main body content
        </h1>
        <p className="text-gray-600 dark:text-gray-300">
          Header và footer được quản lý bởi MainLayout.<br />
        </p>
      </div>
    </MainLayout>
  )
}

export default App