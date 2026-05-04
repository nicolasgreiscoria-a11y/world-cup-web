import Link from "next/link"

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900">404</h1>
        <p className="mt-2 text-gray-500">Page not found</p>
        <Link href="/" className="mt-4 inline-block text-blue-600 hover:underline">
          Go home
        </Link>
      </div>
    </div>
  )
}
