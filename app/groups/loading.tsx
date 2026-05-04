export default function Loading() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-48 mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(12)].map((_, i) => (
          <div key={i} className="h-40 bg-gray-100 rounded-lg" />
        ))}
      </div>
    </div>
  )
}
