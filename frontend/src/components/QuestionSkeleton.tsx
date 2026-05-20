const SkeletonBlock = ({ width, height }: { width?: string; height?: number }) => (
  <div
    aria-hidden="true"
    style={{
      width: width ?? '100%',
      height: height ?? 16,
      background:
        'linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%)',
      backgroundSize: '200% 100%',
      borderRadius: 4,
      marginBottom: 8,
      animation: 'shimmer 1.5s infinite',
    }}
  />
)

const CATEGORIES = ['Technical', 'Behavioural', 'Culture Fit']

export function QuestionSkeleton() {
  return (
    <>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <div
        role="status"
        aria-label="Generating questions…"
        style={{ marginTop: '2rem' }}
      >
        {/* Heading skeleton */}
        <SkeletonBlock width="40%" height={28} />

        {CATEGORIES.map((cat) => (
          <div key={cat} style={{ marginBottom: '1.5rem' }}>
            {/* Section header skeleton */}
            <SkeletonBlock height={42} />

            {/* Card skeletons */}
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '1rem',
                  marginBottom: '0.75rem',
                  background: '#fff',
                }}
              >
                <SkeletonBlock width="90%" height={20} />
                <SkeletonBlock width="70%" height={14} />
                <SkeletonBlock height={38} />
                <SkeletonBlock height={38} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}
