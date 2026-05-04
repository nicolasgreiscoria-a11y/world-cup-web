export default function Loading() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-48 mb-6" />
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-14 bg-gray-100 rounded-lg" />
        ))}
      </div>
    </div>
  )
}
