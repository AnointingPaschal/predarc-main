export default function BtcLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Bitcoin" style={{ flexShrink: 0 }}>
      <circle cx="32" cy="32" r="32" fill="#F7931A" />
      <text x="32" y="45" textAnchor="middle" fontSize="40" fontWeight="700" fontFamily="Arial, Helvetica, sans-serif" fill="#fff">₿</text>
    </svg>
  )
}
